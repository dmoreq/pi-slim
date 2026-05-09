// tests/context/pattern-detector.test.ts
import { describe, it, expect } from 'vitest'
import { AgentPatternDetector } from '../../context/pattern-detector.js'
import type { AgentMessage } from '../../manager.js'

describe('AgentPatternDetector', () => {
  const detector = new AgentPatternDetector()

  describe('detectEditingIntent', () => {
    it('should detect editing intent from messages', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'edit the authenticate function' },
        { role: 'assistant', content: 'I need to modify the authentication logic' }
      ]

      const context = detector.detectEditingIntent(messages)

      expect(context.detected).toBe(true)
      expect(context.targetSymbols).toContain('authenticate')
    })

    it('should detect file paths and hash annotations', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'edit src/auth.ts using hashline 1tz' }
      ]
      const context = detector.detectEditingIntent(messages)
      expect(context.targetFiles).toContain('src/auth.ts')
      expect(context.hasHashAnnotations).toBe(true)
    })

    it('should detect snake_case, PascalCase, and camelCase symbols', () => {
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'modify user_settings, ClientHandler, and getUserProfile'
        }
      ]
      const context = detector.detectEditingIntent(messages)
      expect(context.targetSymbols).toContain('user_settings')
      expect(context.targetSymbols).toContain('ClientHandler')
      expect(context.targetSymbols).toContain('getUserProfile')
    })
  })

  describe('detectNavigationRequests', () => {
    it('should detect navigation requests', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'where is the Client class defined?' },
        { role: 'assistant', content: 'Let me find the Client class for you' }
      ]

      const context = detector.detectNavigationRequests(messages)

      expect(context.detected).toBe(true)
      expect(context.requestedSymbols).toContain('Client')
      expect(context.requestType).toBe('definition')
    })

    it('should detect references requests', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'show me references to the User interface' }
      ]
      const context = detector.detectNavigationRequests(messages)
      expect(context.requestType).toBe('references')
      expect(context.requestedSymbols).toContain('User')
    })

    it('should detect file location requests', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'which file contains the auth logic?' }
      ]
      const context = detector.detectNavigationRequests(messages)
      expect(context.requestType).toBe('file_location')
    })
  })

  describe('detectSuboptimalToolUsage', () => {
    it('should detect suboptimal tool usage patterns', () => {
      const messages: AgentMessage[] = [
        { role: 'assistant', content: 'I need to read the file first' },
        { role: 'assistant', content: 'Using StrReplace to edit the function' }
      ]

      const issues = detector.detectSuboptimalToolUsage(messages)

      expect(issues).toHaveLength(1)
      expect(issues[0].pattern).toBe('basic_file_edit')
      expect(issues[0].recommendation).toContain('hashline_edit')
    })

    it('should detect manual navigation patterns', () => {
      const messages: AgentMessage[] = [
        {
          role: 'assistant',
          content: 'Can you tell me where the Client class is located?'
        }
      ]
      const issues = detector.detectSuboptimalToolUsage(messages)
      expect(issues).toHaveLength(1)
      expect(issues[0].pattern).toBe('manual_navigation')
      expect(issues[0].toolSuggestion).toBe('lsp_go_to_definition')
    })

    it('should detect missing impact analysis', () => {
      const messages: AgentMessage[] = [
        { role: 'assistant', content: 'I will modify this god node' },
        { role: 'assistant', content: 'Making the change now' }
      ]
      const issues = detector.detectSuboptimalToolUsage(messages)
      expect(issues).toHaveLength(1)
      expect(issues[0].pattern).toBe('missing_impact_analysis')
    })
  })
})
