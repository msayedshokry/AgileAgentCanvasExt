// Files that fail schema validation, each with the first reason it fails.
// Shown in the schema toasts so the user sees what Fix Schemas could not
// repair (e.g. a status no rule maps) without sending it to chat first.

export interface SchemaIssue {
  readonly file: string;
  readonly type: string;
  readonly errors: readonly string[];
}

interface SchemaIssueListProps {
  readonly issues: readonly SchemaIssue[];
}

const MAX_FILES = 3;

// The extension's validator appends "(Correction Suggestion: Use one of -> a, b)".
const SUGGESTION_RE = /^(.*?)\s*\(Correction Suggestion:\s*(.*)\)\s*$/s;

/** Split an error into its reason and the fix it suggests (allowed values etc.). */
function splitSuggestion(error: string): { reason: string; fix?: string } {
  const match = SUGGESTION_RE.exec(error);
  if (!match) return { reason: error };
  return { reason: match[1], fix: match[2].replace(/\s*->\s*/, ': ') };
}

export function SchemaIssueList({ issues }: SchemaIssueListProps) {
  const shown = issues.slice(0, MAX_FILES);
  const hiddenFiles = issues.length - shown.length;

  return (
    <ul className="toast-error-list schema-issue-list">
      {shown.map((issue, i) => {
        const [first, ...rest] = issue?.errors ?? [];
        const { reason, fix } = first ? splitSuggestion(first) : { reason: '' };
        return (
          <li key={`${issue?.file ?? 'unknown'}-${i}`} className="toast-body">
            <span className="schema-issue-file">{issue?.file ?? 'unknown'}</span>
            {first && (
              <span className="schema-issue-reason" title={first}>{reason}</span>
            )}
            {fix && <span className="schema-issue-fix">{fix}</span>}
            {rest.length > 0 && <span className="schema-issue-more">+{rest.length} more</span>}
          </li>
        );
      })}
      {hiddenFiles > 0 && <li className="toast-body">...and {hiddenFiles} more files</li>}
    </ul>
  );
}
