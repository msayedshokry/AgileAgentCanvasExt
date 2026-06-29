---
name: aac-handoff
description: 'Compact the current conversation into a handoff document so a fresh agent session can pick up the work.'
disable-model-invocation: true
argument-hint: 'What will the next session be used for?'
---

# Handoff

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to `{project-root}/.aac/handoff-<timestamp>.md` where `<timestamp>` is the current date in `YYYY-MM-DD-HHmm` form (e.g. `handoff-2026-06-29-2047.md`). Pick a fresh filename each run; do not overwrite.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the document accordingly.

## What to include

The handoff is **not a transcript**. It is a reconstruction seed for a fresh agent who has not seen this conversation.

- **Topic** — one paragraph stating what the work is and where it stands right now
- **Decisions made** — what was decided, with the reason in one line each
- **Open questions** — what is still unresolved, with the smallest next step for each
- **Key file paths** — the files the next session will need (source files, plans, configs, ADRs, the project-context.md, the spec)
- **Skills to use next** — which skills the next session should reach for, and why
- **Vocabulary** — the terms that matter for this work (link the project-context.md if it exists, do not duplicate it)

## What NOT to include

Do **not** duplicate content already captured in other artifacts:

- A PRD lives in `prd.md`; reference its path, do not paste it
- A plan lives in its file; reference it
- ADRs live in `docs/adr/`; reference them
- The sprint status lives in `sprint-status.yaml`; reference it
- A diff lives in git; reference the commit or branch
- The domain glossary lives in `project-context.md`; reference it

The handoff is the **index** between these artifacts, not a copy of them. If the handoff reproduces the PRD, the PRD is no longer the source of truth — it is a draft the agent might forget to update.

## Structure

```markdown
# Handoff — <topic>

**Date**: <YYYY-MM-DD>
**Next session focus**: <user-provided description, or "continue current work">

## Status
<one paragraph: where the work stands, what the next session is walking into>

## Decisions made
- <decision>: <reason in one line>

## Open questions
- <question>: <smallest next step>

## Key paths
- <path>: <why it matters>

## Skills to use next
- <skill>: <why>

## Vocabulary
- See `project-context.md` for the canonical glossary.
- <any term the next session must use correctly that is not yet in the glossary>
```

Keep the document under ~150 lines. If the handoff is bigger than that, the conversation has too much open in it — fork a sub-thread with its own handoff rather than produce a handoff that no fresh agent will read.

## After writing

Output the absolute path of the handoff file. Suggest: "Open a new session and pass it this path. The new agent will read it as the entry point for the work."
