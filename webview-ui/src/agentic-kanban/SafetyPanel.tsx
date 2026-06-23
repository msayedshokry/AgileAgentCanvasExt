import { useState, useEffect, useRef } from 'react';
import { vscode } from '../vscodeApi';
import { ARTIFACT_TYPE_VARIANTS, type KnownArtifactVariant } from '../types';

// ── Types (mirrored from extension) ──────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface SafetyCircuit {
  workflowId: string;
  state: CircuitState;
  failureCount: number;
  lastFailureReason?: string;
  openedAt?: number;
}

export interface SafetyPolicy {
  id: string;
  name: string;
  description: string;
  type: 'pre-flight' | 'post-flight' | 'continuous';
  severity: 'blocking' | 'advisory';
  artifactType?: string;
}

export interface SafetyBlock {
  artifactId: string;
  policyId: string;
  failures: string[];
  timestamp: number;
  /**
   * Artifact type (`'story'`, `'epic'`, etc.) — currently surfaces in the UI
   * as a small inline label and participates in the React key as a
   * type-aware disambiguator when multiple artifactIds share an id space
   * (e.g. one story and one epic both using `artifact_001` as their id).
   * Optional so older extension builds that omit it don't crash the panel.
   */
  artifactType?: string;
}

export interface SafetyStatus {
  type: 'safetyStatus';
  circuits: SafetyCircuit[];
  policies: SafetyPolicy[];
  recentBlocks: SafetyBlock[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CIRCUIT_STATE_CONFIG: Record<CircuitState, { label: string; className: string; icon: string }> = {
  closed:    { label: '● Closed',     className: 'safety-circuit--closed',    icon: '●' },
  open:      { label: '⛔ Open',      className: 'safety-circuit--open',      icon: '⛔' },
  'half-open': { label: '⚠ Half-Open', className: 'safety-circuit--half-open', icon: '⚠' },
};

const SEVERITY_BADGE: Record<string, { label: string; className: string }> = {
  blocking: { label: 'BLOCK', className: 'safety-policy-badge--blocking' },
  advisory: { label: 'ADVISE', className: 'safety-policy-badge--advisory' },
};

const TYPE_LABEL: Record<string, string> = {
  'pre-flight':  'Pre-flight',
  'post-flight': 'Post-flight',
  'continuous':  'Continuous',
};

// Lookup helper. See `ARTIFACT_TYPE_VARIANTS` in `../types.ts` for the
// canonical catalogue contract and the "unknown types surface as a
// TS-typed absence" rationale.
function artifactTypeClass(
  artifactType?: string,
): KnownArtifactVariant | undefined {
  if (!artifactType) return undefined;
  const lower = artifactType.toLowerCase();
  // The `in` operator narrows the RHS (the Record) but does NOT
  // narrow the LHS — `lower` remains `string` after the check.
  // The cast back to `KnownArtifactVariant` is therefore still
  // required in the truthy branch, but it is sound at runtime
  // because the truthy guard proves membership in the keyof union.
  // Pattern: `if (lower in MAP) return lower as KeyUnion;`.
  if (lower in ARTIFACT_TYPE_VARIANTS) {
    return lower as KnownArtifactVariant;
  }
  return undefined;
}

function formatTime(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleTimeString();
}

// ── Component ────────────────────────────────────────────────────────────────

export function SafetyPanel() {
  const [open, setOpen] = useState(false);
  const [safetyStatus, setSafetyStatus] = useState<SafetyStatus | null>(null);
  const [killSwitchConfirm, setKillSwitchConfirm] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Pull safety status on mount + when opened
  useEffect(() => {
    vscode.postMessage({ type: 'getSafetyStatus' });
  }, []);

  useEffect(() => {
    if (open) {
      vscode.postMessage({ type: 'getSafetyStatus' });
    }
  }, [open]);

  // Listen for safetyStatus messages from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'safetyStatus') {
        setSafetyStatus(event.data as SafetyStatus);
      }
      if (event.data?.type === 'safetyKillSwitchAck') {
        setKillSwitchConfirm(false);
        setOpen(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setKillSwitchConfirm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Escape to close
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setKillSwitchConfirm(false);
    }
  };

  const handleKillSwitch = () => {
    if (!killSwitchConfirm) {
      setKillSwitchConfirm(true);
      return;
    }
    vscode.postMessage({ type: 'kanban:safetyKillSwitch' });
  };

  const handleResetCircuit = (workflowId: string) => {
    vscode.postMessage({ type: 'kanban:safetyResetCircuit', workflowId });
  };

  const handleDismissBlock = (artifactId: string, policyId: string, timestamp: number) => {
    vscode.postMessage({
      type: 'kanban:safetyDismissBlock',
      artifactId,
      policyId,
      timestamp,
    });
  };

  const handleClearAllBlocks = () => {
    vscode.postMessage({ type: 'kanban:safetyClearAllBlocks' });
  };

  const circuits = safetyStatus?.circuits ?? [];
  const policies = safetyStatus?.policies ?? [];
  const recentBlocks = safetyStatus?.recentBlocks ?? [];
  const openCircuits = circuits.filter(c => c.state !== 'closed');
  const hasOpenCircuit = openCircuits.length > 0;
  const blockedCount = recentBlocks.length;

  return (
    <div className="safety-panel" ref={panelRef} onKeyDown={handleKeyDown}>
      {/* ── Toggle button (shield icon + open circuit / blocked count badge) ── */}
      <button
        className={`safety-panel-btn ${hasOpenCircuit ? 'safety-panel-btn--danger' : ''} ${open ? 'safety-panel-btn--open' : ''}`}
        onClick={() => {
          setOpen(o => !o);
          setKillSwitchConfirm(false);
        }}
        aria-expanded={open}
        aria-label={`Safety panel — ${openCircuits.length} open circuit${openCircuits.length !== 1 ? 's' : ''}, ${blockedCount} blocked, ${policies.length} policies`}
        title="Safety & governance — circuit breakers, policies, kill-switch"
      >
        <span className="safety-panel-icon">🛡</span>
        <span className="safety-panel-label">Safety</span>
        {hasOpenCircuit && (
          <span className="safety-panel-badge">{openCircuits.length}</span>
        )}
        <span className="safety-panel-chevron">{open ? '▴' : '▾'}</span>
      </button>

      {/* ── Dropdown popover ── */}
      {open && (
        <div className="safety-panel-dropdown" role="dialog" aria-label="Safety & governance panel">
          {/* ══ Circuit Breakers ══ */}
          <div className="safety-section">
            <div className="safety-section-header">
              <span className="safety-section-title">⚡ Circuit Breakers</span>
              <span className="safety-section-meta">
                {circuits.filter(c => c.state !== 'closed').length} open · {circuits.length} total
              </span>
            </div>

            {circuits.length === 0 ? (
              <div className="safety-empty">No circuit breakers active — no workflow failures recorded yet.</div>
            ) : (
              <div className="safety-circuit-list">
                {circuits.map(c => {
                  const cfg = CIRCUIT_STATE_CONFIG[c.state];
                  return (
                    <div key={c.workflowId} className={`safety-circuit ${cfg.className}`}>
                      <span className="safety-circuit-state">
                        {cfg.icon} {cfg.label.split(' ')[1]}
                      </span>
                      <span className="safety-circuit-id">{c.workflowId}</span>
                      <span className="safety-circuit-failures" title={`${c.failureCount} failure${c.failureCount !== 1 ? 's' : ''}`}>
                        {c.failureCount} fail{c.failureCount !== 1 ? 's' : ''}
                      </span>
                      {c.lastFailureReason && (
                        <span className="safety-circuit-reason" title={c.lastFailureReason}>
                          {c.lastFailureReason.length > 60
                            ? c.lastFailureReason.slice(0, 60) + '…'
                            : c.lastFailureReason}
                        </span>
                      )}
                      {c.openedAt && (
                        <span className="safety-circuit-time">{formatTime(c.openedAt)}</span>
                      )}
                      {c.state !== 'closed' && (
                        <button
                          className="safety-circuit-reset-btn"
                          onClick={() => handleResetCircuit(c.workflowId)}
                          title={`Reset circuit for ${c.workflowId}`}
                        >
                          ↻ Reset
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ══ Recent Blocks (blocked by policy X) ══ */}
          {recentBlocks.length > 0 && (
            <div className="safety-section">
              <div className="safety-section-header">
                <span className="safety-section-title">🚫 Blocked by Policy</span>
                <div className="safety-section-actions">
                  <span className="safety-section-meta">{recentBlocks.length} recent</span>
                  <button
                    className="safety-section-link-btn"
                    onClick={handleClearAllBlocks}
                    title="Clear all recent block entries from this panel"
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div className="safety-blocks-list">
                {recentBlocks.map((b) => {
                  // Pre-compute the artifact-type variant (declared once per
                  // row in the closure). Conditional modifier class: known
                  // variants get a color-coded `--<variant>` class (the CSS
                  // groups these into 7 semantic color buckets so the
                  // palette stays bounded even as the keyset grows);
                  // unrecognised types render ONLY with the base
                  // `.safety-block-type` class so the type system surfaces
                  // the gap rather than silently inventing `--unknown` at
                  // runtime (per the JSDoc contract on
                  // `artifactTypeClass`).
                  const variant = b.artifactType
                    ? artifactTypeClass(b.artifactType)
                    : undefined;
                  const typeClassName = variant
                    ? `safety-block-type safety-block-type--${variant}`
                    : 'safety-block-type';
                  return (
                    // React key includes artifactType (with empty fallback)
                    // so two entries that share an artifactId across
                    // different types (e.g. an epic and a story named
                    // "artifact_001") remain distinct rows instead of
                    // triggering React's duplicate-key warning + DOM
                    // collapse.
                    <div
                      key={`${b.artifactType ?? ''}/${b.artifactId}-${b.policyId}-${b.timestamp}`}
                      className="safety-block"
                    >
                      <span className="safety-block-artifact">{b.artifactId}</span>
                      {b.artifactType && (
                        <span
                          className={typeClassName}
                          title={`Artifact type: ${b.artifactType}`}
                        >
                          {b.artifactType}
                        </span>
                      )}
                      <span className="safety-block-verb">blocked by</span>
                      <span className="safety-block-policy">{b.policyId}</span>
                      {b.failures.length > 0 && (
                        <span className="safety-block-reason" title={b.failures.join('; ')}>
                          : {b.failures.join('; ')}
                        </span>
                      )}
                      <span className="safety-block-time">{formatTime(b.timestamp)}</span>
                      <button
                        className="safety-block-dismiss-btn"
                        onClick={() => handleDismissBlock(b.artifactId, b.policyId, b.timestamp)}
                        title={`Dismiss block entry for ${b.artifactId} / ${b.policyId}`}
                        aria-label={`Dismiss block entry for ${b.artifactId} / ${b.policyId}`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ Policies ══ */}
          <div className="safety-section">
            <div className="safety-section-header">
              <span className="safety-section-title">📋 Policies</span>
              <span className="safety-section-meta">{policies.length} total</span>
            </div>
            <div className="safety-policy-list">
              {policies.map(p => (
                <div key={p.id} className="safety-policy">
                  <div className="safety-policy-header">
                    <span className={`safety-policy-badge ${SEVERITY_BADGE[p.severity].className}`}>
                      {SEVERITY_BADGE[p.severity].label}
                    </span>
                    <span className="safety-policy-type">{TYPE_LABEL[p.type] || p.type}</span>
                    {p.artifactType && (
                      <span className="safety-policy-artifactType">{p.artifactType}</span>
                    )}
                  </div>
                  <div className="safety-policy-name">{p.name}</div>
                  <div className="safety-policy-desc">{p.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ══ Kill Switch ══ */}
          <div className="safety-section safety-section--kill">
            <button
              className={`safety-kill-btn ${killSwitchConfirm ? 'safety-kill-btn--confirm' : ''}`}
              onClick={handleKillSwitch}
            >
              {killSwitchConfirm ? (
                <>
                  <span className="safety-kill-icon">⚠</span>
                  <span>Click again to confirm — stop ALL agents & reset ALL circuits?</span>
                </>
              ) : (
                <>
                  <span className="safety-kill-icon">⏹</span>
                  <span>Kill Switch — Stop All Agents</span>
                </>
              )}
            </button>
            {killSwitchConfirm && (
              <button
                className="safety-kill-cancel-btn"
                onClick={() => setKillSwitchConfirm(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
