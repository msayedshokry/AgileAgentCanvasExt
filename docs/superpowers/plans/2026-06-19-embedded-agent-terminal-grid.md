# Embedded Agent Terminal Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-session plaintext `TerminalModal` with an embedded, ANSI-correct, **multi-agent xterm.js terminal grid** inside the Agentic Kanban canvas — so the user can watch every running agent live without leaving the extension — built behind a **backend-agnostic seam** so adding true type-to-agent input later requires zero UI or protocol change.

**Architecture (first-time-right):** Separate the **durable** layer (xterm.js grid UI + a backend-agnostic message protocol + a `TerminalBackend` interface whose contract includes input from day one) from the **disposable** layer (the PTY backend). Ship **Option A** (`vscode.Terminal` + existing `onDidWriteData` stream, output-only) first to deliver the "watch the fleet" headline with zero native-module risk. Add **Option B** (`node-pty` owned by the extension host, bidirectional) later behind the *same* interface. A throwaway **node-pty packaging spike (Phase 0)** is the go/no-go gate that de-risks Option B before any commitment.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild (`esbuild.mjs`), React 18 + Vite (`webview-ui/`), **@xterm/xterm** + **@xterm/addon-fit**, **node-pty** (Phase 4 only), Vitest for both `src/**/*.test.ts` and `webview-ui/**/*.test.tsx`.

---

## Ground-truth facts (verified at commit `242adbf`)

- **Output stream today:** `terminalExecutor.attachWebviewStream(artifactId, cb)` (`src/workflow/terminal-executor.ts:654`) registers a callback that receives each raw chunk from `terminal.onDidWriteData` (`:389`). `getTerminalOutput(artifactId)` (`:645`) returns the buffered snapshot. `killTerminal(artifactId)` (`:670`) disposes the terminal.
- **Producer (extension → webview):** `src/views/agentic-kanban-message-handler.ts` `case 'kanban:jumpToTerminal'` (`:550`) posts `terminalOutput` (snapshot) then attaches a stream that posts `terminalOutputAppend` per chunk; `case 'kanban:closeTerminal'` (`:542`) disposes the stream.
- **Consumer today:** `webview-ui/src/agentic-kanban/TerminalModal.tsx` — a modal that splits chunks on `\r?\n` into a `<pre>`. **No xterm.js, no ANSI.** Mounted from `AgenticKanbanApp.tsx` via `terminalModal` state (`:84`, `:927`, `:952`).
- **Session model:** `AgentSessionRow` (`src/views/agent-sessions-view-provider.ts:33-74`) already aggregates every agent (fields: `id`, `source`, `statusKey`, `agentRole`, `workflowId`, `artifactId`, `terminalId`, `startedAt`, `sparkline`). **The grid binds to this — do not invent a parallel session identity.** Session key = `artifactId` (matches the existing stream key).
- **Bundling:** `esbuild.mjs` bundles everything except `external: ['vscode']`. A native module (`node-pty`) must be added to `external` AND its built `.node` binary copied into `dist/` (the file already does this pattern for pdfkit font data via `copyPdfkitFontData()`).
- **Webview tests:** Vitest + `@testing-library/react` + jsdom are already configured (`webview-ui/vitest.config.ts`).

---

## Phase 0: node-pty packaging spike (GO/NO-GO gate)

**Why first:** the only thing that can derail Option B is `node-pty` being a native module that must match VS Code's Electron ABI across win/mac/linux. Retire that risk in ~1–2 hours **before** committing to Phase 4. This phase is **throwaway** — its only output is a decision and a short notes file.

### Task 0.1: Prove node-pty loads in the extension host and round-trips I/O

**Files:**
- Create (throwaway): `scripts/spikes/node-pty-smoke.js`
- Create: `docs/superpowers/plans/node-pty-spike-result.md`

- [ ] **Step 1: Install node-pty as a dev-only spike dependency**

Run:
```bash
npm install --no-save node-pty
```
Expected: installs with a native build step. If it fails to build, **record the error in the result doc and STOP — that is a NO-GO signal for Option B** (revisit toolchain before planning Phase 4).

- [ ] **Step 2: Write the smoke script**

Create `scripts/spikes/node-pty-smoke.js`:
```js
// Throwaway spike: prove node-pty spawns a shell, streams output, accepts input.
const os = require('os');
const pty = require('node-pty');

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
const p = pty.spawn(shell, [], { name: 'xterm-color', cols: 80, rows: 30, cwd: process.cwd(), env: process.env });

let out = '';
p.onData((d) => { out += d; process.stdout.write(d); });
p.onExit(({ exitCode }) => {
  const ok = out.includes('SPIKE_OK');
  console.log(`\n[spike] exitCode=${exitCode} sawMarker=${ok}`);
  process.exit(ok ? 0 : 1);
});

// Write input (proves bidirectional), then exit.
setTimeout(() => p.write('echo SPIKE_OK\r'), 500);
setTimeout(() => p.write('exit\r'), 1500);
```

- [ ] **Step 3: Run under the same Node major the extension host uses (node20 target)**

Run:
```bash
node scripts/spikes/node-pty-smoke.js
```
Expected: terminal output streams, then `[spike] exitCode=0 sawMarker=true`, process exits 0.

- [ ] **Step 4: Verify Electron ABI reality (the real risk)**

`node-pty` built for system Node may not load under VS Code's Electron. Record which of these is true in the result doc:
- Does the project already ship native modules rebuilt for Electron? (Check: `grep -i "electron-rebuild\|@electron/rebuild\|vscode:prepublish" package.json`.)
- Is there a prebuilt-binaries path (e.g. `@vscode/spawn-pty`, or `node-pty` prebuilds for the target Electron)?

Document the chosen approach to ship a matching binary (electron-rebuild in a packaging step, or a prebuilt provider). **No code yet — this is a findings record.**

- [ ] **Step 5: Record the GO/NO-GO decision**

Create `docs/superpowers/plans/node-pty-spike-result.md` with: build outcome, smoke result, the ABI/packaging approach, and a one-line **GO** or **NO-GO** verdict for Option B. Commit it.

```bash
git add scripts/spikes/node-pty-smoke.js docs/superpowers/plans/node-pty-spike-result.md
git commit -m "spike: node-pty packaging go/no-go for embedded terminal"
```

> **Gate:** Phases 1–3 proceed regardless (they don't need node-pty). **Phase 4 is BLOCKED until this records GO.**

---

## Phase 1: The durable seam — backend-agnostic protocol + `TerminalBackend`

**Why:** this is the layer that must never be rewritten. Define it for the bidirectional end-state now; implement output-only first.

### Task 1.1: Define the shared message protocol (single source of truth)

**Files:**
- Create: `src/views/terminal-protocol.ts`
- Test: `src/views/terminal-protocol.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/terminal-protocol.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { isTerminalInbound, TERMINAL_MSG } from './terminal-protocol';

describe('terminal protocol', () => {
  it('exposes stable message-type constants for both directions', () => {
    expect(TERMINAL_MSG.snapshot).toBe('terminal:snapshot');
    expect(TERMINAL_MSG.data).toBe('terminal:data');
    expect(TERMINAL_MSG.exit).toBe('terminal:exit');
    expect(TERMINAL_MSG.open).toBe('terminal:open');
    expect(TERMINAL_MSG.input).toBe('terminal:input');
    expect(TERMINAL_MSG.close).toBe('terminal:close');
    expect(TERMINAL_MSG.kill).toBe('terminal:kill');
  });
  it('narrows inbound (webview→ext) messages', () => {
    expect(isTerminalInbound({ type: 'terminal:open', sessionId: 's1' })).toBe(true);
    expect(isTerminalInbound({ type: 'terminal:input', sessionId: 's1', data: 'ls\r' })).toBe(true);
    expect(isTerminalInbound({ type: 'terminal:data', sessionId: 's1', chunk: 'x' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/views/terminal-protocol.test.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the protocol**

Create `src/views/terminal-protocol.ts`:
```typescript
/**
 * Backend-agnostic terminal message protocol shared by the extension host
 * and the webview. Designed for the bidirectional end-state from v1:
 * `terminal:input` exists even while the first backend is output-only.
 * Session identity == artifactId (reuses the existing stream key + AgentSessionRow).
 */
export const TERMINAL_MSG = {
  // extension → webview
  snapshot: 'terminal:snapshot', // { sessionId, data }   full buffered output on (re)attach
  data: 'terminal:data',         // { sessionId, chunk }  streamed chunk
  exit: 'terminal:exit',         // { sessionId, code }   process/terminal ended
  // webview → extension
  open: 'terminal:open',         // { sessionId }         tile mounted, attach + send snapshot
  input: 'terminal:input',       // { sessionId, data }   keystrokes (no-op for output-only backend)
  close: 'terminal:close',       // { sessionId }         tile unmounted, detach
  kill: 'terminal:kill',         // { sessionId }         user-requested terminate
} as const;

export interface TerminalSnapshotMsg { type: typeof TERMINAL_MSG.snapshot; sessionId: string; data: string; }
export interface TerminalDataMsg { type: typeof TERMINAL_MSG.data; sessionId: string; chunk: string; }
export interface TerminalExitMsg { type: typeof TERMINAL_MSG.exit; sessionId: string; code?: number; }
export type TerminalOutbound = TerminalSnapshotMsg | TerminalDataMsg | TerminalExitMsg;

export interface TerminalOpenMsg { type: typeof TERMINAL_MSG.open; sessionId: string; }
export interface TerminalInputMsg { type: typeof TERMINAL_MSG.input; sessionId: string; data: string; }
export interface TerminalCloseMsg { type: typeof TERMINAL_MSG.close; sessionId: string; }
export interface TerminalKillMsg { type: typeof TERMINAL_MSG.kill; sessionId: string; }
export type TerminalInbound = TerminalOpenMsg | TerminalInputMsg | TerminalCloseMsg | TerminalKillMsg;

const INBOUND = new Set<string>([TERMINAL_MSG.open, TERMINAL_MSG.input, TERMINAL_MSG.close, TERMINAL_MSG.kill]);
export function isTerminalInbound(m: unknown): m is TerminalInbound {
  return !!m && typeof m === 'object' && INBOUND.has((m as { type?: string }).type ?? '');
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
npx vitest run src/views/terminal-protocol.test.ts && npm run check-types
```
Expected: PASS, exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/views/terminal-protocol.ts src/views/terminal-protocol.test.ts
git commit -m "feat(terminal): backend-agnostic terminal message protocol"
```

### Task 1.2: Define the `TerminalBackend` interface (input in the contract from day 1)

**Files:**
- Create: `src/workflow/terminal-backend.ts`
- Test: `src/workflow/terminal-backend.test.ts`

- [ ] **Step 1: Write the failing test (a fake backend implements the contract)**

Create `src/workflow/terminal-backend.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import type { TerminalBackend } from './terminal-backend';

class FakeBackend implements TerminalBackend {
  readonly supportsInput = false;
  private cbs = new Map<string, (c: string) => void>();
  attach(id: string, onData: (c: string) => void) { this.cbs.set(id, onData); return { dispose: () => this.cbs.delete(id) }; }
  getSnapshot() { return ''; }
  write() { /* no-op for output-only */ }
  async kill() { /* no-op */ }
  emit(id: string, c: string) { this.cbs.get(id)?.(c); }
}

describe('TerminalBackend contract', () => {
  it('streams data to attached listeners and detaches on dispose', () => {
    const b = new FakeBackend();
    const onData = vi.fn();
    const d = b.attach('s1', onData);
    b.emit('s1', 'hello');
    expect(onData).toHaveBeenCalledWith('hello');
    d.dispose();
    b.emit('s1', 'again');
    expect(onData).toHaveBeenCalledTimes(1);
  });
  it('exposes supportsInput so the UI can show/hide an input box', () => {
    expect(new FakeBackend().supportsInput).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/workflow/terminal-backend.test.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the interface**

Create `src/workflow/terminal-backend.ts`:
```typescript
import type * as vscode from 'vscode';

/**
 * Abstraction over "the thing producing a terminal session's I/O".
 * The message handler and grid talk to THIS, never to a concrete PTY.
 * Output-only backends (Option A) set supportsInput=false and no-op write();
 * a node-pty backend (Option B) sets supportsInput=true and implements write()
 * — swapping backends requires NO change to the webview or the protocol.
 */
export interface TerminalBackend {
  /** Whether write() actually reaches the process. UI shows an input box iff true. */
  readonly supportsInput: boolean;
  /** Subscribe to streamed output chunks for a session. Returns a detach disposable. */
  attach(sessionId: string, onData: (chunk: string) => void): vscode.Disposable;
  /** Buffered output so far (for late-join snapshot on tile mount). */
  getSnapshot(sessionId: string): string;
  /** Send input to the session. No-op when supportsInput === false. */
  write(sessionId: string, data: string): void;
  /** Terminate the session. Idempotent. */
  kill(sessionId: string): Promise<void>;
}
```

- [ ] **Step 4: Verify**

Run:
```bash
npx vitest run src/workflow/terminal-backend.test.ts && npm run check-types
```
Expected: PASS, exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/workflow/terminal-backend.ts src/workflow/terminal-backend.test.ts
git commit -m "feat(terminal): TerminalBackend interface (input in contract from v1)"
```

---

## Phase 2: Option A backend (output-only) behind the interface

### Task 2.1: `VsCodeTerminalBackend` adapting the existing stream

**Files:**
- Create: `src/workflow/vscode-terminal-backend.ts`
- Test: `src/workflow/vscode-terminal-backend.test.ts`

- [ ] **Step 1: Write the failing test (inject a fake terminalExecutor)**

Create `src/workflow/vscode-terminal-backend.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { VsCodeTerminalBackend } from './vscode-terminal-backend';

function fakeExecutor() {
  const cbs = new Map<string, (c: string) => void>();
  return {
    attachWebviewStream: (id: string, cb: (c: string) => void) => { cbs.set(id, cb); return { dispose: () => cbs.delete(id) }; },
    getTerminalOutput: (_id: string) => 'SNAP',
    killTerminal: vi.fn(async () => {}),
    _emit: (id: string, c: string) => cbs.get(id)?.(c),
  };
}

describe('VsCodeTerminalBackend', () => {
  it('is output-only', () => {
    expect(new VsCodeTerminalBackend(fakeExecutor() as any).supportsInput).toBe(false);
  });
  it('delegates snapshot + stream + kill to terminalExecutor', async () => {
    const ex = fakeExecutor();
    const b = new VsCodeTerminalBackend(ex as any);
    expect(b.getSnapshot('a1')).toBe('SNAP');
    const onData = vi.fn();
    b.attach('a1', onData);
    ex._emit('a1', 'chunk');
    expect(onData).toHaveBeenCalledWith('chunk');
    await b.kill('a1');
    expect(ex.killTerminal).toHaveBeenCalledWith('a1');
  });
  it('write() is a safe no-op', () => {
    expect(() => new VsCodeTerminalBackend(fakeExecutor() as any).write('a1', 'ls\r')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/workflow/vscode-terminal-backend.test.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the adapter**

Create `src/workflow/vscode-terminal-backend.ts`:
```typescript
import type * as vscode from 'vscode';
import type { TerminalBackend } from './terminal-backend';

/** Minimal slice of terminalExecutor this backend needs (keeps it unit-testable). */
export interface TerminalStreamSource {
  attachWebviewStream(artifactId: string, cb: (chunk: string) => void): vscode.Disposable;
  getTerminalOutput(artifactId: string): string;
  killTerminal(artifactId: string): Promise<void>;
}

/** Option A: reuse the existing vscode.Terminal + onDidWriteData pipe. Output-only. */
export class VsCodeTerminalBackend implements TerminalBackend {
  readonly supportsInput = false;
  constructor(private readonly source: TerminalStreamSource) {}
  attach(sessionId: string, onData: (chunk: string) => void): vscode.Disposable {
    return this.source.attachWebviewStream(sessionId, onData);
  }
  getSnapshot(sessionId: string): string { return this.source.getTerminalOutput(sessionId); }
  write(_sessionId: string, _data: string): void { /* output-only: intentional no-op */ }
  kill(sessionId: string): Promise<void> { return this.source.killTerminal(sessionId); }
}
```

- [ ] **Step 4: Verify**

Run:
```bash
npx vitest run src/workflow/vscode-terminal-backend.test.ts && npm run check-types
```
Expected: PASS, exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/workflow/vscode-terminal-backend.ts src/workflow/vscode-terminal-backend.test.ts
git commit -m "feat(terminal): VsCodeTerminalBackend (Option A, output-only)"
```

### Task 2.2: Route the message handler through the backend + new protocol

**Files:**
- Create: `src/views/terminal-session-router.ts` (handles `terminal:*` inbound, emits `terminal:*` outbound)
- Test: `src/views/terminal-session-router.test.ts`
- Modify: `src/views/agentic-kanban-message-handler.ts` (delegate `terminal:*` to the router; keep legacy `kanban:jumpToTerminal` for the "pop to VS Code panel" button)

- [ ] **Step 1: Write the failing test**

Create `src/views/terminal-session-router.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { TerminalSessionRouter } from './terminal-session-router';
import { TERMINAL_MSG } from './terminal-protocol';

function fakeBackend() {
  const cbs = new Map<string, (c: string) => void>();
  return {
    supportsInput: false,
    attach: (id: string, cb: (c: string) => void) => { cbs.set(id, cb); return { dispose: () => cbs.delete(id) }; },
    getSnapshot: () => 'SNAP',
    write: vi.fn(),
    kill: vi.fn(async () => {}),
    _emit: (id: string, c: string) => cbs.get(id)?.(c),
  };
}

describe('TerminalSessionRouter', () => {
  it('on open: posts a snapshot then streams data chunks', () => {
    const be = fakeBackend();
    const post = vi.fn();
    const r = new TerminalSessionRouter(be as any, post);
    r.handle({ type: TERMINAL_MSG.open, sessionId: 'a1' });
    expect(post).toHaveBeenCalledWith({ type: TERMINAL_MSG.snapshot, sessionId: 'a1', data: 'SNAP' });
    be._emit('a1', 'xyz');
    expect(post).toHaveBeenCalledWith({ type: TERMINAL_MSG.data, sessionId: 'a1', chunk: 'xyz' });
  });
  it('on input: forwards to backend.write', () => {
    const be = fakeBackend();
    const r = new TerminalSessionRouter(be as any, vi.fn());
    r.handle({ type: TERMINAL_MSG.input, sessionId: 'a1', data: 'ls\r' });
    expect(be.write).toHaveBeenCalledWith('a1', 'ls\r');
  });
  it('on close: detaches the stream (no more data posts)', () => {
    const be = fakeBackend();
    const post = vi.fn();
    const r = new TerminalSessionRouter(be as any, post);
    r.handle({ type: TERMINAL_MSG.open, sessionId: 'a1' });
    r.handle({ type: TERMINAL_MSG.close, sessionId: 'a1' });
    post.mockClear();
    be._emit('a1', 'late');
    expect(post).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/views/terminal-session-router.test.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the router**

Create `src/views/terminal-session-router.ts`:
```typescript
import type * as vscode from 'vscode';
import type { TerminalBackend } from '../workflow/terminal-backend';
import { TERMINAL_MSG, TerminalInbound, TerminalOutbound } from './terminal-protocol';

/** Bridges the backend-agnostic protocol to a TerminalBackend. One per webview. */
export class TerminalSessionRouter {
  private readonly streams = new Map<string, vscode.Disposable>();
  constructor(
    private readonly backend: TerminalBackend,
    private readonly post: (msg: TerminalOutbound) => void,
  ) {}

  handle(msg: TerminalInbound): void {
    switch (msg.type) {
      case TERMINAL_MSG.open: {
        if (this.streams.has(msg.sessionId)) return; // already attached
        this.post({ type: TERMINAL_MSG.snapshot, sessionId: msg.sessionId, data: this.backend.getSnapshot(msg.sessionId) });
        const d = this.backend.attach(msg.sessionId, (chunk) =>
          this.post({ type: TERMINAL_MSG.data, sessionId: msg.sessionId, chunk }));
        this.streams.set(msg.sessionId, d);
        break;
      }
      case TERMINAL_MSG.input:
        this.backend.write(msg.sessionId, msg.data);
        break;
      case TERMINAL_MSG.close:
        this.streams.get(msg.sessionId)?.dispose();
        this.streams.delete(msg.sessionId);
        break;
      case TERMINAL_MSG.kill:
        void this.backend.kill(msg.sessionId);
        break;
    }
  }

  dispose(): void {
    for (const d of this.streams.values()) d.dispose();
    this.streams.clear();
  }
}
```

- [ ] **Step 4: Wire the router into the message handler**

In `src/views/agentic-kanban-message-handler.ts`, near the top of the handler construct a singleton router using a `VsCodeTerminalBackend` over `terminalExecutor`, and dispatch `terminal:*` inbound messages to it. Add (do not remove the legacy `kanban:jumpToTerminal` case — it stays as the "pop out to VS Code panel" affordance):
```typescript
import { isTerminalInbound } from './terminal-protocol';
import { TerminalSessionRouter } from './terminal-session-router';
import { VsCodeTerminalBackend } from '../workflow/vscode-terminal-backend';
import { terminalExecutor } from '../workflow/terminal-executor';

// module-scoped singleton, lazily created with the active webview's postMessage
let terminalRouter: TerminalSessionRouter | undefined;
function getTerminalRouter(webview: vscode.Webview): TerminalSessionRouter {
  if (!terminalRouter) {
    terminalRouter = new TerminalSessionRouter(
      new VsCodeTerminalBackend(terminalExecutor),
      (m) => webview.postMessage(m),
    );
  }
  return terminalRouter;
}
```
Then at the start of the message switch:
```typescript
if (isTerminalInbound(message)) {
  getTerminalRouter(webview).handle(message);
  return true;
}
```

- [ ] **Step 5: Verify**

Run:
```bash
npx vitest run src/views/terminal-session-router.test.ts && npm run check-types
```
Expected: PASS, exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/views/terminal-session-router.ts src/views/terminal-session-router.test.ts src/views/agentic-kanban-message-handler.ts
git commit -m "feat(terminal): route terminal:* protocol through TerminalBackend"
```

---

## Phase 3: The durable UI — xterm.js terminal grid

### Task 3.1: Add xterm.js to the webview and build a single `AgentTerminal`

**Files:**
- Modify: `webview-ui/package.json` (add deps)
- Create: `webview-ui/src/agentic-kanban/AgentTerminal.tsx`
- Test: `webview-ui/src/agentic-kanban/AgentTerminal.test.tsx`

- [ ] **Step 1: Install xterm**

Run:
```bash
cd webview-ui && npm install @xterm/xterm @xterm/addon-fit && cd ..
```
Expected: both added to `webview-ui/package.json` dependencies.

- [ ] **Step 2: Write the failing test (mock the xterm Terminal)**

Create `webview-ui/src/agentic-kanban/AgentTerminal.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AgentTerminal } from './AgentTerminal';
import { TERMINAL_MSG } from '../../../../src/views/terminal-protocol';

const writeSpy = vi.fn();
const disposeSpy = vi.fn();
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(), write: writeSpy, dispose: disposeSpy, onData: vi.fn(),
    loadAddon: vi.fn(), clear: vi.fn(), cols: 80, rows: 24,
  })),
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })) }));

const postMessage = vi.fn();
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: unknown) => postMessage(m) } }));

beforeEach(() => { writeSpy.mockClear(); postMessage.mockClear(); cleanup(); });

describe('AgentTerminal', () => {
  it('posts terminal:open on mount and terminal:close on unmount', () => {
    const { unmount } = render(<AgentTerminal sessionId="a1" />);
    expect(postMessage).toHaveBeenCalledWith({ type: TERMINAL_MSG.open, sessionId: 'a1' });
    unmount();
    expect(postMessage).toHaveBeenCalledWith({ type: TERMINAL_MSG.close, sessionId: 'a1' });
  });
  it('writes incoming data chunks for its sessionId to the terminal', () => {
    render(<AgentTerminal sessionId="a1" />);
    window.dispatchEvent(new MessageEvent('message', { data: { type: TERMINAL_MSG.data, sessionId: 'a1', chunk: 'hi' } }));
    expect(writeSpy).toHaveBeenCalledWith('hi');
  });
  it('ignores chunks for other sessions', () => {
    render(<AgentTerminal sessionId="a1" />);
    window.dispatchEvent(new MessageEvent('message', { data: { type: TERMINAL_MSG.data, sessionId: 'OTHER', chunk: 'no' } }));
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run:
```bash
cd webview-ui && npx vitest run src/agentic-kanban/AgentTerminal.test.tsx; cd ..
```
Expected: FAIL — component missing.

- [ ] **Step 4: Implement `AgentTerminal`**

Create `webview-ui/src/agentic-kanban/AgentTerminal.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { vscode } from '../vscodeApi';
import { TERMINAL_MSG } from '../../../../src/views/terminal-protocol';

interface AgentTerminalProps {
  sessionId: string;
  /** Show + wire an input line. Pass true only when the backend supportsInput. */
  interactive?: boolean;
}

/**
 * One xterm.js instance bound to a single agent session. Output-only by default.
 * Subscribes to `terminal:snapshot` / `terminal:data` for its sessionId and
 * posts `terminal:open` / `terminal:close` for lifecycle. When `interactive`,
 * keystrokes are posted as `terminal:input`.
 */
export function AgentTerminal({ sessionId, interactive = false }: AgentTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const term = new Terminal({ convertEol: true, fontSize: 12, scrollback: 5000, disableStdin: !interactive });
    const fit = new FitAddon();
    term.loadAddon(fit);
    if (hostRef.current) { term.open(hostRef.current); try { fit.fit(); } catch { /* not laid out yet */ } }
    termRef.current = term;

    if (interactive) {
      term.onData((data) => vscode.postMessage({ type: TERMINAL_MSG.input, sessionId, data }));
    }

    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.sessionId !== sessionId) return;
      if (m.type === TERMINAL_MSG.snapshot) { term.clear(); term.write(m.data ?? ''); }
      else if (m.type === TERMINAL_MSG.data) { term.write(m.chunk ?? ''); }
      else if (m.type === TERMINAL_MSG.exit) { term.write(`\r\n\x1b[90m[session ended${m.code != null ? ` (${m.code})` : ''}]\x1b[0m\r\n`); }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: TERMINAL_MSG.open, sessionId });

    return () => {
      window.removeEventListener('message', onMessage);
      vscode.postMessage({ type: TERMINAL_MSG.close, sessionId });
      term.dispose();
      termRef.current = null;
    };
  }, [sessionId, interactive]);

  return <div className="agent-terminal" ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
```

- [ ] **Step 5: Verify**

Run:
```bash
cd webview-ui && npx vitest run src/agentic-kanban/AgentTerminal.test.tsx; cd ..
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webview-ui/package.json webview-ui/package-lock.json webview-ui/src/agentic-kanban/AgentTerminal.tsx webview-ui/src/agentic-kanban/AgentTerminal.test.tsx
git commit -m "feat(webview): AgentTerminal xterm.js component (output-only)"
```

### Task 3.2: Build the multi-pane `TerminalGrid` bound to the session list

**Files:**
- Create: `webview-ui/src/agentic-kanban/TerminalGrid.tsx`
- Create: `webview-ui/src/agentic-kanban/TerminalGrid.css`
- Test: `webview-ui/src/agentic-kanban/TerminalGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `webview-ui/src/agentic-kanban/TerminalGrid.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TerminalGrid } from './TerminalGrid';

vi.mock('./AgentTerminal', () => ({
  AgentTerminal: ({ sessionId }: { sessionId: string }) => <div data-testid="term" data-sid={sessionId} />,
}));

beforeEach(() => cleanup());

describe('TerminalGrid', () => {
  const sessions = [
    { sessionId: 'a1', title: 'Story A', agentRole: 'Crafter', statusKey: 'running' },
    { sessionId: 'a2', title: 'Story B', agentRole: 'Reviewer', statusKey: 'running' },
  ];
  it('renders one AgentTerminal tile per running session', () => {
    render(<TerminalGrid sessions={sessions} />);
    const tiles = screen.getAllByTestId('term');
    expect(tiles.map(t => t.getAttribute('data-sid'))).toEqual(['a1', 'a2']);
  });
  it('renders an empty state when there are no sessions', () => {
    render(<TerminalGrid sessions={[]} />);
    expect(screen.getByText(/no active agents/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd webview-ui && npx vitest run src/agentic-kanban/TerminalGrid.test.tsx; cd ..
```
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the grid + CSS**

Create `webview-ui/src/agentic-kanban/TerminalGrid.tsx`:
```tsx
import { AgentTerminal } from './AgentTerminal';
import './TerminalGrid.css';

export interface TerminalGridSession {
  sessionId: string;          // == artifactId
  title: string;
  agentRole?: string;
  statusKey: string;
}

interface TerminalGridProps {
  sessions: TerminalGridSession[];
  interactive?: boolean;       // pass backend.supportsInput through
}

/** Multi-pane live terminal view — one xterm tile per active agent. */
export function TerminalGrid({ sessions, interactive = false }: TerminalGridProps) {
  if (sessions.length === 0) {
    return <div className="terminal-grid-empty">No active agents.</div>;
  }
  return (
    <div className="terminal-grid" data-count={sessions.length}>
      {sessions.map((s) => (
        <section className="terminal-tile" key={s.sessionId}>
          <header className="terminal-tile-header">
            <span className={`terminal-tile-dot status-${s.statusKey}`} />
            <span className="terminal-tile-title">{s.title}</span>
            {s.agentRole && <span className="terminal-tile-role">{s.agentRole}</span>}
          </header>
          <div className="terminal-tile-body">
            <AgentTerminal sessionId={s.sessionId} interactive={interactive} />
          </div>
        </section>
      ))}
    </div>
  );
}
```

Create `webview-ui/src/agentic-kanban/TerminalGrid.css`:
```css
.terminal-grid { display: grid; gap: 8px; height: 100%;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
.terminal-grid[data-count="1"] { grid-template-columns: 1fr; }
.terminal-tile { display: flex; flex-direction: column; min-height: 220px;
  border: 1px solid var(--vscode-panel-border, #333); border-radius: 6px; overflow: hidden;
  background: var(--vscode-terminal-background, #1e1e1e); }
.terminal-tile-header { display: flex; align-items: center; gap: 8px; padding: 4px 8px;
  font-size: 11px; background: var(--vscode-sideBar-background, #252526); }
.terminal-tile-title { font-weight: 600; }
.terminal-tile-role { margin-left: auto; opacity: .7; }
.terminal-tile-dot { width: 8px; height: 8px; border-radius: 50%; background: #888; }
.terminal-tile-dot.status-running { background: #3fb950; }
.terminal-tile-dot.status-failed, .terminal-tile-dot.status-dead { background: #f85149; }
.terminal-tile-body { flex: 1; min-height: 0; padding: 4px; }
.terminal-grid-empty { padding: 24px; text-align: center; opacity: .6; }
```

- [ ] **Step 4: Verify**

Run:
```bash
cd webview-ui && npx vitest run src/agentic-kanban/TerminalGrid.test.tsx; cd ..
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/agentic-kanban/TerminalGrid.tsx webview-ui/src/agentic-kanban/TerminalGrid.css webview-ui/src/agentic-kanban/TerminalGrid.test.tsx
git commit -m "feat(webview): multi-pane TerminalGrid bound to session list"
```

### Task 3.3: Mount the grid in the canvas and derive sessions from existing state

**Files:**
- Modify: `webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx`

- [ ] **Step 1: Read the current mount region before editing**

Run:
```bash
grep -n "terminalModal\|TerminalModal\|setTerminalModal\|onOpenTerminal" webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx
```
Expected: shows the `terminalModal` state (`:84`), the `onOpenTerminal` wiring (`:927`), and the `<TerminalModal>` render (`:952`).

- [ ] **Step 2: Add a "Terminals" view toggle that renders `TerminalGrid`**

Derive the running sessions from the agent-state the app already holds (the same data feeding agent badges / `AgentSessionRow`). Map each running agent to a `TerminalGridSession` `{ sessionId: artifactId, title, agentRole, statusKey }`. Add a board/terminals toggle (e.g. a header tab) and render:
```tsx
{view === 'terminals'
  ? <TerminalGrid sessions={runningSessions} interactive={false} />
  : /* existing kanban board JSX */ }
```
Keep `TerminalModal` for now as the single-session "pop" affordance (removed in Task 3.4 once the grid is proven). `interactive={false}` because Option A is output-only; this flips to `true` automatically in Phase 4.

- [ ] **Step 3: Build the webview**

Run:
```bash
cd webview-ui && npm run build; cd ..
```
Expected: Vite build exits 0 (xterm bundles cleanly; CSP needs no change — xterm is pure JS/canvas under the existing `script-src ${cspSource}`).

- [ ] **Step 4: Full webview test run**

Run:
```bash
cd webview-ui && npx vitest run; cd ..
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx
git commit -m "feat(webview): mount TerminalGrid as a Terminals view in the canvas"
```

### Task 3.4: Manual verification + retire the plaintext modal

**Files:**
- Modify: `webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx` (remove `TerminalModal` usage once grid is confirmed)
- Delete: `webview-ui/src/agentic-kanban/TerminalModal.tsx`

- [ ] **Step 1: Full compile**

Run:
```bash
npm run compile
```
Expected: `check-types` + `bundle` + `compile-webview` all exit 0.

- [ ] **Step 2: Manual smoke (F5 Extension Development Host)**

Launch the extension, open the Agentic Kanban canvas, drag a story into `in-progress` (or let the scheduler pick one), switch to the **Terminals** view. Confirm: a live tile appears, **ANSI colors render correctly** (Claude Code's status line / spinners look right, not as escape gibberish), and a second concurrent agent shows a second tile. This is the headline acceptance.

- [ ] **Step 3: Remove the superseded modal**

Once the grid is confirmed, delete `TerminalModal.tsx` and its references in `AgenticKanbanApp.tsx` (the `terminalModal` state, the `<TerminalModal>` render, the `onOpenTerminal` setter). Keep `kanban:jumpToTerminal` (the "open in VS Code panel" escape hatch) — it's still useful.

- [ ] **Step 4: Verify + commit**

Run:
```bash
npm run compile && cd webview-ui && npx vitest run; cd ..
```
Expected: exits 0, all pass.
```bash
git rm webview-ui/src/agentic-kanban/TerminalModal.tsx
git add webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx
git commit -m "refactor(webview): retire plaintext TerminalModal in favor of xterm grid"
```

> **Milestone:** "watch the fleet" ships here. Phases 0–3 are independent of node-pty. If Phase 0 was NO-GO the feature is still complete (output-only).

---

## Phase 4: Option B — true interaction via node-pty (BLOCKED on Phase 0 = GO)

> Do not start until `docs/superpowers/plans/node-pty-spike-result.md` records **GO**. The interface and UI from Phases 1–3 do not change; only a new backend is added and `interactive` flips to `true`.

### Task 4.1: Add node-pty as an externalized native dependency

**Files:**
- Modify: `package.json` (dependency + packaging step), `esbuild.mjs` (external + copy)

- [ ] **Step 1: Add the dependency and externalize it**

Run:
```bash
npm install node-pty
```
Then in `esbuild.mjs`, add `'node-pty'` to `external` (alongside `'vscode'`) so esbuild does not try to bundle the native module:
```js
external: ['vscode', 'node-pty'],
```

- [ ] **Step 2: Copy the native module into `dist` at bundle time**

Following the existing `copyPdfkitFontData()` pattern in `esbuild.mjs`, add a `copyNodePty()` that copies `node_modules/node-pty` (built/rebuilt for the target Electron ABI per the Phase 0 result doc) into `dist/node_modules/node-pty`, and call it after `esbuild.build`. Use the exact rebuild/prebuild approach recorded in `node-pty-spike-result.md`.

- [ ] **Step 3: Verify the bundle loads node-pty**

Run:
```bash
npm run bundle && node -e "require('./dist/extension.js')" 2>&1 | head -5 || true
```
Expected: no "Cannot find module 'node-pty'" error. (A `vscode`-not-found error is fine — that's provided by the host.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json esbuild.mjs
git commit -m "build(terminal): externalize + ship node-pty native module"
```

### Task 4.2: Implement `NodePtyTerminalBackend` behind the existing interface

**Files:**
- Create: `src/workflow/node-pty-terminal-backend.ts`
- Test: `src/workflow/node-pty-terminal-backend.test.ts` (mock `node-pty`)

- [ ] **Step 1: Write the failing test (mock node-pty.spawn)**

Create `src/workflow/node-pty-terminal-backend.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

const onDataCbs = new Map<string, (d: string) => void>();
const writeSpy = vi.fn();
const killSpy = vi.fn();
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: (cb: (d: string) => void) => { onDataCbs.set('p', cb); },
    onExit: vi.fn(),
    write: writeSpy,
    kill: killSpy,
  })),
}));

import { NodePtyTerminalBackend } from './node-pty-terminal-backend';

describe('NodePtyTerminalBackend', () => {
  it('supports input', () => {
    expect(new NodePtyTerminalBackend().supportsInput).toBe(true);
  });
  it('spawns, streams output, and forwards write()', () => {
    const b = new NodePtyTerminalBackend();
    b.spawnSession('a1', 'bash', [], process.cwd());
    const onData = vi.fn();
    b.attach('a1', onData);
    onDataCbs.get('p')!('hello');
    expect(onData).toHaveBeenCalledWith('hello');
    b.write('a1', 'ls\r');
    expect(writeSpy).toHaveBeenCalledWith('ls\r');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npx vitest run src/workflow/node-pty-terminal-backend.test.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the backend**

Create `src/workflow/node-pty-terminal-backend.ts` implementing `TerminalBackend` with `supportsInput = true`. It owns a `Map<sessionId, IPty>`, keeps a rolling `accumulatedData` buffer per session for `getSnapshot`, fans `onData` out to attached listeners, forwards `write`, and `kill`s the pty. `spawnSession(sessionId, file, args, cwd)` is called by the orchestrator's terminal path instead of `vscode.window.createTerminal`. Import `node-pty` lazily (`const pty = require('node-pty')`) so a missing native module degrades gracefully to Option A rather than crashing activation.

- [ ] **Step 4: Verify**

Run:
```bash
npx vitest run src/workflow/node-pty-terminal-backend.test.ts && npm run check-types
```
Expected: PASS, exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/workflow/node-pty-terminal-backend.ts src/workflow/node-pty-terminal-backend.test.ts
git commit -m "feat(terminal): NodePtyTerminalBackend (Option B, bidirectional)"
```

### Task 4.3: Select the backend by setting + enable interactive input

**Files:**
- Modify: `package.json` (new `agileagentcanvas.agenticKanban.embeddedTerminal` boolean setting)
- Modify: `src/views/agentic-kanban-message-handler.ts` (choose backend by setting; pass `supportsInput` to the webview)
- Modify: `webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx` (pass `interactive={supportsInput}` to `TerminalGrid`)

- [ ] **Step 1: Add the setting**

In `package.json` `contributes.configuration`, add `agileagentcanvas.agenticKanban.embeddedTerminal` (boolean, default `false`) — "Run agents in an embedded node-pty terminal you can type into, instead of the VS Code terminal panel."

- [ ] **Step 2: Choose the backend in the router factory**

In `getTerminalRouter`, read the setting; when `true` **and** node-pty loaded, use `NodePtyTerminalBackend`, else `VsCodeTerminalBackend`. Post the backend's `supportsInput` to the webview once (e.g. a `terminal:capabilities` message or include it in the existing init payload) so the grid knows whether to enable input.

- [ ] **Step 3: Flip the grid to interactive when supported**

In `AgenticKanbanApp.tsx`, store `supportsInput` from the capabilities message and pass `interactive={supportsInput}` to `TerminalGrid`. No other UI change — `AgentTerminal` already wires `onData → terminal:input`.

- [ ] **Step 4: Manual verification (F5)**

With the setting ON, launch an agent, switch to Terminals view, **type a command into a live tile**, confirm it reaches the agent process. With the setting OFF, confirm Option A still works (read-only tiles).

- [ ] **Step 5: Verify + commit**

Run:
```bash
npm run compile && npx vitest run && cd webview-ui && npx vitest run; cd ..
```
Expected: all green.
```bash
git add package.json src/views/agentic-kanban-message-handler.ts webview-ui/src/agentic-kanban/AgenticKanbanApp.tsx
git commit -m "feat(terminal): opt-in embedded interactive terminal via node-pty"
```

---

## Phase 5: Final verification & docs

### Task 5.1: Full build, suites, and doc update

- [ ] **Step 1: Full compile + both test suites**

Run:
```bash
npm run compile && npx vitest run && cd webview-ui && npx vitest run; cd .. && npm test
```
Expected: extension Vitest, webview Vitest, and Cucumber all green (or Cucumber matches the pre-existing known set).

- [ ] **Step 2: Update the audit doc**

In `docs/agent-os-control-center-audit.md`: mark §3 / §6 P0 #1–#2 (xterm grid) as **shipped**; note the `TerminalBackend` seam and that interactive input is opt-in via `agenticKanban.embeddedTerminal` (Phase 4). Leave §6 P0 #3 (in-canvas diff review) as the next priority.

- [ ] **Step 3: Commit + PR**

```bash
git add docs/agent-os-control-center-audit.md
git commit -m "docs: mark embedded terminal grid shipped in control-center audit"
git push -u origin feat/embedded-agent-terminal-grid
gh pr create --title "Embedded multi-agent xterm.js terminal grid" \
  --body "Implements docs/superpowers/plans/2026-06-19-embedded-agent-terminal-grid.md. Phases 0-3 (output-only watch) ship independently; Phase 4 (node-pty interactive) is opt-in and gated on the node-pty packaging spike."
```

---

## Self-review checklist (run before handing off)

- **First-time-right seam:** the protocol (`terminal-protocol.ts`) and `AgentTerminal`/`TerminalGrid` UI are written once and are **identical** for Option A and Option B; only the backend swaps. `terminal:input` exists in the protocol from Task 1.1 though no backend uses it until Phase 4. ✓
- **No forked identity:** `sessionId === artifactId` everywhere — matches the existing stream key and `AgentSessionRow.artifactId`. ✓
- **Risk retired first:** node-pty packaging is Phase 0, a throwaway go/no-go gate, before any Option B commitment. ✓
- **Headline ships early & standalone:** Phases 0–3 deliver "watch the fleet" with zero native-module dependency; if Phase 0 is NO-GO the feature is still complete (output-only). ✓
- **Type consistency:** `TerminalBackend` (`supportsInput`, `attach`, `getSnapshot`, `write`, `kill`), `TERMINAL_MSG` keys, and `TerminalGridSession`/`sessionId` are used identically across all tasks. ✓
- **Placeholder scan:** Phase 4.1 Step 2 and Phase 4.2 Step 3 describe behavior that legitimately depends on the Phase 0 spike's recorded packaging approach — they reference a concrete artifact (`node-pty-spike-result.md`), not a TODO. ✓

---

## Execution options

**1. Subagent-Driven (recommended)** — one subagent per task with review between. Phase 0 is a natural standalone (its result gates Phase 4).

**2. Inline Execution** — checkpoint after each phase; pause at the Phase 0 GO/NO-GO and at the Task 3.4 manual smoke.

Recommended PR split: **Phases 0–3 as one PR** (the complete watch feature), **Phase 4 as a separate PR** (interactive, opt-in, native-module change reviewed in isolation).
