import { useState, useRef, useEffect } from 'react';
import { type KanbanItem } from '../components/kanban/KanbanTypes';
import { cardAction } from '../components/kanban/KanbanCard';
import './CardPage.css';
import { vscode } from '../vscodeApi';
import { useEvent } from './useEvent';
import { AnswerQuestions, RunInsights } from './RunInsights';
import type { AgentTeamView } from './agent-team-view';
import { FollowUpComposer } from './FollowUpComposer';
import { EpicOverview } from './EpicOverview';
import { CardSide } from './CardSide';
import {
  AgentInfo,
  getInterruptionMessage,
} from './kanban-helpers';

interface AgenticDetailPanelProps {
  item: KanbanItem;
  onClose: () => void;
  onOpenTerminal?: (item: KanbanItem) => void;
  /** P1 #4: request take-over of this agent (switch to terminals, focus tile). */
  onTakeOver?: (item: KanbanItem) => void;
  /** Whether the embedded terminal backend supports typed input. */
  terminalInteractive?: boolean;
  /** Cache shared with the parent so card re-clicks don't re-fetch. */
  infoCache?: React.MutableRefObject<Map<string, { info: AgentInfo; status: string }>>;
  resumingArtifactId?: string | null;
  onResumeStateChange?: (id: string | null) => void;
  /**
   * Whether a chat session with a model is currently active. When false,
   * the Resume button is disabled and the tooltip explains why.
   */
  chatSessionActive: boolean;
  /** The model name, used to compose a more specific Resume tooltip. */
  chatSessionModel?: string;
  /** Named agents and assignments, for the assignee picker. */
  team?: AgentTeamView;
  /** Opens the agent editor (falls back to the team file when absent). */
  onEditTeam?: () => void;
  /** Start an agent on the card (the page's Start agent). */
  onStart?: (item: KanbanItem) => void;
  /** Stop the card's agent. */
  onStop?: (item: KanbanItem) => void;
  /** Approve a card in review: the review check runs, then merge or PR. */
  onApprove?: (item: KanbanItem) => void;
  /** Open another card (the epic in the breadcrumb). */
  onOpenCard?: (artifactId: string) => void;
  /** An epic's stories, for its progress, story list and breakdown. */
  stories?: readonly KanbanItem[];
  /** Questions an agent asked while it runs (board_ask), from the Inbox. */
  pendingQuestions?: readonly string[];
  /** The Inbox shows the answer box beside this page; don't repeat it here. */
  answerElsewhere?: boolean;
}

const RESUME_TIMEOUT_MS = 15_000;
const UNDO_DISMISS_MS = 8_000;

export function AgenticDetailPanel({
  item,
  onClose,
  onOpenTerminal,
  onTakeOver,
  terminalInteractive,
  infoCache,
  resumingArtifactId,
  onResumeStateChange,
  chatSessionActive,
  chatSessionModel,
  team,
  onEditTeam,
  onStart,
  onStop,
  onApprove,
  onOpenCard,
  stories = [],
  pendingQuestions,
  answerElsewhere = false,
}: AgenticDetailPanelProps) {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(() => {
    const cached = infoCache?.current.get(item.id);
    if (cached && cached.status === item.status) return cached.info;
    return null;
  });
  const [loadingInfo, setLoadingInfo] = useState(() => {
    const cached = infoCache?.current.get(item.id);
    return !(cached && cached.status === item.status);
  });
  const [pendingUndoArtifact, setPendingUndoArtifact] = useState<{ artifactId: string; sessionId?: string } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isResuming = resumingArtifactId === item.id;

  // ── No-timeout-ref handlers (useEvent: stable identity, latest closure)
  // Handlers that don't coordinate with the timeout refs. Kept together
  // so a reader can see "the simple ones" at a glance. useEvent gives
  // stable identity so React can skip re-attaching listeners on parent
  // re-renders, and ensures the closure always reads the latest `item`.

  const handleViewTerminal = useEvent(() => {
    vscode.postMessage({ type: 'kanban:jumpToTerminal', artifactId: item.id });
    onOpenTerminal?.(item);
  });

  const handleUndoAbandon = useEvent(() => {
    vscode.postMessage({
      type: 'kanban:undoAbandonExecution',
      artifactId: item.id,
      sessionId: pendingUndoArtifact?.sessionId,
    });
    setPendingUndoArtifact(null);
  });

  // ── Action handlers with timeout cleanup (useEvent) ─────────────────────
  // These set timeouts that the unmount useEffect (just below) clears.
  // Grouped together so the timeout refs and the handlers that use them
  // are co-located with the effect that cleans them up — the whole
  // timeout lifecycle is in one visual block.

  const handleResume = useEvent(() => {
    onResumeStateChange?.(item.id);
    vscode.postMessage({
      type: 'kanban:resumeExecution',
      artifactId: item.id,
      artifactType: item.type,
      sessionId: item.agentState?.sessionId,
      workflowId: item.agentState?.workflowId,
    });
    clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(
      () => onResumeStateChange?.(null),
      RESUME_TIMEOUT_MS,
    );
  });

  const handleAbandon = useEvent(() => {
    vscode.postMessage({
      type: 'kanban:abandonExecution',
      artifactId: item.id,
      sessionId: item.agentState?.sessionId,
    });
    setPendingUndoArtifact({ artifactId: item.id, sessionId: item.agentState?.sessionId });
    clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(
      () => setPendingUndoArtifact(prev =>
        prev?.artifactId === item.id ? null : prev,
      ),
      UNDO_DISMISS_MS,
    );
  });

  // Clear undo/resume timeouts on unmount.
  useEffect(() => {
    return () => {
      clearTimeout(undoTimeoutRef.current);
      clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  const isInterrupted = item.agentState?.status === 'interrupted';
  const hasPendingUndo = pendingUndoArtifact?.artifactId === item.id;

  // Fetch agent info when the panel opens (or the cached entry's status
  // no longer matches the current item status). The fetch is skipped if
  // a valid cache entry exists.
  useEffect(() => {
    const cached = infoCache?.current.get(item.id);
    if (cached && cached.status === item.status) {
      setAgentInfo(cached.info);
      setLoadingInfo(false);
      return;
    }

    setLoadingInfo(true);
    vscode.postMessage({ type: 'kanban:fetchAgentInfo', artifactId: item.id });

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'agentInfo' && msg.artifactId === item.id) {
        setAgentInfo(msg);
        setLoadingInfo(false);
        infoCache?.current.set(item.id, { info: msg, status: item.status });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [item.id, item.status, infoCache]);

  // ── Display values from agent info ──
  const latestVerdict = agentInfo?.latestVerdict;
  const recentTrace = agentInfo?.recentTrace;

  const isRunning = item.agentState?.status === 'running';

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const composerRef = useRef<HTMLDivElement>(null);
  const action = cardAction(item);
  const inReview = item.status === 'review';
  /** A person works this card by hand: no agent to message, retry or resume. */
  const isPersonCard = !!item.assignee?.person;

  // "Request changes" is a message to the agent: focus the composer.
  const focusComposer = () => composerRef.current?.querySelector('textarea')?.focus();

  return (
    <article className="agentic-detail-panel card-page" aria-label={`${item.key}: ${item.title}`}>
      {/* ── Bar: back to the board, where the card sits, and its main action ── */}
      <header className="card-page-bar">
        <button onClick={onClose} aria-label="Close detail panel" className="card-page-back" title="Back to the board (Esc)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3L4.5 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Board
        </button>
        <nav className="card-page-crumbs" aria-label="Card location">
          {item.epicKey && !item.isEpic && (
            <>
              <button className="card-page-crumb" onClick={() => onOpenCard?.(item.epicKey!)} title={`Open epic ${item.epicKey}`}>
                {item.epicTitle ?? item.epicKey}
              </button>
              <span className="card-page-crumb-sep" aria-hidden="true">/</span>
            </>
          )}
          <span className="card-page-crumb card-page-crumb--current">{item.key}</span>
        </nav>
        <div className="card-page-bar-actions">
          {inReview && onApprove && (
            <>
              <button className="agentic-btn agentic-btn--ghost" onClick={focusComposer}>Request changes</button>
              <button className="agentic-btn agentic-btn--primary" onClick={() => onApprove(item)} title="Runs the review check, then merges the branch or opens a pull request">
                Approve and mark done
              </button>
            </>
          )}
          {action === 'start' && onStart && (
            <button className="agentic-btn agentic-btn--primary" onClick={() => onStart(item)}>Start agent</button>
          )}
          {action === 'stop' && onStop && (
            <button className="agentic-btn agentic-btn--danger card-page-stop" onClick={() => onStop(item)}>Stop agent</button>
          )}
        </div>
      </header>

      <div className="card-page-body">
        <div className="card-page-main">
          <h2 className="card-page-title">{item.title}</h2>
          <CardBrief item={item} />
          {item.isEpic && <EpicOverview stories={stories} onOpenCard={onOpenCard} />}

          {/* ── What the agent concluded, or why the card is stuck ── */}
          {latestVerdict ? (
            <section className={`agentic-tldr agentic-tldr--${latestVerdict.verdict.toLowerCase()}`}>
              <div className="agentic-tldr-head">
                <span className="agentic-tldr-kind">{latestVerdict.verdict}</span>
                <span className="agentic-tldr-time">{formatTime(latestVerdict.readAt)}</span>
              </div>
              {latestVerdict.summary && <p className="agentic-tldr-summary">{latestVerdict.summary}</p>}
              {latestVerdict.fixRequests && latestVerdict.fixRequests.length > 0 && (
                <details className="agentic-tldr-fixes">
                  <summary>{latestVerdict.fixRequests.length} fix request{latestVerdict.fixRequests.length === 1 ? '' : 's'}</summary>
                  <ul>
                    {latestVerdict.fixRequests.map((fr, idx) => (
                      <li key={idx}>{fr.failing_criterion ?? JSON.stringify(fr)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          ) : isInterrupted && !item.agentState?.failure ? (
            // With a classified failure, RunInsights below states the real reason.
            <section className="agentic-tldr agentic-tldr--interrupted">
              <p className="agentic-tldr-summary">{getInterruptionMessage(item.agentState?.interruptionReason)}</p>
              {isResuming && <p className="agentic-tldr-status"><span className="agentic-resume-spinner" /> Reconnecting…</p>}
            </section>
          ) : null}

          {/* ── A running agent asked something (board_ask) and waits for the answer ── */}
          {pendingQuestions && pendingQuestions.length > 0 && !answerElsewhere && item.agentState?.failure?.kind !== 'needs-answer' && (
            <section className="card-page-question" aria-label="The agent is waiting for your answer">
              <h3 className="card-page-section-title">Waiting for your answer</h3>
              <ul className="card-page-question-list">{pendingQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              <AnswerQuestions artifactId={item.id} />
            </section>
          )}

          {/* ── Why it stopped + fixes, pull request, one activity feed ── */}
          <RunInsights item={item} trace={recentTrace} hideAnswer={answerElsewhere} hideFix={isPersonCard} />

          {/* ── Talk to the agent: steer a run, answer it, or ask for changes ── */}
          {isPersonCard ? (
            <p className="card-page-person-note">{item.assignee!.name} works this card by hand. Move it along the board when it is done.</p>
          ) : (
          <div className="card-page-composer" ref={composerRef}>
            <FollowUpComposer artifactId={item.id} isRunning={isRunning} />
            {(isInterrupted || hasPendingUndo) && (
              <div className="card-page-recover">
                {isInterrupted && (
                  <button
                    className={`agentic-btn agentic-btn--primary${isResuming ? ' is-loading' : ''}`}
                    disabled={isResuming || !chatSessionActive}
                    title={
                      !chatSessionActive
                        ? 'Resume needs an active @agileagentcanvas chat session'
                        : chatSessionModel ? `Resume using ${chatSessionModel}` : 'Resume workflow'
                    }
                    onClick={handleResume}
                  >
                    {isResuming ? '⟳ Reconnecting…' : !chatSessionActive ? 'Resume (no session)' : 'Resume workflow'}
                  </button>
                )}
                {isInterrupted && <button className="agentic-btn agentic-btn--ghost" onClick={handleAbandon}>Abandon</button>}
                {hasPendingUndo && <button className="agentic-btn agentic-btn--ghost" onClick={handleUndoAbandon}>↩ Undo abandon</button>}
              </div>
            )}
          </div>
          )}
        </div>

        <CardSide
          item={item}
          team={team}
          onEditTeam={onEditTeam}
          onOpenCard={onOpenCard}
          stories={stories}
          questions={pendingQuestions?.length ?? 0}
          agentInfo={agentInfo}
          loadingInfo={loadingInfo}
          terminalInteractive={terminalInteractive}
          onViewTerminal={handleViewTerminal}
          onTakeOver={onTakeOver}
        />
      </div>
    </article>
  );
}


const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Many artifacts store the formatted user story as the description too; don't show it twice. */
export function restatesStory(description: string, story: KanbanItem['userStory']): boolean {
  if (!story?.iWant) return false;
  const d = squash(description);
  return d === squash(story.iWant) || d.includes(squash(story.iWant));
}

/** What the card asks for: its description, user story and acceptance criteria. */
function CardBrief({ item }: { item: KanbanItem }) {
  const { description, userStory, acceptanceCriteria } = item;
  if (!description && !userStory && !acceptanceCriteria?.length) {
    return item.isEpic ? null : <p className="card-page-empty">No description yet.</p>;
  }
  return (
    <section className="card-page-brief" aria-label="What this card asks for">
      {userStory && (
        <p className="card-page-story">
          {userStory.asA && <>As <strong>{userStory.asA}</strong>, </>}
          {userStory.iWant && <>I want {userStory.iWant}</>}
          {userStory.soThat && <>, so that {userStory.soThat}</>}.
        </p>
      )}
      {description && !restatesStory(description, userStory) && <p className="card-page-description">{description}</p>}
      {acceptanceCriteria && acceptanceCriteria.length > 0 && (
        <>
          <h3 className="card-page-section-title">Acceptance criteria</h3>
          <ol className="card-page-acs">
            {acceptanceCriteria.map((ac, i) => (
              <li key={ac.id ?? i} className={ac.status ? `card-page-ac card-page-ac--${ac.status}` : 'card-page-ac'}>
                {ac.criterion ?? (
                  <>
                    {ac.given && <><span className="card-page-gwt">Given</span> {ac.given} </>}
                    {ac.when && <><span className="card-page-gwt">when</span> {ac.when} </>}
                    {ac.then && <><span className="card-page-gwt">then</span> {ac.then}</>}
                    {ac.and?.map((x, j) => <span key={j}> <span className="card-page-gwt">and</span> {x}</span>)}
                  </>
                )}
                {ac.status && <span className="card-page-ac-status">{ac.status}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
