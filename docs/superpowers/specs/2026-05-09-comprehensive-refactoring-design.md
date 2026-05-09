# Comprehensive Refactoring Design - Pi-Scope Codebase

**Date**: 2026-05-09  
**Scope**: Complete refactoring addressing DRY, SOLID, OOP principles and dead code elimination  
**Approach**: Incremental Domain-Driven Refactoring  
**Timeline**: 4-6 weeks with continuous delivery  

## Executive Summary

This document outlines a comprehensive refactoring of the pi-scope codebase to address:
- Code duplication and DRY violations (especially around high-connectivity nodes)
- SOLID principle violations in god nodes (`GraphifyAnalysis`, `SessionManager`)  
- 711 isolated nodes representing potential dead code
- Low-cohesion communities (0.04-0.05) requiring restructuring
- Architecture improvements for maintainability and extensibility

**Key Metrics from Graph Analysis**:
- 1,556 nodes, 2,508 edges, 89 communities
- God nodes: `join()` (28 edges), `GraphifyAnalysis` (27 edges), `SessionManager` (26 edges)
- 711 isolated nodes with ≤1 connection
- 7 communities with cohesion <0.05 needing restructuring

## Architecture Design

### Domain-Driven Structure

#### Current Issues
- Mixed concerns across modules
- God objects handling multiple responsibilities  
- Scattered business logic
- Tight coupling between layers

#### Solution: 5 Core Domains

```
pi-scope/
├── context/          # Context Domain
├── graph/           # Graph Domain  
├── indexing/        # Indexing Domain
├── session/         # Session Domain
├── analysis/        # Analysis Domain
├── shared/          # Cross-cutting concerns
└── infrastructure/  # External integrations
```

### 1. Context Domain (`context/`)

**Responsibility**: Context intelligence, dependency analysis, retrieval

**Current Problems**:
- `ContextIntelligenceEngine` (17 edges) doing too much
- Pipeline mixing injection logic with source management
- Duplicated context building patterns

**New Structure**:
```
context/
├── collectors/           # Data collection
│   ├── dependency-collector.ts
│   ├── file-collector.ts
│   └── symbol-collector.ts
├── analyzers/           # Context analysis
│   ├── context-analyzer.ts
│   ├── relevance-analyzer.ts
│   └── priority-analyzer.ts
├── generators/          # Context generation
│   ├── smart-dep-generator.ts
│   ├── repo-map-generator.ts
│   └── insights-generator.ts
├── pipeline/            # Orchestration
│   ├── context-pipeline.ts
│   ├── source-registry.ts
│   └── budget-manager.ts
└── interfaces/          # Abstractions
    ├── collector.interface.ts
    ├── analyzer.interface.ts
    └── generator.interface.ts
```

**Key Classes**:
- `ContextCollector` - Single responsibility for data collection
- `ContextAnalyzer` - Analysis logic only
- `ContextGenerator` - Generation logic only
- `SourceRegistry` - Extracted from pipeline for managing sources
- `BudgetManager` - Token budget management

### 2. Graph Domain (`graph/`)

**Responsibility**: Graph analysis, community detection, god nodes

**Current Problems**:
- `GraphifyAnalysis` (27 edges) handling analysis + caching + serialization
- Mixed graph data structures and algorithms
- Tight coupling between analysis types

**New Structure**:
```
graph/
├── analyzers/           # Analysis algorithms
│   ├── god-node-analyzer.ts
│   ├── community-analyzer.ts
│   ├── centrality-analyzer.ts
│   └── surprise-analyzer.ts
├── data/               # Graph data structures
│   ├── graph-node.ts
│   ├── graph-edge.ts
│   └── graph-structure.ts
├── cache/              # Caching layer
│   ├── graph-cache.ts
│   └── analysis-cache.ts
├── serialization/      # Persistence
│   ├── graph-serializer.ts
│   └── analysis-serializer.ts
└── interfaces/         # Abstractions
    ├── analyzer.interface.ts
    ├── cache.interface.ts
    └── serializer.interface.ts
```

**Key Classes**:
- `GraphAnalyzer` - Core analysis coordinator (SRP)
- `CommunityAnalyzer` - Community detection algorithms
- `GodNodeAnalyzer` - God node identification
- `GraphCache` - Separated caching concerns
- `AnalysisResult` - Immutable analysis data

### 3. Indexing Domain (`indexing/`)

**Responsibility**: File indexing, caching, metadata

**Current Problems**:
- Scattered indexing logic across multiple services
- Mixed indexing and storage concerns
- Inconsistent caching strategies

**New Structure**:
```
indexing/
├── engines/            # Indexing engines
│   ├── file-indexer.ts
│   ├── symbol-indexer.ts
│   └── dependency-indexer.ts
├── storage/            # Storage abstractions
│   ├── index-storage.ts
│   ├── cache-storage.ts
│   └── metadata-storage.ts
├── metadata/           # Metadata management
│   ├── metadata-extractor.ts
│   └── metadata-validator.ts
└── interfaces/         # Abstractions
    ├── indexer.interface.ts
    └── storage.interface.ts
```

**Key Classes**:
- `IndexingEngine` - Coordinates all indexing operations
- `FileIndexer` - Handles file-level indexing
- `IndexStorage` - Abstract storage layer
- `MetadataExtractor` - Extracts file metadata

### 4. Session Domain (`session/`)

**Responsibility**: Session management, orchestration, lifecycle

**Current Problems**:
- `SessionManager` (26 edges) handling orchestration + config + state + notifications
- Mixed session lifecycle with business logic
- Tight coupling to UI concerns

**New Structure**:
```
session/
├── orchestration/      # Session orchestration
│   ├── session-orchestrator.ts
│   └── lifecycle-manager.ts
├── state/              # State management
│   ├── session-state.ts
│   └── state-manager.ts
├── configuration/      # Configuration
│   ├── config-manager.ts
│   └── config-validator.ts
├── notifications/      # Notifications
│   ├── notification-service.ts
│   └── status-bar-service.ts
└── interfaces/         # Abstractions
    ├── orchestrator.interface.ts
    ├── state-manager.interface.ts
    └── config-manager.interface.ts
```

**Key Classes**:
- `SessionOrchestrator` - Pure orchestration logic
- `StateManager` - Session state management
- `ConfigManager` - Configuration management
- `NotificationService` - UI notifications
- `LifecycleManager` - Session lifecycle events

### 5. Analysis Domain (`analysis/`)

**Responsibility**: Metrics, insights, recommendations

**Current Problems**:
- Mixed analysis calculation with presentation
- Duplicated analysis patterns
- No pluggable analysis framework

**New Structure**:
```
analysis/
├── metrics/            # Metric calculations
│   ├── graph-metrics.ts
│   ├── performance-metrics.ts
│   └── quality-metrics.ts
├── insights/           # Insight generation
│   ├── actionable-insights.ts
│   └── pattern-insights.ts
├── recommendations/    # Recommendations
│   ├── refactoring-recommendations.ts
│   └── optimization-recommendations.ts
├── framework/          # Analysis framework
│   ├── analysis-pipeline.ts
│   └── analyzer-registry.ts
└── interfaces/         # Abstractions
    ├── metric.interface.ts
    ├── insight.interface.ts
    └── analyzer.interface.ts
```

## SOLID Principles Implementation

### Single Responsibility Principle (SRP)

#### Current Violations and Solutions

**`SessionManager` → Multiple Classes**:
```typescript
// Current (774 lines, 26 edges)
class SessionManager {
  // Orchestration, config, state, notifications, plugins...
}

// New (SRP compliant)
class SessionOrchestrator {
  constructor(
    private stateManager: StateManager,
    private configManager: ConfigManager,
    private notificationService: NotificationService
  ) {}
}

class StateManager {
  // Only state management
}

class ConfigManager {
  // Only configuration
}

class NotificationService {
  // Only notifications
}
```

**`GraphifyAnalysis` → Focused Services**:
```typescript
// Current (27 edges)
class GraphifyAnalysis {
  // Analysis + caching + serialization + presentation
}

// New (SRP compliant)
class GraphAnalyzer {
  constructor(
    private cache: AnalysisCache,
    private serializer: AnalysisSerializer
  ) {}
}

class AnalysisCache {
  // Only caching logic
}

class AnalysisSerializer {
  // Only serialization logic
}
```

### Open/Closed Principle (OCP)

#### Plugin Architecture Enhancement
```typescript
// Extensible analyzer framework
interface Analyzer {
  readonly name: string;
  analyze(data: AnalysisInput): AnalysisResult;
}

class AnalyzerRegistry {
  private analyzers = new Map<string, Analyzer>();
  
  register(analyzer: Analyzer): void {
    this.analyzers.set(analyzer.name, analyzer);
  }
  
  runAnalysis(input: AnalysisInput): AnalysisResult[] {
    return Array.from(this.analyzers.values())
      .map(analyzer => analyzer.analyze(input));
  }
}

// Extensions without modification
class GodNodeAnalyzer implements Analyzer {
  readonly name = 'god-node';
  analyze(data: AnalysisInput): AnalysisResult { /* ... */ }
}

class CommunityAnalyzer implements Analyzer {
  readonly name = 'community';
  analyze(data: AnalysisInput): AnalysisResult { /* ... */ }
}
```

### Liskov Substitution Principle (LSP)

#### Interface Contracts
```typescript
// Parser interface with clear contracts
interface LanguageParser {
  /** Parse file and return symbols. Must not throw for valid files. */
  parse(content: string): Symbol[];
  
  /** Check if file is supported. Must be deterministic. */
  supports(filename: string): boolean;
}

// All implementations honor the contract
class TypeScriptParser implements LanguageParser {
  parse(content: string): Symbol[] {
    // Never throws for valid TypeScript
    try {
      return this.parseInternal(content);
    } catch (error) {
      return []; // Honor contract: don't throw
    }
  }
}
```

### Interface Segregation Principle (ISP)

#### Focused Interfaces
```typescript
// Current: Large interface
interface GraphService {
  analyze(): AnalysisResult;
  cache(): void;
  serialize(): string;
  visualize(): string;
}

// New: Segregated interfaces
interface GraphAnalyzer {
  analyze(): AnalysisResult;
}

interface GraphCache {
  get(key: string): AnalysisResult | null;
  set(key: string, result: AnalysisResult): void;
}

interface GraphSerializer {
  serialize(result: AnalysisResult): string;
  deserialize(data: string): AnalysisResult;
}

interface GraphVisualizer {
  generateVisualization(result: AnalysisResult): string;
}
```

### Dependency Inversion Principle (DIP)

#### Dependency Injection Framework
```typescript
// Container for dependency injection
class ServiceContainer {
  private services = new Map<string, any>();
  
  register<T>(token: string, factory: () => T): void {
    this.services.set(token, factory);
  }
  
  resolve<T>(token: string): T {
    const factory = this.services.get(token);
    if (!factory) throw new Error(`Service not found: ${token}`);
    return factory();
  }
}

// High-level modules depend on abstractions
class SessionOrchestrator {
  constructor(
    private indexService: IndexService,
    private graphService: GraphService,
    private contextService: ContextService
  ) {}
}

// Configuration
container.register('IndexService', () => new FileIndexService());
container.register('GraphService', () => new GraphAnalysisService());
container.register('ContextService', () => new ContextIntelligenceService());
```

## Dead Code Elimination Strategy

### Automated Detection Tools

#### 1. AST-Based Analysis
```typescript
class DeadCodeDetector {
  detectUnusedExports(files: string[]): UnusedExport[] {
    // Parse all files and build usage graph
    // Identify exports with no imports
  }
  
  detectUnreachableCode(file: string): UnreachableCode[] {
    // Find code after return statements
    // Find unused branches in conditionals
  }
  
  detectUnusedImports(file: string): UnusedImport[] {
    // Find imports not referenced in code
  }
}
```

#### 2. Graph-Based Analysis
Based on the 711 isolated nodes:
```typescript
class IsolatedNodeDetector {
  findIsolatedNodes(graph: DependencyGraph): IsolatedNode[] {
    return graph.nodes.filter(node => 
      graph.getInEdges(node).length <= 1 &&
      graph.getOutEdges(node).length <= 1
    );
  }
  
  categorizeIsolatedNodes(nodes: IsolatedNode[]): {
    deadCode: IsolatedNode[];
    configDependent: IsolatedNode[];
    testOnly: IsolatedNode[];
    requiresManualReview: IsolatedNode[];
  } {
    // Categorize based on patterns and context
  }
}
```

### Safe Removal Process

#### Phase 1: Automated Removal
- Remove unused imports
- Remove unreachable code after returns
- Remove unused private methods/properties

#### Phase 2: Batch Review  
- Group related isolated nodes
- Verify through test coverage
- Check for runtime/configuration dependencies

#### Phase 3: Manual Verification
- Review business logic implications
- Check for reflection-based usage
- Validate with domain experts

## DRY Violations and Solutions

### Path Operations Consolidation

**Current Issue**: `join()` has 28 edges - overused utility
```typescript
// Before: Scattered path operations
const filePath = path.join(dir, 'file.ts');
const anotherPath = path.join(root, 'another', 'file.js');
```

**Solution**: Centralized path utilities
```typescript
class PathUtils {
  private constructor() {} // Utility class
  
  static joinSafely(...segments: string[]): string {
    return path.join(...segments.filter(Boolean));
  }
  
  static relativeTo(base: string, target: string): string {
    return path.relative(base, target);
  }
  
  static isSubPath(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return !relative.startsWith('..');
  }
}
```

### Configuration Loading Duplication

**Current Issue**: Multiple config loading patterns
```typescript
// Before: Duplicated across files
const config1 = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const config2 = await loadJsonFile(configPath);
```

**Solution**: Centralized configuration service
```typescript
class ConfigurationService {
  private cache = new Map<string, any>();
  
  async load<T>(path: string, schema?: Schema<T>): Promise<T> {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }
    
    const config = await this.loadFromFile(path);
    const validated = schema ? schema.parse(config) : config;
    this.cache.set(path, validated);
    return validated;
  }
  
  private async loadFromFile(path: string): Promise<any> {
    // Single implementation for all config loading
  }
}
```

### Error Handling Patterns

**Current Issue**: Inconsistent error handling across modules
```typescript
// Before: Different patterns everywhere
try {
  // operation
} catch (e) {
  console.error(e);
}

// vs
if (error) {
  throw new Error(`Failed: ${error.message}`);
}
```

**Solution**: Consistent error handling framework
```typescript
abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly severity: 'low' | 'medium' | 'high';
}

class ValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR';
  readonly severity = 'medium';
}

class ErrorHandler {
  handle(error: Error, context: string): void {
    if (error instanceof BaseError) {
      this.handleTypedError(error, context);
    } else {
      this.handleGenericError(error, context);
    }
  }
}
```

## Community Restructuring Plan

### Low-Cohesion Communities (0.04-0.05)

#### Community 0 & 1 & 2 Refactoring
**Issue**: 44-47 nodes with low cohesion - doing too much

**Solution**: Split by domain
```typescript
// Before: Mixed concerns in one community
// After: Domain-focused modules

// Authentication concerns → auth/
// File operations → files/
// Configuration → config/
// UI concerns → ui/
```

#### Cohesion Improvement Strategy
```typescript
class CommunityAnalyzer {
  measureCohesion(community: Community): number {
    const internalEdges = this.countInternalEdges(community);
    const externalEdges = this.countExternalEdges(community);
    return internalEdges / (internalEdges + externalEdges);
  }
  
  suggestSplits(community: Community): SplitSuggestion[] {
    // Analyze subgroups with higher internal cohesion
    // Suggest natural splitting points
  }
}
```

### High-Cohesion Communities as Templates

Use Communities 37 (0.2), 38 (0.25), 30 (0.19) as architectural templates:

#### Template Pattern
```typescript
// Community 38 pattern: Focused responsibility
class SessionRecord {
  // Single concern: session data
}

class StateManager {
  // Single concern: state operations
  read(): SessionState {}
  write(state: SessionState): void {}
  remove(): void {}
}

// Apply to other domains
class GraphRecord { /* Similar focused structure */ }
class GraphStateManager { /* Similar focused operations */ }
```

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Extract core services and establish new architecture

**Week 1 Tasks**:
1. Extract `SessionOrchestrator` from `SessionManager`
2. Create `StateManager` and `ConfigManager`
3. Extract `GraphAnalyzer` from `GraphifyAnalysis`
4. Create service interfaces

**Week 2 Tasks**:
1. Extract `ContextCollector`, `ContextAnalyzer`, `ContextGenerator`
2. Create `SourceRegistry` and `BudgetManager`
3. Set up dependency injection container
4. Update tests for extracted services

**Deliverables**:
- New service classes with single responsibilities
- Interface definitions for all services
- Updated dependency injection setup
- Test coverage for new services

### Phase 2: Domain Consolidation (Weeks 3-4)  
**Goal**: Organize code by domains and eliminate duplication

**Week 3 Tasks**:
1. Move files to domain-based folder structure
2. Create `PathUtils` and `ConfigurationService`
3. Implement consistent error handling framework
4. Consolidate file operation patterns

**Week 4 Tasks**:
1. Refactor low-cohesion communities (0, 1, 2)
2. Apply high-cohesion community patterns
3. Create plugin interfaces for analyzers
4. Update imports and references

**Deliverables**:
- Domain-based folder structure
- Centralized utilities (PathUtils, ConfigurationService)
- Consistent error handling
- Refactored communities with higher cohesion

### Phase 3: Dead Code Elimination (Week 5)
**Goal**: Remove unused code and optimize dependencies

**Tasks**:
1. Run automated dead code detection
2. Remove isolated nodes (711 candidates)
3. Clean up unused imports and exports
4. Remove unreachable code branches
5. Update dependency graph

**Deliverables**:
- Significantly reduced codebase size
- Clean dependency graph with no isolated nodes
- Updated documentation reflecting removals
- Performance improvements from reduced bundle size

### Phase 4: SOLID Compliance (Week 6)
**Goal**: Ensure full SOLID compliance and create extension points

**Tasks**:
1. Implement plugin architecture for analyzers
2. Create focused interfaces (ISP compliance)
3. Add extension points for new features (OCP)
4. Validate LSP compliance in all implementations
5. Complete DIP with full dependency injection

**Deliverables**:
- Plugin architecture for extensibility
- SOLID-compliant codebase
- Extension points for future features
- Comprehensive integration tests

## Success Metrics

### Quantitative Goals
- **Reduce god node connectivity**: `GraphifyAnalysis` from 27 → <10 edges
- **Eliminate isolated nodes**: 711 → <50 nodes  
- **Improve community cohesion**: Communities 0,1,2 from 0.04-0.05 → >0.15
- **Reduce file size**: `manager.ts` from 774 → <300 lines
- **Code coverage**: Maintain >90% test coverage throughout

### Qualitative Goals  
- **Single Responsibility**: Each class has one clear purpose
- **Open for Extension**: New analyzers can be added without core changes
- **Interface Segregation**: No class forced to implement unused methods
- **Dependency Inversion**: High-level modules don't depend on low-level details
- **DRY Compliance**: No significant code duplication

### Risk Mitigation
- **Incremental delivery** prevents big-bang failures
- **Comprehensive testing** catches regressions early
- **Feature flags** allow rollback if needed
- **Code review checkpoints** ensure quality
- **Performance monitoring** tracks any degradation

## Testing Strategy

### Unit Tests
- Test each extracted service independently
- Mock dependencies using interfaces
- Achieve >95% coverage for new code

### Integration Tests  
- Test service interactions
- Validate plugin architecture
- Ensure configuration loading works

### Regression Tests
- Run existing test suite after each phase
- Add tests for refactored functionality
- Performance benchmarks for critical paths

### Manual Testing
- Verify UI functionality still works
- Test error handling improvements
- Validate configuration loading

## Migration Plan

### Backward Compatibility
- Maintain existing public APIs during transition
- Use adapter pattern for legacy interfaces
- Deprecation warnings for old APIs

### Feature Flags
```typescript
class FeatureFlags {
  static useNewSessionManager(): boolean {
    return process.env.USE_NEW_SESSION_MANAGER === 'true';
  }
  
  static useNewGraphAnalysis(): boolean {
    return process.env.USE_NEW_GRAPH_ANALYSIS === 'true';
  }
}
```

### Rollback Strategy
- Git tags at each phase completion
- Database migration scripts (if needed)
- Configuration rollback procedures
- Performance monitoring alerts

## Post-Refactoring Maintenance

### Architectural Guidelines
1. **One Class, One Responsibility**: Each class should have a single reason to change
2. **Interface First**: Define interfaces before implementations  
3. **Dependency Injection**: Use container for all service dependencies
4. **Plugin Architecture**: Extend through plugins, not core modifications
5. **Domain Boundaries**: Keep domain logic within domain boundaries

### Code Review Checklist
- [ ] Single Responsibility Principle followed
- [ ] No god classes or methods
- [ ] Interfaces used for abstractions
- [ ] No circular dependencies
- [ ] Consistent error handling
- [ ] No code duplication
- [ ] Tests for new functionality

### Monitoring and Metrics
- **Code complexity metrics**: Cyclomatic complexity per method
- **Dependency graphs**: Node connectivity and community cohesion
- **Performance metrics**: Execution time and memory usage
- **Test coverage**: Maintain >90% coverage
- **Dead code detection**: Run monthly scans

## Conclusion

This comprehensive refactoring will transform pi-scope from a complex, tightly-coupled system into a well-architected, maintainable codebase following SOLID principles and DRY patterns. The incremental approach ensures continuous functionality while systematically addressing technical debt.

The expected outcomes include:
- **50% reduction** in god node connectivity
- **90% elimination** of dead code (isolated nodes)
- **3x improvement** in community cohesion scores  
- **Extensible architecture** for future enhancements
- **Maintainable codebase** following industry best practices

By following this design, pi-scope will be positioned for sustainable long-term growth and easier maintenance.