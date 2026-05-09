/**
 * Graphify Schema Validation
 *
 * JSON schema and validation logic for graphify's graph.json format.
 * Ensures the graph data is well-formed before processing.
 */

import type { GraphifyGraph, ValidationResult } from './graph-types.js'

/**
 * JSON Schema for GraphifyGraph
 * Defines the expected structure of graph.json from graphify.
 */
export const GRAPHIFY_GRAPH_SCHEMA = {
  type: 'object',
  required: ['nodes', 'edges'],
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'label'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            pattern: '^[a-zA-Z0-9_:./-]+$',
            description: 'Unique node identifier'
          },
          type: {
            type: 'string',
            enum: [
              'function',
              'class',
              'module',
              'concept',
              'interface',
              'variable'
            ],
            description: 'Type of node'
          },
          label: {
            type: 'string',
            minLength: 1,
            description: 'Human-readable label'
          },
          description: {
            type: ['string', 'null'],
            description: 'Optional description'
          },
          metadata: {
            type: ['object', 'null'],
            description: 'Optional metadata'
          }
        },
        additionalProperties: false
      },
      minItems: 1,
      description: 'All nodes in the graph'
    },

    edges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'target', 'type'],
        properties: {
          source: {
            type: 'string',
            minLength: 1,
            description: 'Source node ID'
          },
          target: {
            type: 'string',
            minLength: 1,
            description: 'Target node ID'
          },
          type: {
            type: 'string',
            enum: [
              'imports',
              'calls',
              'extends',
              'implements',
              'uses',
              'depends_on'
            ],
            description: 'Type of relationship'
          },
          weight: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 1,
            description: 'Relationship strength (0-1)'
          },
          surprising: {
            type: ['boolean', 'null'],
            description: 'Is this an unexpected connection?'
          },
          metadata: {
            type: ['object', 'null'],
            description: 'Optional metadata'
          }
        },
        additionalProperties: false
      },
      description: 'All edges in the graph'
    },

    communities: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        required: ['id', 'label', 'nodes'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description: 'Community ID'
          },
          label: {
            type: 'string',
            minLength: 1,
            description: 'Community label'
          },
          nodes: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Node IDs in this community'
          },
          internal: {
            type: ['array', 'null'],
            description: 'Internal edges'
          },
          external: {
            type: ['array', 'null'],
            description: 'External edges'
          },
          density: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 1,
            description: 'Community density'
          }
        },
        additionalProperties: false
      },
      description: 'Optional: pre-detected communities'
    },

    confidence: {
      type: ['object', 'null'],
      properties: {
        extracted: {
          type: ['number', 'null'],
          minimum: 0,
          maximum: 100
        },
        inferred: {
          type: ['number', 'null'],
          minimum: 0,
          maximum: 100
        },
        ambiguous: {
          type: ['number', 'null'],
          minimum: 0,
          maximum: 100
        }
      },
      additionalProperties: false,
      description: 'Optional confidence scores'
    },

    metadata: {
      type: ['object', 'null'],
      description: 'Optional graph metadata'
    }
  },

  additionalProperties: false
}

/**
 * Validate a graph object against the schema.
 * Performs both structural and semantic validation.
 */
export function validateGraphSchema(graph: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // ── Type check ─────────────────────────────────────────────────────────

  if (!graph || typeof graph !== 'object') {
    return {
      valid: false,
      errors: ['Graph must be a non-null object'],
      warnings: []
    }
  }

  const g = graph as Record<string, unknown>

  // ── Required fields ────────────────────────────────────────────────────

  if (!Array.isArray(g.nodes)) {
    errors.push('Missing or invalid "nodes" field (must be array)')
  }

  if (!Array.isArray(g.edges)) {
    errors.push('Missing or invalid "edges" field (must be array)')
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings }
  }

  const nodes = g.nodes as unknown[]
  const edges = g.edges as unknown[]

  // ── Node validation ────────────────────────────────────────────────────

  if (nodes.length === 0) {
    errors.push('Graph must have at least one node')
  }

  const nodeIds = new Set<string>()

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    if (!node || typeof node !== 'object') {
      errors.push(`Node ${i}: must be an object`)
      continue
    }

    const n = node as Record<string, unknown>

    if (typeof n.id !== 'string' || !n.id) {
      errors.push(`Node ${i}: missing or invalid "id"`)
      continue
    }

    if (!n.id.match(/^[a-zA-Z0-9_:./-]+$/)) {
      errors.push(`Node ${i} "${n.id}": invalid ID format`)
      continue
    }

    if (nodeIds.has(n.id)) {
      errors.push(`Node "${n.id}": duplicate ID`)
      continue
    }

    nodeIds.add(n.id)

    // Validate type
    const validTypes = [
      'function',
      'class',
      'module',
      'concept',
      'interface',
      'variable'
    ]
    if (!validTypes.includes(String(n.type))) {
      errors.push(
        `Node "${n.id}": invalid type "${n.type}" (must be one of: ${validTypes.join(', ')})`
      )
    }

    // Validate label
    if (typeof n.label !== 'string' || !n.label) {
      errors.push(`Node "${n.id}": missing or invalid "label"`)
    }
  }

  // ── Edge validation ────────────────────────────────────────────────────

  const validEdgeTypes = [
    'imports',
    'calls',
    'extends',
    'implements',
    'uses',
    'depends_on'
  ]

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]

    if (!edge || typeof edge !== 'object') {
      errors.push(`Edge ${i}: must be an object`)
      continue
    }

    const e = edge as Record<string, unknown>

    // Validate source and target exist
    if (typeof e.source !== 'string' || !e.source) {
      errors.push(`Edge ${i}: missing or invalid "source"`)
      continue
    }

    if (typeof e.target !== 'string' || !e.target) {
      errors.push(`Edge ${i}: missing or invalid "target"`)
      continue
    }

    if (!nodeIds.has(e.source)) {
      warnings.push(
        `Edge ${i}: source node "${e.source}" not found in nodes`
      )
    }

    if (!nodeIds.has(e.target)) {
      warnings.push(
        `Edge ${i}: target node "${e.target}" not found in nodes`
      )
    }

    // Validate type
    if (!validEdgeTypes.includes(String(e.type))) {
      errors.push(
        `Edge ${i}: invalid type "${e.type}" (must be one of: ${validEdgeTypes.join(', ')})`
      )
    }

    // Validate weight if present
    if (e.weight !== undefined && typeof e.weight !== 'number') {
      errors.push(`Edge ${i}: invalid "weight" (must be number)`)
    }

    if (typeof e.weight === 'number') {
      if (e.weight < 0 || e.weight > 1) {
        errors.push(`Edge ${i}: "weight" must be between 0 and 1`)
      }
    }

    // Validate surprising if present
    if (e.surprising !== undefined && typeof e.surprising !== 'boolean') {
      errors.push(`Edge ${i}: invalid "surprising" (must be boolean)`)
    }
  }

  // ── Community validation (if present) ───────────────────────────────────

  if (Array.isArray(g.communities)) {
    for (let i = 0; i < g.communities.length; i++) {
      const community = (g.communities as unknown[])[i]

      if (!community || typeof community !== 'object') {
        warnings.push(`Community ${i}: must be an object`)
        continue
      }

      const c = community as Record<string, unknown>

      if (typeof c.id !== 'string' || !c.id) {
        warnings.push(`Community ${i}: missing or invalid "id"`)
      }

      if (!Array.isArray(c.nodes)) {
        warnings.push(`Community ${i}: missing or invalid "nodes"`)
        continue
      }

      for (const nodeId of c.nodes as unknown[]) {
        if (typeof nodeId === 'string' && !nodeIds.has(nodeId)) {
          warnings.push(`Community "${c.id}": node "${nodeId}" not found`)
        }
      }
    }
  }

  // ── Overall verdict ────────────────────────────────────────────────────

  const valid = errors.length === 0

  return { valid, errors, warnings }
}

/**
 * Validate that a graph object conforms to GraphifyGraph type.
 * Type guard function.
 */
export function isValidGraphifyGraph(
  graph: unknown
): graph is GraphifyGraph {
  const result = validateGraphSchema(graph)
  return result.valid
}

/**
 * Get a human-readable error summary.
 */
export function formatValidationErrors(result: ValidationResult): string {
  const lines: string[] = []

  if (result.errors.length > 0) {
    lines.push('ERRORS:')
    result.errors.forEach((err) => lines.push(`  • ${err}`))
  }

  if (result.warnings.length > 0) {
    lines.push('WARNINGS:')
    result.warnings.forEach((warn) => lines.push(`  • ${warn}`))
  }

  return lines.length > 0 ? lines.join('\n') : 'Valid'
}
