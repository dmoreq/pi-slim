import { describe, expect, it } from 'vitest'
import { formatCompilerErrorLspGuidance } from '../../context/compiler-error-bridge.js'
import { ContextIntelligenceEngine } from '../../context/intelligence-engine.js'
import { AgentPatternDetector } from '../../context/pattern-detector.js'

describe('compiler error LSP bridge', () => {
  it('formats hover hints with 0-based coordinates', () => {
    const block = formatCompilerErrorLspGuidance([
      { relPath: 'src/a.ts', line: 11, column: 4 },
    ])
    expect(block).toContain('COMPILER ERRORS')
    expect(block).toContain('lsp_hover')
    expect(block).toContain('line: 11')
    expect(block).toContain('column: 4')
  })

  it('detects tsc errors in tool results', () => {
    const detector = new AgentPatternDetector()
    const hints = detector.detectCompilerErrors(
      [
        {
          role: 'toolResult',
          content: 'src/foo.ts(2,3): error TS2304: Cannot find name',
        },
      ],
      '/project'
    )
    expect(hints.length).toBeGreaterThanOrEqual(1)
    expect(hints[0].line).toBe(1)
    expect(hints[0].column).toBe(2)
  })

  it('injects compiler block into intelligence guidance', () => {
    const engine = new ContextIntelligenceEngine()
    engine.setProjectRoot('/project')
    const insights = engine.analyzeConversationContext([
      { role: 'toolResult', content: 'lib/x.ts(5,1): error TS1005: x' },
    ])
    const guidance = engine.generateActionableGuidance(insights, null)
    expect(guidance).toContain('COMPILER ERRORS')
  })
})
