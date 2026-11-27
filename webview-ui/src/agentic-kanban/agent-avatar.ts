// ─── Agent avatars (webview) ─────────────────────────────────────────────────
// Same set as src/workflow/harness/agent-avatars.ts. An agent shows its saved
// emoji; one with none (a roster made from the installed CLIs, or the board's
// default persona) gets a stable one from its name, so it looks the same
// everywhere. People show their initials unless they picked an emoji.

import { getInitials } from './kanban-helpers';

export const AGENT_AVATARS: readonly string[] = [
  '🦊', '🐙', '🦉', '🐝', '🐼', '🐸', '🐯', '🦁',
  '🐨', '🐵', '🐧', '🐳', '🦋', '🐢', '🦄', '🐞',
  '🌞', '🌙', '⭐', '🔥', '⚡', '🍀', '🚀', '🧠',
];

/** Soft backgrounds behind the emoji; picked from the name so neighbours differ. */
const TINTS = ['#f4a261', '#e9c46a', '#8ecae6', '#90be6d', '#cdb4db', '#f28482', '#84a59d', '#ffafcc'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface AvatarLook {
  readonly emoji?: string;
  readonly initials?: string;
  readonly tint: string;
}

export function avatarLook(member: { id?: string; name: string; avatar?: string; person?: boolean }): AvatarLook {
  const key = member.id || member.name;
  const tint = TINTS[hash(key) % TINTS.length];
  if (member.avatar) return { emoji: member.avatar, tint };
  if (member.person) return { initials: getInitials(member.name) || '?', tint };
  return { emoji: AGENT_AVATARS[hash(key) % AGENT_AVATARS.length], tint };
}
