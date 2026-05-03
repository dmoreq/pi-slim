/**
 * Language ID mappings for LSP (adapted from pi-lens).
 *
 * Maps file extensions to LSP language identifiers.
 */

import { extname, basename } from 'node:path'

export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  // TypeScript/JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Python
  '.py': 'python',
  '.pyi': 'python',

  // Go
  '.go': 'go',
  '.mod': 'go',

  // Rust
  '.rs': 'rust',

  // JSON/YAML/TOML
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',

  // Markdown
  '.md': 'markdown',
  '.mdx': 'markdown',

  // CSS/HTML
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.htm': 'html',

  // Shell
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',

  // Docker
  'Dockerfile': 'dockerfile',
  '.dockerfile': 'dockerfile',

  // C/C++
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',

  // Ruby
  '.rb': 'ruby',

  // PHP
  '.php': 'php',

  // C#
  '.cs': 'csharp',

  // Swift
  '.swift': 'swift',

  // Kotlin
  '.kt': 'kotlin',
  '.kts': 'kotlin',

  // Java
  '.java': 'java',

  // Lua
  '.lua': 'lua',
}

/** Get language ID for a file path. */
export function getLanguageId(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase()
  if (ext && LANGUAGE_EXTENSIONS[ext]) {
    return LANGUAGE_EXTENSIONS[ext]
  }

  const base = basename(filePath)
  return LANGUAGE_EXTENSIONS[base] ?? LANGUAGE_EXTENSIONS[base.toLowerCase()]
}
