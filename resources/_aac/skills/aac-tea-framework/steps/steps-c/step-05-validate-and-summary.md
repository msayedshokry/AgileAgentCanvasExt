---
name: 'step-05-validate-and-summary'
description: 'Validate against checklist and summarize'
outputFile: '{test_artifacts}/framework-setup-progress.md'
---

# Step 5: Validate & Summarize

## STEP GOAL

Validate framework setup and provide a completion summary.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Validation

Validate against `checklist.md`:

- Preflight success
- Directory structure created
- Config correctness
- Fixtures/factories created
- Docs and scripts present

Fix any gaps before completion.

---

## 2. Completion Summary

Report:

- Framework selected
- Artifacts created
- Next steps (install deps, run tests)
- Knowledge fragments applied

---

### 3. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-05-validate-and-summary']
  lastStep: 'step-05-validate-and-summary'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-05-validate-and-summary'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-05-validate-and-summary'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

## SAVE JSON ARTIFACT

**CRITICAL — Do this before reporting completion:**

Read the complete `{outputFile}` working document, then call `agileagentcanvas_update_artifact` to persist the final structured artifact:

```
agileagentcanvas_update_artifact({
  type: "test-framework",
  id: "{project_name}-test-framework",
  changes: { /* all content fields extracted from the working document, following the test-framework schema */ }
})
```

- Schema reference: `{bmad-path}/schemas/tea/test-framework.schema.json` — use `agileagentcanvas_read_file` to read it if you need to verify field names
- The `changes` object must conform to the test-framework schema — do NOT wrap content in a `content` key
- **Only call this after validation is complete** — do not skip checklist validation in step 1
- If the tool call is rejected (schema mismatch), fix the field and retry

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
