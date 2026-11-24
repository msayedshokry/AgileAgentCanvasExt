import { createLogger } from '../utils/logger';
const logger = createLogger('ide-installer');
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { BMAD_RESOURCE_DIR } from '../state/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type IdeId =
    | 'cursor' | 'windsurf' | 'claude' | 'antigravity' | 'copilot'
    | 'cline' | 'roo' | 'codex' | 'gemini' | 'opencode'
    | 'auggie' | 'codebuddy' | 'crush' | 'iflow' | 'kiro'
    | 'qwen' | 'trae' | 'rovo-dev' | 'pi' | 'omp'
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
    /** Agent file format: 'copilot' (Copilot .agent.md frontmatter) or 'opencode' (mode: all frontmatter) */
    agentFormat?: 'copilot' | 'opencode';
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
    /** Path to the artifact file relative to the resources root (e.g. core/agents/aac-agent-analyst.md) */
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
        description: '.opencode/skills/ + .opencode/agents/ + .opencode/commands/',
        detail: 'Installs Agile Agent Canvas skills, agents, and commands for OpenCode',
        skillsDir: '.opencode/skills',
        workflowsDir: '.opencode/commands',
        agentsDir: '.opencode/agents',
        agentFormat: 'opencode',
        legacyDirs: [],
        preferred: false,
    },
    omp: {
        id: 'omp',
        label: 'Oh My Pi (OMP)',
        description: '.omp/skills/ + .omp/commands/',
        detail: 'Installs Agile Agent Canvas skills and commands for the Oh My Pi (omp) harness. Rules go to .omp/rules/.',
        skillsDir: '.omp/skills',
        workflowsDir: '.omp/commands',
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

/** Load all installable artifacts from the unified skill-manifest.csv */
function loadArtifacts(bmadResourcePath: string): Artifact[] {
    const configDir = path.join(bmadResourcePath, '_config');
    const artifacts: Artifact[] = [];

    const skillManifestPath = path.join(configDir, 'skill-manifest.csv');
    if (fs.existsSync(skillManifestPath)) {
        const records = parseCsv(fs.readFileSync(skillManifestPath, 'utf-8'));
        for (const rec of records) {
            const name = rec['name'] ?? '';
            const type = (rec['type'] ?? 'workflow') as 'agent' | 'workflow' | 'task';
            const module = rec['module'] ?? 'core';
            let desc = rec['description'] || `${name} ${type}`;

            if (!name) continue;

            // Path is implied: skills/{name}/SKILL.md
            const relativePath = `skills/${name}/SKILL.md`;

            // Strip trigger phrases from description for cleaner frontmatter
            const useIdx = desc.indexOf('. Use when');
            if (useIdx > 0) desc = desc.substring(0, useIdx);

            // Namespaced target skill name for the IDE
            const skillName = type === 'agent'
                ? `agileagentcanvas-agent-${name}`
                : `agileagentcanvas-${name}`;

            artifacts.push({
                type,
                skillName,
                displayName: name,
                description: desc,
                module,
                relativePath,
            });
        }
    }

    // Validate that source skill directories exist
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
        if (cmdSet.has('omp.openPanel') ||
            cmdSet.has('omp.sendPrompt') ||
            cmdSet.has('oh-my-pi.openChat'))              return 'omp';
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
    if (appName.includes('omp') || appName.includes('oh my pi') || appName.includes('oh-my-pi'))
        return 'omp';

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
            logger.debug(`[IDE-Install] Cleaned ${removed} legacy extension files from ${legacyDir}`);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow stubs — slash-commands for IDEs that support .agent/workflows/
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowStub {
    /** Filename (without .md) — becomes the slash-command name */
    name: string;
    /** YAML frontmatter description */
    description: string;
    /** Markdown body instructions (undefined for executable stubs — body is generated at write-time) */
    body?: string;
}

/**
 * Mapping from stub name to its manifest workflow entry path.
 * Undefined means the stub is VS Code-only (keeps delegation body).
 */
const STUB_TO_MANIFEST: Record<string, string | undefined> = {
    'dev': 'skills/aac-dev-story/SKILL.md',
    'review': 'skills/aac-review-adversarial-general/SKILL.md',
    'sprint': 'skills/aac-sprint-planning/SKILL.md',
    'quick': 'skills/aac-quick-dev/SKILL.md',
    'epics': 'skills/aac-create-epics-and-stories/SKILL.md',
    'stories': 'skills/aac-create-story/SKILL.md',
    'readiness': 'skills/aac-check-implementation-readiness/SKILL.md',
    'ux': 'skills/aac-create-ux-design/SKILL.md',
    'requirements': 'skills/aac-create-prd/SKILL.md',
    'vision': 'skills/aac-product-brief/SKILL.md',
    'context': 'skills/aac-generate-project-context/SKILL.md',
    'convert-to-json': 'skills/aac-to-json/SKILL.md',
    'design-thinking': 'skills/aac-cis-design-thinking/SKILL.md',
    'innovate': 'skills/aac-cis-innovation-strategy/SKILL.md',
    'solve': 'skills/aac-cis-problem-solving/SKILL.md',
    'story-craft': 'skills/aac-cis-storytelling/SKILL.md',
    'enhance': 'skills/aac-create-epics-and-stories/SKILL.md',
    'elicit': 'skills/aac-advanced-elicitation/SKILL.md',
    'document': 'skills/aac-document-project/SKILL.md',
    'review-code': 'skills/aac-code-review/SKILL.md',
    'ci': 'skills/aac-tea-ci/SKILL.md',
    'party': 'skills/aac-party-mode/SKILL.md',
    // VS Code-only — no CLI equivalent (depend on VS Code extension APIs)
    'refine': undefined,
};

/**
 * Generate an executable workflow stub body that wraps a real BMAD workflow.
 */
function executableWorkflowBody(stubName: string, bmadPath: string): string {
    const entryPath = STUB_TO_MANIFEST[stubName];
    if (!entryPath) {
        // Should not be called for VS Code-only stubs, but guard anyway
        return `This command is handled by the **Agile Agent Canvas** extension.`;
    }
    return `# ${stubName.charAt(0).toUpperCase() + stubName.slice(1)} Workflow

In all BMAD resource files, the template variable {bmad-path} resolves to: ${bmadPath}
The template variable {project-root} refers to the workspace/project root directory.

## Execution

LOAD the FULL workflow definition from: ${bmadPath}/${entryPath}
READ its entire contents, resolve all template variables, and follow its directions exactly.

## Fallback

If the workflow file cannot be found, check whether the Agile Agent Canvas extension is installed and run the IDE installer command from the VS Code Command Palette.
`;
}

/**
 * AgileAgentCanvas workflow stubs.
 * Executable stubs (non-VS-Code-only) point the CLI agent to real BMAD workflow files.
 * VS Code-only stubs keep their delegation body.
 */
const AC_WORKFLOWS: WorkflowStub[] = [
    // ── VS Code-only stubs (keep delegation body — depend on VS Code extension APIs) ──
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
    { name: 'enhance', description: 'Add verbose details: use cases, fit criteria, risks to artifacts' },
    { name: 'elicit', description: 'Apply an advanced elicitation method to an artifact and save results' },
    // ── Executable stubs (body generated at write-time from manifest mapping) ──
    { name: 'dev', description: 'Start development workflow for a story, epic, or test case' },
    { name: 'review', description: 'Review and validate artifact completeness' },
    { name: 'vision', description: 'Define product vision and problem statement' },
    { name: 'requirements', description: 'Extract and organize requirements from PRD' },
    { name: 'epics', description: 'Design epic structure organized by user value' },
    { name: 'stories', description: 'Break down epics into implementable stories' },
    { name: 'sprint', description: 'Sprint planning from epics or check sprint status' },
    { name: 'quick', description: 'Quick spec + dev flow for small changes (spec or dev mode)' },
    { name: 'convert-to-json', description: 'Convert markdown artifacts to structured JSON format' },
    { name: 'readiness', description: 'Check implementation readiness of PRD, architecture, epics and stories' },
    { name: 'ux', description: 'Create UX design specifications through collaborative exploration' },
    { name: 'design-thinking', description: 'Guide human-centered design using empathy-driven methodologies' },
    { name: 'innovate', description: 'Identify disruption opportunities and architect business model innovation' },
    { name: 'solve', description: 'Apply systematic problem-solving methodologies to complex challenges' },
    { name: 'story-craft', description: 'Craft compelling narratives using storytelling frameworks' },
    { name: 'context', description: 'Generate an LLM-optimized project-context.md with implementation rules' },
    // ── Delegation stubs (no manifest entry — keep delegation body) ──
    { name: 'document', description: 'Document a brownfield project for AI context (full scan or deep dive)' },
    { name: 'review-code', description: 'Adversarial code review finding specific issues' },
    { name: 'ci', description: 'Scaffold CI/CD quality pipeline with test execution and quality gates' },
    { name: 'party', description: 'Multi-agent collaboration mode — all agents discuss your topic' },
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
 *
 * For stubs with a manifest entry (non-VS-Code-only), generates an executable
 * wrapper body that points the agent to the real BMAD workflow file.
 * For VS-Code-only stubs, uses the delegation body from AC_WORKFLOWS.
 */
function writeWorkflowStubs(
    workflowsDir: string,
    overwrite: boolean,
    bmadResourcePath: string
): { written: number; skipped: number } {
    if (!fs.existsSync(workflowsDir)) {
        fs.mkdirSync(workflowsDir, { recursive: true });
    }

    let written = 0;
    let skipped = 0;

    for (const wf of AC_WORKFLOWS) {
        const filePath = path.join(workflowsDir, `${wf.name}.md`);

        if (!overwrite && fs.existsSync(filePath)) {
            logger.debug(`[IDE-Install] Skipped workflow (exists): ${wf.name}.md`);
            skipped++;
            continue;
        }

        try {
            // Stubs with no body in AC_WORKFLOWS are executable wrappers
            // (body is generated from the manifest mapping at write time)
            const body = wf.body || executableWorkflowBody(wf.name, bmadResourcePath);
            const content = `---\ndescription: ${wf.description}\n---\n\n${body}`;
            fs.writeFileSync(filePath, content, 'utf-8');
            written++;
            logger.debug(`[IDE-Install] Wrote workflow: ${wf.name}.md`);
        } catch (err) {
            logger.debug(`[IDE-Install] Error writing workflow ${wf.name}: ${err}`);
        }
    }

    return { written, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension agent file — install a single .agent.md representing the extension
// ─────────────────────────────────────────────────────────────────────────────

const EXTENSION_AGENT_FILENAME = 'agileagentcanvas.agent.md';

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
            if (entry.startsWith('agileagentcanvas') &&
                (entry.endsWith('.agent.md') || entry.endsWith('.md'))) {
                fs.unlinkSync(path.join(agentsDir, entry));
                logger.debug(`[IDE-Install] Removed old agent file: ${entry}`);
            }
        }
    } catch (err) {
        logger.debug(`[IDE-Install] Error cleaning agent files: ${err}`);
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
        logger.debug(`[IDE-Install] Wrote schema reference: .agent/schemas-location.md`);
    } catch (err) {
        logger.debug(`[IDE-Install] Error writing schema reference: ${err}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slim Install — 1 agent + 1 help/routing skill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a catalogue table for embedding in the help skill.
 * Each row contains: name, type, description, and the absolute path to the SKILL.md file.
 */
function buildCatalogueTable(artifacts: Artifact[], bmadResourcePath: string): string {
    if (artifacts.length === 0) return '(No skills found — ensure the extension is installed correctly.)';

    const lines: string[] = [
        '| # | Name | Type | Description | File |',
        '|---|------|------|-------------|------|',
    ];

    for (let i = 0; i < artifacts.length; i++) {
        const a = artifacts[i];
        const filePath = path.join(bmadResourcePath, a.relativePath).replace(/\\/g, '/');
        const desc = a.description.replace(/\|/g, '\\|').replace(/\n/g, ' ').substring(0, 120);
        lines.push(`| ${i + 1} | ${a.displayName} | ${a.type} | ${desc} | \`${filePath}\` |`);
    }

    return lines.join('\n');
}

/**
 * Generate the content for the single `help` skill that acts as a routing layer.
 * Contains the full catalogue manifest so external agents can self-route to any skill.
 */
function generateHelpSkillContent(bmadResourcePath: string, extensionVersion: string): string {
    const artifacts = loadArtifacts(bmadResourcePath);
    const catalogueTable = buildCatalogueTable(artifacts, bmadResourcePath);
    const skillsRoot = path.join(bmadResourcePath, 'skills').replace(/\\/g, '/');
    const schemasDir = path.join(bmadResourcePath, 'schemas').replace(/\\/g, '/');
    const skillCount = artifacts.length;
    return `---
name: help
description: 'Smart skill router for Agile Agent Canvas — describe your task and get matched to the best skills/agents. This is the single entry point to the full BMAD methodology.'
---
<!-- aac-version: ${extensionVersion} -->

# Agile Agent Canvas — Help & Skill Router

You have access to the **full Agile Agent Canvas** skill catalogue (${skillCount} skills and agents). When a user asks for help or describes a task, use this catalogue to identify the best matching skill(s) and then load and execute them.

## How to Use

1. **Match** — Given a user request, scan the catalogue below and identify the top 1–3 most relevant skills by matching the user's intent to skill descriptions.
2. **Present** — Show the user a brief numbered list of matches with a one-sentence reason why each fits.
3. **Load & Execute** — When the user selects a skill (or if there's only one strong match), READ the full contents of the skill file at the path shown in the catalogue, resolve template variables, and follow the skill's instructions completely.
4. **If unsure** — Ask the user a clarifying question, then re-match.

## Variable Resolution

In all BMAD skill files, template variables resolve as follows:

| Variable | Resolves To |
|----------|-------------|
| \`{bmad-path}\` | \`${bmadResourcePath.replace(/\\/g, '/')}\` |
| \`{project-root}\` | The workspace/project root directory |
| \`{skill-root}\` | \`${skillsRoot}\` |

## Schema Files

BMAD JSON schemas for artifact validation are located at: \`${schemasDir}\`

## Quick Categories

| Category | Best Skills |
|----------|-------------|
| **Planning & requirements** | aac-product-brief, aac-create-prd, aac-create-epics-and-stories |
| **Development** | bmad-dev-story, bmad-quick-dev, bmad-code-review |
| **Testing & quality** | aac-agent-tea, aac-tea-ci, aac-tea-test-design |
| **Architecture** | aac-create-architecture, aac-generate-project-context |
| **UX & design** | aac-create-ux-design, aac-cis-design-thinking |
| **Creativity & innovation** | aac-cis-innovation-strategy, aac-cis-problem-solving, aac-cis-storytelling |
| **Sprint & project management** | aac-sprint-planning, aac-sprint-status, aac-retrospective |
| **Documentation** | aac-document-project, aac-generate-readme, aac-generate-api-docs |
| **Conversion** | aac-to-json, aac-agent-canvas-integrator |

## Full Skill Catalogue

${catalogueTable}

## Agent Personas

When the user asks to "talk to" a persona by name, match to the corresponding agent skill:

| Persona | Name | Skill |
|---------|------|-------|
| Master | BMad Master | aac-agent-analyst |
| Analyst | Mary | aac-agent-analyst |
| PM | John | aac-agent-pm |
| Architect | Winston | aac-agent-architect |
| Dev | Amelia | aac-agent-dev |
| QA | Quinn | aac-agent-tea |
| Scrum Master | Bob | aac-agent-pm |
| UX Designer | Sally | aac-agent-ux-designer |
| Tech Writer | Paige | aac-agent-tech-writer |
| Test Architect | Murat | aac-agent-tea |
| Solo Dev | Barry | aac-agent-dev |
| Agent Builder | Bond | aac-bmb-agent-builder |
| Module Builder | Morgan | aac-bmb-agent-module-builder |
| Workflow Builder | Wendy | aac-bmb-agent-workflow-builder |
| Brainstorming | Carson | aac-cis-agent-brainstorming |
| Design Thinking | Maya | aac-cis-agent-design-thinking |
| Innovation | Victor | aac-cis-agent-innovation |
| Problem Solver | Dr. Quinn | aac-cis-agent-problem-solver |
| Storyteller | Sophia | aac-cis-agent-storyteller |
| Presentation | Caravaggio | aac-cis-agent-presentation |

## Fallback

If no skill matches the user's request, suggest they:
- Rephrase their task and try again
- Browse the categories table above for inspiration
- Ask for a specific persona by name
`;
}

/**
 * Generate the content for the single agent file that references the help skill.
 * Kept minimal — the help skill does all the heavy lifting.
 */
function generateSlimAgentContent(ide: IdeTarget, extensionVersion: string, skillCount: number): string {
    const skillPath = `${ide.skillsDir}/agileagentcanvas-help/SKILL.md`;

    if (ide.agentFormat === 'opencode') {
        return `---
description: Agile Agent Canvas — Unified agile development assistant with ${skillCount}+ expert skills and agents for product management, architecture, development, QA, and more.
mode: all
---
<!-- aac-version: ${extensionVersion} -->

You are **Agile Agent Canvas** — a unified agile development assistant powered by the BMAD methodology.

## Activation

To discover available skills and find the right one for the user's task, **READ** and follow the help skill:

\`${skillPath}\`

That file contains the full catalogue of all available skills/agents with routing instructions. Always start there.

## Identity

You have access to ${skillCount}+ expert skills and agent personas covering the entire product development lifecycle — from vision and requirements through architecture, development, testing, deployment, and documentation.

When the user describes what they want to do, use the help skill to find the best match and then load the matching skill file to get detailed instructions.
`;
    }

    return `---
description: 'Agile Agent Canvas — Unified agile development assistant with ${skillCount}+ expert skills and agents for product management, architecture, development, QA, and more.'
tools: ['read', 'edit', 'search', 'execute']
---
<!-- aac-version: ${extensionVersion} -->

You are **Agile Agent Canvas** — a unified agile development assistant powered by the BMAD methodology.

## Activation

To discover available skills and find the right one for the user's task, **READ** and follow the help skill:

\`${skillPath}\`

That file contains the full catalogue of all available skills/agents with routing instructions. Always start there.

## Identity

You have access to ${skillCount}+ expert skills and agent personas covering the entire product development lifecycle — from vision and requirements through architecture, development, testing, deployment, and documentation.

When the user describes what they want to do, use the help skill to find the best match and then load the matching skill file to get detailed instructions.
`;
}

/**
 * Write the slim install: 1 help skill + 1 agent file.
 * Returns true if anything was written.
 */
function writeSlimInstall(
    ide: IdeTarget,
    workspaceRoot: string,
    bmadResourcePath: string,
    extensionVersion: string,
    overwrite: boolean,
): boolean {
    let didWrite = false;

    // ── Write the help skill ──────────────────────────────────────────────────
    const skillsDir = path.join(workspaceRoot, ide.skillsDir);
    const helpSkillDir = path.join(skillsDir, 'agileagentcanvas-help');
    const helpSkillFile = path.join(helpSkillDir, 'SKILL.md');
    const artifacts = loadArtifacts(bmadResourcePath);

    if (overwrite || !fs.existsSync(helpSkillFile)) {
        fs.mkdirSync(helpSkillDir, { recursive: true });
        fs.writeFileSync(helpSkillFile, generateHelpSkillContent(bmadResourcePath, extensionVersion), 'utf-8');
        logger.debug(`[IDE-Install] Wrote: ${ide.skillsDir}/agileagentcanvas-help/SKILL.md`);
        didWrite = true;
    }

    // ── Write the agent file (if IDE supports it) ─────────────────────────────
    if (ide.agentsDir) {
        const agentsDir = path.join(workspaceRoot, ide.agentsDir);
        const agentFileName = ide.agentFormat === 'opencode'
            ? 'agileagentcanvas.md'
            : EXTENSION_AGENT_FILENAME;
        const agentFilePath = path.join(agentsDir, agentFileName);

        if (overwrite || !fs.existsSync(agentFilePath)) {
            fs.mkdirSync(agentsDir, { recursive: true });
            fs.writeFileSync(agentFilePath, generateSlimAgentContent(ide, extensionVersion, artifacts.length), 'utf-8');
            logger.debug(`[IDE-Install] Wrote: ${ide.agentsDir}/${agentFileName}`);
            didWrite = true;
        }
    }

    // ── Write workflow stubs (slash-commands) if IDE supports them ─────────────
    if (ide.workflowsDir) {
        const wfDir = path.join(workspaceRoot, ide.workflowsDir);
        const wfResult = writeWorkflowStubs(wfDir, overwrite, bmadResourcePath);
        if (wfResult.written > 0) {
            didWrite = true;
        }
    }

    return didWrite;
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
        // eslint-disable-next-line @typescript-eslint/no-var-requires -- intentional lazy load: avoids a load-order cycle and keeps it off the activation path
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

    // Read extension version from package.json (used for version-stamping skills)
    let extensionVersion = 'unknown';
    try {
        const pkgPath = path.join(extensionPath, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        extensionVersion = pkg.version || 'unknown';
    } catch { /* ignore */ }

    // Marker: the help skill (new slim format)
    const markerSkill = path.join(workspaceRoot, ide.skillsDir, 'agileagentcanvas-help', 'SKILL.md');

    // Also check legacy marker for migration
    const legacyMarker = path.join(workspaceRoot, ide.skillsDir, 'agileagentcanvas-agent-master', 'SKILL.md');

    if (fs.existsSync(markerSkill)) {
        // Version-aware: only skip if the installed marker matches the current extension version
        try {
            const content = fs.readFileSync(markerSkill, 'utf-8');
            const versionMatch = content.match(/<!-- aac-version: (.+?) -->/);
            if (versionMatch && versionMatch[1] === extensionVersion) {
                logger.debug(`[IDE-Install] Already installed v${extensionVersion} — skipping auto-install`);
                return;
            }
            logger.debug(`[IDE-Install] Version mismatch (installed: ${versionMatch?.[1]}, current: ${extensionVersion}) — reinstalling`);
        } catch { /* proceed with install */ }
    }

    logger.debug(`[IDE-Install] Auto-installing slim framework for detected IDE: ${ide.label}`);

    // Clean up legacy dirs first (removes old 86+ individual skill dirs)
    cleanupLegacyDirs(ide, workspaceRoot);

    // Clean existing extension skills in the target dir (migration from old format)
    if (fs.existsSync(legacyMarker)) {
        cleanupExtensionSkills(path.join(workspaceRoot, ide.skillsDir));
        logger.debug('[IDE-Install] Migrated from legacy full-install to slim format');
    }

    // Clean old agent files
    cleanupExtensionAgentFiles(ide, workspaceRoot);

    // Write slim install: 1 help skill + 1 agent + workflow stubs
    const didWrite = writeSlimInstall(ide, workspaceRoot, bmadResourcePath, extensionVersion, true);

    // Write schema reference file so LLMs know where to find BMAD schemas
    writeSchemaReference(extensionPath, workspaceRoot);

    if (didWrite) {
        logger.debug(`[IDE-Install] Auto-install complete: slim format (1 help skill + 1 agent)`);

        const action = await vscode.window.showInformationMessage(
            `AgileAgentCanvas: Installed framework for ${ide.label} — 1 agent + routing skill with full catalogue access`,
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
 * Installs the slim format: 1 agent + 1 help/routing skill with full catalogue access.
 */
export async function installToIde(extensionPath: string): Promise<void> {
    logger.debug('[IDE-Install] Manual install started');

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
                description: 'Install into every workspace folder',
                _all: true,
            },
            ...workspaceFolders.map(f => ({
                label: f.name,
                description: f.uri.fsPath,
                _fsPath: f.uri.fsPath,
            })),
        ];

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Install into all workspace folders, or pick one?',
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
        placeHolder: 'Which IDE/tool do you want to install Agile Agent Canvas for?',
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

    // Read extension version for version-stamping
    let extensionVersion = 'unknown';
    try {
        const pkgPath = path.join(extensionPath, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        extensionVersion = pkg.version || 'unknown';
    } catch { /* ignore */ }

    // ── Overwrite check ──────────────────────────────────────────────────────
    const existingCount = workspaceRoots.reduce((count, root) => {
        const helpFile = path.join(root, ide.skillsDir, 'agileagentcanvas-help', 'SKILL.md');
        return count + (fs.existsSync(helpFile) ? 1 : 0);
    }, 0);

    if (existingCount > 0) {
        const ow = await vscode.window.showInformationMessage(
            `AgileAgentCanvas is already installed. Overwrite and update?`,
            { modal: true },
            'Update',
            'Cancel'
        );
        if (ow === 'Cancel' || !ow) return;
    }

    // ── Write into each target root ───────────────────────────────────────────
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Installing Agile Agent Canvas for ${ide.label}...`, cancellable: false },
        async () => {
            for (const root of workspaceRoots) {
                // Clean up legacy 86+ skill dirs if migrating
                cleanupLegacyDirs(ide, root);
                cleanupExtensionSkills(path.join(root, ide.skillsDir));
                cleanupExtensionAgentFiles(ide, root);

                // Write slim install
                writeSlimInstall(ide, root, bmadResourcePath, extensionVersion, true);

                // Deploy schema reference
                writeSchemaReference(extensionPath, root);
            }
        }
    );

    // ── Result ────────────────────────────────────────────────────────────────
    const folderHint = workspaceRoots.length > 1
        ? ` across ${workspaceRoots.length} folders`
        : ` into \`${ide.skillsDir}/\``;

    const artifactCount = loadArtifacts(bmadResourcePath).length;
    const action = await vscode.window.showInformationMessage(
        `AgileAgentCanvas: Installed 1 agent + help skill with access to ${artifactCount} skills${folderHint}`,
        'Show Files'
    );
    if (action === 'Show Files') {
        vscode.commands.executeCommand('revealFileInOS',
            vscode.Uri.file(path.join(workspaceRoots[0], ide.skillsDir)));
    }
}
