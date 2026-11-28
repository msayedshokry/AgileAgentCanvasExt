import { describe, it, expect, vi } from 'vitest';
import { handleRpc } from './mcp-protocol';
import { BOARD_TOOLS } from './board-tools';

const ok = vi.fn(async (tool: string) => ({ ok: true, text: `did ${tool}` }));

describe('handleRpc', () => {
  it('answers initialize with the client\'s protocol version and the tools capability', async () => {
    expect(await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, ok)).toEqual({
      jsonrpc: '2.0', id: 1,
      result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'aac_board', version: '1.0.0' } },
    });
  });

  it('lists the board tools, each with an object input schema', async () => {
    const res = await handleRpc({ id: 2, method: 'tools/list' }, ok) as { result: { tools: typeof BOARD_TOOLS } };
    expect(res.result.tools.map((t) => t.name)).toEqual([
      'board_get_card', 'board_list_epic', 'board_note', 'board_ask', 'board_propose', 'board_check_messages', 'board_handoff',
      'board_recall', 'board_remember',
    ]);
    for (const t of res.result.tools) expect(t.inputSchema).toMatchObject({ type: 'object' });
  });

  it('forwards a tool call and returns its text as content', async () => {
    expect(await handleRpc({ id: 3, method: 'tools/call', params: { name: 'board_note', arguments: { text: 'hi' } } }, ok)).toEqual({
      jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: 'did board_note' }], isError: false },
    });
    expect(ok).toHaveBeenCalledWith('board_note', { text: 'hi' });
  });

  it('reports refused calls and an unreachable board as tool errors the agent can act on', async () => {
    const refused = await handleRpc({ id: 4, method: 'tools/call', params: { name: 'board_note', arguments: {} } }, async () => ({ ok: false, text: 'text is required' }));
    expect(refused).toMatchObject({ result: { isError: true, content: [{ text: 'text is required' }] } });
    const down = await handleRpc({ id: 5, method: 'tools/call', params: { name: 'board_note', arguments: {} } }, async () => { throw new Error('ECONNREFUSED'); });
    expect(down).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(down)).toContain('verdict');
  });

  it('rejects unknown tools and methods, ignores notifications, answers ping', async () => {
    expect(await handleRpc({ id: 6, method: 'tools/call', params: { name: 'rm_rf' } }, ok)).toMatchObject({ error: { code: -32602 } });
    expect(await handleRpc({ id: 7, method: 'resources/list' }, ok)).toMatchObject({ error: { code: -32601 } });
    expect(await handleRpc({ method: 'notifications/initialized' }, ok)).toBeUndefined();
    expect(await handleRpc({ id: 8, method: 'ping' }, ok)).toEqual({ jsonrpc: '2.0', id: 8, result: {} });
  });
});
