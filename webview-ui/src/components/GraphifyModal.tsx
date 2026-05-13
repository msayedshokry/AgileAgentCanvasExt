import { useEffect, useCallback, useState } from 'react';
import type {
    GraphifyStatusWebview,
    ArchIndexWebview,
} from '../types';

interface GraphifyModalProps {
    onClose: () => void;
    onSendMessage: (msg: object) => void;
}

type PipelineStageState = 'done' | 'running' | 'pending' | 'failed';

interface PipelineStage {
    key: string;
    label: string;
    state: PipelineStageState;
}

function derivePipelineStages(status: GraphifyStatusWebview | null): PipelineStage[] {
    if (!status) {
        return [
            { key: 'detect', label: 'Detect', state: 'pending' },
            { key: 'extract', label: 'Extract', state: 'pending' },
            { key: 'build', label: 'Build Graph', state: 'pending' },
            { key: 'report', label: 'Report', state: 'pending' },
            { key: 'index', label: 'Arch Index', state: 'pending' },
            { key: 'wiki', label: 'Wiki', state: 'pending' },
            { key: 'wire', label: 'Wire Copilot', state: 'pending' },
        ];
    }

    const installed = status.installed;
    const graphPresent = status.graphPresent;
    const reportPresent = status.reportPresent;
    const archIndexPresent = status.archIndexPresent;
    const wikiPresent = status.wikiPresent;
    const wired = status.wired;

    return [
        { key: 'detect', label: 'Detect', state: installed ? 'done' : 'failed' },
        { key: 'extract', label: 'Extract', state: graphPresent ? 'done' : installed ? 'pending' : 'pending' },
        { key: 'build', label: 'Build Graph', state: graphPresent ? 'done' : 'pending' },
        { key: 'report', label: 'Report', state: reportPresent ? 'done' : graphPresent ? 'pending' : 'pending' },
        { key: 'index', label: 'Arch Index', state: archIndexPresent ? 'done' : graphPresent ? 'pending' : 'pending' },
        { key: 'wiki', label: 'Wiki', state: wikiPresent ? 'done' : graphPresent ? 'pending' : 'pending' },
        { key: 'wire', label: 'Wire Copilot', state: wired ? 'done' : 'pending' },
    ];
}

function StageIcon({ state }: { state: PipelineStageState }) {
    if (state === 'done') return <span className="gfy-stage-icon gfy-stage-icon--done">✓</span>;
    if (state === 'running') return <span className="gfy-stage-icon gfy-stage-icon--running">⟳</span>;
    if (state === 'failed') return <span className="gfy-stage-icon gfy-stage-icon--failed">✕</span>;
    return <span className="gfy-stage-icon gfy-stage-icon--pending">○</span>;
}

function PipelineTracker({ status }: { status: GraphifyStatusWebview | null }) {
    const stages = derivePipelineStages(status);
    return (
        <div className="gfy-pipeline">
            {stages.map((stage, i) => (
                <div key={stage.key} className={`gfy-stage gfy-stage--${stage.state}`}>
                    <StageIcon state={stage.state} />
                    <span className="gfy-stage-label">{stage.label}</span>
                    {i < stages.length - 1 && <span className="gfy-stage-arrow">→</span>}
                </div>
            ))}
        </div>
    );
}

function StatsBadge({ label, value }: { label: string; value: string | number }) {
    return (
        <span className="gfy-stat-badge">
            <span className="gfy-stat-badge__value">{value}</span>
            <span className="gfy-stat-badge__label">{label}</span>
        </span>
    );
}

function CommunityRow({ community }: { community: ArchIndexWebview['communities'][0] }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="gfy-community-row">
            <button
                className="gfy-community-toggle"
                onClick={() => setExpanded(e => !e)}
                aria-expanded={expanded}
                title={expanded ? 'Collapse' : 'Expand'}
            >
                {expanded ? '▾' : '▸'}
            </button>
            <div className="gfy-community-content">
                <div className="gfy-community-header">
                    <span className="gfy-community-label">{community.label}</span>
                    <span className="gfy-community-meta">{community.fileCount} files · {community.nodeCount} nodes</span>
                </div>
                {community.summary && (
                    <div className="gfy-community-summary">{community.summary}</div>
                )}
                {community.godNodes.length > 0 && (
                    <div className="gfy-god-nodes">
                        {community.godNodes.map(n => (
                            <span key={n} className="gfy-god-node">{n}</span>
                        ))}
                    </div>
                )}
                {expanded && community.directories.length > 0 && (
                    <div className="gfy-dir-chips">
                        {community.directories.map(d => (
                            <span key={d} className="gfy-dir-chip">{d}</span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function ArchCorpus({ archIndex }: { archIndex: ArchIndexWebview }) {
    const { stats, communities, globalGodNodes, crossCommunityEdges } = archIndex;
    return (
        <div className="gfy-corpus">
            <div className="gfy-stats-bar">
                <StatsBadge label="files" value={stats.files} />
                <StatsBadge label="nodes" value={stats.nodes} />
                <StatsBadge label="edges" value={stats.edges} />
                <StatsBadge label="communities" value={stats.communities} />
            </div>

            {globalGodNodes.length > 0 && (
                <div className="gfy-section">
                    <div className="gfy-section-title">Top Hub Nodes</div>
                    <div className="gfy-god-nodes">
                        {globalGodNodes.slice(0, 8).map(n => (
                            <span key={n.id} className="gfy-god-node" title={`degree: ${n.degree}`}>{n.label}</span>
                        ))}
                    </div>
                </div>
            )}

            <div className="gfy-section">
                <div className="gfy-section-title">Communities ({communities.length})</div>
                <div className="gfy-community-list">
                    {communities.map(c => (
                        <CommunityRow key={c.id} community={c} />
                    ))}
                </div>
            </div>

            {crossCommunityEdges.length > 0 && (
                <div className="gfy-section">
                    <div className="gfy-section-title">Cross-Community Links</div>
                    <div className="gfy-edge-list">
                        {crossCommunityEdges.slice(0, 6).map((e, i) => {
                            const fromComm = communities.find(c => c.id === e.from);
                            const toComm = communities.find(c => c.id === e.to);
                            return (
                                <div key={i} className="gfy-edge-row">
                                    <span className="gfy-edge-from">{fromComm?.label ?? `#${e.from}`}</span>
                                    <span className="gfy-edge-arrow">→</span>
                                    <span className="gfy-edge-to">{toComm?.label ?? `#${e.to}`}</span>
                                    <span className="gfy-edge-count">{e.edgeCount}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function RecommendedActions({
    status,
    archIndex,
    onAction,
    loading,
}: {
    status: GraphifyStatusWebview | null;
    archIndex: ArchIndexWebview | null;
    onAction: (action: string) => void;
    loading: boolean;
}) {
    if (!status) return null;

    const actions: { label: string; action: string; primary?: boolean }[] = [];

    if (!status.installed || !status.graphPresent) {
        actions.push({ label: 'Bootstrap graphify', action: 'bootstrap', primary: true });
    } else {
        if (!status.archIndexPresent) {
            actions.push({ label: 'Generate Arch Index', action: 'index', primary: true });
        }
        if (!status.wired) {
            actions.push({ label: 'Wire Copilot Instructions', action: 'wire', primary: !status.archIndexPresent });
        }
        actions.push({ label: 'Update Graph', action: 'update' });
        if (!archIndex) {
            actions.push({ label: 'Generate Wiki', action: 'wiki' });
        }
        actions.push({ label: 'Rebuild Graph', action: 'rebuild' });
    }

    // View Report button is shown whenever any report artefact exists
    const canViewReport = status.htmlReportPresent || status.reportPresent;
    if (canViewReport) {
        actions.push({ label: status.htmlReportPresent ? 'View HTML Report' : 'View Report', action: 'openReport' });
    }

    return (
        <div className="gfy-actions">
            {actions.map(a => (
                <button
                    key={a.action}
                    className={`gfy-action-btn${a.primary ? ' gfy-action-btn--primary' : ''}`}
                    onClick={() => onAction(a.action)}
                    disabled={loading}
                >
                    {a.label}
                </button>
            ))}
        </div>
    );
}

export function GraphifyModal({ onClose, onSendMessage }: GraphifyModalProps) {
    const [status, setStatus] = useState<GraphifyStatusWebview | null>(null);
    const [archIndex, setArchIndex] = useState<ArchIndexWebview | null>(null);
    const [loading, setLoading] = useState(true);

    // Request status on mount
    useEffect(() => {
        onSendMessage({ type: 'requestGraphifyStatus' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Listen for status response from extension
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const msg = event.data;
            if (msg?.type === 'graphifyStatusResponse') {
                setStatus(msg.status ?? null);
                setArchIndex(msg.archIndex ?? null);
                setLoading(false);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // Close on Escape
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        },
        [onClose]
    );
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [handleKeyDown]);

    const handleAction = useCallback(
        (action: string) => {
            setLoading(true);
            onSendMessage({ type: 'graphifyAction', action });
        },
        [onSendMessage]
    );

    return (
        <div className="gfy-overlay" onClick={onClose} role="presentation">
            <div
                className="gfy-modal"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="graphify Status"
            >
                <div className="gfy-modal-header">
                    <span className="gfy-modal-title">⬡ graphify</span>
                    <button className="gfy-close-btn" onClick={onClose} title="Close" aria-label="Close">×</button>
                </div>

                <div className="gfy-modal-body">
                    {loading && !status ? (
                        <div className="gfy-loading">Loading graphify status…</div>
                    ) : (
                        <>
                            <section className="gfy-section-block">
                                <div className="gfy-section-heading">Pipeline</div>
                                <PipelineTracker status={status} />
                            </section>

                            {archIndex && (
                                <section className="gfy-section-block">
                                    <div className="gfy-section-heading">Architecture Corpus</div>
                                    <ArchCorpus archIndex={archIndex} />
                                </section>
                            )}

                            <section className="gfy-section-block">
                                <div className="gfy-section-heading">Actions</div>
                                <RecommendedActions
                                    status={status}
                                    archIndex={archIndex}
                                    onAction={handleAction}
                                    loading={loading}
                                />
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
