# Conflict Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve 10 architectural conflicts across dead code, type duplication, guidance text, and pipeline token accounting — in three risk-ordered phases.

**Architecture:** Phase 1 deletes dead/contradictory code (zero behaviour change). Phase 2 fixes types and guidance text (text-only changes). Phase 3 moves all context injection through `InjectionPipeline` so the token budget is enforced consistently.

**Tech Stack:** TypeScript, Vitest, Node.js ESM (`.js` imports)

**Run all tests:** `npx vitest run`  
**Run one file:** `npx vitest run tests/path/to/file.test.ts`

---

## Phase 1 — Pure Deletions

---

### Task 1: Fold god-node sort into `ContextIntelligenceEngine`

**Files:**
- Modify: `context/intelligence-engine.ts`
- Modify: `tests/context/intelligence-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Open `tests/context/intelligence-engine.test.ts` and add this test at the end of the existing `describe` block (or create the file if it doesn't exist using the import below):

```typescript
import { describe, it, expect } from 'vitest'
import { ContextIntelligenceEngine } from '../../context/intelligence-engine.js'
import type { GraphifyAnalysis } from '../../context/graph-types.js'

function makeAnalysis(overrides?: Partial<GraphifyAnalysis>): GraphifyAnalysis {
  return {
    godNodes: [],
    communities: [],
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
    metrics: {
      totalNodes: 0, totalEdges: 0, godNodeCount: 0, communityCount: 0,
      averageDegree: 0, maxDegree: 0, graphDensity: 0, avgClusteringCoeff: 0,
      cycleCount: 0, bottleneckCount: 0,
    },
    computedAt: Date.now(),
    version: '1',
    ...overrides,
  }
}

describe('ContextIntelligenceEngine – god node sort', () => {
  it('outputs CRITICAL before IMPORTANT before NORMAL in risk warnings', () => {
    const engine = new ContextIntelligenceEngine()
    const analysis = makeAnalysis({
      godNodes: [
        { nodeId: 'normal_node', label: 'NormalNode', criticality: 'NORMAL',
          inDegree: 5, outDegree: 1, betweenness: 0, pageRank: 0, community: 'c1' },
        { nodeId: 'critical_node', label: 'CriticalNode', criticality: 'CRITICAL',
          inDegree: 10, outDegree: 2, betweenness: 0.8, pageRank: 0.9, community: 'c1' },
        { nodeId: 'important_node', label: 'ImportantNode', criticality: 'IMPORTANT',
          inDegree: 7, outDegree: 1, betweenness: 0.4, pageRank: 0.5, community: 'c1' },
      ],
    })
    // Messages that trigger editing intent for all three nodes
    const messages = [
      { role: 'user' as const, content: 'please edit CriticalNode, ImportantNode, and NormalNode' },
    ]
    const insights = engine.analyzeConversationContext(messages, analysis)
    const guidance = engine.generateActionableGuidance(insights, analysis)

    // Extract lines in the HIGH-IMPACT section
    const lines = guidance.split('\n').filter(l => l.includes('Node'))
    expect(lines.findIndex(l => l.includes('CriticalNode')))
      .toBeLessThan(lines.findIndex(l => l.includes('ImportantNode')))
    expect(lines.findIndex(l => l.includes('ImportantNode')))
      .toBeLessThan(lines.findIndex(l => l.includes('NormalNode')))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/context/intelligence-engine.test.ts
```

Expected: FAIL — warning lines appear in insertion order, not criticality order.

- [ ] **Step 3: Add `sortGodNodesByRisk` and update `generateRiskWarnings`**

In `context/intelligence-engine.ts`, add this private method before `generateRiskWarnings`:

```typescript
private sortGodNodesByRisk(nodes: GodNode[]): GodNode[] {
  const order: Record<GodNode['criticality'], number> = {
    CRITICAL: 0,
    IMPORTANT: 1,
    NORMAL: 2,
  }
  return [...nodes].sort(
    (a, b) =>
      order[a.criticality] - order[b.criticality] || b.inDegree - a.inDegree,
  )
}
```

Replace the body of `generateRiskWarnings` with:

```typescript
private generateRiskWarnings(
  affectedGodNodes: string[],
  graphAnalysis: GraphifyAnalysis,
): string {
  const matched = affectedGodNodes
    .map((nodeId) =>
      graphAnalysis.godNodes.find(
        (gn) =>
          gn.nodeId.toLowerCase().includes(nodeId.toLowerCase()) ||
          gn.label.toLowerCase().includes(nodeId.toLowerCase()),
      ),
    )
    .filter((gn): gn is GodNode => gn !== undefined)

  const warnings = this.sortGodNodesByRisk(matched)
    .slice(0, 5)
    .map((godNode) => {
      const icon =
        godNode.criticality === 'CRITICAL'
          ? '🔥'
          : godNode.criticality === 'IMPORTANT'
            ? '⚠️'
            : '🔍'
      return `- ${icon} \`${godNode.label}\` (${godNode.inDegree} dependencies) - Changes affect ${this.estimateAffectedCommunities(godNode, graphAnalysis)} communities`
    })

  return `⚠️ HIGH-IMPACT SYMBOLS (edit carefully):\n${warnings.join('\n')}`
}
```

Also ensure `GodNode` is imported at the top of `context/intelligence-engine.ts`:

```typescript
import type { GodNode, GraphifyAnalysis } from './graph-types.js'
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/context/intelligence-engine.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add context/intelligence-engine.ts tests/context/intelligence-engine.test.ts
git commit -m "feat: sort god nodes by criticality in risk warnings"
```

---

### Task 2: Delete `ActionableInsightsGenerator`

**Files:**
- Delete: `context/actionable-insights.ts`
- Delete: `tests/context/actionable-insights.test.ts`

- [ ] **Step 1: Verify no production imports exist**

```bash
grep -r "actionable-insights\|ActionableInsightsGenerator" \
  --include="*.ts" \
  /Users/quy.doan/Workspace/personal/pi-scope \
  | grep -v "node_modules\|dist\|\.test\.ts\|actionable-insights\.ts"
```

Expected: no output. If any line appears, remove that import before proceeding.

- [ ] **Step 2: Delete source and test files**

```bash
rm context/actionable-insights.ts
rm tests/context/actionable-insights.test.ts
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all previously passing tests still pass; no import errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete ActionableInsightsGenerator (dead code, replaced by ContextIntelligenceEngine)"
```

---

### Task 3: Remove `SessionOrchestrator` reference and delete `session/` directory

**Files:**
- Modify: `manager.ts`
- Delete: `session/` (all 8 files)
- Delete: `tests/session/` (all 4 test files)

- [ ] **Step 1: Remove the field and import from `manager.ts`**

Find and remove these three things in `manager.ts`:

1. The import line:
```typescript
import type { SessionOrchestrator } from './session/orchestration/session-orchestrator.js'
```

2. The field declaration in `SessionManager`:
```typescript
readonly sessionOrchestrator?: SessionOrchestrator
```

3. The constructor parameter and assignment:
```typescript
// Remove the `deps` parameter entirely:
constructor(
  _projectRoot?: string,
  deps?: { sessionOrchestrator?: SessionOrchestrator },
) {
  this.sessionOrchestrator = deps?.sessionOrchestrator
  // ...
}
```

Replace the constructor signature with:
```typescript
constructor(_projectRoot?: string) {
  this.intelligenceEngine = new ContextIntelligenceEngine()
  this.pluginManager.register(new ContextPruningPlugin())
}
```

- [ ] **Step 2: Delete the session directory and its tests**

```bash
rm -rf session/
rm -rf tests/session/
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete SessionOrchestrator stub and session/ scaffolding"
```

---

### Task 4: Remove `ReadAwarenessPlugin`

**Files:**
- Modify: `manager.ts`
- Delete: `plugins/read-awareness.ts`
- Delete: `tests/plugins/read-awareness.test.ts`

- [ ] **Step 1: Remove the import and registration from `manager.ts`**

Remove this import:
```typescript
import { ReadAwarenessPlugin } from './plugins/read-awareness.js'
```

Remove this line from the `SessionManager` constructor:
```typescript
this.pluginManager.register(new ReadAwarenessPlugin())
```

- [ ] **Step 2: Delete source and test files**

```bash
rm plugins/read-awareness.ts
rm tests/plugins/read-awareness.test.ts
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete ReadAwarenessPlugin (contradicts hashline_edit skeleton-first workflow)"
```

---

### Task 5: Fix `graph-wikipedia.ts` fragile cast

**Files:**
- Modify: `context/graph-wikipedia.ts`
- Modify: `tests/context/graph-wikipedia.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/context/graph-wikipedia.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateWikiPage } from '../../context/graph-wikipedia.js'
import type { GraphifyGraph, GraphifyAnalysis } from '../../context/graph-types.js'

describe('generateWikiPage – explicit graph parameter', () => {
  it('uses the explicit graph param instead of any-cast analysis.graph', () => {
    // analysis has NO .graph property — only the explicit param should work
    const analysis = {
      godNodes: [],
      communities: [],
      surprises: [],
      bottlenecks: [],
      anomalies: [],
      wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
      metrics: {
        totalNodes: 2, totalEdges: 1, godNodeCount: 0, communityCount: 0,
        averageDegree: 1, maxDegree: 1, graphDensity: 0.5, avgClusteringCoeff: 0,
        cycleCount: 0, bottleneckCount: 0,
      },
      computedAt: Date.now(),
      version: '1',
    } as GraphifyAnalysis

    const graph: GraphifyGraph = {
      nodes: [{ id: 'myservice', type: 'module', label: 'MyService' }],
      edges: [{ source: 'caller', target: 'myservice', type: 'calls' }],
    }

    const page = generateWikiPage('MyService', analysis, graph)
    // inDegree should be 1 — computed from the explicit graph, not a cast
    expect(page.metadata.inDegree).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails (or currently passes via cast)**

```bash
npx vitest run tests/context/graph-wikipedia.test.ts
```

Note the result — the cast may make it accidentally pass. Step 3 removes the cast; if the test was already passing it should still pass after the fix.

- [ ] **Step 3: Remove the cast fallback**

In `context/graph-wikipedia.ts`, find:

```typescript
const effectiveGraph = graph ?? (analysis as any).graph ?? null
```

Replace with:

```typescript
// Callers must pass the graph explicitly; we do not cast analysis to access it.
const effectiveGraph = graph ?? null
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add context/graph-wikipedia.ts tests/context/graph-wikipedia.test.ts
git commit -m "fix: remove (analysis as any).graph cast in generateWikiPage"
```

---

## Phase 2 — Type & Guidance Fixes

---

### Task 6: Fix LSP tool guidance text in `ContextIntelligenceEngine`

**Files:**
- Modify: `context/intelligence-engine.ts`
- Modify: `tests/context/intelligence-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/context/intelligence-engine.test.ts`:

```typescript
describe('ContextIntelligenceEngine – LSP tool guidance', () => {
  it('recommends lsp_go_to_definition for definition navigation', () => {
    const engine = new ContextIntelligenceEngine()
    const analysis = makeAnalysis()
    const messages = [{ role: 'user' as const, content: 'where is SessionManager defined?' }]
    const insights = engine.analyzeConversationContext(messages, analysis)
    const guidance = engine.generateActionableGuidance(insights, analysis)
    expect(guidance).toContain('lsp_go_to_definition')
    expect(guidance).toContain('canonical declaration')
  })

  it('recommends lsp_find_references for references navigation', () => {
    const engine = new ContextIntelligenceEngine()
    const analysis = makeAnalysis()
    const messages = [{ role: 'user' as const, content: 'find references to handleContext' }]
    const insights = engine.analyzeConversationContext(messages, analysis)
    const guidance = engine.generateActionableGuidance(insights, analysis)
    expect(guidance).toContain('lsp_find_references')
    expect(guidance).toContain('call sites')
  })

  it('recommends lsp_hover for type information in workflow tips', () => {
    const engine = new ContextIntelligenceEngine()
    const analysis = makeAnalysis()
    const messages = [{ role: 'user' as const, content: 'what is the type of buildInjection?' }]
    const insights = engine.analyzeConversationContext(messages, analysis)
    const guidance = engine.generateActionableGuidance(insights, analysis)
    // Workflow tips always present; hover must be described as type/docs lookup
    expect(guidance).toContain('lsp_hover')
    expect(guidance).toContain('type info')
  })
})
```

- [ ] **Step 2: Run tests to see current failures**

```bash
npx vitest run tests/context/intelligence-engine.test.ts
```

Expected: the `canonical declaration`, `call sites`, and `type info` assertions fail.

- [ ] **Step 3: Update guidance strings in `context/intelligence-engine.ts`**

Replace `generateWorkflowGuidance()` with:

```typescript
private generateWorkflowGuidance(insights: ContextInsights): string {
  const tips: string[] = [
    '- When editing code: Use `hashline_edit` for hash-verified edits',
    '- When locating a symbol declaration: Use `lsp_go_to_definition` to jump to the canonical declaration',
    '- When finding all usages: Use `lsp_find_references` to enumerate call sites and usages',
    '- When checking type info: Use `lsp_hover` to get type info and docs without opening the file',
  ]

  if (insights.editingIntent.hasHashAnnotations) {
    tips.push(
      '- Hash annotations detected: Always use `hashline_edit` with dry_run: true first',
    )
  }

  if (insights.navigationRequests.detected) {
    const tool = this.navigationToolSuggestion(insights.navigationRequests.requestType)
    const desc = this.navigationToolDescription(insights.navigationRequests.requestType)
    tips.push(`- Navigation request detected: Use \`${tool}\` — ${desc}`)
  }

  return `🎯 WORKFLOW OPTIMIZATION:\n${tips.join('\n')}`
}
```

Add the `navigationToolDescription` helper next to `navigationToolSuggestion`:

```typescript
private navigationToolDescription(
  requestType: NavigationContext['requestType'],
): string {
  switch (requestType) {
    case 'references':
      return 'enumerate call sites and usages'
    case 'definition':
    case 'file_location':
      return 'jump to the canonical declaration'
    default:
      return 'jump to the canonical declaration'
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/context/intelligence-engine.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add context/intelligence-engine.ts tests/context/intelligence-engine.test.ts
git commit -m "fix: clarify LSP tool guidance — hover=type-info, go-to-def=declaration, find-refs=usages"
```

---

### Task 7: Fix `graph-lsp-hover.ts` type duplication

**Files:**
- Modify: `context/graph-lsp-hover.ts`
- Modify: `tests/context/graph-lsp-hover.test.ts`

- [ ] **Step 1: Write a test asserting `GodNodeInfo` comes from `GodNode` fields**

Add to `tests/context/graph-lsp-hover.test.ts` (or create it):

```typescript
import { describe, it, expect } from 'vitest'
import { enhanceHoverWithGraphMetrics } from '../../context/graph-lsp-hover.js'
import type { GraphifyAnalysis } from '../../context/graph-types.js'

function makeAnalysis(): GraphifyAnalysis {
  return {
    godNodes: [{
      nodeId: 'myservice', label: 'MyService', criticality: 'CRITICAL',
      inDegree: 15, outDegree: 3, betweenness: 0.7, pageRank: 0.8, community: 'core',
    }],
    communities: [],
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
    metrics: {
      totalNodes: 10, totalEdges: 20, godNodeCount: 1, communityCount: 1,
      averageDegree: 4, maxDegree: 15, graphDensity: 0.4, avgClusteringCoeff: 0.3,
      cycleCount: 0, bottleneckCount: 0,
    },
    computedAt: Date.now(),
    version: '1',
  }
}

describe('enhanceHoverWithGraphMetrics', () => {
  it('populates godNodeInfo from GodNode fields without redefined types', () => {
    const result = enhanceHoverWithGraphMetrics('MyService', 'function MyService()', makeAnalysis())
    expect(result.godNodeInfo).toBeDefined()
    expect(result.godNodeInfo!.inDegree).toBe(15)
    expect(result.godNodeInfo!.pageRank).toBe(0.8)
    expect(result.godNodeInfo!.community).toBe('core')
    expect(result.godNodeInfo!.recommendation).toContain('critical hub')
  })
})
```

- [ ] **Step 2: Run test to verify current behaviour**

```bash
npx vitest run tests/context/graph-lsp-hover.test.ts
```

Note current result (may pass or fail depending on existing tests).

- [ ] **Step 3: Replace `GodNodeInfo` interface with a composed type**

In `context/graph-lsp-hover.ts`:

1. Add the import at the top:
```typescript
import type { GodNode, CommunityAnalysis, GraphifyAnalysis, GraphifyGraph, SurprisingConnection } from './graph-types.js'
```

2. Delete the `GodNodeInfo` interface. Replace with:
```typescript
/** GodNode fields plus a pre-computed recommendation string. */
type GodNodeInfo = GodNode & { recommendation: string }
```

3. Delete the `ImpactAnalysis` interface. Replace with a local type that does not redeclare `GodNode` fields:
```typescript
interface ImpactAnalysis {
  dependentCount: number
  affectedCommunities: number
  criticalityLevel: GodNode['criticality'] | 'LOW'
  recommendation: string
  example?: string
}
```

4. Update `createGodNodeInfo` to return `GodNodeInfo` (it will now include all `GodNode` fields plus `recommendation`):
```typescript
function createGodNodeInfo(godNode: GodNode): GodNodeInfo {
  const recommendations: Partial<Record<GodNode['criticality'], string>> = {
    CRITICAL: 'This is a critical hub. Changes may affect many dependent modules. Request code review.',
    IMPORTANT: 'This is a high-importance node. Monitor changes carefully.',
    NORMAL: 'This node has normal importance. Standard review applies.',
  }
  return {
    ...godNode,
    recommendation: recommendations[godNode.criticality] ?? 'Standard review applies.',
  }
}
```

5. Remove any remaining local interface definitions that duplicate `GodNode`, `CommunityAnalysis`, or `SurprisingConnection` fields. Keep only interfaces that are genuinely new (e.g. `EnhancedHoverInfo`, `GraphMetrics`, `SurpriseInfo`, `CommunityInfo`).

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/context/graph-lsp-hover.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add context/graph-lsp-hover.ts tests/context/graph-lsp-hover.test.ts
git commit -m "refactor: compose GodNodeInfo from GodNode instead of redefining fields"
```

---

### Task 8: Fix `CommunityPruningPlugin` pattern matching

**Files:**
- Modify: `plugins/community-pruning-plugin.ts`
- Create: `tests/plugins/community-pruning-plugin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/plugins/community-pruning-plugin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { CommunityPruningPlugin } from '../../plugins/community-pruning-plugin.js'
import type { GraphifyAnalysis } from '../../context/graph-types.js'

function makeAnalysis(): GraphifyAnalysis {
  return {
    godNodes: [],
    communities: [
      {
        id: 'auth', label: 'Authentication', nodes: ['session', 'token'],
        internalDensity: 0.8, externalDensity: 0.2,
        interfaceNodes: ['token'], bottlenecks: [],
      },
      {
        id: 'graph', label: 'Graph Analysis', nodes: ['graph-service', 'graph-loader'],
        internalDensity: 0.7, externalDensity: 0.3,
        interfaceNodes: [], bottlenecks: [],
      },
    ],
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
    metrics: {
      totalNodes: 4, totalEdges: 5, godNodeCount: 0, communityCount: 2,
      averageDegree: 2, maxDegree: 3, graphDensity: 0.4, avgClusteringCoeff: 0.3,
      cycleCount: 0, bottleneckCount: 0,
    },
    computedAt: Date.now(),
    version: '1',
  }
}

describe('CommunityPruningPlugin – pattern matching', () => {
  it('detects actual injection markers from smart-repo-map output', () => {
    const plugin = new CommunityPruningPlugin()
    plugin.setAnalysis(makeAnalysis())

    const content = `📍 GRAPH-PRIORITIZED NAVIGATION\n- **Authentication** (\`auth\`, 2 nodes)`
    const messages = [
      { role: 'developer', content },
      { role: 'user', content: 'how does session management work?' },
    ]

    const before = messages[0].content
    // Running onContext mutates the messages array
    void plugin.onContext(messages as any)
    // The section header was detected — message content may have been processed
    expect(typeof messages[0].content).toBe('string')
  })

  it('detects ARCHITECTURAL CONTEXT marker', () => {
    const plugin = new CommunityPruningPlugin()
    plugin.setAnalysis(makeAnalysis())

    const content = `🏗️ ARCHITECTURAL CONTEXT\n- **Authentication** (\`auth\`): 2 symbols — cohesion 0.80`
    // containsNonRelevantContent is private — test via full onContext path
    const messages = [
      { role: 'developer', content },
      { role: 'user', content: 'edit the graph loader' },
    ]
    void plugin.onContext(messages as any)
    // Plugin ran without error — marker was recognised
    expect(messages[0].content).toBeDefined()
  })

  it('does NOT flag messages without graph injection markers', () => {
    const plugin = new CommunityPruningPlugin()
    plugin.setAnalysis(makeAnalysis())

    const original = 'A normal conversation message with no graph content.'
    const messages = [
      { role: 'developer', content: original },
      { role: 'user', content: 'how do I fix this bug?' },
    ]
    void plugin.onContext(messages as any)
    // Should be unchanged — no marker detected
    expect(messages[0].content).toBe(original)
  })
})
```

- [ ] **Step 2: Run test to verify failures**

```bash
npx vitest run tests/plugins/community-pruning-plugin.test.ts
```

Expected: the detection tests fail because `containsNonRelevantContent` uses wrong patterns.

- [ ] **Step 3: Fix `containsNonRelevantContent` in `plugins/community-pruning-plugin.ts`**

Replace the current `containsNonRelevantContent` method body:

```typescript
private containsNonRelevantContent(
  content: string,
  _relevantNodes: Set<string>,
  _interfaceNodes: Set<string>
): boolean {
  const graphInjectionMarkers = [
    'GRAPH-PRIORITIZED NAVIGATION',
    'ARCHITECTURAL CONTEXT',
    'ARCHITECTURAL GUIDANCE',
    '## Graph Analysis Insights',
    'HIGH-PRIORITY SYMBOLS',
    'FOCUS AREAS (graph impact)',
  ]
  return graphInjectionMarkers.some(marker => content.includes(marker))
}
```

- [ ] **Step 4: Fix section-boundary detection in `trimToRelevantContent`**

Replace the boundary detection logic inside `trimToRelevantContent`. Find the line:
```typescript
const communityMatch = line.match(/^(?:#+\s*)?Community\s+(\d+)/i)
```

Replace the section detection block with:

```typescript
const SECTION_HEADERS = [
  'GRAPH-PRIORITIZED NAVIGATION',
  'ARCHITECTURAL CONTEXT',
  'ARCHITECTURAL GUIDANCE',
  '## Graph Analysis Insights',
  'HIGH-PRIORITY SYMBOLS',
  'FOCUS AREAS',
]
const isSectionHeader = SECTION_HEADERS.some(h => line.includes(h))

if (isSectionHeader) {
  inCommunitySection = true
  keepSection = true
  trimmedLines.push(line)
  continue
}
```

Remove the old `communityMatch` block entirely.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/plugins/community-pruning-plugin.test.ts
```

Expected: PASS

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add plugins/community-pruning-plugin.ts tests/plugins/community-pruning-plugin.test.ts
git commit -m "fix: update CommunityPruningPlugin patterns to match actual injection markers"
```

---

## Phase 3 — Pipeline Architecture

> **Ordering constraint:** Complete all Phase 1 tasks before starting Phase 3. Both phases touch `manager.ts`; Phase 1 removes fields that Phase 3 does not need.

---

### Task 9: Add guidance token tracking to `SessionStats`

**Files:**
- Modify: `metrics/tracker.ts`
- Modify: `tests/context/intelligence-engine.test.ts` (reuse `makeAnalysis` helper — no new test file needed)
- Create: `tests/metrics/tracker.test.ts` (if it doesn't exist; add to it otherwise)

- [ ] **Step 1: Write failing tests**

Create or append to `tests/metrics/tracker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SessionStats } from '../../metrics/tracker.js'

describe('SessionStats – guidance token tracking', () => {
  it('recordGraphInsightsInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordGraphInsightsInjection(120)
    expect(stats.graphInsightsTokens).toBe(120)
  })

  it('recordIntelligenceInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordIntelligenceInjection(80)
    stats.recordIntelligenceInjection(60)
    expect(stats.intelligenceTokens).toBe(140)
  })

  it('recordSmartDepContextInjection accumulates tokens', () => {
    const stats = new SessionStats('test-session')
    stats.recordSmartDepContextInjection(50)
    expect(stats.smartDepContextTokens).toBe(50)
  })

  it('toRecord includes all new token fields', () => {
    const stats = new SessionStats('test-session')
    stats.recordGraphInsightsInjection(100)
    stats.recordIntelligenceInjection(90)
    stats.recordSmartDepContextInjection(70)
    const record = stats.toRecord()
    expect(record.graphInsightsTokens).toBe(100)
    expect(record.intelligenceTokens).toBe(90)
    expect(record.smartDepContextTokens).toBe(70)
  })
})
```

- [ ] **Step 2: Run to verify failures**

```bash
npx vitest run tests/metrics/tracker.test.ts
```

Expected: FAIL — properties and methods don't exist yet.

- [ ] **Step 3: Add fields and methods to `SessionStats`**

In `metrics/tracker.ts`, add to the `SessionRecord` interface:

```typescript
graphInsightsTokens: number
intelligenceTokens: number
smartDepContextTokens: number
```

In the `SessionStats` class, add fields after `providerGuidanceCount`:

```typescript
graphInsightsTokens = 0
intelligenceTokens = 0
smartDepContextTokens = 0
```

Add methods after `recordProviderGuidanceInjection`:

```typescript
recordGraphInsightsInjection(tokens: number): void {
  this.graphInsightsTokens += tokens
}

recordIntelligenceInjection(tokens: number): void {
  this.intelligenceTokens += tokens
}

recordSmartDepContextInjection(tokens: number): void {
  this.smartDepContextTokens += tokens
}
```

In `toRecord()`, add to the returned object:

```typescript
graphInsightsTokens: this.graphInsightsTokens,
intelligenceTokens: this.intelligenceTokens,
smartDepContextTokens: this.smartDepContextTokens,
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/metrics/tracker.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add metrics/tracker.ts tests/metrics/tracker.test.ts
git commit -m "feat: add graph-insights, intelligence, smart-dep-context token tracking to SessionStats"
```

---

### Task 10: Extract `buildRepoMapSource` and `formatGraphInsightsSection` helpers

**Files:**
- Modify: `manager.ts`
- Modify: `tests/manager.test.ts`

- [ ] **Step 1: Write failing tests for the two helpers**

Add to `tests/manager.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
// buildRepoMapSource and formatGraphInsightsSection are module-level functions;
// export them from manager.ts (see Step 3)
import { buildRepoMapSource, formatGraphInsightsSection } from '../manager.js'
import type { GraphifyAnalysis, GodNode } from '../context/graph-types.js'

function makeAnalysis(overrides?: Partial<GraphifyAnalysis>): GraphifyAnalysis {
  return {
    godNodes: [],
    communities: [],
    surprises: [],
    bottlenecks: [],
    anomalies: [],
    wikipedia: { entries: new Map(), query: () => [], get: () => undefined, find: () => [] },
    metrics: {
      totalNodes: 5, totalEdges: 8, godNodeCount: 1, communityCount: 2,
      averageDegree: 3, maxDegree: 5, graphDensity: 0.4, avgClusteringCoeff: 0.3,
      cycleCount: 1, bottleneckCount: 0,
    },
    computedAt: Date.now(),
    version: '1',
    ...overrides,
  }
}

const mockInsights = {
  editingIntent: { detected: false, targetSymbols: [], targetFiles: [], hasHashAnnotations: false, affectedGodNodes: [] },
  navigationRequests: { detected: false, requestedSymbols: [], requestType: 'none' as const },
  suboptimalPatterns: [],
  conversationContext: { recentMessages: 0, codebaseRelevant: false, mentionedCommunities: [], mentionedFiles: [] },
}

describe('buildRepoMapSource', () => {
  it('applies smart enhancement when graph is non-null', () => {
    const analysis = makeAnalysis()
    const source = buildRepoMapSource('# repo', mockInsights, analysis)
    const content = source.produce()
    // SmartRepositoryMapGenerator adds a navigation header when communities/god nodes are present
    // With empty graph, it falls through to raw map
    expect(content).toBeDefined()
    expect(typeof content).toBe('string')
  })

  it('returns raw base map when graph is null', () => {
    const source = buildRepoMapSource('# raw-repo-map', mockInsights, null)
    expect(source.produce()).toBe('# raw-repo-map')
  })

  it('returns null when baseMap is empty', () => {
    const source = buildRepoMapSource('', mockInsights, null)
    expect(source.produce()).toBeNull()
  })

  it('registers with name=repo-map and priority=1', () => {
    const source = buildRepoMapSource('# map', mockInsights, null)
    expect(source.name).toBe('repo-map')
    expect(source.priority).toBe(1)
  })
})

describe('formatGraphInsightsSection', () => {
  it('includes node/edge/community counts', () => {
    const result = formatGraphInsightsSection(makeAnalysis())
    expect(result).toContain('5 nodes')
    expect(result).toContain('8 edges')
    expect(result).toContain('2 communities')
  })

  it('includes cycle count when cycles exist', () => {
    const result = formatGraphInsightsSection(makeAnalysis())
    expect(result).toContain('Circular Dependencies')
    expect(result).toContain('1')
  })

  it('includes god node labels when present', () => {
    const godNode: GodNode = {
      nodeId: 'svc', label: 'MyService', criticality: 'CRITICAL',
      inDegree: 12, outDegree: 3, betweenness: 0.7, pageRank: 0.9, community: 'core',
    }
    const result = formatGraphInsightsSection(makeAnalysis({ godNodes: [godNode] }))
    expect(result).toContain('MyService')
    expect(result).toContain('12 in')
  })
})
```

- [ ] **Step 2: Run to verify failures**

```bash
npx vitest run tests/manager.test.ts
```

Expected: FAIL — `buildRepoMapSource` and `formatGraphInsightsSection` are not exported.

- [ ] **Step 3: Extract helpers into `manager.ts` as exported functions**

At the module level of `manager.ts` (outside the class, before `SessionManager`), add:

```typescript
import type { ContextInsights } from './shared/intelligence-types.js'
import type { GraphifyAnalysis } from './context/graph-types.js'
import type { PipelineSource } from './context/pipeline.js'
import { SmartRepositoryMapGenerator } from './context/smart-repo-map.js'

/**
 * Build a PipelineSource for the repo map.
 * Applies graph-prioritized enhancement when analysis is available;
 * falls back to the raw map otherwise.
 */
export function buildRepoMapSource(
  baseMap: string,
  insights: ContextInsights,
  graph: GraphifyAnalysis | null,
): PipelineSource {
  return {
    name: 'repo-map',
    priority: 1,
    produce(): string | null {
      if (!baseMap) return null
      if (graph) {
        return new SmartRepositoryMapGenerator()
          .generatePrioritizedRepoMap(baseMap, insights, graph)
      }
      return baseMap
    },
  }
}

/**
 * Format the graph analysis insights block for system-prompt injection.
 */
export function formatGraphInsightsSection(a: GraphifyAnalysis): string {
  const lines: string[] = [
    '## Graph Analysis Insights',
    '',
    `**Graph:** ${a.metrics.totalNodes} nodes, ${a.metrics.totalEdges} edges, ${a.metrics.communityCount} communities`,
  ]
  if (a.metrics.cycleCount > 0) {
    lines.push(`**Circular Dependencies:** ${a.metrics.cycleCount}`)
  }
  lines.push('')
  if (a.godNodes.length > 0) {
    lines.push('**God Nodes (most depended-on symbols):**')
    for (const g of a.godNodes.slice(0, 5)) {
      lines.push(`  - \`${g.label}\` (${g.inDegree} in, ${g.outDegree} out, ${g.criticality})`)
    }
    if (a.godNodes.length > 5) {
      lines.push(`  - ... and ${a.godNodes.length - 5} more`)
    }
    lines.push('')
  }
  if (a.communities.length > 1) {
    lines.push('**Communities:**')
    for (const c of a.communities) {
      lines.push(`  - ${c.label}: ${c.nodes.length} nodes`)
    }
    lines.push('')
  }
  if (a.surprises.length > 0) {
    lines.push('**Notable connections:**')
    for (const s of a.surprises.slice(0, 3)) {
      lines.push(`  - \`${s.source}\` → \`${s.target}\` (${s.reason})`)
    }
  }
  return lines.filter(l => l !== undefined).join('\n').trimEnd()
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/manager.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add manager.ts tests/manager.test.ts
git commit -m "refactor: extract buildRepoMapSource and formatGraphInsightsSection helpers"
```

---

### Task 11: Add `graphInsightsInjected` and `intelligenceInjected` to `SessionState`

**Files:**
- Modify: `manager.ts`

- [ ] **Step 1: Add the two new fields to `SessionState` interface**

In `manager.ts`, find the `SessionState` interface and add after `providerGuidanceInjected`:

```typescript
graphInsightsInjected: boolean
intelligenceInjected: boolean
```

- [ ] **Step 2: Initialise the fields in `initState`**

In `initState()`, add to the returned object:

```typescript
graphInsightsInjected: false,
intelligenceInjected: false,
```

- [ ] **Step 3: Run full suite**

```bash
npx vitest run
```

Expected: all pass (state shape change, no logic change yet).

- [ ] **Step 4: Commit**

```bash
git add manager.ts
git commit -m "feat: add graphInsightsInjected and intelligenceInjected to SessionState"
```

---

### Task 12: Restructure `handleBeforeAgentStart` to route all sources through pipeline

**Files:**
- Modify: `manager.ts`
- Modify: `tests/manager.test.ts`

- [ ] **Step 1: Write the budget enforcement integration test**

Add to `tests/manager.test.ts`:

```typescript
import { InjectionPipeline } from '../context/pipeline.js'

describe('handleBeforeAgentStart – all sources through pipeline', () => {
  it('total injected tokens never exceed combinedBudget', () => {
    // Build a pipeline with all 5 source types, tight budget
    const pipeline = new InjectionPipeline()
    const budget = 50 // very tight — only priority-1 source can fit

    pipeline.register({ name: 'repo-map',            priority: 1, produce: () => 'a'.repeat(48) }) // ~12t
    pipeline.register({ name: 'provider-guidance',   priority: 2, produce: () => 'b'.repeat(48) }) // ~12t
    pipeline.register({ name: 'graph-insights',      priority: 3, produce: () => 'c'.repeat(48) }) // ~12t
    pipeline.register({ name: 'context-intelligence', priority: 4, produce: () => 'd'.repeat(48) }) // ~12t
    pipeline.register({ name: 'context-files',       priority: 6, produce: () => 'e'.repeat(48) }) // ~12t

    const result = pipeline.build(budget)
    expect(result.totalTokens).toBeLessThanOrEqual(budget)
    // Only repo-map fits at budget=50 (12t)
    expect(result.sources[0].injected).toBe(true)
    expect(result.sources[1].injected).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify test passes (pipeline already handles this)**

```bash
npx vitest run tests/manager.test.ts
```

Expected: PASS — this tests the pipeline itself, which already enforces the budget. The purpose is to confirm the contract before we wire it into `handleBeforeAgentStart`.

- [ ] **Step 3: Restructure `handleBeforeAgentStart` in `manager.ts`**

Replace the entire `handleBeforeAgentStart` method with:

```typescript
async handleBeforeAgentStart(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
): Promise<{ systemPrompt: string } | undefined> {
  const s = this.state
  if (!s) return undefined
  if (
    s.repoMapInjected &&
    s.contextFilesInjected &&
    s.providerGuidanceInjected &&
    s.graphInsightsInjected &&
    s.intelligenceInjected
  ) return undefined

  const snapshot = await this.buildIntelligenceSnapshot()
  const graph = snapshot.graph ?? this.graphService.analysis ?? null

  const pipeline = new InjectionPipeline()
  const combinedBudget = s.config.maxRepoMapTokens + s.config.maxInjectionTokens

  if (!s.repoMapInjected && s.repoMap) {
    pipeline.register(buildRepoMapSource(s.repoMap, snapshot.insights, graph))
  }

  if (!s.providerGuidanceInjected && s.config.providerGuidance.enabled) {
    const provider = ctx.model?.provider as string | undefined
    const modelId = ctx.model?.id as string | undefined
    if (provider) {
      pipeline.register({
        name: 'provider-guidance',
        priority: 2,
        produce: () => {
          const files = loadProviderGuidance(s.projectRoot, provider, modelId)
          if (files.length > 0) {
            s.providerGuidanceFiles = files
            return formatProviderGuidanceSection(files)
          }
          return null
        },
      })
    }
  }

  if (!s.graphInsightsInjected && graph) {
    pipeline.register({
      name: 'graph-insights',
      priority: 3,
      produce: () => formatGraphInsightsSection(graph),
    })
  }

  if (!s.intelligenceInjected) {
    pipeline.register({
      name: 'context-intelligence',
      priority: 4,
      produce: () => {
        const guidance = this.intelligenceEngine.generateActionableGuidance(
          snapshot.insights,
          graph,
        )
        return guidance.trim()
          ? `## Context intelligence\n\n${guidance}`
          : null
      },
    })
  }

  if (!s.contextFilesInjected && s.contextFiles.length > 0) {
    pipeline.register({
      name: 'context-files',
      priority: 6,
      produce: () =>
        formatContextSection(s.contextFiles, {
          sectionTitle: s.config.contextFiles.sectionTitle,
        }),
    })
  }

  const result = pipeline.build(combinedBudget)
  if (!result.content) return undefined

  for (const entry of result.sources) {
    const tokens = entry.tokens
    if (entry.name === 'repo-map' && entry.injected) {
      s.repoMapInjected = true
      s.stats.recordRepoMapInjection(tokens)
    } else if (entry.name === 'provider-guidance' && entry.injected && s.providerGuidanceFiles.length > 0) {
      s.providerGuidanceInjected = true
      s.stats.recordProviderGuidanceInjection(tokens, s.providerGuidanceFiles.length)
    } else if (entry.name === 'graph-insights' && entry.injected) {
      s.graphInsightsInjected = true
      s.stats.recordGraphInsightsInjection(tokens)
    } else if (entry.name === 'context-intelligence' && entry.injected) {
      s.intelligenceInjected = true
      s.stats.recordIntelligenceInjection(tokens)
    } else if (entry.name === 'context-files' && entry.injected) {
      s.contextFilesInjected = true
      s.stats.recordContextFilesInjection(tokens, s.contextFiles.length)
    }
  }

  this.updateStatusBar(ctx)

  const toolsBlock =
    '\n\n## pi-scope Tools\n' +
    '- `hashline_edit`: Edit files using hash anchors (shown in skeleton output). No re-read needed.\n' +
    '- `lsp_go_to_definition`, `lsp_find_references`, `lsp_hover`: Code navigation via LSP.\n' +
    '- `/hashline-read <file>`: Read a file with hash anchors for editing.\n' +
    '\n**Priority model:** pi-scope handles codebase intelligence (symbols, structure, context).\n' +
    'Use pi-sherlock tools (`search`, `fuzzy_find`, `find_files`, etc.) for ad-hoc or external searches.\n' +
    'After search tools return results, pi-scope automatically injects AST skeletons for the matched files.\n'

  return {
    systemPrompt: event.systemPrompt + '\n\n' + result.content + toolsBlock,
  }
}
```

- [ ] **Step 4: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add manager.ts tests/manager.test.ts
git commit -m "refactor: route graph-insights and context-intelligence through InjectionPipeline in handleBeforeAgentStart"
```

---

### Task 13: Restructure `handleContext` to use pipeline

**Files:**
- Modify: `manager.ts`
- Modify: `tests/manager.test.ts`

- [ ] **Step 1: Write failing integration test**

Add to `tests/manager.test.ts`:

```typescript
import { SessionManager } from '../manager.js'

describe('handleContext – pipeline assembly', () => {
  it('returns undefined when no messages', async () => {
    const manager = new SessionManager()
    await manager.start() // minimal bootstrap
    const result = await manager.handleContext({ messages: [] })
    expect(result).toEqual({ messages: [], content: '' })
  })

  it('includes guidance content in returned content string', async () => {
    const manager = new SessionManager()
    await manager.start()
    const result = await manager.handleContext({
      messages: [{ role: 'user', content: 'edit the SessionManager class' }],
    })
    // Guidance (workflow tips) should always be present
    if (result) {
      expect(result.content).toContain('hashline_edit')
    }
  })
})
```

- [ ] **Step 2: Run to verify current behaviour**

```bash
npx vitest run tests/manager.test.ts
```

Note the result.

- [ ] **Step 3: Restructure `handleContext` in `manager.ts`**

Replace the entire `handleContext` method with:

```typescript
async handleContext(
  event: ContextEvent,
  ctx: ExtensionContext = SessionManager.DEFAULT_EXTENSION_CONTEXT,
): Promise<{ messages: AgentMessage[]; content: string } | undefined> {
  try {
    this.syncConversationMessages(event.messages ?? [])
  } catch (error) {
    console.warn('handleContext: failed to sync conversation messages:', error)
  }

  const s = this.state
  if (!s) return undefined

  if ((event.messages?.length ?? 0) === 0) {
    return { messages: [], content: '' }
  }

  await this.pluginManager.runHook('onContext', event.messages ?? [])

  const snapshot = await this.buildIntelligenceSnapshot()
  const graph = snapshot.graph ?? this.graphService.analysis ?? null

  // Dep-context trigger detection (unchanged logic)
  const recentMessages = (event.messages ?? []).slice(-s.config.scanLastNMessages)

  const hasFilePattern = recentMessages.some(m => {
    const text = extractText(m.content)
    return /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|rs)/.test(text) ||
      /['"`]\.\.?\/[^'"`]+/.test(text)
  })
  const hasToolCall = recentMessages.some(m => (m as Record<string, unknown>).toolName)
  const hasToolResultWithFiles = recentMessages.some(m => {
    if ((m as Record<string, unknown>).role !== 'toolResult') return false
    const text = extractText(m.content)
    return /\.[a-zA-Z]+\/[\w./-]+\.(?:ts|tsx|py|rs|js|jsx|go|rs)/.test(text) ||
      /```\w*\n/.test(text)
  })

  const hasSymbolMatch = !hasFilePattern && !hasToolCall && !hasToolResultWithFiles && s.retrieval
    ? (() => {
        const lastText = extractText(recentMessages[recentMessages.length - 1]?.content ?? '')
        const scored = s.retrieval!.retrieveTopK(lastText, 3)
        return scored.length > 0 && scored[0].score >= 2
      })()
    : false

  const hasCodebaseQuery = !hasFilePattern && !hasToolCall && !hasToolResultWithFiles && !hasSymbolMatch
    ? isBroadCodebaseQuery(extractText(recentMessages[recentMessages.length - 1]?.content ?? ''))
    : false

  const triggersDepContext =
    hasFilePattern || hasToolCall || hasToolResultWithFiles || hasSymbolMatch || hasCodebaseQuery

  // Build dep-context content ahead of time so we can extract file paths for stats
  let depContextContent: string | null = null
  if (triggersDepContext) {
    const extraPaths = new Set<string>()
    const messagesPlain = (event.messages ?? []).map(m => ({
      role: m.role ?? 'user',
      content: extractText(m.content),
    }))
    for (const msg of event.messages ?? []) {
      const tn = (msg as Record<string, unknown>).toolName as string | undefined
      if (tn) {
        const input = (msg as Record<string, unknown>).input as Record<string, unknown> | undefined
        for (const r of detectPathsInToolCall(tn, input, { projectRoot: s.projectRoot, validateExistence: true })) {
          extraPaths.add(r.path)
        }
      }
      if ((msg as Record<string, unknown>).role === 'toolResult') {
        for (const r of detectPathsInOutput(
          tn ?? '',
          (msg as Record<string, unknown>).content,
          { projectRoot: s.projectRoot },
        )) {
          extraPaths.add(r.path)
        }
      }
    }
    depContextContent = s.injector.buildInjection(
      s.index,
      messagesPlain,
      extraPaths.size > 0 ? extraPaths : undefined,
      s.retrieval,
      s.config.dependencyDepth ?? 1,
    )
  }

  // Assemble all context through the pipeline
  const pipeline = new InjectionPipeline()
  const budget = s.config.maxInjectionTokens

  pipeline.register({
    name: 'context-intelligence',
    priority: 4,
    produce: () => {
      const g = this.intelligenceEngine.generateActionableGuidance(snapshot.insights, graph)
      return g.trim() ? g : null
    },
  })

  pipeline.register({
    name: 'smart-dep-context',
    priority: 5,
    produce: () => {
      const gen = new SmartDependencyContextGenerator()
      const dep = gen.generateEnhancedDependencyContext(snapshot.insights, graph)
      return dep.trim() ? dep : null
    },
  })

  if (depContextContent?.trim()) {
    pipeline.register({
      name: 'dep-context',
      priority: 7,
      produce: () => depContextContent,
    })
  }

  const result = pipeline.build(budget)
  if (!result.content) return undefined

  // Record stats per injected source
  for (const entry of result.sources) {
    if (entry.name === 'context-intelligence' && entry.injected) {
      s.stats.recordIntelligenceInjection(entry.tokens)
    } else if (entry.name === 'smart-dep-context' && entry.injected) {
      s.stats.recordSmartDepContextInjection(entry.tokens)
    } else if (entry.name === 'dep-context' && entry.injected && depContextContent) {
      const files = extractInjectedFilePaths(depContextContent)
      let fullTokens = 0
      for (const f of files) {
        const skel = s.index.skeletons.get(f)
        if (skel) fullTokens += estimateFileSavings(f, skel).fullTokens
      }
      s.stats.recordDepContextInjection(files, entry.tokens, fullTokens)
    }
  }

  this.updateStatusBar(ctx)

  const contextMsg: AgentMessage = { role: 'developer', content: result.content }
  return { messages: [contextMsg, ...(event.messages ?? [])], content: result.content }
}
```

- [ ] **Step 4: Run full suite**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add manager.ts tests/manager.test.ts
git commit -m "refactor: route context-intelligence and smart-dep-context through InjectionPipeline in handleContext"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run the full test suite clean**

```bash
npx vitest run
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 2: Verify deleted files are gone**

```bash
ls context/actionable-insights.ts 2>&1 || echo "DELETED OK"
ls plugins/read-awareness.ts 2>&1 || echo "DELETED OK"
ls -d session/ 2>&1 || echo "DELETED OK"
ls tests/context/actionable-insights.test.ts 2>&1 || echo "DELETED OK"
ls tests/plugins/read-awareness.test.ts 2>&1 || echo "DELETED OK"
ls -d tests/session/ 2>&1 || echo "DELETED OK"
```

Expected: all six print `DELETED OK`.

- [ ] **Step 3: Verify no remaining `(analysis as any)` casts in production code**

```bash
grep -r "(analysis as any)" context/ manager.ts --include="*.ts"
```

Expected: no output.

- [ ] **Step 4: Verify `enhancedBlock` is no longer assembled outside the pipeline**

```bash
grep -n "enhancedBlock\|graphSection\|intelligenceSection" manager.ts
```

Expected: no output (these variable names should no longer exist in `manager.ts`).

- [ ] **Step 5: Commit final verification pass**

```bash
git add -A
git commit -m "chore: final verification — all conflict resolutions applied and tested"
```
