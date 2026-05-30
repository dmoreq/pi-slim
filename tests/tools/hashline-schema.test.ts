import { describe, expect, it } from 'vitest'
import hashlineTool from '../../tools/hashline-editor'

describe('hashline_edit tool schema', () => {
  it('declares dry_run in parameters for agent discovery', () => {
    const params = hashlineTool.parameters as { properties?: Record<string, unknown> }
    expect(params.properties).toHaveProperty('dry_run')
  })
})
