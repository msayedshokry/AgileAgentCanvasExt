// ─── Board harness wiring (VS Code side) ────────────────────────────────────
// Reads settings and probes the host, then delegates the decision to the pure
// resolver. Kept separate from harness-resolver.ts so the rules stay testable
// without a VS Code runtime.

import * as vscode from 'vscode';
import {
  getSelectedProvider,
  loadWorkspaceChatProviderFromSettings,
  resolveCliOnPath,
} from '../../commands/chat-bridge';
import { selectModel } from '../../chat/ai-provider';
import { resolveHarness, type HarnessResolution } from './harness-resolver';
import type { PermissionPosture } from './harness-adapters';

const CONFIG_SECTION = 'agileagentcanvas';
const PATH_CACHE_TTL_MS = 30_000;

const pathCache = new Map<string, { found: boolean; at: number }>();

/** PATH lookup with a short cache: `where`/`which` spawns are slow on Windows. */
export function isOnPathCached(name: string, now = Date.now()): boolean {
  const hit = pathCache.get(name);
  if (hit && now - hit.at < PATH_CACHE_TTL_MS) return hit.found;
  const found = resolveCliOnPath(name);
  pathCache.set(name, { found, at: now });
  return found;
}

/** Drop cached PATH lookups (after the user installs a CLI, or in tests). */
export function clearHarnessPathCache(): void {
  pathCache.clear();
}

export function getConfiguredHarness(): string {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('agents.harness', 'auto') ?? 'auto';
}

export function getPermissionPosture(): PermissionPosture {
  const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('agents.permissionPosture', 'sandboxed');
  return value === 'full' ? 'full' : 'sandboxed';
}

async function hasLanguageModel(): Promise<boolean> {
  try {
    return (await selectModel()) !== null;
  } catch {
    return false;
  }
}

/** Decide which harness runs the next board step on this machine. */
export async function resolveBoardHarness(): Promise<HarnessResolution> {
  const selected = getSelectedProvider();
  return resolveHarness({
    configuredHarness: getConfiguredHarness(),
    selectedChatProvider: selected === 'auto' ? loadWorkspaceChatProviderFromSettings() : selected,
    isOnPath: (name) => isOnPathCached(name),
    hasLanguageModel,
  });
}

// ─── Guardrails: workspace trust + full-permission consent ─────────────────

const FULL_POSTURE_CONSENT_KEY = 'agileagentcanvas.fullPostureConsent';
let extensionContext: vscode.ExtensionContext | undefined;

/** Called once on activation so consent can be remembered per workspace. */
export function initBoardHarness(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

/**
 * Why agent runs are not allowed right now, or undefined when they are.
 * Agents execute model-written commands, so they never run in Restricted Mode.
 */
export function agentRunBlockReason(): string | undefined {
  return vscode.workspace.isTrusted
    ? undefined
    : 'Agent runs are disabled in Restricted Mode. Trust this workspace (Manage Workspace Trust) to let agents run.';
}

/**
 * The posture a run actually gets. `full` needs a trusted workspace AND a
 * one-time, per-workspace confirmation; otherwise the run is downgraded to
 * `sandboxed` rather than silently granted every permission.
 */
export async function resolveEffectivePosture(): Promise<PermissionPosture> {
  if (getPermissionPosture() !== 'full') return 'sandboxed';
  if (!vscode.workspace.isTrusted) return 'sandboxed';
  if (extensionContext?.workspaceState.get<boolean>(FULL_POSTURE_CONSENT_KEY)) return 'full';
  const allow = 'Allow full permissions';
  const choice = await vscode.window.showWarningMessage(
    'Agents are set to run with FULL permissions in this workspace: every tool, including shell commands, ' +
    'is auto-approved without asking. Only allow this for repositories you trust.',
    { modal: true },
    allow,
  );
  if (choice !== allow) {
    void vscode.window.showInformationMessage('Running agents with the sandboxed permission posture instead.');
    return 'sandboxed';
  }
  await extensionContext?.workspaceState.update(FULL_POSTURE_CONSENT_KEY, true);
  return 'full';
}

/** Budget caps from settings (USD; 0 disables a cap). */
export function readBudgetSettings(): { budgetPerStory: number; budgetDaily: number } {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const num = (key: string, fallback: number): number => {
    const v = Number(cfg.get<number>(key, fallback));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  return { budgetPerStory: num('budget.perStoryUsd', 5), budgetDaily: num('budget.dailyUsd', 25) };
}
