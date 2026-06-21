#!/usr/bin/env python3
"""
One-shot CHANGELOG inserter for the Phase 3.2 (tool-result summarisation) entry.

Idempotent on the boundary marker — running twice does NOT double-insert.
"""
from pathlib import Path

CHANGELOG = Path("CHANGELOG.md")
ENTRY_TEXT = """### Feature: Headroom — tool-result summarisation with re-stringify + parse-verify guard (Phase 3.2)

The in-process proxy now actively summarises role:'tool' / role:'function' JSON content before tokenising, recovering meaningful savings on the longest messages (tool outputs dominate LM prompt bytes for code-heavy sessions).

- **Role detection** — A new `_isToolish(msg)` helper returns true for `role:'tool'`, `role:'function'`, or `role:'user'` whose content is a multi-part array containing any part with `type` starting with `'tool_result'`. Strict role-based detection (rather than `type`-only) avoids accidentally compressing arbitrary model prose.
- **`_summariseToolResult(content)` — three branches**:
  - **Array root** — strict `JSON.parse` succeeds and the root is an array: keep first 2 + last 1 items, splice in a `\"...[${N - 3} items truncated]...\"` placeholder string between them.
  - **Object root** — strict `JSON.parse` succeeds and the root is an object: walk top-level keys, truncate any string value > 500 chars to a 500-char prefix + `…[truncated N chars]…` suffix marker. Per the design the walk is top-level only — deep recursion is not in scope for engine-grade compression delivered by an upstream binary.
  - **Non-JSON / scalar** — leave the original untouched (LM-bound prose must not be broken).
- **Re-stringify + parse-verify guard** — after every successful summarise, the helper calls `JSON.parse(reStringified)` to confirm the round-trip is valid. If it throws (NaN/Infinity, unicode surrogates, or any other strict-JSON incompatibility), the helper returns `null` and the caller leaves the original content unchanged. Failure mode is \"uncompressed original\", strictly safer than a malformed payload reaching the LM.
- **Multi-part `role:'user'` content** — the integration in `_naiveCompress` walks every part of an array content; for any `{type:'tool_result', ...}` part whose inner `content` is a summarisable string, the inner string is summarised independently. `tool_use_id` and non-tool parts (text, image_url) pass through untouched.
- **Transform label discipline** — `_headroomSummarised` is stamped only when content was actually reduced; the new `'compress_tool_call'` transform only appears in `transforms_applied` when at least one message was shrunk. Identity transforms still report `'identity'`. Ordering: `'dedupe'` → `'compress_tool_call'` → `'truncate'` (or `'identity'` if none fired).
- **`_estimateMessageTokens` extended** — multi-part content with `type:'tool_result'` parts now counts `countTokens(part.content)` for each such part (otherwise the summarise-vs-after BPE delta reads as zero and the bar hides real savings). Text-bearing parts continue to count their `text` field; image-bearing parts remain at 0 because they're not billable as text. JSDoc updated to document the new branch.

Tests — 5 new endpoint-surface assertions in `src/integrations/headroom/in-process-proxy.test.ts`: 1000-item array root summarisation with re-parse; non-JSON prose untouched; object-mode walk key truncation with re-parse; parse-failure revert (fail-open safety); multi-part `role:'user'` tool_result inner array summarised end-to-end with `tool_use_id` preserved and real BPE savings asserted. Total in-process-proxy suite: 19 → 24 tests; full Headroom vitest suite: 120 → 125 / 0; `npm run bundle` verified.

Wire format unchanged — `tokens_before` / `tokens_after` / `transforms_applied` / `compressed` continue to round-trip the SDK's `deepCamelCase` pass. Existing 803-extension Cucumber scenarios unchanged.

"""

boundary_marker = "## 0.5.5"
content = CHANGELOG.read_text(encoding="utf-8")

# Idempotency guard — if the Phase 3.2 marker line is already present, no-op.
if "Headroom \u2014 tool-result summarisation with re-stringify + parse-verify guard (Phase 3.2)" in content:
    print("[insert-phase-3-2] Entry already present; skipping.")
    raise SystemExit(0)

boundary_idx = content.find(boundary_marker)
if boundary_idx < 0:
    raise SystemExit(f"[insert-phase-3-2] Boundary marker {boundary_marker!r} not found in CHANGELOG.md")

# Insert the entry + a blank-line spacer immediately before the boundary.
insertion_point = boundary_idx
new_content = content[:insertion_point] + ENTRY_TEXT + content[insertion_point:]
CHANGELOG.write_text(new_content, encoding="utf-8")
print("[insert-phase-3-2] Entry inserted before", boundary_marker)
