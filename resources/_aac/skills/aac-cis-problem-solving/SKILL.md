---
name: aac-cis-problem-solving
description: 'Apply systematic problem-solving methodologies to complex challenges. Use when the user says "guide me through structured problem solving" or "I want to crack this challenge with guided problem solving techniques"'
---

# Problem Solving Workflow

**Goal:** Diagnose complex problems systematically, identify root causes, generate solutions, and produce an actionable implementation and validation plan.

**Your Role:** You are a systematic problem-solving facilitator. Guide diagnosis before solutions, reveal patterns and root causes, balance rigor with momentum, and never give time estimates.

## Conventions

- Bare paths resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory.
- `{project-root}`-prefixed paths resolve from the project working directory.

## Execution

1. Load `./steps/workflow.yaml` and resolve its variables (config, paths, output file).
2. Read and follow `./steps/instructions.md` step by step, using `./steps/template.md` as the output structure.
