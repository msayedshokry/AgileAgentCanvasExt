---
---

# Step 3: Triage

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- Every finding gets a verdict and a sentence or two of evidence. Never drop, merge, or silently skip a finding.

## INSTRUCTIONS

1. **Normalize** findings into a common format. Expected input formats:
   - Blind Hunter (`aac-review-adversarial-general`): markdown list with location, problem, fix, consequence
   - Edge Case Hunter: JSON array with `location`, `trigger_condition`, `guard_snippet`, `potential_consequence` fields (deletion findings add `kind` and `confidence`)
   - Verification Gap: one markdown `###` block per gap plus an optional `## Other findings` list, or the single line `No verification gaps found.`
   - Acceptance Auditor: markdown list with title, AC/constraint reference, and evidence

   If a layer's output does not match its expected format, attempt best-effort parsing. Note any parsing issues for the user.

   Convert all to a unified list where each finding has:
   - `id` -- sequential integer
   - `source` -- the originating layer id: `blind-hunter`, `edge-case-hunter`, `verification-gap`, `acceptance-auditor`, or `verification-gap-spotcheck` (added by triage itself, see below)
   - `title` -- one-line summary
   - `detail` -- full description
   - `location` -- file and line reference (if available)

2. Once every layer has reported -- and not before -- render a verdict on each finding, ahead of any deduplication or grouping. Disregard any severity a reviewing subagent assigned -- they lack the context to grade.

   For each finding:
   - A gap finding from the Verification Gap layer arrives pre-verified -- that layer's evidence rules made it read the tests and run the searches it cites. Skip re-verification (the **Verify the finding's claim** bullet below does not apply to it), render the verdict from the filed evidence, and weigh its filed disposition when routing. Grade a gap by the impact of the regression in its Demonstration, not by the missing test itself. Its `Other findings` are verified like everything else.
   - A **clean** Verification Gap result (`No verification gaps found.`) is a claim, not evidence. It never refutes another layer's finding that a changed behavior is untested; verify that finding normally by searching the tests yourself. And spot-check once per review — also owed when the layer filed only `Other findings`, and when its gaps leave some changed behavior unnamed — when the diff changes deterministic behavior (a branch, limit, default, error path, or data shape):
     1. List the changed deterministic behaviors not already named by a gap finding, and pick the one whose regression would hurt users most. On a tie, prefer one not pinned by a test added in the same diff. Name the alternatives you considered.
     2. Search the tests **in the tree under review** — for a commit, `git grep <symbol> <commit> -- <test globs>`; a test added in a later commit does not count. Search by the behavior's symbol, then by the public entry point that drives it (prop, command, export), and read the hits before concluding; zero hits on an internal name alone proves nothing.
     3. Decide by reading the tests' setup and assertions whether one would fail if the behavior regressed. Running a mutation is optional.
     4. If none would, add a finding with `source` = `verification-gap-spotcheck` naming the behavior, the searches and their hit counts, and grade it like any other.

     One spot-check per review; do not re-run the layer.
   - **Verify the finding's claim.** At the cited file and line, does the bad outcome the reviewer describes actually occur? Read beyond the changed lines -- follow callers, guards upstream, etc. -- until you can answer yes or no. Never grade from the diff hunk alone. A different finding about nearby code does not settle this one. Judge whether the problem is real, not whether the proposed fix is plausible. Code that loudly fails on a situation you never showed the program can reach is correct behavior, not a defect.
   - **Render exactly one verdict** from what verification established -- the verdict is the whole triage decision:
     - `high` (intolerable), `medium` (tolerable), `low` (cosmetic or negligible) -- the bad outcome is real. Grade by how much it hurts end users or developers. For developer-only problems (inconsistent design, eroded invariants, duplicated sources of truth), name where it will cause trouble -- which caller will diverge, which rule will break. A vague "this is messy" with no named harm is not a severity grade; use `false` or `maybe-false` instead. When the harm is real but you cannot tell how bad, pick the higher grade.
     - `false` -- you checked, and the bad outcome does not happen at the cited location. Write what disproves this specific claim. A true fact about nearby code that does not disprove the claim does not count.
     - `maybe-false` -- you could not tell whether the bad outcome happens. Write what you would need to check to find out. Use this only when the diff and surrounding code leave the question open; when they are enough to decide, pick `high`, `medium`, `low`, or `false`.

   **Reject** `false` findings on their refutation.

   **Reject** `low` findings when it is unlikely that users or developers would meet the defect in everyday use (judged plainly -- no proof needed) and the fix is more than a direct correction or deletion -- adding guards, branches, parameters, or other complexity.

   **Reject** any finding whose fix is to edit the spec under review.

   Keep every rejected finding with its reason for the `Rejected` appendix in step 4. All remaining findings continue to grouping.

3. **Group the survivors by shared root cause** -- two findings belong in one entry only when the same defect produced both. Same location alone is not a shared root cause, and neither is a shared fix. An entry carries every member's verified bad outcome in `detail` and the highest verdict among them (`high` > `medium` > `low` > `maybe-false`); set `source` to the contributing layers joined with `+` (e.g., `blind-hunter+edge-case-hunter`).

4. **Route** each entry into exactly one bucket. A group that includes verified `high`, `medium`, or `low` members routes by its highest such verdict -- not to defer just because a member is `maybe-false`.
   - **decision_needed** -- There is an ambiguous choice that requires human input. The code cannot be correctly patched without knowing the user's intent. Only possible if `{review_mode}` = `"full"`.
   - **patch** -- Code issue that is fixable without human input. The correct fix is unambiguous, adds no public surface, and guards no state you did not demonstrate; otherwise `decision_needed`.
   - **defer** -- Pre-existing issue not caused by the current change, real but not actionable now; or an entry whose members are all `maybe-false` and the claim, if true, would be `medium` or `high` -- record that severity marked unverified, plus what would settle it (if it would only be `low`, reject it with the same note); or any entry whose fix edits agent-context files (CLAUDE.md, AGENTS.md, rules, other specs).

   If `{review_mode}` = `"no-spec"` and an entry would otherwise be `decision_needed`, reclassify it as `patch` (if the fix is unambiguous) or `defer` (if not).

5. **Score follow-up need.** Compute `followup_review_recommended` from the `patch` entries: true if any is `high`, or if `3 × (medium count) + 1 × (low count) ≥ 5`. It is arithmetic, not judgment -- report it with the counts in step 4.

6. If `{failed_layers}` is non-empty, report which layers failed before announcing results. If zero entries remain after rejections AND `{failed_layers}` is non-empty, warn the user that the review may be incomplete rather than announcing a clean review.

7. If zero entries remain after triage (all rejected or none raised): state "✅ Clean review — all layers passed." (Step 3 already warned if any review layers failed via `{failed_layers}`.)


## NEXT

Read fully and follow `./step-04-present.md`
