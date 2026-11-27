import type { CSSProperties } from 'react';
import { avatarLook } from './agent-avatar';
import './AgentAvatar.css';

export interface AgentAvatarProps {
  name: string;
  id?: string;
  avatar?: string;
  person?: boolean;
  /** Pixel size; the emoji scales with it. */
  size?: number;
  className?: string;
}

/** An agent's emoji (or a person's initials) on a soft tinted circle. */
export function AgentAvatar({ name, id, avatar, person, size = 24, className }: AgentAvatarProps) {
  const look = avatarLook({ id, name, avatar, person });
  const style = { '--avatar-size': `${size}px`, '--avatar-tint': look.tint } as CSSProperties;
  return (
    <span
      className={`agent-avatar${look.initials ? ' agent-avatar--initials' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      title={name}
      aria-hidden="true"
    >
      {look.emoji ?? look.initials}
    </span>
  );
}
