# Project — Agile Agent Canvas Artifacts

> **This file is auto-generated.** It helps LLMs and developers navigate the artifact structure.

## File Structure

```
epics/
  epic-{id}/
    epic.json                  ← Epic metadata + storyRefs (lightweight references)
    stories/
      {id}.json                ← Full story content (AC, tasks, test cases)
    tests/
      test-cases.json          ← Test cases scoped to this epic
      test-design-{id}.json    ← Test design scoped to this epic
epics.json                     ← Manifest (metadata + refs to epic files)
```

## Quick Reference for LLMs

| To find...               | Read this file                           |
|--------------------------|-------------------------------------------|
| List of all epics        | `epics.json` or `epics/epic-{id}/epic.json` |
| Full epic details        | `epics/epic-{id}/epic.json`               |
| List of all stories      | Iterate `epics/*/stories/*.json`          |
| Full story details       | `epics/epic-{id}/stories/{id}.json`       |
| Epic test cases          | `epics/epic-{id}/tests/test-cases.json`   |

## Key Conventions

- **Epic IDs** use numeric format: `1`, `2`, `15`
- **Story IDs** use dot notation: `1.1`, `15.3`
- **epics.json** is a manifest with `file` refs, NOT full epic content
- To update an epic, edit its standalone file, not the manifest
