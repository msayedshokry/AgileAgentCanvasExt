import { createLogger } from '../utils/logger';
const logger = createLogger('antigravity-orchestrator');
import * as vscode from 'vscode';
import * as path from 'path';

import { schemaValidator } from '../state/schema-validator';
import { getPersonaForArtifactType, formatFullAgentForPrompt } from '../chat/agent-personas';

/**
 * AntiGravity Orchestrator
 *
 * Firebase Studio (internally "AntiGravity") is Google's cloud IDE built on Code OSS.
 * It does NOT expose the vscode.lm / vscode.chat APIs, so our extension cannot:
 *   - register a chat participant
 *   - register tools for Gemini to call
 *   - stream responses from Gemini
 *
 * What IS available:
 *   - `antigravity.sendPromptToAgentPanel` — sends a string prompt to the Gemini Agent
 *     panel, which has native file read/write capabilities
 *   - `antigravity.openAgent` — opens/focuses the agent panel
 *   - `antigravity.startNewConversation` — starts a fresh conversation
 *   - `antigravity.agentSidePanel.focus` — focuses the side panel
 *
 * Strategy:
 * 1. Write a comprehensive guide file to `.agileagentcanvas-context/.agileagentcanvas-guide.md`
 *    containing: workflow instructions, JSON schema, agent persona, current artifact
 *    content, output paths, and file-writing instructions.
 * 2. Send a SHORT prompt via `sendPromptToAgentPanel` instructing Gemini Agent to
 *    read the guide file at its absolute path and follow the instructions inside.
 * 3. Gemini Agent mode natively reads files, so it will open and follow the guide.
 * 4. When Gemini writes output files to `.agileagentcanvas-context/`, the file watcher
 *    in extension.ts auto-reloads the store (scheduleStoreReload).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execution hints from the workflow YAML `execution_hints` block.
 * These control whether the workflow should be interactive or autonomous.
 */
export interface ExecutionHints {
    /** true = collaborate with user, present checkpoints, wait for input */
    interactive?: boolean;
    /** true = proceed without user input unless blocked */
    autonomous?: boolean;
    /** true = build output incrementally */
    iterative?: boolean;
}

/**
 * Resolved execution mode derived from ExecutionHints + defaults.
 *
 *   'interactive' — Strong interactive framing: persona-first, STOP/WAIT rules,
 *                   task de-emphasized.  Used when execution_hints.interactive=true.
 *   'autonomous'  — Allow autonomous execution, minimal checkpoints,
 *                   task-forward structure.  Used when execution_hints.autonomous=true.
 *   'default'     — Follow BMAD workflow.xml rules: checkpoint at each
 *                   template-output, honor <ask> tags, but don't force
 *                   full interactive discovery.
 */
export type ExecutionMode = 'interactive' | 'autonomous' | 'default';

export interface AntigravityWorkflowParams {
    /** Absolute path to the BMAD resources directory */
    bmadPath: string;
    /** Absolute path to the project root */
    projectRoot: string;
    /** Absolute path to the output folder (e.g. .agileagentcanvas-context) */
    outputFolder: string;
    /** The task description (user-facing) */
    task: string;
    /** Current artifact object (or null for creation) */
    artifact: any;
    /** Absolute path to the workflow file (optional) */
    workflowPath?: string;
    /** Raw workflow file content (optional, loaded by caller) */
    workflowContent?: string;
    /** Output format setting */
    outputFormat?: 'json' | 'markdown' | 'dual';
    /** Execution hints from the workflow YAML (optional) */
    executionHints?: ExecutionHints;
    /**
     * Additional interaction rules extracted from the user's project-context.json
     * `content.additionalNotes` array. Injected into the guide for interactive/default
     * modes so Gemini honours project-level BMAD interaction rules.
     * Auto-populated by orchestrateAntigravityWorkflow() if not supplied.
     */
    projectContextNotes?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Guide file generation
// ─────────────────────────────────────────────────────────────────────────────

const GUIDE_FILENAME = '.agileagentcanvas-guide.md';

/**
 * Resolve execution mode from hints.
 *
 * Priority: explicit `interactive: true` → 'interactive',
 *           explicit `autonomous: true` → 'autonomous',
 *           otherwise → 'default' (follow workflow.xml checkpoint rules).
 */
export function resolveExecutionMode(hints?: ExecutionHints): ExecutionMode {
    if (!hints) return 'default';
    if (hints.interactive === true) return 'interactive';
    if (hints.autonomous === true) return 'autonomous';
    return 'default';
}

// ── Mode-specific instruction blocks ─────────────────────────────────────

/**
 * Strong interactive framing.
 * Used for discovery/planning workflows (product brief, use cases, risks, etc.).
 * Puts Gemini into facilitator/analyst mode BEFORE it sees the task.
 */
function interactiveExecutionBlock(): string {
    return `## YOUR ROLE: Interactive Facilitator

**You are a facilitator, NOT an autonomous executor.**

**CONSTRAINT: Do NOT produce a complete artifact or implementation plan.** Follow the BMAD
skill instructions for sequential step-by-step execution. Halt for user input at every step.

Before you do ANYTHING else, internalize these rules:

1. **NEVER produce a complete artifact in one go.** Work one section at a time, sequentially.
2. **At EVERY section boundary**, present what you've drafted, ask for feedback, and **STOP. HALT. WAIT for the user's response.**
3. **When a workflow step says "STOP and WAIT"** or uses \`<ask>\` tags, you MUST halt and wait for the user's response. Do NOT continue autonomously.
4. **Present checkpoint menus** exactly as defined in the workflow:
   \`[a] Advanced Elicitation  [c] Continue  [p] Party-Mode  [y] YOLO\`
   Halt for the user to choose before proceeding.
5. **Each \`<template-output>\` section**: Draft it → show it to the user → discuss → only proceed when the user explicitly says to continue.
6. **If the user hasn't responded**, do NOT assume approval. Ask a clarifying question and HALT.
7. **The only way to skip interaction** is if the user explicitly types "YOLO" or selects \`[y]\`.
8. **After presenting ANY question or draft**, STOP generating. Do not write another paragraph. Your message ends there.

This is a collaborative, interactive discovery conversation. The user's input shapes the artifact.
You are here to guide and facilitate, not to solve autonomously.

`;
}

/**
 * Autonomous execution framing.
 * Used for TEA workflows (test-design, test-review, trace) where the user
 * expects heads-down execution with minimal interruption.
 */
function autonomousExecutionBlock(): string {
    return `## Execution Mode: Autonomous

This workflow is designed for autonomous execution. Proceed efficiently:

1. **Read all required input files** (PRD, architecture docs, existing artifacts) upfront.
2. **Execute the workflow steps in order** without stopping for user confirmation at each step.
3. **Only stop to ask the user** if you are genuinely blocked (missing information, ambiguous requirement, conflicting data).
4. **Produce the complete output** when you finish all steps.
5. If the workflow has \`<ask>\` tags for genuinely missing data, ask — but for confirmations and checkpoint menus, skip them and continue.

The user expects a complete deliverable. Minimize interruptions.

`;
}

/**
 * Default execution framing.
 * Follows BMAD workflow.xml rules: checkpoint at each template-output,
 * honor <ask> tags, but doesn't force full interactive discovery.
 */
function defaultExecutionBlock(): string {
    return `## Execution Mode: Standard (Checkpoint-Based)

Follow the workflow files exactly, including checkpoint and pause instructions:

- When a workflow step says to present options or checkpoints, present them and STOP.
- When a workflow says "STOP and WAIT for user input", you MUST stop and wait.
- Each \`<template-output>\` section should be discussed with the user before proceeding.
- Honor all \`<ask>\` tags — prompt the user and wait for their response.
- Only proceed autonomously if the user explicitly chose YOLO mode.

`;
}

/**
 * Build the full guide-file content that Gemini Agent will read.
 *
 * This replaces the system prompt + tool definitions that would normally be
 * injected via the VS Code LM API.  Since Gemini Agent has native file
 * operations, we describe equivalent actions in plain language.
 *
 * The guide is **mode-aware**: interactive workflows get facilitator framing
 * (persona-first, STOP/WAIT emphasis, task de-emphasized), while autonomous
 * workflows get task-forward framing with minimal checkpoints.
 */
export function buildGuideContent(params: AntigravityWorkflowParams): string {
    const {
        bmadPath,
        projectRoot,
        outputFolder,
        task,
        artifact,
        workflowPath,
        workflowContent,
        outputFormat = 'dual',
        executionHints,
        projectContextNotes,
    } = params;

    const mode = resolveExecutionMode(executionHints);

    // ── Project-context interaction rules ─────────────────────────────────
    // If the user's project-context.json has additionalNotes (typically BMAD
    // Interaction Rules), surface them as a dedicated section in the guide.
    const interactionRulesSection = projectContextNotes && projectContextNotes.length > 0
        ? `## Project-Level Interaction Rules

The project's \`project-context.json\` defines these interaction rules. Honour them throughout this session:

${projectContextNotes.map(n => `- ${n}`).join('\n')}

`
        : '';

    // ── Agent persona ────────────────────────────────────────────────────
    const artifactType: string = artifact?.type || '';
    const persona = getPersonaForArtifactType(bmadPath, artifactType);
    const personaSection = persona
        ? formatFullAgentForPrompt(persona)
        : 'You are a BMAD methodology AI analyst. Execute the following task following BMAD quality standards.';

    // ── Schema ───────────────────────────────────────────────────────────
    if (bmadPath && !schemaValidator.isInitialized()) {
        try {
            schemaValidator.init(bmadPath);
        } catch (err: any) {
            logger.debug(
                `[antigravity-orchestrator] Schema validator init failed: ${err?.message ?? err}`
            );
        }
    }

    const schemaContent = artifactType
        ? schemaValidator.getSchemaContent(artifactType)
        : undefined;

    const schemaSection = schemaContent
        ? `## Artifact Schema -- STRICT

The artifact type \`${artifactType}\` MUST conform to the following JSON schema.
Your output MUST use ONLY the field names, types, and structures defined here.

\`\`\`json
${schemaContent}
\`\`\`

**Important:** Use exact field names (camelCase), respect enum values, and match array/object structures exactly.

`
        : '';

    // ── Output format instructions (mode-aware) ──────────────────────────
    const checkpointNote = mode === 'autonomous'
        ? ''
        : `\n\n**IMPORTANT:** If the workflow includes checkpoints or pause instructions, honor those FIRST.
Only produce the final output files after the user has confirmed they are satisfied, or when
the workflow explicitly says to produce the output. Do NOT skip checkpoints just to produce output.`;

    const outputFormatSection = `## Output Format: ${outputFormat}

${outputFormat === 'dual' || outputFormat === 'json'
        ? `### Saving the Artifact

When you have produced the artifact content (or a complete section of it), write it as a JSON file
to the output folder below. The JSON file must have \`metadata\` and \`content\` top-level keys.

**Output path for JSON:** \`${outputFolder}/\`
Name the file based on the artifact type and ID (e.g. \`product-vision.json\`, \`tech-spec.json\`).

Also write a companion Markdown (.md) file with the same base name that presents the artifact
content in a human-readable format.${checkpointNote}`
        : `Output should be written as Markdown (.md) files to: \`${outputFolder}/\``}

`;

    // ── Workflow instructions ────────────────────────────────────────────
    const workflowSection = workflowContent
        ? `## Workflow Instructions

${workflowContent}

`
        : '';

    // ── Variable substitution table ──────────────────────────────────────
    const varTable = `| Template Variable | Resolved Path |
|---|---|
| \`{project-root}\` | \`${projectRoot}\` |
| \`{bmad-path}\` | \`${bmadPath}\` |
| \`{output-folder}\` | \`${outputFolder}\` |`;

    // ── Mode-specific execution rules ────────────────────────────────────
    const executionBlock = mode === 'interactive'
        ? interactiveExecutionBlock()
        : mode === 'autonomous'
            ? autonomousExecutionBlock()
            : defaultExecutionBlock();

    // ── Output-section rules (mode-aware) ────────────────────────────────
    const outputRulesExtra = mode === 'autonomous'
        ? `- When all steps are complete, write the final JSON and Markdown files to the output folder`
        : mode === 'interactive'
            ? `- Do NOT write output files until the user has confirmed they are satisfied with the content
- Do NOT skip workflow checkpoints or pause instructions just to produce output files`
            : (outputFormat === 'dual' || outputFormat === 'json')
                ? `- When content is finalized and the user has confirmed (or YOLO mode is active), write the complete JSON and Markdown files to the output folder
- Do NOT skip workflow checkpoints or pause instructions just to produce output files`
                : '';

    // ── Assemble the guide ───────────────────────────────────────────────
    // For interactive mode: persona → execution rules → framework context → task (de-emphasized)
    // For autonomous mode:  execution rules → task (prominent) → framework context → persona
    // For default mode:     persona → execution rules → task → framework context

    if (mode === 'interactive') {
        // Interactive: PERSONA FIRST, then execution rules, then context, task last
        return `# AgileAgentCanvas Workflow Guide

> **This file was auto-generated by the AgileAgentCanvas extension.**
> Read and follow these instructions carefully.

---

${personaSection}

Always respond in English.

${executionBlock}${interactionRulesSection}## Execution Context

You are executing a specific workflow task for the AgileAgentCanvas VS Code extension.
Skip any activation menu -- the user has already selected a specific workflow.
Go directly to the workflow instructions below.

## BMAD Framework

The complete BMAD framework is at: \`${bmadPath}\`
Project root: \`${projectRoot}\`
Output folder: \`${outputFolder}\`

## Path Variable Substitution

Workflow files may contain template variables. Resolve them using this table:

${varTable}

## File Operations

You have native file read/write capabilities in this environment. Use them as follows:

- **Read files** from \`${bmadPath}\` to access schemas, workflow steps, and agent definitions
- **Read files** from \`${projectRoot}\` to access project source code
- **Write output files** to \`${outputFolder}/\` -- this is where artifacts are persisted
- **Read the schema** at \`${bmadPath}/schemas/\` for validation reference
- When a workflow step references a file path with template variables, resolve the variables
  using the table above before reading the file

${schemaSection}${outputFormatSection}${workflowSection}## Current Artifact

${artifact ? '```json\n' + JSON.stringify(artifact, null, 2) + '\n```' : '(none -- this is a new artifact creation task)'}

## Task

${task}

## Rules

- Always resolve template variables in file paths before accessing files
- Never invent schema fields, workflow steps, or agent personas -- read them from the BMAD framework files
- Follow the workflow steps in order; read each step file before acting on it
- Write output files to \`${outputFolder}/\` in the format specified above
- Your artifact output MUST conform exactly to the schema -- use only defined field names, types, and enum values
${outputRulesExtra}

## CRITICAL -- BMAD Grounding Rule

- Never invent workflow steps, agent personas, or schema fields
- Only reference actual artifacts that exist under the BMAD installation path: \`${bmadPath}\`
- When suggesting follow-on workflows, cite the exact file path
- All JSON output must conform to the schemas found in \`${bmadPath}/schemas/\`

## REMINDER

You are in **interactive facilitator mode**. Work collaboratively. **HALT** at every checkpoint.
**Do NOT proceed past a question or draft — stop generating and wait for the user's response.**
`;
    }

    if (mode === 'autonomous') {
        // Autonomous: execution rules + task FIRST, then context + persona
        return `# AgileAgentCanvas Workflow Guide

> **This file was auto-generated by the AgileAgentCanvas extension.**
> Read and follow these instructions to execute the requested BMAD workflow.

---

${executionBlock}## Task

${task}

## Current Artifact

${artifact ? '```json\n' + JSON.stringify(artifact, null, 2) + '\n```' : '(none -- this is a new artifact creation task)'}

${personaSection}

Always respond in English.

## BMAD Framework

The complete BMAD framework is at: \`${bmadPath}\`
Project root: \`${projectRoot}\`
Output folder: \`${outputFolder}\`

## Path Variable Substitution

Workflow files may contain template variables. Resolve them using this table:

${varTable}

## File Operations

You have native file read/write capabilities in this environment. Use them as follows:

- **Read files** from \`${bmadPath}\` to access schemas, workflow steps, and agent definitions
- **Read files** from \`${projectRoot}\` to access project source code
- **Write output files** to \`${outputFolder}/\` -- this is where artifacts are persisted
- **Read the schema** at \`${bmadPath}/schemas/\` for validation reference
- When a workflow step references a file path with template variables, resolve the variables
  using the table above before reading the file

${schemaSection}${outputFormatSection}${workflowSection}## Rules

- Always resolve template variables in file paths before accessing files
- Never invent schema fields, workflow steps, or agent personas -- read them from the BMAD framework files
- Follow the workflow steps in order; read each step file before acting on it
- Write output files to \`${outputFolder}/\` in the format specified above
- Your artifact output MUST conform exactly to the schema -- use only defined field names, types, and enum values
${outputRulesExtra}

## CRITICAL -- BMAD Grounding Rule

- Never invent workflow steps, agent personas, or schema fields
- Only reference actual artifacts that exist under the BMAD installation path: \`${bmadPath}\`
- When suggesting follow-on workflows, cite the exact file path
- All JSON output must conform to the schemas found in \`${bmadPath}/schemas/\`
`;
    }

    // Default: persona → execution rules → task → context
    return `# AgileAgentCanvas Workflow Guide

> **This file was auto-generated by the AgileAgentCanvas extension.**
> Read and follow these instructions to execute the requested BMAD workflow.

---

${personaSection}

Always respond in English.

${executionBlock}${interactionRulesSection}## Execution Context

You are executing a specific workflow task for the AgileAgentCanvas VS Code extension.
Skip any activation menu -- the user has already selected a specific workflow.
Go directly to the workflow instructions below.

## BMAD Framework

The complete BMAD framework is at: \`${bmadPath}\`
Project root: \`${projectRoot}\`
Output folder: \`${outputFolder}\`

## Path Variable Substitution

Workflow files may contain template variables. Resolve them using this table:

${varTable}

## File Operations

You have native file read/write capabilities in this environment. Use them as follows:

- **Read files** from \`${bmadPath}\` to access schemas, workflow steps, and agent definitions
- **Read files** from \`${projectRoot}\` to access project source code
- **Write output files** to \`${outputFolder}/\` -- this is where artifacts are persisted
- **Read the schema** at \`${bmadPath}/schemas/\` for validation reference
- When a workflow step references a file path with template variables, resolve the variables
  using the table above before reading the file

${schemaSection}${outputFormatSection}${workflowSection}## Current Artifact

${artifact ? '```json\n' + JSON.stringify(artifact, null, 2) + '\n```' : '(none -- this is a new artifact creation task)'}

## Task

${task}

## Rules

- Always resolve template variables in file paths before accessing files
- Never invent schema fields, workflow steps, or agent personas -- read them from the BMAD framework files
- Follow the workflow steps in order; read each step file before acting on it
- Write output files to \`${outputFolder}/\` in the format specified above
- Your artifact output MUST conform exactly to the schema -- use only defined field names, types, and enum values
${outputRulesExtra}

## CRITICAL -- BMAD Grounding Rule

- Never invent workflow steps, agent personas, or schema fields
- Only reference actual artifacts that exist under the BMAD installation path: \`${bmadPath}\`
- When suggesting follow-on workflows, cite the exact file path
- All JSON output must conform to the schemas found in \`${bmadPath}/schemas/\`
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration: write guide + send prompt + focus agent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether the AntiGravity Agent Panel command is available.
 * This is a more targeted check than the legacy sendTextToChat sentinel.
 */
export async function isAntigravityAgentAvailable(): Promise<boolean> {
    try {
        const all = await vscode.commands.getCommands(false);
        return all.includes('antigravity.sendPromptToAgentPanel');
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Project-context notes loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try to load `additionalNotes` from a `project-context.json` file
 * in the given folder.  Returns the string[] or an empty array.
 * Fails silently — missing/malformed files simply return [].
 */
async function loadProjectContextNotes(outputFolder: string): Promise<string[]> {
    try {
        const pcPath = path.join(outputFolder, 'project-context.json');
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(pcPath));
        const parsed = JSON.parse(Buffer.from(raw).toString('utf-8'));
        const notes: unknown = parsed?.content?.additionalNotes;
        if (Array.isArray(notes) && notes.length > 0 && notes.every((n: unknown) => typeof n === 'string')) {
            logger.debug(
                `[antigravity-orchestrator] Loaded ${notes.length} projectContextNotes from project-context.json`
            );
            return notes as string[];
        }
    } catch {
        // File doesn't exist or is malformed — that's fine
    }
    return [];
}

/**
 * Full AntiGravity orchestration entry point.
 *
 * 1. Writes the guide file to disk
 * 2. Sends a short prompt via `sendPromptToAgentPanel` pointing Gemini to the guide
 * 3. Focuses the agent panel
 *
 * @returns true if the prompt was sent successfully, false on error
 */
export async function orchestrateAntigravityWorkflow(
    params: AntigravityWorkflowParams,
    stream?: vscode.ChatResponseStream
): Promise<boolean> {
    const { outputFolder, executionHints } = params;
    const mode = resolveExecutionMode(executionHints);

    logger.debug(
        `[antigravity-orchestrator] Execution mode: ${mode}` +
        (executionHints ? ` (hints: interactive=${executionHints.interactive}, autonomous=${executionHints.autonomous})` : ' (no hints)')
    );

    // ── 1. Build and write the guide file ────────────────────────────────

    // Auto-populate projectContextNotes if not provided by the caller.
    // Look for project-context.json in the output folder and extract additionalNotes.
    if (!params.projectContextNotes) {
        params = { ...params, projectContextNotes: await loadProjectContextNotes(outputFolder) };
    }

    const guideContent = buildGuideContent(params);
    const guidePath = path.join(outputFolder, GUIDE_FILENAME);
    const guideUri = vscode.Uri.file(guidePath);

    try {
        // Ensure the output folder exists
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(outputFolder));
        // Write the guide file
        await vscode.workspace.fs.writeFile(guideUri, Buffer.from(guideContent, 'utf-8'));
        logger.debug(`[antigravity-orchestrator] Guide file written: ${guidePath}`);
    } catch (err: any) {
        const msg = `Failed to write guide file: ${err?.message ?? err}`;
        logger.debug(`[antigravity-orchestrator] ${msg}`);
        stream?.markdown(`**AntiGravity error:** ${msg}\n`);
        return false;
    }

    // ── 2. Build and send the pointer prompt ─────────────────────────────
    // Keep this SHORT -- Gemini Agent will read the full instructions from the file.
    const pointerPrompt = buildPointerPrompt(guidePath, params);

    try {
        await vscode.commands.executeCommand(
            'antigravity.sendPromptToAgentPanel',
            pointerPrompt
        );
        logger.debug('[antigravity-orchestrator] Prompt sent to Agent Panel');
    } catch (err: any) {
        // Fallback: try the legacy sendTextToChat command
        logger.debug(
            `[antigravity-orchestrator] sendPromptToAgentPanel failed: ${err?.message ?? err} -- trying sendTextToChat`
        );
        try {
            await vscode.commands.executeCommand(
                'antigravity.sendTextToChat',
                true,
                pointerPrompt
            );
            logger.debug('[antigravity-orchestrator] Fallback sendTextToChat succeeded');
        } catch (err2: any) {
            const msg = `Could not send prompt to AntiGravity: ${err2?.message ?? err2}`;
            logger.debug(`[antigravity-orchestrator] ${msg}`);
            stream?.markdown(`**AntiGravity error:** ${msg}\n`);
            return false;
        }
    }

    // ── 3. Agent panel focus ────────────────────────────────────────────
    // NOTE: sendPromptToAgentPanel already opens and focuses the agent panel.
    // Calling openAgent again can toggle/collapse it, so we skip it.
    // If only the fallback sendTextToChat was used, the panel may not be open,
    // but that path is rare and we prefer not to risk collapsing.
    logger.debug('[antigravity-orchestrator] Prompt sent — skipping explicit focus (sendPromptToAgentPanel self-focuses)');

    // ── 4. Inform the user (mode-aware) ──────────────────────────────────
    if (stream) {
        const modeLabel = mode === 'interactive' ? 'interactive (collaborative)'
            : mode === 'autonomous' ? 'autonomous (heads-down)'
            : 'standard (checkpoint-based)';
        const modeAdvice = mode === 'interactive'
            ? '> The agent will work with you section by section — respond to its questions to shape the output.\n'
            : mode === 'autonomous'
                ? '> The agent will execute the workflow autonomously and produce the complete output.\n'
                : '> The agent will follow workflow checkpoints — respond when it pauses for input.\n';
        stream.markdown(
            `> **Firebase Studio mode:** The workflow has been sent to the Gemini Agent panel.\n` +
            `> Execution mode: **${modeLabel}**\n` +
            `> Guide file: \`${guidePath}\`\n\n` +
            modeAdvice +
            '> When the agent writes output files, AgileAgentCanvas will automatically detect and load them.\n\n'
        );
    }

    return true;
}

/**
 * Build the short pointer prompt that tells Gemini Agent where to find
 * the full workflow instructions.
 *
 * This is deliberately concise -- the guide file has everything.
 * The prompt is **mode-aware**: for interactive workflows we prime Gemini
 * into facilitator mode *before* revealing the task, so it doesn't latch
 * onto the task and go autonomous.  For autonomous workflows we lead with
 * the task to align with Agent mode's natural bias.
 */
function buildPointerPrompt(guidePath: string, params: AntigravityWorkflowParams): string {
    const { task, artifact, workflowPath, executionHints } = params;
    const workflowName = workflowPath ? path.basename(path.dirname(workflowPath)) : '';
    const mode = resolveExecutionMode(executionHints);

    // Use forward slashes for consistency (Gemini runs on Linux in Firebase Studio)
    const normalizedGuidePath = guidePath.replace(/\\/g, '/');

    if (mode === 'interactive') {
        // Interactive: prime facilitator mode FIRST, task second.
        // Uses explicit "interactive" / "halt for input" keywords that Gemini
        // recognises as interactivity signals in Firebase Studio Agent mode.
        const skillRef = workflowName
            ? `\nExecute the \`${workflowName}\` skill protocol. Start with Step 1 and **halt for my input** before proceeding to Step 2.`
            : '';
        return `Run the **interactive** BMAD workflow below as a collaborative facilitator. **Halt for input** at every step.

**Do NOT produce a complete artifact or implementation plan.** Follow the BMAD skill instructions
for sequential step-by-step execution. After each step, stop and wait for my response.

**Full instructions are in this file — please read it first:**
\`${normalizedGuidePath}\`

Read that file now. You'll find detailed interactive facilitation rules inside.${skillRef}
${artifact?.type ? `\n**Artifact type:** ${artifact.type}` : ''}
**Task:** ${task}

Begin with the first step only. Present your draft and **halt for my input**.`;
    }

    if (mode === 'autonomous') {
        // Autonomous: task-forward, minimal ceremony
        return `Execute this BMAD methodology workflow for me.

**Task:** ${task}
${workflowName ? `**Workflow:** ${workflowName}\n` : ''}${artifact?.type ? `**Artifact type:** ${artifact.type}\n` : ''}
**Full instructions are in this file — please read it first:**
\`${normalizedGuidePath}\`

Read that file and execute the workflow steps. Produce the complete output when done.
Only ask me questions if you are genuinely blocked on missing information.`;
    }

    // Default: balanced prompt
    return `I need you to execute a BMAD methodology workflow for me.

**Task:** ${task}
${workflowName ? `**Workflow:** ${workflowName}\n` : ''}${artifact?.type ? `**Artifact type:** ${artifact.type}\n` : ''}
**Full instructions are in this file -- please read it first:**
\`${normalizedGuidePath}\`

Read that file now, then follow the instructions inside it step by step.
Honor all checkpoints and pause instructions in the workflow.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple prompt orchestration (for non-workflow sends, e.g. chat bridge)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a simple prompt to AntiGravity without the full guide-file workflow.
 * Used by chat-bridge.ts for ad-hoc chat messages.
 *
 * Tries `sendPromptToAgentPanel` first, falls back to `sendTextToChat`.
 *
 * @returns true if prompt was sent, false on error
 */
export async function sendSimplePrompt(prompt: string): Promise<boolean> {
    try {
        await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', prompt);
        logger.debug('[antigravity-orchestrator] Simple prompt sent via sendPromptToAgentPanel');
        return true;
    } catch {
        try {
            await vscode.commands.executeCommand('antigravity.sendTextToChat', true, prompt);
            logger.debug('[antigravity-orchestrator] Simple prompt sent via sendTextToChat (fallback)');
            return true;
        } catch (err: any) {
            logger.debug(
                `[antigravity-orchestrator] Simple prompt failed: ${err?.message ?? err}`
            );
            return false;
        }
    }
}
