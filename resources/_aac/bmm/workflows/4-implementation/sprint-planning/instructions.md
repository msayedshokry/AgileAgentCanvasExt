# Sprint Planning - Sprint Grouping Generator

<critical>The workflow execution engine is governed by: {bmad-path}/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {bmad-path}/bmm/workflows/4-implementation/sprint-planning/workflow.yaml</critical>

## 📚 Document Discovery - Full Epic Loading

**Strategy**: Sprint planning needs ALL epics and stories to build complete sprint groupings.

**Epic Discovery Process:**

1. **Search for whole document first** - Look for `epics.json`, `bmm-epics.json`, or any `*epic*.json` file
2. **Check for sharded version** - If whole document not found, look for `epics/index.json`
3. **If sharded version found**:
   - Read `index.json` to understand the document structure
   - Read ALL epic section files listed in the index (e.g., `epic-1.json`, `epic-2.json`, etc.)
   - Process all epics and their stories from the combined content
   - This ensures complete sprint coverage
4. **Priority**: If both whole and sharded versions exist, use the whole document

**Fuzzy matching**: Be flexible with document names - users may use variations like `epics.json`, `bmm-epics.json`, `user-stories.json`, etc.

> [!IMPORTANT]
> **Single Source of Truth**: Story and Epic statuses live in their JSON files. This workflow does **NOT** generate or manage a `development_status` block. The canvas reads statuses directly from the JSON artifacts. The only purpose of the sprint-status file is to define **sprint groupings** (goals, dates, story assignments).

<workflow>

  <step n="0.5" goal="Discover and load project documents">
    <invoke-protocol name="discover_inputs" />
    <note>After discovery, these content variables are available: {epics_content} (all epics loaded - uses FULL_LOAD strategy)</note>
  </step>

<step n="1" goal="Parse epic files and extract all work items">
<action>Load {project_context} for project-wide patterns and conventions (if exists)</action>
<action>Communicate in {communication_language} with {user_name}</action>
<action>Look for all files matching `{epics_pattern}` in {epics_location}</action>
<action>Could be a single `epics.json` file or multiple `epic-1.json`, `epic-2.json` files</action>

<action>For each epic file found, extract:</action>

- Epic numbers from headers like `## Epic 1:` or `## Epic 2:`
- Story IDs and titles from patterns like `### Story 1.1: User Authentication`
- The current `status` field from each story and epic JSON object
- Convert story format from `Epic.Story: Title` to kebab-case key: `epic-story-title`

**Story ID Conversion Rules:**

- Original: `### Story 1.1: User Authentication`
- Replace period with dash: `1-1`
- Convert title to kebab-case: `user-authentication`
- Final key: `1-1-user-authentication`

**Status Awareness:**

- Read the `status` field directly from each story and epic JSON object
- Do NOT guess or infer status from file existence
- Only use observed JSON values: `backlog`, `draft`, `ready-for-dev`, `ready`, `in-progress`, `review`, `done`, etc.

<action>Build complete inventory of all epics and stories (with their current statuses) from all epic files</action>
</step>

<step n="2" goal="Assign stories to goal-based sprints">
<action>Group work items into sprints centered on delivery goals, respecting current status and dependencies</action>

**Phase A — Status awareness (what's already done):**

1. **Exclude `done` items** from any sprint assignment — completed epics, stories, and retros do not need scheduling
2. **`in-progress` epics and their remaining stories** are anchored to the first (current) sprint — they are already underway
3. **`ready-for-dev` stories** belong to the nearest sprint — they have files and are queued
4. **`backlog` items** are future candidates — assign to the sprint that best fits their goal

**Phase B — Dependency awareness (what must come before what):**

5. **Read dependencies** from each epic's `dependencies` field and each story's `dependencies` / `requirementRefs` array in the epic files
6. **Ordering constraint** — if story B depends on story A, B must be in the same sprint or a later sprint than A. Never schedule B before A
7. **Epic dependency chain** — if epic 3 depends on epic 1 completing first, all of epic 3's stories must be in a sprint after epic 1's last story
8. **Circular dependency guard** — if a circular dependency is detected, flag it and ask the user to resolve before proceeding

**Phase C — Goal-based grouping:**

9. **Identify natural milestones** from the epics and `project-context.md`. Examples: "MVP scope", "Beta launch", "Performance hardening", "Full release"
10. **Assign remaining items** (not already anchored by status or dependencies) to the sprint whose goal best fits their scope
11. **Sprint IDs** — short, lowercase, underscore-separated: `sprint_1`, `mvp`, `beta`, etc. The first sprint should be the current one if any `in-progress` work exists
12. **Goal string** — concise delivery objective, not a time reference
13. **Dates optional** — include only if the user provides calendar anchors
14. **Stories without a clear milestone** go unlisted — they appear as "Unscheduled" in the board

**Example sprint structure:**

```yaml
sprints:
  sprint_1:
    goal: "MVP scope — authentication and core data model (in progress)"
    stories:
      - epic-1
      - 1-2-account-management   # 1-1 already done, 1-2 is ready-for-dev
      - 1-3-plant-data-model
      - epic-1-retrospective

  sprint_2:
    goal: "Personality system and AI chat integration"
    stories:
      - epic-2
      - 2-1-personality-system   # depends on epic-1 completion
      - 2-2-chat-interface
      - 2-3-llm-integration
      - epic-2-retrospective
```

<action>Show the proposed sprint grouping to the user with a brief rationale for key decisions (anchored items, dependency ordering). Ask for confirmation or adjustments before writing the file, unless in automated/non-interactive mode</action>
</step>


<step n="3" goal="Generate sprint status file">
<action>Create or update {status_file} with:</action>

**File Structure:**

```yaml
# generated: {date}
# project: {project_name}
# project_key: {project_key}
# tracking_system: {tracking_system}
# story_location: {story_location}

# SPRINT NOTES:
# =============
# - Sprints are goal-based groupings, not time-boxes (though dates are optional)
# - Each sprint has a clear delivery objective (e.g. "MVP scope", "Beta launch")
# - Stories not listed in any sprint appear as "Unscheduled" in the board view
# - Sprint IDs can be any identifier: sprint_1, mvp, beta, hardening, etc.
# - Story/Epic STATUSES are NOT stored here — they live in the individual JSON files
# - The canvas reads statuses directly from epic and story JSON artifacts

generated: { date }
project: { project_name }
project_key: { project_key }
tracking_system: { tracking_system }
story_location: { story_location }

sprints:
  # Goal-based sprint groupings
```

<action>Write the complete sprint status YAML to {status_file}</action>
<action>CRITICAL: Include ONLY the sprints section — do NOT include a development_status block. Statuses live in JSON files.</action>
<action>Metadata appears TWICE - once as comments (#) for documentation, once as YAML key:value fields for parsing</action>
<action>Every story key in sprints MUST exactly match a kebab-case key derived from the epic/story IDs</action>
</step>

<step n="4" goal="Validate and report">
<action>Perform validation checks:</action>

- [ ] Every epic in epic files is represented in at least one sprint
- [ ] Every story in epic files appears in `{status_file}` (or is intentionally unscheduled)
- [ ] No sprint story key that doesn't correspond to a real epic/story
- [ ] File is valid YAML syntax
- [ ] No `development_status` block exists in the output file

<action>Count totals:</action>

- Total epics: {{epic_count}}
- Total stories: {{story_count}}
- Epics in-progress: {{in_progress_count}}
- Stories done: {{done_count}}
- Sprints defined: {{sprint_count}}

<action>Display completion summary to {user_name} in {communication_language}:</action>

**Sprint Groupings Generated Successfully**

- **File Location:** {status_file}
- **Total Epics:** {{epic_count}}
- **Total Stories:** {{story_count}}
- **Epics In Progress:** {{epics_in_progress_count}}
- **Stories Completed:** {{done_count}}
- **Sprints Defined:** {{sprint_count}}

**Next Steps:**

1. Review the generated {status_file}
2. Open the Sprint Planning view on the canvas to see your board
3. Story statuses update automatically from JSON as agents work
4. Re-run this workflow to refresh sprint groupings (e.g. after adding new stories)

</step>

</workflow>


## Additional Documentation

### What This Workflow Generates

The sprint-planning workflow produces a **groupings-only** YAML file. It answers the question: *"Which stories belong to which sprint goal?"* It does NOT track story progress — that lives in the individual JSON files.

### Status State Machine (Reference Only)

**Epic Status Flow:**

```
backlog (draft) → in-progress (implementing/blocked) → review (in-review) → done (complete/completed)
```

**Story Status Flow:**

```
backlog (draft/not-started) → ready-for-dev (ready/approved) → in-progress (implementing/blocked) → review (in-review/ready-for-review) → done (complete/completed/archived)
```

**Retrospective Status:**

```
optional ↔ done
```

### Guidelines

1. **Epic Activation**: Mark epic as `in-progress` when starting work on its first story (in the story JSON)
2. **Sequential Default**: Stories are typically worked in order, but parallel work is supported
3. **Parallel Work Supported**: Multiple stories can be `in-progress` if team capacity allows
4. **Review Before Done**: Stories should pass through `review` before `done`
5. **Learning Transfer**: SM typically creates next story after previous one is `done` to incorporate learnings
