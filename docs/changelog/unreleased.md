# Unreleased — detailed changes

Full detail behind the Unreleased summary in CHANGELOG.md. Rename this file to the version number at release.


## Agent runs, autopilots and agent teams

These sections carry the CHANGELOG summary; see the commit that added them for more.

**More reliable agent runs**
- Runs stop after 15 minutes with no output, with a 2-hour limit overall, instead of a flat 20 minutes. Set them with `agents.idleTimeoutMinutes` and `agents.maxRunMinutes`.
- A failed run is retried automatically only for network errors, a stuck agent, a missing verdict file, rate limits (after 60 seconds) and provider server errors (after 15 seconds). Sign-in, API key, model, quota and context-overflow failures go straight to the card with their fix actions.
- Failures name a full context window, a temporary rate limit (including the 403 "concurrent request limit"), a spent quota and provider 5xx errors separately.
- With Claude Code, a card sent back for rework resumes its previous conversation and sends only the new instructions and fix requests. A run that ended without a verdict is never resumed. Turn this off with `agents.resumeSessions`.
- Each run in a card's timeline lists the context it received (name, size, how it was delivered), without the content.

**Autopilots**
- Runbooks with cron schedules live in the autopilots file (**Edit Autopilots** opens it); **Run Autopilot Now** starts one by hand. They stay off until `autopilots.enabled` is set in user settings, so a cloned project cannot start agents on its own.
- Each run uses a fresh agent session, runs once even with several windows open, and notifies you only when it needs attention.

**Agent team protocol**
- Each member gets a brief with its role and the roster, and receives the earlier members' handoff notes. Before, members received nothing from each other because their output was never captured.
- The coordinator can skip members it doesn't need, and a gate that requests changes sends the work back to the crafter once.

## Epics and schema validation

**What was wrong**
- Every `epics.json` with full epics inline, the canvas's normal format, failed strict validation. Each epic had to match exactly one of two shapes (`oneOf`), but a full epic also matched the loose "reference to an epic file" shape.
- After switching to "at least one" (`anyOf`), the reference shape (any epic with an `id` and `title`) let every epic pass, so inline epics were never actually checked.
- An acceptance criterion with both Given/When/Then and `criterion` text, and a story whose user story had both `asA`/`iWant`/`soThat` and `formatted`, failed the same way. The sample project's own story S-1.1 has both.
- The validator could report "invalid" with no reason, because it filtered out the only error it had.

**What changed**
- `epics.schema.json`: epic items use `anyOf`, and the reference shape carries `not: { required: ["stories"] }`, so an epic with stories must match the full shape. The acceptance-criterion rule and `story.schema.json`'s user story use `anyOf`. The other `oneOf` rules split by type (string vs object, array vs object, string vs number) and are unchanged.
- The validator skips branch-summary errors (`oneOf`, `anyOf`, `not`) when concrete errors explain them, and never reports invalid without a reason. An epic with a bad status now gets one message, for example `.content.epics[4].status: should be equal to one of the allowed values`, instead of six.
- An epic status of `partial` maps to `in-progress` through `x-aliases` (inline epic status and the shared `epicStatus` definition). The validator applies aliases, so this works on load and in chat edits, not only in repair.
- Checked against 224 real `epics.json` files: 222 were valid before and after, one moved from failing to valid, and one was correctly flagged for two `partial` statuses.

**Repair no longer guesses**
- Enum repair used to replace a value it couldn't match with the first allowed value (`partial` → `draft`). It now fixes typos within 30% edit distance (`redy` → `ready`) and abbreviations of at least 3 characters covering half the value (`in-prog` → `in-progress`), and leaves anything else for validation to report.
- The contains-match is gone: `not-ready` no longer becomes `ready`, `undone` no longer becomes `done`, and an empty value no longer matches the first status.
- A number outside its allowed set is left as is instead of being replaced by the default or first value.

**Seeing what's left**
- The "Schema issues detected" and Fix Schemas result messages list each file with its first error, a count of the rest, and the full text in a tooltip. The suggested fix, such as the allowed values, shows in full on its own line.
- `src/state/sample-project-schemas.test.ts` validates every sample artifact, and `src/state/schema-repair-engine.test.ts` covers alias, typo, abbreviation and no-guess cases.

## Headroom proxy

- `POST /v1/compress` with a `messages` value that isn't a list returns a 400 `invalid_request` error instead of a server error. Multi-part content with non-object parts is skipped safely.
- Its tests bind an OS-assigned port, so another process holding 8787 (a VS Code dev host, a real headroom-ai engine) no longer fails them.


## BMAD v6.12 parity: sharper code review

Review and prompt improvements from upstream BMAD v6.10–v6.12.4 are ported into the matching `aac-*` skills. Skill IDs, canvas wiring and the Phase 4 story chain are unchanged.

- **New `aac-review-verification-gap` reviewer.** It asks "if this behavior broke, would any test fail?" and reports changed behavior that no test would catch. It runs as a fourth layer in `aac-code-review` and `aac-quick-dev`, and its evidence rules feed the kanban review guard.
- **Every review finding gets a verdict.** Triage verifies each claim at the cited code before grading it (`high`/`medium`/`low`/`false`/`maybe-false`). Rejected findings are listed with the reason instead of being dropped silently. Findings merge only when the same defect produced them. A follow-up review is recommended by a simple score, not by judgment.
- **Edge Case Hunter finds more.** It now checks the members of an enum or flag set that a change left out, handles that can go stale, and call sites that don't match their callee. A deletion check flags behavior lost when code is removed.
- **Adversarial reviewer drops the "cynical" persona.** Upstream testing found the persona made no difference. The ten-finding floor and the "what is missing?" pass do, so those stay.
- **Reviewers launch together and run to completion** in the same turn, instead of one after another.
- **Kanban dev runs keep code clean.** No `# Epic:` / `# Story:` comments in source, and every changed file is committed. When a run blocks on an intent gap, it saves the attempted change as a patch you can apply later.
- **Party mode:** a new built-in `anti-consensus-club` room (Wildcard, Level, Killjoy, Splinter) for decisions that shouldn't be agreed too quickly. Parties now stay open until you end them, unless you pass `--non-interactive`. Agents persist across rounds, and agent-team turns are relayed to each member.
- **Two new elicitation methods:** Subtraction and Map Is Not the Territory.
- **`aac-create-epics-and-stories` keeps `status: draft`** until every final validation check passes.

## BMAD module updates: Builder, Creative Intelligence, Test Architect

Content ported from upstream BMB v2.2.2, CIS v0.3.2 and TEA v1.27.2 (TEA's last BMAD-v6 release). Upstream installer, `uv` and layered-config machinery was left out.

**Test Architect (Murat)**
- **Knowledge fragments now actually load.** Every TEA workflow pointed at a knowledge index path that didn't exist, so ATDD, automate, CI, framework, NFR, test-design, test-review and trace ran without their knowledge base.
- **The knowledge base grew from 40 to 59 fragments.** New ones cover Playwright Utils and Pact.js Utils mandates, evidence integrity, a confidence gate, webhook testing, and mobile/Maestro guidance. Fragment selection is now a fixed list driven by what the repo contains.
- **Test design** ties every risk to evidence in the epic, links coverage rows to exact risk IDs, and sets priorities by business impact rather than risk score alone.
- **CI generation** guards against script injection through workflow inputs, requires quality gates that can actually fail, and adds Pact determinism and staleness checks.
- **Validation runs** write a separate timestamped report per scope instead of overwriting the last one.
- **Murat** uses your configured test libraries by default, and asks one focused question when a request could go to several workflows.

**Creative Intelligence agents**
- **CIS agents introduce themselves by name** (Carson, Maya, Victor, Dr. Quinn, Caravaggio, Sophia) instead of by job title, with richer personas and a capabilities menu.
- **The Presentation Master's seven capabilities** (slide decks, explainers, pitch decks, talks, infographics, visual metaphors, concept visuals) now run real guided prompts instead of placeholders. It also has its own 🎬 icon.
- **Fixed the four CIS workflow skills**, whose descriptions were cut off mid-sentence and which carried a byte-order mark that broke frontmatter parsing.
- **Fixed the storytelling chat prompt**, which introduced the agent as Caravaggio instead of Sophia.

**Agent and Workflow Builders**
- **Skills you build now load config from `_bmad/config.yaml`** instead of calling an `aac-init` skill that doesn't exist. The agent builder no longer recommends a nonexistent `aac-module-builder`.
- **Builders draft against a shared prompt-quality reference**, run a pruning check before building, start by asking you to share everything you have, and offer Analyze / Edit / Rebuild when handed an existing skill.
- **User-created skills are named `{module}-{name}` / `agent-{name}`.** The `aac-` prefix is reserved for bundled skills, and the name checks no longer flag valid user names.
- **Path scanner fixes:** valid `{project-root}/…` paths are no longer flagged as critical, and real double-prefix paths are now caught. Agent templates include `{project-root}` in memory paths, so newly built agents pass their own checks.
- **Skill manifests are consistently named `aac-manifest.json`.** The docs and the scripts disagreed. Manifest validation also no longer crashes on Windows consoles when printing ✓.

## Project context lives in AGENTS.md

- **New `aac-project-context` skill** (ported from BMAD v6.12). It writes one small, verified block of agent instructions into your repo's `AGENTS.md`, covering policy, where things are, how to run and verify, conventions, and known pitfalls. It has `setup`, `adopt`, `refresh`, `record` and `audit` intents, and shows you every write before making it.
- **Agent runs read that block first.** Board and in-chat agent runs now inject the `AGENTS.md` block ahead of the generated `project-context.md`. Blocks written by upstream BMAD (`bmad:context` markers) work too.
- **Skills load `AGENTS.md` before `project-context.md`** in their persistent context (33 skills).

## Deterministic sprint planning

- **Sprint status is generated by code, not by the model.** A TypeScript port of upstream BMAD's `sprint_plan.py` ships as `dist/sprint-plan.js` and needs only Node, no Python. It handles:
  - epic parsing, story keys and ordering
  - story-file detection
  - the never-downgrade status merge, mapping legacy `drafted`/`contexted` statuses
  - `action_items` carry-over
  - atomic writes, with the original restored if the post-write check fails
- **`aac-sprint-planning` uses it for generate, status and validate.** A `--dry-run` shows the drift before writing, and renamed stories are reported with their old statuses instead of silently dropped. A `generate --fresh --set key=status` repair path is the only way to downgrade a status. The skill falls back to manual steps if Node is unavailable.
- **The status view** reports counts, risks (stale file, orphaned stories, stories waiting for review), open retrospective action items and the next skill to run.
- **Works with canvas projects.** The script reads the canvas's own `epics.json` (`content.epics[].stories[]`, ids like `EPIC-1` / `S-1.1`), using a story's recorded status as a floor, not just markdown epic headings. Before this it found no epics in a canvas project.
- **Sprint health on the Sprint Planning view.** A strip under the project details shows the next skill to run and for which story, any risks (stale file, orphaned stories, stories waiting for review), and the open retrospective action items, which expand on click. Clicking the next step starts that skill in chat for the named story.
- **The sample project's `sprint-status.yaml` is regenerated** from its `epics.json`. It had two stale keys and covered only 2 of 4 epics.
- **Board runs now resolve `{bmad-path}`** in the skill text they inject, so script and step paths work outside chat too.

## Code review: a clean "no gaps" result is checked

- **Triage spot-checks a clean Verification Gap result once.** It picks the changed behavior whose regression would hurt most, searches the tests in the tree under review (for a commit, that commit's own tests), and files a finding if no test would catch the regression. A clean result also no longer cancels another reviewer's "this is untested" finding.
- **The Verification Gap reviewer judges a commit against that commit's tests.** Before, a test added in a later commit made the commit under review look covered.

## Broken paths fixed

- **TEA workflows found their step files at a path that didn't exist.** Steps now resolve to the bundled `aac-tea-*` skills.
- **The help catalog (`aac-help.csv`) pointed all 64 entries at files that didn't exist.** Every entry now points at its bundled skill. The canvas "ask for help" prompt also referenced a nonexistent `bmad-help.csv`.
- **TEA and CIS workflow config pointed inside the extension**, where no config file has ever existed. They now read `_bmad/<module>/config.yaml` from your project and fall back to the canvas output folder.
- **The TEA Teach-Me-Testing sessions and the CIS workflows referenced engine and workflow files that no longer exist.** They now point to the bundled advanced-elicitation and party-mode skills, and to their own step files.
- **Removed the unused duplicate TEA copy** under `resources/_aac/tea/` (684 files nothing loaded).
- **New regression tests** check that CIS persona names load, that every TEA knowledge fragment and `{bmad-path}` reference in the TEA and CIS skills exists, and that every help catalog entry resolves.

## Dependencies

- **`headroom-ai` 0.22.4 → 0.45.0.** Every compression API the extension uses was smoke-tested against the new version and behaves the same. The upstream breaking changes in 0.40, 0.43 and 0.44 only affect the Python proxy packaging.

