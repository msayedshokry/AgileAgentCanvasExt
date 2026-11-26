// ─── Board endpoint for agents' MCP shim ─────────────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L1 and Safety.) A small HTTP
// endpoint on 127.0.0.1 (random port) that the per-run MCP shim forwards tool
// calls to. Each run gets its own token, valid only while the run is going
// and only for that run's card; tokens are kept as SHA-256 hashes, so a
// lookup never compares secrets. Only `POST /tool` with a JSON body under
// 64 KB is accepted. The tool logic is injected (views/board-live.ts).

import * as crypto from 'crypto';
import * as http from 'http';
import { checkToolArgs, findBoardTool } from './board-tools';

export interface RunScope {
  readonly runId: string;
  readonly cardId: string;
  readonly agentId?: string;
  readonly agentName?: string;
}

export interface ToolResult { readonly ok: boolean; readonly text: string }
export type ToolHandler = (scope: RunScope, tool: string, args: Record<string, unknown>) => Promise<ToolResult>;

const MAX_BODY_BYTES = 64 * 1024;
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export class BoardLiveServer {
  private server: http.Server | undefined;
  private url: string | undefined;
  private readonly scopes = new Map<string, RunScope>();

  constructor(private readonly handler: ToolHandler) {}

  /** Start once; resolves with the endpoint URL. */
  async start(): Promise<string> {
    if (this.url) return this.url;
    const server = http.createServer((req, res) => { void this.serve(req, res); });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('board endpoint has no port');
    this.server = server;
    this.url = `http://127.0.0.1:${addr.port}/tool`;
    return this.url;
  }

  /** A token for one run; revoke it when the run ends. */
  issue(scope: RunScope): string {
    const token = crypto.randomBytes(32).toString('base64url');
    this.scopes.set(hash(token), scope);
    return token;
  }

  revoke(token: string): void {
    this.scopes.delete(hash(token));
  }

  /** Scopes of runs whose tokens are live (for tests and diagnostics). */
  liveRuns(): RunScope[] {
    return [...this.scopes.values()];
  }

  async stop(): Promise<void> {
    this.scopes.clear();
    const s = this.server;
    this.server = undefined;
    this.url = undefined;
    if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
  }

  private async serve(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const send = (status: number, body: ToolResult) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== '/tool') return send(404, { ok: false, text: 'not found' });
    const auth = req.headers.authorization ?? '';
    const scope = auth.startsWith('Bearer ') ? this.scopes.get(hash(auth.slice(7))) : undefined;
    if (!scope) return send(401, { ok: false, text: 'This run\'s board access has ended. Put what you wanted in the "board" object of your verdict.' });

    let body = '';
    let size = 0;
    try {
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY_BYTES) return send(413, { ok: false, text: 'request too large' });
        body += chunk;
      }
      const { tool, args } = JSON.parse(body) as { tool?: unknown; args?: unknown };
      const def = typeof tool === 'string' ? findBoardTool(tool) : undefined;
      if (!def) return send(400, { ok: false, text: `Unknown tool: ${String(tool)}` });
      const problem = checkToolArgs(def, args);
      if (problem) return send(200, { ok: false, text: problem });
      send(200, await this.handler(scope, def.name, (args ?? {}) as Record<string, unknown>));
    } catch (err) {
      send(400, { ok: false, text: `Bad request: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}
