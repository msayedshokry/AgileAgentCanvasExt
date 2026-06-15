// ─── Harness Policy Loader (Epic 4) ─────────────────────────────────────────
// Loads user-defined policies from .agileagentcanvas-context/policies/*.yaml
//
// Supported policy types in YAML:
//   - regex-based: deterministic pattern matching (recommended, safe)
//   - LLM-based: AI evaluation (deferred to P4 — requires sandboxed context
//     for prompt-injection safety)
//
// ⚠️ SECURITY: User-defined LLM-based policies are a prompt-injection vector.
// Only regex-based policies are supported in v0.5.0. LLM evaluation is
// deferred to a future milestone.

import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { HarnessPolicy, EvaluationContext } from './policy-engine';
import { createLogger } from '../utils/logger';

const logger = createLogger('harness-policy-loader');

import { errMsg } from '../utils/error';

/**
 * Stub for LLM-based policy evaluation.
 * Explicitly out of scope for v0.5.0 — user-defined policies must use
 * deterministic checks (regex) only. LLM evaluation is reserved for a
 * future milestone when prompt-injection mitigations are in place.
 */
async function evaluatePolicyWithLLM(
  entry: any,
  _ctx: EvaluationContext
): Promise<string[] | null> {
  logger.warn(
    `[Harness] Policy "${entry.id || entry.name || 'unnamed'}" has no regex field — LLM evaluation not yet supported. Policy skipped.`
  );
  return null;
}

/**
 * Load user-defined policies from the workspace's policies/ directory.
 * Returns empty array if no policies directory exists or no .yaml files found.
 */
export async function loadUserPolicies(store: ArtifactStore): Promise<HarnessPolicy[]> {
  const sourceFolder = store.getSourceFolder();
  if (!sourceFolder) return [];

  const policiesDir = vscode.Uri.joinPath(sourceFolder, 'policies');
  try {
    await vscode.workspace.fs.stat(policiesDir);
  } catch {
    return [];
  }

  let files: [string, vscode.FileType][];
  try {
    files = await vscode.workspace.fs.readDirectory(policiesDir);
  } catch (err) {
    logger.debug(`[Harness] Could not read policies directory: ${errMsg(err)}`);
    return [];
  }

  const policies: HarnessPolicy[] = [];

  for (const [fileName, fileType] of files) {
    if (fileType !== vscode.FileType.File) continue;
    if (!fileName.endsWith('.yaml') && !fileName.endsWith('.yml')) continue;

    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(policiesDir, fileName));
      const yaml = await import('yaml');
      const parsed = yaml.parse(content.toString());

      for (const entry of parsed.policies || []) {
        const policyId = entry.id || fileName.replace(/\.(yaml|yml)$/, '') + '-' + policies.length;

        policies.push({
          id: policyId,
          name: entry.name || fileName,
          description: entry.description || '',
          type: entry.type || 'post-flight',
          artifactType: entry.artifactType,
          severity: entry.severity || 'advisory',
          evaluate: async (ctx) => {
            if (entry.regex) {
              const patterns: string[] = Array.isArray(entry.regex) ? entry.regex : [entry.regex];
              const content = JSON.stringify(ctx.artifact || '');
              const matches = patterns.filter((r: string) => new RegExp(r, 'i').test(content));
              return matches.length ? matches.map((m: string) => `Matched forbidden pattern: "${m}"`) : null;
            }
            return evaluatePolicyWithLLM(entry, ctx);
          },
        });

        logger.debug(`[Harness] Loaded user policy: ${policyId}`);
      }
    } catch (err) {
      logger.warn(`[Harness] Failed to load policy file ${fileName}: ${errMsg(err)}`);
    }
  }

  return policies;
}
