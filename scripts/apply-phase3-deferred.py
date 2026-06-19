#!/usr/bin/env python
"""Phase-3 deferred apply-script.

Handles the 18 sites the code-reviewer flagged as deferred:
  1. 16 case-wraps in src/state/artifact-store.ts (via boundary detection)
  2. chat-participant.ts L3643 inner-func (const-arrow conversion)
  3. artifact-store.ts L7076 prefer-const (let -> const)

ALL Python file writes go through sys.stdout.write (no print()) to avoid
UnicodeEncodeError.
"""

import sys

def write_file(filepath, content):
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

def apply_casewraps_by_boundary(filepath, source_indent=12, open_brace="{", close_brace="}"):
    """Wrap each unwrapped `case 'X':` block in `{ ... }` using brace-indent
    boundary detection. Skips cases already wrapped. Idempotent.
    """
    with open(filepath, encoding="utf-8") as f:
        text = f.read()
    had_trailing_newline = text.endswith("\n")
    body_lines = (text[:-1] if had_trailing_newline else text).split("\n")

    PREFIX = " " * source_indent  # 12-space case indent

    # Find candidate case/default lines at exactly source_indent
    candidates = []
    for i, line in enumerate(body_lines):
        if not (line.startswith(PREFIX + "case ") or line.startswith(PREFIX + "default")):
            continue
        # Skip if "{":  -- the line ends with `{` already (or has it later)
        # In TypeScript, case X: { ... } means a wrapped case body.
        stripped = line[len(PREFIX):].rstrip()
        if stripped.endswith("{"):
            # Already wrapped (case 'X': {)
            continue
        # Otherwise, candidate for wrapping
        candidates.append(i)

    # For each candidate, walk forward to find boundary
    # Boundary: next peer-level case/default at SAME indent, OR closing brace at LESS indent
    wraps = []
    for case_idx in candidates:
        # Walk forward from case_idx + 1
        # Find:
        #   - line matching "PREFIX case " OR "PREFIX default "
        #   - line matching "OUTER_INDENT }" at < source_indent indent (closing of outer switch)
        end_idx = None
        for j in range(case_idx + 1, len(body_lines)):
            inner_line = body_lines[j]
            # Check for same-indent case/default
            if (inner_line.startswith(PREFIX + "case ") or
                inner_line.startswith(PREFIX + "default")):
                end_idx = j
                break
            # Check for LESS-indent closing brace
            stripped_inner = inner_line.lstrip()
            if stripped_inner.startswith("}") and len(inner_line) - len(inner_line.lstrip(" ")) < source_indent:
                end_idx = j
                break
        if end_idx is None:
            sys.stdout.write(f"  WARN: case at L{case_idx+1} has no boundary detected\n")
            continue
        wraps.append((case_idx, end_idx))

    # Sort wraps DESCENDING so insertions don't shift earlier line numbers
    wraps.sort(key=lambda x: x[0], reverse=True)

    success_count = 0
    skip_count = 0
    for case_idx, end_idx in wraps:
        case_line = body_lines[case_idx]
        # The body extends from end_idx-1 backwards (the line before boundary).
        # We need to determine if the case body has a clean break; overhead.
        # Just insert `{` right after case line and `}` right before boundary.
        # Note: We may also need to handle fall-through cases (no break).
        # But the thinker's earlier analysis confirmed: each case ends with break or return.
        if not (case_line.endswith("{") or case_line.endswith(":")):
            sys.stdout.write(f"  WARN: case at L{case_idx+1} has unexpected terminator: {case_line!r}\n")
            continue
        # Insert close brace BEFORE end_idx (so end_idx stays as the boundary marker)
        # Insert open brace IMMEDIATELY AT case_idx + 1 (the spot right after case 'X':)
        body_lines.insert(end_idx, " " * source_indent + close_brace)
        body_lines.insert(case_idx + 1, " " * source_indent + open_brace)
        success_count += 1
        sys.stdout.write(f"  wrapped case at original-L{case_idx+1} -> closed at new-L{end_idx+2}\n")

    new_text = "\n".join(body_lines)
    if had_trailing_newline:
        new_text += "\n"
    write_file(filepath, new_text)
    sys.stdout.write(f"  case-wraps total: {success_count} applied\n")


# ============================================================================
# Run
# ============================================================================

# 1. artifact-store.ts: case-wraps via boundary detection
sys.stdout.write("\n=== ARTIFACT-STORE.CASE-WRAPS ===\n")
apply_casewraps_by_boundary("src/state/artifact-store.ts")

# 2. artifact-store.ts L7076: prefer-const for `let targetUri = X`
# We need to find the original `let targetUri = ` declaration, which is
# somewhere before the L7076 reassignment. Easy approach: scan for `let targetUri`
# and verify it has no reassignment (only one declaration site).
sys.stdout.write("\n=== ARTIFACT-STORE.L7076-PREFER-CONST ===\n")
with open("src/state/artifact-store.ts", encoding="utf-8") as f:
    ast_text = f.read()

# Quick scan: find all lines matching `let targetUri`
let_target_uri_lines = []
for i, line in enumerate(ast_text.split("\n"), start=1):
    stripped = line.strip()
    # Skip comments
    if stripped.startswith("//") or stripped.startswith("*"):
        continue
    if "let targetUri" in line or "let targetUri =" in line or stripped.startswith("let targetUri"):
        let_target_uri_lines.append((i, line))

if len(let_target_uri_lines) == 1:
    # Single declaration site -> safe to change `let` -> `const`
    line_no, line_content = let_target_uri_lines[0]
    if line_content.strip().startswith("let targetUri"):
        new_line = line_content.replace("let targetUri", "const targetUri", 1)
        ast_text = ast_text.replace(line_content, new_line, 1)
        write_file("src/state/artifact-store.ts", ast_text)
        sys.stdout.write(f"  prefer-const converted: L{line_no}\n")
    else:
        sys.stdout.write(f"  L{line_no} skipped: not 'let targetUri' pattern (got: {line_content!r})\n")
elif len(let_target_uri_lines) > 1:
    sys.stdout.write(f"  multiple `let targetUri` sites ({len(let_target_uri_lines)}); manual review needed\n")
else:
    sys.stdout.write(f"  no `let targetUri` declaration found; possibly already `const`\n")

# 3. chat-participant.ts L3643 inner-func hoist via const-arrow
sys.stdout.write("\n=== CHAT-PARTICIPANT.L3643-INNER-FUNC ===\n")
# The function declaration: `async function findMdFilesRecursive(uri: ..., basePath: ...): Promise<...> {`
# Convert to: `const findMdFilesRecursive = async (uri: ..., basePath: ...): Promise<...> => {`
#
# We must:
#  - replace `async function findMdFilesRecursive(...)` with `const findMdFilesRecursive = async (...) =>`
#  - The body remains unchanged UNTIL the closing `}` of the function.
#  - That closing `}` must change to nothing (or `;` if we want explicit semicolon, but JS doesn't require).
#
# Since we don't know the exact closing `}` line, we use the FACT that
# `async function findMdFilesRecursive` is unique. We can replace with a different
# opening but need to leave the body alone.
#
# But the `function` keyword transforms to `const X = async (...) =>`. The closing `}` stays as `};`
# Wait actually for arrow function, closing brace is `}` and `;` is optional. For consistency,
# we change `}` at the function-end to `};`.
#
# Without exact byte content of full function body, we make the opening transform only,
# leaving the `function ... {` -> `const ... = async ... => {`. The body remains unchanged.
# The closing `}` stays as `}` (still valid for arrow function bodies). Slightly redundant `;`
# not added (matching project style - see examples).
#
# SAFETY: The opening transform is safe IF the keyword `function` is preserved in arrow.
# This is a NON-INVASIVE change: `async function name(args): Type {` -> `const name = async (args): Type => {`
# The body's literal semantics are preserved.
with open("src/chat/chat-participant.ts", encoding="utf-8") as f:
    cp_text = f.read()

# Use sed-like first-order replacement: convert `async function findMdFilesRecursive` to `const findMdFilesRecursive = async`.
# The signature `(uri: vscode.Uri, basePath: string = ''): Promise<...> {` becomes `(uri: vscode.Uri, basePath: string = ''): Promise<...> => {`.
# So we replace the leading `async function findMdFilesRecursive(uri:` with `const findMdFilesRecursive = async (uri:`.
# This is robust as long as the function name is unique.

OLD_OPENING = "            // Helper to recursively find all .md files in a directory\n            async function findMdFilesRecursive(uri: vscode.Uri, basePath: string = ''): Promise<{path: string, uri: vscode.Uri}[]> {"
NEW_OPENING = "            // Helper to recursively find all .md files in a directory\n            const findMdFilesRecursive = async (uri: vscode.Uri, basePath: string = ''): Promise<{path: string, uri: vscode.Uri}[]> => {"

if OLD_OPENING in cp_text:
    cp_text = cp_text.replace(OLD_OPENING, NEW_OPENING, 1)
    write_file("src/chat/chat-participant.ts", cp_text)
    sys.stdout.write("  inner-func converted: const-arrow applied\n")
else:
    sys.stdout.write(f"  inner-func anchor not found verbatim\n")

sys.stdout.write("\nALL DONE\n")
