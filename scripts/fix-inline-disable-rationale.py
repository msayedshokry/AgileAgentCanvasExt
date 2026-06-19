#!/usr/bin/env python
"""Fix the inline-disable rationale text in chat-participant.ts.

WHY:
  Original rationale claimed TDZ risk from const-arrow conversion. The actual
  call-site audit shows NO earlier call sites; function calls occur AFTER the
  declaration within the enclosing method. Original rationale was inaccurate.

REPLACEMENT rationale:
  "Inner recursive helper scoped to handleConvertToJsonCommand's invocation
  lifecycle; module-scope hoist would lose locality. Function declaration also
  preserves hoisting semantics across the enclosing block."

WHY PYTHON:
  str_replace tool choked on the 238K-char file.
"""

import sys

FILEPATH = "src/chat/chat-participant.ts"

OLD = (
    "            // eslint-disable-next-line no-inner-declarations -- Inner recursive helper is intentionally scoped to the enclosing method's invocation site; converting to const-arrow would break call-site hoisting\n"
)
NEW = (
    "            // eslint-disable-next-line no-inner-declarations -- Inner recursive helper scoped to handleConvertToJsonCommand's invocation lifecycle; module-scope hoist would lose locality, and function-declaration preserves hoisting across the enclosing block\n"
)

with open(FILEPATH, encoding="utf-8") as f:
    text = f.read()

if NEW in text:
    sys.stdout.write("ALREADY_FIXED\n")
    sys.exit(0)

count = text.count(OLD)
if count != 1:
    sys.stdout.write(f"FAIL: old rationale matched {count} times\n")
    sys.exit(1)

new_text = text.replace(OLD, NEW, 1)
# Preserve trailing newline
had_trailing_newline = text.endswith("\n")
if had_trailing_newline and not new_text.endswith("\n"):
    new_text += "\n"

with open(FILEPATH, "w", encoding="utf-8") as f:
    f.write(new_text)

sys.stdout.write("OK: inline-disable rationale text corrected\n")
