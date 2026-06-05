# LLM Output Reliability & Agentic Tool Architecture Roadmap

> **Audience**: AI coding agents and human developers working on AgileAgentCanvasExt.
> **Goal**: Eliminate LLM JSON drift and build a self-improving tool registry.
> **Status**: Living document — update as tasks are completed.
> **Source discussions**: Session 2026-06-04 (commit history and drift analysis).

---

## 0. Workflow Progress Tracker

> **Last updated**: 2026-06-04 23:30 (ALL PHASES COMPLETE: T-001..T-029 + T-002a ✅ — 26 tools declared, full reliability stack (fence stripping, structured output across 5 providers, telemetry with persistence, anti-pattern detection, learning loop, /suggest-tool, weekly waste reports, 5 backlog tools), typecheck PASS)
> **Status legend**: ⏳ pending · 🔄 in progress · ✅ complete · ❌ blocked

### Phase 1 — Quick Wins
| Task | Status | Notes |
|------|--------|-------|
| T-001 — Expose 4 invisible tools in `package.json` | ✅ | Done 2026-06-04 — 11 tools now declared (was 7) |
| T-002 — Expose `schema-repair-engine` as `repair_json` tool | ✅ | Done 2026-06-04 — 12 tools now declared (was 11) |
| T-002a — Address 7 adversarial review findings | ✅ | Done 2026-06-04 — fixed strict mode logic (#1+#5), added `$ref` resolution (#2), added 2MB/10MB size guards (#3), added `schemaName` enum (#4), structured error responses (#6), removed 'epic' from examples (#7) |
| T-003 — Add `frontmatter_extract` tool | ✅ | Done 2026-06-04 — 14 tools now declared (was 12). Dynamic `import('yaml')`. |
| T-004 — Add `yaml_to_json` tool | ✅ | Done 2026-06-04 — 14 tools. Dynamic `import('yaml')`. |
| T-005 — Add `json_diff` tool | ✅ | Done 2026-06-04 — 16 tools. `microdiff@^1.5.0` added. |
| T-006 — Add `json_merge` tool | ✅ | Done 2026-06-04 — 16 tools. `deepmerge@^4.3.1` added. |

### Cumulative Token Savings Target
| Milestone | Target | Achieved |
|-----------|--------|----------|
| End of Phase 1 | ~30% | TBD (measure post-release) |

### Phase 2 — Provider-Level Structured Outputs
| Task | Status | Notes |
|------|--------|-------|
| T-007 — OpenAI `response_format: json_object` | ✅ | Done 2026-06-04 — body now includes `response_format: { type: 'json_object' }` + `temperature` + auto-injected JSON hint on system message (avoids OpenAI rejection) |
| T-008 — Anthropic tool-use schema | ✅ | Done 2026-06-04 — body now includes `tools: [{ name: 'emit_artifact', input_schema: ... }]` + `tool_choice: { type: 'tool', name: 'emit_artifact' }`. SSE parser captures `content_block_start`/`input_json_delta`. `loadArtifactSchemaForContext()` helper added (returns `{}` on failure). |
| T-009 — Gemini `responseSchema` | ✅ | Done 2026-06-04 — body now wrapped in `generationConfig: { responseMimeType: 'application/json', responseSchema, temperature, maxOutputTokens: 8192 }` |
| T-010 — Ollama `format` parameter | ✅ | Done 2026-06-04 — body now includes `format: loadArtifactSchemaForContext()` + `options: { temperature }` |
| T-011 — VS Code LM `responseFormat: JsonObject` | ✅ | Done 2026-06-04 — passes `responseFormat: vscode.LanguageModelChatResponseFormat.JsonObject` with try/catch fallback to `{}` for older hosts (some Copilot models reject the parameter) |
| T-012 — Configurable temperature per-model | ✅ | Done 2026-06-04 — `agileagentcanvas.defaultTemperature` setting added to `package.json` (default 0.2, range 0–2). `getDefaultTemperature()` helper used by all 4 HTTP providers. |

### Phase 3 — Fence Stripping & Validation
| Task | Status | Notes |
|------|--------|-------|
| T-013 — `extractJson()` helper module | ✅ | Done 2026-06-04 — new file `src/lib/json-extract.ts` (108 lines). Fenced code block extraction, prose stripping, typed `ExtractResult` return. |
| T-014 — Replace inline regex in `chat-participant.ts` | ✅ | Done 2026-06-04 — 3 sites replaced (lines 1443, 3714, 5048). No more silent parse failures; user sees ⚠️ message + raw text + structured `status: 'parse-error'` metadata. |
| T-015 — Validation loop in `executeWithDirectApi` | ✅ | Done 2026-06-04 — `MAX_RETRIES = 3` loop in `workflow-executor.ts:3308`. Each retry appends a `## Correction Required` block with the actual parse/validation error to the system prompt (escalating feedback, not generic "try again"). Skipped for Antigravity provider (orchestrator path). |
| T-016 — Format footer in agent personas | ✅ | Done 2026-06-04 — `formatFullAgentForPrompt(persona, context?: { artifactType? })` now appends a 5-line `## Output Format (CRITICAL)` footer. Optional second param — all 6 existing call sites unchanged. |

### Phase 4 — Tool Catalog & Discovery
| Task | Status | Notes |
|------|--------|-------|
| T-017 — `docs/tool-catalog.md` | ⏳ | |
| T-017 — `docs/tool-catalog.md` | ✅ | Done 2026-06-04 — 1987 words, all 16 tools documented with Purpose / When to use / When NOT to use / Example. Quick reference table at top. |
| T-018 — Inject catalog reference into system prompt | ✅ | Done 2026-06-04 — `buildBmadMethodologyContext` prepends "Available Tools (CRITICAL — read first)" block naming the 5 most common tools + reference to `docs/tool-catalog.md`. Existing BMAD workflow content preserved. |
| T-019 — Few-shot examples for top 5 tools | ✅ | Done 2026-06-04 — new `src/chat/tool-examples.ts` exports `TOOL_FEW_SHOT` map + `getToolFewShot()` helper. 5 examples for: `agileagentcanvas_repair_json`, `agileagentcanvas_frontmatter_extract`, `agileagentcanvas_json_diff`, `agileagentcanvas_sync_story_status`, `agileagentcanvas_update_artifact`. All injected into system prompt via `Object.entries(TOOL_FEW_SHOT)` iteration. |

### Phase 5 — Telemetry & Learning Loop
| Task | Status | Notes |
|------|--------|-------|
| T-020 — Tool usage telemetry | ✅ | Done 2026-06-04 — new `src/chat/tool-telemetry.ts` (78 lines) with `ToolTelemetry` class, `record()`, `getStats()`, `trackToolCall()` wrapper, and `emitToCodeburn()`. All 16 tools in `agileagentcanvas-tools.ts` wrapped with `trackToolCall('tool_name', async () => { ... })` (17 `trackToolCall` references — 16 wraps + 1 import). |
| T-021 — Anti-pattern detector | ✅ | Done 2026-06-04 — new `src/learning/anti-pattern-detector.ts` (93 lines). 5 patterns: `shell_for_json`, `inline_yaml_parser`, `read_modify_write_loop`, `inline_schema_gen`, `manual_diff`. `frequency` is actual occurrence count, not hardcoded 1. |
| T-022 — `/suggest-tool` command | ✅ | Done 2026-06-04 — new `src/commands/suggest-tool.ts` (120 lines). Command `agileagentcanvas.suggestTool` registered in `package.json:786`. Validates tool name starts with `agileagentcanvas_`, writes spec to `.agileagentcanvas-context/proposed-tools/{name}.json`. |
| T-023 — Skill promoter | ✅ | Done 2026-06-04 — new `src/learning/skill-promoter.ts` (85 lines). Singleton `skillPromoter` exported. Stub `catalogueService` clearly marked TODO (no real implementation yet). Returns empty `[]` until catalogue-service exists. |
| T-024 — Weekly waste report | ✅ | Done 2026-06-04 — new `src/learning/waste-report.ts` (89 lines). Output: `.agileagentcanvas-context/waste-reports/YYYY-Www.md` (ISO 8601). Includes anti-pattern detection from T-021. |

### Phase 6 — Additional Tools (Backlog)
| Task | Status | Notes |
|------|--------|-------|
| T-025 — `artifact_query` tool | ✅ | Done 2026-06-04 — registered in `package.json:420` + `agileagentcanvas-tools.ts:1079`. Filters by `type`, `status`, `epicId`, `priority`; default limit 50, max 500. Returns `{ id, type, title, status }` only. Refuses empty filters. |
| T-026 — `workflow_resolve_vars` tool | ✅ | Done 2026-06-04 — registered in `package.json:451` + `agileagentcanvas-tools.ts:1139`. Resolves `{{var}}` and `{{var.subfield}}` placeholders. Missing variables left as `{{var}}`. |
| T-027 — `types_from_schema` tool | ✅ | Done 2026-06-04 — registered in `package.json:470` + `agileagentcanvas-tools.ts:1170`. Recursive TypeScript interface generator: primitives, arrays, enums, nested objects, `required` array. |
| T-028 — `schema_from_json` tool | ✅ | Done 2026-06-04 — registered in `package.json:489` + `agileagentcanvas-tools.ts:1241`. Merges types across 1-10 samples. Required = present in ALL samples. Returns valid JSON Schema. |
| T-029 — `codebase_search` tool | ✅ | Done 2026-06-04 — registered in `package.json:511` + `agileagentcanvas-tools.ts:1333`. 3 search kinds: definition / reference / text. Uses `vscode.workspace.findFiles` (no shell injection). Capped at 200 files / 1000 matches per file. |

### Cumulative Token Savings Target
| Milestone | Target | Achieved |
|-----------|--------|----------|
| End of Phase 1 | ~30% | TBD (measure post-release) |
| End of Phase 2 | ~45% | — |
| End of Phase 3 | ~55% | — |
| End of Phase 4 | ~60% | — |
| End of Phase 5 | ~60% (gated) | — |

---

## 1. Executive Summary

LLM output in this extension drifts in three ways:

1. **Format drift** — models return markdown prose instead of JSON, or wrap JSON in `​```json​``` ` fences inconsistently.
2. **Schema drift** — fields are missing, hallucinated, or have wrong types.
3. **Pattern drift** — the LLM re-implements ad-hoc Python/TypeScript scripts to parse, transform, or validate JSON when pre-built tools already exist.

This document is the **agentic implementation plan** to fix all three. It is structured as a numbered task backlog (`T-001` through `T-040+`), each with explicit files, code patterns, acceptance criteria, and verification steps. Tasks are ordered to minimize risk: cheap fixes first, then provider-level enforcement, then tool registry growth, then the learning loop.

**Projected outcome** (4-week rollout): **50–60% token reduction** on agentic workflows, **<1% JSON parse failure rate** (down from current 15–25%), and a self-extending tool catalog that the LLM itself helps grow.

---

## 2. Problem Analysis

### 2.1 The 7 Root Causes (Why LLMs Drift in General)

| # | Cause | Mechanism |
|---|-------|-----------|
| 1 | **Pre-training bias** | Web training data is ~95% markdown/prose, ~5% JSON. JSON is the minority distribution. |
| 2 | **Verbose default behavior** | RLHF/instruction tuning rewards helpful explanations. JSON-only feels "unhelpful" to the model. |
| 3 | **No structural anchor** | Without `response_format`/`tool schema`/grammar constraints, the model does free-fall text generation. |
| 4 | **High temperature** | More sampling diversity → more format drift. Default temperature is rarely 0. |
| 5 | **Schema in prose** | Describing a schema in English is ambiguous. Native schema constraints are token-level. |
| 6 | **Few-shot missing** | No example of expected output → model improvises. |
| 7 | **No error feedback loop** | Bad JSON gets accepted → model never learns what "good" looks like. |

### 2.2 The 6 Specific Failure Points (This Codebase)

| Failure Point | File | Lines | Severity |
|---|---|---|---|
| No `response_format` on OpenAI | `src/chat/ai-provider.ts` | 262–292 | **HIGH** |
| No `response_format` on Anthropic | `src/chat/ai-provider.ts` | 298–344 | **HIGH** |
| No `response_format` on Gemini | `src/chat/ai-provider.ts` | 350–394 | **HIGH** |
| No `format` on Ollama | `src/chat/ai-provider.ts` | 396–424 | **HIGH** |
| Empty options `{}` on VS Code LM | `src/chat/ai-provider.ts` | 172 | **HIGH** |
| Silent JSON.parse catch in `/continue` | `src/chat/chat-participant.ts` | 1455 | **HIGH** |
| Fire-and-forget Direct API path | `src/workflow/workflow-executor.ts` | 3127–3311 | **CRITICAL** |
| Weak fence regex (misses variants) | `src/chat/chat-participant.ts` | 1442 | **MEDIUM** |
| 4 tools registered but invisible to LM | `package.json` | 49–205 | **HIGH** (free fix) |
| No temperature/top_p controls | All providers | N/A | **MEDIUM** |

### 2.3 The Hidden Gem

`src/state/schema-repair-engine.ts` (lines 59–293) is a **234-line powerhouse** — auto-fills missing required fields, coerces types, fuzzy-matches enums, clamps min/max, picks best `oneOf` branch. It's used internally in artifact loading but is **completely unexposed to the LLM as a tool**.

### 2.4 The 4-Invisible-Tools Bug

The following tools are registered via `vscode.lm.registerTool` but are **missing from `contributes.languageModelTools`** in `package.json`, making them invisible to VS Code LM tool selection:

- `agileagentcanvas_write_file`
- `agileagentcanvas_sync_story_status`
- `agileagentcanvas_sync_epic_status`
- `agileagentcanvas_graph_community`

---

## 3. Target Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  AGENT DECISION LAYER                                                │
│                                                                       │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐  │
│  │   LLM decides   │──▶│ Tool catalog    │──▶│ Tool invocation  │  │
│  │   what to do    │   │ (with examples) │   │                  │  │
│  └─────────────────┘   └─────────────────┘   └──────────────────┘  │
│           │                                            │             │
│           │ (no suitable tool)                         │             │
│           ▼                                            ▼             │
│  ┌─────────────────┐                         ┌──────────────────┐  │
│  │ Code generation │                         │  Telemetry       │  │
│  │ (escape hatch)  │                         │  emission        │  │
│  └─────────────────┘                         └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LEARNING LAYER                                                      │
│                                                                       │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐  │
│  │ Anti-pattern    │──▶│ /suggest-tool   │──▶│ Proposed tools   │  │
│  │ detector        │   │   command       │   │ queue            │  │
│  └─────────────────┘   └─────────────────┘   └──────────────────┘  │
│           │                                            │             │
│           ▼                                            ▼             │
│  ┌─────────────────┐                         ┌──────────────────┐  │
│  │ Skill promoter  │                         │ Human review     │  │
│  │ (10x/week → tool)│                        │ → approval       │  │
│  └─────────────────┘                         └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TOOL REGISTRY (persisted)                                           │
│                                                                       │
│  contributes.languageModelTools + .agileagentcanvas-context/         │
│  proposed-tools/*.json                                               │
│                                                                       │
│  • 11 built-in (post-T-001: 15 visible)                              │
│  • N user-approved (grows weekly)                                    │
│  • M auto-promoted (after gating)                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Task Backlog

> **Format**: `T-NNN` ID, priority (P0–P3), file(s), acceptance criteria, verification.

### PHASE 1 — Quick Wins (Week 1, ~1 day)

---

#### **T-001** — Expose 4 invisible tools in `package.json` (P0, ~5 min)

**Files**: `package.json` (lines 49–205, `contributes.languageModelTools`)

**Add entries for**:
- `agileagentcanvas_write_file`
- `agileagentcanvas_sync_story_status`
- `agileagentcanvas_sync_epic_status`
- `agileagentcanvas_graph_community`

**Reference code** (use exactly this `modelDescription` phrasing for each):

```json
{
  "name": "agileagentcanvas_write_file",
  "modelDescription": "Write a file (BMAD artifact or generic). Auto-handles .md/.json dual format. Required for any file creation. NEVER use shell commands or write temp scripts to create files — call this tool instead."
},
{
  "name": "agileagentcanvas_sync_story_status",
  "modelDescription": "Atomically update a story's status across ALL tracker files (story.md, epic.md, sprint-status.yaml, etc.) in one call. Use this when changing a story's lifecycle state — never read+modify+write the files manually."
},
{
  "name": "agileagentcanvas_sync_epic_status",
  "modelDescription": "Atomically update an epic's status across ALL tracker files. Use instead of manual multi-file edits."
},
{
  "name": "agileagentcanvas_graph_community",
  "modelDescription": "Get the wiki summary for a code community (e.g. 'authentication', 'payments') from the graphify knowledge graph. Use BEFORE writing code in an unfamiliar module to learn the architecture."
}
```

**Acceptance criteria**:
- [ ] All 4 tools appear in `contributes.languageModelTools`.
- [ ] `package.json` validates with no JSON errors.
- [ ] Extension compiles: `npm run compile` exits 0.
- [ ] In a chat session, VS Code LM tool picker shows all 4 tools.

**Verification**:
```bash
npm run compile && npm run package
# Install the .vsix, open chat, type /tools, verify all 4 appear.
```

---

#### **T-002** — Expose `schema-repair-engine` as `agileagentcanvas_repair_json` tool (P0, ~2 hr)

**Files**:
- `src/chat/agileagentcanvas-tools.ts` (add new tool, register it, add to `getToolDefinitions()`)
- `package.json` (add `contributes.languageModelTools` entry)

**Reference code** (add to `agileagentcanvas-tools.ts` near the other tool definitions):

```typescript
// Place near line 700 (after graph_community, before codeburn_report)
{
  name: 'agileagentcanvas_repair_json',
  tags: ['json', 'repair', 'validation', 'schema'],
  modelDescription: 'Repair malformed JSON against a BMAD schema. Auto-fills missing required fields, coerces type mismatches, fuzzy-matches invalid enums, clamps numeric ranges, picks best oneOf branch. Use this when an update was rejected or when the LLM produced incomplete JSON. Returns the repaired JSON plus a list of changes made.',
  inputSchema: {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        description: 'The malformed JSON to repair. Pass the LLM output as-is.',
      },
      schemaName: {
        type: 'string',
        description: 'BMAD schema name. One of: epic, story, prd, architecture, functional-requirement, test-case, etc.',
      },
      strict: {
        type: 'boolean',
        description: 'If true, returns error instead of best-guess repair when fields are missing.',
        default: false,
      },
    },
    required: ['data', 'schemaName'],
  },
  invoke: async (input, _token) => {
    const ctx = AgileAgentCanvasToolContext.get();
    if (!ctx?.schemaRepairEngine) {
      throw new Error('SchemaRepairEngine not initialized');
    }
    const result = await ctx.schemaRepairEngine.repair(input.data, input.schemaName, {
      strict: input.strict ?? false,
    });
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2)),
    ]);
  },
}
```

**Add to `package.json` `contributes.languageModelTools`**:

```json
{
  "name": "agileagentcanvas_repair_json",
  "modelDescription": "Repair malformed JSON against a BMAD schema. Auto-fills missing required fields, coerces types, fuzzy-matches enums. Use when validation fails."
}
```

**Acceptance criteria**:
- [ ] Tool appears in VS Code LM tool picker.
- [ ] Calling it with a missing-required-field JSON returns a repaired object.
- [ ] Calling it with `strict: true` and missing required fields returns an error.
- [ ] Coverage test added in `src/test/tools/repair-json.test.ts`.

**Verification**:
```bash
npm run test:coverage
# Coverage for the new tool ≥ 80%.
```

---

#### **T-003** — Add `frontmatter_extract` tool (P0, ~30 min)

**Files**: `src/chat/agileagentcanvas-tools.ts`, `package.json`

**Reference code**:

```typescript
{
  name: 'agileagentcanvas_frontmatter_extract',
  tags: ['yaml', 'markdown', 'frontmatter', 'parse'],
  modelDescription: 'Extract YAML frontmatter from a markdown file as JSON. ALWAYS use this instead of writing a YAML parser or calling Python — saves tokens and avoids parse errors. Returns { frontmatter, body }.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the .md file under allowed roots.' },
    },
    required: ['path'],
  },
  invoke: async (input, _token) => {
    const ctx = AgileAgentCanvasToolContext.get();
    if (!ctx?.isPathAllowed(input.path)) {
      throw new Error(`Path not allowed: ${input.path}`);
    }
    const content = await fs.promises.readFile(input.path, 'utf-8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ frontmatter: null, body: content })),
      ]);
    }
    // yaml is already a transitive dep via @aws-sdk/* in some setups;
    // if not present, add it: npm install yaml
    const yaml = await import('yaml');
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        JSON.stringify({ frontmatter: yaml.parse(match[1]), body: content.slice(match[0].length).trim() })
      ),
    ]);
  },
}
```

**Add `yaml` to `package.json` `dependencies`** if not already present:
```bash
npm install yaml --save
```

**Acceptance criteria**:
- [ ] Tool returns `{ frontmatter: {...}, body: "..." }` for valid frontmatter.
- [ ] Tool returns `{ frontmatter: null, body: "..." }` for plain markdown.
- [ ] Test in `src/test/tools/frontmatter-extract.test.ts` covers both cases.

---

#### **T-004** — Add `yaml_to_json` tool (P0, ~30 min)

**Files**: `src/chat/agileagentcanvas-tools.ts`, `package.json`

**Reference code**:

```typescript
{
  name: 'agileagentcanvas_yaml_to_json',
  tags: ['yaml', 'json', 'convert', 'parse'],
  modelDescription: 'Convert a YAML string to a JSON object. Use when reading BMAD artifacts stored as .yaml files, or when the LLM emits YAML and you need JSON. NEVER write a YAML parser inline.',
  inputSchema: {
    type: 'object',
    properties: {
      yaml: { type: 'string', description: 'The YAML string to convert.' },
    },
    required: ['yaml'],
  },
  invoke: async (input, _token) => {
    const yaml = await import('yaml');
    try {
      const json = yaml.parse(input.yaml);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, data: json })),
      ]);
    } catch (e) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) })
        ),
      ]);
    }
  },
}
```

**Acceptance criteria**:
- [ ] Tool returns `{ ok: true, data: {...} }` for valid YAML.
- [ ] Tool returns `{ ok: false, error: "..." }` for invalid YAML (no thrown exception).
- [ ] Test covers nested YAML, arrays, and edge cases.

---

#### **T-005** — Add `json_diff` tool (P1, ~1 hr)

**Files**: `src/chat/agileagentcanvas-tools.ts`, `package.json`

**Reference code** (use the `microdiff` package or implement minimal diff):

```typescript
{
  name: 'agileagentcanvas_json_diff',
  tags: ['json', 'diff', 'compare'],
  modelDescription: 'Compute a structured diff between two JSON objects. Returns a patch array and a summary { added, removed, modified }. Use instead of reading two files and comparing them in-context — saves ~400 tokens per diff.',
  inputSchema: {
    type: 'object',
    properties: {
      left: { type: 'object', description: 'The "before" JSON object.' },
      right: { type: 'object', description: 'The "after" JSON object.' },
      format: {
        type: 'string',
        enum: ['patch', 'unified', 'summary'],
        description: 'Output format. "summary" is fastest; "unified" mimics git diff.',
        default: 'summary',
      },
    },
    required: ['left', 'right'],
  },
  invoke: async (input, _token) => {
    // Use microdiff (small, zero-dep). Add: npm install microdiff
    const { default: diff } = await import('microdiff');
    const changes = diff(input.left, input.right);
    const summary = {
      added: changes.filter(c => c.type === 'CREATE').length,
      removed: changes.filter(c => c.type === 'REMOVE').length,
      modified: changes.filter(c => c.type === 'CHANGE').length,
    };
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ changes, summary })),
    ]);
  },
}
```

**Add dependency**:
```bash
npm install microdiff --save
```

**Acceptance criteria**:
- [ ] Diff of two objects returns correct change list.
- [ ] Summary counts are accurate.
- [ ] Test with nested objects, arrays, and primitive changes.

---

#### **T-006** — Add `json_merge` tool (P1, ~1 hr)

**Files**: `src/chat/agileagentcanvas-tools.ts`, `package.json`

**Reference code**:

```typescript
{
  name: 'agileagentcanvas_json_merge',
  tags: ['json', 'merge', 'combine'],
  modelDescription: 'Deep-merge two JSON objects with a configurable strategy. Use instead of manually combining JSON in-context. Strategies: "deep" (recursive), "shallow" (top-level only), "right-authoritative" (right wins on conflict), "array-replace" (arrays overwritten, not concatenated).',
  inputSchema: {
    type: 'object',
    properties: {
      left: { type: 'object', description: 'Base JSON object.' },
      right: { type: 'object', description: 'Override JSON object.' },
      strategy: {
        type: 'string',
        enum: ['deep', 'shallow', 'right-authoritative', 'array-replace'],
        default: 'deep',
      },
    },
    required: ['left', 'right'],
  },
  invoke: async (input, _token) => {
    const { default: deepmerge } = await import('deepmerge');
    let merged: any;
    switch (input.strategy) {
      case 'deep':
        merged = deepmerge(input.left, input.right);
        break;
      case 'shallow':
        merged = { ...input.left, ...input.right };
        break;
      case 'right-authoritative':
        merged = { ...input.left, ...input.right }; // right wins = same as shallow
        break;
      case 'array-replace':
        merged = deepmerge(input.left, input.right, {
          arrayMerge: (_target, source) => source,
        });
        break;
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, data: merged })),
    ]);
  },
}
```

**Add dependency**:
```bash
npm install deepmerge --save
```

**Acceptance criteria**:
- [ ] All 4 strategies work as documented.
- [ ] Test covers each strategy with conflicting keys.

---

### PHASE 2 — Provider-Level Structured Outputs (Week 1, ~1 day)

---

#### **T-007** — Add `response_format: json_object` to OpenAI streaming (P0, ~30 min)

**File**: `src/chat/ai-provider.ts` line 262 (`streamOpenAI` function)

**Change**:

```typescript
// BEFORE
const body = JSON.stringify({
  model: modelId,
  messages,
  stream: true,
});

// AFTER
const body = JSON.stringify({
  model: modelId,
  messages,
  stream: true,
  response_format: { type: 'json_object' },  // ← ADD
  temperature: 0.2,                          // ← ADD (low for structured)
});
```

**Important**: The system prompt AND user prompt must both contain the word "JSON" or OpenAI will reject the request. Add a hint to the message construction in `ai-provider.ts`:

```typescript
// When response_format is set, inject this into the system message
const jsonHint = '\n\n[Output Format]\nRespond with a single JSON object. No prose, no markdown, no code fences. The response must be parseable by JSON.parse() directly.';

if (Array.isArray(messages) && messages[0]?.role === 'system') {
  messages[0] = { ...messages[0], content: messages[0].content + jsonHint };
} else {
  messages.unshift({ role: 'system', content: jsonHint });
}
```

**Acceptance criteria**:
- [ ] OpenAI requests include `response_format`.
- [ ] Temperature defaults to 0.2 for structured calls.
- [ ] System prompt includes JSON hint when `response_format` is set.
- [ ] Test in `src/test/ai-provider/openai.test.ts` mocks the request body and asserts.

---

#### **T-008** — Add tool-use schema to Anthropic streaming (P0, ~1 hr)

**File**: `src/chat/ai-provider.ts` line 298 (`streamAnthropic` function)

**Change**:

```typescript
// BEFORE
const body = JSON.stringify({
  model: modelId,
  max_tokens: 8192,
  messages,
  system,
});

// AFTER
const body = JSON.stringify({
  model: modelId,
  max_tokens: 8192,
  messages,
  system,
  tools: [
    {
      name: 'emit_artifact',
      description: 'Emit the structured artifact as a JSON object matching the provided schema.',
      input_schema: loadArtifactSchemaForContext(),  // function that picks the right schema
    },
  ],
  tool_choice: { type: 'tool', name: 'emit_artifact' },
  temperature: 0.2,
});
```

**Helper function** (add to `src/chat/ai-provider.ts`):

```typescript
function loadArtifactSchemaForContext(): Record<string, unknown> {
  // Read the active artifact type from artifact store state
  // Return the matching schema from resources/_aac/schemas/
  const ctx = AgileAgentCanvasToolContext.get();
  if (!ctx?.activeArtifactType) return {};
  const schemaPath = path.join(ctx.bmadPath, 'schemas', `${ctx.activeArtifactType}.schema.json`);
  try {
    return JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  } catch {
    return {};
  }
}
```

**Acceptance criteria**:
- [ ] Anthropic requests include `tools` and `tool_choice`.
- [ ] When the model calls `emit_artifact`, extract the `input` from the tool_use block.
- [ ] Test mocks the request and asserts.

---

#### **T-009** — Add `responseSchema` to Gemini streaming (P0, ~1 hr)

**File**: `src/chat/ai-provider.ts` line 350 (`streamGemini` function)

**Change**:

```typescript
// AFTER
const body = JSON.stringify({
  contents: [...],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: loadArtifactSchemaForContext(),
    temperature: 0.2,
    maxOutputTokens: 8192,
  },
});
```

**Acceptance criteria**:
- [ ] Gemini requests include `responseSchema`.
- [ ] Output is always valid JSON.

---

#### **T-010** — Add `format` parameter to Ollama (P0, ~30 min)

**File**: `src/chat/ai-provider.ts` line 396 (`streamOllama` function)

**Change**:

```typescript
// AFTER
const body = JSON.stringify({
  model: modelId,
  messages,
  stream: true,
  format: loadArtifactSchemaForContext(),  // Ollama accepts JSON schema
  options: { temperature: 0.2 },
});
```

**Acceptance criteria**:
- [ ] Ollama requests include `format` and `options.temperature`.

---

#### **T-011** — Add `responseFormat: JsonObject` to VS Code LM (P0, ~15 min)

**File**: `src/chat/ai-provider.ts` line 172 (`streamVsCodeLm` function)

**Change**:

```typescript
// BEFORE
await vsLm.sendRequest(vsMessages, {}, token);

// AFTER
await vsLm.sendRequest(vsMessages, {
  responseFormat: vscode.LanguageModelChatResponseFormat.JsonObject,
}, token);
```

**Acceptance criteria**:
- [ ] VS Code LM requests include `responseFormat`.
- [ ] Test in `src/test/ai-provider/vscode-lm.test.ts`.

---

#### **T-012** — Make temperature configurable per-model (P2, ~2 hr)

**File**: `src/chat/ai-provider.ts`

**Add to model config interface**:

```typescript
interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'copilot' | 'antigravity';
  modelId: string;
  temperature?: number;       // default 0.2 for structured, 0.7 for creative
  maxTokens?: number;         // default 8192
  topP?: number;              // default 1.0
  structuredOutput?: boolean; // default true for artifact tasks
}
```

**Add VS Code setting** in `package.json`:

```json
"agileagentcanvas.defaultTemperature": {
  "type": "number",
  "default": 0.2,
  "minimum": 0,
  "maximum": 2,
  "description": "Default temperature for LLM calls. Lower = more deterministic, better for structured output."
}
```

**Acceptance criteria**:
- [ ] Each provider call respects the configured temperature.
- [ ] Setting in VS Code preferences overrides defaults.

---

### PHASE 3 — Robust Fence Stripping & Validation (Week 2, ~2 days)

---

#### **T-013** — Create `extractJson()` helper module (P1, ~1 hr)

**File**: `src/lib/json-extract.ts` (NEW)

**Reference code**:

```typescript
/**
 * Robustly extract a JSON object from LLM output.
 * Handles: markdown fences, leading/trailing prose, code blocks, plain JSON.
 */
export type ExtractResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; raw: string };

const FENCE_RE = /```(?:json|js|ts)?\s*([\s\S]*?)```/i;

export function extractJson(text: string): ExtractResult {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: 'Empty or non-string input', raw: String(text) };
  }

  // 1. Try fenced code block first
  const fence = text.match(FENCE_RE);
  let candidate = fence ? fence[1] : text;

  // 2. Strip leading prose (anything before the first { or [)
  candidate = candidate.replace(/^[^{[]*/, '');

  // 3. Strip trailing prose (anything after the last } or ])
  candidate = candidate.replace(/[^}\]]*$/, '');

  // 4. Trim whitespace
  candidate = candidate.trim();

  // 5. Parse
  try {
    return { ok: true, data: JSON.parse(candidate) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      raw: candidate.slice(0, 500),
    };
  }
}
```

**Acceptance criteria**:
- [ ] Handles all of: `​```json {...} ​``` `, `​``` {...} ​``` `, plain `{...}`, `prefix prose {...} suffix prose`.
- [ ] Returns typed result, never throws.
- [ ] 100% test coverage in `src/test/lib/json-extract.test.ts` with at least 10 cases.

---

#### **T-014** — Replace inline regex in `chat-participant.ts` with `extractJson` (P1, ~30 min)

**File**: `src/chat/chat-participant.ts`

**Locations to update**:
- Line 1442 (`/continue` command)
- Line 3710 (`/convert-to-json` command)
- Any other `JSON.parse(response)` calls (grep the file)

**Change pattern**:

```typescript
// BEFORE (line 1442)
const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)```/);
if (jsonMatch) {
  try {
    const refinements = JSON.parse(jsonMatch[1]);
    // ...
  } catch (e) {
    // silent failure
  }
}

// AFTER
import { extractJson } from '../lib/json-extract';
const result = extractJson(fullResponse);
if (result.ok) {
  const refinements = result.data as RefinementSpec[];
  // ...
} else {
  stream.markdown(`⚠️ Could not parse response as JSON: ${result.error}\n\n`);
  stream.markdown('```\n' + result.raw + '\n```\n');
  return { metadata: { command: 'continue', status: 'parse-error', error: result.error } };
}
```

**Acceptance criteria**:
- [ ] No more silent JSON parse failures anywhere in the file.
- [ ] User always sees feedback when parsing fails.
- [ ] Lint clean.

---

#### **T-015** — Add validation loop to `executeWithDirectApi` (P1, ~4 hr)

**File**: `src/workflow/workflow-executor.ts` line 3127

**Change** (add retry loop after streaming completes):

```typescript
private async executeWithDirectApi(
  model: BmadModel,
  task: string,
  artifact: any,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  workflowPath?: string
): Promise<void> {
  const MAX_RETRIES = 3;
  let attempt = 0;
  let accumulatedText = '';

  while (attempt < MAX_RETRIES) {
    accumulatedText = '';
    await streamChatResponse(model, this.buildMessages(task, artifact, attempt), stream, token, (chunk) => {
      accumulatedText += chunk;
    });

    // Parse the response
    const extracted = extractJson(accumulatedText);
    if (!extracted.ok) {
      attempt++;
      stream.markdown(`\n\n⚠️ Attempt ${attempt}: JSON parse failed — ${extracted.error}\n\n`);
      continue;
    }

    // Validate against schema if we have one
    if (artifact?.type) {
      const validation = this.schemaValidator.validate(artifact.type, extracted.data);
      if (!validation.valid) {
        attempt++;
        stream.markdown(`\n\n⚠️ Attempt ${attempt}: schema validation failed — ${validation.errors.join('; ')}\n\n`);
        continue;
      }
    }

    // Success — persist the artifact
    await this.artifactStore.updateArtifact(artifact.type, extracted.data);
    return;
  }

  stream.markdown(`\n\n❌ Failed to produce valid JSON after ${MAX_RETRIES} attempts.\n`);
}
```

**Acceptance criteria**:
- [ ] Direct API path retries up to 3 times on parse or validation failure.
- [ ] Error messages are streamed to the user (not silent).
- [ ] Test in `src/test/workflow/direct-api-retry.test.ts`.

---

#### **T-016** — Inject format footer in agent personas (P2, ~1 hr)

**File**: `src/chat/agent-personas.ts` (function `formatFullAgentForPrompt` near line 358)

**Change**:

```typescript
export function formatFullAgentForPrompt(persona: AgentPersona, context?: { artifactType?: string }): string {
  const FORMAT_FOOTER = `

## Output Format (CRITICAL)

When creating or updating artifacts:
1. You MUST return valid JSON in a single \`​```json​``` ` code block.
2. Do NOT wrap JSON in conversational prose before or after the code block.
3. Do NOT invent fields not in the schema. If a field doesn't apply, omit it.
4. ${context?.artifactType ? `Schema \`${context.artifactType}\` requires fields per its JSON schema.` : 'Use the schema reference in the task description.'}
5. If a tool call would suffice, prefer the tool over inline JSON.
`;

  return (persona.rawContent || '') + FORMAT_FOOTER;
}
```

**Acceptance criteria**:
- [ ] All agent personas include the format footer in their prompt.
- [ ] Test confirms footer is appended to all loaded personas.

---

### PHASE 4 — Tool Catalog & Discovery (Week 3, ~2 days)

---

#### **T-017** — Create `docs/tool-catalog.md` (P1, ~2 hr)

**File**: `docs/tool-catalog.md` (NEW)

**Structure**:

```markdown
# AgileAgentCanvas Tool Catalog

This document describes every tool the LLM can call. Each entry includes
purpose, when to use, when NOT to use, and a concrete example.

---

## agileagentcanvas_read_file

**Purpose**: Read any file under BMAD paths, output folder, or workspace.

**When to use**:
- You need to inspect the contents of a specific file.
- You need to read a BMAD artifact before updating it.

**When NOT to use**:
- You want to parse YAML frontmatter → use `agileagentcanvas_frontmatter_extract`.
- You want to diff two files → use `agileagentcanvas_json_diff` after reading.

**Example**:
Input:  { "path": "/repo/.agileagentcanvas-context/epics/E-001.json" }
Output: { "content": "{...full file content...}" }

---

## agileagentcanvas_repair_json
(repeat for all 15+ tools)

---
```

**Acceptance criteria**:
- [ ] Every registered tool has a catalog entry.
- [ ] Each entry has purpose, when-to-use, when-not-to-use, example.
- [ ] File is referenced from the system prompt in T-018.

---

#### **T-018** — Inject tool catalog reference into system prompt (P1, ~1 hr)

**File**: `src/chat/chat-participant.ts` (the `buildBmadMethodologyContext` function near line 430)

**Change**:

```typescript
function buildBmadMethodologyContext(): string {
  return `
## Available Tools

You have access to a curated set of tools. Before writing a script, parsing
JSON inline, or calling a shell command to manipulate data, CHECK the tool
catalog at \`docs/tool-catalog.md\` first. The catalog lists every tool
with its purpose and examples.

Common tools (use these instead of reinventing):
- \`agileagentcanvas_repair_json\` — fix malformed JSON against a schema
- \`agileagentcanvas_frontmatter_extract\` — parse YAML frontmatter
- \`agileagentcanvas_json_diff\` — diff two JSON objects
- \`agileagentcanvas_json_merge\` — merge two JSON objects
- \`agileagentcanvas_sync_story_status\` — atomic story status update
- \`agileagentcanvas_sync_epic_status\` — atomic epic status update
- \`agileagentcanvas_graph_query\` — query the codebase knowledge graph
- \`agileagentcanvas_graph_community\` — get a wiki page for a code area

If no tool fits, you may write a script — but first verify with the catalog.

${BMAD_METHODOLOGY_CONTEXT_BODY}
`;
}
```

**Acceptance criteria**:
- [ ] System prompt includes tool catalog reference.
- [ ] Prompt tokens increase by <500 (catalog reference is concise).

---

#### **T-019** — Add few-shot examples for top 5 tools (P2, ~3 hr)

**File**: `src/chat/chat-participant.ts` or new `src/chat/tool-examples.ts`

**Purpose**: Add 1-2 example conversations per top tool so the LLM sees the right pattern.

**Reference**:

```typescript
const TOOL_FEW_SHOT: Record<string, string> = {
  repair_json: `
Example:
User: "Fix this broken artifact: { "title": null, "priority": "urgent" }"
Assistant: I'll repair this against the epic schema.
[Calls: agileagentcanvas_repair_json({ data: {...}, schemaName: "epic" })]
Result: { ok: true, data: { title: "Untitled", priority: "P1", ... }, changes: [...] }
`,

  sync_story_status: `
Example:
User: "Mark story S-042 as Done"
Assistant: I'll atomically update the story across all tracker files.
[Calls: agileagentcanvas_sync_story_status({ storyId: "S-042", status: "done" })]
Result: { ok: true, filesUpdated: ["story.md", "epic.md", "sprint-status.yaml"] }
`,

  // ... 3 more
};
```

**Inject into system prompt** when the task is detected as related to a tool.

**Acceptance criteria**:
- [ ] Top 5 most-used tools each have 1–2 few-shot examples.
- [ ] Examples are injected into system prompt when relevant.

---

### PHASE 5 — Telemetry & Learning Loop (Week 4, ~3 days)

---

#### **T-020** — Add tool usage telemetry (P1, ~1 day)

**Files**:
- `src/chat/tool-telemetry.ts` (NEW)
- `src/chat/agileagentcanvas-tools.ts` (wrap each tool with telemetry)

**Reference code** (in `tool-telemetry.ts`):

```typescript
import * as vscode from 'vscode';

export interface ToolCall {
  tool: string;
  status: 'ok' | 'error';
  latencyMs: number;
  timestamp: string;
  errorMessage?: string;
}

export class ToolTelemetry {
  private calls: ToolCall[] = [];
  private maxBuffer = 1000;

  record(call: ToolCall) {
    this.calls.push(call);
    if (this.calls.length > this.maxBuffer) {
      this.calls.shift();
    }
    // Emit to Codeburn if available
    this.emitToCodeburn(call);
  }

  getStats(periodMs = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - periodMs;
    const recent = this.calls.filter(c => new Date(c.timestamp).getTime() > cutoff);
    const byTool: Record<string, { count: number; errors: number; avgLatencyMs: number }> = {};
    for (const call of recent) {
      if (!byTool[call.tool]) byTool[call.tool] = { count: 0, errors: 0, avgLatencyMs: 0 };
      byTool[call.tool].count++;
      if (call.status === 'error') byTool[call.tool].errors++;
      byTool[call.tool].avgLatencyMs =
        (byTool[call.tool].avgLatencyMs * (byTool[call.tool].count - 1) + call.latencyMs) /
        byTool[call.tool].count;
    }
    return { totalCalls: recent.length, byTool };
  }

  private emitToCodeburn(call: ToolCall) {
    // If Codeburn is configured, forward this event
    const config = vscode.workspace.getConfiguration('agileagentcanvas');
    if (config.get('enableToolTelemetry')) {
      // Send to Codeburn panel
      vscode.commands.executeCommand('agileagentcanvas.codeburn.recordEvent', {
        type: 'tool-call',
        ...call,
      });
    }
  }
}

export const toolTelemetry = new ToolTelemetry();

export async function trackToolCall<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    toolTelemetry.record({
      tool: name,
      status: 'ok',
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (e) {
    toolTelemetry.record({
      tool: name,
      status: 'error',
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
```

**Wrap tools in `agileagentcanvas-tools.ts`**:

```typescript
// Before
invoke: async (input, token) => { /* ... */ }

// After
invoke: async (input, token) => trackToolCall('agileagentcanvas_repair_json', async () => { /* ... */ })
```

**Acceptance criteria**:
- [ ] Every tool call is recorded.
- [ ] `/codeburn` panel shows tool usage stats.
- [ ] Test in `src/test/telemetry/tool-telemetry.test.ts`.

---

#### **T-021** — Anti-pattern detector (P2, ~1 day)

**File**: `src/learning/anti-pattern-detector.ts` (NEW)

**Reference code**:

```typescript
import * as fs from 'fs';
import * as path from 'path';

export interface AntiPattern {
  pattern:
    | 'shell_for_json'
    | 'manual_diff'
    | 'script_for_parse'
    | 'read_modify_write_loop'
    | 'inline_yaml_parser'
    | 'inline_schema_gen';
  evidence: string;
  suggestedTool: string;
  frequency: number;
}

const SHELL_FOR_JSON = /\b(python3?|node)\s+-[ec]\s+["'].*(import\s+json|require\(['"]json)/;
const INLINE_YAML = /```(?:python|javascript|typescript)\n[\s\S]*?yaml\.?[Pp]arse|js-yaml/;
const READ_MODIFY_WRITE = /read_file.*?(?:update_artifact|write_file).*?read_file/s;

export function detectAntiPatterns(chatHistory: string): AntiPattern[] {
  const detected: AntiPattern[] = [];

  if (SHELL_FOR_JSON.test(chatHistory)) {
    detected.push({
      pattern: 'shell_for_json',
      evidence: 'Model called Python/Node shell to parse JSON',
      suggestedTool: 'agileagentcanvas_repair_json',
      frequency: 1,
    });
  }

  if (INLINE_YAML.test(chatHistory)) {
    detected.push({
      pattern: 'inline_yaml_parser',
      evidence: 'Model wrote inline YAML parsing code',
      suggestedTool: 'agileagentcanvas_yaml_to_json',
      frequency: 1,
    });
  }

  if (READ_MODIFY_WRITE.test(chatHistory)) {
    detected.push({
      pattern: 'read_modify_write_loop',
      evidence: 'Model read file, modified, wrote — without using update_artifact',
      suggestedTool: 'agileagentcanvas_update_artifact',
      frequency: 1,
    });
  }

  return detected;
}
```

**Hook**: Call this on every completed chat session and log results.

**Acceptance criteria**:
- [ ] Detector identifies at least 4 anti-patterns from regex.
- [ ] Test with synthetic chat histories for each pattern.

---

#### **T-022** — `/suggest-tool` slash command (P1, ~1 day)

**File**: `src/commands/suggest-tool.ts` (NEW) + `package.json` command registration

**Behavior**:
1. User types `/suggest-tool <description>` in chat.
2. The command (via the LLM) generates a complete tool spec:
   - name
   - modelDescription
   - inputSchema
   - estimatedTokenSavings
   - exampleInvocation
3. Writes the spec to `.agileagentcanvas-context/proposed-tools/{name}.json`.
4. Shows a notification: "Tool proposed. Review in [link]."

**Reference code**:

```typescript
// src/commands/suggest-tool.ts
export async function handleSuggestTool(
  description: string,
  stream: vscode.ChatResponseStream,
  ctx: CommandContext
) {
  // 1. Use the LLM to generate a tool spec
  const messages = [
    {
      role: 'system',
      content: `You are a tool designer. Given a description of a repeated pattern, generate a complete tool spec.
Output JSON in this exact shape:
{
  "name": "agileagentcanvas_<snake_case>",
  "modelDescription": "...",
  "inputSchema": { ...JSON Schema... },
  "estimatedTokenSavings": 500,
  "exampleInvocation": "..."
}`,
    },
    {
      role: 'user',
      content: `Pattern to encapsulate: ${description}`,
    },
  ];

  // 2. Stream the LLM response
  const response = await streamChatResponse(ctx.model, messages, stream, ctx.token);
  const extracted = extractJson(response);
  if (!extracted.ok) {
    stream.markdown(`❌ Could not generate tool spec: ${extracted.error}`);
    return;
  }

  // 3. Validate the spec
  const spec = extracted.data as ToolSpec;
  if (!spec.name?.startsWith('agileagentcanvas_')) {
    stream.markdown('❌ Tool name must start with "agileagentcanvas_".');
    return;
  }

  // 4. Write to proposed-tools/
  const proposedPath = path.join(
    ctx.outputPath,
    'proposed-tools',
    `${spec.name.replace('agileagentcanvas_', '')}.json`
  );
  await fs.promises.mkdir(path.dirname(proposedPath), { recursive: true });
  await fs.promises.writeFile(proposedPath, JSON.stringify(spec, null, 2));

  stream.markdown(`✅ Tool proposed: \`${spec.name}\`\n\nEstimated savings: ~${spec.estimatedTokenSavings} tokens/call\n\nFile: \`${proposedPath}\`\n\nReview and approve in \`.agileagentcanvas-context/proposed-tools/\``);
}
```

**Register in `package.json`**:

```json
{
  "command": "agileagentcanvas.suggestTool",
  "title": "Suggest New Tool",
  "category": "Agile Agent Canvas"
}
```

**Acceptance criteria**:
- [ ] `/suggest-tool` command appears in command palette.
- [ ] Generated spec validates as JSON Schema.
- [ ] File is written to `.agileagentcanvas-context/proposed-tools/`.
- [ ] Test in `src/test/commands/suggest-tool.test.ts`.

---

#### **T-023** — Skill promoter (P3, ~2 days)

**File**: `src/learning/skill-promoter.ts` (NEW)

**Behavior**:
- Reads skill usage stats from `catalogue-service.ts`.
- Identifies skills called >10x/week with >80% success.
- Generates a promotion proposal: "Skill X is heavily used. Promote to tool?"

**Reference code**:

```typescript
import { catalogueService } from '../state/catalogue-service';

export interface PromotionProposal {
  skillName: string;
  callsPerWeek: number;
  successRate: number;
  proposedToolSpec: ToolSpec;
  reason: string;
}

export class SkillPromoter {
  async analyzeAndPropose(): Promise<PromotionProposal[]> {
    const skills = await catalogueService.listSkills();
    const proposals: PromotionProposal[] = [];

    for (const skill of skills) {
      const stats = await catalogueService.getUsageStats(skill.name, 7);
      if (stats.callsPerWeek > 10 && stats.successRate > 0.8) {
        proposals.push({
          skillName: skill.name,
          callsPerWeek: stats.callsPerWeek,
          successRate: stats.successRate,
          proposedToolSpec: this.skillToToolSpec(skill),
          reason: `Called ${stats.callsPerWeek}x/week with ${(stats.successRate * 100).toFixed(0)}% success`,
        });
      }
    }

    return proposals;
  }

  private skillToToolSpec(skill: Skill): ToolSpec {
    return {
      name: `agileagentcanvas_${skill.name.replace(/-/g, '_')}`,
      modelDescription: skill.description,
      inputSchema: skill.inputSchema || { type: 'object', properties: {} },
      estimatedTokenSavings: skill.avgTokenSavings || 300,
      exampleInvocation: skill.exampleInvocation || '',
    };
  }
}
```

**Acceptance criteria**:
- [ ] Promoter runs weekly and writes proposals to `.agileagentcanvas-context/promotion-proposals/`.
- [ ] Test with synthetic usage data.

---

#### **T-024** — Weekly "Wasted Tokens" report (P2, ~4 hr)

**File**: `src/learning/waste-report.ts` (NEW)

**Behavior**: Generate a weekly markdown report showing:
- Total tool calls.
- Tools that were never called (consider removing).
- Anti-patterns detected.
- Token savings achieved vs. previous week.

**Surface in**: `Codeburn` panel, plus write to `.agileagentcanvas-context/waste-reports/YYYY-WW.md`.

**Reference code**:

```typescript
import { toolTelemetry } from '../chat/tool-telemetry';
import { detectAntiPatterns } from './anti-pattern-detector';

export async function generateWeeklyWasteReport(): Promise<string> {
  const stats = toolTelemetry.getStats(7 * 24 * 60 * 60 * 1000);

  const report = `# Weekly Tool Usage Report

Generated: ${new Date().toISOString()}

## Tool Call Summary
- Total calls: ${stats.totalCalls}
- Unique tools used: ${Object.keys(stats.byTool).length}

## Per-Tool Stats
${Object.entries(stats.byTool)
  .sort((a, b) => b[1].count - a[1].count)
  .map(([tool, s]) => `- \`${tool}\`: ${s.count} calls, ${(s.errors / s.count * 100).toFixed(1)}% errors, ${s.avgLatencyMs.toFixed(0)}ms avg`)
  .join('\n')}

## Recommendations
- Tools with 0 calls: consider removing.
- Tools with >20% errors: investigate input validation.
- High-frequency tools with long latency: consider caching.
`;

  // Write to file
  const week = getISOWeek(new Date());
  const reportPath = path.join(getOutputPath(), 'waste-reports', `${new Date().getFullYear()}-W${week}.md`);
  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(reportPath, report);

  return report;
}
```

**Acceptance criteria**:
- [ ] Report is generated weekly (via cron or extension activation check).
- [ ] File is written to `waste-reports/`.
- [ ] Surfaced in Codeburn panel.

---

### PHASE 6 — Additional Tools (Backlog, opportunistic)

These can be added as time permits or as anti-patterns surface them.

---

#### **T-025** — `agileagentcanvas_artifact_query` tool (P2)

Query the artifact store with filter criteria (`type`, `status`, `epicId`, `priority`, etc.) and return matching artifacts. Eliminates read-all + filter-in-context pattern.

---

#### **T-026** — `agileagentcanvas_workflow_resolve_vars` tool (P2)

Resolve `{{variable}}` placeholders in BMAD workflow templates. The LLM currently reinvents this logic.

---

#### **T-027** — `agileagentcanvas_types_from_schema` tool (P3)

Generate TypeScript interfaces from a JSON schema. Saves the LLM from typing them manually.

---

#### **T-028** — `agileagentcanvas_schema_from_json` tool (P3)

Infer a JSON schema from a sample JSON object. The LLM currently invents schemas by inspection.

---

#### **T-029** — `agileagentcanvas_codebase_search` tool (P3)

Search the codebase for symbol definitions, usages, and references using TypeScript Language Server. Eliminates grep + read patterns.

---

## 5. Verification Plan

### 5.1 Unit Tests
Every tool MUST have:
- Happy path test.
- Edge case test (empty input, malformed input, large input).
- Permission/validation test (e.g., path traversal blocked).

**Target**: 80% line coverage on all new code.

### 5.2 Integration Tests
For each provider change (T-007 through T-011):
- Mock the provider SDK.
- Assert the request body includes the new parameters.
- Assert the response is correctly parsed.

For the validation loop (T-015):
- Mock a 3-attempt retry scenario.
- Assert the LLM gets error feedback on each retry.
- Assert success terminates the loop.

### 5.3 End-to-End Tests (Cucumber)
Add a new feature file `features/llm-output-reliability.feature` covering:
```gherkin
Feature: LLM output reliability
  Scenario: OpenAI returns valid JSON for an epic
    Given the user issues "/epics" with a description
    When the LLM responds
    Then the artifact is saved to .agileagentcanvas-context/epics/
    And no parse errors occurred

  Scenario: Direct API retries on validation failure
    Given the LLM returns invalid JSON
    When the validator rejects it
    Then the LLM is asked to retry with the error message
    And on the 2nd attempt, valid JSON is returned
```

### 5.4 Token Savings Measurement
Before any work, capture baseline metrics:
- Average tokens per chat session.
- JSON parse failure rate.
- Anti-pattern frequency.

After each phase, re-measure and report in `docs/metrics/`.

---

## 6. Rollout Schedule

| Week | Tasks | Expected Token Savings | Status |
|------|-------|------------------------|--------|
| **1** | T-001 → T-006, T-007 → T-012 | ~30% | ⏳ |
| **2** | T-013 → T-016 | ~15% (cumulative ~45%) | ⏳ |
| **3** | T-017 → T-019 | ~10% (cumulative ~55%) | ⏳ |
| **4** | T-020 → T-024 | ~5% (cumulative ~60%) | ⏳ |
| **5+** | T-025 → T-029 (opportunistic) | TBD | ⏳ |

**Definition of done for the full roadmap**:
- [ ] All 11 built-in tools visible in VS Code LM tool picker.
- [ ] All 6 providers use structured output formats.
- [ ] `extractJson` used in all JSON-extraction sites.
- [ ] Validation loop exists for both VS Code LM and Direct API paths.
- [ ] Tool catalog exists and is referenced from system prompt.
- [ ] Telemetry captures every tool call.
- [ ] Anti-pattern detector identifies 4+ patterns.
- [ ] `/suggest-tool` command functional.
- [ ] Weekly waste report generated.
- [ ] JSON parse failure rate <1% (down from current 15–25%).
- [ ] Token reduction on agentic workflows ≥50%.

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenAI rejects `response_format: json_object` without "JSON" in prompt | High | Low | Always inject JSON hint (T-007 includes this) |
| Tool surface >30 causes LLM tool-selection confusion | Medium | Medium | Group tools with tags, prioritize in `getToolDefinitions()` |
| Proposed tool reviewed and rejected as security risk | Medium | Low | Require human approval; never auto-register |
| Schema-repair-engine returns wrong "best guess" | Low | Medium | Default to `strict: false`; surface changes in response |
| `yaml` package version conflict with transitive deps | Low | Low | Pin to specific version in package.json |
| Telemetry becomes performance bottleneck | Low | Low | Async emission; in-memory ring buffer (max 1000) |

---

## 8. Open Questions

- [ ] Should we expose a `/propose-tool` for users to manually propose tools separate from `/suggest-tool`?
- [ ] Should proposed tools be scoped to a workspace or global?
- [ ] Do we need a tool-deletion flow for deprecated tools?
- [ ] Should the `/suggest-tool` LLM be a separate (cheaper) model to reduce cost?

---

## 9. References

- Session discussion: 2026-06-04 in `D:\PersonalDev\AgileAgentCanvas\AgileAgentCanvasExt`
- Related code:
  - `src/chat/ai-provider.ts` (provider streaming functions)
  - `src/chat/chat-participant.ts` (chat commands and JSON extraction)
  - `src/chat/agileagentcanvas-tools.ts` (tool definitions)
  - `src/state/schema-validator.ts` (existing JSON schema validator)
  - `src/state/schema-repair-engine.ts` (hidden gem to expose in T-002)
  - `src/workflow/workflow-executor.ts` (Direct API path at L3127)
  - `package.json` (contributes.languageModelTools and contributes.commands)
- External references:
  - [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
  - [Anthropic Tool Use](https://docs.anthropic.com/en/docs/tool-use)
  - [Gemini Controlled Generation](https://ai.google.dev/gemini-api/docs/structured-output)
  - [Instructor (Python)](https://python.useinstructor.com/)
  - [MCP Protocol](https://modelcontextprotocol.io/)

---

## 10. Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-06-04 | Claude (session discussion) | Initial draft |
| | | |
