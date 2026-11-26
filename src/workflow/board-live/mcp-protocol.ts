// ─── Minimal MCP (stdio) protocol for the board shim ─────────────────────────
// MCP over stdio is newline-delimited JSON-RPC 2.0. The shim needs only
// initialize, tools/list, tools/call and ping; notifications (no id) get no
// reply. Pure: the transport and the forwarding are passed in, so the
// protocol is unit-tested without spawning anything.

import { BOARD_SERVER_NAME, BOARD_TOOLS, findBoardTool } from './board-tools';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export interface RpcRequest {
  readonly jsonrpc?: string;
  readonly id?: string | number | null;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
}

export type Forward = (tool: string, args: Record<string, unknown>) => Promise<{ ok: boolean; text: string }>;

const reply = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** The reply to one message, or undefined for notifications. Never throws. */
export async function handleRpc(msg: RpcRequest, forward: Forward): Promise<Record<string, unknown> | undefined> {
  if (msg.id === undefined || msg.id === null) return undefined; // notification
  switch (msg.method) {
    case 'initialize':
      return reply(msg.id, {
        protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: BOARD_SERVER_NAME, version: '1.0.0' },
      });
    case 'ping':
      return reply(msg.id, {});
    case 'tools/list':
      return reply(msg.id, { tools: BOARD_TOOLS });
    case 'tools/call': {
      const name = typeof msg.params?.name === 'string' ? msg.params.name : '';
      if (!findBoardTool(name)) return fail(msg.id, -32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {}) as Record<string, unknown>;
      try {
        const out = await forward(name, args);
        return reply(msg.id, { content: [{ type: 'text', text: out.text }], isError: !out.ok });
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        return reply(msg.id, {
          content: [{ type: 'text', text: `The board is not reachable (${why}). Put what you wanted in the "board" object of your verdict instead.` }],
          isError: true,
        });
      }
    }
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method ?? ''}`);
  }
}
