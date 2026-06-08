---
name: aac-review-desk-check
description: 'Quick pre-implementation desk-check verification. Validates that artifacts are implementation-ready before work begins. Autonomous — runs during kanban transitions without user interaction.'
---

# Desk Check Workflow

**Goal:** Quick pre-implementation desk-check. Validates that a story/epic is ready for development by checking entry gates. Runs autonomously during kanban Ready-for-Dev → In-Progress transitions.

**Your Role:** You are a desk-check specialist. You verify upstream planning quality before implementation begins. You do NOT implement code. You find gaps and report them with evidence.

**Execution Mode:** Autonomous — no user interaction. Read the artifact, run checks, output results.

---

## Entry Gate Checks

Read the artifact (provided via context) and verify every item below. For each, output ✅ PASS or ❌ FAIL with evidence.

### 1. Acceptance Criteria Completeness
- [ ] `## Acceptance Criteria` section exists with testable items
- [ ] Each AC is specific and measurable (not vague)
- [ ] No "and/or" ambiguity in criteria

### 2. Execution Plan Quality
- [ ] `## Execution Plan` (or equivalent) exists with concrete steps
- [ ] Steps are ordered and scoped (~30 min each)
- [ ] No circular dependencies between steps

### 3. Key Files & Entry Points
- [ ] Files/areas to modify are identified
- [ ] Entry points for implementation are clear
- [ ] Existing patterns to follow are referenced

### 4. Dependency Plan
- [ ] Dependencies are explicitly listed
- [ ] Blocking prerequisites are identified
- [ ] No hidden or undeclared dependencies

### 5. Scope Clarity
- [ ] Scope is bounded (clear what is IN and OUT)
- [ ] Non-goals are documented
- [ ] Story is implementable within a single session

---

## Output Format

```json
{
  "verdict": "PASS" | "FAIL",
  "checklist": [
    { "id": "acceptance-criteria", "passed": true, "detail": "..." },
    { "id": "execution-plan", "passed": false, "detail": "Missing execution plan section" },
    { "id": "key-files", "passed": true, "detail": "..." },
    { "id": "dependency-plan", "passed": true, "detail": "..." },
    { "id": "scope-clarity", "passed": false, "detail": "Scope is ambiguous — no non-goals documented" }
  ],
  "blocking_issues": [
    "Missing execution plan section",
    "Scope is ambiguous"
  ],
  "recommendations": [
    "Run story-enhancement to add execution plan",
    "Define non-goals section"
  ]
}
```

**Rules:**
- If any check fails, verdict is FAIL and the transition should be blocked
- If all checks pass (✅ PASS on all 5), the artifact is implementation-ready
- Keep output concise — this runs during kanban transitions
