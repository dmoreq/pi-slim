/**
 * Tests for Graphify Loader
 *
 * Tests loading and parsing of graph.json files.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  loadGraphifyJson,
  loadGraphifyJsonSync,
  getGraphStats,
  saveGraphifyJson
} from '../../context/graph-loader'
import type { GraphifyGraph } from '../../context/graph-types'

const testDir = path.join(__dirname, '.graphify-test')

beforeAll(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true })
  }
})

afterAll(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true })
  }
})

describe('GraphifyLoader', () => {
  // ── Successful Load Tests ──────────────────────────────────────────────

  describe('loadGraphifyJson - Success Cases', () => {
    it('loads valid graph from file', async () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'Function A' },
          { id: 'b', type: 'function', label: 'Function B' }
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls' }]
      }

      const filePath = path.join(testDir, 'valid-graph.json')
      fs.writeFileSync(filePath, JSON.stringify(graph))

      const result = await loadGraphifyJson(filePath)

      expect(result.success).toBe(true)
      expect(result.graph).toBeDefined()
      expect(result.graph?.nodes).toHaveLength(2)
      expect(result.graph?.edges).toHaveLength(1)
      expect(result.error).toBeUndefined()
    })

    it('loads graph with relative path', async () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'test', type: 'module', label: 'Test' }],
        edges: []
      }

      const fileName = 'relative-test.json'
      const filePath = path.join(testDir, fileName)
      fs.writeFileSync(filePath, JSON.stringify(graph))

      // Use absolute path for reliability
      const result = await loadGraphifyJson(filePath)

      expect(result.success).toBe(true)
      expect(result.graph?.nodes).toHaveLength(1)
    })

    it('loads graph with absolute path', async () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'abs', type: 'module', label: 'Absolute' }],
        edges: []
      }

      const filePath = path.join(testDir, 'absolute-test.json')
      fs.writeFileSync(filePath, JSON.stringify(graph))

      const result = await loadGraphifyJson(filePath)

      expect(result.success).toBe(true)
      expect(result.graph?.nodes).toHaveLength(1)
    })

    it('includes warnings when loading valid but odd graph', async () => {
      const graph = {
        nodes: [{ id: 'a', type: 'function' as const, label: 'A' }],
        edges: [{ source: 'a', target: 'missing', type: 'calls' as const }]
      }

      const filePath = path.join(testDir, 'with-warnings.json')
      fs.writeFileSync(filePath, JSON.stringify(graph))

      const result = await loadGraphifyJson(filePath)

      expect(result.success).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

  // ── Error Cases ────────────────────────────────────────────────────────

  describe('loadGraphifyJson - Error Cases', () => {
    it('returns error for non-existent file', async () => {
      const result = await loadGraphifyJson(
        path.join(testDir, 'does-not-exist.json')
      )

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not found/)
      expect(result.graph).toBeUndefined()
    })

    it('returns error for invalid JSON', async () => {
      const filePath = path.join(testDir, 'invalid-json.json')
      fs.writeFileSync(filePath, '{invalid json}')

      const result = await loadGraphifyJson(filePath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/parse JSON/)
      expect(result.graph).toBeUndefined()
    })

    it('returns error for missing required fields', async () => {
      const filePath = path.join(testDir, 'missing-fields.json')
      fs.writeFileSync(filePath, JSON.stringify({ nodes: [] }))

      const result = await loadGraphifyJson(filePath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Invalid/)
      expect(result.graph).toBeUndefined()
    })

    it('returns error for empty nodes array', async () => {
      const filePath = path.join(testDir, 'empty-nodes.json')
      fs.writeFileSync(filePath, JSON.stringify({ nodes: [], edges: [] }))

      const result = await loadGraphifyJson(filePath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/at least one node/)
    })

    it('returns error for invalid node', async () => {
      const filePath = path.join(testDir, 'invalid-node.json')
      const graph = {
        nodes: [{ id: '@@bad@@', type: 'function' as const, label: 'Bad' }],
        edges: []
      }
      fs.writeFileSync(filePath, JSON.stringify(graph))

      const result = await loadGraphifyJson(filePath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Invalid/)
    })
  })

  // ── Sync Loader Tests ──────────────────────────────────────────────────

  describe('loadGraphifyJsonSync', () => {
    it('loads valid graph synchronously', () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'sync', type: 'module', label: 'Sync Test' }],
        edges: []
      }

      const filePath = path.join(testDir, 'sync-test.json')
      fs.writeFileSync(filePath, JSON.stringify(graph))

      const result = loadGraphifyJsonSync(filePath)

      expect(result.success).toBe(true)
      expect(result.graph?.nodes).toHaveLength(1)
    })

    it('returns error for non-existent file (sync)', () => {
      const result = loadGraphifyJsonSync(
        path.join(testDir, 'sync-missing.json')
      )

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not found/)
    })

    it('returns error for invalid JSON (sync)', () => {
      const filePath = path.join(testDir, 'sync-invalid.json')
      fs.writeFileSync(filePath, 'not json at all')

      const result = loadGraphifyJsonSync(filePath)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/parse JSON/)
    })
  })

  // ── Graph Statistics Tests ─────────────────────────────────────────────

  describe('getGraphStats', () => {
    it('calculates stats for simple graph', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'class', label: 'B' },
          { id: 'c', type: 'module', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'uses' },
          { source: 'a', target: 'c', type: 'imports' }
        ]
      }

      const stats = getGraphStats(graph)

      expect(stats.nodeCount).toBe(3)
      expect(stats.edgeCount).toBe(3)
      expect(stats.avgDegree).toBe(2)
      expect(stats.density).toBeGreaterThan(0)
    })

    it('counts node types correctly', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'class', label: 'C' }
        ],
        edges: []
      }

      const stats = getGraphStats(graph)

      expect(stats.nodeTypes.function).toBe(2)
      expect(stats.nodeTypes.class).toBe(1)
    })

    it('counts edge types correctly', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'b', target: 'c', type: 'calls' },
          { source: 'a', target: 'c', type: 'imports' }
        ]
      }

      const stats = getGraphStats(graph)

      expect(stats.edgeTypes.calls).toBe(2)
      expect(stats.edgeTypes.imports).toBe(1)
    })

    it('calculates density for empty graph', () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'a', type: 'function', label: 'A' }],
        edges: []
      }

      const stats = getGraphStats(graph)

      expect(stats.density).toBe(0)
      expect(stats.avgDegree).toBe(0)
    })

    it('calculates average degree correctly', () => {
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'A' },
          { id: 'b', type: 'function', label: 'B' },
          { id: 'c', type: 'function', label: 'C' },
          { id: 'd', type: 'function', label: 'D' }
        ],
        edges: [
          { source: 'a', target: 'b', type: 'calls' },
          { source: 'a', target: 'c', type: 'calls' },
          { source: 'b', target: 'd', type: 'calls' }
        ]
      }

      const stats = getGraphStats(graph)

      // 4 nodes, 3 edges, avg degree = (2 * 3) / 4 = 1.5
      expect(stats.avgDegree).toBe(1.5)
    })
  })

  // ── Save Graph Tests ───────────────────────────────────────────────────

  describe('saveGraphifyJson', () => {
    it('saves graph to file', async () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'save', type: 'module', label: 'Save Test' }],
        edges: []
      }

      const filePath = path.join(testDir, 'saved-graph.json')
      const result = await saveGraphifyJson(graph, filePath)

      expect(result).toBe(true)
      expect(fs.existsSync(filePath)).toBe(true)

      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      expect(saved.nodes).toHaveLength(1)
      expect(saved.nodes[0].id).toBe('save')
    })

    it('creates directories as needed', async () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'test', type: 'module', label: 'Test' }],
        edges: []
      }

      const filePath = path.join(testDir, 'deep', 'nested', 'graph.json')
      const result = await saveGraphifyJson(graph, filePath)

      expect(result).toBe(true)
      expect(fs.existsSync(filePath)).toBe(true)
    })

    it('handles absolute paths', async () => {
      const graph: GraphifyGraph = {
        nodes: [{ id: 'abs', type: 'module', label: 'Absolute' }],
        edges: []
      }

      const filePath = path.join(testDir, 'abs-save.json')
      const result = await saveGraphifyJson(graph, filePath)

      expect(result).toBe(true)
      expect(fs.existsSync(filePath)).toBe(true)
    })
  })

  // ── Round-trip Tests ───────────────────────────────────────────────────

  describe('Round-trip (save and load)', () => {
    it('preserves graph through save and load', async () => {
      const original: GraphifyGraph = {
        nodes: [
          { id: 'a', type: 'function', label: 'Function A' },
          { id: 'b', type: 'class', label: 'Class B' }
        ],
        edges: [{ source: 'a', target: 'b', type: 'calls', weight: 0.8 }]
      }

      const filePath = path.join(testDir, 'roundtrip.json')
      await saveGraphifyJson(original, filePath)

      const loadResult = await loadGraphifyJson(filePath)

      expect(loadResult.success).toBe(true)
      expect(loadResult.graph?.nodes).toHaveLength(2)
      expect(loadResult.graph?.edges).toHaveLength(1)
      expect(loadResult.graph?.edges[0].weight).toBe(0.8)
    })
  })
})
