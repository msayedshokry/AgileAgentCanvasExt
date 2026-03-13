import * as vscode from 'vscode';
import { ArtifactStore, Epic, Story, UseCase, TestCase, TestStrategy } from '../state/artifact-store';

/**
 * Tree view provider for BMAD artifacts
 * Shows hierarchical view of epics, stories, use cases, and test artifacts
 */
export class ArtifactsTreeProvider implements vscode.TreeDataProvider<ArtifactTreeItem> {
    private store: ArtifactStore;
    private _onDidChangeTreeData = new vscode.EventEmitter<ArtifactTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(store: ArtifactStore) {
        this.store = store;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: ArtifactTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ArtifactTreeItem): Thenable<ArtifactTreeItem[]> {
        if (!element) {
            // Root level - show categories
            return Promise.resolve(this.getRootItems());
        }

        if (element.contextValue === 'category-epics') {
            return Promise.resolve(this.getEpicItems());
        }

        if (element.contextValue === 'epic') {
            return Promise.resolve(this.getEpicChildren(element.id!));
        }

        if (element.contextValue === 'story') {
            return Promise.resolve(this.getStoryChildren(element.id!));
        }

        if (element.contextValue === 'category-requirements') {
            return Promise.resolve(this.getRequirementItems());
        }

        if (element.contextValue === 'category-tests') {
            return Promise.resolve(this.getTestStrategyItems());
        }

        return Promise.resolve([]);
    }

    private getRootItems(): ArtifactTreeItem[] {
        const state = this.store.getState();
        const items: ArtifactTreeItem[] = [];

        // ── Open Canvas action (always first, prominent) ──
        const openCanvasItem = new ArtifactTreeItem(
            'Open Visual Canvas',
            vscode.TreeItemCollapsibleState.None,
            'open-canvas',
            '$(layout)',
            ''
        );
        openCanvasItem.command = {
            command: 'agileagentcanvas.openCanvas',
            title: 'Open Visual Canvas',
        };
        openCanvasItem.tooltip = 'Open the AgileAgentCanvas visual canvas';
        items.push(openCanvasItem);

        // Project name header
        if (state.projectName) {
            const projectItem = new ArtifactTreeItem(
                state.projectName,
                vscode.TreeItemCollapsibleState.None,
                'project-name',
                '$(project)',
                'Project'
            );
            items.push(projectItem);
        } else {
            const noProjectItem = new ArtifactTreeItem(
                'No project loaded',
                vscode.TreeItemCollapsibleState.None,
                'no-project',
                '$(folder)',
                'Run "Agile Agent Canvas: New Project"'
            );
            items.push(noProjectItem);
        }

        // Vision
        items.push(new ArtifactTreeItem(
            'Vision',
            vscode.TreeItemCollapsibleState.None,
            'category-vision',
            state.vision ? '$(pass-filled)' : '$(circle-outline)',
            state.vision ? 'Defined' : 'Not defined'
        ));

        // Requirements
        const reqCount = (state.requirements?.functional?.length || 0) + 
                        (state.requirements?.nonFunctional?.length || 0);
        items.push(new ArtifactTreeItem(
            'Requirements',
            reqCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            'category-requirements',
            '$(list-unordered)',
            reqCount > 0 ? `${reqCount} requirements` : 'No requirements'
        ));

        // Epics (test cases are nested inside, no separate Tests category for cases)
        const epicCount = state.epics?.length || 0;
        items.push(new ArtifactTreeItem(
            'Epics',
            epicCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            'category-epics',
            '$(layers)',
            epicCount > 0 ? `${epicCount} epics` : 'No epics'
        ));

        // Test Strategy only (test cases are nested under epics/stories)
        const hasTestStrategy = !!state.testStrategy;
        if (hasTestStrategy) {
            items.push(new ArtifactTreeItem(
                'Test Strategy',
                vscode.TreeItemCollapsibleState.None,
                'category-tests',
                '$(beaker)',
                'Strategy'
            ));
        }

        return items;
    }

    private getEpicItems(): ArtifactTreeItem[] {
        const state = this.store.getState();
        const epics = this.store.getEpics();
        const allTestCases: TestCase[] = (state.testCases as TestCase[]) || [];

        return epics.map((epic, index) => {
            const storyCount = epic.stories?.length || 0;
            const ucCount = epic.useCases?.length || 0;
            // Count TCs that belong to this epic (via stories or directly)
            const epicTcCount = allTestCases.filter(tc =>
                tc.epicId === epic.id || epic.stories?.some(s => s.id === tc.storyId)
            ).length;

            const hasChildren = storyCount > 0 || ucCount > 0 || epicTcCount > 0 || !!epic.testStrategy;

            const descParts: string[] = [];
            if (storyCount > 0) { descParts.push(`${storyCount} ${storyCount === 1 ? 'story' : 'stories'}`); }
            if (ucCount > 0) { descParts.push(`${ucCount} use ${ucCount === 1 ? 'case' : 'cases'}`); }
            if (epicTcCount > 0) { descParts.push(`${epicTcCount} test ${epicTcCount === 1 ? 'case' : 'cases'}`); }
            if (epic.testStrategy) { descParts.push('test strategy'); }

            const item = new ArtifactTreeItem(
                `Epic ${index + 1}: ${epic.title}`,
                hasChildren
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
                'epic',
                this.getStatusIcon(epic.status),
                descParts.length > 0 ? descParts.join(', ') : ''
            );
            item.id = epic.id;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Epic',
                arguments: ['epic', epic.id]
            };
            return item;
        });
    }

    private getEpicChildren(epicId: string): ArtifactTreeItem[] {
        const state = this.store.getState();
        const epics = this.store.getEpics();
        const epic = epics.find(e => e.id === epicId);
        if (!epic) { return []; }

        const allTestCases: TestCase[] = (state.testCases as TestCase[]) || [];
        const items: ArtifactTreeItem[] = [];

        // Stories — collapsible when they have test cases
        (epic.stories || []).forEach((story, index) => {
            const storyTcs = allTestCases.filter(tc => tc.storyId === story.id);
            const item = new ArtifactTreeItem(
                `Story ${index + 1}: ${story.title}`,
                storyTcs.length > 0
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
                'story',
                this.getStatusIcon(story.status),
                story.storyPoints
                    ? `${story.storyPoints} pts${storyTcs.length > 0 ? `, ${storyTcs.length} test ${storyTcs.length === 1 ? 'case' : 'cases'}` : ''}`
                    : storyTcs.length > 0
                        ? `${storyTcs.length} test ${storyTcs.length === 1 ? 'case' : 'cases'}`
                        : ''
            );
            item.id = story.id;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Story',
                arguments: ['story', story.id]
            };
            items.push(item);
        });

        // Use Cases
        (epic.useCases || []).forEach((uc, index) => {
            const item = new ArtifactTreeItem(
                `UC ${index + 1}: ${uc.title || uc.id}`,
                vscode.TreeItemCollapsibleState.None,
                'use-case',
                this.getStatusIcon((uc as any).status),
                uc.summary ? uc.summary.substring(0, 40) + (uc.summary.length > 40 ? '…' : '') : ''
            );
            item.id = uc.id;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Use Case',
                arguments: ['use-case', uc.id]
            };
            items.push(item);
        });

        // Per-epic test strategy
        if (epic.testStrategy) {
            const ts = epic.testStrategy;
            const tsItem = new ArtifactTreeItem(
                `Test Strategy: ${ts.title || 'Untitled'}`,
                vscode.TreeItemCollapsibleState.None,
                'test-strategy',
                this.getStatusIcon(ts.status),
                'Epic Strategy'
            );
            tsItem.id = ts.id || `TS-${epicId}`;
            tsItem.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Test Strategy',
                arguments: ['test-strategy', tsItem.id]
            };
            items.push(tsItem);
        }

        // Epic-level test cases (epicId matches but no storyId, or storyId not in this epic)
        const epicDirectTcs = allTestCases.filter(tc =>
            tc.epicId === epicId && !epic.stories?.some(s => s.id === tc.storyId)
        );
        epicDirectTcs.forEach((tc, index) => {
            const item = new ArtifactTreeItem(
                `TC ${index + 1}: ${tc.title}`,
                vscode.TreeItemCollapsibleState.None,
                'test-case',
                this.getTestCaseIcon(tc),
                tc.type || ''
            );
            item.id = tc.id;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Test Case',
                arguments: ['test-case', tc.id]
            };
            items.push(item);
        });

        return items;
    }

    private getStoryChildren(storyId: string): ArtifactTreeItem[] {
        const state = this.store.getState();
        const allTestCases: TestCase[] = (state.testCases as TestCase[]) || [];
        const storyTcs = allTestCases.filter(tc => tc.storyId === storyId);

        return storyTcs.map((tc, index) => {
            const item = new ArtifactTreeItem(
                `TC ${index + 1}: ${tc.title}`,
                vscode.TreeItemCollapsibleState.None,
                'test-case',
                this.getTestCaseIcon(tc),
                tc.type || ''
            );
            item.id = tc.id;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Test Case',
                arguments: ['test-case', tc.id]
            };
            return item;
        });
    }

    /** Test Strategy only — test cases are nested under their parent epic/story */
    private getTestStrategyItems(): ArtifactTreeItem[] {
        const state = this.store.getState();
        const items: ArtifactTreeItem[] = [];

        if (state.testStrategy) {
            const ts = state.testStrategy as TestStrategy;
            const item = new ArtifactTreeItem(
                ts.title || 'Test Strategy',
                vscode.TreeItemCollapsibleState.None,
                'test-strategy',
                this.getStatusIcon(ts.status),
                'Strategy'
            );
            item.id = ts.id;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Test Strategy',
                arguments: ['test-strategy', ts.id]
            };
            items.push(item);
        }

        return items;
    }

    private getRequirementItems(): ArtifactTreeItem[] {
        const reqs = this.store.getRequirements();
        const items: ArtifactTreeItem[] = [];

        // Functional requirements
        if (reqs.functional?.length > 0) {
            items.push(new ArtifactTreeItem(
                `Functional (${reqs.functional.length})`,
                vscode.TreeItemCollapsibleState.None,
                'req-functional',
                '$(symbol-function)'
            ));
        }

        // Non-functional requirements
        if (reqs.nonFunctional?.length > 0) {
            items.push(new ArtifactTreeItem(
                `Non-Functional (${reqs.nonFunctional.length})`,
                vscode.TreeItemCollapsibleState.None,
                'req-nonfunctional',
                '$(symbol-ruler)'
            ));
        }

        // Additional requirements
        if (reqs.additional?.length > 0) {
            items.push(new ArtifactTreeItem(
                `Additional (${reqs.additional.length})`,
                vscode.TreeItemCollapsibleState.None,
                'req-additional',
                '$(symbol-misc)'
            ));
        }

        return items;
    }

    private getStatusIcon(status: string | undefined): string {
        switch (status) {
            case 'draft': return '$(circle-outline)';
            case 'ready': return '$(pass)';
            case 'in-progress': return '$(sync~spin)';
            case 'done': return '$(pass-filled)';
            default: return '$(circle-outline)';
        }
    }

    private getTestCaseIcon(tc: TestCase): string {
        switch (tc.status) {
            case 'passed': return '$(pass-filled)';
            case 'failed': return '$(error)';
            case 'blocked': return '$(warning)';
            case 'ready': return '$(pass)';
            default: return '$(beaker)';
        }
    }
}

/**
 * Tree item for artifacts
 */
class ArtifactTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        contextValue: string,
        icon?: string,
        description?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.description = description;
        if (icon) {
            this.iconPath = new vscode.ThemeIcon(icon.replace('$(', '').replace(')', ''));
        }
    }
}
