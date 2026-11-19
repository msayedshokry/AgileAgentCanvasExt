// ─── Harness resolution ──────────────────────────────────────────────────────
// Decides which coding-agent harness runs a board step. Pure: every
// environment probe is injected, so the rules are unit-tested without
// touching PATH or the VS Code LM API.
//
// Rules (no silent fallback to a CLI that is not installed):
//   1. An explicit `agileagentcanvas.agents.harness` wins. If it is missing,
//      the run is BLOCKED with an install hint, never swapped for another CLI.
//   2. 'auto': the CLI matching the canvas chat-provider dropdown, if installed.
//      A Copilot pick with no Copilot CLI uses the VS Code LM API (Copilot Chat).
//   3. 'auto': the first installed CLI in HARNESS_ADAPTERS order.
//   4. 'auto': the VS Code LM API, if any chat model is registered.
//   5. Otherwise BLOCKED, listing what to install.

import {
  HARNESS_ADAPTERS,
  getHarnessAdapter,
  harnessForChatProvider,
  type HarnessAdapter,
  type HarnessId,
} from './harness-adapters';

export type HarnessChoice = 'auto' | 'vscode-lm' | HarnessId;

export type HarnessResolution =
  | { readonly kind: 'cli'; readonly adapter: HarnessAdapter; readonly binary: string; readonly reason: string }
  | { readonly kind: 'lm'; readonly reason: string }
  | { readonly kind: 'none'; readonly message: string };

export interface ResolverDeps {
  readonly configuredHarness: string;
  readonly selectedChatProvider: string;
  /** True when `name` resolves to an executable on PATH. */
  readonly isOnPath: (name: string) => boolean | Promise<boolean>;
  /** True when at least one VS Code language model is available. */
  readonly hasLanguageModel: () => Promise<boolean>;
}

export const NO_LM_MESSAGE =
  'No VS Code language model is available. Install and sign in to GitHub Copilot (or another language-model extension).';

async function findBinary(adapter: HarnessAdapter, isOnPath: ResolverDeps['isOnPath']): Promise<string | undefined> {
  for (const bin of adapter.binaries) {
    if (await isOnPath(bin)) return bin;
  }
  return undefined;
}

export function isHarnessChoice(value: string): value is HarnessChoice {
  return value === 'auto' || value === 'vscode-lm' || getHarnessAdapter(value) !== undefined;
}

export async function resolveHarness(deps: ResolverDeps): Promise<HarnessResolution> {
  const configured = isHarnessChoice(deps.configuredHarness) ? deps.configuredHarness : 'auto';

  if (configured === 'vscode-lm') {
    return (await deps.hasLanguageModel())
      ? { kind: 'lm', reason: 'agileagentcanvas.agents.harness = vscode-lm' }
      : { kind: 'none', message: NO_LM_MESSAGE };
  }

  if (configured !== 'auto') {
    const adapter = getHarnessAdapter(configured)!;
    const binary = await findBinary(adapter, deps.isOnPath);
    return binary
      ? { kind: 'cli', adapter, binary, reason: `agileagentcanvas.agents.harness = ${configured}` }
      : {
          kind: 'none',
          message: `${adapter.label} is selected (agileagentcanvas.agents.harness) but "${adapter.binaries.join('" / "')}" is not on PATH. ${adapter.installHint}`,
        };
  }

  const preferredId = harnessForChatProvider(deps.selectedChatProvider);
  if (preferredId) {
    const adapter = getHarnessAdapter(preferredId)!;
    const binary = await findBinary(adapter, deps.isOnPath);
    if (binary) return { kind: 'cli', adapter, binary, reason: `matches chat provider "${deps.selectedChatProvider}"` };
    if (preferredId === 'copilot-cli' && (await deps.hasLanguageModel())) {
      return { kind: 'lm', reason: 'Copilot selected; Copilot CLI not installed, using VS Code language model' };
    }
  }

  for (const adapter of HARNESS_ADAPTERS) {
    const binary = await findBinary(adapter, deps.isOnPath);
    if (binary) return { kind: 'cli', adapter, binary, reason: 'first installed harness' };
  }

  if (await deps.hasLanguageModel()) {
    return { kind: 'lm', reason: 'no CLI harness installed; using VS Code language model' };
  }

  const hints = HARNESS_ADAPTERS.map((a) => `- ${a.label}: ${a.installHint}`).join('\n');
  return {
    kind: 'none',
    message: `No coding-agent harness found. Install one of these CLIs, or GitHub Copilot for VS Code:\n${hints}`,
  };
}
