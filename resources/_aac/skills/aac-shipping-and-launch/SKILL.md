---
name: aac-shipping-and-launch
description: 'Prepares production launches. Use when deploying a feature to production for the first time, when releasing a significant change, when migrating data or infrastructure, or when planning a staged rollout with rollback. Pairs with aac-check-implementation-readiness (the pre-launch gate) by handling the actual ship discipline.'
---

# Shipping and Launch

Ship with confidence. The goal is not just to deploy — it is to deploy safely, with monitoring in place, a rollback plan ready, and a clear understanding of what success looks like. Every launch should be **reversible**, **observable**, and **incremental**.

## Overview

A launch is not the moment of deployment. It is the entire arc: the pre-launch checks, the deploy itself, the monitoring window, the decision to keep or roll back, and the post-launch review. Each part has its own checklist and its own failure modes. The skill is the discipline of running the whole arc, not just the deploy button.

`aac-check-implementation-readiness` answers the question "is this feature ready to ship?" This skill answers "given that the feature is ready, how do we ship it safely?"

## When to Use

- Deploying a feature to production for the first time
- Releasing a significant change to users (UI rework, new API surface, schema migration)
- Migrating data or infrastructure
- Opening a beta or early access program
- Any deployment that carries risk (all of them)

**When NOT to use:**

- Deploying a small, reversible change with no user-visible effect
- The change is gated by `aac-check-implementation-readiness` and has not yet passed
- The user is asking for a feature flag flip with no infrastructure change

## The Process

### 1. Confirm readiness

Before shipping, the implementation must have passed `aac-check-implementation-readiness`. The pre-launch gate is not this skill's job — it is upstream. Confirm the gate has fired green; if it has not, halt and route back.

### 2. Pick the rollout strategy

Choose a rollout that matches the risk. For low-risk changes, a direct deploy is fine. For higher risk, pick from:

- **Feature flag** — code is deployed, the change is off for everyone, you turn it on for a percentage of users. Reversible in seconds.
- **Canary** — code is deployed to a small slice of infrastructure (one region, one pod, one user cohort). Watch the metrics, then expand.
- **Staged percentage rollout** — feature flag, but ramp the percentage on a fixed schedule (1% → 10% → 50% → 100%), with a check at each stage.
- **Dark launch** — code is deployed and runs, but the output is not returned to users. Tests the production path without user impact.

The strategy is matched to the risk. A typo fix in a comment does not need a canary. A schema migration that locks a table does.

### 3. Set the rollback criteria in advance

Before the deploy, write down the exact metrics and thresholds that trigger a rollback. "Error rate > 2% for 5 minutes", "p99 latency > 500ms for 10 minutes", "any user-visible error count > 0 for 30 seconds". The criteria are written *before* the deploy, not after, because post-hoc criteria are written to justify a decision already made.

The rollback must be fast. A rollback that takes 30 minutes is not a rollback — it is an outage you watched. The faster the rollback, the lower the bar to use it. A 5-minute rollback means you can roll back at 6 minutes without it being a hard call.

### 4. Run the pre-launch checklist

The checklist is short and specific:

- **Code quality** — tests pass, build succeeds, no new warnings, code review approved
- **Observability** — the metrics and logs are emitting, the dashboards are wired, the alerts are firing on the right thresholds
- **Rollback** — the rollback path is tested (run it in staging first), the runbook is current
- **Communication** — the team knows the launch window, the on-call is staffed, the user-facing changelog is ready
- **Documentation** — the user-facing docs are updated, the internal runbook is current, the postmortem template is ready

Any unchecked item is a launch blocker.

### 5. Deploy and watch

During the deploy window, the launch owner is watching. Not "we'll see if anything breaks" — actively watching the metrics that map to the rollback criteria. The first 30 minutes of a launch are the highest-risk window; if the rollback criteria are not met, roll back.

### 6. Decide: keep or roll back

At the end of the watch window, the data tells you. If the criteria are not met, roll back. If they are, expand the rollout to the next stage. The decision is not a feeling; it is a check against the criteria written in step 3.

### 7. Post-launch review

Within 48 hours of the launch, run a postmortem. What worked, what did not, what was missing from the checklist, what surprised the team. The postmortem is blameless — the question is "what is the next launch going to do better?" not "who screwed up?"

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Just push it and watch" | Push-and-watch is a launch with no rollback criteria. The first signal that something is wrong is the page. |
| "The change is small" | Small changes have shipped bad code. Match the rollout to the *blast radius*, not the diff size. |
| "We'll roll back if it breaks" | "If it breaks" is a vague criterion. Set the threshold before the launch. |
| "Monitoring is the same as observability" | Monitoring tells you something is wrong. Observability tells you *why*. Both are required. |
| "The user-facing changelog can wait" | The changelog ships with the feature. The user finds out about a change at the same time the change ships. |
| "We'll do the postmortem if there's a problem" | Postmortems are for the launches that *succeeded* too. The lessons are in what worked. |
| "We've shipped to production before" | Past launches do not predict this launch. The checklist is per-launch, not per-career. |
| "Feature flags add complexity" | Feature flags are reversible. The alternative is not "no complexity" — it is "no rollback." |
| "Staging caught it" | Staging is not production. Production has the real data, the real traffic, the real users. The deploy to production is the test. |

## Red Flags

- The rollback criteria are not written down before the deploy
- The rollback path has not been tested in staging
- The launch owner is "the team" — there is no single accountable person
- The on-call is not staffed during the launch window
- The metrics are emitting, but the alerts are not wired
- The feature flag has no off-switch (or no one knows how to flip it)
- The deploy window is Friday afternoon
- The change touches production data without a tested data migration
- "We'll know if it's broken" is the monitoring plan
- The postmortem is scheduled "if needed" rather than "always"

## Verification

Before a launch is declared complete:

- [ ] Readiness gate (`aac-check-implementation-readiness`) has passed
- [ ] Rollout strategy is chosen and matches the risk
- [ ] Rollback criteria are written in advance, with specific thresholds
- [ ] Rollback path is tested in staging and the runbook is current
- [ ] Observability is emitting — metrics, logs, traces are wired
- [ ] Alerts fire on the rollback criteria
- [ ] On-call is staffed during the launch window
- [ ] User-facing changelog is published
- [ ] Launch owner is named and accountable
- [ ] Post-launch review is scheduled within 48 hours
- [ ] Communication channel is set for in-flight decisions (who to page, where to coordinate)
