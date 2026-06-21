---
name: aac-to-json
description: 'Convert markdown artifacts to structured JSON format. Use when the user says "convert to json" or "convert markdown to JSON"'
---

# Convert Markdown to JSON Workflow

**Goal:** Convert BMAD markdown artifacts into structured JSON output files validated against the BMAD schemas.

**Your Role:** Headless artifact converter. Parse markdown files, extract structured fields, map them to the matching BMAD schema, and write JSON output. No conversational confirmation — proceed directly.

## Conventions

- Bare paths (e.g. `steps/step-01-discover.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## On Activation

### Step 1: Resolve the Workflow Block

Run: `python3 {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --key workflow`

**If the script fails**, resolve the `workflow` block yourself by reading these three files in base → team → user order and applying the same structural merge rules as the resolver:

1. `{skill-root}/customize.toml` — defaults
2. `{project-root}/_bmad/custom/{skill-name}.toml` — team overrides
3. `{project-root}/_bmad/custom/{skill-name}.user.toml` — personal overrides

Any missing file is skipped. Scalars override, tables deep-merge, arrays of tables keyed by `code` or `id` replace matching entries and append new entries, and all other arrays append.

### Step 2: Execute Prepend Steps

Execute each entry in `{workflow.activation_steps_prepend}` in order before proceeding.

### Step 3: Load Persistent Facts

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs under `{project-root}` — load the referenced contents as facts. All other entries are facts verbatim.

### Step 4: Load Config

Load config from `{project-root}/_bmad/bmm/config.yaml` and resolve:

- `project_name`, `user_name`
- `communication_language`, `document_output_language`
- `planning_artifacts`, `implementation_artifacts`
- `date` as system-generated current datetime
- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- JSON keys and field structure remain English; only human-readable values localize per `{document_output_language}`

### Step 5: Greet the User

Greet `{user_name}`, speaking in `{communication_language}`.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. Begin the workflow below.

## Paths

- `output_folder` = `{planning_artifacts}/json` (parallel to source markdown artifacts)
- `schemas_dir` = `{bmad-path}/schemas`

## Input Files

| Input | Path | Load Strategy |
|-------|------|---------------|
| Markdown artifacts | whole: `{planning_artifacts}/*.md`, sharded_index: `{planning_artifacts}/*/index.md`, sharded_single: `{planning_artifacts}/*/*.md` | INDEX_GUIDED |
| Schemas | `{schemas_dir}/{bmm\|cis\|tea\|common}/*.schema.json` | SELECTIVE_LOAD |
| Project context | `{project_root}/project-context.md` (optional) | FULL_LOAD (if exists) |

## Execution

<workflow>

<step n="1" goal="Discover markdown artifacts">
  <action>Load {project_context} for project-wide patterns and conventions (if exists)</action>
  <action>Communicate in {communication_language} with {user_name}</action>
  <action>Scan {planning_artifacts} recursively for `.md` files matching artifact patterns:</action>

  - `epic*.md`, `*epic*/index.md`, `*epic*/epic-*.md`
  - `stories/*.md`, `*story*.md`
  - `prd*.md`, `*prd*/index.md`
  - `architecture*.md`, `*arch*/index.md`
  - `test-design*.md`, `test-strategy*.md`
  - `*ux*.md`, `ux/*.md`
  - `*brief*.md`, `product-brief.md`

  <action>For each discovered file, classify by type:</action>

  - Match filename pattern → schema (e.g., `epic-*.md` → `bmm/epics.schema.json`)
  - Read YAML frontmatter `type:` field if present
  - Apply content-based heuristics (e.g., `## Acceptance Criteria` → `bmm/story.schema.json`)

  <action>Report discovery summary to {user_name}: {{discovered_count}} artifacts across {{type_count}} types</action>
</step>

<step n="2" goal="Pair artifacts with schemas">
  <action>For each classified artifact, load its matching schema from {schemas_dir}</action>
  <action>Verify the schema file exists; mark artifacts with no resolvable schema as `skip`</action>
  <action>Store mapping: {{artifact_path}} → {{schema_path}} + {{type}}</action>
</step>

<step n="3" goal="Parse markdown to JSON">
  <action>For each (artifact, schema) pair, parse markdown into JSON by following the established BMAD conversion rules:</action>

  - Capture ALL content from the source — never summarize or truncate
  - Separate user-story fields always into `asA`, `iWant`, `soThat`
  - Full acceptance criteria — always use `given`, `when`, `then`, `and[]`
  - Full requirement descriptions — always include `id`, `title`, AND complete `description`
  - Use only fields defined in the schema; do NOT add fields not in the schema

  <action>Validate the produced JSON against the schema (using ajv or built-in JSON Schema validator)</action>
  <check if="validation fails">
    <output>Schema validation failed for {{artifact_path}}: {{first_validation_error}}</output>
    <action>Record failure; continue to next artifact</action>
  </check>
  <action>On success, write JSON to `{output_folder}/{{original_basename}}.json` (preserve original basename; create `json/` directory if it does not exist)</action>
</step>

<step n="4" goal="Report completion and next steps">
  <action>Build summary: {{count_converted}} converted, {{count_failed}} failed, {{count_skipped}} skipped (no schema)</action>
  <action>For failed items, list file path + first validation error so they can be re-run after repair</action>
  <action>Display output folder location to {user_name}</action>
  <action>Recommend next workflow: if conversion succeeded, suggest loading `aac-agent-canvas-integrator` (Morph) to visualize the JSON output in the Agile Agent Canvas</action>
</step>

</workflow>

## Conversion rules reference

When in doubt about a specific field, mirror the rules enforced by `aac-agent-canvas-integrator`:

- **Always separate** user-story fields into `asA` / `iWant` / `soThat` (even if source markdown is one paragraph).
- **Always expand** acceptance criteria into `given[]` / `when[]` / `then[]` / `and[]` arrays.
- **Always include** requirement `id`, `title`, AND full `description`.
- **Never invent** fields not present in the matching schema — if the source has more, raise a warning and cap at the schema.
- **Never truncate** — if a field exceeds schema cardinality limits (e.g., `description.maxLength`), record it as a failure and continue.

## Related skills

- `aac-agent-canvas-integrator` (agent) — interactive counterpart that wraps this conversion workflow with scanning, validation, and canvas visualization import. **Use this agent** when an end-user drives a conversion interactively (Morph commands SF/SC/CS/CA/CF/CT). **Use this workflow (`aac-to-json`)** for headless / batch conversions.
- `aac-document-project` (workflow) — for the upstream "discover a brownfield project" workflow that produces the input markdown artifacts.
