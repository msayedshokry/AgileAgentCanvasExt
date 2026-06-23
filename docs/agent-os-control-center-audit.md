# Agent OS / Control Center — Vision Audit

> **Date:** 2026-06-21 · **Commits:** `25692cd`–`1bcb081` on `chore/architecture-hardening`
> **Scope:** What is missing for the Agentic Kanban to become a *truly autonomous AI-agent OS* — a single-pane control center the user never has to leave — with a built-in terminal-light to watch the fleet of agents.
> **Update (2026-06-21):** §3 / §6 P0 #1–#2 (embedded xterm.js terminal grid) **shipped** across Phases 1–4. Bidirectional input available as opt-in via `agileagentcanvas.agenticKanban.embeddedTerminal`. See [`docs/superpowers/plans/2026-06-19-embedded-agent-terminal-grid.md`](superpowers/plans/2026-06-19-embedded-agent-terminal-grid.md) for the full implementation plan.
> **Relationship to the existing audit:** [`kanban-agentic-os-audit.md`](kanban-agentic-os-audit.md) audits **autonomy correctness** (scheduler → orchestrator → verdict → transition mechanics) and is ~90% resolved. This document audits a *different axis*: the **OS / control-center experience** — observability, intervention, continuous operation, and single-pane completeness. They are complementary; almost nothing here overlaps with that doc.

---

## 0. Scope decision (2026-06-19) — overrides conflicting items below

The owner scoped this explicitly: **ACC targets VS Code users, and it is acceptable for all agents/tasks to stop when VS Code closes.** "Long-running" simply means the user keeps VS Code open. Consequences for this document:

- **Background / off-machine / "run overnight" operation is a non-goal, not a gap.** Treat §6 P2 #11 and the §7 "background autonomy" constraint as *accepted limitations by design*, not work items.
- The autonomy stack being bound to the VS Code window lifetime (§4.3) is **by design**, not a deficiency.
- This nullifies the main strategic reason to adopt Hermes Agent (its persistent off-machine runtime). See the revised verdict in §9.

The control-center priorities that remain fully in scope are the *in-window* ones: the embedded xterm.js terminal grid (§3, §6 P0 #1–#2), in-canvas diff review (§6 P0 #3), and agent intervention (§6 P1 #4–#5).

---

## 1. The vision, restated as testable criteria

"My OS, my dashboard, my control center — I should not need to go away from it." Translated into checkable properties:

1. **Watch** — I can see every running agent live, side by side, with real terminal output (colors, spinners, TUIs rendered correctly), without opening VS Code's terminal panel.
2. **Steer** — I can intervene in a running agent (type to it, approve/deny, inject a correction, take over, kill) from inside the canvas.
3. **Run hands-off** — the system keeps stories flowing backlog → done on its own, recovers from failure, and only interrupts me when it genuinely needs a decision.
4. **Stay** — everything I do during a normal day (review the diff an agent produced, approve a PR, read logs, see cost, re-plan) happens inside the canvas. Leaving it is the exception, not the rule.
5. **Trust** — I can see *why* an agent did what it did, what it's allowed to do, and stop it instantly.

The autonomy engine already satisfies a lot of #3. The control-center experience (#1, #2, #4, #5) is where the gaps are.

---

## 2. What exists today (grounded in code)

| Surface | File | What it does | Limit for the OS vision |
|---|---|---|---|
| Agent execution | `src/workflow/terminal-executor.ts` | Spawns each agent as a **VS Code integrated terminal** (`vscode.window.createTerminal`) running a headless CLI (Claude Code / Codex / Gemini / OpenCode / Aider) | Terminals live *outside* the canvas, in VS Code's panel |
| Output streaming | `terminal-executor.ts:385-414`, `:654` (`attachWebviewStream`) | Taps `terminal.onDidWriteData` and forwards raw chunks to the webview as `terminalOutput` / `terminalOutputAppend` | **Output-only.** No input path back to the agent |
| Terminal viewer | **SHIPPED (2026-06-21):** `webview-ui/src/agentic-kanban/AgentTerminal.tsx` + `TerminalGrid.tsx` | Embedded **xterm.js** multi-pane grid with ANSI/color/TUI rendering. Output-only by default (Option A — `VsCodeTerminalBackend`); bidirectional input opt-in via `agenticKanban.embeddedTerminal` (Option B — `NodePtyTerminalBackend`). Replaces the plaintext `TerminalModal`. | — |
| Fleet list | `src/views/agent-sessions-view-provider.ts` + `webview-ui/src/components/AgentSessionsPanel.tsx` | Sidebar webview aggregating ACP + kanban-progress + terminal + health into status **pills** | Read-only status rows — not live terminals, no interaction |
| Board + live badges | `webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx` | Kanban with agent badges, autonomy bar, budget gauge, dep badges, goal modal, trace panel | Good — this is the strongest part |
| Trace/observability | `TracePanel.tsx` + `src/trace/trace-recorder.ts` | Per-session decision log, crash recovery | Good |
| Autonomy engine | `autonomy-lifecycle.ts` + 17 modules | Scheduler picks → orchestrator dev→review→done loop, guardrails, recovery | Strong; tied to the VS Code window being open |

**Key fact: there is no `xterm.js`, `node-pty`, or `ttyd` dependency anywhere** (verified in both `package.json` files). The "terminal" in the canvas today is a plaintext log mirror, not a terminal.

---

## 3. The headline gap: a real embedded terminal-light (the Terax reference)

**Terax** ([github.com/crynta/terax-ai](https://github.com/crynta/terax-ai), [terax.app](https://terax.app/)) is a 7 MB Tauri 2 + Rust AI-native terminal. Its relevant design choices:

- **Frontend:** React 19 + **xterm.js** for true terminal rendering (true-color, link detection, inline search, multi-tab, background streaming).
- **Backend:** Rust **portable-pty** owns the PTY, filesystem, and process management.
- **Single pane:** terminal + code editor (CodeMirror) + web preview + AI side panel + **git (stage hunks, commit, commit graph)** — "all without leaving your tab."
- **Agents:** multi-agent/sub-agents that run commands and propose edits as **reviewable diffs before touching disk**; plan mode; per-agent system prompts; `TERAX.md` as agent memory (its `CLAUDE.md`).

**What ACC can borrow vs what it can't.** ACC is a VS Code extension, not a standalone Tauri app, so it **cannot and should not** rebuild Terax. But the *front-end pattern* is directly portable and is exactly what's missing:

- **Adopt `xterm.js` inside the canvas webview.** The output feed already exists (`onDidWriteData` → `terminalOutputAppend`). Piping that into an `xterm.js` `Terminal` instead of a `<pre>` instantly fixes ANSI/color/TUI rendering. This is the single highest-leverage change.
- **Render a multi-pane grid**, one `xterm` tile per active agent session, replacing the one-at-a-time modal. The data to drive it already exists in `AgentSessionsViewProvider` (it already enumerates every session from 4 sources).
- **For true bidirectional control**, the harder question (§5): keep `vscode.window.createTerminal` (output-only, can `sendText` but can't cleanly stream stdin to a CLI), **or** move agent processes onto **`node-pty` owned by the extension host** so the webview can both render and *write* to the PTY. Terax chose to own the PTY (in Rust); ACC's equivalent is `node-pty` in the extension host.

---

## 4. Gap analysis across the OS dimensions

### 4.1 Observability — "see the different agents" 🔴 biggest gap

- **SHIPPED (2026-06-21):** Embedded xterm.js multi-agent terminal grid in the canvas, driven by the existing agent state. One live `AgentTerminal` tile per running session, rendered in a `TerminalGrid` with a Board/Terminals toggle in the Agentic Kanban header. The `TerminalBackend` seam swaps between output-only (Option A, default) and bidirectional (Option B, opt-in via `agenticKanban.embeddedTerminal`). See `docs/superpowers/plans/2026-06-19-embedded-agent-terminal-grid.md`.
- **Missing:** a **fleet dashboard** combining live tiles with per-agent metrics (tokens/cost burn rate, iteration N/max, elapsed, current step, health). The data exists across `cost-tracker`, `budget-enforcer`, `agent-health-monitor`, `kanban-orchestrator` — it's just never composed into one view.
- **Present & good:** the Agent Sessions status list, trace panel, budget gauge.

### 4.2 Intervention / control — "steer a running agent" 🔴 major gap

- **SHIPPED (opt-in, 2026-06-21):** **take-over handoff** via "Take Over" button + "Send Command" quick-input on the AgenticDetailPanel. The "Take Over" action switches to terminals view and flashes the agent's tile so the user knows exactly where to type. The "Send Command" input posts `terminal:input` directly to the pty for quick one-liner injections without leaving the board.

### 4.3 Continuous operation — "run autonomously" 🟠 partial

- **Present:** scheduler poll loop (5s), dependency auto-resume, circuit breaker, budget caps, crash-recovery via traces, terminal reattach.
- **Missing:** the autonomy stack is **bound to the VS Code window.** Close the window and the OS stops. There is no background/headless mode, no "keep draining the queue overnight," no wake/sleep schedule (cron), no run-to-empty contract.
- **Missing:** an explicit **"continuous mode" contract** — right now autonomy is a set of reactive modules; there's no single "GO hands-off until the backlog is empty or you need me" switch with a visible state machine (RUNNING / WAITING-ON-HUMAN / BLOCKED / IDLE).
- **Missing:** **attention routing.** When the OS needs a human (UNKNOWN it can't retry, budget hit, circuit open, ambiguous decision), it surfaces a VS Code toast that's easy to miss. There's no in-canvas **"needs you" inbox**, and no out-of-band notification (the environment shows a Telegram channel is configured — a natural escalation path).

### 4.4 Single-pane completeness — "don't make me leave" 🟠 several leaks

What still forces the user out of the canvas today:

| Task | Currently requires | Gap |
|---|---|---|
| **Review the diff an agent produced** | Open files / SCM view in VS Code | ✅ **Resolved.** In-canvas `DiffPanel` renders agent commit diffs with file list + unified diff view. `autonomousGit` now computes and broadcasts structured diff data alongside commit SHAs. |
| **Approve / merge a PR** | GitHub / VS Code | 🟠 No in-canvas PR review |
| **Watch an agent properly** | VS Code terminal panel | 🔴 §3 |
| **Chat with an agent / re-plan** | Copilot Chat panel | 🟡 Separate surface; goal-decomposer modal partly covers planning |
| **See cost detail** | Codeburn dashboard (separate webview) | 🟡 Budget gauge is in-canvas; deep breakdown is not |
| **Change settings** | VS Code settings UI | 🟡 Acceptable, but a quick "control panel" in-canvas would help |

The diff-review gap is the most important: an agent OS where you **can't see what the agents changed** without leaving is not yet a control center.

### 4.5 Safety / governance surface 🟡

- **Present:** `HarnessEngine` policy gates, circuit breaker, budget caps exist in the backend.
- **Missing:** they're largely **invisible and uncontrollable from the canvas.** No "policies" panel, no "this action was blocked by policy X" inline, no kill-switch that's obviously a kill-switch. For a system running auto-approved CLIs against your repo, the safety controls should be front-and-center, not in settings JSON.

---

## 5. The one real architecture decision: who owns the PTY?

Everything in §4.1–4.2 hinges on this. Two viable paths:

**Option A — Keep `vscode.window.createTerminal`, add xterm.js for rendering only.**
- ✅ Low risk, reuses the existing `onDidWriteData` stream; ships the *watch* experience fast.
- ✅ Agents remain visible in VS Code's own terminal too (familiar).
- ❌ **Input is crippled** — `sendText` injects a line but you can't truly drive an interactive CLI; no clean stdin stream.
- ❌ `onDidWriteData` is a proposed/runtime-only API (already guarded in code) — fragile.

**Option B — Move agent processes to `node-pty` owned by the extension host; render with xterm.js; stream stdin+stdout over `postMessage`.**
- ✅ **True bidirectional** terminals in the canvas — type to agents, full TUI fidelity. This is the Terax model (their Rust portable-pty == our node-pty).
- ✅ Decouples agents from the VS Code terminal panel → genuinely "stay in the canvas."
- ✅ Enables headless/background tiles and a real fleet grid.
- ❌ More work; `node-pty` is a native module (needs prebuilds per platform/VS Code Electron ABI) — a real packaging consideration.
- ❌ Loses the "it's also in my VS Code terminal" familiarity (can be mitigated by keeping a "pop to panel" option).

**Recommendation:** **Option A shipped first** (xterm.js rendering of the existing stream + multi-pane grid) — Phases 1–3 complete, delivers the "watch the fleet" headline with zero native-module risk. **Option B shipped as opt-in** (Phase 4) — `NodePtyTerminalBackend` behind the same `TerminalBackend` interface, gated on the `agenticKanban.embeddedTerminal` setting and the node-pty packaging spike (Phase 0, result: GO). The `@electron/rebuild` step in `vscode:prepublish` rebuilds node-pty against Electron 30.4.0 before packaging.

---

## 6. What's missing — prioritized

**🔴 P0 — without these it isn't a control center**
1. ✅ **SHIPPED (2026-06-21): xterm.js terminal rendering** in the canvas (replaces the `<pre>` in `TerminalModal`). ANSI/color/TUI correctness via `@xterm/xterm` + `@xterm/addon-fit`.
2. ✅ **SHIPPED (2026-06-21): Multi-agent terminal grid** — one live `AgentTerminal` tile per session, driven by the existing agent state (`displayItems.filter(is running)`); replaces one-at-a-time `TerminalModal` (deleted). Board/Terminals toggle in the canvas header.
3. ✅ **SHIPPED (2026-06-21): In-canvas diff review** — `autonomousGit.maybeCommit()` now asynchronously computes structured diff data via `git diff-tree --numstat`/`--name-status` + `git show` and fires the new `onCommitDiff` hook. The `autonomyLifecycle` wires it to broadcast `gitDiff` messages with commit SHA, message, per-file additions/deletions/status, and full unified diff text. The webview `DiffPanel` component renders a file list sidebar (color-coded status badges) and a unified diff view with syntax-colored additions/deletions. Appears below the board automatically when a diff arrives.

**🟠 P1 — needed for "stay and steer"**
4. ✅ **SHIPPED (2026-06-21): Agent input / take-over** — "Take Over" button on running agent detail panels switches to terminals view and flashes the specific tile. "Send Command" quick-input lets users inject one-liners directly into the agent's pty without leaving the board view. `TerminalGrid` accepts `focusedSessionId` for scroll-to + flash animation. Extension `kanban:takeOverAgent` handler re-pushes capabilities and jumps to terminal.
5. ✅ **SHIPPED (2026-06-22): Opt-in approval checkpoints** — `kanban.approvalCheckpoints` setting gates pre-flight harness policy evaluation before autonomous step execution. When blocking failures are found, the orchestrator fires `kanban:approvalNeeded` → webview `ApprovalBanner` renders policy failure details with Approve/Deny buttons. `kanbanOrchestrator.resolveApproval()` resolves the pending Promise; denial returns BLOCKED verdict; abort resolves with denial to prevent deadlocks. Layered over auto-approve CLI flags + `HarnessEngine`.
6. ✅ **SHIPPED (2026-06-22): "Continuous mode" switch + state machine** — `kanban.continuousMode` VS Code setting. `AutonomyBar` toggle switch (ON/OFF) starts/stops the scheduler. Color-coded display-state pill (▶ Running green, 🛑 Needs You amber, ⛔ Blocked red, ● Idle gray) surfaces the user-facing autonomy state derived from internal scheduler state + pause reason. `AutoScheduler.pauseForReason()` distinguishes budget/circuit/approval/queue-empty pauses. Only visible when continuous mode is ON. run-to-empty: scheduler auto-pauses on queue-empty in continuous mode only.
7. **"Needs you" inbox + out-of-band notify** (Telegram is already configured) — escalate the cases the OS can't resolve.

**🟡 P2 — completeness & trust**
8. **Fleet dashboard metrics** — per-agent burn rate, iteration, elapsed, health in one view.
9. **In-canvas safety panel** — visible policies, "blocked by policy X" inline, obvious kill-switch.
10. **In-canvas PR review / merge.**
11. **Background/headless operation** beyond the open-window lifetime (research spike — VS Code extension host constraints make true daemonization hard; may need a companion process).

---

## 7. Honest constraints

- **ACC is a VS Code extension, not Tauri.** It can adopt Terax's xterm.js front-end and owned-PTY pattern, but it lives in a webview sandbox (strict CSP, `postMessage` only) and a Node extension host. It can't be a 7 MB standalone app.
- **Background autonomy is genuinely limited.** VS Code does not keep extension hosts running with the window closed. "Run overnight" realistically means "window stays open" or a separate companion service — a real design decision, not a quick fix.
- **`node-pty` is native.** Going to Option B means shipping prebuilt binaries matched to VS Code's Electron ABI across win/mac/linux. Worth it, but it's packaging work.
- **Auto-approval is a double-edged sword.** Today's headless flags maximize autonomy by removing human gates; the OS vision actually needs *optional* gates back. More autonomy and more control are in tension — the answer is a **mode**, not a default.

---

## 8. Suggested next step

If you want, I can turn §6 into a phased, TDD implementation plan (same format as the architecture-hardening plan), front-loading P0 #1–#2 (xterm.js grid) as the first shippable slice — it's the highest-impact, lowest-risk move and reuses streaming plumbing that already exists. The P1 "owns the PTY" decision (Option A vs B) is the one item I'd want your call on before planning that part.

---

## 9. Can Hermes Agent be of use here?

> **Revised verdict (per §0 scope decision): not worth integrating now.** The high-value role for Hermes here was **Pattern 2** — the persistent off-machine runtime that keeps working after VS Code closes — and that is now an explicit non-goal. What remains is **Pattern 1** (Hermes as an OpenAI-compatible provider), which is marginal: ACC already routes 7 providers, and structured, schema-validated artifact generation works *better* against a direct model than a stateful agent that injects its own memory/tools. **Recommendation: don't adopt Hermes now; revisit only if off-machine operation ever comes into scope.** The original analysis is retained below for that contingency.

**Original analysis (pre-scope-decision): yes — but for one specific role, not as a replacement for ACC's engine.**

**What Hermes Agent is** ([github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), MIT, Nous Research, Feb 2026): a self-hosted, persistent, *self-improving* agent runtime. Cross-session multi-level memory, a closed **learning loop** that auto-generates reusable skill documents after complex tasks, 40+ tools, and multi-platform connectors (Telegram, Discord, Slack, WhatsApp, email…). It runs as a long-lived process **on a $5 VPS, Docker, or serverless — not tied to your laptop** — and you talk to it from Telegram while it works remotely.

**The integration surface is unexpectedly cheap.** Two facts make it fit ACC cleanly:

1. **Hermes exposes an OpenAI-compatible HTTP API server** ("any tool that speaks the OpenAI format — Codex, Aider, Cline, Continue, your custom scripts — just works"). ACC *already* has an OpenAI provider with a configurable `baseUrl` (`agileagentcanvas.aiProvider = openai` + `agileagentcanvas.baseUrl`, routed through `ai-provider.ts:streamOpenAI`). So **ACC can use a running Hermes as a model backend with essentially zero new code** — point the base URL at `http://<host>/v1`.
2. **It's provider-agnostic via Nous Portal** (300+ models incl. Claude/GPT/Gemini/DeepSeek/Qwen + a tool gateway) and even supports `copilot`/`copilot-acp` providers — so it composes with, rather than fights, ACC's existing multi-provider routing.

### Where Hermes maps onto the gaps in this audit

| Audit gap | Hermes capability | Fit |
|---|---|---|
| §4.3 / P2 #11 — **runs only while VS Code is open** (the hardest constraint, §7) | Persistent off-machine runtime (VPS/Docker/serverless) | 🟢 **Strong** — this is the thing VS Code fundamentally can't do |
| §4.3 / P1 #7 — **attention routing / "needs you" out-of-band** | Native Telegram/Discord/Slack connectors (you already have Telegram configured) | 🟢 **Strong** |
| No cross-session **semantic memory / learning** | Multi-level memory + closed learning loop that emits skill docs | 🟢 Good — could feed ACC's `aac-*` skill catalogue |
| §4.4 — in-canvas **GitHub/PR** work | Hermes GitHub integration (issues, PRs, Actions, code search, scheduled reports) | 🟡 Overlaps `autonomousGit` — complementary, not a replacement |
| Model access / cost | One Nous subscription → 300+ models, no per-provider keys | 🟡 Optional convenience |

### The three integration patterns, ranked

1. **Hermes as a drop-in AI provider (try this first — near-zero effort).** Point ACC's OpenAI `baseUrl` at a local Hermes API server. Gives ACC chat/workflows Hermes's toolset + memory + model breadth immediately. *Caveat:* Hermes is a **stateful** agent; routing ACC's **structured, schema-validated artifact generation** through it may add noise (its memory/tools can drift output away from strict JSON). Best validated on free `/chat` first, not on `/epics`-style structured output. **Spike before trusting it for workflows.**
2. **Hermes as the always-on background runtime behind ACC's dashboard (the high-value play).** Hermes is the persistent daemon that keeps draining the backlog and pings you on Telegram when VS Code is closed; ACC is the rich control-center UI when you're at your desk. Cleanest seam: both operate over the **same git repo + `.agileagentcanvas-context/` artifacts + trace format** — Hermes picks up work, ACC visualizes it. This directly answers §7's "run overnight" problem without ACC having to build a companion daemon from scratch.
3. **Borrow the concept, build native.** ECC ships an `autonomous-agent-harness` skill that explicitly positions itself as *replacing* standalone frameworks (it names Hermes, AutoGPT) using Claude-Code-native crons/memory/dispatch. That's the buy-vs-build counter-option if you'd rather not run a second runtime.

### The hard caveat — don't create two brains

ACC **already has a full autonomy engine** (`autonomy-lifecycle` + 17 modules: scheduler, orchestrator, guardrails, concurrency locks). Hermes also has orchestration + subagents. If both try to own story execution they will **fight over the same stories and concurrency locks**. So:

- **Do not** use Hermes to replace the kanban orchestrator. Keep ACC as the in-IDE control plane and the owner of the story lifecycle.
- **Do** give Hermes the role ACC is structurally weakest at: the **persistent, off-machine, multi-channel runtime** (Pattern 2) and/or a **powerful tool-using model backend** (Pattern 1).
- **Define one ownership boundary** before any integration: who holds the lock on a story at a given time. The existing `concurrencyQueue` + trace format is the natural arbitration point.

### Recommended next step for Hermes specifically

A **2–4 hour spike**, not a commitment: stand up Hermes locally, expose its API server, set `agileagentcanvas.aiProvider = openai` + `baseUrl` at it, and test (a) a free `/chat` turn and (b) one structured `/stories` generation. That single experiment tells you whether Pattern 1 is viable and de-risks Pattern 2. I can write that spike up as a short, checkable task if you want to pursue it.

---

**Sources:** [Terax (GitHub)](https://github.com/crynta/terax-ai) · [terax.app](https://terax.app/) · [Better Stack: Terax overview](https://betterstack.com/community/guides/ai/terax-ai/) · [Hermes Agent (GitHub)](https://github.com/NousResearch/hermes-agent) · [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/integrations/providers) · [Hermes Agent site](https://hermes-agent.org/)
