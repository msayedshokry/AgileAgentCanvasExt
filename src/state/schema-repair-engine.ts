/**
 * Schema-Driven Repair Engine
 *
 * Walks a JSON Schema tree (draft-07) and automatically repairs data to
 * conform.  Designed to run BEFORE the legacy per-type hardcoded repairs
 * in `repairArtifactData()` so that the hardcoded repairs can still
 * override/supplement when needed.
 *
 * Handles:
 *  - Missing `required` fields  → scaffold with type-appropriate defaults
 *  - `additionalProperties: false` at ANY nesting depth → strip extras
 *  - Type mismatches (string↔number/integer/boolean) → coerce
 *  - Invalid `enum` values → fuzzy-match to closest valid value
 *  - `minimum` / `maximum` violations → clamp
 *  - `oneOf` constraints → pick the best-matching branch
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RepairResult {
    /** The (possibly mutated) data object. */
    data: any;
    /** Whether any mutations were made. */
    changed: boolean;
    /** Human-readable log of every repair applied. */
    repairs: string[];
}

/** Minimal JSON-Schema-like shape we care about. */
interface SchemaNode {
    type?: string | string[];
    properties?: Record<string, SchemaNode>;
    required?: string[];
    additionalProperties?: boolean | SchemaNode;
    items?: SchemaNode | SchemaNode[];
    enum?: any[];
    minimum?: number;
    maximum?: number;
    default?: any;
    oneOf?: SchemaNode[];
    anyOf?: SchemaNode[];
    allOf?: SchemaNode[];
    $ref?: string;
    const?: any;
    pattern?: string;
    // Allow any extra keys (format, description, etc.)
    [key: string]: any;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Repair `data` in-place to conform to `schema`.  The schema should be a
 * fully-resolved JSON Schema object (no unresolved `$ref` pointers).
 *
 * Returns a `RepairResult` with the mutated data, a `changed` flag, and a
 * log of all repairs applied.
 */
export function repairDataWithSchema(
    data: any,
    schema: SchemaNode,
    pathPrefix = ''
): RepairResult {
    const repairs: string[] = [];
    let changed = false;

    function log(path: string, msg: string): void {
        repairs.push(`${path || '(root)'}: ${msg}`);
        changed = true;
    }

    function walk(value: any, node: SchemaNode, path: string): any {
        if (!node || typeof node !== 'object') return value;

        // ── Resolve allOf by merging ──
        if (Array.isArray(node.allOf)) {
            let merged: SchemaNode = { ...node };
            delete merged.allOf;
            for (const sub of node.allOf) {
                merged = mergeSchemas(merged, sub);
            }
            return walk(value, merged, path);
        }

        // ── Determine effective type ──
        const effectiveType = resolveType(node, value);

        // ── Handle oneOf / anyOf — pick best branch ──
        const branches = node.oneOf || node.anyOf;
        if (branches && Array.isArray(branches) && branches.length > 0) {
            // Only attempt branch selection for object values
            if (value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
                const best = pickBestBranch(value, branches);
                if (best) {
                    // Merge the chosen branch constraints into the current node
                    const merged = mergeSchemas(node, best);
                    delete merged.oneOf;
                    delete merged.anyOf;
                    return walk(value, merged, path);
                }
            }
            // For non-objects or when no branch matched, continue with the
            // base node's own properties (if any).
        }

        // ── Object handling ──
        if (effectiveType === 'object') {
            if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
                if (Array.isArray(value) && node.properties) {
                    // Smart wrap: find an array-typed property to nestle the data into
                    const arrayProp = Object.entries(node.properties).find(
                        ([, s]) => resolveType(s as SchemaNode) === 'array'
                    );
                    if (arrayProp) {
                        const wrapped: Record<string, any> = { [arrayProp[0]]: value };
                        log(path, `wrapped array into object property "${arrayProp[0]}"`);
                        value = wrapped;
                    } else {
                        value = {};
                        log(path, 'replaced non-object with {}');
                    }
                } else {
                    value = {};
                    log(path, 'replaced non-object with {}');
                }
            }

            // Scaffold missing required fields
            if (Array.isArray(node.required) && node.properties) {
                for (const key of node.required) {
                    if (!(key in value)) {
                        const propSchema = node.properties[key];
                        if (propSchema) {
                            value[key] = scaffoldDefault(propSchema);
                            log(`${path}.${key}`, `added missing required field (${describeDefault(propSchema)})`);
                        }
                    }
                }
            }

            // Strip additional properties
            if (node.additionalProperties === false && node.properties) {
                const allowed = new Set(Object.keys(node.properties));
                for (const key of Object.keys(value)) {
                    if (!allowed.has(key)) {
                        delete value[key];
                        log(`${path}.${key}`, 'stripped disallowed property');
                    }
                }
            }

            // Recurse into known properties
            if (node.properties) {
                for (const [key, propSchema] of Object.entries(node.properties)) {
                    if (key in value) {
                        value[key] = walk(value[key], propSchema, `${path}.${key}`);
                    }
                }
            }

            return value;
        }

        // ── Array handling ──
        if (effectiveType === 'array') {
            if (!Array.isArray(value)) {
                // Coerce non-array to empty array
                value = [];
                log(path, 'replaced non-array with []');
            }
            if (node.items && !Array.isArray(node.items)) {
                for (let i = 0; i < value.length; i++) {
                    value[i] = walk(value[i], node.items, `${path}[${i}]`);
                }
            }
            return value;
        }

        // ── String handling ──
        if (effectiveType === 'string') {
            if (value !== null && value !== undefined && typeof value !== 'string') {
                value = String(value);
                log(path, `coerced ${typeof value} to string`);
            }
            // Enum repair
            if (Array.isArray(node.enum) && value !== null && value !== undefined) {
                if (!node.enum.includes(value)) {
                    const best = fuzzyMatchEnum(String(value), node.enum);
                    log(path, `coerced enum "${value}" → "${best}"`);
                    value = best;
                }
            }
            // date-time format repair
            if (node.format === 'date-time' && typeof value === 'string' && value.length > 0) {
                if (!isIso8601(value)) {
                    const parsed = Date.parse(value);
                    if (!isNaN(parsed)) {
                        const fixed = new Date(parsed).toISOString();
                        log(path, `coerced date "${value}" → "${fixed}"`);
                        value = fixed;
                    }
                }
            }
            return value;
        }

        // ── Number / integer handling ──
        if (effectiveType === 'number' || effectiveType === 'integer') {
            if (value !== null && value !== undefined && typeof value !== 'number') {
                const parsed = Number(value);
                if (!isNaN(parsed)) {
                    value = effectiveType === 'integer' ? Math.round(parsed) : parsed;
                    log(path, `coerced "${value}" to ${effectiveType}`);
                } else {
                    value = node.default ?? 0;
                    log(path, `replaced non-numeric with ${value}`);
                }
            }
            if (typeof value === 'number') {
                if (effectiveType === 'integer' && !Number.isInteger(value)) {
                    value = Math.round(value);
                    log(path, `rounded to integer ${value}`);
                }
                if (node.minimum !== undefined && value < node.minimum) {
                    log(path, `clamped ${value} to minimum ${node.minimum}`);
                    value = node.minimum;
                }
                if (node.maximum !== undefined && value > node.maximum) {
                    log(path, `clamped ${value} to maximum ${node.maximum}`);
                    value = node.maximum;
                }
            }
            // Enum repair for numbers
            if (Array.isArray(node.enum) && value !== null && value !== undefined) {
                if (!node.enum.includes(value)) {
                    const fallback = node.default ?? node.enum[0];
                    log(path, `replaced invalid enum value ${value} with ${fallback}`);
                    value = fallback;
                }
            }
            return value;
        }

        // ── Boolean handling ──
        if (effectiveType === 'boolean') {
            if (value !== null && value !== undefined && typeof value !== 'boolean') {
                const s = String(value).toLowerCase().trim();
                value = s === 'true' || s === '1' || s === 'yes';
                log(path, `coerced "${value}" to boolean`);
            }
            return value;
        }

        return value;
    }

    const result = walk(data, schema, pathPrefix);
    return { data: result, changed, repairs };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Quick check for ISO 8601 date-time (e.g. "2024-01-15T10:30:00.000Z"). */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
function isIso8601(s: string): boolean {
    return ISO_RE.test(s);
}

/**
 * Determine the effective JSON Schema type.  Handles `type` as string or
 * array (picks the first non-null type), and infers 'object' when
 * `properties` is present without an explicit `type`.
 */
function resolveType(node: SchemaNode, value?: any): string | undefined {
    if (typeof node.type === 'string') return node.type;
    if (Array.isArray(node.type)) {
        // Prefer matching the current value's type, otherwise first non-null
        const types = node.type.filter(t => t !== 'null');
        if (value !== null && value !== undefined) {
            const jsType = Array.isArray(value) ? 'array' : typeof value;
            const match = types.find(t =>
                (t === 'integer' && jsType === 'number') || t === jsType
            );
            if (match) return match;
        }
        return types[0];
    }
    // Infer from structure
    if (node.properties || node.required) return 'object';
    if (node.items) return 'array';
    if (node.enum) {
        // Infer from first enum value
        const sample = node.enum[0];
        if (typeof sample === 'string') return 'string';
        if (typeof sample === 'number') return 'number';
        if (typeof sample === 'boolean') return 'boolean';
    }
    return undefined;
}

/**
 * Create a type-appropriate default value for a schema node.
 */
function scaffoldDefault(node: SchemaNode): any {
    if (node.default !== undefined) return JSON.parse(JSON.stringify(node.default));

    const type = resolveType(node);
    switch (type) {
        case 'object':  return {};
        case 'array':   return [];
        case 'string': {
            if (Array.isArray(node.enum) && node.enum.length > 0) {
                return node.enum[0]; // Pick first valid enum value
            }
            return '';
        }
        case 'number':
        case 'integer': {
            if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0];
            if (node.minimum !== undefined) return node.minimum;
            return 0;
        }
        case 'boolean':
            return false;
        default:
            // If type is unknown but has properties, treat as object
            if (node.properties) return {};
            if (node.items) return [];
            return '';
    }
}

/**
 * Describe the default we'd scaffold for logging purposes.
 */
function describeDefault(node: SchemaNode): string {
    const type = resolveType(node);
    switch (type) {
        case 'object':  return '{}';
        case 'array':   return '[]';
        case 'string':  return '""';
        case 'number':
        case 'integer': return '0';
        case 'boolean': return 'false';
        default:
            if (node.properties) return '{}';
            if (node.items) return '[]';
            return '""';
    }
}

/**
 * Fuzzy-match a string value against enum candidates.  Uses normalised
 * (lowercased, stripped of dashes/underscores) comparison with Levenshtein
 * distance as tie-breaker.
 *
 * Returns the best match or the first enum value if nothing is close.
 */
function fuzzyMatchEnum(value: string, candidates: any[]): any {
    const strCandidates = candidates.filter(c => typeof c === 'string');
    if (strCandidates.length === 0) return candidates[0];

    const norm = (s: string) => s.toLowerCase().replace(/[-_\s]/g, '');
    const nValue = norm(value);

    // Exact normalised match
    for (const c of strCandidates) {
        if (norm(c) === nValue) return c;
    }

    // Prefix/contains match
    for (const c of strCandidates) {
        const nc = norm(c);
        if (nc.startsWith(nValue) || nValue.startsWith(nc)) return c;
        if (nc.includes(nValue) || nValue.includes(nc)) return c;
    }

    // Levenshtein distance
    let best = strCandidates[0];
    let bestDist = Infinity;
    for (const c of strCandidates) {
        const d = levenshtein(nValue, norm(c));
        if (d < bestDist) {
            bestDist = d;
            best = c;
        }
    }

    // If Levenshtein distance is too large (>50% of target length),
    // fall back to the schema default or first enum value
    if (bestDist > Math.max(nValue.length, norm(best).length) * 0.5) {
        return strCandidates[0];
    }

    return best;
}

/**
 * Simple Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    // Use single-row optimisation
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let curr = new Array(n + 1);

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,       // deletion
                curr[j - 1] + 1,   // insertion
                prev[j - 1] + cost  // substitution
            );
        }
        [prev, curr] = [curr, prev];
    }

    return prev[n];
}

/**
 * Pick the best-matching `oneOf` / `anyOf` branch for the given object
 * value.  Uses a simple scoring heuristic: count how many of the branch's
 * `required` fields are present in the value.  Returns the highest-scoring
 * branch, or undefined if none matched at all.
 */
function pickBestBranch(value: Record<string, any>, branches: SchemaNode[]): SchemaNode | undefined {
    let best: SchemaNode | undefined;
    let bestScore = -1;

    for (const branch of branches) {
        let score = 0;

        // Score based on required fields present
        if (Array.isArray(branch.required)) {
            for (const key of branch.required) {
                if (key in value) score += 2;
                else score -= 1; // Penalty for missing required
            }
        }

        // Score based on properties present (weaker signal)
        if (branch.properties) {
            for (const key of Object.keys(branch.properties)) {
                if (key in value) score += 1;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            best = branch;
        }
    }

    return bestScore >= 0 ? best : branches[0];
}

/**
 * Shallow-merge two schema nodes.  Properties, required, and
 * additionalProperties from `b` overlay `a`.
 */
function mergeSchemas(a: SchemaNode, b: SchemaNode): SchemaNode {
    const merged: SchemaNode = { ...a };

    if (b.properties) {
        merged.properties = { ...(a.properties || {}), ...b.properties };
    }
    if (b.required) {
        const aReq = new Set(a.required || []);
        for (const r of b.required) aReq.add(r);
        merged.required = [...aReq];
    }
    if (b.additionalProperties !== undefined) {
        merged.additionalProperties = b.additionalProperties;
    }
    if (b.type) merged.type = b.type;
    if (b.enum) merged.enum = b.enum;
    if (b.items) merged.items = b.items;
    if (b.minimum !== undefined) merged.minimum = b.minimum;
    if (b.maximum !== undefined) merged.maximum = b.maximum;

    return merged;
}
