import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ABANDONED_PLAN_MS, VisualPlanStore, settleAbandonedPlan } from './visual-plan-store';
import type { VisualPlan } from '../types/visual-plan';

// Shape of a real stub left behind when the agent never wrote the plan.
const stub = (over: Partial<VisualPlan> = {}): VisualPlan => ({
  id: 'plan-1782817069606-xjeqc1', title: 'Plan changes for Core Loop Walking Skeleton',
  goal: 'Plan changes for Core Loop Walking Skeleton', status: 'generating',
  createdAt: 1_782_817_069_606, updatedAt: 1_782_817_069_606, sections: [], comments: [], ...over,
});

describe('abandoned visual plans', () => {
  it('a stub still generating long after it was made reads as failed', () => {
    expect(settleAbandonedPlan(stub(), 1_795_000_000_000).status).toBe('failed');
  });

  it('a plan still being written keeps spinning', () => {
    const fresh = stub({ updatedAt: 1_000_000 });
    expect(settleAbandonedPlan(fresh, 1_000_000 + ABANDONED_PLAN_MS - 1).status).toBe('generating');
  });

  it('a plan with content is never marked failed, however old', () => {
    const written = stub({ sections: [{ id: 's', kind: 'openQuestions', title: 'Q', questions: [] } as never] });
    expect(settleAbandonedPlan(written, 1_795_000_000_000).status).toBe('generating');
  });

});

// ── The store, on real files ─────────────────────────────────────────────────

describe('plan store while VS Code is open', () => {
  let root = '';
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-plans-'));
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: root } }];
    (vscode.workspace as unknown as { fs: unknown }).fs = {
      readDirectory: async (u: { fsPath: string }) => fs.readdirSync(u.fsPath).map((n) => [n, 1]),
      readFile: async (u: { fsPath: string }) => fs.readFileSync(u.fsPath),
      writeFile: async (u: { fsPath: string }, b: Uint8Array) => fs.writeFileSync(u.fsPath, b),
      createDirectory: async (u: { fsPath: string }) => { fs.mkdirSync(u.fsPath, { recursive: true }); },
      delete: async (u: { fsPath: string }) => fs.rmSync(u.fsPath, { force: true }),
    };
  });
  afterEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('marks a plan failed once its agent has been silent too long, without a reload', async () => {
    const store = new VisualPlanStore();
    const seen: string[] = [];
    store.onDidChange((plans) => seen.push(plans[0]?.status ?? ''));
    await store.save(stub({ updatedAt: 1_000_000 }));
    expect(store.settleStale(1_000_000 + ABANDONED_PLAN_MS - 1)).toBe(false);
    expect(store.settleStale(1_000_000 + ABANDONED_PLAN_MS + 1)).toBe(true);
    expect(store.list()[0].status).toBe('failed');
    expect(seen.at(-1)).toBe('failed');
  });

  it('a deleted plan stays deleted when its agent writes the file late', async () => {
    const store = new VisualPlanStore();
    const plan = stub();
    await store.save(plan);
    await store.delete(plan.id);
    const file = store.planFilePath(plan.id)!;
    fs.writeFileSync(file, JSON.stringify({ ...plan, status: 'pending', sections: [{ id: 's', kind: 'overview', markdown: 'x' }] }));
    await (store as unknown as { ingestFile(u: unknown): Promise<void> }).ingestFile(vscode.Uri.file(file));
    expect(store.get(plan.id)).toBeUndefined();
    expect(fs.existsSync(file)).toBe(false);
  });
});
