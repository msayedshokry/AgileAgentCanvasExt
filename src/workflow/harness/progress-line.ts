// ─── Live progress line ──────────────────────────────────────────────────────
// A running card shows what its agent is doing right now: the latest
// meaningful line of terminal output, so the board answers "is it working,
// and on what?" without opening a terminal. Pure: no vscode.

// eslint-disable-next-line no-control-regex -- matches ANSI escape sequences by design
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)|\u001b[()][A-Z0-9]/g;
const MAX_CHARS = 140;
const SCAN_CHARS = 6000;
export const PROGRESS_MIN_INTERVAL_MS = 1500;

// Lines that say nothing about the work: shell prompts, spinners, rules, our own launch command.
const NOISE: readonly RegExp[] = [
  /^PS [A-Za-z]:\\.*>\s*$/,           // PowerShell prompt
  /^[\w.@~:/\\-]*[$#>%]\s*$/,          // bash/zsh/cmd prompt
  /^[\s\p{P}\p{S}]*$/u,               // only punctuation/symbols: spinners, box rules
  /[<|].*_terminal-output[\\/]prompts/, // the staged-prompt launch command
];

/** The latest line worth showing on the card, or undefined when there is none yet. */
export function latestProgressLine(output: string | undefined): string | undefined {
  if (!output) return undefined;
  const lines = output.slice(-SCAN_CHARS).replace(ANSI, '').split(/\r\n|\r|\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/\s+/g, ' ').trim();
    if (!line || NOISE.some((re) => re.test(line))) continue;
    return line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS - 1)}…` : line;
  }
  return undefined;
}

/** Lets a card's line through only when it changed and not more often than the interval. */
export class ProgressThrottle {
  private readonly last = new Map<string, { line: string; at: number }>();

  constructor(private readonly minIntervalMs = PROGRESS_MIN_INTERVAL_MS) {}

  offer(artifactId: string, line: string | undefined, now: number): string | undefined {
    if (!line) return undefined;
    const prev = this.last.get(artifactId);
    if (prev && (prev.line === line || now - prev.at < this.minIntervalMs)) return undefined;
    this.last.set(artifactId, { line, at: now });
    return line;
  }

  forget(artifactId: string): void {
    this.last.delete(artifactId);
  }
}
