import { describe, it, expect } from 'vitest';
import { AGENT_AVATARS, isAgentAvatar, unusedAvatar } from './agent-avatars';
import { parseAgentTeam } from './agent-team';

describe('agent avatars', () => {
  it('hands a new agent an avatar nobody on the team has', () => {
    expect(unusedAvatar([])).toBe(AGENT_AVATARS[0]);
    expect(unusedAvatar([AGENT_AVATARS[0], AGENT_AVATARS[1]])).toBe(AGENT_AVATARS[2]);
  });

  it('starts over when every avatar is taken', () => {
    expect(AGENT_AVATARS).toContain(unusedAvatar([...AGENT_AVATARS]));
  });

  it('accepts one short emoji and nothing else', () => {
    expect(isAgentAvatar('🦊')).toBe(true);
    expect(isAgentAvatar('👩🏽‍💻')).toBe(true);
    expect(isAgentAvatar('')).toBe(false);
    expect(isAgentAvatar('a very long value')).toBe(false);
    expect(isAgentAvatar('AB')).toBe(false);
  });

  it('keeps the avatar saved in the team file, for agents and people', () => {
    const { team, errors } = parseAgentTeam(JSON.stringify({
      agents: [
        { id: 'dev', name: 'Dev', harness: 'claude', avatar: '🦊' },
        { id: 'sara', name: 'Sara', kind: 'person', avatar: '🌞' },
      ],
    }));
    expect(errors).toEqual([]);
    expect(team.agents?.map((a) => a.avatar)).toEqual(['🦊', '🌞']);
  });

  it('reports an avatar that is not an emoji', () => {
    const { errors } = parseAgentTeam(JSON.stringify({ agents: [{ id: 'dev', name: 'Dev', harness: 'claude', avatar: 'robot' }] }));
    expect(errors[0]).toMatch(/avatar/);
  });
});
