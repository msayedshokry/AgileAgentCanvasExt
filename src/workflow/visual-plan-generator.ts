// ─── Visual Plan Generator ────────────────────────────────────────────────────
// Loads the generation prompt from the bundled workflow resource, calls the
// AI provider via streamChatResponse, and parses the JSON response into a
// typed VisualPlan.  Designed to be wired as the `generate` hook on
// VisualPlanService so the service stays decoupled from the AI layer.
//
// See .claude/PRPs/plans/visual-plan-integration.plan.md Task 3.

import * as vscode from 'vscode';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { BMAD_RESOURCE_DIR } from '../state/constants';
import { parseFrontmatter } from './frontmatter';
import {
  streamChatResponse,
  BmadModel,
  ChatMessage,
} from '../chat/ai-provider';
import { extractJson } from '../lib/json-extract';
import type {
  VisualPlan,
  VisualPlanGenerateRequest,
  PlanSection,
} from '../types/visual-plan';

const logger = createLogger('visual-plan-generator');

// ── Gradient of repair attempts before giving up ─────────────────────────────

/** Maximum number of repair attempts (including the initial generate). */
const MAX_ATTEMPTS = 2;

// ── Generator ────────────────────────────────────────────────────────────────

export class VisualPlanGenerator {
  private promptText: string | null = null;

  constructor(private readonly extensionPath: string) {}

  /**
   * Load the visual-plan workflow prompt from the bundled resource.
   * Cached after first load — the prompt doesn't change at runtime.
   */
  private async loadPrompt(): Promise<string> {
    if (this.promptText !== null) return this.promptText;

    const promptPath = path.join(
      this.extensionPath,
      'resources',
      BMAD_RESOURCE_DIR,
      'workflows',
      'visual-plan',
      'workflow.md',
    );

    try {
      const uri = vscode.Uri.file(promptPath);
      const raw = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(raw).toString('utf-8');
      const { body } = parseFrontmatter(content);
      this.promptText = body.trim();
      logger.debug('Loaded visual-plan prompt', { length: this.promptText.length });
      return this.promptText;
    } catch (err) {
      logger.warn('Failed to load visual-plan prompt — using fallback', {
        path: promptPath,
        error: String(err),
      });
      // Fallback: a minimal prompt so the feature degrades gracefully
      this.promptText = this.buildFallbackPrompt();
      return this.promptText;
    }
  }

  /** Minimal fallback when the bundled prompt can't be loaded. */
  private buildFallbackPrompt(): string {
    return `You are generating a Visual Plan — a structured, reviewable plan document.
Return a SINGLE JSON object with this structure:
{
  "title": "<short title>",
  "sections": [
    { "id": "overview-1", "kind": "overview", "markdown": "<summary>", "risk": "low|medium|high", "groundedFiles": ["path/to/file.ts"] },
    { "id": "filemap-1", "kind": "fileMap", "entries": [{ "path": "src/foo.ts", "change": "add|modify|delete|rename" }] },
    { "id": "tasks-1", "kind": "tasks", "tasks": [{ "id": "task-1", "title": "Add feature", "description": "...", "priority": "P0" }] }
  ],
  "targets": ["artifact-id-1"]
}
The overview, fileMap, and tasks sections are REQUIRED. No prose, no markdown wrappers — only the JSON object.`;
  }

  /**
   * Generate a VisualPlan by calling the AI provider.
   *
   * @param request  What to generate a plan for.
   * @param model    The AI model handle (from selectModel()).
   * @param stream   VS Code chat response stream for real-time feedback.
   * @param token    Cancellation token.
   * @returns        A fully-parsed VisualPlan with sections populated.
   */
  async generate(
    request: VisualPlanGenerateRequest,
    model: BmadModel,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<VisualPlan> {
    const prompt = await this.loadPrompt();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const messages = this.buildMessages(prompt, request, attempt);
      const raw = await streamChatResponse(model, messages, stream, token, {
        forceStructuredOutput: true,
        workflow: 'visual-plan',
      });

      const extracted = extractJson(raw);
      if (extracted.ok) {
        const plan = this.mapToVisualPlan(request, extracted.data);
        logger.info('VisualPlan generated', {
          attempt,
          sections: plan.sections.length,
          tasks: this.countTasks(plan.sections),
        });
        return plan;
      }

      logger.warn(
        `VisualPlan parse failed (attempt ${attempt}/${MAX_ATTEMPTS})`,
        { error: extracted.error },
      );

      if (attempt < MAX_ATTEMPTS) {
        stream.markdown(
          `\n\n⚠️  Plan output was malformed — retrying with tighter constraints…\n\n`,
        );
      } else {
        // Last attempt — throw so the service catches it
        throw new Error(
          `Failed to parse VisualPlan JSON after ${MAX_ATTEMPTS} attempts: ${extracted.error}`,
        );
      }
    }

    // Unreachable — kept for type safety
    throw new Error('VisualPlan generation exhausted all attempts');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Build the array of ChatMessage for the AI call. */
  private buildMessages(
    prompt: string,
    request: VisualPlanGenerateRequest,
    attempt: number,
  ): ChatMessage[] {
    let systemContent = prompt;

    // On retry, add stricter instructions
    if (attempt > 1) {
      systemContent +=
        `\n\n⚠️  YOUR PREVIOUS OUTPUT COULD NOT BE PARSED AS JSON.\n` +
        `This time, you MUST:\n` +
        `1. Output ONLY a single JSON object — no code fences, no prose, no markdown.\n` +
        `2. Ensure every section has an "id" field (string, unique).\n` +
        `3. Ensure every section has a "kind" field that is one of: overview, fileMap, diagram, wireframe, apiSpec, schemaMap, annotatedCode, openQuestions, tasks.\n` +
        `4. Include at least "overview", "fileMap", and "tasks" sections.\n` +
        `5. Make sure the JSON is parseable by JSON.parse() — no trailing commas, no comments.`;
    }

    const userContent = this.buildUserMessage(request);

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ];
  }

  /** Build the user-facing goal description. */
  private buildUserMessage(request: VisualPlanGenerateRequest): string {
    let msg = `Generate a structured Visual Plan for the following goal:\n\n"${request.goal}"`;

    if (request.sourceArtifactId) {
      msg += `\n\nThis plan is scoped to artifact: ${request.sourceArtifactId}`;
    }

    if (request.context) {
      msg += `\n\nAdditional context:\n${request.context}`;
    }

    msg +=
      `\n\nRemember: the "overview", "fileMap", and "tasks" sections are REQUIRED. ` +
      `Use real file paths from the workspace. ` +
      `The plan is the APPROVAL GATE — nothing should be implemented yet.`;

    return msg;
  }

  /**
   * Map the raw parsed JSON to a VisualPlan.
   * Gracefully handles missing or malformed fields.
   *
   * Public so the autonomy-lifecycle fallback path (vscode.lm) can reuse
   * the same normalization logic without duplicating it inline.
   */
  mapToVisualPlan(
    request: VisualPlanGenerateRequest,
    data: Record<string, unknown>,
  ): VisualPlan {
    const sections = this.normalizeSections(data.sections);
    const now = Date.now();

    return {
      id: '', // Service fills this in
      title: String(data.title || request.goal).slice(0, 80),
      goal: request.goal,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      sourceArtifactId: request.sourceArtifactId,
      targets: Array.isArray(data.targets)
        ? data.targets.filter((t): t is string => typeof t === 'string')
        : undefined,
      sections,
      comments: [],
    };
  }

  /**
   * Normalize the raw sections array into valid PlanSection objects.
   * Invalid or unrecognized sections are dropped with a warning.
   */
  private normalizeSections(raw: unknown): PlanSection[] {
    if (!Array.isArray(raw)) {
      logger.warn('Plan sections is not an array — returning empty');
      return [];
    }

    const validKinds = new Set([
      'overview',
      'fileMap',
      'diagram',
      'wireframe',
      'apiSpec',
      'schemaMap',
      'annotatedCode',
      'openQuestions',
      'tasks',
    ]);

    const sections: PlanSection[] = [];

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;

      const kind = String((item as Record<string, unknown>).kind || '');
      if (!validKinds.has(kind)) {
        logger.warn('Skipping unrecognized section kind', { kind });
        continue;
      }

      const id =
        String((item as Record<string, unknown>).id || `section-${sections.length}`);

      try {
        const section = this.normalizeSection(kind, id, item as Record<string, unknown>);
        if (section) sections.push(section);
      } catch (err) {
        logger.warn('Failed to normalize section', { kind, id, error: String(err) });
      }
    }

    return sections;
  }

  /** Normalize a single section by kind. */
  private normalizeSection(
    kind: string,
    id: string,
    raw: Record<string, unknown>,
  ): PlanSection | null {
    switch (kind) {
      case 'overview':
        return {
          id,
          kind: 'overview',
          markdown: String(raw.markdown || ''),
          risk: this.normalizeRisk(raw.risk),
          groundedFiles: Array.isArray(raw.groundedFiles)
            ? raw.groundedFiles.filter((f): f is string => typeof f === 'string')
            : undefined,
        };

      case 'fileMap':
        return {
          id,
          kind: 'fileMap',
          entries: Array.isArray(raw.entries)
            ? raw.entries
                .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
                .map((e) => ({
                  path: String(e.path || ''),
                  change: this.normalizeFileChange(e.change),
                  note: e.note ? String(e.note) : undefined,
                }))
            : [],
        };

      case 'diagram':
        return {
          id,
          kind: 'diagram',
          diagram: {
            id: String(raw.id || `${id}-diagram`),
            title: raw.title ? String(raw.title) : undefined,
            mermaid: raw.mermaid ? String(raw.mermaid) : undefined,
            nodes: Array.isArray(raw.nodes)
              ? raw.nodes
                  .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
                  .map((n) => ({ id: String(n.id || ''), label: String(n.label || '') }))
              : undefined,
            edges: Array.isArray(raw.edges)
              ? raw.edges
                  .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
                  .map((e) => ({
                    from: String(e.from || ''),
                    to: String(e.to || ''),
                    label: e.label ? String(e.label) : undefined,
                  }))
              : undefined,
          },
        };

      case 'wireframe':
        return {
          id,
          kind: 'wireframe',
          wireframe: {
            id: String(raw.id || `${id}-wireframe`),
            title: raw.title ? String(raw.title) : undefined,
            description: raw.description ? String(raw.description) : undefined,
            sections: Array.isArray(raw.sections)
              ? raw.sections
                  .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
                  .map((s) => ({
                    id: String(s.id || ''),
                    label: String(s.label || ''),
                    elements: Array.isArray(s.elements)
                      ? (s.elements as Array<Record<string, unknown>>)
                          .filter((el) => !!el && typeof el === 'object')
                          .map((el) => ({
                            type: String(el.type || 'container'),
                            label: String(el.label || ''),
                          }))
                      : undefined,
                  }))
              : undefined,
          },
        };

      case 'apiSpec':
        return {
          id,
          kind: 'apiSpec',
          entries: Array.isArray(raw.entries)
            ? raw.entries
                .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
                .map((e) => ({
                  method: String(e.method || 'GET'),
                  path: String(e.path || ''),
                  summary: e.summary ? String(e.summary) : undefined,
                  requestBody: e.requestBody ? String(e.requestBody) : undefined,
                  responses: Array.isArray(e.responses)
                    ? (e.responses as Array<Record<string, unknown>>)
                        .filter((r) => !!r && typeof r === 'object')
                        .map((r) => ({
                          code: String(r.code || '200'),
                          description: String(r.description || ''),
                        }))
                    : undefined,
                }))
            : [],
        };

      case 'schemaMap':
        return {
          id,
          kind: 'schemaMap',
          entities: Array.isArray(raw.entities)
            ? raw.entities
                .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
                .map((e) => ({
                  name: String(e.name || ''),
                  fields: Array.isArray(e.fields)
                    ? (e.fields as Array<Record<string, unknown>>)
                        .filter((f) => !!f && typeof f === 'object')
                        .map((f) => ({
                          name: String(f.name || ''),
                          type: String(f.type || 'string'),
                          required: typeof f.required === 'boolean' ? f.required : undefined,
                        }))
                    : undefined,
                  relationships: Array.isArray(e.relationships)
                    ? (e.relationships as Array<Record<string, unknown>>)
                        .filter((r) => !!r && typeof r === 'object')
                        .map((r) => ({
                          target: String(r.target || ''),
                          type: String(r.type || ''),
                          cardinality: r.cardinality ? String(r.cardinality) : undefined,
                        }))
                    : undefined,
                }))
            : [],
        };

      case 'annotatedCode':
        return {
          id,
          kind: 'annotatedCode',
          blocks: Array.isArray(raw.blocks)
            ? raw.blocks
                .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
                .map((b) => ({
                  file: String(b.file || ''),
                  language: b.language ? String(b.language) : undefined,
                  code: String(b.code || ''),
                  annotations: Array.isArray(b.annotations)
                    ? (b.annotations as Array<Record<string, unknown>>)
                        .filter((a) => !!a && typeof a === 'object')
                        .map((a) => ({
                          line: typeof a.line === 'number' ? a.line : 0,
                          comment: String(a.comment || ''),
                        }))
                    : undefined,
                }))
            : [],
        };

      case 'openQuestions':
        return {
          id,
          kind: 'openQuestions',
          questions: Array.isArray(raw.questions)
            ? raw.questions
                .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
                .map((q) => ({
                  id: String(q.id || `q-${Math.random().toString(36).slice(2, 6)}`),
                  question: String(q.question || ''),
                  status: this.normalizeQuestionStatus(q.status),
                  answer: q.answer ? String(q.answer) : undefined,
                }))
            : [],
        };

      case 'tasks':
        return {
          id,
          kind: 'tasks',
          tasks: Array.isArray(raw.tasks)
            ? raw.tasks
                .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
                .map((t) => ({
                  id: String(t.id || `task-${Math.random().toString(36).slice(2, 6)}`),
                  title: String(t.title || ''),
                  description: t.description ? String(t.description) : undefined,
                  priority: t.priority ? String(t.priority) : undefined,
                  scope: Array.isArray(t.scope)
                    ? t.scope.filter((s): s is string => typeof s === 'string')
                    : undefined,
                }))
            : [],
        };

      default:
        return null;
    }
  }

  // ── Value normalizers ──────────────────────────────────────────────────────

  private normalizeRisk(value: unknown): 'low' | 'medium' | 'high' | undefined {
    if (typeof value !== 'string') return undefined;
    const v = value.toLowerCase();
    if (v === 'low' || v === 'medium' || v === 'high') return v;
    return undefined;
  }

  private normalizeFileChange(value: unknown): 'add' | 'modify' | 'delete' | 'rename' {
    if (typeof value !== 'string') return 'modify';
    const v = value.toLowerCase();
    if (v === 'add' || v === 'modify' || v === 'delete' || v === 'rename') return v;
    // Map common aliases
    if (v === 'create' || v === 'new') return 'add';
    if (v === 'change' || v === 'edit' || v === 'update') return 'modify';
    if (v === 'remove') return 'delete';
    if (v === 'move') return 'rename';
    return 'modify';
  }

  private normalizeQuestionStatus(value: unknown): 'open' | 'answered' | 'blocked' | undefined {
    if (typeof value !== 'string') return undefined;
    const v = value.toLowerCase();
    if (v === 'open' || v === 'answered' || v === 'blocked') return v;
    return undefined;
  }

  /** Count total tasks across all sections (for logging). */
  private countTasks(sections: PlanSection[]): number {
    const taskSection = sections.find((s) => s.kind === 'tasks');
    if (!taskSection || taskSection.kind !== 'tasks') return 0;
    return taskSection.tasks.length;
  }
}
