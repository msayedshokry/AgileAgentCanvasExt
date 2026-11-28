// ─── Board tools an agent can call during a run ──────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L1.) One list shared by the MCP
// shim (tools/list) and the extension's endpoint (input checks), so the two
// can't drift. Every tool acts only on the run's own card (the lead: its
// epic); which card comes from the run token, never from the arguments.
// Pure.

export const BOARD_SERVER_NAME = 'aac_board';

export interface BoardTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const text = (description: string, maxLength: number) => ({ type: 'string', description, maxLength });

export const BOARD_TOOLS: readonly BoardTool[] = [
  {
    name: 'board_get_card',
    description: 'Read the card you are working on as it is now, including notes other agents left on it.',
    inputSchema: obj({}),
  },
  {
    name: 'board_list_epic',
    description: "List the stories of your card's epic with their status and assignee.",
    inputSchema: obj({}),
  },
  {
    name: 'board_note',
    description: 'Add a note to your card: progress, a decision, a trap the next agent should know. It shows in the card\'s Activity right away.',
    inputSchema: obj({ text: text('The note, in plain words.', 2000) }, ['text']),
  },
  {
    name: 'board_ask',
    description: 'Ask the user something only they can answer, and wait for the answer (up to 10 minutes). Use it instead of guessing when a wrong guess would waste the work. If no answer comes, end your run with verdict BLOCKED and the question in the verdict.',
    inputSchema: obj({
      questions: { type: 'array', items: text('One question.', 4000), minItems: 1, maxItems: 3 },
    }, ['questions']),
  },
  {
    name: 'board_propose',
    description: 'Propose new cards for work outside your card instead of widening its scope. The user approves them.',
    inputSchema: obj({
      proposals: {
        type: 'array', minItems: 1, maxItems: 5,
        items: obj({ title: text('Card title.', 200), description: text('What the card is for.', 4000), why: text('Why it is needed.', 4000) }, ['title']),
      },
    }, ['proposals']),
  },
  {
    name: 'board_check_messages',
    description: 'Get messages the user sent you since your run started. Call it between steps; follow what they say.',
    inputSchema: obj({}),
  },
  {
    name: 'board_handoff',
    description: 'Name the agent who should take your card next (by agent id from your brief), with a note for them.',
    inputSchema: obj({ to: text('Agent id.', 80), note: text('What they should know.', 4000) }, ['to']),
  },
  {
    name: 'board_recall',
    description: "Search the board's project memory: the user's earlier decisions, lessons other agents saved, and how earlier cards ended. Ask before guessing a convention or re-deciding something.",
    inputSchema: obj({ query: text('What you want to know, in a few words.', 200) }, ['query']),
  },
  {
    name: 'board_remember',
    description: 'Save a lesson every later agent on this board should know (a convention, a trap, a decision). Not for progress on your card: use board_note for that.',
    inputSchema: obj({ text: text('The lesson, in one or two sentences.', 500) }, ['text']),
  },
];

export function findBoardTool(name: string): BoardTool | undefined {
  return BOARD_TOOLS.find((t) => t.name === name);
}

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; maxLength?: number; minItems?: number; maxItems?: number };

function check(value: unknown, schema: Schema, where: string): string | undefined {
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return `${where} must be text`;
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${where} is longer than ${schema.maxLength} characters`;
      return undefined;
    case 'array': {
      if (!Array.isArray(value)) return `${where} must be a list`;
      if (schema.minItems !== undefined && value.length < schema.minItems) return `${where} needs at least ${schema.minItems} item(s)`;
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${where} allows at most ${schema.maxItems} item(s)`;
      for (let i = 0; i < value.length; i++) {
        const problem = schema.items ? check(value[i], schema.items, `${where}[${i}]`) : undefined;
        if (problem) return problem;
      }
      return undefined;
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return `${where} must be an object`;
      const rec = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (rec[key] === undefined) return `${where === 'arguments' ? '' : `${where}.`}${key} is required`;
      for (const [key, v] of Object.entries(rec)) {
        const sub = schema.properties?.[key];
        if (!sub) return `${key} is not an argument of this tool`;
        const problem = check(v, sub, key);
        if (problem) return problem;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** Why these arguments don't fit the tool's schema, or undefined when they do. */
export function checkToolArgs(tool: BoardTool, args: unknown): string | undefined {
  return check(args ?? {}, tool.inputSchema as Schema, 'arguments');
}
