import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addBoardHost, boardHostCount, clearBoardHosts, onBoardHostAdded, postToBoardHosts } from './board-hosts';

const webview = (post: (m: unknown) => unknown = () => true) => ({ postMessage: vi.fn(post) }) as never as import('vscode').Webview;

beforeEach(() => clearBoardHosts());

describe('board hosts', () => {
  it('posts live updates to every webview showing the board, except the one already posted to', () => {
    const canvasTab = webview();
    const boardView = webview();
    addBoardHost(canvasTab);
    addBoardHost(boardView);
    addBoardHost(canvasTab); // joins once
    postToBoardHosts({ type: 'agentStateUpdated' }, boardView);
    expect((canvasTab.postMessage as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ type: 'agentStateUpdated' });
    expect((boardView.postMessage as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('announces a new board webview once, so it can catch up on run states', () => {
    const seen = vi.fn();
    const sub = onBoardHostAdded(seen);
    const tab = webview();
    addBoardHost(tab);
    addBoardHost(tab);
    expect(seen).toHaveBeenCalledTimes(1);
    sub.dispose();
  });

  it('drops a webview whose panel was closed', async () => {
    addBoardHost(webview(() => { throw new Error('Webview is disposed'); }));
    addBoardHost(webview(() => Promise.reject(new Error('disposed'))));
    addBoardHost(webview());
    postToBoardHosts({ type: 'x' });
    await new Promise((r) => setTimeout(r, 0));
    expect(boardHostCount()).toBe(1);
  });
});
