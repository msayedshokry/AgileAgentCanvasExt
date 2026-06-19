#!/usr/bin/env python3
"""Update doc-comment block in src/test/helpers/assert-trace-breakdown.ts
to reflect that production-side files (handler.ts + webview-ui/types.ts) now
import `TraceBreakdownRow`/`TraceBreakdownMessage`/`UNTAGGED_BUCKET` directly
from this helper instead of mirroring them locally. Idempotent: re-running
is safe (the targeted strings are removed, not appended).
"""
import io
import sys

p = 'src/test/helpers/assert-trace-breakdown.ts'
with io.open(p, 'r', encoding='utf-8') as f:
    content = f.read()

# 1) Update the file-header banner to drop the "production-side mirrors" stanza.
# Match on the unique substring bracketing just the mirrors stanza.
banner_old = (
    '// Production-side mirrors (kept structurally identical):\n'
    '//   - `src/views/agentic-kanban-message-handler.ts` (extension producer)\n'
    '//   - `webview-ui/src/types.ts` (webview consumer prop type)\n'
    '//\n'
    '// The extension and webview-ui are separate TS projects with independent'
)
banner_new = (
    '// Production-side consumers (import directly from this helper, no mirror):\n'
    '//   - `src/views/agentic-kanban-message-handler.ts` (extension producer)\n'
    '//   - `webview-ui/src/types.ts` (webview consumer barrel — re-exports)\n'
    '//   - `webview-ui/src/agentic-kanban/TracePanel.tsx` (webview consumer —\n'
    '//     uses `UNTAGGED_BUCKET` for chip styling)\n'
    '//\n'
    '// The extension and webview-ui are separate TS projects with independent'
)
if banner_old not in content:
    print('ERROR: banner_old not found', file=sys.stderr)
    sys.exit(1)
content = content.replace(banner_old, banner_new, 1)

# 2) Update the "test-side source of truth" language to be neutral.
source_old = '// This module is the **test-side** source of truth for the Trace Breakdown\n'
source_new = '// This module is the **shared** canonical source of truth for the Trace Breakdown\n'
if source_old not in content:
    print('ERROR: source_old not found', file=sys.stderr)
    sys.exit(1)
content = content.replace(source_old, source_new, 1)

# 3) Update the "importer test list" sentence so it includes the production sites.
importers_old = (
    '// IPC wire format. Imported by both the extension-side producer test\n'
    '// (`src/views/agentic-kanban-message-handler.test.ts`) and the webview-side\n'
    '// consumer test (`webview-ui/src/agentic-kanban/TracePanel.test.tsx`) so\n'
    "// producer and consumer agree on the same shape end-to-end \u2014 any drift in"
)
importers_new = (
    '// IPC wire format. Imported by both the extension-side producer test\n'
    '// (`src/views/agentic-kanban-message-handler.test.ts`), the webview-side\n'
    '// consumer test (`webview-ui/src/agentic-kanban/TracePanel.test.tsx`),\n'
    '// AND production source files \u2014 so producer and consumer agree on the same\n'
    "// shape end-to-end \u2014 any drift in"
)
if importers_old not in content:
    print('ERROR: importers_old not found', file=sys.stderr)
    sys.exit(1)
content = content.replace(importers_old, importers_new, 1)

# 4) Update the "surfaces as a compile error" sentence to include production files.
drift_old = (
    '// the row or message shape surfaces as a compile error in BOTH test files\n'
    "// at the same time, instead of silently mismatching at runtime."
)
drift_new = (
    '// the row or message shape surfaces as a compile error in BOTH the test\n'
    "// files AND in the production source files at the same time, instead of\n"
    "// silently mismatching at runtime."
)
if drift_old not in content:
    print('ERROR: drift_old not found', file=sys.stderr)
    sys.exit(1)
content = content.replace(drift_old, drift_new, 1)

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(content)
print('OK: helper doc-comment updated')
