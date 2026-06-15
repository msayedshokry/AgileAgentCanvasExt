# Kanban Agentic OS — Deep Audit Report

> Generated: June 2026
> Status: 23 GitHub issues created (#30–45, #23–29)

## Architecture Summary

The system has **17 backend modules** wired through `autonomy-lifecycle.ts`, a **KanbanOrchestrator** that drives autonomous story execution, a **LaneTransitionEngine** for manual card drags, and a **webview (React)** that renders the Kanban board with live agent badges, scheduler controls, budget gauge, dependency badges, goal submission, terminal output viewer, and detail panel.

### Backend Module Map

```
autonomy-lifecycle.ts (orchestrator — wires 17 modules)
├── agent-health-monitor.ts      — polls session health checks
├── auto-recovery.ts             — kills terminals / releases locks on 'dead'
├── auto-scheduler.ts            — poll-based story picker + runner
├── scheduler-state-persistence.ts — saves/restores scheduler to disk
├── scheduler-webview-controls.ts — pause/resume/stop IPC bridge
├── budget-enforcer.ts           — per-story + daily budget caps → webview gauge
├── circuit-breaker.ts           — opens after N failures → webview toast
├── auto-retry-engine.ts         — classifies errors → retries transient
├── failure-classifier.ts        — pattern-based error classification
├── goal-decomposer.ts           — LM goal → stories pipeline → webview modal
├── dependency-auto-resume.ts    — auto-transitions stories on blocker done
├── dependency-graph.ts          — DAG builder for story dependencies
├── kanban-dep-visualizer.ts     — badge data (Blocked by N) → webview
├── terminal-executor.ts         — CLI agent spawning (Claude, Codex, etc.)
├── terminal-recovery.ts         — scans orphans on activation
├── terminal-health-checks.ts    — liveness / output-progress / artifact-change
├── autonomous-git.ts            — branch/commit/PR automation
├── kanban-orchestrator.ts       — dev→review→done auto-loop
├── lane-transitions.ts          — card drag rules + manual execution
└── cost-tracker.ts              — LLM cost estimation → budget data
```

### IPM Message Map (Extension → Webview)

| Type | Source | Webview Handler | Status |
|------|--------|----------------|--------|
| `updateArtifacts` | store.onDidChangeArtifacts | ✅ `setItems` | ✅ |
| `agentStateUpdated` | kanbanProgress / backlog flush | ✅ `agentState` merge | ✅ |
| `transitionResult` | laneTransitionEngine | ✅ `pendingTransitions` + toast | ✅ |
| `autoAdvanceState` | kanban:setAutoAdvance | ✅ toggle | ✅ |
| `chatSessionState` | active-session | ✅ disable/enable Resume | ✅ |
| `schedulerState` | scheduler-webview-controls | ✅ AutonomyBar | ✅ |
| `budgetStatus` | budgetEnforcer broadcast | ✅ Budget gauge | ⚠️ only on startup |
| `goalSubmitted` | goalDecomposer | ✅ toast | ✅ |
| `goalReadyForReview` | goalDecomposer | ✅ GoalDecomposerModal | ✅ |
| `goalReviewed` | goalDecomposer | ✅ close modal | ✅ |
| `goalDispatched` | goalDecomposer | ✅ refresh board | ✅ |
| `circuitStatus` | circuitBreaker events | ⚠️ only toast on `open` | ⚠️ partial |
| `systemicIssue` | crossArtifactDetector | ✅ AutonomyBar banner | ✅ |
| `updateDependencyBadges` | autonomy-lifecycle | ✅ depBadges merge | ✅ |
| `kanban:wipLimits` | message-handler | ✅ wipLimits state | ✅ |
| `terminalOutput` / `terminalOutputAppend` | terminal-executor | TerminalModal | ✅ |
| `goalSubmitError` | goalDecomposer | ✅ error toast | ✅ |
| `agentInfo` | message-handler | ✅ DetailPanel | ✅ |
| `gitBranch` / `gitCommit` / `gitPR` | autonomy-lifecycle | ❌ no handler | ❌ |
| `goalStoryPersisted` | autonomy-lifecycle | ❌ no handler | ❌ |
| `budgetStatus` during runs | costTracker.record | ❌ only on mount | ❌ |
| `circuitStatus` on startup | circuitBreaker.getStatus | ❌ never broadcast | ❌ |

---

## 🔴 CRITICAL Issues

### 1. runStepGuarded uses executeLaneTransition instead of executeAndAwaitVerdict
**File:** kanban-orchestrator.ts:195-215
**GitHub:** #30

`runStepGuarded` calls `this.executor.executeLaneTransition()` which is the **in-chat streaming** API. For autonomous terminal-based runs, it should call `terminalExecutor.executeAndAwaitVerdict()` which polls the verdict file. Currently, autonomous terminal runs launched through the orchestrator won't produce structured verdicts — they stream to a chat session that doesn't exist in autonomous mode.

**Impact:** The orchestrator's dev→review→done loop breaks for terminal-based autonomous execution. Verdict is always undefined → UNKNOWN → stops.

### 2. Auto-retry retries permanent failures
**File:** kanban-orchestrator.ts:196-203
**GitHub:** #31

The circuit breaker and budget checks `throw new Error()` inside the retry work function. The auto-retry engine classifies all errors as `'transient'` by default. "Circuit breaker open" and "budget exceeded" get retried with exponential backoff (1s, 2s, 4s) before giving up.

**Impact:** 3 unnecessary retry delays wasting time on conditions that won't resolve.

### 3. No health monitoring for in-chat agent sessions
**File:** terminal-executor.ts:458-468 vs kanban-orchestrator.ts:120-136
**GitHub:** #32

Health checks are only registered for terminal-based execution. When a Copilot Chat session runs a workflow via `executeLaneTransition`, there is zero health monitoring — if the LLM hangs or the stream stalls, nothing detects it.

**Impact:** In-chat autonomous runs can hang indefinitely with no recovery.

### 4. Terminal reconnector is a permanent no-op
**File:** autonomy-lifecycle.ts:206
**GitHub:** #33

`terminalSessionRecovery.setReconnector()` returns `true` without re-attaching terminal streams. After VS Code restart, orphaned sessions appear active but are actually dead.

**Impact:** Ghost agents — user sees running badge but receives no output.

---

## 🟠 MAJOR Issues

### 5. Token estimation is character-based, not actual
**File:** ai-provider.ts:335-342
**GitHub:** #23

Cost tracking uses `estimateTokens(content)` which divides character count by 4. This is ±50% inaccurate. Real token counts from the LM API (`response.usage`) are never captured.

### 6. No event-driven scheduler wake-up on budget reset
**Files:** auto-scheduler.ts, budget-enforcer.ts:107
**GitHub:** #34

`budgetEnforcer.unpause()` doesn't notify the scheduler. It waits for the next poll interval (up to 30s) before resuming.

### 7. Scheduler state persistence doesn't restore story queue
**File:** scheduler-state-persistence.ts:60-99
**GitHub:** #35

`restore()` never calls `autoScheduler.setStories()` with persisted `state.queue` IDs. Scheduler starts empty after restart until next artifact change event.

### 8. Circuit breaker doesn't broadcast initial status on startup
**File:** autonomy-lifecycle.ts:128-137
**GitHub:** #36

Budget enforcer broadcasts on startup, but circuit breaker only listens for future events. Webview is blind to open circuits from previous session.

### 9. extractDependencyData passes undefined fromStatus
**File:** autonomy-lifecycle.ts:188-192
**GitHub:** #37

All stories with `toStatus: 'done'` trigger auto-resume checks for dependents on activation, even if they were already done.

### 10. inferRoleFromWorkflow duplicated in 2 files
**Files:** terminal-executor.ts:665-676, agentic-kanban-message-handler.ts:576-586
**GitHub:** #38

Two identical role map functions. Adding a workflow to one misses the other.

---

## 🟡 MODERATE Issues

### 11. No webview handler for autonomy broadcasts
**Files:** autonomy-lifecycle.ts broadcasts, AgenticKanbanApp.tsx handlers
**GitHub:** #24

`circuitStatus`, `systemicIssue`, `gitBranch/Commit/PR` broadcasts may not have explicit handlers — messages silently dropped.

### 12. Goal decomposer fallback is opaque
**File:** autonomy-lifecycle.ts:355-368
**GitHub:** #25

When no LM is available, falls back to a single story with no user notification of degraded mode.

### 13. No cancel/abort for orchestrator runs
**File:** kanban-orchestrator.ts:67-168
**GitHub:** #26

Once `runAutonomous` starts, the webview's "Abandon" button only releases the lock — doesn't signal the orchestrator to stop its loop.

### 14. Budget status broadcast only fires once at startup
**File:** autonomy-lifecycle.ts:126
**GitHub:** #27

After startup, the gauge only updates when the webview explicitly requests `getBudgetStatus`. Goes stale during autonomous runs.

### 15. Terminal health isAlive() hardcoded to true
**File:** terminal-executor.ts:458
**GitHub:** #28

Process liveness always returns 'healthy'. Only `onDidCloseTerminal` detects death — SIGKILL or crash misses detection.

### 16. ConcurrencyQueuePersistence doesn't verify stale locks
**File:** concurrency-queue-persistence.ts
**GitHub:** #29

Restored locks don't check if the terminal is still alive. Combined with the no-op reconnector, artifacts can be blocked indefinitely.

### 17. errMsg() helper duplicated in 7+ files
**Files:** autonomy-lifecycle.ts, kanban-orchestrator.ts, lane-transitions.ts, terminal-executor.ts, agentic-kanban-message-handler.ts, agentic-kanban-view-provider.ts, and more
**GitHub:** #39

### 18. No end-to-end test for autonomous loop
**GitHub:** #40

No test exercises: scheduler picks → orchestrator runs dev → verdict COMPLETED → review → APPROVED → done → git PR.

---

## 🔵 MINOR Issues

### 19. No TypeScript strict null checks on store access
**GitHub:** #41

Store typed as `any` throughout with `(as any)` casts everywhere. No compile-time safety.

### 20. Cost tracking sessionId defaults to 'chat-session'
**File:** ai-provider.ts:340
**GitHub:** #42

All in-chat LLM calls share one session ID. Per-workflow cost breakdowns impossible.

### 21. Harness findings never persisted across restarts
**File:** autonomy-lifecycle.ts:91
**GitHub:** #43

`accumulatedFindings` is in-memory only. Cross-artifact correlation starts from scratch on every activation.

### 22. extractDependencyData rebuilds entire story universe — no debouncing
**File:** autonomy-lifecycle.ts:282-307
**GitHub:** #44

Every `onDidChangeArtifacts` triggers a full O(n) walk. Multiple rapid changes cascade.

### 23. CostTracker.record() never called for terminal CLI execution
**GitHub:** #45

Only `streamChatResponse()` records costs. Terminal agents (Claude Code, Codex) bypass this entirely — budget gauge doesn't track them.

---

## Summary by Layer

| Layer | Modules | Wired | Tested | # Issues |
|-------|---------|-------|--------|----------|
| **Orchestration** | KanbanOrchestrator, LaneTransitionEngine | ✅ | Partial | 4 (#1, #2, #13, #18) |
| **Scheduling** | AutoScheduler, SchedulerPersistence | ✅ | ✅ | 2 (#6, #7) |
| **Guardrails** | CircuitBreaker, BudgetEnforcer, AutoRetry | ✅ | ✅ | 4 (#5, #8, #14, #23) |
| **Health** | AgentHealthMonitor, AutoRecovery, TerminalChecks | ✅ | Partial | 2 (#3, #15) |
| **Recovery** | TerminalRecovery, TerminalPersistence | ✅ | ✅ | 2 (#4, #16) |
| **Git** | AutonomousGit | ✅ | Mocked | 0 |
| **Dependencies** | DependencyGraph, AutoResume, DepVisualizer | ✅ | ✅ | 2 (#9, #22) |
| **Goals** | GoalDecomposer | ✅ | ✅ | 1 (#12) |
| **Failure** | FailureClassifier | ✅ | ✅ | 0 |
| **IPC** | Broadcast/Message handlers | ✅ | — | 3 (#11, #17, #20) |
| **Webview** | React Kanban UI | Partial | — | 3 (#11, #13, #21) |
| **Quality** | Types, Testing, Persistence | — | — | 3 (#19, #21, #18) |

## Top 5 Fixes for True Agentic OS

1. Fix `runStepGuarded` to use `executeAndAwaitVerdict` for terminal paths (#1 / #30)
2. Add health monitoring for in-chat agent sessions (#3 / #32)
3. Implement real terminal stream reconnection (#4 / #33)
4. Add orchestrator abort signal + webview cancel integration (#13 / #26)
5. Fix auto-retry to classify permanent vs transient errors (#2 / #31)
