# Phase 3 — Real Compression Quality on the In-Process Headroom Proxy

**Status:** Design proposal (no source-code changes yet)
**Owner:** Headroom integration
**Builds on:** Phase 2 (in-process proxy on `127.0.0.1:8787`, snippet `4d448e8`)

## Goals

Replace today's naïve `[compress]` (neighbour-dedupe + 4000-char truncate + `ceil(len/4)` heuristic) with engine-grade transforms the upstream `headroom-ai` proxy advertises:

1. **Cached-pattern detection** — repeat content surfaces via CCR hashes, not re-sent as full payloads.
2. **Tool-result summarization** — preserve call signatures, strip prose.
3. **CCR cross-call dedup** — in-memory store keyed by content hash; `/v1/retrieve` now resolves hashes the proxy has seen; `getCCRStats()` reflects the store.

## Non-Goals (Out of Scope)

- Semantic summarisation (requires an LLM round-trip — we'd approximate via AST heuristics instead).
- Real CCR gzip content — kept as JSON text references; the SDK treats `content: null` as "miss" today, so we don't need to ship the literal bytes.
- Tuning the heuristic `MAX_CONTENT_LEN` from 4000 → other values — that's a runtime config knob for a later iteration.

## Priority Sequence

| Slice | Why | Effort | Risk |
|---|---|---|---|
| **3.1 Real tokenizer** | The `ceil(len/4)` heuristic over-counts code, under-counts CJK, and skews the bar's percentage. Fixing this corrects every downstream metric. | XS — swap `_estimateMessageTokens` for `gpt-tokenizer.encode(...).length`. | Low — pure read-only change to token counts. |
| **3.2 Tool-result summarisation** | Pure transformation; no shared state. Wins savings on the longest messages first (tool outputs dominate LM prompt bytes). | S — role detection + JSON-array truncation + multi-part handling. | Medium — must not return malformed JSON, must not lose tool-call IDs. |
| **3.3 CCR cross-call dedup** | Biggest bar-percentage win for repeat prompts (auto-recovery, refresh-button runs). Touches both `POST /v1/compress` and `POST /v1/retrieve` plus `GET /v1/retrieve/stats`. | M — new module-level `Map<hash, CcrEntry>` with LRU eviction + stats shape change. | Medium — role-aware hashing required to avoid role collisions; must handle multi-part content arrays in the canonical form. |
| **3.4 Cached-pattern detection (in-request)** | Builds on 3.3 — recognise per-request repeats beyond just neighbour-dedupe. | S — same family as 3.3 but bounded to a single request. | Low — bounded scope; safe to roll back per test. |

Each slice is independently shippable. 3.1 lands first because it changes no public surface and corrects the metric baseline for everything that follows.

## 3.1 — Real Tokenizer (`gpt-tokenizer` v3.4.0)

The dep is already in `package.json` (`gpt-tokenizer: ^3.4.0`). API confirmed:

```ts
import { encode, countTokens } from 'gpt-tokenizer';
// OR for model-aware encoding:
import { encoding_for_model } from 'gpt-tokenizer';
countTokens('const x = function(){}');  // → exact token count
```

**Algorithm:**

```ts
// Replace _estimateMessageTokens() in in-process-proxy.ts:
function _estimateMessageTokens(msg: any): number {
    const c = _contentOf(msg);
    if (typeof c === 'string') return countTokens(c);
    if (Array.isArray(c)) {
        return c.reduce((sum, part) =>
            typeof part?.text === 'string' ? sum + countTokens(part.text) : sum, 0);
    }
    return 0;
}
```

**Test contract (new in `in-process-proxy.test.ts`):**

- `test('estimates tokens via real BPE tokenizer, not the len/4 heuristic')`
- Fixture: `"const x = function(){}"` — heuristic ≈ 26/4=7 tokens; BPE ≈ 6.
- Expect: `result.tokens_before === 6` (or whatever BPE returns — exact value should be locked).

## 3.2 — Tool-Result Summarisation

Detect tool-output messages, summarise their JSON content while preserving call IDs.

**Detection:**

```ts
function _isToolish(msg: any): boolean {
    return msg?.role === 'tool'
        || msg?.role === 'function'                          // legacy OpenAI
        || (msg?.role === 'user' && Array.isArray(msg?.content)
            && msg.content.some((p: any) => p?.type?.startsWith('tool_result')));
}
```

**Compression strategy:**

1. Try `JSON.parse(content)`. If it parses:
   - If root is an array: keep first 2 + last 1 items, splice in `"...[${N-3} items truncated]..."`.
   - If root is an object: walk keys, truncate any string value > 500 chars (slice + `"…[truncated ${orig - 500} chars]…"`).
   - Re-stringify. **Verify the re-stringified JSON parses** before returning.
2. If `content` is a non-JSON string: leave as-is (the message is structured for the LM — don't break it).
3. Append `'compress_tool_call'` to `transforms_applied`.

**Test contract:**

- `test('summarises role:tool JSON arrays while keeping the JSON parsable')`
- Input: `{ role: 'tool', content: JSON.stringify({results: [{i: 0}, {i:1}, ...1000 items]}) }`
- Output: `result.messages[0].content` is valid JSON, ≤ first 2 + last 1 items, `transforms_applied` contains `compress_tool_call`.

- `test('leaves non-JSON tool content untouched')`
- Input: role:tool with content that's markdown prose.
- Output: content unchanged, no `compress_tool_call` added.

## 3.3 — CCR Cross-Call Dedup (Module State)

In-memory store keyed by content hash; `/v1/retrieve` resolves stored hashes; `getCCRStats()` reports the store.

**Data structure:**

```ts
interface CcrEntry {
    role: string;             // role prevents 'sys'/'user' hash collisions
    contentRef: string;       // first 200 chars (preview, not the full body)
    originalTokens: number;
    compressedTokens: number; // == originalTokens for now (we're a stub proxy)
    timestamp: number;        // epoch seconds
}

const _ccr = new Map<string, CcrEntry>();
const CCR_CAP = 1000;            // LRU cap
```

**Hash function (covers text + multi-part + array content):**

```ts
function _hashMessage(msg: any): string {
    const c = _contentOf(msg);
    const normalised = typeof c === 'string' ? c
        : Array.isArray(c) ? JSON.stringify(c)
        : '';
    return require('node:crypto').createHash('sha256')
        .update(msg?.role ?? '').update('\u0000').update(normalised)
        .digest('hex').slice(0, 16);   // 16 hex = 64 bits, plenty for dedup
}
```

`/v1/compress` integration:

```ts
const hash = _hashMessage(m);
let entry = _ccr.get(hash);
if (!entry) {
    entry = {
        role: msg.role ?? 'user',
        contentRef: typeof c === 'string' ? c.slice(0, 200) : '[multi-part]',
        originalTokens: _estimateMessageTokens(msg),
        compressedTokens: _estimateMessageTokens(msg),
        timestamp: Date.now() / 1000,
    };
    _ccr.set(hash, entry);
}
// LRU eviction when over cap
if (_ccr.size > CCR_CAP) {
    const oldest = [..._ccr.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    _ccr.delete(oldest[0]);
}
```

Response change:

```ts
{
    ...existing fields...,
    ccr_hashes: [hash],   // single-element for now; richer content-addressing is Phase 4
}
```

`/v1/retrieve` integration:

```ts
const payload = body ? safeJsonParse(body) : {};
const hash = payload.hash;
const entry = _ccr.get(hash);
if (!entry) {
    return { hash, content: null, similarity: 0, cached: false };
}
return {
    hash,
    content: entry.contentRef,  // preview, not full body
    similarity: 1.0,            // we stored it ourselves
    cached: true,
    tokenCount: entry.originalTokens,
};
```

`/v1/retrieve/stats` shape change:

```ts
{
    enabled: true,
    entries: _ccr.size,
    totalOriginalTokens: [..._ccr.values()].reduce((s, e) => s + e.originalTokens, 0),
    totalCompressedTokens: [..._ccr.values()].reduce((s, e) => s + e.compressedTokens, 0),
    totalTokensSaved: 0,                               // we're stub-equivalent
    savingsPercent: 0,
    hitRate: 0,                                        // instrument separately if useful
}
```

**Test contract:**

- `test('populates ccrHashes across identical disjoint requests')`
- Two `/v1/compress` calls with one identical message each → second call's response carries the first call's hash in `ccr_hashes`.
- `test('retrieves the stored preview from /v1/retrieve')`
- After populating CCR via `/v1/compress`, post to `/v1/retrieve` with the returned hash → `content` matches the first-200-char preview; `cached: true`.
- `test('evicts cache on cap')`
- Blast 1001 unique messages → `_ccr.size ≤ 1000`.
- `test('does not hash-collide role:user and role:system with identical text')`
- Same text, two different roles → two different hashes.

## 3.4 — Cached-Pattern Detection (Within a Single Request)

Strengthen neighbour-dedupe with non-adjacent dedup using the same hash function as 3.3.

**Algorithm sketch:**

```ts
const seen = new Set<string>();
const deduped: any[] = [];
for (const m of messages) {
    const hash = _hashMessage(m);
    if (seen.has(hash)) {
        continue;
    }
    seen.add(hash);
    deduped.push(m);
}
// append 'cross_dedupe' to transforms_applied IF deduped.length < messages.length
```

**Test contract:**

- `test('dedupes non-adjacent identical messages')`
- Input: `[{a}, {b}, {a}, {c}]` → output: 3 messages, `transforms_applied` includes `cross_dedupe`.

## Cross-Cutting Risks

| Risk | Mitigation |
|---|---|
| SDK expects snake_case keys; breaking this breaks round-trip. | Keep `tokens_before` / `tokens_after` etc. — already locked in test. |
| `ccr_hashes` may carry multi-element arrays in real engine responses. | Always return an array (single-element is fine). |
| LRU eviction under load must not block the response. | Map iteration during eviction is bounded by cap (≤1000). |
| Role-less messages (rare but possible) hashing as `''`. | Default `role = 'unknown'` before hashing. |
| Multi-part content (array of parts) — `JSON.stringify` order matters. | Sort keys recursively before hashing as a canonical step. |

## Migration Path

- All four slices are additive. `_naiveCompress` becomes `_compressV3`; old tests that assert the snapshot shape (`tokens_before` etc.) continue to pass because we're emitting the same wire shape.
- The bar's savings percentage SHOULD improve noticeably in test fixtures (heuristic vs BPE + dedup + cross-dedup + tool summarisation). Recommend capturing before/after bar text on a representative LM call for the doc.
- Rollback is simple: revert to `_naiveCompress` (single function rename).

## Open Questions for the User

1. **LRU cap size.** 1000 entries is a guess. Should this be configurable via `agileagentcanvas.headroom.ccrCapacity`?
2. **CCR preview length.** Stored as first-200-chars preview. Should it be configurable?
3. **Tool-result heuristic aggressiveness.** Currently keeps first 2 + last 1 items. Should this also be configuration-driven? (Probably no — a 1.5% variance hits the bar noticeably.)
4. **gpt-tokenizer model selection.** Default `cl100k_base` works for GPT-4 family; Anthropic Claude uses a different tokenizer. Should we maintain a per-model encoder map? (Adds latency — defer.)
