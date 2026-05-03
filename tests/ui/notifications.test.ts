import { describe, it, expect } from 'vitest'
import {
  info,
  warn,
  error,
  success,
  buildStatusText,
  updateStatusBar,
  clearStatusBar,
  type StatusBarState,
} from '../../src/ui/notifications.js'

describe('message formatting', () => {
  it('info adds prefix', () => {
    expect(info('hello')).toContain('[smart-context]')
    expect(info('hello')).toContain('hello')
  })

  it('warn adds warning icon', () => {
    expect(warn('uh oh')).toContain('⚠')
  })

  it('error adds error icon', () => {
    expect(error('failed')).toContain('✗')
  })

  it('success adds check icon', () => {
    expect(success('done')).toContain('✓')
  })
})

describe('buildStatusText', () => {
  it('shows files and tokens when available', () => {
    const state: StatusBarState = {
      indexedFiles: 150,
      repoMapTokens: 3500,
      depContextTriggers: 5,
      contextFilesCount: 2,
      providerGuidanceCount: 0,
    }
    const text = buildStatusText(state)
    expect(text).toContain('150 files')
    expect(text).toContain('~3500t')
    expect(text).toContain('5 inj')
    expect(text).toContain('2 ctx')
    expect(text).not.toContain('guid')
  })

  it('returns empty string for all-zero state', () => {
    const state: StatusBarState = {
      indexedFiles: 0,
      repoMapTokens: 0,
      depContextTriggers: 0,
      contextFilesCount: 0,
      providerGuidanceCount: 0,
    }
    expect(buildStatusText(state)).toBe('')
  })

  it('includes guidance count when present', () => {
    const state: StatusBarState = {
      indexedFiles: 10,
      repoMapTokens: 0,
      depContextTriggers: 0,
      contextFilesCount: 0,
      providerGuidanceCount: 1,
    }
    const text = buildStatusText(state)
    expect(text).toContain('1 guid')
  })
})

describe('updateStatusBar', () => {
  it('calls setStatus with formatted text', () => {
    const calls: Array<[string, string | undefined]> = []
    const mockSetStatus = (key: string, text?: string) => {
      calls.push([key, text])
    }

    updateStatusBar(mockSetStatus, {
      indexedFiles: 100,
      repoMapTokens: 2000,
      depContextTriggers: 3,
      contextFilesCount: 1,
      providerGuidanceCount: 0,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('smart-ctx')
    expect(calls[0][1]).toContain('SmartCtx:')
    expect(calls[0][1]).toContain('100 files')
  })

  it('shows empty state indicator', () => {
    const calls: Array<[string, string | undefined]> = []
    const mockSetStatus = (key: string, text?: string) => {
      calls.push([key, text])
    }

    updateStatusBar(mockSetStatus, {
      indexedFiles: 0,
      repoMapTokens: 0,
      depContextTriggers: 0,
      contextFilesCount: 0,
      providerGuidanceCount: 0,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe('SmartCtx: --')
  })
})

describe('clearStatusBar', () => {
  it('calls setStatus with undefined text', () => {
    const calls: Array<[string, string | undefined]> = []
    const mockSetStatus = (key: string, text?: string) => {
      calls.push([key, text])
    }

    clearStatusBar(mockSetStatus)
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBeUndefined()
  })
})
