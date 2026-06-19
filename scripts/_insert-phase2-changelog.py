#!/usr/bin/env python3
"""One-shot helper to insert the Phase 2 changelog entry. Run once, then keep the file for documentation."""
import sys

PATH = 'CHANGELOG.md'

ANCHOR = '### Feature: Headroom status bar \u2014 always visible with descriptive state text\n'

ENTRY = '''
### Feature: Headroom \u2014 in-process proxy (zero-effort setup, auto-manages port 8787)

The extension now owns the Headroom proxy lifecycle so users never need to run `npx headroom-ai proxy` manually. The proxy speaks the wire-protocol subset the headroom-ai SDK actually consumes (health, compress, retrieve, telemetry).

- **In-process Node http server** \u2014 Listens on `127.0.0.1:8787` (the SDK\u2019s default baseUrl) on activate. Wire-protocol endpoints: GET /health, GET /v1/health, GET /v1/telemetry, GET /v1/retrieve/stats, POST /v1/compress, POST /v1/retrieve. Auto-disposed on extension deactivate (with closeAllConnections drain so in-flight SDK calls don\u2019t crash during shutdown).
- **EADDRINUSE coexists with the real engine** \u2014 If port 8787 is already taken (a separate headroom-ai proxy process is running), the extension steps aside and uses the external proxy. Status bar surfaces this distinctly so users know which one is answering.
- **Na\u00efve MVP compression** \u2014 /v1/compress returns snake_case wire-format responses and applies dedupe (adjacent identical messages) + content truncation (capped at 4000 chars) + rough token estimation (len/4). Real engine-quality compression still requires the standalone engine.
- **Malformed-body safety** \u2014 Bad JSON in POST bodies returns 400 { error: { type: invalid_request } } instead of a generic 500, so the SDK can disambiguate client input errors from server faults.
- **notifyHeadroomProxyStarting() now real** \u2014 Sets the proxy state to starting and refreshes the status bar. The bar subscribes to every proxy-state transition so refreshes are event-driven, never polling.
- **New $(rocket) Headroom: starting\u2026 state** \u2014 Shown while the proxy boots (under a second in practice), suppresses the previous 'proxy offline' flicker on cold start.
- **Revised offline copy** \u2014 Differentiates fallback (external proxy already running on 8787), failed (other listen error \u2014 check the output channel), and idle (extension will auto-spawn on activation). No more 'run npx headroom-ai proxy' advice \u2014 the extension owns this.
- **New LM-tool contracts untouched** \u2014 Existing agileagentcanvas_headroom_simulate and agileagentcanvas_headroom_retrieve LM tools keep working; the proxy\u2019s wire-protocol endpoints back them transparently.

11 new vitest assertions across in-process-proxy.test.ts (lifecycle, endpoints, listen-error handling, managed-stats snapshot immutability) + 4 new status-bar describe blocks (starting, fallback, failed, subscription-driven refresh).
'''

with open(PATH, 'rb') as f:
    raw = f.read().decode('utf-8').replace('\r\n', '\n').replace('\r', '\n')

count = raw.count(ANCHOR)
if count != 1:
    print(f'ERROR: expected exactly 1 anchor, got {count}', file=sys.stderr)
    sys.exit(1)

new = raw.replace(ANCHOR, ANCHOR + ENTRY, 1)
with open(PATH, 'wb') as f:
    f.write(new.encode('utf-8'))

print('OK -- entry inserted at byte', raw.find(ANCHOR))
