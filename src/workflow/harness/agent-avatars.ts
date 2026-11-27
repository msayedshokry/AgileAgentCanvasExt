// ─── Agent avatars ───────────────────────────────────────────────────────────
// Each agent gets an emoji so it is easy to spot on cards and in lists. A new
// agent is handed one nobody on the team has (Multica hands out the same kind
// of set at random); the agent editor lets you pick another.
// Keep in step with webview-ui/src/agentic-kanban/agent-avatar.ts.

export const AGENT_AVATARS: readonly string[] = [
  '🦊', '🐙', '🦉', '🐝', '🐼', '🐸', '🐯', '🦁',
  '🐨', '🐵', '🐧', '🐳', '🦋', '🐢', '🦄', '🐞',
  '🌞', '🌙', '⭐', '🔥', '⚡', '🍀', '🚀', '🧠',
];

/** The first avatar no team member uses yet (or the first one, once all are taken). */
export function unusedAvatar(taken: readonly (string | undefined)[]): string {
  const used = new Set(taken.filter(Boolean));
  return AGENT_AVATARS.find((a) => !used.has(a)) ?? AGENT_AVATARS[0];
}

const EMOJI = /^\p{Extended_Pictographic}/u;

/** One emoji (skin tones and joined sequences allowed), never plain text. */
export function isAgentAvatar(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 16) return false;
  const chars = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
  return chars.length === 1 && EMOJI.test(value);
}
