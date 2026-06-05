/**
 * Robust JSON extraction utilities for LLM output.
 *
 * LLM responses often arrive wrapped in markdown code fences, sometimes with
 * leading/trailing prose.  These helpers strip the noise and parse the
 * embedded JSON, distinguishing "valid JSON but wrong shape" from genuinely
 * malformed input.
 */

import type { BmadModel } from '../chat/ai-provider';

/**
 * Result of a successful JSON extraction.
 */
export interface ExtractResultOk {
    ok: true;
    /** The parsed JSON value (always a non-null object per the type guard) */
    data: Record<string, unknown>;
}

/**
 * Result of a failed JSON extraction.
 */
export interface ExtractResultErr {
    ok: false;
    /** Human-readable reason for failure */
    error: string;
    /** Raw text snippet (first N chars) for debugging */
    raw: string;
}

/** Union of extraction outcomes. */
export type ExtractResult = ExtractResultOk | ExtractResultErr;

/**
 * The canonical regex used across the codebase to find a JSON code block
 * inside LLM output.  It matches a fenced block opened by ```json (or just
 * ```) and captures everything up to the closing ```.
 *
 * Pattern breakdown:
 *   ```(?:json)?  — opening fence, optionally with "json" language tag
 *   \s*           — optional whitespace after the opening fence
 *   ([\s\S]*?)   — non-greedy capture of the block content (including newlines)
 *   ```           — closing fence
 */
const JSON_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/;

/**
 * Extract and parse a JSON object from LLM output.
 *
 * Algorithm:
 *   1. Search for the first ```json … ``` fence (case-insensitive variant
 *      also accepted by normalising the input first).
 *   2. Strip the fence markers and any leading/trailing whitespace.
 *   3. Attempt JSON.parse on the candidate string.
 *   4. Type-guard the parsed value: it must be a non-null object.
 *      "Valid JSON that is not an object" (e.g. a bare array or string)
 *      is returned as an error so callers can distinguish it from
 *      genuinely malformed input.
 *
 * @param text  Raw LLM output that may contain prose around the JSON block.
 * @returns     ExtractResult — either { ok: true, data } or { ok: false, error, raw }.
 */
export function extractJson(text: string): ExtractResult {
    // ── Step 1: find the JSON fence ──────────────────────────────────────────
    const candidate = text.trim();
    const match = candidate.match(JSON_FENCE_RE);

    let jsonStr: string;
    if (match !== null) {
        // Fence found — use the captured content
        jsonStr = match[1].trim();
    } else {
        // No fence at all — treat the entire trimmed string as JSON candidate
        jsonStr = candidate;
    }

    // ── Step 2: parse ────────────────────────────────────────────────────────
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            error: `JSON parse error: ${msg}`,
            raw: candidate.slice(0, 500),
        };
    }

    // ── Step 3: type guard — must be a non-null object ───────────────────────
    // This distinguishes "valid JSON, but not an object" from "malformed JSON".
    // Arrays are technically valid JSON but the BMAD system always expects
    // artifact objects, so they are treated as errors here.
    if (typeof parsed !== 'object' || parsed === null) {
        return {
            ok: false,
            error: `Parsed JSON is ${typeof parsed === 'object' && parsed === null ? 'null' : typeof parsed}, expected a JSON object`,
            raw: candidate.slice(0, 500),
        };
    }

    // ── Step 4: return the data ───────────────────────────────────────────────
    return {
        ok: true,
        data: parsed as Record<string, unknown>,
    };
}
