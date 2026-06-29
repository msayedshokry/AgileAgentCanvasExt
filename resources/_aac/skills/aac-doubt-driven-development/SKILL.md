---
name: aac-doubt-driven-development
description: 'Subjects every non-trivial decision to a fresh-context adversarial review before it stands. Use when correctness matters more than speed, when working in unfamiliar code, when stakes are high (production, security-sensitive logic, irreversible operations), or any time a confident output would be cheaper to verify now than to debug later.'
---

# Doubt-Driven Development

A confident answer is not a correct one. Long sessions accumulate context that quietly turns assumptions into "facts" without anyone noticing. Doubt-driven development is the discipline of materializing a fresh-context reviewer — biased to **disprove**, not approve — before any non-trivial output stands.

This is not `aac-code-review`. `aac-code-review` is a verdict on a finished artifact. This is an in-flight posture: non-trivial decisions get cross-examined while course-correction is still cheap.

## Overview

The reviewer has no context. The reviewer is biased to find the case where the output is wrong. The reviewer is **not** adversarial for sport — they are adversarial because the cost of catching a bug before code is written is roughly a hundred times less than catching it after deploy.

## When to Use

A decision is **non-trivial** when at least one of these is true:

- It introduces or modifies branching logic
- It crosses a module or service boundary
- It asserts a property the type system cannot verify (thread safety, idempotence, ordering, invariants)
- Its correctness depends on context the future reader cannot see
- Its blast radius is irreversible (production deploy, data migration, public API change)

Apply the skill when any of the above is true. The cost of applying it is small; the cost of not applying it scales with the size of the assumption it would have caught.

**When NOT to use:**

- The change is mechanical (rename, formatting, file move)
- A test already covers the case end-to-end and the change is to the test
- The cost of the doubt-pass exceeds the cost of the mistake (a typo in a comment, a one-line cosmetic change)
- You are in a tight feedback loop where the test or the user will catch the issue in seconds

## The Process

### 1. State the decision

Write down, in one or two sentences, the decision the code is about to make. Not the code — the *decision*. "I'll cache user lookups for 5 minutes" is a decision. "I'm adding a Map<string, User>" is not.

### 2. Name the risk

State the worst plausible failure mode of that decision being wrong. Be specific. "Stale data served for up to 5 minutes" beats "it might be slow."

### 3. Spawn the fresh-context reviewer

A subagent (or a new session, if the work is long enough to justify it) reads the **decision and the risk** and *nothing else* about the conversation. The reviewer is given:

- The decision (from step 1)
- The risk (from step 2)
- The relevant file paths
- An explicit instruction to disprove, not approve

The reviewer is told: **"Find the case where this is wrong, or find the case the writer didn't think of."** Approving is not a deliverable. A clean bill of health is a side effect of failing to find a real flaw.

### 4. Act on the review

- A real flaw is found → fix it before the code stands. The reviewer's evidence is the spec for the fix.
- The reviewer invents a flaw that does not hold up → the decision stands, with a one-line note on what was tested.
- The reviewer raises a question the writer cannot answer → stop and resolve it. An unanswerable question is a hidden assumption.

### 5. Record the verdict

For decisions that ship, note the doubt-pass in the commit or PR: "doubt-pass: reviewer X, verdict Y, evidence Z." This makes the doubt-pass a load-bearing artifact for the next reviewer, not a one-time ritual.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I already know this works" | Knowing is not the same as having tested. The doubt-pass is the test. |
| "The reviewer will just rubber-stamp it" | If they do, the doubt-pass has failed — sharpen the prompt or pick a different reviewer. |
| "This is too small to doubt" | "Too small" is a guess about the failure cost, not a measurement. Measure it. |
| "The test will catch it" | Tests cover the cases you imagined. Doubt-driven development covers the cases you did not. |
| "We can fix it in code review" | Code review is post-hoc. The doubt-pass happens *before* the code is written, when the cost is lowest. |

## Red Flags

- The doubt-pass produces a clean verdict every time, with no specific challenges raised. The reviewer is approving, not doubting.
- The writer picks a reviewer who already agrees with them, or asks the same model that produced the decision.
- The decision statement is too vague to be falsifiable. "I picked a good approach" is not a decision. "I chose JWT over session cookies because the user requested a stateless API" is.
- The risk is named in generic terms ("could have bugs") rather than specific terms ("could leak previous-user data on logout").
- The doubt-pass is skipped because the change "looks fine." Looks-fine is what the doubt-pass exists to challenge.

## Verification

After the doubt-pass:

- [ ] The decision is stated in one or two sentences, with no implementation detail
- [ ] The risk is named specifically, not generically
- [ ] The reviewer was given *only* the decision, the risk, and the file paths — not the full conversation context
- [ ] The reviewer was instructed to disprove, not approve
- [ ] At least one concrete attempt to break the decision was recorded
- [ ] The verdict (fixed / stood / unanswerable) is recorded with the evidence
- [ ] The reviewer's prompt and the writer's response are both retrievable for the next reviewer
