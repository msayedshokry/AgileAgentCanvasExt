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

export function SchemaIssueList({ issues }: SchemaIssueListProps) {
  const shown = issues.slice(0, MAX_FILES);
  const hiddenFiles = issues.length - shown.length;

  return (
    <ul className="toast-error-list schema-issue-list">
      {shown.map((issue, i) => {
        const [first, ...rest] = issue?.errors ?? [];
        return (
          <li key={`${issue?.file ?? 'unknown'}-${i}`} className="toast-body">
            <span className="schema-issue-file">{issue?.file ?? 'unknown'}</span>
            {first && (
              <span className="schema-issue-reason" title={first}>{first}</span>
            )}
            {rest.length > 0 && <span className="schema-issue-more">+{rest.length} more</span>}
          </li>
        );
      })}
      {hiddenFiles > 0 && <li className="toast-body">...and {hiddenFiles} more files</li>}
    </ul>
  );
}
