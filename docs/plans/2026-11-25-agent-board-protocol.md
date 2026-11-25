# Agent Board Protocol and Lead Agent

**Status:** Phases 1–3 implemented (2026-11-25), uncommitted; not yet tried with live agent runs. Not built from this design: the brief preview in the Agents dialog, the epic card's "Lead: name" and progress line, and the Cucumber feature file (flows are covered by vitest integration tests instead).

**Where it lives:** `workflow/harness/board-actions.ts` (sanitizers), `agent-brief.ts` (D4), `board-effects.ts` (D2 rules), `lead-plan.ts` (D5 runbook, plan checks, guard); `views/board-protocol.ts` (applier, questions, proposals), `views/lead-coordinator.ts` (lead runs and re-wake); `kanban-orchestrator.ts` `setLeadHandler`.
**Builds on:** named agents, model per agent, Inbox, card Activity feed, follow-up messages (all uncommitted on `claude/multica-github-exploration-99bef4`).
**Reference:** Multica's runtime brief (`server/internal/daemon/execenv/runtime_config_sections.go`) and squads (`apps/docs/content/docs/squads.mdx`). Ideas only; Multica's license does not allow reusing its code.

## Goals

1. **Agents know where they are.** Every board run tells the agent who it is (name, role, model), what the board is, and how to work with it.
2. **Agents can act on the board, safely.** An agent can ask you a question, propose new cards, and hand work to another agent. Nothing it asks for changes the board until the extension has checked it, and nothing that creates work happens without your approval unless you turn that on.
3. **A lead agent (chief of staff).** One agent can be the lead. Work given to the lead is planned and handed out to the other agents; the lead never does the implementation itself, and it picks the next step each time an agent finishes.

## Non-goals

- **A live channel during a run** (MCP server or CLI). v1 works through the verdict file every CLI already writes. The action format is designed so an MCP server can carry the same actions later without changing them ([Phase 4](#phasing)).
- **Agents editing other cards directly.** Agents propose; the extension applies.
- **Remote runtimes.** Agents still run on this machine while VS Code is open (see the "VS Code-bound" decision).
- **Chat with an agent.** The `@agileagentcanvas` chat participant already covers it.

## What exists today (grounding)

| Piece | Where | What it means for this design |
|---|---|---|
| Verdict file, read after the run | `kanban-verdict.ts` (`normalizeVerdict`, `KanbanVerdict { verdict, fixRequests, summary, raw, runId }`) | The only channel from agent to board. Extending it reaches all 8 CLIs at once. |
| Run loop: dev → tests → review → **done** on APPROVED | `kanban-orchestrator.ts` `runAutonomous` | A card finishes without a human. Multica stops at "in review". See [D6](#d6-who-marks-a-card-done). |
| Prompt: verdict contract first, card JSON, workflow, project context, engineering principles | `terminal-executor.ts` `buildTerminalPrompt`, `buildResumePrompt` | No identity, no board protocol. Resumed runs send only a delta. |
| Named agents, model per agent, assignee per card | `agent-team.ts`, `agent-team.json` | Gets `role`, `instructions`, `lead` fields. |
| Goal → proposed stories → review → cards | `goal-decomposer.ts` (`proposedStories`, `approve`, `dispatch` via `persistStory`), `GoalDecomposerModal` | The approval path for agent-proposed cards already exists. |
| Inbox (approvals, stopped runs, paused, autopilots) | `needs-you.ts`, `Inbox.tsx` | Gets two new kinds: question, proposal. |
| Follow-up messages as fix requests, queued until the run ends | `follow-up.ts`, `follow-up-messages.ts` | Answering a question reuses this path. |
| Squad protocol (routing line, handoff notes, gate rework) | `acp/team-orchestrator/squad-protocol.ts` | Chat-side only. The lead reuses its ideas (brief, notes, one rework round), not its code path. |
| Epics with child stories | `artifact-store.ts` `addStory(epicId, story)` | Natural shape for the lead: the lead owns an epic, members own its stories. |

## Decisions

### D1. Channel: a `board` block in the verdict file

The agent writes its board requests into the verdict JSON it already writes:

```json
{
  "verdict": "BLOCKED",
  "summary": "Need the password rules before I can validate input.",
  "board": {
    "questions": [{ "text": "Minimum password length: 8 or 12?" }],
    "proposals": [{ "title": "Add rate limiting to /login", "description": "…", "why": "Found during implementation; out of scope here." }],
    "handoff": { "to": "reviewer", "note": "Login form done; please check the error states." },
    "notes": "Used the existing validator in src/auth/rules.ts."
  }
}
```

- **Why this and not a CLI or MCP server first:** every one of the 8 CLIs can write a file, no process has to stay running, and every request passes one checkpoint (`normalizeVerdict` → a new `sanitizeBoardActions`) before anything happens. Multica's CLI exists because its agents run on other machines. Ours run in the same workspace, so the file is enough for v1.
- **Cost:** actions land when the run ends, not mid-run. For questions this matches what the CLI can do anyway: a headless run can't wait for an answer.
- **Limits:** 3 questions, 5 proposals, 1 handoff, notes up to 2,000 characters, each text field up to 4,000. Anything over is dropped and the card's Activity says so.

### D2. Requests are proposals; the extension applies them with gates

| Request | What happens | Needs you? |
|---|---|---|
| `questions` | Inbox entry (kind **question**) with an answer box. Answering sends a follow-up run in the same conversation (existing follow-up path), with the Q and A as a fix request. The card stays where it is. | Yes, to answer. |
| `proposals` | Become proposed cards on the existing goal-review flow, linked to the card that proposed them. Inbox entry (kind **proposal**). Approve → real story cards, in the same epic. | Yes, unless **Auto-approve agent proposals** is on (off by default). |
| `handoff` | The card is reassigned to the named agent and the note is added to its next prompt. The card's run loop decides when that agent runs (see [Flow C](#flow-c-handoff)). | No. Shown in Activity. |
| `notes` | Saved on the card, shown in Activity, and given to the next agent on this card. | No. |

Unknown agents in `handoff`, empty texts and duplicate proposals are rejected and shown in Activity.

### D3. Agent profile: role and instructions

`agent-team.json` agents gain:

| Field | Purpose | Limit |
|---|---|---|
| `role` | One line: what this agent is for ("Implements stories in the web app"). Shown in the roster other agents and the lead see. | 120 chars |
| `instructions` | The agent's standing rules ("Always add a Playwright test for UI changes"). | 4,000 chars |
| `lead` | `true` for the one lead agent. At most one. | — |

Edited in the Agents dialog. Kept in the team file, so the team is shared through the repo.

### D4. The brief: what every run is told, and where

A new `buildAgentBrief()` produces one section, placed **right after the verdict contract** (which stays first, as today):

1. **You** — name, role, model, CLI. "You are *Dev Agent*, implementing stories."
2. **Your instructions** — the agent's `instructions`, verbatim, marked as the user's.
3. **The board** — what the lanes mean, that this card is yours, what the verdicts do, and that you never move cards or edit other cards' files yourself.
4. **Working with the board** — the `board` block: when to ask a question instead of guessing, when to propose a card instead of widening scope, how to hand off, the limits.
5. **The team** — the roster: id, name, role (so `handoff.to` uses a real id).
6. **Notes on this card** — notes and handoff notes from earlier agents on this card.
7. **Instruction precedence** — the verdict contract and safety rules first, then the workflow definition, then the agent's instructions, then the card. (Multica has the same kind of section; it stops agents treating card text as orders.)

Prompt cache: items 1–5 change rarely and come before the card JSON. Item 6 changes per run, so it sits after the stable part. Resumed runs (`buildResumePrompt`) get only items 6 and any changed roster, since the rest is already in the conversation.

### D5. The lead agent

- **One lead per team**, marked in the Agents dialog. Optional: with no lead, everything works as today.
- **Giving work to the lead:** assign an **epic** (or a goal from the goal box) to the lead. The lead does not run the dev → review loop. It runs a new workflow, `aac-lead-dispatch`, whose only output is a verdict with a `lead` block:

```json
{
  "verdict": "COMPLETED",
  "summary": "Split into 3 stories; Dev Agent starts with the form.",
  "lead": {
    "stories": [{ "ref": "a", "title": "Login form", "description": "…", "acceptance": ["…"] }],
    "assign": [{ "card": "a", "to": "dev", "why": "UI work, Dev Agent's role" }],
    "next": "wait"
  }
}
```

  - `stories` go through the same approval as proposals (D2). Existing stories are referenced by id.
  - `assign` assigns cards to agents and starts runs for the first wave, within WIP limits.
  - `next`: `wait` (re-wake me when an assigned card finishes), `review` (move the epic to review, goal met), or `ask` (with `board.questions`).
- **Re-wake:** when a story under a lead-owned epic leaves its run loop (done, stopped, or blocked), the lead runs again with a delta: which card, its verdict and summary, its notes, and the board state of the epic. It then assigns the next card, re-assigns a stuck one, asks you, or moves the epic to review.
- **Never:** the lead does not implement, does not mark anything done, and cannot assign to itself.
- **Loop guards:** at most 20 lead runs per epic, at most one lead run at a time per epic (later wakes merge into one delta), and a lead run that assigns nothing and asks nothing twice in a row stops with an Inbox entry.

### D6. Who marks a card done

Today APPROVED moves a card to **done** with no human. That stays as it is for stories, because the review agent is the gate and people use it this way. The lead's epic stops at **review**; a person moves it to done. That matches Multica's rule where it matters (the whole piece of work) without slowing every story.

## Flows

### Flow A: a normal card run with the brief

Assign → run → the prompt has the brief → agent works → verdict with optional `board` block → extension sanitizes → notes saved, Activity updated → loop continues as today.

### Flow B: the agent needs an answer

Verdict `BLOCKED` with `board.questions` → card stops with failure "Waiting for your answer" → Inbox **question** entry → you answer → follow-up run in the same conversation with the Q and A → loop continues.

### Flow C: handoff

Verdict `COMPLETED` with `board.handoff` → card reassigned to that agent; the handoff note goes into its next prompt. If the card's loop is still going (dev → review), the new assignee takes the next step in it. If the loop has ended, the card goes back to **ready-for-dev** and the auto-scheduler or you start it.

### Flow D: proposals

Verdict with `board.proposals` → proposals queued on the goal-review model (source: card id, agent) → Inbox **proposal** entry → review in the existing goal review modal → approved ones become stories in the same epic, unassigned (or assigned by the lead, if the epic has one).

### Flow E: the lead

Epic assigned to lead → `aac-lead-dispatch` run → stories proposed (approval) + first assignments → member runs → each finished story wakes the lead with a delta → the lead assigns the next one or moves the epic to review → you mark the epic done.

## Data model changes

| File | Change |
|---|---|
| `agent-team.json` | agents: `role?`, `instructions?`, `lead?` (validated; at most one lead) |
| `kanban-verdict.ts` | `KanbanVerdict.board?: BoardActions`, `KanbanVerdict.lead?: LeadPlan`, sanitized |
| Card metadata | `agentNotes[]` (author, text, at, capped at 20), `leadEpicId?` on stories the lead owns |
| `needs-you.ts` | kinds `question` (with the question texts), `proposal` (with a count and a source card) |
| Run history | `board` summary per run (counts only), shown in Activity |

## UI changes

- **Agents dialog:** Role, Instructions (multi-line), Lead toggle with "one lead per team" explained. A preview of the brief the agent receives (like Multica's "What members receive").
- **Inbox:** question rows with an inline answer box; proposal rows with "Review" (opens the goal review modal on those proposals).
- **Card Activity:** entries for questions asked and answered, proposals, handoffs, notes, and the lead's assignments with their reason.
- **Epic card:** "Lead: Name" and progress (stories done / total).

## Safety

- All agent text is data, never instructions to the extension. It is length-capped, and shown escaped.
- An agent can only reassign the card it ran on (handoff), or cards in its own epic (lead).
- Creating cards needs approval by default. The auto-approve setting is per workspace and off by default.
- Lead loop guards as in D5. Each guard that fires adds an Inbox entry, so stops are never silent.
- No new process or open port in v1.

## Failure modes

| Failure | Behaviour |
|---|---|
| Malformed `board` block | Ignored; the verdict still counts; Activity says what was dropped. |
| `handoff.to` unknown | Not applied; Activity explains; card stays with the current agent. |
| Lead returns nothing usable | Counts toward the "twice in a row" guard; second time → Inbox entry. |
| The assigned agent's CLI is not installed | The run is BLOCKED with the install hint (as today), and the lead is woken with that result. |
| You delete an agent that owns cards | Cards go back to the board default (as today); a lead epic loses its lead and shows "No lead". |

## Testing

- Unit: `sanitizeBoardActions` and `sanitizeLeadPlan` (limits, unknown ids, junk), `buildAgentBrief` (sections, order, cache-stable prefix), lead guards (20 runs, merge, twice-empty), team validation (one lead).
- Integration (vitest with mocked executor): flows A–E end to end on an in-memory store.
- Cucumber: one scenario per flow, in a new `features/agent-board-protocol.feature`.
- Webview: Agents dialog fields, Inbox question and proposal rows, Activity entries.
- Live (yours, in VS Code): one card with a question, one with a proposal, one epic through the lead.

## Phasing

| Phase | Delivers | Size |
|---|---|---|
| 1 | D3 profile fields + D4 brief + `notes` + questions (Flow B) | M |
| 2 | Proposals (Flow D) + handoff (Flow C) | M |
| 3 | Lead agent (D5, Flow E) | L |
| 4 | Optional MCP server carrying the same `board` actions during a run | L |

Each phase ships on its own. Phase 3 needs 1 and 2.

## Decisions (approved 2026-11-25)

1. **Done:** stories stay auto-done on APPROVED; only a lead's epic stops at review for a person (D6).
2. **Proposals:** need approval by default; a per-workspace setting, off by default, auto-approves them (D2).
3. **What the lead takes:** epics, and goals from the goal box (D5).
4. **Scope now:** phases 1–3 together; phase 4 (MCP) later.
