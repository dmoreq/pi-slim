import { describe, expect, it } from 'vitest'
import {
  formatLspInstallGuide,
  formatLspSessionDisabledNotice,
  formatMissingLspServerMessage,
  probeLspServers,
} from '../../lsp/health.js'

describe('LSP install suggestions', () => {
  it('probeLspServers includes install commands for every catalog entry', () => {
    const health = probeLspServers()
    expect(health.length).toBe(4)
    for (const entry of health) {
      expect(entry.installCommand.length).toBeGreaterThan(0)
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })

  it('formatLspInstallGuide lists only missing servers when requested', () => {
    const health = probeLspServers().map(h => ({ ...h, available: h.id === 'typescript' }))
    const guide = formatLspInstallGuide(health, { missingOnly: true })
    expect(guide).toContain('pip install pyright')
    expect(guide).not.toContain('npm install -g typescript')
  })

  it('formatLspSessionDisabledNotice includes install commands', () => {
    const health = probeLspServers().map(h => ({ ...h, available: false }))
    const notice = formatLspSessionDisabledNotice(health)
    expect(notice).toMatch(/restart pi/i)
    expect(notice).toContain('go install')
  })

  it('formatMissingLspServerMessage suggests the typescript install line', () => {
    const msg = formatMissingLspServerMessage('typescript')
    expect(msg).toContain('typescript-language-server')
    expect(msg).toContain('npm install -g typescript typescript-language-server')
  })
})
