---
name: pi-scope-plugins
description: Use when extending pi-scope with custom behavior via plugins, registering new plugins on SessionManager, implementing lifecycle hooks, or understanding the built-in ContextPruningPlugin, ReadAwarenessPlugin, and CommunityPruningPlugin
---

# pi-scope Plugins

## Prerequisites

No special install needed — the plugin system is built into pi-scope and works with the same npm deps.

The **CommunityPruningPlugin** activates automatically when pi-scope's native graph analysis
detects more than 1 community (works on TS/Py/Rust projects with zero external dependencies).

## Plugin Interface

Every plugin implements the `Plugin` interface from `plugins/plugin.ts`. All hooks are **optional** — implement only what you need.

```typescript
interface Plugin {
  readonly name: string;        // Unique name (required)
  readonly version?: string;    // Optional semver

  onSessionStart?(ctx): Promise<void>;
  onBeforeAgentStart?(event, ctx): Promise<{ systemPrompt: string } | undefined>;
  onContext?(messages): Promise<void>;
  onTurnEnd?(ctx): Promise<void>;
  onAgentEnd?(event, ctx): Promise<void>;
  onToolCall?(event, ctx): Promise<PluginToolCallResult | undefined>;
  onSessionShutdown?(): Promise<void>;
}
```

## Lifecycle Hook Map

| Hook | Trigger | Use Case |
|------|---------|----------|
| `onSessionStart` | After index loaded, before first context | Initialize plugin state |
| `onBeforeAgentStart` | Before agent runs (system prompt phase) | Augment the system prompt |
| `onContext` | Every turn, before LLM call | Prune/augment context messages |
| `onTurnEnd` | After each turn | Post-turn tracking |
| `onAgentEnd` | After agent output | Process agent response |
| `onToolCall` | On every tool invocation | Block/allow tool calls |
| `onSessionShutdown` | Session ends | Persist state, clean up resources |

## Registration

```typescript
import { SessionManager } from 'pi-scope';

const manager = new SessionManager();
manager.pluginManager.register(new MyPlugin());

// Unregister
manager.pluginManager.unregister('my-plugin');

// Check
manager.pluginManager.has('context-pruning'); // true
manager.pluginManager.get('my-plugin');       // Plugin | undefined
```

## Built-in Plugins

### ContextPruningPlugin

Removes redundant messages before each LLM call. Runs on every `onContext` hook.

| Rule | What it removes |
|------|-----------------|
| **Deduplication** | Identical consecutive user/assistant messages |
| **Superseded Writes** | Old file writes superseded by newer writes to the same file |
| **Error Purging** | Error results followed by successful results |

```typescript
// Customize pruning
const pruner = new ContextPruningPlugin({
  rules: ['deduplication', 'superseded-writes', 'error-purging'],
  recencyWindow: 10,
});
pruner.updateConfig({ recencyWindow: 20 });
```

### ReadAwarenessPlugin

Prevents editing files that haven't been read first. Blocks `write`/`edit` tool calls on unread files.

```typescript
const reader = new ReadAwarenessPlugin();
reader.enabled = true;  // Enable/disable
reader.getReadFiles();  // Check which files were read
```

### CommunityPruningPlugin

Filters context messages by community membership to keep injections focused. Only active when graph communities are detected (>1 community).

**How it works:**
1. Extracts the latest user query from conversation
2. Scores each community for relevance (keyword matching against community members)
3. Trims context from non-relevant communities
4. Always preserves interface nodes (cross-community bridges)

**Activation:** Auto-registered by `SessionManager.start()` when native graph analysis detects multiple communities in the AST index.

```typescript
// Manual configuration
const plugin = new CommunityPruningPlugin({
  enabled: true,
  maxCommunities: 2,
  preserveInterfaceNodes: true,
  relevanceThreshold: 0.3,
});
manager.pluginManager.register(plugin);
```

## Tool Call Interception

The `onToolCall` hook short-circuits: if any plugin returns `{ allowed: false }`, subsequent plugins are skipped and the tool call is blocked immediately.

```typescript
async onToolCall(event, ctx): Promise<PluginToolCallResult | undefined> {
  if (event.toolName === 'bash' && event.input?.command?.includes('rm -rf')) {
    return { allowed: false, reason: 'Destructive bash command blocked' };
  }
  return { allowed: true };
}
```

## Error Isolation

Errors in one plugin's hook do NOT prevent other plugins from running. Each hook invocation is wrapped in try/catch.

## Custom Plugin Examples

### Analytics Plugin

```typescript
class AnalyticsPlugin implements Plugin {
  readonly name = 'my-analytics';
  private turnCount = 0;

  async onTurnEnd(ctx: ExtensionContext): Promise<void> {
    this.turnCount++;
    console.log(`Turn ${this.turnCount} completed`);
  }

  async onSessionShutdown(): Promise<void> {
    console.log(`Session: ${this.turnCount} turns`);
  }
}
```

### Security Audit Plugin

```typescript
class SecurityPlugin implements Plugin {
  readonly name = 'security-audit';

  async onSessionStart(_ctx: ExtensionContext): Promise<void> {
    console.log('Security audit mode active');
  }
}
```
