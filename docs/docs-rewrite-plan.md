# Docs & Comment Docs Rewrite Plan — pi-slim v0.6.0

## Analysis: Problems Found

### 1. README.md — 6 Critical Issues

| # | Problem | Evidence |
|---|---------|---------|
| 1 | **References removed features** | Mentions "automation triggers" (recap-hint, context-warning, file-tracking, high-activity), `/recap`, `/compact`, `/handoff` — all removed in v0.4.0 |
| 2 | **Project structure outdated** | Lists `core/`, `automation/`, `injectors/`, `config/`, `detect/`, `persistence/` — none exist after v0.5.0 refactor |
| 3 | **Missing new features** | No mention of hashline_edit, LSP navigation (go-to-definition, find-references, hover), /hashline-read command |
| 4 | **Commands incomplete** | Only lists `/slim` — missing `/hashline-read` |
| 5 | **No telemetry visibility** | Nowhere explains what users see via pi-telemetry notifications: injection counts, token savings, pruning stats |
| 6 | **No actionable guidance** | Doesn't answer "how do I use hashline_edit?" or "what does /slim show me?" |

### 2. CONTRIBUTING.md — 3 Issues

| # | Problem | Evidence |
|---|---------|---------|
| 1 | **Project structure outdated** | Lists `src/`, `injectors/`, `detect/`, `persistence/`, `utils/` — wrong paths |
| 2 | **Missing contributor info for hashline** | No section on how to add a hashline edit operation |
| 3 | **Missing contributor info for LSP** | No section on how to add a language server definition |

### 3. docs/architecture.md — 3 Issues

| # | Problem | Evidence |
|---|---------|---------|
| 1 | **References removed components** | ContextMonitor, AutomationManager, AutoRecapper, AutoCompactor, MetricsCollector — all deleted in v0.4.0 |
| 2 | **References old paths** | `core/`, `automation/`, `injectors/`, `detect/`, `persistence/` |
| 3 | **Missing new components** | No hashline, LSP navigation, service layer |

### 4. skills/pi-slim/SKILL.md — 2 Issues

| # | Problem | Evidence |
|---|---------|---------|
| 1 | **Command name wrong** | Lists `/smart-context` — actual command is `/slim` |
| 2 | **No mention of hashline or LSP** | Missing these major features |

### 5. Source Code Comments — 4 Issues

| File | Issue |
|------|-------|
| `manager.ts:90` | Description says "AST-powered context + pruning + automation for pi" — automation was removed |
| `plugins/plugin.ts:72` | Comment says "post-turn automation" — removed |
| `shared/telemetry-helpers.ts:80-89` | Contains `recordAutomation()` function with dead automation code path |
| `context/loader.ts:3` (was `config/loader.ts`) | Comment path references old location |

### 6. Stale Plan Documents

`docs/cleanup-plan.md`, `docs/naming-refactor-plan.md` — execution docs that should be deleted now that refactors are complete.

## Proposed Fixes

### Phase 1: Rewrite README.md (GitHub Standard)

**Structure:** Badges → Description → Quick Start → Core Features → Tools → Telemetry → Configuration → Commands → Development → Contributing → License

**New sections to add:**
- **Hashline Editing** — explain the `hashline_edit` tool, how it uses hash anchors to avoid file re-reads, example workflow
- **LSP Navigation** — explain `lsp_go_to_definition`, `lsp_find_references`, `lsp_hover` tools
- **Telemetry & Notifications** — explain what users see via pi-telemetry: injection summaries, token savings, pruning stats, `/slim` output
- **Cost Savings** — table comparing naive read vs skeleton vs hashline vs LSP

**Remove:**
- Automation triggers section (dead code)
- Plugin system section (move to CONTRIBUTING.md or keep minimal)
- `/recap`, `/compact`, `/handoff` references

**Fix project structure tree**

### Phase 2: Rewrite CONTRIBUTING.md

- Fix project structure to reflect v0.5.0 layout
- Add section: "Adding a Hashline Edit Operation"
- Add section: "Adding an LSP Server Definition"
- Remove references to old paths like `injectors/`, `detect/`, `persistence/`

### Phase 3: Rewrite docs/architecture.md

- Remove ContextMonitor, AutomationManager, AutoRecapper, AutoCompactor, MetricsCollector
- Add HashlineEdit flow (line-hash → validate → apply → diff preview)
- Add LSP Navigation flow (client → service → tools)
- Fix all directory paths
- Add telemetry data flow (what events fire, what /slim shows)

### Phase 4: Update skills/pi-slim/SKILL.md

- Fix command from `/smart-context` to `/slim`
- Add hashline_edit, lsp_* tools
- Add /hashline-read command
- Update performance notes

### Phase 5: Fix Source Code Comments

| File | Fix |
|------|-----|
| `manager.ts:90` | Change "automation" → "LSP navigation" or remove |
| `plugins/plugin.ts:72` | Change "post-turn automation" → "post-turn processing" |
| `shared/telemetry-helpers.ts` | Remove `recordAutomation()` function (dead code path) |
| `context/loader.ts` | Fix any stale header comments |

### Phase 6: Delete Stale Docs

- `docs/cleanup-plan.md` (v0.4.0 is done)
- `docs/naming-refactor-plan.md` (v0.5.0 is done)
- `CHANGELOG.md` keep (historical record)

## Telemetry Visibility — What Users Actually See

| Notification | When | Source | Example |
|-------------|------|--------|---------|
| "indexed N files, M edges" | First session in project | `manager.ts` startup | `✓ indexed 1,234 files, 567 edges → .pi/slim/` |
| "N files loaded (built date)" | Subsequent sessions | `manager.ts` cache load | `✓ 1,234 files loaded (built May 4, 2026)` |
| "injecting N files (~T tokens)" | File mentioned in conversation | `manager.ts` handleContext | `ℹ injecting 3 files (~150 tokens (88% saved)): src/auth.ts, src/db.ts` |
| "*name* trimmed (T tokens > budget)" | Injection too large | `manager.ts` pipeline | `⚠ repo-map trimmed (5000 tokens > budget)` |
| Session stats on shutdown | Session end | `manager.ts` shutdown | `ℹ session summary — index: 1234 files (fresh) \| repo-map: ~3500t \| dep-context: 12x, ~2400t \| saved ~18000t (88%)` |
| `/slim` command | User request | `manager.ts` showStats | Full stats table with index, injections, savings |

This should all be documented in the README so users know what to expect.

## Effort

| Phase | What | Time |
|-------|------|------|
| 1 | Rewrite README.md | 20 min |
| 2 | Rewrite CONTRIBUTING.md | 10 min |
| 3 | Rewrite docs/architecture.md | 15 min |
| 4 | Update skills/pi-slim/SKILL.md | 5 min |
| 5 | Fix source code comments | 5 min |
| 6 | Delete stale docs | 1 min |
| **Total** | | **~56 min** |
