import { describe, expect, it } from 'vitest'
import { STORE_VERSION_V2, extractMetadata, migrateToV2 } from '../../shared/schema-v2.js'

describe('StoredIndexV2 Migration', () => {
  it('should migrate v3 index to v2', () => {
    const oldV3Index = {
      version: 3,
      builtAt: '2026-05-09T10:30:00.000Z',
      projectRoot: '/home/user/my-project',
      fileCount: 42,
      skeletons: {
        'src/index.ts': 'export const app = ...',
        'src/auth.ts': 'export class Auth { ... }',
      },
      deps: {
        'src/index.ts': ['src/auth.ts'],
      },
      reverseDeps: {
        'src/auth.ts': ['src/index.ts'],
      },
      symbolIndex: {
        'src/index.ts': ['app'],
        'src/auth.ts': ['Auth'],
      },
    }

    const v2 = migrateToV2(oldV3Index)

    expect(v2.version).toBe(STORE_VERSION_V2)
    expect(v2.schemaVersion).toBe('2.0')
    expect(v2.fileCount).toBe(42)
    expect(v2.projectName).toBe('my-project')
    expect(v2.symbolCount).toBe(2)
    expect(v2.edgeCount).toBe(1)
    expect(v2.skeletons).toEqual(oldV3Index.skeletons)
    expect(v2.deps).toEqual(oldV3Index.deps)
    expect(v2.config).toBeDefined()
    expect(v2.checksums).toBeDefined()
  })

  it('should extract metadata correctly', () => {
    const v2Index = {
      version: STORE_VERSION_V2,
      schemaVersion: '2.0',
      builtAt: '2026-05-09T10:30:00.000Z',
      builtIn: 3200,
      buildMode: 'fresh' as const,
      projectRoot: '/home/user/my-project',
      projectName: 'my-project',
      gitCommit: 'abc123def456',
      gitBranch: 'main',
      fileCount: 42,
      symbolCount: 320,
      edgeCount: 127,
      languages: {
        typescript: { fileCount: 45, symbolCount: 320, edgeCount: 127 },
      },
      config: {
        scanPatterns: ['src/**'],
        ignorePatterns: ['node_modules'],
        languages: ['typescript'],
      },
      skeletons: {},
      deps: {},
      reverseDeps: {},
      symbolIndex: {},
      checksums: { files: {}, timestamp: Date.now() },
      graph: {
        nodes: [{ id: 'src/auth.ts:authenticate', label: 'authenticate', community: 0 }],
        edges: [
          { source: 'src/auth.ts:authenticate', target: 'src/utils.ts:validateJWT', confidence: 'EXTRACTED' as const },
        ],
        communities: 2,
        godNodes: ['src/auth.ts:authenticate'],
        maxComponentSize: 45,
        circularDependencies: 3,
      },
    }

    const meta = extractMetadata(v2Index)

    expect(meta.version).toBe(STORE_VERSION_V2)
    expect(meta.projectName).toBe('my-project')
    expect(meta.fileCount).toBe(42)
    expect(meta.symbolCount).toBe(320)
    expect(meta.edgeCount).toBe(127)
    expect(meta.languages).toContain('typescript')
    expect(meta.gitCommit).toBe('abc123def456')
    expect(meta.godNodesCount).toBe(1)
    expect(meta.communityCount).toBe(2)
  })
})
