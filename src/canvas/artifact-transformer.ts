import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { createLogger } from '../utils/logger';

const logger = createLogger('artifact-transformer');

/**
 * Transform store state to the artifact array format expected by the canvas webview.
 * Used by the editor panel (extension.ts) and detail tabs (canvas-view-provider.ts).
 */
export function buildArtifacts(store: ArtifactStore): any[] {
    const state = store.getState();

    const artifacts: any[] = [];

    // Card width definitions
    const CARD_WIDTHS: Record<string, number> = {
        'product-brief': 280,
        vision: 280,
        prd: 280,
        risk: 240,
        requirement: 240,
        nfr: 240,
        'additional-req': 240,
        architecture: 280,
        'architecture-decision': 240,
        'system-component': 240,
        epic: 260,
        story: 250,
        task: 240,
        'use-case': 250,
        'test-strategy': 260,
        'test-case': 250,
        'test-coverage': 240
    };

    // Base heights: covers header-top row + status row + title + card padding
    // (header-top ~28px, status ~20px, title ~22px, padding 24px = ~94px minimum)
    const BASE_HEIGHTS: Record<string, number> = {
        'product-brief': 90,
        vision: 82,
        prd: 90,
        risk: 82,
        requirement: 90,
        nfr: 85,
        'additional-req': 82,
        architecture: 90,
        'architecture-decision': 85,
        'system-component': 85,
        epic: 82,
        story: 78,
        task: 72,
        'use-case': 78,
        'test-strategy': 82,
        'test-case': 78,
        'test-coverage': 100
    };

    // Approximate characters per line based on card width and font size
    const CHARS_PER_LINE: Record<string, number> = {
        'product-brief': 35,
        vision: 35,
        prd: 35,
        risk: 32,
        requirement: 32,
        nfr: 32,
        'additional-req': 32,
        architecture: 35,
        'architecture-decision': 32,
        'system-component': 32,
        epic: 32,
        story: 30,
        task: 28,
        'use-case': 30,
        'test-strategy': 32,
        'test-case': 30,
        'test-coverage': 28
    };

    // Line height in pixels
    const LINE_HEIGHT = 18;

    // Spacing between cards
    const CARD_SPACING = 20;

    // Number of columns for Planning and Solutioning grid layout
    const GRID_MAX_COLS = 4;
    // Grid child card width (used for Planning/Solutioning child cards)
    const GRID_CARD_WIDTH = 240;

    // Column X positions — all implementation children share the same start X,
    // laid out in a horizontal wrapping grid (stories, use-cases, then tests below).
    // Planning and Solutioning lanes use a 4-per-row grid; their child cards are
    // offset from the lane start by column index.
    const PLANNING_START_X = 390;
    const PLANNING_LANE_WIDTH = GRID_MAX_COLS * GRID_CARD_WIDTH + (GRID_MAX_COLS - 1) * CARD_SPACING; // 1020
    const SOLUTIONING_START_X = PLANNING_START_X + PLANNING_LANE_WIDTH + 40; // 1450
    const SOLUTIONING_LANE_WIDTH = PLANNING_LANE_WIDTH; // same grid width
    const IMPLEMENTATION_START_X = SOLUTIONING_START_X + SOLUTIONING_LANE_WIDTH + 40; // 2510
    // Horizontal inset: cards inside the implementation lane are offset inward
    // so they sit within epic row band borders with visible left/right margins.
    const IMPL_CARD_INSET = 20;

    const COLUMNS: Record<string, number> = {
        'product-brief': 50,
        vision: 50,
        prd: PLANNING_START_X,
        risk: PLANNING_START_X,
        requirement: PLANNING_START_X,
        nfr: PLANNING_START_X,
        'additional-req': PLANNING_START_X,
        architecture: SOLUTIONING_START_X,
        'architecture-decision': SOLUTIONING_START_X,
        'system-component': SOLUTIONING_START_X,
        epic: IMPLEMENTATION_START_X + IMPL_CARD_INSET,
        story: IMPLEMENTATION_START_X + IMPL_CARD_INSET + 320,
        task: IMPLEMENTATION_START_X + IMPL_CARD_INSET + 320,
        'use-case': IMPLEMENTATION_START_X + IMPL_CARD_INSET + 320,
        'test-strategy': IMPLEMENTATION_START_X + IMPL_CARD_INSET + 320,
        'test-case': IMPLEMENTATION_START_X + IMPL_CARD_INSET + 320,
        'test-coverage': IMPLEMENTATION_START_X + IMPL_CARD_INSET + 320
    };

    /**
     * Calculate card height based on content
     */
    function calculateCardHeight(type: string, title: string, description: string, extras: number = 0): number {
        const baseHeight = BASE_HEIGHTS[type] || 100;
        const charsPerLine = CHARS_PER_LINE[type] || 32;

        // Extra title lines beyond the first (first line is already in baseHeight)
        const titleLines = Math.max(0, Math.ceil(title.length / (charsPerLine * 0.8)) - 1);
        const descLines = description ? Math.ceil(description.length / charsPerLine) : 0;
        const cappedDescLines = Math.min(descLines, 4);

        const extraHeight = (titleLines * 20) + (cappedDescLines * LINE_HEIGHT) + extras;

        return baseHeight + extraHeight;
    }

    /**
     * Helper to place cards in a wrapping grid (4 per row).
     * Tracks column index and row-max-height so the next row starts below
     * the tallest card in the current row.
     */
    class GridPlacer {
        private col = 0;
        private rowTopY: number;
        private rowMaxH = 0;
        constructor(private startX: number, private startY: number, private maxCols: number, private cardWidth: number, private spacing: number) {
            this.rowTopY = startY;
        }
        /** Get position for the next card and advance the grid cursor. */
        place(height: number): { x: number; y: number } {
            if (this.col >= this.maxCols) {
                // wrap to next row
                this.rowTopY += this.rowMaxH + this.spacing;
                this.rowMaxH = 0;
                this.col = 0;
            }
            const x = this.startX + this.col * (this.cardWidth + this.spacing);
            const y = this.rowTopY;
            this.rowMaxH = Math.max(this.rowMaxH, height);
            this.col++;
            return { x, y };
        }
        /** Return the Y coordinate just below all placed cards (for the next section). */
        get bottomY(): number {
            if (this.col === 0 && this.rowMaxH === 0) return this.rowTopY;
            return this.rowTopY + this.rowMaxH + this.spacing;
        }
    }

    // Track Y offsets for each column
    // Top margin: Implementation lane cards sit inside epic row bands with
    // ROW_PADDING (20px), so they already have good visual spacing below the
    // lane header.  Other lanes need an explicit top margin to match.
    const LANE_CARD_TOP = 100;  // Discovery, Planning, Solutioning top margin
    const yOffsets: Record<string, number> = {
        'product-brief': LANE_CARD_TOP,
        vision: LANE_CARD_TOP,
        prd: LANE_CARD_TOP,
        risk: LANE_CARD_TOP,
        requirement: LANE_CARD_TOP,
        nfr: LANE_CARD_TOP,
        'additional-req': LANE_CARD_TOP,
        architecture: LANE_CARD_TOP,
        'architecture-decision': LANE_CARD_TOP,
        'system-component': LANE_CARD_TOP,
        epic: LANE_CARD_TOP,
        story: LANE_CARD_TOP,
        task: LANE_CARD_TOP,
        'use-case': LANE_CARD_TOP,
        'test-strategy': LANE_CARD_TOP,
        'test-case': LANE_CARD_TOP,
        'test-coverage': LANE_CARD_TOP
    };

    // =========================================================================
    // COLUMN 1: DISCOVERY PHASE (Product Brief + Vision)
    // =========================================================================

    if (state.productBrief) {
        const brief = state.productBrief;
        const title = brief.productName || 'Product Brief';
        const description = brief.vision?.statement || brief.tagline || '';
        const height = calculateCardHeight('product-brief', title, description, 30);

        artifacts.push({
            id: brief.id || 'product-brief-1',
            type: 'product-brief',
            title,
            description,
            status: brief.status || 'draft',
            position: { x: COLUMNS['product-brief'], y: yOffsets['product-brief'] },
            size: { width: CARD_WIDTHS['product-brief'], height },
            dependencies: [],
            childCount: 0,
            metadata: {
                productName: brief.productName,
                tagline: brief.tagline,
                vision: brief.vision,
                targetUsers: brief.targetUsers,
                marketContext: brief.marketContext,
                keyFeatures: brief.keyFeatures,
                successMetrics: brief.successMetrics,
                scope: brief.scope,
                constraints: brief.constraints,
                assumptions: brief.assumptions,
                risks: brief.risks,
                dependencies: brief.dependencies,
                timeline: brief.timeline,
                stakeholders: brief.stakeholders,
                additionalContext: brief.additionalContext
            }
        });
        yOffsets['product-brief'] += height + CARD_SPACING;

        yOffsets.vision = yOffsets['product-brief'];
    }

    if (state.vision) {
        const title = state.vision.productName || 'Product Vision';
        const description = state.vision.problemStatement || '';
        const height = calculateCardHeight('vision', title, description, 20);

        // Vision only owns requirements when there is no PRD (PRD takes ownership otherwise)
        const visionOwnsReqs = !state.prd;
        const funcReqCount = visionOwnsReqs ? (state.requirements?.functional?.length || 0) : 0;
        const nfrCount = visionOwnsReqs ? (state.requirements?.nonFunctional?.length || 0) : 0;
        const addReqCount = visionOwnsReqs ? (state.requirements?.additional?.length || 0) : 0;
        const requirementCount = funcReqCount + nfrCount + addReqCount;

        const visionChildBreakdown: { label: string; count: number; types: string[] }[] = [];
        if (funcReqCount > 0) visionChildBreakdown.push({ label: 'Reqs', count: funcReqCount, types: ['requirement'] });
        if (nfrCount > 0) visionChildBreakdown.push({ label: 'NFRs', count: nfrCount, types: ['nfr'] });
        if (addReqCount > 0) visionChildBreakdown.push({ label: 'Add. Reqs', count: addReqCount, types: ['additional-req'] });

        artifacts.push({
            id: 'vision-1',
            type: 'vision',
            title,
            description,
            status: state.vision.status || 'draft',
            position: { x: COLUMNS.vision, y: yOffsets.vision },
            size: { width: CARD_WIDTHS.vision, height },
            dependencies: [],
            parentId: state.productBrief ? (state.productBrief.id || 'product-brief-1') : undefined,
            childCount: requirementCount,
            childBreakdown: visionChildBreakdown,
            metadata: state.vision
        });
        yOffsets.vision += height + CARD_SPACING;
    }

    // =========================================================================
    // COLUMN 2: PLANNING PHASE (PRD + Requirements) — 4-per-row grid
    // =========================================================================

    if (state.prd) {
        const prd = state.prd;
        const title = prd.productOverview?.productName || 'PRD';
        const description = prd.productOverview?.purpose || prd.productOverview?.problemStatement || '';
        const height = calculateCardHeight('prd', title, description, 40);

        // Count children by category for the breakdown badges
        const prdRiskCount = prd.risks?.length || 0;
        const bmmRiskCount = state.risks?.risks?.length || 0;
        // BMM risks that overlap PRD risks will be deduped later, but for the
        // badge we approximate — exact dedup happens at render time.
        const funcReqCount = state.requirements?.functional?.length || 0;
        const nfrCount = state.requirements?.nonFunctional?.length || 0;
        const addReqCount = state.requirements?.additional?.length || 0;
        const totalRisks = prdRiskCount + bmmRiskCount; // may overcount slightly
        const prdChildCount = totalRisks + funcReqCount + nfrCount + addReqCount;

        const prdChildBreakdown: { label: string; count: number; types: string[] }[] = [];
        if (totalRisks > 0) prdChildBreakdown.push({ label: 'Risks', count: totalRisks, types: ['risk'] });
        if (funcReqCount > 0) prdChildBreakdown.push({ label: 'Reqs', count: funcReqCount, types: ['requirement'] });
        if (nfrCount > 0) prdChildBreakdown.push({ label: 'NFRs', count: nfrCount, types: ['nfr'] });
        if (addReqCount > 0) prdChildBreakdown.push({ label: 'Add. Reqs', count: addReqCount, types: ['additional-req'] });

        artifacts.push({
            id: prd.id || 'prd-1',
            type: 'prd',
            title,
            description,
            status: prd.status || 'draft',
            position: { x: COLUMNS.prd, y: yOffsets.prd },
            size: { width: CARD_WIDTHS.prd, height },
            dependencies: [],
            parentId: state.vision ? 'vision-1' : undefined,
            childCount: prdChildCount,
            childBreakdown: prdChildBreakdown,
            metadata: {
                productOverview: prd.productOverview,
                projectType: prd.projectType,
                userPersonas: prd.userPersonas,
                successCriteria: prd.successCriteria,
                userJourneys: prd.userJourneys,
                domainModel: prd.domainModel,
                requirements: prd.requirements,
                scope: prd.scope,
                constraints: prd.constraints,
                risks: prd.risks,
                timeline: prd.timeline,
                approvals: prd.approvals,
                appendices: prd.appendices,
                functionalRequirementIds: prd.functionalRequirementIds,
                nonFunctionalRequirementIds: prd.nonFunctionalRequirementIds
            }
        });
        yOffsets.prd += height + CARD_SPACING;
    }

    // Grid placer for all Planning child cards (risks, requirements, NFRs, additional reqs)
    const planningGrid = new GridPlacer(PLANNING_START_X, yOffsets.prd, GRID_MAX_COLS, GRID_CARD_WIDTH, CARD_SPACING);

    // --- PRD: Risks as child cards ---
    if (state.prd?.risks?.length) {
        const prdId = state.prd.id || 'prd-1';
        state.prd.risks.forEach((risk: any, idx: number) => {
            const riskId = risk.id || `risk-${idx}`;
            const riskTitle = risk.title || risk.risk || `Risk ${idx + 1}`;
            const riskDesc = risk.description || risk.risk || '';
            const riskHeight = calculateCardHeight('risk', riskTitle, riskDesc);
            const pos = planningGrid.place(riskHeight);

            artifacts.push({
                id: riskId,
                type: 'risk',
                title: riskTitle,
                description: riskDesc,
                status: risk.status || 'approved',
                position: pos,
                size: { width: GRID_CARD_WIDTH, height: riskHeight },
                dependencies: [],
                parentId: prdId,
                metadata: {
                    description: risk.description || risk.risk,
                    category: risk.category,
                    probability: risk.probability || risk.likelihood,
                    impact: risk.impact,
                    riskScore: risk.riskScore,
                    mitigation: risk.mitigation,
                    contingency: risk.contingency || risk.contingencyPlan,
                    owner: risk.owner,
                    triggers: risk.triggers,
                    riskStatus: risk.status
                }
            });
        });
    }

    // --- BMM Standalone Risks as risk cards ---
    if (state.risks?.risks?.length) {
        const existingIds = new Set(artifacts.filter(a => a.type === 'risk').map(a => a.id));
        const bmmParentId = state.prd?.id || 'prd-1';
        state.risks.risks.forEach((risk: any, idx: number) => {
            const riskId = risk.id || `bmm-risk-${idx}`;
            if (existingIds.has(riskId)) return;
            const riskTitle = risk.risk || risk.title || `Risk ${idx + 1}`;
            const riskDesc = risk.description || risk.impactDescription || '';
            const riskHeight = calculateCardHeight('risk', riskTitle, riskDesc);
            const pos = planningGrid.place(riskHeight);

            artifacts.push({
                id: riskId,
                type: 'risk',
                title: riskTitle,
                description: riskDesc,
                status: risk.status || 'approved',
                position: pos,
                size: { width: GRID_CARD_WIDTH, height: riskHeight },
                dependencies: [],
                parentId: bmmParentId,
                metadata: {
                    description: risk.description || risk.impactDescription,
                    category: risk.category,
                    probability: risk.probability || risk.likelihood,
                    impact: risk.impact,
                    riskScore: risk.riskScore,
                    mitigation: risk.mitigation,
                    contingency: risk.contingencyPlan,
                    owner: risk.owner,
                    triggers: risk.triggers,
                    riskStatus: risk.status,
                    residualRisk: risk.residualRisk,
                    source: 'bmm-risks'
                }
            });
        });
    }

    // Parent for planning grid children: PRD when it exists, otherwise Vision
    const planningParentId = state.prd ? (state.prd.id || 'prd-1') : (state.vision ? 'vision-1' : undefined);

    if (state.requirements?.functional) {
        state.requirements.functional.forEach((req: any, index: number) => {
            const reqId = req.id || `req-${index}`;
            const title = req.title || `Requirement ${index + 1}`;
            const description = req.description || '';
            const height = calculateCardHeight('requirement', title, description);
            const pos = planningGrid.place(height);

            const relatedEpicsCount = state.epics?.filter((epic: any) =>
                epic.functionalRequirements?.includes(reqId)
            ).length || 0;

            artifacts.push({
                id: reqId,
                type: 'requirement',
                title,
                description,
                status: 'approved',
                position: pos,
                size: { width: GRID_CARD_WIDTH, height },
                dependencies: [],
                parentId: planningParentId,
                childCount: relatedEpicsCount,
                metadata: {
                    capabilityArea: req.capabilityArea,
                    relatedEpics: req.relatedEpics,
                    relatedStories: req.relatedStories,
                    priority: req.priority,
                    requirementStatus: req.status
                }
            });
        });
    }

    // --- Non-Functional Requirements ---
    if (state.requirements?.nonFunctional) {
        state.requirements.nonFunctional.forEach((req: any, index: number) => {
            const nfrId = req.id || `nfr-${index}`;
            const title = req.title || `NFR ${index + 1}`;
            const description = req.description || '';
            const height = calculateCardHeight('nfr', title, description);
            const pos = planningGrid.place(height);

            artifacts.push({
                id: nfrId,
                type: 'nfr',
                title,
                description,
                status: 'approved',
                position: pos,
                size: { width: GRID_CARD_WIDTH, height },
                dependencies: [],
                parentId: planningParentId,
                metadata: {
                    category: req.category,
                    metrics: req.metrics
                }
            });
        });
    }

    // --- Additional Requirements ---
    if (state.requirements?.additional) {
        state.requirements.additional.forEach((req: any, index: number) => {
            const addReqId = req.id || `add-req-${index}`;
            const title = req.title || `Additional Req ${index + 1}`;
            const description = req.description || '';
            const height = calculateCardHeight('additional-req', title, description);
            const pos = planningGrid.place(height);

            artifacts.push({
                id: addReqId,
                type: 'additional-req',
                title,
                description,
                status: 'approved',
                position: pos,
                size: { width: GRID_CARD_WIDTH, height },
                dependencies: [],
                parentId: planningParentId,
                metadata: {
                    category: req.category
                }
            });
        });
    }

    // Update yOffsets so Solutioning starts below Planning grid
    yOffsets.prd = planningGrid.bottomY;
    yOffsets.requirement = planningGrid.bottomY;

    // =========================================================================
    // COLUMN 3: SOLUTIONING PHASE (Architecture) — 4-per-row grid
    // =========================================================================

    if (state.architecture) {
        const arch = state.architecture;
        const title = arch.overview?.projectName || 'Architecture';
        const description = arch.overview?.summary || arch.overview?.architectureStyle || '';
        const height = calculateCardHeight('architecture', title, description, 50);

        const decisionCount = arch.decisions?.length || 0;
        const componentCount = arch.systemComponents?.length || 0;
        const childCount = decisionCount + componentCount;

        const archChildBreakdown: { label: string; count: number; types: string[] }[] = [];
        if (decisionCount > 0) archChildBreakdown.push({ label: 'Decisions', count: decisionCount, types: ['architecture-decision'] });
        if (componentCount > 0) archChildBreakdown.push({ label: 'Components', count: componentCount, types: ['system-component'] });

        artifacts.push({
            id: arch.id || 'architecture-1',
            type: 'architecture',
            title,
            description,
            status: arch.status || 'draft',
            position: { x: COLUMNS.architecture, y: yOffsets.architecture },
            size: { width: CARD_WIDTHS.architecture, height },
            dependencies: [],
            parentId: state.prd ? (state.prd.id || 'prd-1') : undefined,
            childCount,
            childBreakdown: archChildBreakdown,
            metadata: {
                overview: arch.overview,
                context: arch.context,
                techStack: arch.techStack,
                decisions: arch.decisions,
                patterns: arch.patterns,
                systemComponents: arch.systemComponents,
                projectStructure: arch.projectStructure,
                dataFlow: arch.dataFlow,
                security: arch.security,
                scalability: arch.scalability,
                reliability: arch.reliability,
                observability: arch.observability,
                deployment: arch.deployment,
                integrations: arch.integrations,
                validation: arch.validation,
                implementationNotes: arch.implementationNotes,
                references: arch.references
            }
        });
        yOffsets.architecture += height + CARD_SPACING;

        // Grid placer for all Solutioning child cards (decisions + components)
        const solutioningGrid = new GridPlacer(SOLUTIONING_START_X, yOffsets.architecture, GRID_MAX_COLS, GRID_CARD_WIDTH, CARD_SPACING);

        // --- Architecture Decisions as child cards ---
        const archId = arch.id || 'architecture-1';
        if (arch.decisions?.length) {
            arch.decisions.forEach((decision: any, index: number) => {
                const decId = decision.id || `arch-decision-${index}`;
                const decTitle = decision.title || `Decision ${index + 1}`;
                const decDesc = decision.context || decision.decision || '';
                const decHeight = calculateCardHeight('architecture-decision', decTitle, decDesc);
                const pos = solutioningGrid.place(decHeight);

                artifacts.push({
                    id: decId,
                    type: 'architecture-decision',
                    title: decTitle,
                    description: decDesc,
                    status: decision.status || 'proposed',
                    position: pos,
                    size: { width: GRID_CARD_WIDTH, height: decHeight },
                    dependencies: [],
                    parentId: archId,
                    metadata: {
                        context: decision.context,
                        decision: decision.decision,
                        rationale: decision.rationale,
                        consequences: decision.consequences,
                        alternatives: decision.alternatives,
                        relatedDecisions: decision.relatedDecisions,
                        date: decision.date,
                        deciders: decision.deciders
                    }
                });
            });
        }

        // --- System Components as child cards ---
        if (arch.systemComponents?.length) {
            arch.systemComponents.forEach((comp: any, index: number) => {
                const compId = comp.id || `sys-component-${index}`;
                const compTitle = comp.name || `Component ${index + 1}`;
                const compDesc = comp.description || '';
                const compHeight = calculateCardHeight('system-component', compTitle, compDesc);
                const pos = solutioningGrid.place(compHeight);

                artifacts.push({
                    id: compId,
                    type: 'system-component',
                    title: compTitle,
                    description: compDesc,
                    status: 'approved',
                    position: pos,
                    size: { width: GRID_CARD_WIDTH, height: compHeight },
                    dependencies: [],
                    parentId: archId,
                    metadata: {
                        componentType: comp.type,
                        responsibilities: comp.responsibilities,
                        interfaces: comp.interfaces,
                        componentDependencies: comp.dependencies,
                        technology: comp.technology
                    }
                });
            });
        }

        yOffsets.architecture = solutioningGrid.bottomY;
    }

    // =========================================================================
    // COLUMNS 4+: IMPLEMENTATION PHASE (Epics + Stories + Use Cases)
    //
    // Grid layout per epic row:
    //   [ Epic card ] [ Story1  Story2  Story3  Story4  ... (single row, no wrap) ]
    //                 [ UseCase1  UseCase2  UseCase3  (wraps)   ]
    //
    // Stories are always laid out in a single horizontal row.
    // Use-cases fill a second horizontal row below stories.
    // The epic card spans the full row height on the left.
    // =========================================================================

    // Row padding inside each epic band (top and bottom)
    const ROW_PADDING = 20;
    // Starting X for stories and use-cases
    const CHILDREN_START_X = COLUMNS.story; // 1390
    // Gap between sub-groups (stories | use-cases | test-cases) within one epic row
    const SUBGROUP_GAP = 30;
    // Vertical space reserved above the first card in each sub-group for the label
    const SUBGROUP_LABEL_HEIGHT = 22;

    /**
     * Calculate the total height occupied by N cards laid out in a wrapping grid.
     * Returns { totalHeight, rowCount, maxRowHeight }
     */
    function calcGridHeight(
        count: number,
        heights: number[],
        maxPerRow: number
    ): { totalHeight: number; rowCount: number } {
        if (count === 0) return { totalHeight: 0, rowCount: 0 };
        const rowCount = Math.ceil(count / maxPerRow);
        let totalHeight = 0;
        for (let row = 0; row < rowCount; row++) {
            const start = row * maxPerRow;
            const end = Math.min(start + maxPerRow, count);
            let rowMaxH = 0;
            for (let i = start; i < end; i++) {
                rowMaxH = Math.max(rowMaxH, heights[i]);
            }
            totalHeight += rowMaxH;
            if (row < rowCount - 1) totalHeight += CARD_SPACING;
        }
        return { totalHeight, rowCount };
    }

    /**
     * Calculate the pixel width of a sub-group grid (columns of cards).
     */
    function calcGridWidth(count: number, cardWidth: number, maxPerRow: number): number {
        if (count === 0) return 0;
        const cols = Math.min(count, maxPerRow);
        return cols * cardWidth + (cols - 1) * CARD_SPACING;
    }

    // Build lookups for test cases:
    //   tcByStory:    storyId  -> tc[]   (TCs that have a storyId — render below their story)
    //   tcByEpicOnly: epicId   -> tc[]   (TCs with epicId but NO storyId — render in their own sub-column)
    //   orphanTestCases:        tc[]     (no epicId, no storyId — placed below all epic rows)
    const tcByStory = new Map<string, any[]>();
    const tcByEpicOnly = new Map<string, any[]>();
    const orphanTestCases: any[] = [];

    if (state.testCases?.length) {
        const storyToEpic = new Map<string, string>();
        if (state.epics) {
            state.epics.forEach((epic: any, i: number) => {
                const eId = epic.id || `epic-${i}`;
                (epic.stories || []).forEach((s: any, si: number) => {
                    storyToEpic.set(s.id || `story-${i}-${si}`, eId);
                });
            });
        }

        state.testCases.forEach((tc: any) => {
            // Clone the TC so we never mutate store objects during layout
            const tcCopy = { ...tc };
            if (tcCopy.storyId) {
                // Story-linked TC: bucket by storyId; also resolve epicId if missing
                if (!tcCopy.epicId) tcCopy.epicId = storyToEpic.get(tcCopy.storyId);
                if (!tcByStory.has(tcCopy.storyId)) tcByStory.set(tcCopy.storyId, []);
                tcByStory.get(tcCopy.storyId)!.push(tcCopy);
            } else if (tcCopy.epicId) {
                // Epic-level TC (no story link): goes in its own sub-column
                if (!tcByEpicOnly.has(tcCopy.epicId)) tcByEpicOnly.set(tcCopy.epicId, []);
                tcByEpicOnly.get(tcCopy.epicId)!.push(tcCopy);
            } else {
                orphanTestCases.push(tcCopy);
            }
        });
    }

    if (state.epics) {
        let currentRowY = Math.max(yOffsets.epic, yOffsets.story, yOffsets['use-case']);

        // Collect reverse deps (blocks → blocked) for post-pass injection
        const reverseDeps: Array<{ blockedId: string; blockerId: string }> = [];

        state.epics.forEach((epic: any, index: number) => {
            const epicId = epic.id || `epic-${index}`;
            const epicTitle = epic.title;
            const epicDescription = epic.goal || epic.description || '';

            const hasVerbose = epic.useCases || epic.fitCriteria || epic.successMetrics || epic.risks || epic.definitionOfDone;
            let extraHeight = hasVerbose ? 30 : 0;
            // Agile roll-up badges (done/total stories, total story points) add ~22px
            if (epic.stories && epic.stories.length > 0) extraHeight += 22;
            const epicHeight = calculateCardHeight('epic', epicTitle, epicDescription, extraHeight);

            // --- Pre-compute use-case heights ---
            const ucHeights: number[] = [];
            if (epic.useCases) {
                epic.useCases.forEach((useCase: any, ucIndex: number) => {
                    const ucTitle = useCase.title || useCase.name || `Use Case ${ucIndex + 1}`;
                    const ucDescription = useCase.scenario?.context || useCase.description || '';
                    ucHeights.push(calculateCardHeight('use-case', ucTitle, ucDescription, 20));
                });
            }

            // --- Pre-compute epic-level-only test case heights (no storyId) ---
            // Epic-only TCs are consolidated into a single test-coverage card
            const TC_COVERAGE_BAR_EXTRA = 50;   // extra pixels for the coverage bar (stats + track + pct)
            const epicOnlyTCs = tcByEpicOnly.get(epicId) || [];
            const epicOnlyTCHeights: number[] = epicOnlyTCs.length > 0
                ? [calculateCardHeight('test-coverage', `Test Coverage (${epicOnlyTCs.length})`, `pass/fail/draft summary`, TC_COVERAGE_BAR_EXTRA)]
                : [];

            // Epic-level risks are kept in the epic's metadata for the detail
            // panel but NOT rendered as separate cards.  Risks are shown only in
            // the Planning lane under PRD / BMM.

            // --- Pre-compute epic test-strategy height (per-epic) ---
            const epicTestStrategy = epic.testStrategy;
            const tsHeight = epicTestStrategy
                ? calculateCardHeight('test-strategy', epicTestStrategy.title || 'Test Strategy', epicTestStrategy.scope || epicTestStrategy.approach || '')
                : 0;

            // --- Per-story TC stacks: story card height + Tasks + optional Test Coverage card ---
            // Story-linked TCs are consolidated into a single "test-coverage" card per story.
            // This card is always visible (no chip/mini/semantic-zoom logic).
            const TC_UNDER_STORY_INDENT = 8;   // horizontal left-indent for TCs/Tasks under their story
            const TC_UNDER_STORY_GAP   = 6;    // vertical gap between story bottom and first child
            const storyHeights: number[] = [];        // individual story card heights (for story placement)
            const storyStackHeights: number[] = [];   // total height of each story+Task+TC-coverage block
            const storyTCsPerStory: any[][] = [];     // tc[] per story (parallel to epic.stories)
            const storyTasksPerStory: any[][] = [];   // task[] per story (parallel to epic.stories)
            const storyTCHeights: number[] = [];      // computed TC card height per story
            if (epic.stories) {
                epic.stories.forEach((story: any) => {
                    const storyDescription = story.userStory
                        ? `As a ${story.userStory.asA}, I want ${story.userStory.iWant}, so that ${story.userStory.soThat}`
                        : '';
                    const acCount = story.acceptanceCriteria?.length || 0;
                    const storyTCs = tcByStory.get(story.id) || [];

                    // Account for all rendered sections that add height beyond base:
                    // - Parent epic label row (~20px, always present for stories under epics)
                    // - Acceptance criteria chip row (25px when present)
                    // - Agile badges row (~22px when priority or storyPoints present)
                    // - Dependency badges row (~33px when blockedBy or blocks present)
                    let storyExtras = 20; // parent epic label — always rendered for stories under an epic
                    if (acCount > 0) storyExtras += 25;
                    if (story.priority || story.storyPoints !== undefined) storyExtras += 22;
                    const blockedBy = story.dependencies?.blockedBy?.length ?? 0;
                    const blocks = story.dependencies?.blocks?.length ?? 0;
                    if (blockedBy > 0 || blocks > 0) storyExtras += 33;

                    const sh = calculateCardHeight('story', story.title, storyDescription, storyExtras);
                    storyHeights.push(sh);

                    storyTCsPerStory.push(storyTCs);

                    const storyTasks = story.tasks || [];
                    storyTasksPerStory.push(storyTasks);

                    // Tasks contribute to stack height
                    let taskStackH = 0;
                    if (storyTasks.length > 0) {
                        taskStackH = TC_UNDER_STORY_GAP;
                        storyTasks.forEach((task: any) => {
                            const taskDesc = task.description || '';
                            taskStackH += calculateCardHeight('task', taskDesc.substring(0, 40) || 'Task', taskDesc) + CARD_SPACING;
                        });
                    }

                    // Test coverage card contributes to stack height when TCs exist
                    let tcCoverageStackH = 0;
                    if (storyTCs.length > 0) {
                        const passCount = storyTCs.filter((tc: any) => tc.status === 'complete' || tc.status === 'completed' || tc.status === 'done' || tc.status === 'passed').length;
                        const failCount = storyTCs.filter((tc: any) => tc.status === 'blocked' || tc.status === 'rejected' || tc.status === 'failed').length;
                        const draftCount = storyTCs.filter((tc: any) => !tc.status || tc.status === 'draft' || tc.status === 'ready').length;
                        const tcTitle = `Test Coverage (${storyTCs.length})`;
                        const tcDesc = `${passCount} pass, ${failCount} fail, ${draftCount} draft`;
                        const tcH = calculateCardHeight('test-coverage', tcTitle, tcDesc, TC_COVERAGE_BAR_EXTRA);
                        storyTCHeights.push(tcH);
                        tcCoverageStackH = TC_UNDER_STORY_GAP + tcH;
                    } else {
                        storyTCHeights.push(0);
                    }

                    storyStackHeights.push(sh + taskStackH + tcCoverageStackH);
                });
            }

            // --- Grid heights for stories-column (using stack heights), use-cases, and epic-only TCs ---
            const storyCount = storyHeights.length;
            const ucCount = ucHeights.length;
            const epicOnlyTCCount = epicOnlyTCHeights.length;
            // Stories: single row (pass storyCount as maxPerRow so they never wrap)
            const { totalHeight: storiesGridHeight } = calcGridHeight(storyCount, storyStackHeights, Math.max(storyCount, 1));
            // Use-cases: single row
            const { totalHeight: ucGridHeight } = calcGridHeight(ucCount, ucHeights, Math.max(ucCount, 1));
            // Epic-only TCs: single row
            const { totalHeight: epicOnlyTCGridHeight } = calcGridHeight(epicOnlyTCCount, epicOnlyTCHeights, Math.max(epicOnlyTCCount, 1));

            // --- Sub-group X positions (vertical layout: use-cases row, then test-strategy, then epic-only TCs, then stories) ---
            // All sub-groups start at the same X. Each gets its own vertical row.
            // When stories have Tasks or TC-coverage cards beneath them, they are indented by TC_UNDER_STORY_INDENT
            // and may extend beyond the story card width. Account for this in the column width.
            const hasStoryChildren = storyTasksPerStory.some((tasks: any[]) => tasks.length > 0) ||
                storyTCsPerStory.some((tcs: any[]) => tcs.length > 0);
            const effectiveStoryCardWidth = hasStoryChildren
                ? Math.max(CARD_WIDTHS.story, TC_UNDER_STORY_INDENT + Math.max(CARD_WIDTHS.task, CARD_WIDTHS['test-coverage']) + 10)
                : CARD_WIDTHS.story;
            const storiesSubColWidth = calcGridWidth(storyCount, effectiveStoryCardWidth, Math.max(storyCount, 1));
            const ucSubColWidth = calcGridWidth(ucCount, CARD_WIDTHS['use-case'], Math.max(ucCount, 1));

            const storiesSubColX = CHILDREN_START_X;
            const ucSubColX = CHILDREN_START_X;           // same X — own row below stories
            const epicOnlyTCSubColX = CHILDREN_START_X;   // same X — own row below use-cases

            // Label height added above each non-empty sub-group
            const labelOffset = SUBGROUP_LABEL_HEIGHT;

            // --- Vertical row Y offsets (each sub-group stacks below the previous) ---
            const storiesRowHeight = storyCount > 0 ? labelOffset + storiesGridHeight : 0;
            const ucRowHeight = ucCount > 0 ? labelOffset + ucGridHeight : 0;
            const epicOnlyTCRowHeight = epicOnlyTCCount > 0 ? labelOffset + epicOnlyTCGridHeight : 0;
            const tsRowHeight = epicTestStrategy ? labelOffset + tsHeight : 0;

            // Row height = sum of all sub-group rows (vertically stacked).
            // Order: use-cases -> test-strategy -> epic-only TCs -> stories (last)
            const prevHeightBeforeTS = ucRowHeight;
            const prevHeightBeforeTC = prevHeightBeforeTS + (prevHeightBeforeTS > 0 && tsRowHeight > 0 ? SUBGROUP_GAP : 0) + tsRowHeight;
            const prevHeightBeforeStories = prevHeightBeforeTC + (prevHeightBeforeTC > 0 && epicOnlyTCRowHeight > 0 ? SUBGROUP_GAP : 0) + epicOnlyTCRowHeight;
            const totalSubgroupHeight = prevHeightBeforeStories + (prevHeightBeforeStories > 0 && storiesRowHeight > 0 ? SUBGROUP_GAP : 0) + storiesRowHeight;
            const rowContentHeight = Math.max(epicHeight, totalSubgroupHeight);
            const rowHeight = rowContentHeight + ROW_PADDING * 2;
            const rowTop = currentRowY + ROW_PADDING;

            // Per-row Y positions within the epic row band
            const ucRowY = rowTop;
            const tsRowY = rowTop + prevHeightBeforeTS + (prevHeightBeforeTS > 0 && tsRowHeight > 0 ? SUBGROUP_GAP : 0);
            const epicOnlyTCRowY = rowTop + prevHeightBeforeTC + (prevHeightBeforeTC > 0 && epicOnlyTCRowHeight > 0 ? SUBGROUP_GAP : 0);
            const storiesRowY = rowTop + prevHeightBeforeStories + (prevHeightBeforeStories > 0 && storiesRowHeight > 0 ? SUBGROUP_GAP : 0);

            const parentReqId = epic.functionalRequirements?.[0] || null;

            // --- Roll-up: total story points and done/total story count ---
            let totalStoryPoints = 0;
            let doneStoryCount = 0;
            if (epic.stories) {
                epic.stories.forEach((s: any) => {
                    totalStoryPoints += (s.storyPoints || 0);
                    if (s.status === 'done' || s.status === 'complete') doneStoryCount++;
                });
            }

            // Build epic dependencies: functional requirements + upstream epic deps
            const epicDeps: string[] = [...(epic.functionalRequirements || [])];
            // upstream = epics this depends on → arrow FROM upstream TO this epic
            // Items may be objects {epicId, reason} or plain string IDs
            if (epic.epicDependencies?.upstream) {
                for (const item of epic.epicDependencies.upstream) {
                    const id = typeof item === 'string' ? item : item?.epicId;
                    if (id) epicDeps.push(id);
                }
            }
            // downstream = epics that depend on this → arrow FROM this epic TO downstream
            // Use reverseDeps post-pass (same pattern as story blocks)
            if (epic.epicDependencies?.downstream) {
                for (const item of epic.epicDependencies.downstream) {
                    const downstreamId = typeof item === 'string' ? item : item?.epicId;
                    if (downstreamId) {
                        reverseDeps.push({ blockedId: downstreamId, blockerId: epicId });
                    }
                }
            }
            // relatedEpics: bidirectional arrows — add both directions via reverseDeps
            if (epic.epicDependencies?.relatedEpics) {
                for (const relId of epic.epicDependencies.relatedEpics) {
                    if (relId && relId !== epicId) {
                        epicDeps.push(relId);
                        // Also add reverse so the other epic draws an arrow back
                        reverseDeps.push({ blockedId: epicId, blockerId: relId });
                    }
                }
            }

            const totalTaskCount = storyTasksPerStory.reduce((sum, arr) => sum + arr.length, 0);

            const epicChildBreakdown: { label: string; count: number; types: string[] }[] = [];
            if (ucCount > 0) epicChildBreakdown.push({ label: 'UCs', count: ucCount, types: ['use-case'] });
            if (epicTestStrategy) epicChildBreakdown.push({ label: 'Test Strategy', count: 1, types: ['test-strategy'] });
            if (epicOnlyTCCount > 0) epicChildBreakdown.push({ label: 'Tests', count: epicOnlyTCs.length, types: ['test-coverage', 'test-case'] });
            if (storyCount > 0) epicChildBreakdown.push({ label: 'Stories', count: storyCount, types: ['story'] });
            if (totalTaskCount > 0) epicChildBreakdown.push({ label: 'Tasks', count: totalTaskCount, types: ['task'] });

            artifacts.push({
                id: epicId,
                type: 'epic',
                title: epicTitle,
                description: epicDescription,
                status: epic.status || 'draft',
                position: { x: COLUMNS.epic, y: rowTop },
                size: { width: CARD_WIDTHS.epic, height: epicHeight },
                dependencies: epicDeps,
                parentId: parentReqId,
                childCount: storyCount + ucCount + epicOnlyTCCount + (epicTestStrategy ? 1 : 0) + totalTaskCount,
                childBreakdown: epicChildBreakdown,
                rowY: currentRowY,
                rowHeight,
                metadata: {
                    // Core planning fields
                    goal: epic.goal,
                    valueDelivered: epic.valueDelivered,
                    priority: epic.priority,
                    acceptanceSummary: epic.acceptanceSummary,
                    effortEstimate: epic.effortEstimate,
                    epicDependencies: epic.epicDependencies,
                    implementationNotes: epic.implementationNotes,
                    technicalSummary: epic.technicalSummary,
                    // Requirements links
                    functionalRequirements: epic.functionalRequirements,
                    nonFunctionalRequirements: epic.nonFunctionalRequirements,
                    additionalRequirements: epic.additionalRequirements,
                    // Verbose sections
                    useCases: epic.useCases,
                    fitCriteria: epic.fitCriteria,
                    successMetrics: epic.successMetrics,
                    risks: epic.risks,
                    definitionOfDone: epic.definitionOfDone,
                    // Roll-up aggregates computed from child stories
                    totalStoryPoints: totalStoryPoints > 0 ? totalStoryPoints : undefined,
                    doneStoryCount,
                    totalStoryCount: storyCount,
                    // Sub-group geometry for label rendering in Canvas
                    subGroups: {
                        ...(storyCount > 0 ? { stories: { x: storiesSubColX, y: storiesRowY + labelOffset, width: storiesSubColWidth } } : {}),
                        ...(ucCount > 0 ? { useCases: { x: ucSubColX, y: ucRowY + labelOffset, width: ucSubColWidth } } : {}),
                        ...(epicTestStrategy ? { testStrategy: { x: CHILDREN_START_X, y: tsRowY + labelOffset, width: CARD_WIDTHS['test-strategy'] } } : {}),
                        ...(epicOnlyTCCount > 0 ? { testCases: { x: epicOnlyTCSubColX, y: epicOnlyTCRowY + labelOffset, width: CARD_WIDTHS['test-coverage'] } } : {})
                    }
                }
            });

            // --- Place stories + their linked TCs below each story card ---
            if (epic.stories) {
                let currentRowMaxH = 0;
                let gridRowY = storiesRowY + labelOffset;
                epic.stories.forEach((story: any, storyIndex: number) => {
                    // Stories always in a single horizontal row (no wrapping)
                    const col = storyIndex;
                    const storyHeight = storyHeights[storyIndex];
                    const storyX = storiesSubColX + col * (effectiveStoryCardWidth + CARD_SPACING);

                    // Track the full stack height (story + TCs below it) for row height
                    currentRowMaxH = Math.max(currentRowMaxH, storyStackHeights[storyIndex]);

                    const storyDescription = story.userStory
                        ? `As a ${story.userStory.asA}, I want ${story.userStory.iWant}, so that ${story.userStory.soThat}`
                        : '';

                    // Collect cross-story dependency arrows from StoryDependencies fields.
                    // blockedBy items may be objects {storyId, title, ...} or plain string IDs.
                    // blockedBy → arrow FROM blocker TO this story (this story depends on blocker)
                    // blocks → handled via post-pass (the blocked story depends on this story)
                    const storyDeps: string[] = [];
                    if (story.dependencies) {
                        const sd = story.dependencies;
                        (sd.blockedBy || []).forEach((item: any) => {
                            const id = typeof item === 'string' ? item : item?.storyId;
                            if (id) storyDeps.push(id);
                        });
                        // blocks: collect for post-pass — arrow direction is reversed
                        // (this story blocks them, so THEY depend on THIS story)
                        (sd.blocks || []).forEach((item: any) => {
                            const blockedId = typeof item === 'string' ? item : item?.storyId;
                            if (blockedId) {
                                const blockerId = story.id || `story-${index}-${storyIndex}`;
                                reverseDeps.push({ blockedId, blockerId });
                            }
                        });
                        (sd.relatedStories || []).forEach((id: string) => storyDeps.push(id));
                    }

                    const storyId = story.id || `story-${index}-${storyIndex}`;

                    artifacts.push({
                        id: storyId,
                        type: 'story',
                        title: story.title,
                        description: storyDescription,
                        status: story.status || 'draft',
                        position: { x: storyX, y: gridRowY },
                        size: { width: CARD_WIDTHS.story, height: storyHeight },
                        dependencies: storyDeps,
                        parentId: epicId,
                        // childCount: tasks + optional test-coverage card
                        childCount: (storyTasksPerStory[storyIndex]?.length || 0) + (storyTCsPerStory[storyIndex]?.length > 0 ? 1 : 0),
                        metadata: {
                            userStory: story.userStory,
                            acceptanceCriteria: story.acceptanceCriteria,
                            technicalNotes: story.technicalNotes,
                            storyPoints: story.storyPoints,
                            epicId: epicId,
                            epicTitle: epic.title,
                            dependencies: story.dependencies,
                            devNotes: story.devNotes,
                            tasks: story.tasks,
                            labels: story.labels,
                            estimatedEffort: story.estimatedEffort,
                            priority: story.priority,
                            assignee: story.assignee,
                            implementationDetails: story.implementationDetails
                        }
                    });

                    // --- Place Tasks linked to this story below the story card ---
                    // (Tasks are always visible — they are not chip-mode.)
                    const storyTaskList = storyTasksPerStory[storyIndex];
                    let taskBottomY = gridRowY + storyHeight; // where tasks end (start if no tasks)
                    if (storyTaskList.length > 0) {
                        let taskY = gridRowY + storyHeight + TC_UNDER_STORY_GAP;
                        const taskX = storyX + TC_UNDER_STORY_INDENT;
                        storyTaskList.forEach((task: any, taskIdx: number) => {
                            const taskId = task.id || `task-${storyId}-${taskIdx}`;
                            const taskTitle = (task.description || '').substring(0, 50) || `Task ${taskIdx + 1}`;
                            const taskDesc = task.description || '';
                            const taskH = calculateCardHeight('task', taskTitle, taskDesc);
                            artifacts.push({
                                id: taskId,
                                type: 'task',
                                title: taskTitle,
                                description: taskDesc,
                                status: task.completed ? 'complete' : 'draft',
                                position: { x: taskX, y: taskY },
                                size: { width: CARD_WIDTHS.task, height: taskH },
                                dependencies: [],
                                parentId: storyId,
                                metadata: {
                                    acReference: task.acReference,
                                    estimatedHours: task.estimatedHours,
                                    completed: task.completed,
                                    subtasks: task.subtasks,
                                    storyId: storyId,
                                    epicId: epicId
                                }
                            });
                            taskY += taskH + CARD_SPACING;
                        });
                        taskBottomY = taskY; // track where tasks end
                    }

                    // --- Story-linked TCs: emit as a single consolidated test-coverage card ---
                    const linkedTCs = storyTCsPerStory[storyIndex];
                    if (linkedTCs.length > 0) {
                        const tcCardY = taskBottomY + TC_UNDER_STORY_GAP;
                        const tcCardX = storyX + TC_UNDER_STORY_INDENT;
                        const passCount = linkedTCs.filter((tc: any) => tc.status === 'complete' || tc.status === 'completed' || tc.status === 'done' || tc.status === 'passed').length;
                        const failCount = linkedTCs.filter((tc: any) => tc.status === 'blocked' || tc.status === 'rejected' || tc.status === 'failed').length;
                        const draftCount = linkedTCs.filter((tc: any) => !tc.status || tc.status === 'draft' || tc.status === 'ready').length;
                        artifacts.push({
                            id: `TC-COV-${storyId}`,
                            type: 'test-coverage',
                            title: `Test Coverage (${linkedTCs.length})`,
                            description: `${passCount} pass, ${failCount} fail, ${draftCount} draft`,
                            status: failCount > 0 ? 'blocked' : passCount === linkedTCs.length ? 'complete' : 'draft',
                            position: { x: tcCardX, y: tcCardY },
                            size: { width: CARD_WIDTHS['test-coverage'], height: storyTCHeights[storyIndex] },
                            dependencies: [],
                            parentId: storyId,
                            metadata: {
                                storyId: storyId,
                                epicId: epicId,
                                testCases: linkedTCs.map((tc: any, tcIdx: number) => ({
                                    id: tc.id || `TC-${storyId}-${tcIdx}`,
                                    title: tc.title || `Test Case ${tcIdx + 1}`,
                                    status: tc.status || 'draft',
                                    type: tc.type,
                                    description: tc.description,
                                    steps: tc.steps,
                                    expectedResult: tc.expectedResult,
                                    preconditions: tc.preconditions,
                                    priority: tc.priority,
                                    tags: tc.tags,
                                    relatedRequirements: tc.relatedRequirements
                                })),
                                totalCount: linkedTCs.length,
                                passCount,
                                failCount,
                                draftCount
                            }
                        });
                    }

                });
            }

            // --- Place use-cases in a wrapping horizontal grid, in their own row below stories ---
            if (epic.useCases) {
                const ucStartY = ucRowY + labelOffset;
                let currentRowMaxH = 0;
                let gridRowY = ucStartY;

                epic.useCases.forEach((useCase: any, ucIndex: number) => {
                    // Use-cases always in a single horizontal row (no wrapping)
                    const col = ucIndex;
                    const ucHeight = ucHeights[ucIndex];
                    const ucX = ucSubColX + col * (CARD_WIDTHS['use-case'] + CARD_SPACING);

                    currentRowMaxH = Math.max(currentRowMaxH, ucHeight);

                    const ucTitle = useCase.title || useCase.name || `Use Case ${ucIndex + 1}`;
                    const ucDescription = useCase.scenario?.context || useCase.description || '';

                    artifacts.push({
                        id: useCase.id || `UC-${epicId}-${ucIndex}`,
                        type: 'use-case',
                        title: ucTitle,
                        description: ucDescription,
                        status: useCase.status || 'draft',
                        position: { x: ucX, y: gridRowY },
                        size: { width: CARD_WIDTHS['use-case'], height: ucHeight },
                        dependencies: [],
                        parentId: epicId,
                        metadata: {
                            scenario: useCase.scenario,
                            actors: useCase.actors,
                            preconditions: useCase.preconditions,
                            postconditions: useCase.postconditions,
                            mainFlow: useCase.mainFlow,
                            alternativeFlows: useCase.alternativeFlows,
                            exceptionFlows: useCase.exceptionFlows,
                            epicId: epicId,
                            summary: useCase.summary || useCase.scenario?.context,
                            primaryActor: useCase.primaryActor,
                            secondaryActors: useCase.secondaryActors,
                            trigger: useCase.trigger,
                            businessRules: useCase.businessRules,
                            relatedRequirements: useCase.relatedRequirements,
                            relatedEpic: useCase.relatedEpic || epicId,
                            relatedStories: useCase.relatedStories,
                            sourceDocument: useCase.sourceDocument,
                            notes: useCase.notes,
                            priority: useCase.priority
                        }
                    });
                });
            }

            // --- Place per-epic test-strategy in its own row below use-cases ---
            if (epicTestStrategy) {
                const tsCardY = tsRowY + labelOffset;
                const tsTitle = epicTestStrategy.title || 'Test Strategy';
                const tsDescription = epicTestStrategy.scope || epicTestStrategy.approach || '';

                artifacts.push({
                    id: epicTestStrategy.id || `TS-${epicId}`,
                    type: 'test-strategy',
                    title: tsTitle,
                    description: tsDescription,
                    status: epicTestStrategy.status || 'draft',
                    position: { x: CHILDREN_START_X, y: tsCardY },
                    size: { width: CARD_WIDTHS['test-strategy'], height: tsHeight },
                    dependencies: [],
                    parentId: epicId,
                    metadata: {
                        ...epicTestStrategy,
                        epicId: epicId
                    }
                });
            }

            // --- Place epic-level TCs (no storyId) as a consolidated test-coverage card ---
            if (epicOnlyTCs.length > 0) {
                const tcStartY = epicOnlyTCRowY + labelOffset;
                const passCount = epicOnlyTCs.filter((tc: any) => tc.status === 'complete' || tc.status === 'completed' || tc.status === 'done' || tc.status === 'passed').length;
                const failCount = epicOnlyTCs.filter((tc: any) => tc.status === 'blocked' || tc.status === 'rejected' || tc.status === 'failed').length;
                const draftCount = epicOnlyTCs.filter((tc: any) => !tc.status || tc.status === 'draft' || tc.status === 'ready').length;
                const tcCovHeight = calculateCardHeight('test-coverage', `Test Coverage (${epicOnlyTCs.length})`, `${passCount} pass, ${failCount} fail, ${draftCount} draft`, TC_COVERAGE_BAR_EXTRA);

                artifacts.push({
                    id: `TC-COV-${epicId}`,
                    type: 'test-coverage',
                    title: `Test Coverage (${epicOnlyTCs.length})`,
                    description: `${passCount} pass, ${failCount} fail, ${draftCount} draft`,
                    status: failCount > 0 ? 'blocked' : passCount === epicOnlyTCs.length ? 'complete' : 'draft',
                    position: { x: epicOnlyTCSubColX, y: tcStartY },
                    size: { width: CARD_WIDTHS['test-coverage'], height: tcCovHeight },
                    dependencies: [],
                    parentId: epicId,
                    metadata: {
                        epicId: epicId,
                        testCases: epicOnlyTCs.map((tc: any, tcIdx: number) => ({
                            id: tc.id || `TC-${epicId}-${tcIdx}`,
                            title: tc.title || `Test Case ${tcIdx + 1}`,
                            status: tc.status || 'draft',
                            type: tc.type,
                            description: tc.description,
                            steps: tc.steps,
                            expectedResult: tc.expectedResult,
                            preconditions: tc.preconditions,
                            priority: tc.priority,
                            tags: tc.tags,
                            relatedRequirements: tc.relatedRequirements
                        })),
                        totalCount: epicOnlyTCs.length,
                        passCount,
                        failCount,
                        draftCount
                    }
                });
            }

            // Advance to the next epic row
            currentRowY += rowHeight + CARD_SPACING;
        });

        // Post-pass: inject reverse dependency arrows.
        // Handles story "blocks" (A blocks B → B depends on A),
        // epic "downstream" (A enables B → B depends on A),
        // and bidirectional "relatedEpics" links.
        for (const { blockedId, blockerId } of reverseDeps) {
            const blockedArtifact = artifacts.find(a => a.id === blockedId);
            if (blockedArtifact && !blockedArtifact.dependencies.includes(blockerId)) {
                blockedArtifact.dependencies.push(blockerId);
            }
        }

        // Track bottom of all epic rows so orphan test cards / test strategy start below them
        yOffsets['test-strategy'] = Math.max(yOffsets['test-strategy'], currentRowY);
        yOffsets['test-case'] = yOffsets['test-strategy'];
    }

    // =========================================================================
    // TESTING PHASE (Test Strategy + orphan Test Cases with no epic/story link)
    // Placed below all epic rows.
    // =========================================================================

    const hasOrphanTests = state.testStrategy || orphanTestCases.length > 0;
    if (hasOrphanTests) {
        const testingStartY = Math.max(
            yOffsets['test-strategy'],
            yOffsets['test-case']
        ) + CARD_SPACING;

        // Track the testing section row band geometry
        const testingRowY = testingStartY - ROW_PADDING;
        let testingRowBottomY = testingStartY;

        if (state.testStrategy) {
            const ts = state.testStrategy;
            const title = ts.title || 'Test Strategy';
            const description = ts.scope || ts.approach || '';
            const height = calculateCardHeight('test-strategy', title, description);
            // Test strategy sits in the epic column (x=1070) — same visual column as epics,
            // so it never overlaps with test-case cards that start at x=1390.
            artifacts.push({
                id: ts.id || 'TS-1',
                type: 'test-strategy',
                title,
                description,
                status: ts.status || 'draft',
                position: { x: COLUMNS['epic'], y: testingStartY },
                size: { width: CARD_WIDTHS['test-strategy'], height },
                dependencies: state.vision ? ['vision-1'] : (state.prd ? [state.prd.id || 'prd-1'] : []),
                // Row band info so Canvas can render a "Testing" section band
                rowY: testingRowY,
                rowHeight: 0, // will be updated below
                metadata: ts
            });
            testingRowBottomY = Math.max(testingRowBottomY, testingStartY + height);
            yOffsets['test-strategy'] = testingStartY + height + CARD_SPACING;
            yOffsets['test-case'] = testingStartY; // orphan test cases start alongside the strategy row
        }

        if (orphanTestCases.length > 0) {
            const tcRowStartY = state.testStrategy
                ? testingStartY  // same row as strategy card, offset to story column
                : testingStartY;

            // Consolidate all orphan test cases into a single test-coverage card
            const passCount = orphanTestCases.filter((tc: any) => tc.status === 'complete' || tc.status === 'completed' || tc.status === 'done' || tc.status === 'passed').length;
            const failCount = orphanTestCases.filter((tc: any) => tc.status === 'blocked' || tc.status === 'rejected' || tc.status === 'failed').length;
            const draftCount = orphanTestCases.filter((tc: any) => !tc.status || tc.status === 'draft' || tc.status === 'ready').length;
            const tcCovTitle = `Test Coverage (${orphanTestCases.length})`;
            const tcCovDesc = `${passCount} pass, ${failCount} fail, ${draftCount} draft`;
            const tcCovHeight = calculateCardHeight('test-coverage', tcCovTitle, tcCovDesc);

            artifacts.push({
                id: 'TC-COV-ORPHAN',
                type: 'test-coverage',
                title: tcCovTitle,
                description: tcCovDesc,
                status: failCount > 0 ? 'blocked' : passCount === orphanTestCases.length ? 'complete' : 'draft',
                position: { x: CHILDREN_START_X, y: tcRowStartY },
                size: { width: CARD_WIDTHS['test-coverage'], height: tcCovHeight },
                dependencies: [],
                parentId: state.testStrategy?.id || 'TS-1',
                metadata: {
                    testCases: orphanTestCases.map((tc: any, idx: number) => ({
                        id: tc.id || `TC-${idx + 1}`,
                        title: tc.title || `Test Case ${idx + 1}`,
                        status: tc.status || 'draft',
                        type: tc.type,
                        description: tc.description,
                        steps: tc.steps,
                        expectedResult: tc.expectedResult,
                        preconditions: tc.preconditions,
                        priority: tc.priority,
                        tags: tc.tags,
                        relatedRequirements: tc.relatedRequirements,
                        storyId: tc.storyId,
                        epicId: tc.epicId
                    })),
                    totalCount: orphanTestCases.length,
                    passCount,
                    failCount,
                    draftCount
                }
            });

            testingRowBottomY = Math.max(testingRowBottomY, tcRowStartY + tcCovHeight);
        }

        // Set the final rowHeight on the test-strategy artifact so Canvas can
        // render a "Testing" row band that encompasses all orphan TCs.
        const tsArtifact = artifacts.find((a: any) => a.type === 'test-strategy');
        if (tsArtifact) {
            tsArtifact.rowHeight = testingRowBottomY - testingRowY + ROW_PADDING * 2;
        }
    }

    // =========================================================================
    // POST-PROCESSING: Architecture → Epic arrows (REMOVED)
    // Previously injected the architecture ID into every epic's dependencies,
    // but this created redundant structural arrows that added visual noise
    // without conveying actionable dependency information.  The architecture
    // relationship is already implied by the spatial layout hierarchy.
    // =========================================================================

    return artifacts;
}

/**
 * Send current store artifacts to a webview panel.
 * Safe to call even if the panel has been disposed — errors are silently swallowed.
 */
export function sendArtifactsToPanel(panel: vscode.WebviewPanel, store: ArtifactStore): void {
    try {
        const state = store.getState();
        const artifacts = buildArtifacts(store);
        panel.webview.postMessage({
            type: 'updateArtifacts',
            artifacts
        });
        logger.debug(`Sent ${artifacts.length} artifacts to canvas (${state.epics?.length || 0} epics)`);
    } catch {
        // Panel was disposed — ignore
    }
}
