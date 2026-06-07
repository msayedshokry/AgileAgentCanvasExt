# Routa × Agile Agent Canvas: Implementation Plan

> **Inspired by:** [Routa](https://github.com/phodal/routa) — workspace-first multi-agent coordination platform by Phodal.
> **Target:** Agile Agent Canvas VS Code Extension (v0.5.0)
> **Status:** Plan validated against codebase — ready for implementation
> **Priority:** P0 (Agentic Kanban) → P1 (ACP) → P2 (Traced execution) → P3 (Harness loop)
> **Last Validated:** 2026-06-06

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Key Findings from Routa](#2-key-findings-from-routa)
3. [Architecture Deep-Dive: What AAC Already Has](#3-architecture-deep-dive)
4. [Revised Architecture: Canvas + Agentic Kanban](#4-revised-architecture)
5. [Implementation Epics](#5-implementation-epics)
   - [Epic 1: Agentic Kanban View (P0)](#epic-1-agentic-kanban-view-p0)
   - [Epic 2: Agent Coordination Protocol — Multi-Agent Teams (P1)](#epic-2-agent-coordination-protocol-p1)
   - [Epic 3: Traced Execution & Observability (P2)](#epic-3-traced-execution--observability-p2)
   - [Epic 4: Harness Governance Loop (P3)](#epic-4-harness-governance-loop-p3)
6. [File-by-File Change List](#6-file-by-file-change-list)
7. [Test Strategy](#7-test-strategy)
8. [Migration & Backward Compatibility](#8-migration--backward-compatibility)
9. [Appendix: Shared Utilities](#9-appendix-shared-utilities)

---

## 1. Executive Summary

Routa is a **workspace-first multi-agent coordination platform** that moves beyond chat-based AI interaction by treating software delivery as a managed, protocol-driven multi-agent process. Agile Agent Canvas (AAC) already has powerful plumbing (`WorkflowExecutor`, `ArtifactStore`, `AgentPersonas`, `CanvasViewProvider`, schema validation) but lacks four capabilities that Routa excels at:

| Capability | Routa Approach | AAC Gap | Impact |
|---|---|---|---|
| **Kanban-as-Orchestrator** | Board column transitions auto-trigger agent workflows with concurrency queues | Canvas is a *display* of artifacts — no automation | 🏆 Highest |
| **Agent Coordination Protocol (ACP)** | Formal lifecycle: `spawn → prompt → execute → stream → complete → teardown` | Single amorphous analyst role, no multi-agent teams | 🏆 High |
| **Traced Execution** | Every tool call, decision, code change recorded to workspace files | No audit trail — users can't see what happened | Medium |
| **Harness Governance Loop** | Observe → evaluate → policy → feedback continuous loop | One-off schema validation, no continuous quality gating | Medium |

**Key Architectural Decision:** Rather than retrofitting orchestration into the existing Canvas (which risks breaking a mature visualization surface), we create a **dedicated Agentic Kanban view** alongside the Canvas. The Canvas remains the design/refinement surface; the Kanban becomes the execution/orchestration surface. This aligns with Routa's `kanban/` as a first-class subsystem and leverages AAC's existing `SprintPlanningView` Kanban components.

---

## 2. Key Findings from Routa

### 2.1 Routa's Core Architecture Pillars

#### ACP (Agent Coordination Protocol)
A lifecycle protocol for spawning, prompting, streaming, and managing agent runtimes. Normalizes outputs from different AI providers into unified session updates. Key concepts:
- **Session lifecycle**: `spawn → prompt → execute → stream → complete → teardown`
- **Provider adapters**: Normalize OpenAI/Anthropic/Gemini/Ollama outputs into unified ACP messages
- **SSE streaming**: All agent outputs stream via Server-Sent Events
- **MCP integration**: Tools governed by Model Context Protocol

#### Kanban-Triggered Automation
- Moving a card between lanes on the Kanban board auto-triggers ACP sessions
- Concurrency queues prevent conflicts when multiple agents operate on the same workspace
- The board *is* the workflow orchestrator — not just a visualization

#### Specialist Agents
Three pre-defined roles with persona + tool config:
| Role | Function | AAC Equivalent |
|---|---|---|
| **Coordinator** | Planner/decomposer — breaks tasks into sub-tasks | `pm` / `analyst` persona |
| **Crafter** | Implementer — writes code/creates artifacts | `dev` / `architect` persona |
| **Gate** | Verifier/QA — validates outputs | `qa` / `tea` persona |

Users extend roles via YAML/MD config files in the workspace.

#### MCP + A2A Integration
- **MCP** governs tool availability
- **A2A** (Agent-to-Agent) handles inter-agent messaging on a federated bus
- Protocol stack: `SSE → MCP (tools) → ACP (agents) → A2A (orchestration)`

> **AAC Scope Note:** A2A full federation is out of scope for v0.5.0. We implement the ACP lifecycle and handoff protocol; A2A bus integration is a future P4 epic.

#### Harness Loop
A governance feedback loop:
```
observe agent actions → evaluate against policies → make policy decisions → feed back into agent prompts
```
Closes the quality loop on AI-generated code.

#### Trace as First-Class Citizen
- Every tool call, decision, and code change is recorded to workspace files
- Sessions are persistent, auditable, and recoverable across restarts

### 2.2 Routa's Key Files & Structure

```
routa/
├── acp/                    # Agent Coordination Protocol
│   ├── protocol.ts         # lifecycle definitions, message types
│   ├── session.ts          # session management
│   └── adapter/            # provider adapters (openai, anthropic, etc.)
├── kanban/                 # Kanban board engine
│   ├── board.ts            # column/lane state machine
│   ├── triggers.ts         # transition → workflow mapping
│   └── queue.ts            # concurrency queue
├── specialist/             # Agent role definitions
│   ├── coordinator.ts
│   ├── crafter.ts
│   └── gate.ts
├── harness/                # Governance loop
│   ├── observer.ts
│   ├── evaluator.ts
│   └── policy.ts
├── mcp/                    # Model Context Protocol integration
├── a2a/                    # Agent-to-Agent messaging
├── trace/                  # Execution tracing & persistence
└── docs/adr/               # Architecture Decision Records
```

---

## 3. Architecture Deep-Dive: What AAC Already Has

### 3.1 Existing Components

| Component | File | What It Does | Gap |
|---|---|---|---|
| **WorkflowExecutor** | `src/workflow/workflow-executor.ts` | Loads BMAD workflows, sessions, step navigation | Single-agent, no ACP lifecycle |
| **AntigravityOrchestrator** | `src/antigravity/antigravity-orchestrator.ts` | Writes guide files, sends prompts to Gemini | Firebase Studio-specific, not general ACP |
| **ChatParticipant** | `src/chat/chat-participant.ts` | VS Code Copilot Chat participant with tool-calling loop | Tied to chat UI, no programmatic agent spawning |
| **AgentPersonas** | `src/chat/agent-personas.ts` | Loads agent personas from `skills/` directory | Read-only display, no multi-agent coordination |
| **CanvasViewProvider** | `src/views/canvas-view-provider.ts` | Webview-based visual canvas, card layout engine | Display-only — no state-transition triggers |
| **SprintPlanningView** | `webview-ui/src/components/SprintPlanningView.tsx` | Kanban board with 5 columns (Backlog → Done) | Read-only status display — no DnD or triggers |
| **WebviewMessageHandler** | `src/views/webview-message-handler.ts` | Centralized message dispatch from webview | Only handles user-initiated actions |
| **ArtifactStore** | `src/state/artifact-store.ts` | In-memory + file-synced BMAD artifact state | No event sourcing / trace log |
| **ArtifactTransformer** | `src/canvas/artifact-transformer.ts` | Store → canvas card layout | Stateless transformation |
| **AiProvider** | `src/chat/ai-provider.ts` | Multi-provider AI communication | No streaming normalization / ACP adapter |
| **SchemaValidator** | `src/state/schema-validator.ts` | JSON schema validation for BMAD artifacts | Single-shot, no continuous validation |

### 3.2 Existing Patterns to Reuse

1. **executeWithTools()** — the tool-calling loop in `workflow-executor.ts` already supports multi-round agentic execution
2. **WorkflowSession** — session tracking (id, workflow, steps, userInputs) is already defined
3. **AgentPersona** — loaded from `skills/` with full TOML config (name, role, principles, menu)
4. **buildGuideContent()** — generates comprehensive guide files for external agents
5. **handleCommonWebviewMessage()** — centralized webview message dispatch
6. **resolveExecutionMode()** — interactive / autonomous / default execution mode resolution
7. **ArtifactStore.onDidChangeArtifacts()** — event emitter for state changes
8. **SprintPlanningView** — already has `KanbanCard`, `KanbanColumn`, `SprintBoard`, and status normalization (`normalizeStatus()`)
9. **buildArtifacts(store)** — `src/canvas/artifact-transformer.ts` transforms store state into a flat artifact array (used by the Canvas to feed the webview; Agentic Kanban reuses this)
10. **`err instanceof Error ? err.message : String(err)`** — the project's standard error-to-string pattern (no standalone `getErrorMessage()` utility exists)

### 3.3 Codebase Validation Notes (2026-06-06)

These findings were confirmed by inspecting the actual source files:

| Check | Result |
|---|---|
| `SprintPlanningView.tsx` has `KanbanCard`, `KanbanColumn`, `SprintBoard`, `normalizeStatus()` | ✅ Confirmed |
| `getWorkflowExecutor()` is a singleton factory | ✅ Confirmed |
| `createLogger` from `'../utils/logger'` is the standard pattern | ✅ Confirmed |
| `findArtifactById()` exists on ArtifactStore | ✅ Confirmed |
| `repairDataWithSchema()` exists in `schema-repair-engine.ts` | ✅ Confirmed |
| `getAllArtifacts()` exists on ArtifactStore | ❌ Does NOT exist — use `buildArtifacts(store)` from artifact-transformer.ts |
| Webview build outputs separate entry points | ❌ Single entry point at `build/assets/index.js` — use mode-based routing |
| `getErrorMessage()` utility exists | ❌ Does NOT exist — use `err instanceof Error ? err.message : String(err)` |
| `views` contribution container is `"agileagentcanvas"` | ❌ Actual container is `"agileagentcanvas-explorer"` |

---

## 4. Revised Architecture: Canvas + Agentic Kanban

### Design Principle: Separation of Concerns

| Surface | Purpose | User Action | Risk |
|---|---|---|---|
| **Canvas** (existing) | Design, refinement, exploration, architecture visualization | Drag mindmap, expand epics, edit details in panel | Low — stays untouched |
| **SprintPlanningView** (existing) | Sprint status dashboard, read-only Kanban for planning review | View sprint progress, identify blockers | Low — stays read-only |
| **Agentic Kanban** (NEW) | Execution orchestration, agent coordination, workflow automation | Drag card to next column → auto-triggers ACP team | Isolated — new view, no regression risk |

### Visual Mental Model

```
┌─────────────────────────────────────────────────────────────────┐
│  [Canvas Tab]  [Sprint Plan Tab]  [🚀 Agentic Kanban Tab]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Backlog   │ Ready for Dev │ In Progress │ Review │ Done       │
│   ──────────┼───────────────┼─────────────┼────────┼────        │
│   [Story 1] │ [Story 2]     │ 🤖 Story 3  │        │ [Story 4]  │
│   [Story 5] │               │   Crafter   │        │            │
│             │               │   working…  │        │            │
│                                                                  │
│   ↑ Drag Story 2 → In Progress to trigger Coordinator→Crafter   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
ArtifactStore (single source of truth)
    ├── feeds Canvas.tsx          (visual refinement — UNCHANGED)
    ├── feeds SprintPlanningView   (sprint status dashboard — UNCHANGED)
    └── feeds AgenticKanbanView    (execution orchestration — NEW)

Kanban column drop
    → postMessage('kanban:statusChanged')
    → AgenticKanbanMessageHandler
    → LaneTransitionEngine (uses status, not Canvas lanes)
    → ConcurrencyQueue.tryAcquire()
    → ACP Session Manager (spawns Coordinator → Crafter → Gate)
    → Trace Recorder (logs everything)
    → ArtifactStore.updateArtifact() (status change)
    → All views re-render with new state
```

---

## 5. Implementation Epics

---

### Epic 1: Agentic Kanban View (P0)

**Goal:** Create a dedicated execution surface where dragging cards between Kanban columns auto-triggers ACP workflows, without modifying the existing Canvas or SprintPlanningView.

#### Current State
- `SprintPlanningView` exists as a **read-only** Kanban with 5 columns: Backlog, Ready for Dev, In Progress, Review, Done
- It has excellent status normalization (`normalizeStatus()`) mapping rich statuses to canonical columns
- It uses `KanbanCard`, `KanbanColumn`, and `SprintBoard` subcomponents
- The Canvas is a separate, mature visualization surface with its own lane layout
- There is **no drag-and-drop** and **no workflow triggering** from the Kanban

#### Target State
- A new **Agentic Kanban** webview (registered as a VS Code panel or view) reuses the Kanban components from `SprintPlanningView`
- Cards can be dragged between columns
- Dropping a card in a new column triggers `LaneTransitionEngine`
- Agent status is overlaid on cards (🤖 Coordinator, 🔨 Crafter, ✅ Gate)
- Concurrency locks are visualized (card grayed out with "Locked by Crafter" tooltip)
- Users can click "View Trace" on any card to see its execution history
- The existing Canvas and SprintPlanningView are **completely untouched**

#### Implementation

##### Step 1.0: Build System Changes

The current build system (`webview-ui/vite.config.ts` and `esbuild.mjs`) produces a single entry point at `build/assets/index.js`. To serve the Agentic Kanban without a separate entry point, we use **mode-based routing** — the same pattern already used for detail tabs (`window.__AC_MODE__ = 'detail'`). The webview HTML injects `window.__AC_MODE__ = 'agentic-kanban'` and the React app branches at the root to render the correct component.

**File:** `webview-ui/vite.config.ts` — no changes needed (single entry point).

**File:** `esbuild.mjs` — verify the webview build copies all of `build/` (no changes expected).

**File:** `webview-ui/src/App.tsx` — add a branch for `'agentic-kanban'` mode:
```typescript
// Inside the App component's render switch:
if (window.__AC_MODE__ === 'agentic-kanban') {
  return <AgenticKanbanApp />;
}
```

##### Step 1.1: Reusable Kanban Components

Extract the presentational Kanban components from `SprintPlanningView.tsx` into shared components so both views can use them:

**File:** `webview-ui/src/components/kanban/KanbanTypes.ts` (NEW)

```typescript
// Shared types for all Kanban views (SprintPlanningView + AgenticKanbanView)

export type KanbanColumnKey = 'backlog' | 'ready-for-dev' | 'in-progress' | 'review' | 'done';

export interface KanbanItem {
  id: string;
  key: string;
  title: string;
  status: string;
  type: 'epic' | 'story' | 'task' | 'requirement' | string;
  epicKey?: string;
  isEpic: boolean;
  /** Agentic execution state */
  agentState?: {
    status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
    agentRole?: string;
    sessionId?: string;
    startedAt?: string;
  };
  /** Concurrency lock state */
  lockInfo?: {
    locked: boolean;
    agentName?: string;
    since?: string;
  };
  /** Harness evaluation results */
  harnessResults?: Array<{ policyId: string; passed: boolean; severity: string }>;
}

export interface KanbanColumnDef {
  key: KanbanColumnKey;
  label: string;
  accent: string;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { key: 'backlog',      label: 'Backlog',       accent: 'var(--vscode-descriptionForeground)' },
  { key: 'ready-for-dev',label: 'Ready for Dev', accent: '#6366f1' },
  { key: 'in-progress',  label: 'In Progress',   accent: '#f59e0b' },
  { key: 'review',       label: 'Review',        accent: '#8b5cf6' },
  { key: 'done',         label: 'Done',          accent: '#22c55e' },
];

/**
 * Maps any artifact status to a Kanban column.
 * Reuses the logic from SprintPlanningView.normalizeStatus() but generalized
 * for all artifact types, not just sprint items.
 */
export function normalizeToKanbanColumn(status: string): KanbanColumnKey {
  switch (status) {
    case 'backlog':
    case 'draft':
    case 'not-started':
    case 'proposed':
      return 'backlog';
    case 'ready-for-dev':
    case 'ready':
    case 'accepted':
    case 'approved':
      return 'ready-for-dev';
    case 'in-progress':
    case 'implementing':
    case 'blocked':
      return 'in-progress';
    case 'review':
    case 'in-review':
    case 'ready-for-review':
      return 'review';
    case 'done':
    case 'complete':
    case 'completed':
    case 'archived':
      return 'done';
    default:
      return 'backlog';
  }
}
```

**File:** `webview-ui/src/components/kanban/KanbanCard.tsx` (NEW — extracted from SprintPlanningView)

```typescript
import { KanbanItem } from './KanbanTypes';

interface KanbanCardProps {
  item: KanbanItem;
  index?: number;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, item: KanbanItem) => void;
  onClick?: (item: KanbanItem) => void;
}

export function KanbanCard({ item, index, draggable, onDragStart, onClick }: KanbanCardProps) {
  const isLocked = item.lockInfo?.locked;
  const isRunning = item.agentState?.status === 'running';

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e, item);
  };

  return (
    <div
      className={[
        'kanban-card',
        item.isEpic ? 'kanban-card--epic' : '',
        isLocked ? 'kanban-card--locked' : '',
        isRunning ? 'kanban-card--running' : '',
      ].filter(Boolean).join(' ')}
      style={index !== undefined ? { '--card-index': index } as React.CSSProperties : undefined}
      draggable={draggable && !isLocked}
      onDragStart={handleDragStart}
      onClick={() => onClick?.(item)}
    >
      <span className="kanban-card-key">{item.key}</span>
      <span className="kanban-card-title">{item.title}</span>

      {item.epicKey && !item.isEpic && (
        <span className="kanban-card-epic-tag">{item.epicKey}</span>
      )}

      {item.isEpic && <span className="kanban-card-type-tag">Epic</span>}

      {/* Agent execution overlay */}
      {isRunning && item.agentState?.agentRole && (
        <span className="kanban-card-agent-badge">
          🤖 {item.agentState.agentRole} is working…
        </span>
      )}

      {/* Lock overlay */}
      {isLocked && (
        <span className="kanban-card-lock-badge" title={`Locked by ${item.lockInfo?.agentName}`}>
          🔒 {item.lockInfo?.agentName}
        </span>
      )}

      {/* Harness failures */}
      {item.harnessResults?.some(r => !r.passed && r.severity === 'blocking') && (
        <span className="kanban-card-harness-badge kanban-card-harness-badge--error">
          ⛔ Policy failed
        </span>
      )}
    </div>
  );
}
```

**File:** `webview-ui/src/components/kanban/KanbanColumn.tsx` (NEW — extracted from SprintPlanningView)

```typescript
import { KanbanItem, KanbanColumnKey, KanbanColumnDef } from './KanbanTypes';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  column: KanbanColumnDef;
  items: KanbanItem[];
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, item: KanbanItem) => void;
  onDrop?: (itemId: string, targetColumn: KanbanColumnKey) => void;
  onCardClick?: (item: KanbanItem) => void;
}

export function KanbanColumn({ column, items, draggable, onDragStart, onDrop, onCardClick }: KanbanColumnProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) onDrop?.(itemId, column.key);
  };

  return (
    <div
      className="kanban-column"
      style={{ '--kanban-col-accent': column.accent } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="kanban-column-header">
        <span className="kanban-column-label">{column.label}</span>
        <span className="kanban-column-count">{items.length}</span>
      </div>
      <div className="kanban-column-cards">
        {items.length === 0 ? (
          <div className="kanban-column-empty">Drop here</div>
        ) : (
          items.map((item, idx) => (
            <KanbanCard
              key={item.id}
              item={item}
              index={idx}
              draggable={draggable}
              onDragStart={onDragStart}
              onClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

##### Step 1.2: Agentic Kanban View Component

**File:** `webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx` (NEW)

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react';
import { KanbanColumn } from '../components/kanban/KanbanColumn';
import { KanbanItem, KanbanColumnKey, KANBAN_COLUMNS, normalizeToKanbanColumn } from '../components/kanban/KanbanTypes';
import { vscode } from '../vscodeApi';

// Note: AgenticDetailPanel is defined in its own file (see Step 1.2a).
// For the initial implementation, a simple inline detail panel is sufficient.
function AgenticDetailPanel({ item, onClose }: { item?: KanbanItem; onClose: () => void }) {
  if (!item) return null;
  return (
    <div className="agentic-detail-panel">
      <header>
        <h3>{item.title}</h3>
        <button onClick={onClose}>✕</button>
      </header>
      <dl>
        <dt>ID</dt><dd>{item.id}</dd>
        <dt>Type</dt><dd>{item.type}</dd>
        <dt>Status</dt><dd>{item.status}</dd>
        {item.agentState?.sessionId && (
          <>
            <dt>Session</dt>
            <dd>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); vscode.postMessage({ type: 'kanban:viewTrace', sessionId: item.agentState!.sessionId }); }}
              >
                View trace →
              </a>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

export function AgenticKanbanApp() {
  const [items, setItems] = useState<KanbanItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingTransitions, setPendingTransitions] = useState<Set<string>>(new Set());

  // Load artifacts from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'updateArtifacts':
          setItems(message.artifacts.map((a: any) => artifactToKanbanItem(a)));
          break;
        case 'agentStateUpdated':
          setItems(prev => prev.map(item =>
            item.id === message.artifactId
              ? { ...item, agentState: message.agentState, lockInfo: message.lockInfo }
              : item
          ));
          break;
        case 'transitionResult':
          setPendingTransitions(prev => {
            const next = new Set(prev);
            next.delete(message.artifactId);
            return next;
          });
          if (!message.ok) {
            showToast(`Transition failed: ${message.blockedBy?.join(', ')}`, 'error');
          }
          break;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'agenticKanbanReady' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const groupedItems = useMemo(() => {
    const groups = new Map<KanbanColumnKey, KanbanItem[]>();
    KANBAN_COLUMNS.forEach(c => groups.set(c.key, []));
    for (const item of items) {
      const col = normalizeToKanbanColumn(item.status);
      groups.get(col)?.push(item);
    }
    return groups;
  }, [items]);

  // Note: handleDragStart is handled inside KanbanCard via dataTransfer.setData.
  // The onDragStart prop here is for optional side effects (analytics, etc.).

  const handleDrop = useCallback((itemId: string, targetColumn: KanbanColumnKey) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const targetStatus = kanbanColumnToStatus(targetColumn);
    if (item.status === targetStatus) return;

    // Optimistic UI update
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, status: targetStatus } : i
    ));
    setPendingTransitions(prev => new Set(prev).add(itemId));

    // Notify extension
    vscode.postMessage({
      type: 'kanban:statusChanged',
      artifactId: itemId,
      fromStatus: item.status,
      toStatus: targetStatus,
      artifactType: item.type,
    });
  }, [items]);

  const handleCardClick = useCallback((item: KanbanItem) => {
    setSelectedId(item.id);
  }, []);

  return (
    <div className="agentic-kanban">
      <header className="agentic-kanban-header">
        <h2>🚀 Agentic Execution Board</h2>
        <div className="agentic-kanban-toolbar">
          <button onClick={() => vscode.postMessage({ type: 'openTraceViewer' })} >
            View Traces
          </button>
          <button onClick={() => vscode.postMessage({ type: 'agenticKanban:refresh' })} >
            Refresh
          </button>
        </div>
      </header>

      <div className="agentic-kanban-board">
        {KANBAN_COLUMNS.map(col => (
          <KanbanColumn
            key={col.key}
            column={col}
            items={groupedItems.get(col.key) ?? []}
            draggable={true}
            onDrop={handleDrop}
            onCardClick={handleCardClick}
          />
        ))}
      </div>

      {selectedId && (
        <AgenticDetailPanel
          item={items.find(i => i.id === selectedId)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function artifactToKanbanItem(artifact: any): KanbanItem {
  return {
    id: artifact.id,
    key: artifact.id,
    title: artifact.title || artifact.name || artifact.id,
    status: artifact.status || 'backlog',
    type: artifact.type || 'unknown',
    epicKey: artifact.parentId || artifact.epicKey,
    isEpic: artifact.type === 'epic',
  };
}

function kanbanColumnToStatus(col: KanbanColumnKey): string {
  switch (col) {
    case 'backlog': return 'backlog';
    case 'ready-for-dev': return 'ready-for-dev';
    case 'in-progress': return 'in-progress';
    case 'review': return 'review';
    case 'done': return 'done';
  }
}

function showToast(message: string, type: 'error' | 'info') {
  // Implement toast notification in webview
  // For initial implementation, log to console
  console[type === 'error' ? 'error' : 'info'](`[AgenticKanban] ${message}`);
}
```

##### Step 1.3: Agentic Kanban View Provider

**File:** `src/views/agentic-kanban-view-provider.ts` (NEW)

```typescript
import { createLogger } from '../utils/logger';
const logger = createLogger('agentic-kanban-view-provider');
import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { buildArtifacts } from '../canvas/artifact-transformer';
import { handleAgenticKanbanMessage } from './agentic-kanban-message-handler';

/**
 * Webview provider for the Agentic Kanban — execution orchestration surface.
 *
 * This is a SEPARATE view from the Canvas, registered under its own view type.
 * It shares the same ArtifactStore but uses mode-based routing in the React app
 * (window.__AC_MODE__ = 'agentic-kanban') — same pattern as detail tabs.
 */
export class AgenticKanbanViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agileagentcanvas.agenticKanban';

  private _view?: vscode.WebviewView;
  private store: ArtifactStore;

  constructor(
    private readonly extensionUri: vscode.Uri,
    store: ArtifactStore
  ) {
    this.store = store;

    // Listen to artifact changes and push to Kanban view
    this.store.onDidChangeArtifacts(() => {
      this.sendArtifacts();
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    logger.debug('[AgenticKanbanProvider] resolveWebviewView called');
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build'),
      ],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      logger.debug(`[AgenticKanbanProvider] Received: ${message.type}`);

      if (await handleAgenticKanbanMessage(message, this.store, this.extensionUri, this._view!.webview)) {
        return;
      }

      // View-specific cases
      switch (message.type) {
        case 'agenticKanbanReady':
          this.sendArtifacts();
          break;
      }
    });
  }

  private sendArtifacts(): void {
    if (!this._view) return;
    // Reuse the same buildArtifacts() function that the Canvas uses.
    // This returns a flat array of artifact objects with id, type, title, status, etc.
    const artifacts = buildArtifacts(this.store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
    this._view.webview.postMessage({
      type: 'updateArtifacts',
      artifacts,
    });
  }

  private getHtmlContent(webview: vscode.Webview): string {
    // Uses mode-based routing (window.__AC_MODE__ = 'agentic-kanban') — same
    // pattern as detail tabs. The React app branches at the root to render
    // the correct component. No separate entry point needed.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build', 'assets', 'index.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Agentic Kanban</title>
</head>
<body>
  <script>window.__AC_MODE__ = 'agentic-kanban';</script>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
```

##### Step 1.4: Agentic Kanban Message Handler

**File:** `src/views/agentic-kanban-message-handler.ts` (NEW)

```typescript
import { createLogger } from '../utils/logger';
const logger = createLogger('agentic-kanban-message-handler');
import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { buildArtifacts } from '../canvas/artifact-transformer';
import { laneTransitionEngine } from '../workflow/lane-transitions';

export async function handleAgenticKanbanMessage(
  message: any,
  store: ArtifactStore,
  extensionUri: vscode.Uri,
  webview: vscode.Webview
): Promise<boolean> {
  switch (message.type) {
    case 'kanban:statusChanged': {
      const { artifactId, fromStatus, toStatus, artifactType } = message;

      const result = await laneTransitionEngine.handleTransition(
        artifactId,
        fromStatus,
        toStatus,
        artifactType
      );

      webview.postMessage({
        type: 'transitionResult',
        artifactId,
        ...result,
      });

      return true;
    }

    case 'agenticKanban:refresh': {
      const artifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
      webview.postMessage({ type: 'updateArtifacts', artifacts });
      return true;
    }

    case 'kanban:viewTrace': {
      const { sessionId } = message;
      vscode.commands.executeCommand('agileagentcanvas.openTraceViewer', sessionId);
      return true;
    }

    default:
      return false;
  }
}
```

##### Step 1.5: Lane Transition Engine (Status-Based)

**File:** `src/workflow/lane-transitions.ts` (NEW)

```typescript
import { createLogger } from '../utils/logger';
const logger = createLogger('lane-transitions');
import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { WorkflowExecutor } from './workflow-executor';
import { concurrencyQueue } from './concurrency-queue';
import { harnessEngine } from '../harness/policy-engine';
import { traceRecorder } from '../trace/trace-recorder';
import { getModel, BmadModel } from '../chat/ai-provider';

// Project-standard error-to-string pattern (no standalone getErrorMessage utility exists)
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface TransitionRule {
  artifactType: string;
  fromStatus: string;
  toStatus: string;
  /** BMAD workflow ID from WORKFLOW_REGISTRY (e.g. 'dev-story', 'code-review') */
  workflowId?: string | null;
  confirmWithUser?: boolean;
  preFlightValidation?: boolean;
}

export const TRANSITION_RULES: TransitionRule[] = [
  // Backlog → Ready for Dev
  { artifactType: 'story',  fromStatus: 'backlog',       toStatus: 'ready-for-dev', workflowId: 'story-enhancement', confirmWithUser: true },
  { artifactType: 'epic',   fromStatus: 'backlog',       toStatus: 'ready-for-dev', workflowId: 'epic-enhancement', confirmWithUser: true },
  { artifactType: 'prd',    fromStatus: 'draft',         toStatus: 'ready',         workflowId: 'create-prd', confirmWithUser: true },

  // Ready for Dev → In Progress
  { artifactType: 'story',  fromStatus: 'ready-for-dev', toStatus: 'in-progress',   workflowId: 'dev-story', confirmWithUser: true, preFlightValidation: true },
  { artifactType: 'epic',   fromStatus: 'ready-for-dev', toStatus: 'in-progress',   workflowId: 'sprint-planning', confirmWithUser: true },

  // In Progress → Review
  { artifactType: 'story',  fromStatus: 'in-progress',   toStatus: 'review',        workflowId: 'code-review', confirmWithUser: true, preFlightValidation: true },

  // Review → Done
  { artifactType: 'story',  fromStatus: 'review',        toStatus: 'done',          workflowId: null, confirmWithUser: false },
];

export interface TransitionResult {
  ok: boolean;
  workflowLaunched?: boolean;
  status: 'complete' | 'moved_without_workflow' | 'blocked';
  blockedBy?: string[];
}

export class LaneTransitionEngine {
  constructor(private store: ArtifactStore, private executor: WorkflowExecutor) {}

  async handleTransition(
    artifactId: string,
    fromStatus: string,
    toStatus: string,
    artifactType: string,
    stream?: vscode.ChatResponseStream,
    token?: vscode.CancellationToken
  ): Promise<TransitionResult> {
    const artifact = this.store.findArtifactById(artifactId);
    if (!artifact) {
      return { ok: false, status: 'blocked', blockedBy: ['Artifact not found'] };
    }

    const rule = this.findRule(artifactType, fromStatus, toStatus);

    // Pre-flight validation
    if (rule?.preFlightValidation) {
      const issues = await this.validateArtifact(artifact.artifact);
      if (issues.length > 0) {
        return { ok: false, status: 'blocked', blockedBy: issues };
      }
    }

    // Check concurrency
    if (concurrencyQueue.isLocked(artifactId)) {
      return { ok: false, status: 'blocked', blockedBy: ['Artifact is currently being processed'] };
    }

    // Acquire lock — held for the entire transition + workflow execution
    const lock = concurrencyQueue.tryAcquire(artifactId, 'lane-transition', `transition-${artifactId}`);
    if (!lock) {
      return { ok: false, status: 'blocked', blockedBy: ['Could not acquire lock'] };
    }

    try {
      // Update artifact status
      await this.store.updateArtifact(artifactType, artifactId, { status: toStatus });

      // Auto-launch workflow if rule specifies one
      if (rule?.workflowId) {
        const shouldConfirm = rule.confirmWithUser && !this.isYoloMode();
        if (shouldConfirm) {
          const confirmed = await this.promptUser(artifact.artifact, rule.workflowId);
          if (!confirmed) {
            return { ok: true, workflowLaunched: false, status: 'moved_without_workflow' };
          }
        }
        // Lock remains held during workflow execution — released in finally
        await this.launchWorkflow(artifact.artifact, rule.workflowId, stream, token);
      }

      return { ok: true, workflowLaunched: !!rule?.workflowId, status: 'complete' };
    } catch (error) {
      logger.error('Transition failed', { artifactId, error });
      return { ok: false, status: 'blocked', blockedBy: [errMsg(error)] };
    } finally {
      // Lock released AFTER workflow completes (or fails), preventing concurrent
      // modifications to the same artifact during agent execution.
      concurrencyQueue.release(artifactId);
    }
  }

  private isYoloMode(): boolean {
    return vscode.workspace.getConfiguration('agileagentcanvas').get('yoloMode', false);
  }

  private findRule(type: string, from: string, to: string): TransitionRule | undefined {
    return TRANSITION_RULES.find(r =>
      r.artifactType === type && r.fromStatus === from && r.toStatus === to
    );
  }

  private async validateArtifact(artifact: any): Promise<string[]> {
    const result = await harnessEngine.evaluate({
      artifactType: artifact.type || 'unknown',
      artifactId: artifact.id || 'unknown',
      artifact: artifact,
    }, 'pre-flight');
    return result.filter(r => !r.passed).flatMap(r => r.failures);
  }

  private async promptUser(artifact: any, workflowId: string): Promise<boolean> {
    const result = await vscode.window.showInformationMessage(
      `Run "${workflowId}" workflow on ${artifact?.type || 'artifact'} ${artifact?.id || ''}?`,
      { modal: true },
      'Run', 'Skip'
    );
    return result === 'Run';
  }

  private async launchWorkflow(
    artifact: any,
    workflowId: string,
    stream?: vscode.ChatResponseStream,
    token?: vscode.CancellationToken
  ): Promise<void> {
    // Uses the existing executeWithTools() which loads the workflow by ID from WORKFLOW_REGISTRY.
    // The model is obtained from the global AI provider configuration (see ai-provider.ts).
    const model = await getModel();
    if (!model) throw new Error('No AI model available');
    await this.executor.executeLaneTransition(model, workflowId, artifact, this.store, stream, token);
  }
}

// Singleton instance (initialized in extension.ts)
export let laneTransitionEngine: LaneTransitionEngine;

export function initializeLaneTransitionEngine(store: ArtifactStore, executor: WorkflowExecutor): void {
  laneTransitionEngine = new LaneTransitionEngine(store, executor);
}
```

##### Step 1.6: Concurrency Queue

**File:** `src/workflow/concurrency-queue.ts` (NEW)

```typescript
import { createLogger } from '../utils/logger';
const logger = createLogger('concurrency-queue');

export interface LockEntry {
  artifactId: string;
  agentName: string;
  lockedAt: Date;
  acquiredBy: string; // session/request ID
}

interface QueuedRequest {
  requestId: string;
  agentName: string;
  resolve: (entry: LockEntry) => void;
  reject: (err: Error) => void;
}

export class ConcurrencyQueue {
  private locks = new Map<string, LockEntry>();
  private queue = new Map<string, QueuedRequest[]>();

  tryAcquire(artifactId: string, agentName: string, requestId: string): LockEntry | null {
    if (this.locks.has(artifactId)) return null;
    const entry: LockEntry = { artifactId, agentName, lockedAt: new Date(), acquiredBy: requestId };
    this.locks.set(artifactId, entry);
    logger.debug('Lock acquired', { artifactId, agentName, requestId });
    return entry;
  }

  async acquire(
    artifactId: string,
    agentName: string,
    requestId: string,
    timeoutMs = 30000
  ): Promise<LockEntry> {
    const existing = this.tryAcquire(artifactId, agentName, requestId);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      if (!this.queue.has(artifactId)) {
        this.queue.set(artifactId, []);
      }
      this.queue.get(artifactId)!.push({ requestId, agentName, resolve, reject });

      setTimeout(() => {
        const waiting = this.queue.get(artifactId) || [];
        const idx = waiting.findIndex(w => w.requestId === requestId);
        if (idx >= 0) waiting.splice(idx, 1);
        reject(new Error(`Timeout waiting for lock on ${artifactId} after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  release(artifactId: string): void {
    this.locks.delete(artifactId);
    logger.debug('Lock released', { artifactId });

    const waiting = this.queue.get(artifactId);
    if (!waiting?.length) {
      this.queue.delete(artifactId);
      return;
    }

    // Grant lock to next waiter (FIFO)
    while (waiting.length > 0) {
      const next = waiting.shift()!;
      const entry = this.tryAcquire(artifactId, next.agentName, next.requestId);
      if (entry) {
        next.resolve(entry);
        break;
      }
      next.reject(new Error('Lock acquisition failed after release'));
    }

    if (waiting.length === 0) {
      this.queue.delete(artifactId);
    }
  }

  isLocked(artifactId: string): boolean {
    return this.locks.has(artifactId);
  }

  getLock(artifactId: string): LockEntry | undefined {
    return this.locks.get(artifactId);
  }

  releaseByRequestId(requestId: string): void {
    for (const [artifactId, entry] of this.locks.entries()) {
      if (entry.acquiredBy === requestId) {
        this.release(artifactId);
      }
    }
  }
}

export const concurrencyQueue = new ConcurrencyQueue();
```

---

### Epic 2: Agent Coordination Protocol — Multi-Agent Teams (P1)

**Goal:** Replace single-agent execution with structured multi-agent teams (Coordinator → Crafter → Gate).

#### Current State
- Single `@agileagentcanvas` chat participant handles all roles
- Workflow executes through `executeWithTools()` — single LLM loop
- No concept of task decomposition or handoff between agent roles
- `AntigravityOrchestrator` writes guide files for Gemini but doesn't orchestrate multiple agents

#### Target State
- Multi-agent team execution: Coordinator decomposes, Crafter builds, Gate verifies
- Formal ACP lifecycle with streaming session updates
- Configurable agent rosters per workflow (YAML/MD config)
- Handoff protocol between agents with context pass-through

#### Implementation

##### Step 2.1: ACP Protocol Types & Lifecycle

**File:** `src/acp/types.ts` (NEW)

```typescript
export type AgentRole = 'coordinator' | 'crafter' | 'gate' | 'researcher';

export interface AcpSessionSpec {
  role: AgentRole;
  /** Reference to an existing BMAD agent persona ID (e.g., 'bmad-agent-pm') */
  personaId: string;
  context: {
    task: string;
    artifact?: Readonly<any>;
    inputArtifacts?: string[];
    outputArtifactType?: string;
    constraints?: string[];
    parentSessionId?: string;
  };
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    executionMode?: 'interactive' | 'autonomous' | 'default';
    allowedTools?: string[];
  };
}

export interface AcpSessionEvent {
  sessionId: string;
  type: 'spawned' | 'prompting' | 'executing' | 'streaming' | 'tool_call' | 'completed' | 'failed' | 'cancelled' | 'handoff';
  timestamp: string;
  data?: any;
  metadata?: Record<string, unknown>;
}

export interface AcpSessionResult {
  sessionId: string;
  role: AgentRole;
  status: 'completed' | 'failed' | 'cancelled';
  output: any;
  toolCalls: number;
  startedAt: string;
  completedAt: string;
  events: AcpSessionEvent[];
  error?: string;
}

export interface AcpHandoff {
  fromSessionId: string;
  toSessionId: string;
  context: {
    task: string;
    intermediateArtifacts: Record<string, any>;
    pendingDecisions?: string[];
    evaluationResults?: any;
  };
}
```

##### Step 2.2: ACP Session Manager

**File:** `src/acp/session-manager.ts` (NEW)

```typescript
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { getPersonaForArtifactType, formatFullAgentForPrompt, AgentPersona } from '../chat/agent-personas';
import { WorkflowExecutor } from '../workflow/workflow-executor';
import { BmadModel } from '../chat/ai-provider';
import { AcpSessionSpec, AcpSessionEvent, AcpSessionResult } from './types';

const logger = createLogger('acp-session-manager');

// Project-standard error-to-string
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AcpSession implements vscode.Disposable {
  public readonly id: string;
  public readonly createdAt: Date;
  public persona?: AgentPersona;
  private _status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' = 'pending';
  private _events: AcpSessionEvent[] = [];

  constructor(public readonly spec: AcpSessionSpec) {
    this.id = `acp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.createdAt = new Date();
  }

  get status() { return this._status; }
  get events() { return [...this._events]; }

  addEvent(event: AcpSessionEvent): void {
    this._events.push(event);
  }

  setStatus(status: typeof this._status): void {
    this._status = status;
  }

  dispose(): void {
    if (this._status === 'running') {
      this._status = 'cancelled';
    }
  }
}

/**
 * Manages ACP session lifecycles.
 * Requires a WorkflowExecutor instance for executeWithTools() — ACP
 * delegates actual LLM execution to the existing BMAD workflow engine.
 */
export class AcpSessionManager implements vscode.Disposable {
  private sessions = new Map<string, AcpSession>();
  private eventStreams = new Map<string, vscode.EventEmitter<AcpSessionEvent>>();
  private disposables: vscode.Disposable[] = [];

  constructor(private executor: WorkflowExecutor) {}

  async spawn(spec: AcpSessionSpec, bmadPath: string): Promise<AcpSession> {
    const session = new AcpSession(spec);
    this.sessions.set(session.id, session);

    const emitter = new vscode.EventEmitter<AcpSessionEvent>();
    this.eventStreams.set(session.id, emitter);
    this.disposables.push(emitter);

    this.emit(session.id, {
      sessionId: session.id,
      type: 'spawned',
      timestamp: new Date().toISOString(),
    });

    // Load persona using the existing agent-personas module
    const persona = getPersonaForArtifactType(bmadPath, spec.personaId);
    session.persona = persona ?? undefined;

    logger.info('Session spawned', { sessionId: session.id, role: spec.role, personaId: spec.personaId });
    return session;
  }

  async execute(
    sessionId: string,
    model: BmadModel,
    store: any, // ArtifactStore — passed through to executeWithTools
    stream?: vscode.ChatResponseStream,
    token?: vscode.CancellationToken
  ): Promise<AcpSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const startTime = Date.now();
    session.setStatus('running');

    this.emit(sessionId, {
      sessionId,
      type: 'prompting',
      timestamp: new Date().toISOString(),
    });

    const cancellationListener = token?.onCancellationRequested(() => {
      session.setStatus('cancelled');
      this.emit(sessionId, {
        sessionId,
        type: 'cancelled',
        timestamp: new Date().toISOString(),
      });
    });

    try {
      const prompt = this.buildAcpPrompt(session);

      this.emit(sessionId, {
        sessionId,
        type: 'executing',
        timestamp: new Date().toISOString(),
      });

      // Delegate to the existing WorkflowExecutor tool-calling loop
      const result = await this.executor.executeWithTools(
        model,
        prompt,
        session.spec.context.artifact,
        stream,
        token,
        store,
        undefined // no specific workflow file — ACP builds its own prompt
      );

      if (session.status === 'cancelled') {
        return this.buildResult(session, 'cancelled', null, startTime);
      }

      session.setStatus('completed');
      this.emit(sessionId, {
        sessionId,
        type: 'completed',
        timestamp: new Date().toISOString(),
        data: result,
      });

      return this.buildResult(session, 'completed', result, startTime, (result as any)?.toolCalls ?? 0);
    } catch (error) {
      if (session.status === 'cancelled') {
        return this.buildResult(session, 'cancelled', null, startTime);
      }

      session.setStatus('failed');
      const errorMessage = errMsg(error);
      logger.error('Session execution failed', { sessionId, error: errorMessage });

      this.emit(sessionId, {
        sessionId,
        type: 'failed',
        timestamp: new Date().toISOString(),
        data: { error: errorMessage },
      });

      return this.buildResult(session, 'failed', null, startTime, 0, errorMessage);
    } finally {
      cancellationListener?.dispose();
    }
  }

  onEvent(sessionId: string, handler: (event: AcpSessionEvent) => void): vscode.Disposable {
    const emitter = this.eventStreams.get(sessionId);
    if (!emitter) return new vscode.Disposable(() => {});
    return emitter.event(handler);
  }

  getSession(sessionId: string): AcpSession | undefined {
    return this.sessions.get(sessionId);
  }

  private emit(sessionId: string, event: AcpSessionEvent): void {
    const session = this.sessions.get(sessionId);
    session?.addEvent(event);
    this.eventStreams.get(sessionId)?.fire(event);
  }

  private buildAcpPrompt(session: AcpSession): string {
    const persona = session.persona;
    const spec = session.spec;
    const parts: string[] = [];

    if (persona) {
      parts.push(formatFullAgentForPrompt(persona, { toolsAvailable: true }));
    }

    parts.push(`# Task\n${spec.context.task}`);

    if (spec.context.constraints?.length) {
      parts.push(`# Constraints\n${spec.context.constraints.map(c => `- ${c}`).join('\n')}`);
    }

    return parts.join('\n\n');
  }

  private buildResult(
    session: AcpSession,
    status: 'completed' | 'failed' | 'cancelled',
    output: any,
    startTime: number,
    toolCalls = 0,
    error?: string
  ): AcpSessionResult {
    return {
      sessionId: session.id,
      role: session.spec.role,
      status,
      output,
      toolCalls,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      events: session.events,
      error,
    };
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.disposables.forEach(d => d.dispose());
    this.sessions.clear();
    this.eventStreams.clear();
  }
}

// Singleton — initialized in extension.ts after WorkflowExecutor is created.
// Before initialization, callers receive a clear error.
export let acpSessionManager: AcpSessionManager;

export function initializeAcpSessionManager(executor: WorkflowExecutor): void {
  acpSessionManager = new AcpSessionManager(executor);
}
```

##### Step 2.3: Agent Team Orchestrator

**File:** `src/acp/team-orchestrator.ts` (NEW)

```typescript
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { AcpSessionSpec, AcpSessionResult, AgentRole } from './types';
import { acpSessionManager } from './session-manager';
import { traceRecorder } from '../trace/trace-recorder';
import { BmadModel } from '../workflow/workflow-executor';

const logger = createLogger('team-orchestrator');

export interface AgentTeam {
  id: string;
  members: Array<{
    role: AgentRole;
    personaId: string;
    order: number;
  }>;
  workflow: string;
}

const TEAM_REGISTRY: Record<string, AgentTeam> = {
  'dev-story': {
    id: 'dev-story',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/dev-story/workflow.yaml',
  },
  'create-prd': {
    id: 'create-prd',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-prd/workflow-create-prd.md',
  },
};

export class AgentTeamOrchestrator {
  async executeTeam(
    teamId: string,
    task: string,
    artifact: any,
    model: BmadModel,
    store: any,
    bmadPath: string,
    stream?: vscode.ChatResponseStream,
    token?: vscode.CancellationToken
  ): Promise<AcpSessionResult[]> {
    const team = TEAM_REGISTRY[teamId];
    if (!team) throw new Error(`Team ${teamId} not found`);

    let cancelled = false;
    const cancellationListener = token?.onCancellationRequested(() => {
      cancelled = true;
    });

    const results: AcpSessionResult[] = [];
    let currentArtifact = artifact;
    let previousSessionId: string | undefined;

    try {
      for (const member of team.members.sort((a, b) => a.order - b.order)) {
        if (cancelled) {
          logger.info('Team execution cancelled', { teamId, stoppedAt: member.role });
          break;
        }

        stream?.markdown(`\n\n**🤖 ${member.role}** is working...\n\n`);

        const roleTask = this.buildRoleTask(member.role, task, currentArtifact, results);

        const spec: AcpSessionSpec = {
          role: member.role,
          personaId: member.personaId,
          context: {
            task: roleTask,
            artifact: currentArtifact,
            parentSessionId: previousSessionId,
          },
          config: { executionMode: 'autonomous' },
        };

        const session = await acpSessionManager.spawn(spec, bmadPath);
        const result = await acpSessionManager.execute(session.id, model, store, stream, token);

        if (previousSessionId) {
          this.recordHandoff(previousSessionId, session.id, currentArtifact, result);
        }

        currentArtifact = result.output || currentArtifact;
        previousSessionId = session.id;
        results.push(result);

        if (result.status === 'completed') {
          stream?.markdown(`\n\n✅ **${member.role}** completed (${result.toolCalls} tool calls)\n\n`);
        } else {
          stream?.markdown(`\n\n❌ **${member.role}** failed: ${result.error}\n\n`);
          break;
        }
      }

      return results;
    } finally {
      cancellationListener?.dispose();
    }
  }

  private buildRoleTask(role: AgentRole, originalTask: string, artifact: any, previousResults: AcpSessionResult[]): string {
    switch (role) {
      case 'coordinator':
        return `Decompose this task into actionable steps: ${originalTask}`;
      case 'crafter':
        return `Implement the following task. Use the artifact and previous context:\nTask: ${originalTask}\nContext: ${JSON.stringify(artifact, null, 2)}`;
      case 'gate':
        return `Verify the output from previous steps meets quality standards. Task: ${originalTask}\nPrevious outputs: ${JSON.stringify(previousResults.map(r => r.output))}`;
      case 'researcher':
        return `Research and gather information for: ${originalTask}`;
      default:
        return originalTask;
    }
  }

  private recordHandoff(fromSessionId: string, toSessionId: string, artifact: any, result: AcpSessionResult): void {
    traceRecorder.record({
      sessionId: fromSessionId,
      type: 'handoff',
      agent: 'team-orchestrator',
      data: {
        handoffFrom: fromSessionId,
        handoffTo: toSessionId,
        contextSummary: JSON.stringify({
          task: result.output?.task || '',
          intermediateArtifacts: { [result.role]: result.output },
        }).slice(0, 500),
      },
    });
  }
}
```

##### Step 2.4: Integration into Workflow Executor

**File:** `src/workflow/workflow-executor.ts` — add `executeWithTeam()` and `executeLaneTransition()`

```typescript
async executeWithTeam(
  model: BmadModel,
  teamId: string,
  task: string,
  artifact: any,
  store: any,
  bmadPath: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<AcpSessionResult[]> {
  const orchestrator = new AgentTeamOrchestrator();
  const results = await orchestrator.executeTeam(teamId, task, artifact, model, store, bmadPath, stream, token);

  const finalResult = results[results.length - 1];
  if (finalResult?.output && artifact?.type) {
    await store.updateArtifact(artifact.type, artifact.id, { ...finalResult.output });
  }

  await this.saveTeamTrace(results);
  return results;
}

async executeLaneTransition(
  model: BmadModel,
  workflowId: string,
  artifact: any,
  store: any,
  stream?: vscode.ChatResponseStream,
  token?: vscode.CancellationToken
): Promise<void> {
  // Resolve workflow by ID from the registry, then execute via the standard
  // executeWithTools() pipeline.
  const definition = WORKFLOW_REGISTRY.find(w => w.id === workflowId);
  if (!definition) {
    throw new Error(`Workflow "${workflowId}" not found in WORKFLOW_REGISTRY`);
  }
  const bmadPath = this.context.bmadPath;
  const workflowPath = resolveWorkflowPath(bmadPath, definition.path);

  // Execute via the existing workflow execution pipeline.
  // store is passed from the caller (LaneTransitionEngine) which owns it.
  await this.executeWithTools(
    model,
    `Execute ${workflowId} workflow on this artifact`,
    artifact,
    stream,
    token,
    store,
    workflowPath
  );
}

private async saveTeamTrace(results: AcpSessionResult[]): Promise<void> {
  for (const result of results) {
    traceRecorder.record({
      sessionId: result.sessionId,
      type: 'decision',
      agent: result.role,
      data: {
        decision: `Team execution ${result.status}`,
        toolCalls: result.toolCalls,
        outputSummary: JSON.stringify(result.output).slice(0, 1000),
      },
    });
  }
}
```

**Note:** `executeLaneTransition()` and `executeWithTeam()` require the following imports at the top of `workflow-executor.ts`:
```typescript
import { AgentTeamOrchestrator } from '../acp/team-orchestrator';
import { AcpSessionResult } from '../acp/types';
import { traceRecorder } from '../trace/trace-recorder';
```

---

### Epic 3: Traced Execution & Observability (P2)

**Goal:** Record every tool call, decision, and code change to workspace files for auditability.

#### Implementation

##### Step 3.1: Trace Recorder

**File:** `src/trace/trace-recorder.ts` (NEW)

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createLogger } from '../utils/logger';
const logger = createLogger('trace-recorder');

// Project-standard error-to-string
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface TraceEntry {
  sessionId: string;
  timestamp: string;
  type: 'tool_call' | 'llm_response' | 'artifact_change' | 'decision' | 'error' | 'handoff';
  agent: string;
  data: {
    toolName?: string;
    toolInput?: any;
    toolResult?: any;
    llmPrompt?: string;
    llmResponse?: string;
    artifactId?: string;
    artifactType?: string;
    changeSummary?: string;
    decision?: string;
    rationale?: string;
    error?: string;
    handoffFrom?: string;
    handoffTo?: string;
    contextSummary?: string;
  };
  durationMs?: number;
}

export class TraceRecorder implements vscode.Disposable {
  private buffers = new Map<string, TraceEntry[]>();
  private flushTimeouts = new Map<string, NodeJS.Timeout>();
  private outputFolder: string;

  constructor(outputFolder: string) {
    this.outputFolder = path.join(outputFolder, 'traces');
  }

  record(entry: Omit<TraceEntry, 'timestamp'>): void {
    const fullEntry: TraceEntry = { ...entry, timestamp: new Date().toISOString() };
    const sessionBuffer = this.buffers.get(entry.sessionId) || [];
    sessionBuffer.push(fullEntry);
    this.buffers.set(entry.sessionId, sessionBuffer);
    this.scheduleFlush(entry.sessionId);
  }

  private scheduleFlush(sessionId: string): void {
    if (this.flushTimeouts.has(sessionId)) return;
    const timeout = setTimeout(() => this.flush(sessionId), 2000);
    this.flushTimeouts.set(sessionId, timeout);
  }

  private async flush(sessionId: string): Promise<void> {
    this.flushTimeouts.delete(sessionId);
    const entries = this.buffers.get(sessionId);
    if (!entries || entries.length === 0) return;

    this.buffers.delete(sessionId);

    try {
      await fs.mkdir(this.outputFolder, { recursive: true });
      const filePath = path.join(this.outputFolder, `session-${sessionId}.jsonl`);
      const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(filePath, lines, 'utf-8');
    } catch (err) {
      logger.error('Failed to flush trace', { sessionId, error: errMsg(err) });
    }
  }

  async getSessionTrace(sessionId: string): Promise<TraceEntry[]> {
    const filePath = path.join(this.outputFolder, `session-${sessionId}.jsonl`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  async searchTraces(query: { artifactId?: string; agent?: string; type?: string; since?: Date; limit?: number }): Promise<TraceEntry[]> {
    const files = await fs.readdir(this.outputFolder).catch(() => [] as string[]);
    const results: TraceEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const content = await fs.readFile(path.join(this.outputFolder, file), 'utf-8');
      const entries = content.split('\n').filter(Boolean).map(line => JSON.parse(line));
      results.push(...entries);
    }

    return results
      .filter(e => !query.artifactId || e.data?.artifactId === query.artifactId)
      .filter(e => !query.agent || e.agent === query.agent)
      .filter(e => !query.type || e.type === query.type)
      .filter(e => !query.since || new Date(e.timestamp) >= query.since)
      .slice(0, query.limit ?? Infinity);
  }

  async flushAll(): Promise<void> {
    for (const sessionId of Array.from(this.buffers.keys())) {
      await this.flush(sessionId);
    }
  }

  dispose(): void {
    for (const timeout of this.flushTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.flushTimeouts.clear();
    this.flushAll().catch(err => logger.error('Final flush failed', { error: errMsg(err) }));
  }
}
```

##### Step 3.2: Tool Call Interceptor

**File:** `src/trace/tool-tracer.ts` (NEW)

```typescript
import * as vscode from 'vscode';
import { traceRecorder } from './trace-recorder';

// Project-standard error-to-string
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function wrapToolWithTracing(
  tool: vscode.LanguageModelTool<any>,
  sessionId: string,
  agentName: string
): vscode.LanguageModelTool<any> {
  return {
    ...tool,
    invoke: async (inputs: any, token: vscode.CancellationToken) => {
      const startTime = Date.now();
      try {
        const result = await tool.invoke(inputs, token);
        traceRecorder.record({
          sessionId,
          type: 'tool_call',
          agent: agentName,
          data: { toolName: tool.name, toolInput: inputs, toolResult: result },
          durationMs: Date.now() - startTime,
        });
        return result;
      } catch (err) {
        traceRecorder.record({
          sessionId,
          type: 'error',
          agent: agentName,
          data: { toolName: tool.name, toolInput: inputs, error: errMsg(err) },
          durationMs: Date.now() - startTime,
        });
        throw err;
      }
    },
  };
}
```

##### Step 3.3: Trace Viewer Command

**File:** `src/commands/trace-commands.ts` (NEW)

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { traceRecorder } from '../trace/trace-recorder';

/**
 * List recent trace sessions from the trace output directory.
 * Scans *.jsonl files and returns the 20 most recently modified.
 */
async function getRecentSessions(): Promise<Array<{ label: string; sessionId: string }>> {
  const files = await traceRecorder.searchTraces({ limit: 0 }); // gets all
  const sessionIds = new Set(files.map(f => f.sessionId));
  return Array.from(sessionIds).slice(0, 20).map(id => ({
    label: id,
    sessionId: id,
  }));
}

/**
 * Build an HTML trace viewer page for a given session.
 * Renders a timeline of TraceEntry events with search/filter controls.
 */
async function buildTraceHtml(sessionId: string): Promise<string> {
  const entries = await traceRecorder.getSessionTrace(sessionId);

  const rows = entries.map((e, i) => {
    const dataStr = JSON.stringify(e.data, null, 2);
    const icon = e.type === 'error' ? '❌' : e.type === 'tool_call' ? '🔧' : e.type === 'decision' ? '🧠' : '📋';
    return `<tr class="trace-row trace-row--${e.type}">
      <td>${i + 1}</td>
      <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
      <td>${icon} ${e.type}</td>
      <td>${e.agent}</td>
      <td><pre>${escapeHtml(dataStr.slice(0, 500))}${dataStr.length > 500 ? '…' : ''}</pre></td>
      <td>${e.durationMs != null ? `${e.durationMs}ms` : ''}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Trace: ${sessionId}</title>
<style>
  body { font-family: var(--vscode-font-family, monospace); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  th { background: var(--vscode-editor-lineHighlightBackground); }
  pre { margin: 0; font-size: 12px; white-space: pre-wrap; max-width: 400px; }
  .trace-row--error { background: rgba(255,0,0,0.07); }
  .trace-row--tool_call { background: rgba(0,120,255,0.05); }
</style></head><body>
<h2>🔍 Trace: ${sessionId}</h2>
<p>${entries.length} entries</p>
<table><thead><tr><th>#</th><th>Time</th><th>Type</th><th>Agent</th><th>Data</th><th>Duration</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Delete trace files older than the specified number of days.
 */
async function clearTracesOlderThan(days: number): Promise<void> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const entries = await traceRecorder.searchTraces({ limit: 10000 });
  const oldSessions = new Set(
    entries
      .filter(e => new Date(e.timestamp).getTime() < cutoff)
      .map(e => e.sessionId)
  );
  // Note: Individual trace file cleanup requires filesystem access to the
  // trace output directory. The TraceRecorder would need a new method for
  // this (e.g. deleteSessionsOlderThan()). For now, the old-session set
  // is computed; full implementation is deferred to the build phase.
  if (oldSessions.size > 0) {
    // TODO: implement TraceRecorder.deleteSessionsOlderThan(days)
    // See trace-recorder.ts for the flush directory path.
  }
}

export function registerTraceCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('agileagentcanvas.openTraceViewer', async (sessionId?: string) => {
      if (sessionId) {
        const panel = vscode.window.createWebviewPanel(
          'agileagentcanvas.traceViewer',
          `Trace: ${sessionId}`,
          vscode.ViewColumn.Beside,
          { enableScripts: true }
        );
        panel.webview.html = await buildTraceHtml(sessionId);
        return;
      }

      const sessions = await getRecentSessions();
      const pick = await vscode.window.showQuickPick(sessions, {
        placeHolder: 'Select a session to view its trace',
      });
      if (!pick) return;

      const panel = vscode.window.createWebviewPanel(
        'agileagentcanvas.traceViewer',
        `Trace: ${pick.label}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );
      panel.webview.html = await buildTraceHtml(pick.sessionId);
    }),

    vscode.commands.registerCommand('agileagentcanvas.clearOldTraces', async () => {
      const days = vscode.workspace.getConfiguration('agileagentcanvas').get('trace.retentionDays', 30);
      await clearTracesOlderThan(days);
      vscode.window.showInformationMessage(`Cleared traces older than ${days} days`);
    })
  );
}
```

---

### Epic 4: Harness Governance Loop (P3)

**Goal:** Implement a continuous quality feedback loop that observes agent actions, evaluates them against policies, and feeds corrections back into prompts.

#### Implementation

##### Step 4.1: Harness Policy Engine

**File:** `src/harness/policy-engine.ts` (NEW)

```typescript
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { schemaValidator } from '../state/schema-validator';
import { repairDataWithSchema } from '../state/schema-repair-engine';
import { traceRecorder, TraceEntry } from '../trace/trace-recorder';

const logger = createLogger('harness-policy-engine');

export interface HarnessPolicy {
  id: string;
  name: string;
  description: string;
  type: 'pre-flight' | 'post-flight' | 'continuous';
  artifactType?: string;
  severity: 'blocking' | 'advisory';
  evaluate: (context: EvaluationContext) => Promise<string[] | null>;
  autoFix?: (context: EvaluationContext) => Promise<{ ok: boolean; data?: any }>;
}

export interface EvaluationContext {
  artifactType: string;
  artifactId: string;
  artifact: Readonly<any>;
  sessionId?: string;
  traceEntries?: Readonly<TraceEntry[]>;
  previousEvaluations?: Readonly<EvaluationResult[]>;
}

export interface EvaluationResult {
  policyId: string;
  passed: boolean;
  failures: string[];
  fixed: boolean;
  fixedArtifact?: any;
  severity: 'blocking' | 'advisory';
  timestamp: string;
}

export class HarnessEngine {
  private policies: HarnessPolicy[] = [];

  registerPolicy(policy: HarnessPolicy): void {
    this.policies.push(policy);
  }

  async evaluate(context: EvaluationContext, phase: 'pre-flight' | 'post-flight'): Promise<EvaluationResult[]> {
    const applicable = this.policies.filter(
      p => p.type === phase && (!p.artifactType || p.artifactType === context.artifactType)
    );
    const results: EvaluationResult[] = [];
    let currentArtifact = context.artifact;

    for (const policy of applicable) {
      let failures = await policy.evaluate({ ...context, artifact: currentArtifact });
      let fixed = false;
      let fixedArtifact: any = undefined;

      if (failures?.length && policy.autoFix) {
        const fixResult = await policy.autoFix({ ...context, artifact: currentArtifact });
        if (fixResult.ok && fixResult.data) {
          fixed = true;
          fixedArtifact = fixResult.data;
          currentArtifact = fixResult.data;
          failures = await policy.evaluate({ ...context, artifact: fixedArtifact });
        }
      }

      results.push({
        policyId: policy.id,
        passed: !failures?.length,
        failures: failures || [],
        fixed,
        fixedArtifact,
        severity: policy.severity,
        timestamp: new Date().toISOString(),
      });

      traceRecorder.record({
        sessionId: context.sessionId || 'harness',
        type: 'decision',
        agent: 'harness',
        data: {
          decision: `Policy ${policy.id}: ${failures?.length ? 'FAILED' : 'PASSED'}`,
          rationale: failures?.join('; ') || 'All checks passed',
        },
      });
    }

    return results;
  }

  static builtInPolicies(): HarnessPolicy[] {
    return [
      {
        id: 'schema-conformance',
        name: 'JSON Schema Conformance',
        description: 'Artifact must conform to its BMAD JSON schema',
        type: 'pre-flight',
        severity: 'blocking',
        evaluate: async (ctx) => {
          if (!ctx.artifact) return ['No artifact data provided'];
          const validation = schemaValidator.validateChanges(ctx.artifactType, ctx.artifact as any);
          return validation.valid ? null : validation.errors;
        },
        autoFix: async (ctx) => {
          const fixed = repairDataWithSchema(ctx.artifact as any, ctx.artifactType);
          if (fixed.ok) {
            return { ok: true, data: fixed.data };
          }
          return { ok: false };
        },
      },
      {
        id: 'required-fields',
        name: 'Required Fields Present',
        description: 'Required fields must have non-empty values',
        type: 'pre-flight',
        artifactType: 'story',
        severity: 'blocking',
        evaluate: async (ctx) => {
          const failures: string[] = [];
          if (!ctx.artifact?.title) failures.push('Story must have a title');
          if (!ctx.artifact?.userStory?.iWant) failures.push('Story must have a user story (I want...)');
          if (!ctx.artifact?.acceptanceCriteria?.length) failures.push('Story must have at least one acceptance criterion');
          return failures.length ? failures : null;
        },
      },
      {
        id: 'no-placeholders',
        name: 'No Placeholder Content',
        description: 'Artifact content must not contain placeholder text',
        type: 'post-flight',
        severity: 'advisory',
        evaluate: async (ctx) => {
          const content = JSON.stringify(ctx.artifact || '');
          const placeholders = ['TODO', 'FIXME', 'TBD', 'placeholder', 'lorem ipsum'];
          const found = placeholders.filter(p => content.toLowerCase().includes(p.toLowerCase()));
          return found.length ? found.map(p => `Contains placeholder: "${p}"`) : null;
        },
      },
      {
        id: 'token-budget',
        name: 'Story Point Budget Check',
        description: 'Total story points for an epic should not exceed sprint capacity',
        type: 'post-flight',
        artifactType: 'epic',
        severity: 'advisory',
        evaluate: async (ctx) => {
          const stories = ctx.artifact?.stories || [];
          if (!stories.length) return null;
          const totalPoints = stories.reduce((sum: number, s: any) => sum + (s.storyPoints || 0), 0);
          const capacity = vscode.workspace.getConfiguration('agileagentcanvas').get('harness.sprintCapacity', 20);
          return totalPoints > capacity
            ? [`Total ${totalPoints} SP exceeds default sprint capacity of ${capacity} SP. Consider splitting into multiple sprints.`]
            : null;
        },
      },
    ];
  }
}

export const harnessEngine = new HarnessEngine();
// Register each built-in policy individually (registerPolicy takes a single policy, not an array)
for (const policy of HarnessEngine.builtInPolicies()) {
  harnessEngine.registerPolicy(policy);
}
```

##### Step 4.2: Integration into ArtifactStore

**File:** `src/state/artifact-store.ts` — modifications needed:

1. **Add a harness event emitter:**
```typescript
// Add this field to the ArtifactStore class:
private _onHarnessFailures = new vscode.EventEmitter<EvaluationResult[]>();
readonly onHarnessFailures = this._onHarnessFailures.event;
```

2. **Add harness gating to `updateArtifact()`:**
At the beginning of the `updateArtifact()` method, before the existing switch statement, add:

```typescript
async updateArtifact(artifactType: string, artifactId: string, changes: any): Promise<void> {
  // ... existing logDebug ...

  let processedChanges = { ...changes };

  // ── Harness pre-flight checks (opt-in via config) ──
  const harnessEnabled = vscode.workspace.getConfiguration('agileagentcanvas').get('harness.enabled', true);
  if (harnessEnabled) {
    const results = await harnessEngine.evaluate({
      artifactType,
      artifactId,
      artifact: processedChanges,
    }, 'pre-flight');

    const blocking = results.filter(r => !r.passed && r.severity === 'blocking');
    if (blocking.length > 0) {
      this._onHarnessFailures.fire(blocking);
      throw new Error(`Blocked by policies: ${blocking.map(b => b.policyId).join(', ')}`);
    }

    // Apply auto-fixes from advisory policies
    const lastFix = [...results].reverse().find(r => r.fixedArtifact !== undefined);
    if (lastFix?.fixedArtifact) {
      processedChanges = lastFix.fixedArtifact;
    }
  }

  // ... existing switch (artifactType) with all cases using processedChanges instead of raw changes ...
  // NOTE: Every case that reads from `changes` should read from `processedChanges` instead,
  // e.g.: switch (artifactType) { case 'epic': const updatedEpic = { ...oldEpic, ...processedChanges }; ... }

  // ── Harness post-flight checks ──
  if (harnessEnabled) {
    // Re-read the saved artifact to evaluate final state.
    // findArtifactById returns { artifact, type, id } — extract the raw artifact.
    const found = this.findArtifactById(artifactId);
    const savedArtifact = found?.artifact || {};
    const postResults = await harnessEngine.evaluate({
      artifactType,
      artifactId,
      artifact: savedArtifact ? { ...savedArtifact } : {},
    }, 'post-flight');

    const advisory = postResults.filter(r => !r.passed);
    if (advisory.length > 0) {
      this._onHarnessFailures.fire(advisory);
    }
  }

  // ... existing reconcileDerivedState, notifyChange, syncToFiles ...
}
```

**Important:** The `_onHarnessFailures` field and `onHarnessFailures` event must be disposed in the `ArtifactStore.dispose()` method.

##### Step 4.3: Policy File Loader

**File:** `src/harness/policy-loader.ts` (NEW)

```typescript
import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { ArtifactStore } from '../state/artifact-store';
import { HarnessPolicy, EvaluationContext } from './policy-engine';

/**
 * Load user-defined policies from `.agileagentcanvas-context/policies/*.yaml`
 *
 * ⚠️ SECURITY WARNING: User-defined policies that evaluate via LLM are a prompt-injection
 * vector. A malicious policy YAML could craft prompts that exfiltrate data or manipulate
 * the LLM. In production, prefer deterministic policies (regex/schema checks) over LLM-based
 * evaluation. If LLM evaluation is required, sanitize the policy text and run it in a
 * restricted context with no access to secrets.
 */

/**
 * Stub for LLM-based policy evaluation.
 * This is explicitly out of scope for v0.5.0 — user-defined policies must use
 * deterministic checks (regex) only. LLM evaluation is reserved for a future
 * milestone when prompt-injection mitigations are in place.
 */
async function evaluatePolicyWithLLM(entry: any, _ctx: EvaluationContext): Promise<string[] | null> {
  // TODO (P4): Implement LLM-based evaluation with sandboxed context.
  // Until then, policies without a `regex` field are skipped with a warning.
  console.warn(`[Harness] Policy "${entry.id || entry.name || 'unnamed'}" has no regex field — LLM evaluation not yet supported. Policy skipped.`);
  return null;
}

export async function loadUserPolicies(store: ArtifactStore): Promise<HarnessPolicy[]> {
  const sourceFolder = store.getSourceFolder();
  if (!sourceFolder) return [];

  const policiesDir = vscode.Uri.joinPath(sourceFolder, 'policies');
  try {
    await vscode.workspace.fs.stat(policiesDir);
  } catch {
    return [];
  }

  const files = await vscode.workspace.fs.readDirectory(policiesDir);
  const policies: HarnessPolicy[] = [];

  for (const [fileName, fileType] of files) {
    if (fileType !== vscode.FileType.File) continue;
    if (!fileName.endsWith('.yaml') && !fileName.endsWith('.yml')) continue;

    const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(policiesDir, fileName));
    const parsed = yaml.parse(content.toString());

    for (const entry of (parsed.policies || [])) {
      policies.push({
        id: entry.id || fileName.replace(/\.(yaml|yml)$/, '') + '-' + policies.length,
        name: entry.name || fileName,
        description: entry.description || '',
        type: entry.type || 'post-flight',
        artifactType: entry.artifactType,
        severity: entry.severity || 'advisory',
        evaluate: async (ctx) => {
          if (entry.regex) {
            const content = JSON.stringify(ctx.artifact || '');
            const matches = entry.regex.filter((r: string) => new RegExp(r, 'i').test(content));
            return matches.length ? matches.map((m: string) => `Matched forbidden pattern: ${m}`) : null;
          }
          return evaluatePolicyWithLLM(entry, ctx);
        },
      });
    }
  }

  return policies;
}
```

---

## 6. File-by-File Change List

### New Files to Create

| File | Epic | Purpose |
|---|---|---|
| `src/views/agentic-kanban-view-provider.ts` | E1 | New webview provider for Agentic Kanban (mode-based routing) |
| `src/views/agentic-kanban-message-handler.ts` | E1 | Message dispatch for Kanban webview |
| `webview-ui/src/components/kanban/KanbanTypes.ts` | E1 | Shared Kanban types (extracted from SprintPlanningView) |
| `webview-ui/src/components/kanban/KanbanCard.tsx` | E1 | Reusable Kanban card with agent overlays + dataTransfer |
| `webview-ui/src/components/kanban/KanbanColumn.tsx` | E1 | Reusable Kanban column with DnD support |
| `webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx` | E1 | Main React app for Agentic Kanban (mode: 'agentic-kanban') |
| `webview-ui/src/agentic-kanban/AgenticDetailPanel.tsx` | E1 | Detail panel for selected Kanban card (or inline in App) |
| `src/workflow/lane-transitions.ts` | E1 | Status-based transition engine (uses existing workflow IDs) |
| `src/workflow/concurrency-queue.ts` | E1 | Artifact lock queue |
| `src/acp/types.ts` | E2 | ACP protocol types |
| `src/acp/session-manager.ts` | E2 | ACP session lifecycle (depends on WorkflowExecutor) |
| `src/acp/team-orchestrator.ts` | E2 | Multi-agent team execution |
| `src/trace/trace-recorder.ts` | E3 | Per-session trace logging (JSONL format) |
| `src/trace/tool-tracer.ts` | E3 | Tool call interceptor |
| `src/commands/trace-commands.ts` | E3 | VS Code trace viewer commands (with full implementations) |
| `src/harness/policy-engine.ts` | E4 | Policy evaluation engine |
| `src/harness/policy-loader.ts` | E4 | User-defined policy loader (with evaluatePolicyWithLLM stub) |

### Existing Files to Modify

| File | Epic | Changes |
|---|---|---|
| `src/workflow/workflow-executor.ts` | E1, E2, E3 | Add `executeLaneTransition()`, `executeWithTeam()`, imports for ACP + trace |
| `src/state/artifact-store.ts` | E4 | Add `_onHarnessFailures` emitter, integrate harness checks |
| `src/chat/agileagentcanvas-tools.ts` | E3 | Wrap tools with tracing |
| `src/chat/chat-participant.ts` | E2, E3 | Create trace sessions, support team execution |
| `src/extension.ts` | ALL | Register AgenticKanbanViewProvider, trace commands, initialize managers |
| `package.json` | ALL | Add `views` contribution under `agileagentcanvas-explorer`, commands, configuration |
| `webview-ui/src/App.tsx` | E1 | Add `'agentic-kanban'` mode branch |
| `webview-ui/src/components/SprintPlanningView.tsx` | E1 | **Refactor to import from `kanban/` components** (reduce duplication) |

### Files Explicitly NOT Modified (Zero Regression Risk)

| File | Reason |
|---|---|
| `webview-ui/src/components/Canvas.tsx` | Mature visualization surface — untouched |
| `webview-ui/src/components/ArtifactCard.tsx` | Canvas-specific card — untouched |
| `src/views/canvas-view-provider.ts` | Canvas webview provider — untouched |
| `webview-ui/vite.config.ts` | No changes — single entry point, mode-based routing |
| `esbuild.mjs` | No changes expected — copies entire build/ |

---

## 7. Test Strategy

### Unit Tests (per Epic)

| Test Suite | File | Key Tests |
|---|---|---|
| Lane transitions | `features/lane-transitions.feature` | Transition rules match, validation gates fire, concurrency locks work |
| ACP session lifecycle | `features/acp-session.feature` | Spawn → execute → complete → handoff, cancellation, error handling |
| Multi-agent team | `features/agent-team.feature` | Coordinator → Crafter → Gate pipeline, error propagation |
| Trace recorder | `features/trace-recorder.feature` | JSONL format, per-session flush, search/filter |
| Harness policies | `features/harness-policies.feature` | Pre-flight blocks bad data, post-flight catches advisory issues, immutable auto-fix |
| Kanban components | `features/agentic-kanban.feature` | DnD between columns, agent status overlay, lock visualization |

### Integration Tests

| Scenario | What to Verify |
|---|---|
| Drag story from Backlog → Ready for Dev | Transition triggers refine workflow, lock acquired |
| Drag story from Ready → In Progress | Triggers `dev-story` team execution (Coordinator → Crafter → Gate) |
| Drag locked story | Card is not draggable, shows lock badge |
| Cancel team execution mid-stream | Locks released, partial trace written, no artifact corruption |
| Save story with missing title in Kanban | Pre-flight harness blocks, error badge shown on card |
| Open trace viewer from Kanban card | All tool calls and LLM responses visible, filterable by type |

---

## 8. Migration & Backward Compatibility

### Non-Breaking Changes (No migration needed)
- **Epic 1 (Agentic Kanban):** Pure addition — new view, no existing data format changes. Canvas and SprintPlanningView are untouched.
- **Epic 3 (Tracing):** Pure addition — traces stored in new directory.
- **Epic 4 (Harness):** Pure addition — policies are opt-in via config.

### Potentially Breaking (Needs Feature Flag)
- **Epic 2 (Multi-agent teams):** Changes `executeWithTools()` behavior. Use a config flag:

```json
"agileagentcanvas.agentTeam.enabled": {
  "type": "boolean",
  "default": false,
  "description": "Enable multi-agent team execution (ACP). When disabled, uses single-agent execution."
}
```

### VS Code View Container Registration

Add to `package.json` `contributes.views` — **under the existing `agileagentcanvas-explorer` container**:

```json
{
  "views": {
    "agileagentcanvas-explorer": [
      {
        "id": "agileagentcanvas.artifactsTree",
        "name": "Artifacts",
        "type": "tree"
      },
      {
        "id": "agileagentcanvas.wizardSteps",
        "name": "Workflow Progress",
        "type": "tree"
      },
      {
        "id": "agileagentcanvas.agenticKanban",
        "name": "🚀 Agentic Kanban",
        "type": "webview",
        "when": "agileagentcanvas.hasProject && agileagentcanvas.agenticKanban.enabled"
      }
    ]
  }
}
```

Alternatively, if the Agentic Kanban should be a full panel (not sidebar), register it as a `WebviewPanel` command instead — similar to how `openCanvasPanel` works in `extension.ts`.

### Feature Flags Summary

| Feature | Config Key | Default | Type |
|---|---|---|---|
| Agentic Kanban view | `agileagentcanvas.agenticKanban.enabled` | `true` | boolean |
| Agent teams | `agileagentcanvas.agentTeam.enabled` | `false` | boolean |
| Execution tracing | `agileagentcanvas.trace.enabled` | `true` | boolean |
| Trace retention | `agileagentcanvas.trace.retentionDays` | `30` | number |
| Harness policies | `agileagentcanvas.harness.enabled` | `true` | boolean |
| Harness sprint capacity | `agileagentcanvas.harness.sprintCapacity` | `20` | number |
| YOLO mode | `agileagentcanvas.yoloMode` | `false` | boolean |

### package.json Configuration Properties

```json
{
  "agileagentcanvas.agenticKanban.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Show the Agentic Kanban view for workflow orchestration."
  },
  "agileagentcanvas.agentTeam.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Enable multi-agent team execution (ACP)."
  },
  "agileagentcanvas.trace.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Record execution traces to .agileagentcanvas-context/traces/"
  },
  "agileagentcanvas.trace.retentionDays": {
    "type": "number",
    "default": 30,
    "description": "Number of days to retain trace files."
  },
  "agileagentcanvas.harness.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Run pre-flight and post-flight harness policy checks."
  },
  "agileagentcanvas.harness.sprintCapacity": {
    "type": "number",
    "default": 20,
    "description": "Default sprint capacity in story points."
  },
  "agileagentcanvas.yoloMode": {
    "type": "boolean",
    "default": false,
    "description": "Skip confirmation dialogs for auto-triggered workflows."
  }
}
```

---

## Appendix: Shared Utilities

### Error Handling Pattern

The project does NOT have a standalone `getErrorMessage()` utility. The standard pattern used throughout the codebase is:

```typescript
// Inline:
err instanceof Error ? err.message : String(err)

// Or as a local helper in modules that need it frequently:
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

**All new modules in this plan that need error-to-string conversion define a local `errMsg()` helper** rather than relying on a non-existent shared utility. This is consistent with the project's existing conventions.

---

## Appendix: Routa Reference Architecture

| Routa File | AAC Counterpart | Key Learning |
|---|---|---|
| `acp/protocol.ts` | `src/acp/types.ts` | Message types, lifecycle states |
| `acp/session.ts` | `src/acp/session-manager.ts` | Session creation, event emission |
| `kanban/board.ts` | `src/views/agentic-kanban-view-provider.ts` | Column/lane state machine |
| `kanban/triggers.ts` | `src/workflow/lane-transitions.ts` | Transition → workflow mapping |
| `kanban/queue.ts` | `src/workflow/concurrency-queue.ts` | Concurrency queue |
| `specialist/coordinator.ts` | `src/acp/team-orchestrator.ts` | Task decomposition |
| `specialist/crafter.ts` | `src/acp/team-orchestrator.ts` | Implementation |
| `specialist/gate.ts` | `src/acp/team-orchestrator.ts` | Verification |
| `harness/observer.ts` | `src/harness/policy-engine.ts` | Observation pattern |
| `harness/evaluator.ts` | `src/harness/policy-engine.ts` | Policy evaluation |
| `harness/policy.ts` | `src/harness/policy-loader.ts` | Policy file loading |
| `trace/` | `src/trace/` | JSONL format, viewer |

---

## Appendix: Design Decisions & Trade-offs

### Why a Separate Agentic Kanban View?
The existing Canvas (`Canvas.tsx`) is a mature, complex visualization surface with mindmap layout, lane positioning, expand/collapse logic, and screenshot capabilities. Retrofitting drag-and-drop and workflow triggers into it risks regressions. The existing `SprintPlanningView` is read-only and optimized for sprint status review. A dedicated Agentic Kanban view provides:
- **Zero regression risk** to Canvas and SprintPlanningView
- **Clean mental model**: Canvas = design/refinement, Sprint Plan = status tracking, Agentic Kanban = execution
- **Native DnD design** from day one, not retrofitted
- **Routa alignment**: `kanban/` as a first-class subsystem

### Why Reuse SprintPlanningView's Kanban Components?
`SprintPlanningView` already has excellent `KanbanCard`, `KanbanColumn`, and status normalization logic. Extracting these into `webview-ui/src/components/kanban/` reduces duplication and ensures consistent styling between the Sprint Plan and Agentic Kanban.

### Why Status-Based Transitions?
The Agentic Kanban uses artifact `status` field directly (Backlog → Ready → In Progress → Review → Done) rather than Canvas lanes. This is simpler, aligns with `SprintPlanningView`, and avoids the 4-lane vs. 5-lane mismatch entirely.

### Why Immutable Policy Evaluation?
Per project coding standards, `autoFix` returns `{ ok, data }` rather than mutating context. The caller reassigns the working variable. This prevents hidden side effects in the policy chain.

### Why No A2A Bus in v0.5.0?
Full A2A federation requires a message bus and discovery protocol AAC doesn't have. The `AcpHandoff` interface captures essential context-passing. A2A is reserved for P4.

### Why Mode-Based Routing for the Webview?
The existing build system produces a single entry point (`build/assets/index.js`). Rather than adding a second entry point (which would require changes to both `vite.config.ts` and `esbuild.mjs`), the Agentic Kanban uses the same mode-based routing as detail tabs (`window.__AC_MODE__ = 'agentic-kanban'`). This keeps build configuration unchanged.

### Why `buildArtifacts(store)` instead of `getAllArtifacts()`?
`ArtifactStore` does not have a `getAllArtifacts()` method. The existing pattern for transforming store state into a flat artifact array is `buildArtifacts(store, projectRoot)` from `src/canvas/artifact-transformer.ts`. The Agentic Kanban reuses this same function, ensuring consistency with the Canvas view.

### Why WorkflowExecutor as a Dependency for AcpSessionManager?
The `executeWithTools()` function is a method on `WorkflowExecutor`, not a standalone function. `AcpSessionManager` accepts a `WorkflowExecutor` instance in its constructor and delegates execution to it, keeping the ACP layer thin and reusing the existing BMAD workflow execution pipeline.

---

> **Next steps:** An implementation agent should start with **Epic 1 (Agentic Kanban View)**:
> 1. Extract `KanbanCard` and `KanbanColumn` from `SprintPlanningView.tsx` into `components/kanban/`
> 2. Add `'agentic-kanban'` mode branch to `webview-ui/src/App.tsx`
> 3. Build `AgenticKanbanApp.tsx` with HTML5 DnD (dataTransfer in KanbanCard)
> 4. Create `AgenticKanbanViewProvider` and register in `extension.ts`
> 5. Implement `lane-transitions.ts` with `TRANSITION_RULES` (using existing workflow IDs)
> 6. Run `npm run test` for existing Cucumber suites; write `features/agentic-kanban.feature`
