import { createHash } from 'node:crypto'
import Parser from 'tree-sitter'
// @ts-ignore
import TypeScript from 'tree-sitter-typescript'
import type { SyntaxNode } from 'tree-sitter'
import type { LanguageParser } from './language-parser.js'
import type { FileIndex } from '../types.js'

const BODY_TYPES = new Set([
  'statement_block',
  'class_body',
  'enum_body',
  'object_type',
  'interface_body',
])

const DECLARATION_TYPES = new Set([
  'function_declaration',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'abstract_class_declaration',
  'function_signature',
  'method_signature',
])

function nodeSignature(node: SyntaxNode, source: string): string | null {
  if (!DECLARATION_TYPES.has(node.type)) return null
  const body = node.children.find(c => BODY_TYPES.has(c.type))
  if (body) {
    return source.slice(node.startIndex, body.startIndex).trimEnd() + ' { ... }'
  }
  return source.slice(node.startIndex, node.endIndex)
}

function walk(
  node: SyntaxNode,
  source: string,
  signatures: string[],
  imports: string[],
): void {
  if (node.type === 'import_statement') {
    const src = node.childForFieldName('source')
    if (src) imports.push(src.text.slice(1, -1))
    return
  }

  if (node.type === 'export_statement') {
    const decl = node.children.find(c => DECLARATION_TYPES.has(c.type))
    if (decl) {
      const sig = nodeSignature(decl, source)
      if (sig) { signatures.push('export ' + sig); return }
    }
    // Note: `export { foo } from './bar'` and `export * from './bar'` are not
    // captured in imports — the from-string is inside export_clause, not an
    // import_statement. These re-export edges are missing from the dep graph.
    for (const child of node.children) walk(child, source, signatures, imports)
    return
  }

  const sig = nodeSignature(node, source)
  if (sig) { signatures.push(sig); return }

  for (const child of node.children) walk(child, source, signatures, imports)
}

export class TypeScriptParser implements LanguageParser {
  readonly extensions = ['.ts', '.tsx']
  private readonly tsParser = new Parser()
  private readonly tsxParser = new Parser()

  constructor() {
    this.tsParser.setLanguage(TypeScript.typescript)
    this.tsxParser.setLanguage(TypeScript.tsx)
  }

  parseFile(path: string, content: string): FileIndex {
    const parser = path.endsWith('.tsx') ? this.tsxParser : this.tsParser
    const tree = parser.parse(content)
    const signatures: string[] = []
    const imports: string[] = []

    walk(tree.rootNode, content, signatures, imports)

    return {
      path,
      skeleton: signatures.join('\n'),
      imports,
      contentHash: createHash('sha256').update(content).digest('hex'),
    }
  }
}
