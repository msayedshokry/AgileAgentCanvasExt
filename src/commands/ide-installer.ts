import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { acOutput } from '../extension';
import { BMAD_RESOURCE_DIR } from '../state/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type IdeId =
    | 'cursor' | 'windsurf' | 'claude' | 'antigravity' | 'copilot'
    | 'cline' | 'roo' | 'codex' | 'gemini' | 'opencode'
    | 'auggie' | 'codebuddy' | 'crush' | 'iflow' | 'kiro'
    | 'qwen' | 'trae' | 'rovo-dev' | 'pi'
    | 'generic';

interface IdeTarget {
    id: IdeId;
    label: string;
    description: string;
    detail: string;
    /** Directory for skill directories, relative to workspace root */
    skillsDir: string;
    /** Directory for workflow stubs (slash-commands), relative to workspace root. Omit if IDE doesn't support workflows. */
    workflowsDir?: string;
    /** Directory for .agent.md files, relative to workspace root. Omit if IDE doesn't support agent files. */
    agentsDir?: string;
    /** Legacy directories to clean up on install */
    legacyDirs: string[];
    /** Whether this IDE is a preferred/recommended option */
    preferred: boolean;
}

/** A BMAD artifact (agent, workflow, or task) that can be installed as a skill */
interface Artifact {
    type: 'agent' | 'workflow' | 'task';
    /** Canonical name used for the skill directory name */
    skillName: string;
    /** Human-readable display name */
    displayName: string;
    /** Short description for SKILL.md frontmatter */
    description: string;
    /** Module this artifact belongs to (core, bmm, bmb, cis, tea) */
    module: string;
    /** Path to the artifact file relative to the resources root (e.g. core/agents/bmad-master.md) */
    relativePath: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// IDE registry — matches official BMAD-METHOD platform-codes.yaml
// ─────────────────────────────────────────────────────────────────────────────

const IDE_TARGETS: Record<IdeId, IdeTarget> = {
    // ── Preferred ──
    claude: {
        id: 'claude',
        label: 'Claude Code',
        description: '.claude/skills/',
        detail: 'Installs Agile Agent Canvas skills for Claude Code (Agent Skills format)',
        skillsDir: '.claude/skills',
        legacyDirs: [],
        preferred: true,
    },
    cursor: {
        id: 'cursor',
        label: 'Cursor',
        description: '.cursor/skills/',
        detail: 'Installs Agile Agent Canvas skills for Cursor (Agent Skills format)',
        skillsDir: '.cursor/skills',
        legacyDirs: [],
        preferred: true,
    },

    // ── Other IDEs (alphabetical) ──
    antigravity: {
        id: 'antigravity',
        label: 'Google Antigravity',
        description: '.agent/skills/',
        detail: 'Installs Agile Agent Canvas skills for Google Antigravity',
        skillsDir: '.agent/skills',
        legacyDirs: [],
        preferred: false,
    },
    auggie: {
        id: 'auggie',
        label: 'Auggie',
        description: '.augment/skills/',
        detail: 'Installs Agile Agent Canvas skills for Auggie',
        skillsDir: '.augment/skills',
        legacyDirs: [],
        preferred: false,
    },
    cline: {
        id: 'cline',
        label: 'Cline',
        description: '.cline/skills/',
        detail: 'Installs Agile Agent Canvas skills for Cline',
        skillsDir: '.cline/skills',
        legacyDirs: [],
        preferred: false,
    },
    codex: {
        id: 'codex',
        label: 'Codex',
        description: '.agents/skills/',
        detail: 'Installs Agile Agent Canvas skills for OpenAI Codex',
        skillsDir: '.agents/skills',
        legacyDirs: [],
        preferred: false,
    },
    codebuddy: {
        id: 'codebuddy',
        label: 'CodeBuddy',
        description: '.codebuddy/skills/',
        detail: 'Installs Agile Agent Canvas skills for CodeBuddy',
        skillsDir: '.codebuddy/skills',
        legacyDirs: [],
        preferred: false,
    },
    copilot: {
        id: 'copilot',
        label: 'GitHub Copilot / VS Code',
        description: '.github/skills/',
        detail: 'Installs Agile Agent Canvas skills for GitHub Copilot (Agent Skills format)',
        skillsDir: '.github/skills',
        agentsDir: '.github/agents',
        legacyDirs: [],
        preferred: false,
    },
    crush: {
        id: 'crush',
        label: 'Crush',
        description: '.crush/skills/',
        detail: 'Installs Agile Agent Canvas skills for Crush',
        skillsDir: '.crush/skills',
        legacyDirs: [],
        preferred: false,
    },
    gemini: {
        id: 'gemini',
        label: 'Gemini CLI',
        description: '.gemini/skills/',
        detail: 'Installs Agile Agent Canvas skills for Gemini CLI',
        skillsDir: '.gemini/skills',
        legacyDirs: [],
        preferred: false,
    },
    iflow: {
        id: 'iflow',
        label: 'iFlow',
        description: '.iflow/skills/',
        detail: 'Installs Agile Agent Canvas skills for iFlow',
        skillsDir: '.iflow/skills',
        legacyDirs: [],
        preferred: false,
    },
    kiro: {
        id: 'kiro',
        label: 'Kiro',
        description: '.kiro/skills/',
        detail: 'Installs Agile Agent Canvas skills for Kiro',
        skillsDir: '.kiro/skills',
        legacyDirs: [],
        preferred: false,
    },
    opencode: {
        id: 'opencode',
        label: 'OpenCode',
        description: '.opencode/skills/',
        detail: 'Installs Agile Agent Canvas skills for OpenCode',
        skillsDir: '.opencode/skills',
        legacyDirs: [],
        preferred: false,
    },
    pi: {
        id: 'pi',
        label: 'Pi',
        description: '.pi/skills/',
        detail: 'Installs Agile Agent Canvas skills for Pi',
        skillsDir: '.pi/skills',
        legacyDirs: [],
        preferred: false,
    },
    qwen: {
        id: 'qwen',
        label: 'QwenCoder',
        description: '.qwen/skills/',
        detail: 'Installs Agile Agent Canvas skills for QwenCoder',
        skillsDir: '.qwen/skills',
        legacyDirs: [],
        preferred: false,
    },
    roo: {
        id: 'roo',
        label: 'Roo Code',
        description: '.roo/skills/',
        detail: 'Installs Agile Agent Canvas skills for Roo Code',
        skillsDir: '.roo/skills',
        legacyDirs: [],
        preferred: false,
    },
    'rovo-dev': {
        id: 'rovo-dev',
        label: 'Rovo Dev',
        description: '.rovodev/skills/',
        detail: 'Installs Agile Agent Canvas skills for Rovo Dev',
        skillsDir: '.rovodev/skills',
        legacyDirs: [],
        preferred: false,
    },
    trae: {
        id: 'trae',
        label: 'Trae',
        description: '.trae/skills/',
        detail: 'Installs Agile Agent Canvas skills for Trae',
        skillsDir: '.trae/skills',
        legacyDirs: [],
        preferred: false,
    },
    windsurf: {
        id: 'windsurf',
        label: 'Windsurf',
        description: '.windsurf/skills/',
        detail: 'Installs Agile Agent Canvas skills for Windsurf (Agent Skills format)',
        skillsDir: '.windsurf/skills',
        legacyDirs: [],
        preferred: false,
    },

    // ── Generic fallback ──
    generic: {
        id: 'generic',
        label: 'Generic (plain markdown)',
        description: '.agileagentcanvas/skills/',
        detail: 'Installs skill stubs into .agileagentcanvas/skills/ for any AI tool',
        skillsDir: '.agileagentcanvas/skills',
        legacyDirs: [],
        preferred: false,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// SKILL.md templates
// ─────────────────────────────────────────────────────────────────────────────

/** Escape a string for use as a YAML single-quoted value (double any internal single quotes) */
function yamlQuote(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function agentSkillContent(artifact: Artifact, bmadResourcePath: string): string {
    return `---
name: ${yamlQuote(artifact.skillName)}
description: ${yamlQuote(artifact.description)}
---

You must fully embody this agent's persona and follow all activation instructions exactly as specified. NEVER break character until given an exit command.

<variable-resolution>
In all BMAD resource files, the template variable {bmad-path} refers to the absolute path to the BMAD framework resources directory: ${bmadResourcePath}
The template variable {project-root} refers to the workspace/project root directory.
</variable-resolution>

<agent-activation CRITICAL="TRUE">
1. LOAD the FULL agent file from ${bmadResourcePath}/${artifact.relativePath}
2. READ its entire contents - this contains the complete agent persona, menu, and instructions
3. FOLLOW every step in the <activation> section precisely
4. DISPLAY the welcome/greeting as instructed
5. PRESENT the numbered menu
6. WAIT for user input before proceeding
</agent-activation>
`;
}

function workflowSkillContent(artifact: Artifact, bmadResourcePath: string): string {
    return `---
name: ${yamlQuote(artifact.skillName)}
description: ${yamlQuote(artifact.description)}
---

In all BMAD resource files, the template variable {bmad-path} resolves to: ${bmadResourcePath}
The template variable {project-root} refers to the workspace/project root directory.

IT IS CRITICAL THAT YOU FOLLOW THIS COMMAND: LOAD the FULL ${bmadResourcePath}/${artifact.relativePath}, READ its entire contents and follow its directions exactly!
`;
}

function taskSkillContent(artifact: Artifact, bmadResourcePath: string): string {
    return `---
name: ${yamlQuote(artifact.skillName)}
description: ${yamlQuote(artifact.description)}
---

In all BMAD resource files, the template variable {bmad-path} resolves to: ${bmadResourcePath}
The template variable {project-root} refers to the workspace/project root directory.

Read the entire task file at: ${bmadResourcePath}/${artifact.relativePath}

Follow all instructions in the task file exactly as written.
`;
}

function skillContent(artifact: Artifact, bmadResourcePath: string): string {
    switch (artifact.type) {
        case 'agent': return agentSkillContent(artifact, bmadResourcePath);
        case 'workflow': return workflowSkillContent(artifact, bmadResourcePath);
        case 'task': return taskSkillContent(artifact, bmadResourcePath);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest parsing — reads CSV manifests from resources/_aac/_config/
// ─────────────────────────────────────────────────────────────────────────────

/** Simple CSV parser for BMAD manifests (handles quoted fields with commas) */
function parseCsv(content: string): Record<string, string>[] {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    const records: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const record: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            record[headers[j]] = (values[j] ?? '').replace(/^"|"$/g, '');
        }
        records.push(record);
    }

    return records;
}

function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++; // skip escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current);
    return fields;
}

/** Load all installable artifacts from BMAD manifests */
function loadArtifacts(bmadResourcePath: string): Artifact[] {
    const configDir = path.join(bmadResourcePath, '_config');
    const artifacts: Artifact[] = [];

    // ── Agents ──
    const agentManifestPath = path.join(configDir, 'agent-manifest.csv');
    if (fs.existsSync(agentManifestPath)) {
        const records = parseCsv(fs.readFileSync(agentManifestPath, 'utf-8'));
        for (const rec of records) {
            const name = rec['name'] ?? '';
            const module = rec['module'] ?? 'core';
            const filePath = rec['path'] ?? '';
            if (!name || !filePath) continue;

            // Derive relative path from _aac/ prefix
            const relativePath = filePath.replace(/^_aac\//, '');

            // Namespaced naming: agileagentcanvas-agent-{name} (flat, no module sub-prefix)
            const skillName = `agileagentcanvas-agent-${name}`;

            artifacts.push({
                type: 'agent',
                skillName,
                displayName: rec['displayName'] || name,
                description: rec['title'] || `${name} agent`,
                module,
                relativePath,
            });
        }
    }

    // ── Workflows ──
    const workflowManifestPath = path.join(configDir, 'workflow-manifest.csv');
    if (fs.existsSync(workflowManifestPath)) {
        const records = parseCsv(fs.readFileSync(workflowManifestPath, 'utf-8'));
        for (const rec of records) {
            const name = rec['name'] ?? '';
            const module = rec['module'] ?? 'core';
            const filePath = rec['path'] ?? '';
            if (!name || !filePath) continue;

            const relativePath = filePath.replace(/^_aac\//, '');
            // Extract a clean description (strip trigger phrase info)
            let desc = rec['description'] || `${name} workflow`;
            const useIdx = desc.indexOf('. Use when');
            if (useIdx > 0) desc = desc.substring(0, useIdx);

            // Namespaced naming: agileagentcanvas-{name} (flat, no module sub-prefix)
            const skillName = `agileagentcanvas-${name}`;

            artifacts.push({
                type: 'workflow',
                skillName,
                displayName: name,
                description: desc,
                module,
                relativePath,
            });
        }
    }

    // ── Tasks ──
    const taskManifestPath = path.join(configDir, 'task-manifest.csv');
    if (fs.existsSync(taskManifestPath)) {
        const records = parseCsv(fs.readFileSync(taskManifestPath, 'utf-8'));
        for (const rec of records) {
            const name = rec['name'] ?? '';
            const module = rec['module'] ?? 'core';
            const filePath = rec['path'] ?? '';
            const standalone = rec['standalone'] ?? 'true';
            if (!name || !filePath || standalone === 'false') continue;

            const relativePath = filePath.replace(/^_aac\//, '');
            let desc = rec['description'] || rec['displayName'] || `${name} task`;
            const useIdx = desc.indexOf('. Use');
            if (useIdx > 0) desc = desc.substring(0, useIdx);

            // Namespaced naming: agileagentcanvas-{name} (flat, no module sub-prefix)
            const skillName = `agileagentcanvas-${name}`;

            artifacts.push({
                type: 'task',
                skillName,
                displayName: rec['displayName'] || name,
                description: desc,
                module,
                relativePath,
            });
        }
    }

    // Validate that source files exist
    return artifacts.filter(a => {
        const fullPath = path.join(bmadResourcePath, a.relativePath);
        return fs.existsSync(fullPath);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// IDE detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the current IDE from appName and registered commands.
 *
 * Detection strategy (in priority order):
 *  1. Check vscode.commands list for IDE-specific sentinel commands
 *  2. Fallback to vscode.env.appName substring match
 *  3. Return 'copilot' as the safe default (plain VS Code / Copilot)
 */
export async function detectIde(): Promise<IdeId> {
    // Command-based detection is the most reliable signal for forks that share appName
    try {
        const cmds = await vscode.commands.getCommands(false);
        const cmdSet = new Set(cmds);

        if (cmdSet.has('antigravity.sendTextToChat'))     return 'antigravity';
        if (cmdSet.has('cursor.chat.open') ||
            cmdSet.has('cursorRules.open'))               return 'cursor';
        if (cmdSet.has('windsurf.openChat') ||
            cmdSet.has('windsurf.cascade.focus'))         return 'windsurf';
        if (cmdSet.has('claude.openChat') ||
            cmdSet.has('claude-code.openChat'))           return 'claude';
    } catch {
        // getCommands can fail in some test environments
    }

    // appName fallback
    const appName = (vscode.env.appName ?? '').toLowerCase();
    if (appName.includes('cursor'))      return 'cursor';
    if (appName.includes('windsurf'))    return 'windsurf';
    if (appName.includes('antigravity')) return 'antigravity';
    if (appName.includes('claude'))      return 'claude';
    if (appName.includes('kiro'))        return 'kiro';

    return 'copilot'; // plain VS Code or any unrecognised Copilot-capable host
}

// ─────────────────────────────────────────────────────────────────────────────
// Core write logic — skills directory format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove all agileagentcanvas-* skill directories from a target directory.
 */
function cleanupExtensionSkills(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;

    let count = 0;
    try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
            if (entry.startsWith('agileagentcanvas-')) {
                const fullPath = path.join(dirPath, entry);
                try {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    count++;
                } catch {
                    // Skip entries that can't be removed
                }
            }
        }

        // Remove the directory itself if now empty
        try {
            const remaining = fs.readdirSync(dirPath);
            if (remaining.length === 0) {
                fs.rmdirSync(dirPath);
            }
        } catch {
            // Directory may already be gone
        }
    } catch {
        // Can't read directory — skip
    }
    return count;
}

/**
 * Clean up legacy directories that the old installer or old official installer
 * may have created.
 */
function cleanupLegacyDirs(ide: IdeTarget, workspaceRoot: string): void {
    for (const legacyDir of ide.legacyDirs) {
        const fullPath = path.join(workspaceRoot, legacyDir);
        const removed = cleanupExtensionSkills(fullPath);
        if (removed > 0) {
            acOutput.appendLine(`[IDE-Install] Cleaned ${removed} legacy extension files from ${legacyDir}`);
        }
    }
}

/**
 * Write skill directories for the given artifacts.
 * Each skill becomes: <skillsDir>/<skillName>/SKILL.md
 */
function writeSkillDirs(
    ide: IdeTarget,
    artifacts: Artifact[],
    workspaceRoot: string,
    overwrite: boolean,
    bmadResourcePath: string
): { written: number; skipped: number } {
    const skillsDir = path.join(workspaceRoot, ide.skillsDir);
    if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
    }

    let written = 0;
    let skipped = 0;

    for (const artifact of artifacts) {
        const skillDir = path.join(skillsDir, artifact.skillName);
        const skillFile = path.join(skillDir, 'SKILL.md');

        if (!overwrite && fs.existsSync(skillFile)) {
            acOutput.appendLine(`[IDE-Install] Skipped (exists): ${artifact.skillName}`);
            skipped++;
            continue;
        }

        try {
            if (!fs.existsSync(skillDir)) {
                fs.mkdirSync(skillDir, { recursive: true });
            }
            fs.writeFileSync(skillFile, skillContent(artifact, bmadResourcePath), 'utf-8');
            written++;
            acOutput.appendLine(`[IDE-Install] Wrote: ${ide.skillsDir}/${artifact.skillName}/SKILL.md`);
        } catch (err) {
            acOutput.appendLine(`[IDE-Install] Error writing ${artifact.skillName}: ${err}`);
        }
    }

    return { written, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow stubs — slash-commands for IDEs that support .agent/workflows/
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowStub {
    /** Filename (without .md) — becomes the slash-command name */
    name: string;
    /** YAML frontmatter description */
    description: string;
    /** Markdown body instructions */
    body: string;
}

/**
 * AgileAgentCanvas workflow stubs.
 * Each one tells the AI agent to delegate to the @agileagentcanvas chat participant.
 */
const AC_WORKFLOWS: WorkflowStub[] = [
    {
        name: 'refine',
        description: 'Refine a specific artifact with AI suggestions',
        body: `# Refine Artifact

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel (Ctrl+Shift+I or Cmd+Shift+I)
2. Type: \`@agileagentcanvas /refine <artifact-id>\` (e.g. \`/refine 1.1\`, \`/refine EPIC-1\`)
3. Optionally add context: \`@agileagentcanvas /refine 1.1 Story Enhancement\`
4. The extension will load the artifact, its schema, and present refinement workflows
5. After refinement, use \`@agileagentcanvas /apply\` to save changes
`,
    },
    {
        name: 'enhance',
        description: 'Add verbose details: use cases, fit criteria, risks to artifacts',
        body: `# Enhance Artifact

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /enhance <artifact-id>\`
3. The extension adds use cases, acceptance criteria, fit criteria, risks, and technical notes
`,
    },
    {
        name: 'review',
        description: 'Review and validate artifact completeness',
        body: `# Review Artifacts

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /review\` to review all artifacts
3. Or: \`@agileagentcanvas /review <artifact-id>\` for a specific artifact
`,
    },
    {
        name: 'dev',
        description: 'Start development workflow for a story, epic, or test case',
        body: `# Development Workflow

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /dev <story-id>\` (e.g. \`/dev S-1.1\`)
3. The extension loads the story with full context and starts the dev workflow
`,
    },
    {
        name: 'vision',
        description: 'Define product vision and problem statement',
        body: `# Product Vision

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /vision\`
3. Follow the guided workflow to define your product vision
`,
    },
    {
        name: 'requirements',
        description: 'Extract and organize requirements from PRD',
        body: `# Requirements Extraction

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /requirements\`
3. The extension extracts and organizes functional, non-functional, and additional requirements
`,
    },
    {
        name: 'epics',
        description: 'Design epic structure organized by user value',
        body: `# Epic Design

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /epics\`
3. The extension helps design your epic structure organized by user value

## File Structure Reference

Epic artifacts are stored under \`.agileagentcanvas-context/\`:

- **\`epics.json\`** — Lightweight manifest with refs to individual epic files
- **\`epics/epic-{id}/epic.json\`** — Full content for each epic (goal, stories, metadata)
- **\`epics/epic-{id}/stories/\`** — Standalone story files for this epic
- **\`epics/epic-{id}/tests/\`** — Test cases and test designs for this epic
- **\`epics-index.json\`** — Summary index of all epics (id, title, status, storyCount)
- **\`stories-index.json\`** — Summary index of all stories

To read a specific epic, check \`epics.json\` for the \`file\` path, then load that file.
`,
    },
    {
        name: 'stories',
        description: 'Break down epics into implementable stories',
        body: `# Story Breakdown

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /stories\` or \`@agileagentcanvas /stories <epic-id>\`
3. The extension breaks epics into implementable user stories

## File Structure Reference

Story artifacts are stored under \`.agileagentcanvas-context/\`:

- **\`epics/epic-{id}/stories/{id}-{slug}.json\`** — Standalone story files with full detail
- **\`stories-index.json\`** — Summary index of all stories (id, title, epicId, status)
- **\`epics/epic-{id}/epic.json\`** — Parent epic file (may contain inline stories)
- **\`epics-index.json\`** — Summary index of all epics

Use \`stories-index.json\` to find a story, then load its standalone file.
`,
    },
    {
        name: 'sprint',
        description: 'Sprint planning from epics or check sprint status',
        body: `# Sprint Planning

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /sprint\`
3. The extension assists with sprint planning and status tracking
`,
    },
    {
        name: 'quick',
        description: 'Quick spec + dev flow for small changes (spec or dev mode)',
        body: `# Quick Spec/Dev

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /quick spec <description>\` for a quick tech spec
3. Or: \`@agileagentcanvas /quick dev <description>\` for quick implementation
`,
    },
    {
        name: 'convert-to-json',
        description: 'Convert markdown artifacts to structured JSON format',
        body: `# Convert to JSON

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /convert-to-json\`
3. The extension converts markdown artifacts to schema-compliant JSON
`,
    },
    {
        name: 'readiness',
        description: 'Check implementation readiness of PRD, architecture, epics and stories',
        body: `# Readiness Check

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /readiness\`
3. The extension validates PRD, architecture, epics, and stories for implementation readiness
`,
    },
    {
        name: 'ux',
        description: 'Create UX design specifications through collaborative exploration',
        body: `# UX Design

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /ux\`
3. The extension guides collaborative UX design specification creation
`,
    },
    {
        name: 'design-thinking',
        description: 'Guide human-centered design using empathy-driven methodologies',
        body: `# Design Thinking

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /design-thinking\`
`,
    },
    {
        name: 'innovate',
        description: 'Identify disruption opportunities and architect business model innovation',
        body: `# Innovation Strategy

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /innovate\`
`,
    },
    {
        name: 'solve',
        description: 'Apply systematic problem-solving methodologies to complex challenges',
        body: `# Problem Solving

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /solve\`
`,
    },
    {
        name: 'story-craft',
        description: 'Craft compelling narratives using storytelling frameworks',
        body: `# Story Craft

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /story-craft\`
`,
    },
    {
        name: 'elicit',
        description: 'Apply an advanced elicitation method to an artifact and save results',
        body: `# Advanced Elicitation

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /elicit <artifact-id>\`
3. The extension applies advanced elicitation methods (SCAMPER, Six Hats, etc.)
`,
    },
    {
        name: 'context',
        description: 'Generate an LLM-optimized project-context.md with implementation rules',
        body: `# Project Context Generation

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /context\`
3. The extension generates a comprehensive project-context.md for AI consumption
`,
    },
    {
        name: 'document',
        description: 'Document a brownfield project for AI context (full scan or deep dive)',
        body: `# Project Documentation

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /document\`
3. The extension scans and documents your existing project for AI context
`,
    },
    {
        name: 'review-code',
        description: 'Adversarial code review finding specific issues',
        body: `# Code Review

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /review-code\`
3. The extension performs an adversarial code review to find specific issues
`,
    },
    {
        name: 'ci',
        description: 'Scaffold CI/CD quality pipeline with test execution and quality gates',
        body: `# CI/CD Pipeline

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /ci\`
3. The extension scaffolds a CI/CD quality pipeline
`,
    },
    {
        name: 'party',
        description: 'Multi-agent collaboration mode — all agents discuss your topic',
        body: `# Party Mode

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /party <topic>\`
3. All agents collaborate on your topic
`,
    },
    {
        name: 'write-doc',
        description: 'Write a document with the Tech Writer agent',
        body: `# Write Document

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /write-doc <description>\`
`,
    },
    {
        name: 'mermaid',
        description: 'Generate a Mermaid diagram with the Tech Writer agent',
        body: `# Mermaid Diagram

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /mermaid <description>\`
`,
    },
    {
        name: 'readme',
        description: 'Generate or update a README.md from project analysis',
        body: `# README Generation

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /readme\`
`,
    },
    {
        name: 'changelog',
        description: 'Generate changelog or release notes from git history',
        body: `# Changelog Generation

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /changelog\`
`,
    },
    {
        name: 'api-docs',
        description: 'Generate API documentation from source code',
        body: `# API Documentation

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /api-docs\`
`,
    },
    {
        name: 'apply',
        description: 'Apply pending AI refinements to the artifact JSON file',
        body: `# Apply Changes

This command is handled by the **Agile Agent Canvas** extension.

## How to use

1. Open the VS Code Chat panel
2. Type: \`@agileagentcanvas /apply\`
3. The extension applies pending refinements from the last /refine session
`,
    },
];

/**
 * Write workflow stubs into the IDE's workflows directory.
 * Each stub becomes: <workflowsDir>/<name>.md
 */
function writeWorkflowStubs(
    workflowsDir: string,
    overwrite: boolean
): { written: number; skipped: number } {
    if (!fs.existsSync(workflowsDir)) {
        fs.mkdirSync(workflowsDir, { recursive: true });
    }

    let written = 0;
    let skipped = 0;

    for (const wf of AC_WORKFLOWS) {
        const filePath = path.join(workflowsDir, `${wf.name}.md`);

        if (!overwrite && fs.existsSync(filePath)) {
            acOutput.appendLine(`[IDE-Install] Skipped workflow (exists): ${wf.name}.md`);
            skipped++;
            continue;
        }

        try {
            const content = `---\ndescription: ${wf.description}\n---\n\n${wf.body}`;
            fs.writeFileSync(filePath, content, 'utf-8');
            written++;
            acOutput.appendLine(`[IDE-Install] Wrote workflow: ${wf.name}.md`);
        } catch (err) {
            acOutput.appendLine(`[IDE-Install] Error writing workflow ${wf.name}: ${err}`);
        }
    }

    return { written, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension agent file — install a single .agent.md representing the extension
// ─────────────────────────────────────────────────────────────────────────────

const EXTENSION_AGENT_FILENAME = 'agileagentcanvas.agent.md';
const INTEGRATOR_AGENT_FILENAME = 'agileagentcanvas-canvas-integrator.agent.md';

/**
 * Write a single `.agent.md` file into the IDE's agents directory so the
 * extension appears as a native `@agileagentcanvas` agent in Copilot Chat.
 * Only installs when the IDE target defines an `agentsDir`.
 */
function writeExtensionAgentFile(
    ide: IdeTarget,
    workspaceRoot: string,
    overwrite: boolean
): boolean {
    if (!ide.agentsDir) return false;

    const agentsDir = path.join(workspaceRoot, ide.agentsDir);
    const agentFilePath = path.join(agentsDir, EXTENSION_AGENT_FILENAME);

    if (!overwrite && fs.existsSync(agentFilePath)) {
        return false;
    }

    if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
    }

    const content = `---
description: 'Agile Agent Canvas — Unified agile development assistant with expert personas for product management, architecture, development, QA, and more. Provides workflows for PRD creation, sprint planning, story development, architecture design, and testing.'
tools: ['read', 'edit', 'search', 'execute']
---

You are the **Agile Agent Canvas** assistant — a unified agile development platform powered by the BMAD methodology.

## Capabilities

You provide access to multiple expert agent personas, structured workflows, and agile development tasks. Your installed skills are in \`.github/skills/agileagentcanvas-*\` directories.

## Agent Personas

You can embody any of the following expert personas when the user requests one:

| Persona | Name | Specialty |
|---------|------|-----------|
| Master | BMad Master | Workflow orchestration, task execution, knowledge custodian |
| Analyst | Mary | Market research, competitive analysis, requirements |
| PM | John | Product management, PRD creation, stakeholder alignment |
| Architect | Winston | System architecture, distributed systems, API design |
| Dev | Amelia | Story execution, TDD, code implementation |
| QA | Quinn | Test automation, API testing, coverage analysis |
| Scrum Master | Bob | Sprint planning, agile ceremonies, backlog management |
| UX Designer | Sally | User research, interaction design, UI patterns |
| Tech Writer | Paige | Documentation, diagrams, standards compliance |
| Test Architect | Murat | Risk-based testing, ATDD, CI/CD governance |
| Solo Dev | Barry | Quick flow — rapid spec and implementation |

## Workflows & Tasks

Review the installed \`agileagentcanvas-*\` skills to discover available workflows (create PRD, architecture, stories, sprint planning, etc.) and standalone tasks (code review, editorial review, etc.).

## Activation

When a user asks for help, determine the most appropriate persona or workflow from your installed skills and follow the instructions in the corresponding SKILL.md file.
`;

    try {
        fs.writeFileSync(agentFilePath, content, 'utf-8');
        acOutput.appendLine(`[IDE-Install] Wrote: ${ide.agentsDir}/${EXTENSION_AGENT_FILENAME}`);
        return true;
    } catch (err) {
        acOutput.appendLine(`[IDE-Install] Error writing agent file: ${err}`);
        return false;
    }
}

/**
 * Write the Canvas Integrator `.agent.md` file into the IDE's agents directory
 * so Morph appears as a native `@agileagentcanvas-canvas-integrator` agent in
 * Copilot Chat.  Only installs when the IDE target defines an `agentsDir`.
 */
function writeIntegratorAgentFile(
    ide: IdeTarget,
    workspaceRoot: string,
    overwrite: boolean
): boolean {
    if (!ide.agentsDir) return false;

    const agentsDir = path.join(workspaceRoot, ide.agentsDir);
    const agentFilePath = path.join(agentsDir, INTEGRATOR_AGENT_FILENAME);

    if (!overwrite && fs.existsSync(agentFilePath)) {
        return false;
    }

    if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
    }

    const content = `---
description: 'Agile Canvas Integrator (Morph) — converts BMAD markdown artifacts to schema-compliant JSON for Agile Agent Canvas visualization. Scans output folders, auto-detects artifact types, validates against schemas, and supports single-file, batch, and type-filtered conversions.'
tools: ['read_file', 'create_file', 'replace_string_in_file', 'file_search', 'list_dir']
---

You are **Morph**, the Agile Canvas Integrator — an artifact conversion specialist that transforms BMAD markdown files into schema-compliant JSON for the Agile Agent Canvas VS Code extension.

## How to Activate

Load and fully follow the agent instructions in your installed skill file:

\`\`\`
.github/skills/agileagentcanvas-agent-canvas-integrator/SKILL.md
\`\`\`

That file contains your full persona, activation steps, menu system, and conversion rules. Embody the Morph persona and follow the activation sequence exactly.

## Quick Reference

| Command | Description |
|---------|-------------|
| **SF** | Set source folder (default: configured output folder) |
| **SC** | Scan & report — list convertible artifacts without converting |
| **CS** | Convert a single file |
| **CA** | Convert ALL artifacts in the source folder |
| **CF** | Convert a subfolder (e.g. epics/) |
| **CT** | Convert by type (e.g. story, epics, use-case) |

## Conversion Rules

- **VERBOSE** — capture ALL content from the source, never summarize or truncate
- **Separate user story fields** — always split into \`asA\`, \`iWant\`, \`soThat\`
- **Full acceptance criteria** — always use \`given\`, \`when\`, \`then\`, \`and[]\`
- **Full requirement descriptions** — always include \`id\`, \`title\`, AND complete \`description\`
- **Valid JSON** — always parseable without errors
- **Schema-compliant** — validate against the matching BMAD schema before saving

The full conversion workflow with schema mappings, parsing patterns, and chunking strategy is in the installed skill's referenced workflow file.
`;

    try {
        fs.writeFileSync(agentFilePath, content, 'utf-8');
        acOutput.appendLine(`[IDE-Install] Wrote: ${ide.agentsDir}/${INTEGRATOR_AGENT_FILENAME}`);
        return true;
    } catch (err) {
        acOutput.appendLine(`[IDE-Install] Error writing integrator agent file: ${err}`);
        return false;
    }
}

/**
 * Remove extension agent files from the agents directory.
 * Only removes files prefixed with `agileagentcanvas` — never touches official BMAD agent files.
 */
function cleanupExtensionAgentFiles(ide: IdeTarget, workspaceRoot: string): void {
    if (!ide.agentsDir) return;

    const agentsDir = path.join(workspaceRoot, ide.agentsDir);
    if (!fs.existsSync(agentsDir)) return;

    try {
        const entries = fs.readdirSync(agentsDir);
        for (const entry of entries) {
            if (entry.startsWith('agileagentcanvas') && entry.endsWith('.agent.md')) {
                fs.unlinkSync(path.join(agentsDir, entry));
                acOutput.appendLine(`[IDE-Install] Removed old agent file: ${entry}`);
            }
        }
    } catch (err) {
        acOutput.appendLine(`[IDE-Install] Error cleaning agent files: ${err}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema reference — tell LLMs where BMAD schemas live
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write a single reference file that tells LLMs where to find BMAD schemas.
 * Instead of copying 41+ schema files into every workspace, we just point
 * the LLM to the extension's bundled schemas directory.
 */
function writeSchemaReference(
    extensionPath: string,
    workspaceRoot: string
): void {
    const schemasDir = path.join(extensionPath, 'resources', BMAD_RESOURCE_DIR, 'schemas');
    if (!fs.existsSync(schemasDir)) return;

    const agentDir = path.join(workspaceRoot, '.agent');
    if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
    }

    const refPath = path.join(agentDir, 'schemas-location.md');
    const content = `---
description: Location of BMAD JSON schemas for artifact validation
---

# BMAD Schema Files

The BMAD JSON schemas used by the Agile Agent Canvas extension are located at:

\`\`\`
${schemasDir}
\`\`\`

## Directory structure

- \`bmm/\` — Business Management Module schemas (story, epics, prd, architecture, etc.)
- \`tea/\` — Test Engineering & Automation schemas (test-design, test-strategy, etc.)
- \`cis/\` — Creative & Innovation Suite schemas
- \`common/\` — Shared schemas (risks, requirements, etc.)

## Usage

When you need to validate or understand the structure of a BMAD artifact (e.g. a story, epic, PRD),
read the corresponding schema file from the path above. For example:

- Story schema: \`${schemasDir}${path.sep}bmm${path.sep}story.schema.json\`
- Epics schema: \`${schemasDir}${path.sep}bmm${path.sep}epics.schema.json\`
- PRD schema: \`${schemasDir}${path.sep}bmm${path.sep}prd.schema.json\`
`;

    try {
        fs.writeFileSync(refPath, content, 'utf-8');
        acOutput.appendLine(`[IDE-Install] Wrote schema reference: .agent/schemas-location.md`);
    } catch (err) {
        acOutput.appendLine(`[IDE-Install] Error writing schema reference: ${err}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-install on activation (silent, no prompts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called from activate().  Detects the host IDE and installs skill stubs
 * into the first workspace folder — but only if the marker skill does not yet exist.
 * Shows a single non-modal toast on first install; completely silent on subsequent launches.
 */
export async function autoInstallIfNeeded(extensionPath: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    // Prefer the resolver's active workspace folder for multi-root awareness
    let workspaceRoot: string;
    try {
        const { getWorkspaceResolver } = require('../extension');
        const resolver = getWorkspaceResolver();
        const wsFolder = resolver?.getActiveWorkspaceFolder();
        workspaceRoot = wsFolder ? wsFolder.uri.fsPath : workspaceFolders[0].uri.fsPath;
    } catch {
        workspaceRoot = workspaceFolders[0].uri.fsPath;
    }

    const bmadResourcePath = path.join(extensionPath, 'resources', BMAD_RESOURCE_DIR);
    if (!fs.existsSync(bmadResourcePath)) return;

    const ideId = await detectIde();
    const ide = IDE_TARGETS[ideId];

    // Marker: the master agent skill directory
    const markerSkill = path.join(workspaceRoot, ide.skillsDir, 'agileagentcanvas-agent-master', 'SKILL.md');

    if (fs.existsSync(markerSkill)) {
        acOutput.appendLine(`[IDE-Install] Already installed for ${ide.label} — skipping auto-install`);
        return;
    }

    acOutput.appendLine(`[IDE-Install] Auto-installing skills for detected IDE: ${ide.label}`);

    // Clean up legacy dirs first
    cleanupLegacyDirs(ide, workspaceRoot);

    // Clean existing extension skills in the target dir (fresh install)
    cleanupExtensionSkills(path.join(workspaceRoot, ide.skillsDir));

    const artifacts = loadArtifacts(bmadResourcePath);
    const { written } = writeSkillDirs(ide, artifacts, workspaceRoot, true, bmadResourcePath);

    // Also provision workflow stubs (slash-commands) if IDE supports them
    let workflowsWritten = 0;
    if (ide.workflowsDir) {
        const wfDir = path.join(workspaceRoot, ide.workflowsDir);
        const wfResult = writeWorkflowStubs(wfDir, true);
        workflowsWritten = wfResult.written;
        if (workflowsWritten > 0) {
            acOutput.appendLine(`[IDE-Install] Auto-installed ${workflowsWritten} workflow stubs`);
        }
    }

    // Write schema reference file so LLMs know where to find BMAD schemas
    writeSchemaReference(extensionPath, workspaceRoot);

    // Write the extension agent files (.agent.md) if IDE supports it
    cleanupExtensionAgentFiles(ide, workspaceRoot);
    writeExtensionAgentFile(ide, workspaceRoot, true);
    writeIntegratorAgentFile(ide, workspaceRoot, true);
    if (written > 0 || workflowsWritten > 0) {
        acOutput.appendLine(`[IDE-Install] Auto-install complete: ${written} skills, ${workflowsWritten} workflows`);

        const counts = countByType(artifacts);
        const summary = formatCountSummary(counts);
        const wfNote = workflowsWritten > 0 ? ` + ${workflowsWritten} workflows` : '';

        const action = await vscode.window.showInformationMessage(
            `AgileAgentCanvas: Installed ${summary}${wfNote} for ${ide.label} into \`${ide.skillsDir}/\``,
            'Show Files',
            'Dismiss'
        );
        if (action === 'Show Files') {
            vscode.commands.executeCommand('revealFileInOS',
                vscode.Uri.file(path.join(workspaceRoot, ide.skillsDir)));
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual command: agileagentcanvas.installToIde
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interactive "Install Framework to IDE" command.
 * Lets the user choose target IDE, artifact types, and whether to overwrite existing files.
 */
export async function installToIde(extensionPath: string): Promise<void> {
    acOutput.appendLine('[IDE-Install] Manual install started');

    // ── Resolve workspace root(s) ───────────────────────────────────────────────
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
        const action = await vscode.window.showWarningMessage(
            'Please open a workspace folder first.',
            'Open Folder'
        );
        if (action === 'Open Folder') {
            vscode.commands.executeCommand('vscode.openFolder');
        }
        return;
    }

    // Multi-root: let the user choose to install into all folders or a specific one
    let workspaceRoots: string[];

    if (workspaceFolders.length === 1) {
        workspaceRoots = [workspaceFolders[0].uri.fsPath];
    } else {
        const allLabel = `$(folder) All workspace folders (${workspaceFolders.length})`;
        const items: (vscode.QuickPickItem & { _all?: boolean; _fsPath?: string })[] = [
            {
                label: allLabel,
                description: 'Install identical skills into every workspace folder',
                _all: true,
            },
            ...workspaceFolders.map(f => ({
                label: f.name,
                description: f.uri.fsPath,
                _fsPath: f.uri.fsPath,
            })),
        ];

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Skills are identical across folders — install into all, or pick one?',
        });
        if (!picked) return;

        if (picked._all) {
            workspaceRoots = workspaceFolders.map(f => f.uri.fsPath);
        } else {
            workspaceRoots = [picked._fsPath!];
        }
    }

    // ── Pick target IDE ───────────────────────────────────────────────────────
    const detectedId = await detectIde();

    // Sort: preferred first, then detected, then alphabetical
    const sortedTargets = Object.values(IDE_TARGETS).sort((a, b) => {
        if (a.preferred && !b.preferred) return -1;
        if (!a.preferred && b.preferred) return 1;
        if (a.id === detectedId && b.id !== detectedId) return -1;
        if (a.id !== detectedId && b.id === detectedId) return 1;
        return a.label.localeCompare(b.label);
    });

    const ideItems = sortedTargets.map(t => ({
        label: t.label + (t.id === detectedId ? ' $(check) detected' : '') + (t.preferred ? ' $(star)' : ''),
        description: t.description,
        detail: t.detail,
        target: t,
        picked: t.id === detectedId,
    }));

    const ideChoice = await vscode.window.showQuickPick(ideItems, {
        placeHolder: 'Which IDE/tool do you want to install Agile Agent Canvas skills for?',
        title: 'Agile Agent Canvas: Install Framework to IDE',
    });
    if (!ideChoice) return;

    const ide = ideChoice.target;

    // ── Resolve extension resources ────────────────────────────────────────────
    const bmadResourcePath = path.join(extensionPath, 'resources', BMAD_RESOURCE_DIR);
    if (!fs.existsSync(bmadResourcePath)) {
        vscode.window.showErrorMessage('Extension resources not found. Please reinstall the extension.');
        return;
    }

    // ── Load and categorise artifacts ─────────────────────────────────────────
    const allArtifacts = loadArtifacts(bmadResourcePath);

    const agents = allArtifacts.filter(a => a.type === 'agent');
    const workflows = allArtifacts.filter(a => a.type === 'workflow');
    const tasks = allArtifacts.filter(a => a.type === 'task');

    // ── Pick artifact types ───────────────────────────────────────────────────
    const typeItems = [
        {
            label: '$(check-all) All skills',
            description: `${allArtifacts.length} total`,
            detail: `${agents.length} agents, ${workflows.length} workflows, ${tasks.length} tasks`,
            types: ['agent', 'workflow', 'task'] as Artifact['type'][],
            picked: true,
        },
        {
            label: '$(person) Agents only',
            description: `${agents.length} agents`,
            detail: 'Agent personas (Master, Analyst, PM, Architect, Dev, QA, ...)',
            types: ['agent'] as Artifact['type'][],
            picked: false,
        },
        {
            label: '$(play) Workflows only',
            description: `${workflows.length} workflows`,
            detail: 'Workflows (create PRD, dev story, sprint planning, ...)',
            types: ['workflow'] as Artifact['type'][],
            picked: false,
        },
        {
            label: '$(tools) Tasks only',
            description: `${tasks.length} tasks`,
            detail: 'Standalone tasks (editorial review, adversarial review, ...)',
            types: ['task'] as Artifact['type'][],
            picked: false,
        },
    ];

    const typePicks = await vscode.window.showQuickPick(typeItems, {
        placeHolder: 'Which skill types to install?',
        title: `Install Skills → ${ide.label}`,
        canPickMany: true,
    });
    if (!typePicks || typePicks.length === 0) return;

    const selectedTypes = new Set(typePicks.flatMap(p => p.types));
    const selectedArtifacts = allArtifacts.filter(a => selectedTypes.has(a.type));
    if (selectedArtifacts.length === 0) return;

    // ── Overwrite check (across all target roots) ──────────────────────────────
    const existingCount = workspaceRoots.reduce((count, root) => {
        const dir = path.join(root, ide.skillsDir);
        return count + selectedArtifacts.filter(a =>
            fs.existsSync(path.join(dir, a.skillName, 'SKILL.md'))
        ).length;
    }, 0);

    let overwrite = false;
    if (existingCount > 0) {
        const locationHint = workspaceRoots.length > 1
            ? `across ${workspaceRoots.length} folders`
            : `in \`${ide.skillsDir}/\``;
        const ow = await vscode.window.showInformationMessage(
            `${existingCount} skill(s) already exist ${locationHint}. Overwrite?`,
            { modal: true },
            'Overwrite',
            'Skip existing',
            'Cancel'
        );
        if (ow === 'Cancel' || !ow) return;
        overwrite = ow === 'Overwrite';
    }

    // ── Write into each target root ───────────────────────────────────────────
    let totalWritten = 0;
    let totalSkipped = 0;
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Installing Agile Agent Canvas skills for ${ide.label}...`, cancellable: false },
        async () => {
            for (const root of workspaceRoots) {
                cleanupLegacyDirs(ide, root);
                cleanupExtensionSkills(path.join(root, ide.skillsDir));
                const { written, skipped } = writeSkillDirs(ide, selectedArtifacts, root, overwrite, bmadResourcePath);
                totalWritten += written;
                totalSkipped += skipped;

                // Also provision workflow stubs if IDE supports them
                if (ide.workflowsDir) {
                    const wfDir = path.join(root, ide.workflowsDir);
                    const wfResult = writeWorkflowStubs(wfDir, overwrite);
                    totalWritten += wfResult.written;
                    totalSkipped += wfResult.skipped;
                }

                // Deploy schema reference
                writeSchemaReference(extensionPath, root);

                // Deploy extension agent files (.agent.md) if IDE supports it
                cleanupExtensionAgentFiles(ide, root);
                writeExtensionAgentFile(ide, root, overwrite);
                writeIntegratorAgentFile(ide, root, overwrite);
            }
        }
    );

    // ── Result ────────────────────────────────────────────────────────────────
    const writtenCounts = countByType(selectedArtifacts);
    const summary = formatCountSummary(writtenCounts);
    const folderHint = workspaceRoots.length > 1
        ? ` across ${workspaceRoots.length} folders`
        : ` into \`${ide.skillsDir}/\``;

    const action = await vscode.window.showInformationMessage(
        totalWritten > 0
            ? `AgileAgentCanvas: Installed ${totalWritten} skills (${summary})${folderHint}`
            : `AgileAgentCanvas: No skills written (all already existed${overwrite ? '' : ' — choose Overwrite to update'})`,
        'Show Files'
    );
    if (action === 'Show Files') {
        // Reveal the first target's skills directory
        vscode.commands.executeCommand('revealFileInOS',
            vscode.Uri.file(path.join(workspaceRoots[0], ide.skillsDir)));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function countByType(artifacts: Artifact[]): Record<Artifact['type'], number> {
    const counts: Record<Artifact['type'], number> = { agent: 0, workflow: 0, task: 0 };
    for (const a of artifacts) {
        counts[a.type]++;
    }
    return counts;
}

function formatCountSummary(counts: Record<Artifact['type'], number>): string {
    const parts: string[] = [];
    if (counts.agent > 0)    parts.push(`${counts.agent} agent${counts.agent !== 1 ? 's' : ''}`);
    if (counts.workflow > 0) parts.push(`${counts.workflow} workflow${counts.workflow !== 1 ? 's' : ''}`);
    if (counts.task > 0)     parts.push(`${counts.task} task${counts.task !== 1 ? 's' : ''}`);
    return parts.join(', ') || '0 skills';
}
