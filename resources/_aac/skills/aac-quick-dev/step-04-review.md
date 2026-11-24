---
deferred_work_file: '{implementation_artifacts}/deferred-work.md'
specLoopIteration: 1
---

# Step 4: Review

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- Review subagents get NO conversation context.
- All review subagents must run at the same model capability as the current session.
- Run subagents synchronously: launch them together as blocking calls awaited in this turn — never backgrounded or detached, never ending the turn to await results. Spawn every reviewer before reading or reacting to any of their output.

## INSTRUCTIONS

Change `{spec_file}` status to `in-review` in the frontmatter before continuing.

### Construct Diff

Read `{baseline_commit}` from `{spec_file}` frontmatter. If `{baseline_commit}` is missing or `NO_VCS`, use best effort to determine what changed. Otherwise, construct `{diff_output}` covering all changes — tracked and untracked — since `{baseline_commit}`.

Do NOT `git add` anything — this is read-only inspection.

### Review

Launch four subagents simultaneously without conversation context. If no sub-agents are available, generate four review prompt files in `{implementation_artifacts}` — one per reviewer role below, each self-contained with the diff inlined — and HALT. Ask the human to run each in a separate session (ideally a different LLM) and paste back the findings.

- **Blind hunter** — receives `{diff_output}` only. No spec, no context docs. "Blind" means blind to intent, not to the codebase: it may read the project to confirm a finding. Invoke via the `aac-review-adversarial-general` skill.
- **Edge case hunter** — receives `{diff_output}` and read access to the project. Invoke via the `aac-review-edge-case-hunter` skill.
- **Verification gap** — receives `{diff_output}` and read access to the project. Reports behavior changes no test would catch. Invoke via the `aac-review-verification-gap` skill.
- **Acceptance auditor** — receives `{diff_output}`, `{spec_file}`, and read access to the project. Must also read the docs listed in `{spec_file}` frontmatter `context`. Checks for violations of acceptance criteria, rules, and principles from the spec and context docs.

### Classify

1. Once every reviewer has reported — and not before — render a verdict on each finding, ahead of any deduplication or grouping. Disregard any severity a reviewer assigned — they lack the context to grade.

   If `## Review Triage Log` in `{spec_file}` already has rows — a loopback or a resumed review — check each finding against them first. Same location and same claim as a logged row, and the code there still reads as the row describes: keep the row's verdict and route, write the row again with `carried` in front of the evidence, skip verification, and never patch or defer it again. Verify everything else as below.

   For each finding:
   - A gap finding from the verification-gap reviewer arrives pre-verified — it read the tests and ran the searches it cites. Skip re-verification, render the verdict from the filed evidence, and weigh its filed disposition when routing. Its `Other findings` are verified like everything else.
   - **Verify the finding's claim.** At the cited file and line, does the bad outcome the reviewer describes actually occur? Read beyond the changed lines — follow callers, guards upstream, etc. — until you can answer yes or no. A different finding about nearby code does not settle this one. Code that loudly fails on a situation you never showed the program can reach is correct behavior, not a defect.
   - **Render exactly one verdict:**
     - `high` (intolerable), `medium` (tolerable), `low` (cosmetic or negligible) — the bad outcome is real. For developer-only problems, name where it will cause trouble. A vague "this is messy" with no named harm is not a severity grade. When the harm is real but you cannot tell how bad, pick the higher grade.
     - `false` — you checked, and the bad outcome does not happen at the cited location. Write what disproves this specific claim.
     - `maybe-false` — you could not tell. Write what you would need to check to find out. Use only when the diff and surrounding code leave the question open.
   - Every finding gets one row in a `## Review Triage Log` section of `{spec_file}` (create it if missing) — verdict plus its evidence in a sentence or two; never drop, merge, or silently skip one.

   Reject `false` findings on their refutation.

   Reject `low` findings when it is unlikely that users or developers would meet the defect in everyday use and the fix is more than a direct correction or deletion — adding guards, branches, parameters, or other complexity.

   Out of scope: reject or defer a finding as out of scope only when the intent itself excludes it — not because the spec's scope section, the plan, or the shape of the diff says so. If only those would exclude it, keep the finding: it routes to intent_gap or bad_spec, never to patch or defer.

   Reject any finding whose fix is to edit this run's spec.

2. Group the survivors by shared root cause — two findings belong in one entry only when the same defect produced both. Same location alone is not a shared root cause, and neither is a shared fix. An entry carries every member's verified bad outcome and the highest verdict among them (`high` > `medium` > `low` > `maybe-false`).

3. Route each entry into exactly one category. A group that includes verified `high`, `medium`, or `low` members routes by its highest such verdict. The first three are **this story's problem** — caused or exposed by the current change. The last is **not this story's problem**.
   - **intent_gap** — caused by the change; cannot be resolved from the spec because the captured intent is incomplete. Do not infer intent unless there is exactly one possible reading.
   - **bad_spec** — caused by the change, including direct deviations from spec. The spec should have been clear enough to prevent it. When in doubt between bad_spec and patch, prefer bad_spec — a spec-level fix is more likely to produce coherent code.
   - **patch** — caused by the change; its smallest fix is trivial, adds no public surface, and guards no state you did not demonstrate. A finding whose smallest fix fails any of those routes to intent_gap when the spec does not settle that fix, otherwise to bad_spec.
   - **defer** — pre-existing issue not caused by this story; or an entry whose members are all `maybe-false` and the claim, if true, would be `medium` or `high` — record that severity marked unverified, plus what would settle it (if it would only be `low`, reject it with the same note); or any entry whose fix edits agent-context files (CLAUDE.md, AGENTS.md, rules, etc).

4. Process entries in cascading order. If intent_gap or bad_spec entries exist, they trigger a loopback — lower entries are moot since code will be re-derived. If neither exists, process patch and defer normally. Increment `{specLoopIteration}` on each loopback. If it exceeds 5, HALT and escalate to the human.
   - **intent_gap** — Root cause is inside `<frozen-after-approval>`. Before reverting, save the attempted change as a patch file under `{implementation_artifacts}` and name it in your output, so the human can `git apply` it instead of re-running. Revert code changes. Loop back to the human to resolve. Once resolved, read fully and follow `./step-02-plan.md` to re-run steps 2–4.
   - **bad_spec** — Root cause is outside `<frozen-after-approval>`. Before reverting code: extract KEEP instructions for positive preservation (what worked well and must survive re-derivation). Revert code changes. Read the `## Spec Change Log` in `{spec_file}` and strictly respect all logged constraints when amending the non-frozen sections that contain the root cause. Append a new change-log entry recording: the triggering finding, what was amended, the known-bad state avoided, and the KEEP instructions. Read fully and follow `./step-03-implement.md` to re-derive the code, then this step will run again.
   - **patch** — Auto-fix with the smallest change that does the job. These are the only findings that survive loopbacks. Then re-run the spec's verification checks, if present; if verification fails and the failure cannot be fixed, HALT and escalate to the human.
   - **defer** — Append one new entry to `{deferred_work_file}`: source spec, a one-sentence summary, and the evidence (for a maybe-false finding, what evidence would settle it). Do not modify existing entries.

## NEXT

Read fully and follow `./step-05-present.md`
