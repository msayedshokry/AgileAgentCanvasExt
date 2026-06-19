#!/usr/bin/env python
"""Helper script: read ESLint JSON from stdin, print per-site breakdown + context.

Avoids string-escape hell from inline `python -c '...'` invocations and the
path-resolution issue we hit with `/tmp/lint.json`. Run:

    npx eslint src features --ext ts --rulesdir eslint-rules --format json 2>/dev/null \
      | python scripts/lint-triage.py
"""
import json
import sys
from collections import Counter

# Force UTF-8 stdout so multi-byte chars in workflow-executor.ts print cleanly.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

data = json.load(sys.stdin)
print(f"TOTAL FILES LINTED: {len(data)}")
total = sum(len(f.get("messages", [])) for f in data)
print(f"TOTAL ALL-FILES VIOLATIONS: {total}")
print()

# Read source files for context.
files = {
    "src/workflow/workflow-executor.ts": open("src/workflow/workflow-executor.ts", encoding="utf-8").read().split("\n"),
    "src/workflow/workflow-executor.test.ts": open("src/workflow/workflow-executor.test.ts", encoding="utf-8").read().split("\n"),
}

# Filter to the two target files.
sites_prod = []
sites_test = []
for fobj in data:
    fp = fobj.get("filePath", "").replace("\\", "/")
    base = fp.split("/")[-1] if "/" in fp else ""
    if base == "workflow-executor.ts":
        for m in fobj.get("messages", []):
            sites_prod.append((m.get("line"), m.get("column"), m.get("ruleId"), m.get("message")))
    elif base == "workflow-executor.test.ts":
        for m in fobj.get("messages", []):
            sites_test.append((m.get("line"), m.get("column"), m.get("ruleId"), m.get("message")))

sites_prod.sort()
sites_test.sort()

print(f"=== src/workflow/workflow-executor.ts ({len(sites_prod)} sites) ===")
for line, col, rule, msg in sites_prod:
    print(f"  L{line}:C{col}  {rule:50s}  {msg}")
print()
print(f"=== src/workflow/workflow-executor.test.ts ({len(sites_test)} sites) ===")
for line, col, rule, msg in sites_test:
    print(f"  L{line}:C{col}  {rule:50s}  {msg}")
print()

# Overall rule distribution.
print("=== Top rules across all files ===")
by_rule = Counter()
for fobj in data:
    for m in fobj.get("messages", []):
        by_rule[m.get("ruleId") or "fatal"] += 1
for rule, n in by_rule.most_common():
    print(f"  {n:4d}  {rule}")
print()

# 3-line context around every site.
print("=" * 80)
print("SITES WITH 3-LINE CONTEXT")
print("=" * 80)
fp_map = {
    "workflow-executor.ts": "src/workflow/workflow-executor.ts",
    "workflow-executor.test.ts": "src/workflow/workflow-executor.test.ts",
}
all_sites = []
for fobj in data:
    fp = fobj.get("filePath", "").replace("\\", "/")
    base = fp.split("/")[-1] if "/" in fp else ""
    if base not in fp_map:
        continue
    for m in fobj.get("messages", []):
        all_sites.append((fp_map[base], m.get("line"), m.get("column"), m.get("ruleId"), m.get("message")))
all_sites.sort(key=lambda x: (x[0], x[1]))

for fp, line, col, rule, msg in all_sites:
    lines = files[fp]
    label = "TEST" if "test.ts" in fp else "PROD"
    print(f"-- {label}  L{line}:C{col}  rule={rule}")
    print(f"-- msg: {msg}")
    lo = max(1, line - 3)
    hi = min(len(lines), line + 3)
    for n in range(lo, hi + 1):
        marker = ">>" if n == line else "  "
        print(f"  {marker} L{n}: {lines[n - 1]}")
    print()
