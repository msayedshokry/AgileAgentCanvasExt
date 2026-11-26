// ─── Board MCP shim (bundled to dist/board-mcp.js) ───────────────────────────
// The process a CLI agent starts for the `aac_board` MCP server. It speaks MCP
// on stdio and forwards tool calls to the extension's board endpoint. The
// endpoint URL and the run's token come from a private credentials file
// (`--credentials <file>`), so the token never appears on a command line.
// Runs on VS Code's own runtime (ELECTRON_RUN_AS_NODE=1), so no separate
// Node install is needed.

import * as fs from 'fs';
import * as http from 'http';
import * as readline from 'readline';
import { handleRpc, type Forward } from '../workflow/board-live/mcp-protocol';

/** board_ask may wait 10 minutes for the user; allow a little more. */
const CALL_TIMEOUT_MS = 11 * 60_000;

function readCredentials(argv: readonly string[]): { url: string; token: string } {
  const at = argv.indexOf('--credentials');
  const file = at >= 0 ? argv[at + 1] : undefined;
  if (!file) throw new Error('missing --credentials <file>');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { url?: unknown; token?: unknown };
  if (typeof parsed.url !== 'string' || typeof parsed.token !== 'string') throw new Error('credentials file is incomplete');
  return { url: parsed.url, token: parsed.token };
}

export function makeForward(url: string, token: string): Forward {
  return (tool, args) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ tool, args });
    const req = http.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), authorization: `Bearer ${token}` },
      timeout: CALL_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const out = JSON.parse(data) as { ok?: unknown; text?: unknown };
          resolve({ ok: out.ok === true, text: typeof out.text === 'string' ? out.text : '' });
        } catch {
          reject(new Error(`bad reply (HTTP ${res.statusCode})`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

function main(): void {
  let forward: Forward;
  try {
    const { url, token } = readCredentials(process.argv);
    forward = makeForward(url, token);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    forward = async () => { throw new Error(why); };
  }
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    void handleRpc(msg as Record<string, unknown>, forward).then((reply) => {
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
    });
  });
  rl.on('close', () => process.exit(0));
}

if (require.main === module) main();
