import { useState, useEffect, useRef } from 'react';
import type { KanbanItem } from '../components/kanban/KanbanTypes';
import { useEvent } from './useEvent';

// ── ContextMenu ──────────────────────────────────────────────────────────────
// Keyboard-accessible context menu. Opens via right-click or Shift+F10 /
// ContextMenu key. Supports:
//   - ArrowDown / ArrowUp: cycle through actions
//   - Tab / Shift+Tab: cycle through actions (focus trap)
//   - Enter / Space: invoke the focused action
//   - Escape: close
//   - Click outside: close
//
// Focus is moved to the first action on open. On close, focus is restored to
// the trigger element only if focus is still inside the menu (i.e., the user
// dismissed via Escape or action invocation, not by clicking the backdrop).

export interface ContextMenuProps {
  /** Position and the card this menu is acting on. */
  menu: { x: number; y: number; item: KanbanItem; focusIndex: number };
  onClose: () => void;
  onOpenDetail: () => void;
  onMoveBacklog: () => void;
  onMoveDone: () => void;
  /** Provided when the card has an active trace session. */
  onViewTrace?: () => void;
  /** Provided when the card has an active terminal. */
  onJumpToTerminal?: () => void;
}

export function ContextMenu({
  menu,
  onClose,
  onOpenDetail,
  onMoveBacklog,
  onMoveDone,
  onViewTrace,
  onJumpToTerminal,
}: ContextMenuProps) {
  // Build the action list. Dividers are rendered separately for visual
  // separation but are skipped during keyboard navigation.
  const actions: Array<{ key: string; label: string; handler: () => void }> = [
    { key: 'detail', label: 'Open Detail', handler: onOpenDetail },
  ];
  if (onViewTrace) actions.push({ key: 'trace', label: 'View Trace', handler: onViewTrace });
  actions.push({ key: 'divider1', label: '—', handler: () => {} });
  actions.push({ key: 'backlog', label: 'Move to Backlog', handler: onMoveBacklog });
  actions.push({ key: 'done', label: 'Move to Done', handler: onMoveDone });
  if (onJumpToTerminal) {
    actions.push({ key: 'divider2', label: '—', handler: () => {} });
    actions.push({ key: 'terminal', label: 'Jump to Terminal', handler: onJumpToTerminal });
  }

  // Indices of non-divider actions — only these are reachable via keyboard.
  const navigableIdx = actions.reduce<number[]>((acc, a, i) => {
    if (a.key.startsWith('divider')) return acc;
    acc.push(i);
    return acc;
  }, []);
  const startIdx = navigableIdx[0] ?? 0;

  // Always start at the first navigable action. (The `focusIndex` field on
  // `menu` is reserved for a future enhancement where the parent wants to
  // preset the focus to a specific action — currently always 0.)
  const [focusIndex, setFocusIndex] = useState(startIdx);

  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Shared backdrop close handler. Called on right-click anywhere on the
  // backdrop (which would otherwise open the browser's native context menu
  // over the modal). Always receives a MouseEvent from onContextMenu.
  const handleBackdropClose = useEvent((e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
  });

  // Guard: if the actions list contains only dividers (which shouldn't
  // happen, but `onViewTrace`/`onJumpToTerminal` are optional and future
  // actions may be too), the menu has nothing focusable.
  if (navigableIdx.length === 0) {
    return (
      <div
        className="kanban-context-menu-backdrop"
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        onClick={onClose}
        onContextMenu={handleBackdropClose}
      />
    );
  }

  useEffect(() => {
    // Capture the element that had focus when the menu opened — used to
    // restore focus on Escape, but NOT on backdrop click.
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    const target = menuRef.current?.querySelector<HTMLButtonElement>(`[data-menu-index="${startIdx}"]`);
    target?.focus();
    return () => {
      // Only restore focus if focus is still inside the menu (i.e., the user
      // dismissed via Escape or invoked an action, not by backdrop click).
      // For backdrop clicks, focus has moved elsewhere — leave it.
      if (menuRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus?.();
      }
    };
    // startIdx is derived from props but only read once on mount; we
    // deliberately don't re-focus on re-render to avoid stealing focus from
    // a parent that re-renders the menu (e.g., a search query change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusItem = (idx: number) => {
    setFocusIndex(idx);
    const target = menuRef.current?.querySelector<HTMLButtonElement>(`[data-menu-index="${idx}"]`);
    target?.focus();
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const curPos = navigableIdx.indexOf(focusIndex);
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      const nextPos = navigableIdx.length === 0 ? 0 : (curPos + 1) % navigableIdx.length;
      focusItem(navigableIdx[nextPos] ?? startIdx);
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      const prevPos = navigableIdx.length === 0 ? 0 : (curPos - 1 + navigableIdx.length) % navigableIdx.length;
      focusItem(navigableIdx[prevPos] ?? startIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(startIdx);
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = navigableIdx[navigableIdx.length - 1] ?? startIdx;
      focusItem(last);
    }
  };

  return (
    <>
      <div
        className="kanban-context-menu-backdrop"
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        onClick={onClose}
        onContextMenu={handleBackdropClose}
      />
      <div
        className="kanban-context-menu"
        ref={menuRef}
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        aria-label="Card actions"
        onKeyDown={handleMenuKeyDown}
      >
        {actions.map((action, i) =>
          action.key.startsWith('divider') ? (
            <div key={action.key} className="kanban-context-menu-divider" role="separator" />
          ) : (
            <button
              key={action.key}
              className="kanban-context-menu-item"
              data-menu-index={i}
              onClick={action.handler}
              role="menuitem"
              tabIndex={i === focusIndex ? 0 : -1}
            >
              {action.label}
            </button>
          )
        )}
      </div>
    </>
  );
}
