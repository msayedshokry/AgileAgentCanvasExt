// ── Types ────────────────────────────────────────────────────────────────────

export interface ApprovalPolicyFailure {
  policyId: string;
  failures: string[];
}

export interface ApprovalRequest {
  artifactId: string;
  workflowId?: string;
  policyFailures: ApprovalPolicyFailure[];
}

// ── Component ────────────────────────────────────────────────────────────────

interface ApprovalBannerProps {
  /** Active approval request (null = nothing to approve). */
  request: ApprovalRequest | null;
  /** User clicked Approve or Deny — parent should clear the request. */
  onRespond: (approved: boolean) => void;
}

export function ApprovalBanner({ request, onRespond }: ApprovalBannerProps) {
  if (!request) return null;

  return (
    <div className="approval-banner" role="alert" aria-live="assertive">
      <div className="approval-banner-icon" aria-hidden="true">⚠</div>
      <div className="approval-banner-body">
        <div className="approval-banner-title">
          Agent needs your approval to proceed
        </div>
        <div className="approval-banner-detail">
          {request.workflowId && (
            <span className="approval-banner-workflow">{request.workflowId}</span>
          )}
          <span className="approval-banner-artifact">{request.artifactId}</span>
        </div>
        {request.policyFailures.length > 0 && (
          <ul className="approval-banner-failures">
            {request.policyFailures.map(f => (
              <li key={f.policyId}>
                <span className="approval-banner-policy-id">{f.policyId}</span>
                {f.failures.map((msg, i) => (
                  <span key={i} className="approval-banner-failure-msg">{msg}</span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="approval-banner-actions">
        <button
          className="approval-banner-btn approval-banner-btn--approve"
          onClick={() => onRespond(true)}
        >
          Approve
        </button>
        <button
          className="approval-banner-btn approval-banner-btn--deny"
          onClick={() => onRespond(false)}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
