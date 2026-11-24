---
name: 'step-04-coverage-plan'
description: 'Design test coverage, priorities, execution strategy, and estimates'
nextStepFile: './step-05-generate-output.md'
outputFile: '{test_artifacts}/test-design-progress.md'
---

# Step 4: Coverage Plan & Execution Strategy

## STEP GOAL

Create the test coverage matrix, prioritize scenarios, and define execution strategy, resource estimates, and quality gates.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Avoid redundant coverage across test levels

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

## 1. Coverage Matrix

For each requirement or risk-driven scenario:

- Decompose into atomic test scenarios
- Select **test level** (E2E / API / Component / Unit) using `test-levels-framework.md`
- Ensure no duplicate coverage across levels
- Assign priorities (P0–P3) using `test-priorities-matrix.md`
- Map NFR-derived risks to planned validation scenarios and evidence sources
- Use the exact `Risk ID` assigned in the risk register in every `Risk Link` cell. A prose description alone is not a traceable mapping.
- Give every material risk at least one coverage row whose `Test Level` is suitable for that risk under `test-levels-framework.md`. Explain the suitability in the row notes when the level is not obvious. Preserve the risk ID when rows are split across priorities or test levels.

**Priority rules:** decide each priority on business impact, user reach, and workaround
availability. Risk score is supporting evidence and is not a required condition for any priority.
Walk the Priority Decision Tree in `test-priorities-matrix.md` for each scenario.

- P0: Critical business, security, data-integrity, or compliance impact with no safe workaround
- P1: Core, frequent, or complex behavior with material user reach and a limited workaround
- P2: Secondary behavior with narrower user reach and an acceptable workaround
- P3: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround

---

## 2. Execution Strategy (Keep Simple)

Use a **PR / Nightly / Weekly** model:

- **PR**: All functional tests if <15 minutes
- **Nightly/Weekly**: Long-running or expensive suites (perf, chaos, large datasets)
- Avoid re-listing all tests (refer to coverage plan)

---

## 3. Resource Estimates (Ranges Only)

Provide intervals (no false precision):

- P0: e.g., "~25–40 hours"
- P1: e.g., "~20–35 hours"
- P2: e.g., "~10–30 hours"
- P3: e.g., "~2–5 hours"
- Total and timeline as ranges

---

## 4. Quality Gates

Define thresholds:

- P0 pass rate = 100%
- P1 pass rate ≥ 95%
- High-risk mitigations complete before release
- Coverage target ≥ 80% (adjust if justified)

---

### 5. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-04-coverage-plan']
  lastStep: 'step-04-coverage-plan'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-04-coverage-plan'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-04-coverage-plan'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
