import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';

// Re-export ajv types we use internally
type AjvInstance = InstanceType<typeof Ajv>;
type AjvValidateFunction = ReturnType<AjvInstance['compile']>;
type AjvErrorObject = NonNullable<AjvValidateFunction['errors']>[number];

import { createLogger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

const logger = createLogger('schema-validator');

// ─── Artifact-type → schema-file mapping ────────────────────────────────────
//
// Keys are the artifact `type` strings that the LLM passes to
// `agileagentcanvas_update_artifact`.  Values are the relative paths from the
// `<bmadPath>/schemas/` directory.  Aliases (e.g. 'vision' → product-brief)
// allow the LLM to use common shorthand names.

const ARTIFACT_TYPE_TO_SCHEMA: Record<string, string> = {
    // ── common ──
    'requirement':           'common/requirement.schema.json',

    // ── bmm ──
    'product-brief':         'bmm/product-brief.schema.json',
    'vision':                'bmm/product-brief.schema.json',     // alias
    'research':              'bmm/research.schema.json',
    'prd':                   'bmm/prd.schema.json',
    'ux-design':             'bmm/ux-design.schema.json',
    'architecture':          'bmm/architecture.schema.json',
    // NOTE: 'epic' intentionally has NO schema mapping.  Standalone epic
    // files (`epic-*.json`) contain a single epic inside `content` — the
    // `epics.schema.json` expects a `content.epics[]` collection and is
    // structurally incompatible.
    'epics':                 'bmm/epics.schema.json',             // alias
    'story':                 'bmm/story.schema.json',
    'tech-spec':             'bmm/tech-spec.schema.json',
    'project-context':       'bmm/project-context.schema.json',
    'readiness-report':      'bmm/readiness-report.schema.json',
    'readiness':             'bmm/readiness-report.schema.json',  // alias
    'project-overview':      'bmm/project-overview.schema.json',
    'source-tree':           'bmm/source-tree.schema.json',
    'use-case':              'bmm/use-case.schema.json',
    'use-cases':             'bmm/use-cases.schema.json',
    'epic-test-strategy':    'bmm/epic-test-strategy.schema.json',
    'test-strategy':         'bmm/epic-test-strategy.schema.json', // per-epic alias
    'risks':                 'bmm/risks.schema.json',
    'definition-of-done':    'bmm/definition-of-done.schema.json',
    'fit-criteria':          'bmm/fit-criteria.schema.json',
    'success-metrics':       'bmm/success-metrics.schema.json',
    'sprint-status':         'bmm/sprint-status.schema.json',
    'sprint':                'bmm/sprint-status.schema.json',     // alias
    'code-review':           'bmm/code-review.schema.json',
    'retrospective':         'bmm/retrospective.schema.json',
    'change-proposal':       'bmm/change-proposal.schema.json',
    'test-summary':          'bmm/test-summary.schema.json',

    // ── tea ──
    'test-design':           'tea/test-design.schema.json',
    'test-design-qa':        'tea/test-design-qa.schema.json',
    'test-design-architecture': 'tea/test-design-architecture.schema.json',
    'test-cases':            'tea/test-cases.schema.json',
    'test-case':             'tea/test-cases.schema.json',     // alias
    'atdd-checklist':        'tea/atdd-checklist.schema.json',
    'traceability-matrix':   'tea/traceability-matrix.schema.json',
    'test-review':           'tea/test-review.schema.json',
    'nfr-assessment':        'tea/nfr-assessment.schema.json',
    'nfr':                   'tea/nfr-assessment.schema.json',    // alias
    'test-framework':        'tea/test-framework.schema.json',
    'ci-pipeline':           'tea/ci-pipeline.schema.json',
    'automation-summary':    'tea/automation-summary.schema.json',

    // ── cis ──
    'storytelling':          'cis/storytelling.schema.json',
    'problem-solving':       'cis/problem-solving.schema.json',
    'innovation-strategy':   'cis/innovation-strategy.schema.json',
    'design-thinking':       'cis/design-thinking.schema.json',

    // ── intentionally unmapped internal types ──
    // 'requirements' (bulk) — the store's { functional, nonFunctional, additional }
    //   envelope has no corresponding BMAD schema; individual items use 'requirement'.
    // 'aiCursor' — UI-only cursor tracking, not a methodology artifact.
};

// ─── Schema Validator ───────────────────────────────────────────────────────

/**
 * Validates artifact data against BMAD JSON schemas (draft-07).
 *
 * **Design rationale**
 *
 * The LLM sends partial `changes` objects via `agileagentcanvas_update_artifact`.  The
 * store's internal data shape often differs from the schema (e.g. schemas
 * wrap fields inside `content`, the store is flat).  Full structural
 * validation of the `changes` object would always fail.
 *
 * We therefore provide two modes:
 *
 *   • `validate(type, data)` — strict, validates a complete artifact against
 *     the full schema.  Useful for post-write or export validation.
 *
 *   • `validateChanges(type, changes)` — lenient, validates only the fields
 *     present in `changes` against the schema's property definitions.  It
 *     flattens the schema's `content` wrapper (if any), strips `required`,
 *     and checks field types / enums.  This is the primary mode used in the
 *     `agileagentcanvas_update_artifact` tool handler.
 *
 * Both run in **warn mode** — they return results but never throw.
 *
 * Lifecycle:
 *   1. Call `init(bmadPath)` once when the extension knows the framework root.
 *   2. Call `validateChanges(type, changes)` before every store write.
 */
export class SchemaValidator {
    private ajv: AjvInstance | null = null;
    /** Relaxed validators keyed by schema $id — no `required`, `additionalProperties: true` */
    private relaxedValidators = new Map<string, AjvValidateFunction>();
    private schemasDir: string | null = null;
    private initialized = false;
    private schemaLoadErrors: string[] = [];

    /** System/bookkeeping fields with no substantive content.
     *  Allocated once (module-level) to avoid re-creation per `validateChanges()` call.
     *  NOTE: 'type' and 'id' are intentionally excluded — they are substantive
     *  content fields on many artifact types (e.g. use-case `id`, test-case `type`). */
    private static readonly METADATA_ONLY_FIELDS = new Set([
        'artifactType', 'version', 'lastUpdated', 'createdAt',
        'updatedAt', 'schemaVersion',
    ]);

    /**
     * Initialise the validator by loading ALL schema files from disk and
     * compiling them into a single Ajv instance.  Schemas reference each
     * other via `$ref` with relative paths; pre-loading everything lets
     * Ajv resolve `$ref` by `$id`.
     *
     * @param bmadPath  Root of the BMAD framework directory.
     * @param logger    Optional logger (e.g. `this.logger`).  If omitted,
     *                  log messages are silently discarded.
     */
    init(bmadPath: string): void {
        if (this.initialized) {
            return;
        }

        this.schemasDir = path.join(bmadPath, 'schemas');

        if (!fs.existsSync(this.schemasDir)) {
            logger.error(`Schemas directory not found: ${this.schemasDir}`);
            return;
        }

        // Create Ajv instance configured for draft-07.
        // ⚠ Ajv 8 migration notes (L12):
        //   - `schemaId: 'auto'` → removed in Ajv 8 (only `$id` supported)
        //   - `unknownFormats: 'ignore'` → use `formats` plugin or `addFormat()`
        //   - Error objects: `dataPath` → `instancePath`, `params` shape may change
        //   - `$schema` must be explicit; draft-07 is no longer the default
        this.ajv = new Ajv({
            allErrors: true,            // collect ALL errors, not just the first
            verbose: true,              // include schema/parentSchema in error objects
            schemaId: 'auto',           // accept both `$id` (draft-06+) and `id` (draft-04)
            unknownFormats: 'ignore',   // don't fail on unknown format keywords
        });

        // Recursively discover and load all .schema.json files
        const schemasDir = this.schemasDir;
        const schemaFiles = this.discoverSchemaFiles(schemasDir);

        for (const filePath of schemaFiles) {
            try {
                const raw = fs.readFileSync(filePath, 'utf-8');
                const schema = JSON.parse(raw);

                // Ensure every schema has an `$id` so Ajv can resolve `$ref`s.
                if (!schema.$id && !schema.id) {
                    const relPath = path.relative(schemasDir, filePath)
                        .replace(/\\/g, '/');
                    schema.$id = `https://bmad.dev/schemas/${relPath}`;
                }

                this.ajv.addSchema(schema);
            } catch (err: any) {
                const msg = `Failed to load schema ${filePath}: ${err?.message ?? err}`;
                this.schemaLoadErrors.push(msg);
                logger.error(msg);
            }
        }

        // Pre-compile relaxed validators for each artifact type
        this.buildRelaxedValidators();

        this.initialized = true;
        logger.debug(
            `Initialized with ${schemaFiles.length} schemas, ` +
            `${this.relaxedValidators.size} relaxed validators ` +
            `(${this.schemaLoadErrors.length} load errors)`
        );

        // L14: Warn for each mapped artifact type whose schema file couldn't be loaded
        for (const [artifactType, relPath] of Object.entries(ARTIFACT_TYPE_TO_SCHEMA)) {
            const schemaId = `https://bmad.dev/schemas/${relPath}`;
            if (!this.relaxedValidators.has(schemaId)) {
                logger.warn(
                    `Mapped type "${artifactType}" → "${relPath}" ` +
                    `has no compiled validator (schema may be missing or failed to load)`
                );
            }
        }
    }

    /**
     * Re-initialize the validator, discarding all compiled schemas and state.
     * Useful when the BMAD framework path changes at runtime.
     *
     * @param bmadPath  Root of the BMAD framework directory.
     * @param logger    Optional logger — reuses the previous logger if omitted.
     */
    reinit(bmadPath: string): void {
        // Reset all state so init() will run fresh
        this.ajv = null;
        this.relaxedValidators.clear();
        this.schemasDir = null;
        this.initialized = false;
        this.schemaLoadErrors = [];
        this.init(bmadPath);
    }

    /**
     * Validate a partial `changes` object against a relaxed version of the
     * schema for the given artifact type.
     *
     * "Relaxed" means:
     *   - `required` is removed at all levels
     *   - `additionalProperties` is set to `true`
     *   - The `content` wrapper (common in BMAD schemas) is unwrapped so
     *     that flat field objects (as the LLM sends) can be validated
     *
     * Returns `{ valid: true, errors: [] }` when:
     *   - validation passes, OR
     *   - the validator is not initialized, OR
     *   - no schema/validator exists for the type.
     *
     * Returns `{ valid: false, errors: [...] }` when validation finds issues.
     */
    validateChanges(
        artifactType: string,
        changes: Record<string, any>,
        fileName?: string
    ): ValidationResult {
        if (!this.initialized || !this.ajv) {
            logger.warn(
                `Validator not initialized — skipping validation for "${artifactType}". ` +
                `Data will be accepted without schema checks.`
            );
            return { valid: true, errors: [] };
        }

        const schemaRelPath = ARTIFACT_TYPE_TO_SCHEMA[artifactType];
        if (!schemaRelPath) {
            logger.debug(
                `No schema mapping for type "${artifactType}" — ` +
                `skipping validation. Known types: ${Object.keys(ARTIFACT_TYPE_TO_SCHEMA).join(', ')}`
            );
            return { valid: true, errors: [] };
        }

        const schemaId = `https://bmad.dev/schemas/${schemaRelPath}`;
        const validateFn = this.relaxedValidators.get(schemaId);
        if (!validateFn) {
            logger.warn(
                `No relaxed validator compiled for "${schemaId}" — ` +
                `skipping validation for "${artifactType}".`
            );
            return { valid: true, errors: [] };
        }

        // The LLM sends changes like { title, status, metadata: { ... } }.
        // Unwrap `metadata` into the top level for validation (many handlers
        // flatten metadata fields onto the artifact).
        const flatChanges = { ...changes };
        if (flatChanges.metadata && typeof flatChanges.metadata === 'object') {
            const meta = flatChanges.metadata;
            delete flatChanges.metadata;
            Object.assign(flatChanges, meta);
        }

        // ── Deprecation warnings ──
        if ('storyId' in flatChanges && !('id' in flatChanges)) {
            logger.debug(
                `DEPRECATION: "storyId" is deprecated — use "id" instead. ` +
                `Found in changes for "${artifactType}".`
            );
            // Auto-migrate: copy storyId → id if id is missing
            flatChanges.id = flatChanges.storyId;
        }

        // ── x-aliases normalization ──
        // Resolve alias values to their canonical form using x-aliases defined
        // in schema properties. This lets LLMs use vocabulary variations.
        this.normalizeAliases(schemaId, flatChanges);

        // ── Minimum-substance check ──
        // Reject changes that contain only system/bookkeeping fields with no
        // real content.  Status changes ARE substantive (e.g. marking a story
        // as "ready"), so 'status' is intentionally excluded from this set.
        // NOTE: 'type' and 'id' are NOT included — they are substantive content
        // fields on many artifact types (e.g. use-case `id`, test-case `type`).
        const substantiveKeys = Object.keys(flatChanges).filter(
            k => !SchemaValidator.METADATA_ONLY_FIELDS.has(k)
        );
        if (substantiveKeys.length === 0 && Object.keys(flatChanges).length > 0) {
            const msg =
                `Changes contain only metadata fields (${Object.keys(flatChanges).join(', ')}). ` +
                `Include at least one substantive content field.`;
            logger.warn(
                `Rejected trivial update for "${artifactType}": ${msg}`
            );
            return { valid: false, errors: [msg] };
        }

        const valid = validateFn(flatChanges) as boolean;

        if (valid) {
            return { valid: true, errors: [] };
        }

        const errors = this.formatErrors(validateFn.errors || []);

        const identifier = fileName || flatChanges.id || flatChanges.title || flatChanges.name ||
                           flatChanges.content?.id || flatChanges.content?.title || flatChanges.content?.name ||
                           'unknown instance';
        logger.warn(
            `Changes for "${artifactType}" (${identifier}) have issues: ${errors.join('; ')}`
        );

        return { valid: false, errors };
    }

    /**
     * Strict validation of a complete artifact against the full schema.
     * Useful for post-write checks or export validation.
     */
    validate(
        artifactType: string,
        data: Record<string, any>,
        fileName?: string
    ): ValidationResult {
        if (!this.initialized || !this.ajv) {
            logger.warn(
                `Validator not initialized — skipping strict validation for "${artifactType}".`
            );
            return { valid: true, errors: [] };
        }

        const schemaRelPath = ARTIFACT_TYPE_TO_SCHEMA[artifactType];
        if (!schemaRelPath) {
            logger.debug(
                `No schema mapping for type "${artifactType}"`
            );
            return { valid: true, errors: [] };
        }

        const schemaId = `https://bmad.dev/schemas/${schemaRelPath}`;
        const validateFn = this.ajv.getSchema(schemaId);
        if (!validateFn) {
            logger.warn(
                `Schema not found: "${schemaId}"`
            );
            return { valid: true, errors: [] };
        }

        // Normalize x-aliases before validation — same as validateChanges().
        // Without this, strict validation rejects aliased values like
        // status="done" even when x-aliases maps done→pass.
        this.normalizeAliasesDeep(schemaId, data);

        const valid = validateFn(data) as boolean;

        if (valid) {
            return { valid: true, errors: [] };
        }

        const errors = this.formatErrors(validateFn.errors || []);

        const identifier = fileName || data.id || data.title || data.name ||
                           data.content?.id || data.content?.title || data.content?.name ||
                           'unknown instance';
        logger.warn(
            `Validation failed for "${artifactType}" (${identifier}): ${errors.join('; ')}`
        );

        return { valid: false, errors };
    }

    /**
     * Whether the validator has been successfully initialized.
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Return the list of artifact types that have a schema mapping.
     */
    getSupportedTypes(): string[] {
        return Object.keys(ARTIFACT_TYPE_TO_SCHEMA);
    }

    /**
     * Return the relative schema path for the given artifact type, or undefined
     * if the type has no mapping.
     */
    getSchemaRelPath(artifactType: string): string | undefined {
        return ARTIFACT_TYPE_TO_SCHEMA[artifactType];
    }

    /**
     * Load the raw JSON schema as a parsed object for a given artifact type,
     * with `$ref` pointers resolved inline.  Unlike `getSchemaContent()`, this
     * does NOT strip runtime fields — the schema is returned as-is for use by
     * the repair engine which needs to see ALL properties.
     *
     * Returns `undefined` if the validator is not initialized, the type has no
     * mapping, or the file cannot be read.
     */
    getRawSchema(artifactType: string): Record<string, any> | undefined {
        if (!this.schemasDir) {
            return undefined;
        }

        const relPath = ARTIFACT_TYPE_TO_SCHEMA[artifactType];
        if (!relPath) {
            return undefined;
        }

        const schemaFilePath = path.join(this.schemasDir, relPath);
        try {
            const raw = fs.readFileSync(schemaFilePath, 'utf-8');
            const schema = JSON.parse(raw);

            // Resolve $ref so the caller gets a self-contained schema tree.
            this.resolveRefsInline(schema);

            // Strip meta fields that are not structural
            delete schema.$schema;
            delete schema.$id;

            return schema;
        } catch (err: any) {
            logger.error(
                `Failed to load raw schema for "${artifactType}": ${err?.message ?? err}`
            );
            return undefined;
        }
    }

    /**
     * Load the raw JSON schema text for a given artifact type, optimised for
     * injection into an LLM prompt.
     *
     * This reads the `.schema.json` file from disk, resolves any local `$ref`
     * references by inlining the referenced schema's `properties` (specifically
     * the common `metadata` ref), strips runtime-only fields that an LLM
     * should never populate, and returns the result as a formatted JSON string.
     *
     * Returns `undefined` if the validator is not initialized, the type has no
     * mapping, or the file cannot be read.
     */
    getSchemaContent(artifactType: string): string | undefined {
        if (!this.schemasDir) {
            return undefined;
        }

        const relPath = ARTIFACT_TYPE_TO_SCHEMA[artifactType];
        if (!relPath) {
            return undefined;
        }

        const schemaFilePath = path.join(this.schemasDir, relPath);
        try {
            const raw = fs.readFileSync(schemaFilePath, 'utf-8');
            const schema = JSON.parse(raw);

            // Resolve $ref for the common metadata schema so the LLM sees a
            // self-contained schema without needing to read additional files.
            this.resolveRefsInline(schema);

            // Strip the $schema and $id fields — they add noise for the LLM.
            delete schema.$schema;
            delete schema.$id;

            // Strip runtime-only fields that the LLM should never populate.
            // These are tracking/audit fields populated by the system at runtime.
            this.stripRuntimeFields(schema);

            return JSON.stringify(schema, null, 2);
        } catch (err: any) {
            logger.error(
                `Failed to load schema content for "${artifactType}": ${err?.message ?? err}`
            );
            return undefined;
        }
    }

    /**
     * Normalise values in `data` using `x-aliases` defined on schema properties.
     *
     * `x-aliases` is a custom keyword we add to status/enum properties:
     *
     *    "status": { "enum": ["done",…], "x-aliases": { "complete": "done" } }
     *
     * When `data.status` is `"complete"` it gets rewritten to `"done"` so the
     * value passes enum validation.  This is a one-level normalization — it
     * only processes top-level properties of the schema.
     */
    private normalizeAliases(
        schemaId: string,
        data: Record<string, any>
    ): void {
        if (!this.ajv) return;

        const schemaFn = this.ajv.getSchema(schemaId);
        if (!schemaFn || !schemaFn.schema) return;

        const schema = schemaFn.schema as Record<string, any>;

        // Walk into content.properties if present (most BMAD schemas nest under content)
        const propSources = [
            schema.properties,
            schema.properties?.content?.properties,
        ].filter(Boolean);

        for (const props of propSources) {
            for (const [key, propDef] of Object.entries(props as Record<string, any>)) {
                if (!propDef || typeof propDef !== 'object') continue;
                const aliases = propDef['x-aliases'];
                if (!aliases || typeof aliases !== 'object') continue;

                const val = data[key];
                if (typeof val === 'string' && val in aliases) {
                    const canonical = aliases[val];
                    logger.debug(
                        `Alias normalised: ${key}="${val}" → "${canonical}"`
                    );
                    data[key] = canonical;
                }
            }
        }
    }

    /**
     * Recursively normalise `x-aliases` at ALL nesting levels of `data`,
     * walking the schema tree in parallel.  Used by `validate()` which
     * receives fully-structured artifacts (not flat change objects).
     *
     * For each property in the schema that defines `x-aliases`, if the
     * corresponding value in `data` is a known alias, it is rewritten
     * to the canonical value.
     */
    private normalizeAliasesDeep(
        schemaId: string,
        data: any
    ): void {
        if (!this.ajv || !data || typeof data !== 'object') return;

        const schemaFn = this.ajv.getSchema(schemaId);
        if (!schemaFn || !schemaFn.schema) return;

        this.applyAliasesRecursive(schemaFn.schema as Record<string, any>, data);
    }

    /**
     * Internal recursive walker: applies `x-aliases` from `schemaPart`
     * to `dataPart` at every nesting level.
     */
    private applyAliasesRecursive(
        schemaPart: Record<string, any>,
        dataPart: any
    ): void {
        if (!schemaPart || !dataPart || typeof dataPart !== 'object') return;

        // If schemaPart has properties, walk them
        const props = schemaPart.properties;
        if (props && typeof props === 'object') {
            for (const [key, propDef] of Object.entries(props as Record<string, any>)) {
                if (!propDef || typeof propDef !== 'object') continue;
                const val = dataPart[key];
                if (val === undefined) continue;

                // Apply alias if this property has x-aliases and val is a string
                const aliases = propDef['x-aliases'];
                if (aliases && typeof aliases === 'object' && typeof val === 'string' && val in aliases) {
                    dataPart[key] = aliases[val];
                }

                // Recurse into nested objects
                if (typeof val === 'object' && !Array.isArray(val)) {
                    this.applyAliasesRecursive(propDef, val);
                }

                // Recurse into arrays
                if (Array.isArray(val) && propDef.items) {
                    for (const item of val) {
                        if (typeof item === 'object' && item !== null) {
                            this.applyAliasesRecursive(propDef.items, item);
                        }
                    }
                }
            }
        }

        // Also walk oneOf/anyOf/allOf branches
        for (const combiner of ['oneOf', 'anyOf', 'allOf']) {
            if (Array.isArray(schemaPart[combiner])) {
                for (const branch of schemaPart[combiner]) {
                    this.applyAliasesRecursive(branch, dataPart);
                }
            }
        }
    }

    /**
     * Recursively resolve local `$ref` entries in a schema object by reading
     * the referenced file and inlining its content.  Only resolves file-level
     * relative `$ref`s (e.g. `"../common/metadata.schema.json"`); JSON-pointer
     * `$ref`s (`#/definitions/...`) are left as-is since Ajv handles those.
     *
     * @param obj           The schema (sub-)object to process.
     * @param containingDir The directory of the schema file that contains
     *                      this `$ref`.  Relative refs are resolved against
     *                      this directory, NOT against `this.schemasDir`.
     */
    private resolveRefsInline(obj: any, containingDir?: string): void {
        if (!obj || typeof obj !== 'object' || !this.schemasDir) return;

        const baseDir = containingDir || this.schemasDir;

        if (Array.isArray(obj)) {
            for (const item of obj) {
                this.resolveRefsInline(item, baseDir);
            }
            return;
        }

        for (const key of Object.keys(obj)) {
            if (key === '$ref' && typeof obj[key] === 'string') {
                const ref = obj[key] as string;
                // Only resolve relative file refs, not JSON pointer refs
                if (!ref.startsWith('#')) {
                    try {
                        // Resolve the $ref relative to the containing schema's
                        // own directory (not the schemas root).
                        const refPath = path.resolve(baseDir, ref);
                        const refRaw = fs.readFileSync(refPath, 'utf-8');
                        const refSchema = JSON.parse(refRaw);
                        // Remove meta fields from the inlined ref
                        delete refSchema.$schema;
                        delete refSchema.$id;
                        // Replace the $ref with the inlined schema
                        delete obj.$ref;
                        Object.assign(obj, refSchema);
                        // Recurse into the newly inlined content, using the
                        // referenced file's directory as the new base for any
                        // nested $refs it may contain.
                        this.resolveRefsInline(obj, path.dirname(refPath));
                    } catch {
                        // Leave unresolved $ref as-is — the LLM can still
                        // read the referenced file via agileagentcanvas_read_file
                    }
                }
            } else {
                this.resolveRefsInline(obj[key], baseDir);
            }
        }
    }

    /**
     * Runtime-only property names that should be stripped from schemas before
     * injecting into LLM prompts.  These are tracking/audit fields populated
     * by the system (dev agents, status history, timestamps) — the LLM should
     * never try to populate them when creating or editing artifacts.
     *
     * Only top-level properties of each schema object are checked; deeply
     * nested occurrences (e.g. `completedAt` inside sprint-status story
     * tracking) are left alone because they may be legitimate planning fields.
     */
    private static readonly RUNTIME_FIELDS = new Set([
        'devAgentRecord',    // AI agent session tracking (story)
        'history',           // Status change history array (story)
        'lastUpdated',       // Timestamp (epics summary, requirement)
    ]);

    /**
     * Remove runtime-only top-level properties from a schema before it is
     * shown to the LLM.  Modifies the schema in place.
     *
     * We strip properties at the schema's own `properties` level and also
     * inside `properties.content.properties` (the common BMAD wrapper).
     * This reduces token usage and prevents the LLM from filling in fields
     * that are system-managed.
     */
    private stripRuntimeFields(schema: any): void {
        if (!schema || typeof schema !== 'object') return;

        const stripFrom = (props: Record<string, any> | undefined) => {
            if (!props) return;
            for (const field of SchemaValidator.RUNTIME_FIELDS) {
                delete props[field];
            }
        };

        // Top-level properties
        stripFrom(schema.properties);

        // Inside the `content` wrapper used by many BMAD schemas
        if (schema.properties?.content?.properties) {
            stripFrom(schema.properties.content.properties);
        }

        // Also strip from `required` arrays so validation won't demand them
        const stripFromRequired = (obj: any) => {
            if (Array.isArray(obj?.required)) {
                obj.required = obj.required.filter(
                    (r: string) => !SchemaValidator.RUNTIME_FIELDS.has(r)
                );
            }
        };

        stripFromRequired(schema);
        stripFromRequired(schema.properties?.content);
    }

    // ─── Private helpers ────────────────────────────────────────────────

    /**
     * Build relaxed validators for each mapped artifact type.
     *
     * For each schema we:
     *   1. Deep-clone the schema
     *   2. If the schema has a `content` wrapper with `properties`, hoist
     *      those properties to the top level (alongside `metadata`)
     *   3. Recursively strip `required` at every level
     *   4. Set `additionalProperties: true` at every object level
     *   5. Assign a new `$id` (suffixed with `#relaxed`) and compile
     */
    private buildRelaxedValidators(): void {
        if (!this.ajv) return;

        for (const [, relPath] of Object.entries(ARTIFACT_TYPE_TO_SCHEMA)) {
            const schemaId = `https://bmad.dev/schemas/${relPath}`;

            // Skip if we already built a relaxed validator for this schema
            // (multiple artifact types may alias the same schema)
            if (this.relaxedValidators.has(schemaId)) continue;

            const originalValidateFn = this.ajv.getSchema(schemaId);
            if (!originalValidateFn || !originalValidateFn.schema) continue;

            try {
                const original = originalValidateFn.schema as Record<string, any>;
                const relaxed = this.createRelaxedSchema(original, schemaId);

                const validateFn = this.ajv.compile(relaxed);
                this.relaxedValidators.set(schemaId, validateFn);
            } catch (err: any) {
                logger.error(
                    `Failed to build relaxed validator for ` +
                    `"${schemaId}": ${err?.message ?? err}`
                );
            }
        }
    }

    /**
     * Create a relaxed copy of a schema suitable for validating partial
     * changes objects.
     */
    private createRelaxedSchema(
        original: Record<string, any>,
        originalId: string
    ): Record<string, any> {
        const relaxed = JSON.parse(JSON.stringify(original));

        // Give it a unique $id so it doesn't clash with the strict version
        relaxed.$id = `${originalId}#relaxed`;

        // If schema has { properties: { metadata, content: { properties: {...} } } },
        // hoist `content.properties` to the top level so flat changes objects match.
        if (relaxed.properties?.content?.properties) {
            const contentProps = relaxed.properties.content.properties;
            // Merge content properties into the top-level properties
            // (metadata stays at top level if it exists)
            for (const [key, value] of Object.entries(contentProps)) {
                if (!relaxed.properties[key]) {
                    relaxed.properties[key] = value;
                }
            }
            // Remove the `content` wrapper — we've flattened it
            delete relaxed.properties.content;

            // Rewrite any internal $ref pointers that referenced
            // #/properties/content/properties/... since content was hoisted
            this.rewriteContentRefs(relaxed);
        }

        // Relax the schema for partial-changes validation.
        // Depth 0 (root): strip `required` because the LLM sends partial
        //   updates — not every field will be present.
        // Depth > 0 (nested objects): KEEP `required` so that when the LLM
        //   does provide a nested object, it must be structurally complete.
        // `additionalProperties: true` is set at ALL depths so extra fields
        //   don't cause spurious failures on partial payloads.
        this.relaxSchema(relaxed, 0);

        return relaxed;
    }

    /**
     * Recursively rewrite internal `$ref` pointers that referenced the
     * now-deleted `content` wrapper.  After hoisting content properties
     * to root level, `#/properties/content/properties/X` becomes
     * `#/properties/X`.
     */
    private rewriteContentRefs(obj: any): void {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            for (const item of obj) this.rewriteContentRefs(item);
            return;
        }
        for (const key of Object.keys(obj)) {
            if (key === '$ref' && typeof obj[key] === 'string') {
                obj[key] = obj[key].replace(
                    '#/properties/content/properties/',
                    '#/properties/'
                );
            } else {
                this.rewriteContentRefs(obj[key]);
            }
        }
    }

    /**
     * Recursively relax a schema for partial-changes validation.
     *
     * - `required` is removed only at depth 0 (root level), so partial
     *   top-level updates are accepted.  Nested objects keep their
     *   `required` constraints — if the LLM provides an object it must
     *   include the mandatory fields.
     * - `additionalProperties` is set to `true` at all depths.
     */
    private relaxSchema(schema: any, depth: number): void {
        if (!schema || typeof schema !== 'object') return;

        if (Array.isArray(schema)) {
            for (const item of schema) {
                this.relaxSchema(item, depth);
            }
            return;
        }

        // Only strip `required` at the root level (depth 0).
        // Nested objects retain their required constraints.
        if (depth === 0) {
            delete schema.required;
        }

        // Allow extra properties at ALL depths
        if (schema.type === 'object' || schema.properties) {
            schema.additionalProperties = true;
        }

        // Recurse into properties (each property is one level deeper)
        if (schema.properties) {
            for (const prop of Object.values(schema.properties)) {
                this.relaxSchema(prop, depth + 1);
            }
        }

        // Recurse into items (arrays) — items are nested
        if (schema.items) {
            this.relaxSchema(schema.items, depth + 1);
        }

        // Recurse into oneOf / anyOf / allOf (same depth — these are
        // alternative shapes for the SAME level, not deeper nesting)
        for (const combiner of ['oneOf', 'anyOf', 'allOf']) {
            if (Array.isArray(schema[combiner])) {
                for (const sub of schema[combiner]) {
                    this.relaxSchema(sub, depth);
                }
            }
        }

        // Recurse into definitions / $defs (depth doesn't advance —
        // definitions are referenced, not directly nested)
        if (schema.definitions) {
            for (const def of Object.values(schema.definitions)) {
                this.relaxSchema(def, depth);
            }
        }

        // Recurse into patternProperties
        if (schema.patternProperties) {
            for (const pp of Object.values(schema.patternProperties)) {
                this.relaxSchema(pp, depth + 1);
            }
        }
    }

    /**
     * Format ajv error objects into human-readable strings suitable for
     * returning to the LLM.
     */
    private formatErrors(errors: AjvErrorObject[]): string[] {
        // De-duplicate errors (oneOf can generate many similar errors)
        const seen = new Set<string>();
        const result: string[] = [];

        for (const err of errors) {
            const errAny = err as any;
            const dataPath = errAny.instancePath || err.dataPath || '';
            const message = err.message || 'unknown error';

            // Extract explicit correction suggestions
            let suggestion = '';
            const params = errAny.params || {};
            if (err.keyword === 'enum' && params.allowedValues) {
                suggestion = ` (Correction Suggestion: Use one of -> ${params.allowedValues.join(', ')})`;
            } else if (err.keyword === 'required' && params.missingProperty) {
                suggestion = ` (Correction Suggestion: Missing required property -> '${params.missingProperty}')`;
            } else if (err.keyword === 'additionalProperties' && params.additionalProperty) {
                suggestion = ` (Correction Suggestion: Remove extraneous property -> '${params.additionalProperty}')`;
            } else if (err.keyword === 'type' && params.type) {
                suggestion = ` (Correction Suggestion: Convert value to -> ${params.type})`;
            }

            // Skip noisy oneOf "should match exactly one schema" when sub-errors
            // are already reported
            if (err.keyword === 'oneOf' && errors.length > 1) continue;

            const formatted = `${dataPath || '(root)'}: ${message}${suggestion}`;
            if (!seen.has(formatted)) {
                seen.add(formatted);
                result.push(formatted);
            }
        }

        // Cap at 10 errors to avoid overwhelming the LLM
        if (result.length > 10) {
            const total = result.length;
            return [...result.slice(0, 10), `... and ${total - 10} more errors`];
        }

        return result;
    }

    /**
     * Recursively find all `*.schema.json` files under `dir`.
     */
    private discoverSchemaFiles(dir: string): string[] {
        const results: string[] = [];

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...this.discoverSchemaFiles(full));
            } else if (entry.name.endsWith('.schema.json')) {
                results.push(full);
            }
        }

        return results;
    }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

/**
 * Module-level singleton.  Import this in `bmad-tools.ts` and other modules.
 */
export const schemaValidator = new SchemaValidator();
