# Changelog

## Unreleased

Brings the bundled BMAD content up to upstream v6.12.4 where it helps the canvas, makes sprint planning deterministic, and fixes many bundled paths that pointed at nothing. Full detail: [docs/changelog/unreleased.md](docs/changelog/unreleased.md).

### Feature: More reliable agent runs

Board runs stop when stuck rather than on a fixed timer, retry only failures that can clear on their own, and resume their conversation for rework.

- Runs stop after 15 minutes with no output, with a 2-hour limit overall. Before, every run stopped at 20 minutes, even one still working. Set them with `agents.idleTimeoutMinutes` and `agents.maxRunMinutes`.
- A failed run is retried automatically only for network errors, a stuck agent, a missing verdict file, rate limits (after 60 seconds) and provider server errors (after 15 seconds). Sign-in, API key, model, quota and context-overflow failures go straight to the card with their fix actions.
- Failures now name a full context window, a temporary rate limit (including the 403 "concurrent request limit"), a spent quota, and provider 5xx errors separately.
- With Claude Code, a card back for rework resumes its previous conversation and sends only the new instructions and fix requests. A run that ended without a verdict is never resumed. Turn this off with `agents.resumeSessions`.
- Each run in a card's timeline lists the context it received: name, size and how it was delivered, without the content.

### Feature: Autopilots

Run recurring agent work on a schedule while VS Code is open.

- Define runbooks with cron schedules in the autopilots file (**Edit Autopilots** opens it), or start one with **Run Autopilot Now**. They are off until you turn on `autopilots.enabled` in your user settings, so a cloned project cannot start agents on its own.
- Each run uses a fresh agent session and runs once even with several windows open. A run that needs attention goes to the board's Inbox and the status-bar count, not a popup.

### Feature: Agent team protocol

Team runs now pass work between members instead of running a fixed pipeline blind.

- Each member gets a brief with its role and the roster, and receives the earlier members' handoff notes. Before, members received nothing from each other, because their output was never captured.
- The coordinator can skip members it doesn't need, and a gate that requests changes sends the work back to the crafter once.

### Feature: Calmer agent board

The Agentic board shows each card's work in one place and only interrupts you for decisions.

- A card's detail panel has one **Activity** feed: runs, agent commits and trace steps by day, newest first. Each run opens to the steps it took and the context it received; the separate Runs, Agent commits and Activity sections are gone.
- An **Inbox** lists everything waiting on you: approvals, agents' questions, stopped runs with their fix button, proposals, stories the lead gave a person, autopilot runs, budget and circuit-breaker stops. Work it like mail: the list on the left, the selected item and its card page on the right; <kbd>J</kbd>/<kbd>K</kbd> move, <kbd>A</kbd> approves a card in review, <kbd>R</kbd> replies, <kbd>E</kbd> dismisses, <kbd>Enter</kbd> opens the card. It opens by itself when an agent is paused on an approval.
- A sidebar on the board: Inbox with its count, then Board, **Working** (cards an agent has now), **In review** and Terminals, then each epic with its progress, which narrows the board to that epic. In a narrow tab the sidebar shows icons only.
- The board inside the Canvas tab now gets live updates. Before, run results, progress lines, the Inbox and team changes went only to a hidden board view, so a finished or blocked run kept showing "Agent is working…".
- The Canvas no longer offers to reload for the board's own files (terminal sessions, queues, run output); it still does for artifacts changed outside the extension.
- Starting or approving a card from its page keeps you on the page, and a description that only repeats the user story is no longer shown twice.
- A question an agent asks while it runs can be answered: the Inbox shows it with an answer box, and so does the card's page. Before, the question text and answer box were hidden, so a waiting agent could not be answered. A question answered during the run is not raised again from the run's verdict.
- A card a person works shows no agent message box, Retry or Resume; it says the person works it by hand.
- An epic's page shows how far along it is (percentage, and a bar of done, under way and not started), its stories grouped by column (open one from there), stories per agent or person, its lead, and its **Context for agents**.
- Assign a card to a named agent from its detail panel. The card shows the assignee and runs on its CLI and model. Until you add an agent, each installed CLI acts as one.
- Create, edit and delete agents in the **Agents** dialog on the board: a name, one of the installed CLIs, and a model. The model list comes from the CLI itself for Claude Code, Codex, OpenCode and Pi, without starting a model call; for other CLIs you type a model, and the Cursor and Copilot CLIs keep their own model setting.
- A running card shows the agent's latest output line, and each Claude Code run records its tokens, shown per run and per card.
- Message a card's agent from its detail panel. While the agent works, the message waits and is sent when the run ends; it reaches the agent as a fix request in the same conversation.
- Cards are quieter: the id and an activity indicator on top, then the title, one status line, the epic's name and the assignee by name. Epics show a stack icon and a progress ring instead of a coloured stripe.
- **Start** on a ready card (on hover) and **Stop** on a running one. Right-click offers Start or Stop, Open terminal, and moves; **Approve and mark done** appears only on cards in Review, so nothing skips review by accident.
- One toolbar replaces five rows: Board and Terminals tabs, the filter, the coding agent, **Autopilot**, **New goal**, **Agents**, **Inbox** and a **⋯** menu. The five columns share the width, so the whole flow fits in a normal editor tab. The Inbox no longer opens off-screen.
- A card opens as a page in place of the board: its title, user story, description and acceptance criteria, then the activity thread with a message box at the bottom to steer or answer the agent. A side column holds status, assignee, epic, priority and the agent's run. **Board** goes back; the epic in the breadcrumb opens the epic.
- Cards in Review show **Approve and mark done** (the review check runs, then the branch is merged or a pull request opened) and **Request changes**, which takes you to the message box. Ready cards show **Start agent**, running ones **Stop agent**. Buttons in the card view are real buttons again; before, an old style made them look like plain text.

### Feature: Agents that work with the board, and a lead agent

Agents now know who they are and what the board expects, can ask you and each other for things, and one agent can lead the rest.

- Every run tells the agent its name, role, model and instructions, who else is on the team, and the notes earlier agents left on the card. Give an agent a role and standing instructions in the **Agents** dialog.
- An agent can ask you a question instead of guessing. The card waits with "Waiting for your answer"; answer from the Inbox or the card, and the agent continues in the same conversation.
- An agent can propose new cards instead of widening its own. Proposals wait in the Inbox for your approval, or are created at once with `agents.autoApproveProposals`. Approving a goal's stories now creates them as cards; before, nothing was created.
- An agent can hand a card to another agent on the team, and leave notes for whoever works on the card next. All of it shows in the card's Activity.
- Mark one agent as **Lead**. An epic you give it, or a goal you type while a lead exists, is planned instead of implemented: the lead proposes the stories, assigns them to the other agents by role, and is woken each time one finishes. It moves the epic to review when the goal is met and leaves done to you. It never implements, runs at most 20 times per epic, and stops with an Inbox entry if it twice does nothing.

### Feature: Live board tools, skills, capacity, people and epic context

Agents can talk to the board while they work, and the team can include people.

- Claude Code and Codex runs get board tools during the run: read the card or its epic, leave a note, propose cards, hand off, read messages you sent since the run started, and ask you a question and wait up to 10 minutes for the answer. They run through a local endpoint with a per-run token; the verdict's board block still works for other CLIs.
- Give an agent skills in the **Agents** dialog. Bundled and workspace skills are copied into each run and listed in its brief. **Preview brief** shows exactly what an agent receives.
- Each agent runs one card at a time by default (**Runs at once** raises it). Other cards wait in priority order and show "Waiting for Dev (1 of 1 busy)"; a wait over 30 minutes goes to the Inbox.
- The **Usage** tab totals runs, time and tokens per agent for today, this week and this month. It shows no costs.
- **Add person** puts you, or someone you name, on the team. A person's cards never start an agent. When the lead assigns a person a story it appears in the Inbox, and moving that card to done wakes the lead.
- An epic's **Context for agents** (files, folders, links and a note, in its detail panel) is listed in the brief of every story in that epic. Files are listed, not pasted, and links are not fetched.
- Autopilots can run on board events as well as on a schedule: `"on": {"event": "card.done"}`, also `card.stopped`, `card.needs-answer`, `pr.merged`, `pr.checks-failed` and `goal.approved`, optionally for one epic. The run is told what happened.
- An epic run by the lead shows its progress on the card, for example "Chief of Staff · 3 of 5 done".

### Feature: Sharper code review

Code review now verifies every finding against the code and reports changed behavior that no test would catch.

- Added a Verification Gap reviewer that asks "if this behavior broke, would any test fail?", judged against the tests of the commit under review. It runs alongside the existing reviewers in code review and quick dev, and its rules feed the kanban review guard.
- Triage gives every finding a verdict (high, medium, low, false, maybe-false) and lists rejected findings with the reason. A clean "no gaps" result is spot-checked once, and follow-up reviews are recommended by a fixed score.
- The Edge Case Hunter now checks values of a set that a change left unhandled, stale handles, mismatched call sites and behavior lost by deletions. The adversarial reviewer dropped its "cynical" persona, which upstream testing showed made no difference.
- Reviewers start together and run to completion in the same turn.
- Kanban dev runs keep epic and story comments out of source, commit every changed file, and save blocked work as a patch.

### Feature: Deterministic sprint planning

Sprint status is now generated by code instead of the model, and the Sprint Planning view shows what to do next.

- Added a Node script (a port of upstream BMAD's sprint planner, no Python needed) that parses epics, never downgrades a status, carries over retrospective action items and writes safely. Sprint planning uses it to preview, generate, repair and validate.
- Reads the canvas's own epics.json as well as markdown epics. Before, it found no epics in a canvas project.
- Added a health strip to the Sprint Planning view: the next skill to run (click to start it), risks, and open retrospective action items.
- Refreshed the sample project's sprint status and gave it retrospective action items.

### Feature: Project context in AGENTS.md

AGENTS.md is now the main source of project instructions for agents.

- Added the project-context skill. It writes one small, verified block into your AGENTS.md (policy, layout, how to run and verify, conventions, pitfalls), and shows every write first.
- Board and chat agent runs read that block before the generated project context, and 33 skills load it first.

### Feature: BMAD module updates

Ported the useful parts of upstream Test Architect 1.27.2, Creative Intelligence 0.3.2 and Builder 2.2.2, plus core v6.10–v6.12 prompt fixes.

- Test Architect: the knowledge base grew from 40 to 59 fragments. Test design ties risks to evidence, and CI generation guards against script injection.
- Creative Intelligence agents introduce themselves by name and have working capability menus. The Presentation Master's seven capabilities now run real prompts.
- The agent and workflow builders produce skills that load real config, follow a shared prompt-quality guide and pass their own path checks.
- Party mode gained an anti-consensus room and stays open until you end it. Added two elicitation methods (Subtraction, Map Is Not the Territory). Epics stay in draft until final validation passes.
- Upgraded the Headroom compression engine from 0.22 to 0.45; every compression call the extension makes behaves the same. The built-in proxy answers a request whose message list is malformed with a clear 400 error instead of failing.

### Fixed: The board noticing a sign-in, and saying when a drag runs nothing

- Signing in to an agent from your own terminal now shows up when you come back to the board; it no longer says "Signed out" until you press refresh.
- After Sign in or How to install, the agent panel no longer stays busy.
- Dragging an epic into In Progress with no lead agent now says nothing ran and what to do (move its stories, or add a lead), instead of a plain "Moved".

### Fixed: Saving no longer rewrites your project files

Saving any change used to rewrite every artifact file, and some of what was rewritten was lost.

- Files keep their names and their own metadata: creation date, status, tags, author and workflow. A research file is no longer renamed with a "-default" suffix.
- A test design without an id is no longer deleted as an orphan, and saving it no longer fails.
- Only files whose content changed are written; the others are left untouched, `lastModified` included. Keys keep their order, and a difference in key order alone no longer counts as a change.
- The board's own files (run verdicts, the team, run history) are no longer read as artifacts, so loading no longer adds an empty "Untitled Epic" each time. Empty ones an earlier version saved are no longer shown.
- Checking a change against the policies no longer edits the artifact in memory, which had put file names in the wrong field of UX references and blanked epic ids on the next save.
- A story can be approved, or otherwise changed, when it already had a schema problem the change didn't cause; a change that adds one is still blocked.
- Agent notes, fix requests and epic context survive a reload; the epics list points at the real epic folders; saved files always have a creation time; and UX references stored as plain file names now pass the story schema.

### Fixed: Bundled paths that pointed at nothing

Many bundled skills referenced files that did not exist, so parts of them silently did nothing.

- Test Architect workflows now find their knowledge base and step files, which they had been running without.
- Every entry in the help catalog now opens a real skill; all 64 pointed at missing files.
- Test Architect and Creative Intelligence workflows read your project's BMAD config instead of a file inside the extension.
- Board runs resolve skill paths, the storytelling prompt names the right agent, skill manifests share one name, and manifest validation no longer crashes on Windows consoles.
- Removed an unused duplicate copy of the Test Architect content (684 files). Added regression tests so these paths cannot break silently again.

### Fixed: Epics files failed strict schema validation

Every epics file with full epics inline, the canvas's normal format, failed strict schema validation, and the validator gave no reason.

- The epics schema now accepts an epic that also fits the lightweight reference shape.
- An epic that has stories is checked against the full epic shape. Before, the reference shape let any epic with an ID and title pass.
- An acceptance criterion can have both Given/When/Then and `criterion` text, and a story's user story can be both structured and formatted. Both used to fail.
- The validator always explains a failure instead of reporting invalid with no errors. It reports the concrete problem, such as an epic status that isn't allowed, without the shape-matching messages around it.
- An epic status of `partial` is read as `in-progress`. Before, repair turned it into `draft`, marking half-done epics as not started.
- Repair no longer replaces a status (or any listed value, text or number) it can't match with the first allowed value. It fixes typos and abbreviations like "In Progress" or "in-prog" and leaves anything else for validation to report. "not-ready" no longer becomes "ready", nor "undone" "done".
- The schema messages on the canvas show why each file fails, not just its name, including what Fix Schemas could not repair. The suggested fix, such as the allowed values, is shown in full on its own line.
- A new test checks every sample project artifact against its schema.

## 0.6.0

The Agentic Kanban now runs on whichever coding agent you already have installed, with safe defaults for any repository. Runs stop cleanly, survive a window reload, and tell you why when an agent fails.

### Feature: Use the agent you already have

- **Eight harnesses supported:** Claude Code, Codex CLI, Gemini CLI, GitHub Copilot CLI, Cursor CLI, OpenCode, Pi and Aider. Each one launches headless with flags checked against its current CLI.
- **No CLI installed?** Board steps run through the VS Code language model (for example GitHub Copilot Chat).
- **Never a silent fallback:** a harness you pick but haven't installed blocks the run with install instructions instead of switching to another CLI.
- **Agile Agent Canvas: Check Agent Harnesses** shows what's installed, which harness the board will use and with what permissions, and runs a real smoke test.
- **Prompts never travel on the command line.** They go through a private file, so long or unusual prompts work the same in PowerShell 5.1, PowerShell 7, cmd and bash.

### Feature: Safe by default

- **New setting `agileagentcanvas.agents.permissionPosture`:** defaults to `sandboxed`, where agents edit workspace files but get no unrestricted shell where the CLI supports it. `full` needs a trusted workspace and a one-time confirmation.
- **Restricted Mode:** agents, the AI file-write tool and remote agent calls are disabled in untrusted workspaces.
- **Real spend caps:** $5 per story and $25 per day by default (`agileagentcanvas.budget.*`). Spend survives a restart.
- **Agile Agent Canvas: Stop All Agents** stops every running agent and pauses the scheduler.
- **Auto-advance is off by default** for new users. The AI file-write tool refuses git hooks, `.vscode`, npm manifests, `.env` files and CI workflows.

### Feature: Runs you can trust and inspect

- **Stopping a run stops the agent.** Nothing is committed or reviewed afterwards, and a timed-out agent is stopped before a retry starts.
- **A run left in flight by a reload or crash is resolved on the next start:** finished, re-attached if its terminal survived, or interrupted, with the card moved back to its previous column.
- **When an agent exits without a verdict, the card shows the agent's last output** (expired sign-in, missing API key…) instead of guessing that the work succeeded.
- **Agile Agent Canvas: Show Agent Run History** lists every board run with harness, verdict and summary.
- **Failing stories back off and pause after 3 failed runs in a row.** The circuit breaker now counts runs that end without a verdict.

### Feature: The board tells you what's wrong and how to fix it

- **Agent strip at the top of the board:** shows which agent runs it, its version and whether it's signed in, with **Sign in**, **Use** and **How to install** per agent. The agent and permission level can be switched from the toolbar.
- **Stopped cards say why in plain words** (signed out, missing key, model not available, quota, not installed…) and offer the fix: **Sign in**, **Switch agent**, **Retry**, **Show output** or **Move back**.
- **Status-bar "needs you" count** for cards waiting on you: stopped runs, approvals, and stories paused after repeated failures. Clicking it opens the card.
- **Card detail additions:** **Preview prompt** shows exactly what the agent will be told, without running it. Each card also has a run timeline, and agent commits can be reverted in one click (it asks first).
- **Measured costs for Claude Code and Codex runs:** usage now comes from their own session logs instead of an estimate.

### Feature: From card to merged code

- **Every autonomous card gets its own git branch and working copy,** next to your repo. Parallel cards no longer touch the same files, and your checkout is never switched. When a card is approved, its branch is merged back. If the merge conflicts, the run stops and the branch is kept for you (`agileagentcanvas.agents.isolation`).
- **Tests are a real gate:** after each implement step, the project's test command runs on the card's code. Failures go straight back to the agent as fix requests (`agileagentcanvas.agents.verifyCommand`).
- **Pull requests:** with `agileagentcanvas.agents.openPullRequests` on, an approved card becomes a pull request. The card shows its CI checks and review state, and **Address review comments** sends feedback and failing checks back to the agent.
- **Project context:** a generated project context file detects your build, lint and test commands and convention files. It's injected into every agent prompt and is yours to edit (**Refresh Project Context**).
- **Story ↔ code:** cards list the files each agent commit changed, and a CodeLens at the top of a file shows which stories changed it.
- **New commands:** **Sync GitHub Issues** (two-way, via the GitHub CLI, previewed before applying), **Show Engineering Metrics** (success rate per agent, fix cycles, lead time, cost per story) and **Generate Release Notes**.
- **Fix:** auto-commit and auto-PR never ran, because no git runner was connected. Agent commits are now made, so the diff review and **Revert** have something to work with.

### Feature: Guided tour of the canvas

- **A short tour runs the first time a project loads.** It highlights the lanes, **Add**, **Ask**, **Workflows**, the AI tool picker, **Kanban** and **More actions** one at a time, with **End Tour**, **Back** and **Next**. Arrow keys move between steps and Esc closes it.
- **Replay it any time** from **More actions → Take the Tour**. Steps for controls that aren't on screen are skipped.

### Security

- **AI API key in secure storage:** it now lives in VS Code's OS-keychain-backed secure storage (**Set AI API Key**) and is moved out of settings automatically. The Gemini key is no longer sent in the URL.
- **Remote agent (A2A) calls:** private, loopback and cloud-metadata addresses and redirects are refused, an optional host allow-list is available, and responses are capped at 1 MB.
- **Traces:** secrets and large file bodies are removed from traces, which are now size-capped and excluded from git. The local Headroom proxy rejects browser requests.

### Fixed: Codex board runs failed to launch

- **Codex never launched:** Codex CLI 0.163 rejects `--ask-for-approval`, so every Codex board run and card action failed to start.
- **Codex couldn't write files on Windows:** in the default `sandboxed` permission level, Codex silently ran read-only and refused every file write. Board runs now set Codex's Windows sandbox, so it can edit the workspace.

### Fixed: Policy failures never showed on cards

- **Harness policy results now reach the board.** When a policy check fails on a story or epic, its card shows the **Policy failed** badge with the failing policy and reason. Before, results stayed inside the extension and the badge never appeared. Results are kept when the board is closed and reopened.

### Fixed: Canvas flickered when zooming or panning

- **The canvas no longer flickers or jumps back while you zoom or pan.** Fast scrolling or dragging made the view bounce between two positions. In the mind map it could keep bouncing until the canvas froze. The view now stays where you put it in lanes and mind map, and each layout still remembers its own position when you switch.

### Under the hood

- Lint now blocks CI, and the existing lint backlog is cleared.
- Cucumber steps that only logged now check real behaviour, and the simulated board scenarios are replaced by React component tests that render the real board.

## 0.5.7

A lightweight **Ideas drawer** lives in the canvas — capture free-form notes without leaving the canvas, with the AI able to read them. Plus three round-trip / layout fixes that were caught immediately after the 0.5.6 release.

### Added: Ideas drawer

Free-form notes that live in the project folder, parallel to BMAD artifacts but outside the schema-validated BmadArtifacts union.

- **Toolbar 💡 button** (always visible, badge shows active count) + **Ctrl+Alt+I** / **Cmd+Alt+I** keybinding to open the drawer and focus the capture input.
- **Right-side panel**: paper-style note cards in yellow / blue / green / pink / gray, search box, color chip picker, Cmd/Ctrl+Enter to save, archive (soft) / restore / hard delete, click-outside or Escape to close.
- **Persists to `<outputFolder>/ideas/<id>.md`** as YAML frontmatter + body markdown. Same project-folder pattern as the artifact store, so ideas travel with the project across machines.
- **Refuses to save when no project is active** — yellow banner replaces the capture form, **Add** is disabled, and the **Open / create project** button routes to the existing project picker. The extension also blocks the save as a backstop and surfaces the reason as a red toast.
- **Two new LM tools** (`agileagentcanvas_list_ideas`, `agileagentcanvas_read_idea`) so the chat participant can list, search, and read captured ideas. Path-traversal guard on `read_idea` strips every path separator and re-checks against the allowed-roots allowlist before reading.
- **New command `agileagentcanvas.newIdea`** mirrors the `askAgent` broadcast pattern (sidebar + every open pop-out panel).
- Idea data is routed through both the sidebar canvas view-provider and the pop-out panel — neither path silently drops messages.

### Fixed

- **Pop-out panel silently dropped idea messages.** `openCanvasPanel`'s switch in extension.ts had no handlers for `createIdea` / `updateIdea` / `archiveIdea` / `restoreIdea` / `deleteIdea`, so messages from the drawer disappeared. The sidebar's canvas-view-provider handled them, but the pop-out is the default canvas surface, so most users never saw their ideas get saved. All 5 cases now route through `ideaStore` from both hosts, with multi-panel fan-out on every change.
- **Drawer didn't close on outside click.** Added a transparent scrim + document mousedown listener (drawer ref-guards so internal clicks don't fire) and a global Escape listener.
- **Top of the drawer hidden behind the canvas toolbar FAB.** Toolbar container is at `z-index: 100`; the drawer was at `z:51`. Drawer now drops to `top: 56px` with a `height: calc(100vh - 56px)` and a `border-radius: 8px 0 0 8px` so it reads as a sheet below the toolbar.

## 0.5.6

### Fixed: Windows reserved-name files blocked VSIX packaging

`vsce package` failed with *"The extension contains an entry extension/webview-ui/nul which is unsafe for extraction"* — two stray files literally named `nul` (a Windows reserved device name, like `con` / `prn` / `com1`) had regenerated in the source tree from a misdirected shell redirect.

- Files deleted.
- scripts/prepublish-guard.js now scans the entire source tree for the full Windows reserved-name set (`nul`, `con`, `prn`, `aux`, `com1`–`com9`, `lpt1`–`lpt9`) and fails the build before `vsce` gets a chance to reject the package. Skips `node_modules`, `.git`, `dist`, `coverage`, `reports`, and `webview-ui/build` to keep the scan fast.

## 0.5.5

The Agentic Kanban can now run cards end-to-end without human intervention. Visual Plan comments actually reach the AI. Context compression is provably accurate via real BPE tokens. 13 new BMAD v6.9.0 skills ship out of the box. Plus 32 WCAG contrast fixes across autonomy surfaces.

### Agentic Kanban: autonomous auto-advance

The Kanban can now drive a story through implement → review → done on its own.

- **`agileagentcanvas.kanban.autoAdvance`** setting (default off) — toggleable from the Kanban toolbar or Settings.
- Cards dropped into **In-Progress** run the loop, re-implementing on review failures up to `maxIterations` (default 3).
- Singleton orchestrator owns the concurrency lock for the entire run; a second drop on the same story is rejected.
- Optimistic-drop rollback — failed transitions return the card to its source column.
- New live progress events (`running` / `completed` / `interrupted` / `failed`) shown as card badges.

### Structured verdict contract

Both headless terminal and in-chat execution paths now produce and consume a structured verdict so the orchestrator can decide whether to auto-advance.

- Verdict shape: `COMPLETED | APPROVED | NEEDS_FIXES | BLOCKED | UNKNOWN`. The verdict file on disk is the single source of truth; missing or unparseable files yield `UNKNOWN` and the orchestrator stops rather than guessing.
- `NEEDS_FIXES` carries a `fix_requests` array attached to artifact metadata before the next iteration.
- Shared verdict helpers (path, sanitization, normalization, file reader) live in one module so terminal and chat paths can't drift.

### Visual Plan fixes

- **Request Changes now bundles comments** — typed comments automatically included as change annotations.
- **Approve & Dispatch nests stories properly** — real Story artifacts under the source epic with proper BMAD fields; free-form plans auto-create an epic.
- **Goal decomposer creates one epic per batch** — shared epic ID, full BMAD schema fields per story.
- **Visual-plan card overflow fixed** — tree-nested plan cards stay inside epic row bands.

### Headroom (context compression)

The in-process compression proxy is now owned by the extension — no manual `npx headroom-ai proxy` step.

- **In-process proxy** — listens on `127.0.0.1:8787`, auto-disposed on deactivation. Coexists with an external proxy if port is taken; status bar distinguishes "extension proxy", "external proxy", and "failed" states.
- **Status bar always visible** — distinct text/tooltip per state (disabled, starting, offline, active with stats). Click-through QuickPick for SharedContext, CCR store, and recent-call drilldowns.
- **Real BPE token counts** (Phase 3.1) — replaces the `len/4` heuristic with `gpt-tokenizer` cl100k_base so the savings percentage matches what the SDK bills.
- **Tool-result summarisation** (Phase 3.2) — array/object tool outputs get truncated before tokenisation, with re-stringify + parse-verify guard for safety.
- **CCR cross-call dedup with LRU** (Phase 3.3) — SHA-256 keyed store, `/v1/retrieve` endpoint for original-content lookup, `/v1/retrieve/stats` for live metrics.
- **Headroom Simulate / Retrieve** LM tools — preview savings before committing; resolve a content hash back to the original text.
- **A2A handoff compression** — intermediate artifacts compressed through SharedContext during agent-to-agent handoffs.

### BMAD v6.9.0 parity (13 new skills)

Catalogue auto-discovers the new skills without further wiring.

- **`aac-forge-idea`** — Socratic idea pressure-testing with optional `--attack` adversarial mode.
- **`aac-architecture-spine`** — Lean intent-based architecture; produces ARCHITECTURE-SPINE.md as the source of truth.
- **`aac-party-mode` enhancements** — Four run modes (`auto` / `session` / `subagent` / `agent-team`), custom parties from TOML, persistent party memory.
- **`aac-brainstorming`** — New brain-selector.html visual composer (69 techniques); 8 new techniques (HMW, JTBD, Empathy Map, Backcasting, TRIZ, Fishbone, Build on What Works, Scenario Cross); explicit diverge → organize → converge → commit phasing; top-level facilitation mode selector.
- **`aac-create-architecture`** — Breadth-coverage rubric added per altitude.
- **`aac-create-epics-and-stories`** — Recognises AAC-adapted `*ux*/**/DESIGN.md` and EXPERIENCE.md spines.
- **Retrospective action items in sprint-status.yaml** — `action_items:` array alongside epic-retrospective status, validated by schema and surfaced by `aac-sprint-status`.

### Addy Osmani + Matt Pocock skills parity (11 new skills)

All adopt the addyosmani section anatomy (Overview / When to Use / Process / Rationalizations / Red Flags / Verification). Skill pruning pass also applied to top-5 AAC skills (`aac-create-story`, `aac-create-prd`) — removed stale duplicates and collapsed overlapping rule sections.

- Addy Osmani (7): `aac-doubt-driven-development`, `aac-source-driven-development`, `aac-observability-and-instrumentation`, `aac-deprecation-and-migration`, `aac-context-engineering`, `aac-shipping-and-launch`, `aac-frontend-ui-engineering`.
- Matt Pocock (4): `aac-domain-modeling`, `aac-codebase-design`, `aac-handoff`, `aac-resolving-merge-conflicts`.

### Chat providers

- **`pi` (pi-mono) is now a first-class chat provider** — wired for headless terminal agentic execution with `pi --no-session --mode json --approve -p <prompt>`. Honours the user's own `pi` config for provider/model routing. **Do not enable in untrusted workspaces** — `--approve` auto-trusts project-local agent rules.
- **Provider selector dropdown fixed** — real availability detection, official brand SVGs, OMP standalone CLI detected when extension is missing, Claude CLI invocation corrected, OpenCode added as a first-class provider.

### Canvas fixes

- **Plan button hidden behind minimap** — `.canvas-content` layered above `.minimap` with `pointer-events: none` so cards in the bottom-right corner stay visible; clicks still fall through to the canvas pan handler on empty area.
- **mindmap-toggle consolidated** — duplicate button removed; remaining button uses context-aware icon (`grid` for lanes, `mindmap` for graph views). Status conveyed by icon rather than color-only cue (WCAG 1.4.1).
- **corpus3d mode restored** — keyboard `L` cycle remains 2-mode (`lanes ↔ mindmap`) so the 2-press-reset contract holds; button cycles all three (`lanes → mindmap → corpus3d`).
- **Canvas workflow modal phase assignment** — 13 new `aac-*` skills now route to their natural phase; `extractTriggerPhrase` extended for the addyosmani-style "Use when [conditions]" descriptions.
- **Regression guards** — new tests for canvas z-index layering, plan card overflow, and the artifact-store change listener that rebuilds the canvas on every mutation.

### Accessibility (32 WCAG contrast fixes)

Themed-token × surface contrast audit found 32 sub-3:1 pairs across autonomy surfaces against Dark+ / Light+ / HC-Dark. Fixes shipped:

- **Renderer-tag family** — tokenized to `var(--vscode-charts-*, #UniversalFallbackHex)`; per-theme contrast floors locked by regression test.
- **Pulse halos** — `inbox-pulse` and `safety-pulse` tokenized; `fleet-health-pulse` switched from opacity flicker to scale-only heartbeat so contrast stays at 1.0.
- **Terminal tile dot status colors** — switched from hardcoded GitHub-Dark hexes to theme-aware tokens.
- **Approve & Dispatch banner** — parent wrap bg tokenized to `var(--vscode-editorWarning-background, ...)`.
- **Cluster D-3 / D-4 / D-5** — shared nested-paren regex bug patched in both audit-script and test resolver; canonical alpha-blend branch mirrored; TOKS-rgba-blend helper factored.
- 9 new tests across 3 themes lock the fix surfaces against future regression.

### Ponytail minimalist heuristics in every prompt

A "necessity first, then stdlib, then native, then existing deps, then one-liner, then implementation" hierarchy is now baked into every system prompt — chat replies, workflow execution, multi-agent handoffs, terminal agents, antigravity orchestrator, goal decomposer. NOT-lazy-about exceptions (input validation, error handling, security, accessibility, calibration, explicit user requests) remain non-negotiable.

### `/ponytail-review` slash command

Audits an artifact (`/ponytail-review EPIC-3`) or whole project for reinvented stdlib, unneeded dependencies, speculative abstractions, complexity bloat. Findings carry severity + a concrete simpler alternative; full review persists as a code-review artifact.

### Phase 2 refactors

- **BMAD → AAC close-out** — six catalogue rows added; documentation examples updated to real framework paths or explicit `mock-workflow-fixture` literals. Residual footprint mapping finalized.
- **Phase 18 — `pickChanges` helper centralised** — single shared reducer-helpers.ts module; 26 named `*_FIELDS` consts lifted to module level across cis/tea/bmm/l1 for grep-discoverability.
- **`useEvent` migration** — entire webview UI converted from `useCallback`/inline arrows to `useEvent` for stable handler identity. 3 useRef stale-closure workarounds deleted. No user-visible behavior change.

### Bug fixes

- Harness pre-flight now evaluates the **merged candidate** instead of the bare delta — auto-fix no longer overwrites real artifact fields with generic placeholders.
- Lane transitions with only `terminalWorkflowId` (e.g. review → done) no longer silently dropped.
- Trace recorder step definitions use the OS temp dir instead of polluting the project root.
- Vision type boundary cleaned up — `id` / `title` / `status` exposed at the top level; structural cast removed; zero `as any` casts in production source.
- Lane-transition test aligned with the dropped dev-story confirm modal.
- 6 pre-existing mindmap-toggle test failures fixed by switching `layoutMode` from derived `const` to local `useState`.
- Lane-transition concurrency: 4 critical issues from the Kanban Agentic OS deep audit fixed — correct chat vs terminal dispatch path, circuit-breaker/budget errors never retried, in-chat session health monitoring, terminal reconnection actually matching by terminal name.

### Test infrastructure

- Cucumber `vscode-shim` listed FIRST in default and ci profiles (its `Module._load` hook installs before step files import `vscode`).
- New `wip` profile runs the 19 `@wip`-tagged scenarios with `transpile-only` for fast iteration.
- Regression guards added for: canvas z-index layering, plan card overflow, artifact-store change listener, dev-story confirm-modal skip contract, a11y contrast matrix per theme, renderers.css shape, lane-transition concurrency.

### New feature: Cross-Artifact Systemic Issue Detection

The harness engine feeds policy evaluation failures into a cross-artifact pattern detector. When the same policy fails on ≥3 artifacts, a color-coded banner appears in the Agentic Kanban with expandable pattern details and a dismiss action.

### Feature: Headroom quick-pick

Click the active Headroom bar to surface a transient QuickPick with SharedContext (A2A handoffs), CCR store, and Recent Compress Calls drilldowns. Settings stays reachable from the quick-pick.

---

## 0.5.4

Transparent context compression ships out of the box. Full BMAD v6.8.0 module update across core + BMM, BMB, TEA, and CIS.

- **Headroom context compression** — auto-detects the Headroom proxy, lazy-loads the SDK on first chat call, transparently compresses all LLM-bound messages. Tracks cumulative savings. `agileagentcanvas.headroom.enabled` opt-out setting. Status bar shows savings % alongside cost when active.
- **BMAD v6.8.0** — 4 new V6 skills (`bmad-spec`, `bmad-investigate`, `bmad-prd`, `bmad-ux`); BMB 0.1.6 → 1.1.0 (agent-builder, workflow-builder); TEA 1.3.1 → 1.19.0 (all 9 workflows); CIS 0.1.8 → 0.1.9 (6 new agent personas — Carson, Dr. Quinn, Maya, Victor, Caravaggio, Sophia).

---

## 0.5.3

Custom ESLint rule, agent-to-agent message bus, the first Agentic Kanban view, multi-agent team execution (ACP), harness governance loop, and the trace recorder.

- **`no-bare-assert` ESLint rule** — every `assert.strictEqual` / `assert.ok` / `assert.deepStrictEqual` in step definitions must include a descriptive message. ~98 bare assertions fixed across 12 files.
- **Agent-to-Agent Message Bus** (`src/acp/agent-bus/`) — dynamic peer-to-agent discovery with capability-based routing, pub/sub with wildcard topics, priority queuing, handoff negotiation.
- **Agentic Kanban View** — webview-registered kanban with shared `KanbanCard` / `KanbanColumn` components; lane transition engine; session restoration.
- **Multi-Agent Team Execution (ACP)** — `AcpSession`, `AgentTeamOrchestrator` with TEAM_REGISTRY (dev-story, refactor, generate-code, review-code teams). `agileagentcanvas.agentTeam.enabled` feature gate.
- **Harness Governance Loop** — synchronous policy engine (trace-anomaly, feedback-accumulation); severity escalation advisory → warning → blocking; active failures injected into agent prompts; pre-flight blocks on blocking failures.
- **Trace Recorder** — per-session JSONL logging (tool calls, LLM responses, decisions, errors, handoffs); `agileagentcanvas.trace.enabled` + `trace.retentionDays` settings.
- **YOLO mode** — `agileagentcanvas.yoloMode` setting for skipping interactive checkpoints.
- **VSIX build pipeline** — `npm run compile` runs type-check + esbuild + webview UI sequentially; verified VSIX at 3.87 MB.

---

## 0.5.2

- **Fixed: NUL filename packaging error** — two files literally named `NUL` (Windows reserved device names) deleted; VSIX publishes cleanly.

---

## 0.5.1

3D Corpus view with custom shapes per artifact type, real provider detection in the dropdown, mindmap redesign, 3D corpus search & filter.

- **3D Corpus view** — force-directed 3D graph with per-type shapes (Sphere / Cone / Box / Cylinder / Torus / Tetrahedron / Dodecahedron / Octahedron); phase color coding; auto-rotation; click-to-select; animated edge particles.
- **Provider Selector dropdown fixed** — real availability detection across copilot / claude / cursor / windsurf / antigravity / omp / opencode / codex / aider; official brand SVGs; OMP standalone CLI detected; Claude invocation corrected.
- **Mindmap redesign** — larger cards, depth-based group boxes, stronger phase nodes, depth-graded tree lines with arrowheads.
- **3D Corpus Search & Filter** — real-time filter; matched nodes stay bright, non-matched dim; auto-frame on single match; "N found" badge.
- **Tree-shaken THREE import** — webview bundle 2,179 kB → 1,570 kB (~28% reduction).
- **Card overlays removed** — artifact names now via native tooltip; eliminates per-frame DOM updates.

---

## 0.5.0

JSON↔Markdown bouncing eliminated (root-cause fix for LLM sync loops). Provider-level structured outputs. 10 new built-in tools (16 → 26). Tool catalog & telemetry.

- **JSON↔Markdown bouncing fixed** — artifact writes are JSON-only; stale `.md` companions auto-renamed to `.md.bak` on upgrade; LLM persona override forbids reading `.md` as source of truth.
- **Provider-level structured outputs** — `response_format: json_object` (OpenAI), tool-use schema (Anthropic), `responseSchema` (Gemini), `format` parameter (Ollama), `JsonObject` (VS Code LM). Configurable `agileagentcanvas.defaultTemperature` (default 0.2).
- **Robust fence stripping & validation** — new json-extract.ts handles fenced/bare JSON; validation retry loop with escalating feedback.
- **10 new built-in tools** — `agileagentcanvas_repair_json`, `agileagentcanvas_frontmatter_extract`, `agileagentcanvas_yaml_to_json`, `agileagentcanvas_json_diff`, `agileagentcanvas_json_merge`, `agileagentcanvas_write_file`, `agileagentcanvas_sync_story_status`, `agileagentcanvas_sync_epic_status`, `agileagentcanvas_graph_community`, `agileagentcanvas_artifact_query`, `agileagentcanvas_workflow_resolve_vars`, `agileagentcanvas_types_from_schema`, `agileagentcanvas_schema_from_json`, `agileagentcanvas_codebase_search`.
- **Tool catalog & telemetry** — docs/tool-catalog.md (authoritative reference for all 26 tools); few-shot examples injected into every system prompt; `toolTelemetry` singleton with JSONL persistence; `/suggest-tool` command; weekly waste report.

See [docs/changelog/0.5.0.md](docs/changelog/0.5.0.md) for the full detail.

---

## 0.4.4

- **graphify backend auto-detect & remediation** — when `agileagentcanvas.graphify.backend` is set to a non-empty value, a modal explains the routing before any work begins. "Clear setting & use VS Code LM" option for users without an external API key.

---

## 0.4.3

Skill Catalogue Manager and git-sourced skill repos — the extension is now genuinely extensible from a user folder or any git URL.

- **User-managed skill folder** (`agileagentcanvas.userCataloguePath`) — subfolders with SKILL.md treated as skills/agents; live FileSystemWatcher reload; user skills override built-ins by folder name.
- **Skill Catalogue Modal** — 5 tabs (All / Agents / Skills / User-Added / Skill Repos); create from template; delete with confirmation; open folder in Explorer.
- **Git Skill Repos** — paste any git URL; cloned with `--depth 1` into a managed `_repos/` subfolder; per-skill `.repo-source` sidecar records provenance; Sync runs `git pull` and re-discovers.
- **`/help` smart skill routing** — natural-language prompt → top 3–5 catalogue matches with one-sentence explanation. CLI-compatible markdown output. Keyword fallback if the LLM response can't be parsed.

---

## 0.4.2

Codeburn integration for AI cost/token observability. Graphify Index architecture corpus & modal.

- **Codeburn** — integration module under `src/integrations/codeburn/` with status bar visibility, command palette actions, `/codeburn` chat command (with `/cost` and `/tokens` aliases), and the `agileagentcanvas_codeburn_report` LM tool. Cross-platform detection (CLI / local `node_modules/.bin` / `npx` fallback).
- **Graphify Index** — `graphify index .` CLI stage generates ARCH_INDEX.md + ARCH_INDEX.json (community summaries, god-node detection, cross-community edges, token-budget metadata). `GraphifyModal` webview component with Pipeline Tracker / Arch Corpus / Recommended Actions sections.
- **`agileagentcanvas_graph_community` LM tool** — AI can query community-specific wiki content.
- **graphify integration docs** — updated with per-repo and cross-repo CI YAML templates and a Tiered Context for Coding Agents section.

---

## 0.4.1

Jira Cloud read integration with conflict picker. Single source of truth for status fields. CLI agent integration with full tier coverage.

- **Jira Cloud** — fetch epics/stories, dedicated modal with 5 tabs (Fetch Epics / Stories / Issue / Sync to Canvas / Connection), field-level conflict picker before any overwrite, `/jira` chat command with 4 subcommands, `agileagentcanvas_read_jira` LM tool, secure token storage in OS keychain, `/rest/api/3/search/jql` cursor-based pagination.
- **Status field consolidation** — single `status` field replaces dual `verified`/`status` and `completed`/`status` patterns; transparent migration on load.
- **Index files removed** — stories-index.json and epics-index.json deleted (LLMs were treating them as authoritative sources of truth).
- **CLI agent integration** — 13 new workflows in manifest (security-audit, ceo-review, eng-review, design-audit, verification-loop, coding-standards, e2e-testing, eval-harness, api-design, create-story-checklist, story-enhancement, epic-enhancement, dev-story-checklist); 6 delegation stubs converted to executable; artifact-type routing table in help.md; version-aware auto-reinstall.

---

## 0.4.0

Artifact persistence & sync fixes (payload-authoritative merge, race conditions, orphan cleanup). Claude Code workflow wrappers become executable instead of delegation stubs.

- **`writeJsonFile` payload-authoritative merge** — only `_`-prefixed extension keys preserved during re-serialization; deleted standard fields properly removed from disk.
- **Race conditions fixed** — `deleteArtifact` awaits all underlying `fs.delete` ops; `saveStoriesToFile` actively prunes orphaned JSON files.
- **Timestamp churn eliminated** — `lastModified` no longer overwrites `created`.
- **Claude Code workflow wrappers** — `/dev`, `/sprint`, `/review` etc. now load and follow the actual BMAD workflow files directly instead of saying "go to VS Code Chat". `STUB_TO_MANIFEST` lookup map routes each stub to its entry file; `refine` / `enhance` / `elicit` remain as delegation stubs (depend on VS Code extension APIs).

---

## 0.3.9

5 GSD-inspired skills, agent honesty guardrails, single story file architecture for implementation status.

- **5 GSD skills** — Codebase Mapper, Assumptions Analyzer, Trade-off Advisor, Execution Task Protocol, Test Classification Strategy. 4 new elicitation methods.
- **Agent honesty guardrails** — 3-state task progression (`pending` → `implemented` → `verified`); proof-of-work gate (debugLog required); explicit prohibition on fake data seeding; grep self-audit for TODO/FIXME/stub before completion.
- **Single story file architecture** — `epics/epic-{N}/stories/{id}.json` is the single source of truth for status; migration from `stories/{id}.json` + `implementation/{id}.json` automatic on load.
- **Code-review post-fix integrity re-scan gate** — mandatory re-scan for TODO/FIXME/stub after applying fixes; cannot proceed to status update with hits.
- **Dependency graph sync fidelity** — canvas dependency arrows render from epic.json → `content.stories[].dependencies`; bidirectional sync in `create-story` and `dev-story`.

---

## 0.3.8

- **Canvas export rewritten** — single offscreen capture pass driven by React state coordinates replaces the slow DOM-tiling strategy. Large exports complete in seconds; auto-crops unused empty space.

---

## 0.3.7

Gstack elicitation workflows, ECC-inspired skills, test case tracking, and major artifact store refactor.

- **Gstack workflows** — Security Audit (STRIDE, OWASP), Execution Lock Review, CEO Scope Review, Design Dimension Audit, Six Forcing Questions (Garry Tan).
- **5 ECC-inspired review skills** — Verification Loop, Coding Standards, E2E Testing, Eval Harness, API Design Review.
- **Test case tracking & audit** — explicit test-case extraction rules in dev-story and quick-dev; formalized `status: "done"`; code-review extraction audit closes the test-implemented-but-not-tracked loophole.
- **Artifact store refactor** — automated workflow status cascading (task open → story in-progress → epic in-progress); story JSON files as the absolute single source of truth; bidirectional status sync with sprint-status.yaml removed; `status` stripped from epic `storyRefs`.
- **Canvas UX** — Refinement menu consolidated; "Code Review", "Dev Story", "Sprint Planning" now in the Sparkle menu for Story and Epic cards.

---

## 0.3.6

Single canonical story file. Epic JSON slim-down with lightweight storyRefs. Code-review post-fix integrity re-scan gate.

- **Single story file** — `epics/epic-{N}/stories/{id}.json` is the canonical path; old `implementation/` directories auto-migrated on load.
- **Epic JSON slim-down** — `storyRefs[]` replaces full Story[] embedding; full story data remains in standalone files.
- **Atomic status sync tools** — `agileagentcanvas_sync_story_status` / `agileagentcanvas_sync_epic_status` for atomic multi-file updates.
- **Code-review post-fix integrity re-scan gate** — mandatory re-scan before status update closes the stub-introduced-by-fix loophole.

---

## 0.3.5

Acceptance Criteria as a distinct third category with verified/status lifecycle. Tabbed story detail layout. Status mapping fix.

- **Acceptance Criteria lifecycle** — distinct category on story cards (`📋 N/Total` chip with progress bar); `verified` + `status` fields extended in schema and types; three workflows (`create-story` / `dev-story` / `code-review`) updated to maintain AC lifecycle.
- **Tabbed story detail layout** — Tasks / Tests / ACs tabs replace vertical list; dynamic tabs (only those with content).
- **Status mapping fix** — mapStatus() now passes through all 22 valid `ArtifactStatus` values instead of collapsing to 4; Kanban column normalization into 5 existing columns.
- **Dependency graph sync fidelity** — canvas dependency arrows use precise story IDs from epic.json `content.stories[].dependencies`; bidirectional sync in `create-story` / `dev-story`.
- **Code-review enhancements** — ground-up baseline mandate (no prior review is validated baseline), TODO/stub audit, round-trip persistence audit, response-truthfulness check, AC verification before `done`.

---

## 0.3.3

- **Visible Artifact IDs** on canvas cards.
- **Schema relaxation** — `additionalProperties: true`; `devNotes.dataModels` accepts strings or structured objects; epic items accept lightweight ref entries alongside full epics.
- **Test execution tracking** — `test_execution_status` from sprint-status.yaml maps onto story test cases.

---

## 0.3.2

Standalone epic files. 17 schema validation warnings → 0. Use case and test strategy preservation on reload.

- **Standalone epic files** — each epic saved to `planning-artifacts/epics/epic-{id}.json`; epics.json becomes a lightweight manifest. Backward-compatible loading; auto-split on save.
- **Schema ID convention audit** — 12 schemas updated with explicit ID format guidance for LLM-generated IDs.
- **Artifact array migration** — refactored schemas and `ArtifactStore` to support arrays of `codeReview`, `techSpec`, `testReview`, `retrospective`, `changeProposal`, `uxDesign`, `readinessReport`, `sprintStatus`.
- **Bug fixes** — use case / test strategy preservation on duplicate-epic merge; 17 schema validation warnings → 0; test design rendering and overwriting; auto-reload data loss prevention; test case ID auto-generation; epic/story ID normalization; epic swimlane height accumulation.

---

## 0.3.1

IDE installer overhaul with workflow stub provisioning.

- **Workflow stub provisioning** — `.agent/workflows/` with 29 workflow stubs for Antigravity / Windsurf / Rovo Dev so slash commands work without the VS Code chat participant API.
- **Schema reference file** — `.agent/schemas-location.md` points the LLM at the extension's bundled schema directory.
- **Fixed `legacyDirs` regression** — `.agent/workflows` no longer deleted on auto-install.
- **Schema relaxation** — 94 enums relaxed to open `string` with description across 33 schema files.

---

## 0.3.0

Story children layout refactor. Acceptance Criteria lifecycle schema groundwork.

- **Compact story cards** — task and test-coverage cards no longer stacked; stories show inline `childBreakdown` badges ("3 Tasks ▸", "5 Tests ▸") and compact summary chips with progress bars.
- **AC lifecycle schema** — `verified` + `status` fields added to AcceptanceCriterion type (initially defaulted; behavior locked in 0.3.5).