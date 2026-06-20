import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import type { Epic, Story, FunctionalRequirement, UseCase, ProductBrief, PRD, Architecture, TestCase, TestStrategy } from '../types';

const factoryLog = createLogger('artifact-factory');

/**
 * addEpic — add an epic to the artifacts map.
 */
export function addEpic(artifacts: Map<string, any>, epic: Epic): void {
    const epics = artifacts.get('epics') || [];
    artifacts.set('epics', [...epics, epic]);
}

/**
 * addStory — add a story to the target epic in the artifacts map.
 */
export function addStory(artifacts: Map<string, any>, epicId: string, story: Story): void {
    const epics = artifacts.get('epics') || [];
    const epic = epics.find((e: Epic) => e.id === epicId);
    if (epic) {
        epic.stories.push(story);
        artifacts.set('epics', [...epics]);
    }
}

/** Factory functions extracted from ArtifactStore.
 *  All functions take (artifacts: Map<string,any>, notifyChange: () => void, ...) 
 */

export function addRequirement(artifacts: Map<string, any>, notifyChange: () => void, requirement: FunctionalRequirement): void {
    const requirements = artifacts.get('requirements') || { 
        functional: [], 
        nonFunctional: [], 
        additional: [] 
    };
    requirements.functional.push(requirement);
    artifacts.set('requirements', requirements);
    notifyChange();
}

export function createEpic(artifacts: Map<string, any>, notifyChange: () => void): Epic {
    const epics = artifacts.get('epics') || [];
    // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
    const maxNum = epics.reduce((max: number, e: Epic) => {
        const m = e.id.match(/^EPIC-(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const nextId = maxNum + 1;
    
    const newEpic: Epic = {
        id: `EPIC-${nextId}`,
        title: `New Epic ${nextId}`,
        goal: '',
        functionalRequirements: [],
        status: 'draft',
        stories: []
    };
    
    addEpic(artifacts, newEpic);
    factoryLog.debug(`[ArtifactStore] Created new epic: ${newEpic.id}`);
    return newEpic;
}

export function createStory(artifacts: Map<string, any>, notifyChange: () => void, epicId?: string): Story {
    const epics = artifacts.get('epics') || [];
    
    // Find target epic or create one
    let targetEpic: Epic;
    if (epicId) {
        targetEpic = epics.find((e: Epic) => e.id === epicId);
        if (!targetEpic) {
            throw new Error(`Epic ${epicId} not found`);
        }
    } else if (epics.length > 0) {
        // Do not silently pick epics[0]; callers must supply an explicit epicId
        throw new Error("createStory: epicId is required when epics exist. Pass the parent epic's ID explicitly.");
    } else {
        // Create a new epic first
        targetEpic = createEpic(artifacts, notifyChange);
    }
    
    // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
    const epicNum = targetEpic.id.replace('EPIC-', '');
    const storyMaxNum = (targetEpic.stories || []).reduce((max: number, s: Story) => {
        const m = s.id.match(/^STORY-\d+-(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const storyNum = storyMaxNum + 1;
    
    const newStory: Story = {
        id: `STORY-${epicNum}-${storyNum}`,
        title: `New Story ${storyNum}`,
        userStory: {
            asA: '',
            iWant: '',
            soThat: ''
        },
        acceptanceCriteria: [],
        status: 'draft'
    };
    
    addStory(artifacts, targetEpic.id, newStory);
    factoryLog.debug(`[ArtifactStore] Created new story: ${newStory.id} in ${targetEpic.id}`);
    return newStory;
}

export function createRequirement(artifacts: Map<string, any>, notifyChange: () => void): FunctionalRequirement {
    const requirements = artifacts.get('requirements') || { 
        functional: [], 
        nonFunctional: [], 
        additional: [] 
    };
    // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
    const maxReqNum = requirements.functional.reduce((max: number, r: FunctionalRequirement) => {
        const m = r.id.match(/^FR-(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const nextId = maxReqNum + 1;
    
    const newReq: FunctionalRequirement = {
        id: `FR-${nextId}`,
        title: `New Requirement ${nextId}`,
        description: ''
    };
    
    addRequirement(artifacts, notifyChange, newReq);
    factoryLog.debug(`[ArtifactStore] Created new requirement: ${newReq.id}`);
    return newReq;
}

export function createOrUpdateVision(artifacts: Map<string, any>, notifyChange: () => void): void {
    const currentVision = artifacts.get('vision');
    if (!currentVision) {
        artifacts.set('vision', {
            productName: 'New Product',
            problemStatement: '',
            targetUsers: [],
            valueProposition: '',
            successCriteria: [],
            status: 'draft'
        });
        notifyChange();
        factoryLog.debug(`[ArtifactStore] Created new vision`);
    }
}

export function createUseCase(artifacts: Map<string, any>, notifyChange: () => void, epicId?: string): UseCase {
    const epics = artifacts.get('epics') || [];
    
    // Find target epic or create one
    let targetEpic: Epic;
    if (epicId) {
        targetEpic = epics.find((e: Epic) => e.id === epicId);
        if (!targetEpic) {
            throw new Error(`Epic ${epicId} not found`);
        }
    } else if (epics.length > 0) {
        // Do not silently pick epics[0]; callers must supply an explicit epicId
        throw new Error('createUseCase: epicId is required when epics exist. Pass the parent epic\'s ID explicitly.');
    } else {
        // Create a new epic first
        targetEpic = createEpic(artifacts, notifyChange);
    }
    
    // Initialize useCases array if not present
    if (!targetEpic.useCases) {
        targetEpic.useCases = [];
    }
    
    // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
    const epicNum = targetEpic.id.replace('EPIC-', '');
    const ucMaxNum = (targetEpic.useCases || []).reduce((max: number, uc: UseCase) => {
        const m = uc.id.match(/^UC-\d+-(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const ucNum = ucMaxNum + 1;
    
    const newUseCase: UseCase = {
        id: `UC-${epicNum}-${ucNum}`,
        title: `New Use Case ${ucNum}`,
        summary: '',
        scenario: {
            context: '',
            before: '',
            after: '',
            impact: ''
        }
    };
    
    // Add to epic's useCases array
    targetEpic.useCases.push(newUseCase);
    
    // Update the epic in storage
    const epicIndex = epics.findIndex((e: Epic) => e.id === targetEpic.id);
    if (epicIndex !== -1) {
        epics[epicIndex] = targetEpic;
        artifacts.set('epics', epics);
    }
    
    notifyChange();
    
    factoryLog.debug(`[ArtifactStore] Created new use case: ${newUseCase.id} in ${targetEpic.id}`);
    return newUseCase;
}

export function createProductBrief(artifacts: Map<string, any>, notifyChange: () => void): ProductBrief {
    const existing = artifacts.get('productBrief');
    if (existing) {
        factoryLog.debug(`[ArtifactStore] ProductBrief already exists, returning existing`);
        return existing;
    }
    
    const newBrief: ProductBrief = {
        id: 'product-brief-1',
        productName: 'New Product',
        status: 'draft',
        vision: {
            statement: '',
            problemStatement: ''
        }
    };
    
    artifacts.set('productBrief', newBrief);
    notifyChange();
    factoryLog.debug(`[ArtifactStore] Created new product brief`);
    return newBrief;
}

export function createPRD(artifacts: Map<string, any>, notifyChange: () => void): PRD {
    const existing = artifacts.get('prd');
    if (existing) {
        factoryLog.debug(`[ArtifactStore] PRD already exists, returning existing`);
        return existing;
    }
    
    const newPRD: PRD = {
        id: 'prd-1',
        status: 'draft',
        productOverview: {
            productName: 'New Product',
            purpose: '',
            problemStatement: ''
        }
    };
    
    artifacts.set('prd', newPRD);
    notifyChange();
    factoryLog.debug(`[ArtifactStore] Created new PRD`);
    return newPRD;
}

export function createArchitecture(artifacts: Map<string, any>, notifyChange: () => void): Architecture {
    const existing = artifacts.get('architecture');
    if (existing) {
        factoryLog.debug(`[ArtifactStore] Architecture already exists, returning existing`);
        return existing;
    }
    
    const newArch: Architecture = {
        id: 'architecture-1',
        status: 'draft',
        overview: {
            projectName: 'New Project',
            summary: ''
        },
        decisions: []
    };
    
    artifacts.set('architecture', newArch);
    notifyChange();
    factoryLog.debug(`[ArtifactStore] Created new architecture`);
    return newArch;
}

export function createTestCase(artifacts: Map<string, any>, notifyChange: () => void, storyId?: string, directEpicId?: string): TestCase {
    const testCases: TestCase[] = artifacts.get('testCases') || [];
    // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
    const maxTcNum = testCases.reduce((max: number, tc: TestCase) => {
        const m = tc.id.match(/^TC-(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const nextId = maxTcNum + 1;

    // Determine epicId: derive from story first, then use directly-supplied epicId
    let epicId: string | undefined = directEpicId;
    if (storyId) {
        const epics: Epic[] = artifacts.get('epics') || [];
        for (const epic of epics) {
            if (epic.stories?.some((s: Story) => s.id === storyId)) {
                epicId = epic.id;
                break;
            }
        }
    }

    const newTestCase: TestCase = {
        id: `TC-${nextId}`,
        title: `New Test Case ${nextId}`,
        type: 'acceptance',
        status: 'draft',
        storyId,
        epicId,
        steps: [],
        relatedRequirements: []
    };

    artifacts.set('testCases', [...testCases, newTestCase]);
    notifyChange();
    factoryLog.debug(`[ArtifactStore] Created new test case: ${newTestCase.id}`);
    return newTestCase;
}

export function createTestStrategy(artifacts: Map<string, any>, notifyChange: () => void, epicId?: string): TestStrategy {
    if (epicId) {
        // Per-epic test strategy
        const epics: Epic[] = artifacts.get('epics') || [];
        const epic = epics.find((e: Epic) => e.id === epicId);
        if (epic) {
            if (epic.testStrategy) {
                factoryLog.debug(`[ArtifactStore] TestStrategy already exists on epic ${epicId}, returning existing`);
                return epic.testStrategy;
            }
            // Derive next numeric suffix: scan all epics for existing TS-N ids
            let maxTsNum = 0;
            for (const e of epics) {
                if (e.testStrategy) {
                    const m = e.testStrategy.id.match(/^TS-(\d+)$/);
                    if (m) maxTsNum = Math.max(maxTsNum, parseInt(m[1], 10));
                }
            }
            // Also check the top-level singleton
            const topLevel = artifacts.get('testStrategy');
            if (topLevel) {
                const m = topLevel.id?.match(/^TS-(\d+)$/);
                if (m) maxTsNum = Math.max(maxTsNum, parseInt(m[1], 10));
            }
            const nextId = maxTsNum + 1;

            const newStrategy: TestStrategy = {
                id: `TS-${nextId}`,
                title: `Test Strategy`,
                status: 'draft',
                epicId,
                testTypes: ['unit', 'integration', 'e2e', 'acceptance'],
                tooling: [],
                coverageTargets: [],
                riskAreas: []
            };
            epic.testStrategy = newStrategy;
            artifacts.set('epics', [...epics]);
            notifyChange();
            factoryLog.debug(`[ArtifactStore] Created new test strategy ${newStrategy.id} on epic ${epicId}`);
            return newStrategy;
        }
    }

    // Fallback: project-level singleton (backward compat)
    const existing = artifacts.get('testStrategy');
    if (existing) {
        factoryLog.debug(`[ArtifactStore] TestStrategy already exists, returning existing`);
        return existing;
    }

    const newStrategy: TestStrategy = {
        id: 'TS-1',
        title: 'Test Strategy',
        status: 'draft',
        testTypes: ['unit', 'integration', 'e2e', 'acceptance'],
        tooling: [],
        coverageTargets: [],
        riskAreas: []
    };

    artifacts.set('testStrategy', newStrategy);
    notifyChange();
    factoryLog.debug(`[ArtifactStore] Created new test strategy`);
    return newStrategy;
}

