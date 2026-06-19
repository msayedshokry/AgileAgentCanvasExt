#!/usr/bin/env python
"""Phase-2 lint apply-script (v2): line-number-driven reverse-order insertion.

WHY v2?
  v1 failed with 16/26 anchors "not found" because the multi-line anchors
  matched by exact substring but the line-number approach is robust to
  whitespace/indentation drift since each comment is auto-indented to
  match the offending line directly below it.

PROCESSING ORDER:
  Sort all flagged sites in DESCENDING line-number order, then insert
  `// eslint-disable-next-line <rule> -- <rationale>` ABOVE each line.
  This keeps line numbers of unprocessed sites stable after each insert.

DELETION:
  L2525 `bmadPath` is a genuinely-unused local (verified). We delete the
  line entirely (cleaner than a no-unused-vars disable for dead code).

L3170 `_id` destructure:
  Inline disable (NOT delete `_id` — removing the `_id` slot would
  silently bundle `id` into `contentFields`, changing runtime behavior).

TRAILING NEWLINE:
  Preserved from the source file (do NOT force a trailing newline).
"""

import sys

filepath = sys.argv[1] if len(sys.argv) > 1 else "src/workflow/workflow-executor.ts"

with open(filepath, encoding="utf-8") as f:
    text = f.read()

# Detect trailing newline (preserved on write-back).
had_trailing_newline = text.endswith("\n")
if had_trailing_newline:
    text_no_eof = text[:-1]
else:
    text_no_eof = text

# Split into lines with newlines preserved (except very last line).
lines = text_no_eof.split("\n")

# (line_number, ruleId, rationale).
# Sorted DESCENDING line_number in the apply-loop so insertions don't shift.
# All line numbers verified against fresh lint output (see lint-triage run).
SITES = [
    # ===== HIGHEST LINE FIRST (reverse order) =====
    (3833, "@typescript-eslint/no-explicit-any", "Generic artifact-store interface (team workflow)"),
    (3832, "@typescript-eslint/no-explicit-any", "Generic artifact parameter (team workflow); discriminator narrows downstream"),
    (3687, "@typescript-eslint/no-explicit-any", "Generic artifact-store interface (lane transitions reuse the same store contract as executeWithTools)"),
    (3686, "@typescript-eslint/no-explicit-any", "Generic artifact parameter; discriminator narrows downstream"),
    (3490, "@typescript-eslint/no-explicit-any", "Schema validator init failure (executeWithDirectApi); debug-log-only"),
    (3416, "@typescript-eslint/no-explicit-any", "Workflow runtime config; dynamic blob from user-authored workflow (not typeable at compile time)"),
    (3401, "@typescript-eslint/no-explicit-any", "Generic artifact parameter; discriminator narrows downstream"),
    (3366, "@typescript-eslint/no-explicit-any", "Nudge loop error (executeWithTools); debug-log-only path"),
    (3341, "@typescript-eslint/no-explicit-any", "vscode.lm.invokeTool rejection (recurring path); error opaque from VS Code LM API"),
    (3170, "@typescript-eslint/no-unused-vars",  "Intentionally destructuring `id` as `_id` to EXCLUDE it from `contentFields` rest pattern; removing the `_id` slot would silently bundle `id` into contentFields"),
    (3144, "@typescript-eslint/no-explicit-any", "Read-on-disk error (executeWithTools validation fallback); debug-log-only path"),
    (3123, "@typescript-eslint/no-explicit-any", "Envelope shape decided by TS-narrowed branches downstream"),
    (3077, "@typescript-eslint/no-explicit-any", "Tool-call `input` shape is dynamic per agent mode; validator downstream narrows"),
    (3052, "@typescript-eslint/no-explicit-any", "vscode.lm.invokeTool rejection; error is opaque from VS Code LM API"),
    (3005, "@typescript-eslint/no-explicit-any", "vscodeLm.sendRequest rejection; error type is opaque from VS Code LM API"),
    (2808, "@typescript-eslint/no-explicit-any", "Schema validator init failure (executeWithTools variant); debug-log-only"),
    (2716, "@typescript-eslint/no-explicit-any", "Generic artifact-store interface; load/save union of 38 artifact types"),
    (2713, "@typescript-eslint/no-explicit-any", "Generic artifact parameter; discriminator narrows downstream"),
    (2660, "@typescript-eslint/no-explicit-any", "Generic Copilot chat artifact context; runtime type-narrowing deferred"),
    (2596, "@typescript-eslint/no-explicit-any", "Schema validator init failure (buildWorkflowPrompt); err shape varies across implementations; debug-log-only"),
    (2563, "@typescript-eslint/no-explicit-any", "Generic Copilot chat artifact context; runtime type-narrowing deferred to discriminated-union refactor"),
    # ===== L2525 = `bmadPath` DELETE (NOT inline-disable) ===== handled specially below
    (1726, "@typescript-eslint/no-explicit-any", "`frontmatter` is parsed YAML; shape is dynamic per workflow file"),
    (1577, "@typescript-eslint/no-var-requires",  "Cyclic dynamic workspace-resolver load; require breaks circular import between workflow-executor <-> extension"),
    (1236, "@typescript-eslint/no-explicit-any", "Generic artifact parameter; discriminator narrows downstream in session lifecycle"),
    (118,  "@typescript-eslint/no-explicit-any", "Generic config blob; loadConfig returns untyped YAML"),
    (103,  "@typescript-eslint/no-explicit-any", "Generic artifact container; discriminated-union narrowing is post-lint-debt scope"),
    (76,   "@typescript-eslint/no-explicit-any", "Generic artifact output container; discriminated-union narrowing across 38 BMAD artifact types is post-lint-debt scope"),
    (69,   "@typescript-eslint/no-explicit-any", "Dynamic YAML/MD front-matter key-value capture; interface intentionally extensible for user-authored workflows"),
]

def leading_spaces(line_text: str) -> int:
    return len(line_text) - len(line_text.lstrip(" "))

# ===== STEP 1: DELETE the genuinely-unused `bmadPath` line at L2526 =====
# (Per fresh lint output: L2526:C15 flagged for no-unused-vars.)
# Verify the line content before deletion.
target_delete_idx = 2526 - 1  # 0-based for 1-based L2526
expected_delete = "const bmadPath = this.context.bmadPath;"
if expected_delete not in lines[target_delete_idx]:
    sys.stderr.write(
        f"FAILED: L2526 expected to contain {expected_delete!r}, "
        f"but found {lines[target_delete_idx]!r}\n"
    )
    sys.exit(2)
del lines[target_delete_idx]
deleted_count = 1
print("DELETED L2526 (bmadPath)")

# ===== STEP 2: Insert disable comments in REVERSE-line-number order =====
# After STEP 1 deletion, every L with L > 2526 (strict greater) shifts DOWN by 1.
# Sites with L <= 2526 are unaffected (the delete line itself is not in SITES).
def shift_if_post_delete(line_num: int) -> int:
    return line_num - 1 if line_num > 2526 else line_num

# Sort DESCENDING line-number so insertions don't shift subsequent indices.
# We compute post-deletion 1-based line numbers then sort descending.
adjusted = sorted(
    [(shift_if_post_delete(l), r, rat) for (l, r, rat) in SITES],
    key=lambda t: t[0],
    reverse=True,
)

failures = []
operations = 0
for lineno_1b, rule_id, rationale in adjusted:
    idx = lineno_1b - 1  # 0-based (post-deletion)
    if idx < 0 or idx >= len(lines):
        failures.append((lineno_1b, "OUT-OF-RANGE", f"lines has {len(lines)}"))
        continue
    current_line = lines[idx]
    indent = leading_spaces(current_line)
    # Build the disable comment at the same indent.
    comment = " " * indent + f"// eslint-disable-next-line {rule_id} -- {rationale}"
    # Sanity: confirm the current line still contains a trigger keyword for the rule.
    if rule_id.endswith("no-explicit-any") and "any" not in current_line:
        failures.append((lineno_1b, f"line at idx {idx} has no 'any'; expected at least one", current_line[:80]))
        continue
    if rule_id.endswith("no-var-requires") and "require(" not in current_line:
        failures.append((lineno_1b, f"line at idx {idx} has no 'require('; expected exactly that pattern", current_line[:80]))
        continue
    if rule_id.endswith("no-unused-vars") and "_id" not in current_line:
        failures.append((lineno_1b, f"line at idx {idx} has no '_id'; expected the destructure", current_line[:80]))
        continue
    # Insert the comment line at position idx (BEFORE the flagged line).
    lines.insert(idx, comment)
    operations += 1

if failures:
    print(f"FAILED: {len(failures)} site(s) had bad anchors. Diagnostics:")
    for lineno, kind, snip in failures:
        print(f"  L{lineno}: {kind}: {snip}")
    sys.exit(1)

print(f"OK: applied {operations} inline-disables + {deleted_count} deletion(s).")

# ===== STEP 3: Rejoin preserving trailing newline semantics =====
final_text = "\n".join(lines)
if had_trailing_newline:
    final_text += "\n"

with open(filepath, "w", encoding="utf-8") as f:
    f.write(final_text)

print(f"Wrote {filepath}: {len(lines)} lines post-edit.")
