import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ArtifactStore } from '../state/artifact-store';
import { BMAD_RESOURCE_DIR } from '../state/constants';
import { sendArtifactsToPanel } from '../canvas/artifact-transformer';
import { acOutput } from '../extension';
import { openChat } from './chat-bridge';

/**
 * Handle adding a new artifact from the canvas toolbar.
 * Creates the artifact, selects it, and tells the canvas to open it in edit mode.
 */
export async function handleAddArtifact(
    artifactType: string,
    panel: vscode.WebviewPanel,
    store: ArtifactStore,
    parentId?: string
): Promise<void> {
    acOutput.appendLine(`[Extension] handleAddArtifact called for type: ${artifactType}`);

    let newArtifactId: string;
    let newArtifactType: string = artifactType;

    try {
        switch (artifactType) {
            case 'product-brief': {
                const newBrief = store.createProductBrief();
                newArtifactId = newBrief.id;
                break;
            }
            case 'prd': {
                const newPRD = store.createPRD();
                newArtifactId = newPRD.id;
                break;
            }
            case 'architecture': {
                const newArch = store.createArchitecture();
                newArtifactId = newArch.id;
                break;
            }
            case 'epic': {
                const newEpic = store.createEpic();
                newArtifactId = newEpic.id;
                break;
            }
            case 'story': {
                // Prefer explicit parentId arg; fall back to canvas selection
                const epicIdForStory = parentId ?? (store.getSelectedArtifact()?.type === 'epic' ? store.getSelectedArtifact()!.id : undefined);
                const newStory = store.createStory(epicIdForStory);
                newArtifactId = newStory.id;
                break;
            }
            case 'requirement': {
                const newReq = store.createRequirement();
                newArtifactId = newReq.id;
                break;
            }
            case 'vision': {
                store.createOrUpdateVision();
                newArtifactId = 'vision-1';
                break;
            }
            case 'use-case': {
                // Prefer explicit parentId arg; fall back to canvas selection
                const epicIdForUC = parentId ?? (store.getSelectedArtifact()?.type === 'epic' ? store.getSelectedArtifact()!.id : undefined);
                const newUseCase = store.createUseCase(epicIdForUC);
                newArtifactId = newUseCase.id;
                break;
            }
            case 'test-case': {
                // Prefer explicit parentId; fall back to selected story, then selected epic
                const selected = store.getSelectedArtifact();
                const storyIdForTC = parentId ?? (selected?.type === 'story' ? selected.id : undefined);
                const epicIdForTC = storyIdForTC ? undefined : (selected?.type === 'epic' ? selected.id : undefined);
                const newTC = store.createTestCase(storyIdForTC, epicIdForTC);
                newArtifactId = newTC.id;
                break;
            }
            case 'test-strategy': {
                // Prefer explicit parentId; fall back to selected epic
                const selected2 = store.getSelectedArtifact();
                const epicIdForTS = parentId ?? (selected2?.type === 'epic' ? selected2.id : undefined);
                const newTS = store.createTestStrategy(epicIdForTS);
                newArtifactId = newTS.id;
                break;
            }
            default:
                acOutput.appendLine(`[Extension] Unknown artifact type: ${artifactType}`);
                vscode.window.showWarningMessage(`Cannot create artifact of type: ${artifactType}`);
                return;
        }

        store.setSelectedArtifact(newArtifactType, newArtifactId);

        sendArtifactsToPanel(panel, store);

        panel.webview.postMessage({
            type: 'selectAndEdit',
            id: newArtifactId,
            artifactType: newArtifactType
        });

        acOutput.appendLine(`[Extension] Created and selected: ${newArtifactType} ${newArtifactId}`);

    } catch (error) {
        acOutput.appendLine(`[Extension] Error creating artifact: ${error}`);
        vscode.window.showErrorMessage(`Failed to create ${artifactType}: ${error}`);
    }
}

export async function handleAIAction(
    action: string,
    context: any,
    panel: vscode.WebviewPanel,
    store: ArtifactStore
): Promise<void> {
    const artifact = context?.artifact;
    if (!artifact) {
        acOutput.appendLine(`[Extension] handleAIAction: no artifact in context for action "${action}"`);
        return;
    }

    acOutput.appendLine(`[Extension] handleAIAction: action="${action}" artifact="${artifact.id}"`);

    // Route to the appropriate AI command based on the requested action
    switch (action) {
        case 'breakdown':
        case 'break-down':
        case 'breakDown':
            await breakDownArtifact(artifact, store);
            break;
        case 'enhance':
        case 'enhanceWithAI':
            await enhanceArtifactWithAI(artifact, store);
            break;
        case 'refine':
        case 'refineWithAI':
        default:
            await refineArtifactWithAI(artifact, store);
            break;
    }
}

/**
 * Static workflow labels per artifact type.
 * The `label` values are used as the workflow selector in the chat command
 * (e.g. `@agileagentcanvas /refine TC-2 Test Design`) and MUST match the `name` field
 * returned by `getAvailableWorkflows()` in workflow-executor.ts.
 * Keep in sync with getAvailableWorkflows() whenever workflows are added/reordered.
 */
const REFINE_WORKFLOWS: Record<string, { label: string; description: string }[]> = {
    'vision': [
        { label: 'Validate PRD',  description: 'Validate against BMAD standards' },
        { label: 'Edit PRD',      description: 'Edit and improve PRD' },
    ],
    'prd': [
        { label: 'Validate PRD',  description: 'Validate against BMAD standards' },
        { label: 'Edit PRD',      description: 'Edit and improve PRD' },
    ],
    'requirement': [
        { label: 'Validate Requirement',          description: 'Validate quality and completeness of this requirement' },
        { label: 'Refine Requirement',            description: 'Improve clarity, detail and measurability' },
        { label: 'Check Implementation Readiness', description: 'Validate mapping to epics and stories' },
    ],
    'epic': [
        { label: 'Epic Enhancement',              description: 'Add use cases, risks, DoD, metrics' },
        { label: 'Check Implementation Readiness', description: 'Verify epic is ready for development' },
        { label: 'Create Use Cases',              description: 'Define detailed use cases for this epic' },
        { label: 'Create Risks',                  description: 'Identify and document risks' },
    ],
    'story': [
        { label: 'Story Enhancement',   description: 'Add technical details, tests, edge cases, dependencies, risks, DoD' },
        { label: 'Story Quality Review', description: 'Validate story context for dev agent' },
        { label: 'Dev Story Checklist',  description: 'Verify story is implementation-ready' },
        { label: 'Test Design',          description: 'Design test strategy and cases for this story' },
    ],
    'architecture': [
        { label: 'Refine Architecture', description: 'Review and improve architecture design' },
        { label: 'NFR Assessment',      description: 'Assess non-functional requirements' },
    ],
    'product-brief': [
        { label: 'Refine Product Brief', description: 'Improve product brief clarity and completeness' },
        { label: 'Validate Product Brief', description: 'Validate against BMAD standards' },
    ],
    'use-case': [
        { label: 'Refine Use Case',    description: 'Improve use case detail, actors, and flow' },
        { label: 'Enhance Parent Epic', description: 'Enhance the parent epic this use case belongs to' },
    ],
    'test-case': [
        { label: 'Test Design',         description: 'Design or refine test steps and expected results' },
        { label: 'Test Review',         description: 'Review test case quality and completeness' },
        { label: 'Generate BDD Steps',  description: 'Generate Gherkin Given/When/Then steps' },
    ],
    'test-strategy': [
        { label: 'Test Design',         description: 'Develop overall test strategy and coverage plan' },
        { label: 'Test Review',         description: 'Review and validate test strategy' },
        { label: 'NFR Assessment',      description: 'Assess non-functional testing requirements' },
    ],
    'test-design': [
        { label: 'Test Design',         description: 'Refine or extend test design coverage plan' },
        { label: 'Test Review',         description: 'Review test design quality and completeness' },
        { label: 'Generate BDD Steps',  description: 'Generate Gherkin Given/When/Then steps' },
        { label: 'Traceability Matrix', description: 'Generate traceability between tests and requirements' },
    ],
    'risk': [
        { label: 'Refine Risk',                    description: 'Improve risk detail, mitigation, and assessment' },
        { label: 'Check Implementation Readiness',  description: 'Validate risk mitigation readiness' },
    ],
    'nfr': [
        { label: 'NFR Assessment',       description: 'Deep-dive assessment of non-functional requirements' },
        { label: 'Refine Requirement',    description: 'Improve NFR clarity and measurability' },
    ],
    'additional-req': [
        { label: 'Validate Requirement', description: 'Validate quality and completeness' },
        { label: 'Refine Requirement',   description: 'Improve clarity, detail and measurability' },
    ],
    'architecture-decision': [
        { label: 'Refine Architecture',  description: 'Review and improve this architecture decision' },
        { label: 'NFR Assessment',       description: 'Assess non-functional impact of this decision' },
    ],
    'system-component': [
        { label: 'Refine Architecture',  description: 'Review and improve component design' },
        { label: 'NFR Assessment',       description: 'Assess non-functional requirements for this component' },
    ],
    'task': [
        { label: 'Story Enhancement',    description: 'Add technical details, edge cases, dependencies' },
        { label: 'Dev Story Checklist',  description: 'Verify task is implementation-ready' },
    ],

    // ── TC Redesign: consolidated test-coverage card ──
    'test-coverage': [
        { label: 'Test Design',         description: 'Refine or extend test coverage plan' },
        { label: 'Test Review',         description: 'Review test coverage quality and completeness' },
        { label: 'Generate BDD Steps',  description: 'Generate Gherkin Given/When/Then steps' },
        { label: 'Traceability Matrix', description: 'Generate traceability between tests and requirements' },
    ],

    // ── Plural aliases (match singular entries) ──
    'test-cases': [
        { label: 'Test Design',         description: 'Design or refine test steps and expected results' },
        { label: 'Test Review',         description: 'Review test case quality and completeness' },
        { label: 'Generate BDD Steps',  description: 'Generate Gherkin Given/When/Then steps' },
    ],
    'risks': [
        { label: 'Refine Risk',                    description: 'Improve risk detail, mitigation, and assessment' },
        { label: 'Check Implementation Readiness',  description: 'Validate risk mitigation readiness' },
    ],

    // ── TEA output artifacts ──
    'test-design-qa': [
        { label: 'Test Design',         description: 'Refine QA-focused test design' },
        { label: 'Test Review',         description: 'Review QA test design quality' },
    ],
    'test-design-architecture': [
        { label: 'Test Design',         description: 'Refine architecture testability assessment' },
        { label: 'Refine Architecture', description: 'Review architecture from testability perspective' },
    ],
    'test-review': [
        { label: 'Test Design',         description: 'Iterate on test design based on review findings' },
        { label: 'Traceability Matrix', description: 'Generate traceability between tests and requirements' },
    ],
    'traceability-matrix': [
        { label: 'Traceability Matrix', description: 'Update and extend requirement-test traceability' },
        { label: 'Test Review',         description: 'Review traceability coverage gaps' },
    ],
    'nfr-assessment': [
        { label: 'NFR Assessment',      description: 'Deep-dive reassessment of non-functional requirements' },
        { label: 'Refine Architecture', description: 'Improve architecture based on NFR findings' },
    ],
    'test-framework': [
        { label: 'Test Framework',      description: 'Refine test framework setup and configuration' },
        { label: 'Test Design',         description: 'Design tests using the framework' },
    ],
    'ci-pipeline': [
        { label: 'CI Pipeline',         description: 'Refine CI/CD pipeline configuration' },
        { label: 'Test Automation',     description: 'Automate tests in the CI pipeline' },
    ],
    'automation-summary': [
        { label: 'Test Automation',     description: 'Extend or refine test automation coverage' },
        { label: 'CI Pipeline',         description: 'Integrate automation into CI pipeline' },
    ],
    'atdd-checklist': [
        { label: 'Generate BDD Steps',  description: 'Refine ATDD/BDD acceptance criteria' },
        { label: 'Test Design',         description: 'Design tests from acceptance criteria' },
    ],

    // ── BMM primary artifacts ──
    'research': [
        { label: 'Domain Research',     description: 'Research domain-specific knowledge and best practices' },
        { label: 'Market Research',     description: 'Analyze market landscape and competitive positioning' },
        { label: 'Technical Research',  description: 'Research technical feasibility and implementation options' },
    ],
    'ux-design': [
        { label: 'Refine UX Design',   description: 'Improve UX design, flows, and interaction patterns' },
    ],
    'tech-spec': [
        { label: 'Refine Architecture', description: 'Review and improve technical specification' },
        { label: 'NFR Assessment',      description: 'Assess non-functional requirements for the spec' },
    ],
    'definition-of-done': [
        { label: 'Definition of Done',  description: 'Refine and validate definition of done criteria' },
    ],

    // ── BMM output artifacts ──
    'readiness-report': [
        { label: 'Check Implementation Readiness', description: 'Re-evaluate implementation readiness' },
    ],
    'sprint-status': [
        { label: 'Sprint Status',       description: 'Update and refine sprint status report' },
    ],
    'retrospective': [
        { label: 'Retrospective',       description: 'Facilitate or refine sprint retrospective' },
    ],
    'change-proposal': [
        { label: 'Course Correction',   description: 'Refine change proposal and impact analysis' },
    ],
    'code-review': [
        { label: 'Code Review',         description: 'Review code changes for quality and standards' },
    ],
    'test-summary': [
        { label: 'Test Review',         description: 'Review test summary completeness' },
        { label: 'Test Design',         description: 'Design additional tests based on summary gaps' },
    ],
    'project-overview': [
        { label: 'Brainstorming',       description: 'Explore and expand project overview' },
    ],
    'project-context': [
        { label: 'Brainstorming',       description: 'Explore and refine project context' },
    ],

    // ── CIS module artifacts ──
    'storytelling': [
        { label: 'Storytelling',        description: 'Refine narrative structure and storytelling approach' },
    ],
    'problem-solving': [
        { label: 'Problem Solving',     description: 'Apply structured problem-solving methodology' },
    ],
    'innovation-strategy': [
        { label: 'Innovation Strategy', description: 'Refine innovation strategy and opportunity analysis' },
    ],
    'design-thinking': [
        { label: 'Design Thinking',     description: 'Iterate on design thinking process and outputs' },
    ],
};

/**
 * Show a quick-pick of available refinement workflows for the given artifact type.
 * Returns the workflow label (used as the selector in the chat command), or null
 * if the user cancelled or no workflows are available.
 */
async function showWorkflowPicker(artifact: any): Promise<string | null> {
    const workflows = REFINE_WORKFLOWS[artifact.type];

    // If no curated list for this type, fall back to running the default (no selector)
    if (!workflows || workflows.length === 0) {
        return null;
    }

    // If there is only one workflow, skip the picker and run it directly
    if (workflows.length === 1) {
        return workflows[0].label;
    }

    const items: vscode.QuickPickItem[] = workflows.map((w, i) => ({
        label: w.label,
        description: w.description,
        detail: `Workflow ${i + 1} of ${workflows.length}`,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Choose a refinement workflow for ${artifact.title || artifact.id}`,
        title: 'Agile Agent Canvas Refine: Select Workflow',
    });

    if (!picked) {
        return null; // user cancelled
    }

    return picked.label;
}

/**
 * Refine an artifact with AI assistance via Copilot Chat.
 * Shows a workflow picker first, then sends @agileagentcanvas /refine <id> <workflow-name> directly.
 */
export async function refineArtifactWithAI(artifact: any, store: ArtifactStore): Promise<void> {
    store.setRefineContext(artifact);

    // Show workflow picker — returns the workflow label or null (cancelled / default)
    const workflowName = await showWorkflowPicker(artifact);

    if (workflowName === null && REFINE_WORKFLOWS[artifact.type]?.length > 0) {
        // User cancelled the picker — do nothing
        acOutput.appendLine(`[Extension] Refine cancelled by user for ${artifact.id}`);
        return;
    }

    const refineCommand = workflowName
        ? `@agileagentcanvas /refine ${artifact.id} ${workflowName}`
        : `@agileagentcanvas /refine ${artifact.id}`;

    try {
        await openChat(refineCommand);
        vscode.window.setStatusBarMessage(`Refining ${artifact.title || artifact.productName || artifact.id} with BMAD workflow…`, 5000);
    } catch (error) {
        acOutput.appendLine(`[Extension] Error opening chat: ${error}`);
    }
}

/**
 * Development-phase workflow labels per artifact type.
 * These are shown in the "Start Dev" picker and MUST match the `name` field
 * returned by `getAvailableWorkflows()` in workflow-executor.ts.
 */
const DEV_WORKFLOWS: Record<string, { label: string; description: string }[]> = {
    'story': [
        { label: 'Dev Story',                    description: 'Execute story development with AI guidance' },
        { label: 'Dev Story Checklist',           description: 'Verify story is implementation-ready' },
        { label: 'Code Review',                   description: 'Review code changes for quality' },
    ],
    'epic': [
        { label: 'Check Implementation Readiness', description: 'Verify epic is ready for development' },
        { label: 'Sprint Planning',               description: 'Plan sprint with story selection and capacity' },
    ],
    'test-case': [
        { label: 'Test Design',                   description: 'Design or refine test steps and expected results' },
        { label: 'Generate BDD Steps',            description: 'Generate Gherkin Given/When/Then steps' },
    ],
};

/**
 * Start development for an artifact via Copilot Chat.
 * Shows a dev-workflow picker, then sends @agileagentcanvas /dev <id> <workflow-name>.
 */
export async function startDevelopment(artifact: any, store: ArtifactStore): Promise<void> {
    acOutput.appendLine(`[StartDev] ENTERED — artifact.id=${artifact?.id}, artifact.type=${artifact?.type}, source=${(artifact as any)?.source || 'n/a'}`);

    try {
        store.setRefineContext(artifact);

        const workflows = DEV_WORKFLOWS[artifact.type];
        acOutput.appendLine(`[StartDev] workflows for type "${artifact.type}": ${workflows ? workflows.length : 'none'}`);

        if (!workflows || workflows.length === 0) {
            const msg = `No development workflows available for type "${artifact.type}".`;
            acOutput.appendLine(`[StartDev] ${msg}`);
            vscode.window.showWarningMessage(msg);
            return;
        }

        // NOTE: QuickPick has been unreliable in some IDE shells. To ensure Start Dev
        // always does something, we currently auto-select the first workflow.
        const workflowName = workflows[0].label;
        acOutput.appendLine(`[StartDev] auto-selecting workflow: "${workflowName}"`);

        const devCommand = `@agileagentcanvas /dev ${artifact.id} ${workflowName}`;
        acOutput.appendLine(`[StartDev] opening chat with command: "${devCommand}"`);

        const chatOk = await openChat(devCommand);
        acOutput.appendLine(`[StartDev] openChat returned: ${chatOk}`);
        vscode.window.setStatusBarMessage(`Starting development: ${artifact.title || artifact.id} — ${workflowName}`, 5000);
    } catch (error) {
        const errMsg = `Start Dev failed: ${error}`;
        acOutput.appendLine(`[StartDev] ERROR: ${errMsg}`);
        vscode.window.showErrorMessage(errMsg);
    }
}

/**
 * Open the /write-doc command in chat, pre-seeded with artifact context.
 *
 * Constructs a prompt that tells the Tech Writer agent what artifact
 * the user wants documented, then opens chat with `@agileagentcanvas /write-doc <prompt>`.
 */
export async function startDocumentation(artifact: any, _store: ArtifactStore): Promise<void> {
    acOutput.appendLine(`[StartDoc] ENTERED — artifact.id=${artifact?.id}, artifact.type=${artifact?.type}`);

    try {
        const typeLabel = artifact.type?.replace(/-/g, ' ') || 'artifact';
        const title = artifact.title || artifact.id || 'untitled';
        const description = artifact.description ? ` — ${artifact.description}` : '';

        const docPrompt = `Document the ${typeLabel} "${title}"${description}`;
        const docCommand = `@agileagentcanvas /write-doc ${docPrompt}`;

        acOutput.appendLine(`[StartDoc] opening chat with command: "${docCommand}"`);
        const chatOk = await openChat(docCommand);
        acOutput.appendLine(`[StartDoc] openChat returned: ${chatOk}`);
        vscode.window.setStatusBarMessage(`Writing documentation: ${title}`, 5000);
    } catch (error) {
        const errMsg = `Start Documentation failed: ${error}`;
        acOutput.appendLine(`[StartDoc] ERROR: ${errMsg}`);
        vscode.window.showErrorMessage(errMsg);
    }
}

/**
 * Break down an artifact into its next level of detail via Copilot Chat.
 *
 * Workflow name mapping (matches getAvailableWorkflows() names):
 *   epic        → /stories command (generates child stories)
 *   requirement → Check Implementation Readiness (requirement → epic/story traceability)
 *   story       → Story Quality Review (validates story is dev-ready)
 *   vision/prd  → Validate PRD (validates completeness)
 *   architecture→ Refine Architecture
 *   use-case    → Refine Use Case
 */
export async function breakDownArtifact(artifact: any, store: ArtifactStore): Promise<void> {
    store.setRefineContext(artifact);

    let breakDownCommand: string;
    if (artifact.type === 'epic') {
        breakDownCommand = `@agileagentcanvas /stories ${artifact.id}`;
    } else if (artifact.type === 'requirement') {
        breakDownCommand = `@agileagentcanvas /refine ${artifact.id} Check Implementation Readiness`;
    } else if (artifact.type === 'story') {
        breakDownCommand = `@agileagentcanvas /refine ${artifact.id} Story Quality Review`;
    } else {
        // vision, prd, architecture, use-case — first workflow is the primary one
        const workflows = REFINE_WORKFLOWS[artifact.type];
        const name = workflows?.[0]?.label || '';
        breakDownCommand = name
            ? `@agileagentcanvas /refine ${artifact.id} ${name}`
            : `@agileagentcanvas /refine ${artifact.id}`;
    }

    try {
        await openChat(breakDownCommand);
        vscode.window.setStatusBarMessage(
            `Ready to break down ${artifact.title} - Press Enter to generate stories`,
            5000
        );
        acOutput.appendLine(`[Extension] Break down initiated for ${artifact.type}: ${artifact.id}`);
    } catch (error) {
        acOutput.appendLine(`[Extension] Error opening chat for break down: ${error}`);
    }
}

/**
 * Enhance an artifact with AI suggestions via Copilot Chat.
 * Routes to the first (primary) workflow for each artifact type, which is the
 * primary enhancement/validation workflow in getAvailableWorkflows():
 *   epic        → Epic Enhancement
 *   story       → Story Enhancement
 *   vision/prd  → Validate PRD
 *   requirement → Validate Requirement
 *   architecture→ Refine Architecture
 *   use-case    → Refine Use Case
 */
export async function enhanceArtifactWithAI(artifact: any, store: ArtifactStore): Promise<void> {
    store.setRefineContext(artifact);

    const workflows = REFINE_WORKFLOWS[artifact.type];
    const name = workflows?.[0]?.label || '';
    const enhanceCommand = name
        ? `@agileagentcanvas /refine ${artifact.id} ${name}`
        : `@agileagentcanvas /refine ${artifact.id}`;

    try {
        await openChat(enhanceCommand);
        vscode.window.setStatusBarMessage(
            `Ready to enhance ${artifact.title} - Press Enter to start BMAD workflow`,
            5000
        );
        acOutput.appendLine(`[Extension] Enhance initiated for ${artifact.type}: ${artifact.id}`);
    } catch (error) {
        acOutput.appendLine(`[Extension] Error opening chat for enhance: ${error}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Elicitation feature
// ─────────────────────────────────────────────────────────────────────────────

interface ElicitationMethod {
    num: string;
    category: string;
    method_name: string;
    description: string;
    output_pattern: string;
}

/**
 * Parse the methods.csv bundled under resources/_aac/core/workflows/advanced-elicitation/
 * Returns an array of ElicitationMethod objects.
 */
export function loadElicitationMethods(extensionUri: vscode.Uri): ElicitationMethod[] {
    const csvPath = path.join(extensionUri.fsPath, 'resources', BMAD_RESOURCE_DIR, 'core', 'workflows', 'advanced-elicitation', 'methods.csv');

    try {
        const raw = fs.readFileSync(csvPath, 'utf-8');
        const lines = raw.split(/\r?\n/).filter(l => l.trim());
        // Skip header
        const dataLines = lines.slice(1);

        return dataLines.map(line => {
            // CSV columns: num,category,method_name,description,output_pattern
            // Descriptions/output_patterns may contain commas — split on first 4 commas only
            const parts = line.split(',');
            const num = parts[0] ?? '';
            const category = parts[1] ?? '';
            const method_name = parts[2] ?? '';
            // description and output_pattern are the remaining parts
            // output_pattern is the LAST segment after the last comma in original line
            // We know there are exactly 5 columns; join parts 3..N-1 for description, parts[N] for output_pattern
            const lastCommaIdx = line.lastIndexOf(',');
            const firstThreeCommas = line.indexOf(',', line.indexOf(',', line.indexOf(',') + 1) + 1);
            const afterThree = line.slice(firstThreeCommas + 1); // "description,output_pattern"
            const descCommaIdx = afterThree.lastIndexOf(',');
            const description = afterThree.slice(0, descCommaIdx);
            const output_pattern = afterThree.slice(descCommaIdx + 1);
            return { num, category, method_name, description, output_pattern };
        });
    } catch (err) {
        acOutput.appendLine(`[Extension] loadElicitationMethods: failed to read CSV: ${err}`);
        return [];
    }
}

/**
 * Show a QuickPick of all 50 elicitation methods grouped by category,
 * then open VS Code chat with a crafted prompt applying the chosen method
 * to the selected artifact.
 *
 * If `preSelectedMethod` is provided (sent from the in-webview picker),
 * the QuickPick is skipped and the method is used directly.
 */
export async function elicitArtifactWithMethod(artifact: any, store: ArtifactStore, extensionUri: vscode.Uri, preSelectedMethod?: ElicitationMethod): Promise<void> {
    store.setRefineContext(artifact);

    let method: ElicitationMethod | undefined = preSelectedMethod;

    if (!method) {
        // Fallback: show native VS Code QuickPick (used when called without a pre-selected method)
        const methods = loadElicitationMethods(extensionUri);
        if (methods.length === 0) {
            vscode.window.showWarningMessage('Agile Agent Canvas: Could not load elicitation methods. Check extension installation.');
            return;
        }

        // Build QuickPick items grouped by category
        const items: vscode.QuickPickItem[] = [];
        const categories = [...new Set(methods.map(m => m.category))];

        for (const category of categories) {
            items.push({
                label: category.charAt(0).toUpperCase() + category.slice(1),
                kind: vscode.QuickPickItemKind.Separator
            });
            for (const m of methods.filter(m => m.category === category)) {
                items.push({
                    label: m.method_name,
                    description: m.description,
                    detail: `Output: ${m.output_pattern}`
                });
            }
        }

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: `Choose an elicitation method for "${artifact.title || artifact.id}"`,
            title: 'Agile Agent Canvas Elicit: Select Method',
            matchOnDescription: true,
            matchOnDetail: false
        });

        if (!picked || picked.kind === vscode.QuickPickItemKind.Separator) {
            acOutput.appendLine(`[Extension] Elicit cancelled by user for ${artifact.id}`);
            return;
        }

        method = methods.find(m => m.method_name === picked.label);
        if (!method) {
            acOutput.appendLine(`[Extension] Elicit: method not found for "${picked.label}"`);
            return;
        }
    }

    // Build the /elicit command — embeds method details so the chat handler
    // can construct a proper workflow execution with agileagentcanvas_update_artifact.
    const artifactContext = artifact.description
        ? `\n\nContent:\n${artifact.description}`
        : '';

    const prompt = `@agileagentcanvas /elicit ${artifact.id} ${method.method_name}
Category: ${method.category}
Description: ${method.description}
Output pattern: ${method.output_pattern}
Artifact type: ${artifact.type}
Artifact title: ${artifact.title || artifact.id}${artifactContext}`;

    try {
        await openChat(prompt);
        vscode.window.setStatusBarMessage(
            `Eliciting "${artifact.title}" with ${method.method_name}…`,
            5000
        );
        acOutput.appendLine(`[Extension] Elicit initiated for ${artifact.type} ${artifact.id} using method "${method.method_name}"`);
    } catch (error) {
        acOutput.appendLine(`[Extension] Error opening chat for elicit: ${error}`);
    }
}

export async function exportArtifacts(store: ArtifactStore, webview?: vscode.Webview): Promise<void> {
    const format = await vscode.window.showQuickPick(
        ['Markdown', 'JSON', 'PDF', 'JIRA CSV', 'Canvas as PNG', 'Canvas as PDF', 'All formats'],
        { placeHolder: 'Select export format' }
    );

    if (!format) return;

    // ── Canvas screenshot exports: delegate to webview ──
    if (format === 'Canvas as PNG' || format === 'Canvas as PDF') {
        if (!webview) {
            vscode.window.showWarningMessage(
                'Canvas screenshot export is only available from the canvas view.'
            );
            return;
        }
        const canvasFormat = format === 'Canvas as PNG' ? 'png' : 'pdf';
        webview.postMessage({ type: 'captureCanvas', format: canvasFormat });
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const isAllFormats = format === 'All formats';

    // Let the user choose where to save
    let targetUri: vscode.Uri | undefined;

    if (isAllFormats) {
        // For all formats, let the user pick a destination folder
        const folders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Export Here',
            title: 'Choose export folder'
        });
        targetUri = folders?.[0];
    } else {
        // For single format, use save dialog with suggested filename
        const extMap: Record<string, { ext: string; filter: string }> = {
            'Markdown': { ext: 'md', filter: 'Markdown' },
            'JSON': { ext: 'json', filter: 'JSON' },
            'PDF': { ext: 'pdf', filter: 'PDF' },
            'JIRA CSV': { ext: 'csv', filter: 'CSV' }
        };
        const info = extMap[format] ?? { ext: 'json', filter: 'JSON' };
        const defaultName = format === 'JIRA CSV'
            ? `bmad-jira-${timestamp}.${info.ext}`
            : `bmad-export-${timestamp}.${info.ext}`;

        // Suggest the workspace folder as starting location
        const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
        const defaultUri = defaultFolder
            ? vscode.Uri.joinPath(defaultFolder, defaultName)
            : undefined;

        targetUri = await vscode.window.showSaveDialog({
            defaultUri,
            filters: { [info.filter]: [info.ext] },
            title: `Export as ${format}`
        });
    }

    if (!targetUri) return;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Exporting artifacts…', cancellable: false },
        async () => {
            try {
                const resultUri = await store.exportArtifacts(format.toLowerCase(), targetUri!);
                if (resultUri) {
                    const isFolder = isAllFormats;
                    const relativePath = typeof vscode.workspace.asRelativePath === 'function'
                        ? vscode.workspace.asRelativePath(resultUri, true)
                        : resultUri.fsPath;
                    const action = await vscode.window.showInformationMessage(
                        `Artifacts exported as ${format} → ${relativePath}`,
                        isFolder ? 'Open Folder' : 'Open File'
                    );
                    if (action === 'Open File') {
                        await vscode.commands.executeCommand('vscode.open', resultUri);
                    } else if (action === 'Open Folder') {
                        await vscode.commands.executeCommand('revealFileInOS', resultUri);
                    }
                } else {
                    vscode.window.showWarningMessage('Export failed — could not write file.');
                }
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Export failed: ${errMsg}`);
            }
        }
    );
}

export async function importArtifacts(store: ArtifactStore): Promise<void> {
    const fileUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: false,
        filters: { 'BMAD JSON Export': ['json'] },
        title: 'Import BMAD Artifacts',
        openLabel: 'Import'
    });

    if (!fileUris || fileUris.length === 0) return;

    try {
        const raw = await vscode.workspace.fs.readFile(fileUris[0]);
        const text = Buffer.from(raw).toString('utf-8');
        const data = JSON.parse(text);

        // Basic validation — must look like a BMAD state object
        if (!data || typeof data !== 'object') {
            vscode.window.showErrorMessage('Invalid BMAD export file: expected a JSON object.');
            return;
        }

        // Check if there's an existing output folder that will be overwritten
        const outputFolder = store.getSourceFolder();
        let hasExistingFiles = false;
        if (outputFolder) {
            try {
                const entries = await vscode.workspace.fs.readDirectory(outputFolder);
                hasExistingFiles = entries.some(([name]) => name.endsWith('.json'));
            } catch {
                // Folder doesn't exist yet — no warning needed
            }
        }

        // Ask user whether to merge or replace
        const strategy = await vscode.window.showQuickPick(
            [
                {
                    label: 'Replace',
                    description: hasExistingFiles
                        ? `⚠ Will overwrite existing files in ${vscode.workspace.asRelativePath(outputFolder!, true)}`
                        : 'Clear current project and load imported data'
                },
                { label: 'Merge', description: 'Add imported artifacts to current project (existing items kept)' }
            ],
            { placeHolder: 'How should imported artifacts be applied?' }
        );

        if (!strategy) return;

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Importing artifacts…', cancellable: false },
            async () => {
                if (strategy!.label === 'Replace') {
                    // Extra confirmation when overwriting existing files
                    if (hasExistingFiles) {
                        const confirm = await vscode.window.showWarningMessage(
                            `This will replace all artifacts in ${vscode.workspace.asRelativePath(outputFolder!, true)}. This cannot be undone.`,
                            { modal: true },
                            'Replace'
                        );
                        if (confirm !== 'Replace') return;
                    }
                    store.clearProject();
                    store.loadFromState(data);
                    vscode.window.showInformationMessage('Artifacts imported (replaced current project).');
                } else {
                    store.mergeFromState(data);
                    vscode.window.showInformationMessage('Artifacts imported (merged into current project).');
                }
            }
        );

        acOutput.appendLine(`[Import] Imported artifacts from: ${fileUris[0].fsPath} (${strategy.label})`);
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        acOutput.appendLine(`[Import] Error importing artifacts: ${msg}`);
        vscode.window.showErrorMessage(`Failed to import artifacts: ${msg}`);
    }
}

export async function syncToFiles(store: ArtifactStore): Promise<void> {
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Syncing to files…', cancellable: false },
        async () => {
            await store.syncToFiles();
        }
    );
    vscode.window.showInformationMessage('Artifacts synced to .agileagentcanvas-context');
}

export async function goToStep(stepId: string, store: ArtifactStore): Promise<void> {
    store.setCurrentStep(stepId as any);

    const chatCommands: Record<string, string> = {
        'vision': '@agileagentcanvas /vision',
        'requirements': '@agileagentcanvas /requirements',
        'epics': '@agileagentcanvas /epics',
        'stories': '@agileagentcanvas /stories',
        'enhancement': '@agileagentcanvas /enhance',
        'review': '@agileagentcanvas /review'
    };

    const command = chatCommands[stepId];
    if (command) {
        await openChat();
        vscode.window.showInformationMessage(
            `Step: ${stepId.charAt(0).toUpperCase() + stepId.slice(1)}. Type "${command}" in chat to continue.`
        );
    }
}

export function selectArtifact(type: string, id: string, store: ArtifactStore): void {
    store.setSelectedArtifact(type, id);

    const state = store.getState();

    if (type === 'epic') {
        const epic = state.epics?.find(e => e.id === id);
        if (epic) {
            vscode.window.showInformationMessage(`Selected Epic: ${epic.title}`);
        }
    } else if (type === 'story') {
        for (const epic of state.epics || []) {
            const story = epic.stories?.find(s => s.id === id);
            if (story) {
                vscode.window.showInformationMessage(`Selected Story: ${story.title}`);
                break;
            }
        }
    } else if (type === 'requirement') {
        const allReqs = [
            ...(state.requirements?.functional || []),
            ...(state.requirements?.nonFunctional || []),
            ...(state.requirements?.additional || [])
        ];
        const req = allReqs.find(r => r.id === id);
        if (req) {
            vscode.window.showInformationMessage(`Selected Requirement: ${req.title || req.id}`);
        }
    } else if (type === 'vision') {
        if (state.vision) {
            vscode.window.showInformationMessage(`Selected Vision: ${state.vision.productName || 'Product Vision'}`);
        }
    } else if (type === 'architecture') {
        const arch = state.architecture as any;
        if (arch) {
            vscode.window.showInformationMessage(`Selected Architecture: ${arch.overview?.projectName || 'Architecture'}`);
        }
    } else if (type === 'architecture-decision') {
        const arch = state.architecture as any;
        const decision = arch?.decisions?.find((d: any) => d.id === id);
        if (decision) {
            vscode.window.showInformationMessage(`Selected Decision: ${decision.title}`);
        }
    } else if (type === 'risks') {
        vscode.window.showInformationMessage(`Selected Risk: ${id}`);
    } else if (type === 'use-case') {
        for (const epic of state.epics || []) {
            const uc = epic.useCases?.find(u => u.id === id);
            if (uc) {
                vscode.window.showInformationMessage(`Selected Use Case: ${uc.title || uc.id}`);
                break;
            }
        }
    } else if (type === 'test-strategy') {
        vscode.window.showInformationMessage(`Selected Test Strategy: ${id}`);
    } else if (type === 'test-case') {
        vscode.window.showInformationMessage(`Selected Test Case: ${id}`);
    }
}

// =============================================================================
// BMM Workflow Launcher
// =============================================================================

export interface BmmWorkflowInfo {
    id: string;
    name: string;
    description: string;
    triggerPhrase: string;
    phase: string;
    phaseOrder: number;
    /** Absolute path to the workflow file (workflow.yaml, workflow.md, etc.) */
    workflowFilePath: string;
}

/**
 * Folder-name → human-readable phase label + sort order.
 * Top-level single-file workflows (document-project, generate-project-context, etc.)
 * are grouped under "Project Setup".
 */
const PHASE_MAP: Record<string, { label: string; order: number }> = {
    '1-analysis':              { label: 'Analysis',       order: 1 },
    '2-plan-workflows':        { label: 'Planning',       order: 2 },
    '3-solutioning':           { label: 'Solutioning',    order: 3 },
    '4-implementation':        { label: 'Implementation', order: 4 },
    'bmad-quick-flow':         { label: 'Quick Flow',     order: 5 },
    'document-project':        { label: 'Documentation',  order: 6 },
    'generate-project-context':{ label: 'Documentation',  order: 6 },
    'generate-readme':         { label: 'Documentation',  order: 6 },
    'generate-changelog':      { label: 'Documentation',  order: 6 },
    'generate-api-docs':       { label: 'Documentation',  order: 6 },
    'qa-generate-e2e-tests':   { label: 'Project Setup',  order: 7 },
    'supporting':              { label: 'Supporting',     order: 8 },
};

/**
 * Extract the trigger phrase from a workflow description.
 * The description typically ends with:
 *   "Use when the user says "phrase1" or "phrase2""
 * We return everything after "Use when the user says".
 * Falls back to the full description if the pattern is not found.
 */
function extractTriggerPhrase(description: string): string {
    const match = description.match(/[Uu]se when the user says?\s+(.+)$/s);
    if (match) {
        // Strip surrounding quotes from the first phrase
        const raw = match[1].trim();
        // Get only the first quoted phrase for the chat trigger
        const firstQuote = raw.match(/[""]([^""]+)[""]/);
        if (firstQuote) return firstQuote[1];
        return raw;
    }
    return description;
}

/**
 * Extract a single YAML scalar field by key name.
 * Handles unquoted values, single-quoted values, and double-quoted values,
 * including values that themselves contain the opposite quote character.
 */
function extractYamlField(yamlText: string, key: string): string {
    // Match `key:` followed by optional whitespace then the value on the same line
    const lineMatch = yamlText.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    if (!lineMatch) return '';
    const raw = lineMatch[1].trim();
    if (!raw) return '';

    // Single-quoted YAML scalar: 'value with "inner" quotes'
    if (raw.startsWith("'")) {
        const inner = raw.slice(1);
        const closeIdx = inner.lastIndexOf("'");
        return closeIdx >= 0 ? inner.slice(0, closeIdx).trim() : inner.trim();
    }
    // Double-quoted YAML scalar: "value"
    if (raw.startsWith('"')) {
        const inner = raw.slice(1);
        const closeIdx = inner.lastIndexOf('"');
        return closeIdx >= 0 ? inner.slice(0, closeIdx).trim() : inner.trim();
    }
    // Unquoted scalar: stop at # comment or end of line
    return raw.replace(/#.*$/, '').trim();
}

/**
 * Parse a workflow.md or workflow.yaml file and return name + description.
 */
function parseWorkflowFile(filePath: string): { name: string; description: string } | null {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let name = '';
        let description = '';

        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
            // Simple YAML key extraction (no full YAML parser needed for these simple files)
            name = extractYamlField(content, 'name');
            description = extractYamlField(content, 'description');
        } else {
            // Markdown with YAML frontmatter
            const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (frontmatterMatch) {
                const fm = frontmatterMatch[1];
                name = extractYamlField(fm, 'name');
                description = extractYamlField(fm, 'description');
            }
        }

        if (!name && !description) return null;
        return { name, description };
    } catch {
        return null;
    }
}

/**
 * Scan the given root for bundled BMM workflows and return all discovered workflows.
 * The caller passes the extension's bundled resources path (e.g. `<extensionPath>/resources`).
 */
export function loadBmmWorkflows(resourcesRoot: string): BmmWorkflowInfo[] {
    const workflowsRoot = path.join(resourcesRoot, BMAD_RESOURCE_DIR, 'bmm', 'workflows');
    acOutput.appendLine(`[Extension] loadBmmWorkflows: scanning ${workflowsRoot}`);

    if (!fs.existsSync(workflowsRoot)) {
        acOutput.appendLine(`[Extension] loadBmmWorkflows: directory not found`);
        return [];
    }

    const results: BmmWorkflowInfo[] = [];

    // Walk the top-level phase folders
    const topEntries = fs.readdirSync(workflowsRoot, { withFileTypes: true });
    for (const topEntry of topEntries) {
        if (!topEntry.isDirectory()) continue;
        const topFolder = topEntry.name;
        const phaseInfo = PHASE_MAP[topFolder] ?? { label: topFolder, order: 99 };
        const topPath = path.join(workflowsRoot, topFolder);

        // Check if there's a workflow file directly in this top-level folder
        const directFiles = ['workflow.yaml', 'workflow.yml', 'workflow.md']
            .map(f => path.join(topPath, f))
            .filter(f => fs.existsSync(f));

        if (directFiles.length > 0) {
            // Top-level single-file workflow (e.g. document-project/workflow.yaml)
            const parsed = parseWorkflowFile(directFiles[0]);
            if (parsed) {
                results.push({
                    id: topFolder,
                    name: parsed.name || topFolder,
                    description: parsed.description,
                    triggerPhrase: extractTriggerPhrase(parsed.description),
                    phase: phaseInfo.label,
                    phaseOrder: phaseInfo.order,
                    workflowFilePath: directFiles[0],
                });
            }
        }

        // Also walk subdirectories (e.g. 1-analysis/create-product-brief/)
        const subEntries = fs.readdirSync(topPath, { withFileTypes: true });
        for (const subEntry of subEntries) {
            if (!subEntry.isDirectory()) continue;
            const subFolder = subEntry.name;
            const subPath = path.join(topPath, subFolder);

            // Look for any workflow file (including workflow-*.md variants in research/)
            const subFiles = fs.readdirSync(subPath)
                .filter(f => (f === 'workflow.yaml' || f === 'workflow.yml' || f.startsWith('workflow') && f.endsWith('.md')))
                .map(f => path.join(subPath, f));

            for (const wfFile of subFiles) {
                const parsed = parseWorkflowFile(wfFile);
                if (!parsed) continue;
                const wfName = path.basename(wfFile, path.extname(wfFile));
                const uniqueId = `${topFolder}/${subFolder}/${wfName === 'workflow' ? '' : wfName}`.replace(/\/$/, '');
                results.push({
                    id: uniqueId,
                    name: parsed.name || `${topFolder}/${subFolder}`,
                    description: parsed.description,
                    triggerPhrase: extractTriggerPhrase(parsed.description),
                    phase: phaseInfo.label,
                    phaseOrder: phaseInfo.order,
                    workflowFilePath: wfFile,
                });
            }
        }
    }

    acOutput.appendLine(`[Extension] loadBmmWorkflows: found ${results.length} workflows`);
    return results;
}

/**
 * Launch a BMM workflow by opening the IDE chat pre-filled with the trigger phrase.
 *
 * When a workflowFilePath is provided, the workflow context is stored on the
 * ArtifactStore so the chat participant can pick it up and route through
 * executeWithTools() with the actual workflow file — instead of relying on the
 * LLM to guess from a natural-language trigger phrase alone.
 */
export async function launchBmmWorkflow(triggerPhrase: string, store?: ArtifactStore, workflowFilePath?: string): Promise<void> {
    acOutput.appendLine(`[Extension] launchBmmWorkflow: triggerPhrase="${triggerPhrase}", workflowFilePath="${workflowFilePath ?? '(none)'}"`);

    // Store the pending workflow launch context so the chat participant can use it
    if (store && workflowFilePath) {
        store.setPendingWorkflowLaunch({ triggerPhrase, workflowFilePath });
    }

    // Ensure the phrase is addressed to the @agileagentcanvas chat participant
    const chatQuery = triggerPhrase.trimStart().startsWith('@agileagentcanvas')
        ? triggerPhrase
        : `@agileagentcanvas ${triggerPhrase}`;

    await openChat(chatQuery);
}
