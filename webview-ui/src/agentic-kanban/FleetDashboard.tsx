import { useState, useEffect } from 'react';
import { vscode } from '../vscodeApi';

// ── Types ────────────────────────────────────────────────────────────────────

export type FleetHealth = 'healthy' | 'degraded' | 'dead' | 'unknown';

export interface FleetAgent {
  artifactId: string;
  agentRole: string;
  workflowId: string;
  health: FleetHealth;
  cost: number;
  startedAt?: number;
  /** P2 #8: current iteration in the orchestrator loop. */
  iteration?: number;
  /** P2 #8: max iterations cap for this run. */
  maxIteration?: number;
}

export interface FleetStatusMessage {
  type: 'fleetStatus';
  agents: FleetAgent[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<FleetHealth, { icon: string; label: string; className: string }> = {
  healthy:  { icon: '●', label: 'Healthy',  className: 'fleet-health--healthy' },
  degraded: { icon: '◐', label: 'Degraded', className: 'fleet-health--degraded' },
  dead:     { icon: '✕', label: 'Dead',     className: 'fleet-health--dead' },
  unknown:  { icon: '○', label: 'Unknown',  className: 'fleet-health--unknown' },
};

function formatElapsed(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function shortWorkflow(wf: string): string {
  if (wf === 'aac-kanban-dev-executor') return 'dev';
  if (wf === 'aac-kanban-review-guard') return 'review';
  return wf.replace(/^aac-kanban-/, '').replace(/-/g, ' ').slice(0, 12);
}

// ── Component ────────────────────────────────────────────────────────────────

export function FleetDashboard() {
  const [agents, setAgents] = useState<FleetAgent[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Pull fleet status on mount
  useEffect(() => {
    vscode.postMessage({ type: 'getFleetStatus' });
  }, []);

  // Listen for fleetStatus messages from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'fleetStatus') {
        setAgents((event.data as FleetStatusMessage).agents ?? []);
      }
    };
    window.addEventListener('message', handler);

    // Refresh every 10s for elapsed time
    const interval = setInterval(() => {
      vscode.postMessage({ type: 'getFleetStatus' });
    }, 10_000);
    return () => {
      window.removeEventListener('message', handler);
      clearInterval(interval);
    };
  }, []);

  if (agents.length === 0) return null;

  const running = agents.filter(a => a.health !== 'dead');
  const degradedCount = agents.filter(a => a.health === 'degraded' || a.health === 'dead').length;

  return (
    <div className="fleet-dashboard">
      {/* ── Header ── */}
      <button
        className="fleet-dashboard-toggle"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        title={`Fleet dashboard — ${running.length} agent${running.length !== 1 ? 's' : ''} running`}
      >
        <span className="fleet-dashboard-icon">🤖</span>
        <span className="fleet-dashboard-title">Fleet</span>
        <span className="fleet-dashboard-count">{running.length} running</span>
        {degradedCount > 0 && (
          <span className="fleet-dashboard-warn">{degradedCount} unhealthy</span>
        )}
        <span className="fleet-dashboard-chevron">{collapsed ? '▸' : '▾'}</span>
      </button>

      {/* ── Agent rows ── */}
      {!collapsed && (
        <div className="fleet-dashboard-rows" role="list">
          {agents.map(a => {
            const hc = HEALTH_CONFIG[a.health];
            return (
              <div key={a.artifactId} className="fleet-agent-row" role="listitem">
                {/* Health dot */}
                <span
                  className={`fleet-health-dot ${hc.className}`}
                  title={hc.label}
                >
                  {hc.icon}
                </span>

                {/* Role + workflow */}
                <span className="fleet-agent-role" title={a.workflowId}>
                  {a.agentRole}
                </span>
                <span className="fleet-agent-workflow">
                  {shortWorkflow(a.workflowId)}
                </span>

                {/* Artifact ID */}
                <span className="fleet-agent-artifact">{a.artifactId}</span>

                {/* Elapsed time */}
                {a.startedAt && (
                  <span className="fleet-agent-elapsed">
                    {formatElapsed(a.startedAt)}
                  </span>
                )}

                {/* Cost (total) */}
                {a.cost > 0 && (
                  <span className="fleet-agent-cost" title={`$${a.cost.toFixed(4)} total spent`}>
                    ${a.cost.toFixed(3)}
                  </span>
                )}

                {/* Iteration */}
                {a.iteration !== undefined && (
                  <span className="fleet-agent-iteration" title={`Iteration ${a.iteration} of ${a.maxIteration ?? '?'}`}>
                    {a.iteration}/{a.maxIteration ?? '?'}
                  </span>
                )}

                {/* Burn rate (cost / minute, floor at 1s to avoid division by zero) */}
                {a.cost > 0 && a.startedAt && (
                  <span className="fleet-agent-burn" title={`$${a.cost.toFixed(4)} in ${formatElapsed(a.startedAt)}`}>
                    ${((a.cost / Math.max(1, Date.now() - a.startedAt)) * 60000 || 0).toFixed(2)}/min
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
