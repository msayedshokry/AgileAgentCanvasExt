// Insert a single CHANGELOG bullet under "## Unreleased" immediately AFTER
// the existing `### Fixed: 32 WCAG contrast fails in autonomy surfaces` block
// (i.e. immediately BEFORE the next sibling topic). CRLF-aware: anchored
// bytes match whether EOL is LF or CRLF. Idempotent: re-running the script
// on a CHANGELOG that already contains the new block is a no-op (marker
// detection exits early).
//
// Usage: `node scripts/_update-changelog-chippalette.mjs`
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CHANGELOG = path.resolve(process.cwd(), 'CHANGELOG.md');
const raw = readFileSync(CHANGELOG, 'utf-8');

// Strip all CR so the regex/anchor logic is EOL-agnostic.
const normalized = raw.replace(/\r/g, '');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';

const MARKER = '### Added: chip-palette tokenization';
if (normalized.includes(MARKER)) {
  console.log('CHIP_PALETTE_MARKER_PRESENT_SKIP');
  process.exit(0);
}

// Anchor: next sibling topic header. Inserting BEFORE this header places
// the chip-palette addendum adjacent to its sibling WCAG-fails topic, with
// the Validation: line of the original bullet still governing the topic.
const NEXT_SIBLING_HEADER = '### Removed: 10 legacy BMAD tea/testarch duplicate directories';
if (!normalized.includes(NEXT_SIBLING_HEADER)) {
  console.log('ANCHOR_NOT_FOUND_EXITING_NONDESTRUCTIVELY');
  console.log('Could not locate the next sibling header. Manual CHANGELOG insertion required.');
  process.exit(0);
}

const NEW_BULLET = [
  '',
  '### Added: chip-palette tokenization + 9-test cross-theme regression',
  '',
  'Follow-up to the `32 WCAG contrast fails` fix: the three long-standing chip-palette',
  'buckets for `architecture` (`#4f46e5` indigo), `sprint/ops/research` (`#0891b2` cyan),',
  'and `design/CIS/innovation` (`#db2777` pink) now declare as',
  '`var(--vscode-charts-{indigo|cyan|pink}, #UniversalFallbackHex)` instead of hardcoded hexes.',
  'The Universal fallback keeps chips legible in built-in themes (VS Code upstream defines',
  '`--vscode-charts-blue/green/orange/purple/red/yellow` but NOT `indigo/cyan/pink` — so the',
  'fallback always fires today; theme authors opt in by declaring the new tokens).',
  '`@media (prefers-color-scheme: {dark,light})` overrides are tuned per-theme so chips',
  'clear WCAG 3:1 UI-floor against their own alpha-tinted bg in Dark+/Light+/HC-Dark.',
  'The per-theme TOKS-resolution table is documented in JSDoc in `Autonomy.css` and locked',
  'by 9 new tests in `Autonomy.a11y.test.ts` (3 buckets × 3 themes) that resolve the',
  '`var(--vscode-charts-X, #fb)` expression through the test TOKS table and assert contrast',
  'against the canonical editor bg (Dark+ `#1E1E1E` / Light+ `#FFFFFF` / HC-Dark `#000000`).',
  '',
].join('\n');

const idx = normalized.indexOf(NEXT_SIBLING_HEADER);
const updated = normalized.slice(0, idx) + NEW_BULLET + normalized.slice(idx);

// Restore CRLF if the original used it.
const restored = EOL === '\r\n' ? updated.replace(/\n/g, '\r\n') : updated;

writeFileSync(CHANGELOG, restored, 'utf-8');
const insertedBytes = restored.length - raw.length;
console.log('INSERTED_OK');
console.log('INSERTED_BYTES=' + insertedBytes);
