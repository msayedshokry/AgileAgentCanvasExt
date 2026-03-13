import * as vscode from 'vscode';
import { ArtifactStore, WizardStep } from '../state/artifact-store';
import { getWorkflowExecutor, WorkflowSession } from '../workflow/workflow-executor';

/**
 * Workflow step definition with dependencies
 */
interface WorkflowStepDef {
    id: string;
    label: string;
    description: string;
    command?: string;
    /** IDs of steps that must be completed before this step */
    dependsOn?: string[];
    /** Chat command to execute for this step */
    chatCommand?: string;
}

/**
 * Tree view provider for workflow progress
 * Shows context-aware progress based on selected artifact and active workflow session
 */
export class WizardStepsProvider implements vscode.TreeDataProvider<WorkflowTreeItem> {
    private store: ArtifactStore;
    private _onDidChangeTreeData = new vscode.EventEmitter<WorkflowTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Default BMAD process steps (shown when nothing selected)
    private defaultSteps: { id: WizardStep; label: string; description: string; dependsOn?: WizardStep[] }[] = [
        { id: 'vision', label: 'Vision', description: 'Define product vision and problem' },
        { id: 'requirements', label: 'Requirements', description: 'Extract and organize requirements', dependsOn: ['vision'] },
        { id: 'epics', label: 'Epics', description: 'Design epic structure', dependsOn: ['vision'] },
        { id: 'stories', label: 'Stories', description: 'Break down into stories', dependsOn: ['epics'] },
        { id: 'enhancement', label: 'Enhancement', description: 'Add verbose details (optional)', dependsOn: ['stories'] },
        { id: 'review', label: 'Review', description: 'Validate and export', dependsOn: ['stories'] }
    ];

    // Workflow steps by artifact type with dependencies
    private artifactWorkflows: Record<string, WorkflowStepDef[]> = {
        epic: [
            { id: 'validate', label: 'Validate Epic', description: 'Check epic completeness and clarity', chatCommand: 'validate this epic for completeness' },
            { id: 'enhance', label: 'Enhance Epic', description: 'Add use cases, risks, DoD, metrics', dependsOn: ['validate'], chatCommand: 'enhance this epic with use cases, risks, and success metrics' },
            { id: 'create-stories', label: 'Create Stories', description: 'Break down into user stories', dependsOn: ['validate'], chatCommand: 'break this epic into user stories' },
            { id: 'review', label: 'Review', description: 'Final validation before implementation', dependsOn: ['validate', 'create-stories'], chatCommand: 'review this epic for implementation readiness' },
        ],
        story: [
            { id: 'validate', label: 'Validate Story', description: 'Check story completeness', chatCommand: 'validate this story for completeness' },
            { id: 'enhance', label: 'Enhance Story', description: 'Add technical details, tests, edge cases', dependsOn: ['validate'], chatCommand: 'enhance this story with technical details and edge cases' },
            { id: 'add-acceptance', label: 'Add Acceptance Criteria', description: 'Define Given/When/Then scenarios', dependsOn: ['validate'], chatCommand: 'add acceptance criteria with Given/When/Then scenarios' },
            { id: 'add-technical', label: 'Add Technical Notes', description: 'Implementation guidance', dependsOn: ['validate'], chatCommand: 'add technical implementation notes' },
            { id: 'review', label: 'Implementation Ready', description: 'Ready for development', dependsOn: ['validate', 'add-acceptance'], chatCommand: 'review this story for development readiness' },
        ],
        requirement: [
            { id: 'validate', label: 'Validate Requirement', description: 'Check requirement clarity', chatCommand: 'validate this requirement for clarity and testability' },
            { id: 'link-epic', label: 'Link to Epic', description: 'Associate with epic(s)', dependsOn: ['validate'], chatCommand: 'suggest which epics this requirement should be linked to' },
            { id: 'link-story', label: 'Link to Story', description: 'Associate with story(ies)', dependsOn: ['validate', 'link-epic'], chatCommand: 'suggest which stories implement this requirement' },
            { id: 'review', label: 'Review', description: 'Requirement is fully mapped', dependsOn: ['link-epic'], chatCommand: 'review this requirement mapping' },
        ],
        vision: [
            { id: 'define', label: 'Define Vision', description: 'Product name and problem statement', chatCommand: 'help define the product vision and problem statement' },
            { id: 'users', label: 'Target Users', description: 'Define target audience', dependsOn: ['define'], chatCommand: 'help identify and describe target users' },
            { id: 'value', label: 'Value Proposition', description: 'Define unique value', dependsOn: ['define'], chatCommand: 'help articulate the value proposition' },
            { id: 'success', label: 'Success Criteria', description: 'Define measurable outcomes', dependsOn: ['define', 'users'], chatCommand: 'help define success criteria and metrics' },
            { id: 'review', label: 'Approve Vision', description: 'Vision is complete', dependsOn: ['define', 'users', 'value', 'success'], chatCommand: 'review the vision for completeness' },
        ],
        'use-case': [
            { id: 'validate', label: 'Validate Use Case', description: 'Check use case completeness', chatCommand: 'validate this use case for completeness' },
            { id: 'add-steps', label: 'Add Flow Steps', description: 'Define main flow steps', dependsOn: ['validate'], chatCommand: 'help define the main flow steps' },
            { id: 'add-alternatives', label: 'Add Alternatives', description: 'Define alternative flows', dependsOn: ['add-steps'], chatCommand: 'add alternative and exception flows' },
            { id: 'review', label: 'Review', description: 'Use case is complete', dependsOn: ['validate', 'add-steps'], chatCommand: 'review this use case for completeness' },
        ],
    };

    constructor(store: ArtifactStore) {
        this.store = store;
        
        // Listen for selection changes
        store.onDidChangeSelection(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WorkflowTreeItem): Thenable<WorkflowTreeItem[]> {
        // If this is a child element request, return empty (flat list)
        if (element) {
            return Promise.resolve([]);
        }

        const items: WorkflowTreeItem[] = [];
        const executor = getWorkflowExecutor();
        const session = executor.getCurrentSession();
        const selected = this.store.getSelectedArtifact();

        // If there's an active workflow session, show session progress
        if (session && session.status === 'active') {
            items.push(...this.buildSessionProgressItems(session));
            return Promise.resolve(items);
        }

        // If an artifact is selected, show artifact-specific workflow
        if (selected) {
            items.push(...this.buildArtifactWorkflowItems(selected));
            return Promise.resolve(items);
        }

        // Default: show overall BMAD process
        items.push(...this.buildDefaultProgressItems());
        return Promise.resolve(items);
    }

    /**
     * Build items showing active workflow session progress
     */
    private buildSessionProgressItems(session: WorkflowSession): WorkflowTreeItem[] {
        const items: WorkflowTreeItem[] = [];

        // Header item showing session info
        items.push(new WorkflowTreeItem(
            'session-header',
            `Workflow: ${session.workflowName}`,
            `${session.artifactType} ${session.artifactId}`,
            'header',
            new vscode.ThemeIcon('debug-stackframe-focused', new vscode.ThemeColor('charts.blue'))
        ));

        // Show completed steps
        session.stepsCompleted.forEach((stepPath, index) => {
            const stepName = this.extractStepName(stepPath);
            items.push(new WorkflowTreeItem(
                `completed-${index}`,
                `Step ${index + 1}: ${stepName}`,
                'Completed',
                'completed',
                new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'))
            ));
        });

        // Current step
        const currentStepName = this.extractStepName(session.currentStepPath);
        items.push(new WorkflowTreeItem(
            'current-step',
            `Step ${session.currentStepNumber}: ${currentStepName}`,
            'In Progress',
            'current',
            new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'))
        ));

        // Next step (if known)
        if (session.nextStepPath) {
            const nextStepName = this.extractStepName(session.nextStepPath);
            items.push(new WorkflowTreeItem(
                'next-step',
                `Next: ${nextStepName}`,
                'Pending',
                'pending',
                new vscode.ThemeIcon('circle-outline')
            ));
        }

        // Action items
        items.push(new WorkflowTreeItem(
            'action-continue',
            'Continue Workflow',
            'Use @agileagentcanvas /continue',
            'action',
            new vscode.ThemeIcon('debug-continue', new vscode.ThemeColor('charts.green')),
            {
                command: 'agileagentcanvas.continueWorkflow',
                title: 'Continue',
                arguments: [session.id]
            }
        ));

        items.push(new WorkflowTreeItem(
            'action-cancel',
            'Cancel Workflow',
            'Stop current session',
            'action',
            new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('charts.red')),
            {
                command: 'agileagentcanvas.cancelWorkflow',
                title: 'Cancel',
                arguments: [session.id]
            }
        ));

        return items;
    }

    /**
     * Build items showing workflow steps for selected artifact type
     */
    private buildArtifactWorkflowItems(selected: { type: string; id: string; artifact: any }): WorkflowTreeItem[] {
        const items: WorkflowTreeItem[] = [];
        const workflows = this.artifactWorkflows[selected.type] || [];

        // Header showing selected artifact
        const title = selected.artifact.title || selected.artifact.productName || selected.id;
        items.push(new WorkflowTreeItem(
            'artifact-header',
            `${selected.type.toUpperCase()}: ${title}`,
            selected.id,
            'header',
            this.getArtifactIcon(selected.type)
        ));

        // Determine completion status based on artifact data
        const completionStatus = this.getArtifactCompletionStatus(selected);

        // Show workflow steps with status and dependency checking
        workflows.forEach((step) => {
            const status = completionStatus[step.id] || 'pending';
            
            // Check if dependencies are met
            const dependenciesMet = this.areDependenciesMet(step, completionStatus);
            const isBlocked = !dependenciesMet && status !== 'completed';
            
            // Determine icon based on status and blocked state
            let icon: vscode.ThemeIcon;
            let effectiveStatus: 'completed' | 'current' | 'pending' | 'blocked' = status as any;
            
            if (isBlocked) {
                icon = new vscode.ThemeIcon('lock', new vscode.ThemeColor('disabledForeground'));
                effectiveStatus = 'blocked';
            } else {
                icon = this.getStatusIcon(status);
            }
            
            // Build command - only if not blocked
            let command: vscode.Command | undefined;
            if (!isBlocked && status !== 'completed' && step.chatCommand) {
                command = {
                    command: 'agileagentcanvas.executeWorkflowStep',
                    title: step.label,
                    arguments: [selected.type, selected.id, step.id, step.chatCommand, step.dependsOn, completionStatus]
                };
            }
            
            // Build description with dependency info if blocked
            let description = step.description;
            if (isBlocked && step.dependsOn) {
                const missingDeps = step.dependsOn.filter(dep => completionStatus[dep] !== 'completed');
                const missingLabels = missingDeps.map(dep => {
                    const depStep = workflows.find(w => w.id === dep);
                    return depStep?.label || dep;
                });
                description = `Requires: ${missingLabels.join(', ')}`;
            }
            
            items.push(new WorkflowTreeItem(
                step.id,
                step.label,
                description,
                effectiveStatus as any,
                icon,
                command
            ));
        });

        // Quick action to start refinement
        items.push(new WorkflowTreeItem(
            'action-refine',
            'Refine with AI',
            `@agileagentcanvas /refine ${selected.id}`,
            'action',
            new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.purple')),
            {
                command: 'agileagentcanvas.openChatPanel',
                title: 'Refine',
                arguments: [`@agileagentcanvas /refine ${selected.id}`]
            }
        ));

        return items;
    }

    /**
     * Check if all dependencies for a step are completed
     */
    private areDependenciesMet(step: WorkflowStepDef, completionStatus: Record<string, string>): boolean {
        if (!step.dependsOn || step.dependsOn.length === 0) {
            return true;
        }
        return step.dependsOn.every(dep => completionStatus[dep] === 'completed');
    }

    /**
     * Build default BMAD process progress items
     */
    private buildDefaultProgressItems(): WorkflowTreeItem[] {
        const items: WorkflowTreeItem[] = [];
        const state = this.store.getState();
        const currentStep = state.currentStep;
        const currentIndex = this.defaultSteps.findIndex(s => s.id === currentStep);

        // Header
        items.push(new WorkflowTreeItem(
            'process-header',
            'Agile Agent Canvas Process',
            'Select an artifact for detailed workflow',
            'header',
            new vscode.ThemeIcon('list-tree')
        ));

        this.defaultSteps.forEach((step, index) => {
            let status: 'completed' | 'current' | 'pending';
            
            if (index < currentIndex) {
                status = 'completed';
            } else if (index === currentIndex) {
                status = 'current';
            } else {
                status = 'pending';
            }

            // Check actual completion based on artifacts
            if (step.id === 'vision' && state.vision) status = 'completed';
            if (step.id === 'requirements' && state.requirements?.functional?.length) status = 'completed';
            if (step.id === 'epics' && state.epics?.length) status = 'completed';
            if (step.id === 'stories' && state.epics?.some(e => e.stories?.length > 0)) status = 'completed';

            const icon = this.getStatusIcon(status);

            items.push(new WorkflowTreeItem(
                step.id,
                step.label,
                step.description,
                status,
                icon,
                {
                    command: 'agileagentcanvas.goToStep',
                    title: 'Go to Step',
                    arguments: [step.id]
                }
            ));
        });

        return items;
    }

    /**
     * Get completion status for artifact fields
     */
    private getArtifactCompletionStatus(selected: { type: string; id: string; artifact: any }): Record<string, 'completed' | 'current' | 'pending'> {
        const status: Record<string, 'completed' | 'current' | 'pending'> = {};
        const artifact = selected.artifact;

        switch (selected.type) {
            case 'epic':
                status['validate'] = artifact.title && artifact.goal ? 'completed' : 'pending';
                status['enhance'] = artifact.useCases?.length || artifact.risks?.length || artifact.definitionOfDone?.length ? 'completed' : 'pending';
                status['create-stories'] = artifact.stories?.length > 0 ? 'completed' : 'pending';
                status['review'] = artifact.status === 'ready' || artifact.status === 'done' ? 'completed' : 'pending';
                break;

            case 'story':
                status['validate'] = artifact.userStory?.asA && artifact.userStory?.iWant ? 'completed' : 'pending';
                status['enhance'] = artifact.technicalNotes ? 'completed' : 'pending';
                status['add-acceptance'] = artifact.acceptanceCriteria?.length > 0 ? 'completed' : 'pending';
                status['add-technical'] = artifact.technicalNotes ? 'completed' : 'pending';
                status['review'] = artifact.status === 'ready' || artifact.status === 'done' ? 'completed' : 'pending';
                break;

            case 'requirement':
                status['validate'] = artifact.title && artifact.description ? 'completed' : 'pending';
                status['link-epic'] = artifact.relatedEpics?.length > 0 ? 'completed' : 'pending';
                status['link-story'] = artifact.relatedStories?.length > 0 ? 'completed' : 'pending';
                status['review'] = artifact.relatedEpics?.length > 0 && artifact.relatedStories?.length > 0 ? 'completed' : 'pending';
                break;

            case 'vision':
                status['define'] = artifact.productName && artifact.problemStatement ? 'completed' : 'pending';
                status['users'] = artifact.targetUsers?.length > 0 ? 'completed' : 'pending';
                status['value'] = artifact.valueProposition ? 'completed' : 'pending';
                status['success'] = artifact.successCriteria?.length > 0 ? 'completed' : 'pending';
                status['review'] = artifact.status === 'approved' ? 'completed' : 'pending';
                break;
        }

        // Find first incomplete step and mark as current
        const steps = Object.keys(status);
        for (const step of steps) {
            if (status[step] === 'pending') {
                status[step] = 'current';
                break;
            }
        }

        return status;
    }

    /**
     * Get icon for artifact type
     */
    private getArtifactIcon(type: string): vscode.ThemeIcon {
        switch (type) {
            case 'epic':
                return new vscode.ThemeIcon('layers', new vscode.ThemeColor('charts.blue'));
            case 'story':
                return new vscode.ThemeIcon('bookmark', new vscode.ThemeColor('charts.green'));
            case 'requirement':
                return new vscode.ThemeIcon('checklist', new vscode.ThemeColor('charts.orange'));
            case 'vision':
                return new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('charts.yellow'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }

    /**
     * Get icon for status
     */
    private getStatusIcon(status: 'completed' | 'current' | 'pending'): vscode.ThemeIcon {
        switch (status) {
            case 'completed':
                return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
            case 'current':
                return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue'));
            case 'pending':
                return new vscode.ThemeIcon('circle-outline');
        }
    }

    /**
     * Extract readable step name from path
     */
    private extractStepName(stepPath: string): string {
        const fileName = stepPath.split('/').pop() || stepPath;
        return fileName
            .replace(/^step-\d+[a-z]?-/, '')
            .replace(/\.(md|yaml)$/, '')
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }
}

/**
 * Tree item for workflow steps
 */
class WorkflowTreeItem extends vscode.TreeItem {
    constructor(
        public readonly stepId: string,
        label: string,
        description: string,
        status: 'completed' | 'current' | 'pending' | 'blocked' | 'header' | 'action',
        icon: vscode.ThemeIcon,
        command?: vscode.Command
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.contextValue = `workflow-${status}`;
        this.iconPath = icon;

        if (command) {
            this.command = command;
        }

        // Add tooltip
        if (status === 'header') {
            this.tooltip = description;
        } else if (status === 'action') {
            this.tooltip = `Click to ${description}`;
        } else if (status === 'blocked') {
            this.tooltip = `🔒 Blocked: ${description}`;
        } else {
            this.tooltip = `${label}: ${description} (${status})`;
        }
    }
}

