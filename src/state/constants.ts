/**
 * Pure constants used across the extension.
 *
 * This file intentionally has **zero** runtime imports (especially no `vscode`)
 * so that test files can load it via proxyquire without needing to mock the
 * VS Code API.
 */

/**
 * Name of the bundled BMAD resources directory inside the extension
 * (i.e. `resources/<BMAD_RESOURCE_DIR>/`).
 *
 * Every `path.join(extensionPath, 'resources', BMAD_RESOURCE_DIR)` call
 * should reference this constant so a future rename is a one-liner.
 */
export const BMAD_RESOURCE_DIR = '_aac';

/**
 * Default output folder name used by AgileAgentCanvas.
 * Also used as the primary auto-detection target when scanning workspace folders.
 */
export const DEFAULT_OUTPUT_FOLDER = '.agileagentcanvas-context';

// ── Skill catalogue constants ─────────────────────────────────────────────────

/** VS Code configuration key for the user-managed skill catalogue folder. */
export const USER_CATALOGUE_SETTING = 'agileagentcanvas.userCataloguePath';

/** VS Code configuration key for tracked skill git repos. */
export const SKILL_REPOS_SETTING = 'agileagentcanvas.skillRepos';

/** globalState key for the set of disabled skill names. */
export const DISABLED_SKILLS_KEY = 'agileagentcanvas.disabledSkills';

/** Subfolder inside the user catalogue path that holds cloned git repos. */
export const REPOS_SUBFOLDER = '_repos';

/** Template SKILL.md content used when scaffolding a new user skill. */
export const SKILL_TEMPLATE = `---
name: My New Skill
description: Describe what this skill does
---

# My New Skill

## Instructions

Describe the behaviour and instructions for this skill here.
`;

/** Template customize.toml content used when scaffolding a new user skill. */
export const SKILL_TOML_TEMPLATE = `[agent]
name = "My New Skill"
title = "Custom Skill"
icon = "🛠️"
role = "Specialist"
identity = "A custom skill added by the user."
communication_style = "Clear and concise"
principles = ["Be helpful", "Be accurate"]
`;
