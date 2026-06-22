#!/usr/bin/env node
/**
 * Surgically rewrite the P0/A bullet in CHANGELOG.md. The audit
 * (scripts/a11y-surface-sweep.mjs) mis-computed text-on-pill contrast
 * against `--vscode-editor-background` instead of against the actual
 * pill (yellow) bg, producing a false-positive P0/A finding for
 * `.autonomy-bar-systemic-severity--medium`'s hardcoded `color:#1a1a1a`.
 * Re-computing text vs pill yellow bg across Dark+/Light+/HC-Dark shows
 * the original color clears WCAG AA in every canonical theme. The PR
 * therefore LOCKS the literal hex via the regression test (no actual
 * CSS change to that rule), so a future contributor cannot
 * accidentally swap to `--vscode-editor-*` tokens that would invert to
 * white-on-yellow in Light+ and silently break AA.
 *
 * Handles both CRLF (Windows-default git) and LF line endings by
 * auto-detecting the file's style and re-emitting with the same style
 * after the in-memory LF-form replacement.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CHANGELOG = path.resolve('CHANGELOG.md');

const OLD_LF =
  '- **P0/A — `.autonomy-bar-systemic-severity--medium` color**\n' +
  '  The medium-severity pill inherited a hardcoded `color: #1a1a1a`, which made the text near-invisible in HC-Dark (editor bg `#000000` → contrast ratio `0.91:1`, sub-3:1 UI-component floor). Replaced with `color: var(--vscode-editor-background)` so the text inverts to the editor bg: dark text on yellow in Dark+/Light+ clears 4.5:1; white text on yellow in HC-Dark clears 3:1 (the deliberate trade-off — yellow luminance cannot comfortably clear 4.5:1 against pure white, but at least the pill stays visible instead of crash-invisible).';

const NEW_LF =
  '- **P0/A — `.autonomy-bar-systemic-severity--medium` color (audit false positive; original kept under lock)**\n' +
  '  The audit (`scripts/a11y-surface-sweep.mjs`) initially flagged the hardcoded `color: #1a1a1a` as a P0 regression (HC-Dark contrast `0.91:1`). The audit computed the contrast against `--vscode-editor-background` (`#000000` in HC-Dark) instead of against the **pill (yellow) bg** where the text actually renders — a model error in the audit, not a real CSS defect. Re-computing text vs pill bg across canonical themes shows the original color clears WCAG AA in every case: Dark+ (`#CA8A04` ≈ 5.88:1), Light+ (`#B58900` ≈ 5.45:1), HC-Dark (`#CA8A04` ≈ 5.88:1). **PR action: lock the literal `#1a1a1a` value with the regression test in `Autonomy.a11y.test.ts` (CSS-shape guard `P0/A:`). Do NOT switch to `var(--vscode-editor-*)` tokens — that would invert to white-on-yellow in Light+ and silently drop below the 4.5:1 AA floor.** A future audit correctly measuring text vs surface bg is recorded as a follow-up.';

const raw = readFileSync(CHANGELOG, 'utf-8');
const crlf = /\r\n/.test(raw);
const EOL = crlf ? '\r\n' : '\n';
const text = crlf ? raw.replace(/\r\n/g, '\n') : raw;

if (text.includes('audit false positive; original kept under lock')) {
  console.log('ALREADY_APPLIED — bullet already updated.');
  process.exit(0);
}
if (!text.includes(OLD_LF)) {
  console.error('ANCHOR_NOT_FOUND — P0/A paragraph not detected in CHANGELOG.md');
  process.exit(2);
}

const updated = text.replace(OLD_LF, NEW_LF);
const out = crlf ? updated.replace(/\n/g, '\r\n') : updated;
writeFileSync(CHANGELOG, out, 'utf-8');
console.log('EOL=' + (crlf ? 'CRLF' : 'LF'));
console.log('INSERTED_BYTES=' + (out.length - raw.length));
console.log('FILE_BYTES=' + out.length);
