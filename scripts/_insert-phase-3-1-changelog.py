#!/usr/bin/env python3
"""
One-shot CHANGELOG inserter for the Phase 3.1 (real BPE token counts) entry.

Idempotent on the boundary marker — running twice does NOT double-insert.
"""
from pathlib import Path

CHANGELOG = Path("CHANGELOG.md")
ENTRY_TEXT = """### Feature: Headroom — real BPE token counts via gpt-tokenizer (Phase 3.1)

The in-process proxy's token-estimator no longer uses the uniform `ceil(content.length / 4)` heuristic — it now uses `countTokens(text)` from `gpt-tokenizer` (cl100k_base BPE, the same encoding family GPT-4 uses) for string content, and `countTokens(part.text)` per text-part for multi-part OpenAI content. Non-text parts (image_url, etc.) contribute 0 because the bar's "saved tokens" metric is a textual estimate by design — image bytes aren't billable as text.

- **Wire format unchanged** — `tokens_before` / `tokens_after` / `tokens_saved` keys continue to round-trip the existing `deepCamelCase` pass through the headroom-ai SDK. No breaking change for `/v1/compress` callers.
- **Bar percentages now correct** — code-heavy prompts were over-counted by the heuristic (ASCII operators/punctuation split aggressively under BPE, ~2.5 chars per token for JS/CSS) and CJK Han characters were under-counted (each is typically 1 token, not 0.25). The mismatch could skew the status-bar savings percentage by several points for these prompt shapes. BPE aligns to whatever the downstream SDK actually bills.
- **Only the heuristic changed** — adjacent-message dedupe (step 1), 4000-char content cap (step 2), and the snake_case wire response are all unchanged. Phase 3.2 (tool-result summarization) and 3.3 (CCR cross-call dedup) are the next incremental slices, each independently shippable.
- **New vitest assertion** — single test in `src/integrations/headroom/in-process-proxy.test.ts` (`endpoint surface` describe block) locks the count to whatever `gpt-tokenizer.countTokens(fixture)` returns at test-time AND asserts it is NOT the legacy `ceil(fixture.length / 4)` heuristic value. Fixture: `'hello world test message'` (23 chars; BPE encodes 4 tokens while heuristic returns 6; the 4 ≠ 6 delta is what makes the regression guard meaningful).
- **Bundle compat** — `git-tokenizer` v3.4.0 is dual-published ESM+CJS. esbuild for `platform: 'node'` CJS output bundles the CJS build cleanly. `npm run bundle` verified end-to-end.
- **Comment / helper cleanups** — `TOKEN_CHARS_PER_TOKEN` constant removed (dead after the swap); `_estimateMessageTokens` now carries a JSDoc explaining the rationale for the swap and the multi-part/empty-string edge cases; the file-header algorithm section back-references `docs/phase-3-compression-design.md` for the rest of the rollout plan.

Existing 803-extension Cucumber scenarios, 119 vitest assertions, and the 19-test in-process-proxy suite continue to pass.

"""

boundary_marker = "## 0.5.5"
content = CHANGELOG.read_text(encoding="utf-8")

# Idempotency guard — if the Phase 3.1 marker line is already present, no-op.
if "Headroom \u2014 real BPE token counts via gpt-tokenizer (Phase 3.1)" in content:
    print("[insert-phase-3-1] Entry already present; skipping.")
    raise SystemExit(0)

boundary_idx = content.find(boundary_marker)
if boundary_idx < 0:
    raise SystemExit(f"[insert-phase-3-1] Boundary marker {boundary_marker!r} not found in CHANGELOG.md")

# Insert the entry + a blank-line spacer immediately before the boundary.
# Anchor on the line above the boundary so the surrounding paragraphs stay separated.
insertion_point = boundary_idx
new_content = content[:insertion_point] + ENTRY_TEXT + content[insertion_point:]
CHANGELOG.write_text(new_content, encoding="utf-8")
print("[insert-phase-3-1] Entry inserted before", boundary_marker)
