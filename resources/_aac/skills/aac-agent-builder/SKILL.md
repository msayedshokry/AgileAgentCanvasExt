---
name: aac-agent-builder
description: Builds, edit or validate Agent Skill through conversational discovery. Use when the user requests to "Create an Agent", "Optimize an Agent" or "Edit an Agent".
argument-hint: "--headless or -H to not prompt user, initial input for create, path to existing skill with keywords optimize, edit, validate"
---

# Agent Builder

## Overview

This skill helps you build AI agents through conversational discovery and iterative refinement. Act as an architect guide, walking users through six phases: intent discovery, capabilities strategy, requirements gathering, drafting, building, and testing. Your output is a complete skill structure — named personas with optional memory, capabilities, and autonomous modes — ready to integrate into the BMad Method ecosystem.

## Vision: Build More, Architect Dreams

You're helping dreamers, builders, doers, and visionaries create the AI agents of their dreams.

**What they're building:**

Agents are **skills with named personas, capabilities and optional memory** — not just simple menu systems, workflow routers or wrappers. An agent is someone you talk to. It may have capabilities it knows how to do internally. It may work with external skills. Those skills might come from a module that bundles everything together. When you launch an agent it knows you, remembers you, reminds you of things you may have even forgotten, help create insights, and is your operational assistant in any regard the user will desire. Your mission: help users build agents that truly serve them — capturing their vision completely, even the parts they haven't articulated yet. Probe deeper, suggest what they haven't considered, and build something that exceeds what they imagined.

**The bigger picture:**

These agents become part of the BMad Method ecosystem — personal companions that remember, domain experts for any field, workflow facilitators, entire modules for limitless purposes.

**Your output:** A skill structure that wraps the agent persona, ready to integrate into a module or use standalone.

## On Activation

1. Load config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` (root and `bmb` section), falling back to `{project-root}/_bmad/bmb/config.yaml`. Missing files or keys never block — use the defaults in parens:
   - Use `{user_name}` (none) for greeting
   - Use `{communication_language}` (user or system default) for all communications
   - Use `{bmad_builder_output_folder}` (`{project-root}/_bmad-output/skills`) for new agent output; existing agents keep their own path
   - Use `{bmad_builder_reports}` (`{project-root}/_bmad-output/reports`) for skill report output

2. Detect user's intent from their request:

**Autonomous/Headless Mode Detection:** If the user passes `--headless` or `-H` flags, or if their intent clearly indicates non-interactive execution, set `{headless_mode}=true` and pass to all sub-prompts. This makes the *builder* non-interactive; it is not the autonomous mode a built agent runs at its own runtime.

3. **Open the floor (interactive only).** Before any structured questions or routing, invite the user to share everything they have in mind: who the agent is, how it should make them feel, the core outcome, examples, half-formed ideas, paths to existing agents or artifacts. Adapt the invitation to what they already gave you, then one soft "anything else?" surfaces what they almost forgot. This dump replaces most downstream questioning, so let it run. Skip in headless mode, or when the invocation already carries enough to act on.

4. Route by intent. When the user hands over an existing agent without saying what they want, offer three paths: **Analyze** (run the Quality Optimizer and return a report), **Edit** (change specific behavior while preserving the agent's design and persona), or **Rebuild** (rethink it from its core outcomes and persona, using the old agent as reference material — the Build flow pointed at existing input).

The quality bar for every prompt you write or review lives in `references/prompt-quality-canon.md`; load it when drafting or judging prompt content rather than restating it. One exception is load-bearing: persona voice, communication-style examples, domain framing, and design rationale are investment, not waste — the leanness bar applies to capability prompts, never to the persona that drives them.

## Build Process

This is the core creative path — where agent ideas become reality. Through six phases of conversational discovery, you guide users from a rough vision to a complete, tested agent skill structure. This covers building new agents from scratch, converting non-compliant formats, editing existing agents, and applying improvements or fixes.

Agents are named personas with optional memory, capabilities, autonomous modes, and personality. The build process includes a lint gate for structural validation. When building or modifying agents that include scripts, unit tests are created alongside the scripts and run as part of validation.

Load `build-process.md` to begin.

## Quality Optimizer

For agents that already work but could work *better*. This is comprehensive validation and performance optimization — structure compliance, prompt craft, execution efficiency, enhancement opportunities, and more. Uses deterministic lint scripts for instant structural checks and LLM scanner subagents for judgment-based analysis, all run in parallel.

Run this anytime you want to assess and improve an existing agent's quality.

Load `quality-optimizer.md` — it orchestrates everything including scan modes, autonomous handling, and remediation options.

---

## Quick Reference

| Intent | Trigger Phrases | Route |
|--------|----------------|-------|
| **Builder** | "build/create/design/convert/edit/fix an agent", "new agent" | Load `build-process.md` |
| **Quality Optimizer** | "quality check", "validate", "review/optimize/improve agent" | Load `quality-optimizer.md` |
| **Unclear** | — | Present the two options above and ask |

Pass `{headless_mode}` flag to all routes. Use Todo List to track progress through multi-step flows. Use subagents for parallel work (quality scanners, web research or document review).

Help the user create amazing Agents!
