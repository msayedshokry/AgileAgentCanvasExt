---
name: aac-party-mode
description: 'Orchestrates group discussions between installed BMAD agents, enabling natural multi-agent conversations where each agent is a real subagent with independent thinking. Use when user requests party mode, wants multiple agent perspectives, group discussion, roundtable, or multi-agent conversation about their project.'
---

# Party Mode

Facilitate roundtable discussions where BMAD agents participate as **real subagents** — each spawned independently via the Agent tool so they think for themselves. You are the orchestrator: you pick voices, build context, spawn agents, and present their responses. In the default subagent mode, never generate agent responses yourself — that's the whole point. In `--solo` mode, you roleplay all agents directly.

## Why This Matters

The whole point of party mode is that each agent produces a genuinely independent perspective. When one LLM roleplays multiple characters, the "opinions" tend to converge and feel performative. By spawning each agent as its own subagent process, you get real diversity of thought — agents that actually disagree, catch things the others miss, and bring their authentic expertise to bear.

## Arguments

Party mode accepts optional arguments when invoked:

- `--model <model>` — Force all subagents to use a specific model (e.g. `--model haiku`, `--model opus`). When omitted, choose the model that fits the round: use a faster model (like `haiku`) for brief or reactive responses, and the default model for deep or complex topics. Match model weight to the depth of thinking the round requires.
- `--solo` — Run without subagents. Instead of spawning independent agents, roleplay all selected agents yourself in a single response. This is useful when subagents aren't available, when speed matters more than independence, or when the user just prefers it. Announce solo mode on activation so the user knows responses come from one LLM.
- `--mode auto|session|subagent|agent-team` — Pick the orchestration mode. `auto` (default) inspects the runtime and picks the best available: `subagent` if the Agent tool is available, `session` if it is not. `session` is a synonym for `--solo`. `subagent` spawns each agent as an independent subagent (the original mode). `agent-team` uses a coordinated team of agents that share a working memory and a task queue, if the runtime supports it (see `aac-validate-max-parallel-workflow` for capability detection). Modes are explicit when the user wants determinism; `auto` is the safe default.
- `--party <name>` — Load a custom party from `{project-root}/_bmad/custom/parties/<name>.toml`. Custom parties pin a specific roster and (optionally) named rooms. If omitted, the full installed roster is available.
- `--room <name>` — Load a named room from the active party. Rooms are pre-curated sub-rostes with optional scene prompts (e.g. "code review crew", "architecture panel", "PM-dev QA"). Requires `--party`.
- `--memory on|off` — Toggle party memory persistence (see "Party Memory" below). `on` resumes a prior session with prior context; `off` keeps the cast ephemeral. Default: `on` for named parties, `off` for ad-hoc casts.
- `--save-party` — Persist the current ad-hoc cast (the agents picked in this session so far) as a new named party. The user is asked for a name and a one-line description.

## On Activation

1. **Parse arguments** — check for `--model`, `--solo`, `--mode`, `--party`, `--room`, `--memory`, `--save-party` flags from the user's invocation.

2. Load config from `{project-root}/_bmad/core/config.yaml` and resolve:
  - Use `{user_name}` for greeting
  - Use `{communication_language}` for all communications

3. **Resolve the agent roster** by running:

    ```bash
    python3 {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key agents
    ```

    The resolver merges four layers in order: `_bmad/config.toml` (installer base, team-scoped), `_bmad/config.user.toml` (installer base, user-scoped), `_bmad/custom/config.toml` (team overrides), and `_bmad/custom/config.user.toml` (personal overrides). Each entry under `agents` is keyed by the agent's `code` and carries `name`, `title`, `icon`, `description`, `module`, and `team`. Build an internal roster of available agents from those fields.

4. **Load custom party or room** (if `--party` or `--room` was set):
  - Custom party file: `{project-root}/_bmad/custom/parties/<name>.toml` (or `~/_aac/parties/<name>.toml` for user-scoped). A party file declares `party_members = [{code, role, scene?}, ...]` and optionally `party_groups = {<room_name>: {members: [...], scene: "..."}}`. See "Custom Parties and Named Rooms" below for the full schema.
  - If the file is missing, fall back to the full roster and warn the user once.
  - When `--room` is set, narrow the active cast to the room's `members` and prepend the room's `scene` to every subagent prompt for the duration of the room.

5. **Resolve the orchestration mode** (if `--mode` was set, or via `auto`):
  - `auto` (default): inspect the runtime. If the Agent tool is available, use `subagent`. Else fall back to `session`. The chosen mode is announced once on activation.
  - `session`: same as the legacy `--solo` flag — one LLM roleplays all selected agents.
  - `subagent`: spawn each selected agent as its own subagent. The original mode; the default before `--mode` was added.
  - `agent-team`: require a runtime that supports coordinated agent teams with shared working memory. If unavailable, warn once and fall back to `subagent`.

6. **Open party memory** (if `--memory on` or the active party has a memory dir):
  - `memory_dir` = `{project-root}/.aac/party-memory/<party_id>/` (or the path declared in the party file). `party_id` is the custom party name when `--party` is set, else `adhoc-<date>`.
  - If a prior `summary.md` exists, load it as background context. Use it to keep the prior session's positions, decisions, and unresolved threads alive — do not re-litigate them; reference them.
  - During the session, append notable turns to `transcript.mdl` (append-only).
  - On exit, write or update `summary.md` with: the user's original topic, the agents who spoke, the positions taken, the open threads, and the next-step prompt for whoever picks this up next.

7. **Load project context** — search for `**/project-context.md`. If found, hold it as background context that gets passed to agents when relevant.

8. **Welcome the user** — briefly introduce party mode (mention the active mode, the active party/room if any, and whether memory is on). Show the full active cast (icon + name + one-line role) so the user knows who's available. Ask what they'd like to discuss.

## The Core Loop

For each user message:

### 1. Pick the Right Voices

Choose 2-4 agents whose expertise is most relevant to what the user is asking. Use your judgment — you know each agent's role and identity from the manifest. Some guidelines:

- **Simple question**: 2 agents with the most relevant expertise
- **Complex or cross-cutting topic**: 3-4 agents from different domains
- **User names specific agents**: Always include those, plus 1-2 complementary voices
- **User asks an agent to respond to another**: Spawn just that agent with the other's response as context
- **Rotate over time** — avoid the same 2 agents dominating every round

### 2. Build Context and Spawn

For each selected agent, spawn a subagent using the Agent tool. Each subagent gets:

**The agent prompt** (built from the resolved roster entry):
```
You are {name} ({title}), a BMAD agent in a collaborative roundtable discussion.

## Your Persona
{icon} {name} — {description}

## Discussion Context
{summary of the conversation so far — keep under 400 words}

{project context if relevant}

## What Other Agents Said This Round
{if this is a cross-talk or reaction request, include the responses being reacted to — otherwise omit this section}

## The User's Message
{the user's actual message}

## Guidelines
- Respond authentically as {name}. Your voice, ethos, and speech pattern all come from the description above — embody them fully.
- Start your response with: {icon} **{name}:**
- Speak in {communication_language}.
- Scale your response to the substance — don't pad. If you have a brief point, make it briefly.
- Disagree with other agents when your perspective tells you to. Don't hedge or be polite about it.
- If you have nothing substantive to add, say so in one sentence rather than manufacturing an opinion.
- You may ask the user direct questions if something needs clarification.
- Do NOT use tools. Just respond with your perspective.
```

**Spawn all agents in parallel** — put all Agent tool calls in a single response so they run concurrently. If `--model` was specified, use that model for all subagents. Otherwise, pick the model that matches the round — faster/cheaper models for brief takes, the default for substantive analysis.

**Solo mode** — if `--solo` is active, skip spawning. Instead, generate all agent responses yourself in a single message, staying faithful to each agent's persona. Keep responses clearly separated with each agent's icon and name header.

### 3. Present Responses

Present each agent's full response to the user — distinct, complete, and in their own voice. The user is here to hear the agents speak, not to read your synthesis of what they think. Whether the responses came from subagents or you generated them in solo mode, the rule is the same: each agent's perspective gets its own unabridged section. Never blend, paraphrase, or condense agent responses into a summary.

The format is simple: each agent's response one after another, separated by a blank line. No introductions, no "here's what they said", no framing — just the responses themselves.

After all agent responses are presented in full, you may optionally add a brief **Orchestrator Note** — flagging a disagreement worth exploring, or suggesting an agent to bring in next round. Keep this short and clearly labeled so it's not confused with agent speech.

### 4. Handle Follow-ups

The user drives what happens next. Common patterns:

| User says... | You do... |
|---|---|
| Continues the general discussion | Pick fresh agents, repeat the loop |
| "Winston, what do you think about what Sally said?" | Spawn just Winston with Sally's response as context |
| "Bring in Amelia on this" | Spawn Amelia with a summary of the discussion so far |
| "I agree with John, let's go deeper on that" | Spawn John + 1-2 others to expand on John's point |
| "What would Mary and Amelia think about Winston's approach?" | Spawn Mary and Amelia with Winston's response as context |
| Asks a question directed at everyone | Back to step 1 with all agents |

The key insight: you can spawn any combination at any time. One agent, two agents reacting to a third, the whole roster — whatever serves the conversation. Each spawn is cheap and independent.

## Keeping Context Manageable

As the conversation grows, you'll need to summarize prior rounds rather than passing the full transcript to each subagent. Aim to keep the "Discussion Context" section under 400 words — a tight summary of what's been discussed, what positions agents have taken, and what the user seems to be driving toward. Update this summary every 2-3 rounds or when the topic shifts significantly.

## When Things Go Sideways

- **Agents are all saying the same thing**: Bring in a contrarian voice, or ask a specific agent to play devil's advocate by framing the prompt that way.
- **Discussion is going in circles**: Summarize the impasse and ask the user what angle they want to explore next.
- **User seems disengaged**: Ask directly — continue, change topic, or wrap up?
- **Agent gives a weak response**: Don't retry. Present it and let the user decide if they want more from that agent.

## Exit

When the user says they're done (any natural phrasing — "thanks", "that's all", "end party mode", etc.), give a brief wrap-up of the key takeaways from the discussion and return to normal mode. Don't force exit triggers — just read the room.

If `--memory on` (or the active party has a memory dir), on exit:

- Write a `summary.md` capturing the topic, the cast, the positions taken, the open threads, and a "next time, you might want to..." prompt.
- Append a one-line entry to `{memory_dir}/index.mdl` with the date, the topic, and a link to the summary.
- Do not prompt the user about the memory write — the user opted in by setting `--memory on` or by selecting a party that has a memory dir. Silent write is the right default.

## Custom Parties and Named Rooms

A custom party is a TOML file that pins a roster and, optionally, named rooms (sub-rosters with scene prompts). This is what makes party mode replayable across sessions and sharable across a team.

### File location

- Team-scoped: `{project-root}/_bmad/custom/parties/<name>.toml`
- User-scoped: `~/_aac/parties/<name>.toml`

### Schema

```toml
[party]
id = "code-review-crew"
description = "Five adversarial lenses for code review"
memory_dir = "{project-root}/.aac/party-memory/code-review-crew"  # optional; default = .aac/party-memory/<id>

# Optional scene prompt prepended to every subagent prompt for this party
default_scene = "You are an adversarial reviewer. Be specific. Cite files and line numbers. No 'looks good to me'."

# Pinned members (any agents from the installed roster)
party_members = [
  { code = "dev", role = "lead reviewer" },
  { code = "qa", role = "test integrity" },
  { code = "architect", role = "boundary discipline" },
  { code = "pm", role = "scope and spec alignment" },
  { code = "tea", role = "test architecture and NFRs" },
]

# Optional named rooms (sub-rosters with their own scene)
[party_groups.architecture-panel]
description = "Architect, senior dev, and PM to evaluate a structural change"
members = ["architect", "dev", "pm"]
scene = "You are reviewing an architectural change. Pressure-test the change against the spine. Flag any altitude this changes."

[party_groups.ship-it]
description = "Dev and QA, fast-twitch, focused on what blocks the next deploy"
members = ["dev", "qa"]
scene = "You are about to ship. The user wants the smallest list of things that block a clean deploy. No scope creep. No architecture debates."
```

### Loading rules

- `--party code-review-crew` loads the roster. With `--memory on` (or the party's `memory_dir` set), prior context is loaded.
- `--party code-review-crew --room architecture-panel` narrows the cast to the room's `members` and prepends the room's `scene`.
- The full installed roster is always available by omitting `--party`. Custom parties and rooms are conveniences, not restrictions.
- A missing party file is not fatal; the orchestrator falls back to the full roster and warns once.

### Saving a custom party

`--save-party` writes the current ad-hoc cast (the agents picked in this session so far, with their roles as the user has heard them) to a new party file. The user is asked for a name and a one-line description. Saved parties show up in the catalogue like other party-mode configurations.
