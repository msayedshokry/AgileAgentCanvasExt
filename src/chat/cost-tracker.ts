// ─── LLM Token/Cost Interception ─────────────────────────────────────────────
// Tracks token usage (input/output) and estimates costs based on a pricing
// table. Logs per-session/per-artifact costs to cost-tracking.jsonl.
//
// Issue: #5 — LLM Token/Cost Interception

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../utils/logger';
import { encode as encodeGpt4 } from 'gpt-tokenizer/model/gpt-4';
import { encode as encodeGpt35 } from 'gpt-tokenizer/model/gpt-3.5-turbo';

const logger = createLogger('cost-tracker');

// ── Pricing Table (USD per 1K tokens) ────────────────────────────────────────

export interface ModelPricing {
  inputPer1K: number;
  outputPer1K: number;
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o':           { inputPer1K: 0.005,  outputPer1K: 0.015 },
  'gpt-4o-mini':      { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  'gpt-4-turbo':      { inputPer1K: 0.01,   outputPer1K: 0.03 },
  // Anthropic
  'claude-3-5-sonnet':{ inputPer1K: 0.003,  outputPer1K: 0.015 },
  'claude-3-haiku':   { inputPer1K: 0.00025, outputPer1K: 0.00125 },
  // Gemini
  'gemini-1.5-pro':   { inputPer1K: 0.00125, outputPer1K: 0.005 },
  'gemini-1.5-flash': { inputPer1K: 0.000075, outputPer1K: 0.0003 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1K: 0.001, outputPer1K: 0.002 };

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Token usage reported by an LLM API (when available) or estimated locally.
 *
 * Cache tokens are tracked as TWO separate fields because they price
 * differently:
 *   - `cacheReadTokens`  — cheap, ~10% of fresh input cost (Anthropic cache reads,
 *                          Gemini cached content reads, typically free with TTL).
 *   - `cacheCreationTokens` — MORE EXPENSIVE than fresh input on Anthropic
 *                          (1.25–2× S4.5 input cost) — bundling with reads
 *                          would understate future cost. Unused by Gemini.
 * Providers that don't report cache info simply leave both undefinined.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Cheaper cached reads from provider prompt cache. */
  cacheReadTokens?: number;
  /** More-expensive cache writes (Anthropic only — pricing differs). */
  cacheCreationTokens?: number;
}

export interface CostEntry {
  timestamp: number;
  sessionId: string;
  /**
   * Optional workflow name (audit gap #20/#42). When a `streamChatResponse`
   * call threads a `workflow` option, the cost-tracker stores it here AND
   * sets sessionId to `workflow:<name>` so the budget gauge can group spend
   * per-workflow instead of bucketing every chat call as 'chat-session'.
   */
  workflow?: string;
  artifactId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Cached tokens read from provider cache (tracked separately for future per-cache pricing). */
  cacheReadTokens?: number;
  /** Cached tokens written to provider cache (Anthropic only). */
  cacheCreationTokens?: number;
  /** SOURCE of the token counts — `api` if reported by the model, `estimate` if computed by tiktoken. */
  source: 'api' | 'estimate';
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

// ── Token Counting ───────────────────────────────────────────────────────────

/** Map model names to their closest available tokenizer.
 *  gpt-tokenizer provides per-model encoders; for non-OpenAI models
 *  we fall back to the GPT-4 encoder (cl100k_base) which is the most
 *  widely-used tokenizer and a reasonable approximation (±5-10%). */
function getEncoder(model?: string): (text: string) => number[] {
  if (!model) return encodeGpt4 as (text: string) => number[];
  const lower = model.toLowerCase();
  // GPT-4 family: cl100k_base
  if (lower.includes('gpt-4') || lower.includes('gpt-4o')) return encodeGpt4 as (text: string) => number[];
  // GPT-3.5 family: cl100k_base (same as GPT-4 in practice)
  if (lower.includes('gpt-3.5')) return encodeGpt35 as (text: string) => number[];
  // Anthropic / Gemini / Ollama / local models: cl100k_base is a
  // reasonable universal estimate until we add provider-specific encoders.
  return encodeGpt4 as (text: string) => number[];
}

/**
 * Count tokens in a string using an actual tokenizer (gpt-tokenizer),
 * replacing the old character-based heuristic (±50% error) with tiktoken-
 * compatible encoding (±5-10% at worst for non-OpenAI models).
 *
 * @param text    The text to count tokens for.
 * @param _isCode Ignored — kept for backward compatibility; the tokenizer
 *                handles code and prose equally well.
 * @param model   Optional model name for provider-specific encoding.
 */
export function estimateTokens(text: string, _isCode: boolean = false, model?: string): number {
  if (!text) return 0;
  const encode = getEncoder(model);
  return encode(text).length;
}

/** Count tokens for a chat-style message array. */
export function countMessagesTokens(messages: Array<{ content?: string }>, model?: string): TokenUsage {
  let inputTokens = 0;
  for (const m of messages) {
    inputTokens += estimateTokens(m.content ?? '', false, model);
  }
  return { inputTokens, outputTokens: 0 };
}

// ── Cost Estimation ──────────────────────────────────────────────────────────

export function estimateCost(model: string, usage: TokenUsage): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = PRICING_TABLE[model] ?? matchPricingByFamily(model);
  const inputCost = (usage.inputTokens / 1000) * pricing.inputPer1K;
  const outputCost = (usage.outputTokens / 1000) * pricing.outputPer1K;
  return {
    inputCost: roundUSD(inputCost),
    outputCost: roundUSD(outputCost),
    totalCost: roundUSD(inputCost + outputCost),
  };
}

function matchPricingByFamily(model: string): ModelPricing {
  const lower = model.toLowerCase();
  if (lower.includes('gpt-4'))    return PRICING_TABLE['gpt-4o'];
  if (lower.includes('gpt-3.5'))  return PRICING_TABLE['gpt-4o-mini'];
  if (lower.includes('claude'))   return PRICING_TABLE['claude-3-5-sonnet'];
  if (lower.includes('gemini'))   return PRICING_TABLE['gemini-1.5-pro'];
  if (lower.includes('llama'))    return { inputPer1K: 0.0002, outputPer1K: 0.0002 };
  if (lower.includes('mistral'))  return { inputPer1K: 0.0002, outputPer1K: 0.0006 };
  return DEFAULT_PRICING;
}

function roundUSD(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

// ── Cost Tracker ─────────────────────────────────────────────────────────────

export class CostTracker {
  private logPath: string;
  private entries: CostEntry[] = [];
  /** Callback invoked after each cost record so the autonomy lifecycle can
   *  broadcast updated budget status to the webview. */
  private onCostRecorded: ((entry: CostEntry) => void) | null = null;

  constructor(logPath?: string) {
    this.logPath = logPath ?? path.join(os.tmpdir(), 'cost-tracking.jsonl');
    this.entries = this.loadExisting();
  }

  /** Register a callback fired after every cost record. Pass null to clear. */
  setOnCostRecorded(fn: ((entry: CostEntry) => void) | null): void {
    this.onCostRecorded = fn;
  }

  /** Override the log file path (e.g., for the extension's output folder). */
  setLogPath(logPath: string): void {
    this.logPath = logPath;
  }

  /**
   * Record a single LLM call's token usage and cost.
   * @param usage    Token counts — prefer real API-reported values; fall back to `estimateTokens()`.
   * @param source   `api` when the provider reported its own usage,
   *                 `estimate` when we computed it locally (audit gap #5/#23).
   * @param workflow Optional workflow name (audit gap #20/#42) — when set,
   *                 the call site already used `workflow:<name>` as sessionId,
   *                 but the raw name is also persisted on the entry so
   *                 downstream analytics can filter without string-prefix
   *                 matching.
   */
  record(sessionId: string, model: string, usage: TokenUsage, artifactId?: string, source: 'api' | 'estimate' = 'estimate', workflow?: string): CostEntry {
    const { inputCost, outputCost, totalCost } = estimateCost(model, usage);
    const entry: CostEntry = {
      timestamp: Date.now(),
      sessionId,
      workflow,
      artifactId,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      source,
      inputCost,
      outputCost,
      totalCost,
    };
    this.entries.push(entry);
    this.persist(entry);
    this.onCostRecorded?.(entry);
    return entry;
  }

  /** Total cost across all recorded entries (USD). */
  totalCost(filter?: { sessionId?: string; artifactId?: string; since?: number }): number {
    return this.filterEntries(filter).reduce((sum, e) => sum + e.totalCost, 0);
  }

  /** Total tokens (input + output) matching filter. */
  totalTokens(filter?: { sessionId?: string; artifactId?: string; since?: number }): TokenUsage {
    const entries = this.filterEntries(filter);
    return entries.reduce(
      (acc, e) => ({ inputTokens: acc.inputTokens + e.inputTokens, outputTokens: acc.outputTokens + e.outputTokens }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }

  /** Cost for a specific artifact. */
  costForArtifact(artifactId: string): number {
    return this.totalCost({ artifactId });
  }

  /** Cost for a specific session. */
  costForSession(sessionId: string): number {
    return this.totalCost({ sessionId });
  }

  /**
   * Cost for a specific workflow (audit gap #20/#42). Reads entries tagged
   * with `sessionId === "workflow:<name>"`. Faster than scanning the entries
   * table for the prefix because the index is just a hash lookup on
   * sessionId.
   */
  costForWorkflow(name: string): number {
    return this.totalCost({ sessionId: `workflow:${name}` });
  }

  /**
   * Per-workflow cost + token breakdown for surfacing in the budget gauge
   * (follow-up to audit gap #20/#42). Groups entries by workflow name — either
   * from the persisted `workflow` field OR derived from the `workflow:<name>`
   * sessionId prefix when the field is missing (older logs). Includes the
   * fallback `'chat-session'` bucket so residual non-workflow spend is visible.
   *
   * Default ordering is by cost DESC; configurable via `sort: 'name'`.
   * Optional `since` window matches the `totalCost()` time filter — used to
   * align the breakdown with the daily cap.
   */
  perWorkflowBreakdown(opts?: { since?: number; sort?: 'cost' | 'name' }): Array<{
    workflow: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    calls: number;
  }> {
    const since = opts?.since;
    const workflowTotals = new Map<string, { cost: number; inputTokens: number; outputTokens: number; calls: number }>();
    for (const e of this.entries) {
      if (since !== undefined && e.timestamp < since) continue;
      // Prefer the persisted workflow field; fall back to the sessionId prefix.
      const name = e.workflow ?? (e.sessionId.startsWith('workflow:') ? e.sessionId.slice('workflow:'.length) : 'chat-session');
      const row = workflowTotals.get(name) ?? { cost: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
      row.cost += e.totalCost;
      row.inputTokens += e.inputTokens;
      row.outputTokens += e.outputTokens;
      row.calls += 1;
      workflowTotals.set(name, row);
    }
    const rows = Array.from(workflowTotals, ([workflow, v]) => ({ workflow, ...v }));
    rows.sort((a, b) => (opts?.sort === 'name' ? a.workflow.localeCompare(b.workflow) : b.cost - a.cost));
    return rows;
  }

  /** Clear in-memory entries (does not delete the log file). */
  reset(): void {
    this.entries = [];
  }

  private filterEntries(filter?: { sessionId?: string; artifactId?: string; since?: number }): CostEntry[] {
    if (!filter) return this.entries;
    return this.entries.filter(e => {
      if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
      if (filter.artifactId && e.artifactId !== filter.artifactId) return false;
      if (filter.since && e.timestamp < filter.since) return false;
      return true;
    });
  }

  private persist(entry: CostEntry): void {
    try {
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      logger.warn('Failed to persist cost entry', { error: String(err), path: this.logPath });
    }
  }

  /** Load existing entries from the JSONL log file (best-effort). */
  private loadExisting(): CostEntry[] {
    try {
      if (!fs.existsSync(this.logPath)) return [];
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      const entries: CostEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as CostEntry);
        } catch {
          // Skip corrupt lines
        }
      }
      return entries;
    } catch (err) {
      logger.warn('Failed to load existing cost entries', { error: String(err) });
      return [];
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const costTracker = new CostTracker();
