import { createLogger } from '../utils/logger';
import { schemaValidator } from './schema-validator';
import { repairDataWithSchema } from './schema-repair-engine';

const mapperLogger = createLogger('schema-artifact-mapper');

/**
 * Repair artifact data against its schema and apply normalization rules.
 * Extracted from ArtifactStore.repairArtifactData() as a pure function.
 *
 * Returns the repaired data (may be the same object if no changes needed,
 * or a new object if repairs were applied).
 */
export function repairArtifactData(
    data: Record<string, any>,
    artifactType: string,
    fileName: string,
): Record<string, any> {
    // Guard against null/undefined/non-object input (e.g. corrupted JSON files)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return data;
    }

    // Work on a deep copy so we don't mutate the caller's reference
    const d = JSON.parse(JSON.stringify(data));
    let changed = false;

    // ── 0) Schema-driven automatic repair ──
    if (schemaValidator.isInitialized()) {
        const rawSchema = schemaValidator.getRawSchema(artifactType);
        if (rawSchema) {
            const result = repairDataWithSchema(d, rawSchema);
            if (result.changed) {
                changed = true;
                for (const r of result.repairs) {
                    mapperLogger.debug(
                        `[SchemaArtifactMapper] schema-repair: ${r} in ${fileName}`,
                    );
                }
            }
        }
    }

    // ── 1) Ensure { metadata, content } wrapper for types that require it ──
    const wrappedTypes = new Set([
        'product-brief', 'vision', 'prd', 'architecture', 'epics', 'epic',
        'story', 'research', 'ux-design', 'readiness-report', 'sprint-status',
        'retrospective', 'change-proposal', 'code-review', 'tech-spec',
        'project-overview', 'project-context',
        'test-design', 'test-design-qa', 'test-design-architecture',
        'traceability-matrix', 'test-review', 'nfr-assessment',
        'test-framework', 'ci-pipeline', 'automation-summary', 'atdd-checklist',
        'storytelling', 'problem-solving', 'innovation-strategy', 'design-thinking',
        'risks', 'definition-of-done', 'fit-criteria', 'success-metrics',
    ]);

    if (wrappedTypes.has(artifactType) && !d.metadata && !d.content) {
        const now = new Date().toISOString();
        const contentCopy = { ...d };
        for (const key of Object.keys(d)) {
            delete d[key];
        }
        d.metadata = {
            schemaVersion: '1.0.0',
            artifactType: artifactType,
            workflowName: 'agileagentcanvas',
            timestamps: { created: now, lastModified: now },
            status: contentCopy.status || 'draft',
        };
        delete contentCopy.status;
        d.content = contentCopy;
        changed = true;
    }

    // ── 2) Fix metadata.timestamps ──
    if (d.metadata && typeof d.metadata === 'object') {
        if (!d.metadata.timestamps) {
            const now = new Date().toISOString();
            d.metadata.timestamps = { created: now, lastModified: now };
            changed = true;
        } else if (!d.metadata.timestamps.created) {
            d.metadata.timestamps.created = new Date().toISOString();
            changed = true;
        }

        if (!d.metadata.schemaVersion) {
            d.metadata.schemaVersion = '1.0.0';
            changed = true;
        }
        if (!d.metadata.artifactType) {
            d.metadata.artifactType = artifactType;
            changed = true;
        }
    }

    // ── 3) Product-brief / vision specific repairs ──
    if ((artifactType === 'product-brief' || artifactType === 'vision') && d.content) {
        if (!d.content.vision) {
            d.content.vision = {};
            changed = true;
            mapperLogger.debug(
                `[SchemaArtifactMapper] repairArtifactData: added empty content.vision to ${fileName}`,
            );
        }

        if (d.content.problemStatement && !d.content.vision.problemStatement) {
            d.content.vision.problemStatement = d.content.problemStatement;
            changed = true;
        }
        if (d.content.valueProposition && !d.content.vision.uniqueValueProposition) {
            d.content.vision.uniqueValueProposition = d.content.valueProposition;
            changed = true;
        }

        if (d.content.successCriteria && !d.content.successMetrics) {
            d.content.successMetrics = Array.isArray(d.content.successCriteria)
                ? d.content.successCriteria.map((c: any) =>
                    typeof c === 'string' ? { metric: c, description: c } : c,
                )
                : d.content.successCriteria;
            changed = true;
        }

        if (!d.content.productName) {
            d.content.productName = d.metadata?.projectName || '';
            changed = true;
        }

        if (Array.isArray(d.content.targetUsers)) {
            const users = d.content.targetUsers;
            let coerced = false;
            for (let i = 0; i < users.length; i++) {
                if (typeof users[i] === 'string') {
                    users[i] = { persona: users[i], description: '' };
                    coerced = true;
                }
            }
            if (coerced) {
                changed = true;
            }
        }
    }

    // Return repaired data or original if unchanged
    return d;
}
