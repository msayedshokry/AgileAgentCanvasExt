# Agents on the Board, Live: tools during a run, skills, triggers, usage, capacity, people, context

**Status:** Built (2026-11-26): A, B and C. Decisions recorded below. A live run in VS Code is still the user's to do.
**Builds on:** [2026-11-25-agent-board-protocol.md](2026-11-25-agent-board-protocol.md) (brief, `board` verdict block, lead), shipped in `bf4f1a9`.
**Reference:** Multica's agent CLI, skills, issue wakeups, usage analytics, runtime concurrency, squads with human members, projects. Ideas only; its license does not allow reusing its code.

## Scope (items 2–10 from the gap list; item 1 is the live check, yours)

| # | Item | Phase |
|---|---|---|
| 2 | Brief preview in the Agents dialog; lead and progress on epic cards | A |
| 3 | Board tools during a run (MCP) | B |
| 4 | Steering a running agent | B |
| 5 | Skills per agent | A |
| 6 | Event triggers | C |
| 7 | Usage per agent | A |
| 8 | Agent capacity | A |
| 9 | People on the team | C |
| 10 | Context attached to epics | C |

## Grounding (checked 2026-11-26)

- No MCP SDK in the extension. MCP over stdio is JSON-RPC 2.0 with `initialize`, `tools/list`, `tools/call`; a small server needs no dependency.
- **Claude Code 2.1.294:** `--mcp-config <file>` loads servers for one run; `--allowedTools` can allow-list `mcp__<server>__*` in the sandboxed posture (which has no shell).
- **Codex 0.163:** `-c mcp_servers.<name>.command=… -c mcp_servers.<name>.args=[…]` registers a server for one run without touching `~/.codex/config.toml` (verified with `codex mcp list`).
- **OpenCode, Gemini, Aider, Pi, Cursor, Copilot:** no per-run MCP override found without writing a config file in the user's workspace or home. They keep the verdict-file channel.
- Skills: 108 skill folders in `resources/_aac/skills/` (each with `SKILL.md` and front matter).
- Run history already records agent, model, tokens, duration and verdict per run (`agent-run-history.jsonl`).
- The orchestrator's `concurrencyQueue` locks per card, not per agent.

## Decisions

### L1. Live channel: a board MCP server, one token per run

- The extension serves a small HTTP endpoint on `127.0.0.1`, random port, started on first use.
- Each CLI run gets a **run token** bound to `{ runId, cardId, agentId }`. It is valid only while that run is going and only for that card (and, for the lead, its epic's stories).
- A bundled stdio shim, `dist/board-mcp.js`, is what the CLI starts. It speaks MCP on stdio and forwards each tool call to the endpoint with the token, passed in an environment variable.
- **Claude Code:** `--mcp-config <run file>` plus `mcp__aac_board__*` in `--allowedTools`. **Codex:** `-c mcp_servers.aac_board.*` overrides.
- **Everything still goes through the same sanitizers and applier as the verdict `board` block** (board-actions.ts, board-effects.ts), so the two channels can't drift. The verdict block stays: it is the only channel for the other six CLIs, and a fallback if the server is unreachable.
- Why not a CLI like Multica's: the sandboxed posture gives Claude no shell, so a CLI would only work in "full" posture. MCP tools work in both.

**Tools** (names as the agent sees them):

| Tool | Does | Notes |
|---|---|---|
| `board_get_card` | The card as it is now, with notes | Read-only |
| `board_list_epic` | The epic's stories, status, assignee | Read-only |
| `board_note` | Adds a note to this card (progress, decisions) | Shows in Activity live |
| `board_ask` | Asks you a question and **waits** for the answer | See L2 |
| `board_propose` | Proposes new cards | Same approval as today |
| `board_check_messages` | Returns messages you sent this card since the run started | Steering, see L3 |
| `board_handoff` | Names the next agent, applied when the run ends | Same rules as today |

### L2. Questions during a run wait for the answer

`board_ask` raises the Inbox question and holds the tool call until you answer, up to **10 minutes**, then returns "No answer yet: end the run with BLOCKED and your question in the verdict". While it waits, the run watchdog counts the call as activity, so a run isn't killed for silence while it's waiting on you.

### L3. Steering through `board_check_messages`

Messages you send while a run is going are kept for that run (today they queue for the next run). The brief tells live-channel agents to call `board_check_messages` between steps. Anything still unread when the run ends becomes the next run's follow-up, as today. For CLIs without the live channel, nothing changes.

### L4. Skills per agent

- Agents get `skills: string[]`: ids from `resources/_aac/skills/` and from the workspace's own skill folders (`.claude/skills/`, `.agents/skills/`).
- The brief lists each skill's name and description with the path to its `SKILL.md` ("read it when the task calls for it"). The content isn't pasted in, so the prompt stays small and works on every CLI.
- Picked in the Agents dialog with a searchable list.

### L5. Event triggers (autopilots)

Autopilots gain an `on` trigger next to `schedule`:

| Event | Source |
|---|---|
| `card.done`, `card.stopped`, `card.needs-answer` | Board progress events, filterable by epic or label |
| `pr.merged`, `pr.checks-failed` | The card PR check that already exists (`gh`), polled every 5 minutes, only for cards that have a PR |
| `goal.approved` | The goal review |

An autopilot with `on` runs its runbook with the event (card id, title, what happened) added to the prompt. One run per event, deduplicated across windows with the existing claim lock.

### L6. Usage per agent

A **Usage** tab in the Agents dialog: per agent, for today, 7 days and 30 days, showing runs, success rate, time spent, tokens in and out, and cards touched. It reads `agent-run-history.jsonl`. See [Decisions](#decisions-for-you) on money.

### L7. Capacity per agent

Agents get `maxConcurrent` (default in [Decisions](#decisions-for-you)). Before a run starts, the orchestrator checks how many runs that agent has going. Over the limit, the card shows "Waiting for Dev (1 of 1 busy)", and it starts when one finishes, in priority order. The lead's 3-start cap stays as a per-run limit.

### L8. People on the team

- Team members gain `kind: 'agent' | 'person'`. A person has a name and role, and no CLI or model.
- A card assigned to a person never starts an agent run. Dragging it to in-progress just moves it, and the run button explains why.
- The lead may assign stories to people (its roster shows them). That raises an Inbox entry, "Chief of Staff assigned you Password reset". When you move that card to done, the lead wakes as for any story.
- No accounts or permissions: "person" means you, or someone you name, on this machine.

### L9. Context attached to epics

- An epic gets **Context**: repo paths, files, URLs and a free-text note. Its stories inherit it.
- The brief gets a "Context for this epic" section listing them with an instruction to read what's relevant. Files are listed, not pasted; URLs are listed as references, and nothing is fetched by the extension.
- Edited in the epic's detail panel.
- Why per epic and not a new "Project" entity: BMAD already groups work as epics, PRD and architecture. A second grouping would compete with it.

### L10. Phase A extras (item 2)

- **Brief preview:** the Agents dialog shows exactly what an agent receives, from the same `buildAgentBrief` the extension uses (sent over a message, not reimplemented).
- **Epic cards** show "Lead: name" and stories done out of total.

## Safety

- The endpoint binds to `127.0.0.1` only. Tokens are 32 random bytes, accepted only while their run is active, and compared in constant time. The token goes to the CLI through an environment variable, never on a command line.
- A token can act only on its own card (the lead: its epic's stories). Every tool input goes through the existing sanitizers and caps.
- The MCP server exposes no file, shell or network tools; just board actions.
- `board_ask` waits at most 10 minutes; at most one `board_ask` is open per run.
- Context URLs are never fetched by the extension.
- Event triggers respect `autopilots.enabled` (user setting, off by default), so a cloned repo can't wire agents to events.

## Failure modes

| Failure | Behaviour |
|---|---|
| Endpoint can't start (port, firewall) | Runs go ahead without the live channel; the brief omits the tools; verdict block still works; the reason is logged once. |
| Shim can't reach the endpoint | Tools return an error saying to use the verdict block. |
| Token reused after the run | Rejected. |
| Agent at capacity | Card waits with a reason. A card waiting over 30 minutes raises an Inbox entry. |
| A skill id no longer exists | Left out of the brief, with a note in the Agents dialog. |
| PR polling fails (`gh` missing) | `pr.*` triggers are listed as unavailable in the autopilot file errors. |

## Testing

- Unit: MCP framing, token scoping and expiry, each tool's checks, `board_ask` wait and timeout, steering queue, skills resolution, trigger matching, usage aggregation, capacity queue, person assignment rules, context in the brief.
- Integration: a real stdio round trip (spawn the shim, call `tools/list` and `board_note`, against the real endpoint on `127.0.0.1`).
- Live, here: the MCP server against **real Claude Code and Codex** with a tiny prompt that only calls `board_note` (my shell can run `codex`; Claude needs your login, so that part is yours).
- Webview: Agents dialog (skills, usage, preview, person members, capacity), epic context editor, epic card lead line.
- Cucumber: one scenario per new flow.

## Phasing

| Phase | Delivers | Size |
|---|---|---|
| A | Skills (L4), usage (L6), capacity (L7), brief preview and epic lead line (L10) | M |
| B | Live channel (L1), questions that wait (L2), steering (L3) | L |
| C | Event triggers (L5), people (L8), epic context (L9) | M–L |

## Decisions (approved 2026-11-26)

1. **Usage:** tokens and time only; no dollars.
2. **Capacity:** 1 run at a time per agent by default; raise it per agent.
3. **`board_ask`:** waits up to 10 minutes for the answer during the run.
4. **Order:** A, then B, then C.
