---
name: aac-context-engineering
description: 'Optimizes the context the agent sees at any moment. Use when starting a new session, when agent output quality degrades, when switching between tasks, or when configuring rules files and context for a project. Pairs with aac-generate-project-context (which writes the project context once) by keeping it current and well-curated as work happens.'
---

# Context Engineering

Context is the single biggest lever for agent output quality. Too little and the agent hallucinates. Too much and it loses focus. Context engineering is the practice of deliberately curating what the agent sees, when it sees it, and how it is structured.

## Overview

The agent's context window is a budget. Every token loaded is a token not available for the task. Every line of the project-context.md is a line the agent has to weigh against the user's actual question. The discipline is not "more context" — it is *the right context*, at the right time, for the right task.

`aac-generate-project-context` writes the project context once, at project initialization. This skill is the ongoing discipline: keep the context current, prune the stale, surface the right slice for the current task.

## When to Use

- Starting a new session on an unfamiliar project
- Agent output quality is declining — wrong patterns, hallucinated APIs, ignoring conventions
- Switching between different parts of a codebase (front-end, back-end, infrastructure)
- Setting up a new project for AI-assisted development
- The agent is not following project conventions despite them being documented
- The context has grown past the point where the agent is reading all of it

**When NOT to use:**

- The project has no context yet — use `aac-generate-project-context` first
- The task is small and self-contained (a one-line fix, a renamed variable)
- The context is already well-tuned and the issue is elsewhere

## The Context Hierarchy

Structure context from most persistent to most transient. Each rung down is loaded less often and is more specific to the current task.

```
┌─────────────────────────────────────┐
│ System prompt (always loaded)       │  ← rules the agent must follow no matter what
├─────────────────────────────────────┤
│ Project context (always loaded)     │  ← vocabulary, conventions, ADRs, glossaries
├─────────────────────────────────────┤
│ Active task context (loaded now)    │  ← the PRD, the spec, the issue being worked on
├─────────────────────────────────────┤
│ Working context (loaded on demand)  │  ← files the agent reads during the task
├─────────────────────────────────────┤
│ External reference (pointed to)     │  ← docs, websites, runbooks, fetched when needed
└─────────────────────────────────────┘
```

Each rung has a budget. The system prompt and project context are always loaded; they are the most expensive per token and the most read. The working context is loaded for the current task; it is cheap per token but adds up fast. External reference is fetched on demand and the agent pays only for what it pulls.

The discipline is to keep the top of the hierarchy *small* and *load-bearing*, and to push everything else down the ladder.

## The Process

### 1. Audit the always-loaded layer

The first thing to check is the project context. Is it 50 lines or 500? Is each line a rule the agent must follow, or a paragraph the agent will skim? Cut anything that is not load-bearing. A 200-line project context that the agent reads is more useful than a 2000-line context the agent skips.

### 2. Push reference down the ladder

Anything that is not a rule the agent must always follow belongs lower. The vocabulary, the ADRs, the runbook — these are *reference*, not rules. Move them to a `references/` folder and let the agent fetch them when the task requires it.

### 3. Match the working context to the task

When the agent starts a new task, load the slice of context that task needs. A front-end task does not need the back-end glossary. A bug fix does not need the full PRD. The active task context should be small and focused — the smallest set of files that, if the agent read only those, would let it do the task well.

### 4. Surface drift, don't hide it

When the code drifts from the documented convention, the convention is the one that should be flagged, not the code silently aligned. The agent should note: "The existing code uses pattern X, but the project context says Y. Migrate, align, or update the context." Drift is a finding, not a friction.

### 5. Measure the cost

Watch the context budget as the task progresses. If the working context has grown past the point where the agent is reading all of it, prune. If the agent keeps re-loading the same file, it is missing from the active task context. The cost is the agent's attention, not just the tokens.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "More context is always better" | More context is more tokens spent weighing irrelevant information. The right context is better than more context. |
| "I'll just add the whole PRD" | The agent does not need the whole PRD to fix a one-line bug. A 200-line task context beats a 2000-line context the agent skips. |
| "The agent will figure it out" | The agent figures it out with the context you give it. Bad context → bad output. Good context → good output. |
| "We documented it once, we're done" | Context rots. The project changes; the context does not. Pruning is the ongoing discipline. |
| "References should be inlined" | Inlined references are always loaded. Pointed-to references are loaded on demand. Pointers scale. Inlining does not. |
| "The agent knows the framework" | The agent knows the framework from training. The project may be on a different version, with different patterns, with different conventions. The project context is the gap. |
| "Adding more rules fixes quality" | Adding rules past a threshold hurts. The agent has a budget for rules; once exceeded, it starts dropping them. Cut the low-value ones. |

## Red Flags

- The project context is over 500 lines and the agent is not reading all of it
- The always-loaded layer includes reference material (ADRs, runbooks, glossaries) instead of rules
- Conventions documented in the project context are not followed in the code — drift is silent
- The agent re-loads the same file multiple times in a session — it should be in the working context
- The agent hallucinates an API or pattern that exists in the docs but not in the working context
- The agent follows outdated patterns from old code, ignoring newer conventions in the context
- The working context has grown past ~30% of the window without the agent explicitly pruning
- The same context is used for tasks that need very different slices (front-end task with back-end glossary loaded)

## Verification

For a well-tuned context:

- [ ] The always-loaded layer (system prompt + project context) is small enough to read in full — under 500 lines
- [ ] Each line in the always-loaded layer is a rule the agent must follow, not a paragraph to skim
- [ ] Reference material is pushed to `references/` and loaded on demand, not always loaded
- [ ] The active task context is a focused slice — the smallest set of files for the current task
- [ ] Drift between the documented convention and the existing code is flagged, not silently aligned
- [ ] The agent's output quality is stable across long sessions, not degrading as the context fills
- [ ] New team members (or new sessions) can be productive quickly because the always-loaded layer is clear
- [ ] Pruning the context is part of the work, not a one-time setup activity
