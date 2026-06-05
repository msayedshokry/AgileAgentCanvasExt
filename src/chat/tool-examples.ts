/**
 * Few-shot examples for the top 5 most-used Agile Agent Canvas tools.
 * Each entry is a short User/Assistant conversation showing the tool being called
 * with realistic BMAD input/output.
 *
 * @example
 * import { TOOL_FEW_SHOT, getToolFewShot } from './tool-examples';
 * const example = getToolFewShot('agileagentcanvas_repair_json');
 */

export const TOOL_FEW_SHOT: Record<string, string> = {

  'agileagentcanvas_repair_json': `User: The LLM returned this story JSON but it got rejected — can you fix it?

\`\`\`json
{ "id": "STORY-1-2", "status": "in progress", "priority": "P1", "storyType": "enhancement" }
\`\`\`

Assistant: I'll repair it against the story schema — this will fix the enum values and type mismatches.

Tool: agileagentcanvas_repair_json
Input: {
  "data": {
    "id": "STORY-1-2",
    "status": "in progress",
    "priority": "P1",
    "storyType": "enhancement"
  },
  "schemaName": "story",
  "strict": false
}
Output: {
  "ok": true,
  "changed": true,
  "data": {
    "id": "STORY-1-2",
    "status": "in-progress",
    "priority": "P1",
    "storyType": "enhancement"
  },
  "repairs": ["status: 'in progress' → 'in-progress'"],
  "repairCount": 1
}

Assistant: Repaired in one fix — the status was a string enum mismatch. Now safe to persist.`,

  'agileagentcanvas_frontmatter_extract': `User: What phase and steps are defined in the story-craft workflow?

Assistant: Let me extract the frontmatter from that workflow file.

Tool: agileagentcanvas_frontmatter_extract
Input: { "path": "/repo/resources/_aac/workflows/story-craft.md" }
Output: {
  "frontmatter": {
    "name": "Story Craft",
    "phase": 4,
    "version": "1.0",
    "steps": ["Gather context", "Draft story", "Add acceptance criteria"]
  },
  "body": "# Story Craft Workflow\n..."
}

Assistant: **Story Craft** is Phase 4. Its frontmatter steps are:
1. Gather context
2. Draft story
3. Add acceptance criteria`,

  'agileagentcanvas_json_diff': `User: Can you show me what changed between the old and new epic status?

Assistant: I'll diff the two epic snapshots.

Tool: agileagentcanvas_json_diff
Input: {
  "left": { "id": "EPIC-1", "status": "planning", "storyCount": 4 },
  "right": { "id": "EPIC-1", "status": "in-progress", "storyCount": 4 },
  "format": "summary"
}
Output: {
  "summary": {
    "added": [],
    "removed": [],
    "modified": ["status"]
  },
  "patch": [{ "op": "replace", "path": "/status", "value": "in-progress" }]
}

Assistant: Only \`status\` changed — from \`planning\` to \`in-progress\`. Everything else (storyCount, id) is identical.`,

  'agileagentcanvas_sync_story_status': `User: STORY-1-1 is ready for review. Can you move it to review status across all trackers?

Assistant: Done — one atomic call updates all tracker files.

Tool: agileagentcanvas_sync_story_status
Input: { "storyId": "STORY-1-1", "status": "review" }
Output: { "ok": true, "updated": ["story.md", "epic.md", "sprint-status.yaml"] }

Assistant: Updated across all 3 tracker files: story.md, epic.md, and sprint-status.yaml. STORY-1-1 is now in review.`,

  'agileagentcanvas_update_artifact': `User: FR-3 is done — update the completion criteria and mark it complete.

Assistant: I'll update the functional requirement artifact with the new criteria.

Tool: agileagentcanvas_update_artifact
Input: {
  "type": "requirement",
  "id": "FR-3",
  "changes": {
    "status": "done",
    "completionCriteria": [
      "API returns 200 for valid input",
      "API returns 400 with field-level errors",
      "Latency under 200ms p99"
    ]
  }
}
Output: { "ok": true, "id": "FR-3" }

Assistant: FR-3 is now marked done with all 3 completion criteria persisted to the artifact store.`,
};

/**
 * Get few-shot examples for a tool, if any.
 * Returns empty string when no examples exist.
 */
export function getToolFewShot(toolName: string): string {
  return TOOL_FEW_SHOT[toolName] ?? '';
}
