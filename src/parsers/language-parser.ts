import type { FileIndex } from '../types.js'

export interface LanguageParser {
  readonly extensions: string[]
  parseFile(path: string, content: string): FileIndex
}
