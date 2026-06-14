// ─── LLM Token/Cost Interception ─────────────────────────────────────────────
// Tracks token usage (input/output) and estimates costs based on a pricing
// table. Logs per-session/per-artifact costs to cost-tracking.jsonl.
//
// Issue: #5 — LLM Token/Cost Interception

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../utils/logger';

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

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostEntry {
  timestamp: number;
  sessionId: string;
  artifactId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

// ── Token Counting ───────────────────────────────────────────────────────────

/** Rough token estimate: ~4 chars per token for English, ~2 for code. */
export function estimateTokens(text: string, isCode: boolean = false): number {
  if (!text) return 0;
  const charsPerToken = isCode ? 2.5 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/** Count tokens for a chat-style message array. */
export function countMessagesTokens(messages: Array<{ content?: string }>): TokenUsage {
  let inputTokens = 0;
  for (const m of messages) {
    inputTokens += estimateTokens(m.content ?? '');
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

  constructor(logPath?: string) {
    this.logPath = logPath ?? path.join(os.tmpdir(), 'cost-tracking.jsonl');
    this.entries = this.loadExisting();
  }

  /** Record a single LLM call's token usage and cost. */
  record(sessionId: string, model: string, usage: TokenUsage, artifactId?: string): CostEntry {
    const { inputCost, outputCost, totalCost } = estimateCost(model, usage);
    const entry: CostEntry = {
      timestamp: Date.now(),
      sessionId,
      artifactId,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      inputCost,
      outputCost,
      totalCost,
    };
    this.entries.push(entry);
    this.persist(entry);
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
