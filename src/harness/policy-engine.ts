// ─── Harness Policy Engine (Epic 4) ─────────────────────────────────────────
// Continuous quality feedback loop: observes agent actions, evaluates them
// against policies, and feeds corrections back into prompts.
//
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  GOVERNANCE LOOP:                                                       ║
// ║                                                                          ║
// ║  pre-flight   → blocks bad transitions before they happen                ║
// ║  post-flight  → checks artifact state after changes (advisory)           ║
// ║  continuous   → accumulates results over time, escalates repeated       ║
// ║                  failures, injects feedback into agent prompts           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// Built-in policies:
//   1. schema-conformance — validates artifact against its BMAD JSON schema (blocking)
//   2. required-fields    — story must have title, user story, acceptance criteria (blocking)
//   3. no-placeholders    — content must not contain TODO/FIXME/TBD placeholders (advisory)
//   4. token-budget       — epic story points vs sprint capacity (advisory)
//   5. trace-anomaly      — detects repeated errors or stuck loops from trace entries (continuous)
//   6. feedback-accumulation — aggregates results across all phases into the feedback service

import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { schemaValidator } from '../state/schema-validator';
import { repairDataWithSchema } from '../state/schema-repair-engine';
import { getTraceRecorder, TraceEntry } from '../trace/trace-recorder';
import { harnessFeedback } from './harness-feedback';

const logger = createLogger('harness-policy-engine');

import { errMsg } from '../utils/error';

export interface HarnessPolicy {
  id: string;
  name: string;
  description: string;
  type: 'pre-flight' | 'post-flight' | 'continuous';
  artifactType?: string;
  severity: 'blocking' | 'advisory';
  evaluate: (context: EvaluationContext) => Promise<string[] | null>;
  autoFix?: (context: EvaluationContext) => Promise<{ ok: boolean; data?: any }>;
}

export interface EvaluationContext {
  artifactType: string;
  artifactId: string;
  artifact: Readonly<any>;
  sessionId?: string;
  traceEntries?: Readonly<TraceEntry[]>;
  previousEvaluations?: Readonly<EvaluationResult[]>;
}

export interface EvaluationResult {
  policyId: string;
  passed: boolean;
  failures: string[];
  fixed: boolean;
  fixedArtifact?: any;
  severity: 'blocking' | 'advisory';
  timestamp: string;
}

/** Payload emitted on the 'findings' event after each evaluation. */
export interface HarnessFindingsEvent {
  artifactId: string;
  artifactType: string;
  /** Only failed evaluations are emitted (passed policies are skipped). */
  findings: Array<{
    artifactId: string;
    policyId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message?: string;
  }>;
}

export class HarnessEngine extends EventEmitter {
  private policies: HarnessPolicy[] = [];

  registerPolicy(policy: HarnessPolicy): void {
    this.policies.push(policy);
  }

  async evaluate(
    context: EvaluationContext,
    phase: 'pre-flight' | 'post-flight' | 'continuous'
  ): Promise<EvaluationResult[]> {
    const applicable = this.policies.filter(
      p => p.type === phase && (!p.artifactType || p.artifactType === context.artifactType)
    );
    const results: EvaluationResult[] = [];
    let currentArtifact = context.artifact;

    for (const policy of applicable) {
      let failures = await policy.evaluate({ ...context, artifact: currentArtifact });
      let fixed = false;
      let fixedArtifact: any = undefined;

      if (failures?.length && policy.autoFix) {
        try {
          const fixResult = await policy.autoFix({ ...context, artifact: currentArtifact });
          if (fixResult.ok && fixResult.data) {
            fixed = true;
            fixedArtifact = fixResult.data;
            currentArtifact = fixResult.data;
            // Re-evaluate after auto-fix
            failures = await policy.evaluate({ ...context, artifact: currentArtifact });
          }
        } catch (err) {
          logger.warn(`[Harness] Auto-fix failed for policy ${policy.id}: ${errMsg(err)}`);
        }
      }

      const result: EvaluationResult = {
        policyId: policy.id,
        passed: !failures?.length,
        failures: failures || [],
        fixed,
        fixedArtifact,
        severity: policy.severity,
        timestamp: new Date().toISOString(),
      };

      results.push(result);

      // Feed result into the continuous feedback accumulator so repeated
      // failures are tracked, escalated, and injected into agent prompts.
      harnessFeedback.recordEvaluation(context.artifactId, context.artifactType, [result]);

      // Emit findings for detectors (cross-artifact, etc.) to consume.
      // Only emit failed policies — passing ones are noise.
      if (!result.passed) {
        const severity: 'low' | 'medium' | 'high' | 'critical' =
          result.severity === 'blocking' ? 'high' : 'low';
        this.emit('findings', {
          artifactId: context.artifactId,
          artifactType: context.artifactType,
          findings: [{
            artifactId: context.artifactId,
            policyId: result.policyId,
            severity,
            message: result.failures?.join('; ') || undefined,
          }],
        } satisfies HarnessFindingsEvent);
      }

      // Record to trace (E3 integration)
      try {
        getTraceRecorder().record({
          sessionId: context.sessionId || 'harness',
          type: 'decision',
          agent: 'harness',
          data: {
            decision: `Policy ${policy.id}: ${failures?.length ? 'FAILED' : 'PASSED'}`,
            rationale: failures?.join('; ') || 'All checks passed',
            artifactId: context.artifactId,
            artifactType: context.artifactType,
          },
        });
      } catch {
        // Trace recorder may not be initialized yet — silently skip
      }
    }

    return results;
  }

  // ── Built-in Policies ──────────────────────────────────────────────────

  static builtInPolicies(): HarnessPolicy[] {
    return [
      {
        id: 'schema-conformance',
        name: 'JSON Schema Conformance',
        description: 'Artifact must conform to its BMAD JSON schema',
        type: 'pre-flight',
        severity: 'blocking',
        evaluate: async (ctx) => {
          if (!ctx.artifact) return ['No artifact data provided'];
          const validation = schemaValidator.validateChanges(ctx.artifactType, ctx.artifact as any);
          return validation.valid ? null : validation.errors;
        },
        autoFix: async (ctx) => {
          try {
            // Get the schema content and parse it to avoid the SchemaNode typing issue
            const schemaContent = schemaValidator.getSchemaContent(ctx.artifactType);
            if (schemaContent) {
              const schema = JSON.parse(schemaContent);
              const fixed = repairDataWithSchema(ctx.artifact as any, schema as any);
              if (fixed.changed && fixed.data) {
                return { ok: true, data: fixed.data };
              }
            }
          } catch {
            // Schema not available or repair failed — skip auto-fix
          }
          return { ok: false };
        },
      },
      {
        id: 'required-fields',
        name: 'Required Fields Present',
        description: 'Required fields must have non-empty values',
        type: 'pre-flight',
        artifactType: 'story',
        severity: 'blocking',
        evaluate: async (ctx) => {
          const failures: string[] = [];
          if (!ctx.artifact?.title) failures.push('Story must have a title');
          if (!ctx.artifact?.userStory?.iWant) failures.push('Story must have a user story (I want...)');
          if (!ctx.artifact?.acceptanceCriteria?.length) failures.push('Story must have at least one acceptance criterion');
          return failures.length ? failures : null;
        },
        autoFix: async (ctx) => {
          try {
            const fixed: any = {
              ...ctx.artifact,
              userStory: ctx.artifact?.userStory ? { ...ctx.artifact.userStory } : undefined,
              acceptanceCriteria: ctx.artifact?.acceptanceCriteria ? [...ctx.artifact.acceptanceCriteria] : undefined,
            };

            const missingFields: string[] = [];
            if (!fixed.title) missingFields.push('title');
            if (!fixed.userStory?.iWant) missingFields.push('userStory.iWant');
            if (!fixed.acceptanceCriteria?.length) missingFields.push('acceptanceCriteria');
            if (missingFields.length === 0) return { ok: false };

            // Try VS Code Language Model to generate context-aware content
            try {
              const models = await vscode.lm.selectChatModels({});
              if (models && models.length > 0) {
                const lm = models[0];
                const fieldDescriptions = missingFields.map(f => {
                  if (f === 'title') return '  "title": "Short descriptive title for the story"';
                  if (f === 'userStory.iWant') return '  "userStory": { "asA": "type of user", "iWant": "what they want", "soThat": "why they want it" }';
                  if (f === 'acceptanceCriteria') return '  "acceptanceCriteria": [{ "criterion": "description" }, { "criterion": "description" }]';
                  return '';
                }).join(',\n');

                const prompt = [
                  'You are generating missing fields for a user story in a BMAD agile project.',
                  '',
                  `Story ID: ${ctx.artifactId}`,
                  ctx.artifact?.title ? `Current title: "${ctx.artifact.title}"` : 'No title yet.',
                  '',
                  'Generate ONLY the following missing fields as a JSON object:',
                  missingFields.map(f => `- ${f}`).join('\n'),
                  '',
                  'Return a JSON object with ONLY the generated fields. No explanation, no markdown, no code fences:',
                  '{',
                  fieldDescriptions.replace(/,?\n/g, '\n'),
                  '}',
                ].join('\n');

                const response = await lm.sendRequest(
                  [vscode.LanguageModelChatMessage.User(prompt)],
                  {},
                  new vscode.CancellationTokenSource().token
                );

                let fullText = '';
                for await (const chunk of response.text) {
                  fullText += chunk;
                }

                const jsonMatch = fullText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const generated = JSON.parse(jsonMatch[0]);
                  if (generated.title && !fixed.title) fixed.title = String(generated.title);
                  if (generated.userStory && !fixed.userStory?.iWant) {
                    fixed.userStory = {
                      asA: generated.userStory.asA || 'user',
                      iWant: generated.userStory.iWant || 'to use this feature',
                      soThat: generated.userStory.soThat || 'I can complete my work',
                    };
                  }
                  if (generated.acceptanceCriteria?.length && !fixed.acceptanceCriteria?.length) {
                    fixed.acceptanceCriteria = generated.acceptanceCriteria.map((ac: any) =>
                      typeof ac === 'string' ? { criterion: ac } : ac
                    );
                  }

                  // Verify whether all fields are now populated
                  const stillMissing = [];
                  if (!fixed.title) stillMissing.push('title');
                  if (!fixed.userStory?.iWant) stillMissing.push('userStory.iWant');
                  if (!fixed.acceptanceCriteria?.length) stillMissing.push('acceptanceCriteria');

                  if (stillMissing.length === 0) {
                    return { ok: true, data: fixed };
                  }
                  logger.info(
                    `[Harness] LLM auto-fix for required-fields resolved ${missingFields.length - stillMissing.length}/${missingFields.length} fields, still missing: ${stillMissing.join(', ')}`
                  );
                }
              }
            } catch (llmErr) {
              logger.info(`[Harness] LLM auto-fix unavailable for required-fields: ${errMsg(llmErr)}`);
            }

            // Fallback: generate sensible defaults for any remaining missing fields
            if (!fixed.title) fixed.title = `Story ${ctx.artifactId}`;
            if (!fixed.userStory) fixed.userStory = { asA: 'user', iWant: 'to use this feature', soThat: 'I can complete my work' };
            if (!fixed.userStory?.iWant) fixed.userStory.iWant = 'to use this feature';
            if (!fixed.acceptanceCriteria?.length) {
              fixed.acceptanceCriteria = [
                { criterion: `${fixed.title}: basic functionality works as expected` },
                { criterion: `${fixed.title}: edge cases are handled gracefully` },
              ];
            }

            return { ok: true, data: fixed };
          } catch {
            return { ok: false };
          }
        },
      },
      {
        id: 'no-placeholders',
        name: 'No Placeholder Content',
        description: 'Artifact content must not contain placeholder text',
        type: 'post-flight',
        severity: 'advisory',
        evaluate: async (ctx) => {
          const content = JSON.stringify(ctx.artifact || '');
          const placeholders = ['TODO', 'FIXME', 'TBD', 'placeholder', 'lorem ipsum'];
          const found = placeholders.filter(p => content.toLowerCase().includes(p.toLowerCase()));
          return found.length ? found.map(p => `Contains placeholder: "${p}"`) : null;
        },
      },
      {
        id: 'token-budget',
        name: 'Story Point Budget Check',
        description: 'Total story points for an epic should not exceed sprint capacity',
        type: 'post-flight',
        artifactType: 'epic',
        severity: 'advisory',
        evaluate: async (ctx) => {
          const stories = ctx.artifact?.stories || [];
          if (!stories.length) return null;
          const totalPoints = stories.reduce((sum: number, s: any) => sum + (s.storyPoints || 0), 0);
          const capacity = vscode.workspace.getConfiguration('agileagentcanvas').get('harness.sprintCapacity', 20);
          return totalPoints > capacity
            ? [`Total ${totalPoints} SP exceeds default sprint capacity of ${capacity} SP. Consider splitting into multiple sprints.`]
            : null;
        },
      },

      // =====================================================================
      // CONTINUOUS POLICIES
      // These run after workflow executions and evaluate trace entries and
      // accumulated feedback to detect patterns that need correction.
      // =====================================================================

      {
        id: 'trace-anomaly',
        name: 'Trace Anomaly Detection',
        description: 'Detect repeated errors, stuck loops, or regression patterns from trace entries',
        type: 'continuous',
        severity: 'advisory',
        evaluate: async (ctx) => {
          if (!ctx.traceEntries?.length) return null;

          const failures: string[] = [];

          // Check for repeated error types in recent trace entries
          const errors = ctx.traceEntries.filter(e => e.type === 'error');
          if (errors.length >= 3) {
            const lastFew = errors.slice(-3);
            const errorMessages = lastFew.map(e => e.data?.error || '').filter(Boolean);
            if (errorMessages.length >= 2) {
              const unique = new Set(errorMessages);
              if (unique.size <= 1) {
                failures.push(
                  `Same error repeated ${errorMessages.length}x in recent trace entries: "${errorMessages[0]}". ` +
                  'Consider a different approach to break the cycle.'
                );
              }
            }
          }

          // Check for repeated 'tool_call' → 'error' cycles (stuck loops)
          const recentEntries = ctx.traceEntries.slice(-20);
          const toolCallErrors = recentEntries.filter(
            e => e.type === 'error' && e.agent === 'tool'
          );
          if (toolCallErrors.length >= 4) {
            failures.push(
              `Tool call errors detected ${toolCallErrors.length}x in the last ${recentEntries.length} trace entries. ` +
              'Verify the tools being used are available and inputs are valid.'
            );
          }

          // Check for decisions indicating regression
          const decisions = ctx.traceEntries.filter(e => e.type === 'decision');
          const statusChanges = decisions.filter(
            d => d.data?.decision?.includes('status_changed')
          );
          if (statusChanges.length >= 4) {
            failures.push(
              `Frequent status changes (${statusChanges.length}) detected. The artifact may be cycling through states without making progress.`
            );
          }

          return failures.length ? failures : null;
        },
      },

      {
        id: 'feedback-accumulation',
        name: 'Accumulated Feedback Check',
        description: 'Reports accumulated policy failures for artifacts with repeated issues',
        type: 'continuous',
        severity: 'advisory',
        evaluate: async (ctx) => {
          // This policy doesn't do its own evaluation — it surfaces the
          // accumulated results from the feedback service. The actual
          // feedback injection happens in buildWorkflowPrompt() and
          // executeInChat() via getFeedbackForArtifact().
          const feedback = harnessFeedback.getFeedbackForArtifact(
            ctx.artifactId,
            ctx.artifactType
          );
          if (!feedback || feedback.activeFailureCount === 0) return null;

          const lines: string[] = [];
          if (feedback.escalatedCount > 0) {
            lines.push(
              `${feedback.escalatedCount} escalated policy failure(s) — repeated issues that need attention.`
            );
          }
          if (feedback.activeFailureCount > feedback.escalatedCount) {
            lines.push(
              `${feedback.activeFailureCount - feedback.escalatedCount} additional advisory finding(s).`
            );
          }

          return lines.length ? lines : null;
        },
      },
    ];
  }

  /**
   * Evaluate continuous policies against trace entries for a given artifact.
   * Called after workflow executions to detect patterns that need correction.
   */
  async evaluateContinuous(
    artifactId: string,
    artifactType: string,
    sessionId: string
  ): Promise<EvaluationResult[]> {
    let traceEntries: TraceEntry[] = [];
    try {
      traceEntries = await getTraceRecorder().searchTraces({ artifactId, limit: 100 });
    } catch {
      // Trace recorder may not be initialized
    }

    const context: EvaluationContext = {
      artifactType,
      artifactId,
      artifact: { id: artifactId } as Record<string, unknown>,
      sessionId,
      traceEntries,
    };

    const results = await this.evaluate(context, 'continuous');

    // Also send accumulated feedback to the webview for dashboard display
    const feedback = harnessFeedback.getFeedbackForArtifact(artifactId, artifactType);
    if (feedback && results.length > 0) {
      logger.info(
        `[Harness] Continuous eval for ${artifactId}: ${feedback.activeFailureCount} active, ` +
        `${feedback.escalatedCount} escalated`
      );
    }

    return results;
  }
}

export const harnessEngine = new HarnessEngine();
// Register each built-in policy individually
for (const policy of HarnessEngine.builtInPolicies()) {
  harnessEngine.registerPolicy(policy);
}
