# Agile Agent Canvas Tool Catalog

> **For LLM agents**: This is your authoritative reference for every tool you can call. Before writing a script, parsing JSON inline, or calling a shell command to manipulate data, **check this catalog first**.

**Last updated**: 2026-06-04 | **Total tools**: 16

## Quick reference

| Tool | Purpose | Common alternative to |
|------|---------|----------------------|
| `agileagentcanvas_repair_json` | Fix malformed JSON against BMAD schema | regex fixing JSON in context |
| `agileagentcanvas_frontmatter_extract` | Parse YAML frontmatter from .md files | regex extracting frontmatter |
| `agileagentcanvas_json_diff` | Diff two JSON objects | reading two files and comparing in-context |
| `agileagentcanvas_json_merge` | Merge two JSON objects (deep/shallow/right/array) | inline JSON combining in prompts |
| `agileagentcanvas_sync_story_status` | Atomic story status update across tracker files | manual multi-file status edits |
| `agileagentcanvas_update_artifact` | Persist changes to a BMAD artifact | writing files manually |
| `agileagentcanvas_read_file` | Read any file under BMAD or project folders | shell cat commands |
| `agileagentcanvas_list_directory` | List directory contents | shell ls commands |
| `agileagentcanvas_write_file` | Write a file (.md/.json auto-handled) | shell echo / redirect |
| `agileagentcanvas_graph_query` | Query the knowledge graph (natural language) | reading graph.json manually |
| `agileagentcanvas_graph_path` | Find shortest path between two graph nodes | searching graph manually |
| `agileagentcanvas_graph_community` | Get wiki summary for a code community | reading community docs |
| `agileagentcanvas_read_jira` | Read Jira epics/stories via REST API | opening Jira in browser |
| `agileagentcanvas_codeburn_report` | Read AI cost/token usage from Codeburn | manual cost calculation |
| `agileagentcanvas_sync_epic_status` | Atomic epic status update across trackers | manual multi-file epic edits |
| `agileagentcanvas_yaml_to_json` | Convert YAML string to JSON | inline YAML parsing |

---

## agileagentcanvas_read_file

**Purpose**: Read any file from the BMAD framework folder or project output folder — agent definitions, workflow steps, schemas, and other BMAD files.

**When to use**: Reading workflow definitions or agent personas before executing a BMAD phase; loading a JSON schema to validate an artifact.

**When NOT to use**: For YAML frontmatter — use `agileagentcanvas_frontmatter_extract`. For directory listing — use `agileagentcanvas_list_directory`.

**When NOT to use**: For YAML frontmatter — use `agileagentcanvas_frontmatter_extract`. For Jira or Codeburn data — use the dedicated tools. For directory listing — use `agileagentcanvas_list_directory`.

**Example**:
```json
{ "path": "/repo/.agileagentcanvas-context/epics/E-001.json" }
// Output
{ "path": "...", "content": "{\n  \"id\": \"E-001\",\n  \"title\": \"User Authentication\",\n  ...\n}" }
```

---

## agileagentcanvas_list_directory

**Purpose**: List directory contents inside the BMAD framework folder to discover available workflows, agents, schemas, and steps.

**When to use**: Enumerating available BMAD workflows before calling `/workflows`; finding bundled agents or schemas; exploring `resources/_aac/` structure.

**When NOT to use**: For reading file contents — use `agileagentcanvas_read_file`. For YAML frontmatter — use `agileagentcanvas_frontmatter_extract`. When you already know the exact path — use `agileagentcanvas_read_file` directly.

**Example**:
```json
{ "path": "/repo/resources/_aac/workflows" }
// Output
{ "entries": ["epic-creation.md", "story-craft.md", ...] }
```

---

## agileagentcanvas_update_artifact

**Purpose**: Save changes to a BMAD artifact (vision, epic, story, requirement, etc.) in the project. Call this when you have completed refining an artifact and are ready to persist changes.

**When to use**: After generating or editing any BMAD artifact via an LLM workflow step; when the user confirms a change and you need to write it to disk.

**When NOT to use**: For generic non-BMAD files — use `agileagentcanvas_write_file`. If JSON fails validation — use `agileagentcanvas_repair_json` first, then retry.

**Example**:
```json
{ "type": "story", "id": "STORY-1-1", "changes": { "status": "done" } }
// Output
{ "ok": true, "id": "STORY-1-1" }
```

---

## agileagentcanvas_graph_query

**Purpose**: Run a natural-language question against the graphify knowledge graph. Use this to understand code structure, trace connections between components, or surface design rationale.

**When to use**: Answering architecture or dependency questions about the codebase; tracing how two components are connected; understanding the structure of an unfamiliar module before writing code.

**When NOT to use**: When `graphify-out/graph.json` does not exist. For questions about files outside the project. For simple file reads — use `agileagentcanvas_read_file` instead.

**Example**:
```json
{ "question": "How does the chat participant connect to the workflow executor?", "budget": 800 }
// Output
{ "answer": "ChatParticipant calls getWorkflowExecutor() which..." }
```

---

## agileagentcanvas_graph_path

**Purpose**: Find the shortest path between two nodes in the graphify knowledge graph to trace dependencies or understand how two components relate.

**When to use**: When you know two components exist but are unsure how they interact; mapping the dependency chain between modules; verifying whether two features share a common code path.

**When NOT to use**: When `graphify-out/graph.json` does not exist. For broad architectural questions — use `agileagentcanvas_graph_query` instead. When you only need one node's community wiki — use `agileagentcanvas_graph_community`.

**Example**:
```json
{ "nodeA": "ChatParticipant", "nodeB": "ArtifactStore" }
// Output
{ "path": ["ChatParticipant", "WorkflowExecutor", "ArtifactStore"] }
```

---

## agileagentcanvas_read_jira

**Purpose**: Read epics and stories from the Jira Cloud project via the REST API. Use when asked about the Jira board or wants to see issues.

**When to use**: Listing all epics or stories; checking Jira connection status (`test_connection`); fetching stories for a specific epic.

**When NOT to use**: When Jira is not configured in VS Code settings. For writing back to Jira — this tool is read-only.

**Example**:
```json
{ "action": "list_epics", "projectKey": "PROJ" }
// Output
{ "epics": [{ "key": "PROJ-1", "summary": "Authentication epic", ... }] }
```

---

## agileagentcanvas_codeburn_report

**Purpose**: Read AI coding cost and token usage from Codeburn. Use when asked about AI spend, token usage, costs, budget, or model pricing.

**When to use**: When asked "how much have I spent on AI this week?"; reviewing per-model token breakdowns; checking today's AI cost snapshot.

**When NOT to use**: For non-cost questions — use the appropriate BMAD or graph tool. When Codeburn session data is not available on disk. For budget alerts — this is read-only reporting.

**Example**:
```json
{ "period": "7days", "action": "summary" }
// Output
{ "totalCost": 12.34, "modelBreakdown": [{ "model": "sonnet", "cost": 8.50 }] }
```

---

## agileagentcanvas_write_file

**Purpose**: Write a file (BMAD artifact or generic). Auto-handles .md/.json dual format. Required for any file creation. NEVER use shell commands or write temp scripts.

**When to use**: Creating new BMAD artifacts (story, epic, requirement, etc.); writing generic files when no BMAD schema applies; updating workflow markdown files.

**When NOT to use**: For BMAD artifacts — use `agileagentcanvas_update_artifact` instead. For JSON repairs — use `agileagentcanvas_repair_json`. For YAML frontmatter — use `agileagentcanvas_frontmatter_extract`.

**Example**:
```json
{ "path": "/repo/.agileagentcanvas-context/stories/STORY-2-1.md", "content": "---\nid: STORY-2-1\n---\n..." }
// Output
{ "ok": true, "path": "/repo/.agileagentcanvas-context/stories/STORY-2-1.md" }
```

---

## agileagentcanvas_sync_story_status

**Purpose**: Atomically update a story's status across ALL tracker files (story.md, epic.md, sprint-status.yaml, etc.) in one call. Never read+modify+write the files manually.

**When to use**: Moving a story from `todo` to `in-progress`; marking as `done` after acceptance; marking as `blocked` when unblocked.

**When NOT to use**: For non-story artifacts — use `agileagentcanvas_sync_epic_status` instead. When you only need to update one specific file — use `agileagentcanvas_update_artifact`. For new artifact creation — use `agileagentcanvas_write_file`.

**Example**:
```json
{ "storyId": "STORY-1-1", "status": "review" }
// Output
{ "ok": true, "updated": ["story.md", "epic.md", "sprint-status.yaml"] }
```

---

## agileagentcanvas_sync_epic_status

**Purpose**: Atomically update an epic's status across ALL tracker files. Use instead of manual multi-file edits.

**When to use**: Moving an epic from `planning` to `in-progress`; marking as `completed` when all stories are done; archiving an epic.

**When NOT to use**: For story-level status updates — use `agileagentcanvas_sync_story_status` instead. For non-epic BMAD artifacts — use `agileagentcanvas_update_artifact`. When you only need to read epic data — use `agileagentcanvas_read_file`.

**Example**:
```json
{ "epicId": "EPIC-1", "status": "completed" }
// Output
{ "ok": true, "updated": ["epic.md", "sprint-status.yaml"] }
```

---

## agileagentcanvas_graph_community

**Purpose**: Get the wiki summary for a code community (e.g. 'authentication', 'payments') from the graphify knowledge graph. Use BEFORE working in an unfamiliar module to learn the architecture.

**When to use**: Before working in an unfamiliar module; understanding the architecture of the 'authentication' or 'payments' community; getting a high-level overview of a code subsystem.

**When NOT to use**: When `graphify-out/graph.json` does not exist. For specific node-to-node path questions — use `agileagentcanvas_graph_path` instead. For natural-language questions about the codebase — use `agileagentcanvas_graph_query`.

**Example**:
```json
{ "community": "authentication" }
// Output
{ "summary": "Handles OAuth2, session management, and JWT issuance..." }
```

---

## agileagentcanvas_repair_json

**Purpose**: Repair malformed JSON against a BMAD schema. Auto-fills missing required fields, coerces type mismatches, fuzzy-matches invalid enum values (e.g. 'in progress' → 'in-progress'), clamps numeric ranges, picks the best oneOf branch, strips disallowed properties.

**When to use**: When `agileagentcanvas_update_artifact` was REJECTED with validation errors; when the LLM produced incomplete or slightly malformed JSON; before writing JSON to disk if uncertain about schema compliance.

**When NOT to use**: When the JSON is already valid. For YAML conversion — use `agileagentcanvas_yaml_to_json`. For general-purpose JSON manipulation — use `agileagentcanvas_json_merge` or `agileagentcanvas_json_diff`.

**Example**:
```json
{ "data": { "id": "STORY-1", "status": "in progress" }, "schemaName": "story", "strict": false }
// Output
{ "ok": true, "changed": true, "data": { "id": "STORY-1", "status": "in-progress" }, "repairs": ["status: 'in progress' → 'in-progress'"], "repairCount": 1 }
```

---

## agileagentcanvas_frontmatter_extract

**Purpose**: Extract YAML frontmatter from a markdown file as JSON. ALWAYS use this instead of writing a YAML parser or calling Python. Returns `{ frontmatter, body }`.

**When to use**: Parsing the YAML frontmatter of any BMAD workflow .md file; reading frontmatter from story, epic, or requirement markdown files; when you need to inspect metadata without reading the full body.

**When NOT to use**: For plain YAML files — use `agileagentcanvas_yaml_to_json`. For full file content — use `agileagentcanvas_read_file`. When you only need the markdown body — use `agileagentcanvas_read_file` with the frontmatter already stripped.

**Example**:
```json
{ "path": "/repo/resources/_aac/workflows/story-craft.md" }
// Output
{ "frontmatter": { "name": "Story Craft", "phase": 4, "version": "1.0" }, "body": "# Story Craft Workflow\n..." }
```

---

## agileagentcanvas_yaml_to_json

**Purpose**: Convert a YAML string to a JSON object. Use when reading BMAD artifacts stored as .yaml files, or when the LLM emits YAML and you need JSON.

**When to use**: Converting a YAML artifact to JSON; when the LLM outputs YAML but the pipeline expects JSON; reading `sprint-status.yaml` or other BMAD YAML files.

**When NOT to use**: For markdown files with YAML frontmatter — use `agileagentcanvas_frontmatter_extract`. For JSON that just needs validation or repair — use `agileagentcanvas_repair_json`. For JSON diffing or merging — use the dedicated tools instead.

**Example**:
```json
{ "yaml": "status: in-progress\nstoryId: STORY-1-1\n" }
// Output
{ "json": { "status": "in-progress", "storyId": "STORY-1-1" } }
```

---

## agileagentcanvas_json_diff

**Purpose**: Compute a structured diff between two JSON objects. Returns a patch array and a summary `{ added, removed, modified }`. Use instead of reading two files and comparing them in-context — saves ~400 tokens per diff.

**When to use**: Comparing the current state of an artifact against a previous version; diffing two JSON objects returned by different tool calls; verifying that an update changed exactly the fields you intended.

**When NOT to use**: For text or YAML files. When you only need a quick visual comparison. For merging — use `agileagentcanvas_json_merge` instead.

**Example**:
```json
{ "left": { "status": "todo" }, "right": { "status": "done" }, "format": "summary" }
// Output
{ "summary": { "added": [], "removed": [], "modified": ["status"] }, "patch": [{ "op": "replace", "path": "/status", "value": "done" }] }
```

---

## agileagentcanvas_json_merge

**Purpose**: Deep-merge two JSON objects with a configurable strategy. Strategies: `deep` (recursive), `shallow` (top-level only), `right-authoritative` (right wins on conflict), `array-replace` (arrays overwritten, not concatenated).

**When to use**: Combining base artifact JSON with partial update JSON; merging two BMAD artifact fragments; applying a delta to an existing artifact while preserving untouched fields.

**When NOT to use**: For simple one-level updates — spread syntax is sufficient. When you need a diff, not a merge — use `agileagentcanvas_json_diff`. For frontmatter or YAML — use the dedicated extract/convert tools.

**Example**:
```json
{ "left": { "title": "Auth", "status": "todo" }, "right": { "status": "done" }, "strategy": "right-authoritative" }
// Output
{ "result": { "title": "Auth", "status": "done" } }
```
