const fs = require('fs');
const path = require('path');

const summaryPath = path.join(__dirname, 'coverage', 'coverage-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error(`[coverage-gate] Missing coverage summary: ${summaryPath}`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

const MODULE_THRESHOLDS = [
  { prefix: 'src/state/', lines: 40, branches: 45, funcs: 55, statements: 40 },
  { prefix: 'src/chat/', lines: 43, branches: 50, funcs: 60, statements: 43 },
  { prefix: 'src/workflow/', lines: 45, branches: 60, funcs: 60, statements: 45 }
];

function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

function aggregateModule(prefix) {
  const buckets = {
    lines: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    statements: { covered: 0, total: 0 }
  };

  let matched = 0;

  for (const [filePath, fileSummary] of Object.entries(summary)) {
    if (filePath === 'total') {
      continue;
    }

    const normalized = toForwardSlashes(filePath);
    const marker = `/${prefix}`;
    const isMatch = normalized.endsWith(prefix) || normalized.includes(marker);
    if (!isMatch) {
      continue;
    }

    matched += 1;

    buckets.lines.covered += fileSummary.lines.covered;
    buckets.lines.total += fileSummary.lines.total;

    buckets.branches.covered += fileSummary.branches.covered;
    buckets.branches.total += fileSummary.branches.total;

    buckets.functions.covered += fileSummary.functions.covered;
    buckets.functions.total += fileSummary.functions.total;

    buckets.statements.covered += fileSummary.statements.covered;
    buckets.statements.total += fileSummary.statements.total;
  }

  const pct = (covered, total) => {
    if (total === 0) {
      return 100;
    }
    return Number(((covered / total) * 100).toFixed(2));
  };

  return {
    matched,
    lines: pct(buckets.lines.covered, buckets.lines.total),
    branches: pct(buckets.branches.covered, buckets.branches.total),
    funcs: pct(buckets.functions.covered, buckets.functions.total),
    statements: pct(buckets.statements.covered, buckets.statements.total)
  };
}

let failed = false;

for (const threshold of MODULE_THRESHOLDS) {
  const result = aggregateModule(threshold.prefix);

  if (result.matched === 0) {
    console.error(`[coverage-gate] No files matched prefix '${threshold.prefix}'`);
    failed = true;
    continue;
  }

  console.log(
    `[coverage-gate] ${threshold.prefix} lines=${result.lines}% branches=${result.branches}% funcs=${result.funcs}% statements=${result.statements}%`
  );

  if (result.lines < threshold.lines) {
    console.error(`[coverage-gate] ${threshold.prefix} lines ${result.lines}% < ${threshold.lines}%`);
    failed = true;
  }
  if (result.branches < threshold.branches) {
    console.error(`[coverage-gate] ${threshold.prefix} branches ${result.branches}% < ${threshold.branches}%`);
    failed = true;
  }
  if (result.funcs < threshold.funcs) {
    console.error(`[coverage-gate] ${threshold.prefix} funcs ${result.funcs}% < ${threshold.funcs}%`);
    failed = true;
  }
  if (result.statements < threshold.statements) {
    console.error(`[coverage-gate] ${threshold.prefix} statements ${result.statements}% < ${threshold.statements}%`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('[coverage-gate] Module thresholds passed.');
