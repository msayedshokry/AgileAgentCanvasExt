import * as vscode from 'vscode';
import { ArtifactStore, Epic, Story, UseCase, TestCase, TestStrategy, Architecture } from '../state/artifact-store';

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

        if (element.contextValue === 'epic-risks') {
            return Promise.resolve(this.getEpicRiskItems(element.id!.replace('risks-', '')));
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

        // Architecture sub-items
        if (element.contextValue === 'category-architecture') {
            return Promise.resolve(this.getArchitectureItems());
        }
        if (element.contextValue === 'arch-decisions') {
            return Promise.resolve(this.getArchDecisionItems());
        }
        if (element.contextValue === 'arch-components') {
            return Promise.resolve(this.getArchComponentItems());
        }
        if (element.contextValue === 'arch-patterns') {
            return Promise.resolve(this.getArchPatternItems());
        }
        if (element.contextValue === 'arch-integrations') {
            return Promise.resolve(this.getArchIntegrationItems());
        }

        // Risks sub-items
        if (element.contextValue === 'category-risks') {
            return Promise.resolve(this.getRiskItems());
        }

        // Requirement category sub-items (individual requirements)
        if (element.contextValue === 'req-functional') {
            return Promise.resolve(this.getIndividualRequirements('functional'));
        }
        if (element.contextValue === 'req-nonfunctional') {
            return Promise.resolve(this.getIndividualRequirements('nonFunctional'));
        }
        if (element.contextValue === 'req-additional') {
            return Promise.resolve(this.getIndividualRequirements('additional'));
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
                        (state.requirements?.nonFunctional?.length || 0) +
                        (state.requirements?.additional?.length || 0);
        items.push(new ArtifactTreeItem(
            'Requirements',
            reqCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            'category-requirements',
            '$(list-unordered)',
            reqCount > 0 ? `${reqCount} requirements` : 'No requirements'
        ));

        // Architecture
        const arch = state.architecture as Architecture | undefined;
        if (arch) {
            const archSubCount = (arch.decisions?.length || 0) + (arch.systemComponents?.length || 0) +
                                 (arch.patterns?.length || 0) + (arch.integrations?.length || 0);
            items.push(new ArtifactTreeItem(
                'Architecture',
                archSubCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                'category-architecture',
                '$(server-environment)',
                arch.overview?.projectName || (archSubCount > 0 ? `${archSubCount} items` : 'Defined')
            ));
        }

        // Epics (test cases are nested inside, no separate Tests category for cases)
        const epicCount = state.epics?.length || 0;
        items.push(new ArtifactTreeItem(
            'Epics',
            epicCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            'category-epics',
            '$(layers)',
            epicCount > 0 ? `${epicCount} epics` : 'No epics'
        ));

        // Risks — PRD + BMM standalone only (epic risks shown under their respective epics)
        const standaloneRisks = this.getStandaloneRisks();
        if (standaloneRisks.length > 0) {
            items.push(new ArtifactTreeItem(
                'Risks',
                vscode.TreeItemCollapsibleState.Collapsed,
                'category-risks',
                '$(warning)',
                `${standaloneRisks.length} ${standaloneRisks.length === 1 ? 'risk' : 'risks'}`
            ));
        }

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

    // ── Architecture sub-items ──

    private getArchitectureItems(): ArtifactTreeItem[] {
        const state = this.store.getState();
        const arch = state.architecture as Architecture | undefined;
        if (!arch) { return []; }

        const items: ArtifactTreeItem[] = [];

        // Overview (click to open detail)
        if (arch.overview) {
            const overviewItem = new ArtifactTreeItem(
                'Overview',
                vscode.TreeItemCollapsibleState.None,
                'arch-overview',
                '$(info)',
                arch.overview.architectureStyle || arch.overview.summary?.substring(0, 40) || ''
            );
            overviewItem.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Architecture',
                arguments: ['architecture', arch.id || 'architecture-1']
            };
            items.push(overviewItem);
        }

        // ADRs / Decisions
        if (arch.decisions?.length > 0) {
            items.push(new ArtifactTreeItem(
                `Decisions (${arch.decisions.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'arch-decisions',
                '$(law)',
                `${arch.decisions.length} ADR${arch.decisions.length === 1 ? '' : 's'}`
            ));
        }

        // System Components
        if (arch.systemComponents?.length) {
            items.push(new ArtifactTreeItem(
                `Components (${arch.systemComponents.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'arch-components',
                '$(extensions)',
                ''
            ));
        }

        // Patterns
        if (arch.patterns?.length) {
            items.push(new ArtifactTreeItem(
                `Patterns (${arch.patterns.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'arch-patterns',
                '$(symbol-structure)',
                ''
            ));
        }

        // Integrations
        if (arch.integrations?.length) {
            items.push(new ArtifactTreeItem(
                `Integrations (${arch.integrations.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'arch-integrations',
                '$(plug)',
                ''
            ));
        }

        // Tech Stack (flat)
        if (arch.techStack) {
            const techItem = new ArtifactTreeItem(
                'Tech Stack',
                vscode.TreeItemCollapsibleState.None,
                'arch-techstack',
                '$(tools)',
                ''
            );
            techItem.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Architecture',
                arguments: ['architecture', arch.id || 'architecture-1']
            };
            items.push(techItem);
        }

        // Security
        if (arch.security) {
            const secItem = new ArtifactTreeItem(
                'Security',
                vscode.TreeItemCollapsibleState.None,
                'arch-security',
                '$(shield)',
                ''
            );
            secItem.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Architecture',
                arguments: ['architecture', arch.id || 'architecture-1']
            };
            items.push(secItem);
        }

        return items;
    }

    private getArchDecisionItems(): ArtifactTreeItem[] {
        const state = this.store.getState();
        const arch = state.architecture as Architecture | undefined;
        if (!arch?.decisions) { return []; }

        return arch.decisions.map((adr, i) => {
            const item = new ArtifactTreeItem(
                `${adr.id || `ADR-${i + 1}`}: ${adr.title}`,
                vscode.TreeItemCollapsibleState.None,
                'arch-decision',
                this.getAdrStatusIcon(adr.status),
                adr.status || ''
            );
            item.id = adr.id || `adr-${i}`;
            item.tooltip = adr.decision || adr.title;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Decision',
                arguments: ['architecture-decision', adr.id || `arch-decision-${i}`]
            };
            return item;
        });
    }

    private getArchComponentItems(): ArtifactTreeItem[] {
        const state = this.store.getState();
        const arch = state.architecture as Architecture | undefined;
        if (!arch?.systemComponents) { return []; }

        return arch.systemComponents.map((comp, i) => {
            const item = new ArtifactTreeItem(
                comp.name,
                vscode.TreeItemCollapsibleState.None,
                'arch-component',
                '$(symbol-class)',
                comp.type || ''
            );
            item.id = comp.id || `comp-${i}`;
            item.tooltip = comp.description || comp.name;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Architecture',
                arguments: ['architecture', arch.id || 'architecture-1']
            };
            return item;
        });
    }

    private getArchPatternItems(): ArtifactTreeItem[] {
        const state = this.store.getState();
        const arch = state.architecture as Architecture | undefined;
        if (!arch?.patterns) { return []; }

        return arch.patterns.map((pattern, i) => {
            const item = new ArtifactTreeItem(
                pattern.pattern,
                vscode.TreeItemCollapsibleState.None,
                'arch-pattern',
                '$(symbol-structure)',
                pattern.category || ''
            );
            item.id = `pattern-${i}`;
            item.tooltip = pattern.usage || pattern.rationale || pattern.pattern;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Architecture',
                arguments: ['architecture', arch.id || 'architecture-1']
            };
            return item;
        });
    }

    private getArchIntegrationItems(): ArtifactTreeItem[] {
        const state = this.store.getState();
        const arch = state.architecture as Architecture | undefined;
        if (!arch?.integrations) { return []; }

        return arch.integrations.map((intg, i) => {
            const item = new ArtifactTreeItem(
                intg.name,
                vscode.TreeItemCollapsibleState.None,
                'arch-integration',
                '$(plug)',
                intg.type || intg.protocol || ''
            );
            item.id = `integration-${i}`;
            item.tooltip = intg.description || intg.name;
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Architecture',
                arguments: ['architecture', arch.id || 'architecture-1']
            };
            return item;
        });
    }

    // ── Risks sub-items ──

    /**
     * Get standalone risks (from dedicated risks artifact AND PRD-level risks)
     */
    private getStandaloneRisks(): any[] {
        const state = this.store.getState();
        const risks: any[] = [];

        // Dedicated risks artifact (state.risks)
        const standaloneRisks = state.risks as any;
        if (Array.isArray(standaloneRisks)) {
            risks.push(...standaloneRisks);
        } else if (standaloneRisks?.risks && Array.isArray(standaloneRisks.risks)) {
            risks.push(...standaloneRisks.risks);
        }

        // PRD-level risks (state.prd.risks) — these appear as standalone cards on the canvas
        const prd = state.prd as any;
        if (prd?.risks && Array.isArray(prd.risks)) {
            const existingIds = new Set(risks.map(r => r.id).filter(Boolean));
            for (const r of prd.risks) {
                // Deduplicate by id (same risks may exist in both sources)
                if (!r.id || !existingIds.has(r.id)) {
                    risks.push(r);
                    if (r.id) { existingIds.add(r.id); }
                }
            }
        }

        return risks;
    }

    /**
     * Collect ALL risks from standalone state.risks AND from epic-level risks
     */
    private collectAllRisks(): any[] {
        const risks: any[] = [...this.getStandaloneRisks()];
        for (const epic of this.store.getEpics() || []) {
            const epicRiskItems = this.getEpicRisks(epic.id);
            for (const r of epicRiskItems) {
                risks.push({ ...r, _epicTitle: epic.title, _epicId: epic.id });
            }
        }
        return risks;
    }

    /**
     * Extract risks for a specific epic (epic.risks = { risks: [...] } or epic.risks = [...])
     */
    private getEpicRisks(epicId: string): any[] {
        const epics = this.store.getEpics();
        const epic = epics.find(e => e.id === epicId);
        if (!epic) { return []; }
        const epicRisks = epic.risks as any;
        if (Array.isArray(epicRisks)) { return epicRisks; }
        if (epicRisks?.risks && Array.isArray(epicRisks.risks)) { return epicRisks.risks; }
        return [];
    }

    /**
     * Root Risks node children — PRD + BMM standalone only
     */
    private getRiskItems(): ArtifactTreeItem[] {
        return this.buildRiskTreeItems(this.getStandaloneRisks());
    }

    /**
     * Epic-level risk children
     */
    private getEpicRiskItems(epicId: string): ArtifactTreeItem[] {
        return this.buildRiskTreeItems(this.getEpicRisks(epicId));
    }

    private buildRiskTreeItems(riskArray: any[]): ArtifactTreeItem[] {
        return riskArray.map((risk, i) => {
            const severityIcon = this.getRiskIcon(risk.riskScore || risk.impact);
            const label = risk._epicTitle
                ? `${risk.id || `RISK-${i + 1}`}: ${risk.risk || risk.title || risk.description || 'Untitled'} [${risk._epicTitle}]`
                : `${risk.id || `RISK-${i + 1}`}: ${risk.risk || risk.title || risk.description || 'Untitled'}`;
            const item = new ArtifactTreeItem(
                label,
                vscode.TreeItemCollapsibleState.None,
                'risk-item',
                severityIcon,
                [risk.category, risk.probability ? `P:${risk.probability}` : '', risk.impact ? `I:${risk.impact}` : ''].filter(Boolean).join(' · ')
            );
            item.id = `${risk.id || `risk-${i}`}${risk._epicId ? `-${risk._epicId}` : ''}`;
            item.tooltip = risk.mitigation ? `Mitigation: ${risk.mitigation}` : (risk.description || risk.risk || '');
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Risk',
                arguments: ['risks', risk.id || `risk-${i}`]
            };
            return item;
        });
    }

    // ── Individual requirement items ──

    private getIndividualRequirements(category: 'functional' | 'nonFunctional' | 'additional'): ArtifactTreeItem[] {
        const reqs = this.store.getRequirements();
        const reqList: any[] = (reqs as any)[category] || [];

        return reqList.map((req, i) => {
            const item = new ArtifactTreeItem(
                `${req.id || `REQ-${i + 1}`}: ${req.title || req.description?.substring(0, 50) || 'Untitled'}`,
                vscode.TreeItemCollapsibleState.None,
                'requirement',
                req.priority ? this.getPriorityIcon(req.priority) : '$(checklist)',
                req.priority || req.status || ''
            );
            item.id = req.id || `req-${category}-${i}`;
            item.tooltip = req.description || req.title || '';
            item.command = {
                command: 'agileagentcanvas.selectArtifact',
                title: 'Select Requirement',
                arguments: ['requirement', req.id || item.id]
            };
            return item;
        });
    }

    // ── Existing methods ──

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

        // Epic-level risks
        const epicRisks = this.getEpicRisks(epicId);
        if (epicRisks.length > 0) {
            const riskCategoryItem = new ArtifactTreeItem(
                `Risks (${epicRisks.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'epic-risks',
                '$(warning)',
                `${epicRisks.length} ${epicRisks.length === 1 ? 'risk' : 'risks'}`
            );
            riskCategoryItem.id = `risks-${epicId}`;
            items.push(riskCategoryItem);
        }

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

        // Functional requirements — expandable to individual items
        if (reqs.functional?.length > 0) {
            items.push(new ArtifactTreeItem(
                `Functional (${reqs.functional.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'req-functional',
                '$(symbol-function)'
            ));
        }

        // Non-functional requirements — expandable
        if (reqs.nonFunctional?.length > 0) {
            items.push(new ArtifactTreeItem(
                `Non-Functional (${reqs.nonFunctional.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'req-nonfunctional',
                '$(symbol-ruler)'
            ));
        }

        // Additional requirements — expandable
        if (reqs.additional?.length > 0) {
            items.push(new ArtifactTreeItem(
                `Additional (${reqs.additional.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'req-additional',
                '$(symbol-misc)'
            ));
        }

        return items;
    }

    // ── Icon helpers ──

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

    private getAdrStatusIcon(status: string | undefined): string {
        switch (status) {
            case 'accepted': case 'approved': return '$(pass-filled)';
            case 'proposed': return '$(circle-outline)';
            case 'deprecated': case 'superseded': return '$(close)';
            default: return '$(law)';
        }
    }

    private getRiskIcon(severity: string | undefined): string {
        switch (severity?.toLowerCase()) {
            case 'critical': return '$(error)';
            case 'high': return '$(warning)';
            case 'medium': return '$(info)';
            case 'low': return '$(circle-outline)';
            default: return '$(warning)';
        }
    }

    private getPriorityIcon(priority: string | undefined): string {
        switch (priority?.toLowerCase()) {
            case 'must-have': case 'critical': case 'p0': return '$(error)';
            case 'should-have': case 'high': case 'p1': return '$(warning)';
            case 'could-have': case 'medium': case 'p2': return '$(info)';
            case 'wont-have': case 'low': case 'p3': return '$(circle-outline)';
            default: return '$(checklist)';
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
