const fs = require('fs');
const path = require('path');

const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
let content = fs.readFileSync(changelogPath, 'utf8');

// CRLF line endings
const marker = "truncation surfaced during testing.\r\n\r\n## 0.5.2";
const insertion = `truncation surfaced during testing.

### Agent-to-Agent Message Bus — Dynamic Discovery & Handoff Negotiation

New \`src/acp/agent-bus/\` module adds a peer-to-peer message bus for agents to dynamically discover each other and negotiate handoffs during team execution.

- **Agent Registry** — Dynamic register/unregister with capability-based \`discover()\`. \`findOptimalAgent()\` prefers idle agents. Heartbeat tracking with automatic stale-pruning.
- **Message Bus** — Pub/sub with wildcard topic patterns (\`*\` single-segment, \`#\` multi-segment). Supports priority queuing, TTL expiry, correlation IDs, direct \`send()\`, delivery tracing, and system event topics.
- **Handoff Negotiation** — \`requestHandoff()\` with 30s timeout and auto-accept for idle agents. \`respondToHandoff()\`, \`transferContext()\`, \`completeHandoff()\`/\`failHandoff()\`. Max 20 concurrent sessions.
- **Wired into team execution** — \`executeTeam()\` registers agents on the bus, deregisters in \`finally\`. Bus initialized in \`extension.ts\`.

### Agentic Kanban View — Workflow Orchestration UI

A new Kanban-style view for agentic workflow orchestration, toggleable from the canvas.

- **\`AgenticKanbanViewProvider\`** — New webview registered as \`agileagentcanvas.agenticKanban\`.
- **Kanban toggle FAB** — Canvas toolbar toggles between standard Canvas and Agentic Kanban modes.
- **Shared kanban components** — \`SprintPlanningView.tsx\` refactored to use modular \`KanbanCard\`/\`KanbanColumn\`.
- **Lane Transition Engine** — New \`src/workflow/lane-transitions.ts\` bridges Kanban actions to BMAD workflows.
- **Session restoration** — Extension activation restores interrupted ACP sessions from trace logs.
- **Settings** — \`agileagentcanvas.agenticKanban.enabled\` and \`agileagentcanvas.agenticKanban.terminalProvider\`.

### Multi-Agent Team Execution (ACP)

Full Agent Coordination Protocol for multi-agent teams with coordinator/crafter/gate roles.

- **ACP Types** — \`AcpSessionSpec\`, \`AcpSessionEvent\`, \`AcpSessionResult\`, \`AcpHandoff\`, \`AgentRole\`.
- **Session Manager** — \`AcpSession\` with lifecycle events and tool call/duration tracking.
- **Team Orchestrator** — \`AgentTeamOrchestrator\` with TEAM_REGISTRY (dev-story, refactor, generate-code, review-code teams).
- **\`agileagentcanvas.agentTeam.enabled\` setting** — Feature gate (default \`false\`).

### Team Trace Recording — Per-Agent Observability

Execution tracing added to \`executeTeam()\` for full agent lifecycle observability.

- **Lifecycle events** — team started, agent started (role/session ID), agent completed (tool calls/duration), agent failed (error details), team completed/failed (aggregate stats).
- **All trace calls wrapped in try/catch** — recording failures never block execution.

### Harness Governance Loop — Continuous Policy Enforcement

Self-correcting quality system validating artifacts pre/post-flight and accumulating feedback across sessions.

- **Policy Engine** — Synchronous \`evaluate()\` with pre-flight, post-flight, and continuous policies:
  - **trace-anomaly** — Detects repeated errors (>=3), stuck tool-call loops (>=4), frequent status changes (>=4)
  - **feedback-accumulation** — Surfaces cumulative policy findings
- **Harness Feedback Service** — Severity escalation: advisory -> warning -> blocking (6+). Active failures injected into agent prompts.
- **Pre-flight validation** — \`ArtifactStore.updateArtifact()\` blocks on blocking failures.
- **Settings** — \`agileagentcanvas.harness.enabled\` and \`agileagentcanvas.harness.sprintCapacity\`.

### Execution Trace Recorder

Per-session trace logging for observability and debugging.

- **\`trace-recorder.ts\`** — Records tool calls, LLM responses, decisions, errors, handoffs to JSONL files.
- **\`wrapToolWithDynamicTracing()\`** — Auto-wraps LM tools with tracing.
- **Settings** — \`agileagentcanvas.trace.enabled\` (default \`true\`) and \`agileagentcanvas.trace.retentionDays\` (default \`30\`).

### YOLO (Autonomous) Mode

- **\`agileagentcanvas.yoloMode\` setting** — When enabled (default \`false\`), AI may skip interactive checkpoints.

### VSIX Build Pipeline

- **\`npm run compile\`** — Runs type-check, esbuild bundle, webview UI build sequentially.
- **\`vsce package\`** — Verified VSIX generation at 3.87 MB (936 files).

\r\n## 0.5.2`;

if (content.includes(marker)) {
  content = content.replace(marker, insertion);
  fs.writeFileSync(changelogPath, content, 'utf8');
  console.log('CHANGELOG.md updated successfully');
} else {
  console.error('ERROR: Marker not found');
  process.exit(1);
}
