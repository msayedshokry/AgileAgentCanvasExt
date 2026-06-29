---
name: aac-source-driven-development
description: 'Grounds every framework-specific implementation decision in official documentation. Use when writing code that depends on a specific library, framework, or API version, when boilerplate or patterns will be copied across a project, or when the user asks for code that follows current best practices. Every pattern traces back to an authoritative source the user can check.'
---

# Source-Driven Development

Every framework-specific code decision must be backed by official documentation. Don't implement from memory — verify, cite, and let the user see the source. Training data goes stale, APIs get deprecated, best practices evolve. This skill ensures the user gets code they can trust because every pattern traces back to a source they can check.

## Overview

The default is to look it up. The cost of looking it up is seconds; the cost of implementing a deprecated pattern is a tech-debt ticket the user will file three months from now. Source-driven development flips the default — *no* implementation without a source the user can verify.

## When to Use

- The user wants code that follows current best practices for a given framework
- Building boilerplate, starter code, or patterns that will be copied across a project
- The user asks for "documented", "verified", "current", or "correct" implementation
- Implementing features where the framework's recommended approach matters (forms, routing, data fetching, state management, auth)
- Reviewing or improving code that uses framework-specific patterns
- About to write framework-specific code from memory

**When NOT to use:**

- The code is framework-agnostic (loops, conditionals, data structures, plain TypeScript)
- The change is a rename, format, or file move
- The user explicitly asks for speed over verification
- The code is a one-off script that will not be reused

## The Process

### 1. Name the framework surface

Before writing any framework-specific code, name exactly which surface you are about to touch. "I'll use the Next.js App Router with a server component for the dashboard page" is a surface. "I'll set up routing" is not.

### 2. Pull the canonical source

Open the official documentation for the named surface. For most frameworks this is the project's own docs site; for libraries, the package's GitHub README or the official API reference. Do not rely on a third-party blog, a Stack Overflow answer, or a tutorial from 2019.

If the framework has a versioned docs site, read the version that matches the project's `package.json` or equivalent. A documented pattern from version 14 is not a pattern in version 16.

### 3. Cite before implement

For each non-trivial pattern, attach the source URL next to the code as a comment, or in a `Sources:` block at the end of the file. The user should be able to click the link and see the same pattern in the docs. Citations are not decoration — they are the audit trail.

### 4. Note version sensitivity

If the pattern changed between versions, or if the version you cited is newer than the project's installed version, flag it. "Pattern X requires Next.js 16+; this project is on 15.4. Backport candidate noted." A correct pattern on the wrong version is a future bug.

### 5. Surface drift

If the source contradicts what the existing code does, that is a finding, not a friction. The drift is a code-review item, not a reason to pick a different pattern silently. Tell the user: "The existing code uses pattern A, but the current docs recommend pattern B. Want me to migrate or just add the new pattern alongside?"

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I know this API well" | Knowing an API from training is not the same as knowing its current shape. The next deprecation could be next month. |
| "The docs are out of date" | The docs may indeed be out of date — but the framework's own docs are the canonical source. If they are wrong, that is a finding to file upstream, not a reason to skip. |
| "This is faster than checking" | The cost of checking is a single web fetch. The cost of being wrong is a rewrite. |
| "It's basically the same in every version" | "Basically" is doing a lot of work. The check costs nothing; the assumption costs the rewrite. |
| "The user trusts me to get it right" | The user is trusting you to *verify*, not to remember. Verification is the trust mechanism. |
| "Stack Overflow has the answer" | SO answers are often right but rarely current. The official doc is both. |
| "I'll just write the obvious code" | The obvious code is the one most likely to be the deprecated one. Verify the obvious. |

## Red Flags

- The cited source is older than 18 months without the framework being declared stable at that version
- The cited source is a third-party blog when the official doc has the same pattern
- The same source is cited for many different patterns — the agent is pulling from one cached mental model
- "Common knowledge" appears in the code with no citation
- The version of the pattern in the code does not match the version cited
- The user has flagged that the project's installed framework version differs from the cited source and the agent has not flagged the drift
- The agent cites a pattern from a newer version than the project supports, with no migration note

## Verification

Before shipping code that uses a framework-specific pattern:

- [ ] Each non-trivial pattern is named as a surface (router, hook, middleware, etc.) before implementation
- [ ] Each pattern is sourced from the framework's own documentation, not a third party
- [ ] Each source URL points to the version of the docs that matches the project's installed framework
- [ ] Each source URL is attached as a comment or `Sources:` block, visible to the user
- [ ] Any drift between the cited source and the project's installed version is flagged
- [ ] Any drift between the cited source and the existing code is surfaced as a finding, not silently aligned
- [ ] No framework-specific code shipped without a traceable source
