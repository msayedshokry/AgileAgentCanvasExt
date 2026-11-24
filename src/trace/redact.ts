// ─── Trace redaction ─────────────────────────────────────────────────────────
// Traces record tool inputs and agent decisions and are kept for weeks inside
// the workspace, so credentials and bulky file bodies are removed before an
// entry is buffered. Pure: no I/O.

const MAX_STRING_CHARS = 8 * 1024;
const MAX_DEPTH = 8;
const REDACTED = '[redacted]';

/** Object keys whose values are always secret. */
const SECRET_KEY = /^(api[-_]?key|apikey|token|access[-_]?token|refresh[-_]?token|secret|client[-_]?secret|password|passwd|authorization|cookie|x-api-key|x-goog-api-key)$/i;

/** Credential formats that can appear inside free text. */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g,             // Anthropic
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,       // OpenAI
  /\bAIza[0-9A-Za-z_-]{30,}/g,                // Google
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,            // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,          // Slack
  /\bAKIA[0-9A-Z]{16}\b/g,                    // AWS access key id
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function redactText(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, REDACTED);
  if (out.length > MAX_STRING_CHARS) {
    out = `${out.slice(0, MAX_STRING_CHARS)}…[truncated ${out.length - MAX_STRING_CHARS} chars]`;
  }
  return out;
}

/** Deep copy of `value` with secrets masked and long strings truncated. */
export function redactTraceData<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return redactText(value) as unknown as T;
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[nested data omitted]' as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactTraceData(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) && v !== undefined && v !== null && v !== '' ? REDACTED : redactTraceData(v, depth + 1);
  }
  return out as T;
}
