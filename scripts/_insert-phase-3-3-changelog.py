#!/usr/bin/env python3
"""
One-shot CHANGELOG inserter for Phase 3.3 (CCR cross-call dedup).

Inserts a `## Unreleased` entry describing the cross-call remember store,
before the existing `## 0.5.5` boundary. Idempotent — running twice is a
no-op (detected by the presence of the exact title string).

Run from repo root: `python scripts/_insert-phase-3-3-changelog.py`
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANGELOG = ROOT / "CHANGELOG.md"

TITLE = "Headroom — CCR cross-call dedup with LRU"
BODY = """\
### Headroom — CCR cross-call dedup with LRU (Phase 3.3)

Closes the Phase 3 compression rollout (Φ-rate → real BPE → summarise).

- New `in-process-proxy.ts` CCR (Cross-Call Remember) store: module-level
  `Map<hash, CcrEntry>` with LRU semantics (native `Map` insertion order,
  evict-oldest on overflow at `CCR_CAP = 1000`). Hashes are SHA-256 over
  `(role + NUL + canonical(content))`, truncated to 64 bits. Canonical form
  sorts plain-object keys alphabetically while preserving array element
  order — so `[{a, b}, {c}]` and `[{c}, {b, a}]` correctly hash the same
  only when their structural keys align. Phase 4 will revisit hash length.
- New `/v1/retrieve` route returns `{hash, content (preview), similarity,
  cached, tokenCount}` — the SDK can fetch the first 200 chars of any
  original input by hash instead of re-running the full compress pipeline.
  Cache-miss shape echoes `{hash, content:null, similarity:0, cached:false}`.
- New `/v1/retrieve/stats` route surfaces live `{entries, capacity,
  totalOriginalTokens, totalCompressedTokens, totalTokensSaved, hitRate,
  savingsPercent}`. `hitRate` and `savingsPercent` are placeholders until
  Phase 4 wires the hit-vs-miss counter (deferred — see TODO in source).
- `_naiveCompress` now upserts each input message into the CCR store BEFORE
  running dedupe / summarise / truncate, then emits `ccr_hashes` on the
  wire response. Hashes reflect raw-input signatures, so a caller can later
  resolve the most-recent compress call's pre-transform content via
  `/v1/retrieve`.
- `_upsertCcrEntry` is true LRU — on hit, the entry is `delete`/`set` so it
  bumps to the tail of insertion order before re-reading the cap. No
  `Array.sort` per call.
- `/v1/compress` dispose hooks (`server.close()` on listen-error, `_ccr.clear()`
  on dispose) so an extension reload doesn't carry stale hashes from the
  prior workspace into the next session.
- New test surface (12 endpoint tests + 7 CCR-store tests = 19 total for 3.3):
  stable-on-replay hashing, content change → new hash, role scope
  (same content, different roles hash differently), `/v1/retrieve` cache
  hit/miss shapes, `/v1/retrieve/stats` shape, CCR cap at 1001 inserts
  evicts oldest, listen-error handler closes the underlying server so
  subsequent `startInProcessProxy()` calls survive synthetic error events.
- New test utility `_clearCcrForTest()` mirrors `_clearRecentCallsForTest()`
  for test isolation; vitest `beforeEach` clears both before each suite.

All phases green: tsc clean, vitest 132/132 in 1.36s, production bundle clean.
"""

ENTRY_BLOCK = f"### {TITLE}\n\n{BODY}\n"


def _ensure_unreleased_section(text: str) -> str:
    """Insert the entry at the end of an existing `## Unreleased` section, OR
    create the section above `## 0.5.5` if it does not yet exist. Idempotent
    by title (handled by the caller before this helper runs)."""
    boundary = "## 0.5.5"
    if boundary not in text:
        raise SystemExit(
            "Could not locate `## 0.5.5` boundary in CHANGELOG.md; "
            "refusing to insert blindly."
        )
    if "## Unreleased" in text:
        # Unreleased already populated — append entry directly above the next
        # versioned section boundary so it lands as the newest bullet under
        # the open release, without disturbing earlier 3.x entries.
        return text.replace(boundary, f"{ENTRY_BLOCK}\n---\n\n{boundary}", 1)
    # Unreleased section absent — create it above the 0.5.5 boundary.
    return text.replace(boundary, f"## Unreleased\n\n{ENTRY_BLOCK}\n---\n\n{boundary}", 1)


def main() -> int:
    if not CHANGELOG.is_file():
        print(f"CHANGELOG.md not found at {CHANGELOG}", file=sys.stderr)
        return 1
    text = CHANGELOG.read_text(encoding="utf-8")

    if TITLE in text:
        print(f"Already inserted; idempotent no-op ({TITLE!r}).")
        return 0

    new_text = _ensure_unreleased_section(text)
    CHANGELOG.write_text(new_text, encoding="utf-8")
    print(f"Inserted {TITLE!r} into CHANGELOG.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
