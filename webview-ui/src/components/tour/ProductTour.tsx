import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { computePopoverPosition, type PopoverPosition, type Rect, type TourStep } from './tourSteps';
import './ProductTour.css';

interface ProductTourProps {
  steps: readonly TourStep[];
  /** Called when the user finishes or ends the tour (or no step target exists). */
  onClose: () => void;
}

const SPOTLIGHT_PADDING = 6;

/** The step's control, if it is rendered with a size and at least partly on screen. */
function findTarget(step: TourStep): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(step.target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const visible = r.width > 0 && r.height > 0
    && r.right > 0 && r.bottom > 0
    && r.left < window.innerWidth && r.top < window.innerHeight;
  return visible ? el : null;
}

function toRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - SPOTLIGHT_PADDING,
    left: r.left - SPOTLIGHT_PADDING,
    width: r.width + SPOTLIGHT_PADDING * 2,
    height: r.height + SPOTLIGHT_PADDING * 2,
  };
}

/**
 * Step-by-step coach-mark tour: dims the webview, spotlights one control at a
 * time and explains it in a small popover ("1 of N", End Tour / Back / Next).
 */
export function ProductTour({ steps, onClose }: ProductTourProps) {
  // Resolve after the DOM commits (the opener may switch views in the same
  // render): skip steps whose control is not on screen right now.
  const [available, setAvailable] = useState<readonly TourStep[] | null>(null);
  useLayoutEffect(() => {
    setAvailable(steps.filter(s => findTarget(s) !== null));
  }, [steps]);
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const total = available?.length ?? 0;
  const step = available?.[index];
  const isLast = index === total - 1;

  useEffect(() => {
    if (available && available.length === 0) onClose();
  }, [available, onClose]);

  const measure = useCallback(() => {
    if (!step) return;
    const el = findTarget(step);
    if (!el) { setTargetRect(null); return; }
    const rect = toRect(el);
    setTargetRect(rect);
    const pop = popoverRef.current;
    if (pop) {
      setPosition(computePopoverPosition(
        rect,
        { width: pop.offsetWidth, height: pop.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ));
    }
  }, [step]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const stepId = step?.id;
  useEffect(() => {
    if (stepId) nextRef.current?.focus();
  }, [stepId]);

  const goNext = useCallback(() => {
    if (isLast) onClose();
    else setIndex(i => i + 1);
  }, [isLast, onClose]);

  const goBack = useCallback(() => {
    setIndex(i => Math.max(0, i - 1));
  }, []);

  // Capture phase so canvas shortcuts (arrows, Escape) don't also fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const handlers: Record<string, () => void> = {
        Escape: onClose,
        ArrowRight: goNext,
        ArrowLeft: goBack,
      };
      const handler = handlers[e.key];
      if (!handler) return;
      e.preventDefault();
      e.stopPropagation();
      handler();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, goNext, goBack]);

  if (!step) return null;

  const titleId = `product-tour-title-${step.id}`;
  const bodyId = `product-tour-body-${step.id}`;

  return (
    <div className="product-tour" data-testid="product-tour">
      {/* Click shield: the tour is modal, the page underneath is inert. */}
      <div className="product-tour-shield" aria-hidden="true" />
      {targetRect && (
        <div
          className="product-tour-spotlight"
          aria-hidden="true"
          style={{
            width: targetRect.width,
            height: targetRect.height,
            transform: `translate(${targetRect.left}px, ${targetRect.top}px)`,
          }}
        />
      )}
      <div
        ref={popoverRef}
        className={`product-tour-popover product-tour-popover--${position?.placement ?? 'bottom'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        style={{
          transform: position ? `translate(${position.left}px, ${position.top}px)` : undefined,
          visibility: position ? 'visible' : 'hidden',
        }}
      >
        <h2 id={titleId} className="product-tour-title">{step.title}</h2>
        <p id={bodyId} className="product-tour-body">{step.body}</p>
        <div className="product-tour-footer">
          <span className="product-tour-count" aria-live="polite">
            {index + 1} of {total}
          </span>
          <div className="product-tour-actions">
            {!isLast && (
              <button type="button" className="product-tour-btn product-tour-btn--ghost" onClick={onClose}>
                End Tour
              </button>
            )}
            {index > 0 && (
              <button type="button" className="product-tour-btn product-tour-btn--secondary" onClick={goBack}>
                Back
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              className="product-tour-btn product-tour-btn--primary"
              onClick={goNext}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
