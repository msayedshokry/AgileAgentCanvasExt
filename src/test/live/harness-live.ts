// Live extension-host test for the agent harness runtime. Runs inside a real
// VS Code window (real integrated terminals, the user's default shell) via
// --extensionTestsPath; launched by scripts/_demo/run-live-harness-test.ts.
//
// Fake CLIs on PATH stand in for the harness unless AAC_LIVE_MODEL_HARNESS
// names a real one (e.g. aider against a local model server).

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TerminalExecutor } from '../../workflow/terminal-executor';
import { getHarnessAdapter } from '../../workflow/harness/harness-adapters';
import { RunJournal, type RunRecord } from '../../workflow/harness/run-journal';
import { recoverRuns, type RecoveryOutcome } from '../../workflow/harness/run-recovery';
import { getOutputFolder, readVerdictFile, verdictMatchesRun } from '../../workflow/kanban-verdict';

interface CaseResult { name: string; ok: boolean; detail: string; ms: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(200);
  }
  return pred();
}

const terminalNamed = (name: string) => vscode.window.terminals.some((t) => t.name === name);

function cliResolution(id: string) {
  const adapter = getHarnessAdapter(id)!;
  return { kind: 'cli' as const, adapter, binary: adapter.binaries[0], reason: 'live test' };
}

export async function run(): Promise<void> {
  const results: CaseResult[] = [];
  const resultFile = process.env.AAC_LIVE_RESULT!;
  const exec = new TerminalExecutor();
  const check = async (name: string, fn: () => Promise<string>) => {
    const started = Date.now();
    try {
      results.push({ name, ok: true, detail: await fn(), ms: Date.now() - started });
    } catch (err) {
      results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Date.now() - started });
    }
    fs.writeFileSync(resultFile, JSON.stringify({ shell: vscode.env.shell, results }, null, 2));
  };
  const expect = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

  // (a) stdin harness (PowerShell pipe on Windows) end to end.
  await check('stdin harness (claude shim) -> COMPLETED in a real terminal', async () => {
    const v = await exec.executeAndAwaitVerdict('dev-story', { id: 'LIVE-1', type: 'story', title: 'live' }, {},
      { resolution: cliResolution('claude'), pollIntervalMs: 500, timeoutMs: 120_000 });
    expect(v.verdict === 'COMPLETED', `verdict ${v.verdict}: ${v.summary}`);
    expect(v.runId?.startsWith('term-dev-story-LIVE-1-') === true, `run id not echoed: ${v.runId}`);
    return `${v.verdict} (run ${v.runId})`;
  });

  // (a') pointer harness end to end.
  await check('pointer harness (cursor-agent shim) -> COMPLETED', async () => {
    const v = await exec.executeAndAwaitVerdict('dev-story', { id: 'LIVE-P', type: 'story', title: 'live' }, {},
      { resolution: cliResolution('cursor-agent'), pollIntervalMs: 500, timeoutMs: 120_000 });
    expect(v.verdict === 'COMPLETED', `verdict ${v.verdict}: ${v.summary}`);
    return v.verdict;
  });

  // (b) abort mid-run kills the agent terminal.
  await check('abort mid-run -> UNKNOWN "Run aborted" and terminal closed', async () => {
    const ac = new AbortController();
    const pending = exec.executeAndAwaitVerdict('dev-story', { id: 'LIVE-SLOW-2', type: 'story', title: 'LIVE-SLOW' }, {},
      { resolution: cliResolution('claude'), pollIntervalMs: 500, timeoutMs: 120_000, signal: ac.signal });
    const name = 'AAC: dev-story LIVE-SLOW-2';
    expect(await waitFor(() => terminalNamed(name), 15_000), 'agent terminal never appeared');
    await sleep(2000);
    ac.abort();
    const v = await pending;
    expect(v.verdict === 'UNKNOWN' && v.summary === 'Run aborted', `got ${v.verdict}: ${v.summary}`);
    expect(await waitFor(() => !terminalNamed(name), 10_000), 'terminal still open after abort');
    return 'aborted, terminal gone';
  });

  // (c) reload recovery against real terminals.
  await check('recovery: live terminal re-adopted, then interrupted when it dies; ghost run interrupted', async () => {
    const id = await exec.executeTerminalWorkflow('dev-story', { id: 'LIVE-SLOW-3', type: 'story', title: 'LIVE-SLOW' }, {},
      { resolution: cliResolution('claude'), revertStatusOnInterrupt: 'ready-for-dev' });
    expect(!!id, 'launch failed');
    const name = 'AAC: dev-story LIVE-SLOW-3';
    expect(await waitFor(() => terminalNamed(name), 15_000), 'agent terminal never appeared');

    const journal = RunJournal.inFolder(getOutputFolder());
    const ghost: RunRecord = {
      runId: 'ghost-run', artifactId: 'LIVE-GHOST', artifactType: 'story', workflowId: 'dev-story', harness: 'claude',
      terminalName: 'AAC: dev-story LIVE-GHOST', resultPath: path.join(getOutputFolder(), '_terminal-output', 'ghost.json'),
      startedAt: Date.now(), revertTo: 'ready-for-dev',
    };
    journal.add(ghost);
    expect(journal.list().some((r) => r.artifactId === 'LIVE-SLOW-3'), 'running run was not journaled');

    const reports: RecoveryOutcome[] = [];
    const statuses = new Map([['LIVE-SLOW-3', 'in-progress'], ['LIVE-GHOST', 'in-progress']]);
    const outcomes = await recoverRuns({
      journal,
      readVerdict: (r) => { const v = readVerdictFile(r.resultPath); return v && verdictMatchesRun(v, r.runId) ? v : undefined; },
      isTerminalAlive: (r) => terminalNamed(r.terminalName),
      acquireLock: () => true,
      releaseLock: () => undefined,
      getStatus: (r) => statuses.get(r.artifactId),
      setStatus: async (r, s) => { statuses.set(r.artifactId, s); },
      watch: (r, done) => {
        const timer = setInterval(() => {
          if (!terminalNamed(r.terminalName)) { clearInterval(timer); done(undefined); }
        }, 300);
      },
      report: (o) => reports.push(o),
    });
    const byId = new Map(outcomes.map((o) => [o.record.artifactId, o.kind]));
    expect(byId.get('LIVE-SLOW-3') === 're-adopted', `live run: ${byId.get('LIVE-SLOW-3')}`);
    expect(byId.get('LIVE-GHOST') === 'interrupted', `ghost run: ${byId.get('LIVE-GHOST')}`);
    expect(statuses.get('LIVE-GHOST') === 'ready-for-dev', 'ghost card not moved back');

    vscode.window.terminals.find((t) => t.name === name)?.dispose();
    expect(await waitFor(() => reports.some((o) => o.record.artifactId === 'LIVE-SLOW-3' && o.kind === 'interrupted'), 10_000),
      're-adopted run not reported interrupted after its terminal died');
    return 're-adopted -> interrupted; ghost interrupted and reverted';
  });

  // (d) optional real model through a real terminal.
  const realHarness = process.env.AAC_LIVE_MODEL_HARNESS;
  if (realHarness) {
    await check(`real model via ${realHarness}`, async () => {
      const v = await exec.executeAndAwaitVerdict('dev-story',
        { id: 'LIVE-MODEL', type: 'story', title: 'Smoke test: do not change any source file, only write the verdict file' }, {},
        { resolution: cliResolution(realHarness), pollIntervalMs: 2000, timeoutMs: 15 * 60_000 });
      expect(v.verdict !== 'UNKNOWN' && v.verdict !== 'BLOCKED', `verdict ${v.verdict}: ${v.summary}`);
      return `${v.verdict}: ${v.summary ?? ''}`.slice(0, 300);
    });
  }

  exec.dispose();
  const failed = results.filter((r) => !r.ok);
  if (failed.length) throw new Error(`${failed.length} live check(s) failed: ${failed.map((f) => f.name).join('; ')}`);
}
