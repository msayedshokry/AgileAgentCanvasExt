# Agentic runtime: production-readiness plan

> Status: **implemented** on branch `claude/project-state-20e3d8` (2026-11-19), one commit per phase. Baseline: `main` @ `4733513`. See "Outcome" at the end for what was and wasn't verified.

## Goal

Any user who installs the extension can drive the board (Kanban runs, auto-advance, card actions) **reliably with the coding-agent harness they already have installed**. No hidden assumption about which CLI, OS or shell they use, and no unsafe defaults.

"Prod grade" here means:

1. **Works with what's installed.** Claude Code, Codex, Gemini CLI, Copilot (CLI or VS Code LM), OpenCode, Aider and pi are detected, launched headless and produce a verdict. If nothing usable is found, the user gets a clear message with a fix, never a silent fallback.
2. **Correct runs.** Abort stops the agent. A run can't be marked COMPLETED by accident, can't loop forever, and can't run twice on the same card.
3. **Survives reloads.** A VS Code reload mid-run ends in a defined state (re-adopted or cleanly failed), never ghost locks or stalled WIP slots.
4. **Safe by default for strangers.** Permission bypass is opt-in, untrusted workspaces are limited, spend caps are real, and there is a stop-all.
5. **Observable.** Every run has an id, a visible history, redacted traces and surfaced errors.

## Evidence (audit 2026-11-19, two independent read-only passes)

The June audit (`docs/kanban-agentic-os-audit.md`) marks most gaps as resolved. Re-checked against the code, the claims hold up as follows:

| Area | Finding | Evidence |
|---|---|---|
| Harness coverage | Agentic execution supports only `claude, codex, aider, opencode, pi`. There is **no Gemini CLI, Copilot CLI or cursor-agent** path. Headless argv exists only for claude, codex, opencode and pi. A panel-only selection silently falls back to `claude` even when it isn't installed. | `terminal-executor.ts:186-219`, `:330-428` |
| Harness coverage | Shell quoting handles PowerShell and POSIX only. cmd.exe breaks. PS 5.1 mangles inline argv. Short prompts are interpolated into the command line. | `chat-bridge.ts:743-785`, `terminal-executor.ts:384` |
| Safety | Claude always runs with `--dangerously-skip-permissions`. Codex runs with `--ask-for-approval never`. Neither is gated by a setting or by workspace trust. `kanban.autoAdvance` defaults to **true**. | `terminal-executor.ts:344-345,414-423`, `package.json` |
| Safety | Budget caps are never configured outside tests (default 0 = unlimited). The cost log resets on restart. CLI cost is a chars/4 estimate, and UNKNOWN runs record $0. | `budget-enforcer.ts:45`, `cost-tracker.ts:166-177`, `terminal-executor.ts:1310-1323` |
| Safety | `package.json` has no `capabilities.untrustedWorkspaces`. There is no stop-all command. | — |
| Correctness | Abort is checked only between steps. An aborted dev step can synthesize COMPLETED from a file mtime diff, commit, and launch review. | `kanban-orchestrator.ts:144,247`, `terminal-executor.ts:966-990` |
| Correctness | A verdict poll timeout returns UNKNOWN without killing the agent. The lock is force-released, so the retry starts a 2nd agent on the same card. | `terminal-executor.ts:1004-1006,1279`, `kanban-orchestrator.ts:468` |
| Correctness | Verdict files carry no run nonce. The regex fails on nested JSON. UNKNOWN/BLOCKED never feed the circuit breaker. The scheduler re-picks the same failing story with no attempt cap. | `kanban-verdict.ts:78,~125`, `auto-scheduler.ts:323` |
| Correctness | `ArtifactStore.syncToFiles` clears dirty before writing and swallows errors at debug level. It has no mutex. | `artifact-store.ts:1666-1667,1928` |
| Recovery | Run state is in memory only. Locks are always released on restore. Scheduler and harness state is saved only on clean `stop()`. The persisted session has no pid, so the reconnector is dead code. | `concurrency-queue-persistence.ts:105-114`, `autonomy-lifecycle.ts:455,479`, `terminal-executor.ts:1126` |
| Guardrails | `team-orchestrator` bypasses the lock, budget and circuit breaker. | `src/acp/team-orchestrator.ts` |
| Secrets/obs | The AI API key is kept in plain settings. The Gemini key goes in the URL. Traces record raw tool inputs with no redaction or size cap. A2A outbound has no host allowlist (SSRF). The headroom proxy has no token. Temp prompt files are world-readable on POSIX. | `ai-provider.ts:196,721`, `trace-recorder.ts`, `a2a-outbound-client.ts:211`, `in-process-proxy.ts` |
| Tests | Suite: 816 scenarios. `extension.feature:252` is order-dependent: leftover `harness-findings.json` is re-hydrated. The mocked e2e loop doesn't cover abort, reload, hangs or stale verdicts. Lint has 1315 errors. | — |

Already solid: stdin-file prompt delivery with per-shell quoting; stale-verdict delete before launch; transient vs permanent retry classification; circuit breaker half-open; orchestrator `finally` cleanup; iteration cap; CLI pre-flight; tool-loop cap of 20; Jira secrets in SecretStorage.

## Phases

Each phase ships as its own PR off `main`, test-first, and ends green on `check-types` + `test`, with lint not worse. Patch/minor releases follow each phase.

### Phase 1: Harness adapter layer (the core of the goal) [L]

- Replace the `switch` blocks with a **`HarnessAdapter` registry**: one module per harness declaring `id`, `binary`, `detect()` (PATH + `--version` probe, with a timeout), `headlessArgv()`, `promptDelivery` (`stdin` | `file-arg` | `argv`), `permissionFlags(posture)`, `supportsVerdictFile`, and `parseUsage()` when the CLI reports tokens.
- Adapters: claude, codex, **gemini, copilot CLI, cursor-agent**, opencode, aider, pi. Flags are verified against each CLI's current docs and recorded with a link in the adapter. No guessing.
- **VS Code LM fallback** (Copilot/any `vscode.lm` model) as a first-class harness for users with no CLI. It reuses the existing in-chat verdict path.
- Resolution is selected → first available → LM API → **BLOCKED with an actionable message**. The silent `claude` fallback is removed.
- **Always deliver the prompt via a staged file** (mode 0600, workspace-private dir, removed in `finally` and swept on activation). This removes argv interpolation, cmd.exe issues and the PS 5.1 mangling. Shell detection covers pwsh, PS 5.1, cmd, bash/zsh and Git Bash.
- **`Agile Agent Canvas: Check Harnesses`** command and board banner: each harness shows detected version, headless capability and posture, with a "run smoke test" button.
- Tests: a contract test per adapter, plus **fake CLI shims on PATH** (node scripts that echo and write a verdict) exercised on win/mac/linux in CI.

### Phase 2: Safe defaults for public users [M]

- New setting `agileagentcanvas.agents.permissionPosture`: `sandboxed` (default) | `full`. `full` requires a trusted workspace plus a one-time consent modal. Each adapter maps the posture to its own flags.
- `capabilities.untrustedWorkspaces: "limited"`: agent runs, the write tool and A2A are disabled in untrusted workspaces.
- `kanban.autoAdvance` default changes to **false**, plus a first-run explainer.
- Budget settings `budget.perStoryUsd` / `budget.dailyUsd` with non-zero defaults, wired to `budgetEnforcer.setConfig`. The cost log moves to workspace storage and is reloaded on start. Real usage is used when the adapter reports it, otherwise the estimate is labelled "estimated". UNKNOWN runs are counted.
- **Stop all agents** command plus a board button that kills every terminal/PTY and pauses the scheduler.
- The write tool gets a realpath check plus a deny-list (`.git/**`, `.vscode/tasks.json`, `package.json` scripts).

### Phase 3: Run correctness [M]

- Abort propagates via an `AbortSignal` into the poll and executor. The kill is awaited, and nothing commits or launches after abort.
- A poll timeout kills the agent before the lock is released.
- **Run nonce** in the prompt and the verdict file. Mismatched or empty verdicts become UNKNOWN. A real JSON parser replaces the regex. `fix_requests` is schema-validated.
- Remove mtime-synthesized COMPLETED, or require an explicit opt-in per adapter that can't write files.
- UNKNOWN/BLOCKED feed the circuit breaker. A per-story attempt cap with cooldown is added in the scheduler. Approval requests time out.
- `syncToFiles`: a mutex, dirty restored on failure, errors surfaced at warn level plus a toast.
- `team-orchestrator` goes through the same lock, budget and breaker gates.
- Fix the order-dependent `extension.feature:252` (temp output folder per scenario).

### Phase 4: Reload / crash recovery [L]

- Persist the run record (`runId`, story, step, harness, pid, verdict path, startedAt) on every transition, not only on `stop()`.
- On activation, each run record is checked: if the pid is alive and the verdict file is pending, it is **re-adopted** (resume polling); otherwise it is marked `interrupted`, the lock released, and the card returned with a badge.
- Restore locks only for re-adopted runs. Clear scheduler ghost WIP slots. Persist harness findings incrementally and validate them on load.

### Phase 5: Observability and secrets [M]

- A run id on every log/trace line. A **Run history** view (per card: harness, duration, verdict, cost, transcript link).
- Trace redaction (keys, tokens, file bodies over N KB), a size cap alongside age retention, and `.agileagentcanvas-context/traces` added to the generated `.gitignore`.
- AI API keys move to SecretStorage, with migration from settings. The Gemini key goes in the `x-goog-api-key` header.
- A2A host allowlist plus a private-IP/redirect block. The headroom proxy gets a per-session token and an Origin check.

### Exit criteria (whole plan)

- The fake-CLI contract matrix passes on Windows (pwsh, PS 5.1, cmd), macOS and Linux for every adapter.
- A manual smoke run with at least 3 real harnesses (Claude Code, Codex, Gemini CLI) plus the VS Code LM fallback takes a story from backlog to done on Windows and one POSIX OS.
- The new e2e scenarios pass: mid-step abort, reload mid-run, hung agent timeout, stale/foreign verdict, and no harness installed.
- No CRITICAL/HIGH item from the audit table remains open.

## Open decisions

1. Default `permissionPosture`: `sandboxed` (recommended) vs `full`. Sandboxed runs may stall on CLIs whose only headless mode is "approve everything". The adapter must then report `headless: requires-full` and the board asks once.
2. Is Copilot coverage via the **Copilot CLI**, the **VS Code LM API**, or both (recommended: both)?
3. Should lint debt (1315 errors) be a separate track (recommended), not mixed into these PRs?

## Outcome (2026-11-19)

Decisions taken: `sandboxed` is the default posture; Copilot is covered both through the Copilot CLI and the VS Code LM fallback; lint debt stays a separate track.

| Exit criterion | Result |
|---|---|
| Contract matrix across shells/OSes | **Windows** (PowerShell 5.1, pwsh 7, cmd) and **Linux** (bash and sh in WSL Ubuntu) both pass: all 8 adapters × 2 postures, 32/32 per OS, via vitest and `scripts/_demo/harness-contract-cli.ts`. **macOS** runs only in the `harness-contract` CI job, which hasn't run because the branch isn't pushed. |
| Real-CLI smoke run | **Verified with a real model:** Aider in `sandboxed` posture against a local Qwen3.8-27B llama-server wrote its verdict in 188s (`smoke-harnesses.ts sandboxed aider`). The other five installed CLIs launched correctly and received the prompt, but stopped on account state on the dev machine (expired OAuth or keys, retired Gemini client, Codex model not allowed on the plan). **OpenCode verified (2026-11-23):** in `sandboxed` posture against a local Qwen3-4B-Instruct-2507, it wrote its verdict in 630s. This was after two adapter fixes found in these runs: headless permissions (d9d3351) and `--dir` workspace root (ae52fac). Codex on local Qwen2.5-Coder 3B/7B produced the right `apply_patch` call as text that llama-server did not execute. Claude, Codex, Gemini and Pi still need a signed-in rerun. |
| Abort / reload / hung agent / stale verdict / no harness | Unit and integration tests cover all five. **Live VS Code 1.146** (real integrated terminals, pwsh 7) checked with `scripts/_demo/run-live-harness-test.ts`: stdin and pointer harnesses reach COMPLETED with the run id echoed; a real model (Aider + local Qwen3.8-27B) reaches COMPLETED from a real terminal in 209s; abort mid-run returns UNKNOWN "Run aborted" and closes the agent terminal; recovery re-adopts a run whose terminal survived, reports it interrupted when that terminal dies, and moves an orphaned run's card back. |
| No open CRITICAL/HIGH audit item | Addressed in phases 1 to 5, except the CLI cost estimate (still chars/4, now labelled and counted for UNKNOWN runs) and the embedded-pty liveness check. |

Not done: real token usage parsing from CLI output, a run-history webview (a command plus a document is shipped instead), and the lint debt.
