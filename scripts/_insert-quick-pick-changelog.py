#!/usr/bin/env python3
"""
One-shot CHANGELOG inserter for the click-to-hover Headroom quick-pick entry.

Strategy: anchor-based — append the new entry immediately BEFORE the line
`## 0.5.5`, which lands it at the bottom of the existing `## Unreleased`
section (after all prior Headroom entries). Avoid any overwrite of the
existing 130k+ char file.
"""
from pathlib import Path

PATH = Path("CHANGELOG.md")
ANCHOR = "## 0.5.5\n"

NEW_ENTRY = """### Feature: Headroom \u2014 click-to-hover quick-pick on the active bar

Click the active Headroom bar (`$(rocket) XX%` or the `$(rocket) Headroom` zero-calls label) to surface a transient QuickPick with SharedContext, CCR store, and Recent Compress Calls drilldowns. Settings stays reachable from the quick-pick\u2019s terminal row.

- **Active-bar click routed to `agileagentcanvas.headroom.showDetails`** \u2014 `headroom-status-bar.ts` switches `_item.command` to the new command for the two active states (`running + zero calls`, `running with stats`). All four non-active branches (disabled / starting / offline fallback / offline failed) keep their existing `workbench.action.openSettings` action so the lifecycle-aware help text remains the obvious next step on first launch.
- **HEADROOM_SHOW_DETAILS_COMMAND constant** \u2014 exported from `headroom-status-bar.ts` as a module-level const so the test file can pin both ends (status-bar `command` + registered command id) without a typo regression.
- **Top-level QuickPick layout** \u2014 `headroom-quick-pick.ts` builds 5 stable rows: Compressor summary (`$(rocket) Headroom Compression \u2014 XX% saved`) \u2192 SharedContext (A2A handoffs; switches id from `sharedContextHeader` to the real `sharedContext` based on `entries > 0`) \u2192 CCR store (`$(database) CCR store`) \u2192 Recent compress calls (`$(history) Recent compress calls`) \u2192 Open Headroom settings (`$(settings-gear) Open Headroom settings`). Wrapped in a `vscode.window.showQuickPick` titled `Headroom Compression`.
- **SharedContext drilldown** \u2014 Read-only summary when entries > 0; falls back to an information message (`SharedContext has no entries yet\u2026`) otherwise.
- **CCR store drilldown** \u2014 Fetches `getCCRStats()` and renders key/value rows; falls back to the info-message surface (`CCR store stats unavailable\u2026`) on SDK rejection so a stale or older headroom-ai doesn\u2019t crash the click flow.
- **Recent Compress Calls drilldown** \u2014 Renders the ring buffer (capped at 20 entries, newest first) with per-call breakdown (`$(compress) ago \u00b7 % saved \u00b7 tokens saved`, message-count delta, transforms applied, compression ratio). Selecting a row opens the full `RecentCompressCall` JSON in a Beside-column virtual text document with a 5 s status-bar message summarizing the selection. Drilldown errors are caught and logged through the `headroom-quick-pick` logger (reaches the Agile Agent Canvas output channel, not dev-tools only).
- **`RecentCompressCall` ring buffer** \u2014 `in-process-proxy.ts` exposes `getRecentCalls()` returning a `ReadonlyArray<Readonly<RecentCompressCall>>` snapshot (defensive `.slice()` copy), FIFO-evicted at `RECENT_CALL_CAP = 20`. `_pushRecentCallForTest(entry)` test-only accessor sidesteps Node\u2019s TIME_WAIT port-release race so cap-and-shape invariants can be asserted without binding port 8787.
- **`agileagentcanvas.headroom.showDetails` command registered** \u2014 `extension.ts` registers the command via `vscode.commands.registerCommand` and pushes the disposable to `context.subscriptions` for clean teardown.

21 new vitest assertions across three test files: `src/views/headroom-quick-pick.test.ts` (NEW, 11 tests: top-level layout, drilldown routing per id, SharedContext header-variant switching, CCR live-stats picker + error fallback, Recent-calls empty-state info-message path, cancel-on-top); 6 new `src/views/headroom-status-bar.test.ts` describe blocks (active-bar click routing per non-active branch + show-details command constant pinning); 4 new `src/integrations/headroom/in-process-proxy.test.ts` ring-buffer describe blocks (empty default, snapshot immutability, cap=20 invariant with oldest/newest survivor locked, entry shape).
"""

def main() -> None:
    raw = PATH.read_bytes().decode("utf-8")
    # Normalize CRLF/CR to LF for the anchor match (we'll restore LF on write).
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    if ANCHOR not in text:
        raise SystemExit(
            f"Anchor not found: {ANCHOR!r}. Was the version boundary renamed?"
        )
    # Insert the entry immediately before the version boundary, with a
    # trailing blank line so the boundary still sits flush at the bottom
    # of the Unreleased section.
    new_text = text.replace(ANCHOR, NEW_ENTRY + "\n" + ANCHOR, 1)
    if new_text == text:
        raise SystemExit("No change produced \u2014 duplicate run?")
    PATH.write_bytes(new_text.encode("utf-8"))
    print(f"OK \u2014 inserted {len(NEW_ENTRY)} chars before `{ANCHOR.strip()}`.")

if __name__ == "__main__":
    main()
