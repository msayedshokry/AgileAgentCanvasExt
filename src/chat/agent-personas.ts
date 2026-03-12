import * as fs from 'fs';
import * as path from 'path';

/**
 * Agent Persona Loader
 *
 * Reads BMAD agent persona files from disk and extracts both:
 *   1. The parsed <persona> fields (name, title, role, etc.) for lightweight
 *      formatting in workflow-execution prompts.
 *   2. The **full agent file content** (activation instructions, menus,
 *      menu-handlers, rules) for conversational mode where the AI should
 *      present menus, wait for user input, and follow the official BMAD
 *      interaction model.
 *
 * Each agent .md file wraps its XML inside a fenced code block.  We extract
 * the key agent attributes (name, title, icon, capabilities) from the
 * <agent> tag, the full <persona> section (role, identity,
 * communication_style, principles), and preserve the complete raw content
 * for full-activation prompts.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentPersona {
    /** Agent short-name, e.g. "Mary" */
    name: string;
    /** Agent job title, e.g. "Business Analyst" */
    title: string;
    /** Emoji icon */
    icon: string;
    /** Comma-separated capabilities string */
    capabilities: string;
    /** <role> text */
    role: string;
    /** <identity> text */
    identity: string;
    /** <communication_style> text */
    communicationStyle: string;
    /** <principles> text */
    principles: string;
    /**
     * The complete, unmodified content of the agent .md file.
     * Includes the preamble, full XML (activation, persona, menu,
     * menu-handlers, rules) — everything the AI needs to follow
     * the official BMAD interactive activation model.
     */
    rawContent: string;
}

/** Which agent should be used for a given artifact type */
export type ArtifactAgentKey =
    | 'analyst'
    | 'pm'
    | 'sm'
    | 'architect'
    | 'qa'
    | 'tea'
    | 'dev'
    | 'ux-designer'
    | 'bmad-master'
    | 'quick-flow'
    | 'design-thinking-coach'
    | 'innovation-strategist'
    | 'creative-problem-solver'
    | 'presentation-master';

// ── Artifact-type → agent mapping ────────────────────────────────────────────

/**
 * Maps each artifact type to the agent file that should provide the persona
 * for that artifact's refinement / creation workflow.
 *
 * The returned path is relative to the bmad root (e.g. `bmm/agents/analyst.md`).
 */
const ARTIFACT_TYPE_TO_AGENT: Record<string, { relativePath: string; key: ArtifactAgentKey }> = {
    'vision':         { relativePath: 'bmm/agents/pm.md',        key: 'pm' },
    'product-brief':  { relativePath: 'bmm/agents/pm.md',        key: 'pm' },
    'prd':            { relativePath: 'bmm/agents/pm.md',        key: 'pm' },
    'requirement':    { relativePath: 'bmm/agents/analyst.md',   key: 'analyst' },
    'epic':           { relativePath: 'bmm/agents/pm.md',        key: 'pm' },
    'story':          { relativePath: 'bmm/agents/sm.md',        key: 'sm' },
    'use-case':       { relativePath: 'bmm/agents/analyst.md',   key: 'analyst' },
    'architecture':   { relativePath: 'bmm/agents/architect.md', key: 'architect' },
    'test-case':      { relativePath: 'tea/agents/tea.md',       key: 'tea' },
    'test-strategy':  { relativePath: 'tea/agents/tea.md',       key: 'tea' },
    'nfr':            { relativePath: 'tea/agents/tea.md',       key: 'tea' },
    'sprint':         { relativePath: 'bmm/agents/sm.md',       key: 'sm' },
    'ux-design':      { relativePath: 'bmm/agents/ux-designer.md', key: 'ux-designer' },
    'readiness':      { relativePath: 'bmm/agents/architect.md', key: 'architect' },
    'party':          { relativePath: 'core/agents/bmad-master.md', key: 'bmad-master' },
    // /document command — Mary (Analyst) handles brownfield project documentation
    'document':       { relativePath: 'bmm/agents/analyst.md',   key: 'analyst' },
    // /review-code command — Quinn (QA) performs adversarial code review
    'code-review':    { relativePath: 'bmm/agents/qa.md',        key: 'qa' },
    // /ci command — Murat (TEA) scaffolds CI/CD pipelines
    'ci-pipeline':    { relativePath: 'tea/agents/tea.md',       key: 'tea' },
    // /quick command — Barry (Quick Flow Solo Dev) for rapid spec + implementation
    'quick-spec':     { relativePath: 'bmm/agents/quick-flow-solo-dev.md', key: 'quick-flow' },
    'quick-dev':      { relativePath: 'bmm/agents/quick-flow-solo-dev.md', key: 'quick-flow' },
    // CIS creative workflows
    'design-thinking':     { relativePath: 'cis/agents/design-thinking-coach.md',  key: 'design-thinking-coach' },
    'innovation-strategy': { relativePath: 'cis/agents/innovation-strategist.md',  key: 'innovation-strategist' },
    'problem-solving':     { relativePath: 'cis/agents/creative-problem-solver.md', key: 'creative-problem-solver' },
    'storytelling':        { relativePath: 'cis/agents/presentation-master.md',    key: 'presentation-master' },
};

// Default when the artifact type is unknown
const DEFAULT_AGENT = { relativePath: 'bmm/agents/analyst.md', key: 'analyst' as ArtifactAgentKey };

// ── Persona cache ────────────────────────────────────────────────────────────

const personaCache = new Map<string, AgentPersona>();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Clear the persona cache.  Call this when the BMAD path changes (e.g. a new
 * project folder is opened).
 */
export function clearPersonaCache(): void {
    personaCache.clear();
}

/**
 * Load an agent persona from disk.
 *
 * @param bmadPath  Absolute path to the BMAD root directory (e.g. `…/_bmad`)
 * @param agentRelativePath  Relative path to the agent file inside the BMAD root
 *                           (e.g. `bmm/agents/analyst.md`)
 * @returns The parsed persona, or `undefined` if the file cannot be read/parsed.
 */
export function loadAgentPersona(bmadPath: string, agentRelativePath: string): AgentPersona | undefined {
    const cacheKey = `${bmadPath}::${agentRelativePath}`;
    if (personaCache.has(cacheKey)) {
        return personaCache.get(cacheKey);
    }

    const filePath = path.join(bmadPath, agentRelativePath);
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch {
        return undefined;
    }

    const persona = parseAgentPersona(content);
    if (persona) {
        personaCache.set(cacheKey, persona);
    }
    return persona;
}

/**
 * Get the correct agent persona for a given artifact type.
 *
 * @param bmadPath      Absolute path to the BMAD root
 * @param artifactType  The artifact type (e.g. 'vision', 'story', 'test-case')
 * @returns The agent persona, or undefined if it cannot be loaded.
 */
export function getPersonaForArtifactType(bmadPath: string, artifactType: string): AgentPersona | undefined {
    const mapping = ARTIFACT_TYPE_TO_AGENT[artifactType] ?? DEFAULT_AGENT;
    return loadAgentPersona(bmadPath, mapping.relativePath);
}

/**
 * Get the agent-file relative path for a given artifact type.
 */
export function getAgentPathForArtifactType(artifactType: string): string {
    return (ARTIFACT_TYPE_TO_AGENT[artifactType] ?? DEFAULT_AGENT).relativePath;
}

/**
 * Format a loaded persona into a markdown section suitable for injection into
 * an LLM system prompt.
 */
export function formatPersonaForPrompt(persona: AgentPersona): string {
    return `## Your Persona
- **Name:** ${persona.name}
- **Title:** ${persona.title}
- **Role:** ${persona.role}
- **Identity:** ${persona.identity}
- **Communication Style:** ${persona.communicationStyle}
- **Principles:** ${persona.principles}`;
}

// ── All known agent file paths (for party mode roster) ───────────────────────

const ALL_AGENT_PATHS: { relativePath: string; module: string }[] = [
    // BMM agents
    { relativePath: 'bmm/agents/analyst.md',           module: 'BMM' },
    { relativePath: 'bmm/agents/pm.md',                module: 'BMM' },
    { relativePath: 'bmm/agents/sm.md',                module: 'BMM' },
    { relativePath: 'bmm/agents/architect.md',          module: 'BMM' },
    { relativePath: 'bmm/agents/qa.md',                module: 'BMM' },
    { relativePath: 'bmm/agents/dev.md',               module: 'BMM' },
    { relativePath: 'bmm/agents/ux-designer.md',        module: 'BMM' },
    // TEA agent
    { relativePath: 'tea/agents/tea.md',               module: 'TEA' },
    // Core orchestrator
    { relativePath: 'core/agents/bmad-master.md',       module: 'Core' },
];

/**
 * Load all known agent personas from disk.
 * Returns an array of successfully loaded personas with their module tags.
 * Used by party mode to build a complete agent roster.
 */
export function loadAllAgentPersonas(bmadPath: string): { persona: AgentPersona; module: string; relativePath: string }[] {
    const results: { persona: AgentPersona; module: string; relativePath: string }[] = [];
    for (const entry of ALL_AGENT_PATHS) {
        const persona = loadAgentPersona(bmadPath, entry.relativePath);
        if (persona) {
            results.push({ persona, module: entry.module, relativePath: entry.relativePath });
        }
    }
    return results;
}

/**
 * Format all loaded agent personas into a party-mode roster string for the
 * LLM system prompt.  Each agent gets a concise block with their name, title,
 * icon, role, communication style and principles so the LLM can role-play them.
 */
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

// ── XML parsing helpers (lightweight, no dependency) ─────────────────────────

function extractTagContent(xml: string, tag: string): string {
    // Match both <tag>content</tag> and <tag attr="...">content</tag>
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : '';
}

function extractAttribute(xml: string, tag: string, attr: string): string {
    const tagRe = new RegExp(`<${tag}\\s[^>]*${attr}="([^"]*)"`, 'i');
    const m = xml.match(tagRe);
    return m ? m[1].trim() : '';
}

/**
 * Parse the agent XML embedded in a BMAD agent markdown file and extract the
 * persona section.  Also preserves the full raw file content for
 * full-activation prompts.
 */
function parseAgentPersona(content: string): AgentPersona | undefined {
    // The XML is inside a fenced code block (```xml ... ```)
    const fenceMatch = content.match(/```xml\s*([\s\S]*?)```/);
    if (!fenceMatch) {
        return undefined;
    }
    const xml = fenceMatch[1];

    const name = extractAttribute(xml, 'agent', 'name');
    const title = extractAttribute(xml, 'agent', 'title');
    const icon = extractAttribute(xml, 'agent', 'icon');
    const capabilities = extractAttribute(xml, 'agent', 'capabilities');

    const personaXml = extractTagContent(xml, 'persona');
    if (!personaXml) {
        return undefined;
    }

    const role = extractTagContent(personaXml, 'role');
    const identity = extractTagContent(personaXml, 'identity');
    const communicationStyle = extractTagContent(personaXml, 'communication_style');
    // Principles may contain XML entities (&apos; etc.)
    let principles = extractTagContent(personaXml, 'principles');
    principles = principles.replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    if (!name || !role) {
        return undefined;
    }

    return {
        name,
        title,
        icon,
        capabilities,
        role,
        identity: identity.replace(/&apos;/g, "'"),
        communicationStyle: communicationStyle.replace(/&apos;/g, "'"),
        principles,
        rawContent: content,
    };
}

// ── Full-activation prompt formatting ────────────────────────────────────────

/**
 * Format a loaded persona into a **full activation prompt** that includes
 * the complete agent file content — activation instructions, menus,
 * menu-handlers, and rules.
 *
 * This is used in conversational mode where the AI should present menus,
 * wait for user input, and follow the official BMAD interaction model
 * (as opposed to directed workflow execution where only the persona is needed).
 */
export function formatFullAgentForPrompt(persona: AgentPersona): string {
    return persona.rawContent;
}
