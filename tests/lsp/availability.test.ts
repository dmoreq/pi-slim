import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLspSession } from '../../lsp/availability.js'
import * as health from '../../lsp/health.js'

const mockHealth = [
  {
    id: 'typescript',
    command: 'typescript-language-server',
    label: 'TypeScript / JavaScript',
    installCommand: 'npm install -g typescript typescript-language-server',
    available: false,
  },
  {
    id: 'python',
    command: 'pyright-langserver',
    label: 'Python',
    installCommand: 'pip install pyright',
    available: false,
  },
]

describe('resolveLspSession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns inactive with empty health when config disables LSP', () => {
    const result = resolveLspSession(false)
    expect(result.active).toBe(false)
    expect(result.health).toEqual([])
    expect(result.installSuggestion).toBeUndefined()
  })

  it('auto-disables with install suggestion when no servers on PATH', () => {
    vi.spyOn(health, 'probeLspServers').mockReturnValue(mockHealth)

    const result = resolveLspSession(true)
    expect(result.active).toBe(false)
    expect(result.installSuggestion).toMatch(/Install one or more/)
    expect(result.installSuggestion).toContain('npm install -g typescript typescript-language-server')
    expect(result.installSuggestion).toContain('pip install pyright')
  })

  it('stays active when at least one server is available', () => {
    vi.spyOn(health, 'probeLspServers').mockReturnValue([
      { ...mockHealth[0]!, available: true },
      mockHealth[1]!,
    ])

    const result = resolveLspSession(true)
    expect(result.active).toBe(true)
    expect(result.installSuggestion).toBeUndefined()
  })
})
