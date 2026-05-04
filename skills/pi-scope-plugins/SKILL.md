---
name: pi-scope-plugins
description: Use when extending pi-scope with custom behavior via plugins, registering new plugins on SessionManager, implementing lifecycle hooks, or understanding the built-in ContextPruningPlugin and ReadAwarenessPlugin
---

# pi-scope Plugins

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

Removes redundant messages before each LLM call:

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

Prevents editing files that haven't been read first:

```typescript
const reader = new ReadAwarenessPlugin();
reader.enabled = true;  // Enable/disable
reader.getReadFiles();  // Check which files were read
```

Blocks `write`/`edit` tool calls on unread files with a message:
> File "src/auth.ts" has not been read. Use `read` tool first before editing or writing.

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
