// Real HTTP on 127.0.0.1: the endpoint, tokens, and the shim's forwarding.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as http from 'http';
import { BoardLiveServer, type ToolHandler } from './board-server';
import { checkToolArgs, findBoardTool } from './board-tools';
import { handleRpc } from './mcp-protocol';
import { makeForward } from '../../board-mcp/board-mcp-shim';

let server: BoardLiveServer | undefined;
afterEach(async () => { await server?.stop(); server = undefined; });

function post(url: string, body: string, token?: string, path = '/tool'): Promise<{ status: number; json: { ok: boolean; text: string } }> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path, method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('BoardLiveServer', () => {
  const handler: ToolHandler = vi.fn(async (scope, tool, args) => ({ ok: true, text: `${tool} on ${scope.cardId}: ${JSON.stringify(args)}` }));

  it('listens on 127.0.0.1 only and runs a tool for a live token, scoped to its card', async () => {
    server = new BoardLiveServer(handler);
    const url = await server.start();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/tool$/);
    const token = server.issue({ runId: 'r1', cardId: 'S-1', agentId: 'dev' });
    const res = await post(url, JSON.stringify({ tool: 'board_note', args: { text: 'hello' } }), token);
    expect(res).toEqual({ status: 200, json: { ok: true, text: 'board_note on S-1: {"text":"hello"}' } });
  });

  it('refuses missing, wrong and revoked tokens', async () => {
    server = new BoardLiveServer(handler);
    const url = await server.start();
    const token = server.issue({ runId: 'r1', cardId: 'S-1' });
    expect((await post(url, '{}')).status).toBe(401);
    expect((await post(url, '{}', 'not-a-token')).status).toBe(401);
    server.revoke(token);
    const revoked = await post(url, JSON.stringify({ tool: 'board_note', args: { text: 'x' } }), token);
    expect(revoked.status).toBe(401);
    expect(revoked.json.text).toMatch(/verdict/);
    expect(server.liveRuns()).toEqual([]);
  });

  it('checks the tool and its arguments before running anything', async () => {
    server = new BoardLiveServer(handler);
    const url = await server.start();
    const token = server.issue({ runId: 'r1', cardId: 'S-1' });
    vi.mocked(handler).mockClear();
    expect((await post(url, JSON.stringify({ tool: 'shell', args: {} }), token)).status).toBe(400);
    expect((await post(url, JSON.stringify({ tool: 'board_note', args: {} }), token)).json).toEqual({ ok: false, text: 'text is required' });
    expect((await post(url, JSON.stringify({ tool: 'board_note', args: { text: 'x', card: 'S-9' } }), token)).json.text).toBe('card is not an argument of this tool');
    expect((await post(url, 'not json', token)).status).toBe(400);
    expect((await post(url, '{}', token, '/other')).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects oversized requests', async () => {
    server = new BoardLiveServer(handler);
    const url = await server.start();
    const token = server.issue({ runId: 'r1', cardId: 'S-1' });
    expect((await post(url, 'x'.repeat(70 * 1024), token)).status).toBe(413);
  });

  it('round-trips an MCP tools/call through the shim forwarding to the endpoint', async () => {
    server = new BoardLiveServer(handler);
    const url = await server.start();
    const forward = makeForward(url, server.issue({ runId: 'r1', cardId: 'S-7' }));
    const reply = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'board_note', arguments: { text: 'via MCP' } } }, forward);
    expect(reply).toEqual({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'board_note on S-7: {"text":"via MCP"}' }], isError: false } });
  });
});

describe('checkToolArgs', () => {
  it('follows each tool schema: required fields, lengths and list sizes', () => {
    const ask = findBoardTool('board_ask')!;
    expect(checkToolArgs(ask, { questions: ['a'] })).toBeUndefined();
    expect(checkToolArgs(ask, { questions: [] })).toBe('questions needs at least 1 item(s)');
    expect(checkToolArgs(ask, { questions: ['a', 'b', 'c', 'd'] })).toBe('questions allows at most 3 item(s)');
    expect(checkToolArgs(findBoardTool('board_note')!, { text: 'x'.repeat(2001) })).toBe('text is longer than 2000 characters');
    expect(checkToolArgs(findBoardTool('board_propose')!, { proposals: [{ description: 'no title' }] })).toBe('proposals[0].title is required');
  });
});
