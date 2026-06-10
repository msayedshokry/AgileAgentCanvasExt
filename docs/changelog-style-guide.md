# Changelog Style Guide

This guide is the source of truth for writing `CHANGELOG.md` entries. It is enforced by [`scripts/lint-changelog.mjs`](../scripts/lint-changelog.mjs) (run via `npm run lint:changelog`).

## Goals

- A release entry is a **user-facing summary**, not an internal engineering log.
- A reader can scan the latest version in under a minute and know what changed.
- The history stays uniform across releases — old entries should not look like they belong to a different project.

## Structure

```
## 0.5.4

### Feature: Headroom — Transparent Context Compression

Short lead paragraph (1–3 sentences) describing what the user gets.

- Bullet describing one user-visible behavior.
- Another bullet.
- Up to 3–5 bullets per `###` section.

### Fixed: Sprint-status YAML first-time-right

Single sentence + 2–3 bullets max.

## 0.5.3
...
```

## Rules

### 1. User-facing only

Describe **what changed for the user**, not which file or method shipped it.

| ✅ | ❌ |
|---|---|
| `**Headroom** — Compresses chat messages before they reach the AI provider, saving tokens automatically.` | `**src/integrations/headroom/headroom-compressor.ts** — Added auto-detection of the Headroom proxy.` |
| `New setting: agileagentcanvas.headroom.enabled.` | `Lazy-loads the SDK on first chat call.` |

Keep file references only when the user genuinely needs them to **find** something — a new command, setting key, or configuration path.

### 2. One `###` per logical change

Each `###` is one feature or one fix. Sub-points are allowed but cap at **3–5 bullets**. If a change needs more, it is two changes, not one.

### 3. Heading format

- `### Feature: short name` — for new capabilities.
- `### Fixed: short name` — for bug fixes, regressions, and behavior corrections.
- `### Removed: short name` — rare; use only for breaking removals.
- No `Added:` / `New:` / `Changed:` prefix — the `##` version group already implies the change type.

### 4. Verb tense

- **Past tense** for the change itself: `Added`, `Fixed`, `Removed`, `Refactored`.
- **Present tense** only for describing current behavior in the lead paragraph: `Headroom compresses chat messages automatically.`

### 5. Length cap

- **Target:** 800–1,200 words per `## {version}` section.
- **Hard cap:** 1,500 words (enforced by the lint; override with `--max-words N`).
- **Overflow path:** when a release is genuinely large, move the detail to `docs/changelog/{version}.md` and keep only the headline bullets in the top-level `CHANGELOG.md`. Link the detail file from the lead paragraph.

### 6. Lint-enforced rules

The `npm run lint:changelog` script fails CI on:

| Rule | What it catches |
|---|---|
| `duplicate-h3` | Two `###` headings with identical text in the same file. |
| `word-cap` | A `## {version}` section over the word limit. |
| `jargon:bold-file` | Bold lead-ins like `**src/foo.ts**` or `**package.json**`. |
| `jargon:bold-call` | Bold lead-ins like `**streamChatResponse()**`. |
| `jargon:tick-file` | Code-span references to file paths. |
| `jargon:tick-call` | Code-span references to method calls. |
| `orphan-backtick` | Unmatched backticks outside fenced code blocks. |

Run with `--soft` while migrating legacy entries; drop the flag once the file is clean.

## Anti-patterns

- **Engineering log style** — listing every method, every config key, every schema field per change.
- **Multi-section versions** — splitting a single version across five top-level `###` blocks, each with deep bullet nesting.
- **Lead-in bold with file extension** — `**src/chat/ai-provider.ts**` is the #1 offender; ban it.
- **Emoji-spam** — pick one or two icons per version max; never decorate every bullet.
- **Duplicate headings** — copy-paste of the same `###` heading inside one version.
- **Truncated entries** — every entry must end in a complete sentence; do not let a single bullet run off the bottom of the file.

## Reviewer checklist

Before approving a `CHANGELOG.md` change, confirm:

- [ ] Every `###` follows the `Feature:` / `Fixed:` / `Removed:` format.
- [ ] No bullet starts with `**file.ts**` or `**methodName()`.
- [ ] No code span (`…`) references a file path or function call.
- [ ] Total word count for the version is under 1,500.
- [ ] No duplicate `###` headings in the file.
- [ ] `npm run lint:changelog` passes in strict mode.
