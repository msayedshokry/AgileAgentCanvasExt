# ACC Architecture Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pay down the four highest-risk architectural debts in the Agile Agent Canvas extension: a duplicated activation block, the `bmad-*`/`aac-*` skill-family fork (consolidating onto `aac-*`), the `any`-typed core artifact fields, and the 9,300-line `ArtifactStore` god object.

**Architecture:** Work in four independent, individually-shippable phases ordered by risk-reduction per unit effort. Phase 1 (dup fix) is surgical. Phase 2 (skill consolidation) is a *remap-then-remove* migration — never a bare delete — because `agent-personas.ts`, `team-orchestrator.ts`, `a2a-agent-card.ts`, and `_config/` manifests hardcode `bmad-agent-*` IDs. Phase 3 (types) tightens the contract surface incrementally. Phase 4 (store decomposition) extracts cohesive method groups behind the existing public interface using characterization tests as a safety net — behavior-preserving, never a rewrite.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild bundling, **Vitest** for colocated `*.test.ts` unit tests (run `npx vitest run <file>`), Cucumber for BDD (`npm test`), ESLint with custom rules in `eslint-rules/`, `ajv` schema validation.

---

## Terminology clarification (read first)

"**BMAD should go, ACC stays**" means the **`bmad-*` skill folder family** is removed in favor of the **`aac-*` family**. It does **NOT** mean removing the *BMAD methodology* branding. The product is still "BMAD methodology"; `package.json` description, keywords, walkthrough copy, and tool `modelDescription` text that say "BMAD" stay as-is. Only the `bmad-` **skill/persona identifier prefix** is migrated to `aac-`.

## Ground-truth facts (verified at commit `242adbf`)

- Duplicate activation block: `src/extension.ts` — the `stat → loadFromFolder → restoreInterruptedSessions` sequence runs **twice** (first at ~`:512-524`, second redundant copy at ~`:553-567`). The first copy also contains the autonomy-lifecycle bootstrap (`:525-548`); the second copy has **no** unique logic.
- Skill families: **48** `bmad-*` folders, **92** `aac-*` folders, 0 other, under `resources/_aac/skills/`.
- `bmad-` is referenced in code, most critically:
  - `src/chat/agent-personas.ts` — `ARTIFACT_TYPE_TO_AGENT` map (`:54-87`) + `DEFAULT_AGENT` (`:89`).
  - `src/acp/team-orchestrator.ts` — ~50 hardcoded `bmad-agent-*` `personaId`s.
  - `src/acp/agent-bus/a2a-agent-card.ts:259` — `id: 'bmad-workflows'`.
  - `resources/_aac/_config/` manifests + `bmad-help.csv`.
- **4 referenced `bmad-*` agents have NO direct `aac-*` twin** and need an explicit semantic mapping decision (see Phase 2, Task 2.1): `bmad-agent-qa`, `bmad-agent-sm`, `bmad-master`, `bmad-agent-quick-flow-solo-dev`.
- `ArtifactStore` (`src/state/artifact-store.ts`): 115 methods, 9,300 lines, ~189 `any`. Cleanly separable method groups identified in Phase 4.
- `src/` uses colocated Vitest tests (e.g. `src/workflow/autonomy-lifecycle.test.ts`).

---

## Phase 0: Safety net & branch

### Task 0.1: Create the working branch and confirm green baseline

**Files:** none (git + verification only)

- [ ] **Step 1: Branch off main**

```bash
git checkout main
git pull
git checkout -b chore/architecture-hardening
```

- [ ] **Step 2: Confirm the build is green before any change**

Run:
```bash
npm run check-types
```
Expected: exits 0, no type errors.

- [ ] **Step 3: Confirm the test suite baseline**

Run:
```bash
npx vitest run
```
Expected: all existing `*.test.ts` pass. Record the pass count — it must not drop in later phases.

- [ ] **Step 4: Commit a baseline marker (empty)**

```bash
git commit --allow-empty -m "chore: baseline before architecture hardening"
```

---

## Phase 1: Fix the duplicated activation block

**Why first:** smallest change, removes redundant startup I/O and a double agent-state restore, and de-risks the file before any larger edit.

### Task 1.1: Remove the redundant second load/restore block

**Files:**
- Modify: `src/extension.ts` (the `workspaceResolver.initialize().then(...)` callback, ~`:509-584`)

- [ ] **Step 1: Read the exact current region before editing**

Run:
```bash
sed -n '509,585p' src/extension.ts
```
Expected: you will see TWO `try { await vscode.workspace.fs.stat(outputUri); await artifactStore.loadFromFolder(outputUri); ... }` blocks. The **first** block (starts ~`:512`) contains the `restoreInterruptedSessions(...)` call AND the `autonomyLifecycle.configure(...)` / `autoScheduler.setStories(...)` / `autonomyLifecycle.start()` bootstrap. The **second** block (starts ~`:553`) repeats only `stat → loadFromFolder → restoreInterruptedSessions` with no unique logic.

- [ ] **Step 2: Delete the second (redundant) block**

Remove the entire second `try { ... } catch { ... }` that begins with the comment-free repeat:
```typescript
            try {
                await vscode.workspace.fs.stat(outputUri);
                await artifactStore.loadFromFolder(outputUri);
                logger.info(`Auto-loaded project from: ${outputUri.fsPath}`);

                // ── Restore interrupted execution state from traces ──────
                // Now that artifacts are loaded, scan traces and push agent
                // state to the kanban so the user can see which artifacts
                // were mid-execution and resume or abandon them.
                restoreInterruptedSessions(agenticKanbanProvider).catch(err => {
                  logger.warn(`Failed to restore interrupted sessions: ${err instanceof Error ? err.message : String(err)}`);
                });
            } catch {
                logger.info(`Output folder not found (new project?): ${outputUri.fsPath}`);
            }
```
Leave the FIRST block (with the autonomy bootstrap) and everything after it (the `setContext` call, the stale-markdown migration) intact.

- [ ] **Step 3: Type-check**

Run:
```bash
npm run check-types
```
Expected: exits 0.

- [ ] **Step 4: Verify only one load path remains**

Run:
```bash
grep -n "loadFromFolder(outputUri)" src/extension.ts
```
Expected: exactly **one** match inside the `initialize().then` callback (other matches in `reloadArtifactsFromDisk`/project-switch are fine and expected).

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "fix(activation): remove duplicated load/restore block in activate()"
```

---

## Phase 2: Consolidate skill families onto `aac-*` (remove `bmad-*`)

**Why:** ~140 skill folders with two parallel families is a compounding maintenance tax. `aac-*` is the superset (92 vs 48) and the chosen survivor.

**Strategy:** REMAP code references first, prove green, THEN delete folders. Never delete first.

### Task 2.1: Build and record the verified `bmad-* → aac-*` mapping

**Files:**
- Create: `docs/superpowers/plans/bmad-to-aac-mapping.md` (the authoritative mapping table this phase consumes)

- [ ] **Step 1: Enumerate every `bmad-*` skill and whether a same-name `aac-*` twin exists**

Run:
```bash
cd resources/_aac/skills
for d in bmad-*/; do s="${d%/}"; twin="aac-${s#bmad-}"; \
  if [ -d "$twin" ]; then echo "TWIN_OK   $s -> $twin"; else echo "NO_TWIN   $s -> ???"; fi; done
```

- [ ] **Step 2: Resolve the 4 known no-twin agents with these semantic mappings**

Record these in `docs/superpowers/plans/bmad-to-aac-mapping.md`. These are deliberate decisions — the source roles map to the nearest surviving `aac-*` persona:

```markdown
| bmad-* (removed)               | aac-* (target)        | Rationale                                  |
|--------------------------------|-----------------------|--------------------------------------------|
| bmad-agent-qa                  | aac-agent-tea         | TEA (Test Engineering Architect) is ACC's QA role |
| bmad-agent-sm                  | aac-agent-pm          | Scrum-master duties fold into the PM persona |
| bmad-master                    | aac-agent-analyst     | "master" generalist maps to the default analyst |
| bmad-agent-quick-flow-solo-dev | aac-agent-dev         | Solo-dev quick flow maps to the dev persona |
```

For every other `bmad-X`, the target is the same-name `aac-X` (e.g. `bmad-agent-pm → aac-agent-pm`, `bmad-create-prd → aac-create-prd`, `bmad-party-mode → aac-party-mode`).

- [ ] **Step 3: For any `NO_TWIN` row NOT in the table above, STOP**

If Step 1 prints a `NO_TWIN` line for a skill not covered by the Step 2 table, do not guess. Halt and request a mapping decision from the maintainer, then add it to the table before continuing. (This is a hard gate, not a placeholder.)

- [ ] **Step 4: Commit the mapping**

```bash
git add docs/superpowers/plans/bmad-to-aac-mapping.md
git commit -m "docs: authoritative bmad->aac skill mapping"
```

### Task 2.2: Remap persona resolution in `agent-personas.ts`

**Files:**
- Modify: `src/chat/agent-personas.ts:54-89`
- Test: `src/chat/agent-personas.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/chat/agent-personas.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getAgentPathForArtifactType } from './agent-personas';

describe('ARTIFACT_TYPE_TO_AGENT after aac consolidation', () => {
  it('maps every artifact type to an aac-* skill (no bmad-* leakage)', () => {
    const types = ['vision', 'product-brief', 'prd', 'requirement', 'epic', 'story',
      'use-case', 'architecture', 'sprint', 'ux-design', 'readiness', 'party',
      'document', 'code-review', 'quick-spec', 'quick-dev'];
    for (const t of types) {
      const p = getAgentPathForArtifactType(t);
      expect(p, `type ${t}`).not.toMatch(/bmad-/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
npx vitest run src/chat/agent-personas.test.ts
```
Expected: FAIL — current map returns `bmad-agent-*` skill names.

- [ ] **Step 3: Rewrite the map and default to `aac-*`**

In `src/chat/agent-personas.ts`, replace every `bmad-` prefix in `ARTIFACT_TYPE_TO_AGENT` (`:54-87`) and `DEFAULT_AGENT` (`:89`) with `aac-`, applying the Task 2.1 table for the 4 no-twin agents. Concretely:
```typescript
const ARTIFACT_TYPE_TO_AGENT: Record<string, { skillName: string; key: ArtifactAgentKey }> = {
    'vision':              { skillName: 'aac-agent-pm',          key: 'pm' },
    'product-brief':       { skillName: 'aac-agent-pm',          key: 'pm' },
    'prd':                 { skillName: 'aac-agent-pm',          key: 'pm' },
    'requirement':         { skillName: 'aac-agent-analyst',     key: 'analyst' },
    'epic':                { skillName: 'aac-agent-pm',          key: 'pm' },
    'story':               { skillName: 'aac-agent-dev',         key: 'dev' },
    'use-case':            { skillName: 'aac-agent-analyst',     key: 'analyst' },
    'architecture':        { skillName: 'aac-agent-architect',   key: 'architect' },
    'test-case':           { skillName: 'aac-agent-tea',         key: 'tea' },
    'test-strategy':       { skillName: 'aac-agent-tea',         key: 'tea' },
    'nfr':                 { skillName: 'aac-agent-tea',         key: 'tea' },
    'sprint':              { skillName: 'aac-agent-dev',         key: 'dev' },
    'ux-design':           { skillName: 'aac-agent-ux-designer', key: 'ux-designer' },
    'readiness':           { skillName: 'aac-agent-architect',   key: 'architect' },
    'party':               { skillName: 'aac-party-mode',        key: 'analyst' },
    'document':            { skillName: 'aac-agent-analyst',     key: 'analyst' },
    'code-review':         { skillName: 'aac-agent-dev',         key: 'dev' },
    'ci-pipeline':         { skillName: 'aac-agent-tea',         key: 'tea' },
    'quick-spec':          { skillName: 'aac-agent-dev',         key: 'dev' },
    'quick-dev':           { skillName: 'aac-agent-dev',         key: 'dev' },
    'design-thinking':     { skillName: 'aac-cis-agent-design-thinking',   key: 'cis-design-thinking-coach' },
    'innovation-strategy': { skillName: 'aac-cis-agent-innovation',        key: 'cis-innovation-strategist' },
    'problem-solving':     { skillName: 'aac-cis-agent-problem-solver',    key: 'cis-creative-problem-solver' },
    'storytelling':        { skillName: 'aac-cis-agent-storyteller',       key: 'cis-storyteller' },
    'cis-brainstorming':   { skillName: 'aac-cis-agent-brainstorming',     key: 'cis-brainstorming-coach' },
    'cis-problem-solving': { skillName: 'aac-cis-agent-problem-solver',    key: 'cis-creative-problem-solver' },
    'cis-design-thinking': { skillName: 'aac-cis-agent-design-thinking',   key: 'cis-design-thinking-coach' },
    'cis-innovation':      { skillName: 'aac-cis-agent-innovation',        key: 'cis-innovation-strategist' },
    'cis-presentation':    { skillName: 'aac-cis-agent-presentation',      key: 'cis-presentation-master' },
    'cis-storytelling':    { skillName: 'aac-cis-agent-storyteller',       key: 'cis-storyteller' },
    'canvas-convert':      { skillName: 'aac-agent-canvas-integrator',     key: 'canvas-integrator' },
};

const DEFAULT_AGENT = { skillName: 'aac-agent-analyst', key: 'analyst' as ArtifactAgentKey };
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/chat/agent-personas.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/chat/agent-personas.ts src/chat/agent-personas.test.ts
git commit -m "refactor(personas): remap artifact->agent table from bmad-* to aac-*"
```

### Task 2.3: Remap `team-orchestrator.ts` and `a2a-agent-card.ts`

**Files:**
- Modify: `src/acp/team-orchestrator.ts` (all `personaId: 'bmad-agent-*'`)
- Modify: `src/acp/agent-bus/a2a-agent-card.ts:259`
- Test: `src/acp/team-orchestrator.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/acp/team-orchestrator.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('team-orchestrator persona IDs', () => {
  it('contains no bmad-* persona identifiers', () => {
    const src = fs.readFileSync(path.join(__dirname, 'team-orchestrator.ts'), 'utf8');
    const hits = src.match(/bmad-agent-[a-z-]+/g) ?? [];
    expect(hits, `found ${hits.length} bmad refs`).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
npx vitest run src/acp/team-orchestrator.test.ts
```
Expected: FAIL — ~50 `bmad-agent-*` hits.

- [ ] **Step 3: Apply the deterministic remap**

Run these in-place substitutions (they encode the Task 2.1 table — `qa→tea`, `sm→pm`, and the simple-twin renames). Order matters: the specific no-twin replacements must run BEFORE the generic `bmad-agent- → aac-agent-` rule:
```bash
sed -i \
  -e 's/bmad-agent-qa/aac-agent-tea/g' \
  -e 's/bmad-agent-sm/aac-agent-pm/g' \
  -e 's/bmad-agent-quick-flow-solo-dev/aac-agent-dev/g' \
  -e 's/bmad-master/aac-agent-analyst/g' \
  -e 's/bmad-agent-/aac-agent-/g' \
  src/acp/team-orchestrator.ts
sed -i "s/id: 'bmad-workflows'/id: 'aac-workflows'/" src/acp/agent-bus/a2a-agent-card.ts
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/acp/team-orchestrator.test.ts && npm run check-types
```
Expected: test PASS, type-check exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/acp/team-orchestrator.ts src/acp/agent-bus/a2a-agent-card.ts src/acp/team-orchestrator.test.ts
git commit -m "refactor(acp): remap team + agent-card persona IDs to aac-*"
```

### Task 2.4: Sweep remaining `bmad-*` skill/persona references across `src`

**Files:**
- Modify: any `src/**/*.ts` still referencing a `bmad-` **skill or persona id** (NOT methodology prose)

- [ ] **Step 1: Find remaining references**

Run:
```bash
grep -rnE "bmad-(agent|create|party|quick|spec|prd|ux|dev-story|sprint|review|investigate|document|advanced|generate|validate|edit|index|domain|market|technical|workflow|to-json|code-review|check)" src --include=*.ts | grep -v "\.test\.ts"
```

- [ ] **Step 2: For each hit, replace the `bmad-` skill id with its `aac-` target**

Use the Task 2.1 mapping. For simple twins this is a `bmad-X → aac-X` rename. Do **not** touch strings that refer to the *methodology* ("BMAD methodology", "BMAD artifacts", "BMAD framework") — those are product copy and stay.

- [ ] **Step 3: Verify no skill-id `bmad-` references remain**

Run:
```bash
grep -rnE "'bmad-[a-z]|\"bmad-[a-z]|skillName.*bmad-|personaId.*bmad-" src --include=*.ts | grep -v "\.test\.ts"
```
Expected: no output.

- [ ] **Step 4: Type-check + full unit suite**

Run:
```bash
npm run check-types && npx vitest run
```
Expected: exits 0, pass count ≥ baseline from Task 0.1.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: sweep residual bmad-* skill references to aac-*"
```

### Task 2.5: Update `_config` manifests and delete `bmad-*` skill folders

**Files:**
- Modify: `resources/_aac/_config/*.csv`, `resources/_aac/_config/manifest.yaml`
- Delete: `resources/_aac/skills/bmad-*/`, `resources/_aac/_config/bmad-help.csv`

- [ ] **Step 1: Find manifest rows referencing bmad skills**

Run:
```bash
grep -rln "bmad-" resources/_aac/_config/
```

- [ ] **Step 2: Remove bmad rows from each manifest CSV**

For `agent-manifest.csv`, `skill-manifest.csv`, `workflow-manifest.csv`, `task-manifest.csv`, `tool-manifest.csv`, `files-manifest.csv`: delete every row whose skill id begins with `bmad-`. The `aac-*` rows already provide equivalents (verified in Task 2.1). Remove the standalone `bmad-help.csv` (its counterpart `aac-help.csv` exists).

- [ ] **Step 3: Delete the bmad skill folders**

```bash
git rm -r resources/_aac/skills/bmad-*
git rm resources/_aac/_config/bmad-help.csv
```

- [ ] **Step 4: Confirm aac coverage and no dangling refs**

Run:
```bash
ls resources/_aac/skills/ | grep -c '^bmad-'   # expect 0
grep -rnE "bmad-(agent|create|party|quick)" resources/_aac/_config/   # expect no output
```

- [ ] **Step 5: Full build (the webview + bundle copy resources)**

Run:
```bash
npm run check-types && npm run bundle
```
Expected: exits 0.

- [ ] **Step 6: Smoke-test the workflow registry build**

Run the existing workflow/registry tests if present, else the full suite:
```bash
npx vitest run
```
Expected: pass count ≥ baseline. (The registry scans `skills/` at runtime — this proves it still resolves a complete catalogue from `aac-*` alone.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(skills): remove bmad-* family, consolidate on aac-*"
```

---

## Phase 3: Pay down `any` debt on the core artifact types

**Why:** `Story`, `Epic`, `PRD`, `UseCase` are the highest-traffic data in the system; `any[]` fields there disable the cheapest test you have. Scope this phase to the **explicit `any` fields in `src/types/index.ts`** (not the whole store) so it ships independently.

### Task 3.1: Type the `Vision` and `UseCase` array fields

**Files:**
- Modify: `src/types/index.ts` (`:31`, `:34`, `:301-302`, `:373`)
- Test: `src/types/artifact-types.test.ts` (create)

- [ ] **Step 1: Write the failing (compile-time) test**

Create `src/types/artifact-types.test.ts`:
```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { Vision, UseCase } from './index';

describe('core artifact types are not any', () => {
  it('Vision.targetUsers is a typed array', () => {
    expectTypeOf<Vision['targetUsers']>().not.toBeAny();
  });
  it('UseCase.actors is typed', () => {
    expectTypeOf<UseCase['actors']>().not.toBeAny();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
npx vitest run src/types/artifact-types.test.ts
```
Expected: FAIL — fields are `any`/`any[]`.

- [ ] **Step 3: Replace the `any` fields with named shapes**

In `src/types/index.ts`, introduce and use concrete types. Example for `Vision` (`:31`,`:34`) and `UseCase` (`:373`):
```typescript
export interface TargetUser {
  segment: string;
  description?: string;
  needs?: string[];
}

export interface SuccessMetric {
  name: string;
  target?: string;
  baseline?: string;
}

// in Vision:
//   targetUsers: TargetUser[];
//   successMetrics?: SuccessMetric[];

// in UseCase (:373), replace `actors?: any;` with:
//   actors?: string[];
```
Pick field names by reading the matching JSON Schema (`resources/_aac/schemas/bmm/*.schema.json`) so the TS shape mirrors validation. Where the schema is loose, prefer `unknown` over `any` and narrow at use sites.

- [ ] **Step 4: Fix resulting compile errors at use sites**

Run:
```bash
npm run check-types
```
Resolve any new errors (most will be in `artifact-transformer.ts`, `artifact-store.ts`, `chat-participant.ts`) by narrowing rather than re-casting to `any`.

- [ ] **Step 5: Run the type test + suite**

Run:
```bash
npx vitest run src/types/artifact-types.test.ts && npm run check-types
```
Expected: PASS, exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/types/artifact-types.test.ts src/canvas/artifact-transformer.ts
git commit -m "types: replace any[] on Vision/UseCase with named shapes"
```

### Task 3.2: Type the `PRD` array fields

**Files:**
- Modify: `src/types/index.ts` (`:1608-1610`, `:1631-1632`, `:301-302`)
- Test: extend `src/types/artifact-types.test.ts`

- [ ] **Step 1: Add the failing assertions**

Append to `src/types/artifact-types.test.ts`:
```typescript
import type { PRD } from './index';

describe('PRD requirement buckets are typed', () => {
  it('PRD.requirements.functional is not any', () => {
    expectTypeOf<NonNullable<PRD['requirements']>['functional']>().not.toBeAny();
  });
});
```
(Adjust the property path to the actual `PRD` shape around `:1608`.)

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/types/artifact-types.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Replace the `any[]` buckets with the existing requirement interfaces**

The codebase already defines `FunctionalRequirement`, `NonFunctionalRequirement`, `AdditionalRequirement` and `TechnicalSummary`. Wire them in:
```typescript
//   functional?: FunctionalRequirement[];
//   nonFunctional?: NonFunctionalRequirement[];
//   technical?: TechnicalSummary[];
// approvals?: Approval[];     // define Approval { role: string; name?: string; date?: string }
// appendices?: Appendix[];    // define Appendix { title: string; content?: string }
// uxReferences?/references?:  Reference[]  // { label: string; url?: string }
```

- [ ] **Step 4: Fix use sites, then verify**

Run:
```bash
npm run check-types && npx vitest run src/types/artifact-types.test.ts
```
Expected: exits 0, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/types/artifact-types.test.ts
git commit -m "types: type PRD requirement buckets and references"
```

---

## Phase 4: Decompose `ArtifactStore` (behavior-preserving extraction)

**Why:** 9,300 lines / 115 methods is a god object — the top maintainability risk. **Approach:** extract cohesive method groups into collaborator classes that the store delegates to, keeping `ArtifactStore`'s public surface byte-for-byte identical. Characterization tests lock behavior first. This phase is **iterative**; Task 4.2 is fully worked as the template, and Task 4.4 repeats the recipe for the next groups.

**Extraction targets (cohesive groups, by line range):**
1. **YAML sprint-status sync** — `findSprintStatusYaml`, `parseSprintStatusYamlFile`, `mapYamlStatusToInternal`, `mapInternalStatusToYaml`, `syncStatusToYaml`, `detectSprintStatusMismatches`, `patchEpicStatusOnDisk`, `patchStoryStatusOnDisk` (~`:3873-4250`). → `SprintStatusSync`.
2. **Disk writers** — `saveVisionToFile`, `saveStoriesToFile`, `saveEpicsToFile`, `saveProductBriefToFile`, `savePRDToFile`, `saveArchitectureToFile`, `saveTestCasesToFile`, `deleteSourceFile`, `getOutputFormat` (~`:5949-6900`). → `ArtifactFileWriter`.
3. **Schema→internal mappers** — `mapSchemaEpicToInternal`, `mapSchemaStoryToInternal`, `mapStatus`, `mapSchemaRequirement`, `mapSchemaNonFunctionalRequirement`, `mapSchemaAdditionalRequirement` (~`:4583-4996`). → `SchemaArtifactMapper`.
4. **Backup/migration** — `backupArtifactFiles`, `pruneOldBackups`, `migrateImplementationFolder`, `checkForInlineStories`, `migrateToReferenceArchitecture`, `restorePreMigrationBackup` (~`:3772-6454`). → `ArtifactMigrator`.

### Task 4.1: Characterization tests for the extraction targets

**Files:**
- Test: `src/state/artifact-store.characterization.test.ts` (create)

- [ ] **Step 1: Write characterization tests that pin current behavior**

Create `src/state/artifact-store.characterization.test.ts`. Cover at least the status mapping (pure, easy to pin) and a round-trip load→sync. Example for the pure mappers (which become `SprintStatusSync`/`SchemaArtifactMapper`):
```typescript
import { describe, it, expect } from 'vitest';
import { ArtifactStore } from './artifact-store';

// Minimal fake ExtensionContext for construction.
function fakeContext(): any {
  return { subscriptions: [], globalState: { get: () => undefined, update: async () => {} },
           workspaceState: { get: () => undefined, update: async () => {} }, secrets: {} };
}

describe('ArtifactStore characterization (pre-extraction baseline)', () => {
  it('constructs and exposes a stable public surface', () => {
    const store = new ArtifactStore(fakeContext());
    // Pin the public methods callers depend on so extraction can't change them.
    expect(typeof store.loadFromFolder).toBe('function');
    expect(typeof store.syncToFiles).toBe('function');
    expect(typeof store.syncStoryStatusAtomic).toBe('function');
    expect(typeof store.migrateToReferenceArchitecture).toBe('function');
  });
});
```
For methods only reachable privately, write the test against the nearest **public** entry point (e.g. `syncStoryStatusAtomic`, `loadFromFolder` + `syncToFiles` round trip on a temp `vscode.Uri`). The goal is: capture observable output now, re-run unchanged after extraction.

- [ ] **Step 2: Run and record the green baseline**

Run:
```bash
npx vitest run src/state/artifact-store.characterization.test.ts
```
Expected: PASS. These must stay green through every extraction below.

- [ ] **Step 3: Commit**

```bash
git add src/state/artifact-store.characterization.test.ts
git commit -m "test(store): characterization baseline before decomposition"
```

### Task 4.2: Extract `SprintStatusSync` (worked template)

**Files:**
- Create: `src/state/sprint-status-sync.ts`
- Modify: `src/state/artifact-store.ts` (delegate the 8 YAML methods)
- Test: `src/state/sprint-status-sync.test.ts` (create)

- [ ] **Step 1: Write the failing unit test for the extracted unit**

Create `src/state/sprint-status-sync.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { SprintStatusSync } from './sprint-status-sync';

describe('SprintStatusSync mappers', () => {
  it('mapYamlStatusToInternal normalizes known values', () => {
    const s = new SprintStatusSync();
    expect(s.mapYamlStatusToInternal('in progress')).toBe('in-progress');
    expect(s.mapYamlStatusToInternal('done')).toBe('done');
  });
  it('mapInternalStatusToYaml round-trips', () => {
    const s = new SprintStatusSync();
    expect(s.mapInternalStatusToYaml('in-progress')).toBe('in progress');
  });
});
```
(Match the exact string outputs to the current implementation read from `artifact-store.ts:3931-3965` — copy the real cases; adjust the asserted strings if the source uses different literals.)

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/state/sprint-status-sync.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `SprintStatusSync` by moving the 8 methods verbatim**

Read `artifact-store.ts:3873-4250`, then create `src/state/sprint-status-sync.ts` exporting a `SprintStatusSync` class containing `findSprintStatusYaml`, `parseSprintStatusYamlFile`, `mapYamlStatusToInternal`, `mapInternalStatusToYaml`, `syncStatusToYaml`, `detectSprintStatusMismatches`, `patchEpicStatusOnDisk`, `patchStoryStatusOnDisk` — bodies copied unchanged. For any dependency on store state (e.g. `getSourceFolder()`), accept it as a constructor arg or method parameter rather than reaching back into the store. Make `mapYamlStatusToInternal`/`mapInternalStatusToYaml` `public` so they are unit-testable.

- [ ] **Step 4: Delegate from `ArtifactStore`**

In `artifact-store.ts`, instantiate `private sprintSync = new SprintStatusSync(...)` in the constructor and replace each moved method body with a one-line delegation, e.g.:
```typescript
private mapInternalStatusToYaml(status: string): string {
  return this.sprintSync.mapInternalStatusToYaml(status);
}
```
Keep the private method signatures so no call site outside the store changes.

- [ ] **Step 5: Run unit + characterization + type-check**

Run:
```bash
npx vitest run src/state/sprint-status-sync.test.ts src/state/artifact-store.characterization.test.ts && npm run check-types
```
Expected: all PASS, type-check exits 0. The characterization suite proves behavior is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/state/sprint-status-sync.ts src/state/sprint-status-sync.test.ts src/state/artifact-store.ts
git commit -m "refactor(store): extract SprintStatusSync, store delegates"
```

### Task 4.3: Extract `ArtifactFileWriter`

**Files:**
- Create: `src/state/artifact-file-writer.ts`
- Modify: `src/state/artifact-store.ts`
- Test: `src/state/artifact-file-writer.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/state/artifact-file-writer.test.ts` asserting `getOutputFormat()` honors the `agileagentcanvas.outputFormat` setting and that `saveEpicsToFile` writes the expected filename into a temp dir. Mirror the real behavior read from `artifact-store.ts:5968-6900`.

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/state/artifact-file-writer.test.ts
```
Expected: FAIL — module absent.

- [ ] **Step 3: Move the writer group**

Create `ArtifactFileWriter` with `saveVisionToFile`, `saveStoriesToFile`, `saveEpicsToFile`, `saveProductBriefToFile`, `savePRDToFile`, `saveArchitectureToFile`, `saveTestCasesToFile`, `deleteSourceFile`, `getOutputFormat` — bodies copied verbatim, taking `BmadArtifacts` + base `vscode.Uri` as params (they already do). Then delegate from `syncToFiles()` in the store.

- [ ] **Step 4: Verify behavior preserved**

Run:
```bash
npx vitest run src/state/artifact-file-writer.test.ts src/state/artifact-store.characterization.test.ts && npm run check-types
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/artifact-file-writer.ts src/state/artifact-file-writer.test.ts src/state/artifact-store.ts
git commit -m "refactor(store): extract ArtifactFileWriter, store delegates"
```

### Task 4.4: Extract `SchemaArtifactMapper` and `ArtifactMigrator` (repeat the recipe)

**Files:**
- Create: `src/state/schema-artifact-mapper.ts`, `src/state/artifact-migrator.ts`
- Modify: `src/state/artifact-store.ts`
- Test: `src/state/schema-artifact-mapper.test.ts`, `src/state/artifact-migrator.test.ts` (create)

- [ ] **Step 1: Repeat the Task 4.2 five-step recipe for `SchemaArtifactMapper`**

Move `mapSchemaEpicToInternal`, `mapSchemaStoryToInternal`, `mapStatus`, `mapSchemaRequirement`, `mapSchemaNonFunctionalRequirement`, `mapSchemaAdditionalRequirement` (`:4583-4996`). Unit-test `mapStatus` and one epic mapping with a fixture JSON. Delegate from `loadFromFolder`/`loadEpicStoryRefs`.

- [ ] **Step 2: Repeat the recipe for `ArtifactMigrator`**

Move `backupArtifactFiles`, `pruneOldBackups`, `migrateImplementationFolder`, `checkForInlineStories`, `migrateToReferenceArchitecture`, `restorePreMigrationBackup` (`:3772-6454`). Keep the two public methods (`migrateToReferenceArchitecture`, `restorePreMigrationBackup`) as thin store delegations because `extension.ts:454,468` call them.

- [ ] **Step 3: After each extraction, run the gate**

Run after each:
```bash
npx vitest run src/state/ && npm run check-types
```
Expected: PASS, exits 0, characterization suite still green.

- [ ] **Step 4: Confirm the store shrank materially**

Run:
```bash
wc -l src/state/artifact-store.ts
```
Expected: well under the original 9,300 (target: each extraction removes 300-900 lines; four extractions should land the store around 6,000-6,500 and falling).

- [ ] **Step 5: Commit each extraction separately**

```bash
git add src/state/schema-artifact-mapper.ts src/state/schema-artifact-mapper.test.ts src/state/artifact-store.ts
git commit -m "refactor(store): extract SchemaArtifactMapper"
git add src/state/artifact-migrator.ts src/state/artifact-migrator.test.ts src/state/artifact-store.ts
git commit -m "refactor(store): extract ArtifactMigrator"
```

---

## Phase 5: Final verification & integration

### Task 5.1: Full build, full suite, doc refresh

**Files:**
- Modify: `docs/ARCHITECTURE.md` (update §10 and store/skill references)

- [ ] **Step 1: Full compile (extension + webview)**

Run:
```bash
npm run compile
```
Expected: `check-types`, `bundle`, and `compile-webview` all exit 0.

- [ ] **Step 2: Full unit suite + BDD suite**

Run:
```bash
npx vitest run && npm test
```
Expected: Vitest pass count ≥ baseline; Cucumber suite passes (or matches the pre-existing known-failing set — compare to a fresh `main` run if anything fails).

- [ ] **Step 3: Update the architecture doc to reflect the new reality**

In `docs/ARCHITECTURE.md`: (a) update §4.2 to mention `SprintStatusSync`, `ArtifactFileWriter`, `SchemaArtifactMapper`, `ArtifactMigrator` as store collaborators; (b) update §4.12 and §10 to state the skill family is now `aac-*` only; (c) remove the §10 item #2/#4 caveats that no longer apply and the duplicated-activation note (now fixed).

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: update architecture for store decomposition + aac consolidation"
git push -u origin chore/architecture-hardening
gh pr create --title "Architecture hardening: dedup activation, aac consolidation, type debt, store decomposition" \
  --body "Implements docs/superpowers/plans/2026-06-19-acc-architecture-hardening.md. Phases 1-4 each independently verified; characterization tests pin store behavior across extraction."
```

---

## Self-review checklist (run before handing off)

- **Spec coverage:** Phase 1 = dup activation fix ✓; Phase 2 = bmad→aac consolidation ✓; Phase 3 = `any` debt on core types ✓; Phase 4 = store decomposition ✓. All four of the approved recommendations are covered.
- **Hard gates honored:** Task 2.1 Step 3 stops on any unmapped skill; Phase 4 gates every extraction on the characterization suite.
- **No bare deletes:** Phase 2 remaps (2.2–2.4) before removing folders (2.5).
- **Type consistency:** collaborator names are stable across tasks — `SprintStatusSync`, `ArtifactFileWriter`, `SchemaArtifactMapper`, `ArtifactMigrator` are used identically in Phase 4 and Phase 5.
- **Independence:** each phase ends green and shippable on its own; they can be split into separate PRs if preferred.

---

## Execution options

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks. Best for Phase 4 where each extraction is isolated and verifiable.

**2. Inline Execution** — execute in one session with checkpoints after each phase.

Recommended sequencing if splitting PRs: ship Phase 1 alone (trivial, immediate), then Phase 2 (user-visible skill change — review carefully), then Phase 3, then Phase 4 as its own PR per extraction.
