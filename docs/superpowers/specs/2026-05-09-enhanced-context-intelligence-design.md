# Enhanced Context Intelligence System Design

**Date:** 2026-05-09  
**Project:** pi-scope Enhanced Context Intelligence  
**Goal:** Force agents to consistently leverage pi-scope features through actionable, intelligence-driven context injection

## Executive Summary

Transform pi-scope from providing passive information to delivering actionable intelligence that naturally guides agents toward optimal behaviors. Replace static summaries with dynamic, contextual guidance that makes it impossible for agents to ignore pi-scope's powerful capabilities.

## Problem Statement

### Current Issues

**Tool Usage Inconsistency:**
- Agents sometimes use `hashline_edit`, sometimes revert to `StrReplace` 
- Agents ask users for file locations instead of using `lsp_go_to_definition`
- Agents request specific file paths instead of leveraging intelligent retrieval

**Context Awareness Gap:**
- Agents acknowledge god nodes/communities but don't change behavior accordingly
- Miss refactoring prioritization opportunities (should start with god nodes)
- Ignore risk assessment (CRITICAL god node changes need careful handling)
- Don't respect community boundaries when suggesting architecture changes
- Skip impact analysis when proposing changes

### Root Cause

pi-scope provides **passive information** rather than **actionable guidance**. Current context is informational but not directive.

## Solution Architecture

### Core Philosophy
**From Informational → Actionable**

Instead of:
```
God Nodes: Client (26 connections), AsyncClient (25 connections)
```

Provide:
```
⚠️ HIGH-IMPACT SYMBOLS (edit carefully):
- `Client` (26 dependencies) - Changes affect 6 communities
💡 RECOMMENDED: Use `lsp_find_references` before editing
```

### System Components

#### 1. Context Intelligence Engine
**Location:** `context/intelligence-engine.ts`

```typescript
export class ContextIntelligenceEngine {
  analyzeConversationContext(messages: AgentMessage[]): ContextInsights
  generateActionableGuidance(insights: ContextInsights, graphData: GraphAnalysis): EnhancedContext
  detectSuboptimalPatterns(messages: AgentMessage[]): OptimizationSuggestions
}
```

**Responsibilities:**
- Monitor conversation history for agent behaviors
- Detect when agents are about to make suboptimal choices  
- Generate contextual tool recommendations
- Inject preventive guidance before mistakes happen

#### 2. Enhanced Context Generators

**Actionable Insights Generator** (`context/actionable-insights.ts`):
```typescript
export class ActionableInsightsGenerator {
  generateWorkflowGuidance(): string
  generateRiskWarnings(godNodes: GodNode[]): string
  generateArchitecturalGuidance(communities: Community[]): string
}
```

**Smart Dependency Context Generator** (`context/smart-dep-context.ts`):
```typescript
export class SmartDepContextGenerator {
  enhanceWithToolHints(depContext: string, conversationContext: ContextInsights): string
  addImpactWarnings(files: FileInfo[], graphData: GraphAnalysis): string
}
```

#### 3. Pattern Detection System
**Location:** `context/pattern-detector.ts`

```typescript
export class AgentPatternDetector {
  detectEditingIntent(messages: AgentMessage[]): EditingContext
  detectNavigationRequests(messages: AgentMessage[]): NavigationContext  
  detectSuboptimalToolUsage(messages: AgentMessage[]): ToolUsageIssues
}
```

**Detection Patterns:**
- Agent mentions editing → suggest `hashline_edit` if hash-annotated content available
- Agent asks "where is X function" → suggest `lsp_go_to_definition`
- Agent mentions god node → inject impact analysis warning
- Agent proposes architecture change → check community boundaries

## Enhanced Context Layers

### Layer 1: Actionable Graph Insights

**Current:**
```xml
<graph-insights>
Graph: 144 nodes, 330 edges, 6 communities
God Nodes: Client (26 connections), AsyncClient (25 connections)
</graph-insights>
```

**Enhanced:**
```xml
<actionable-insights>
🎯 WORKFLOW OPTIMIZATION:
- When editing code: Use `hashline_edit` tool for hash-verified edits
- When finding symbols: Use `lsp_go_to_definition` instead of asking for file paths
- When exploring code: Use `lsp_find_references` to see usage patterns

⚠️ HIGH-IMPACT SYMBOLS (edit carefully):
- `Client` (26 dependencies) - Changes affect 6 communities
- `AsyncClient` (25 dependencies) - Core transport infrastructure
- `Response` (24 dependencies) - Used across all API layers

🏗️ ARCHITECTURAL GUIDANCE:
- Auth & Security (9 files): Self-contained - safe to refactor
- Transport Layer (8 files): Core infrastructure - test thoroughly
- Client API (3 files): Public interface - breaking changes need versioning

💡 CURRENT CONTEXT SUGGESTIONS:
Based on recent messages about "editing authenticate function":
1. Use `lsp_go_to_definition` to locate authenticate function
2. Use `hashline_edit` for editing (avoids re-reading)  
3. Check impact with `lsp_find_references` before major changes
</actionable-insights>
```

### Layer 2: Enhanced Dependency Context

**Current:**
```xml
<dep-context>
## Active files
### src/auth.ts
export function authenticate(token: string): User { ... }
</dep-context>
```

**Enhanced:**
```xml
<enhanced-dep-context>
## 🎯 RECOMMENDED TOOLS FOR THIS CONTEXT
Based on conversation analysis:
- File has hashline annotations → Use `hashline_edit` for editing
- Contains god node symbols → Check impact before changes
- Part of Auth community → Respect community boundaries

## Active files (with guidance)
### src/auth.ts ⚡ hashline-ready 🏗️ auth-community
export function authenticate(token: string): User { ... }
💡 This function is a god node (15 references) - use `lsp_find_references` first
⚡ File supports hashline editing - use dry_run: true to preview

## Direct dependencies  
### src/auth/models.ts 🔍 god-node-adjacent
export interface User { ... }
⚠️ User interface used across 6 communities - changes have wide impact
</enhanced-dep-context>
```

### Layer 3: Smart Repository Map

**Enhanced to prioritize by graph importance:**
```xml
<smart-repo-map>
🏗️ PROJECT ARCHITECTURE (god-nodes highlighted)

src/
├── 🔥 client/ (CRITICAL - core infrastructure)
│   ├── Client.ts ⭐ (26 deps) - Main API client
│   └── AsyncClient.ts ⭐ (25 deps) - Async operations
├── auth/ (Auth & Security community)  
│   ├── authenticate.ts 🔍 (15 deps)
│   └── models.ts
└── transport/ (Transport Layer community)
    └── Response.ts ⭐ (24 deps) - Response handling

💡 NAVIGATION TIPS:
- ⭐ = God nodes (high impact, edit carefully)
- 🔥 = Critical directories
- 🔍 = Important symbols
- Use `lsp_go_to_definition` instead of browsing manually
</smart-repo-map>
```

## Implementation Strategy

### Phase 1: Foundation (Week 1)
**Goal:** Core intelligence engine + basic pattern detection

**Components:**
1. `ContextIntelligenceEngine` with conversation analysis
2. `AgentPatternDetector` for basic patterns (editing, navigation)
3. Enhanced `SessionManager` integration

**Deliverables:**
- Basic pattern detection working
- Conversation history analysis
- Foundation for enhanced context generation

### Phase 2: Enhanced Contexts (Week 2)  
**Goal:** Transform all context layers to be actionable

**Components:**
1. `ActionableInsightsGenerator` replacing static graph insights
2. `SmartDepContextGenerator` with tool hints and warnings
3. Enhanced repository map with prioritization

**Deliverables:**
- All context injection layers enhanced
- Dynamic tool recommendations
- Graph-aware guidance system

### Phase 3: Dynamic Guidance (Week 3)
**Goal:** Real-time suggestions and conversation awareness

**Components:**
1. Real-time pattern detection during conversation
2. Context-aware tool suggestions
3. Preventive guidance injection

**Deliverables:**
- Proactive guidance system
- Context-sensitive recommendations
- Just-in-time tool suggestions

### Phase 4: Learning & Optimization (Week 4)
**Goal:** Performance optimization and effectiveness metrics

**Components:**
1. Effectiveness tracking (did agents follow suggestions?)
2. Pattern optimization (which patterns work best?)
3. Performance tuning

**Deliverables:**
- Metrics dashboard for guidance effectiveness
- Optimized pattern detection
- Performance benchmarks

## Graph Implementation Improvements

### File Renaming Completed ✅
- All `graphify-*` files renamed to `graph-*` prefix
- Import statements updated across entire codebase
- Test files relocated and updated
- Backward compatibility maintained for external graph files

### Native TypeScript Implementation ✅
**Confirmed:** Graph analysis is already fully TypeScript-native:
- No Python dependencies for graph algorithms
- All 5 algorithms in pure TypeScript: Centrality, PageRank, Louvain, Cycle Detection, Surprise Detection
- Native analysis via `analyzeFromIndex()` works without external tools
- Only subprocess usage is legitimate (LSP servers, git metadata)

### Enhanced Graph Integration
**Path Updates:**
- Primary: `graph-out/graph.json` 
- Fallback: `graphify-out/graph.json` (backward compatibility)
- Full native operation when no external graph available

## Integration Points

### SessionManager Modifications
```typescript
// Enhanced: manager.ts
async handleBeforeAgentStart(event: BeforeAgentStartEvent, ctx: ExtensionContext) {
  // NEW: Analyze conversation context
  const insights = this.intelligenceEngine.analyzeConversationContext(event.messages)
  
  // NEW: Generate actionable guidance
  const enhancedContext = this.intelligenceEngine.generateActionableGuidance(
    insights, 
    this.graphService.analysis
  )
  
  // Enhanced context injection
  return this.contextPipeline.injectEnhanced(enhancedContext)
}
```

### Context Pipeline Enhancement
```typescript
// Enhanced: context/pipeline.ts
export class InjectionPipeline {
  async buildEnhancedContext(insights: ContextInsights): Promise<string> {
    const layers = []
    
    // Layer 1: Actionable insights (not passive graph info)
    layers.push(this.actionableInsightsGenerator.generate(insights))
    
    // Layer 2: Smart dep context (with tool hints) 
    layers.push(this.smartDepContextGenerator.generate(insights))
    
    // Layer 3: Enhanced repo map (graph-prioritized)
    layers.push(this.smartRepoMapGenerator.generate(insights))
    
    return layers.join('\n\n')
  }
}
```

## Success Metrics

### Quantitative Metrics
- **Tool Usage Consistency:** % of times agents use pi-scope tools vs. basic operations
- **Context Utilization:** % of decisions that reference graph insights  
- **Guidance Effectiveness:** % of suggestions followed by agents
- **Error Reduction:** Decrease in suboptimal patterns detected

### Qualitative Indicators
- Agents proactively use `hashline_edit` when hash content available
- Agents reference god node status when assessing change risk
- Agents respect community boundaries in architectural suggestions  
- Agents use LSP tools instead of asking for file locations

### Target Improvements
- **90%+** consistent tool usage (up from current ~60%)
- **80%+** decisions reference graph context (up from current ~30%)
- **70%+** suggestions followed within same conversation
- **50%** reduction in suboptimal pattern detection

## Risk Analysis

### Technical Risks
- **Performance Impact:** Additional context analysis on every turn
  - **Mitigation:** Cache analysis results, optimize pattern detection
- **Context Bloat:** Enhanced context may exceed token budgets
  - **Mitigation:** Dynamic content based on relevance, configurable verbosity
  
### User Experience Risks  
- **Information Overload:** Too much guidance may overwhelm
  - **Mitigation:** Contextual relevance filtering, progressive disclosure
- **Agent Resistance:** Agents may ignore enhanced guidance
  - **Mitigation:** Make guidance natural/conversational, not directive

### Implementation Risks
- **Complexity Creep:** System becomes hard to maintain
  - **Mitigation:** Clear component boundaries, comprehensive testing
- **False Positives:** Wrong guidance due to pattern misdetection
  - **Mitigation:** Conservative detection, clear confidence indicators

## Testing Strategy

### Unit Tests
- Pattern detection accuracy
- Context generation correctness  
- Intelligence engine logic

### Integration Tests
- End-to-end enhanced context flow
- Graph integration with new components
- Conversation analysis accuracy

### User Acceptance Tests
- Agent behavior improvement measurement
- Tool usage consistency validation
- Context utilization effectiveness

## Conclusion

The Enhanced Context Intelligence System transforms pi-scope from a passive information provider to an active intelligence system that guides agents toward optimal behaviors. By making guidance actionable and contextual, we eliminate the gap between pi-scope's powerful capabilities and actual agent usage.

The fully TypeScript-native graph implementation provides the perfect foundation for this enhancement, enabling real-time intelligent guidance without external dependencies.

**Key Innovation:** Context that doesn't just inform, but actively guides toward better decisions.