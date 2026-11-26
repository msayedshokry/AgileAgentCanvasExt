// A toolbar button that opens a small panel under it. Closes on Escape or a
// click outside. The panel aligns to the button's right edge by default (the
// toolbar's controls sit on the right) and never grows past the window.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import './Popover.css';

interface PopoverProps {
  /** Button content. */
  label: ReactNode;
  /** Accessible name when the label alone is not enough (e.g. an icon). */
  ariaLabel?: string;
  title?: string;
  /** Extra class on the trigger, e.g. a tone. */
  triggerClassName?: string;
  /** Which trigger edge the panel lines up with. */
  align?: 'left' | 'right';
  /** Panel content; a function gets a `close` callback. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Open from the outside, e.g. a keyboard shortcut. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({ label, ariaLabel, title, triggerClassName, align = 'right', children, open: controlled, onOpenChange }: PopoverProps) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = (next: boolean) => { setOwn(next); onOpenChange?.(next); };
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setOpen(false);
  return (
    <div className="popover" ref={rootRef}>
      <button
        type="button"
        className={`popover-trigger${open ? ' popover-trigger--open' : ''}${triggerClassName ? ` ${triggerClassName}` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div className={`popover-panel popover-panel--${align}`} role="dialog" aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
