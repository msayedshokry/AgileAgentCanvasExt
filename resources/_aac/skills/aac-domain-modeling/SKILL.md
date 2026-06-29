---
name: aac-domain-modeling
description: 'Actively build and sharpen the project domain model. Use when the user wants to pin down domain terminology, harden a fuzzy word, name a new module, or record an architectural decision. Challenges terms against scenarios, sharpens the glossary, and writes ADRs as decisions land.'
---

# Domain Modeling

The active discipline of keeping the project's domain model current as work happens. Reading `project-context.md` for vocabulary is not this skill — that is a one-line habit any skill can do. This skill is for when the model is *changing*, not just being consumed.

## File layout

```
{project-root}/
├── project-context.md        # the ubiquitous-language glossary (terms + decisions in plain prose)
├── docs/
│   └── adr/                  # one ADR per architectural decision (numbered, dated)
└── ...
```

If `CONTEXT-MAP.md` exists at the root, the repo has multiple bounded contexts. The map points to where each one lives. Resolve the active context first, then operate inside it.

## When this skill fires

A boundary is being crossed: a fuzzy term surfaces, a new module needs naming, a design decision is being made. The skill runs inline alongside whatever work is happening, not as a separate phase.

**Trigger phrases**: "name this module", "what should we call this", "let's pin down what X means", "should this be an ADR", "update the context for X", "this term is overloaded", "add a term for Y".

## The discipline

### 1. Term, not synonym

When a new concept surfaces, write it as a **term** (one canonical name, one definition, one example). Reject synonyms in the same glossary — pick one, retire the rest. If a synonym is still in use elsewhere in the codebase, the term is not yet won; record the migration as a TODO under the term.

### 2. Sharpen, don't sprawl

When an existing term feels fuzzy, **sharpen** it: rewrite the definition tighter, add a non-example, name what it is *not*. A glossary that grows is a glossary that is being read less. Aim for fewer terms, each load-bearing.

### 3. Stress-test against scenarios

For any term under review, run one or two edge-case scenarios through it. The test: would a fresh agent reading the term alone (no other context) make the right call? If not, the definition is still fuzzy — name the case the term cannot decide, and either add a rule or admit the term is overloaded and split it.

### 4. Decisions become ADRs

A *decision* is not a *term*. A decision is a choice between alternatives with a reason; it lives in `docs/adr/NNNN-<slug>.md`. The format:

```markdown
# NNNN. <Title>

**Status**: proposed | accepted | superseded
**Date**: YYYY-MM-DD
**Context**: which terms, modules, or forces drove the decision
**Decision**: what we chose
**Consequences**: what this commits us to; what it forecloses
**Alternatives considered**: the ones we rejected, with reasons
```

Number sequentially. Never overwrite — supersede with a new ADR that points to the old one. The point of an ADR is to stop future-you (or a future agent) from re-litigating the same choice.

### 5. Inline updates

Update `project-context.md` and `docs/adr/` the moment a decision crystallizes. Not at the end of the session. Not "I'll do it later." Inline updates are the whole point — they keep the model honest. If the agent defers the update, the model has rotted by the next session.

## Anti-patterns

- **Synonym glossaries** — a glossary that lists "User / Customer / Account" as three flavors of the same idea is a glossary that has not decided. Pick one. Mark the others as deprecated.
- **Narrative prose** — `project-context.md` is for terms and definitions, not a project narrative. If you find yourself writing "we use X because the team prefers…", that's a decision and belongs in an ADR, not the glossary.
- **Decision drift** — a code change that contradicts an ADR without superseding it. The change is wrong, or the ADR is. Either fix the change or write the supersede ADR; do not leave the contradiction standing.
- **Sprawl of terms** — when a glossary grows past ~30 terms, the model is being read less. Either prune ruthlessly or split contexts.
