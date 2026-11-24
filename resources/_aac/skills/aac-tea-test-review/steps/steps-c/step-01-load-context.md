---
name: 'step-01-load-context'
description: 'Load knowledge base, determine scope, and gather context'
nextStepFile: './step-02-discover-tests.md'
knowledgeIndex: '{bmad-path}/skills/aac-agent-tea/testarch/tea-index.csv'
outputFile: '{test_artifacts}/test-review.md'
---

# Step 1: Load Context & Knowledge Base

## STEP GOAL

Determine review scope, load required knowledge fragments, and gather related artifacts.

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

## 1. Determine Scope and Stack

Use `review_scope`:

- **single**: one file
- **directory**: all tests in folder
- **suite**: all tests in repo

If unclear, ask the user.

**Stack Detection** (for context-aware loading):

Read `test_stack_type` from `{config_source}`. If `"auto"` or not configured, infer `{detected_stack}` by scanning `{project-root}`:

- **Frontend indicators**: `playwright.config.*`, `cypress.config.*`, `package.json` with react/vue/angular
- **Backend indicators**: `pyproject.toml`, `pom.xml`/`build.gradle`, `go.mod`, `*.csproj`, `Gemfile`, `Cargo.toml`
- **Both present** → `fullstack`; only frontend → `frontend`; only backend → `backend`
- Explicit `test_stack_type` overrides auto-detection

---

### Deterministic Knowledge Selection

The fragment list for this step is a closed set. Start empty, evaluate the complete conditions under **Load Knowledge Base**, and add every fragment from each matching list. A config flag opens a branch only when every stack, runner, package, and relevance condition on that branch also matches. Do not add fragments from tier labels, index descriptions, nearby mentions, general usefulness, or possible future need. Deduplicate while preserving the order below. Identical facts and config must produce an identical list.

## 2. Load Knowledge Base

From `{knowledgeIndex}` load:

Read `{config_source}` and check `tea_use_playwright_utils`, `tea_use_pactjs_utils`, `tea_pact_mcp`, and `tea_browser_automation` to select the correct fragment set.

**Core:**

- `test-quality.md`
- `data-factories.md`
- `test-levels-framework.md`
- `selective-testing.md`
- `test-healing-patterns.md`
- `selector-resilience.md` (skip for mobile reviews: Maestro uses native accessibility IDs, not DOM selectors)
- `timing-debugging.md`

**If the review set contains a Maestro flow (`.yaml`/`.yml` under `maestro/` or `.maestro/`, or `*.flow.yaml` or `*.flow.yml`):**

- `maestro-flows.md`: required to judge flows against Maestro syntax and semantics (determinism, isolation, assertions that can fail)
- `mobile-test-strategy.md`: required to judge whether a flow belongs at the device level at all

**If Playwright Utils is enabled, installed, and the reviewed files run on the Playwright runner:**

- `playwright-utils-mandate.md`: required to flag hand-rolled code that duplicates an installed playwright-utils capability without a stated deviation
- `overview.md`, `api-request.md`, `network-recorder.md`, `auth-session.md`, `intercept-network-call.md`, `recurse.md`, `log.md`, `file-utils.md`, `burn-in.md`, `network-error-monitor.md`, `fixtures-composition.md`

**If Playwright Utils is disabled and the reviewed files run on the Playwright runner:**

- `fixture-architecture.md`
- `network-first.md`
- `playwright-config.md`
- `component-tdd.md`
- `ci-burn-in.md`

**Playwright CLI (if `tea_browser_automation` is "cli" or "auto" and the reviewed files run on the Playwright runner):**

- `playwright-cli.md`

**MCP Patterns (if `tea_browser_automation` is "mcp" or "auto"):**

- (existing MCP-related fragments, if any are added in future)

**Pact.js Utils (if enabled, `@seontechnologies/pactjs-utils` is in `package.json`, and contract tests are in review scope):**

- `pactjs-utils-overview.md`, `pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`, `pact-consumer-di.md`, `pact-consumer-framework-setup.md`, `pact-broker-webhooks.md`

**Contract Testing (if Pact.js Utils is disabled or not installed, and contract tests are in review scope):**

- `contract-testing.md`

**Pact MCP (if tea_pact_mcp is "mcp" and contract tests are in review scope):**

- `pact-mcp.md`

---

## 3. Gather Context Artifacts

If available:

- Story file (acceptance criteria)
- Test design doc (priorities)
- Framework config

Summarize what was found.

Coverage mapping and coverage gates are out of scope in `test-review`. Route those concerns to `trace`.

---

## 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it using the workflow template (if available) with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-01-load-context']
  lastStep: 'step-01-load-context'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-01-load-context'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-01-load-context'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

**Update `inputDocuments`**: Set `inputDocuments` in the output template frontmatter to the list of artifact paths loaded in this step (e.g., knowledge fragments, test design documents, configuration files).

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
