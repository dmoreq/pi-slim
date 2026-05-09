/**
 * Tests for Graphify Schema Validation
 *
 * Validates that graph.json files conform to the expected schema.
 */

import { describe, it, expect } from 'vitest'
import {
  validateGraphSchema,
  isValidGraphifyGraph,
  formatValidationErrors
} from '../../context/graph-schema'
import type { GraphifyGraph } from '../../context/graph-types'

describe('GraphifySchema', () => {
  // ── Validity Tests ─────────────────────────────────────────────────────

  describe('validateGraphSchema - Valid Graphs', () => {
    it('accepts minimal valid graph', () => {
      const graph = {
        nodes: [
          { id: 'a', type: 'function' as const, label: 'Node A' }
        ],
        edges: []
      }

      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('accepts complete valid graph', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'auth', type: 'module', label: 'Auth Module' },
          { id: 'db', type: 'module', label: 'Database Module' },
          { id: 'api', type: 'module', label: 'API Module' }
        ],
        edges: [
          { source: 'auth', target: 'db', type: 'calls' },
          { source: 'api', target: 'auth', type: 'imports' }
        ],
        communities: [
          {
            id: 'comm-1',
            label: 'Auth Community',
            nodes: ['auth'],
            internal: [],
            external: []
          }
        ]
      }

      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('accepts graph with optional fields', () => {
      const graph = {
        nodes: [
          {
            id: 'sym:1',
            type: 'function',
            label: 'Symbol 1',
            description: 'A function',
            metadata: { file: 'test.ts' }
          }
        ],
        edges: [
          {
            source: 'sym:1',
            target: 'sym:2',
            type: 'calls',
            weight: 0.8,
            surprising: true,
            metadata: { lineNumber: 42 }
          }
        ],
        metadata: { version: '1.0', createdAt: Date.now() }
      }

      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(true)
    })

    it('accepts all valid node types', () => {
      const types = [
        'function',
        'class',
        'module',
        'concept',
        'interface',
        'variable'
      ]

      for (const nodeType of types) {
        const graph = {
          nodes: [{ id: 'test', type: nodeType as any, label: 'Test' }],
          edges: []
        }

        const result = validateGraphSchema(graph)
        expect(result.valid).toBe(true)
      }
    })

    it('accepts all valid edge types', () => {
      const edgeTypes = [
        'imports',
        'calls',
        'extends',
        'implements',
        'uses',
        'depends_on'
      ]

      for (const edgeType of edgeTypes) {
        const graph = {
          nodes: [
            { id: 'a', type: 'function' as const, label: 'A' },
            { id: 'b', type: 'function' as const, label: 'B' }
          ],
          edges: [{ source: 'a', target: 'b', type: edgeType as any }]
        }

        const result = validateGraphSchema(graph)
        expect(result.valid).toBe(true)
      }
    })
  })

  // ── Error Cases ────────────────────────────────────────────────────────

  describe('validateGraphSchema - Error Cases', () => {
    it('rejects null input', () => {
      const result = validateGraphSchema(null)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toMatch(/non-null object/)
    })

    it('rejects non-object input', () => {
      const result = validateGraphSchema('not an object')

      expect(result.valid).toBe(false)
    })

    it('rejects missing nodes field', () => {
      const graph = { edges: [] }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('nodes'))).toBe(true)
    })

    it('rejects missing edges field', () => {
      const graph = {
        nodes: [{ id: 'a', type: 'function' as const, label: 'A' }]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('edges'))).toBe(true)
    })

    it('rejects non-array nodes', () => {
      const graph = { nodes: 'not an array', edges: [] }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })

    it('rejects non-array edges', () => {
      const graph = {
        nodes: [{ id: 'a', type: 'function' as const, label: 'A' }],
        edges: 'not an array'
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })

    it('rejects empty node array', () => {
      const graph = { nodes: [], edges: [] }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('at least one node'))).toBe(
        true
      )
    })

    it('rejects node missing id', () => {
      const graph = {
        nodes: [{ type: 'function' as const, label: 'No ID' }],
        edges: []
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('id'))).toBe(true)
    })

    it('rejects node with empty id', () => {
      const graph = {
        nodes: [{ id: '', type: 'function' as const, label: 'Empty ID' }],
        edges: []
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })

    it('rejects node with invalid id format', () => {
      const graph = {
        nodes: [{ id: '@@invalid@@', type: 'function' as const, label: 'Bad ID' }],
        edges: []
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('invalid ID format'))).toBe(
        true
      )
    })

    it('rejects node with duplicate id', () => {
      const graph = {
        nodes: [
          { id: 'a', type: 'function' as const, label: 'A' },
          { id: 'a', type: 'function' as const, label: 'A2' }
        ],
        edges: []
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true)
    })

    it('rejects node with invalid type', () => {
      const graph = {
        nodes: [{ id: 'a', type: 'invalid_type' as any, label: 'A' }],
        edges: []
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('invalid type'))).toBe(true)
    })

    it('rejects node missing label', () => {
      const graph = {
        nodes: [{ id: 'a', type: 'function' as const }],
        edges: []
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })

    it('rejects edge with missing source', () => {
      const graph = {
        nodes: [
          { id: 'a', type: 'function' as const, label: 'A' },
          { id: 'b', type: 'function' as const, label: 'B' }
        ],
        edges: [{ target: 'b', type: 'calls' as const }]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })

    it('rejects edge with missing target', () => {
      const graph = {
        nodes: [
          { id: 'a', type: 'function' as const, label: 'A' },
          { id: 'b', type: 'function' as const, label: 'B' }
        ],
        edges: [{ source: 'a', type: 'calls' as const }]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })

    it('rejects edge with missing type', () => {
      const graph = {
        nodes: [
          { id: 'a', type: 'function' as const, label: 'A' },
          { id: 'b', type: 'function' as const, label: 'B' }
        ],
        edges: [{ source: 'a', target: 'b' }]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })

    it('rejects edge with invalid type', () => {
      const graph = {
        nodes: [
          { id: 'a', type: 'function' as const, label: 'A' },
          { id: 'b', type: 'function' as const, label: 'B' }
        ],
        edges: [{ source: 'a', target: 'b', type: 'invalid' as any }]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })

    it('rejects invalid weight (out of range)', () => {
      const graph = {
        nodes: [
          { id: 'a', type: 'function' as const, label: 'A' },
          { id: 'b', type: 'function' as const, label: 'B' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' as const, weight: 1.5 }
        ]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('weight'))).toBe(true)
    })

    it('rejects non-boolean surprising', () => {
      const graph = {
        nodes: [
          { id: 'a', type: 'function' as const, label: 'A' },
          { id: 'b', type: 'function' as const, label: 'B' }
        ],
        edges: [
          {
            source: 'a',
            target: 'b',
            type: 'calls' as const,
            surprising: 'yes' as any
          }
        ]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(false)
    })
  })

  // ── Warning Cases ──────────────────────────────────────────────────────

  describe('validateGraphSchema - Warning Cases', () => {
    it('warns about missing node reference in edge', () => {
      const graph = {
        nodes: [{ id: 'a', type: 'function' as const, label: 'A' }],
        edges: [{ source: 'a', target: 'missing', type: 'calls' as const }]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toMatch(/not found/)
    })

    it('warns about community with missing node', () => {
      const graph = {
        nodes: [{ id: 'a', type: 'function' as const, label: 'A' }],
        edges: [],
        communities: [
          {
            id: 'comm-1',
            label: 'Test Community',
            nodes: ['a', 'missing']
          }
        ]
      }
      const result = validateGraphSchema(graph)

      expect(result.valid).toBe(true)
      expect(result.warnings.some((w) => w.includes('missing'))).toBe(true)
    })
  })

  // ── Type Guard Tests ───────────────────────────────────────────────────

  describe('isValidGraphifyGraph', () => {
    it('returns true for valid graph', () => {
      const graph: unknown = {
        nodes: [{ id: 'a', type: 'function' as const, label: 'A' }],
        edges: []
      }

      expect(isValidGraphifyGraph(graph)).toBe(true)
    })

    it('returns false for invalid graph', () => {
      const graph: unknown = { nodes: [] }

      expect(isValidGraphifyGraph(graph)).toBe(false)
    })
  })

  // ── Formatting Tests ───────────────────────────────────────────────────

  describe('formatValidationErrors', () => {
    it('formats errors correctly', () => {
      const result = {
        valid: false,
        errors: ['Error 1', 'Error 2'],
        warnings: ['Warning 1']
      }

      const formatted = formatValidationErrors(result)

      expect(formatted).toContain('ERRORS:')
      expect(formatted).toContain('Error 1')
      expect(formatted).toContain('Error 2')
      expect(formatted).toContain('WARNINGS:')
      expect(formatted).toContain('Warning 1')
    })

    it('returns "Valid" for valid result', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: []
      }

      const formatted = formatValidationErrors(result)

      expect(formatted).toBe('Valid')
    })
  })
})
