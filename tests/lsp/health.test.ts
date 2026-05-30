import { describe, expect, it } from 'vitest'
import { probeLspServers } from '../../lsp/health.js'

describe('probeLspServers', () => {
  it('returns health entries for all configured servers', () => {
    const health = probeLspServers()
    expect(health.length).toBe(4)
    expect(health.map(h => h.id).sort()).toEqual(['go', 'python', 'rust', 'typescript'])
    for (const entry of health) {
      expect(typeof entry.available).toBe('boolean')
      expect(entry.command.length).toBeGreaterThan(0)
      expect(entry.installCommand.length).toBeGreaterThan(0)
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })
})
