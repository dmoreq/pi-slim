import { createHash } from 'node:crypto'
import Parser from 'tree-sitter'
// @ts-ignore — tree-sitter-python has no bundled .d.ts
import Python from 'tree-sitter-python'
import type { SyntaxNode } from 'tree-sitter'
import type { LanguageParser } from './language-parser.js'
import type { FileIndex } from '../shared/types.js'

const parser = new Parser()
// @ts-ignore
parser.setLanguage(Python)

function extractFunctionSig(node: SyntaxNode, source: string): string {
  const body = node.childForFieldName('body')
  if (body) {
    return source.slice(node.startIndex, body.startIndex).trimEnd() + ' ...'
  }
  return source.slice(node.startIndex, node.endIndex)
}

function walk(
  node: SyntaxNode,
  source: string,
  lines: string[],
  imports: string[],
  exports: string[],
  indent = '',
): void {
  if (node.type === 'import_from_statement') {
    // Relative imports are represented as `relative_import` child nodes
    for (const child of node.children) {
      if (child.type === 'relative_import') {
        imports.push(child.text)
      }
    }
    return
  }

  if (node.type === 'function_definition') {
    lines.push(indent + extractFunctionSig(node, source))
    const name = node.childForFieldName('name')
    if (name) exports.push(name.text)
    return
  }

  if (node.type === 'class_definition') {
    const name = node.childForFieldName('name')
    if (name) exports.push(name.text)
    lines.push(indent + `class ${name?.text ?? '?'}:`)
    const body = node.childForFieldName('body')
    if (body) {
      for (const child of body.children) {
        walk(child, source, lines, imports, exports, indent + '    ')
      }
    }
    return
  }

  for (const child of node.children) {
    walk(child, source, lines, imports, exports, indent)
  }
}

export class PythonParser implements LanguageParser {
  readonly extensions = ['.py']

  parseFile(path: string, content: string): FileIndex {
    // @ts-ignore
    const tree = parser.parse(content)
    const lines: string[] = []
    const imports: string[] = []

    const exports: string[] = []; walk(tree.rootNode, content, lines, imports, exports)

    return {
      path,
      skeleton: lines.join('\n'),
      imports,
      exports,
      contentHash: createHash('sha256').update(content).digest('hex'),
    }
  }
}
