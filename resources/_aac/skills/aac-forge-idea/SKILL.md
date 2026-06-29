---
name: aac-forge-idea
description: 'Domain-agnostic Socratic idea pressure-testing. Use when the user has a half-formed idea and wants to harden or kill it cheaply, one question at a time. Supports an adversarial attack mode and optional persona rooms resolved from the installed agent roster. Menu code FI.'
---

# Forge Idea

Pressure-test a half-formed idea through Socratic, one-question-at-a-time interrogation until the idea hardens, proves out, or dies cheaply. The point of forge-idea is **not** to generate more ideas — that is brainstorming's job. The point is to take one idea and see if it survives contact with a hostile interlocutor.

## When to Use

- The user says "I have an idea" / "what do you think of X" / "should I build this" / "forge this" / "FI" / "pressure-test this"
- The user has a half-formed concept that needs sharpening before any planning
- A brainstorming session produced a candidate the user wants to validate
- The user is at the very start of a project and wants to discover the real shape of the problem

Do NOT use for:

- Bulk ideation (use `aac-brainstorming`)
- Implementation details (use `aac-create-architecture` or `aac-spec`)
- Document review (use `aac-advanced-elicitation`)

## Modes

- **Socratic** (default) — one question at a time, deepening. The agent asks; the user answers; the agent reflects and asks the next question that targets the current weakest link.
- **Adversarial** — switch on with `--attack` or by answering "Attack: on" to the mode prompt. The agent's questions become hostile: pre-mortem, red team, kill shot. The user is forced to defend. Best for "I think this is great, prove me wrong."
- **Persona room** — switch on with `--room` or by answering "Room: on". Each question comes from a different persona resolved from the installed agent roster (PM, Dev, QA, Architect, etc.). Multiple agents, in turn, attack the idea from their angle. Best for cross-functional validation.
- **Combined** — `--attack --room` is the strongest setup: hostile questions from rotating personas. Use sparingly; it is exhausting.

## The Loop

1. The user states the idea in one or two sentences. The agent does not paraphrase back — paraphrasing is friction.
2. The agent asks **ONE** question. Waits for the answer. Never bundles two questions into one round.
3. Based on the answer, the agent:
   - Notes a residue (a fact, assumption, or contradiction the answer revealed) — kept in conversation memory, not persisted unless the user opts in
   - Picks the next question — the one that most threatens the idea's weakest link **right now**
   - Asks it. Waits.
4. After N rounds (default 7, configurable with `--rounds N`), the agent offers a verdict:
   - **HARDENED** — the idea has survived the pressure. Move to brief or implementation.
   - **DEAD** — the idea collapsed. Note why. Do not revive unless the user asks.
   - **UNRESOLVED** — the user is still defending gaps. Offer to continue, switch modes, or stop.

The verdict is honest, not optimistic. A "HARDENED" verdict is rare and should be earned.

## On Activation

1. **Parse arguments** — check for `--attack`, `--room`, `--rounds N`, `--headless`.
2. **Load config** from `{project-root}/_bmad/core/config.yaml`:
   - `user_name` for greeting
   - `communication_language` for all speech
3. **Resolve the agent roster** (only if `--room` is set) by running:
   ```bash
   python3 {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key agents
   ```
   Pick 3-5 personas with the most orthogonal expertise to the idea. Each will ask one question per round in turn.
4. **Welcome the user** and surface the modes:
   - "Socratic (default) — I ask one question at a time. You answer. We go deeper."
   - "Adversarial (`--attack`) — I try to kill the idea. You defend."
   - "Persona room (`--room`) — Different agents take turns questioning. Useful for cross-functional check."
   - "Combined (`--attack --room`) — Hostile questions from rotating personas. Intense."
5. **Ask for the idea**: "State it in one or two sentences. Don't polish."

## Question Crafting

The agent's discipline:

- **One question per round.** No "and". No comma-spliced pairs. If two questions feel necessary, pick the one that closes more risk.
- **Target the weakest link, not the strongest.** The strongest part of the idea is already defended; pressure-testing it wastes a round.
- **Concretize.** Replace "users" with a specific person. Replace "fast" with a number. Replace "easy" with a scenario. Vague answers reveal vague ideas.
- **Force a stance.** "What would have to be true for this to work?" beats "do you think this will work?"
- **Track what you have learned.** The residue list grows. When the user contradicts an earlier answer, name it.

Common question types to rotate through:

- **Concretize** — "Give me a specific user. Not a persona, a person."
- **Why-now** — "What changed in the world that makes this possible or necessary now?"
- **Pre-mortem** — "It's 18 months from now and this failed. Why?"
- **Substitution** — "What if you removed the central mechanism — does anything survive?"
- **Adjacency** — "What is the closest existing thing? Why doesn't it just do this?"
- **Cost** — "What does this cost if it succeeds? Not money — attention, focus, optionality."
- **Counter-user** — "Who loses if this wins?"
- **Unstated assumption** — "You just claimed X. What if X is wrong?"

## Output (Optional)

At the verdict step, the agent offers to write:

- **A brief** — 1-page summary of the hardened idea: problem, who, why now, shape, next concrete step. This brief feeds `aac-spec` (full spec) or `aac-quick-dev` (small change). Format matches the upstream `aac-product-brief` schema.
- **A residue log** — append-only log of the rounds, the questions, the answers, the assumptions revealed. Useful as input to a future forge-idea session, or to seed a future `aac-advanced-elicitation` review.

The brief is opt-in. The user may want to keep the idea private until they have shared it elsewhere first.

## Halt Conditions

Halt immediately if:

- The user says "stop" / "kill" / "done" / "that's enough" — any natural phrasing
- The user has nothing substantive to add (twice in a row, the second time is the halt)
- The idea has clearly died (the user agrees with the kill assessment)

When halting, do not pad with summaries unless the user asks. A clean exit is the point of the skill.

## Headless Mode

`--headless` runs the loop non-interactively:

1. The idea is read from `{project-root}/forge-input.md` (or the first user message).
2. The agent runs all N rounds in one pass, asking questions and answering them itself as a hostile user-of-one (best-effort — headless is weaker than interactive for forge-idea because the user is the source of new information).
3. The verdict and brief are written to `{project-root}/forge-output.md`.
4. The residue is written to `{project-root}/forge-residue.md`.

Headless is useful for overnight batch processing of idea backlogs, not for the idea you actually care about.

## Success Metrics

- The user states the idea clearly within 2 sentences (no prompt-induced bloat)
- One question per round, never a barrage
- Each question targets the current weakest link, not the strongest
- The verdict (HARDENED / DEAD / UNRESOLVED) is honest, not optimistic
- The optional brief is concise (1 page) and actionable (has a next concrete step)
- The residue log is append-only and never edited

## Failure Modes

- Asking two questions in one round ("What about X? And also Y?") — wastes a round
- Paraphrasing the user's idea back to them — friction
- Generating ideas instead of testing one — that's brainstorming
- Marking HARDENED too early — undermines the skill
- Marking DEAD before the user has defended — paternalism
- Continuing past UNRESOLVED without checking in — the user may be stuck
