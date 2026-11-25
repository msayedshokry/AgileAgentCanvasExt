import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const state = vi.hoisted(() => ({ outputFolder: '', enabled: true }));
const executeAndAwaitVerdict = vi.hoisted(() => vi.fn());

vi.mock('../kanban-verdict', () => ({ getOutputFolder: () => state.outputFolder }));
vi.mock('../terminal-executor', () => ({ terminalExecutor: { executeAndAwaitVerdict } }));
const needsYou = vi.hoisted(() => ({ notifyNeedsYou: vi.fn(), dismissNeedsYou: vi.fn() }));
vi.mock('../../views/needs-you', () => needsYou);

import { AutopilotScheduler } from './autopilot-scheduler';

const NINE = new Date(2026, 10, 25, 9, 0, 5);
const writeConfig = (entries: unknown[]) =>
  fs.writeFileSync(path.join(state.outputFolder, 'autopilots.json'), JSON.stringify({ autopilots: entries }));
const daily = { id: 'daily', name: 'Daily summary', schedule: '0 9 * * *', runbook: 'Summarise the sprint' };

beforeEach(() => {
  state.outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-sched-'));
  state.enabled = true;
  executeAndAwaitVerdict.mockReset().mockResolvedValue({ verdict: 'COMPLETED', summary: 'ok' });
  vi.mocked(vscode.window.showWarningMessage).mockClear();
  needsYou.notifyNeedsYou.mockClear();
  needsYou.dismissNeedsYou.mockClear();
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: (key: string, fallback?: unknown) => (key === 'autopilots.enabled' ? state.enabled : fallback),
  } as unknown as vscode.WorkspaceConfiguration);
});
afterEach(() => { fs.rmSync(state.outputFolder, { recursive: true, force: true }); });

describe('AutopilotScheduler.tick', () => {
  it('does nothing while autopilots are turned off', () => {
    state.enabled = false;
    writeConfig([daily]);
    new AutopilotScheduler().tick(NINE);
    expect(executeAndAwaitVerdict).not.toHaveBeenCalled();
  });

  it('runs a due autopilot once per minute with its runbook and a fresh session', async () => {
    writeConfig([daily]);
    const scheduler = new AutopilotScheduler();
    scheduler.tick(NINE);
    scheduler.tick(new Date(NINE.getTime() + 20_000));
    await vi.waitFor(() => expect(executeAndAwaitVerdict).toHaveBeenCalledTimes(1));
    const [workflowId, artifact, , options] = executeAndAwaitVerdict.mock.calls[0];
    expect(workflowId).toBe('autopilot-daily');
    expect(artifact).toMatchObject({ id: 'AUTOPILOT-daily' });
    expect(options).toMatchObject({ freshSession: true });
    expect(options.skillContent).toContain('Summarise the sprint');
  });

  it('lets only one of two windows run the same scheduled minute', async () => {
    writeConfig([daily]);
    new AutopilotScheduler().tick(NINE);
    new AutopilotScheduler().tick(NINE);
    await vi.waitFor(() => expect(executeAndAwaitVerdict).toHaveBeenCalledTimes(1));
  });

  it('sends a scheduled run that needs a person to the Inbox, not a popup', async () => {
    executeAndAwaitVerdict.mockResolvedValue({ verdict: 'BLOCKED', summary: 'knip is not installed' });
    writeConfig([daily]);
    new AutopilotScheduler().tick(NINE);
    await vi.waitFor(() => expect(needsYou.notifyNeedsYou).toHaveBeenCalledWith(
      'AUTOPILOT-daily', 'autopilot', 'Autopilot "Daily summary": BLOCKED — knip is not installed'));
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('clears the Inbox item once a later run succeeds', async () => {
    writeConfig([daily]);
    new AutopilotScheduler().tick(NINE);
    await vi.waitFor(() => expect(needsYou.dismissNeedsYou).toHaveBeenCalledWith('AUTOPILOT-daily'));
    expect(needsYou.notifyNeedsYou).not.toHaveBeenCalled();
  });

  it('still tells the user directly when a run they started by hand needs them', async () => {
    executeAndAwaitVerdict.mockResolvedValue({ verdict: 'BLOCKED', summary: 'knip is not installed' });
    await new AutopilotScheduler().run(daily as never, 'manual');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Autopilot "Daily summary" needs attention: BLOCKED — knip is not installed');
  });

  it('reports config problems once, not on every tick', () => {
    writeConfig([{ id: 'Bad Id', schedule: '* * * * *', runbook: 'x' }]);
    const scheduler = new AutopilotScheduler();
    scheduler.tick(NINE);
    scheduler.tick(NINE);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
  });

  it('warns once when the claims folder cannot be written, instead of silently never running', () => {
    writeConfig([{ ...daily, schedule: '* * * * *' }]);
    fs.writeFileSync(path.join(state.outputFolder, '.autopilot-claims'), 'not a folder');
    const scheduler = new AutopilotScheduler();
    expect(() => scheduler.tick(NINE)).not.toThrow();
    scheduler.tick(new Date(NINE.getTime() + 60_000));
    expect(executeAndAwaitVerdict).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0][0]).toMatch(/^Autopilot "Daily summary" could not claim its run: /);
  });
});
