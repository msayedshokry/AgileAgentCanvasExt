import * as fs from 'fs';
import * as path from 'path';
import * as TOML from '@iarna/toml';

/**
 * Agent Persona Loader — v6.6.0 Skill-Directory Architecture
 *
 * Reads BMAD agent persona data from the skills/ directory structure:
 *   - `skills/{skill-name}/SKILL.md` — frontmatter (name, description) + activation instructions
 *   - `skills/{skill-name}/customize.toml` — agent config (icon, role, identity, menu, etc.)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentPersona {
    name: string;
    title: string;
    icon: string;
    capabilities: string;
    role: string;
    identity: string;
    communicationStyle: string;
    principles: string;
    skillName: string;
    rawContent: string;
    menu?: AgentMenuItem[];
}

export interface AgentMenuItem {
    code: string;
    description: string;
    skill?: string;
    prompt?: string;
}

export type ArtifactAgentKey =
    | 'analyst'
    | 'pm'
    | 'architect'
    | 'dev'
    | 'ux-designer'
    | 'tech-writer'
    | 'tea'
    | 'canvas-integrator'
    | 'cis-brainstorming-coach'
    | 'cis-creative-problem-solver'
    | 'cis-design-thinking-coach'
    | 'cis-innovation-strategist'
    | 'cis-presentation-master'
    | 'cis-storyteller';

// ── Artifact-type → skill mapping ────────────────────────────────────────────

const ARTIFACT_TYPE_TO_AGENT: Record<string, { skillName: string; key: ArtifactAgentKey }> = {
    'vision':              { skillName: 'bmad-agent-pm',             key: 'pm' },
    'product-brief':       { skillName: 'bmad-agent-pm',             key: 'pm' },
    'prd':                 { skillName: 'bmad-agent-pm',             key: 'pm' },
    'requirement':         { skillName: 'bmad-agent-analyst',        key: 'analyst' },
    'epic':                { skillName: 'bmad-agent-pm',             key: 'pm' },
    'story':               { skillName: 'bmad-agent-dev',            key: 'dev' },
    'use-case':            { skillName: 'bmad-agent-analyst',        key: 'analyst' },
    'architecture':        { skillName: 'bmad-agent-architect',      key: 'architect' },
    'test-case':           { skillName: 'aac-agent-tea',             key: 'tea' },
    'test-strategy':       { skillName: 'aac-agent-tea',             key: 'tea' },
    'nfr':                 { skillName: 'aac-agent-tea',             key: 'tea' },
    'sprint':              { skillName: 'bmad-agent-dev',            key: 'dev' },
    'ux-design':           { skillName: 'bmad-agent-ux-designer',    key: 'ux-designer' },
    'readiness':           { skillName: 'bmad-agent-architect',      key: 'architect' },
    'party':               { skillName: 'bmad-party-mode',           key: 'analyst' },
    'document':            { skillName: 'bmad-agent-analyst',        key: 'analyst' },
    'code-review':         { skillName: 'bmad-agent-dev',            key: 'dev' },
    'ci-pipeline':         { skillName: 'aac-agent-tea',             key: 'tea' },
    'quick-spec':          { skillName: 'bmad-agent-dev',            key: 'dev' },
    'quick-dev':           { skillName: 'bmad-agent-dev',            key: 'dev' },
    'design-thinking':     { skillName: 'aac-cis-agent-design-thinking',   key: 'cis-design-thinking-coach' },
    'innovation-strategy': { skillName: 'aac-cis-agent-innovation',        key: 'cis-innovation-strategist' },
    'problem-solving':     { skillName: 'aac-cis-agent-problem-solver',    key: 'cis-creative-problem-solver' },
    'storytelling':        { skillName: 'aac-cis-agent-storyteller',       key: 'cis-storyteller' },
    // CIS v0.1.9 agent personas (direct chat invocation)
    'cis-brainstorming':     { skillName: 'aac-cis-agent-brainstorming',           key: 'cis-brainstorming-coach' },
    'cis-problem-solving':   { skillName: 'aac-cis-agent-problem-solver',          key: 'cis-creative-problem-solver' },
    'cis-design-thinking':   { skillName: 'aac-cis-agent-design-thinking',         key: 'cis-design-thinking-coach' },
    'cis-innovation':        { skillName: 'aac-cis-agent-innovation',              key: 'cis-innovation-strategist' },
    'cis-presentation':      { skillName: 'aac-cis-agent-presentation',            key: 'cis-presentation-master' },
    'cis-storytelling':      { skillName: 'aac-cis-agent-storyteller',              key: 'cis-storyteller' },
    'canvas-convert':      { skillName: 'aac-agent-canvas-integrator',     key: 'canvas-integrator' },
};

const DEFAULT_AGENT = { skillName: 'bmad-agent-analyst', key: 'analyst' as ArtifactAgentKey };

// ── Persona cache ────────────────────────────────────────────────────────────

const personaCache = new Map<string, AgentPersona>();

export function clearPersonaCache(): void {
    personaCache.clear();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load a persona by skill name from a single bmadPath (legacy — used by most callers).
 * If the CatalogueService is initialised, user overrides are automatically preferred.
 */
export function loadAgentPersona(bmadPath: string, skillName: string): AgentPersona | undefined {
    // If CatalogueService is available, use its ordered search paths so user overrides win.
    let searchPaths: string[] | undefined;
    try {
        const { getCatalogueService } = require('../state/catalogue-service');
        const svc = getCatalogueService();
        // getCatalogueService().getSearchPaths() returns [userPath, builtinPath]
        // The builtinPath is already <extensionPath>/resources/_aac/skills
        // bmadPath is <extensionPath>/resources/_aac, so we need to append 'skills'
        searchPaths = svc.getSearchPaths();
    } catch {
        // CatalogueService not yet available — fall back to single path
    }

    if (searchPaths && searchPaths.length > 0) {
        return loadAgentPersonaFromPaths(searchPaths, skillName);
    }

    return loadAgentPersonaFromPaths([path.join(bmadPath, 'skills')], skillName);
}

/**
 * Load a persona by searching an ordered list of skills directories.
 * The first directory that contains a SKILL.md for the given skill name wins.
 */
export function loadAgentPersonaFromPaths(skillsDirs: string[], skillName: string): AgentPersona | undefined {
    for (const skillsDir of skillsDirs) {
        const cacheKey = `${skillsDir}::${skillName}`;
        if (personaCache.has(cacheKey)) {
            return personaCache.get(cacheKey);
        }

        const skillDir = path.join(skillsDir, skillName);
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        const tomlPath = path.join(skillDir, 'customize.toml');

        let skillMdContent: string;
        try {
            skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
        } catch {
            continue; // Not in this directory — try the next
        }

        let tomlData: Record<string, unknown> = {};
        try {
            const tomlContent = fs.readFileSync(tomlPath, 'utf-8');
            tomlData = TOML.parse(tomlContent);
        } catch {
            // No customize.toml or parse error
        }

        const persona = parseSkillPersona(skillName, skillMdContent, tomlData);
        if (persona) {
            personaCache.set(cacheKey, persona);
            return persona;
        }
    }

    return undefined;
}

export function loadAgentPersonaByPath(bmadPath: string, agentRelativePath: string): AgentPersona | undefined {
    const skillName = legacyPathToSkillName(agentRelativePath);
    if (!skillName) { return undefined; }
    return loadAgentPersona(bmadPath, skillName);
}

export function getPersonaForArtifactType(bmadPath: string, artifactType: string): AgentPersona | undefined {
    const mapping = ARTIFACT_TYPE_TO_AGENT[artifactType] ?? DEFAULT_AGENT;
    return loadAgentPersona(bmadPath, mapping.skillName);
}

export function getAgentPathForArtifactType(artifactType: string): string {
    return (ARTIFACT_TYPE_TO_AGENT[artifactType] ?? DEFAULT_AGENT).skillName;
}

export function formatPersonaForPrompt(persona: AgentPersona): string {
    return `## Your Persona
- **Name:** ${persona.name}
- **Title:** ${persona.title}
- **Role:** ${persona.role}
- **Identity:** ${persona.identity}
- **Communication Style:** ${persona.communicationStyle}
- **Principles:** ${persona.principles}`;
}

// ── All agent skills discovery ───────────────────────────────────────────────

export function loadAllAgentPersonas(bmadPath: string): { persona: AgentPersona; module: string; relativePath: string }[] {
    // Use the CatalogueService search paths when available so user overrides are included
    let searchPaths: string[];
    try {
        const { getCatalogueService } = require('../state/catalogue-service');
        searchPaths = getCatalogueService().getSearchPaths();
    } catch {
        searchPaths = [path.join(bmadPath, 'skills')];
    }

    const seen = new Set<string>();
    const results: { persona: AgentPersona; module: string; relativePath: string }[] = [];

    for (const skillsDir of searchPaths) {
        if (!fs.existsSync(skillsDir)) { continue; }

        let entries: string[];
        try {
            entries = fs.readdirSync(skillsDir);
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.includes('agent')) { continue; }
            if (seen.has(entry)) { continue; } // user path takes precedence

            const skillDir = path.join(skillsDir, entry);
            try {
                if (!fs.statSync(skillDir).isDirectory()) { continue; }
            } catch { continue; }

            const persona = loadAgentPersonaFromPaths(searchPaths, entry);
            if (!persona) { continue; }

            seen.add(entry);

            let module = 'BMM';
            if (entry.startsWith('aac-tea') || entry === 'aac-agent-tea') { module = 'TEA'; }
            else if (entry.startsWith('aac-cis')) { module = 'CIS'; }
            else if (entry.startsWith('aac-bmb')) { module = 'BMB'; }
            else if (entry.startsWith('aac-')) { module = 'Core'; }
            else if (!entry.startsWith('bmad-')) { module = 'User'; }

            results.push({ persona, module, relativePath: `skills/${entry}` });
        }
    }

    return results;
}

export function formatAgentRoster(agents: { persona: AgentPersona; module: string }[]): string {
    const lines: string[] = ['## BMAD Agent Roster\n'];
    for (const { persona, module } of agents) {
        lines.push(`### ${persona.icon || '🤖'} ${persona.name} — ${persona.title} (${module})`);
        lines.push(`- **Role:** ${persona.role}`);
        lines.push(`- **Identity:** ${persona.identity}`);
        lines.push(`- **Communication Style:** ${persona.communicationStyle}`);
        lines.push(`- **Principles:** ${persona.principles}`);
        lines.push('');
    }
    return lines.join('\n');
}

// ── Skill parsing ────────────────────────────────────────────────────────────

function parseSkillPersona(skillName: string, skillMdContent: string, tomlData: Record<string, unknown>): AgentPersona | undefined {
    const agent = tomlData.agent as Record<string, unknown> | undefined;

    if (agent && agent.name) {
        const menu: AgentMenuItem[] = [];
        if (Array.isArray(agent.menu)) {
            for (const item of agent.menu) {
                menu.push({
                    code: item.code ?? '',
                    description: item.description ?? '',
                    skill: item.skill,
                    prompt: item.prompt,
                });
            }
        }

        const principles = Array.isArray(agent.principles)
            ? agent.principles.join('\n- ')
            : (agent.principles ?? '');

        return {
            name: String(agent?.name ?? ''),
            title: String(agent?.title ?? ''),
            icon: String(agent?.icon ?? ''),
            capabilities: '',
            role: String(agent?.role ?? ''),
            identity: String(agent?.identity ?? ''),
            communicationStyle: String(agent?.communication_style ?? ''),
            principles: principles ? `- ${principles}` : '',
            skillName,
            rawContent: skillMdContent,
            menu: menu.length > 0 ? menu : undefined,
        };
    }

    // Fallback: legacy XML-in-markdown
    const fenceMatch = skillMdContent.match(/```xml\s*([\s\S]*?)```/);
    if (fenceMatch) {
        return parseLegacyXmlPersona(skillName, skillMdContent, fenceMatch[1]);
    }

    // Minimal: SKILL.md frontmatter only
    const frontmatter = parseFrontmatter(skillMdContent);
    if (frontmatter.name) {
        return {
            name: frontmatter.name,
            title: frontmatter.description ?? '',
            icon: '',
            capabilities: '',
            role: '',
            identity: '',
            communicationStyle: '',
            principles: '',
            skillName,
            rawContent: skillMdContent,
        };
    }

    return undefined;
}

function parseLegacyXmlPersona(skillName: string, fullContent: string, xml: string): AgentPersona | undefined {
    const name = extractAttribute(xml, 'agent', 'name');
    const title = extractAttribute(xml, 'agent', 'title');
    const icon = extractAttribute(xml, 'agent', 'icon');
    const capabilities = extractAttribute(xml, 'agent', 'capabilities');

    const personaXml = extractTagContent(xml, 'persona');
    if (!personaXml && !name) { return undefined; }

    const role = extractTagContent(personaXml, 'role');
    const identity = extractTagContent(personaXml, 'identity').replace(/&apos;/g, "'");
    const communicationStyle = extractTagContent(personaXml, 'communication_style').replace(/&apos;/g, "'");
    let principles = extractTagContent(personaXml, 'principles');
    principles = principles.replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    if (!name) { return undefined; }

    return { name, title, icon, capabilities, role, identity, communicationStyle, principles, skillName, rawContent: fullContent };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, string> {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) { return {}; }
    const result: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^(\w+)\s*:\s*['"]?(.+?)['"]?\s*$/);
        if (kv) { result[kv[1]] = kv[2]; }
    }
    return result;
}

function extractTagContent(xml: string, tag: string): string {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : '';
}

function extractAttribute(xml: string, tag: string, attr: string): string {
    const tagRe = new RegExp(`<${tag}\\s[^>]*${attr}="([^"]*)"`, 'i');
    const m = xml.match(tagRe);
    return m ? m[1].trim() : '';
}

export function formatFullAgentForPrompt(
    persona: AgentPersona,
    context?: { artifactType?: string; toolsAvailable?: boolean }
): string {
    const genericFooter = `

## Output Format (CRITICAL)

When creating or updating artifacts:
1. You MUST return valid JSON in a single \`\`\`json\`\`\` code block.
2. Do NOT wrap JSON in conversational prose before or after the code block.
3. Do NOT invent fields not in the schema. If a field doesn't apply, omit it.
4. ${context?.artifactType ? `Schema \`${context.artifactType}\` requires fields per its JSON schema.` : 'Use the schema reference in the task description.'}`;

    const writeContract = context?.toolsAvailable
        ? `
5. To write or update an artifact, call \`agileagentcanvas_update_artifact\`. NEVER call \`agileagentcanvas_write_file\` on \`.md\` or \`.yaml\` files inside \`.agileagentcanvas-context/\`.
6. NEVER read \`.md\` files inside \`.agileagentcanvas-context/\` as a source of truth — they are derived views, not canonical.`
        : `
5. If a tool call would suffice, prefer the tool over inline JSON.`;

    return (persona.rawContent || '') + genericFooter + writeContract;
}

// ── Legacy path translation ──────────────────────────────────────────────────

const LEGACY_PATH_MAP: Record<string, string> = {
    'bmm/agents/analyst.md': 'bmad-agent-analyst',
    'bmm/agents/pm.md': 'bmad-agent-pm',
    'bmm/agents/sm.md': 'bmad-agent-dev',
    'bmm/agents/architect.md': 'bmad-agent-architect',
    'bmm/agents/qa.md': 'bmad-agent-dev',
    'bmm/agents/dev.md': 'bmad-agent-dev',
    'bmm/agents/ux-designer.md': 'bmad-agent-ux-designer',
    'bmm/agents/quick-flow-solo-dev.md': 'bmad-agent-dev',
    'bmm/agents/tech-writer/tech-writer.md': 'bmad-agent-tech-writer',
    'tea/agents/tea.md': 'aac-agent-tea',
    'core/agents/bmad-master.md': 'bmad-agent-analyst',
    'core/agents/canvas-integrator.md': 'aac-agent-canvas-integrator',
    'cis/agents/brainstorming-coach.md': 'aac-cis-agent-brainstorming',
    'cis/agents/creative-problem-solver.md': 'aac-cis-agent-problem-solver',
    'cis/agents/design-thinking-coach.md': 'aac-cis-agent-design-thinking',
    'cis/agents/innovation-strategist.md': 'aac-cis-agent-innovation',
    'cis/agents/presentation-master.md': 'aac-cis-agent-presentation',
    'cis/agents/storyteller/storyteller.md': 'aac-cis-agent-storyteller',
    'bmb/agents/agent-builder.md': 'aac-bmb-agent-builder',
    'bmb/agents/module-builder.md': 'aac-bmb-agent-module-builder',
    'bmb/agents/workflow-builder.md': 'aac-bmb-agent-workflow-builder',
};

function legacyPathToSkillName(relativePath: string): string | undefined {
    const normalized = relativePath.replace(/\\/g, '/');
    return LEGACY_PATH_MAP[normalized];
}
