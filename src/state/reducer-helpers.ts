/**
 * Shared reducer helper utilities.
 *
 * Phase 18 lifts the per-file `pickChanges(changes, fieldList)` helper
 * that was added in Phase 17 (commits `fec166e` cis, `1f47652` tea,
 * `06adb75` bmm, `5aa0931` l1) into a single shared implementation
 * here.  The four reducer modules now import it via
 *
 *     import { pickChanges } from './reducer-helpers';
 *
 * instead of each declaring an identical local copy.
 *
 * Add future reducer-body helpers to this module rather than re-
 * introducing per-file copies — the goal of Phase 18 is to centralize
 * the cross-module reducer utility surface so that audits,
 * refactors, and lint sweeps touch a single file.
 */

/**
 * Pick only defined fields from the wire packet (`changes`) using the
 * given allowlist, returning a fresh `Record<string, any>` with just
 * those fields set.  Replaces the indexed-access for-loop boilerplate
 * that was duplicated 26+ times across the cis/tea/bmm/l1 reducer
 * bodies:
 *
 *     for (const f of [
 *         'a', 'b', 'c',
 *     ]) {
 *         if ((changes as any)[f] !== undefined) upd[f] = (changes as any)[f];
 *     }
 *
 * with a single line:
 *
 *     Object.assign(upd, pickChanges(changes, ['a', 'b', 'c']));
 *
 * # Allowlist sources
 *
 * The `fieldList` argument accepts any `readonly string[]` source, so
 * reducers can use either form (both are observed across the codebase):
 *
 * - **Inline array literal** (cis, tea, bmm style):
 *
 *       Object.assign(upd, pickChanges(changes, [
 *           'fieldA', 'fieldB', 'fieldC',
 *       ]));
 *
 *   The inline form stays grep-discoverable: any reader can find the
 *   field list by grepping `pickChanges(changes, [` in the consuming
 *   file.
 *
 * - **Const-var declared inside the reducer body** (l1 style):
 *
 *       const contentFields = [ 'fieldA', 'fieldB', 'fieldC' ];
 *       Object.assign(updatedTD, pickChanges(changes, contentFields));
 *
 *   The const-var form keeps the field list close to the reducer body
 *   that uses it, which is the stylistic choice the l1 module has
 *   consistently made for the test-design fields.
 *
 * # Returns
 *
 * A fresh `Record<string, any>` containing ONLY the entries from
 * `fieldList` whose `changes[f]` is defined (not `undefined`).  The
 * caller typically chains `Object.assign(upd, ...)` to merge these
 * into an existing target object — preserving the original mutation
 * semantics of the for-loop pattern.
 */
export function pickChanges(
    changes: any,
    fieldList: readonly string[],
): Record<string, any> {
    const out: Record<string, any> = {};
    for (const f of fieldList) {
        if (changes[f] !== undefined) out[f] = changes[f];
    }
    return out;
}
