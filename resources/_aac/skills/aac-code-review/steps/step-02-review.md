---
failed_layers: '' # set at runtime: comma-separated list of layers that failed or returned empty
---

# Step 2: Review

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- The Blind Hunter subagent receives the diff only — no spec, no context docs. "Blind" means blind to intent, not to the codebase: it may read the project to confirm a finding.
- The Edge Case Hunter subagent receives diff and project read access.
- The Verification Gap subagent receives diff and project read access (it must read tests and search the repo).
- The Acceptance Auditor subagent receives diff, spec, and context docs.
- All review subagents must run at the same model capability as the current session.
- Run subagents synchronously: launch them together as blocking calls awaited in this turn — never backgrounded or detached, never ending the turn to await results.
- Launch every active layer before reading any layer's result. Never serialize the fan-out.

## INSTRUCTIONS

1. If `{review_mode}` = `"no-spec"`, note to the user: "Acceptance Auditor skipped — no spec file provided."

2. Launch all active layers simultaneously as subagents without conversation context. If subagents are not available, generate prompt files in `{implementation_artifacts}` — one per reviewer role below, each self-contained with the diff inlined — and HALT. Ask the user to run each in a separate session (ideally a different LLM) and paste back the findings. When findings are pasted, resume from this point and proceed to step 3.

   - **Blind Hunter** (`blind-hunter`) — receives `{diff_output}` only. Invoke via the `aac-review-adversarial-general` skill.

   - **Edge Case Hunter** (`edge-case-hunter`) — receives `{diff_output}` and read access to the project. Invoke via the `aac-review-edge-case-hunter` skill.

   - **Verification Gap** (`verification-gap`) — receives `{diff_output}` and read access to the project. Asks "if this behavior broke, would any test fail?" and reports untested behavior changes rather than bugs. Invoke via the `aac-review-verification-gap` skill.

   - **Acceptance Auditor** (`acceptance-auditor`, only if `{review_mode}` = `"full"`) — receives `{diff_output}`, the content of the file at `{spec_file}`, and any loaded context docs. Its prompt:
     > You are an Acceptance Auditor. Review this diff against the spec and context docs. Check for: violations of acceptance criteria, deviations from spec intent, missing implementation of specified behavior, contradictions between spec constraints and actual code. Output findings as a Markdown list. Each finding: one-line title, which AC/constraint it violates, and evidence from the diff.

3. **Subagent failure handling**: If any subagent fails, times out, or returns empty results, append the layer name to `{failed_layers}` (comma-separated) and proceed with findings from the remaining layers. The Verification Gap layer's exact line `No verification gaps found.` is a valid clean result, not an empty one.

4. Collect all findings from the completed layers, keeping track of each finding's originating layer id.


## NEXT

Read fully and follow `./step-03-triage.md`
