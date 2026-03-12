import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { acOutput } from '../extension';
import { openChat } from './chat-bridge';

/**
 * Execute a workflow step with dependency checking.
 * Shows a warning if prerequisites are not met, otherwise opens chat
 * with the step-specific command pre-filled.
 */
export async function executeWorkflowStep(
    artifactType: string,
    artifactId: string,
    stepId: string,
    chatCommand: string,
    dependsOn?: string[],
    completionStatus?: Record<string, string>,
    store?: ArtifactStore
): Promise<void> {
    acOutput.appendLine(`[WorkflowStep] Executing step "${stepId}" for ${artifactType} ${artifactId}`);

    // Check dependencies if provided
    if (dependsOn && dependsOn.length > 0 && completionStatus) {
        const missingDeps = dependsOn.filter(dep => completionStatus[dep] !== 'completed');

        if (missingDeps.length > 0) {
            const stepLabels: Record<string, string> = {
                'validate': 'Validate',
                'define': 'Define Vision',
                'users': 'Target Users',
                'value': 'Value Proposition',
                'success': 'Success Criteria',
                'enhance': 'Enhance',
                'create-stories': 'Create Stories',
                'add-acceptance': 'Add Acceptance Criteria',
                'add-technical': 'Add Technical Notes',
                'add-steps': 'Add Flow Steps',
                'add-alternatives': 'Add Alternatives',
                'link-epic': 'Link to Epic',
                'link-story': 'Link to Story',
                'review': 'Review'
            };

            const missingLabels = missingDeps.map(dep => stepLabels[dep] || dep);

            const result = await vscode.window.showWarningMessage(
                `This step requires completing: ${missingLabels.join(', ')}`,
                { modal: false },
                'Run First Step',
                'Continue Anyway'
            );

            if (result === 'Run First Step') {
                const firstMissing = missingDeps[0];
                vscode.window.showInformationMessage(
                    `Please complete "${stepLabels[firstMissing] || firstMissing}" first.`
                );
                return;
            } else if (result !== 'Continue Anyway') {
                return;
            }
            // If "Continue Anyway", fall through to execute
        }
    }

    // Store context for the chat participant
    if (store) {
        const selected = store.getSelectedArtifact();
        if (selected) {
            store.setRefineContext(selected.artifact);
        }
    }

    const fullCommand = `@agentcanvas /refine ${artifactId} ${chatCommand}`;

    try {
        await openChat(fullCommand);
        vscode.window.setStatusBarMessage(
            `Ready to ${stepId}: Press Enter to send`,
            5000
        );
        acOutput.appendLine(`[WorkflowStep] Opened chat with: ${fullCommand}`);
    } catch (error) {
        acOutput.appendLine(`[WorkflowStep] Error opening chat: ${error}`);
    }
}
