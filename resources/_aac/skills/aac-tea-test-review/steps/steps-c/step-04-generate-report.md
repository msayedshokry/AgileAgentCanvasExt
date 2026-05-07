---
name: 'step-04-generate-report'
description: 'Create test-review report and validate'
outputFile: '{test_artifacts}/test-review.md'
---

# Step 4: Generate Report & Validate

## STEP GOAL

Produce the test-review report and validate against checklist.

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

## 1. Report Generation

Use `test-review-template.md` to produce `{outputFile}` including:

- Score summary
- Critical findings with fixes
- Warnings and recommendations
- Context references (story/test-design if available)
- Coverage boundary note: `test-review` does not score coverage. Direct coverage findings to `trace`.

---

## 2. Polish Output

Before finalizing, review the complete output document for quality:

1. **Remove duplication**: Progressive-append workflow may have created repeated sections — consolidate
2. **Verify consistency**: Ensure terminology, risk scores, and references are consistent throughout
3. **Check completeness**: All template sections should be populated or explicitly marked N/A
4. **Format cleanup**: Ensure markdown formatting is clean (tables aligned, headers consistent, no orphaned references)

---

## 3. Validation

Validate against `checklist.md` and fix any gaps.

- [ ] CLI sessions cleaned up (no orphaned browsers)
- [ ] Temp artifacts stored in `{test_artifacts}/` not random locations

---

## 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it using the workflow template (if available) with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-04-generate-report']
  lastStep: 'step-04-generate-report'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-04-generate-report'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-04-generate-report'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

---

## 5. Completion Summary

Report:

- Scope reviewed
- Overall score
- Critical blockers
- Next recommended workflow (e.g., `automate` or `trace`)

## SAVE JSON ARTIFACT

**CRITICAL — Do this before reporting completion:**

Read the complete `{outputFile}` working document, then call `agileagentcanvas_update_artifact` to persist the final structured artifact:

```
agileagentcanvas_update_artifact({
  type: "test-review",
  id: "{project_name}-test-review",
  changes: { /* all content fields extracted from the working document, following the test-review schema */ }
})
```

- Schema reference: `{bmad-path}/schemas/tea/test-review.schema.json` — use `agileagentcanvas_read_file` to read it if you need to verify field names
- The `changes` object must conform to the test-review schema — do NOT wrap content in a `content` key
- **Only call this after the Completion Summary step is done** — do not skip any earlier steps
- If the tool call is rejected (schema mismatch), fix the field and retry

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
