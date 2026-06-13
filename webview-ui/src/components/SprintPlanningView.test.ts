/**
 * Tests for parseSprintStatusYaml
 *
 * Primary focus: title propagation from live epic/story data to sprint items.
 * This guards the regression where epics and stories rendered with empty titles
 * because parseSprintStatusYaml hardcoded `title: ''` for non-retro items.
 *
 * Also covers: item structure, key generation, YAML header parsing, sprint
 * groupings, and consistency checks.
 */
import { describe, it, expect } from 'vitest';
import { parseSprintStatusYaml } from './SprintPlanningView';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEpic(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'epic-1',
    title: 'Sample Epic',
    status: 'backlog',
    stories: [],
    ...overrides,
  };
}

function makeStory(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'S-1.1',
    title: 'Sample Story',
    status: 'backlog',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Title propagation (primary regression coverage)
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseSprintStatusYaml — title propagation', () => {
  it('propagates epic.title to the epic item', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({ id: 'epic-3', title: 'Dark Mode Launch' }),
    ]);
    const epic = result.items.find(i => i.isEpic);
    expect(epic).toBeDefined();
    expect(epic!.title).toBe('Dark Mode Launch');
  });

  it('propagates story.title to the story item', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: 'Toggle dark mode in settings' })],
      }),
    ]);
    const story = result.items.find(i => i.type === 'story');
    expect(story).toBeDefined();
    expect(story!.title).toBe('Toggle dark mode in settings');
  });

  it('propagates titles for multiple stories under the same epic', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [
          makeStory({ id: 'S-3.1', title: 'First Story' }),
          makeStory({ id: 'S-3.2', title: 'Second Story' }),
          makeStory({ id: 'S-3.3', title: 'Third Story' }),
        ],
      }),
    ]);
    const stories = result.items.filter(i => i.type === 'story');
    expect(stories.map(s => s.title)).toEqual(['First Story', 'Second Story', 'Third Story']);
  });

  it('uses "Retrospective" for default retro items (hardcoded label)', () => {
    // No retro-named story → function auto-generates a retro with hardcoded title
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: 'Real story' })],
      }),
    ]);
    const retro = result.items.find(i => i.isRetro);
    expect(retro).toBeDefined();
    expect(retro!.title).toBe('Retrospective');
  });

  it('falls back to empty string when epic.title is missing', () => {
    // Explicit undefined override: makeEpic's default would otherwise set title='Sample Epic'
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'epic-3', title: undefined })]);
    const epic = result.items.find(i => i.isEpic);
    expect(epic!.title).toBe('');
  });

  it('falls back to empty string when story.title is missing', () => {
    // Explicit undefined override: makeStory's default would otherwise set title='Sample Story'
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: undefined })],
      }),
    ]);
    const story = result.items.find(i => i.type === 'story');
    expect(story!.title).toBe('');
  });

  it('falls back to empty string when epic.title is explicitly null', () => {
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'epic-3', title: null })]);
    expect(result.items[0].title).toBe('');
  });

  it('preserves special characters in title (only slugifies the key)', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: 'Auth & Permissions: OAuth2 Login' })],
      }),
    ]);
    const story = result.items.find(i => i.type === 'story');
    expect(story!.title).toBe('Auth & Permissions: OAuth2 Login');  // preserved as-is
    expect(story!.key).toBe('3-1-auth-permissions-oauth2-login');   // slugged for key
  });

  it('preserves Unicode characters in title (not just ASCII)', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: 'Café 日本語' })],
      }),
    ]);
    const story = result.items.find(i => i.type === 'story');
    expect(story!.title).toBe('Café 日本語');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Item structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseSprintStatusYaml — item structure', () => {
  it('builds 3 items per epic with stories: epic + story + retro', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: 'S1' })],
      }),
    ]);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].isEpic).toBe(true);
    expect(result.items[1].type).toBe('story');
    expect(result.items[2].isRetro).toBe(true);
  });

  it('builds 1 item (epic only) when epic has no stories', () => {
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'epic-3', stories: [] })]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isEpic).toBe(true);
  });

  it('epic item has type="epic" and key="epic-{N}"', () => {
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'epic-42' })]);
    expect(result.items[0].type).toBe('epic');
    expect(result.items[0].key).toBe('epic-42');
    expect(result.items[0].id).toBe('epic-42');
  });

  it('story item has type="story" and key="{prefix}-{slug}"', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: 'Dark Mode Toggle' })],
      }),
    ]);
    const story = result.items[1];
    expect(story.type).toBe('story');
    expect(story.key).toBe('3-1-dark-mode-toggle');
    expect(story.epicKey).toBe('epic-3');
  });

  it('story key falls back to prefix-only when title is empty (no slug)', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: '' })],
      }),
    ]);
    expect(result.items[1].key).toBe('3-1');
  });

  it('story key strips non-alphanumeric chars (only [a-z0-9] survives)', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: '!!!@@@###' })],
      }),
    ]);
    expect(result.items[1].key).toBe('3-1');
  });

  it('propagates epic.status to the epic item', () => {
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'epic-1', status: 'in-progress' })]);
    expect(result.items[0].status).toBe('in-progress');
  });

  it('propagates story.status to the story item', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-1',
        stories: [makeStory({ id: 'S-1.1', status: 'review' })],
      }),
    ]);
    expect(result.items[1].status).toBe('review');
  });

  it('defaults status to "backlog" when missing', () => {
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'epic-1' })]);
    expect(result.items[0].status).toBe('backlog');
  });

  it('strips "epic-" prefix case-insensitively from epic.id when building key', () => {
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'EPIC-7' })]);
    expect(result.items[0].key).toBe('epic-7');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Multiple epics
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseSprintStatusYaml — multiple epics', () => {
  it('builds items for all epics in order', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({ id: 'epic-1', title: 'Epic 1' }),
      makeEpic({ id: 'epic-2', title: 'Epic 2' }),
    ]);
    const epics = result.items.filter(i => i.isEpic);
    expect(epics).toHaveLength(2);
    expect(epics[0].title).toBe('Epic 1');
    expect(epics[1].title).toBe('Epic 2');
  });

  it('returns empty items array when epics is empty', () => {
    const result = parseSprintStatusYaml(null, []);
    expect(result.items).toEqual([]);
  });

  it('handles mixed epics: with-stories and without-stories', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({ id: 'epic-1', stories: [makeStory({ id: 'S-1.1', title: 's' })] }),
      makeEpic({ id: 'epic-2', stories: [] }),
    ]);
    // epic-1: epic + 1 story + 1 retro = 3
    // epic-2: epic only = 1
    // total = 4
    expect(result.items).toHaveLength(4);
    const epics = result.items.filter(i => i.isEpic);
    expect(epics).toHaveLength(2);
    const stories = result.items.filter(i => i.type === 'story');
    expect(stories).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// YAML header parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseSprintStatusYaml — YAML header', () => {
  it('returns empty fields when yaml is null', () => {
    const result = parseSprintStatusYaml(null, []);
    expect(result.project).toBeUndefined();
    expect(result.projectKey).toBeUndefined();
    expect(result.sprints).toBeUndefined();
  });

  it('returns empty fields when yaml is undefined', () => {
    const result = parseSprintStatusYaml(undefined, []);
    expect(result.project).toBeUndefined();
  });

  it('extracts project metadata from YAML header', () => {
    const yaml = `project: My Project\nproject_key: mp\ntracking_system: jira\n`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.project).toBe('My Project');
    expect(result.projectKey).toBe('mp');
    expect(result.trackingSystem).toBe('jira');
  });

  it('extracts generated and last_updated timestamps', () => {
    const yaml = `generated: 2025-01-15\nlast_updated: 2025-01-20\n`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.generated).toBe('2025-01-15');
    expect(result.lastUpdated).toBe('2025-01-20');
  });

  it('extracts story_location', () => {
    const yaml = `story_location: .agileagentcanvas-context/stories\n`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.storyLocation).toBe('.agileagentcanvas-context/stories');
  });

  it('strips double quotes from YAML values', () => {
    const yaml = `project: "My Project"\n`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.project).toBe('My Project');
  });

  it('does NOT strip single quotes from YAML values (only double quotes are stripped)', () => {
    // Documents current behavior: the parser's regex is `replace(/^"|"$/g, '')` — only handles double quotes.
    // If single-quote support is ever added, this test will need to be updated.
    const yaml = `project: 'My Project'\n`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.project).toBe("'My Project'");
  });

  it('ignores comment lines starting with #', () => {
    const yaml = `# this is a comment\nproject: My Project\n# another comment\n`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.project).toBe('My Project');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint groupings
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseSprintStatusYaml — sprint groupings', () => {
  it('returns undefined sprints when YAML has no sprints section', () => {
    const result = parseSprintStatusYaml('project: foo\n', []);
    expect(result.sprints).toBeUndefined();
  });

  it('parses a single sprint with goal, dates, and stories', () => {
    const yaml = `
sprints:
  sprint_1:
    goal: "Ship dark mode"
    start_date: "2025-01-01"
    end_date: "2025-01-14"
    stories:
      - epic-1
      - 3-1-dark-mode
`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.sprints).toHaveLength(1);
    expect(result.sprints![0].id).toBe('sprint_1');
    expect(result.sprints![0].label).toBe('Sprint 1');
    expect(result.sprints![0].goal).toBe('Ship dark mode');
    expect(result.sprints![0].startDate).toBe('2025-01-01');
    expect(result.sprints![0].endDate).toBe('2025-01-14');
    expect(result.sprints![0].storyKeys).toEqual(['epic-1', '3-1-dark-mode']);
  });

  it('parses multiple sprints', () => {
    const yaml = `
sprints:
  sprint_1:
    stories:
      - epic-1
  sprint_2:
    stories:
      - epic-2
`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.sprints).toHaveLength(2);
    expect(result.sprints![0].id).toBe('sprint_1');
    expect(result.sprints![1].id).toBe('sprint_2');
  });

  it('prettifies sprint ids with underscores (beta_launch → Beta Launch)', () => {
    const yaml = `
sprints:
  beta_launch:
    stories: []
`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.sprints![0].label).toBe('Beta Launch');
  });

  it('promotes common abbreviations in sprint labels (mvp → MVP, api → API)', () => {
    const yaml = `
sprints:
  mvp_release:
    stories: []
  api_launch:
    stories: []
`;
    const result = parseSprintStatusYaml(yaml, []);
    expect(result.sprints![0].label).toBe('MVP Release');
    expect(result.sprints![1].label).toBe('API Launch');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Retro detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseSprintStatusYaml — retro detection', () => {
  it('does NOT generate default retro when a retro-named story exists', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [
          makeStory({ id: 'S-3.1', title: 'Real story' }),
          makeStory({ id: 'S-3.2', title: 'Sprint Retrospective' }),
        ],
      }),
    ]);
    expect(result.items.filter(i => i.isRetro)).toHaveLength(0);
  });

  it('detects retro-named story case-insensitively', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-3',
        stories: [makeStory({ id: 'S-3.1', title: 'RETROSPECTIVE meeting notes' })],
      }),
    ]);
    expect(result.items.filter(i => i.isRetro)).toHaveLength(0);
  });

  it('does NOT generate retro when epic has no stories', () => {
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'epic-3', stories: [] })]);
    expect(result.items.filter(i => i.isRetro)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Consistency checks
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseSprintStatusYaml — consistency checks', () => {
  it('flags consistencyError when story is active but epic is backlog', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-1',
        status: 'backlog',
        stories: [makeStory({ id: 'S-1.1', title: 's1', status: 'in-progress' })],
      }),
    ]);
    const story = result.items[1];
    expect(story.consistencyError).toBe(true);
    expect(story.consistencyWarning).toBeUndefined();
  });

  it('flags consistencyWarning when story is done but epic is backlog', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-1',
        status: 'backlog',
        stories: [makeStory({ id: 'S-1.1', title: 's1', status: 'done' })],
      }),
    ]);
    const story = result.items[1];
    expect(story.consistencyError).toBeUndefined();
    expect(story.consistencyWarning).toBe(true);
  });

  it('flags consistencyError for ready-for-dev story under backlog epic', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-1',
        status: 'backlog',
        stories: [makeStory({ id: 'S-1.1', title: 's1', status: 'ready-for-dev' })],
      }),
    ]);
    expect(result.items[1].consistencyError).toBe(true);
  });

  it('flags consistencyError for review story under backlog epic', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-1',
        status: 'backlog',
        stories: [makeStory({ id: 'S-1.1', title: 's1', status: 'review' })],
      }),
    ]);
    expect(result.items[1].consistencyError).toBe(true);
  });

  it('does NOT flag consistency when epic is in-progress', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-1',
        status: 'in-progress',
        stories: [makeStory({ id: 'S-1.1', title: 's1', status: 'in-progress' })],
      }),
    ]);
    expect(result.items[1].consistencyError).toBeUndefined();
    expect(result.items[1].consistencyWarning).toBeUndefined();
  });

  it('does NOT flag consistency for epic items', () => {
    const result = parseSprintStatusYaml(null, [makeEpic({ id: 'epic-1', status: 'backlog' })]);
    expect(result.items[0].consistencyError).toBeUndefined();
    expect(result.items[0].consistencyWarning).toBeUndefined();
  });

  it('does NOT flag consistency for retro items', () => {
    const result = parseSprintStatusYaml(null, [
      makeEpic({
        id: 'epic-1',
        stories: [makeStory({ id: 'S-1.1', title: 's1' })],
      }),
    ]);
    const retro = result.items.find(i => i.isRetro);
    expect(retro!.consistencyError).toBeUndefined();
    expect(retro!.consistencyWarning).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint label enrichment (centralized via extractTitle + buildSprintLabelMap)
// ═══════════════════════════════════════════════════════════════════════════════

const SPRINT_LABELS_YAML = `
sprints:
  sprint_1:
    stories:
      - epic-1
  sprint_2:
    stories:
      - 2-1
`;

describe('parseSprintStatusYaml — sprint label enrichment', () => {
  it('prefixes epic title with sprint label when YAML groups it (e.g. "Sprint 1: Dark Mode Launch")', () => {
    const result = parseSprintStatusYaml(SPRINT_LABELS_YAML, [
      makeEpic({ id: 'epic-1', title: 'Dark Mode Launch' }),
    ]);
    const epic = result.items.find(i => i.isEpic);
    expect(epic!.title).toBe('Sprint 1: Dark Mode Launch');
  });

  it('prefixes story title with sprint label when YAML groups its prefix', () => {
    const result = parseSprintStatusYaml(SPRINT_LABELS_YAML, [
      makeEpic({
        id: 'epic-2',
        stories: [makeStory({ id: 'S-2.1', title: 'Login Flow' })],
      }),
    ]);
    const story = result.items.find(i => i.type === 'story');
    expect(story!.title).toBe('Sprint 2: Login Flow');
  });

  it('prefixes retro title with sprint label (no colon, e.g. "Sprint 1 Retrospective")', () => {
    const result = parseSprintStatusYaml(SPRINT_LABELS_YAML, [
      makeEpic({
        id: 'epic-1',
        stories: [makeStory({ id: 'S-1.1', title: 'Real story' })],
      }),
    ]);
    const retro = result.items.find(i => i.isRetro);
    expect(retro!.title).toBe('Sprint 1 Retrospective');
  });

  it('keeps bare title for items NOT in any sprint grouping (regression guard)', () => {
    // Only epic-1 is grouped; epic-2 is not.
    const result = parseSprintStatusYaml(SPRINT_LABELS_YAML, [
      makeEpic({ id: 'epic-1', title: 'Dark Mode Launch' }),
      makeEpic({ id: 'epic-2', title: 'Search Overhaul' }),
    ]);
    const dark = result.items.find(i => i.key === 'epic-1');
    const search = result.items.find(i => i.key === 'epic-2');
    expect(dark!.title).toBe('Sprint 1: Dark Mode Launch');  // grouped
    expect(search!.title).toBe('Search Overhaul');           // NOT grouped
  });

  it('first sprint wins when the same key appears in multiple sprints', () => {
    // epic-1 is in both sprint_a and sprint_b → sprint_a label should win.
    // Note: sprint ids are prettified via prettifySprintId(), so 'sprint_a' becomes 'Sprint A'.
    const yaml = `
sprints:
  sprint_a:
    stories:
      - epic-1
  sprint_b:
    stories:
      - epic-1
`;
    const result = parseSprintStatusYaml(yaml, [makeEpic({ id: 'epic-1', title: 'Foo' })]);
    const epic = result.items.find(i => i.isEpic);
    expect(epic!.title).toBe('Sprint A: Foo');  // sprint_a label, not Sprint B
  });

  it('populates item.sprintLabel independently of the title for grouped items', () => {
    const result = parseSprintStatusYaml(SPRINT_LABELS_YAML, [
      makeEpic({
        id: 'epic-1',
        title: 'Dark Mode Launch',
        stories: [makeStory({ id: 'S-1.1', title: 'Real story' })],
      }),
    ]);
    const epic = result.items.find(i => i.isEpic)!;
    const retro = result.items.find(i => i.isRetro)!;
    expect(epic.sprintLabel).toBe('Sprint 1');
    expect(retro.sprintLabel).toBe('Sprint 1');  // retro inherits epic's sprint
  });

  it('leaves item.sprintLabel undefined for items NOT in any sprint grouping', () => {
    // Only epic-1 is grouped in SPRINT_LABELS_YAML; epic-2 is not.
    const result = parseSprintStatusYaml(SPRINT_LABELS_YAML, [
      makeEpic({ id: 'epic-1', title: 'Dark Mode Launch' }),
      makeEpic({ id: 'epic-2', title: 'Search Overhaul' }),
    ]);
    const search = result.items.find(i => i.key === 'epic-2')!;
    expect(search.sprintLabel).toBeUndefined();
  });
});
