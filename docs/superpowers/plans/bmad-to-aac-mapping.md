# BMAD → AAC Skill Mapping (Authoritative)

> Generated for Phase 2 of the ACC Architecture Hardening plan.
> Commit: `chore/architecture-hardening`

## Verification (Step 1)

All **48** `bmad-*` skill folders under `resources/_aac/skills/` have a same-name `aac-*` twin on disk.  
Ran: `for d in bmad-*/; do s="${d%/}"; twin="aac-${s#bmad-}"; [ -d "$twin" ] && echo "TWIN_OK $s -> $twin" || echo "NO_TWIN $s -> ???"; done`

Result: 48 TWIN_OK, 0 NO_TWIN.

## General Rule

For every `bmad-X`, the target is the same-name `aac-X`.

Examples:
- `bmad-agent-pm → aac-agent-pm`
- `bmad-agent-dev → aac-agent-dev`
- `bmad-agent-architect → aac-agent-architect`
- `bmad-create-prd → aac-create-prd`
- `bmad-party-mode → aac-party-mode`
- `bmad-dev-story → aac-dev-story`

## Semantic Overrides (no-twin agent IDs referenced in code)

These 4 `bmad-*` persona IDs are referenced in code but map to different `aac-*` names than simple prefix replacement:

| bmad-* (removed)               | aac-* (target)        | Rationale                                              |
|--------------------------------|-----------------------|--------------------------------------------------------|
| `bmad-agent-qa`                | `aac-agent-tea`       | TEA (Test Engineering Architect) is ACC's QA role      |
| `bmad-agent-sm`                | `aac-agent-pm`        | Scrum-master duties fold into the PM persona           |
| `bmad-master`                  | `aac-agent-analyst`   | "master" generalist maps to the default analyst        |
| `bmad-agent-quick-flow-solo-dev` | `aac-agent-dev`     | Solo-dev quick flow maps to the dev persona            |

### Code locations for the 4 overrides

- `bmad-agent-qa`: referenced in `src/acp/team-orchestrator.ts` (~10 occurrences), `src/commands/ide-installer.ts:1242`
- `bmad-agent-sm`: referenced in `src/acp/team-orchestrator.ts` (3 occurrences), `src/commands/ide-installer.ts:1243`
- `bmad-master`: referenced in `src/chat/agent-personas.ts:402`, `src/commands/ide-installer.ts:50,1237`
- `bmad-agent-quick-flow-solo-dev`: referenced in `src/acp/team-orchestrator.ts:368`, `src/commands/ide-installer.ts:1247`

## Hard Gate (Step 3)

No `NO_TWIN` rows emerged from the folder scan besides the 4 semantic overrides above. ✅ Gate passed.

## LEGACY_PATH_MAP considerations

`src/chat/agent-personas.ts` contains a `LEGACY_PATH_MAP` that maps old file paths to skill names. These values `'bmad-agent-*'` are **targets** that loadAgentPersona() uses to find SKILL.md files. They must be updated to `aac-*` so skill resolution works after folder deletion.
