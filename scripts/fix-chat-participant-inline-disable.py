#!/usr/bin/env python
"""Apply a single inline-disable to chat-participant.ts L3643 area.

WHY PYTHON?
  str_replace tool choked on the 238K-char file ('No newline at end of file'
  patch errors). Python in-memory str.replace is atomic and reliable.

SITE: src/chat/chat-participant.ts
  Anchor: `// Helper to recursively find all .md files in a directory` (12-space
          indent comment) followed by `async function findMdFilesRecursive`
          at 12-space indent.
  Insert: a single `// eslint-disable-next-line no-inner-declarations -- ...`
          comment line BETWEEN the comment and the function declaration.

IDEMPOTENT: The replacement is keyed on the leading `// Helper ...` comment.
If the inline-disable is already inserted (single-line presence
`no-inner-declarations -- Inner recursive`), the script reports ALREADY_APPLIED
and exits without modification.
"""

import sys

FILEPATH = "src/chat/chat-participant.ts"

ANCHOR = (
    "            // Helper to recursively find all .md files in a directory\n"
    "            async function findMdFilesRecursive("
)

REPLACEMENT = (
    "            // Helper to recursively find all .md files in a directory\n"
    "            // eslint-disable-next-line no-inner-declarations -- Inner recursive helper is intentionally scoped to the enclosing method's invocation site; converting to const-arrow would break call-site hoisting\n"
    "            async function findMdFilesRecursive("
)

ALREADY_APPLIED_MARKER = (
    "            // Helper to recursively find all .md files in a directory\n"
    "            // eslint-disable-next-line no-inner-declarations"
)

with open(FILEPATH, encoding="utf-8") as f:
    text = f.read()

# Idempotency check first
if ALREADY_APPLIED_MARKER in text:
    sys.stdout.write("ALREADY_APPLIED: inline-disable already in file\n")
    sys.exit(0)

count = text.count(ANCHOR)
if count == 0:
    sys.stdout.write(f"FAIL: anchor not found\n")
    sys.stdout.write(f"  anchor head: {ANCHOR[:80]!r}\n")
    sys.exit(1)

if count > 1:
    sys.stdout.write(f"FAIL: anchor matched {count} times (expected 1)\n")
    sys.exit(1)

new_text = text.replace(ANCHOR, REPLACEMENT, 1)

# Preserve trailing newline
had_trailing_newline = text.endswith("\n")
if had_trailing_newline and not new_text.endswith("\n"):
    new_text += "\n"

with open(FILEPATH, "w", encoding="utf-8") as f:
    f.write(new_text)

sys.stdout.write("OK: inline-disable inserted at chat-participant.ts L3643 area\n")
