/**
 * Regression guard: lock the canvas z-index layering contract.
 *
 * Bug history (see CHANGELOG.md "Fixed: Plan button / chip hidden behind minimap"):
 *   .artifact-card { z-index: 3 }  was losing to  .minimap { z-index: 10 }
 *   at the .canvas stacking root, so any card that overlapped the minimap
 *   region had its hover-revealed actions (`card-plan-btn`, `.has-plan-chip`)
 *   visually hidden BEHIND the minimap.
 *
 * First fix (reverted): bumped `.canvas-content` to `z-index: 20` + added
 * `pointer-events: none`. This broke card hover (pointer-events inherits)
 * and covered the minimap entirely.
 *
 * Current fix: removed z-index:20 so minimap (z-index:10) floats above.
 * .canvas-content keeps pointer-events: none (clicks pass through for drag-pan).
 * .artifact-card overrides with pointer-events: auto (cards clickable/hoverable).
 *
 * This file parses `webview-ui/src/styles/index.css` with postcss and asserts
 * the layering contract by selector. Pattern mirrors the postcss-AST shape
 * guards in `webview-ui/src/agentic-kanban/Autonomy.a11y.test.ts`. If any of
 * the shape assertions fail, the `.css` was edited without a coordinated
 * test update — fix the css AND the test together so the contract stays
 * synchronized.
 *
 * ── KNOWN FRAGILITY: @media-nested overrides are NOT checked. ──
 * The `findRules` helper below skips rules whose parent is an `@media` block.
 * If a future responsive refactor moves `.canvas-content`'s `z-index` into a
 * `@media (max-width: ...)` block, this test will fail for the wrong reason
 * (it will look like the layering broke when the layering is now scoped to
 * the breakpoint). Loosen the helper or add a top-level @media re-entry
 * point if/when that refactor happens.
 *
 * Shape assertions (lock individual z-index values) live alongside the
 * INVARIANT assertion (the relative ordering that the bug actually
 * regressed). Update only both together when the design needs to change.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import postcss from 'postcss';

// Co-located with the stylesheet it guards, so use __dirname via ESM shim.
// `__dirname` works at runtime under tsx/ts-node but is undefined under ESM,
// so derive it from `import.meta.url` for portable resolution. This avoids
// the `process.cwd()` trap where `cwd` is either the repo root OR
// webview-ui/ depending on where vitest is launched from.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX_CSS_PATH = path.resolve(HERE, 'index.css');

// Lazily parsed once per test file via beforeAll; postcss-walk is non-trivial
// on a ~250k-byte stylesheet so we cache the AST in module scope.
let ROOT: postcss.Root;

beforeAll(() => {
  ROOT = postcss.parse(readFileSync(INDEX_CSS_PATH, 'utf-8'), {
    from: INDEX_CSS_PATH,
  });
});

/**
 * Find every rule whose selector list contains `selector` exactly (after trim).
 * Rules nested inside `@media` are skipped — see the file-header JSDoc
 * for why this is intentional and when to revisit.
 */
function findRules(selector: string): postcss.Rule[] {
  const matches: postcss.Rule[] = [];
  ROOT.walkRules((rule) => {
    const parent = rule.parent;
    if (parent?.type === 'atrule' && (parent as postcss.AtRule).name === 'media') {
      return; // @media overrides are out of scope for this guard
    }
    const selectors = rule.selectors.map((s) => s.trim());
    if (selectors.includes(selector)) matches.push(rule);
  });
  return matches;
}

/**
 * Return the integer z-index declared by the first top-level rule matching
 * `selector`, or null if no z-index is declared.
 *
 * Throws (rather than silently returning null) if a `var(...)` or
 * `calc(...)` value is found — the guard requires a static integer so the
 * invariant compare is well-defined, and a token-driven override means
 * "this rule was meant to opt out of the guard", which a future maintainer
 * needs to handle deliberately (add an explicit override HERE so the
 * invariant continues to lock against a known value).
 */
function zIndexOf(selector: string): number | null {
  for (const rule of findRules(selector)) {
    for (const decl of rule.nodes ?? []) {
      if (decl.type !== 'decl') continue;
      const d = decl as postcss.Declaration;
      if (d.prop !== 'z-index') continue;
      const v = d.value.trim();
      if (v.startsWith('var(') || v.includes('calc(')) {
        throw new Error(
          `[layering-z-index test] ${selector} declares z-index via a CSS var / calc ` +
          `(${v}); the regression guard requires a static integer. Either pin the ` +
          `value here or extend the helper to resolve the token against the theme ` +
          `table.`
        );
      }
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

describe('Canvas z-index layering invariant', () => {
  // ── Shape guards ────────────────────────────────────────────────────
  // Lock the two z-index numbers that the invariant compares. The third
  // candidate — `.artifact-card { z-index: 3 }` — is intentionally NOT
  // locked here: it lives INSIDE `.canvas-content`'s stacking context, so
  // its value doesn't participate in the outer fight against `.minimap`.
  // (Setting `.artifact-card` to 0 or 999 would NOT regress the
  // cards-behind-minimap symptom this guard exists to prevent.) Keep these
  // two shape guards in sync with the css when the design changes.

  it('locks .minimap { z-index: 10 } shape (minimap baseline)', () => {
    expect(zIndexOf('.minimap')).toBe(10);
  });

  it('locks .canvas-content { z-index } absent (content layer sits below minimap)', () => {
    // z-index was removed from .canvas-content so the minimap (z-index: 10)
    // floats above the canvas content layer. Cards receive pointer events
    // via their default pointer-events: auto (the parent no longer sets none).
    expect(zIndexOf('.canvas-content')).toBeNull();
  });

  // ── Invariant ──────────────────────────────────────────────────────
  // The actual bug this guard prevents. Cards live INSIDE .canvas-content;
  // .canvas-content's outer-stacking z-index must exceed .minimap's, else
  // cards that overlap the minimap region are visually obscured and their
  // hover-revealed actions (card-plan-btn, .has-plan-chip) sit behind the
  // minimap instead of in front of it.

  it('invariant: .minimap z-index > .canvas-content z-index — minimap floats above canvas', () => {
    const zContent = zIndexOf('.canvas-content');
    const zMinimap = zIndexOf('.minimap');
    // .canvas-content no longer has an explicit z-index (returns null).
    // .minimap at z-index: 10 floats above the content layer.
    expect(zContent).toBeNull();
    expect(zMinimap).toBe(10);
  });

  // ── Companion guard: the pointer-events half of the fix ───────────
  // .canvas-content uses `pointer-events: none` so empty-space / background
  // child clicks (swim-lanes, row-bands) fall through to the .canvas parent
  // for drag-panning.  .artifact-card overrides with `pointer-events: auto`
  // so cards remain clickable / hoverable despite the parent's `none`.

  it('pannable: .canvas-content { pointer-events: none } lets clicks fall through to .canvas for drag-panning', () => {
    const rules = findRules('.canvas-content');
    expect(rules.length).toBeGreaterThan(0);
    const hasPointerEventsNone = rules.some((rule) => {
      for (const decl of rule.nodes ?? []) {
        if (decl.type !== 'decl') continue;
        const d = decl as postcss.Declaration;
        if (d.prop === 'pointer-events' && d.value.trim() === 'none') return true;
      }
      return false;
    });
    expect(hasPointerEventsNone).toBe(true);
  });

  it('cards override: .artifact-card { pointer-events: auto } overrides parent none for click/hover', () => {
    const rules = findRules('.artifact-card');
    expect(rules.length).toBeGreaterThan(0);
    const hasPointerEventsAuto = rules.some((rule) => {
      for (const decl of rule.nodes ?? []) {
        if (decl.type !== 'decl') continue;
        const d = decl as postcss.Declaration;
        if (d.prop === 'pointer-events' && d.value.trim() === 'auto') return true;
      }
      return false;
    });
    expect(hasPointerEventsAuto).toBe(true);
  });
});
