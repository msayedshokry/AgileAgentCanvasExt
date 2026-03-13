import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { acOutput } from '../extension';

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
    /** Path to the artifact file relative to the _bmad resources root (e.g. core/agents/bmad-master.md) */
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
        detail: 'Installs BMAD skills for Claude Code (Agent Skills format)',
        skillsDir: '.claude/skills',
        legacyDirs: ['.claude/commands'],
        preferred: true,
    },
    cursor: {
        id: 'cursor',
        label: 'Cursor',
        description: '.cursor/skills/',
        detail: 'Installs BMAD skills for Cursor (Agent Skills format)',
        skillsDir: '.cursor/skills',
        legacyDirs: ['.cursor/commands', '.cursor/rules'],
        preferred: true,
    },

    // ── Other IDEs (alphabetical) ──
    antigravity: {
        id: 'antigravity',
        label: 'Google Antigravity',
        description: '.agent/skills/',
        detail: 'Installs BMAD skills for Google Antigravity',
        skillsDir: '.agent/skills',
        legacyDirs: ['.agent/workflows', '.antigravity'],
        preferred: false,
    },
    auggie: {
        id: 'auggie',
        label: 'Auggie',
        description: '.augment/skills/',
        detail: 'Installs BMAD skills for Auggie',
        skillsDir: '.augment/skills',
        legacyDirs: ['.augment/commands'],
        preferred: false,
    },
    cline: {
        id: 'cline',
        label: 'Cline',
        description: '.cline/skills/',
        detail: 'Installs BMAD skills for Cline',
        skillsDir: '.cline/skills',
        legacyDirs: ['.clinerules/workflows'],
        preferred: false,
    },
    codex: {
        id: 'codex',
        label: 'Codex',
        description: '.agents/skills/',
        detail: 'Installs BMAD skills for OpenAI Codex',
        skillsDir: '.agents/skills',
        legacyDirs: ['.codex/prompts'],
        preferred: false,
    },
    codebuddy: {
        id: 'codebuddy',
        label: 'CodeBuddy',
        description: '.codebuddy/skills/',
        detail: 'Installs BMAD skills for CodeBuddy',
        skillsDir: '.codebuddy/skills',
        legacyDirs: ['.codebuddy/commands'],
        preferred: false,
    },
    copilot: {
        id: 'copilot',
        label: 'GitHub Copilot / VS Code',
        description: '.github/skills/',
        detail: 'Installs BMAD skills for GitHub Copilot (Agent Skills format)',
        skillsDir: '.github/skills',
        legacyDirs: ['.github/agents', '.github/prompts'],
        preferred: false,
    },
    crush: {
        id: 'crush',
        label: 'Crush',
        description: '.crush/skills/',
        detail: 'Installs BMAD skills for Crush',
        skillsDir: '.crush/skills',
        legacyDirs: ['.crush/commands'],
        preferred: false,
    },
    gemini: {
        id: 'gemini',
        label: 'Gemini CLI',
        description: '.gemini/skills/',
        detail: 'Installs BMAD skills for Gemini CLI',
        skillsDir: '.gemini/skills',
        legacyDirs: ['.gemini/commands'],
        preferred: false,
    },
    iflow: {
        id: 'iflow',
        label: 'iFlow',
        description: '.iflow/skills/',
        detail: 'Installs BMAD skills for iFlow',
        skillsDir: '.iflow/skills',
        legacyDirs: ['.iflow/commands'],
        preferred: false,
    },
    kiro: {
        id: 'kiro',
        label: 'Kiro',
        description: '.kiro/skills/',
        detail: 'Installs BMAD skills for Kiro',
        skillsDir: '.kiro/skills',
        legacyDirs: ['.kiro/steering'],
        preferred: false,
    },
    opencode: {
        id: 'opencode',
        label: 'OpenCode',
        description: '.opencode/skills/',
        detail: 'Installs BMAD skills for OpenCode',
        skillsDir: '.opencode/skills',
        legacyDirs: ['.opencode/agents', '.opencode/commands', '.opencode/agent', '.opencode/command'],
        preferred: false,
    },
    pi: {
        id: 'pi',
        label: 'Pi',
        description: '.pi/skills/',
        detail: 'Installs BMAD skills for Pi',
        skillsDir: '.pi/skills',
        legacyDirs: [],
        preferred: false,
    },
    qwen: {
        id: 'qwen',
        label: 'QwenCoder',
        description: '.qwen/skills/',
        detail: 'Installs BMAD skills for QwenCoder',
        skillsDir: '.qwen/skills',
        legacyDirs: ['.qwen/commands'],
        preferred: false,
    },
    roo: {
        id: 'roo',
        label: 'Roo Code',
        description: '.roo/skills/',
        detail: 'Installs BMAD skills for Roo Code',
        skillsDir: '.roo/skills',
        legacyDirs: ['.roo/commands'],
        preferred: false,
    },
    'rovo-dev': {
        id: 'rovo-dev',
        label: 'Rovo Dev',
        description: '.rovodev/skills/',
        detail: 'Installs BMAD skills for Rovo Dev',
        skillsDir: '.rovodev/skills',
        legacyDirs: ['.rovodev/workflows'],
        preferred: false,
    },
    trae: {
        id: 'trae',
        label: 'Trae',
        description: '.trae/skills/',
        detail: 'Installs BMAD skills for Trae',
        skillsDir: '.trae/skills',
        legacyDirs: ['.trae/rules'],
        preferred: false,
    },
    windsurf: {
        id: 'windsurf',
        label: 'Windsurf',
        description: '.windsurf/skills/',
        detail: 'Installs BMAD skills for Windsurf (Agent Skills format)',
        skillsDir: '.windsurf/skills',
        legacyDirs: ['.windsurf/workflows', '.windsurf/rules'],
        preferred: false,
    },

    // ── Generic fallback ──
    generic: {
        id: 'generic',
        label: 'Generic (plain markdown)',
        description: '.bmad/skills/',
        detail: 'Installs BMAD skill stubs into .bmad/skills/ for any AI tool',
        skillsDir: '.bmad/skills',
        legacyDirs: ['.bmad'],
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
// Manifest parsing — reads CSV manifests from resources/_bmad/_config/
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

            // Derive relative path from _bmad/ prefix
            const relativePath = filePath.replace(/^_bmad\//, '');

            // Official naming: core agents skip module → bmad-agent-{name}
            // Non-core agents → bmad-agent-{module}-{name}
            const skillName = module === 'core'
                ? `bmad-agent-${name}`
                : `bmad-agent-${module}-${name}`;

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

            const relativePath = filePath.replace(/^_bmad\//, '');
            // Extract a clean description (strip trigger phrase info)
            let desc = rec['description'] || `${name} workflow`;
            const useIdx = desc.indexOf('. Use when');
            if (useIdx > 0) desc = desc.substring(0, useIdx);

            // Official naming: core workflows skip module → bmad-{name}
            // Non-core workflows → bmad-{module}-{name}
            const skillName = module === 'core'
                ? `bmad-${name}`
                : `bmad-${module}-${name}`;

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

            const relativePath = filePath.replace(/^_bmad\//, '');
            let desc = rec['description'] || rec['displayName'] || `${name} task`;
            const useIdx = desc.indexOf('. Use');
            if (useIdx > 0) desc = desc.substring(0, useIdx);

            // Official naming: core tasks skip module → bmad-{name}
            // Non-core tasks → bmad-{module}-{name}
            const skillName = module === 'core'
                ? `bmad-${name}`
                : `bmad-${module}-${name}`;

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
 * Remove all bmad-* skill directories from a target directory.
 */
function cleanupBmadSkills(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;

    let count = 0;
    try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
            if (entry.startsWith('bmad')) {
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
        const removed = cleanupBmadSkills(fullPath);
        if (removed > 0) {
            acOutput.appendLine(`[IDE-Install] Cleaned ${removed} legacy BMAD files from ${legacyDir}`);
        }
    }

    // Also clean up old copilot-instructions.md BMAD markers
    if (ide.id === 'copilot') {
        cleanupCopilotInstructions(workspaceRoot);
    }
}

/**
 * Strip BMAD-owned content from .github/copilot-instructions.md (legacy format).
 */
function cleanupCopilotInstructions(workspaceRoot: string): void {
    const filePath = path.join(workspaceRoot, '.github', 'copilot-instructions.md');
    if (!fs.existsSync(filePath)) return;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const startIdx = content.indexOf('<!-- BMAD:START -->');
        const endIdx = content.indexOf('<!-- BMAD:END -->');

        if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return;

        const cleaned = content.slice(0, startIdx) + content.slice(endIdx + '<!-- BMAD:END -->'.length);

        if (cleaned.trim().length === 0) {
            fs.unlinkSync(filePath);
            acOutput.appendLine('[IDE-Install] Removed empty copilot-instructions.md');
        } else {
            fs.writeFileSync(filePath, cleaned, 'utf-8');
            acOutput.appendLine('[IDE-Install] Cleaned BMAD markers from copilot-instructions.md');
        }
    } catch {
        // Best effort
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
// Auto-install on activation (silent, no prompts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called from activate().  Detects the host IDE and installs BMAD skill stubs
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

    const bmadResourcePath = path.join(extensionPath, 'resources', '_bmad');
    if (!fs.existsSync(bmadResourcePath)) return;

    const ideId = await detectIde();
    const ide = IDE_TARGETS[ideId];

    // Marker: the master agent skill directory (core agents skip module name)
    const markerSkill = path.join(workspaceRoot, ide.skillsDir, 'bmad-agent-bmad-master', 'SKILL.md');

    if (fs.existsSync(markerSkill)) {
        acOutput.appendLine(`[IDE-Install] Already installed for ${ide.label} — skipping auto-install`);
        return;
    }

    acOutput.appendLine(`[IDE-Install] Auto-installing skills for detected IDE: ${ide.label}`);

    // Clean up legacy dirs first
    cleanupLegacyDirs(ide, workspaceRoot);

    // Clean existing bmad skills in the target dir (fresh install)
    cleanupBmadSkills(path.join(workspaceRoot, ide.skillsDir));

    const artifacts = loadArtifacts(bmadResourcePath);
    const { written } = writeSkillDirs(ide, artifacts, workspaceRoot, true, bmadResourcePath);

    if (written > 0) {
        acOutput.appendLine(`[IDE-Install] Auto-install complete: ${written} skills`);

        const counts = countByType(artifacts);
        const summary = formatCountSummary(counts);

        const action = await vscode.window.showInformationMessage(
            `AgileAgentCanvas: Installed ${summary} for ${ide.label} into \`${ide.skillsDir}/\``,
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
        placeHolder: 'Which IDE/tool do you want to install BMAD skills for?',
        title: 'Agile Agent Canvas: Install Framework to IDE',
    });
    if (!ideChoice) return;

    const ide = ideChoice.target;

    // ── Resolve BMAD resources ────────────────────────────────────────────────
    const bmadResourcePath = path.join(extensionPath, 'resources', '_bmad');
    if (!fs.existsSync(bmadResourcePath)) {
        vscode.window.showErrorMessage('BMAD resources not found. Please reinstall the extension.');
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
            detail: 'BMAD agent personas (Master, Analyst, PM, Architect, Dev, QA, ...)',
            types: ['agent'] as Artifact['type'][],
            picked: false,
        },
        {
            label: '$(play) Workflows only',
            description: `${workflows.length} workflows`,
            detail: 'BMAD workflows (create PRD, dev story, sprint planning, ...)',
            types: ['workflow'] as Artifact['type'][],
            picked: false,
        },
        {
            label: '$(tools) Tasks only',
            description: `${tasks.length} tasks`,
            detail: 'BMAD standalone tasks (editorial review, adversarial review, ...)',
            types: ['task'] as Artifact['type'][],
            picked: false,
        },
    ];

    const typePicks = await vscode.window.showQuickPick(typeItems, {
        placeHolder: 'Which skill types to install?',
        title: `Install BMAD Skills → ${ide.label}`,
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
        { location: vscode.ProgressLocation.Notification, title: `Installing BMAD skills for ${ide.label}...`, cancellable: false },
        async () => {
            for (const root of workspaceRoots) {
                cleanupLegacyDirs(ide, root);
                cleanupBmadSkills(path.join(root, ide.skillsDir));
                const { written, skipped } = writeSkillDirs(ide, selectedArtifacts, root, overwrite, bmadResourcePath);
                totalWritten += written;
                totalSkipped += skipped;
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
