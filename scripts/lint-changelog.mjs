#!/usr/bin/env node
/**
 * scripts/lint-changelog.mjs
 *
 * Lints CHANGELOG.md against the project's tone-and-length style:
 *   - duplicate H3 headings
 *   - H2 sections (one per version) over --max-words (default 1500)
 *   - internal-jargon lead-ins:
 *       **path/to/file.ts**  or  **methodName()**     (bold form)
 *       `path/to/file.ts`    or  `methodName()`       (code-span form)
 *   - orphan backticks (unmatched ` outside fenced code blocks)
 *
 * Exits 1 on any violation. Use --soft to warn-only (exit 0) so the
 * script can be introduced against an existing CHANGELOG without breaking CI.
 *
 * Usage:
 *   node scripts/lint-changelog.mjs                          # lint CHANGELOG.md
 *   node scripts/lint-changelog.mjs path/to/other.md         # lint a specific file
 *   node scripts/lint-changelog.mjs --max-words 1000         # override the cap
 *   node scripts/lint-changelog.mjs --soft                   # warn, do not fail
 */

import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const soft = argv.includes('--soft');
const maxWordsIdx = argv.indexOf('--max-words');
const maxWords = maxWordsIdx > -1 ? Number(argv[maxWordsIdx + 1]) : 1500;
const file = argv.find((a, i) => {
  if (a.startsWith('--')) return false;
  if (maxWordsIdx > -1 && i === maxWordsIdx + 1) return false;
  return true;
}) || 'CHANGELOG.md';

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  console.error(`error: cannot read ${file}: ${err.message}`);
  process.exit(2);
}

const lines = text.split(/\r?\n/);
let violations = 0;
let warnings = 0;

const fail = (rule, msg) => { violations++; console.error(`  [${rule}] ${msg}`); };
const warn = (rule, msg) => { warnings++;  console.error(`  [${rule}] ${msg}`); };
const report = (rule, msg) => (soft ? warn : fail)(rule, msg);

console.log(`Linting ${file} (max-words=${maxWords}, ${soft ? 'soft' : 'strict'} mode)`);

// 1) Duplicate H3 headings
{
  const seen = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+(.+?)\s*$/);
    if (!m) continue;
    const h = m[1].trim();
    if (!seen.has(h)) seen.set(h, []);
    seen.get(h).push(i + 1);
  }
  for (const [h, lns] of seen) {
    if (lns.length > 1) {
      report('duplicate-h3', `lines ${lns.join(',')}: duplicate "### ${h}"`);
    }
  }
}

// 2) Word cap per ## section
{
  let current = null;
  let startLine = 0;
  let words = 0;
  const close = () => {
    if (!current) return;
    if (words > maxWords) {
      report('word-cap',
        `${current} (starts line ${startLine}): ${words} words exceeds cap of ${maxWords}`);
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const v = lines[i].match(/^##\s+(.+?)\s*$/);
    if (v) {
      close();
      current = v[1].trim();
      startLine = i + 1;
      words = 0;
      continue;
    }
    if (current) words += (lines[i].match(/\S+/g) || []).length;
  }
  close();
}

// 3) Internal-jargon lead-ins (file paths and function calls in bold/code spans)
{
  const boldFile = /\*\*[^*\n]*\b[\w./-]+\.(ts|tsx|js|mjs|cjs|json|yaml|yml|md|css|scss|html|sh|ps1|bat)\b[^*\n]*\*\*/;
  const boldCall = /\*\*[^*\n]*\b[a-zA-Z_]\w*\(\)[^*\n]*\*\*/;
  const tickFile = /`[^`\n]*\b[\w./-]+\.(ts|tsx|js|mjs|cjs|json|yaml|yml|md|css|scss|html|sh|ps1|bat)\b[^`\n]*`/;
  const tickCall = /`[^`\n]*\b[a-zA-Z_]\w*\(\)[^`\n]*`/;
  const patterns = [
    ['jargon:bold-file', boldFile],
    ['jargon:bold-call', boldCall],
    ['jargon:tick-file', tickFile],
    ['jargon:tick-call', tickCall],
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) continue; // skip fence delimiters
    for (const [rule, re] of patterns) {
      if (re.test(line)) {
        report(rule, `line ${i + 1}: ${line.trim().slice(0, 160)}${line.length > 160 ? '...' : ''}`);
        break;
      }
    }
  }
}

// 4) Orphan backticks outside fenced code blocks
{
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const ticks = (line.match(/`/g) || []).length;
    if (ticks % 2 !== 0) {
      report('orphan-backtick',
        `line ${i + 1}: odd backtick count (${ticks}): ${line.trim().slice(0, 120)}`);
    }
  }
}

console.log('');
if (violations > 0) {
  console.error(`${violations} violation(s), ${warnings} warning(s)`);
  process.exit(soft ? 0 : 1);
}
console.log(warnings === 0
  ? 'ok — no violations'
  : `ok — no violations, ${warnings} warning(s)`);
