/**
 * Anti-pattern detector for AI chat sessions.
 *
 * Scans chat history for known inefficient patterns where the model
 * should have used an AgileAgentCanvas tool instead.
 */

// ─── Patterns ─────────────────────────────────────────────────────────────────

const SHELL_FOR_JSON = /\b(python3?|node)\s+-[ec]\s+["'].*(?:import\s+json|require\(['"]json)/;
const INLINE_YAML = /```(?:python|javascript|typescript)\n[\s\S]*?yaml\.?[Pp]arse|js-yaml/;
const READ_MODIFY_WRITE = /agileagentcanvas_read_file[\s\S]*?(?:agileagentcanvas_update_artifact|agileagentcanvas_write_file)[\s\S]*?agileagentcanvas_read_file/;
const INLINE_SCHEMA_GEN =
    /```(?:python|javascript|typescript)[\s\S]*?(?:interface\s+\w+|type\s+\w+\s*=)/;
const MANUAL_DIFF = /\bdifflib\b|\bdiff\s*\(/;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AntiPatternName =
    | 'shell_for_json'
    | 'inline_yaml_parser'
    | 'read_modify_write_loop'
    | 'inline_schema_gen'
    | 'manual_diff';

export interface AntiPattern {
    pattern: AntiPatternName;
    evidence: string;
    suggestedTool: string;
    frequency: number;
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Scan a chat history string for known anti-patterns.
 * Returns an array of detected patterns with occurrence counts.
 */
export function detectAntiPatterns(chatHistory: string): AntiPattern[] {
    const detected: AntiPattern[] = [];

    const shellMatches = [...chatHistory.matchAll(SHELL_FOR_JSON)];
    if (shellMatches.length > 0) {
        detected.push({
            pattern: 'shell_for_json',
            evidence: 'Model called Python/Node shell to parse JSON',
            suggestedTool: 'agileagentcanvas_repair_json',
            frequency: shellMatches.length,
        });
    }

    const yamlMatches = [...chatHistory.matchAll(INLINE_YAML)];
    if (yamlMatches.length > 0) {
        detected.push({
            pattern: 'inline_yaml_parser',
            evidence: 'Model wrote inline YAML parsing code',
            suggestedTool: 'agileagentcanvas_yaml_to_json',
            frequency: yamlMatches.length,
        });
    }

    const readModifyWriteMatches = [...chatHistory.matchAll(READ_MODIFY_WRITE)];
    if (readModifyWriteMatches.length > 0) {
        detected.push({
            pattern: 'read_modify_write_loop',
            evidence: 'Model read file, modified, wrote — without using update_artifact',
            suggestedTool: 'agileagentcanvas_update_artifact',
            frequency: readModifyWriteMatches.length,
        });
    }

    const schemaMatches = [...chatHistory.matchAll(INLINE_SCHEMA_GEN)];
    if (schemaMatches.length > 0) {
        detected.push({
            pattern: 'inline_schema_gen',
            evidence: 'Model wrote a TypeScript interface instead of using agileagentcanvas_repair_json',
            suggestedTool: 'agileagentcanvas_repair_json',
            frequency: schemaMatches.length,
        });
    }

    const diffMatches = [...chatHistory.matchAll(MANUAL_DIFF)];
    if (diffMatches.length > 0) {
        detected.push({
            pattern: 'manual_diff',
            evidence: 'Model used shell diff or Python difflib instead of agileagentcanvas_json_diff',
            suggestedTool: 'agileagentcanvas_json_diff',
            frequency: diffMatches.length,
        });
    }

    return detected;
}
