import type { Epic, Story, FunctionalRequirement, NonFunctionalRequirement, AdditionalRequirement, PriorityLevel, StoryDependencies, StoryDevNotes, StoryDevAgentRecord, StoryHistoryEntry, StoryTask, AcceptanceCriterion, RequirementStatus } from '../types';

/**
 * SchemaMappers — extracted from ArtifactStore.
 * Pure functions that transform raw schema data into typed BMAD artifacts.
 * Zero store dependencies — operates solely on passed-in data.
 */

/**

 * Map epic from schema format to internal Epic type

 */

export function mapSchemaEpicToInternal(epicData: any): Epic | null {

    if (!epicData) return null;

    

    const stories: Story[] = [];

    const useCases: any[] = [];

    

    // Map stories if present, deduplicating by both ID and normalized title

    // (the same story can appear multiple times with different IDs in the data)

    if (epicData.stories && Array.isArray(epicData.stories)) {

        const seenIds = new Set<string>();

        const seenTitles = new Set<string>();

        for (const storyData of epicData.stories) {

            // String refs (e.g. "1.1") are resolved via standalone story files

            // during reconciliation — skip them here to avoid creating placeholders

            if (typeof storyData === 'string') {

                continue;

            }

            const story = mapSchemaStoryToInternal(storyData);

            if (story) {

                const normTitle = story.title.toLowerCase().trim();

                if (seenIds.has(story.id) || seenTitles.has(normTitle)) {

                    continue; // skip duplicate

                }

                seenIds.add(story.id);

                seenTitles.add(normTitle);

                stories.push(story);

            }

        }

    }



    if (epicData.useCases && Array.isArray(epicData.useCases)) {

        epicData.useCases.forEach((uc: any, index: number) => {

            const summary = uc.summary || uc.description || '';

            useCases.push({

                id: uc.id || `UC-${index + 1}`,

                title: uc.title || uc.name || summary || `Use Case ${index + 1}`,

                summary,

                description: uc.description || summary,

                scenario: uc.scenario || { context: '', before: '', after: '', impact: '' },

                actors: uc.actors,

                status: uc.status,

                primaryActor: uc.primaryActor,

                secondaryActors: uc.secondaryActors,

                trigger: uc.trigger,

                preconditions: uc.preconditions,

                postconditions: uc.postconditions,

                mainFlow: uc.mainFlow,

                alternativeFlows: uc.alternativeFlows,

                exceptionFlows: uc.exceptionFlows,

                businessRules: uc.businessRules,

                relatedRequirements: uc.relatedRequirements,

                relatedEpic: uc.relatedEpic,

                relatedStories: uc.relatedStories,

                sourceDocument: uc.sourceDocument,

                notes: uc.notes

            });

        });

    }



    return {

        id: epicData.id || `EPIC-${Date.now()}`,

        title: epicData.title || 'Untitled Epic',

        goal: epicData.goal || epicData.description || '',

        valueDelivered: epicData.valueDelivered,

        functionalRequirements: epicData.functionalRequirements || [],

        nonFunctionalRequirements: epicData.nonFunctionalRequirements || [],

        additionalRequirements: epicData.additionalRequirements || [],

        status: mapStatus(epicData.status) as Epic['status'],

        stories,

        priority: epicData.priority,

        storyCount: epicData.storyCount,

        dependencies: epicData.dependencies,

        epicDependencies: epicData.epicDependencies,

        effortEstimate: epicData.effortEstimate,

        implementationNotes: epicData.implementationNotes,

        acceptanceSummary: epicData.acceptanceSummary,

        // Verbose fields

        useCases,

        fitCriteria: epicData.fitCriteria,

        successMetrics: epicData.successMetrics,

        // Schema $ref wraps risks as {risks: [{risk, mitigation}]} — unwrap to flat Risk[]

        risks: Array.isArray(epicData.risks)

            ? epicData.risks

            : Array.isArray(epicData.risks?.risks)

                ? epicData.risks.risks

                : epicData.risks,

        // Pass the full DoD object through (items, qualityGates, acceptanceSummary)

        definitionOfDone: epicData.definitionOfDone,

        technicalSummary: epicData.technicalSummary,

        // NOTE: Inline testStrategy is a FALLBACK. Standalone test-strategy.json

        // is the authoritative source. This is kept for backward compat with

        // projects that don't have a standalone test-strategy file.

        testStrategy: epicData.testStrategy

    };

}


/**

 * Merge a newly-loaded epic into an existing one in allEpics.

 * Stories are deduplicated by ID and normalised title.

 * Verbose fields (useCases, testStrategy, fitCriteria, etc.) are

 * adopted from the incoming epic when the existing one lacks them,

 * or when the incoming version is richer (more array items).

 * This ensures manually-added use cases, test strategies, etc. are

 * never silently dropped during duplicate detection.

 */

export function mergeEpicDuplicate(existing: Epic, incoming: Epic): void {

    // ── Stories: deduplicate by ID + normalised title ──

    const existingStoryIds = new Set(existing.stories.map((s: Story) => s.id));

    const existingStoryTitles = new Set(existing.stories.map((s: Story) => s.title.toLowerCase().trim()));

    const newStories = incoming.stories.filter((s: Story) =>

        !existingStoryIds.has(s.id) && !existingStoryTitles.has(s.title.toLowerCase().trim())

    );

    existing.stories = [...existing.stories, ...newStories];



    // ── Verbose fields: prefer the richer source ──

    const verboseKeys: (keyof Epic)[] = [

        'useCases', 'testStrategy', 'fitCriteria',

        'successMetrics', 'risks', 'definitionOfDone',

        'technicalSummary'

    ];

    for (const key of verboseKeys) {

        const existingVal = (existing as unknown as Record<string, unknown>)[key];

        const incomingVal = incoming[key];

        if (incomingVal !== undefined && incomingVal !== null) {

            const existingEmpty = existingVal === undefined || existingVal === null

                || (Array.isArray(existingVal) && existingVal.length === 0);

            if (existingEmpty) {

                (existing as unknown as Record<string, unknown>)[key] = incomingVal;

            } else if (Array.isArray(existingVal) && Array.isArray(incomingVal)

                       && incomingVal.length > (existingVal as unknown[]).length) {

                // Incoming has MORE items — prefer it (covers manually added UCs)

                (existing as unknown as Record<string, unknown>)[key] = incomingVal;

            }

        }

    }

}


/**

 * Extract a numeric story ID from various dependency string formats:

 * - "S1.1 — Database Migration Infrastructure (User table...)"  → "1.1"

 * - "S1.1"                                                       → "1.1"

 * - "1.1"                                                        → "1.1"

 * - "STORY-1.1"                                                  → "1.1"

 * - "Story 1.1 - Some Title"                                     → "1.1"

 * - Any unrecognized format                                      → original string

 */

export function extractStoryId(dep: string): string {

    const trimmed = dep.trim();

    // Try: "S1.1", "S1.1 — ...", "STORY-1.1", "Story 1.1 - ..."

    const match = trimmed.match(/^(?:S(?:TORY)?[\s-]*)?(\d+\.\d+)/i);

    if (match) return match[1];

    // Fallback: return as-is (might be a bare ID or unknown format)

    return trimmed;

}


/**

 * Map story from schema format to internal Story type

 */

export function mapSchemaStoryToInternal(storyData: any): Story | null {

    if (!storyData) return null;



    // Map acceptance criteria — supports both GWT and prose formats

    const acceptanceCriteria: AcceptanceCriterion[] = [];

    if (storyData.acceptanceCriteria && Array.isArray(storyData.acceptanceCriteria)) {

        for (const ac of storyData.acceptanceCriteria) {

            if (ac.criterion) {

                // Prose format

                acceptanceCriteria.push({

                    id: ac.id,

                    criterion: ac.criterion,

                    status: ac.status

                });

            } else {

                // GWT format

                acceptanceCriteria.push({

                    id: ac.id,

                    given: ac.given || '',

                    when: ac.when || '',

                    then: ac.then || '',

                    and: ac.and || [],

                    status: ac.status

                });

            }

        }

    }



    // Handle user story format

    let userStory = storyData.userStory;

    if (!userStory || typeof userStory === 'string') {

        // Try to parse from formatted string or create default

        userStory = {

            asA: 'user',

            iWant: storyData.title || 'accomplish a task',

            soThat: 'I can achieve my goal'

        };

    }



    const mapped: any = {

        id: storyData.id || storyData.storyId || `STORY-${Date.now()}`,

        title: storyData.title || 'Untitled Story',

        userStory: {

            asA: userStory.asA || 'user',

            iWant: userStory.iWant || storyData.title || '',

            soThat: userStory.soThat || ''

        },

        acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : [{

            given: 'the feature is implemented',

            when: 'the user uses it',

            then: 'it works as expected'

        }],

        technicalNotes: storyData.technicalNotes,

        status: mapStatus(storyData.status) as Story['status'],

        storyPoints: storyData.storyPoints,

        priority: storyData.priority,

        estimatedEffort: storyData.estimatedEffort,

        storyFormat: storyData.storyFormat,

        background: storyData.background,

        problemStatement: storyData.problemStatement,

        proposedSolution: storyData.proposedSolution,

        solutionDetails: storyData.solutionDetails,

        implementationDetails: storyData.implementationDetails,

        definitionOfDone: storyData.definitionOfDone,

        requirementRefs: storyData.requirementRefs,

        uxReferences: storyData.uxReferences,

        references: storyData.references,

        notes: storyData.notes,

        dependencies: (() => {

            const raw = storyData.dependencies;

            // Already structured object with blockedBy

            if (raw && !Array.isArray(raw) && typeof raw === 'object') {

                // Normalize each blockedBy item to ensure storyId is extractable

                if (Array.isArray(raw.blockedBy)) {

                    raw.blockedBy = raw.blockedBy.map((d: any) =>

                        typeof d === 'string' ? { storyId: extractStoryId(d), title: d } : d

                    );

                }

                return raw;

            }

            // Flat string array → convert to structured format

            if (Array.isArray(raw)) {

                return {

                    blockedBy: raw.map((d: any) => {

                        if (typeof d === 'string') {

                            return { storyId: extractStoryId(d), title: d };

                        }

                        // Already an object (e.g. {storyId: '1.1', title: '...'})

                        return d;

                    }),

                    blocks: [],

                    relatedStories: []

                };

            }

            // No dependencies

            return { blockedBy: [], blocks: [], relatedStories: [] };

        })(),

        tasks: storyData.tasks,

        devNotes: (() => {

            const dn = storyData.devNotes;

            if (!dn || typeof dn !== 'object') return dn;

            // Coerce object items in string-only arrays to strings

            const stringArrayFields = [

                'architecturePatterns', 'securityConsiderations',

                'performanceConsiderations', 'accessibilityConsiderations',

                'edgeCases', 'potentialChallenges'

            ];

            for (const field of stringArrayFields) {

                if (Array.isArray(dn[field])) {

                    dn[field] = dn[field].map((item: any) =>

                        typeof item === 'string' ? item : (item.description || item.name || JSON.stringify(item))

                    );

                }

            }

            // Normalize testingStrategy string → object

            if (typeof dn.testingStrategy === 'string' && dn.testingStrategy) {

                dn.testingStrategy = { unitTests: [dn.testingStrategy] };

            }

            return dn;

        })(),

        devAgentRecord: storyData.devAgentRecord,

        history: storyData.history,

        labels: storyData.labels,

        assignee: storyData.assignee,

        reviewer: storyData.reviewer

    };

    // Capture epicId as transient routing hint (not persisted in epics.json)

    if (storyData.epicId) {

        mapped._sourceEpicId = String(storyData.epicId);

    }

    return mapped;

}


export function mapStatus(status: string | undefined): string {

    if (!status) return 'draft';

    const normalized = status.toLowerCase().trim();



    // ── Pass-through: all canonical statuses used by Story / Epic types ──

    const VALID_STATUSES = new Set([

        'draft', 'ready', 'ready-for-dev', 'in-progress', 'in-review',

        'review', 'ready-for-review', 'blocked', 'complete', 'completed',

        'done', 'approved', 'archived', 'implementing', 'not-started',

        'backlog', 'proposed', 'accepted', 'deprecated', 'superseded', 'rejected'

    ]);

    if (VALID_STATUSES.has(normalized)) return normalized;



    // ── Legacy aliases ──

    if (normalized === 'in_progress') return 'in-progress';

    if (normalized === 'in_review')   return 'in-review';

    if (normalized === 'ready_for_dev') return 'ready-for-dev';

    if (normalized === 'not_started') return 'not-started';

    if (normalized === 'ready_for_review') return 'ready-for-review';



    // Unknown status — default to draft

    return 'draft';

}


/**

 * Map functional requirement from schema

 */

export function mapSchemaRequirement(fr: any): FunctionalRequirement {

    return {

        id: fr.id || '',

        title: fr.title || '',

        description: fr.description || '',

        capabilityArea: fr.capabilityArea,

        relatedEpics: fr.relatedEpics || [],

        relatedStories: fr.relatedStories || [],

        priority: fr.priority,

        status: fr.status,

        type: fr.type,

        rationale: fr.rationale,

        source: fr.source,

        metrics: fr.metrics,

        verificationMethod: fr.verificationMethod,

        verificationNotes: fr.verificationNotes,

        acceptanceCriteria: fr.acceptanceCriteria,

        dependencies: fr.dependencies,

        implementationNotes: fr.implementationNotes,

        notes: fr.notes,

        architectureDecisions: fr.architectureDecisions

    };

}


/**

 * Map non-functional requirement from schema

 */

export function mapSchemaNonFunctionalRequirement(nfr: any): NonFunctionalRequirement {

    return {

        id: nfr.id || '',

        title: nfr.title || '',

        description: nfr.description || '',

        category: nfr.category || '',

        metrics: nfr.metrics

    };

}


/**

 * Map additional requirement from schema

 */

export function mapSchemaAdditionalRequirement(ar: any): AdditionalRequirement {

    return {

        id: ar.id || '',

        title: ar.title || '',

        description: ar.description || '',

        category: ar.category || ''

    };

}

