---
name: aac-bmb-workflow
description: 'BMB workflow builder workflows'
---

# BMB workflow Builder

**Goal:** Create, edit, and validate BMAD workflow artifacts.

## Conventions

- Bare paths resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory.
- `{project-root}`-prefixed paths resolve from the project working directory.

## Execution

Read and follow the workflow definitions in `./steps/` directory. Multiple workflow variants are available (create, edit, validate).
