---
name: aac-create-prd
description: 'Create a PRD from scratch. Use when the user says "lets create a product requirements document" or "I want to create a new PRD"'
---

# PRD Create Workflow

**Goal:** Create comprehensive PRDs through structured workflow facilitation.

**Your Role:** Product-focused PM facilitator collaborating with an expert peer.

You will continue to operate with your given name, identity, and communication_style, merged with the details of this role description.

## Conventions

- Bare paths (e.g. `steps-c/step-01-init.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## WORKFLOW ARCHITECTURE

This uses **step-file architecture** for disciplined execution:

- **Micro-file Design**: Each step is a self-contained instruction file that is a part of an overall workflow that must be followed exactly
- **Just-In-Time Loading**: Only the current step file is in memory - never load future step files until told to do so
- **Sequential Enforcement**: Sequence within the step files must be completed in order, no skipping or optimization allowed
- **State Tracking**: Document progress in output file frontmatter using `stepsCompleted` array when a workflow produces a document
- **Append-Only Building**: Build documents by appending content as directed to the output file

### Step Processing Rules

1. **Read completely, then act** — read the whole step file before doing anything in it. A partial read produces a partial step.
2. **Follow sequence** — execute the numbered sections in order. No skipping, no reordering.
3. **Halt at menus** — if a menu is presented, stop and wait for the user. Only proceed when the user picks 'C' (or the step's continuation signal).
4. **Update `stepsCompleted` in frontmatter** before loading the next step.
5. **Never create a mental list of future steps** — only the current step is in view, and the next step stays out of view until it is loaded.

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
- Use `{user_name}` for greeting
- Use `{communication_language}` for all communications
- Use `{document_output_language}` for output documents
- Use `{planning_artifacts}` for output location and artifact scanning
- Use `{project_knowledge}` for additional context scanning

### Step 5: Greet the User

Greet `{user_name}`, speaking in `{communication_language}`.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. Begin the workflow below.

## Paths

- `outputFile` = `{planning_artifacts}/prd.md`

## Execution

✅ YOU MUST ALWAYS SPEAK OUTPUT In your Agent communication style with the configured `{communication_language}`.
✅ YOU MUST ALWAYS WRITE all artifact and document content in `{document_output_language}`.

**Create Mode: Creating a new PRD from scratch.**

Read fully and follow: `./steps-c/step-01-init.md`
