---
name: aac-deprecation-and-migration
description: 'Manages the deprecation and migration of code, APIs, features, and systems. Use when removing old systems or APIs, when migrating users from one implementation to another, when sunsetting a feature, when consolidating duplicate implementations, or when deciding whether to maintain or invest in migration of legacy code.'
---

# Deprecation and Migration

Code is a liability, not an asset. Every line has ongoing cost — bugs to fix, dependencies to update, security patches to apply, new engineers to onboard. Deprecation is the discipline of removing code that no longer earns its keep. Migration is the process of moving users safely from the old to the new.

Most engineering organizations are good at building things. Few are good at removing them. This skill addresses that gap.

## Overview

A deprecation is a *contract* with the people who depend on the thing being removed. The contract says: "this will keep working until date X, here is what replaces it, here is how to ask for help, and here is what happens if you do nothing." A deprecation without a contract is a breaking change dressed up as a sunset.

A migration is the other half: helping the dependents move to the replacement before the sunset. The cheapest migration is the one that is a no-op for the user. The most expensive is the one that requires them to rewrite their integration. Pick your replacement with the migration cost in mind.

## When to Use

- Replacing an old system, API, or library with a new one
- Sunsetting a feature that is no longer needed
- Consolidating duplicate implementations (two ways to do the same thing, picking one)
- Removing dead code that nobody owns but everybody depends on
- Planning the lifecycle of a new system (deprecation planning starts at design time)
- Deciding whether to maintain a legacy system or invest in migration
- The codebase has accumulated technical debt that blocks further work

**When NOT to use:**

- The thing is genuinely needed by current users with no replacement
- The migration cost is higher than the maintenance cost of keeping the old thing
- The replacement is not yet stable enough to recommend
- The deprecation would break a regulatory or contractual commitment

## The Process

### 1. State the case in writing

Before any deprecation work, write a one-paragraph case that names: what is being removed, why now, what replaces it, and what the cost of *not* removing it is. The case is the artifact you point to when the inevitable "but we still use that" arrives. If the case cannot be written cleanly, the deprecation is not yet ready.

### 2. Pick the replacement first

A deprecation without a replacement is a removal. Users cannot migrate to "nothing" — they will fork the old code, write a wrapper, or leave. The replacement must exist, be documented, and be at least as good as the thing being removed on the dimensions the user cares about. If the replacement is worse, the deprecation is premature.

### 3. Set the timeline with three dates

- **Announce** — the date the deprecation is publicly declared. The thing still works fully. Documentation gets a banner.
- **Discourage** — the date new uses are officially discouraged but the thing still works. Migration tooling and guides are published. Support shifts to "we will fix critical bugs only."
- **Remove** — the date the thing stops working. Users past this date must have migrated or be on a paid-support plan.

The three dates are at minimum 6 months apart, more for widely-used APIs. A deprecation that goes from announce to remove in a single release is a breaking change, not a deprecation.

### 4. Build the migration path

The migration path is the *only* thing that determines whether the deprecation succeeds or fails. Build it before announcing:

- A clear guide from the old thing to the new thing
- Codemods or scripts where the migration is mechanical
- A flag day, if the migration is best done as a single switch
- A support channel for users who hit issues

If the migration is "rewrite your integration", the deprecation will fail. Most users will not rewrite; they will pin the old version and resent the deprecation.

### 5. Track the dependents

Before announcing, find every caller. Internal callers can be migrated by the team. External callers (other services, public APIs, third-party integrations) need a different plan. The cost of a missed dependent is a customer finding out at remove-date that the thing they depended on is gone.

### 6. Run the timeline

- **Announce** the deprecation with the case, the replacement, the timeline, and the migration path. Make the announcement findable — a banner on the docs, a CHANGELOG entry, an email to known users.
- At **discourage**, publish the migration guide, stop accepting new features on the old thing, and start measuring the migration progress.
- At **remove**, the thing stops working. The announcement is one final email, a release note, and the code is gone. No surprise removals — by the remove date, the announcement has been public for at least a year.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Nobody uses it anymore" | "Nobody" is a guess. Run the call-site analysis before announcing. The dormant feature is the one a paying customer was about to re-enable. |
| "It's faster to just delete it" | A surprise deletion is a breaking change. The user-impact analysis is the difference between a deprecation and an outage. |
| "The replacement is better, they'll switch" | Users do not switch on "better." They switch when the migration cost is lower than the cost of staying. Make the migration cheap, then they switch. |
| "We'll keep a v1 compatibility shim forever" | Forever is a long time. A shim is a useful migration aid, not a permanent commitment. Set the remove date. |
| "We can do it next quarter" | Deprecations compound. Every quarter of delay is a quarter of new code that depends on the old thing. Announce now. |
| "Internal-only, so we can just delete it" | Internal users are users. A breaking change to an internal service is still a breaking change. Follow the same process. |
| "We don't have time to write a migration guide" | Then you don't have time to deprecate. The guide is the deprecation. |

## Red Flags

- The deprecation has a remove date but no announce date — the timeline is back-loaded
- The "replacement" is a draft or a roadmap item, not a shipped thing
- No migration guide exists at the announce date
- The team has not run a call-site analysis — the user base is unknown
- The deprecation is announced in a CHANGELOG entry buried on page 4
- The shim is committed to forever ("we'll just keep both")
- The team is deprecating because "it's old", not because something is wrong with it
- The replacement has worse performance, fewer features, or a worse API than the original
- The migration requires changes to user data, schemas, or external contracts with no tooling

## Verification

Before a deprecation is announced:

- [ ] The case is written in one paragraph with the why-now, the replacement, and the cost of not removing
- [ ] The replacement exists, is documented, and is at least as good on the user's dimensions
- [ ] A call-site analysis has been run — every internal and external caller is known
- [ ] The three dates (announce, discourage, remove) are set, at least 6 months apart
- [ ] A migration guide is written and reviewable, before the announce
- [ ] Codemods or scripts exist for the mechanical part of the migration
- [ ] The migration cost for a typical user is bounded (hours, not weeks)
- [ ] The deprecation is announced where the dependents will see it (docs banner, CHANGELOG, email)
- [ ] A support channel exists for migration questions
- [ ] The deprecation has a single owner who is accountable for the timeline
