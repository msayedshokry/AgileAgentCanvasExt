/**
 * Test-related renderer functions extracted from DetailPanel.
 *
 * Covers: test-design, test-review, test-framework, test-summary, test-coverage.
 * (test-case and test-strategy live in core-renderers.tsx)
 *
 * All renderers support both read and edit modes.
 */
import { RendererProps, Md, CollapsibleSection } from './shared';

// ==========================================================================
// TEST DESIGN DETAILS (handles epic-level, QA, and architecture variants)
// ==========================================================================

export function renderTestDesignDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, artifact } = props;
  const d: any = editedData;

  // ---- Summary ----
  const summary = d.summary || {};
  const hasSummary = summary.scope || summary.objectives?.length || summary.approach || summary.riskSummary || summary.coverageSummary;

  // ---- Epic Info ----
  const epicInfo = d.epicInfo || {};
  const hasEpicInfo = epicInfo.epicId || epicInfo.epicTitle || epicInfo.epicGoal || editMode;

  // ---- Coverage Plan (P0-P3 arrays — epic-level) ----
  const coveragePlan = d.coveragePlan || {};
  const p0 = coveragePlan.p0Critical || coveragePlan.p0 || [];
  const p1 = coveragePlan.p1High || coveragePlan.p1 || [];
  const p2 = coveragePlan.p2Medium || coveragePlan.p2 || [];
  const p3 = coveragePlan.p3Low || coveragePlan.p3 || [];
  const allCoverageItems = [...p0, ...p1, ...p2, ...p3];
  const hasCoveragePlan = allCoverageItems.length > 0 || coveragePlan.overview || editMode;

  // ---- Test Cases (embedded in test-design) ----
  const testCases: any[] = d.testCases || [];

  // ---- Risk Assessment ----
  const riskAssessment = d.riskAssessment || {};
  // Normalize: sample uses 'highRisk/mediumRisk/lowRisk', renderer schema uses 'highPriority/mediumPriority/lowPriority'
  const highPriorityRisks: any[] = riskAssessment.highPriority || riskAssessment.highRisk || [];
  const mediumPriorityRisks: any[] = riskAssessment.mediumPriority || riskAssessment.mediumRisk || [];
  const lowPriorityRisks: any[] = riskAssessment.lowPriority || riskAssessment.lowRisk || [];

  // ---- Quality Gate Criteria ----
  const qualityGateCriteria: any[] = d.qualityGateCriteria || [];

  // ---- Execution Order (schema: object with overview, smoke[], p0[], p1[], p2p3[], parallelization{}) ----
  const executionOrderRaw = d.executionOrder || {};
  // Support both legacy flat array format and schema-compliant object format
  const executionOrderIsArray = Array.isArray(executionOrderRaw);
  const executionOrderObj: any = executionOrderIsArray ? {} : executionOrderRaw;

  // ---- QA variant fields ----
  const featureInfo = d.featureInfo || {};
  const hasFeatureInfo = featureInfo.featureId || featureInfo.featureName || featureInfo.featureScope;
  const executionStrategy = d.executionStrategy || {};
  const hasExecutionStrategy = executionStrategy.approach || executionStrategy.environments?.length || executionStrategy.tools?.length;

  // ---- Architecture variant fields ----
  const testabilityAssessment = d.testabilityAssessment || {};
  const hasTestability = testabilityAssessment.score || testabilityAssessment.strengths?.length || testabilityAssessment.weaknesses?.length;
  const architectureOverview = d.architectureOverview || {};
  const hasArchOverview = architectureOverview.patterns?.length || architectureOverview.components?.length;

  // ---- Normalize testEnvironment: sample has flat {ci: "string", staging: "string", tools: ["string"]}
  //      but renderer expects {environments: [{name, purpose}], tools: [{tool}|string], testData?} ----
  const rawTestEnv = d.testEnvironment || {};
  if (rawTestEnv && !rawTestEnv.environments) {
    const envArr: any[] = [];
    for (const [key, val] of Object.entries(rawTestEnv)) {
      if (key !== 'tools' && key !== 'testData' && typeof val === 'string') {
        envArr.push({ name: key, purpose: val });
      }
    }
    if (envArr.length > 0) {
      rawTestEnv.environments = envArr;
    }
  }
  // Ensure d.testEnvironment points to the normalized version
  if (!d.testEnvironment) d.testEnvironment = rawTestEnv;

  // ---- Normalize resourceEstimates.breakdown: sample uses 'type' but renderer expects 'activity' ----
  const rawResources = d.resourceEstimates || {};
  if (rawResources.breakdown?.length > 0) {
    rawResources.breakdown = rawResources.breakdown.map((b: any) => ({
      ...b,
      activity: b.activity || b.type || undefined,
    }));
  }

  const testLevels = ['unit', 'integration', 'component', 'api', 'e2e', 'manual'];
  const testTypes = ['functional', 'regression', 'smoke', 'sanity', 'exploratory'];

  const renderCoverageItem = (item: any, i: number, priorityKey: string, items: any[]) => (
    <div key={i} className="editable-item-header" style={{ flexWrap: 'wrap', padding: '8px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
      <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
        <strong style={{ flex: 1 }}>{item.id || `Item ${i + 1}`}</strong>
        {item.testLevel && <span className="tag">{item.testLevel}</span>}
        {item.testType && <span className="tag">{item.testType}</span>}
        {item.automatable !== undefined && <span className="tag">{item.automatable ? 'Automatable' : 'Manual'}</span>}
        {editMode && (
          <button className="icon-button" onClick={() => {
            const updated = items.filter((_: any, idx: number) => idx !== i);
            handleFieldChange('coveragePlan', { ...coveragePlan, [priorityKey]: updated });
          }} title="Remove item">{'\u2715'}</button>
        )}
      </div>
      {editMode ? (
        <div style={{ width: '100%', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" value={item.id || ''} onChange={(e) => {
              const updated = [...items]; updated[i] = { ...item, id: e.target.value };
              handleFieldChange('coveragePlan', { ...coveragePlan, [priorityKey]: updated });
            }} placeholder="ID" style={{ width: '100px' }} />
            <input type="text" value={item.requirement || ''} onChange={(e) => {
              const updated = [...items]; updated[i] = { ...item, requirement: e.target.value };
              handleFieldChange('coveragePlan', { ...coveragePlan, [priorityKey]: updated });
            }} placeholder="Requirement" style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select value={item.testLevel || ''} onChange={(e) => {
              const updated = [...items]; updated[i] = { ...item, testLevel: e.target.value };
              handleFieldChange('coveragePlan', { ...coveragePlan, [priorityKey]: updated });
            }} className="status-select">
              <option value="">Test Level</option>
              {testLevels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={item.testType || ''} onChange={(e) => {
              const updated = [...items]; updated[i] = { ...item, testType: e.target.value };
              handleFieldChange('coveragePlan', { ...coveragePlan, [priorityKey]: updated });
            }} className="status-select">
              <option value="">Test Type</option>
              {testTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="checkbox" checked={!!item.automatable} onChange={(e) => {
                const updated = [...items]; updated[i] = { ...item, automatable: e.target.checked };
                handleFieldChange('coveragePlan', { ...coveragePlan, [priorityKey]: updated });
              }} /> Automatable
            </label>
          </div>
          <input type="text" value={item.testApproach || ''} onChange={(e) => {
            const updated = [...items]; updated[i] = { ...item, testApproach: e.target.value };
            handleFieldChange('coveragePlan', { ...coveragePlan, [priorityKey]: updated });
          }} placeholder="Test approach..." style={{ width: '100%' }} />
        </div>
      ) : (
        <>
          {item.requirement && <div style={{ width: '100%', marginTop: '4px' }}><strong>Requirement:</strong> {item.requirement}</div>}
          {item.requirementId && <div style={{ width: '100%' }}><strong>Req ID:</strong> <span className="tag">{item.requirementId}</span></div>}
          {item.riskLink && <div style={{ width: '100%' }}><strong>Risk:</strong> {item.riskLink}</div>}
          {item.testApproach && <div style={{ width: '100%' }}><strong>Approach:</strong> {item.testApproach}</div>}
          {item.testCount && <div style={{ width: '100%' }}><strong>Test Count:</strong> {item.testCount}</div>}
          {item.owner && <div style={{ width: '100%' }}><strong>Owner:</strong> {item.owner}</div>}
        </>
      )}
    </div>
  );

  const renderPrioritySection = (title: string, items: any[], priorityKey: string, sectionId: string) => {
    if (items.length === 0 && !editMode) return null;
    return (
      <CollapsibleSection title={`${title} (${items.length})`} sectionId={sectionId}>
        {items.map((item: any, i: number) => renderCoverageItem(item, i, priorityKey, items))}
        {editMode && (
          <button className="add-item-button" onClick={() => {
            handleFieldChange('coveragePlan', { ...coveragePlan, [priorityKey]: [...items, { id: '', requirement: '', testLevel: '', testType: '' }] });
          }}>+ Add Item</button>
        )}
      </CollapsibleSection>
    );
  };

  return (
    <>
      {/* Epic Info */}
      {hasEpicInfo && (
        <CollapsibleSection title="Epic Info" sectionId="testdesign-epicinfo">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Epic ID</label>
                  <input type="text" value={epicInfo.epicId || ''} onChange={(e) => handleFieldChange('epicInfo', { ...epicInfo, epicId: e.target.value })} placeholder="Epic ID" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Story Count</label>
                  <input type="number" value={epicInfo.storyCount ?? ''} onChange={(e) => handleFieldChange('epicInfo', { ...epicInfo, storyCount: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="Stories" />
                </div>
              </div>
              <div>
                <label className="field-label">Epic Title</label>
                <input type="text" value={epicInfo.epicTitle || ''} onChange={(e) => handleFieldChange('epicInfo', { ...epicInfo, epicTitle: e.target.value })} placeholder="Epic title" style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label">Epic Goal</label>
                <textarea value={epicInfo.epicGoal || ''} onChange={(e) => handleFieldChange('epicInfo', { ...epicInfo, epicGoal: e.target.value })} placeholder="Epic goal" rows={2} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">PRD Reference</label>
                  <input type="text" value={epicInfo.prdReference || ''} onChange={(e) => handleFieldChange('epicInfo', { ...epicInfo, prdReference: e.target.value })} placeholder="PRD ref" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Architecture Reference</label>
                  <input type="text" value={epicInfo.architectureReference || ''} onChange={(e) => handleFieldChange('epicInfo', { ...epicInfo, architectureReference: e.target.value })} placeholder="Arch ref" />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="detail-row">
                {epicInfo.epicId && (
                  <section className="detail-section inline">
                    <h4>Epic ID</h4>
                    <span className="tag">{epicInfo.epicId}</span>
                  </section>
                )}
                {epicInfo.storyCount !== undefined && (
                  <section className="detail-section inline">
                    <h4>Stories</h4>
                    <span className="tag">{epicInfo.storyCount}</span>
                  </section>
                )}
              </div>
              {epicInfo.epicTitle && <p><strong>Title:</strong> {epicInfo.epicTitle}</p>}
              {epicInfo.epicGoal && <p><strong>Goal:</strong> {epicInfo.epicGoal}</p>}
              {epicInfo.prdReference && <p><strong>PRD:</strong> {epicInfo.prdReference}</p>}
              {epicInfo.architectureReference && <p><strong>Architecture:</strong> {epicInfo.architectureReference}</p>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Feature Info (QA variant) */}
      {hasFeatureInfo && (
        <CollapsibleSection title="Feature Info" sectionId="testdesign-featureinfo">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Feature ID</label>
                  <input type="text" value={featureInfo.featureId || ''} onChange={(e) => handleFieldChange('featureInfo', { ...featureInfo, featureId: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Feature Name</label>
                  <input type="text" value={featureInfo.featureName || ''} onChange={(e) => handleFieldChange('featureInfo', { ...featureInfo, featureName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="field-label">Feature Scope</label>
                <textarea value={featureInfo.featureScope || ''} onChange={(e) => handleFieldChange('featureInfo', { ...featureInfo, featureScope: e.target.value })} rows={3} style={{ width: '100%' }} />
              </div>
            </div>
          ) : (
            <>
              {featureInfo.featureId && <p><strong>Feature ID:</strong> <span className="tag">{featureInfo.featureId}</span></p>}
              {featureInfo.featureName && <p><strong>Name:</strong> {featureInfo.featureName}</p>}
              {featureInfo.featureScope && <Md text={featureInfo.featureScope} />}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Summary */}
      {(hasSummary || editMode) && (
        <CollapsibleSection title="Summary" sectionId="testdesign-summary">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label className="field-label">Scope</label>
                <textarea value={summary.scope || ''} onChange={(e) => handleFieldChange('summary', { ...summary, scope: e.target.value })} rows={2} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label">Approach</label>
                <textarea value={summary.approach || ''} onChange={(e) => handleFieldChange('summary', { ...summary, approach: e.target.value })} rows={2} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label">Coverage Summary</label>
                <textarea value={summary.coverageSummary || ''} onChange={(e) => handleFieldChange('summary', { ...summary, coverageSummary: e.target.value })} rows={2} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label">Risk Summary</label>
                <textarea value={summary.riskSummary || ''} onChange={(e) => handleFieldChange('summary', { ...summary, riskSummary: e.target.value })} rows={2} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label">Objectives</label>
                {(summary.objectives || []).map((o: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input type="text" value={o} onChange={(e) => {
                      const objs = [...(summary.objectives || [])]; objs[i] = e.target.value;
                      handleFieldChange('summary', { ...summary, objectives: objs });
                    }} style={{ flex: 1 }} />
                    <button className="icon-button" onClick={() => {
                      const objs = (summary.objectives || []).filter((_: any, idx: number) => idx !== i);
                      handleFieldChange('summary', { ...summary, objectives: objs });
                    }}>{'\u2715'}</button>
                  </div>
                ))}
                <button className="add-item-button" onClick={() => handleFieldChange('summary', { ...summary, objectives: [...(summary.objectives || []), ''] })}>+ Add Objective</button>
              </div>
              <div>
                <label className="field-label">Key Decisions</label>
                {(summary.keyDecisions || []).map((kd: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input type="text" value={kd} onChange={(e) => {
                      const kds = [...(summary.keyDecisions || [])]; kds[i] = e.target.value;
                      handleFieldChange('summary', { ...summary, keyDecisions: kds });
                    }} style={{ flex: 1 }} />
                    <button className="icon-button" onClick={() => {
                      const kds = (summary.keyDecisions || []).filter((_: any, idx: number) => idx !== i);
                      handleFieldChange('summary', { ...summary, keyDecisions: kds });
                    }}>{'\u2715'}</button>
                  </div>
                ))}
                <button className="add-item-button" onClick={() => handleFieldChange('summary', { ...summary, keyDecisions: [...(summary.keyDecisions || []), ''] })}>+ Add Decision</button>
              </div>
            </div>
          ) : (
            <>
              {summary.scope && <p><strong>Scope:</strong> {summary.scope}</p>}
              {summary.approach && <p><strong>Approach:</strong> {summary.approach}</p>}
              {summary.coverageSummary && <p><strong>Coverage:</strong> {summary.coverageSummary}</p>}
              {summary.riskSummary && <p><strong>Risk Summary:</strong> {summary.riskSummary}</p>}
              {summary.objectives?.length > 0 && (
                <>
                  <h4>Objectives</h4>
                  <ul>{summary.objectives.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul>
                </>
              )}
              {summary.keyDecisions?.length > 0 && (
                <>
                  <h4>Key Decisions</h4>
                  <ul>{summary.keyDecisions.map((kd: string, i: number) => <li key={i}>{kd}</li>)}</ul>
                </>
              )}
              {summary.testLevels?.length > 0 && (
                <>
                  <h4>Test Levels</h4>
                  {summary.testLevels.map((tl: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
                      <span className="tag">{typeof tl === 'string' ? tl : tl.level || JSON.stringify(tl)}</span>
                      {tl.purpose && <span>{tl.purpose}</span>}
                      {tl.coverage && <span className="muted">{tl.coverage}</span>}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Description fallback */}
      {!hasSummary && !editMode && artifact.description && (
        <CollapsibleSection title="Description" sectionId="testdesign-description">
          <Md text={artifact.description} />
        </CollapsibleSection>
      )}

      {/* Coverage Plan (P0-P3) */}
      {hasCoveragePlan && (
        <CollapsibleSection title="Coverage Plan" count={allCoverageItems.length} sectionId="testdesign-coverageplan">
          {editMode ? (
            <div style={{ marginBottom: '8px' }}>
              <label className="field-label">Overview</label>
              <textarea value={coveragePlan.overview || ''} onChange={(e) => handleFieldChange('coveragePlan', { ...coveragePlan, overview: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
          ) : (
            coveragePlan.overview && <Md text={coveragePlan.overview} />
          )}
          {coveragePlan.coverageGoals && !editMode && (
            <div style={{ marginBottom: '12px' }}>
              <h4>Coverage Goals</h4>
              <div className="detail-row">
                {coveragePlan.coverageGoals.codeStatement && <section className="detail-section inline"><h4>Statement</h4><span className="tag">{coveragePlan.coverageGoals.codeStatement}</span></section>}
                {coveragePlan.coverageGoals.codeBranch && <section className="detail-section inline"><h4>Branch</h4><span className="tag">{coveragePlan.coverageGoals.codeBranch}</span></section>}
                {coveragePlan.coverageGoals.requirementCoverage && <section className="detail-section inline"><h4>Requirement</h4><span className="tag">{coveragePlan.coverageGoals.requirementCoverage}</span></section>}
                {coveragePlan.coverageGoals.riskCoverage && <section className="detail-section inline"><h4>Risk</h4><span className="tag">{coveragePlan.coverageGoals.riskCoverage}</span></section>}
              </div>
            </div>
          )}
          {editMode && (
            <div style={{ marginBottom: '12px' }}>
              <h4>Coverage Goals</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['codeStatement', 'codeBranch', 'requirementCoverage', 'riskCoverage'].map(goalKey => (
                  <div key={goalKey} style={{ flex: '1 1 200px' }}>
                    <label className="field-label">{goalKey.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())}</label>
                    <input type="text" value={(coveragePlan.coverageGoals || {})[goalKey] || ''} onChange={(e) => {
                      const goals = { ...(coveragePlan.coverageGoals || {}), [goalKey]: e.target.value };
                      handleFieldChange('coveragePlan', { ...coveragePlan, coverageGoals: goals });
                    }} placeholder={goalKey} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {renderPrioritySection('P0 Critical', p0, 'p0', 'testdesign-p0')}
          {renderPrioritySection('P1 High', p1, 'p1', 'testdesign-p1')}
          {renderPrioritySection('P2 Medium', p2, 'p2', 'testdesign-p2')}
          {renderPrioritySection('P3 Low', p3, 'p3', 'testdesign-p3')}
        </CollapsibleSection>
      )}

      {/* Embedded Test Cases */}
      {(testCases.length > 0 || editMode) && (
        <CollapsibleSection title="Test Cases" count={testCases.length} sectionId="testdesign-testcases">
          {testCases.map((tc: any, i: number) => (
            <CollapsibleSection
              key={tc.id || i}
              title={`${tc.id || `TC-${i + 1}`}: ${tc.title || tc.name || 'Untitled'}`}
              sectionId={`testdesign-tc-${tc.id || i}`}
            >
              {editMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label className="field-label">ID</label>
                      <input type="text" value={tc.id || ''} onChange={(e) => {
                        const updated = [...testCases]; updated[i] = { ...tc, id: e.target.value };
                        handleFieldChange('testCases', updated);
                      }} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label className="field-label">Title</label>
                      <input type="text" value={tc.title || ''} onChange={(e) => {
                        const updated = [...testCases]; updated[i] = { ...tc, title: e.target.value };
                        handleFieldChange('testCases', updated);
                      }} />
                    </div>
                    <button className="icon-button" style={{ alignSelf: 'flex-end' }} onClick={() => {
                      handleFieldChange('testCases', testCases.filter((_: any, idx: number) => idx !== i));
                    }} title="Remove test case">{'\u2715'}</button>
                  </div>
                  <div>
                    <label className="field-label">Description</label>
                    <textarea value={tc.description || ''} onChange={(e) => {
                      const updated = [...testCases]; updated[i] = { ...tc, description: e.target.value };
                      handleFieldChange('testCases', updated);
                    }} rows={2} style={{ width: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div>
                      <label className="field-label">Priority</label>
                      <select value={tc.priority || ''} onChange={(e) => {
                        const updated = [...testCases]; updated[i] = { ...tc, priority: e.target.value };
                        handleFieldChange('testCases', updated);
                      }} className="status-select">
                        <option value="">Priority</option>
                        {['P0', 'P1', 'P2', 'P3'].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Type</label>
                      <input type="text" value={tc.type || ''} onChange={(e) => {
                        const updated = [...testCases]; updated[i] = { ...tc, type: e.target.value };
                        handleFieldChange('testCases', updated);
                      }} placeholder="Type" />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {tc.description && <Md text={tc.description} />}
                  {tc.priority && <p><strong>Priority:</strong> <span className="tag">{tc.priority}</span></p>}
                  {tc.type && <p><strong>Type:</strong> <span className="tag">{tc.type}</span></p>}
                  {tc.preconditions?.length > 0 && (
                    <>
                      <h4>Preconditions</h4>
                      <ul>{tc.preconditions.map((p: string, pi: number) => <li key={pi}>{p}</li>)}</ul>
                    </>
                  )}
                  {tc.steps?.length > 0 && (
                    <>
                      <h4>Steps</h4>
                      <ol>{tc.steps.map((s: any, si: number) => (
                        <li key={si}>
                          {typeof s === 'string' ? s : (s.action || s.given ? `${s.given ? `Given ${s.given}` : ''} ${s.when ? `When ${s.when}` : ''} ${s.then ? `Then ${s.then}` : ''}`.trim() : JSON.stringify(s))}
                          {s.expectedResult && <div className="muted">Expected: {s.expectedResult}</div>}
                        </li>
                      ))}</ol>
                    </>
                  )}
                  {tc.expectedResult && <p><strong>Expected Result:</strong> {tc.expectedResult}</p>}
                </>
              )}
            </CollapsibleSection>
          ))}
          {editMode && (
            <button className="add-item-button" onClick={() => {
              handleFieldChange('testCases', [...testCases, { id: '', title: '', description: '', priority: '', type: '' }]);
            }}>+ Add Test Case</button>
          )}
        </CollapsibleSection>
      )}

      {/* Risk Assessment */}
      {(riskAssessment.overview || highPriorityRisks.length > 0 || editMode) && (
        <CollapsibleSection title="Risk Assessment" count={highPriorityRisks.length} sectionId="testdesign-riskassessment">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label className="field-label">Overview</label>
                <textarea value={riskAssessment.overview || ''} onChange={(e) => handleFieldChange('riskAssessment', { ...riskAssessment, overview: e.target.value })} rows={2} style={{ width: '100%' }} />
              </div>
              <h4>High Priority Risks</h4>
              {highPriorityRisks.map((r: any, i: number) => (
                <div key={i} style={{ padding: '8px', borderRadius: '4px', background: 'var(--vscode-inputValidation-warningBackground)', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <input type="text" value={r.riskId || ''} onChange={(e) => {
                      const updated = [...highPriorityRisks]; updated[i] = { ...r, riskId: e.target.value };
                      handleFieldChange('riskAssessment', { ...riskAssessment, highPriority: updated });
                    }} placeholder="Risk ID" style={{ width: '100px' }} />
                    <input type="text" value={r.description || ''} onChange={(e) => {
                      const updated = [...highPriorityRisks]; updated[i] = { ...r, description: e.target.value };
                      handleFieldChange('riskAssessment', { ...riskAssessment, highPriority: updated });
                    }} placeholder="Description" style={{ flex: 1 }} />
                    <select value={r.probability || ''} onChange={(e) => {
                      const updated = [...highPriorityRisks]; updated[i] = { ...r, probability: e.target.value };
                      handleFieldChange('riskAssessment', { ...riskAssessment, highPriority: updated });
                    }} className="status-select">
                      <option value="">Prob</option>
                      {['low', 'medium', 'high'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select value={r.impact || ''} onChange={(e) => {
                      const updated = [...highPriorityRisks]; updated[i] = { ...r, impact: e.target.value };
                      handleFieldChange('riskAssessment', { ...riskAssessment, highPriority: updated });
                    }} className="status-select">
                      <option value="">Impact</option>
                      {['low', 'medium', 'high'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <button className="icon-button" onClick={() => {
                      handleFieldChange('riskAssessment', { ...riskAssessment, highPriority: highPriorityRisks.filter((_: any, idx: number) => idx !== i) });
                    }}>{'\u2715'}</button>
                  </div>
                  <input type="text" value={r.mitigation || ''} onChange={(e) => {
                    const updated = [...highPriorityRisks]; updated[i] = { ...r, mitigation: e.target.value };
                    handleFieldChange('riskAssessment', { ...riskAssessment, highPriority: updated });
                  }} placeholder="Mitigation strategy" style={{ width: '100%' }} />
                </div>
              ))}
              <button className="add-item-button" onClick={() => {
                handleFieldChange('riskAssessment', { ...riskAssessment, highPriority: [...highPriorityRisks, { riskId: '', description: '', probability: '', impact: '' }] });
              }}>+ Add Risk</button>
            </div>
          ) : (
            <>
              {riskAssessment.overview && <Md text={riskAssessment.overview} />}
              {highPriorityRisks.map((r: any, i: number) => (
                <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-inputValidation-warningBackground)', marginBottom: '4px' }}>
                  <strong>{r.riskId || `Risk ${i + 1}`}</strong>: {r.description}
                  <div className="detail-row">
                    {r.probability && <span className="tag">P: {r.probability}</span>}
                    {r.impact && <span className="tag">I: {r.impact}</span>}
                    {r.category && <span className="tag">{r.category}</span>}
                  </div>
                  {r.mitigation && <div className="muted" style={{ marginTop: '4px' }}>Mitigation: {r.mitigation}</div>}
                  {r.testStrategy && <div className="muted">Test Strategy: {r.testStrategy}</div>}
                  {r.owner && <div className="muted">Owner: {r.owner}</div>}
                </div>
              ))}
              {mediumPriorityRisks.length > 0 && (
                <>
                  <h4 style={{ marginTop: '12px' }}>Medium Priority Risks</h4>
                  {mediumPriorityRisks.map((r: any, i: number) => (
                    <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
                      <strong>{r.riskId || `Risk ${i + 1}`}</strong>: {r.description}
                      <div className="detail-row">
                        {r.probability && <span className="tag">P: {r.probability}</span>}
                        {r.impact && <span className="tag">I: {r.impact}</span>}
                      </div>
                      {r.mitigation && <div className="muted" style={{ marginTop: '4px' }}>Mitigation: {r.mitigation}</div>}
                    </div>
                  ))}
                </>
              )}
              {lowPriorityRisks.length > 0 && (
                <>
                  <h4 style={{ marginTop: '12px' }}>Low Priority Risks</h4>
                  {lowPriorityRisks.map((r: any, i: number) => (
                    <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
                      <strong>{r.riskId || `Risk ${i + 1}`}</strong>: {r.description}
                      <div className="detail-row">
                        {r.probability && <span className="tag">P: {r.probability}</span>}
                        {r.impact && <span className="tag">I: {r.impact}</span>}
                      </div>
                      {r.mitigation && <div className="muted" style={{ marginTop: '4px' }}>Mitigation: {r.mitigation}</div>}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Quality Gate Criteria */}
      {(qualityGateCriteria.length > 0 || editMode) && (
        <CollapsibleSection title="Quality Gate Criteria" count={qualityGateCriteria.length} sectionId="testdesign-qualitygate">
          {qualityGateCriteria.map((qg: any, i: number) => (
            <div key={i} style={{ padding: '4px 0' }}>
              {editMode ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="text" value={qg.criterion || ''} onChange={(e) => {
                    const updated = [...qualityGateCriteria]; updated[i] = { ...qg, criterion: e.target.value };
                    handleFieldChange('qualityGateCriteria', updated);
                  }} placeholder="Criterion" style={{ flex: 2 }} />
                  <input type="text" value={qg.threshold || ''} onChange={(e) => {
                    const updated = [...qualityGateCriteria]; updated[i] = { ...qg, threshold: e.target.value };
                    handleFieldChange('qualityGateCriteria', updated);
                  }} placeholder="Threshold" style={{ flex: 1 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={!!qg.mandatory} onChange={(e) => {
                      const updated = [...qualityGateCriteria]; updated[i] = { ...qg, mandatory: e.target.checked };
                      handleFieldChange('qualityGateCriteria', updated);
                    }} /> Required
                  </label>
                  <button className="icon-button" onClick={() => handleFieldChange('qualityGateCriteria', qualityGateCriteria.filter((_: any, idx: number) => idx !== i))}>{'\u2715'}</button>
                </div>
              ) : (
                <>
                  <strong>{qg.criterion}</strong>
                  {qg.threshold && <span> — Threshold: {qg.threshold}</span>}
                  {qg.mandatory && <span className="tag" style={{ marginLeft: '8px' }}>Mandatory</span>}
                </>
              )}
            </div>
          ))}
          {editMode && (
            <button className="add-item-button" onClick={() => handleFieldChange('qualityGateCriteria', [...qualityGateCriteria, { criterion: '', threshold: '', mandatory: false }])}>+ Add Criterion</button>
          )}
        </CollapsibleSection>
      )}

      {/* Execution Order — supports both legacy flat array and schema object format */}
      {executionOrderIsArray && executionOrderRaw.length > 0 && !editMode && (
        <CollapsibleSection title="Execution Order" count={executionOrderRaw.length} sectionId="testdesign-executionorder">
          <ol>{executionOrderRaw.map((item: any, i: number) => (
            <li key={i}>{typeof item === 'string' ? item : (item.phase || item.name || JSON.stringify(item))}</li>
          ))}</ol>
        </CollapsibleSection>
      )}
      {!executionOrderIsArray && executionOrderObj.phases?.length > 0 && (
        <CollapsibleSection title="Execution Order" count={executionOrderObj.phases.length} sectionId="testdesign-executionorder">
          {executionOrderObj.phases.map((phase: any, i: number) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong>{typeof phase === 'string' ? phase : (phase.phase || phase.name || `Phase ${i + 1}`)}</strong>
                {phase.parallel && <span className="tag">Parallel</span>}
              </div>
              {phase.tests?.length > 0 && (
                <div className="tags-list" style={{ marginTop: '4px' }}>
                  {phase.tests.map((t: string, ti: number) => <span key={ti} className="tag">{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}
      {!executionOrderIsArray && !executionOrderObj.phases && (executionOrderObj.overview || executionOrderObj.smoke?.length || executionOrderObj.p0?.length || executionOrderObj.p1?.length || executionOrderObj.p2p3?.length || executionOrderObj.parallelization) && (
        <CollapsibleSection title="Execution Order" sectionId="testdesign-executionorder">
          {executionOrderObj.overview && <Md text={executionOrderObj.overview} />}
          {executionOrderObj.smoke?.length > 0 && (
            <>
              <h4>Smoke Tests</h4>
              <ol>{executionOrderObj.smoke.map((s: any, i: number) => (
                <li key={i}>{typeof s === 'string' ? s : `${s.testId ? `[${s.testId}] ` : ''}${s.description || JSON.stringify(s)}`}</li>
              ))}</ol>
            </>
          )}
          {executionOrderObj.p0?.length > 0 && (
            <>
              <h4>P0 Tests</h4>
              <ul>{executionOrderObj.p0.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
          {executionOrderObj.p1?.length > 0 && (
            <>
              <h4>P1 Tests</h4>
              <ul>{executionOrderObj.p1.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
          {executionOrderObj.p2p3?.length > 0 && (
            <>
              <h4>P2/P3 Tests</h4>
              <ul>{executionOrderObj.p2p3.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
          {executionOrderObj.parallelization && (
            <div style={{ marginTop: '8px' }}>
              <h4>Parallelization</h4>
              {executionOrderObj.parallelization.strategy && <p><strong>Strategy:</strong> {executionOrderObj.parallelization.strategy}</p>}
              {executionOrderObj.parallelization.maxParallel != null && <p><strong>Max Parallel:</strong> {executionOrderObj.parallelization.maxParallel}</p>}
              {executionOrderObj.parallelization.constraints?.length > 0 && (
                <ul>{executionOrderObj.parallelization.constraints.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Execution Strategy (QA variant) */}
      {hasExecutionStrategy && (
        <CollapsibleSection title="Execution Strategy" sectionId="testdesign-execstrategy">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label className="field-label">Approach</label>
                <textarea value={executionStrategy.approach || ''} onChange={(e) => handleFieldChange('executionStrategy', { ...executionStrategy, approach: e.target.value })} rows={2} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="field-label">Environments</label>
                {(executionStrategy.environments || []).map((env: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input type="text" value={env} onChange={(e) => {
                      const envs = [...(executionStrategy.environments || [])]; envs[i] = e.target.value;
                      handleFieldChange('executionStrategy', { ...executionStrategy, environments: envs });
                    }} style={{ flex: 1 }} />
                    <button className="icon-button" onClick={() => {
                      handleFieldChange('executionStrategy', { ...executionStrategy, environments: (executionStrategy.environments || []).filter((_: any, idx: number) => idx !== i) });
                    }}>{'\u2715'}</button>
                  </div>
                ))}
                <button className="add-item-button" onClick={() => handleFieldChange('executionStrategy', { ...executionStrategy, environments: [...(executionStrategy.environments || []), ''] })}>+ Add Environment</button>
              </div>
            </div>
          ) : (
            <>
              {executionStrategy.approach && <p><strong>Approach:</strong> {executionStrategy.approach}</p>}
              {executionStrategy.environments?.length > 0 && (
                <>
                  <h4>Environments</h4>
                  <div className="tags-list">
                    {executionStrategy.environments.map((env: string, i: number) => <span key={i} className="tag">{env}</span>)}
                  </div>
                </>
              )}
              {executionStrategy.tools?.length > 0 && (
                <>
                  <h4>Tools</h4>
                  <div className="tags-list">
                    {executionStrategy.tools.map((tool: any, i: number) => (
                      <span key={i} className="tag">{typeof tool === 'string' ? tool : (tool.name || JSON.stringify(tool))}</span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Testability Assessment (Architecture variant) */}
      {hasTestability && (
        <CollapsibleSection title="Testability Assessment" sectionId="testdesign-testability">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label className="field-label">Score</label>
                <input type="text" value={testabilityAssessment.score || ''} onChange={(e) => handleFieldChange('testabilityAssessment', { ...testabilityAssessment, score: e.target.value })} placeholder="Score" />
              </div>
              <div>
                <label className="field-label">Strengths</label>
                {(testabilityAssessment.strengths || []).map((s: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input type="text" value={s} onChange={(e) => {
                      const arr = [...(testabilityAssessment.strengths || [])]; arr[i] = e.target.value;
                      handleFieldChange('testabilityAssessment', { ...testabilityAssessment, strengths: arr });
                    }} style={{ flex: 1 }} />
                    <button className="icon-button" onClick={() => {
                      handleFieldChange('testabilityAssessment', { ...testabilityAssessment, strengths: (testabilityAssessment.strengths || []).filter((_: any, idx: number) => idx !== i) });
                    }}>{'\u2715'}</button>
                  </div>
                ))}
                <button className="add-item-button" onClick={() => handleFieldChange('testabilityAssessment', { ...testabilityAssessment, strengths: [...(testabilityAssessment.strengths || []), ''] })}>+ Add Strength</button>
              </div>
              <div>
                <label className="field-label">Weaknesses</label>
                {(testabilityAssessment.weaknesses || []).map((w: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input type="text" value={w} onChange={(e) => {
                      const arr = [...(testabilityAssessment.weaknesses || [])]; arr[i] = e.target.value;
                      handleFieldChange('testabilityAssessment', { ...testabilityAssessment, weaknesses: arr });
                    }} style={{ flex: 1 }} />
                    <button className="icon-button" onClick={() => {
                      handleFieldChange('testabilityAssessment', { ...testabilityAssessment, weaknesses: (testabilityAssessment.weaknesses || []).filter((_: any, idx: number) => idx !== i) });
                    }}>{'\u2715'}</button>
                  </div>
                ))}
                <button className="add-item-button" onClick={() => handleFieldChange('testabilityAssessment', { ...testabilityAssessment, weaknesses: [...(testabilityAssessment.weaknesses || []), ''] })}>+ Add Weakness</button>
              </div>
              <div>
                <label className="field-label">Recommendations</label>
                {(testabilityAssessment.recommendations || []).map((r: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input type="text" value={r} onChange={(e) => {
                      const arr = [...(testabilityAssessment.recommendations || [])]; arr[i] = e.target.value;
                      handleFieldChange('testabilityAssessment', { ...testabilityAssessment, recommendations: arr });
                    }} style={{ flex: 1 }} />
                    <button className="icon-button" onClick={() => {
                      handleFieldChange('testabilityAssessment', { ...testabilityAssessment, recommendations: (testabilityAssessment.recommendations || []).filter((_: any, idx: number) => idx !== i) });
                    }}>{'\u2715'}</button>
                  </div>
                ))}
                <button className="add-item-button" onClick={() => handleFieldChange('testabilityAssessment', { ...testabilityAssessment, recommendations: [...(testabilityAssessment.recommendations || []), ''] })}>+ Add Recommendation</button>
              </div>
            </div>
          ) : (
            <>
              {testabilityAssessment.score && <p><strong>Score:</strong> <span className="tag">{testabilityAssessment.score}</span></p>}
              {testabilityAssessment.strengths?.length > 0 && (
                <>
                  <h4>Strengths</h4>
                  <ul>{testabilityAssessment.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
              {testabilityAssessment.weaknesses?.length > 0 && (
                <>
                  <h4>Weaknesses</h4>
                  <ul>{testabilityAssessment.weaknesses.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
                </>
              )}
              {testabilityAssessment.recommendations?.length > 0 && (
                <>
                  <h4>Recommendations</h4>
                  <ul>{testabilityAssessment.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                </>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Architecture Overview (Architecture variant) */}
      {hasArchOverview && (
        <CollapsibleSection title="Architecture Overview" sectionId="testdesign-archoverview">
          {architectureOverview.patterns?.length > 0 && (
            <>
              <h4>Patterns</h4>
              <div className="tags-list">
                {architectureOverview.patterns.map((p: string, i: number) => <span key={i} className="tag">{p}</span>)}
              </div>
            </>
          )}
          {architectureOverview.components?.length > 0 && (
            <>
              <h4>Components</h4>
              <ul>{architectureOverview.components.map((c: any, i: number) => (
                <li key={i}>{typeof c === 'string' ? c : (c.name || JSON.stringify(c))}</li>
              ))}</ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Not In Scope */}
      {(d.notInScope?.length > 0) && !editMode && (
        <CollapsibleSection title="Not In Scope" count={d.notInScope.length} sectionId="testdesign-notinscope">
          {d.notInScope.map((item: any, i: number) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <strong>{typeof item === 'string' ? item : item.item || JSON.stringify(item)}</strong>
              {item.reason && <div className="muted">Reason: {item.reason}</div>}
              {item.riskAccepted != null && <span className="tag" style={{ marginTop: '2px' }}>{item.riskAccepted ? 'Risk Accepted' : 'Risk Not Accepted'}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Entry/Exit Criteria */}
      {(d.entryExitCriteria?.entry?.length > 0 || d.entryExitCriteria?.exit?.length > 0 || d.entryExitCriteria?.suspensionCriteria?.length > 0) && !editMode && (
        <CollapsibleSection title="Entry/Exit Criteria" sectionId="testdesign-entryexit">
          {d.entryExitCriteria.entry?.length > 0 && (
            <>
              <h4>Entry Criteria</h4>
              {d.entryExitCriteria.entry.map((c: any, i: number) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <span>{typeof c === 'string' ? c : c.criterion || JSON.stringify(c)}</span>
                  {c.mandatory && <span className="tag" style={{ marginLeft: '8px' }}>Mandatory</span>}
                  {c.verification && <div className="muted">Verification: {c.verification}</div>}
                </div>
              ))}
            </>
          )}
          {d.entryExitCriteria.exit?.length > 0 && (
            <>
              <h4>Exit Criteria</h4>
              {d.entryExitCriteria.exit.map((c: any, i: number) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <span>{typeof c === 'string' ? c : c.criterion || JSON.stringify(c)}</span>
                  {c.mandatory && <span className="tag" style={{ marginLeft: '8px' }}>Mandatory</span>}
                  {c.threshold && <span className="muted"> — Threshold: {c.threshold}</span>}
                  {c.measurement && <div className="muted">Measurement: {c.measurement}</div>}
                </div>
              ))}
            </>
          )}
          {d.entryExitCriteria.suspensionCriteria?.length > 0 && (
            <>
              <h4>Suspension Criteria</h4>
              <ul>{d.entryExitCriteria.suspensionCriteria.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
          {d.entryExitCriteria.resumptionCriteria?.length > 0 && (
            <>
              <h4>Resumption Criteria</h4>
              <ul>{d.entryExitCriteria.resumptionCriteria.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Project Team */}
      {d.projectTeam?.length > 0 && !editMode && (
        <CollapsibleSection title="Project Team" count={d.projectTeam.length} sectionId="testdesign-team">
          {d.projectTeam.map((member: any, i: number) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong>{member.name || `Member ${i + 1}`}</strong>
                {member.role && <span className="tag">{member.role}</span>}
                {member.availability && <span className="muted">{member.availability}</span>}
              </div>
              {member.responsibilities && <div style={{ marginTop: '2px' }}>{member.responsibilities}</div>}
              {member.skills?.length > 0 && <div className="tags-list" style={{ marginTop: '4px' }}>{member.skills.map((s: string, si: number) => <span key={si} className="tag">{s}</span>)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Test Environment */}
      {(d.testEnvironment?.environments?.length > 0 || d.testEnvironment?.testData || d.testEnvironment?.tools?.length > 0) && !editMode && (
        <CollapsibleSection title="Test Environment" sectionId="testdesign-environment">
          {d.testEnvironment.environments?.length > 0 && (
            <>
              <h4>Environments</h4>
              {d.testEnvironment.environments.map((env: any, i: number) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <strong>{env.name || `Env ${i + 1}`}</strong>
                  {env.purpose && <span className="muted"> — {env.purpose}</span>}
                  {env.configuration && <div className="muted">Config: {env.configuration}</div>}
                  {env.dataRequirements && <div className="muted">Data: {env.dataRequirements}</div>}
                </div>
              ))}
            </>
          )}
          {d.testEnvironment.testData && (
            <>
              <h4>Test Data</h4>
              {d.testEnvironment.testData.strategy && <p><strong>Strategy:</strong> {d.testEnvironment.testData.strategy}</p>}
              {d.testEnvironment.testData.refreshStrategy && <p><strong>Refresh:</strong> {d.testEnvironment.testData.refreshStrategy}</p>}
              {d.testEnvironment.testData.sources?.length > 0 && (
                <div className="tags-list">{d.testEnvironment.testData.sources.map((s: string, i: number) => <span key={i} className="tag">{s}</span>)}</div>
              )}
            </>
          )}
          {d.testEnvironment.tools?.length > 0 && (
            <>
              <h4>Tools</h4>
              {d.testEnvironment.tools.map((t: any, i: number) => (
                <div key={i} style={{ padding: '2px 0' }}>
                  <strong>{typeof t === 'string' ? t : t.tool || JSON.stringify(t)}</strong>
                  {t.purpose && <span className="muted"> — {t.purpose}</span>}
                  {t.version && <span className="tag" style={{ marginLeft: '4px' }}>{t.version}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Resource Estimates */}
      {(d.resourceEstimates?.totalEffort || d.resourceEstimates?.breakdown?.length > 0 || d.resourceEstimates?.timeline?.length > 0) && !editMode && (
        <CollapsibleSection title="Resource Estimates" sectionId="testdesign-resources">
          {d.resourceEstimates.totalEffort && <p><strong>Total Effort:</strong> {d.resourceEstimates.totalEffort}</p>}
          {d.resourceEstimates.breakdown?.length > 0 && (
            <>
              <h4>Breakdown</h4>
              {d.resourceEstimates.breakdown.map((b: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
                  <span>{b.activity || `Activity ${i + 1}`}</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {b.effort && <span className="tag">{b.effort}</span>}
                    {b.resources != null && <span className="muted">{b.resources} resources</span>}
                    {b.duration && <span className="muted">{b.duration}</span>}
                  </div>
                </div>
              ))}
            </>
          )}
          {d.resourceEstimates.timeline?.length > 0 && (
            <>
              <h4>Timeline</h4>
              {d.resourceEstimates.timeline.map((t: any, i: number) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <strong>{t.phase || `Phase ${i + 1}`}</strong>
                  {t.startDate && <span className="muted"> {t.startDate}</span>}
                  {t.endDate && <span className="muted"> — {t.endDate}</span>}
                  {t.deliverables?.length > 0 && <div className="tags-list" style={{ marginTop: '2px' }}>{t.deliverables.map((d2: string, di: number) => <span key={di} className="tag">{d2}</span>)}</div>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Mitigation Plans */}
      {d.mitigationPlans?.length > 0 && !editMode && (
        <CollapsibleSection title="Mitigation Plans" count={d.mitigationPlans.length} sectionId="testdesign-mitigation">
          {d.mitigationPlans.map((mp: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {mp.riskId && <span className="tag">{mp.riskId}</span>}
                <strong>{mp.risk || `Plan ${i + 1}`}</strong>
                {mp.owner && <span className="muted">Owner: {mp.owner}</span>}
              </div>
              {mp.plan && <div style={{ marginTop: '4px' }}><strong>Plan:</strong> {mp.plan}</div>}
              {mp.contingency && <div className="muted" style={{ marginTop: '2px' }}>Contingency: {mp.contingency}</div>}
              {mp.triggers?.length > 0 && <div className="tags-list" style={{ marginTop: '4px' }}>{mp.triggers.map((t: string, ti: number) => <span key={ti} className="tag">{t}</span>)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Assumptions & Dependencies */}
      {(d.assumptionsAndDependencies?.assumptions?.length > 0 || d.assumptionsAndDependencies?.dependencies?.length > 0) && !editMode && (
        <CollapsibleSection title="Assumptions & Dependencies" sectionId="testdesign-assumptions">
          {d.assumptionsAndDependencies.assumptions?.length > 0 && (
            <>
              <h4>Assumptions</h4>
              {d.assumptionsAndDependencies.assumptions.map((a: any, i: number) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <span>{typeof a === 'string' ? a : a.assumption || JSON.stringify(a)}</span>
                  {a.risk && <div className="muted">Risk: {a.risk}</div>}
                  {a.validation && <div className="muted">Validation: {a.validation}</div>}
                </div>
              ))}
            </>
          )}
          {d.assumptionsAndDependencies.dependencies?.length > 0 && (
            <>
              <h4>Dependencies</h4>
              {d.assumptionsAndDependencies.dependencies.map((dep: any, i: number) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <strong>{typeof dep === 'string' ? dep : dep.dependency || JSON.stringify(dep)}</strong>
                  {dep.type && <span className="tag" style={{ marginLeft: '8px' }}>{dep.type}</span>}
                  {dep.status && <span className="tag" style={{ marginLeft: '4px' }}>{dep.status}</span>}
                  {dep.owner && <span className="muted" style={{ marginLeft: '4px' }}>Owner: {dep.owner}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Defect Management */}
      {(d.defectManagement?.process || d.defectManagement?.severityDefinitions?.length > 0) && !editMode && (
        <CollapsibleSection title="Defect Management" sectionId="testdesign-defects">
          {d.defectManagement.process && <Md text={d.defectManagement.process} />}
          {d.defectManagement.severityDefinitions?.length > 0 && (
            <>
              <h4>Severity Definitions</h4>
              {d.defectManagement.severityDefinitions.map((sd: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
                  <strong>{sd.severity}</strong>
                  <span>{sd.definition}</span>
                  {sd.sla && <span className="tag">{sd.sla}</span>}
                </div>
              ))}
            </>
          )}
          {d.defectManagement.escalationPath && <p><strong>Escalation:</strong> {d.defectManagement.escalationPath}</p>}
        </CollapsibleSection>
      )}

      {/* Approval */}
      {d.approval?.approvers?.length > 0 && !editMode && (
        <CollapsibleSection title="Approval" sectionId="testdesign-approval">
          {d.approval.approvers.map((a: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <div>
                <strong>{a.name || `Approver ${i + 1}`}</strong>
                {a.role && <span className="muted"> ({a.role})</span>}
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {a.status && <span className={`tag ${a.status === 'approved' ? 'tag-success' : a.status === 'rejected' ? 'tag-danger' : ''}`}>{a.status}</span>}
                {a.date && <span className="muted">{a.date}</span>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Appendices */}
      {d.appendices?.length > 0 && !editMode && (
        <CollapsibleSection title="Appendices" count={d.appendices.length} sectionId="testdesign-appendices">
          {d.appendices.map((a: any, i: number) => (
            <CollapsibleSection key={i} title={a.title || `Appendix ${i + 1}`} sectionId={`testdesign-appendix-${i}`}>
              {a.content && <Md text={a.content} />}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* ================================================================
          QA VARIANT FIELDS
          ================================================================ */}

      {/* Executive Summary (QA variant — string) */}
      {typeof d.executiveSummary === 'string' && d.executiveSummary && !editMode && (
        <CollapsibleSection title="Executive Summary" sectionId="testdesign-qa-execsummary">
          <Md text={d.executiveSummary} />
        </CollapsibleSection>
      )}

      {/* Testing Objectives */}
      {d.testingObjectives?.length > 0 && !editMode && (
        <CollapsibleSection title="Testing Objectives" count={d.testingObjectives.length} sectionId="testdesign-qa-objectives">
          <ul>
            {d.testingObjectives.map((obj: any, i: number) => (
              <li key={i}>{typeof obj === 'string' ? obj : obj.objective || obj.description || JSON.stringify(obj)}</li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Dependencies and Blockers */}
      {(d.dependenciesAndBlockers?.dependencies?.length > 0 || d.dependenciesAndBlockers?.blockers?.length > 0) && !editMode && (
        <CollapsibleSection title="Dependencies & Blockers" sectionId="testdesign-qa-depblock">
          {d.dependenciesAndBlockers?.dependencies?.length > 0 && (
            <>
              <strong>Dependencies</strong>
              <ul>
                {d.dependenciesAndBlockers.dependencies.map((dep: any, i: number) => (
                  <li key={i}>
                    {typeof dep === 'string' ? dep : (
                      <>
                        <strong>{dep.name || dep.dependency || `Dependency ${i + 1}`}</strong>
                        {dep.status && <span className="tag" style={{ marginLeft: '4px' }}>{dep.status}</span>}
                        {dep.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{dep.description}</div>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.dependenciesAndBlockers?.blockers?.length > 0 && (
            <>
              <strong>Blockers</strong>
              <ul>
                {d.dependenciesAndBlockers.blockers.map((b: any, i: number) => (
                  <li key={i}>
                    {typeof b === 'string' ? b : (
                      <>
                        <strong>{b.name || b.blocker || `Blocker ${i + 1}`}</strong>
                        {b.severity && <span className="tag" style={{ marginLeft: '4px' }}>{b.severity}</span>}
                        {b.status && <span className="tag" style={{ marginLeft: '4px' }}>{b.status}</span>}
                        {b.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{b.description}</div>}
                        {b.mitigation && <div style={{ fontSize: '0.85em', color: 'var(--vscode-textLink-foreground)' }}>Mitigation: {b.mitigation}</div>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Test Data */}
      {d.testData && !editMode && (
        <CollapsibleSection title="Test Data" sectionId="testdesign-qa-testdata">
          {d.testData.strategy && <div style={{ marginBottom: '4px' }}><strong>Strategy:</strong> {d.testData.strategy}</div>}
          {d.testData.sources?.length > 0 && (
            <>
              <strong>Sources</strong>
              <ul>
                {d.testData.sources.map((s: any, i: number) => (
                  <li key={i}>{typeof s === 'string' ? s : s.name || s.source || JSON.stringify(s)}</li>
                ))}
              </ul>
            </>
          )}
          {d.testData.generation && (
            <div style={{ marginTop: '4px' }}>
              <strong>Generation:</strong>
              {typeof d.testData.generation === 'string' ? (
                <span> {d.testData.generation}</span>
              ) : (
                <Md text={JSON.stringify(d.testData.generation, null, 2)} />
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* QA Effort Estimate */}
      {d.qaEffortEstimate && !editMode && (
        <CollapsibleSection title="QA Effort Estimate" sectionId="testdesign-qa-effort">
          {d.qaEffortEstimate.totalHours != null && <div><strong>Total Hours:</strong> {d.qaEffortEstimate.totalHours}</div>}
          {d.qaEffortEstimate.breakdown?.length > 0 && (
            <>
              <strong>Breakdown</strong>
              <ul>
                {d.qaEffortEstimate.breakdown.map((b: any, i: number) => (
                  <li key={i}>
                    <strong>{b.activity || b.task || `Item ${i + 1}`}</strong>
                    {b.hours != null && <span className="tag" style={{ marginLeft: '4px' }}>{b.hours}h</span>}
                    {b.percentage != null && <span className="tag" style={{ marginLeft: '4px' }}>{b.percentage}%</span>}
                    {b.notes && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{b.notes}</div>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.qaEffortEstimate.timeline && (
            <div style={{ marginTop: '4px' }}>
              <strong>Timeline:</strong>{' '}
              {typeof d.qaEffortEstimate.timeline === 'string'
                ? d.qaEffortEstimate.timeline
                : (
                  <Md text={JSON.stringify(d.qaEffortEstimate.timeline, null, 2)} />
                )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Sprint Planning Handoff */}
      {d.sprintPlanningHandoff && !editMode && (
        <CollapsibleSection title="Sprint Planning Handoff" sectionId="testdesign-qa-sprint">
          {typeof d.sprintPlanningHandoff === 'string' ? (
            <Md text={d.sprintPlanningHandoff} />
          ) : (
            <>
              {d.sprintPlanningHandoff.recommendations?.length > 0 && (
                <ul>
                  {d.sprintPlanningHandoff.recommendations.map((r: any, i: number) => (
                    <li key={i}>{typeof r === 'string' ? r : r.recommendation || JSON.stringify(r)}</li>
                  ))}
                </ul>
              )}
              {d.sprintPlanningHandoff.sprintCapacity && <div><strong>Sprint Capacity:</strong> {d.sprintPlanningHandoff.sprintCapacity}</div>}
              {d.sprintPlanningHandoff.notes && <div style={{ marginTop: '4px' }}><Md text={d.sprintPlanningHandoff.notes} /></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Tooling and Access */}
      {d.toolingAndAccess && !editMode && (
        <CollapsibleSection title="Tooling & Access" sectionId="testdesign-qa-tooling">
          {d.toolingAndAccess.tools?.length > 0 && (
            <>
              <strong>Tools</strong>
              <ul>
                {d.toolingAndAccess.tools.map((t: any, i: number) => (
                  <li key={i}>
                    {typeof t === 'string' ? t : (
                      <>
                        <strong>{t.name || t.tool || `Tool ${i + 1}`}</strong>
                        {t.purpose && <span style={{ opacity: 0.7 }}> — {t.purpose}</span>}
                        {t.version && <span className="tag" style={{ marginLeft: '4px' }}>{t.version}</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.toolingAndAccess.accessRequirements?.length > 0 && (
            <>
              <strong>Access Requirements</strong>
              <ul>
                {d.toolingAndAccess.accessRequirements.map((a: any, i: number) => (
                  <li key={i}>
                    {typeof a === 'string' ? a : (
                      <>
                        <strong>{a.resource || a.name || `Requirement ${i + 1}`}</strong>
                        {a.status && <span className="tag" style={{ marginLeft: '4px' }}>{a.status}</span>}
                        {a.owner && <span style={{ opacity: 0.7 }}> — Owner: {a.owner}</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Environment Requirements */}
      {d.environmentRequirements?.length > 0 && !editMode && (
        <CollapsibleSection title="Environment Requirements" count={d.environmentRequirements.length} sectionId="testdesign-qa-envreqs">
          {d.environmentRequirements.map((env: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{env.name || env.environment || `Environment ${i + 1}`}</strong>
              {env.type && <span className="tag" style={{ marginLeft: '4px' }}>{env.type}</span>}
              {env.status && <span className="tag" style={{ marginLeft: '4px' }}>{env.status}</span>}
              {env.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{env.description}</div>}
              {env.url && <div style={{ fontSize: '0.85em' }}><code>{env.url}</code></div>}
              {env.configuration && <div style={{ fontSize: '0.85em' }}><strong>Config:</strong> {typeof env.configuration === 'string' ? env.configuration : JSON.stringify(env.configuration)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Interworking and Regression */}
      {d.interworkingAndRegression && !editMode && (
        <CollapsibleSection title="Interworking & Regression" sectionId="testdesign-qa-interworking">
          {d.interworkingAndRegression.interworkingScope && (
            <div style={{ marginBottom: '8px' }}>
              <strong>Interworking Scope</strong>
              {typeof d.interworkingAndRegression.interworkingScope === 'string' ? (
                <Md text={d.interworkingAndRegression.interworkingScope} />
              ) : (
                <ul>
                  {(Array.isArray(d.interworkingAndRegression.interworkingScope)
                    ? d.interworkingAndRegression.interworkingScope
                    : Object.entries(d.interworkingAndRegression.interworkingScope)
                  ).map((item: any, i: number) => (
                    <li key={i}>{typeof item === 'string' ? item : Array.isArray(item) ? `${item[0]}: ${item[1]}` : JSON.stringify(item)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {d.interworkingAndRegression.regressionImpact && (
            <div>
              <strong>Regression Impact</strong>
              {typeof d.interworkingAndRegression.regressionImpact === 'string' ? (
                <Md text={d.interworkingAndRegression.regressionImpact} />
              ) : (
                <ul>
                  {(Array.isArray(d.interworkingAndRegression.regressionImpact)
                    ? d.interworkingAndRegression.regressionImpact
                    : Object.entries(d.interworkingAndRegression.regressionImpact)
                  ).map((item: any, i: number) => (
                    <li key={i}>{typeof item === 'string' ? item : Array.isArray(item) ? `${item[0]}: ${item[1]}` : JSON.stringify(item)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Approvals (QA variant — plural, different from epic-level d.approval) */}
      {d.approvals && !editMode && (
        <CollapsibleSection title="Approvals" sectionId="testdesign-qa-approvals">
          {d.approvals.requiredApprovers?.length > 0 && (
            <>
              <strong>Required Approvers</strong>
              {d.approvals.requiredApprovers.map((a: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
                  <div>
                    <strong>{a.name || `Approver ${i + 1}`}</strong>
                    {a.role && <span className="muted"> ({a.role})</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {a.status && <span className={`tag ${a.status === 'approved' ? 'tag-success' : a.status === 'rejected' ? 'tag-danger' : ''}`}>{a.status}</span>}
                    {a.date && <span className="muted">{a.date}</span>}
                  </div>
                </div>
              ))}
            </>
          )}
          {d.approvals.status && <div style={{ marginTop: '4px' }}><strong>Status:</strong> <span className="tag">{d.approvals.status}</span></div>}
          {d.approvals.comments && <div style={{ marginTop: '4px' }}><Md text={d.approvals.comments} /></div>}
        </CollapsibleSection>
      )}

      {/* Appendix (QA variant — singular, different from d.appendices) */}
      {d.appendix && !editMode && (
        <CollapsibleSection title="Appendix" sectionId="testdesign-qa-appendix">
          {typeof d.appendix === 'string' ? (
            <Md text={d.appendix} />
          ) : (
            <>
              {d.appendix.glossary?.length > 0 && (
                <CollapsibleSection title="Glossary" count={d.appendix.glossary.length} sectionId="testdesign-qa-appendix-glossary">
                  {d.appendix.glossary.map((g: any, i: number) => (
                    <div key={i} style={{ padding: '2px 8px' }}>
                      <strong>{g.term || `Term ${i + 1}`}</strong>
                      {g.definition && <span style={{ opacity: 0.7 }}> — {g.definition}</span>}
                    </div>
                  ))}
                </CollapsibleSection>
              )}
              {d.appendix.references?.length > 0 && (
                <CollapsibleSection title="References" count={d.appendix.references.length} sectionId="testdesign-qa-appendix-refs">
                  <ul>
                    {d.appendix.references.map((r: any, i: number) => (
                      <li key={i}>{typeof r === 'string' ? r : r.title || r.name || JSON.stringify(r)}</li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}
              {d.appendix.additionalNotes && <div style={{ marginTop: '4px' }}><Md text={d.appendix.additionalNotes} /></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* ================================================================
          ARCHITECTURE VARIANT FIELDS
          ================================================================ */}

      {/* Executive Summary (Architecture variant — object) */}
      {typeof d.executiveSummary === 'object' && d.executiveSummary && !editMode && (
        <CollapsibleSection title="Executive Summary" sectionId="testdesign-arch-execsummary">
          {d.executiveSummary.assessment && <div style={{ marginBottom: '4px' }}><strong>Assessment:</strong> <Md text={d.executiveSummary.assessment} /></div>}
          {d.executiveSummary.keyFindings?.length > 0 && (
            <>
              <strong>Key Findings</strong>
              <ul>
                {d.executiveSummary.keyFindings.map((f: any, i: number) => (
                  <li key={i}>{typeof f === 'string' ? f : f.finding || JSON.stringify(f)}</li>
                ))}
              </ul>
            </>
          )}
          {d.executiveSummary.recommendations?.length > 0 && (
            <>
              <strong>Recommendations</strong>
              <ul>
                {d.executiveSummary.recommendations.map((r: any, i: number) => (
                  <li key={i}>{typeof r === 'string' ? r : r.recommendation || JSON.stringify(r)}</li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Quick Guide */}
      {d.quickGuide && !editMode && (
        <CollapsibleSection title="Quick Guide" sectionId="testdesign-arch-quickguide">
          {d.quickGuide.tldr && <div style={{ marginBottom: '8px' }}><strong>TL;DR:</strong> <Md text={d.quickGuide.tldr} /></div>}
          {d.quickGuide.criticalTestGaps?.length > 0 && (
            <>
              <strong>Critical Test Gaps</strong>
              <ul>
                {d.quickGuide.criticalTestGaps.map((g: any, i: number) => (
                  <li key={i}>{typeof g === 'string' ? g : g.gap || g.description || JSON.stringify(g)}</li>
                ))}
              </ul>
            </>
          )}
          {d.quickGuide.suggestedApproach && (
            <div style={{ marginTop: '4px' }}>
              <strong>Suggested Approach:</strong>
              {typeof d.quickGuide.suggestedApproach === 'string' ? (
                <Md text={d.quickGuide.suggestedApproach} />
              ) : (
                <ul>
                  {(Array.isArray(d.quickGuide.suggestedApproach) ? d.quickGuide.suggestedApproach : [d.quickGuide.suggestedApproach]).map((a: any, i: number) => (
                    <li key={i}>{typeof a === 'string' ? a : a.step || JSON.stringify(a)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Testability Concerns */}
      {d.testabilityConcerns?.length > 0 && !editMode && (
        <CollapsibleSection title="Testability Concerns" count={d.testabilityConcerns.length} sectionId="testdesign-arch-testability">
          {d.testabilityConcerns.map((c: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-editorWarning-foreground)' }}>
              <strong>{c.concern || c.title || `Concern ${i + 1}`}</strong>
              {c.severity && <span className="tag" style={{ marginLeft: '4px' }}>{c.severity}</span>}
              {c.component && <span className="tag" style={{ marginLeft: '4px' }}>{c.component}</span>}
              {c.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{c.description}</div>}
              {c.impact && <div style={{ fontSize: '0.85em' }}>Impact: {c.impact}</div>}
              {c.recommendation && <div style={{ fontSize: '0.85em', color: 'var(--vscode-textLink-foreground)' }}>Rec: {c.recommendation}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Risk Mitigation Plans */}
      {d.riskMitigationPlans?.length > 0 && !editMode && (
        <CollapsibleSection title="Risk Mitigation Plans" count={d.riskMitigationPlans.length} sectionId="testdesign-arch-riskmitigation">
          {d.riskMitigationPlans.map((p: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-charts-orange)' }}>
              <strong>{p.risk || p.title || `Risk ${i + 1}`}</strong>
              {p.severity && <span className="tag" style={{ marginLeft: '4px' }}>{p.severity}</span>}
              {p.likelihood && <span className="tag" style={{ marginLeft: '4px' }}>Likelihood: {p.likelihood}</span>}
              {p.mitigation && <div style={{ fontSize: '0.85em' }}><strong>Mitigation:</strong> {p.mitigation}</div>}
              {p.owner && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>Owner: {p.owner}</div>}
              {p.status && <div><span className="tag">{p.status}</span></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Architectural Recommendations */}
      {d.architecturalRecommendations?.length > 0 && !editMode && (
        <CollapsibleSection title="Architectural Recommendations" count={d.architecturalRecommendations.length} sectionId="testdesign-arch-recs">
          {d.architecturalRecommendations.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{r.recommendation || r.title || `Recommendation ${i + 1}`}</strong>
              {r.priority && <span className="tag" style={{ marginLeft: '4px' }}>{r.priority}</span>}
              {r.effort && <span className="tag" style={{ marginLeft: '4px' }}>Effort: {r.effort}</span>}
              {r.rationale && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{r.rationale}</div>}
              {r.impact && <div style={{ fontSize: '0.85em' }}>Impact: {r.impact}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Next Steps (Architecture variant) */}
      {d.nextSteps?.length > 0 && !editMode && (
        <CollapsibleSection title="Next Steps" count={d.nextSteps.length} sectionId="testdesign-arch-nextsteps">
          {d.nextSteps.map((s: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{typeof s === 'string' ? s : s.step || s.action || s.title || `Step ${i + 1}`}</strong>
              {typeof s === 'object' && s.owner && <span className="tag" style={{ marginLeft: '4px' }}>{s.owner}</span>}
              {typeof s === 'object' && s.priority && <span className="tag" style={{ marginLeft: '4px' }}>{s.priority}</span>}
              {typeof s === 'object' && s.dueDate && <span className="muted" style={{ marginLeft: '4px' }}>{s.dueDate}</span>}
              {typeof s === 'object' && s.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{s.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Sign Off (Architecture variant) */}
      {d.signOff && !editMode && (
        <CollapsibleSection title="Sign Off" sectionId="testdesign-arch-signoff">
          {d.signOff.architect && <div><strong>Architect:</strong> {d.signOff.architect}</div>}
          {d.signOff.status && <div><strong>Status:</strong> <span className="tag">{d.signOff.status}</span></div>}
          {d.signOff.date && <div style={{ opacity: 0.7 }}>{d.signOff.date}</div>}
          {d.signOff.conditions?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong>Conditions:</strong>
              <ul>
                {d.signOff.conditions.map((c: any, i: number) => (
                  <li key={i}>{typeof c === 'string' ? c : c.condition || JSON.stringify(c)}</li>
                ))}
              </ul>
            </div>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// TEST REVIEW DETAILS
// ==========================================================================

export function renderTestReviewDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, artifact } = props;
  const d: any = editedData;
  const reviewInfo = d.reviewInfo || {};
  const executiveSummary = d.executiveSummary || {};
  const qualityAssessment = d.qualityAssessment || {};
  const criteria: any[] = qualityAssessment.criteria || [];
  const criticalIssues: any[] = d.criticalIssues || [];
  const recommendations: any[] = d.recommendations || [];
  const decision = d.decision || {};
  const qualityScoreBreakdown = d.qualityScoreBreakdown || {};
  const coverageAnalysis = d.coverageAnalysis || {};
  const nextSteps: any[] = d.nextSteps || [];

  // Fallback for legacy shape
  const findings: any[] = d.findings || qualityAssessment.findings || [];
  const legacyRecs: string[] = typeof (d.recommendations?.[0]) === 'string' ? d.recommendations : [];
  const scores = qualityAssessment.scores || {};

  const verdictOptions = ['approve', 'approve-with-comments', 'request-changes', 'block'];
  const reviewTypes = ['initial', 'follow-up', 'regression', 'pre-release', 'post-incident'];

  return (
    <>
      {/* Review Info */}
      <CollapsibleSection title="Review Info" sectionId="testreview-info">
        {editMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 120px' }}>
                <label className="field-label">Quality Score</label>
                <input type="number" min={0} max={100} value={reviewInfo.qualityScore ?? ''} onChange={(e) => handleFieldChange('reviewInfo', { ...reviewInfo, qualityScore: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="0-100" />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label className="field-label">Review Date</label>
                <input type="date" value={reviewInfo.reviewDate || ''} onChange={(e) => handleFieldChange('reviewInfo', { ...reviewInfo, reviewDate: e.target.value })} />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label className="field-label">Reviewer</label>
                <input type="text" value={reviewInfo.reviewer || ''} onChange={(e) => handleFieldChange('reviewInfo', { ...reviewInfo, reviewer: e.target.value })} placeholder="Reviewer" />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label className="field-label">Review Type</label>
                <select value={reviewInfo.reviewType || ''} onChange={(e) => handleFieldChange('reviewInfo', { ...reviewInfo, reviewType: e.target.value })} className="status-select">
                  <option value="">Select type</option>
                  {reviewTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">Scope</label>
              <textarea value={reviewInfo.scope || ''} onChange={(e) => handleFieldChange('reviewInfo', { ...reviewInfo, scope: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
          </div>
        ) : (
          <>
            <div className="detail-row">
              {reviewInfo.qualityScore != null && (
                <section className="detail-section inline">
                  <h4>Quality Score</h4>
                  <span className="tag">{reviewInfo.qualityScore}/100</span>
                </section>
              )}
              {reviewInfo.reviewer && (
                <section className="detail-section inline">
                  <h4>Reviewer</h4>
                  <span className="person-badge">{reviewInfo.reviewer}</span>
                </section>
              )}
              {reviewInfo.reviewDate && (
                <section className="detail-section inline">
                  <h4>Date</h4>
                  <span>{reviewInfo.reviewDate}</span>
                </section>
              )}
              {reviewInfo.reviewType && (
                <section className="detail-section inline">
                  <h4>Type</h4>
                  <span className="tag">{reviewInfo.reviewType}</span>
                </section>
              )}
              {reviewInfo.previousScore != null && (
                <section className="detail-section inline">
                  <h4>Previous Score</h4>
                  <span className="tag">{reviewInfo.previousScore}/100</span>
                </section>
              )}
              {reviewInfo.targetScore != null && (
                <section className="detail-section inline">
                  <h4>Target Score</h4>
                  <span className="tag">{reviewInfo.targetScore}/100</span>
                </section>
              )}
            </div>
            {reviewInfo.scope && <p><strong>Scope:</strong> {reviewInfo.scope}</p>}
          </>
        )}
      </CollapsibleSection>

      {/* Description */}
      {artifact.description && !editMode && (
        <CollapsibleSection title="Description" sectionId="testreview-description">
          <Md text={artifact.description} />
        </CollapsibleSection>
      )}

      {/* Executive Summary */}
      {(executiveSummary.assessment || executiveSummary.recommendation || editMode) && (
        <CollapsibleSection title="Executive Summary" sectionId="testreview-execsummary">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Recommendation</label>
                  <select value={executiveSummary.recommendation || ''} onChange={(e) => handleFieldChange('executiveSummary', { ...executiveSummary, recommendation: e.target.value })} className="status-select">
                    <option value="">Select</option>
                    {verdictOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Risk Level</label>
                  <select value={executiveSummary.riskLevel || ''} onChange={(e) => handleFieldChange('executiveSummary', { ...executiveSummary, riskLevel: e.target.value })} className="status-select">
                    <option value="">Select</option>
                    {['low', 'medium', 'high', 'critical'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Assessment</label>
                <textarea value={executiveSummary.assessment || ''} onChange={(e) => handleFieldChange('executiveSummary', { ...executiveSummary, assessment: e.target.value })} rows={3} style={{ width: '100%' }} />
              </div>
            </div>
          ) : (
            <>
              <div className="detail-row">
                {executiveSummary.recommendation && (
                  <section className="detail-section inline">
                    <h4>Recommendation</h4>
                    <span className={`tag ${executiveSummary.recommendation === 'block' ? 'tag-danger' : executiveSummary.recommendation === 'approve' ? 'tag-success' : ''}`}>{executiveSummary.recommendation}</span>
                  </section>
                )}
                {executiveSummary.riskLevel && (
                  <section className="detail-section inline">
                    <h4>Risk Level</h4>
                    <span className={`tag ${executiveSummary.riskLevel === 'critical' || executiveSummary.riskLevel === 'high' ? 'tag-danger' : ''}`}>{executiveSummary.riskLevel}</span>
                  </section>
                )}
              </div>
              {executiveSummary.assessment && <Md text={executiveSummary.assessment} />}
              {executiveSummary.strengths?.length > 0 && (
                <>
                  <h4>Strengths</h4>
                  <ul>{executiveSummary.strengths.map((s: any, i: number) => <li key={i}>{typeof s === 'string' ? s : s.strength || JSON.stringify(s)}</li>)}</ul>
                </>
              )}
              {executiveSummary.weaknesses?.length > 0 && (
                <>
                  <h4>Weaknesses</h4>
                  <ul>{executiveSummary.weaknesses.map((w: any, i: number) => <li key={i}>{typeof w === 'string' ? w : w.weakness || JSON.stringify(w)}{w.remediation ? ` — Fix: ${w.remediation}` : ''}</li>)}</ul>
                </>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Quality Score Breakdown */}
      {Object.keys(qualityScoreBreakdown).length > 0 && (
        <CollapsibleSection title="Quality Score Breakdown" sectionId="testreview-scorebreakdown">
          {Object.entries(qualityScoreBreakdown).map(([key, val]: [string, any]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {val?.score != null && <span className="tag">{val.score}/10</span>}
                {val?.weight != null && <span className="muted">w:{val.weight}</span>}
                {val?.contribution != null && <span className="tag">{val.contribution}</span>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Quality Assessment Criteria */}
      {criteria.length > 0 && (
        <CollapsibleSection title="Quality Criteria" count={criteria.length} sectionId="testreview-criteria">
          {criteria.map((c: any, i: number) => (
            <CollapsibleSection key={i} title={`${c.criterion || `Criterion ${i + 1}`} — ${c.score ?? '?'}/10`} sectionId={`testreview-crit-${i}`}>
              {editMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 2 }}>
                      <label className="field-label">Criterion</label>
                      <input type="text" value={c.criterion || ''} onChange={(e) => {
                        const updated = [...criteria]; updated[i] = { ...c, criterion: e.target.value };
                        handleFieldChange('qualityAssessment', { ...qualityAssessment, criteria: updated });
                      }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="field-label">Score (0-10)</label>
                      <input type="number" min={0} max={10} value={c.score ?? ''} onChange={(e) => {
                        const updated = [...criteria]; updated[i] = { ...c, score: e.target.value ? parseFloat(e.target.value) : undefined };
                        handleFieldChange('qualityAssessment', { ...qualityAssessment, criteria: updated });
                      }} />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Findings</label>
                    <textarea value={c.findings || ''} onChange={(e) => {
                      const updated = [...criteria]; updated[i] = { ...c, findings: e.target.value };
                      handleFieldChange('qualityAssessment', { ...qualityAssessment, criteria: updated });
                    }} rows={2} style={{ width: '100%' }} />
                  </div>
                </div>
              ) : (
                <>
                  {c.findings && <Md text={c.findings} />}
                  {c.evidence?.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <h4>Evidence</h4>
                      {c.evidence.map((ev: any, ei: number) => (
                        <div key={ei} style={{ padding: '4px 0' }}>
                          <span className={`tag ${ev.type === 'positive' ? 'tag-success' : ev.type === 'negative' ? 'tag-danger' : ''}`}>{ev.type}</span>
                          <span style={{ marginLeft: '8px' }}>{ev.description}</span>
                          {ev.location && <span className="muted"> ({ev.location})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {c.recommendations?.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <h4>Recommendations</h4>
                      <ul>{c.recommendations.map((r: string, ri: number) => <li key={ri}>{r}</li>)}</ul>
                    </div>
                  )}
                </>
              )}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* Legacy: Quality Scores (flat object) */}
      {Object.keys(scores).length > 0 && criteria.length === 0 && (
        <CollapsibleSection title="Quality Scores" sectionId="testreview-scores">
          {Object.entries(scores).map(([key, val]: [string, any]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())}</span>
              <span className="tag">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Critical Issues */}
      {(criticalIssues.length > 0 || editMode) && (
        <CollapsibleSection title="Critical Issues" count={criticalIssues.length} sectionId="testreview-critical">
          {criticalIssues.map((issue: any, i: number) => (
            <div key={i} style={{ padding: '8px', borderRadius: '4px', background: 'var(--vscode-inputValidation-errorBackground)', marginBottom: '6px' }}>
              {editMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={issue.issue || ''} onChange={(e) => {
                      const updated = [...criticalIssues]; updated[i] = { ...issue, issue: e.target.value };
                      handleFieldChange('criticalIssues', updated);
                    }} placeholder="Issue description" style={{ flex: 1 }} />
                    <select value={issue.priority || ''} onChange={(e) => {
                      const updated = [...criticalIssues]; updated[i] = { ...issue, priority: e.target.value };
                      handleFieldChange('criticalIssues', updated);
                    }} className="status-select">
                      <option value="">Priority</option>
                      {['immediate', 'before-release', 'next-sprint'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button className="icon-button" onClick={() => handleFieldChange('criticalIssues', criticalIssues.filter((_: any, idx: number) => idx !== i))}>{'\u2715'}</button>
                  </div>
                  <input type="text" value={issue.location || ''} onChange={(e) => {
                    const updated = [...criticalIssues]; updated[i] = { ...issue, location: e.target.value };
                    handleFieldChange('criticalIssues', updated);
                  }} placeholder="Location" style={{ width: '100%' }} />
                  <textarea value={issue.recommendation || ''} onChange={(e) => {
                    const updated = [...criticalIssues]; updated[i] = { ...issue, recommendation: e.target.value };
                    handleFieldChange('criticalIssues', updated);
                  }} placeholder="Recommendation" rows={2} style={{ width: '100%' }} />
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{issue.id || `Issue ${i + 1}`}: {issue.issue}</strong>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {issue.priority && <span className="tag">{issue.priority}</span>}
                      {issue.effort && <span className="tag">{issue.effort}</span>}
                    </div>
                  </div>
                  {issue.location && <div className="muted">Location: {issue.location}</div>}
                  {issue.impact && <div style={{ marginTop: '4px' }}><strong>Impact:</strong> {issue.impact}</div>}
                  {issue.recommendation && <div style={{ marginTop: '4px' }}><strong>Fix:</strong> {issue.recommendation}</div>}
                </>
              )}
            </div>
          ))}
          {editMode && (
            <button className="add-item-button" onClick={() => handleFieldChange('criticalIssues', [...criticalIssues, { issue: '', location: '', recommendation: '', priority: '' }])}>+ Add Critical Issue</button>
          )}
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {(recommendations.length > 0 || editMode) && (
        <CollapsibleSection title="Recommendations" count={recommendations.length} sectionId="testreview-recommendations">
          {legacyRecs.length > 0 ? (
            <ul>{legacyRecs.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
          ) : (
            <>
              {recommendations.map((rec: any, i: number) => (
                <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '6px' }}>
                  {editMode ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" value={rec.recommendation || ''} onChange={(e) => {
                          const updated = [...recommendations]; updated[i] = { ...rec, recommendation: e.target.value };
                          handleFieldChange('recommendations', updated);
                        }} placeholder="Recommendation" style={{ flex: 1 }} />
                        <select value={rec.priority || ''} onChange={(e) => {
                          const updated = [...recommendations]; updated[i] = { ...rec, priority: e.target.value };
                          handleFieldChange('recommendations', updated);
                        }} className="status-select">
                          <option value="">Priority</option>
                          {['high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button className="icon-button" onClick={() => handleFieldChange('recommendations', recommendations.filter((_: any, idx: number) => idx !== i))}>{'\u2715'}</button>
                      </div>
                      <select value={rec.category || ''} onChange={(e) => {
                        const updated = [...recommendations]; updated[i] = { ...rec, category: e.target.value };
                        handleFieldChange('recommendations', updated);
                      }} className="status-select">
                        <option value="">Category</option>
                        {['maintainability', 'performance', 'reliability', 'coverage', 'readability', 'best-practice'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{rec.recommendation || rec}</strong>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {rec.priority && <span className="tag">{rec.priority}</span>}
                          {rec.category && <span className="tag">{rec.category}</span>}
                        </div>
                      </div>
                      {rec.impact && <div className="muted" style={{ marginTop: '4px' }}>Impact: {rec.impact}</div>}
                    </>
                  )}
                </div>
              ))}
              {editMode && (
                <button className="add-item-button" onClick={() => handleFieldChange('recommendations', [...recommendations, { recommendation: '', priority: '', category: '' }])}>+ Add Recommendation</button>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Legacy: Findings */}
      {findings.length > 0 && criticalIssues.length === 0 && (
        <CollapsibleSection title="Findings" count={findings.length} sectionId="testreview-findings">
          {findings.map((f: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
              <strong>{f.id || f.title || `Finding ${i + 1}`}</strong>
              {f.severity && <span className="tag" style={{ marginLeft: '8px' }}>{f.severity}</span>}
              {f.description && <div style={{ marginTop: '4px' }}>{f.description}</div>}
              {f.recommendation && <div className="muted" style={{ marginTop: '4px' }}>Recommendation: {f.recommendation}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Coverage Analysis */}
      {(coverageAnalysis.overallCoverage || coverageAnalysis.coverageByArea?.length) && (
        <CollapsibleSection title="Coverage Analysis" sectionId="testreview-coverage">
          {coverageAnalysis.overallCoverage && (
            <div className="detail-row">
              {coverageAnalysis.overallCoverage.statements != null && <section className="detail-section inline"><h4>Statements</h4><span className="tag">{coverageAnalysis.overallCoverage.statements}%</span></section>}
              {coverageAnalysis.overallCoverage.branches != null && <section className="detail-section inline"><h4>Branches</h4><span className="tag">{coverageAnalysis.overallCoverage.branches}%</span></section>}
              {coverageAnalysis.overallCoverage.functions != null && <section className="detail-section inline"><h4>Functions</h4><span className="tag">{coverageAnalysis.overallCoverage.functions}%</span></section>}
              {coverageAnalysis.overallCoverage.lines != null && <section className="detail-section inline"><h4>Lines</h4><span className="tag">{coverageAnalysis.overallCoverage.lines}%</span></section>}
            </div>
          )}
          {coverageAnalysis.coverageByArea?.length > 0 && (
            <>
              <h4>Coverage by Area</h4>
              {coverageAnalysis.coverageByArea.map((a: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
                  <span><strong>{a.area || `Area ${i + 1}`}</strong></span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {a.coverage != null && <span className="tag">{a.coverage}%</span>}
                    {a.gaps?.length > 0 && <span className="muted">Gaps: {a.gaps.join(', ')}</span>}
                  </div>
                </div>
              ))}
            </>
          )}
          {coverageAnalysis.uncoveredAreas?.length > 0 && (
            <>
              <h4>Uncovered Areas</h4>
              {coverageAnalysis.uncoveredAreas.map((a: any, i: number) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <strong>{a.area}</strong>
                  {a.risk && <span className="muted"> — Risk: {a.risk}</span>}
                  {a.recommendation && <div className="muted">Fix: {a.recommendation}</div>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Decision */}
      {(decision.verdict || editMode) && (
        <CollapsibleSection title="Decision" sectionId="testreview-decision">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Verdict</label>
                  <select value={decision.verdict || ''} onChange={(e) => handleFieldChange('decision', { ...decision, verdict: e.target.value })} className="status-select">
                    <option value="">Select verdict</option>
                    {verdictOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Follow-up Required</label>
                  <select value={decision.followUpRequired ? 'yes' : 'no'} onChange={(e) => handleFieldChange('decision', { ...decision, followUpRequired: e.target.value === 'yes' })} className="status-select">
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Comments</label>
                <textarea value={decision.comments || ''} onChange={(e) => handleFieldChange('decision', { ...decision, comments: e.target.value })} rows={3} style={{ width: '100%' }} />
              </div>
            </div>
          ) : (
            <>
              <div className="detail-row">
                <section className="detail-section inline">
                  <h4>Verdict</h4>
                  <span className={`tag ${decision.verdict === 'block' ? 'tag-danger' : decision.verdict === 'approve' ? 'tag-success' : ''}`}>{decision.verdict}</span>
                </section>
                {decision.followUpRequired && (
                  <section className="detail-section inline">
                    <h4>Follow-up</h4>
                    <span className="tag">Required{decision.followUpDate ? ` by ${decision.followUpDate}` : ''}</span>
                  </section>
                )}
              </div>
              {decision.comments && <Md text={decision.comments} />}
              {decision.conditions?.length > 0 && (
                <>
                  <h4>Conditions</h4>
                  <ul>{decision.conditions.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
                </>
              )}
              {decision.blockers?.length > 0 && (
                <>
                  <h4>Blockers</h4>
                  <ul>{decision.blockers.map((b: string, i: number) => <li key={i} style={{ color: 'var(--vscode-testing-iconFailed, #f44336)' }}>{b}</li>)}</ul>
                </>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <CollapsibleSection title="Next Steps" count={nextSteps.length} sectionId="testreview-nextsteps">
          {nextSteps.map((ns: any, i: number) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{ns.priority ? `#${ns.priority}` : ''} {ns.step}</strong>
                {ns.timeline && <span className="tag">{ns.timeline}</span>}
              </div>
              {ns.owner && <span className="muted">Owner: {ns.owner}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Quality Assessment Sub-Assessments (bddFormat, testIds, priorityMarkers, etc.) */}
      {(() => {
        const subAssessmentKeys = ['bddFormat', 'testIds', 'priorityMarkers', 'hardWaits', 'determinism', 'isolation', 'fixturePatterns', 'assertions', 'errorHandling'];
        const subAssessmentLabels: Record<string, string> = {
          bddFormat: 'BDD Format', testIds: 'Test IDs', priorityMarkers: 'Priority Markers',
          hardWaits: 'Hard Waits', determinism: 'Determinism', isolation: 'Isolation',
          fixturePatterns: 'Fixture Patterns', assertions: 'Assertions', errorHandling: 'Error Handling'
        };
        const presentSubs = subAssessmentKeys.filter(k => qualityAssessment[k]?.score != null || qualityAssessment[k]?.notes);
        if (presentSubs.length === 0 || editMode) return null;
        return (
          <CollapsibleSection title="Detailed Quality Assessments" count={presentSubs.length} sectionId="testreview-subassessments">
            {presentSubs.map((key: string) => {
              const sub = qualityAssessment[key];
              return (
                <CollapsibleSection key={key} title={`${subAssessmentLabels[key] || key} — ${sub.score != null ? `${sub.score}/10` : 'N/A'}`} sectionId={`testreview-sub-${key}`}>
                  {sub.notes && <Md text={sub.notes} />}
                  {sub.coverage && <p><strong>Coverage:</strong> {sub.coverage}</p>}
                  {sub.distribution && (
                    <div className="detail-row">
                      {Object.entries(sub.distribution).map(([dk, dv]: [string, any]) => (
                        <section key={dk} className="detail-section inline"><h4>{dk.toUpperCase()}</h4><span className="tag">{dv}</span></section>
                      ))}
                    </div>
                  )}
                  {sub.examples?.length > 0 && (
                    <>
                      <h4>Examples</h4>
                      {sub.examples.map((ex: any, ei: number) => (
                        <div key={ei} style={{ padding: '4px 0' }}>
                          {ex.type && <span className={`tag ${ex.type === 'good' ? 'tag-success' : 'tag-danger'}`}>{ex.type}</span>}
                          {ex.location && <span className="muted" style={{ marginLeft: '4px' }}>{ex.location}</span>}
                          {ex.comment && <span style={{ marginLeft: '8px' }}>{ex.comment}</span>}
                          {ex.code && <pre style={{ margin: '4px 0', fontSize: '0.85em', overflow: 'auto' }}>{ex.code}</pre>}
                        </div>
                      ))}
                    </>
                  )}
                  {sub.instances?.length > 0 && (
                    <>
                      <h4>Instances</h4>
                      {sub.instances.map((inst: any, ii: number) => (
                        <div key={ii} style={{ padding: '4px 0' }}>
                          {inst.location && <strong>{inst.location}</strong>}
                          {inst.duration && <span className="tag" style={{ marginLeft: '4px' }}>{inst.duration}</span>}
                          {inst.recommendation && <div className="muted">{inst.recommendation}</div>}
                        </div>
                      ))}
                    </>
                  )}
                  {sub.flakyTests?.length > 0 && (
                    <>
                      <h4>Flaky Tests</h4>
                      {sub.flakyTests.map((ft: any, fi: number) => (
                        <div key={fi} style={{ padding: '4px 0' }}>
                          <strong>{ft.test || ft.location || `Test ${fi + 1}`}</strong>
                          {ft.reason && <div className="muted">Reason: {ft.reason}</div>}
                          {ft.recommendation && <div className="muted">Fix: {ft.recommendation}</div>}
                        </div>
                      ))}
                    </>
                  )}
                  {sub.sharedStateIssues?.length > 0 && (
                    <>
                      <h4>Shared State Issues</h4>
                      {sub.sharedStateIssues.map((si: any, sii: number) => (
                        <div key={sii} style={{ padding: '4px 0' }}>
                          <strong>{si.issue}</strong>
                          {si.location && <span className="muted"> ({si.location})</span>}
                          {si.impact && <div className="muted">Impact: {si.impact}</div>}
                          {si.fix && <div className="muted">Fix: {si.fix}</div>}
                        </div>
                      ))}
                    </>
                  )}
                  {sub.goodPatterns?.length > 0 && (
                    <>
                      <h4>Good Patterns</h4>
                      <ul>{sub.goodPatterns.map((gp: string, gi: number) => <li key={gi}>{gp}</li>)}</ul>
                    </>
                  )}
                  {sub.antiPatterns?.length > 0 && (
                    <>
                      <h4>Anti-Patterns</h4>
                      {sub.antiPatterns.map((ap: any, ai: number) => (
                        <div key={ai} style={{ padding: '4px 0' }}>
                          <strong>{typeof ap === 'string' ? ap : ap.pattern || JSON.stringify(ap)}</strong>
                          {ap.location && <span className="muted"> ({ap.location})</span>}
                          {ap.recommendation && <div className="muted">{ap.recommendation}</div>}
                        </div>
                      ))}
                    </>
                  )}
                  {sub.issues?.length > 0 && (
                    <>
                      <h4>Issues</h4>
                      <ul>{sub.issues.map((issue: any, ii: number) => (
                        <li key={ii}>{typeof issue === 'string' ? issue : `${issue.issue || ''}${issue.location ? ` (${issue.location})` : ''}${issue.recommendation ? ` — ${issue.recommendation}` : ''}`}</li>
                      ))}</ul>
                    </>
                  )}
                  {sub.nondeterministicPatterns?.length > 0 && (
                    <ul>{sub.nondeterministicPatterns.map((p: string, pi: number) => <li key={pi}>{p}</li>)}</ul>
                  )}
                  {sub.orderDependencies?.length > 0 && (
                    <>
                      <h4>Order Dependencies</h4>
                      <ul>{sub.orderDependencies.map((od: string, oi: number) => <li key={oi}>{od}</li>)}</ul>
                    </>
                  )}
                </CollapsibleSection>
              );
            })}
          </CollapsibleSection>
        );
      })()}

      {/* Best Practices Found */}
      {d.bestPracticesFound?.length > 0 && !editMode && (
        <CollapsibleSection title="Best Practices Found" count={d.bestPracticesFound.length} sectionId="testreview-bestpractices">
          {d.bestPracticesFound.map((bp: any, i: number) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <strong>{typeof bp === 'string' ? bp : bp.practice || JSON.stringify(bp)}</strong>
              {bp.location && <span className="muted"> ({bp.location})</span>}
              {bp.recommendation && <div className="muted">{bp.recommendation}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Test File Analysis */}
      {d.testFileAnalysis?.length > 0 && !editMode && (
        <CollapsibleSection title="Test File Analysis" count={d.testFileAnalysis.length} sectionId="testreview-fileanalysis">
          {d.testFileAnalysis.map((tf: any, i: number) => (
            <CollapsibleSection key={i} title={`${tf.file || `File ${i + 1}`}${tf.score != null ? ` — ${tf.score}/100` : ''}`} sectionId={`testreview-file-${i}`}>
              <div className="detail-row">
                {tf.testsCount != null && <section className="detail-section inline"><h4>Tests</h4><span className="tag">{tf.testsCount}</span></section>}
                {tf.linesOfCode != null && <section className="detail-section inline"><h4>LOC</h4><span className="tag">{tf.linesOfCode}</span></section>}
              </div>
              {tf.issues?.length > 0 && (
                <>
                  <h4>Issues</h4>
                  {tf.issues.map((issue: any, ii: number) => (
                    <div key={ii} style={{ padding: '2px 0' }}>
                      {issue.severity && <span className={`tag ${issue.severity === 'critical' ? 'tag-danger' : issue.severity === 'major' ? 'tag-warning' : ''}`}>{issue.severity}</span>}
                      {issue.line != null && <span className="muted" style={{ marginLeft: '4px' }}>L{issue.line}</span>}
                      <span style={{ marginLeft: '8px' }}>{issue.issue}</span>
                    </div>
                  ))}
                </>
              )}
              {tf.strengths?.length > 0 && (
                <><h4>Strengths</h4><ul>{tf.strengths.map((s: string, si: number) => <li key={si}>{s}</li>)}</ul></>
              )}
              {tf.recommendations?.length > 0 && (
                <><h4>Recommendations</h4><ul>{tf.recommendations.map((r: string, ri: number) => <li key={ri}>{r}</li>)}</ul></>
              )}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* Context & Integration */}
      {d.contextAndIntegration && !editMode && ((() => {
        const ci = d.contextAndIntegration;
        const hasContent = ci.integrationWithCI || ci.testDataManagement || ci.environmentHandling || ci.parallelization || ci.reporting || ci.ciPipelineHealth;
        if (!hasContent) return null;
        return (
          <CollapsibleSection title="Context & Integration" sectionId="testreview-context">
            {ci.integrationWithCI && <p><strong>CI Integration:</strong> {ci.integrationWithCI}</p>}
            {ci.ciPipelineHealth && (
              <div className="detail-row">
                {ci.ciPipelineHealth.averageDuration && <section className="detail-section inline"><h4>Avg Duration</h4><span className="tag">{ci.ciPipelineHealth.averageDuration}</span></section>}
                {ci.ciPipelineHealth.failureRate && <section className="detail-section inline"><h4>Failure Rate</h4><span className="tag">{ci.ciPipelineHealth.failureRate}</span></section>}
                {ci.ciPipelineHealth.flakinessRate && <section className="detail-section inline"><h4>Flakiness</h4><span className="tag">{ci.ciPipelineHealth.flakinessRate}</span></section>}
              </div>
            )}
            {ci.testDataManagement && <p><strong>Test Data:</strong> {ci.testDataManagement}</p>}
            {ci.environmentHandling && <p><strong>Environments:</strong> {ci.environmentHandling}</p>}
            {ci.parallelization && <p><strong>Parallelization:</strong> {ci.parallelization}</p>}
            {ci.reporting && <p><strong>Reporting:</strong> {ci.reporting}</p>}
          </CollapsibleSection>
        );
      })())}

      {/* Knowledge Base References */}
      {d.knowledgeBaseReferences?.length > 0 && !editMode && (
        <CollapsibleSection title="Knowledge Base References" count={d.knowledgeBaseReferences.length} sectionId="testreview-kbrefs">
          {d.knowledgeBaseReferences.map((kb: any, i: number) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <strong>{typeof kb === 'string' ? kb : kb.reference || JSON.stringify(kb)}</strong>
              {kb.relevance && <div className="muted">{kb.relevance}</div>}
              {kb.findingsRelated?.length > 0 && <div className="tags-list" style={{ marginTop: '2px' }}>{kb.findingsRelated.map((f: string, fi: number) => <span key={fi} className="tag">{f}</span>)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Appendix */}
      {d.appendix && !editMode && ((() => {
        const app = d.appendix;
        const hasAppendix = app.codeExamples?.length > 0 || app.toolOutput?.length > 0 || (app.metrics && Object.keys(app.metrics).length > 0);
        if (!hasAppendix) return null;
        return (
          <CollapsibleSection title="Appendix" sectionId="testreview-appendix">
            {app.codeExamples?.length > 0 && (
              <>
                <h4>Code Examples</h4>
                {app.codeExamples.map((ce: any, i: number) => (
                  <CollapsibleSection key={i} title={ce.title || `Example ${i + 1}`} sectionId={`testreview-codeex-${i}`}>
                    {ce.context && <p className="muted">{ce.context}</p>}
                    {ce.before && <><h4>Before</h4><pre style={{ fontSize: '0.85em', overflow: 'auto' }}>{ce.before}</pre></>}
                    {ce.after && <><h4>After</h4><pre style={{ fontSize: '0.85em', overflow: 'auto' }}>{ce.after}</pre></>}
                  </CollapsibleSection>
                ))}
              </>
            )}
            {app.toolOutput?.length > 0 && (
              <>
                <h4>Tool Output</h4>
                {app.toolOutput.map((to: any, i: number) => (
                  <div key={i} style={{ padding: '4px 0' }}>
                    {to.tool && <strong>{to.tool}</strong>}
                    {to.output && <pre style={{ fontSize: '0.85em', overflow: 'auto', margin: '4px 0' }}>{to.output}</pre>}
                  </div>
                ))}
              </>
            )}
          </CollapsibleSection>
        );
      })())}

      {/* Overall Assessment (legacy fallback) */}
      {!executiveSummary.assessment && (qualityAssessment.overallRating || qualityAssessment.summary) && (
        <CollapsibleSection title="Overall Assessment" sectionId="testreview-overall">
          {qualityAssessment.overallRating && <p><strong>Rating:</strong> <span className="tag">{qualityAssessment.overallRating}</span></p>}
          {qualityAssessment.summary && <Md text={qualityAssessment.summary} />}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// TEST FRAMEWORK DETAILS
// ==========================================================================

export function renderTestFrameworkDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, artifact } = props;
  const d: any = editedData;
  const framework = d.framework || {};
  const configuration = d.configuration || {};
  const directoryStructure = d.directoryStructure || {};
  const fixtures: any[] = d.fixtures || [];
  const helpers: any[] = d.helpers || [];
  const pageObjects: any[] = d.pageObjects || [];
  const mocking = d.mocking || {};
  const deps = d.dependencies || {};
  const scripts: any[] = d.scripts || [];
  const setupInstructions = d.setupInstructions || {};
  const bestPractices: any[] = d.bestPractices || [];

  const frameworkNames = ['playwright', 'cypress', 'jest', 'vitest', 'mocha', 'other'];

  return (
    <>
      {/* Framework Info */}
      <CollapsibleSection title="Framework" sectionId="testfwk-info">
        {editMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">Name</label>
                <select value={framework.name || ''} onChange={(e) => handleFieldChange('framework', { ...framework, name: e.target.value })} className="status-select">
                  <option value="">Select</option>
                  {frameworkNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">Version</label>
                <input type="text" value={framework.version || ''} onChange={(e) => handleFieldChange('framework', { ...framework, version: e.target.value })} placeholder="Version" />
              </div>
            </div>
            <div>
              <label className="field-label">Selection Rationale</label>
              <textarea value={framework.selectionRationale || ''} onChange={(e) => handleFieldChange('framework', { ...framework, selectionRationale: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
          </div>
        ) : (
          <>
            <div className="detail-row">
              {framework.name && <section className="detail-section inline"><h4>Name</h4><span className="tag">{framework.name}</span></section>}
              {framework.type && <section className="detail-section inline"><h4>Type</h4><span className="tag">{framework.type}</span></section>}
              {framework.version && <section className="detail-section inline"><h4>Version</h4><span className="tag">{framework.version}</span></section>}
            </div>
            {framework.selectionRationale && <p><strong>Rationale:</strong> {framework.selectionRationale}</p>}
            {framework.description && <Md text={framework.description} />}
            {framework.alternatives?.length > 0 && (
              <>
                <h4>Alternatives Considered</h4>
                {framework.alternatives.map((alt: any, i: number) => (
                  <div key={i} style={{ padding: '2px 0' }}>
                    <strong>{alt.name}</strong>
                    {alt.reason && <span className="muted"> — {alt.reason}</span>}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* Description fallback */}
      {!framework.name && artifact.description && !editMode && (
        <CollapsibleSection title="Description" sectionId="testfwk-description">
          <Md text={artifact.description} />
        </CollapsibleSection>
      )}

      {/* Configuration */}
      {(Object.keys(configuration).length > 0 || editMode) && (
        <CollapsibleSection title="Configuration" sectionId="testfwk-config">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Config File</label>
                  <input type="text" value={configuration.configFile || ''} onChange={(e) => handleFieldChange('configuration', { ...configuration, configFile: e.target.value })} placeholder="e.g. playwright.config.ts" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Base URL</label>
                  <input type="text" value={configuration.baseUrl || ''} onChange={(e) => handleFieldChange('configuration', { ...configuration, baseUrl: e.target.value })} placeholder="Base URL" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input type="checkbox" checked={!!configuration.typescript} onChange={(e) => handleFieldChange('configuration', { ...configuration, typescript: e.target.checked })} /> TypeScript
                </label>
              </div>
              <div>
                <label className="field-label">Reporters</label>
                {(configuration.reporters || []).map((r: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input type="text" value={r} onChange={(e) => {
                      const arr = [...(configuration.reporters || [])]; arr[i] = e.target.value;
                      handleFieldChange('configuration', { ...configuration, reporters: arr });
                    }} style={{ flex: 1 }} />
                    <button className="icon-button" onClick={() => handleFieldChange('configuration', { ...configuration, reporters: (configuration.reporters || []).filter((_: any, idx: number) => idx !== i) })}>{'\u2715'}</button>
                  </div>
                ))}
                <button className="add-item-button" onClick={() => handleFieldChange('configuration', { ...configuration, reporters: [...(configuration.reporters || []), ''] })}>+ Add Reporter</button>
              </div>
            </div>
          ) : (
            <>
              {Object.entries(configuration).map(([key, val]: [string, any]) => (
                <div key={key} style={{ padding: '4px 0' }}>
                  <strong>{key}:</strong>{' '}
                  {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : typeof val === 'string' ? val : <code style={{ fontSize: '0.85em' }}>{JSON.stringify(val, null, 2)}</code>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Directory Structure */}
      {directoryStructure.directories?.length > 0 && (
        <CollapsibleSection title="Directory Structure" sectionId="testfwk-dirs">
          {directoryStructure.rootDir && <p><strong>Root:</strong> <code>{directoryStructure.rootDir}</code></p>}
          {directoryStructure.directories.map((dir: any, i: number) => (
            <div key={i} style={{ padding: '4px 0' }}>
              <code>{dir.path}</code>
              {dir.purpose && <span className="muted"> — {dir.purpose}</span>}
              {dir.contents?.length > 0 && <div className="tags-list" style={{ marginTop: '2px' }}>{dir.contents.map((c: string, ci: number) => <span key={ci} className="tag">{c}</span>)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Fixtures */}
      {fixtures.length > 0 && (
        <CollapsibleSection title="Fixtures" count={fixtures.length} sectionId="testfwk-fixtures">
          {fixtures.map((f: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <strong>{f.name}</strong>
                {f.scope && <span className="tag">{f.scope}</span>}
              </div>
              {f.purpose && <div className="muted">{f.purpose}</div>}
              {f.filePath && <div><code>{f.filePath}</code></div>}
              {f.dependencies?.length > 0 && <div className="tags-list" style={{ marginTop: '2px' }}>{f.dependencies.map((dep: string, di: number) => <span key={di} className="tag">{dep}</span>)}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Helpers */}
      {helpers.length > 0 && (
        <CollapsibleSection title="Helpers" count={helpers.length} sectionId="testfwk-helpers">
          {helpers.map((h: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
              <strong>{h.name}</strong>
              {h.filePath && <div><code>{h.filePath}</code></div>}
              {h.purpose && <div className="muted">{h.purpose}</div>}
              {h.functions?.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  {h.functions.map((fn: any, fi: number) => (
                    <div key={fi} style={{ padding: '2px 0' }}>
                      <code>{fn.signature || fn.name}</code>
                      {fn.description && <span className="muted"> — {fn.description}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Page Objects */}
      {pageObjects.length > 0 && (
        <CollapsibleSection title="Page Objects" count={pageObjects.length} sectionId="testfwk-pages">
          {pageObjects.map((po: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
              <strong>{po.name}</strong>
              {po.page && <span className="tag" style={{ marginLeft: '8px' }}>{po.page}</span>}
              {po.filePath && <div><code>{po.filePath}</code></div>}
              {po.elements?.length > 0 && <div><strong>Elements:</strong> {po.elements.join(', ')}</div>}
              {po.actions?.length > 0 && <div><strong>Actions:</strong> {po.actions.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Mocking */}
      {(mocking.strategy || mocking.libraries?.length) && (
        <CollapsibleSection title="Mocking" sectionId="testfwk-mocking">
          {mocking.strategy && <p><strong>Strategy:</strong> {mocking.strategy}</p>}
          {mocking.libraries?.length > 0 && (
            <div className="tags-list">
              {mocking.libraries.map((lib: string, i: number) => <span key={i} className="tag">{lib}</span>)}
            </div>
          )}
          {mocking.mockFiles?.length > 0 && (
            <>
              <h4>Mock Files</h4>
              {mocking.mockFiles.map((mf: any, i: number) => (
                <div key={i} style={{ padding: '2px 0' }}>
                  <code>{mf.path}</code>
                  {mf.purpose && <span className="muted"> — {mf.purpose}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Scripts */}
      {scripts.length > 0 && (
        <CollapsibleSection title="Scripts" count={scripts.length} sectionId="testfwk-scripts">
          {scripts.map((s: any, i: number) => (
            <div key={i} style={{ padding: '4px 0' }}>
              <code>{s.name}: {s.command}</code>
              {s.purpose && <div className="muted">{s.purpose}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Dependencies */}
      {(deps.production?.length > 0 || deps.development?.length > 0 || framework.dependencies?.length > 0) && (
        <CollapsibleSection title="Dependencies" sectionId="testfwk-deps-list">
          {/* Legacy flat deps */}
          {framework.dependencies?.length > 0 && (
            <div className="tags-list">
              {framework.dependencies.map((dep: string, i: number) => <span key={i} className="tag">{dep}</span>)}
            </div>
          )}
          {deps.production?.length > 0 && (
            <>
              <h4>Production</h4>
              {deps.production.map((dep: any, i: number) => (
                <div key={i} style={{ padding: '2px 0' }}>
                  <span className="tag">{dep.name}{dep.version ? `@${dep.version}` : ''}</span>
                  {dep.purpose && <span className="muted" style={{ marginLeft: '8px' }}>{dep.purpose}</span>}
                </div>
              ))}
            </>
          )}
          {deps.development?.length > 0 && (
            <>
              <h4>Development</h4>
              {deps.development.map((dep: any, i: number) => (
                <div key={i} style={{ padding: '2px 0' }}>
                  <span className="tag">{dep.name}{dep.version ? `@${dep.version}` : ''}</span>
                  {dep.purpose && <span className="muted" style={{ marginLeft: '8px' }}>{dep.purpose}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Setup Instructions */}
      {(setupInstructions.prerequisites?.length || setupInstructions.runCommands?.length) && (
        <CollapsibleSection title="Setup Instructions" sectionId="testfwk-setup">
          {setupInstructions.prerequisites?.length > 0 && (
            <>
              <h4>Prerequisites</h4>
              <ul>{setupInstructions.prerequisites.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
            </>
          )}
          {setupInstructions.installationSteps?.length > 0 && (
            <>
              <h4>Installation Steps</h4>
              <ol>{setupInstructions.installationSteps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol>
            </>
          )}
          {setupInstructions.runCommands?.length > 0 && (
            <>
              <h4>Run Commands</h4>
              {setupInstructions.runCommands.map((cmd: any, i: number) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <code>{cmd.command}</code>
                  {cmd.description && <span className="muted"> — {cmd.description}</span>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Best Practices */}
      {bestPractices.length > 0 && (
        <CollapsibleSection title="Best Practices" count={bestPractices.length} sectionId="testfwk-bestpractices">
          {bestPractices.map((bp: any, i: number) => (
            <div key={i} style={{ padding: '4px 0' }}>
              <strong>{bp.practice}</strong>
              {bp.implementation && <div className="muted">{bp.implementation}</div>}
              {bp.reference && <div className="muted"><em>Ref: {bp.reference}</em></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// TEST SUMMARY DETAILS
// ==========================================================================

export function renderTestSummaryDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, artifact } = props;
  const d: any = editedData;

  // ---- Detect BMM-style test execution report vs TEA-style test generation summary ----
  // BMM report has: reportTitle, reportPeriod, executiveSummary (string), overallResults, testsByType, testsByEpic, etc.
  // TEA summary has: summary.frameworkUsed, generatedTests[], testPatterns[], coverageAnalysis.priorCoverage, etc.
  const isBmmReport = !!(d.reportTitle || d.reportPeriod || d.overallResults || d.testsByType || d.testsByEpic);

  // ---- BMM report fields ----
  const overallResults = d.overallResults || {};
  const testsByType: any[] = d.testsByType || [];
  const testsByEpic: any[] = d.testsByEpic || [];
  const coverageByPackage: any[] = d.coverageByPackage || [];
  const defectsFound: any[] = d.defectsFound || [];

  // ---- Normalize recommendations: sample has plain strings, renderer expects objects ----
  const rawRecs: any[] = d.recommendations || [];
  const recommendations: any[] = rawRecs.map((r: any) => typeof r === 'string' ? { recommendation: r } : r);

  // ---- TEA-style fields ----
  const summary = d.summary || {};
  const coverageAnalysis = d.coverageAnalysis || {};
  const generatedTests: any[] = d.generatedTests || [];
  const testPatterns: any[] = d.testPatterns || [];
  const executionNotes = d.executionNotes || {};

  return (
    <>
      {/* BMM Report: Title & Period */}
      {isBmmReport && (d.reportTitle || d.reportPeriod) && !editMode && (
        <CollapsibleSection title="Report Info" sectionId="testsummary-reportinfo">
          {d.reportTitle && <p><strong>{d.reportTitle}</strong></p>}
          {d.reportPeriod && (
            <div className="detail-row">
              {d.reportPeriod.startDate && <section className="detail-section inline"><h4>Start</h4><span className="tag">{d.reportPeriod.startDate}</span></section>}
              {d.reportPeriod.endDate && <section className="detail-section inline"><h4>End</h4><span className="tag">{d.reportPeriod.endDate}</span></section>}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* BMM Report: Executive Summary */}
      {isBmmReport && d.executiveSummary && !editMode && (
        <CollapsibleSection title="Executive Summary" sectionId="testsummary-execsummary">
          <Md text={typeof d.executiveSummary === 'string' ? d.executiveSummary : d.executiveSummary.assessment || JSON.stringify(d.executiveSummary)} />
        </CollapsibleSection>
      )}

      {/* BMM Report: Overall Results */}
      {isBmmReport && (overallResults.totalTests != null || overallResults.passRate != null) && !editMode && (
        <CollapsibleSection title="Overall Results" sectionId="testsummary-overall">
          <div className="detail-row">
            {overallResults.totalTests != null && <section className="detail-section inline"><h4>Total</h4><span className="tag">{overallResults.totalTests}</span></section>}
            {overallResults.passed != null && <section className="detail-section inline"><h4>Passed</h4><span className="tag">{overallResults.passed}</span></section>}
            {overallResults.failed != null && <section className="detail-section inline"><h4>Failed</h4><span className="tag tag-danger">{overallResults.failed}</span></section>}
            {overallResults.skipped != null && <section className="detail-section inline"><h4>Skipped</h4><span className="tag">{overallResults.skipped}</span></section>}
            {overallResults.passRate != null && <section className="detail-section inline"><h4>Pass Rate</h4><span className="tag">{overallResults.passRate}%</span></section>}
            {overallResults.coveragePercentage != null && <section className="detail-section inline"><h4>Coverage</h4><span className="tag">{overallResults.coveragePercentage}%</span></section>}
          </div>
        </CollapsibleSection>
      )}

      {/* BMM Report: Tests by Type */}
      {isBmmReport && testsByType.length > 0 && !editMode && (
        <CollapsibleSection title="Tests by Type" count={testsByType.length} sectionId="testsummary-bytype">
          {testsByType.map((t: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{t.type || `Type ${i + 1}`}</strong>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {t.total != null && <span className="tag">{t.total} total</span>}
                  {t.passed != null && <span className="tag">{t.passed} pass</span>}
                  {t.failed != null && t.failed > 0 && <span className="tag tag-danger">{t.failed} fail</span>}
                  {t.passRate != null && <span className="tag">{t.passRate}%</span>}
                </div>
              </div>
              {t.notes && <div className="muted" style={{ marginTop: '2px' }}>{t.notes}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* BMM Report: Tests by Epic */}
      {isBmmReport && testsByEpic.length > 0 && !editMode && (
        <CollapsibleSection title="Tests by Epic" count={testsByEpic.length} sectionId="testsummary-byepic">
          {testsByEpic.map((e: any, i: number) => (
            <CollapsibleSection key={i} title={e.epic || `Epic ${i + 1}`} sectionId={`testsummary-epic-${i}`}>
              {e.stories?.map((s: any, si: number) => (
                <div key={si} style={{ padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><strong>{s.storyId}</strong> {s.storyTitle}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {s.totalTests != null && <span className="tag">{s.totalTests} tests</span>}
                      {s.passRate != null && <span className="tag">{s.passRate}%</span>}
                      {s.failed != null && s.failed > 0 && <span className="tag tag-danger">{s.failed} fail</span>}
                    </div>
                  </div>
                  {s.notes && <div className="muted" style={{ marginTop: '2px' }}>{s.notes}</div>}
                </div>
              ))}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* BMM Report: Coverage by Package */}
      {isBmmReport && coverageByPackage.length > 0 && !editMode && (
        <CollapsibleSection title="Coverage by Package" count={coverageByPackage.length} sectionId="testsummary-covpkg">
          {coverageByPackage.map((pkg: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
              <strong>{pkg.package || `Package ${i + 1}`}</strong>
              <div className="detail-row" style={{ marginTop: '4px' }}>
                {pkg.lineCoverage != null && <section className="detail-section inline"><h4>Line</h4><span className="tag">{pkg.lineCoverage}%</span></section>}
                {pkg.branchCoverage != null && <section className="detail-section inline"><h4>Branch</h4><span className="tag">{pkg.branchCoverage}%</span></section>}
                {pkg.functionCoverage != null && <section className="detail-section inline"><h4>Function</h4><span className="tag">{pkg.functionCoverage}%</span></section>}
              </div>
              {pkg.uncoveredAreas?.length > 0 && <div className="muted" style={{ marginTop: '2px' }}>Gaps: {pkg.uncoveredAreas.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* BMM Report: Defects Found */}
      {isBmmReport && defectsFound.length > 0 && !editMode && (
        <CollapsibleSection title="Defects Found" count={defectsFound.length} sectionId="testsummary-defects">
          {defectsFound.map((bug: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><strong>{bug.id || `Bug ${i + 1}`}</strong> {bug.title}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {bug.severity && <span className={`tag ${bug.severity === 'critical' || bug.severity === 'high' ? 'tag-danger' : ''}`}>{bug.severity}</span>}
                  {bug.status && <span className="tag">{bug.status}</span>}
                </div>
              </div>
              {bug.assignee && <div className="muted">Assignee: {bug.assignee}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* BMM Report: Next Sprint Test Plan */}
      {isBmmReport && d.nextSprintTestPlan && !editMode && (
        <CollapsibleSection title="Next Sprint Test Plan" sectionId="testsummary-nextsprint">
          <Md text={d.nextSprintTestPlan} />
        </CollapsibleSection>
      )}
      {/* Summary */}
      <CollapsibleSection title="Summary" sectionId="testsummary-summary">
        {editMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">Framework</label>
                <input type="text" value={summary.frameworkUsed || ''} onChange={(e) => handleFieldChange('summary', { ...summary, frameworkUsed: e.target.value })} placeholder="e.g. Jest, Playwright" />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">Tests Generated</label>
                <input type="number" value={summary.totalTestsGenerated ?? ''} onChange={(e) => handleFieldChange('summary', { ...summary, totalTestsGenerated: e.target.value ? parseInt(e.target.value) : undefined })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">Files Created</label>
                <input type="number" value={summary.totalFilesCreated ?? ''} onChange={(e) => handleFieldChange('summary', { ...summary, totalFilesCreated: e.target.value ? parseInt(e.target.value) : undefined })} />
              </div>
            </div>
            <div>
              <label className="field-label">Scope</label>
              <textarea value={summary.scope || ''} onChange={(e) => handleFieldChange('summary', { ...summary, scope: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label">Testing Approach</label>
              <textarea value={summary.testingApproach || ''} onChange={(e) => handleFieldChange('summary', { ...summary, testingApproach: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="field-label">Target Features</label>
              {(summary.targetFeatures || []).map((f: string, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <input type="text" value={f} onChange={(e) => {
                    const arr = [...(summary.targetFeatures || [])]; arr[i] = e.target.value;
                    handleFieldChange('summary', { ...summary, targetFeatures: arr });
                  }} style={{ flex: 1 }} />
                  <button className="icon-button" onClick={() => handleFieldChange('summary', { ...summary, targetFeatures: (summary.targetFeatures || []).filter((_: any, idx: number) => idx !== i) })}>{'\u2715'}</button>
                </div>
              ))}
              <button className="add-item-button" onClick={() => handleFieldChange('summary', { ...summary, targetFeatures: [...(summary.targetFeatures || []), ''] })}>+ Add Feature</button>
            </div>
          </div>
        ) : (
          <>
            <div className="detail-row">
              {summary.frameworkUsed && <section className="detail-section inline"><h4>Framework</h4><span className="tag">{summary.frameworkUsed}</span></section>}
              {summary.totalTestsGenerated != null && <section className="detail-section inline"><h4>Tests Generated</h4><span className="tag">{summary.totalTestsGenerated}</span></section>}
              {summary.totalFilesCreated != null && <section className="detail-section inline"><h4>Files Created</h4><span className="tag">{summary.totalFilesCreated}</span></section>}
            </div>
            {summary.scope && <p><strong>Scope:</strong> {summary.scope}</p>}
            {summary.testingApproach && <p><strong>Approach:</strong> {summary.testingApproach}</p>}
            {summary.targetFeatures?.length > 0 && (
              <>
                <h4>Target Features</h4>
                <div className="tags-list">{summary.targetFeatures.map((f: string, i: number) => <span key={i} className="tag">{f}</span>)}</div>
              </>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* Description fallback */}
      {artifact.description && !editMode && !summary.scope && (
        <CollapsibleSection title="Description" sectionId="testsummary-description">
          <Md text={artifact.description} />
        </CollapsibleSection>
      )}

      {/* Coverage Analysis */}
      {(coverageAnalysis.priorCoverage || coverageAnalysis.targetCoverage || coverageAnalysis.gapsIdentified?.length || editMode) && (
        <CollapsibleSection title="Coverage Analysis" sectionId="testsummary-coverage">
          {editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4>Prior Coverage</h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['statement', 'branch', 'function', 'line'].map(key => (
                  <div key={key} style={{ flex: 1 }}>
                    <label className="field-label">{key}</label>
                    <input type="text" value={(coverageAnalysis.priorCoverage || {})[key] || ''} onChange={(e) => {
                      handleFieldChange('coverageAnalysis', { ...coverageAnalysis, priorCoverage: { ...(coverageAnalysis.priorCoverage || {}), [key]: e.target.value } });
                    }} placeholder="e.g. 80%" />
                  </div>
                ))}
              </div>
              <h4>Target Coverage</h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['statement', 'branch', 'function', 'line'].map(key => (
                  <div key={key} style={{ flex: 1 }}>
                    <label className="field-label">{key}</label>
                    <input type="text" value={(coverageAnalysis.targetCoverage || {})[key] || ''} onChange={(e) => {
                      handleFieldChange('coverageAnalysis', { ...coverageAnalysis, targetCoverage: { ...(coverageAnalysis.targetCoverage || {}), [key]: e.target.value } });
                    }} placeholder="e.g. 90%" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {coverageAnalysis.priorCoverage && (
                <div style={{ marginBottom: '8px' }}>
                  <h4>Prior Coverage</h4>
                  <div className="detail-row">
                    {Object.entries(coverageAnalysis.priorCoverage).map(([k, v]: [string, any]) => (
                      <section key={k} className="detail-section inline"><h4>{k}</h4><span className="tag">{v}</span></section>
                    ))}
                  </div>
                </div>
              )}
              {coverageAnalysis.targetCoverage && (
                <div style={{ marginBottom: '8px' }}>
                  <h4>Target Coverage</h4>
                  <div className="detail-row">
                    {Object.entries(coverageAnalysis.targetCoverage).map(([k, v]: [string, any]) => (
                      <section key={k} className="detail-section inline"><h4>{k}</h4><span className="tag">{v}</span></section>
                    ))}
                  </div>
                </div>
              )}
              {coverageAnalysis.gapsIdentified?.length > 0 && (
                <>
                  <h4>Gaps Identified</h4>
                  {coverageAnalysis.gapsIdentified.map((g: any, i: number) => (
                    <div key={i} style={{ padding: '4px 0' }}>
                      <strong>{g.area}</strong>
                      {g.priority && <span className="tag" style={{ marginLeft: '8px' }}>{g.priority}</span>}
                      {g.description && <div className="muted">{g.description}</div>}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Generated Tests */}
      {(generatedTests.length > 0 || editMode) && (
        <CollapsibleSection title="Generated Tests" count={generatedTests.length} sectionId="testsummary-generated">
          {generatedTests.map((t: any, i: number) => (
            <CollapsibleSection
              key={t.filePath || i}
              title={`${t.filePath || `Test File ${i + 1}`}${t.testCount ? ` (${t.testCount} tests)` : ''}`}
              sectionId={`testsummary-test-${i}`}
            >
              {editMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label className="field-label">File Path</label>
                      <input type="text" value={t.filePath || ''} onChange={(e) => {
                        const updated = [...generatedTests]; updated[i] = { ...t, filePath: e.target.value };
                        handleFieldChange('generatedTests', updated);
                      }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="field-label">Target File</label>
                      <input type="text" value={t.targetFile || ''} onChange={(e) => {
                        const updated = [...generatedTests]; updated[i] = { ...t, targetFile: e.target.value };
                        handleFieldChange('generatedTests', updated);
                      }} />
                    </div>
                    <button className="icon-button" style={{ alignSelf: 'flex-end' }} onClick={() => handleFieldChange('generatedTests', generatedTests.filter((_: any, idx: number) => idx !== i))} title="Remove">{'\u2715'}</button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div>
                      <label className="field-label">Test Type</label>
                      <select value={t.testType || ''} onChange={(e) => {
                        const updated = [...generatedTests]; updated[i] = { ...t, testType: e.target.value };
                        handleFieldChange('generatedTests', updated);
                      }} className="status-select">
                        <option value="">Type</option>
                        {['unit', 'integration', 'component', 'api', 'e2e'].map(tt => <option key={tt} value={tt}>{tt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Test Count</label>
                      <input type="number" value={t.testCount ?? ''} onChange={(e) => {
                        const updated = [...generatedTests]; updated[i] = { ...t, testCount: e.target.value ? parseInt(e.target.value) : undefined };
                        handleFieldChange('generatedTests', updated);
                      }} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {t.targetFile && <p><strong>Tests:</strong> <code>{t.targetFile}</code></p>}
                  {t.testType && <p><strong>Type:</strong> <span className="tag">{t.testType}</span></p>}
                  {t.description && <Md text={t.description} />}
                  {t.testCases?.length > 0 && (
                    <>
                      <h4>Test Cases</h4>
                      <ul>{t.testCases.map((tc: any, tci: number) => (
                        <li key={tci}>
                          <strong>{tc.name}</strong>
                          {tc.category && <span className="tag" style={{ marginLeft: '8px' }}>{tc.category}</span>}
                          {tc.description && <div className="muted">{tc.description}</div>}
                        </li>
                      ))}</ul>
                    </>
                  )}
                  {t.patternsUsed?.length > 0 && (
                    <div className="tags-list" style={{ marginTop: '8px' }}>
                      {t.patternsUsed.map((p: string, pi: number) => <span key={pi} className="tag">{p}</span>)}
                    </div>
                  )}
                  {t.file && <p><strong>File:</strong> <code>{t.file}</code></p>}
                  {t.status && <p><strong>Status:</strong> <span className="tag">{t.status}</span></p>}
                </>
              )}
            </CollapsibleSection>
          ))}
          {editMode && (
            <button className="add-item-button" onClick={() => handleFieldChange('generatedTests', [...generatedTests, { filePath: '', targetFile: '', testType: '', testCount: undefined }])}>+ Add Test File</button>
          )}
        </CollapsibleSection>
      )}

      {/* Test Patterns */}
      {testPatterns.length > 0 && (
        <CollapsibleSection title="Test Patterns" count={testPatterns.length} sectionId="testsummary-patterns">
          {testPatterns.map((p: any, i: number) => (
            <div key={i} style={{ padding: '6px', borderRadius: '4px', background: 'var(--vscode-editor-inactiveSelectionBackground)', marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{p.pattern}</strong>
                {p.usageCount != null && <span className="tag">Used {p.usageCount}x</span>}
              </div>
              {p.description && <div className="muted">{p.description}</div>}
              {p.examples?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Examples: {p.examples.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <CollapsibleSection title="Recommendations" count={recommendations.length} sectionId="testsummary-recs">
          {recommendations.map((r: any, i: number) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--vscode-widget-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{r.area || r.recommendation}</strong>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {r.priority && <span className="tag">{r.priority}</span>}
                  {r.effort && <span className="tag">{r.effort}</span>}
                </div>
              </div>
              {r.recommendation && r.area && <div>{r.recommendation}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Execution Notes */}
      {(executionNotes.runCommand || executionNotes.prerequisites?.length) && (
        <CollapsibleSection title="Execution Notes" sectionId="testsummary-execution">
          {executionNotes.runCommand && <p><strong>Run:</strong> <code>{executionNotes.runCommand}</code></p>}
          {executionNotes.prerequisites?.length > 0 && (
            <>
              <h4>Prerequisites</h4>
              <ul>{executionNotes.prerequisites.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
            </>
          )}
          {executionNotes.knownIssues?.length > 0 && (
            <>
              <h4>Known Issues</h4>
              <ul>{executionNotes.knownIssues.map((issue: string, i: number) => <li key={i}>{issue}</li>)}</ul>
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// TEST COVERAGE DETAILS (consolidated card with all TCs as expandable sections)
// ==========================================================================

export function renderTestCoverageDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const testCases: any[] = d.testCases || [];
  const totalCount = d.totalCount ?? testCases.length;
  const passCount = d.passCount ?? 0;
  const failCount = d.failCount ?? 0;
  const draftCount = d.draftCount ?? 0;
  const pct = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

  return (
    <>
      {/* Coverage Summary */}
      <CollapsibleSection title="Coverage Summary" sectionId="tc-cov-summary" defaultCollapsed={false}>
        {editMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 100px' }}>
                <label className="field-label">Total</label>
                <input type="number" value={d.totalCount ?? ''} onChange={(e) => handleFieldChange('totalCount', e.target.value ? parseInt(e.target.value) : undefined)} />
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label className="field-label">Pass</label>
                <input type="number" value={d.passCount ?? ''} onChange={(e) => handleFieldChange('passCount', e.target.value ? parseInt(e.target.value) : undefined)} />
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label className="field-label">Fail</label>
                <input type="number" value={d.failCount ?? ''} onChange={(e) => handleFieldChange('failCount', e.target.value ? parseInt(e.target.value) : undefined)} />
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <label className="field-label">Draft</label>
                <input type="number" value={d.draftCount ?? ''} onChange={(e) => handleFieldChange('draftCount', e.target.value ? parseInt(e.target.value) : undefined)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">Story ID</label>
                <input type="text" value={d.storyId || ''} onChange={(e) => handleFieldChange('storyId', e.target.value)} placeholder="Story ID" />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">Epic ID</label>
                <input type="text" value={d.epicId || ''} onChange={(e) => handleFieldChange('epicId', e.target.value)} placeholder="Epic ID" />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span className="tag">{totalCount} total</span>
              <span className="tag" style={{ background: 'var(--vscode-testing-iconPassed, #4caf50)', color: '#fff' }}>{passCount} pass</span>
              <span className="tag" style={{ background: 'var(--vscode-testing-iconFailed, #f44336)', color: '#fff' }}>{failCount} fail</span>
              <span className="tag">{draftCount} draft</span>
            </div>
            <p><strong>Pass Rate:</strong> {pct}%</p>
            {d.storyId && <p><strong>Story:</strong> <code>{d.storyId}</code></p>}
            {d.epicId && <p><strong>Epic:</strong> <code>{d.epicId}</code></p>}
          </>
        )}
      </CollapsibleSection>

      {/* Individual Test Cases as expandable sections */}
      {(testCases.length > 0 || editMode) && (
        <CollapsibleSection title="Test Cases" count={testCases.length} sectionId="tc-cov-cases" defaultCollapsed={false}>
          {testCases.map((tc: any, i: number) => {
            const tcStatus = tc.status || 'draft';
            const statusColor =
              tcStatus === 'complete' || tcStatus === 'completed' || tcStatus === 'done' || tcStatus === 'passed' ? 'var(--vscode-testing-iconPassed, #4caf50)' :
              tcStatus === 'blocked' || tcStatus === 'rejected' || tcStatus === 'failed' ? 'var(--vscode-testing-iconFailed, #f44336)' :
              tcStatus === 'in-progress' || tcStatus === 'implementing' ? 'var(--vscode-charts-yellow, #e8a838)' :
              'var(--vscode-descriptionForeground)';
            return (
              <CollapsibleSection
                key={tc.id || i}
                title={`${tc.id || `TC-${i + 1}`}: ${tc.title || 'Untitled'}`}
                sectionId={`tc-cov-case-${tc.id || i}`}
              >
                {editMode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label className="field-label">ID</label>
                        <input type="text" value={tc.id || ''} onChange={(e) => {
                          const updated = [...testCases]; updated[i] = { ...tc, id: e.target.value };
                          handleFieldChange('testCases', updated);
                        }} />
                      </div>
                      <div style={{ flex: 2 }}>
                        <label className="field-label">Title</label>
                        <input type="text" value={tc.title || ''} onChange={(e) => {
                          const updated = [...testCases]; updated[i] = { ...tc, title: e.target.value };
                          handleFieldChange('testCases', updated);
                        }} />
                      </div>
                      <button className="icon-button" style={{ alignSelf: 'flex-end' }} onClick={() => handleFieldChange('testCases', testCases.filter((_: any, idx: number) => idx !== i))} title="Remove">{'\u2715'}</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label className="field-label">Status</label>
                        <select value={tc.status || ''} onChange={(e) => {
                          const updated = [...testCases]; updated[i] = { ...tc, status: e.target.value };
                          handleFieldChange('testCases', updated);
                        }} className="status-select">
                          <option value="">Status</option>
                          {['draft', 'in-progress', 'passed', 'failed', 'blocked'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="field-label">Type</label>
                        <input type="text" value={tc.type || ''} onChange={(e) => {
                          const updated = [...testCases]; updated[i] = { ...tc, type: e.target.value };
                          handleFieldChange('testCases', updated);
                        }} placeholder="Type" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="field-label">Priority</label>
                        <input type="text" value={tc.priority || ''} onChange={(e) => {
                          const updated = [...testCases]; updated[i] = { ...tc, priority: e.target.value };
                          handleFieldChange('testCases', updated);
                        }} placeholder="Priority" />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Description</label>
                      <textarea value={tc.description || ''} onChange={(e) => {
                        const updated = [...testCases]; updated[i] = { ...tc, description: e.target.value };
                        handleFieldChange('testCases', updated);
                      }} rows={2} style={{ width: '100%' }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <p><strong>Status:</strong> <span className="tag" style={{ background: statusColor, color: '#fff' }}>{tcStatus}</span></p>
                    {tc.type && <p><strong>Type:</strong> <span className="tag">{tc.type}</span></p>}
                    {tc.priority && <p><strong>Priority:</strong> <span className="tag">{tc.priority}</span></p>}
                    {tc.description && (
                      <>
                        <h4>Description</h4>
                        <Md text={tc.description} />
                      </>
                    )}
                    {tc.preconditions && (
                      <>
                        <h4>Preconditions</h4>
                        {typeof tc.preconditions === 'string'
                          ? <Md text={tc.preconditions} />
                          : <ul>{(Array.isArray(tc.preconditions) ? tc.preconditions : []).map((p: string, pi: number) => <li key={pi}>{p}</li>)}</ul>
                        }
                      </>
                    )}
                    {tc.steps && tc.steps.length > 0 && (
                      <>
                        <h4>Steps</h4>
                        <ol>{(Array.isArray(tc.steps) ? tc.steps : []).map((step: any, si: number) => (
                          <li key={si}>{typeof step === 'string' ? step : (step.action || step.description || JSON.stringify(step))}</li>
                        ))}</ol>
                      </>
                    )}
                    {tc.expectedResult && (
                      <>
                        <h4>Expected Result</h4>
                        <Md text={typeof tc.expectedResult === 'string' ? tc.expectedResult : JSON.stringify(tc.expectedResult)} />
                      </>
                    )}
                    {tc.tags && tc.tags.length > 0 && (
                      <p><strong>Tags:</strong> {tc.tags.map((t: string, ti: number) => <span key={ti} className="tag">{t}</span>)}</p>
                    )}
                    {tc.relatedRequirements && tc.relatedRequirements.length > 0 && (
                      <p><strong>Related Reqs:</strong> {tc.relatedRequirements.map((r: string, ri: number) => <code key={ri} style={{ marginRight: '4px' }}>{r}</code>)}</p>
                    )}
                  </>
                )}
              </CollapsibleSection>
            );
          })}
          {editMode && (
            <button className="add-item-button" onClick={() => handleFieldChange('testCases', [...testCases, { id: '', title: '', status: 'draft', type: '', description: '' }])}>+ Add Test Case</button>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}
