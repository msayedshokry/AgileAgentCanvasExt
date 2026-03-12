// ==========================================================================
// BMM RENDERERS — Business & Management Method renderers
// Contains: definition-of-done, fit-criteria, success-metrics, retrospective,
//   sprint-status, code-review, change-proposal, readiness-report, risks,
//   research, ux-design, tech-spec, project-overview, project-context, source-tree
// ==========================================================================

import { RendererProps, CollapsibleSection, Md } from './shared';

// ==========================================================================
// DEFINITION OF DONE DETAILS
// ==========================================================================

export function renderDefinitionOfDoneDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;

  // ── Normalize items ─────────────────────────────────────────────────────
  // Sample shapes:
  //   Epic-embedded:  string[]  (e.g. ["All acceptance criteria verified", ...])
  //   Standalone BMM: [{id, category, criterion, verification, status}, ...]
  //   Renderer-native: [{item, category?, completed?, id?, evidence?, notes?}, ...]
  const rawItems: any[] = (() => {
    // If the entire editedData is an array (standalone BMM file loaded at root), use it
    if (Array.isArray(d)) return d;
    return d.items || [];
  })();
  const items: any[] = rawItems.map((entry: any, idx: number) => {
    if (typeof entry === 'string') return { item: entry, id: `DOD-${idx + 1}` };
    // Map BMM `criterion` → renderer's `item`
    if (entry.criterion && !entry.item) return { ...entry, item: entry.criterion };
    return entry;
  });
  const qualityGates: any[] = (Array.isArray(d) ? [] : d.qualityGates) || [];
  const acceptanceSummary = (Array.isArray(d) ? {} : d.acceptanceSummary) || {};
  const templates = (Array.isArray(d) ? {} : d.templates) || {};
  const summary = (Array.isArray(d) ? {} : d.summary) || {};
  const hasSummary = summary.totalItems != null || summary.status;
  const hasAcceptanceSummary = acceptanceSummary.totalCriteria != null;

  const dodCategories = ['code-quality', 'testing', 'documentation', 'review', 'deployment', 'security', 'performance', 'compliance'];
  const dodStatuses = ['not-started', 'in-progress', 'blocked', 'ready-for-review', 'done'];

  return (
    <>
      {/* Summary Row */}
      {hasSummary && (
        <div className="detail-row">
          {summary.completionPercentage && (
            <section className="detail-section inline">
              <h4>Completion</h4>
              <span className="tag">{summary.completionPercentage}</span>
            </section>
          )}
          {summary.completedItems != null && (
            <section className="detail-section inline">
              <h4>Completed</h4>
              <span className="tag">{summary.completedItems} / {summary.totalItems || '?'}</span>
            </section>
          )}
          {summary.requiredCompleted != null && (
            <section className="detail-section inline">
              <h4>Required Done</h4>
              <span className="tag">{summary.requiredCompleted} / {summary.requiredItems || '?'}</span>
            </section>
          )}
          {summary.status && (
            <section className="detail-section inline">
              <h4>Status</h4>
              {editMode ? (
                <select value={summary.status} onChange={(e) => handleFieldChange('summary', { ...summary, status: e.target.value })} className="status-select">
                  <option value="">Not set</option>
                  {dodStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <span className={`status-badge status-${summary.status}`}>{summary.status}</span>
              )}
            </section>
          )}
          {summary.allRequiredComplete != null && (
            <section className="detail-section inline">
              <h4>All Required</h4>
              <span className={`tag ${summary.allRequiredComplete ? 'tag-success' : 'tag-warning'}`}>
                {summary.allRequiredComplete ? 'Complete' : 'Incomplete'}
              </span>
            </section>
          )}
        </div>
      )}

      {/* DoD Items */}
      <CollapsibleSection title="Checklist Items" count={items.length} sectionId="dod-items">
        {items.length > 0 ? (
          items.map((item: any, i: number) => (
            <div key={i} className="editable-item-header" style={{ flexWrap: 'wrap', padding: '8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px', opacity: item.completed ? 0.7 : 1 }}>
              <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                {editMode ? (
                  <input type="checkbox" checked={!!item.completed} onChange={(e) => {
                    const updated = [...items];
                    updated[i] = { ...item, completed: e.target.checked };
                    handleFieldChange('items', updated);
                  }} />
                ) : (
                  <span style={{ fontSize: '1.1em' }}>{item.completed ? '\u2611' : '\u2610'}</span>
                )}
                <strong style={{ flex: 1, textDecoration: item.completed ? 'line-through' : 'none' }}>
                  {item.id ? `${item.id}: ` : ''}{item.item || `Item ${i + 1}`}
                </strong>
                {item.required === false && <span className="tag">Optional</span>}
                {item.category && <span className="tag">{item.category}</span>}
              </div>
              {editMode && (
                <div style={{ width: '100%', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="text" value={item.item || ''} onChange={(e) => {
                    const updated = [...items];
                    updated[i] = { ...item, item: e.target.value };
                    handleFieldChange('items', updated);
                  }} placeholder="DoD item text..." style={{ flex: 1 }} />
                  <select value={item.category || ''} onChange={(e) => {
                    const updated = [...items];
                    updated[i] = { ...item, category: e.target.value };
                    handleFieldChange('items', updated);
                  }} className="status-select">
                    <option value="">Category</option>
                    {dodCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button className="icon-button" onClick={() => { const updated = items.filter((_: any, idx: number) => idx !== i); handleFieldChange('items', updated); }} title="Remove item">{'\u2715'}</button>
                </div>
              )}
              {item.verification && <div style={{ width: '100%', marginTop: '4px' }}><strong>Verification:</strong> {item.verification}</div>}
              {item.evidence && <div style={{ width: '100%', marginTop: '4px' }}><strong>Evidence:</strong> {item.evidence}</div>}
              {item.completedBy && <div style={{ width: '100%' }}><strong>Completed by:</strong> {item.completedBy}</div>}
              {item.completedAt && <div style={{ width: '100%' }}><strong>Completed at:</strong> {item.completedAt}</div>}
              {item.status && <div style={{ width: '100%', marginTop: '2px' }}><span className={`status-badge status-${item.status}`}>{item.status}</span></div>}
              {item.notes && <div style={{ width: '100%', marginTop: '2px' }}><em>{item.notes}</em></div>}
            </div>
          ))
        ) : (
          <p className="empty-message">No DoD items defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('items', [...items, { item: '', category: '', required: true, completed: false }])}>+ Add Item</button>
        )}
      </CollapsibleSection>

      {/* Quality Gates */}
      <CollapsibleSection title="Quality Gates" count={qualityGates.length} sectionId="dod-quality-gates">
        {qualityGates.length > 0 ? (
          qualityGates.map((gate: any, i: number) => (
            <div key={i} className="editable-item-header" style={{ flexWrap: 'wrap', padding: '8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                <span style={{ fontSize: '1.1em' }}>{gate.passed ? '\u2705' : '\u26D4'}</span>
                <strong style={{ flex: 1 }}>{gate.id ? `${gate.id}: ` : ''}{gate.gate || `Gate ${i + 1}`}</strong>
                {gate.passed && <span className="tag tag-success">Passed</span>}
                {gate.passedAt && <span className="tag">{gate.passedAt}</span>}
                {gate.approver && <span className="tag">{gate.approver}</span>}
              </div>
              {gate.criteria && gate.criteria.length > 0 && (
                <ul style={{ width: '100%', margin: '4px 0 0 16px', padding: 0, listStyleType: 'disc' }}>
                  {gate.criteria.map((c: string, ci: number) => <li key={ci}>{c}</li>)}
                </ul>
              )}
            </div>
          ))
        ) : (
          <p className="empty-message">No quality gates defined</p>
        )}
      </CollapsibleSection>

      {/* Acceptance Summary */}
      {hasAcceptanceSummary && (
        <CollapsibleSection title="Acceptance Summary" sectionId="dod-acceptance">
          <div className="detail-row">
            {acceptanceSummary.passPercentage && (
              <section className="detail-section inline">
                <h4>Pass Rate</h4>
                <span className="tag">{acceptanceSummary.passPercentage}</span>
              </section>
            )}
            {acceptanceSummary.passedCriteria != null && (
              <section className="detail-section inline">
                <h4>Passed</h4>
                <span className="tag tag-success">{acceptanceSummary.passedCriteria}</span>
              </section>
            )}
            {acceptanceSummary.failedCriteria != null && acceptanceSummary.failedCriteria > 0 && (
              <section className="detail-section inline">
                <h4>Failed</h4>
                <span className="tag tag-error">{acceptanceSummary.failedCriteria}</span>
              </section>
            )}
            {acceptanceSummary.blockedCriteria != null && acceptanceSummary.blockedCriteria > 0 && (
              <section className="detail-section inline">
                <h4>Blocked</h4>
                <span className="tag tag-warning">{acceptanceSummary.blockedCriteria}</span>
              </section>
            )}
            <section className="detail-section inline">
              <h4>Total</h4>
              <span className="tag">{acceptanceSummary.totalCriteria}</span>
            </section>
          </div>
        </CollapsibleSection>
      )}

      {/* Templates */}
      {(templates.epic?.length || templates.story?.length || templates.feature?.length) && (
        <CollapsibleSection title="DoD Templates" sectionId="dod-templates">
          {templates.epic?.length > 0 && (
            <>
              <h4>Epic Template</h4>
              <ul>{templates.epic.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
          {templates.story?.length > 0 && (
            <>
              <h4>Story Template</h4>
              <ul>{templates.story.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
          {templates.feature?.length > 0 && (
            <>
              <h4>Feature Template</h4>
              <ul>{templates.feature.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// FIT CRITERIA DETAILS
// ==========================================================================

export function renderFitCriteriaDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const functional: any[] = d.functional || [];
  const nonFunctional: any[] = d.nonFunctional || [];
  const security: any[] = d.security || [];
  const summary = d.summary || {};
  const hasSummary = summary.totalCriteria != null || summary.verificationPercentage;

  const funcVerificationMethods = ['test', 'inspection', 'demonstration', 'analysis'];
  const nfCategories = ['performance', 'scalability', 'reliability', 'availability', 'maintainability', 'usability', 'compatibility'];
  const nfVerificationMethods = ['benchmark', 'load-test', 'stress-test', 'monitoring', 'inspection'];
  const secCategories = ['authentication', 'authorization', 'encryption', 'audit', 'compliance', 'data-protection', 'network-security'];
  const secVerificationMethods = ['security-audit', 'penetration-test', 'code-review', 'compliance-review', 'inspection'];

  const renderCriterionItem = (item: any, i: number, listKey: string, verMethods: string[], catOptions?: string[]) => (
    <div key={i} className="editable-item-header" style={{ flexWrap: 'wrap', padding: '8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px', opacity: item.verified ? 0.7 : 1 }}>
      <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
        {editMode ? (
          <input type="checkbox" checked={!!item.verified} onChange={(e) => {
            const list = d[listKey] || [];
            const updated = [...list];
            updated[i] = { ...item, verified: e.target.checked };
            handleFieldChange(listKey, updated);
          }} />
        ) : (
          <span style={{ fontSize: '1.1em' }}>{item.verified ? '\u2611' : '\u2610'}</span>
        )}
        <strong style={{ flex: 1, textDecoration: item.verified ? 'line-through' : 'none' }}>
          {item.id ? `${item.id}: ` : ''}{item.criterion || `Criterion ${i + 1}`}
        </strong>
        {item.category && <span className="tag">{item.category}</span>}
        {item.verificationMethod && <span className="tag">{item.verificationMethod}</span>}
      </div>
      {editMode && (
        <div style={{ width: '100%', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" value={item.criterion || ''} onChange={(e) => {
            const list = d[listKey] || [];
            const updated = [...list];
            updated[i] = { ...item, criterion: e.target.value };
            handleFieldChange(listKey, updated);
          }} placeholder="Criterion statement..." style={{ flex: 1, minWidth: '200px' }} />
          {catOptions && (
            <select value={item.category || ''} onChange={(e) => {
              const list = d[listKey] || [];
              const updated = [...list];
              updated[i] = { ...item, category: e.target.value };
              handleFieldChange(listKey, updated);
            }} className="status-select">
              <option value="">Category</option>
              {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={item.verificationMethod || ''} onChange={(e) => {
            const list = d[listKey] || [];
            const updated = [...list];
            updated[i] = { ...item, verificationMethod: e.target.value };
            handleFieldChange(listKey, updated);
          }} className="status-select">
            <option value="">Verification</option>
            {verMethods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="icon-button" onClick={() => {
            const list = d[listKey] || [];
            handleFieldChange(listKey, list.filter((_: any, idx: number) => idx !== i));
          }} title="Remove">{'\u2715'}</button>
        </div>
      )}
      {item.relatedRequirement && <div style={{ width: '100%', marginTop: '2px' }}><strong>Related:</strong> <span className="tag">{item.relatedRequirement}</span></div>}
      {item.complianceStandard && <div style={{ width: '100%', marginTop: '2px' }}><strong>Standard:</strong> <span className="tag">{item.complianceStandard}</span></div>}
      {item.metric && (item.metric.measure || item.metric.target) && (
        <div style={{ width: '100%', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {item.metric.measure && <span><strong>Measure:</strong> {item.metric.measure}</span>}
          {item.metric.target && <span><strong>Target:</strong> {item.metric.target}</span>}
          {item.metric.threshold && <span><strong>Threshold:</strong> {item.metric.threshold}</span>}
          {item.metric.unit && <span><strong>Unit:</strong> {item.metric.unit}</span>}
        </div>
      )}
      {item.notes && <div style={{ width: '100%', marginTop: '2px' }}><em>{item.notes}</em></div>}
    </div>
  );

  return (
    <>
      {/* Summary Row */}
      {hasSummary && (
        <div className="detail-row">
          {summary.verificationPercentage && (
            <section className="detail-section inline">
              <h4>Verified</h4>
              <span className="tag">{summary.verificationPercentage}</span>
            </section>
          )}
          {summary.verifiedCount != null && (
            <section className="detail-section inline">
              <h4>Verified Count</h4>
              <span className="tag tag-success">{summary.verifiedCount} / {summary.totalCriteria || '?'}</span>
            </section>
          )}
          {summary.totalFunctional != null && (
            <section className="detail-section inline">
              <h4>Functional</h4>
              <span className="tag">{summary.totalFunctional}</span>
            </section>
          )}
          {summary.totalNonFunctional != null && (
            <section className="detail-section inline">
              <h4>Non-Functional</h4>
              <span className="tag">{summary.totalNonFunctional}</span>
            </section>
          )}
          {summary.totalSecurity != null && (
            <section className="detail-section inline">
              <h4>Security</h4>
              <span className="tag">{summary.totalSecurity}</span>
            </section>
          )}
        </div>
      )}

      {/* Functional Criteria */}
      <CollapsibleSection title="Functional Criteria" count={functional.length} sectionId="fc-functional">
        {functional.length > 0 ? (
          functional.map((item: any, i: number) => renderCriterionItem(item, i, 'functional', funcVerificationMethods))
        ) : (
          <p className="empty-message">No functional criteria defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('functional', [...functional, { criterion: '', verified: false }])}>+ Add Criterion</button>
        )}
      </CollapsibleSection>

      {/* Non-Functional Criteria */}
      <CollapsibleSection title="Non-Functional Criteria" count={nonFunctional.length} sectionId="fc-nonfunctional">
        {nonFunctional.length > 0 ? (
          nonFunctional.map((item: any, i: number) => renderCriterionItem(item, i, 'nonFunctional', nfVerificationMethods, nfCategories))
        ) : (
          <p className="empty-message">No non-functional criteria defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('nonFunctional', [...nonFunctional, { criterion: '', category: '', verified: false }])}>+ Add Criterion</button>
        )}
      </CollapsibleSection>

      {/* Security Criteria */}
      <CollapsibleSection title="Security Criteria" count={security.length} sectionId="fc-security">
        {security.length > 0 ? (
          security.map((item: any, i: number) => renderCriterionItem(item, i, 'security', secVerificationMethods, secCategories))
        ) : (
          <p className="empty-message">No security criteria defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('security', [...security, { criterion: '', category: '', verified: false }])}>+ Add Criterion</button>
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// SUCCESS METRICS DETAILS
// ==========================================================================

export function renderSuccessMetricsDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const codeQuality: any[] = d.codeQuality || [];
  const operational: any[] = d.operational || [];
  const customerImpact: any[] = d.customerImpact || [];
  const deployment: any[] = d.deployment || [];
  const business: any[] = d.business || [];
  const summary = d.summary || {};
  const hasSummary = summary.totalMetrics != null || summary.overallStatus;

  const statusOptions = ['not-started', 'in-progress', 'partially-achieved', 'achieved', 'exceeded'];

  const renderMetricItem = (item: any, i: number, listKey: string, showActualValue?: boolean) => (
    <div key={i} className="editable-item-header" style={{ flexWrap: 'wrap', padding: '8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px', opacity: item.achieved ? 0.7 : 1 }}>
      <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
        {editMode ? (
          <input type="checkbox" checked={!!item.achieved} onChange={(e) => {
            const list = d[listKey] || [];
            const updated = [...list];
            updated[i] = { ...item, achieved: e.target.checked };
            handleFieldChange(listKey, updated);
          }} />
        ) : (
          <span style={{ fontSize: '1.1em' }}>{item.achieved ? '\u2611' : '\u2610'}</span>
        )}
        <strong style={{ flex: 1, textDecoration: item.achieved ? 'line-through' : 'none' }}>
          {item.id ? `${item.id}: ` : ''}{item.metric || `Metric ${i + 1}`}
        </strong>
      </div>
      {editMode && (
        <div style={{ width: '100%', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" value={item.metric || ''} onChange={(e) => {
            const list = d[listKey] || [];
            const updated = [...list];
            updated[i] = { ...item, metric: e.target.value };
            handleFieldChange(listKey, updated);
          }} placeholder="Metric description..." style={{ flex: 1, minWidth: '200px' }} />
          <input type="text" value={item.target || ''} onChange={(e) => {
            const list = d[listKey] || [];
            const updated = [...list];
            updated[i] = { ...item, target: e.target.value };
            handleFieldChange(listKey, updated);
          }} placeholder="Target value..." style={{ width: '150px' }} />
          <button className="icon-button" onClick={() => {
            const list = d[listKey] || [];
            handleFieldChange(listKey, list.filter((_: any, idx: number) => idx !== i));
          }} title="Remove">{'\u2715'}</button>
        </div>
      )}
      <div style={{ width: '100%', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {item.target && <span><strong>Target:</strong> {item.target}</span>}
        {item.baseline && <span><strong>Baseline:</strong> {item.baseline}</span>}
        {item.measurement && <span><strong>Measurement:</strong> {item.measurement}</span>}
        {showActualValue && item.actualValue && <span><strong>Actual:</strong> <span className="tag tag-success">{item.actualValue}</span></span>}
      </div>
      {item.notes && <div style={{ width: '100%', marginTop: '2px' }}><em>{item.notes}</em></div>}
    </div>
  );

  return (
    <>
      {/* Summary Row */}
      {hasSummary && (
        <div className="detail-row">
          {summary.achievementPercentage && (
            <section className="detail-section inline">
              <h4>Achievement</h4>
              <span className="tag">{summary.achievementPercentage}</span>
            </section>
          )}
          {summary.achievedCount != null && (
            <section className="detail-section inline">
              <h4>Achieved</h4>
              <span className="tag tag-success">{summary.achievedCount} / {summary.totalMetrics || '?'}</span>
            </section>
          )}
          {summary.overallStatus && (
            <section className="detail-section inline">
              <h4>Status</h4>
              {editMode ? (
                <select value={summary.overallStatus} onChange={(e) => handleFieldChange('summary', { ...summary, overallStatus: e.target.value })} className="status-select">
                  <option value="">Not set</option>
                  {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <span className={`status-badge status-${summary.overallStatus}`}>{summary.overallStatus}</span>
              )}
            </section>
          )}
        </div>
      )}

      {/* Code Quality Metrics */}
      <CollapsibleSection title="Code Quality" count={codeQuality.length} sectionId="sm-code-quality">
        {codeQuality.length > 0 ? (
          codeQuality.map((item: any, i: number) => renderMetricItem(item, i, 'codeQuality'))
        ) : (
          <p className="empty-message">No code quality metrics defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('codeQuality', [...codeQuality, { metric: '', achieved: false }])}>+ Add Metric</button>
        )}
      </CollapsibleSection>

      {/* Operational Metrics */}
      <CollapsibleSection title="Operational" count={operational.length} sectionId="sm-operational">
        {operational.length > 0 ? (
          operational.map((item: any, i: number) => renderMetricItem(item, i, 'operational', true))
        ) : (
          <p className="empty-message">No operational metrics defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('operational', [...operational, { metric: '', achieved: false }])}>+ Add Metric</button>
        )}
      </CollapsibleSection>

      {/* Customer Impact Metrics */}
      <CollapsibleSection title="Customer Impact" count={customerImpact.length} sectionId="sm-customer-impact">
        {customerImpact.length > 0 ? (
          customerImpact.map((item: any, i: number) => renderMetricItem(item, i, 'customerImpact'))
        ) : (
          <p className="empty-message">No customer impact metrics defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('customerImpact', [...customerImpact, { metric: '', achieved: false }])}>+ Add Metric</button>
        )}
      </CollapsibleSection>

      {/* Deployment Metrics */}
      <CollapsibleSection title="Deployment" count={deployment.length} sectionId="sm-deployment">
        {deployment.length > 0 ? (
          deployment.map((item: any, i: number) => renderMetricItem(item, i, 'deployment'))
        ) : (
          <p className="empty-message">No deployment metrics defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('deployment', [...deployment, { metric: '', achieved: false }])}>+ Add Metric</button>
        )}
      </CollapsibleSection>

      {/* Business Metrics */}
      <CollapsibleSection title="Business" count={business.length} sectionId="sm-business">
        {business.length > 0 ? (
          business.map((item: any, i: number) => renderMetricItem(item, i, 'business', true))
        ) : (
          <p className="empty-message">No business metrics defined</p>
        )}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('business', [...business, { metric: '', achieved: false }])}>+ Add Metric</button>
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// RETROSPECTIVE DETAILS
// ==========================================================================

export function renderRetrospectiveDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const epicRef = d.epicReference || {};
  const summary = d.summary || {};
  const whatWentWell: any[] = d.whatWentWell || [];
  const whatDidNotGoWell: any[] = d.whatDidNotGoWell || [];
  const lessonsLearned: any[] = d.lessonsLearned || [];
  const storyAnalysis: any[] = d.storyAnalysis || [];
  const technicalDebt = d.technicalDebt || {};
  const debtIntroduced: any[] = technicalDebt.debtIntroduced || [];
  const debtAddressed: any[] = technicalDebt.debtAddressed || [];
  const impactOnFutureWork = d.impactOnFutureWork || {};
  const teamFeedback = d.teamFeedback || {};
  const actionItems: any[] = d.actionItems || [];
  const metricsSnapshot = d.metricsSnapshot || {};
  const velocityAnalysis = summary.velocityAnalysis || {};

  const successOptions = ['exceeded-expectations', 'met-expectations', 'partially-met', 'did-not-meet'];
  const lessonCategories = ['technical', 'process', 'communication', 'estimation', 'architecture', 'testing', 'tooling'];
  const actionPriorities = ['high', 'medium', 'low'];
  const actionStatuses = ['pending', 'in-progress', 'done'];

  return (
    <>
      {/* Epic Reference */}
      {(epicRef.epicId || epicRef.title) && (
        <div className="detail-row">
          {epicRef.epicId && (
            <section className="detail-section inline"><h4>Epic</h4><span className="tag">{epicRef.epicId}</span></section>
          )}
          {epicRef.title && (
            <section className="detail-section inline"><h4>Title</h4><span>{epicRef.title}</span></section>
          )}
          {epicRef.totalStories != null && (
            <section className="detail-section inline"><h4>Stories</h4><span className="tag">{epicRef.totalStories}</span></section>
          )}
          {epicRef.durationDays != null && (
            <section className="detail-section inline"><h4>Duration</h4><span className="tag">{epicRef.durationDays}d</span></section>
          )}
          {epicRef.startDate && (
            <section className="detail-section inline"><h4>Start</h4><span>{epicRef.startDate}</span></section>
          )}
          {epicRef.completionDate && (
            <section className="detail-section inline"><h4>Completed</h4><span>{epicRef.completionDate}</span></section>
          )}
        </div>
      )}
      {epicRef.goal && (
        <section className="detail-section"><h4>Epic Goal</h4><span>{epicRef.goal}</span></section>
      )}

      {/* Overall Summary */}
      {(summary.overallSuccess || summary.keyAchievements?.length || summary.mainChallenges?.length) && (
        <CollapsibleSection title="Summary" sectionId="retro-summary">
          {summary.overallSuccess && (
            <div className="detail-row">
              <section className="detail-section inline">
                <h4>Overall Success</h4>
                {editMode ? (
                  <select value={summary.overallSuccess} onChange={(e) => handleFieldChange('summary', { ...summary, overallSuccess: e.target.value })} className="status-select">
                    <option value="">Not set</option>
                    {successOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span className={`status-badge status-${summary.overallSuccess}`}>{summary.overallSuccess}</span>
                )}
              </section>
            </div>
          )}
          {summary.keyAchievements?.length > 0 && (
            <><h4>Key Achievements</h4><ul>{summary.keyAchievements.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></>
          )}
          {summary.mainChallenges?.length > 0 && (
            <><h4>Main Challenges</h4><ul>{summary.mainChallenges.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul></>
          )}
          {(velocityAnalysis.estimatedEffort || velocityAnalysis.actualEffort) && (
            <div className="detail-row" style={{ marginTop: '8px' }}>
              {velocityAnalysis.estimatedEffort && <section className="detail-section inline"><h4>Estimated</h4><span>{velocityAnalysis.estimatedEffort}</span></section>}
              {velocityAnalysis.actualEffort && <section className="detail-section inline"><h4>Actual</h4><span>{velocityAnalysis.actualEffort}</span></section>}
              {velocityAnalysis.variance && <section className="detail-section inline"><h4>Variance</h4><span className="tag">{velocityAnalysis.variance}</span></section>}
            </div>
          )}
          {velocityAnalysis.varianceReason && <p><strong>Variance Reason:</strong> {velocityAnalysis.varianceReason}</p>}
        </CollapsibleSection>
      )}

      {/* What Went Well */}
      <CollapsibleSection title="What Went Well" count={whatWentWell.length} sectionId="retro-well">
        {whatWentWell.length > 0 ? (
          whatWentWell.map((item: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <strong>{item.item || `Item ${i + 1}`}</strong>
              {item.impact && <div><strong>Impact:</strong> {item.impact}</div>}
              {item.recommendation && <div><em>Recommendation: {item.recommendation}</em></div>}
            </div>
          ))
        ) : <p className="empty-message">No items recorded</p>}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('whatWentWell', [...whatWentWell, { item: '' }])}>+ Add Item</button>
        )}
      </CollapsibleSection>

      {/* What Did Not Go Well */}
      <CollapsibleSection title="What Did Not Go Well" count={whatDidNotGoWell.length} sectionId="retro-bad">
        {whatDidNotGoWell.length > 0 ? (
          whatDidNotGoWell.map((item: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <strong>{item.item || `Item ${i + 1}`}</strong>
              {item.impact && <div><strong>Impact:</strong> {item.impact}</div>}
              {item.rootCause && <div><strong>Root Cause:</strong> {item.rootCause}</div>}
              {item.recommendation && <div><em>Recommendation: {item.recommendation}</em></div>}
            </div>
          ))
        ) : <p className="empty-message">No items recorded</p>}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('whatDidNotGoWell', [...whatDidNotGoWell, { item: '' }])}>+ Add Item</button>
        )}
      </CollapsibleSection>

      {/* Lessons Learned */}
      <CollapsibleSection title="Lessons Learned" count={lessonsLearned.length} sectionId="retro-lessons">
        {lessonsLearned.length > 0 ? (
          lessonsLearned.map((item: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{item.id ? `${item.id}: ` : ''}{item.lesson || `Lesson ${i + 1}`}</strong>
                {item.category && <span className="tag">{item.category}</span>}
                {item.actionable && <span className="tag tag-success">Actionable</span>}
              </div>
              {editMode && (
                <div style={{ marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="text" value={item.lesson || ''} onChange={(e) => {
                    const updated = [...lessonsLearned]; updated[i] = { ...item, lesson: e.target.value }; handleFieldChange('lessonsLearned', updated);
                  }} placeholder="Lesson..." style={{ flex: 1 }} />
                  <select value={item.category || ''} onChange={(e) => {
                    const updated = [...lessonsLearned]; updated[i] = { ...item, category: e.target.value }; handleFieldChange('lessonsLearned', updated);
                  }} className="status-select">
                    <option value="">Category</option>
                    {lessonCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {item.appliesTo?.length > 0 && <div style={{ marginTop: '2px' }}><strong>Applies to:</strong> {item.appliesTo.map((a: string, ai: number) => <span key={ai} className="tag" style={{ marginRight: '4px' }}>{a}</span>)}</div>}
            </div>
          ))
        ) : <p className="empty-message">No lessons recorded</p>}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('lessonsLearned', [...lessonsLearned, { lesson: '', actionable: false }])}>+ Add Lesson</button>
        )}
      </CollapsibleSection>

      {/* Action Items */}
      <CollapsibleSection title="Action Items" count={actionItems.length} sectionId="retro-actions">
        {actionItems.length > 0 ? (
          actionItems.map((item: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{item.id ? `${item.id}: ` : ''}{item.action || `Action ${i + 1}`}</strong>
                {item.priority && <span className={`tag risk-${item.priority}`}>{item.priority}</span>}
                {item.status && <span className={`status-badge status-${item.status}`}>{item.status}</span>}
              </div>
              {editMode && (
                <div style={{ marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="text" value={item.action || ''} onChange={(e) => {
                    const updated = [...actionItems]; updated[i] = { ...item, action: e.target.value }; handleFieldChange('actionItems', updated);
                  }} placeholder="Action..." style={{ flex: 1, minWidth: '200px' }} />
                  <input type="text" value={item.owner || ''} onChange={(e) => {
                    const updated = [...actionItems]; updated[i] = { ...item, owner: e.target.value }; handleFieldChange('actionItems', updated);
                  }} placeholder="Owner" style={{ width: '120px' }} />
                  <select value={item.priority || ''} onChange={(e) => {
                    const updated = [...actionItems]; updated[i] = { ...item, priority: e.target.value }; handleFieldChange('actionItems', updated);
                  }} className="status-select">
                    <option value="">Priority</option>
                    {actionPriorities.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={item.status || 'pending'} onChange={(e) => {
                    const updated = [...actionItems]; updated[i] = { ...item, status: e.target.value }; handleFieldChange('actionItems', updated);
                  }} className="status-select">
                    {actionStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {item.owner && !editMode && <div><strong>Owner:</strong> {item.owner}</div>}
              {item.dueDate && <div><strong>Due:</strong> {item.dueDate}</div>}
            </div>
          ))
        ) : <p className="empty-message">No action items</p>}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('actionItems', [...actionItems, { action: '', status: 'pending' }])}>+ Add Action</button>
        )}
      </CollapsibleSection>

      {/* Story Analysis */}
      {storyAnalysis.length > 0 && (
        <CollapsibleSection title="Story Analysis" count={storyAnalysis.length} sectionId="retro-stories">
          {storyAnalysis.map((s: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {s.storyId && <span className="tag">{s.storyId}</span>}
                <strong style={{ flex: 1 }}>{s.storyTitle || `Story ${i + 1}`}</strong>
                {s.outcome && <span className={`status-badge status-${s.outcome}`}>{s.outcome}</span>}
              </div>
              {s.timeSpent && <div><strong>Time:</strong> {s.timeSpent}</div>}
              {s.notes && <div><em>{s.notes}</em></div>}
              {s.blockers?.length > 0 && <div><strong>Blockers:</strong> {s.blockers.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Technical Debt */}
      {(debtIntroduced.length > 0 || debtAddressed.length > 0) && (
        <CollapsibleSection title="Technical Debt" count={debtIntroduced.length + debtAddressed.length} sectionId="retro-debt">
          {debtIntroduced.length > 0 && (
            <><h4>Introduced</h4>
            {debtIntroduced.map((item: any, i: number) => (
              <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
                <strong>{item.description}</strong>
                {item.severity && <span className={`tag risk-${item.severity}`} style={{ marginLeft: '6px' }}>{item.severity}</span>}
                {item.reason && <div><strong>Reason:</strong> {item.reason}</div>}
                {item.remediationPlan && <div><strong>Remediation:</strong> {item.remediationPlan}</div>}
              </div>
            ))}</>
          )}
          {debtAddressed.length > 0 && (
            <><h4>Addressed</h4>
            {debtAddressed.map((item: any, i: number) => (
              <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
                <strong>{item.description}</strong>
                {item.resolution && <div><strong>Resolution:</strong> {item.resolution}</div>}
              </div>
            ))}</>
          )}
        </CollapsibleSection>
      )}

      {/* Impact on Future Work */}
      {(impactOnFutureWork.nextEpicImpacts?.length || impactOnFutureWork.architectureChanges?.length || impactOnFutureWork.newDiscoveries?.length || impactOnFutureWork.suggestedBacklogChanges?.length) && (
        <CollapsibleSection title="Impact on Future Work" sectionId="retro-impact">
          {impactOnFutureWork.nextEpicImpacts?.length > 0 && (
            <><h4>Next Epic Impacts</h4><ul>{impactOnFutureWork.nextEpicImpacts.map((item: any, i: number) => <li key={i}><strong>{item.epicId}:</strong> {item.impact}{item.recommendation && <em> — {item.recommendation}</em>}</li>)}</ul></>
          )}
          {impactOnFutureWork.architectureChanges?.length > 0 && (
            <><h4>Architecture Changes</h4><ul>{impactOnFutureWork.architectureChanges.map((item: any, i: number) => <li key={i}><strong>{item.decision}</strong> — {item.rationale}{item.documentationUpdate && <div style={{ fontSize: '0.9em', opacity: 0.8 }}><strong>Doc Update:</strong> {item.documentationUpdate}</div>}</li>)}</ul></>
          )}
          {impactOnFutureWork.newDiscoveries?.length > 0 && (
            <><h4>New Discoveries</h4><ul>{impactOnFutureWork.newDiscoveries.map((item: any, i: number) => <li key={i}><strong>{item.discovery}</strong> — {item.implication}{item.action && <div style={{ fontSize: '0.9em', opacity: 0.8 }}><strong>Action:</strong> {item.action}</div>}</li>)}</ul></>
          )}
          {impactOnFutureWork.suggestedBacklogChanges?.length > 0 && (
            <><h4>Suggested Backlog Changes</h4><ul>{impactOnFutureWork.suggestedBacklogChanges.map((item: any, i: number) => <li key={i}>[{item.changeType}] <strong>{item.targetItem}:</strong> {item.description}{item.rationale && <div style={{ fontSize: '0.9em', opacity: 0.8 }}><strong>Rationale:</strong> {item.rationale}</div>}</li>)}</ul></>
          )}
        </CollapsibleSection>
      )}

      {/* Team Feedback */}
      {(teamFeedback.processImprovements?.length || teamFeedback.toolingImprovements?.length || teamFeedback.communicationImprovements?.length) && (
        <CollapsibleSection title="Team Feedback" sectionId="retro-feedback">
          {teamFeedback.processImprovements?.length > 0 && (
            <><h4>Process</h4><ul>{teamFeedback.processImprovements.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>
          )}
          {teamFeedback.toolingImprovements?.length > 0 && (
            <><h4>Tooling</h4><ul>{teamFeedback.toolingImprovements.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>
          )}
          {teamFeedback.communicationImprovements?.length > 0 && (
            <><h4>Communication</h4><ul>{teamFeedback.communicationImprovements.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>
          )}
        </CollapsibleSection>
      )}

      {/* Metrics Snapshot */}
      {(metricsSnapshot.codeMetrics || metricsSnapshot.qualityMetrics) && (
        <CollapsibleSection title="Metrics Snapshot" sectionId="retro-metrics">
          {metricsSnapshot.codeMetrics && (
            <div className="detail-row">
              {metricsSnapshot.codeMetrics.linesAdded != null && <section className="detail-section inline"><h4>Lines Added</h4><span className="tag">{metricsSnapshot.codeMetrics.linesAdded}</span></section>}
              {metricsSnapshot.codeMetrics.linesRemoved != null && <section className="detail-section inline"><h4>Lines Removed</h4><span className="tag">{metricsSnapshot.codeMetrics.linesRemoved}</span></section>}
              {metricsSnapshot.codeMetrics.filesChanged != null && <section className="detail-section inline"><h4>Files Changed</h4><span className="tag">{metricsSnapshot.codeMetrics.filesChanged}</span></section>}
              {metricsSnapshot.codeMetrics.testCoverage != null && <section className="detail-section inline"><h4>Test Coverage</h4><span className="tag">{metricsSnapshot.codeMetrics.testCoverage}%</span></section>}
            </div>
          )}
          {metricsSnapshot.qualityMetrics && (
            <div className="detail-row">
              {metricsSnapshot.qualityMetrics.bugsFound != null && <section className="detail-section inline"><h4>Bugs Found</h4><span className="tag">{metricsSnapshot.qualityMetrics.bugsFound}</span></section>}
              {metricsSnapshot.qualityMetrics.bugsFixed != null && <section className="detail-section inline"><h4>Bugs Fixed</h4><span className="tag">{metricsSnapshot.qualityMetrics.bugsFixed}</span></section>}
              {metricsSnapshot.qualityMetrics.reviewIterations != null && <section className="detail-section inline"><h4>Review Iterations</h4><span className="tag">{metricsSnapshot.qualityMetrics.reviewIterations}</span></section>}
            </div>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// SPRINT STATUS DETAILS
// ==========================================================================

export function renderSprintStatusDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;

  // ── Normalize: support both "project dashboard" shape and BMM "sprint report" shape ──
  const summary = d.summary || {};
  const epics: any[] = d.epics || [];
  const developmentStatus = d.developmentStatus || {};
  const devStatusEntries = Object.entries(developmentStatus);

  // BMM sprint-report fields
  const velocityMetrics = d.velocityMetrics || {};
  const storyStatus: any[] = d.storyStatus || [];
  const riskUpdates: any[] = d.riskUpdates || [];
  const blockers: any[] = d.blockers || [];
  const achievements: any[] = d.achievements || [];
  const upcomingWork: any[] = d.upcomingWork || [];
  const stakeholderActions: any[] = d.stakeholderActions || [];

  const isBmmReport = !!(d.sprintName || d.sprintNumber || d.sprintGoal || storyStatus.length);

  return (
    <>
      {/* Sprint Info (BMM report shape) */}
      {isBmmReport && (
        <div className="detail-row">
          {d.sprintName && (
            <section className="detail-section inline"><h4>Sprint</h4>
              {editMode ? <input type="text" value={d.sprintName} onChange={(e) => handleFieldChange('sprintName', e.target.value)} className="full-width-input" /> : <span>{d.sprintName}</span>}
            </section>
          )}
          {d.sprintNumber != null && (
            <section className="detail-section inline"><h4>#</h4><span className="tag">{d.sprintNumber}</span></section>
          )}
          {d.overallStatus && (
            <section className="detail-section inline"><h4>Status</h4><span className={`status-badge status-${d.overallStatus}`}>{d.overallStatus}</span></section>
          )}
          {d.overallHealth && (
            <section className="detail-section inline"><h4>Health</h4><span className={`tag ${d.overallHealth === 'green' ? 'tag-success' : d.overallHealth === 'red' ? 'tag-error' : 'tag-warning'}`}>{d.overallHealth}</span></section>
          )}
          {d.completionPercentage != null && (
            <section className="detail-section inline"><h4>Completion</h4><span className="tag">{d.completionPercentage}%</span></section>
          )}
        </div>
      )}

      {/* Sprint Goal */}
      {d.sprintGoal && (
        <section className="detail-section"><h4>Sprint Goal</h4><Md text={d.sprintGoal} /></section>
      )}

      {/* Story Location */}
      {d.storyLocation && (
        <section className="detail-section"><h4>Story Location</h4><span>{d.storyLocation}</span></section>
      )}

      {/* Date Range */}
      {d.dateRange && (d.dateRange.startDate || d.dateRange.endDate) && (
        <div className="detail-row">
          {d.dateRange.startDate && <section className="detail-section inline"><h4>Start</h4><span>{d.dateRange.startDate}</span></section>}
          {d.dateRange.endDate && <section className="detail-section inline"><h4>End</h4><span>{d.dateRange.endDate}</span></section>}
        </div>
      )}

      {/* Velocity Metrics (BMM) */}
      {(velocityMetrics.planned != null || velocityMetrics.completed != null) && (
        <div className="detail-row" style={{ marginTop: '8px' }}>
          {velocityMetrics.planned != null && <section className="detail-section inline"><h4>Planned</h4><span className="tag">{velocityMetrics.planned} pts</span></section>}
          {velocityMetrics.completed != null && <section className="detail-section inline"><h4>Completed</h4><span className="tag tag-success">{velocityMetrics.completed} pts</span></section>}
          {velocityMetrics.remaining != null && <section className="detail-section inline"><h4>Remaining</h4><span className="tag tag-warning">{velocityMetrics.remaining} pts</span></section>}
          {velocityMetrics.velocityTrend && <section className="detail-section inline"><h4>Trend</h4><span className="tag">{velocityMetrics.velocityTrend}</span></section>}
        </div>
      )}

      {/* Project Info (dashboard shape) */}
      {!isBmmReport && (
        <div className="detail-row">
          {d.project && (
            <section className="detail-section inline">
              <h4>Project</h4>
              {editMode ? (
                <input type="text" value={d.project} onChange={(e) => handleFieldChange('project', e.target.value)} className="full-width-input" />
              ) : <span>{d.project}</span>}
            </section>
          )}
          {d.projectKey && (
            <section className="detail-section inline"><h4>Key</h4><span className="tag">{d.projectKey}</span></section>
          )}
          {d.trackingSystem && (
            <section className="detail-section inline"><h4>Tracking</h4><span className="tag">{d.trackingSystem}</span></section>
          )}
          {d.generated && (
            <section className="detail-section inline"><h4>Generated</h4><span>{new Date(d.generated).toLocaleString()}</span></section>
          )}
        </div>
      )}

      {/* Summary (dashboard shape) */}
      {(summary.totalEpics != null || summary.totalStories != null) && (
        <div className="detail-row" style={{ marginTop: '8px' }}>
          {summary.totalEpics != null && <section className="detail-section inline"><h4>Epics</h4><span className="tag">{summary.completedEpics || 0}/{summary.totalEpics} done</span></section>}
          {summary.inProgressEpics != null && <section className="detail-section inline"><h4>In Progress</h4><span className="tag">{summary.inProgressEpics}</span></section>}
          {summary.totalStories != null && <section className="detail-section inline"><h4>Stories</h4><span className="tag">{summary.completedStories || 0}/{summary.totalStories} done</span></section>}
          {summary.inProgressStories != null && <section className="detail-section inline"><h4>In Progress</h4><span className="tag">{summary.inProgressStories}</span></section>}
          {summary.backlogStories != null && <section className="detail-section inline"><h4>Backlog</h4><span className="tag">{summary.backlogStories}</span></section>}
        </div>
      )}

      {/* Story Status (BMM sprint report) */}
      {storyStatus.length > 0 && (
        <CollapsibleSection title="Story Status" count={storyStatus.length} sectionId="sprint-stories">
          {storyStatus.map((s: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {s.storyId && <span className="tag">{s.storyId}</span>}
                <strong style={{ flex: 1 }}>{s.title || `Story ${i + 1}`}</strong>
                {s.status && <span className={`status-badge status-${s.status}`}>{s.status}</span>}
                {s.completionPercentage != null && <span className="tag">{s.completionPercentage}%</span>}
              </div>
              {s.assignee && <div><strong>Assignee:</strong> {s.assignee}</div>}
              {s.notes && <div style={{ marginTop: '2px' }}><em>{s.notes}</em></div>}
              {s.blockers?.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  <strong>Blockers:</strong>
                  {s.blockers.map((b: any, bi: number) => (
                    <div key={bi} style={{ marginLeft: '8px', marginTop: '2px', padding: '4px', background: 'var(--vscode-inputValidation-warningBackground, rgba(255,200,0,0.1))', borderRadius: '3px' }}>
                      <div>{typeof b === 'string' ? b : b.blocker}</div>
                      {b.impact && <div style={{ fontSize: '0.9em' }}><strong>Impact:</strong> {b.impact}</div>}
                      {b.resolution && <div style={{ fontSize: '0.9em' }}><strong>Resolution:</strong> {b.resolution}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Epics (dashboard shape) */}
      {epics.length > 0 && (
        <CollapsibleSection title="Epics" count={epics.length} sectionId="sprint-epics">
          {epics.map((epic: any, i: number) => (
            <CollapsibleSection key={i} title={`${epic.epicId || `Epic ${i + 1}`}: ${epic.title || 'Untitled'}`} sectionId={`sprint-epic-${i}`}>
              <div className="detail-row">
                <section className="detail-section inline"><h4>Status</h4><span className={`status-badge status-${epic.status}`}>{epic.status}</span></section>
              </div>
              {epic.stories?.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <h4>Stories ({epic.stories.length})</h4>
                  {epic.stories.map((s: any, si: number) => (
                    <div key={si} style={{ padding: '4px 8px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px', flexWrap: 'wrap' }}>
                      <span className="tag">{s.storyKey || s.storyId || `S-${si + 1}`}</span>
                      <span style={{ flex: 1 }}>{s.title}</span>
                      <span className={`status-badge status-${s.status}`}>{s.status}</span>
                      {s.assignee && <span className="tag">{s.assignee}</span>}
                      {s.filePath && <div style={{ width: '100%' }}><code style={{ fontSize: '0.85em', opacity: 0.7 }}>{s.filePath}</code></div>}
                      {s.startedAt && <div style={{ width: '100%', fontSize: '0.85em', opacity: 0.7 }}><strong>Started:</strong> {s.startedAt}</div>}
                      {s.completedAt && <div style={{ width: '100%', fontSize: '0.85em', opacity: 0.7 }}><strong>Completed:</strong> {s.completedAt}</div>}
                    </div>
                  ))}
                </div>
              )}
              {epic.retrospective && epic.retrospective.status && (
                <div style={{ marginTop: '6px' }}>
                  <strong>Retrospective:</strong> <span className={`status-badge status-${epic.retrospective.status}`}>{epic.retrospective.status}</span>
                  {epic.retrospective.filePath && <div><code style={{ fontSize: '0.85em', opacity: 0.7 }}>{epic.retrospective.filePath}</code></div>}
                  {epic.retrospective.completedAt && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><strong>Completed:</strong> {epic.retrospective.completedAt}</div>}
                </div>
              )}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* Risk Updates (BMM) */}
      {riskUpdates.length > 0 && (
        <CollapsibleSection title="Risk Updates" count={riskUpdates.length} sectionId="sprint-risk-updates">
          {riskUpdates.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              {r.riskId && <span className="tag">{r.riskId}</span>}
              {r.status && <span className={`status-badge status-${r.status}`}>{r.status}</span>}
              <span style={{ flex: 1 }}>{r.update}</span>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Blockers (BMM) */}
      {blockers.length > 0 && (
        <CollapsibleSection title="Blockers" count={blockers.length} sectionId="sprint-blockers">
          {blockers.map((b: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-inputValidation-warningBackground, rgba(255,200,0,0.1))', marginBottom: '6px' }}>
              <strong>{b.description}</strong>
              {b.impact && <div><strong>Impact:</strong> {b.impact}</div>}
              {b.owner && <div><strong>Owner:</strong> {b.owner}</div>}
              {b.resolution && <div><strong>Resolution:</strong> {b.resolution}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Achievements (BMM) */}
      {achievements.length > 0 && (
        <CollapsibleSection title="Achievements" count={achievements.length} sectionId="sprint-achievements">
          <ul>{achievements.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
        </CollapsibleSection>
      )}

      {/* Upcoming Work (BMM) */}
      {upcomingWork.length > 0 && (
        <CollapsibleSection title="Upcoming Work" count={upcomingWork.length} sectionId="sprint-upcoming">
          <ul>{upcomingWork.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
        </CollapsibleSection>
      )}

      {/* Team Morale (BMM) */}
      {d.teamMorale && (
        <section className="detail-section"><h4>Team Morale</h4><Md text={d.teamMorale} /></section>
      )}

      {/* Stakeholder Actions (BMM) */}
      {stakeholderActions.length > 0 && (
        <CollapsibleSection title="Stakeholder Actions" count={stakeholderActions.length} sectionId="sprint-stakeholder-actions">
          {stakeholderActions.map((a: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <strong>{a.action}</strong>
              {a.owner && <span className="tag" style={{ marginLeft: '8px' }}>{a.owner}</span>}
              {a.dueDate && <span style={{ marginLeft: '8px' }}><em>Due: {a.dueDate}</em></span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Development Status Map (dashboard shape) */}
      {devStatusEntries.length > 0 && (
        <CollapsibleSection title="Development Status" count={devStatusEntries.length} sectionId="sprint-dev-status">
          {devStatusEntries.map(([key, val]: [string, any], i: number) => (
            <div key={i} style={{ padding: '2px 8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <code style={{ flex: 1 }}>{key}</code>
              <span className={`status-badge status-${val}`}>{String(val)}</span>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Status Definitions */}
      {d.statusDefinitions && (d.statusDefinitions.epicStatuses?.length > 0 || d.statusDefinitions.storyStatuses?.length > 0) && (
        <CollapsibleSection title="Status Definitions" sectionId="sprint-status-defs">
          {d.statusDefinitions.epicStatuses?.length > 0 && (
            <>
              <h4>Epic Statuses</h4>
              <ul>{d.statusDefinitions.epicStatuses.map((s: any, i: number) => (
                <li key={i}><strong>{typeof s === 'string' ? s : s.status || s.name || `Status ${i + 1}`}</strong>{typeof s !== 'string' && s.description ? ` — ${s.description}` : ''}</li>
              ))}</ul>
            </>
          )}
          {d.statusDefinitions.storyStatuses?.length > 0 && (
            <>
              <h4>Story Statuses</h4>
              <ul>{d.statusDefinitions.storyStatuses.map((s: any, i: number) => (
                <li key={i}><strong>{typeof s === 'string' ? s : s.status || s.name || `Status ${i + 1}`}</strong>{typeof s !== 'string' && s.description ? ` — ${s.description}` : ''}</li>
              ))}</ul>
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// CODE REVIEW DETAILS
// ==========================================================================

export function renderCodeReviewDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const storyRef = d.storyReference || {};
  const reviewSummary = d.reviewSummary || {};
  const findings: any[] = d.findings || [];
  const acVerification: any[] = d.acceptanceCriteriaVerification || [];
  const testCoverage = d.testCoverageAnalysis || {};
  const securityAnalysis = d.securityAnalysis || {};
  const archCompliance = d.architectureCompliance || {};
  const nextSteps: any[] = d.nextSteps || [];

  const verdictOptions = ['approved', 'approved-with-fixes', 'changes-required', 'rejected'];
  const severityOptions = ['critical', 'major', 'minor', 'suggestion'];

  return (
    <>
      {/* Story Reference */}
      {(storyRef.storyId || storyRef.storyKey) && (
        <div className="detail-row">
          {storyRef.storyKey && <section className="detail-section inline"><h4>Story</h4><span className="tag">{storyRef.storyKey}</span></section>}
          {storyRef.storyId && <section className="detail-section inline"><h4>Story ID</h4><span className="tag">{storyRef.storyId}</span></section>}
          {storyRef.storyTitle && <section className="detail-section inline"><h4>Title</h4><span>{storyRef.storyTitle}</span></section>}
          {storyRef.epicId && <section className="detail-section inline"><h4>Epic</h4><span className="tag">{storyRef.epicId}</span></section>}
        </div>
      )}
      {storyRef.storyFilePath && (
        <div style={{ marginTop: '4px' }}><strong>Story File:</strong> <code style={{ fontSize: '0.85em' }}>{storyRef.storyFilePath}</code></div>
      )}

      {/* Review Summary */}
      {(reviewSummary.overallVerdict || reviewSummary.totalFindings != null) && (
        <div className="detail-row" style={{ marginTop: '8px' }}>
          {reviewSummary.overallVerdict && (
            <section className="detail-section inline">
              <h4>Verdict</h4>
              {editMode ? (
                <select value={reviewSummary.overallVerdict} onChange={(e) => handleFieldChange('reviewSummary', { ...reviewSummary, overallVerdict: e.target.value })} className="status-select">
                  <option value="">Not set</option>
                  {verdictOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <span className={`status-badge status-${reviewSummary.overallVerdict}`}>{reviewSummary.overallVerdict}</span>
              )}
            </section>
          )}
          {reviewSummary.totalFindings != null && <section className="detail-section inline"><h4>Total</h4><span className="tag">{reviewSummary.totalFindings}</span></section>}
          {reviewSummary.criticalCount != null && reviewSummary.criticalCount > 0 && <section className="detail-section inline"><h4>Critical</h4><span className="tag tag-error">{reviewSummary.criticalCount}</span></section>}
          {reviewSummary.majorCount != null && reviewSummary.majorCount > 0 && <section className="detail-section inline"><h4>Major</h4><span className="tag tag-warning">{reviewSummary.majorCount}</span></section>}
          {reviewSummary.minorCount != null && <section className="detail-section inline"><h4>Minor</h4><span className="tag">{reviewSummary.minorCount}</span></section>}
          {reviewSummary.suggestionsCount != null && <section className="detail-section inline"><h4>Suggestions</h4><span className="tag">{reviewSummary.suggestionsCount}</span></section>}
          {reviewSummary.autoFixableCount != null && reviewSummary.autoFixableCount > 0 && <section className="detail-section inline"><h4>Auto-fixable</h4><span className="tag tag-success">{reviewSummary.autoFixableCount}</span></section>}
          {reviewSummary.reviewDuration && <section className="detail-section inline"><h4>Duration</h4><span>{reviewSummary.reviewDuration}</span></section>}
        </div>
      )}

      {/* Findings */}
      <CollapsibleSection title="Findings" count={findings.length} sectionId="cr-findings">
        {findings.length > 0 ? (
          findings.map((f: any, i: number) => (
            <CollapsibleSection key={i} title={`${f.id || `F-${i + 1}`}: ${f.description?.slice(0, 80) || 'Finding'}`} sectionId={`cr-finding-${i}`}>
              <div className="detail-row">
                {f.severity && (
                  <section className="detail-section inline">
                    <h4>Severity</h4>
                    {editMode ? (
                      <select value={f.severity} onChange={(e) => { const updated = [...findings]; updated[i] = { ...f, severity: e.target.value }; handleFieldChange('findings', updated); }} className="status-select">
                        {severityOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className={`tag risk-${f.severity === 'critical' ? 'high' : f.severity === 'major' ? 'medium' : 'low'}`}>{f.severity}</span>
                    )}
                  </section>
                )}
                {f.category && <section className="detail-section inline"><h4>Category</h4><span className="tag">{f.category}</span></section>}
                {f.autoFixable && <section className="detail-section inline"><h4>Auto-fix</h4><span className="tag tag-success">{f.autoFixApplied ? 'Applied' : 'Available'}</span></section>}
              </div>
              {f.description && <p><Md text={f.description} /></p>}
              {f.location && (
                <div style={{ marginTop: '4px' }}>
                  {f.location.filePath && <code>{f.location.filePath}{f.location.lineNumber ? `:${f.location.lineNumber}` : ''}</code>}
                  {f.location.lineRange && <span style={{ marginLeft: '8px' }}><strong>Lines:</strong> {f.location.lineRange.start}–{f.location.lineRange.end}</span>}
                  {f.location.functionName && <span style={{ marginLeft: '8px' }}><strong>fn:</strong> {f.location.functionName}</span>}
                  {f.location.componentName && <span style={{ marginLeft: '8px' }}><strong>Component:</strong> {f.location.componentName}</span>}
                </div>
              )}
              {f.codeSnippet && <pre style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '8px', borderRadius: '4px', overflow: 'auto', fontSize: '0.85em', marginTop: '4px' }}>{f.codeSnippet}</pre>}
              {f.recommendation && <div style={{ marginTop: '4px' }}><strong>Recommendation:</strong> <Md text={f.recommendation} /></div>}
              {f.suggestedFix && <div style={{ marginTop: '4px' }}><strong>Suggested Fix:</strong> <pre style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '8px', borderRadius: '4px', overflow: 'auto', fontSize: '0.85em' }}>{f.suggestedFix}</pre></div>}
              {f.references?.length > 0 && (
                <div style={{ marginTop: '4px' }}><strong>References:</strong><ul>{f.references.map((ref: any, ri: number) => <li key={ri}>{typeof ref === 'string' ? ref : ref.title || ref.url || `Ref ${ri + 1}`}</li>)}</ul></div>
              )}
            </CollapsibleSection>
          ))
        ) : <p className="empty-message">No findings</p>}
      </CollapsibleSection>

      {/* Acceptance Criteria Verification */}
      {acVerification.length > 0 && (
        <CollapsibleSection title="AC Verification" count={acVerification.length} sectionId="cr-ac">
          {acVerification.map((ac: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
              <span className="tag">{ac.acId || `AC-${i + 1}`}</span>
              <span style={{ flex: 1 }}>{ac.acDescription || ''}</span>
              <span className={`status-badge status-${ac.status === 'verified' ? 'complete' : ac.status === 'partial' ? 'in-progress' : 'draft'}`}>{ac.status}</span>
              {ac.notes && <div style={{ width: '100%', marginTop: '2px' }}><em>{ac.notes}</em></div>}
              {ac.evidenceLocations?.length > 0 && <div style={{ width: '100%', marginTop: '2px' }}><strong>Evidence:</strong> {ac.evidenceLocations.map((loc: string, li: number) => <code key={li} style={{ marginRight: '4px' }}>{loc}</code>)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Test Coverage Analysis */}
      {(testCoverage.coveragePercentage != null || testCoverage.uncoveredAreas?.length || testCoverage.missingTestTypes?.length) && (
        <CollapsibleSection title="Test Coverage" sectionId="cr-testcov">
          <div className="detail-row">
            {testCoverage.coveragePercentage != null && <section className="detail-section inline"><h4>Coverage</h4><span className="tag">{testCoverage.coveragePercentage}%</span></section>}
          </div>
          {testCoverage.uncoveredAreas?.length > 0 && (
            <><h4>Uncovered Areas</h4><ul>{testCoverage.uncoveredAreas.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></>
          )}
          {testCoverage.missingTestTypes?.length > 0 && (
            <div><strong>Missing Test Types:</strong> {testCoverage.missingTestTypes.map((t: string, i: number) => <span key={i} className="tag" style={{ marginRight: '4px' }}>{t}</span>)}</div>
          )}
          {testCoverage.testQualityNotes && <p><em>{testCoverage.testQualityNotes}</em></p>}
        </CollapsibleSection>
      )}

      {/* Security Analysis */}
      {(securityAnalysis.vulnerabilitiesFound != null || securityAnalysis.securityChecksPerformed?.length) && (
        <CollapsibleSection title="Security Analysis" sectionId="cr-security">
          {securityAnalysis.vulnerabilitiesFound != null && (
            <div className="detail-row">
              <section className="detail-section inline"><h4>Vulnerabilities</h4><span className={`tag ${securityAnalysis.vulnerabilitiesFound > 0 ? 'tag-error' : 'tag-success'}`}>{securityAnalysis.vulnerabilitiesFound}</span></section>
            </div>
          )}
          {securityAnalysis.securityChecksPerformed?.length > 0 && (
            <><h4>Checks Performed</h4><ul>{securityAnalysis.securityChecksPerformed.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul></>
          )}
          {securityAnalysis.recommendations?.length > 0 && (
            <><h4>Recommendations</h4><ul>{securityAnalysis.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></>
          )}
        </CollapsibleSection>
      )}

      {/* Architecture Compliance */}
      {(archCompliance.compliant != null || archCompliance.violations?.length) && (
        <CollapsibleSection title="Architecture Compliance" sectionId="cr-arch">
          <div className="detail-row">
            <section className="detail-section inline">
              <h4>Compliant</h4>
              <span className={`tag ${archCompliance.compliant ? 'tag-success' : 'tag-error'}`}>{archCompliance.compliant ? 'Yes' : 'No'}</span>
            </section>
          </div>
          {archCompliance.violations?.length > 0 && (
            <>{archCompliance.violations.map((v: any, i: number) => (
              <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
                <strong>{v.rule}:</strong> {v.violation}
                {v.location && <div><code>{v.location}</code></div>}
              </div>
            ))}</>
          )}
          {archCompliance.notes && <p><em>{archCompliance.notes}</em></p>}
        </CollapsibleSection>
      )}

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <CollapsibleSection title="Next Steps" count={nextSteps.length} sectionId="cr-next">
          {nextSteps.map((step: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
              <span style={{ flex: 1 }}>{step.action}</span>
              {step.priority && <span className={`tag risk-${step.priority === 'required' ? 'high' : step.priority === 'recommended' ? 'medium' : 'low'}`}>{step.priority}</span>}
              {step.relatedFindingIds?.length > 0 && <div style={{ width: '100%', marginTop: '2px' }}>{step.relatedFindingIds.map((id: string, fi: number) => <span key={fi} className="tag" style={{ marginRight: '4px' }}>{id}</span>)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Reviewer Notes */}
      {d.reviewerNotes && (
        <CollapsibleSection title="Reviewer Notes" sectionId="cr-notes">
          {editMode ? (
            <textarea value={d.reviewerNotes} onChange={(e) => handleFieldChange('reviewerNotes', e.target.value)} rows={4} />
          ) : <Md text={d.reviewerNotes} />}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// CHANGE PROPOSAL DETAILS
// ==========================================================================

export function renderChangeProposalDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const changeRequest = d.changeRequest || {};
  const impactAnalysis = d.impactAnalysis || {};
  const proposal = d.proposal || {};
  const approval = d.approval || {};
  const implementation = d.implementation || {};
  const affectedEpics: any[] = impactAnalysis.affectedEpics || [];
  const affectedStories: any[] = impactAnalysis.affectedStories || [];
  const riskAssessment: any[] = impactAnalysis.riskAssessment || [];
  const options: any[] = proposal.options || [];
  const implPlan = proposal.implementationPlan || {};

  const changeTypes = ['new-requirement', 'requirement-change', 'scope-reduction', 'scope-expansion', 'technical-discovery', 'external-dependency', 'priority-shift', 'resource-change', 'timeline-change'];
  const urgencyOptions = ['critical', 'high', 'medium', 'low'];
  const recommendationOptions = ['approve', 'approve-with-modifications', 'defer', 'reject'];
  const approvalStatuses = ['pending', 'approved', 'rejected', 'deferred'];
  const implStatuses = ['not-started', 'in-progress', 'completed', 'cancelled'];

  return (
    <>
      {/* Change Request */}
      <CollapsibleSection title="Change Request" sectionId="cp-request">
        {editMode ? (
          <div className="arch-context-edit">
            <label><span className="field-label">Title</span>
              <input type="text" value={changeRequest.title || ''} onChange={(e) => handleFieldChange('changeRequest', { ...changeRequest, title: e.target.value })} placeholder="Change title" className="full-width-input" />
            </label>
            <label><span className="field-label">Description</span>
              <textarea value={changeRequest.description || ''} onChange={(e) => handleFieldChange('changeRequest', { ...changeRequest, description: e.target.value })} rows={3} placeholder="Describe the change..." />
            </label>
            <div className="detail-row">
              <label><span className="field-label">Requested By</span>
                <input type="text" value={changeRequest.requestedBy || ''} onChange={(e) => handleFieldChange('changeRequest', { ...changeRequest, requestedBy: e.target.value })} placeholder="Requester" />
              </label>
              <label><span className="field-label">Type</span>
                <select value={changeRequest.changeType || ''} onChange={(e) => handleFieldChange('changeRequest', { ...changeRequest, changeType: e.target.value })}>
                  <option value="">Select type...</option>
                  {changeTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label><span className="field-label">Urgency</span>
                <select value={changeRequest.urgency || ''} onChange={(e) => handleFieldChange('changeRequest', { ...changeRequest, urgency: e.target.value })}>
                  <option value="">Urgency...</option>
                  {urgencyOptions.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            </div>
          </div>
        ) : (
          <>
            {changeRequest.id && <div className="detail-row"><section className="detail-section inline"><h4>ID</h4><span className="tag">{changeRequest.id}</span></section></div>}
            {changeRequest.title && <h4>{changeRequest.title}</h4>}
            {changeRequest.description && <Md text={changeRequest.description} />}
            <div className="detail-row" style={{ marginTop: '8px' }}>
              {changeRequest.requestedBy && <section className="detail-section inline"><h4>Requested By</h4><span>{changeRequest.requestedBy}</span></section>}
              {changeRequest.changeType && <section className="detail-section inline"><h4>Type</h4><span className="tag">{changeRequest.changeType}</span></section>}
              {changeRequest.urgency && <section className="detail-section inline"><h4>Urgency</h4><span className={`tag risk-${changeRequest.urgency}`}>{changeRequest.urgency}</span></section>}
              {changeRequest.source && <section className="detail-section inline"><h4>Source</h4><span>{changeRequest.source}</span></section>}
              {changeRequest.requestDate && <section className="detail-section inline"><h4>Date</h4><span>{typeof changeRequest.requestDate === 'string' ? changeRequest.requestDate.split('T')[0] : changeRequest.requestDate}</span></section>}
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* Impact Analysis */}
      <CollapsibleSection title="Impact Analysis" sectionId="cp-impact">
        {impactAnalysis.overallImpact && (
          <div className="detail-row">
            <section className="detail-section inline"><h4>Overall Impact</h4>
              {editMode ? (
                <select value={impactAnalysis.overallImpact} onChange={(e) => handleFieldChange('impactAnalysis', { ...impactAnalysis, overallImpact: e.target.value })}>
                  {['minimal', 'moderate', 'significant', 'major'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : <span className={`tag risk-${impactAnalysis.overallImpact === 'major' ? 'high' : impactAnalysis.overallImpact === 'significant' ? 'medium' : 'low'}`}>{impactAnalysis.overallImpact}</span>}
            </section>
          </div>
        )}
        {affectedEpics.length > 0 && (
          <><h4>Affected Epics ({affectedEpics.length})</h4>
          {affectedEpics.map((e: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {e.epicId && <span className="tag">{e.epicId}</span>}
              <span style={{ flex: 1 }}>{e.epicTitle || ''}</span>
              {e.impactType && <span className="tag">{e.impactType}</span>}
              {e.impactDescription && <div style={{ width: '100%', marginTop: '2px' }}><em>{e.impactDescription}</em></div>}
            </div>
          ))}</>
        )}
        {affectedStories.length > 0 && (
          <><h4>Affected Stories ({affectedStories.length})</h4>
          {affectedStories.map((s: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {s.storyId && <span className="tag">{s.storyId}</span>}
              <span style={{ flex: 1 }}>{s.storyTitle || ''}</span>
              {s.currentStatus && <span className={`status-badge status-${s.currentStatus}`}>{s.currentStatus}</span>}
              {s.impactType && <span className="tag">{s.impactType}</span>}
              {s.impactDescription && <div style={{ width: '100%', marginTop: '2px' }}><em>{s.impactDescription}</em></div>}
            </div>
          ))}</>
        )}
        {impactAnalysis.timelineImpact?.estimatedDelay && (
          <p><strong>Estimated Delay:</strong> {impactAnalysis.timelineImpact.estimatedDelay}</p>
        )}
        {impactAnalysis.timelineImpact?.milestoneEffects?.length > 0 && (
          <><h4>Milestone Effects</h4>
          <table style={{ width: '100%', fontSize: '0.85em' }}>
            <thead><tr><th>Milestone</th><th>Original Date</th><th>New Date</th></tr></thead>
            <tbody>
              {impactAnalysis.timelineImpact.milestoneEffects.map((m: any, i: number) => (
                <tr key={i}><td>{m.milestone}</td><td>{m.originalDate}</td><td>{m.newDate}</td></tr>
              ))}
            </tbody>
          </table></>
        )}
        {impactAnalysis.architectureImpact?.hasImpact && (
          <>
            <h4>Architecture Impact</h4>
            {impactAnalysis.architectureImpact.description && <Md text={impactAnalysis.architectureImpact.description} />}
            {impactAnalysis.architectureImpact.affectedComponents?.length > 0 && (
              <div style={{ marginTop: '4px' }}><strong>Affected Components:</strong><ul>{impactAnalysis.architectureImpact.affectedComponents.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul></div>
            )}
            {impactAnalysis.architectureImpact.requiresArchitectureUpdate && <div><span className="tag risk-high">Requires Architecture Update</span></div>}
          </>
        )}
        {impactAnalysis.resourceImpact?.additionalEffort && (
          <p><strong>Additional Effort:</strong> {impactAnalysis.resourceImpact.additionalEffort}</p>
        )}
        {impactAnalysis.resourceImpact?.resourcesNeeded?.length > 0 && (
          <><strong>Resources Needed:</strong><ul>{impactAnalysis.resourceImpact.resourcesNeeded.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></>
        )}
        {riskAssessment.length > 0 && (
          <><h4>Risk Assessment</h4>
          {riskAssessment.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <strong>{r.risk}</strong>
              {r.likelihood && <span className="tag" style={{ marginLeft: '6px' }}>P: {r.likelihood}</span>}
              {r.impact && <span className="tag" style={{ marginLeft: '4px' }}>I: {r.impact}</span>}
              {r.mitigation && <div><em>Mitigation: {r.mitigation}</em></div>}
            </div>
          ))}</>
        )}
      </CollapsibleSection>

      {/* Proposal */}
      <CollapsibleSection title="Proposal" sectionId="cp-proposal">
        <div className="detail-row">
          <section className="detail-section inline"><h4>Recommendation</h4>
            {editMode ? (
              <select value={proposal.recommendation || ''} onChange={(e) => handleFieldChange('proposal', { ...proposal, recommendation: e.target.value })}>
                <option value="">Select...</option>
                {recommendationOptions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : proposal.recommendation ? (
              <span className={`status-badge status-${proposal.recommendation}`}>{proposal.recommendation}</span>
            ) : <span className="empty-message">Not set</span>}
          </section>
        </div>
        {proposal.rationale && (
          editMode ? (
            <label><span className="field-label">Rationale</span><textarea value={proposal.rationale} onChange={(e) => handleFieldChange('proposal', { ...proposal, rationale: e.target.value })} rows={3} /></label>
          ) : <><h4>Rationale</h4><Md text={proposal.rationale} /></>
        )}
        {options.length > 0 && (
          <><h4>Options Considered</h4>
          {options.map((opt: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{opt.optionId ? `${opt.optionId}: ` : ''}{opt.description || `Option ${i + 1}`}</strong>
                {opt.recommended && <span className="tag tag-success">Recommended</span>}
                {opt.effort && <span className="tag">{opt.effort}</span>}
              </div>
              {opt.pros?.length > 0 && <div><strong>Pros:</strong> {opt.pros.join(', ')}</div>}
              {opt.cons?.length > 0 && <div><strong>Cons:</strong> {opt.cons.join(', ')}</div>}
            </div>
          ))}</>
        )}
        {(implPlan.storiesToAdd?.length || implPlan.storiesToModify?.length || implPlan.storiesToRemove?.length || implPlan.documentsToUpdate?.length) && (
          <><h4>Implementation Plan</h4>
          {implPlan.storiesToAdd?.length > 0 && <><strong>Stories to Add:</strong><ul>{implPlan.storiesToAdd.map((s: any, i: number) => <li key={i}>{s.title}{s.epicId && ` (${s.epicId})`}{s.priority && ` [${s.priority}]`}</li>)}</ul></>}
          {implPlan.storiesToModify?.length > 0 && <><strong>Stories to Modify:</strong><ul>{implPlan.storiesToModify.map((s: any, i: number) => <li key={i}><span className="tag">{s.storyId}</span> {s.modifications}</li>)}</ul></>}
          {implPlan.storiesToRemove?.length > 0 && <><strong>Stories to Remove:</strong><ul>{implPlan.storiesToRemove.map((s: any, i: number) => <li key={i}><span className="tag">{s.storyId}</span> {s.reason}</li>)}</ul></>}
          {implPlan.documentsToUpdate?.length > 0 && <><strong>Documents to Update:</strong><ul>{implPlan.documentsToUpdate.map((doc: any, i: number) => <li key={i}><strong>{doc.document}</strong> — {doc.updates}</li>)}</ul></>}
          </>
        )}
        {proposal.rollbackPlan && <><h4>Rollback Plan</h4><Md text={proposal.rollbackPlan} /></>}
      </CollapsibleSection>

      {/* Approval & Implementation */}
      <CollapsibleSection title="Approval & Implementation" sectionId="cp-approval-impl">
        <div className="detail-row">
          {approval.status && (
            <section className="detail-section inline"><h4>Approval</h4>
              {editMode ? (
                <select value={approval.status} onChange={(e) => handleFieldChange('approval', { ...approval, status: e.target.value })}>
                  {approvalStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : <span className={`status-badge status-${approval.status}`}>{approval.status}</span>}
            </section>
          )}
          {approval.approvedBy && <section className="detail-section inline"><h4>By</h4><span>{approval.approvedBy}</span></section>}
          {approval.approvalDate && <section className="detail-section inline"><h4>Date</h4><span>{typeof approval.approvalDate === 'string' ? approval.approvalDate.split('T')[0] : approval.approvalDate}</span></section>}
        </div>
        {approval.approvalNotes && <div style={{ marginTop: '4px' }}><strong>Notes:</strong> <Md text={approval.approvalNotes} /></div>}
        {approval.conditions?.length > 0 && (
          <div style={{ marginTop: '4px' }}><strong>Conditions:</strong><ul>{approval.conditions.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul></div>
        )}
        {(implementation.status || implementation.implementedBy) && (
          <div style={{ marginTop: '8px' }}>
            <h4>Implementation</h4>
            <div className="detail-row">
              {implementation.status && (
                <section className="detail-section inline"><h4>Status</h4>
                  {editMode ? (
                    <select value={implementation.status} onChange={(e) => handleFieldChange('implementation', { ...implementation, status: e.target.value })}>
                      {implStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span className={`status-badge status-${implementation.status}`}>{implementation.status}</span>}
                </section>
              )}
              {implementation.implementedBy && <section className="detail-section inline"><h4>By</h4><span>{implementation.implementedBy}</span></section>}
              {implementation.startedAt && <section className="detail-section inline"><h4>Started</h4><span>{typeof implementation.startedAt === 'string' ? implementation.startedAt.split('T')[0] : implementation.startedAt}</span></section>}
              {implementation.completedAt && <section className="detail-section inline"><h4>Completed</h4><span>{typeof implementation.completedAt === 'string' ? implementation.completedAt.split('T')[0] : implementation.completedAt}</span></section>}
            </div>
            {implementation.notes && <div style={{ marginTop: '4px' }}><Md text={implementation.notes} /></div>}
          </div>
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// RISKS (FLAT SCHEMA) DETAILS
// ==========================================================================

export function renderRisksDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;

  // --- Normalization: sample data is a root-level array of risk objects ---
  // If editedData is an array (or has numeric keys from array-to-object conversion), wrap it
  let normalizedRisks: any[] = [];
  if (Array.isArray(d)) {
    normalizedRisks = d;
  } else if (d.risks) {
    normalizedRisks = Array.isArray(d.risks) ? d.risks : [];
  } else {
    // Check for numeric keys (array stored as object)
    const numKeys = Object.keys(d).filter(k => /^\d+$/.test(k));
    if (numKeys.length > 0) {
      normalizedRisks = numKeys.sort((a, b) => Number(a) - Number(b)).map(k => d[k]);
    }
  }

  // Normalize each risk item: map sample field names to renderer field names
  const risksList: any[] = normalizedRisks.map((r: any) => ({
    ...r,
    // sample uses 'title', renderer expects 'risk' for display name
    risk: r.risk || r.title || '',
    // sample uses 'likelihood', renderer expects 'probability'
    probability: r.probability || r.likelihood || '',
    // sample uses 'contingency', renderer expects 'contingencyPlan'
    contingencyPlan: r.contingencyPlan || r.contingency || '',
    // sample uses 'description' — preserve for display
    description: r.description || '',
    // preserve identifiedDate and lastReviewDate for display
    identifiedDate: r.identifiedDate || '',
    lastReviewDate: r.lastReviewDate || '',
  }));

  const assumptions: any[] = d.assumptions || (Array.isArray(d) ? [] : []);
  const dependencies: any[] = d.dependencies || (Array.isArray(d) ? [] : []);
  const riskMatrix = (Array.isArray(d) ? {} : d.riskMatrix) || {};
  const summary = (Array.isArray(d) ? {} : d.summary) || {};

  const categories = ['technical', 'operational', 'security', 'compliance', 'resource', 'schedule', 'integration', 'performance', 'data'];
  const probabilities = ['low', 'medium', 'high', 'very-high'];
  const impacts = ['low', 'medium', 'high', 'critical'];
  const statuses = ['identified', 'analyzing', 'mitigating', 'monitoring', 'closed', 'occurred'];

  return (
    <>
      {/* Summary */}
      {(summary.totalRisks != null || summary.overallRiskLevel) && (
        <div className="detail-row">
          {summary.totalRisks != null && <section className="detail-section inline"><h4>Total</h4><span className="tag">{summary.totalRisks}</span></section>}
          {summary.criticalCount != null && summary.criticalCount > 0 && <section className="detail-section inline"><h4>Critical</h4><span className="tag tag-error">{summary.criticalCount}</span></section>}
          {summary.highCount != null && summary.highCount > 0 && <section className="detail-section inline"><h4>High</h4><span className="tag tag-warning">{summary.highCount}</span></section>}
          {summary.mediumCount != null && summary.mediumCount > 0 && <section className="detail-section inline"><h4>Medium</h4><span className="tag">{summary.mediumCount}</span></section>}
          {summary.lowCount != null && summary.lowCount > 0 && <section className="detail-section inline"><h4>Low</h4><span className="tag">{summary.lowCount}</span></section>}
          {summary.openCount != null && <section className="detail-section inline"><h4>Open</h4><span className="tag">{summary.openCount}</span></section>}
          {summary.mitigatedCount != null && <section className="detail-section inline"><h4>Mitigated</h4><span className="tag tag-success">{summary.mitigatedCount}</span></section>}
          {summary.overallRiskLevel && <section className="detail-section inline"><h4>Overall</h4><span className={`tag risk-${summary.overallRiskLevel}`}>{summary.overallRiskLevel}</span></section>}
        </div>
      )}

      {/* Risk Matrix */}
      {(riskMatrix.critical?.length || riskMatrix.high?.length || riskMatrix.medium?.length) && (
        <CollapsibleSection title="Risk Matrix" sectionId="risks-matrix">
          {riskMatrix.critical?.length > 0 && <div><span className="tag tag-error">Critical:</span> {riskMatrix.critical.join(', ')}</div>}
          {riskMatrix.high?.length > 0 && <div><span className="tag tag-warning">High:</span> {riskMatrix.high.join(', ')}</div>}
          {riskMatrix.medium?.length > 0 && <div><span className="tag">Medium:</span> {riskMatrix.medium.join(', ')}</div>}
          {riskMatrix.low?.length > 0 && <div><span className="tag">Low:</span> {riskMatrix.low.join(', ')}</div>}
        </CollapsibleSection>
      )}

      {/* Risks List */}
      <CollapsibleSection title="Risks" count={risksList.length} sectionId="risks-list">
        {risksList.length > 0 ? risksList.map((risk: any, i: number) => (
          <div key={i} style={{ padding: '8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {risk.id && <span className="tag">{risk.id}</span>}
              <strong style={{ flex: 1 }}>{risk.risk || `Risk ${i + 1}`}</strong>
              {risk.riskScore && <span className={`tag risk-${risk.riskScore}`}>{risk.riskScore}</span>}
              {risk.status && <span className={`status-badge status-${risk.status}`}>{risk.status}</span>}
            </div>
            {editMode && (
              <div style={{ marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input type="text" value={risk.risk || ''} onChange={(e) => { const u = [...risksList]; u[i] = { ...risk, risk: e.target.value }; handleFieldChange('risks', u); }} placeholder="Risk..." style={{ flex: 1, minWidth: '200px' }} />
                <select value={risk.category || ''} onChange={(e) => { const u = [...risksList]; u[i] = { ...risk, category: e.target.value }; handleFieldChange('risks', u); }}>
                  <option value="">Category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={risk.probability || ''} onChange={(e) => { const u = [...risksList]; u[i] = { ...risk, probability: e.target.value }; handleFieldChange('risks', u); }}>
                  <option value="">Probability</option>
                  {probabilities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={risk.impact || ''} onChange={(e) => { const u = [...risksList]; u[i] = { ...risk, impact: e.target.value }; handleFieldChange('risks', u); }}>
                  <option value="">Impact</option>
                  {impacts.map(im => <option key={im} value={im}>{im}</option>)}
                </select>
                <select value={risk.status || ''} onChange={(e) => { const u = [...risksList]; u[i] = { ...risk, status: e.target.value }; handleFieldChange('risks', u); }}>
                  <option value="">Status</option>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="icon-button" onClick={() => handleFieldChange('risks', risksList.filter((_: any, idx: number) => idx !== i))} title="Remove">{'\u2715'}</button>
              </div>
            )}
            <div style={{ marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {risk.category && <span><strong>Category:</strong> {risk.category}</span>}
              {risk.probability && <span><strong>P:</strong> {risk.probability}</span>}
              {risk.impact && <span><strong>I:</strong> {risk.impact}</span>}
              {risk.owner && <span><strong>Owner:</strong> {risk.owner}</span>}
              {risk.residualRisk && <span><strong>Residual:</strong> {risk.residualRisk}</span>}
            </div>
            {risk.description && <div style={{ marginTop: '2px', opacity: 0.9 }}>{risk.description}</div>}
            {risk.impactDescription && <div style={{ marginTop: '2px' }}>{risk.impactDescription}</div>}
            {risk.mitigation && <div style={{ marginTop: '2px' }}><strong>Mitigation:</strong> {risk.mitigation}</div>}
            {risk.contingencyPlan && <div><strong>Contingency:</strong> {risk.contingencyPlan}</div>}
            {risk.triggers?.length > 0 && <div><strong>Triggers:</strong> {risk.triggers.join(', ')}</div>}
            {risk.relatedRequirements?.length > 0 && <div><strong>Related Requirements:</strong> {risk.relatedRequirements.join(', ')}</div>}
            {risk.notes && <div style={{ marginTop: '2px' }}><Md text={risk.notes} /></div>}
            {(risk.identifiedDate || risk.lastReviewDate) && (
              <div style={{ marginTop: '2px', display: 'flex', gap: '12px', flexWrap: 'wrap', opacity: 0.8, fontSize: '0.9em' }}>
                {risk.identifiedDate && <span><strong>Identified:</strong> {risk.identifiedDate}</span>}
                {risk.lastReviewDate && <span><strong>Last Review:</strong> {risk.lastReviewDate}</span>}
              </div>
            )}
            {risk.mitigationStrategies?.length > 0 && (
              <div style={{ marginTop: '4px' }}><strong>Strategies:</strong>
                <ul>{risk.mitigationStrategies.map((s: any, si: number) => (
                  <li key={si}>{s.strategy}{s.owner && ` (${s.owner})`}{s.status && <span className="tag" style={{ marginLeft: '4px' }}>{s.status}</span>}</li>
                ))}</ul>
              </div>
            )}
          </div>
        )) : <p className="empty-message">No risks defined</p>}
        {editMode && (
          <button className="add-button" onClick={() => handleFieldChange('risks', [...risksList, { risk: '', category: '', probability: '', impact: '', mitigation: '' }])}>+ Add Risk</button>
        )}
      </CollapsibleSection>

      {/* Assumptions */}
      {(editMode || assumptions.length > 0) && (
        <CollapsibleSection title="Assumptions" count={assumptions.length} sectionId="risks-assumptions">
          {assumptions.length > 0 ? assumptions.map((a: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {a.id && <span className="tag">{a.id}</span>}
                <span style={{ fontSize: '1.1em' }}>{a.validated ? '\u2611' : '\u2610'}</span>
                <strong style={{ flex: 1 }}>{a.assumption}</strong>
              </div>
              {a.ifFalse && <div><strong>If false:</strong> {a.ifFalse}</div>}
              {a.validationMethod && <div><em>Validation: {a.validationMethod}</em></div>}
            </div>
          )) : <p className="empty-message">No assumptions</p>}
        </CollapsibleSection>
      )}

      {/* Dependencies */}
      {(editMode || dependencies.length > 0) && (
        <CollapsibleSection title="Dependencies" count={dependencies.length} sectionId="risks-deps">
          {dependencies.length > 0 ? dependencies.map((dep: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {dep.id && <span className="tag">{dep.id}</span>}
              <strong style={{ flex: 1 }}>{dep.dependency}</strong>
              {dep.type && <span className="tag">{dep.type}</span>}
              {dep.risk && <div style={{ width: '100%' }}><strong>Risk:</strong> {dep.risk}</div>}
              {dep.mitigation && <div style={{ width: '100%' }}><em>Mitigation: {dep.mitigation}</em></div>}
            </div>
          )) : <p className="empty-message">No dependencies</p>}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// READINESS REPORT DETAILS
// ==========================================================================

export function renderReadinessReportDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const summary = d.summary || {};
  const assessment = d.assessment || {};
  const blockers: any[] = d.blockers || [];
  const risks: any[] = d.risks || [];
  const recommendations: any[] = d.recommendations || [];
  const nextSteps: any[] = d.nextSteps || [];
  const dependencyAnalysis = d.dependencyAnalysis || {};
  const resourceAssessment = d.resourceAssessment || {};
  const appendices: any[] = d.appendices || [];

  const overallStatuses = ['ready', 'ready-with-concerns', 'not-ready', 'blocked'];

  return (
    <>
      {/* Summary */}
      <CollapsibleSection title="Summary" sectionId="rr-summary">
        <div className="detail-row">
          {summary.overallStatus && (
            <section className="detail-section inline"><h4>Status</h4>
              {editMode ? (
                <select value={summary.overallStatus} onChange={(e) => handleFieldChange('summary', { ...summary, overallStatus: e.target.value })}>
                  {overallStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : <span className={`status-badge status-${summary.overallStatus}`}>{summary.overallStatus}</span>}
            </section>
          )}
          {summary.overallScore != null && <section className="detail-section inline"><h4>Score</h4><span className="tag">{summary.overallScore}/100</span></section>}
          {summary.projectName && <section className="detail-section inline"><h4>Project</h4><span>{summary.projectName}</span></section>}
          {summary.assessedBy && <section className="detail-section inline"><h4>Assessed By</h4><span>{summary.assessedBy}</span></section>}
          {summary.assessmentDate && <section className="detail-section inline"><h4>Date</h4><span>{summary.assessmentDate}</span></section>}
        </div>
        {summary.recommendation && (
          editMode ? (
            <label><span className="field-label">Recommendation</span><textarea value={summary.recommendation} onChange={(e) => handleFieldChange('summary', { ...summary, recommendation: e.target.value })} rows={3} /></label>
          ) : <><h4>Recommendation</h4><Md text={summary.recommendation} /></>
        )}
        {summary.keyFindings?.length > 0 && <><h4>Key Findings</h4><ul>{summary.keyFindings.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></>}
        {summary.criticalActions?.length > 0 && <><h4>Critical Actions</h4><ul>{summary.criticalActions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></>}
      </CollapsibleSection>

      {/* Assessment Areas */}
      {(() => {
        const areas = [
          { key: 'prdAnalysis', title: 'PRD Analysis' },
          { key: 'epicCoverage', title: 'Epic Coverage' },
          { key: 'uxAlignment', title: 'UX Alignment' },
          { key: 'architectureReadiness', title: 'Architecture Readiness' },
          { key: 'epicQuality', title: 'Epic Quality' },
          { key: 'testReadiness', title: 'Test Readiness' },
        ];
        return areas.map(({ key, title }) => {
          const area = assessment[key];
          if (!area) return null;
          return (
            <CollapsibleSection key={key} title={title} sectionId={`rr-${key}`}>
              <div className="detail-row">
                {(area.status || area.overallQuality) && (
                  <section className="detail-section inline"><h4>Status</h4><span className={`status-badge status-${area.status || area.overallQuality}`}>{area.status || area.overallQuality}</span></section>
                )}
                {area.completeness != null && <section className="detail-section inline"><h4>Completeness</h4><span className="tag">{area.completeness}%</span></section>}
                {area.coveragePercent != null && <section className="detail-section inline"><h4>Coverage</h4><span className="tag">{area.coveragePercent}%</span></section>}
              </div>
              {area.summary && <Md text={area.summary} />}
              {area.findings?.length > 0 && (
                <>{area.findings.map((f: any, i: number) => (
                  <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <strong style={{ flex: 1 }}>{f.finding || f.gap || ''}</strong>
                      {(f.type || f.category) && <span className="tag">{f.type || f.category}</span>}
                      {f.severity && <span className={`tag risk-${f.severity}`}>{f.severity}</span>}
                    </div>
                    {f.recommendation && <div><em>Rec: {f.recommendation}</em></div>}
                    {f.impact && <div><strong>Impact:</strong> {f.impact}</div>}
                  </div>
                ))}</>
              )}
              {area.gaps?.length > 0 && (
                <><h4>Gaps</h4>{area.gaps.map((g: any, i: number) => (
                  <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
                    <strong>{g.gap || g.requirementTitle || ''}</strong>
                    {g.severity && <span className={`tag risk-${g.severity}`} style={{ marginLeft: '6px' }}>{g.severity}</span>}
                    {g.impact && <div><strong>Impact:</strong> {g.impact}</div>}
                    {g.remediation && <div><em>Remediation: {g.remediation}</em></div>}
                  </div>
                ))}</>
              )}
              {area.strengths?.length > 0 && <><h4>Strengths</h4><ul>{area.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>}
            </CollapsibleSection>
          );
        });
      })()}

      {/* Epic Coverage — area-specific fields */}
      {assessment.epicCoverage?.totalRequirements != null && (
        <CollapsibleSection title="Epic Coverage Details" sectionId="rr-epicCoverage-details">
          <div className="detail-row">
            <section className="detail-section inline"><h4>Total Requirements</h4><span className="tag">{assessment.epicCoverage.totalRequirements}</span></section>
            {assessment.epicCoverage.coveredRequirements != null && <section className="detail-section inline"><h4>Covered</h4><span className="tag">{assessment.epicCoverage.coveredRequirements}</span></section>}
          </div>
          {assessment.epicCoverage.byType && (
            <><h4>By Type</h4>
              <div className="detail-row">
                {assessment.epicCoverage.byType.functional != null && <section className="detail-section inline"><h4>Functional</h4><span className="tag">{assessment.epicCoverage.byType.functional}</span></section>}
                {assessment.epicCoverage.byType.nonFunctional != null && <section className="detail-section inline"><h4>Non-Functional</h4><span className="tag">{assessment.epicCoverage.byType.nonFunctional}</span></section>}
                {assessment.epicCoverage.byType.additional != null && <section className="detail-section inline"><h4>Additional</h4><span className="tag">{assessment.epicCoverage.byType.additional}</span></section>}
              </div>
            </>
          )}
          {assessment.epicCoverage.overCoverage?.length > 0 && (
            <><h4>Over Coverage</h4><ul>{assessment.epicCoverage.overCoverage.map((oc: any, i: number) => (
              <li key={i}>{typeof oc === 'string' ? oc : oc.requirement || oc.description || JSON.stringify(oc)}</li>
            ))}</ul></>
          )}
        </CollapsibleSection>
      )}

      {/* UX Alignment — area-specific fields */}
      {(assessment.uxAlignment?.designSystemCoverage || assessment.uxAlignment?.accessibilityReadiness) && (
        <CollapsibleSection title="UX Alignment Details" sectionId="rr-uxAlignment-details">
          {assessment.uxAlignment.designSystemCoverage && <p><strong>Design System Coverage:</strong> {assessment.uxAlignment.designSystemCoverage}</p>}
          {assessment.uxAlignment.accessibilityReadiness && <p><strong>Accessibility Readiness:</strong> {assessment.uxAlignment.accessibilityReadiness}</p>}
        </CollapsibleSection>
      )}

      {/* Architecture Readiness — area-specific fields */}
      {(assessment.architectureReadiness?.techStackValidation || assessment.architectureReadiness?.scalabilityAssessment || assessment.architectureReadiness?.securityAssessment) && (
        <CollapsibleSection title="Architecture Readiness Details" sectionId="rr-archReadiness-details">
          {assessment.architectureReadiness.techStackValidation && <p><strong>Tech Stack Validation:</strong> {assessment.architectureReadiness.techStackValidation}</p>}
          {assessment.architectureReadiness.scalabilityAssessment && <p><strong>Scalability Assessment:</strong> {assessment.architectureReadiness.scalabilityAssessment}</p>}
          {assessment.architectureReadiness.securityAssessment && <p><strong>Security Assessment:</strong> {assessment.architectureReadiness.securityAssessment}</p>}
        </CollapsibleSection>
      )}

      {/* Epic Quality — area-specific fields */}
      {assessment.epicQuality && (() => {
        const eq = assessment.epicQuality;
        const qualityFields = [
          { key: 'acceptanceCriteriaQuality', title: 'Acceptance Criteria Quality' },
          { key: 'storyClarity', title: 'Story Clarity' },
          { key: 'technicalFeasibility', title: 'Technical Feasibility' },
          { key: 'estimationQuality', title: 'Estimation Quality' },
          { key: 'dependencyMapping', title: 'Dependency Mapping' },
        ];
        const hasAny = qualityFields.some(qf => eq[qf.key]);
        if (!hasAny) return null;
        return (
          <CollapsibleSection title="Epic Quality Details" sectionId="rr-epicQuality-details">
            {qualityFields.map(({ key, title }) => {
              const field = eq[key];
              if (!field) return null;
              return (
                <div key={key} style={{ padding: '4px 8px', marginBottom: '6px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                  <strong>{title}</strong>
                  {field.rating && <span className="tag" style={{ marginLeft: '6px' }}>{field.rating}</span>}
                  {field.details && <div><Md text={field.details} /></div>}
                  {field.issues?.length > 0 && <div><strong>Issues:</strong><ul>{field.issues.map((issue: string, ii: number) => <li key={ii}>{issue}</li>)}</ul></div>}
                  {field.concerns?.length > 0 && <div><strong>Concerns:</strong><ul>{field.concerns.map((c: string, ci: number) => <li key={ci}>{c}</li>)}</ul></div>}
                </div>
              );
            })}
          </CollapsibleSection>
        );
      })()}

      {/* Test Readiness — area-specific fields */}
      {(assessment.testReadiness?.testPlanStatus || assessment.testReadiness?.testCaseCoverage || assessment.testReadiness?.automationReadiness) && (
        <CollapsibleSection title="Test Readiness Details" sectionId="rr-testReadiness-details">
          {assessment.testReadiness.testPlanStatus && <p><strong>Test Plan Status:</strong> {assessment.testReadiness.testPlanStatus}</p>}
          {assessment.testReadiness.testCaseCoverage && <p><strong>Test Case Coverage:</strong> {assessment.testReadiness.testCaseCoverage}</p>}
          {assessment.testReadiness.automationReadiness && <p><strong>Automation Readiness:</strong> {assessment.testReadiness.automationReadiness}</p>}
        </CollapsibleSection>
      )}

      {/* Risks */}
      {(editMode || risks.length > 0) && (
        <CollapsibleSection title="Risks" count={risks.length} sectionId="rr-risks">
          {risks.length > 0 ? risks.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {r.id && <span className="tag">{r.id}</span>}
                <strong style={{ flex: 1 }}>{r.risk}</strong>
                {r.probability && <span className="tag">P: {r.probability}</span>}
                {r.impact && <span className={`tag risk-${r.impact}`}>I: {r.impact}</span>}
                {r.riskScore != null && <span className="tag">Score: {r.riskScore}</span>}
              </div>
              {r.category && <div style={{ fontSize: '0.85em' }}><span className="tag">{r.category}</span></div>}
              {r.mitigation && <div><em>Mitigation: {r.mitigation}</em></div>}
              {r.contingency && <div style={{ fontSize: '0.85em', opacity: 0.8 }}><strong>Contingency:</strong> {r.contingency}</div>}
              {r.owner && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><strong>Owner:</strong> {r.owner}</div>}
              {r.triggers?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><strong>Triggers:</strong> {r.triggers.join('; ')}</div>}
            </div>
          )) : <p className="empty-message">No risks identified</p>}
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {(editMode || recommendations.length > 0) && (
        <CollapsibleSection title="Recommendations" count={recommendations.length} sectionId="rr-recs">
          {recommendations.length > 0 ? recommendations.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {r.id && <span className="tag">{r.id}</span>}
                <strong style={{ flex: 1 }}>{r.recommendation}</strong>
                {r.priority && <span className={`tag risk-${r.priority === 'must-do' ? 'high' : r.priority === 'should-do' ? 'medium' : 'low'}`}>{r.priority}</span>}
                {r.effort && <span className="tag">Effort: {r.effort}</span>}
              </div>
              {r.category && <div style={{ fontSize: '0.85em' }}><span className="tag">{r.category}</span></div>}
              {r.impact && <div><strong>Impact:</strong> {r.impact}</div>}
              {r.owner && <span><strong>Owner:</strong> {r.owner}</span>}
              {r.deadline && <span style={{ marginLeft: '8px' }}><strong>Deadline:</strong> {r.deadline}</span>}
            </div>
          )) : <p className="empty-message">No recommendations</p>}
        </CollapsibleSection>
      )}

      {/* Blockers - enhanced with estimatedEffort */}
      {(editMode || blockers.length > 0) && (
        <CollapsibleSection title="Blockers" count={blockers.length} sectionId="rr-blockers">
          {blockers.length > 0 ? blockers.map((b: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {b.id && <span className="tag">{b.id}</span>}
                <strong style={{ flex: 1 }}>{b.blocker}</strong>
                {b.severity && <span className={`tag risk-${b.severity}`}>{b.severity}</span>}
                {b.status && <span className={`status-badge status-${b.status}`}>{b.status}</span>}
              </div>
              {b.category && <span className="tag">{b.category}</span>}
              {b.impact && <div><strong>Impact:</strong> {b.impact}</div>}
              {b.resolution && <div><strong>Resolution:</strong> {b.resolution}</div>}
              {b.owner && <div><strong>Owner:</strong> {b.owner}</div>}
              {b.estimatedEffort && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><strong>Estimated Effort:</strong> {b.estimatedEffort}</div>}
            </div>
          )) : <p className="empty-message">No blockers</p>}
        </CollapsibleSection>
      )}

      {/* Dependency Analysis */}
      {(dependencyAnalysis.summary || dependencyAnalysis.externalDependencies?.length > 0 || dependencyAnalysis.internalDependencies?.length > 0) && (
        <CollapsibleSection title="Dependency Analysis" sectionId="rr-deps">
          {dependencyAnalysis.summary && <Md text={dependencyAnalysis.summary} />}
          {dependencyAnalysis.externalDependencies?.length > 0 && (
            <>
              <h4>External Dependencies</h4>
              {dependencyAnalysis.externalDependencies.map((dep: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                  <strong>{dep.dependency}</strong>
                  {dep.status && <div style={{ fontSize: '0.85em', opacity: 0.85 }}>Status: {dep.status}</div>}
                  {dep.risk && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Risk: {dep.risk}</div>}
                </div>
              ))}
            </>
          )}
          {dependencyAnalysis.internalDependencies?.length > 0 && (
            <>
              <h4>Internal Dependencies</h4>
              {dependencyAnalysis.internalDependencies.map((dep: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                  <strong>{dep.dependency}</strong>
                  {dep.status && <div style={{ fontSize: '0.85em', opacity: 0.85 }}>Status: {dep.status}</div>}
                </div>
              ))}
            </>
          )}
          {dependencyAnalysis.criticalPath?.length > 0 && (
            <>
              <h4>Critical Path</h4>
              <ol>{dependencyAnalysis.criticalPath.map((step: string, i: number) => <li key={i}>{step}</li>)}</ol>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Resource Assessment */}
      {(resourceAssessment.summary || resourceAssessment.teamReadiness || resourceAssessment.skillGaps?.length > 0) && (
        <CollapsibleSection title="Resource Assessment" sectionId="rr-resources">
          {resourceAssessment.summary && <Md text={resourceAssessment.summary} />}
          {resourceAssessment.teamReadiness && <div style={{ marginTop: '4px' }}><strong>Team Readiness:</strong> {resourceAssessment.teamReadiness}</div>}
          {resourceAssessment.skillGaps?.length > 0 && (
            <>
              <h4>Skill Gaps</h4>
              {resourceAssessment.skillGaps.map((sg: any, i: number) => (
                <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-editorWarning-foreground)' }}>
                  <strong>{sg.skill}</strong>
                  {sg.gap && <div style={{ opacity: 0.85 }}>{sg.gap}</div>}
                  {sg.mitigation && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Mitigation: {sg.mitigation}</div>}
                </div>
              ))}
            </>
          )}
          {resourceAssessment.toolsReadiness && <div style={{ marginTop: '4px' }}><strong>Tools Readiness:</strong> {resourceAssessment.toolsReadiness}</div>}
          {resourceAssessment.environmentReadiness && <div style={{ marginTop: '4px' }}><strong>Environment Readiness:</strong> {resourceAssessment.environmentReadiness}</div>}
        </CollapsibleSection>
      )}

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <CollapsibleSection title="Next Steps" count={nextSteps.length} sectionId="rr-next">
          {nextSteps.map((s: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '2px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {s.step != null && <span className="tag">#{s.step}</span>}
                <span style={{ flex: 1 }}>{s.action}</span>
                {s.owner && <span className="tag">{s.owner}</span>}
                {s.deadline && <span className="tag">{s.deadline}</span>}
              </div>
              {s.dependencies?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7, marginLeft: '8px' }}>Depends on: {s.dependencies.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Appendices */}
      {appendices.length > 0 && (
        <CollapsibleSection title="Appendices" count={appendices.length} sectionId="rr-appendices">
          {appendices.map((a: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
              <strong>{a.title || `Appendix ${i + 1}`}</strong>
              {a.type && <span className="tag" style={{ marginLeft: '6px' }}>{a.type}</span>}
              {a.content && <div style={{ marginTop: '2px' }}><Md text={a.content} /></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// RESEARCH DETAILS
// ==========================================================================

export function renderResearchDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;

  // --- Normalization: map sample data field names to renderer field names ---
  // sample uses 'researchTitle', renderer displays 'topic'
  if (!d.topic && d.researchTitle) d.topic = d.researchTitle;

  // sample uses 'objectives' (string[]), renderer expects 'goals' [{goal, rationale, successCriteria}]
  if (!d.goals && d.objectives) {
    d.goals = (Array.isArray(d.objectives) ? d.objectives : []).map((o: any) =>
      typeof o === 'string' ? { goal: o } : o
    );
  }

  // sample uses 'analysis', renderer expects 'synthesis'
  if (!d.synthesis && d.analysis) {
    const a = d.analysis;
    d.synthesis = {
      summary: a.summary || '',
      // map themes[].theme → keyInsights
      keyInsights: a.themes?.map((t: any) =>
        typeof t === 'string' ? t : `${t.theme}: ${t.description || ''}`
      ) || [],
      // map gaps → openQuestions
      openQuestions: a.gaps?.map((g: any) =>
        typeof g === 'string' ? g : `${g.gap}${g.recommendation ? ` — ${g.recommendation}` : ''}`
      ) || [],
    };
  }

  // Normalize findings: sample has significance(string), evidence(string), implications(string)
  // renderer expects confidence, evidence[{description,type,source}], implications[{implication,area,severity}]
  const rawFindings: any[] = d.findings || [];
  const normalizedFindings = rawFindings.map((f: any) => ({
    ...f,
    // map significance → confidence (renderer shows f.confidence)
    confidence: f.confidence || f.significance || '',
    // evidence: sample has string, renderer expects array of {description, type, source}
    evidence: Array.isArray(f.evidence)
      ? f.evidence
      : f.evidence
        ? [{ description: f.evidence }]
        : [],
    // implications: sample has string, renderer expects array of {implication, area, severity}
    implications: Array.isArray(f.implications)
      ? f.implications
      : f.implications
        ? [{ implication: f.implications }]
        : [],
  }));

  const scope = d.scope || {};
  const goals: any[] = d.goals || [];
  const questions: any[] = d.questions || [];
  const methodology = d.methodology || {};
  const findings: any[] = normalizedFindings;
  const competitiveAnalysis: any[] = d.competitiveAnalysis || [];
  const trends: any[] = d.trends || [];
  const technicalFindings: any[] = d.technicalFindings || [];
  const recommendations: any[] = d.recommendations || [];
  const synthesis = d.synthesis || {};
  const references: any[] = d.references || [];
  const appendices: any[] = d.appendices || [];

  const researchTypes = ['domain', 'market', 'technical', 'user', 'competitive', 'feasibility'];

  return (
    <>
      {/* Header */}
      <div className="detail-row">
        {d.researchType && (
          <section className="detail-section inline"><h4>Type</h4>
            {editMode ? (
              <select value={d.researchType} onChange={(e) => handleFieldChange('researchType', e.target.value)}>
                {researchTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : <span className="tag">{d.researchType}</span>}
          </section>
        )}
        {d.topic && <section className="detail-section inline"><h4>Topic</h4><span>{d.topic}</span></section>}
      </div>

      {/* Market Analysis */}
      {d.marketAnalysis && (
        <CollapsibleSection title="Market Analysis" sectionId="research-market">
          {d.marketAnalysis.overview && <Md text={d.marketAnalysis.overview} />}
          {d.marketAnalysis.size && (
            <><h4>Market Size</h4>
              <div className="detail-row">
                {d.marketAnalysis.size.TAM && <section className="detail-section inline"><h4>TAM</h4><span className="tag">{d.marketAnalysis.size.TAM}</span></section>}
                {d.marketAnalysis.size.SAM && <section className="detail-section inline"><h4>SAM</h4><span className="tag">{d.marketAnalysis.size.SAM}</span></section>}
                {d.marketAnalysis.size.SOM && <section className="detail-section inline"><h4>SOM</h4><span className="tag">{d.marketAnalysis.size.SOM}</span></section>}
                {d.marketAnalysis.size.growth && <section className="detail-section inline"><h4>Growth</h4><span className="tag">{d.marketAnalysis.size.growth}</span></section>}
              </div>
            </>
          )}
          {d.marketAnalysis.segments?.length > 0 && <><h4>Segments</h4><ul>{d.marketAnalysis.segments.map((seg: any, i: number) => <li key={i}>{typeof seg === 'string' ? seg : seg.name || seg.segment || JSON.stringify(seg)}</li>)}</ul></>}
          {d.marketAnalysis.drivers?.length > 0 && <><h4>Drivers</h4><ul>{d.marketAnalysis.drivers.map((dr: any, i: number) => <li key={i}>{typeof dr === 'string' ? dr : dr.driver || dr.name || JSON.stringify(dr)}</li>)}</ul></>}
          {d.marketAnalysis.barriers?.length > 0 && <><h4>Barriers</h4><ul>{d.marketAnalysis.barriers.map((b: any, i: number) => <li key={i}>{typeof b === 'string' ? b : b.barrier || b.name || JSON.stringify(b)}</li>)}</ul></>}
        </CollapsibleSection>
      )}

      {/* User Research */}
      {d.userResearch && (
        <CollapsibleSection title="User Research" sectionId="research-user">
          {d.userResearch.overview && <Md text={d.userResearch.overview} />}
          {d.userResearch.personas?.length > 0 && (
            <><h4>Personas</h4>{d.userResearch.personas.map((p: any, i: number) => (
              <div key={i} style={{ padding: '4px 8px', marginBottom: '6px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                <strong>{p.name}</strong>
                {p.description && <div><Md text={p.description} /></div>}
                {p.goals?.length > 0 && <div><strong>Goals:</strong> {p.goals.join(', ')}</div>}
                {p.painPoints?.length > 0 && <div><strong>Pain Points:</strong> {p.painPoints.join(', ')}</div>}
                {p.behaviors?.length > 0 && <div><strong>Behaviors:</strong> {p.behaviors.join(', ')}</div>}
              </div>
            ))}</>
          )}
          {d.userResearch.needs?.length > 0 && <><h4>Needs</h4><ul>{d.userResearch.needs.map((n: any, i: number) => <li key={i}>{typeof n === 'string' ? n : n.need || JSON.stringify(n)}</li>)}</ul></>}
          {d.userResearch.insights?.length > 0 && <><h4>Insights</h4><ul>{d.userResearch.insights.map((ins: any, i: number) => <li key={i}>{typeof ins === 'string' ? ins : ins.insight || JSON.stringify(ins)}</li>)}</ul></>}
        </CollapsibleSection>
      )}

      {/* Risks */}
      {d.risks?.length > 0 && (
        <CollapsibleSection title="Risks" count={d.risks.length} sectionId="research-risks">
          {d.risks.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{r.risk}</strong>
                {r.category && <span className="tag">{r.category}</span>}
                {r.probability && <span className="tag">P: {r.probability}</span>}
                {r.impact && <span className={'tag risk-' + r.impact}>I: {r.impact}</span>}
              </div>
              {r.mitigation && <div><em>Mitigation: {r.mitigation}</em></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Scope */}
      {(scope.description || scope.inScope?.length) && (
        <CollapsibleSection title="Scope" sectionId="research-scope">
          {scope.description && <Md text={scope.description} />}
          {scope.timeframe && <p><strong>Timeframe:</strong> {scope.timeframe}</p>}
          {scope.inScope?.length > 0 && <><h4>In Scope</h4><ul>{scope.inScope.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>}
          {scope.outOfScope?.length > 0 && <><h4>Out of Scope</h4><ul>{scope.outOfScope.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>}
        </CollapsibleSection>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <CollapsibleSection title="Goals" count={goals.length} sectionId="research-goals">
          {goals.map((g: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <strong>{g.goal}</strong>
              {g.rationale && <div><em>{g.rationale}</em></div>}
              {g.successCriteria && <div><strong>Success:</strong> {g.successCriteria}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Research Questions */}
      {questions.length > 0 && (
        <CollapsibleSection title="Questions" count={questions.length} sectionId="research-questions">
          {questions.map((q: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '1.1em' }}>{q.answered ? '\u2611' : '\u2610'}</span>
                <strong style={{ flex: 1 }}>{q.question}</strong>
                {q.priority && <span className="tag">{q.priority}</span>}
              </div>
              {q.answer && <div style={{ marginTop: '4px', paddingLeft: '24px' }}><Md text={q.answer} /></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Methodology */}
      {(methodology.approach || methodology.methods?.length) && (
        <CollapsibleSection title="Methodology" sectionId="research-methodology">
          {methodology.approach && <Md text={methodology.approach} />}
          {methodology.webResearchEnabled != null && <p><strong>Web Research:</strong> {methodology.webResearchEnabled ? 'Enabled' : 'Disabled'}</p>}
          {methodology.toolsUsed?.length > 0 && <><h4>Tools Used</h4><ul>{methodology.toolsUsed.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></>}
          {methodology.methods?.length > 0 && (
            <><h4>Methods</h4><ul>{methodology.methods.map((m: any, i: number) => <li key={i}><strong>{m.method}</strong>{m.description && `: ${m.description}`}{m.rationale && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><em>Rationale: {m.rationale}</em></div>}</li>)}</ul></>
          )}
          {methodology.sources?.length > 0 && (
            <><h4>Sources</h4><ul>{methodology.sources.map((s: any, i: number) => (
              <li key={i}>{s.source}{s.type && <span className="tag" style={{ marginLeft: '4px' }}>{s.type}</span>}{s.credibility && <span className="tag" style={{ marginLeft: '4px' }}>{s.credibility}</span>}{s.notes && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><em>{s.notes}</em></div>}</li>
            ))}</ul></>
          )}
          {methodology.limitations?.length > 0 && <><h4>Limitations</h4><ul>{methodology.limitations.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul></>}
        </CollapsibleSection>
      )}

      {/* Findings */}
      <CollapsibleSection title="Findings" count={findings.length} sectionId="research-findings">
        {findings.length > 0 ? findings.map((f: any, i: number) => (
          <CollapsibleSection key={i} title={`${f.id || `F-${i + 1}`}: ${(f.finding || '').slice(0, 80)}`} sectionId={`research-finding-${i}`}>
            {f.category && <span className="tag">{f.category}</span>}
            {f.confidence && <span className="tag" style={{ marginLeft: '4px' }}>{f.confidence}</span>}
            <Md text={f.finding || ''} />
            {f.details && <Md text={f.details} />}
            {f.evidence?.length > 0 && (
              <><h4>Evidence</h4><ul>{f.evidence.map((e: any, ei: number) => <li key={ei}>{e.description || e.type}{e.source && ` (${e.source})`}</li>)}</ul></>
            )}
            {f.implications?.length > 0 && (
              <><h4>Implications</h4><ul>{f.implications.map((im: any, ii: number) => (
                <li key={ii}>{im.implication}{im.area && <span className="tag" style={{ marginLeft: '4px' }}>{im.area}</span>}{im.severity && <span className={`tag risk-${im.severity}`} style={{ marginLeft: '4px' }}>{im.severity}</span>}</li>
              ))}</ul></>
            )}
            {f.actionItems?.length > 0 && <><h4>Actions</h4><ul>{f.actionItems.map((a: string, ai: number) => <li key={ai}>{a}</li>)}</ul></>}
            {f.relatedFindings?.length > 0 && <><h4>Related Findings</h4><ul>{f.relatedFindings.map((rf: string, ri: number) => <li key={ri}>{rf}</li>)}</ul></>}
          </CollapsibleSection>
        )) : <p className="empty-message">No findings</p>}
      </CollapsibleSection>

      {/* Competitive Analysis */}
      {competitiveAnalysis.length > 0 && (
        <CollapsibleSection title="Competitive Analysis" count={competitiveAnalysis.length} sectionId="research-competitive">
          {competitiveAnalysis.map((c: any, i: number) => (
            <CollapsibleSection key={i} title={c.competitor || `Competitor ${i + 1}`} sectionId={`research-comp-${i}`}>
              {c.description && <Md text={c.description} />}
              {c.marketPosition && <p><strong>Position:</strong> {c.marketPosition}</p>}
              {c.strengths?.length > 0 && <><h4>Strengths</h4><ul>{c.strengths.map((s: any, si: number) => <li key={si}>{s.strength}{s.impact && ` (${s.impact})`}</li>)}</ul></>}
              {c.weaknesses?.length > 0 && <><h4>Weaknesses</h4><ul>{c.weaknesses.map((w: any, wi: number) => <li key={wi}>{w.weakness}{w.opportunity && ` — Opportunity: ${w.opportunity}`}</li>)}</ul></>}
              {c.features?.length > 0 && <><h4>Features</h4><ul>{c.features.map((f: string, fi: number) => <li key={fi}>{f}</li>)}</ul></>}
              {c.lessons?.length > 0 && <><h4>Lessons</h4><ul>{c.lessons.map((l: string, li: number) => <li key={li}>{l}</li>)}</ul></>}
              {c.website && <p><strong>Website:</strong> <a href={c.website} target="_blank" rel="noopener noreferrer">{c.website}</a></p>}
              {c.targetMarket && <p><strong>Target Market:</strong> {c.targetMarket}</p>}
              {c.pricing && (
                <><h4>Pricing</h4>
                  {c.pricing.model && <p><strong>Model:</strong> {c.pricing.model}</p>}
                  {c.pricing.tiers?.length > 0 && <ul>{c.pricing.tiers.map((tier: any, ti: number) => <li key={ti}>{typeof tier === 'string' ? tier : tier.name || JSON.stringify(tier)}</li>)}</ul>}
                </>
              )}
              {c.differentiators?.length > 0 && <><h4>Differentiators</h4><ul>{c.differentiators.map((diff: string, di: number) => <li key={di}>{diff}</li>)}</ul></>}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* Trends */}
      {trends.length > 0 && (
        <CollapsibleSection title="Trends" count={trends.length} sectionId="research-trends">
          {trends.map((t: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{t.trend}</strong>
                {t.timeframe && <span className="tag">{t.timeframe}</span>}
                {t.impact && <span className={`tag risk-${t.impact}`}>{t.impact}</span>}
              </div>
              {t.relevance && <div><em>{t.relevance}</em></div>}
              {t.category && <div style={{ fontSize: '0.85em' }}><span className="tag">{t.category}</span></div>}
              {t.evidence?.length > 0 && <div style={{ fontSize: '0.85em' }}><strong>Evidence:</strong> {t.evidence.join('; ')}</div>}
              {t.implications?.length > 0 && <div style={{ fontSize: '0.85em' }}><strong>Implications:</strong> {t.implications.join('; ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Technical Findings */}
      {technicalFindings.length > 0 && (
        <CollapsibleSection title="Technical Findings" count={technicalFindings.length} sectionId="research-tech">
          {technicalFindings.map((tf: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              {tf.topic && <h4>{tf.topic}</h4>}
              {tf.finding && <Md text={tf.finding} />}
              {tf.feasibility && <span className="tag">{tf.feasibility}</span>}
              {tf.risks?.length > 0 && <div><strong>Risks:</strong> {tf.risks.join(', ')}</div>}
              {tf.recommendations?.length > 0 && <div><strong>Recs:</strong> {tf.recommendations.join(', ')}</div>}
              {tf.details && <div style={{ marginTop: '4px' }}><Md text={tf.details} /></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <CollapsibleSection title="Recommendations" count={recommendations.length} sectionId="research-recs">
          {recommendations.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {r.id && <span className="tag">{r.id}</span>}
                <strong style={{ flex: 1 }}>{r.recommendation}</strong>
                {r.priority && <span className={`tag risk-${r.priority}`}>{r.priority}</span>}
              </div>
              {r.rationale && <div><em>{r.rationale}</em></div>}
              {r.category && <div style={{ fontSize: '0.85em' }}><span className="tag">{r.category}</span></div>}
              {r.supportingFindings?.length > 0 && <div style={{ fontSize: '0.85em' }}><strong>Supporting Findings:</strong> {r.supportingFindings.join(', ')}</div>}
              {r.effort && <span className="tag" style={{ marginRight: '4px' }}>Effort: {r.effort}</span>}
              {r.impact && <span className="tag">Impact: {r.impact}</span>}
              {r.risks?.length > 0 && <div style={{ fontSize: '0.85em' }}><strong>Risks:</strong> {r.risks.join('; ')}</div>}
              {r.nextSteps?.length > 0 && <div style={{ fontSize: '0.85em' }}><strong>Next Steps:</strong><ul>{r.nextSteps.map((ns: string, ni: number) => <li key={ni}>{ns}</li>)}</ul></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Synthesis */}
      {(synthesis.summary || synthesis.keyInsights?.length) && (
        <CollapsibleSection title="Synthesis" sectionId="research-synthesis">
          {synthesis.summary && <Md text={synthesis.summary} />}
          {synthesis.keyInsights?.length > 0 && <><h4>Key Insights</h4><ul>{synthesis.keyInsights.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>}
          {synthesis.strategicImplications?.length > 0 && <><h4>Strategic Implications</h4><ul>{synthesis.strategicImplications.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>}
          {synthesis.openQuestions?.length > 0 && <><h4>Open Questions</h4><ul>{synthesis.openQuestions.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>}
          {synthesis.futureResearch?.length > 0 && <><h4>Future Research</h4><ul>{synthesis.futureResearch.map((fr: string, i: number) => <li key={i}>{fr}</li>)}</ul></>}
        </CollapsibleSection>
      )}

      {/* References */}
      {references.length > 0 && (
        <CollapsibleSection title="References" count={references.length} sectionId="research-refs">
          {references.map((r: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{r.title || r.source || `Ref ${i + 1}`}</strong>
              {r.type && <span className="tag" style={{ marginLeft: '4px' }}>{r.type}</span>}
              {r.author && <span> — {r.author}</span>}
              {r.url && <span> <a href={r.url} target="_blank" rel="noopener noreferrer">Link</a></span>}
              {r.publication && <span style={{ fontSize: '0.85em', opacity: 0.7 }}> ({r.publication})</span>}
              {r.date && <span style={{ fontSize: '0.85em', opacity: 0.7 }}> [{r.date}]</span>}
              {r.accessDate && <span style={{ fontSize: '0.85em', opacity: 0.7 }}> Accessed: {r.accessDate}</span>}
              {r.relevance && <div style={{ fontSize: '0.85em' }}><em>Relevance: {r.relevance}</em></div>}
              {r.notes && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{r.notes}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Appendices */}
      {appendices.length > 0 && (
        <CollapsibleSection title="Appendices" count={appendices.length} sectionId="research-appendices">
          {appendices.map((a: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{a.title || `Appendix ${i + 1}`}</strong>
                {a.type && <span className="tag">{a.type}</span>}
              </div>
              {a.content && <div style={{ marginTop: '4px' }}><Md text={a.content} /></div>}
              {a.reference && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><strong>Reference:</strong> {a.reference}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// UX DESIGN DETAILS
// ==========================================================================

export function renderUxDesignDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray } = props;
  const d: any = editedData;

  // --- Normalization: map sample data shapes to renderer shapes ---

  // Build overview from flat fields if not present
  if (!d.overview && (d.designTitle || d.designPhase || d.designSystem?.name)) {
    d.overview = {
      productName: d.designTitle || d.designSystem?.name || '',
      designPhilosophy: d.designSystem?.description || '',
      version: d.designSystem?.version || '',
    };
  }

  // Normalize colorPalette: sample is flat array [{name,value,usage}], renderer expects {primary[], secondary[], semantic{}}
  if (d.designSystem?.colorPalette && Array.isArray(d.designSystem.colorPalette)) {
    d.designSystem = {
      ...d.designSystem,
      colorPalette: {
        primary: d.designSystem.colorPalette,
      },
    };
  }

  // Normalize typography: sample is flat array [{name,font,weights,usage}], renderer expects {fontFamilies[{name,source,usage,weights}]}
  if (d.designSystem?.typography && Array.isArray(d.designSystem.typography)) {
    d.designSystem = {
      ...d.designSystem,
      typography: {
        fontFamilies: d.designSystem.typography.map((t: any) => ({
          name: t.name || '',
          source: t.font || '',
          usage: t.usage || '',
          weights: typeof t.weights === 'string' ? t.weights.split(',').map((w: string) => w.trim()) : (t.weights || []),
        })),
      },
    };
  }

  // Normalize iconography: sample is string, renderer expects {library, style, sizes[]}
  if (d.designSystem?.iconography && typeof d.designSystem.iconography === 'string') {
    d.designSystem = {
      ...d.designSystem,
      iconography: { library: d.designSystem.iconography },
    };
  }

  // Normalize spacing: sample is string, renderer expects {description, baseUnit, scale[]}
  if (d.designSystem?.spacing && typeof d.designSystem.spacing === 'string') {
    d.designSystem = {
      ...d.designSystem,
      spacing: { description: d.designSystem.spacing },
    };
  }

  // Normalize borderRadius: sample is string at designSystem.borderRadius
  // (renderer doesn't have a section for this, but we can display it in spacing/borders)
  if (d.designSystem?.borderRadius && typeof d.designSystem.borderRadius === 'string' && !d.designSystem.borders) {
    d.designSystem = {
      ...d.designSystem,
      borders: { description: `Border Radius: ${d.designSystem.borderRadius}` },
    };
  }

  // Normalize components → componentStrategy.customComponents
  if (!d.componentStrategy && d.designSystem?.components?.length > 0) {
    d.componentStrategy = {
      customComponents: d.designSystem.components.map((c: any) => ({
        name: c.name || '',
        description: c.description || '',
        variants: c.variants?.map((v: string) => ({ variant: v })) || [],
      })),
    };
  }

  // Normalize userFlows → userJourneys
  if ((!d.userJourneys || d.userJourneys.length === 0) && d.userFlows?.length > 0) {
    d.userJourneys = d.userFlows.map((f: any) => ({
      name: f.flowName || f.name || '',
      description: f.description || '',
      // map steps[] (strings) → stages[] ({stage, description})
      stages: (f.steps || []).map((s: any, idx: number) =>
        typeof s === 'string' ? { stage: `Step ${idx + 1}`, description: s } : s
      ),
      // map successMetrics[] → successCriteria[]
      successCriteria: f.successMetrics || f.successCriteria || [],
    }));
  }

  // Normalize wireframes: add fidelity/notes display support
  // (already handled by renderer for name/description, just ensure fidelity/notes are shown)

  // Normalize accessibilityRequirements → accessibility
  if ((!d.accessibility || (!d.accessibility.requirements && !d.accessibility.standard)) && d.accessibilityRequirements?.length > 0) {
    d.accessibility = {
      requirements: d.accessibilityRequirements.map((r: any) => ({
        requirement: r.requirement || '',
        category: r.priority || '',
        implementation: r.notes || '',
      })),
    };
  }

  const overview = d.overview || {};
  const coreExperience = d.coreExperience || {};
  const designInspiration: any[] = d.designInspiration || [];
  const designSystem = d.designSystem || {};
  const userJourneys: any[] = d.userJourneys || [];
  const wireframes: any[] = d.wireframes || [];
  const componentStrategy = d.componentStrategy || {};
  const pageLayouts: any[] = d.pageLayouts || [];
  const uxPatterns: any[] = d.uxPatterns || [];
  const responsive = d.responsive || {};
  const accessibility = d.accessibility || {};
  const interactions: any[] = d.interactions || [];
  const errorStates: any[] = d.errorStates || [];
  const emptyStates: any[] = d.emptyStates || [];
  const loadingStates: any[] = d.loadingStates || [];
  const implementationNotes: string[] = d.implementationNotes || [];
  const references: any[] = d.references || [];
  const usabilityTestingPlan = d.usabilityTestingPlan || {};
  const designDecisions: any[] = d.designDecisions || [];

  const patternCategories = ['navigation', 'input', 'feedback', 'data-display', 'layout', 'interaction'];

  return (
    <>
      {/* Overview */}
      {(overview.productName || overview.designPhilosophy || overview.targetExperience) && (
        <CollapsibleSection title="Design Overview" sectionId="ux-overview">
          {editMode ? (
            <div className="edit-grid">
              <label>Product Name</label>
              <input value={overview.productName || ''} onChange={(e) => handleFieldChange('overview', { ...overview, productName: e.target.value })} />
              <label>Version</label>
              <input value={overview.version || ''} onChange={(e) => handleFieldChange('overview', { ...overview, version: e.target.value })} />
              <label>Design Philosophy</label>
              <textarea rows={3} value={overview.designPhilosophy || ''} onChange={(e) => handleFieldChange('overview', { ...overview, designPhilosophy: e.target.value })} />
              <label>Target Experience</label>
              <textarea rows={3} value={overview.targetExperience || ''} onChange={(e) => handleFieldChange('overview', { ...overview, targetExperience: e.target.value })} />
            </div>
          ) : (
            <>
              {overview.productName && <div><strong>Product:</strong> {overview.productName} {overview.version && <span className="tag">{overview.version}</span>}</div>}
              {overview.designPhilosophy && <div style={{ marginTop: '4px' }}><Md text={overview.designPhilosophy} /></div>}
              {overview.targetExperience && <div style={{ marginTop: '4px' }}><strong>Target Experience:</strong> <Md text={overview.targetExperience} /></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Design Principles */}
      {overview.designPrinciples?.length > 0 && (
        <CollapsibleSection title="Design Principles" count={overview.designPrinciples.length} sectionId="ux-principles">
          {overview.designPrinciples.map((p: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{p.principle || `Principle ${i + 1}`}</strong>
              {p.description && <div style={{ opacity: 0.85 }}><Md text={p.description} /></div>}
              {p.examples?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{p.examples.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Design Goals */}
      {overview.designGoals?.length > 0 && (
        <CollapsibleSection title="Design Goals" count={overview.designGoals.length} sectionId="ux-goals">
          {overview.designGoals.map((g: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{g.goal || `Goal ${i + 1}`}</strong>
              {g.metrics && <span className="tag" style={{ marginLeft: '4px' }}>{g.metrics}</span>}
              {g.rationale && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{g.rationale}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Core Experience */}
      {(coreExperience.primaryValue || coreExperience.userFlowSummary) && (
        <CollapsibleSection title="Core Experience" sectionId="ux-core">
          {editMode ? (
            <div className="edit-grid">
              <label>Primary Value</label>
              <textarea rows={2} value={coreExperience.primaryValue || ''} onChange={(e) => handleFieldChange('coreExperience', { ...coreExperience, primaryValue: e.target.value })} />
              <label>User Flow Summary</label>
              <textarea rows={3} value={coreExperience.userFlowSummary || ''} onChange={(e) => handleFieldChange('coreExperience', { ...coreExperience, userFlowSummary: e.target.value })} />
            </div>
          ) : (
            <>
              {coreExperience.primaryValue && <div><strong>Primary Value:</strong> <Md text={coreExperience.primaryValue} /></div>}
              {coreExperience.userFlowSummary && <div style={{ marginTop: '4px' }}><Md text={coreExperience.userFlowSummary} /></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Key Interactions */}
      {coreExperience.keyInteractions?.length > 0 && (
        <CollapsibleSection title="Key Interactions" count={coreExperience.keyInteractions.length} sectionId="ux-interactions-core">
          {coreExperience.keyInteractions.map((k: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{k.interaction || `Interaction ${i + 1}`}</strong>
              {k.frequency && <span className="tag" style={{ marginLeft: '4px' }}>{k.frequency}</span>}
              {k.purpose && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{k.purpose}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Emotional Goals */}
      {coreExperience.emotionalGoals?.length > 0 && (
        <CollapsibleSection title="Emotional Goals" count={coreExperience.emotionalGoals.length} sectionId="ux-emotions">
          {coreExperience.emotionalGoals.map((e: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{e.emotion || `Emotion ${i + 1}`}</strong>
              {e.description && <span style={{ opacity: 0.85 }}> — {e.description}</span>}
              {e.triggers?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Triggers: {e.triggers.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Design Inspiration */}
      {designInspiration.length > 0 && (
        <CollapsibleSection title="Design Inspiration" count={designInspiration.length} sectionId="ux-inspiration">
          {designInspiration.map((ins: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{ins.source || `Inspiration ${i + 1}`}</strong>
              {ins.url && <span> <a href={ins.url} target="_blank" rel="noopener noreferrer">Link</a></span>}
              {ins.aspect && <div style={{ opacity: 0.85 }}><strong>Aspect:</strong> {ins.aspect}</div>}
              {ins.application && <div style={{ opacity: 0.85 }}><strong>Application:</strong> {ins.application}</div>}
              {ins.screenshots?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Screenshots: {ins.screenshots.map((s: string, si: number) => <a key={si} href={s} target="_blank" rel="noopener noreferrer" style={{ marginRight: '4px' }}>{s}</a>)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Design System - Overview */}
      {designSystem.overview && (
        <CollapsibleSection title="Design System Overview" sectionId="ux-ds-overview">
          <Md text={designSystem.overview} />
        </CollapsibleSection>
      )}

      {/* Design System - Color Palette */}
      {designSystem.colorPalette && (
        <CollapsibleSection title="Color Palette" sectionId="ux-colors">
          {designSystem.colorPalette.description && <div style={{ marginBottom: '4px' }}><Md text={designSystem.colorPalette.description} /></div>}
          {designSystem.colorPalette.primary?.length > 0 && (
            <>
              <h4>Primary Colors</h4>
              {designSystem.colorPalette.primary.map((c: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {c.value && <span style={{ width: '16px', height: '16px', borderRadius: '3px', backgroundColor: c.value, display: 'inline-block', border: '1px solid var(--vscode-widget-border)' }} />}
                  <strong>{c.name || c.value}</strong>
                  {c.value && <code>{c.value}</code>}
                  {c.usage && <span style={{ opacity: 0.7 }}> — {c.usage}</span>}
                </div>
              ))}
            </>
          )}
          {designSystem.colorPalette.secondary?.length > 0 && (
            <>
              <h4>Secondary Colors</h4>
              {designSystem.colorPalette.secondary.map((c: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {c.value && <span style={{ width: '16px', height: '16px', borderRadius: '3px', backgroundColor: c.value, display: 'inline-block', border: '1px solid var(--vscode-widget-border)' }} />}
                  <strong>{c.name || c.value}</strong>
                  {c.usage && <span style={{ opacity: 0.7 }}> — {c.usage}</span>}
                </div>
              ))}
            </>
          )}
          {designSystem.colorPalette.semantic && (
            <>
              <h4>Semantic Colors</h4>
              {['success', 'warning', 'error', 'info'].map(key => {
                const sc = designSystem.colorPalette.semantic[key];
                return sc ? (
                  <div key={key} style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {sc.value && <span style={{ width: '16px', height: '16px', borderRadius: '3px', backgroundColor: sc.value, display: 'inline-block', border: '1px solid var(--vscode-widget-border)' }} />}
                    <strong>{key}</strong>
                    {sc.value && <code>{sc.value}</code>}
                    {sc.usage && <span style={{ opacity: 0.7 }}> — {sc.usage}</span>}
                  </div>
                ) : null;
              })}
            </>
          )}
          {designSystem.colorPalette.neutral?.length > 0 && (
            <>
              <h4>Neutral Colors</h4>
              {designSystem.colorPalette.neutral.map((c: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {c.value && <span style={{ width: '16px', height: '16px', borderRadius: '3px', backgroundColor: c.value, display: 'inline-block', border: '1px solid var(--vscode-widget-border)' }} />}
                  <strong>{c.name || c.value}</strong>
                  {c.value && <code>{c.value}</code>}
                  {c.usage && <span style={{ opacity: 0.7 }}> — {c.usage}</span>}
                </div>
              ))}
            </>
          )}
          {designSystem.colorPalette.darkMode && (
            <div style={{ marginTop: '4px' }}>
              <h4>Dark Mode</h4>
              {typeof designSystem.colorPalette.darkMode === 'string' ? (
                <div>{designSystem.colorPalette.darkMode}</div>
              ) : (
                <>
                  {designSystem.colorPalette.darkMode.approach && <div>{designSystem.colorPalette.darkMode.approach}</div>}
                  {designSystem.colorPalette.darkMode.overrides?.length > 0 && (
                    <div style={{ marginTop: '2px' }}>
                      {designSystem.colorPalette.darkMode.overrides.map((o: any, i: number) => (
                        <div key={i} style={{ padding: '1px 8px', fontSize: '0.85em' }}>
                          <strong>{o.name || o.token}:</strong> <code>{o.value || o.darkValue}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {designSystem.borders?.widths?.length > 0 && (
            <>
              <h4>Border Widths</h4>
              {designSystem.borders.widths.map((w: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{w.name}</code>: <code>{w.value}</code> {w.usage && <span style={{ opacity: 0.7 }}> — {w.usage}</span>}
                </div>
              ))}
            </>
          )}
          {designSystem.borders?.description && <div style={{ marginTop: '4px' }}><Md text={designSystem.borders.description} /></div>}
        </CollapsibleSection>
      )}

      {/* Design System - Shadows */}
      {designSystem.shadows?.length > 0 && (
        <CollapsibleSection title="Shadows" count={designSystem.shadows.length} sectionId="ux-shadows">
          {designSystem.shadows.map((s: any, i: number) => (
            <div key={i} style={{ padding: '1px 8px' }}>
              <code>{s.name || `Shadow ${i + 1}`}</code>
              {s.value && <span style={{ opacity: 0.7 }}> — <code>{s.value}</code></span>}
              {s.usage && <span style={{ opacity: 0.7 }}> — {s.usage}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Design System - Typography */}
      {designSystem.typography && (
        <CollapsibleSection title="Typography" sectionId="ux-typography">
          {designSystem.typography.description && <div style={{ marginBottom: '4px' }}><Md text={designSystem.typography.description} /></div>}
          {designSystem.typography.fontFamilies?.length > 0 && (
            <>
              <h4>Font Families</h4>
              {designSystem.typography.fontFamilies.map((f: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                  <strong>{f.name}</strong>
                  {f.source && <span className="tag" style={{ marginLeft: '4px' }}>{f.source}</span>}
                  {f.usage && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{f.usage}</div>}
                  {f.weights?.length > 0 && <div style={{ fontSize: '0.85em' }}>Weights: {f.weights.join(', ')}</div>}
                  {f.fallbacks?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Fallbacks: {f.fallbacks.join(', ')}</div>}
                </div>
              ))}
            </>
          )}
          {designSystem.typography.scale?.length > 0 && (
            <>
              <h4>Type Scale</h4>
              <table style={{ width: '100%', fontSize: '0.85em' }}>
                <thead><tr><th>Name</th><th>Size</th><th>Weight</th><th>Line Height</th><th>Usage</th></tr></thead>
                <tbody>
                  {designSystem.typography.scale.map((s: any, i: number) => (
                    <tr key={i}>
                      <td><strong>{s.name}</strong></td>
                      <td><code>{s.size}</code></td>
                      <td>{s.weight}</td>
                      <td>{s.lineHeight}</td>
                      <td style={{ opacity: 0.7 }}>{s.usage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {designSystem.typography.textStyles?.length > 0 && (
            <>
              <h4>Text Styles</h4>
              {designSystem.typography.textStyles.map((ts: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <strong>{ts.name || `Style ${i + 1}`}</strong>
                  {ts.font && <span style={{ opacity: 0.7 }}> — {ts.font}</span>}
                  {ts.size && <code style={{ marginLeft: '4px' }}>{ts.size}</code>}
                  {ts.weight && <span style={{ opacity: 0.7 }}> / {ts.weight}</span>}
                  {ts.usage && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{ts.usage}</div>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Design System - Spacing & Borders */}
      {(designSystem.spacing || designSystem.borders) && (
        <CollapsibleSection title="Spacing & Borders" sectionId="ux-spacing">
          {designSystem.spacing?.description && <div><Md text={designSystem.spacing.description} /></div>}
          {designSystem.spacing?.baseUnit && <div><strong>Base Unit:</strong> <code>{designSystem.spacing.baseUnit}</code></div>}
          {designSystem.spacing?.scale?.length > 0 && (
            <>
              <h4>Spacing Scale</h4>
              {designSystem.spacing.scale.map((s: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{s.name}</code>: <code>{s.value}</code> {s.usage && <span style={{ opacity: 0.7 }}> — {s.usage}</span>}
                </div>
              ))}
            </>
          )}
          {designSystem.borders?.radii?.length > 0 && (
            <>
              <h4>Border Radii</h4>
              {designSystem.borders.radii.map((r: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{r.name}</code>: <code>{r.value}</code> {r.usage && <span style={{ opacity: 0.7 }}> — {r.usage}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Design System - Animation */}
      {designSystem.animation && (
        <CollapsibleSection title="Animation & Motion" sectionId="ux-animation">
          {designSystem.animation.principles?.length > 0 && (
            <><h4>Principles</h4><ul>{designSystem.animation.principles.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></>
          )}
          {designSystem.animation.durations?.length > 0 && (
            <>
              <h4>Durations</h4>
              {designSystem.animation.durations.map((d: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{d.name}</code>: <code>{d.value}</code> {d.usage && <span style={{ opacity: 0.7 }}> — {d.usage}</span>}
                </div>
              ))}
            </>
          )}
          {designSystem.animation.easings?.length > 0 && (
            <>
              <h4>Easings</h4>
              {designSystem.animation.easings.map((e: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{e.name}</code>: <code>{e.value}</code> {e.usage && <span style={{ opacity: 0.7 }}> — {e.usage}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Iconography */}
      {designSystem.iconography && (
        <CollapsibleSection title="Iconography" sectionId="ux-icons">
          {designSystem.iconography.library && <div><strong>Library:</strong> {designSystem.iconography.library}</div>}
          {designSystem.iconography.style && <div><strong>Style:</strong> {designSystem.iconography.style}</div>}
          {designSystem.iconography.sizes?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              {designSystem.iconography.sizes.map((s: any, i: number) => (
                <span key={i} className="tag" style={{ marginRight: '4px' }}>{s.name}: {s.value}</span>
              ))}
            </div>
          )}
          {designSystem.iconography.customIcons?.length > 0 && (
            <>
              <h4>Custom Icons</h4>
              {designSystem.iconography.customIcons.map((ic: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <strong>{ic.name || `Icon ${i + 1}`}</strong>
                  {ic.usage && <span style={{ opacity: 0.7 }}> — {ic.usage}</span>}
                  {ic.path && <code style={{ marginLeft: '4px' }}>{ic.path}</code>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* User Journeys */}
      {userJourneys.length > 0 && (
        <CollapsibleSection title="User Journeys" count={userJourneys.length} sectionId="ux-journeys">
          {userJourneys.map((j: any, i: number) => (
            <CollapsibleSection key={i} title={j.name || `Journey ${i + 1}`} sectionId={`ux-journey-${i}`}>
              {j.id && <div style={{ fontSize: '0.85em', opacity: 0.6 }}>ID: <code>{j.id}</code></div>}
              {j.persona && <div><strong>Persona:</strong> {j.persona}</div>}
              {j.goal && <div><strong>Goal:</strong> {j.goal}</div>}
              {j.trigger && <div><strong>Trigger:</strong> {j.trigger}</div>}
              {j.description && <div style={{ marginTop: '4px' }}><Md text={j.description} /></div>}
              {j.stages?.length > 0 && (
                <>
                  <h4>Stages</h4>
                  {j.stages.map((s: any, si: number) => (
                    <div key={si} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
                      <strong>{s.stage || `Stage ${si + 1}`}</strong>
                      {s.emotions && <span className="tag" style={{ marginLeft: '4px' }}>{s.emotions}</span>}
                      {s.emotionScore != null && <span className="tag" style={{ marginLeft: '4px' }}>Score: {s.emotionScore}</span>}
                      {s.description && <div style={{ opacity: 0.85 }}>{s.description}</div>}
                      {s.thoughts && <div style={{ fontSize: '0.85em', fontStyle: 'italic', opacity: 0.7 }}>Thoughts: {s.thoughts}</div>}
                      {s.actions?.length > 0 && <div style={{ fontSize: '0.85em' }}>Actions: {s.actions.map((a: any) => a.action || a).join(', ')}</div>}
                      {s.painPoints?.length > 0 && <div style={{ fontSize: '0.85em', color: 'var(--vscode-errorForeground)' }}>Pain points: {s.painPoints.join(', ')}</div>}
                      {s.opportunities?.length > 0 && <div style={{ fontSize: '0.85em', color: 'var(--vscode-testing-iconPassed)' }}>Opportunities: {s.opportunities.join(', ')}</div>}
                    </div>
                  ))}
                </>
              )}
              {j.successCriteria?.length > 0 && <div style={{ marginTop: '4px' }}><strong>Success Criteria:</strong><ul>{j.successCriteria.map((c: string, ci: number) => <li key={ci}>{c}</li>)}</ul></div>}
              {j.metrics?.length > 0 && <div>{j.metrics.map((m: any, mi: number) => <span key={mi} className="tag" style={{ marginRight: '4px' }}>{m.metric}: {m.target}</span>)}</div>}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* Wireframes */}
      {wireframes.length > 0 && (
        <CollapsibleSection title="Wireframes" count={wireframes.length} sectionId="ux-wireframes">
          {wireframes.map((w: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
              <strong>{w.name || `Wireframe ${i + 1}`}</strong>
              {w.id && <span style={{ fontSize: '0.85em', opacity: 0.6, marginLeft: '4px' }}>({w.id})</span>}
              {w.type && <span className="tag" style={{ marginLeft: '4px' }}>{w.type}</span>}
              {w.fidelity && <span className="tag" style={{ marginLeft: '4px' }}>{w.fidelity}</span>}
              {w.description && <div style={{ opacity: 0.85 }}>{w.description}</div>}
              {w.notes && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><em>{w.notes}</em></div>}
              {w.screens?.length > 0 && (
                <div style={{ marginTop: '2px', fontSize: '0.85em' }}>
                  {w.screens.map((s: any, si: number) => (
                    <div key={si} style={{ marginLeft: '8px' }}>
                      <strong>{s.name}</strong> {s.description && <span style={{ opacity: 0.7 }}>— {s.description}</span>}
                    </div>
                  ))}
                </div>
              )}
              {w.reference && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Ref: {w.reference}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Component Strategy */}
      {(componentStrategy.overview || componentStrategy.customComponents?.length > 0) && (
        <CollapsibleSection title="Component Strategy" count={componentStrategy.customComponents?.length} sectionId="ux-components">
          {componentStrategy.overview && <div style={{ marginBottom: '4px' }}><Md text={componentStrategy.overview} /></div>}
          {componentStrategy.componentLibrary && <div><strong>Library:</strong> {componentStrategy.componentLibrary}</div>}
          {componentStrategy.customizationApproach && <div><strong>Customization:</strong> {componentStrategy.customizationApproach}</div>}
          {componentStrategy.customComponents?.map((c: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginTop: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{c.name || `Component ${i + 1}`}</strong>
              {c.purpose && <div style={{ opacity: 0.85 }}>{c.purpose}</div>}
              {c.description && <div><Md text={c.description} /></div>}
              {c.props?.length > 0 && (
                <div style={{ fontSize: '0.85em', marginTop: '2px' }}>
                  Props: {c.props.map((p: any) => `${p.name}${p.required ? '*' : ''}: ${p.type}`).join(', ')}
                </div>
              )}
              {c.states?.length > 0 && <div style={{ fontSize: '0.85em' }}>States: {c.states.map((s: any) => s.state).join(', ')}</div>}
              {c.variants?.length > 0 && <div style={{ fontSize: '0.85em' }}>Variants: {c.variants.map((v: any) => v.variant).join(', ')}</div>}
              {c.accessibility && (
                <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                  A11y: {c.accessibility.role && `role="${c.accessibility.role}"`} {c.accessibility.keyboardInteraction && `| ${c.accessibility.keyboardInteraction}`}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Page Layouts */}
      {pageLayouts.length > 0 && (
        <CollapsibleSection title="Page Layouts" count={pageLayouts.length} sectionId="ux-layouts">
          {pageLayouts.map((l: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '4px' }}>
              <strong>{l.name || `Layout ${i + 1}`}</strong>
              {l.type && <span className="tag" style={{ marginLeft: '4px' }}>{l.type}</span>}
              {l.description && <div style={{ opacity: 0.85 }}>{l.description}</div>}
              {l.responsiveBehavior && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Responsive: {l.responsiveBehavior}</div>}
              {l.components?.length > 0 && <div style={{ fontSize: '0.85em' }}>Components: {l.components.join(', ')}</div>}
              {l.structure && (
                <div style={{ fontSize: '0.85em', marginTop: '2px' }}>
                  {l.structure.header && <div><strong>Header:</strong> {typeof l.structure.header === 'string' ? l.structure.header : JSON.stringify(l.structure.header)}</div>}
                  {l.structure.sidebar && <div><strong>Sidebar:</strong> {typeof l.structure.sidebar === 'string' ? l.structure.sidebar : JSON.stringify(l.structure.sidebar)}</div>}
                  {l.structure.main && <div><strong>Main:</strong> {typeof l.structure.main === 'string' ? l.structure.main : JSON.stringify(l.structure.main)}</div>}
                  {l.structure.footer && <div><strong>Footer:</strong> {typeof l.structure.footer === 'string' ? l.structure.footer : JSON.stringify(l.structure.footer)}</div>}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* UX Patterns */}
      {uxPatterns.length > 0 && (
        <CollapsibleSection title="UX Patterns" count={uxPatterns.length} sectionId="ux-patterns">
          {editMode ? (
            <>
              {uxPatterns.map((p: any, i: number) => (
                <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                  <div className="edit-grid">
                    <label>Pattern</label>
                    <input value={p.pattern || ''} onChange={(e) => updateArrayItem('uxPatterns', i, { ...p, pattern: e.target.value })} />
                    <label>Category</label>
                    <select value={p.category || ''} onChange={(e) => updateArrayItem('uxPatterns', i, { ...p, category: e.target.value })}>
                      <option value="">Select...</option>
                      {patternCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <label>Usage</label>
                    <textarea rows={2} value={p.usage || ''} onChange={(e) => updateArrayItem('uxPatterns', i, { ...p, usage: e.target.value })} />
                    <label>Implementation</label>
                    <textarea rows={2} value={p.implementation || ''} onChange={(e) => updateArrayItem('uxPatterns', i, { ...p, implementation: e.target.value })} />
                  </div>
                  <button className="remove-btn" onClick={() => removeFromArray('uxPatterns', i)}>Remove</button>
                </div>
              ))}
              <button className="add-btn" onClick={() => addToArray('uxPatterns', { pattern: '', category: '', usage: '', implementation: '' })}>+ Add Pattern</button>
            </>
          ) : (
            uxPatterns.map((p: any, i: number) => (
              <div key={i} style={{ padding: '2px 8px', marginBottom: '4px' }}>
                <strong>{p.pattern || `Pattern ${i + 1}`}</strong>
                {p.category && <span className="tag" style={{ marginLeft: '4px' }}>{p.category}</span>}
                {p.usage && <div style={{ opacity: 0.85 }}>{p.usage}</div>}
                {p.implementation && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Impl: {p.implementation}</div>}
                {p.rationale && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Why: {p.rationale}</div>}
                {p.examples?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Examples: {p.examples.join(', ')}</div>}
              </div>
            ))
          )}
        </CollapsibleSection>
      )}

      {/* Responsive Design */}
      {(responsive.strategy || responsive.breakpoints?.length > 0) && (
        <CollapsibleSection title="Responsive Design" sectionId="ux-responsive">
          {responsive.strategy && <div><strong>Strategy:</strong> {responsive.strategy}</div>}
          {responsive.breakpoints?.length > 0 && (
            <>
              <h4>Breakpoints</h4>
              <table style={{ width: '100%', fontSize: '0.85em' }}>
                <thead><tr><th>Name</th><th>Min</th><th>Max</th><th>Description</th></tr></thead>
                <tbody>
                  {responsive.breakpoints.map((b: any, i: number) => (
                    <tr key={i}>
                      <td><strong>{b.name}</strong></td>
                      <td><code>{b.minWidth || '—'}</code></td>
                      <td><code>{b.maxWidth || '—'}</code></td>
                      <td style={{ opacity: 0.7 }}>{b.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {responsive.adaptiveElements?.length > 0 && (
            <>
              <h4>Adaptive Elements</h4>
              {responsive.adaptiveElements.map((e: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}><strong>{e.element}:</strong> {e.behavior}</div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Accessibility */}
      {(accessibility.standard || accessibility.requirements?.length > 0) && (
        <CollapsibleSection title="Accessibility" count={accessibility.requirements?.length} sectionId="ux-a11y">
          {accessibility.standard && <div><strong>Standard:</strong> {accessibility.standard}</div>}
          {accessibility.overview && <div style={{ marginTop: '4px' }}><Md text={accessibility.overview} /></div>}
          {accessibility.requirements?.map((r: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{r.requirement || `Req ${i + 1}`}</strong>
              {r.category && <span className="tag" style={{ marginLeft: '4px' }}>{r.category}</span>}
              {r.implementation && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Impl: {r.implementation}</div>}
            </div>
          ))}
          {accessibility.keyboardNavigation && (
            <>
              <h4>Keyboard Navigation</h4>
              {accessibility.keyboardNavigation.strategy && <div>{accessibility.keyboardNavigation.strategy}</div>}
              {accessibility.keyboardNavigation.shortcuts?.length > 0 && (
                <div style={{ marginTop: '2px' }}>
                  {accessibility.keyboardNavigation.shortcuts.map((s: any, i: number) => (
                    <div key={i} style={{ padding: '1px 8px' }}><kbd>{s.keys}</kbd>: {s.action}</div>
                  ))}
                </div>
              )}
            </>
          )}
          {accessibility.colorContrast && (
            <div style={{ marginTop: '4px' }}>
              <strong>Color Contrast:</strong> Min {accessibility.colorContrast.minimumRatio} | Large text {accessibility.colorContrast.largeTextRatio}
            </div>
          )}
          {accessibility.screenReaderSupport && (
            <div style={{ marginTop: '4px' }}>
              <h4>Screen Reader Support</h4>
              {accessibility.screenReaderSupport.approach && <div>{accessibility.screenReaderSupport.approach}</div>}
              {accessibility.screenReaderSupport.announcements?.length > 0 && (
                <div style={{ marginTop: '2px' }}>
                  <strong>Announcements:</strong>
                  <ul>{accessibility.screenReaderSupport.announcements.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Interactions */}
      {interactions.length > 0 && (
        <CollapsibleSection title="Interactions" count={interactions.length} sectionId="ux-interactions">
          {interactions.map((inter: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{inter.name || `Interaction ${i + 1}`}</strong>
              {inter.trigger && <span style={{ opacity: 0.7 }}> — Trigger: {inter.trigger}</span>}
              {inter.response && <div style={{ opacity: 0.85 }}>{inter.response}</div>}
              {inter.feedback && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Feedback: {inter.feedback}</div>}
              {inter.animation && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Animation: {inter.animation}</div>}
              {inter.states?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>States: {inter.states.map((s: any) => typeof s === 'string' ? s : s.state || s.name).join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Error / Empty / Loading States */}
      {(errorStates.length > 0 || emptyStates.length > 0 || loadingStates.length > 0) && (
        <CollapsibleSection title="UI States" count={errorStates.length + emptyStates.length + loadingStates.length} sectionId="ux-states">
          {errorStates.length > 0 && (
            <>
              <h4>Error States</h4>
              {errorStates.map((e: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{e.errorType || `Error ${i + 1}`}</strong>
                  {e.message && <span style={{ opacity: 0.85 }}> — {e.message}</span>}
                  {e.recovery && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Recovery: {e.recovery}</div>}
                </div>
              ))}
            </>
          )}
          {emptyStates.length > 0 && (
            <>
              <h4>Empty States</h4>
              {emptyStates.map((e: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{e.context || `Empty ${i + 1}`}</strong>
                  {e.message && <span style={{ opacity: 0.85 }}> — {e.message}</span>}
                  {e.action && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Action: {e.action}</div>}
                </div>
              ))}
            </>
          )}
          {loadingStates.length > 0 && (
            <>
              <h4>Loading States</h4>
              {loadingStates.map((l: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{l.context || `Loading ${i + 1}`}</strong>
                  {l.type && <span className="tag" style={{ marginLeft: '4px' }}>{l.type}</span>}
                  {l.description && <span style={{ opacity: 0.7 }}> — {l.description}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Implementation Notes */}
      {implementationNotes.length > 0 && (
        <CollapsibleSection title="Implementation Notes" count={implementationNotes.length} sectionId="ux-impl-notes">
          <ul>{implementationNotes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
        </CollapsibleSection>
      )}

      {/* References */}
      {references.length > 0 && (
        <CollapsibleSection title="References" count={references.length} sectionId="ux-refs">
          {references.map((r: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{r.title || `Ref ${i + 1}`}</strong>
              {r.type && <span className="tag" style={{ marginLeft: '4px' }}>{r.type}</span>}
              {r.url && <span> <a href={r.url} target="_blank" rel="noopener noreferrer">Link</a></span>}
              {r.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{r.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Usability Testing Plan */}
      {(usabilityTestingPlan.approach || usabilityTestingPlan.rounds?.length > 0 || usabilityTestingPlan.keyFindings?.length > 0) && (
        <CollapsibleSection title="Usability Testing" sectionId="ux-testing">
          {usabilityTestingPlan.approach && <div style={{ marginBottom: '4px' }}><Md text={usabilityTestingPlan.approach} /></div>}
          {usabilityTestingPlan.rounds?.length > 0 && (
            <>
              <h4>Rounds</h4>
              {usabilityTestingPlan.rounds.map((r: any, i: number) => (
                <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <strong style={{ flex: 1 }}>{r.round || `Round ${i + 1}`}</strong>
                    {r.status && <span className={`status-badge status-${r.status}`}>{r.status}</span>}
                    {r.participants && <span className="tag">{r.participants} participants</span>}
                  </div>
                  {r.focus && <div style={{ opacity: 0.85 }}>{r.focus}</div>}
                </div>
              ))}
            </>
          )}
          {usabilityTestingPlan.keyFindings?.length > 0 && (
            <>
              <h4>Key Findings</h4>
              <ul>{usabilityTestingPlan.keyFindings.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Design Decisions */}
      {designDecisions.length > 0 && (
        <CollapsibleSection title="Design Decisions" count={designDecisions.length} sectionId="ux-decisions">
          {designDecisions.map((dd: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{dd.decision || `Decision ${i + 1}`}</strong>
                {dd.date && <span className="tag">{dd.date}</span>}
              </div>
              {dd.rationale && <div style={{ marginTop: '2px' }}><strong>Rationale:</strong> {dd.rationale}</div>}
              {dd.alternatives?.length > 0 && (
                <div style={{ marginTop: '2px', fontSize: '0.85em', opacity: 0.7 }}>
                  <strong>Alternatives considered:</strong> {dd.alternatives.join(', ')}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// TECH SPEC DETAILS
// ==========================================================================

export function renderTechSpecDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray } = props;
  const d: any = editedData;

  // --- Normalization: map sample data shapes to renderer shapes ---

  // Build overview from specTitle + scope if not present
  if (!d.overview && (d.specTitle || d.scope)) {
    d.overview = {
      summary: d.specTitle || '',
    };
  }
  // If scope is a plain string, set it on overview for display
  if (typeof d.scope === 'string' && d.scope && d.overview && !d.overview.scope) {
    d.overview = { ...d.overview, scopeDescription: d.scope };
  }

  // Normalize apiDesign → apiChanges
  if (!d.apiChanges && d.apiDesign?.endpoints?.length > 0) {
    d.apiChanges = {
      overview: [
        d.apiDesign.baseUrl && `Base URL: \`${d.apiDesign.baseUrl}\``,
        d.apiDesign.authentication && `Auth: ${d.apiDesign.authentication}`,
        d.apiDesign.rateLimiting && `Rate Limiting: ${d.apiDesign.rateLimiting}`,
        d.apiDesign.errorFormat && `Error Format: \`${d.apiDesign.errorFormat}\``,
      ].filter(Boolean).join('\n\n'),
      newEndpoints: d.apiDesign.endpoints.map((ep: any) => ({
        method: ep.method || '',
        path: ep.path || '',
        description: [
          ep.description || '',
          ep.authentication && `Auth: ${ep.authentication}`,
          ep.requestBody && `Request: \`${ep.requestBody}\``,
          ep.responseBody && `Response: \`${ep.responseBody}\``,
        ].filter(Boolean).join(' | '),
      })),
    };
  }

  // Normalize databaseSchema → dataModel
  if (!d.dataModel && d.databaseSchema?.tables?.length > 0) {
    d.dataModel = {
      entities: d.databaseSchema.tables.map((t: any) => ({
        name: t.name || '',
        description: t.description || '',
        // columns is a string in sample — display as description, no structured fields
        fields: typeof t.columns === 'string'
          ? t.columns.split(',').map((col: string) => {
              const trimmed = col.trim();
              return { name: trimmed, type: '', required: false, description: '' };
            })
          : (t.columns || []),
      })),
      indexesNote: d.databaseSchema.indexes?.length > 0
        ? d.databaseSchema.indexes.join('\n')
        : undefined,
    };
  }

  // Normalize systemArchitecture → techStack (services become tech stack entries)
  if ((!d.techStack || d.techStack.length === 0) && d.systemArchitecture?.services?.length > 0) {
    d.techStack = d.systemArchitecture.services.map((s: any) => ({
      technology: s.name || '',
      version: s.technology || '',
      purpose: `[${s.type || ''}] ${s.description || ''} (${s.deployment || ''})`,
    }));
    // Store the overview for display in context section
    if (d.systemArchitecture.overview && !d.context) {
      d.context = { overview: d.systemArchitecture.overview };
    }
  }

  const overview = d.overview || {};
  const context = d.context || {};
  const techStack: any[] = d.techStack || [];
  const dataModel = d.dataModel || {};
  const apiChanges = d.apiChanges || {};
  const filesToModify: any[] = d.filesToModify || [];
  const filesToCreate: any[] = d.filesToCreate || [];
  const codePatterns: any[] = d.codePatterns || [];
  const testPatterns: any[] = d.testPatterns || [];
  const implementationPlan = d.implementationPlan || {};
  const testingStrategy = d.testingStrategy || {};
  const risks: any[] = d.risks || [];
  const rollbackPlan = d.rollbackPlan || {};
  const additionalContext = d.additionalContext || {};
  const reviewers: any[] = d.reviewers || [];
  const securityConsiderations: any[] = d.securityConsiderations || [];
  const performanceTargets: any[] = d.performanceTargets || [];

  const specStatuses = ['draft', 'review', 'approved', 'implementing', 'completed', 'archived'];
  const riskLevels = ['low', 'medium', 'high'];
  const reviewStatuses = ['pending', 'approved', 'changes-requested'];

  return (
    <>
      {/* Title */}
      {d.title && <h3 style={{ margin: '0 0 4px 0' }}>{d.title}</h3>}

      {/* Status / Version / Slug */}
      {(d.version || d.slug || d.status) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
          {d.status && (editMode ? (
            <select value={d.status} onChange={(e) => handleFieldChange('status', e.target.value)}>
              {specStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <span className="tag">{d.status}</span>)}
          {d.version && <span className="tag">v{d.version}</span>}
          {d.slug && <span style={{ opacity: 0.6, fontSize: '0.85em' }}>/{d.slug}</span>}
        </div>
      )}

      {/* Overview */}
      {(overview.summary || overview.problemStatement || overview.proposedSolution) && (
        <CollapsibleSection title="Overview" sectionId="ts-overview">
          {editMode ? (
            <div className="edit-grid">
              <label>Summary</label>
              <textarea rows={3} value={overview.summary || ''} onChange={(e) => handleFieldChange('overview', { ...overview, summary: e.target.value })} />
              <label>Problem Statement</label>
              <textarea rows={3} value={overview.problemStatement || ''} onChange={(e) => handleFieldChange('overview', { ...overview, problemStatement: e.target.value })} />
              <label>Background</label>
              <textarea rows={2} value={overview.background || ''} onChange={(e) => handleFieldChange('overview', { ...overview, background: e.target.value })} />
              <label>Proposed Solution</label>
              <textarea rows={3} value={overview.proposedSolution || ''} onChange={(e) => handleFieldChange('overview', { ...overview, proposedSolution: e.target.value })} />
            </div>
          ) : (
            <>
              {overview.summary && <div><Md text={overview.summary} /></div>}
              {overview.problemStatement && <div style={{ marginTop: '4px' }}><strong>Problem:</strong> <Md text={overview.problemStatement} /></div>}
              {overview.background && <div style={{ marginTop: '4px' }}><strong>Background:</strong> <Md text={overview.background} /></div>}
              {overview.proposedSolution && <div style={{ marginTop: '4px' }}><strong>Proposed Solution:</strong> <Md text={overview.proposedSolution} /></div>}
              {overview.relatedDocuments?.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  <strong>Related Documents:</strong>
                  <ul>{overview.relatedDocuments.map((doc: any, i: number) => <li key={i}>{typeof doc === 'string' ? doc : doc.title || doc.name || `Document ${i + 1}`}{doc.url && <span> <a href={doc.url} target="_blank" rel="noopener noreferrer">Link</a></span>}</li>)}</ul>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Goals */}
      {overview.goals?.length > 0 && (
        <CollapsibleSection title="Goals" count={overview.goals.length} sectionId="ts-goals">
          {overview.goals.map((g: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{g.goal || `Goal ${i + 1}`}</strong>
              {g.priority && <span className="tag" style={{ marginLeft: '4px' }}>{g.priority}</span>}
              {g.successCriteria && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Success: {g.successCriteria}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Non-Goals */}
      {overview.nonGoals?.length > 0 && (
        <CollapsibleSection title="Non-Goals" count={overview.nonGoals.length} sectionId="ts-nongoals">
          <ul>{overview.nonGoals.map((ng: string, i: number) => <li key={i}>{ng}</li>)}</ul>
        </CollapsibleSection>
      )}

      {/* Scope */}
      {(overview.scope || overview.scopeDescription) && (
        <CollapsibleSection title="Scope" sectionId="ts-scope">
          {overview.scopeDescription && <div style={{ marginBottom: '4px' }}><Md text={overview.scopeDescription} /></div>}
          {overview.scope.inScope?.length > 0 && (
            <>
              <h4>In Scope</h4>
              {overview.scope.inScope.map((s: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{s.item || `Item ${i + 1}`}</strong>
                  {s.rationale && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{s.rationale}</div>}
                </div>
              ))}
            </>
          )}
          {overview.scope.outOfScope?.length > 0 && (
            <>
              <h4>Out of Scope</h4>
              {overview.scope.outOfScope.map((s: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{s.item || `Item ${i + 1}`}</strong>
                  {s.reason && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{s.reason}</div>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Context */}
      {(context.overview || context.existingArchitecture) && (
        <CollapsibleSection title="Development Context" sectionId="ts-context">
          {context.overview && <div><Md text={context.overview} /></div>}
          {context.existingArchitecture && <div style={{ marginTop: '4px' }}><strong>Existing Architecture:</strong> <Md text={context.existingArchitecture} /></div>}
          {context.codebasePatterns?.length > 0 && (
            <>
              <h4>Codebase Patterns</h4>
              {context.codebasePatterns.map((p: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{p.pattern || `Pattern ${i + 1}`}</strong>
                  {p.location && <span style={{ opacity: 0.7 }}> — {p.location}</span>}
                  {p.example && <pre style={{ fontSize: '0.85em', margin: '2px 0' }}>{p.example}</pre>}
                </div>
              ))}
            </>
          )}
          {context.technicalDecisions?.length > 0 && (
            <>
              <h4>Technical Decisions</h4>
              {context.technicalDecisions.map((td: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
                  <strong>{td.decision || `Decision ${i + 1}`}</strong>
                  {td.rationale && <div style={{ opacity: 0.85 }}>{td.rationale}</div>}
                  {td.alternatives?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Alternatives: {td.alternatives.map((a: any) => a.alternative).join(', ')}</div>}
                </div>
              ))}
            </>
          )}
          {context.constraints?.length > 0 && (
            <>
              <h4>Constraints</h4>
              {context.constraints.map((c: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{c.constraint || `Constraint ${i + 1}`}</strong>
                  {c.impact && <span style={{ opacity: 0.7 }}> — Impact: {c.impact}</span>}
                  {c.workaround && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Workaround: {c.workaround}</div>}
                </div>
              ))}
            </>
          )}
          {context.filesToReference?.length > 0 && (
            <>
              <h4>Files to Reference</h4>
              {context.filesToReference.map((f: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{typeof f === 'string' ? f : f.path || f.file}</code>
                  {f.reason && <span style={{ opacity: 0.7 }}> — {f.reason}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Tech Stack */}
      {techStack.length > 0 && (
        <CollapsibleSection title="Tech Stack" count={techStack.length} sectionId="ts-stack">
          {editMode ? (
            <>
              {techStack.map((t: any, i: number) => (
                <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                  <div className="edit-grid">
                    <label>Technology</label>
                    <input value={t.technology || ''} onChange={(e) => updateArrayItem('techStack', i, { ...t, technology: e.target.value })} />
                    <label>Version</label>
                    <input value={t.version || ''} onChange={(e) => updateArrayItem('techStack', i, { ...t, version: e.target.value })} />
                    <label>Purpose</label>
                    <input value={t.purpose || ''} onChange={(e) => updateArrayItem('techStack', i, { ...t, purpose: e.target.value })} />
                  </div>
                  <button className="remove-btn" onClick={() => removeFromArray('techStack', i)}>Remove</button>
                </div>
              ))}
              <button className="add-btn" onClick={() => addToArray('techStack', { technology: '', version: '', purpose: '' })}>+ Add Technology</button>
            </>
          ) : (
            <table style={{ width: '100%', fontSize: '0.85em' }}>
              <thead><tr><th>Technology</th><th>Version</th><th>Purpose</th></tr></thead>
              <tbody>
                {techStack.map((t: any, i: number) => (
                  <tr key={i}>
                    <td><strong>{t.technology}</strong></td>
                    <td><code>{t.version}</code></td>
                    <td style={{ opacity: 0.7 }}>{t.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CollapsibleSection>
      )}

      {/* Data Model */}
      {(dataModel.overview || dataModel.entities?.length > 0) && (
        <CollapsibleSection title="Data Model" count={dataModel.entities?.length} sectionId="ts-data">
          {dataModel.overview && <div style={{ marginBottom: '4px' }}><Md text={dataModel.overview} /></div>}
          {dataModel.entities?.map((e: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{e.name || `Entity ${i + 1}`}</strong>
              {e.description && <div style={{ opacity: 0.85 }}>{e.description}</div>}
              {e.fields?.length > 0 && (
                <table style={{ width: '100%', fontSize: '0.85em', marginTop: '2px' }}>
                  <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
                  <tbody>
                    {e.fields.map((f: any, fi: number) => (
                      <tr key={fi}>
                        <td><code>{f.name}</code></td>
                        <td><code>{f.type}</code></td>
                        <td>{f.required ? 'Yes' : 'No'}</td>
                        <td style={{ opacity: 0.7 }}>{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {e.relationships?.length > 0 && <div style={{ fontSize: '0.85em', marginTop: '2px' }}>Relations: {e.relationships.map((r: any) => `${r.entity} (${r.type})`).join(', ')}</div>}
            </div>
          ))}
          {dataModel.indexesNote && (
            <>
              <h4>Indexes</h4>
              <pre style={{ fontSize: '0.85em', whiteSpace: 'pre-wrap' }}>{dataModel.indexesNote}</pre>
            </>
          )}
          {dataModel.migrations?.length > 0 && (
            <>
              <h4>Migrations</h4>
              {dataModel.migrations.map((m: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                  <strong>{m.name || m.version || `Migration ${i + 1}`}</strong>
                  {m.type && <span className="tag" style={{ marginLeft: '4px' }}>{m.type}</span>}
                  {m.description && <div style={{ opacity: 0.85 }}>{m.description}</div>}
                  {m.sql && <pre style={{ fontSize: '0.85em', margin: '2px 0' }}>{m.sql}</pre>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* API Changes */}
      {(apiChanges.overview || apiChanges.newEndpoints?.length > 0 || apiChanges.modifiedEndpoints?.length > 0) && (
        <CollapsibleSection title="API Changes" count={(apiChanges.newEndpoints?.length || 0) + (apiChanges.modifiedEndpoints?.length || 0)} sectionId="ts-api">
          {apiChanges.overview && <div style={{ marginBottom: '4px' }}><Md text={apiChanges.overview} /></div>}
          {apiChanges.newEndpoints?.length > 0 && (
            <>
              <h4>New Endpoints</h4>
              {apiChanges.newEndpoints.map((ep: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-testing-iconPassed)' }}>
                  <code><strong>{ep.method}</strong> {ep.path}</code>
                  {ep.description && <div style={{ opacity: 0.85 }}>{ep.description}</div>}
                </div>
              ))}
            </>
          )}
          {apiChanges.modifiedEndpoints?.length > 0 && (
            <>
              <h4>Modified Endpoints</h4>
              {apiChanges.modifiedEndpoints.map((ep: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                  <code>{ep.path}</code>
                  {ep.changes && <div style={{ opacity: 0.85 }}>{ep.changes}</div>}
                  {ep.backwardCompatibility && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Backward compat: {ep.backwardCompatibility}</div>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Files to Modify / Create */}
      {(filesToModify.length > 0 || filesToCreate.length > 0) && (
        <CollapsibleSection title="File Changes" count={filesToModify.length + filesToCreate.length} sectionId="ts-files">
          {filesToModify.length > 0 && (
            <>
              <h4>Files to Modify</h4>
              {filesToModify.map((f: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <code>{f.path}</code>
                  {f.changes && <span style={{ opacity: 0.7 }}> — {f.changes}</span>}
                </div>
              ))}
            </>
          )}
          {filesToCreate.length > 0 && (
            <>
              <h4>Files to Create</h4>
              {filesToCreate.map((f: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <code>{f.path}</code>
                  {f.purpose && <span style={{ opacity: 0.7 }}> — {f.purpose}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Code & Test Patterns */}
      {(codePatterns.length > 0 || testPatterns.length > 0) && (
        <CollapsibleSection title="Code & Test Patterns" count={codePatterns.length + testPatterns.length} sectionId="ts-patterns">
          {codePatterns.length > 0 && (
            <>
              <h4>Code Patterns</h4>
              {codePatterns.map((p: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                  <strong>{p.pattern || `Pattern ${i + 1}`}</strong>
                  {p.rationale && <span style={{ opacity: 0.7 }}> — {p.rationale}</span>}
                  {p.example && <pre style={{ fontSize: '0.85em', margin: '2px 0' }}>{p.example}</pre>}
                </div>
              ))}
            </>
          )}
          {testPatterns.length > 0 && (
            <>
              <h4>Test Patterns</h4>
              {testPatterns.map((p: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                  <strong>{p.pattern || `Pattern ${i + 1}`}</strong>
                  {p.coverage && <span className="tag" style={{ marginLeft: '4px' }}>{p.coverage}</span>}
                  {p.example && <pre style={{ fontSize: '0.85em', margin: '2px 0' }}>{p.example}</pre>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Implementation Plan */}
      {(implementationPlan.overview || implementationPlan.tasks?.length > 0 || implementationPlan.phases?.length > 0) && (
        <CollapsibleSection title="Implementation Plan" count={implementationPlan.tasks?.length} sectionId="ts-impl">
          {implementationPlan.overview && <div style={{ marginBottom: '4px' }}><Md text={implementationPlan.overview} /></div>}
          {implementationPlan.phases?.length > 0 && (
            <>
              <h4>Phases</h4>
              {implementationPlan.phases.map((p: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
                  <strong>{p.phase || `Phase ${i + 1}`}</strong>
                  {p.description && <div style={{ opacity: 0.85 }}>{p.description}</div>}
                  {p.tasks?.length > 0 && <ul>{p.tasks.map((t: string, ti: number) => <li key={ti}>{t}</li>)}</ul>}
                  {p.deliverables?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Deliverables: {p.deliverables.join(', ')}</div>}
                </div>
              ))}
            </>
          )}
          {implementationPlan.tasks?.length > 0 && (
            <>
              <h4>Tasks</h4>
              {implementationPlan.tasks.map((t: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                  {t.id && <span className="tag" style={{ marginRight: '4px' }}>{t.id}</span>}
                  <strong>{t.description || `Task ${i + 1}`}</strong>
                  {t.priority != null && <span className="tag" style={{ marginLeft: '4px' }}>P{t.priority}</span>}
                  {t.estimatedEffort && <span className="tag" style={{ marginLeft: '4px' }}>{t.estimatedEffort}</span>}
                  {t.details && <div style={{ opacity: 0.85 }}>{t.details}</div>}
                  {t.files?.length > 0 && <div style={{ fontSize: '0.85em' }}>Files: {t.files.map((f: string) => <code key={f} style={{ marginRight: '4px' }}>{f}</code>)}</div>}
                  {t.subtasks?.length > 0 && <ul style={{ marginTop: '2px' }}>{t.subtasks.map((st: any, si: number) => <li key={si}>{st.task || st}{st.details ? ` — ${st.details}` : ''}</li>)}</ul>}
                </div>
              ))}
            </>
          )}
          {implementationPlan.milestones?.length > 0 && (
            <>
              <h4>Milestones</h4>
              {implementationPlan.milestones.map((m: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{m.milestone || `Milestone ${i + 1}`}</strong>
                  {m.criteria && <span style={{ opacity: 0.7 }}> — {m.criteria}</span>}
                </div>
              ))}
            </>
          )}
          {implementationPlan.acceptanceCriteria?.length > 0 && (
            <>
              <h4>Acceptance Criteria</h4>
              <ul>{implementationPlan.acceptanceCriteria.map((ac: any, i: number) => (
                <li key={i}>{typeof ac === 'string' ? ac : ac.criterion || ac.description || `AC ${i + 1}`}</li>
              ))}</ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Testing Strategy */}
      {(testingStrategy.overview || testingStrategy.unitTests || testingStrategy.integrationTests) && (
        <CollapsibleSection title="Testing Strategy" sectionId="ts-testing">
          {testingStrategy.overview && <div style={{ marginBottom: '4px' }}><Md text={testingStrategy.overview} /></div>}
          {testingStrategy.unitTests && (
            <div style={{ marginBottom: '4px' }}>
              <h4>Unit Tests</h4>
              {testingStrategy.unitTests.approach && <div>{testingStrategy.unitTests.approach}</div>}
              {testingStrategy.unitTests.coverage && <div style={{ opacity: 0.7 }}>Coverage: {testingStrategy.unitTests.coverage}</div>}
            </div>
          )}
          {testingStrategy.integrationTests && (
            <div style={{ marginBottom: '4px' }}>
              <h4>Integration Tests</h4>
              {testingStrategy.integrationTests.approach && <div>{testingStrategy.integrationTests.approach}</div>}
              {testingStrategy.integrationTests.scenarios?.length > 0 && <ul>{testingStrategy.integrationTests.scenarios.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>}
            </div>
          )}
          {testingStrategy.e2eTests && (
            <div style={{ marginBottom: '4px' }}>
              <h4>E2E Tests</h4>
              {testingStrategy.e2eTests.approach && <div>{testingStrategy.e2eTests.approach}</div>}
              {testingStrategy.e2eTests.flows?.length > 0 && <ul>{testingStrategy.e2eTests.flows.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>}
            </div>
          )}
          {testingStrategy.manualTesting?.length > 0 && (
            <div><h4>Manual Testing</h4><ul>{testingStrategy.manualTesting.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul></div>
          )}
        </CollapsibleSection>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <CollapsibleSection title="Risks" count={risks.length} sectionId="ts-risks">
          {editMode ? (
            <>
              {risks.map((r: any, i: number) => (
                <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                  <div className="edit-grid">
                    <label>Risk</label>
                    <textarea rows={2} value={r.risk || ''} onChange={(e) => updateArrayItem('risks', i, { ...r, risk: e.target.value })} />
                    <label>Probability</label>
                    <select value={r.probability || ''} onChange={(e) => updateArrayItem('risks', i, { ...r, probability: e.target.value })}>
                      <option value="">Select...</option>
                      {riskLevels.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <label>Impact</label>
                    <select value={r.impact || ''} onChange={(e) => updateArrayItem('risks', i, { ...r, impact: e.target.value })}>
                      <option value="">Select...</option>
                      {riskLevels.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <label>Mitigation</label>
                    <textarea rows={2} value={r.mitigation || ''} onChange={(e) => updateArrayItem('risks', i, { ...r, mitigation: e.target.value })} />
                  </div>
                  <button className="remove-btn" onClick={() => removeFromArray('risks', i)}>Remove</button>
                </div>
              ))}
              <button className="add-btn" onClick={() => addToArray('risks', { risk: '', probability: '', impact: '', mitigation: '' })}>+ Add Risk</button>
            </>
          ) : (
            risks.map((r: any, i: number) => (
              <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                <strong>{r.risk || `Risk ${i + 1}`}</strong>
                {r.probability && <span className="tag" style={{ marginLeft: '4px', backgroundColor: r.probability === 'high' ? 'var(--vscode-errorForeground)' : undefined }}>{r.probability}</span>}
                {r.impact && <span className="tag" style={{ marginLeft: '4px' }}>Impact: {r.impact}</span>}
                {r.mitigation && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Mitigation: {r.mitigation}</div>}
              </div>
            ))
          )}
        </CollapsibleSection>
      )}

      {/* Rollback Plan */}
      {(rollbackPlan.triggers?.length > 0 || rollbackPlan.steps?.length > 0) && (
        <CollapsibleSection title="Rollback Plan" sectionId="ts-rollback">
          {rollbackPlan.triggers?.length > 0 && (
            <><h4>Triggers</h4><ul>{rollbackPlan.triggers.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></>
          )}
          {rollbackPlan.steps?.length > 0 && (
            <><h4>Steps</h4><ol>{rollbackPlan.steps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol></>
          )}
          {rollbackPlan.dataRecovery && <div><strong>Data Recovery:</strong> {rollbackPlan.dataRecovery}</div>}
        </CollapsibleSection>
      )}

      {/* Additional Context */}
      {(additionalContext.assumptions?.length > 0 || additionalContext.openQuestions?.length > 0 || additionalContext.notes?.length > 0) && (
        <CollapsibleSection title="Additional Context" sectionId="ts-context-extra">
          {additionalContext.assumptions?.length > 0 && (
            <><h4>Assumptions</h4><ul>{additionalContext.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></>
          )}
          {additionalContext.openQuestions?.length > 0 && (
            <>
              <h4>Open Questions</h4>
              {additionalContext.openQuestions.map((q: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{q.question || `Q${i + 1}`}</strong>
                  {q.owner && <span className="tag" style={{ marginLeft: '4px' }}>{q.owner}</span>}
                  {q.status && <span className="tag" style={{ marginLeft: '4px' }}>{q.status}</span>}
                </div>
              ))}
            </>
          )}
          {additionalContext.dependencies?.length > 0 && (
            <>
              <h4>Dependencies</h4>
              {additionalContext.dependencies.map((dep: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{dep.dependency || `Dep ${i + 1}`}</strong>
                  {dep.type && <span className="tag" style={{ marginLeft: '4px' }}>{dep.type}</span>}
                  {dep.status && <span className="tag" style={{ marginLeft: '4px' }}>{dep.status}</span>}
                </div>
              ))}
            </>
          )}
          {additionalContext.notes?.length > 0 && (
            <><h4>Notes</h4><ul>{additionalContext.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></>
          )}
          {additionalContext.references?.length > 0 && (
            <>
              <h4>References</h4>
              {additionalContext.references.map((ref: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  {typeof ref === 'string' ? (
                    <span>{ref}</span>
                  ) : (
                    <>
                      <strong>{ref.title || `Reference ${i + 1}`}</strong>
                      {ref.url && <span> <a href={ref.url} target="_blank" rel="noopener noreferrer">Link</a></span>}
                      {ref.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{ref.description}</div>}
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Reviewers */}
      {reviewers.length > 0 && (
        <CollapsibleSection title="Reviewers" count={reviewers.length} sectionId="ts-reviewers">
          {editMode ? (
            <>
              {reviewers.map((r: any, i: number) => (
                <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input value={r.name || ''} placeholder="Name" onChange={(e) => updateArrayItem('reviewers', i, { ...r, name: e.target.value })} />
                  <input value={r.role || ''} placeholder="Role" onChange={(e) => updateArrayItem('reviewers', i, { ...r, role: e.target.value })} />
                  <select value={r.status || ''} onChange={(e) => updateArrayItem('reviewers', i, { ...r, status: e.target.value })}>
                    <option value="">Select...</option>
                    {reviewStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="remove-btn" onClick={() => removeFromArray('reviewers', i)}>X</button>
                </div>
              ))}
              <button className="add-btn" onClick={() => addToArray('reviewers', { name: '', role: '', status: 'pending' })}>+ Add Reviewer</button>
            </>
          ) : (
            reviewers.map((r: any, i: number) => (
              <div key={i} style={{ padding: '2px 8px' }}>
                <strong>{r.name || `Reviewer ${i + 1}`}</strong>
                {r.role && <span style={{ opacity: 0.7 }}> ({r.role})</span>}
                {r.status && <span className="tag" style={{ marginLeft: '4px', backgroundColor: r.status === 'approved' ? 'var(--vscode-testing-iconPassed)' : r.status === 'changes-requested' ? 'var(--vscode-errorForeground)' : undefined }}>{r.status}</span>}
              </div>
            ))
          )}
        </CollapsibleSection>
      )}

      {/* Security Considerations */}
      {securityConsiderations.length > 0 && (
        <CollapsibleSection title="Security Considerations" count={securityConsiderations.length} sectionId="ts-security">
          {securityConsiderations.map((s: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <strong>{s.area || `Security ${i + 1}`}</strong>
              {s.approach && <div style={{ marginTop: '2px' }}><Md text={s.approach} /></div>}
              {s.threats && <div style={{ fontSize: '0.85em' }}><strong>Threats:</strong> {s.threats}</div>}
              {s.mitigations && <div style={{ fontSize: '0.85em' }}><strong>Mitigations:</strong> {s.mitigations}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Performance Targets */}
      {performanceTargets.length > 0 && (
        <CollapsibleSection title="Performance Targets" count={performanceTargets.length} sectionId="ts-perf">
          <table style={{ width: '100%', fontSize: '0.85em' }}>
            <thead><tr><th>Metric</th><th>Target</th><th>Measurement</th></tr></thead>
            <tbody>
              {performanceTargets.map((p: any, i: number) => (
                <tr key={i}>
                  <td><strong>{p.metric}</strong></td>
                  <td>{p.target}</td>
                  <td style={{ opacity: 0.7 }}>{p.measurement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// PROJECT OVERVIEW DETAILS
// ==========================================================================

export function renderProjectOverviewDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;

  // --- Normalization: map sample data shapes to renderer shapes ---

  // Build projectInfo from flat fields
  if (!d.projectInfo && (d.projectName || d.projectDescription)) {
    d.projectInfo = {
      name: d.projectName || '',
      description: d.projectDescription || '',
    };
  }

  const projectInfo = d.projectInfo || {};
  const projectClassification = d.projectClassification || {};
  const multiPartStructure: any[] = d.multiPartStructure || [];
  const techStackSummary = d.techStackSummary || {};
  const keyFeatures: any[] = d.keyFeatures || [];
  const architectureHighlights: any[] = d.architectureHighlights || [];
  const codebaseAnalysis = d.codebaseAnalysis || {};
  const development = d.development || {};
  const repositoryStructure: any[] = d.repositoryStructure || [];
  const entryPoints: any[] = d.entryPoints || [];
  const dataFlows: any[] = d.dataFlows || [];
  const integrations: any[] = d.integrations || [];
  const knownIssues: any[] = d.knownIssues || [];
  const recommendations: any[] = d.recommendations || [];
  const documentationMap: any[] = d.documentationMap || [];
  const additionalNotes: string[] = d.additionalNotes || [];

  // Sample-specific fields
  const projectGoals: any[] = d.projectGoals || [];
  const scope = d.scope || {};
  const timeline = d.timeline || {};
  const team = d.team || {};
  const stakeholders: any[] = d.stakeholders || [];
  const successCriteria: any[] = d.successCriteria || [];
  const projectRisks: any[] = d.risks || [];

  return (
    <>
      {/* Project Info */}
      {(projectInfo.name || projectInfo.description) && (
        <CollapsibleSection title="Project Info" sectionId="po-info">
          {editMode ? (
            <div className="edit-grid">
              <label>Name</label>
              <input value={projectInfo.name || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, name: e.target.value })} />
              <label>Description</label>
              <textarea rows={3} value={projectInfo.description || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, description: e.target.value })} />
              <label>Type</label>
              <input value={projectInfo.type || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, type: e.target.value })} />
              <label>Architecture Pattern</label>
              <input value={projectInfo.architecturePattern || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, architecturePattern: e.target.value })} />
              <label>Version</label>
              <input value={projectInfo.version || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, version: e.target.value })} />
              <label>Repository</label>
              <input value={projectInfo.repository || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, repository: e.target.value })} />
            </div>
          ) : (
            <>
              {projectInfo.name && <div><strong>{projectInfo.name}</strong> {projectInfo.version && <span className="tag">{projectInfo.version}</span>}</div>}
              {projectInfo.type && <div><strong>Type:</strong> {projectInfo.type}</div>}
              {projectInfo.architecturePattern && <div><strong>Architecture:</strong> {projectInfo.architecturePattern}</div>}
              {projectInfo.description && <div style={{ marginTop: '4px' }}><Md text={projectInfo.description} /></div>}
              {projectInfo.repository && <div><strong>Repo:</strong> <a href={projectInfo.repository} target="_blank" rel="noopener noreferrer">{projectInfo.repository}</a></div>}
              {projectInfo.license && <div><strong>License:</strong> {projectInfo.license}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Executive Summary */}
      {d.executiveSummary && (
        <CollapsibleSection title="Executive Summary" sectionId="po-exec">
          {editMode ? (
            <textarea rows={5} value={d.executiveSummary || ''} style={{ width: '100%' }} onChange={(e) => handleFieldChange('executiveSummary', e.target.value)} />
          ) : (
            <Md text={d.executiveSummary} />
          )}
        </CollapsibleSection>
      )}

      {/* Project Goals */}
      {projectGoals.length > 0 && (
        <CollapsibleSection title="Project Goals" count={projectGoals.length} sectionId="po-goals">
          <ul>{projectGoals.map((g: any, i: number) => <li key={i}>{typeof g === 'string' ? g : g.goal || g.description || `Goal ${i + 1}`}</li>)}</ul>
        </CollapsibleSection>
      )}

      {/* Scope */}
      {(scope.inScope?.length > 0 || scope.outOfScope?.length > 0) && (
        <CollapsibleSection title="Scope" sectionId="po-scope">
          {scope.inScope?.length > 0 && (
            <>
              <h4>In Scope</h4>
              <ul>{scope.inScope.map((s: any, i: number) => <li key={i}>{typeof s === 'string' ? s : s.item || s.description || ''}</li>)}</ul>
            </>
          )}
          {scope.outOfScope?.length > 0 && (
            <>
              <h4>Out of Scope</h4>
              <ul>{scope.outOfScope.map((s: any, i: number) => <li key={i}>{typeof s === 'string' ? s : s.item || s.description || ''}</li>)}</ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Timeline */}
      {(timeline.startDate || timeline.phases?.length > 0) && (
        <CollapsibleSection title="Timeline" sectionId="po-timeline">
          {(timeline.startDate || timeline.targetLaunchDate) && (
            <div style={{ marginBottom: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {timeline.startDate && <span><strong>Start:</strong> {timeline.startDate}</span>}
              {timeline.targetLaunchDate && <span><strong>Target Launch:</strong> {timeline.targetLaunchDate}</span>}
            </div>
          )}
          {timeline.phases?.length > 0 && timeline.phases.map((p: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong style={{ flex: 1 }}>{p.phase || `Phase ${i + 1}`}</strong>
                {p.status && <span className={`status-badge status-${p.status}`}>{p.status}</span>}
              </div>
              {(p.startDate || p.endDate) && (
                <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                  {p.startDate && <span>{p.startDate}</span>}
                  {p.endDate && <span> — {p.endDate}</span>}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Team */}
      {(team.size || team.roles?.length > 0) && (
        <CollapsibleSection title="Team" count={team.roles?.length} sectionId="po-team">
          {team.size && <div style={{ marginBottom: '4px' }}><strong>Team Size:</strong> {team.size}</div>}
          {team.roles?.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong>{r.role}</strong>
                {r.name && <span style={{ opacity: 0.85 }}> — {r.name}</span>}
              </div>
              {r.responsibilities && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{r.responsibilities}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Stakeholders */}
      {stakeholders.length > 0 && (
        <CollapsibleSection title="Stakeholders" count={stakeholders.length} sectionId="po-stakeholders">
          {stakeholders.map((s: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
              <strong>{s.name || `Stakeholder ${i + 1}`}</strong>
              {s.interest && <div style={{ opacity: 0.85 }}>{s.interest}</div>}
              {s.communicationFrequency && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{s.communicationFrequency}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Success Criteria */}
      {successCriteria.length > 0 && (
        <CollapsibleSection title="Success Criteria" count={successCriteria.length} sectionId="po-success">
          {successCriteria.map((c: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px' }}>
              <strong>{typeof c === 'string' ? c : c.criterion || `Criterion ${i + 1}`}</strong>
              {c.metric && <div style={{ fontSize: '0.85em' }}><strong>Metric:</strong> {c.metric}</div>}
              {c.target && <div style={{ fontSize: '0.85em', opacity: 0.7 }}><strong>Target:</strong> {c.target}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Risks */}
      {projectRisks.length > 0 && (
        <CollapsibleSection title="Risks" count={projectRisks.length} sectionId="po-risks">
          {projectRisks.map((r: any, i: number) => (
            <div key={i} style={{ padding: '6px 8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <strong>{r.risk || r.title || `Risk ${i + 1}`}</strong>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '2px' }}>
                {(r.likelihood || r.probability) && <span><strong>P:</strong> {r.likelihood || r.probability}</span>}
                {r.impact && <span><strong>I:</strong> {r.impact}</span>}
              </div>
              {r.mitigation && <div style={{ marginTop: '2px' }}><strong>Mitigation:</strong> {r.mitigation}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Classification */}
      {(projectClassification.repositoryType || projectClassification.maturityLevel) && (
        <CollapsibleSection title="Classification" sectionId="po-class">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {projectClassification.repositoryType && <span className="tag">{projectClassification.repositoryType}</span>}
            {projectClassification.maturityLevel && <span className="tag">{projectClassification.maturityLevel}</span>}
            {projectClassification.complexity && <span className="tag">{projectClassification.complexity}</span>}
            {projectClassification.architecturePattern && <span className="tag">{projectClassification.architecturePattern}</span>}
          </div>
          {projectClassification.primaryLanguages?.length > 0 && <div style={{ marginTop: '4px' }}><strong>Primary:</strong> {projectClassification.primaryLanguages.join(', ')}</div>}
          {projectClassification.secondaryLanguages?.length > 0 && <div><strong>Secondary:</strong> {projectClassification.secondaryLanguages.join(', ')}</div>}
          {projectClassification.projectTypes?.length > 0 && <div><strong>Types:</strong> {projectClassification.projectTypes.join(', ')}</div>}
        </CollapsibleSection>
      )}

      {/* Multi-Part Structure */}
      {multiPartStructure.length > 0 && (
        <CollapsibleSection title="Multi-Part Structure" count={multiPartStructure.length} sectionId="po-parts">
          {multiPartStructure.map((p: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{p.name || p.partId || `Part ${i + 1}`}</strong>
              {p.path && <code style={{ marginLeft: '4px' }}>{p.path}</code>}
              {p.techStack && <span className="tag" style={{ marginLeft: '4px' }}>{p.techStack}</span>}
              {p.description && <div style={{ opacity: 0.85 }}>{p.description}</div>}
              {p.entryPoints?.length > 0 && <div style={{ fontSize: '0.85em' }}>Entry: {p.entryPoints.join(', ')}</div>}
              {p.dependencies?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Dependencies: {p.dependencies.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Tech Stack Summary */}
      {techStackSummary.overview && (
        <CollapsibleSection title="Tech Stack" sectionId="po-tech">
          <div style={{ marginBottom: '4px' }}><Md text={techStackSummary.overview} /></div>
          {['frontend', 'backend', 'database', 'infrastructure', 'testing'].map(cat => {
            const items: any[] = techStackSummary[cat] || [];
            return items.length > 0 ? (
              <div key={cat} style={{ marginBottom: '4px' }}>
                <h4 style={{ textTransform: 'capitalize' }}>{cat}</h4>
                {items.map((t: any, i: number) => (
                  <div key={i} style={{ padding: '1px 8px' }}>
                    <strong>{t.technology || t.tool}</strong>
                    {t.version && <code style={{ marginLeft: '4px' }}>{t.version}</code>}
                    {t.purpose && <span style={{ opacity: 0.7 }}> — {t.purpose}</span>}
                  </div>
                ))}
              </div>
            ) : null;
          })}
          {techStackSummary.devTools?.length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <h4>Dev Tools</h4>
              {techStackSummary.devTools.map((t: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <strong>{typeof t === 'string' ? t : t.technology || t.tool || t.name}</strong>
                  {t.version && <code style={{ marginLeft: '4px' }}>{t.version}</code>}
                  {t.purpose && <span style={{ opacity: 0.7 }}> — {t.purpose}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Key Features */}
      {keyFeatures.length > 0 && (
        <CollapsibleSection title="Key Features" count={keyFeatures.length} sectionId="po-features">
          {keyFeatures.map((f: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{f.feature || `Feature ${i + 1}`}</strong>
              {f.status && <span className="tag" style={{ marginLeft: '4px', backgroundColor: f.status === 'implemented' ? 'var(--vscode-testing-iconPassed)' : undefined }}>{f.status}</span>}
              {f.location && <code style={{ marginLeft: '4px', fontSize: '0.85em' }}>{f.location}</code>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Architecture Highlights */}
      {architectureHighlights.length > 0 && (
        <CollapsibleSection title="Architecture Highlights" count={architectureHighlights.length} sectionId="po-arch">
          {architectureHighlights.map((h: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{h.highlight || `Highlight ${i + 1}`}</strong>
              {h.category && <span className="tag" style={{ marginLeft: '4px' }}>{h.category}</span>}
              {h.details && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{h.details}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Codebase Analysis */}
      {(codebaseAnalysis.totalFiles || codebaseAnalysis.languageBreakdown?.length > 0) && (
        <CollapsibleSection title="Codebase Analysis" sectionId="po-codebase">
          {codebaseAnalysis.totalFiles != null && <div><strong>Files:</strong> {codebaseAnalysis.totalFiles} {codebaseAnalysis.totalLines && <span>| <strong>Lines:</strong> {codebaseAnalysis.totalLines.toLocaleString()}</span>}</div>}
          {codebaseAnalysis.languageBreakdown?.length > 0 && (
            <table style={{ width: '100%', fontSize: '0.85em', marginTop: '4px' }}>
              <thead><tr><th>Language</th><th>Files</th><th>%</th></tr></thead>
              <tbody>
                {codebaseAnalysis.languageBreakdown.map((l: any, i: number) => (
                  <tr key={i}><td>{l.language}</td><td>{l.files}</td><td>{l.percentage}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {codebaseAnalysis.codeQuality && (
            <div style={{ marginTop: '4px' }}>
              {codebaseAnalysis.codeQuality.testCoverage && <div><strong>Test Coverage:</strong> {codebaseAnalysis.codeQuality.testCoverage}</div>}
              {codebaseAnalysis.codeQuality.documentationLevel && <div><strong>Docs:</strong> {codebaseAnalysis.codeQuality.documentationLevel}</div>}
              {codebaseAnalysis.codeQuality.technicalDebt && <div><strong>Tech Debt:</strong> {codebaseAnalysis.codeQuality.technicalDebt}</div>}
              {codebaseAnalysis.codeQuality.lintingStatus && <div><strong>Linting:</strong> {codebaseAnalysis.codeQuality.lintingStatus}</div>}
            </div>
          )}
          {codebaseAnalysis.patterns && (
            <div style={{ marginTop: '4px' }}>
              <strong>Patterns:</strong>
              {Array.isArray(codebaseAnalysis.patterns) ? (
                <ul>{codebaseAnalysis.patterns.map((p: any, i: number) => <li key={i}>{typeof p === 'string' ? p : p.pattern || p.name || JSON.stringify(p)}</li>)}</ul>
              ) : (
                <div><Md text={typeof codebaseAnalysis.patterns === 'string' ? codebaseAnalysis.patterns : JSON.stringify(codebaseAnalysis.patterns)} /></div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Development */}
      {(development.prerequisites?.length > 0 || development.gettingStarted?.length > 0 || development.keyCommands?.length > 0) && (
        <CollapsibleSection title="Development" sectionId="po-dev">
          {development.prerequisites?.length > 0 && (
            <>
              <h4>Prerequisites</h4>
              {development.prerequisites.map((p: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <strong>{p.prerequisite || `Prereq ${i + 1}`}</strong>
                  {p.version && <code style={{ marginLeft: '4px' }}>{p.version}</code>}
                  {p.installation && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Install: <code>{p.installation}</code></div>}
                </div>
              ))}
            </>
          )}
          {development.gettingStarted?.length > 0 && (
            <>
              <h4>Getting Started</h4>
              <ol>
                {development.gettingStarted.map((s: any, i: number) => (
                  <li key={i}>
                    {s.description}
                    {s.command && <code style={{ display: 'block', margin: '2px 0' }}>{s.command}</code>}
                    {s.notes && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{s.notes}</div>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {development.keyCommands?.length > 0 && (
            <>
              <h4>Key Commands</h4>
              {development.keyCommands.map((c: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{c.command}</code> — {c.description}
                  {c.usage && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{c.usage}</div>}
                </div>
              ))}
            </>
          )}
          {development.environmentVariables?.length > 0 && (
            <>
              <h4>Environment Variables</h4>
              {development.environmentVariables.map((ev: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{typeof ev === 'string' ? ev : ev.name || ev.variable}</code>
                  {ev.description && <span style={{ opacity: 0.7 }}> — {ev.description}</span>}
                  {ev.required != null && <span className="tag" style={{ marginLeft: '4px' }}>{ev.required ? 'required' : 'optional'}</span>}
                </div>
              ))}
            </>
          )}
          {development.configurationFiles?.length > 0 && (
            <>
              <h4>Configuration Files</h4>
              {development.configurationFiles.map((cf: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{typeof cf === 'string' ? cf : cf.path || cf.file}</code>
                  {cf.purpose && <span style={{ opacity: 0.7 }}> — {cf.purpose}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Repository Structure */}
      {repositoryStructure.length > 0 && (
        <CollapsibleSection title="Repository Structure" count={repositoryStructure.length} sectionId="po-repo">
          {repositoryStructure.map((r: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <code>{r.path}</code>
              {r.importance && <span className="tag" style={{ marginLeft: '4px' }}>{r.importance}</span>}
              {r.purpose && <span style={{ opacity: 0.7 }}> — {r.purpose}</span>}
              {r.contents && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{r.contents}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Entry Points */}
      {entryPoints.length > 0 && (
        <CollapsibleSection title="Entry Points" count={entryPoints.length} sectionId="po-entry">
          {entryPoints.map((e: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <code>{e.path}</code>
              {e.type && <span className="tag" style={{ marginLeft: '4px' }}>{e.type}</span>}
              {e.description && <span style={{ opacity: 0.7 }}> — {e.description}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Data Flows */}
      {dataFlows.length > 0 && (
        <CollapsibleSection title="Data Flows" count={dataFlows.length} sectionId="po-flows">
          {dataFlows.map((f: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{f.name || `Flow ${i + 1}`}</strong>
              {f.description && <div style={{ opacity: 0.85 }}>{f.description}</div>}
              {f.components?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{f.components.join(' → ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Integrations */}
      {integrations.length > 0 && (
        <CollapsibleSection title="Integrations" count={integrations.length} sectionId="po-integrations">
          {integrations.map((int: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{int.name || `Integration ${i + 1}`}</strong>
              {int.type && <span className="tag" style={{ marginLeft: '4px' }}>{int.type}</span>}
              {int.status && <span className="tag" style={{ marginLeft: '4px' }}>{int.status}</span>}
              {int.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{int.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Known Issues */}
      {knownIssues.length > 0 && (
        <CollapsibleSection title="Known Issues" count={knownIssues.length} sectionId="po-issues">
          {knownIssues.map((iss: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{iss.issue || `Issue ${i + 1}`}</strong>
              {iss.severity && <span className="tag" style={{ marginLeft: '4px', backgroundColor: iss.severity === 'critical' ? 'var(--vscode-errorForeground)' : iss.severity === 'high' ? 'var(--vscode-editorWarning-foreground)' : undefined }}>{iss.severity}</span>}
              {iss.location && <code style={{ marginLeft: '4px', fontSize: '0.85em' }}>{iss.location}</code>}
              {iss.workaround && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Workaround: {iss.workaround}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <CollapsibleSection title="Recommendations" count={recommendations.length} sectionId="po-recs">
          {recommendations.map((r: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{r.recommendation || `Rec ${i + 1}`}</strong>
              {r.priority && <span className="tag" style={{ marginLeft: '4px' }}>{r.priority}</span>}
              {r.effort && <span className="tag" style={{ marginLeft: '4px' }}>Effort: {r.effort}</span>}
              {r.impact && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{r.impact}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Documentation Map */}
      {documentationMap.length > 0 && (
        <CollapsibleSection title="Documentation" count={documentationMap.length} sectionId="po-docs">
          {documentationMap.map((doc: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{doc.title || `Doc ${i + 1}`}</strong>
              {doc.status && <span className="tag" style={{ marginLeft: '4px' }}>{doc.status}</span>}
              {doc.path && <code style={{ marginLeft: '4px', fontSize: '0.85em' }}>{doc.path}</code>}
              {doc.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{doc.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Additional Notes */}
      {additionalNotes.length > 0 && (
        <CollapsibleSection title="Additional Notes" count={additionalNotes.length} sectionId="po-notes">
          <ul>{additionalNotes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// PROJECT CONTEXT DETAILS
// ==========================================================================

export function renderProjectContextDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray } = props;
  const d: any = editedData;

  // --- Normalization: map sample data shapes to renderer shapes ---
  // Sample has flat projectName/description; renderer expects projectInfo.{name, description}
  if (!d.projectInfo && (d.projectName || d.description)) {
    d.projectInfo = { name: d.projectName || '', description: d.description || '' };
  }

  // Sample has flat 'description'; renderer expects overview.{summary}
  if (!d.overview && d.description) {
    d.overview = { summary: d.description };
  }

  // Sample has techStack.{frontend, backend, ai, infrastructure} as objects with named properties
  // Renderer expects techStack.{overview, languages[], frameworks[], libraries[], tools[], infrastructure[]}
  if (d.techStack && !d.techStack.overview && !d.techStack.languages) {
    const ts = d.techStack;
    const allItems: any[] = [];
    const categories: Record<string, string> = {};
    for (const [sectionName, sectionObj] of Object.entries(ts)) {
      if (sectionObj && typeof sectionObj === 'object' && !Array.isArray(sectionObj)) {
        for (const [propName, propValue] of Object.entries(sectionObj as Record<string, string>)) {
          allItems.push({ name: propName, purpose: String(propValue), category: sectionName });
          categories[sectionName] = sectionName;
        }
      }
    }
    const overview = Object.keys(categories).length > 0
      ? `Tech stack spans ${Object.keys(categories).join(', ')}`
      : '';
    // Group all items under 'tools' since they don't naturally split into the expected categories
    d.techStack = { overview, tools: allItems };
  }

  // Sample has conventions.{codeStyle, gitConventions, testingConventions}
  // Renderer expects patterns.{codePatterns[], namingConventions[]}
  if (!d.patterns && d.conventions) {
    const conv = d.conventions;
    const codePatterns: any[] = [];
    const namingConventions: any[] = [];
    if (conv.codeStyle) {
      const cs = conv.codeStyle;
      if (cs.language) codePatterns.push({ name: 'Language', description: cs.language });
      if (cs.formatter) codePatterns.push({ name: 'Formatter', description: cs.formatter });
      if (cs.linter) codePatterns.push({ name: 'Linter', description: cs.linter });
      if (cs.namingConventions && typeof cs.namingConventions === 'object') {
        for (const [type, convention] of Object.entries(cs.namingConventions)) {
          namingConventions.push({ type, convention: String(convention) });
        }
      }
    }
    if (conv.gitConventions) {
      const gc = conv.gitConventions;
      if (gc.branchNaming) codePatterns.push({ name: 'Branch Naming', description: gc.branchNaming });
      if (gc.commitFormat) codePatterns.push({ name: 'Commit Format', description: gc.commitFormat });
      if (gc.prProcess) codePatterns.push({ name: 'PR Process', description: gc.prProcess });
    }
    if (conv.testingConventions) {
      const tc = conv.testingConventions;
      for (const [key, val] of Object.entries(tc)) {
        codePatterns.push({ name: key, description: String(val) });
      }
    }
    d.patterns = { codePatterns, namingConventions };
  }

  // Sample has aiGuidelines.{codeGeneration[], securityGuidelines[], performanceGuidelines[]}
  // Renderer expects implementationRules[], securityConsiderations[], performanceConsiderations[]
  if (!d.implementationRules && d.aiGuidelines?.codeGeneration) {
    d.implementationRules = d.aiGuidelines.codeGeneration.map((r: any) =>
      typeof r === 'string' ? { rule: r, category: 'code-style', severity: 'must' } : r
    );
  }
  if (!d.securityConsiderations && d.aiGuidelines?.securityGuidelines) {
    d.securityConsiderations = d.aiGuidelines.securityGuidelines.map((s: any) =>
      typeof s === 'string' ? { consideration: s } : s
    );
  }
  if (!d.performanceConsiderations && d.aiGuidelines?.performanceGuidelines) {
    d.performanceConsiderations = d.aiGuidelines.performanceGuidelines.map((p: any) =>
      typeof p === 'string' ? { consideration: p } : p
    );
  }

  // Sample has environmentSetup.{prerequisites[], quickStart, envVariables[]}
  // Renderer expects developmentWorkflow.{setup[], commands[], testing, linting}
  if (!d.developmentWorkflow && d.environmentSetup) {
    const env = d.environmentSetup;
    const commands: any[] = [];
    if (env.quickStart) commands.push({ command: env.quickStart, description: 'Quick start' });
    d.developmentWorkflow = {
      setup: env.prerequisites || [],
      commands,
    };
  }

  // Sample has keyDecisions[{decision, date, rationale, status}]
  // Renderer has no direct section — map to additionalNotes or knownIssues
  // Use a new section: we'll add keyDecisions display after the standard sections
  // For now, store them so we can render them
  const keyDecisions: any[] = d.keyDecisions || [];

  const projectInfo = d.projectInfo || {};
  const overview = d.overview || {};
  const techStack = d.techStack || {};
  const implementationRules: any[] = d.implementationRules || [];
  const patterns = d.patterns || {};
  const forbiddenPatterns: any[] = d.forbiddenPatterns || [];
  const keyFiles: any[] = d.keyFiles || [];
  const entryPoints: any[] = d.entryPoints || [];
  const devWorkflow = d.developmentWorkflow || {};
  const errorHandling = d.errorHandling || {};
  const stateManagement = d.stateManagement || {};
  const apiInteraction = d.apiInteraction || {};
  const securityConsiderations: any[] = d.securityConsiderations || [];
  const performanceConsiderations: any[] = d.performanceConsiderations || [];
  const knownIssues: any[] = d.knownIssues || [];
  const additionalNotes: string[] = d.additionalNotes || [];

  const ruleCategories = ['code-style', 'architecture', 'testing', 'security', 'performance', 'documentation', 'naming', 'error-handling', 'state-management', 'api'];
  const ruleSeverities = ['must', 'should', 'may'];

  return (
    <>
      {/* Project Info */}
      {(projectInfo.name || projectInfo.description) && (
        <CollapsibleSection title="Project Info" sectionId="pc-info">
          {editMode ? (
            <div className="edit-grid">
              <label>Name</label>
              <input value={projectInfo.name || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, name: e.target.value })} />
              <label>Description</label>
              <textarea rows={3} value={projectInfo.description || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, description: e.target.value })} />
              <label>Type</label>
              <input value={projectInfo.type || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, type: e.target.value })} />
              <label>Version</label>
              <input value={projectInfo.version || ''} onChange={(e) => handleFieldChange('projectInfo', { ...projectInfo, version: e.target.value })} />
            </div>
          ) : (
            <>
              {projectInfo.name && <div><strong>{projectInfo.name}</strong> {projectInfo.version && <span className="tag">{projectInfo.version}</span>}</div>}
              {projectInfo.type && <div><strong>Type:</strong> {projectInfo.type}</div>}
              {projectInfo.description && <div style={{ marginTop: '4px' }}><Md text={projectInfo.description} /></div>}
              {projectInfo.repository && <div><strong>Repo:</strong> <a href={projectInfo.repository} target="_blank" rel="noopener noreferrer">{projectInfo.repository}</a></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Overview */}
      {(overview.summary || overview.architecture) && (
        <CollapsibleSection title="Project Overview" sectionId="pc-overview">
          {editMode ? (
            <div className="edit-grid">
              <label>Summary</label>
              <textarea rows={3} value={overview.summary || ''} onChange={(e) => handleFieldChange('overview', { ...overview, summary: e.target.value })} />
              <label>Architecture</label>
              <textarea rows={3} value={overview.architecture || ''} onChange={(e) => handleFieldChange('overview', { ...overview, architecture: e.target.value })} />
              <label>Current State</label>
              <input value={overview.currentState || ''} onChange={(e) => handleFieldChange('overview', { ...overview, currentState: e.target.value })} />
            </div>
          ) : (
            <>
              {overview.summary && <div><Md text={overview.summary} /></div>}
              {overview.architecture && <div style={{ marginTop: '4px' }}><strong>Architecture:</strong> <Md text={overview.architecture} /></div>}
              {overview.currentState && <div><strong>Current State:</strong> {overview.currentState}</div>}
              {overview.keyFeatures?.length > 0 && <div style={{ marginTop: '4px' }}><strong>Key Features:</strong><ul>{overview.keyFeatures.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Tech Stack */}
      {techStack.overview && (
        <CollapsibleSection title="Tech Stack" sectionId="pc-tech">
          <div style={{ marginBottom: '4px' }}><Md text={techStack.overview} /></div>
          {['languages', 'frameworks', 'libraries', 'tools', 'infrastructure'].map(cat => {
            const items: any[] = techStack[cat] || [];
            return items.length > 0 ? (
              <div key={cat} style={{ marginBottom: '4px' }}>
                <h4 style={{ textTransform: 'capitalize' }}>{cat}</h4>
                {items.map((t: any, i: number) => (
                  <div key={i} style={{ padding: '1px 8px' }}>
                    <strong>{t.name}</strong>
                    {t.version && <code style={{ marginLeft: '4px' }}>{t.version}</code>}
                    {t.category && <span className="tag" style={{ marginLeft: '4px' }}>{t.category}</span>}
                    {(t.purpose || t.usage) && <span style={{ opacity: 0.7 }}> — {t.purpose || t.usage}</span>}
                  </div>
                ))}
              </div>
            ) : null;
          })}
        </CollapsibleSection>
      )}

      {/* Implementation Rules */}
      {implementationRules.length > 0 && (
        <CollapsibleSection title="Implementation Rules" count={implementationRules.length} sectionId="pc-rules">
          {editMode ? (
            <>
              {implementationRules.map((r: any, i: number) => (
                <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                  <div className="edit-grid">
                    <label>Rule</label>
                    <textarea rows={2} value={r.rule || ''} onChange={(e) => updateArrayItem('implementationRules', i, { ...r, rule: e.target.value })} />
                    <label>Category</label>
                    <select value={r.category || ''} onChange={(e) => updateArrayItem('implementationRules', i, { ...r, category: e.target.value })}>
                      <option value="">Select...</option>
                      {ruleCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <label>Severity</label>
                    <select value={r.severity || ''} onChange={(e) => updateArrayItem('implementationRules', i, { ...r, severity: e.target.value })}>
                      <option value="">Select...</option>
                      {ruleSeverities.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <label>Rationale</label>
                    <textarea rows={2} value={r.rationale || ''} onChange={(e) => updateArrayItem('implementationRules', i, { ...r, rationale: e.target.value })} />
                  </div>
                  <button className="remove-btn" onClick={() => removeFromArray('implementationRules', i)}>Remove</button>
                </div>
              ))}
              <button className="add-btn" onClick={() => addToArray('implementationRules', { rule: '', category: '', severity: 'should', rationale: '' })}>+ Add Rule</button>
            </>
          ) : (
            implementationRules.map((r: any, i: number) => (
              <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: `2px solid ${r.severity === 'must' ? 'var(--vscode-errorForeground)' : r.severity === 'should' ? 'var(--vscode-editorWarning-foreground)' : 'var(--vscode-widget-border)'}` }}>
                {r.id && <span className="tag" style={{ marginRight: '4px' }}>{r.id}</span>}
                <strong>{r.rule || `Rule ${i + 1}`}</strong>
                {r.category && <span className="tag" style={{ marginLeft: '4px' }}>{r.category}</span>}
                {r.severity && <span className="tag" style={{ marginLeft: '4px' }}>{r.severity}</span>}
                {r.rationale && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{r.rationale}</div>}
                {r.enforcedBy && <div style={{ fontSize: '0.85em', opacity: 0.6 }}>Enforced by: {r.enforcedBy}</div>}
                {r.examples?.good?.length > 0 && <div style={{ fontSize: '0.85em', color: 'var(--vscode-testing-iconPassed)' }}>Good: {r.examples.good.join('; ')}</div>}
                {r.examples?.bad?.length > 0 && <div style={{ fontSize: '0.85em', color: 'var(--vscode-errorForeground)' }}>Bad: {r.examples.bad.join('; ')}</div>}
              </div>
            ))
          )}
        </CollapsibleSection>
      )}

      {/* Code Patterns */}
      {patterns.codePatterns?.length > 0 && (
        <CollapsibleSection title="Code Patterns" count={patterns.codePatterns.length} sectionId="pc-patterns">
          {patterns.overview && <div style={{ marginBottom: '4px' }}><Md text={patterns.overview} /></div>}
          {patterns.codePatterns.map((p: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{p.name || `Pattern ${i + 1}`}</strong>
              {p.description && <div style={{ opacity: 0.85 }}>{p.description}</div>}
              {p.usage && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>When: {p.usage}</div>}
              {p.location && <div style={{ fontSize: '0.85em' }}>Location: <code>{p.location}</code></div>}
              {p.example && <pre style={{ fontSize: '0.85em', margin: '2px 0' }}>{p.example}</pre>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Naming Conventions */}
      {patterns.namingConventions?.length > 0 && (
        <CollapsibleSection title="Naming Conventions" count={patterns.namingConventions.length} sectionId="pc-naming">
          {patterns.namingConventions.map((n: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{n.type || `Convention ${i + 1}`}</strong>
              {n.convention && <span style={{ opacity: 0.85 }}> — {n.convention}</span>}
              {n.pattern && <code style={{ marginLeft: '4px' }}>{n.pattern}</code>}
              {n.example && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>e.g. {n.example}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Forbidden Patterns */}
      {forbiddenPatterns.length > 0 && (
        <CollapsibleSection title="Forbidden Patterns" count={forbiddenPatterns.length} sectionId="pc-forbidden">
          {forbiddenPatterns.map((fp: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-errorForeground)' }}>
              <strong>{fp.pattern || `Forbidden ${i + 1}`}</strong>
              {fp.severity && <span className="tag" style={{ marginLeft: '4px', backgroundColor: fp.severity === 'error' ? 'var(--vscode-errorForeground)' : undefined }}>{fp.severity}</span>}
              {fp.reason && <div style={{ opacity: 0.85 }}>{fp.reason}</div>}
              {fp.alternative && <div style={{ fontSize: '0.85em', color: 'var(--vscode-testing-iconPassed)' }}>Instead: {fp.alternative}</div>}
              {fp.detection && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Detection: {fp.detection}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Key Files */}
      {keyFiles.length > 0 && (
        <CollapsibleSection title="Key Files" count={keyFiles.length} sectionId="pc-files">
          {keyFiles.map((f: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <code>{f.path}</code>
              {f.importance && <span className="tag" style={{ marginLeft: '4px' }}>{f.importance}</span>}
              {f.purpose && <span style={{ opacity: 0.7 }}> — {f.purpose}</span>}
              {f.notes && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{f.notes}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Entry Points */}
      {entryPoints.length > 0 && (
        <CollapsibleSection title="Entry Points" count={entryPoints.length} sectionId="pc-entry">
          {entryPoints.map((e: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <code>{e.path}</code>
              {e.type && <span className="tag" style={{ marginLeft: '4px' }}>{e.type}</span>}
              {e.description && <span style={{ opacity: 0.7 }}> — {e.description}</span>}
              {e.exports?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Exports: {e.exports.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Development Workflow */}
      {(devWorkflow.commands?.length > 0 || devWorkflow.testing || devWorkflow.linting) && (
        <CollapsibleSection title="Development Workflow" sectionId="pc-workflow">
          {devWorkflow.setup?.length > 0 && (
            <><h4>Setup</h4><ol>{devWorkflow.setup.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol></>
          )}
          {devWorkflow.commands?.length > 0 && (
            <>
              <h4>Commands</h4>
              {devWorkflow.commands.map((c: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{c.command}</code> — {c.description}
                </div>
              ))}
            </>
          )}
          {devWorkflow.testing && (
            <div style={{ marginTop: '4px' }}>
              <h4>Testing</h4>
              {devWorkflow.testing.framework && <div>Framework: {devWorkflow.testing.framework}</div>}
              {devWorkflow.testing.command && <div>Command: <code>{devWorkflow.testing.command}</code></div>}
            </div>
          )}
          {devWorkflow.linting && (
            <div style={{ marginTop: '4px' }}>
              <h4>Linting</h4>
              {devWorkflow.linting.tools?.length > 0 && <div>Tools: {devWorkflow.linting.tools.join(', ')}</div>}
              {devWorkflow.linting.command && <div>Command: <code>{devWorkflow.linting.command}</code></div>}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Error Handling */}
      {(errorHandling.strategy || errorHandling.patterns?.length > 0) && (
        <CollapsibleSection title="Error Handling" sectionId="pc-errors">
          {errorHandling.strategy && <div><Md text={errorHandling.strategy} /></div>}
          {errorHandling.patterns?.map((p: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{p.type || `Pattern ${i + 1}`}</strong>
              {p.handling && <div style={{ opacity: 0.85 }}>{p.handling}</div>}
              {p.recovery && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Recovery: {p.recovery}</div>}
              {p.example && <pre style={{ fontSize: '0.85em', margin: '2px 0' }}>{p.example}</pre>}
            </div>
          ))}
          {errorHandling.logging && (
            <div style={{ marginTop: '4px' }}>
              <strong>Logging:</strong> {errorHandling.logging.approach}
              {errorHandling.logging.levels?.length > 0 && <span style={{ opacity: 0.7 }}> ({errorHandling.logging.levels.join(', ')})</span>}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* State Management */}
      {stateManagement.overview && (
        <CollapsibleSection title="State Management" sectionId="pc-state">
          <div><Md text={stateManagement.overview} /></div>
          {stateManagement.globalState && (
            <div style={{ marginTop: '4px' }}>
              <h4>Global State</h4>
              {stateManagement.globalState.approach && <div>{stateManagement.globalState.approach}</div>}
              {stateManagement.globalState.location && <div style={{ opacity: 0.7 }}>Location: <code>{stateManagement.globalState.location}</code></div>}
              {stateManagement.globalState.patterns?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Patterns: {stateManagement.globalState.patterns.join(', ')}</div>}
            </div>
          )}
          {stateManagement.localState && (
            <div style={{ marginTop: '4px' }}>
              <h4>Local State</h4>
              {stateManagement.localState.approach && <div>{stateManagement.localState.approach}</div>}
              {stateManagement.localState.patterns?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Patterns: {stateManagement.localState.patterns.join(', ')}</div>}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* API Interaction */}
      {apiInteraction.approach && (
        <CollapsibleSection title="API Interaction" sectionId="pc-api">
          <div><Md text={apiInteraction.approach} /></div>
          {apiInteraction.baseUrl && <div><strong>Base URL:</strong> <code>{apiInteraction.baseUrl}</code></div>}
          {apiInteraction.client && <div><strong>Client:</strong> {apiInteraction.client}</div>}
          {apiInteraction.errorHandling && <div><strong>Error Handling:</strong> {apiInteraction.errorHandling}</div>}
          {apiInteraction.patterns?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              {apiInteraction.patterns.map((p: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}><strong>{p.pattern}:</strong> {p.usage}</div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Security Considerations */}
      {securityConsiderations.length > 0 && (
        <CollapsibleSection title="Security Considerations" count={securityConsiderations.length} sectionId="pc-security">
          {securityConsiderations.map((s: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{s.consideration || `Item ${i + 1}`}</strong>
              {s.category && <span className="tag" style={{ marginLeft: '4px' }}>{s.category}</span>}
              {s.implementation && <div style={{ opacity: 0.85, fontSize: '0.85em' }}>{s.implementation}</div>}
              {s.validation && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>Validation: {s.validation}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Performance Considerations */}
      {performanceConsiderations.length > 0 && (
        <CollapsibleSection title="Performance Considerations" count={performanceConsiderations.length} sectionId="pc-perf">
          {performanceConsiderations.map((p: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{p.consideration || `Item ${i + 1}`}</strong>
              {p.target && <span className="tag" style={{ marginLeft: '4px' }}>{p.target}</span>}
              {p.implementation && <div style={{ opacity: 0.85, fontSize: '0.85em' }}>{p.implementation}</div>}
              {p.measurement && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>Measurement: {p.measurement}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Known Issues */}
      {knownIssues.length > 0 && (
        <CollapsibleSection title="Known Issues" count={knownIssues.length} sectionId="pc-issues">
          {knownIssues.map((iss: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{iss.issue || `Issue ${i + 1}`}</strong>
              {iss.status && <span className="tag" style={{ marginLeft: '4px' }}>{iss.status}</span>}
              {iss.severity && <span className="tag" style={{ marginLeft: '4px' }}>{iss.severity}</span>}
              {iss.impact && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Impact: {iss.impact}</div>}
              {iss.workaround && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Workaround: {iss.workaround}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Key Decisions */}
      {keyDecisions.length > 0 && (
        <CollapsibleSection title="Key Decisions" count={keyDecisions.length} sectionId="pc-decisions">
          {keyDecisions.map((kd: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{kd.decision || `Decision ${i + 1}`}</strong>
              {kd.status && <span className="tag" style={{ marginLeft: '6px' }}>{kd.status}</span>}
              {kd.date && <span style={{ opacity: 0.6, fontSize: '0.85em', marginLeft: '6px' }}>{kd.date}</span>}
              {kd.rationale && <div style={{ opacity: 0.85, fontSize: '0.9em', marginTop: '2px' }}>{kd.rationale}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Additional Notes */}
      {additionalNotes.length > 0 && (
        <CollapsibleSection title="Additional Notes" count={additionalNotes.length} sectionId="pc-notes">
          <ul>{additionalNotes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// SOURCE TREE DETAILS
// ==========================================================================

export function renderSourceTreeDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;

  // --- Normalization: map sample data shapes to renderer shapes ---
  // Sample has flat projectName, repositoryType, packageManager, rootStructure.{description, entries[]}
  // Renderer expects overview.{projectName, summary, rootPath, primaryLanguage, totalFiles, ...}
  if (!d.overview && (d.projectName || d.rootStructure)) {
    const rs = d.rootStructure || {};
    d.overview = {
      projectName: d.projectName || '',
      summary: rs.description || '',
    };
    if (d.repositoryType) d.overview.primaryLanguage = d.repositoryType;
  }

  // Sample has rootStructure.entries[{path, type, description}]
  // Renderer expects directoryStructure[{name/path, type, purpose, depth, fileCount}]
  if (!d.directoryStructure && d.rootStructure?.entries) {
    d.directoryStructure = d.rootStructure.entries.map((e: any) => ({
      name: e.path || '',
      path: e.path || '',
      type: e.type || 'file',
      purpose: e.description || '',
      depth: 0,
    }));
  }

  // Sample has packages[{name, description, structure[{path, description}]}]
  // Renderer expects multiPartStructure[{name, path, files, description}]
  if (!d.multiPartStructure && d.packages) {
    d.multiPartStructure = (d.packages || []).map((pkg: any) => ({
      name: pkg.name || '',
      path: pkg.name || '',
      description: pkg.description || '',
      files: pkg.structure?.length || 0,
      // Also store child entries for inline display
      _childEntries: pkg.structure || [],
    }));
  }

  // Sample keyFiles[].description → renderer expects keyFiles[].purpose
  if (d.keyFiles) {
    d.keyFiles = d.keyFiles.map((f: any) => {
      if (f.description && !f.purpose) return { ...f, purpose: f.description };
      return f;
    });
  }

  // Sample has packageManager — store for display
  const packageManager: string = d.packageManager || '';

  const overview = d.overview || {};
  const statistics = d.statistics || {};
  const multiPartStructure: any[] = d.multiPartStructure || [];
  const directoryStructure: any[] = d.directoryStructure || [];
  const criticalDirectories: any[] = d.criticalDirectories || [];
  const entryPoints: any[] = d.entryPoints || [];
  const fileOrgPatterns: any[] = d.fileOrganizationPatterns || [];
  const namingConventions: any[] = d.namingConventions || [];
  const keyFileTypes: any[] = d.keyFileTypes || [];
  const assetLocations: any[] = d.assetLocations || [];
  const configFiles: any[] = d.configurationFiles || [];
  const buildArtifacts = d.buildArtifacts || {};
  const testLocations: any[] = d.testLocations || [];
  const docLocations: any[] = d.documentationLocations || [];
  const moduleGraph = d.moduleGraph || {};
  const devNotes: any[] = d.developmentNotes || [];
  const recommendations: any[] = d.recommendations || [];
  const keyFiles: any[] = d.keyFiles || [];

  return (
    <>
      {/* Overview */}
      {(overview.projectName || overview.summary) && (
        <CollapsibleSection title="Source Tree Overview" sectionId="st-overview">
          {editMode ? (
            <div className="edit-grid">
              <label>Project Name</label>
              <input value={overview.projectName || ''} onChange={(e) => handleFieldChange('overview', { ...overview, projectName: e.target.value })} />
              <label>Root Path</label>
              <input value={overview.rootPath || ''} onChange={(e) => handleFieldChange('overview', { ...overview, rootPath: e.target.value })} />
              <label>Primary Language</label>
              <input value={overview.primaryLanguage || ''} onChange={(e) => handleFieldChange('overview', { ...overview, primaryLanguage: e.target.value })} />
              <label>Summary</label>
              <textarea rows={3} value={overview.summary || ''} onChange={(e) => handleFieldChange('overview', { ...overview, summary: e.target.value })} />
            </div>
          ) : (
            <>
              {overview.projectName && <div><strong>{overview.projectName}</strong></div>}
              {overview.rootPath && <div><code>{overview.rootPath}</code></div>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                {overview.primaryLanguage && <span className="tag">{overview.primaryLanguage}</span>}
                {packageManager && <span className="tag">{packageManager}</span>}
                {overview.totalFiles != null && <span className="tag">{overview.totalFiles} files</span>}
                {overview.totalDirectories != null && <span className="tag">{overview.totalDirectories} dirs</span>}
                {overview.totalSize && <span className="tag">{overview.totalSize}</span>}
              </div>
              {overview.analysisDate && <div style={{ fontSize: '0.85em', opacity: 0.6 }}>Analyzed: {overview.analysisDate}</div>}
              {overview.summary && <div style={{ marginTop: '4px' }}><Md text={overview.summary} /></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Statistics */}
      {(statistics.byLanguage?.length > 0 || statistics.byFileType?.length > 0 || statistics.totalFiles != null) && (
        <CollapsibleSection title="Statistics" sectionId="st-stats">
          {(statistics.totalFiles != null || statistics.totalLines != null) && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {statistics.totalFiles != null && <span className="tag">{statistics.totalFiles} files</span>}
              {statistics.totalLines != null && <span className="tag">{statistics.totalLines.toLocaleString()} lines</span>}
              {statistics.totalDirectories != null && <span className="tag">{statistics.totalDirectories} dirs</span>}
            </div>
          )}
          {statistics.byLanguage?.length > 0 && (
            <>
              <h4>By Language</h4>
              <table style={{ width: '100%', fontSize: '0.85em' }}>
                <thead><tr><th>Language</th><th>Files</th><th>Lines</th><th>%</th></tr></thead>
                <tbody>
                  {statistics.byLanguage.map((l: any, i: number) => (
                    <tr key={i}><td>{l.language}</td><td>{l.files}</td><td>{l.lines?.toLocaleString()}</td><td>{l.percentage}%</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {statistics.byFileType?.length > 0 && (
            <>
              <h4>By File Type</h4>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {statistics.byFileType.map((ft: any, i: number) => (
                  <span key={i} className="tag">{ft.extension}: {ft.count} ({ft.percentage}%)</span>
                ))}
              </div>
            </>
          )}
          {statistics.largestFiles?.length > 0 && (
            <>
              <h4>Largest Files</h4>
              {statistics.largestFiles.map((f: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{f.path}</code> — {f.size} {f.lines && <span>({f.lines} lines)</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Multi-Part Structure */}
      {multiPartStructure.length > 0 && (
        <CollapsibleSection title="Multi-Part Structure" count={multiPartStructure.length} sectionId="st-parts">
          {multiPartStructure.map((p: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '4px' }}>
              <strong>{p.name || p.partId || `Part ${i + 1}`}</strong>
              {p.path && p.path !== p.name && <code style={{ marginLeft: '4px' }}>{p.path}</code>}
              {p.files != null && <span className="tag" style={{ marginLeft: '4px' }}>{p.files} entries</span>}
              {p.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{p.description}</div>}
              {p.dependencies?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Dependencies: {p.dependencies.join(', ')}</div>}
              {p._childEntries?.length > 0 && (
                <div style={{ marginLeft: '16px', marginTop: '2px' }}>
                  {p._childEntries.map((ce: any, ci: number) => (
                    <div key={ci} style={{ padding: '1px 0', fontSize: '0.85em' }}>
                      <code>{ce.path}</code>
                      {ce.description && <span style={{ opacity: 0.7 }}> — {ce.description}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Key Files */}
      {keyFiles.length > 0 && (
        <CollapsibleSection title="Key Files" count={keyFiles.length} sectionId="st-keyfiles">
          {keyFiles.map((f: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <code>{f.path}</code>
              {f.importance && <span className="tag" style={{ marginLeft: '4px' }}>{f.importance}</span>}
              {(f.purpose || f.description) && <span style={{ opacity: 0.7 }}> — {f.purpose || f.description}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Directory Structure */}
      {directoryStructure.length > 0 && (
        <CollapsibleSection title="Directory Structure" count={directoryStructure.length} sectionId="st-dirs">
          {directoryStructure.map((dir: any, i: number) => (
            <div key={i} style={{ padding: '1px 8px', paddingLeft: `${(dir.depth || 0) * 16 + 8}px` }}>
              <span style={{ opacity: dir.type === 'directory' ? 1 : 0.7 }}>
                {dir.type === 'directory' ? '📁 ' : '📄 '}
              </span>
              <code>{dir.name || dir.path}</code>
              {dir.fileCount != null && <span className="tag" style={{ marginLeft: '4px' }}>{dir.fileCount}</span>}
              {dir.purpose && <span style={{ opacity: 0.7, fontSize: '0.85em' }}> — {dir.purpose}</span>}
              {dir.children?.length > 0 && (
                <div style={{ marginLeft: '16px', marginTop: '2px' }}>
                  {dir.children.map((child: any, ci: number) => (
                    <div key={ci} style={{ padding: '1px 0', fontSize: '0.85em' }}>
                      <span style={{ opacity: 0.7 }}>{child.type === 'directory' ? '📁 ' : '📄 '}</span>
                      <code>{child.name || child.path}</code>
                      {child.purpose && <span style={{ opacity: 0.7 }}> — {child.purpose}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Critical Directories */}
      {criticalDirectories.length > 0 && (
        <CollapsibleSection title="Critical Directories" count={criticalDirectories.length} sectionId="st-critical">
          {criticalDirectories.map((cd: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-errorForeground)' }}>
              <code><strong>{cd.path}</strong></code>
              {cd.purpose && <div style={{ opacity: 0.85 }}>{cd.purpose}</div>}
              {cd.contents && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{cd.contents}</div>}
              {cd.keyFiles?.length > 0 && (
                <div style={{ fontSize: '0.85em', marginTop: '2px' }}>
                  Key files: {cd.keyFiles.map((kf: any, ki: number) => (
                    <div key={ki} style={{ marginLeft: '8px' }}>
                      <code>{kf.file || kf}</code>
                      {kf.purpose && <span style={{ opacity: 0.7 }}> — {kf.purpose}</span>}
                    </div>
                  ))}
                </div>
              )}
              {cd.dependencies?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Deps: {cd.dependencies.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Entry Points */}
      {entryPoints.length > 0 && (
        <CollapsibleSection title="Entry Points" count={entryPoints.length} sectionId="st-entry">
          {entryPoints.map((e: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <code>{e.path}</code>
              {e.type && <span className="tag" style={{ marginLeft: '4px' }}>{e.type}</span>}
              {e.description && <span style={{ opacity: 0.7 }}> — {e.description}</span>}
              {e.exports?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Exports: {e.exports.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* File Organization Patterns */}
      {fileOrgPatterns.length > 0 && (
        <CollapsibleSection title="File Organization Patterns" count={fileOrgPatterns.length} sectionId="st-org">
          {fileOrgPatterns.map((p: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{p.pattern || `Pattern ${i + 1}`}</strong>
              {p.description && <div style={{ opacity: 0.85 }}>{p.description}</div>}
              {p.locations?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Locations: {p.locations.join(', ')}</div>}
              {p.rationale && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Why: {p.rationale}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Naming Conventions */}
      {namingConventions.length > 0 && (
        <CollapsibleSection title="Naming Conventions" count={namingConventions.length} sectionId="st-naming">
          {namingConventions.map((n: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{n.type || `Convention ${i + 1}`}</strong>
              {n.convention && <span style={{ opacity: 0.85 }}> — {n.convention}</span>}
              {n.pattern && <code style={{ marginLeft: '4px' }}>{n.pattern}</code>}
              {n.examples?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{n.examples.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Key File Types */}
      {keyFileTypes.length > 0 && (
        <CollapsibleSection title="Key File Types" count={keyFileTypes.length} sectionId="st-filetypes">
          {keyFileTypes.map((ft: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <code><strong>{ft.extension}</strong></code>
              {ft.count != null && <span className="tag" style={{ marginLeft: '4px' }}>{ft.count}</span>}
              {ft.purpose && <span style={{ opacity: 0.7 }}> — {ft.purpose}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Asset Locations */}
      {assetLocations.length > 0 && (
        <CollapsibleSection title="Asset Locations" count={assetLocations.length} sectionId="st-assets">
          {assetLocations.map((a: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{a.type || `Asset ${i + 1}`}</strong>
              {a.path && <code style={{ marginLeft: '4px' }}>{a.path}</code>}
              {a.count != null && <span className="tag" style={{ marginLeft: '4px' }}>{a.count}</span>}
              {a.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{a.description}</div>}
              {a.formats?.length > 0 && <div style={{ fontSize: '0.85em' }}>Formats: {a.formats.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Configuration Files */}
      {configFiles.length > 0 && (
        <CollapsibleSection title="Configuration Files" count={configFiles.length} sectionId="st-config">
          {configFiles.map((cf: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <code>{cf.path}</code>
              {cf.format && <span className="tag" style={{ marginLeft: '4px' }}>{cf.format}</span>}
              {cf.purpose && <span style={{ opacity: 0.7 }}> — {cf.purpose}</span>}
              {cf.keySettings?.length > 0 && (
                <div style={{ fontSize: '0.85em', opacity: 0.7, marginLeft: '8px' }}>
                  {cf.keySettings.map((ks: any, ki: number) => <div key={ki}>{ks.setting}: {ks.description}</div>)}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Build Artifacts */}
      {(buildArtifacts.outputDirectory || buildArtifacts.cacheDirectories?.length > 0) && (
        <CollapsibleSection title="Build Artifacts" sectionId="st-build">
          {buildArtifacts.outputDirectory && <div><strong>Output:</strong> <code>{buildArtifacts.outputDirectory}</code></div>}
          {buildArtifacts.intermediateDirectories?.length > 0 && <div><strong>Intermediate:</strong> {buildArtifacts.intermediateDirectories.map((d: string) => <code key={d} style={{ marginRight: '4px' }}>{d}</code>)}</div>}
          {buildArtifacts.cacheDirectories?.length > 0 && <div><strong>Cache:</strong> {buildArtifacts.cacheDirectories.map((d: string) => <code key={d} style={{ marginRight: '4px' }}>{d}</code>)}</div>}
          {buildArtifacts.gitIgnored?.length > 0 && <div><strong>Git-ignored:</strong> {buildArtifacts.gitIgnored.map((d: string) => <code key={d} style={{ marginRight: '4px' }}>{d}</code>)}</div>}
        </CollapsibleSection>
      )}

      {/* Test & Doc Locations */}
      {(testLocations.length > 0 || docLocations.length > 0) && (
        <CollapsibleSection title="Test & Doc Locations" count={testLocations.length + docLocations.length} sectionId="st-testdocs">
          {testLocations.length > 0 && (
            <>
              <h4>Tests</h4>
              {testLocations.map((t: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{t.path}</code>
                  {t.type && <span className="tag" style={{ marginLeft: '4px' }}>{t.type}</span>}
                  {t.pattern && <span style={{ opacity: 0.7 }}> — {t.pattern}</span>}
                  {t.count != null && <span className="tag" style={{ marginLeft: '4px' }}>{t.count}</span>}
                </div>
              ))}
            </>
          )}
          {docLocations.length > 0 && (
            <>
              <h4>Documentation</h4>
              {docLocations.map((doc: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <code>{doc.path}</code>
                  {doc.type && <span className="tag" style={{ marginLeft: '4px' }}>{doc.type}</span>}
                  {doc.description && <span style={{ opacity: 0.7 }}> — {doc.description}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Module Graph */}
      {(moduleGraph.rootModules?.length > 0 || moduleGraph.dependencies?.length > 0 || moduleGraph.summary) && (
        <CollapsibleSection title="Module Graph" sectionId="st-graph">
          {moduleGraph.summary && <div style={{ marginBottom: '4px' }}><Md text={moduleGraph.summary} /></div>}
          {moduleGraph.rootModules?.length > 0 && <div><strong>Root Modules:</strong> {moduleGraph.rootModules.map((m: string) => <code key={m} style={{ marginRight: '4px' }}>{m}</code>)}</div>}
          {moduleGraph.dependencies?.length > 0 && (
            <>
              <h4>Dependencies ({moduleGraph.dependencies.length})</h4>
              {moduleGraph.dependencies.slice(0, 20).map((dep: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px', fontSize: '0.85em' }}>
                  <code>{dep.from}</code> → <code>{dep.to}</code>
                  {dep.type && <span className="tag" style={{ marginLeft: '4px' }}>{dep.type}</span>}
                </div>
              ))}
              {moduleGraph.dependencies.length > 20 && <div style={{ opacity: 0.6 }}>...and {moduleGraph.dependencies.length - 20} more</div>}
            </>
          )}
          {moduleGraph.circularDependencies?.length > 0 && (
            <>
              <h4 style={{ color: 'var(--vscode-errorForeground)' }}>Circular Dependencies ({moduleGraph.circularDependencies.length})</h4>
              {moduleGraph.circularDependencies.map((cycle: string[], i: number) => (
                <div key={i} style={{ padding: '1px 8px', fontSize: '0.85em', color: 'var(--vscode-errorForeground)' }}>
                  {cycle.join(' → ')} → {cycle[0]}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Development Notes */}
      {devNotes.length > 0 && (
        <CollapsibleSection title="Development Notes" count={devNotes.length} sectionId="st-notes">
          {devNotes.map((n: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{n.note || `Note ${i + 1}`}</strong>
              {n.importance && <span className="tag" style={{ marginLeft: '4px', backgroundColor: n.importance === 'critical' ? 'var(--vscode-errorForeground)' : undefined }}>{n.importance}</span>}
              {n.category && <span className="tag" style={{ marginLeft: '4px' }}>{n.category}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <CollapsibleSection title="Recommendations" count={recommendations.length} sectionId="st-recs">
          {recommendations.map((r: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{r.recommendation || `Rec ${i + 1}`}</strong>
              {r.rationale && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{r.rationale}</div>}
              {r.impact && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Impact: {r.impact}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}
    </>
  );
}
