// ==========================================================================
// TEA RENDERERS — Test Engineering & Automation renderers
// Contains: traceability-matrix, atdd-checklist, ci-pipeline,
//   automation-summary, nfr-assessment
// ==========================================================================

import { RendererProps, CollapsibleSection, Md } from './shared';
import './renderers.css';

// ==========================================================================
// TRACEABILITY MATRIX DETAILS
// ==========================================================================

export function renderTraceabilityMatrixDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const storyInfo = d.storyInfo || {};
  const traceability = d.traceability || {};
  const coverageSummary = traceability.coverageSummary || {};
  const detailedMapping: any[] = traceability.detailedMapping || [];
  const gapAnalysis = traceability.gapAnalysis || {};
  const qualityAssessment = traceability.qualityAssessment || {};
  const gateDecision = d.gateDecision || {};
  const relatedArtifacts: any[] = d.relatedArtifacts || [];
  const signOff = d.signOff || {};

  const statusColor = (s: string) => {
    if (s === 'PASS' || s === 'pass') return 'var(--vscode-testing-iconPassed)';
    if (s === 'FAIL' || s === 'fail') return 'var(--vscode-errorForeground)';
    if (s === 'CONCERNS' || s === 'warn') return 'var(--vscode-editorWarning-foreground)';
    return undefined;
  };

  return (
    <>
      {/* Story Info */}
      {(storyInfo.storyId || storyInfo.storyTitle) && (
        <CollapsibleSection title="Story Info" sectionId="tm-story">
          {editMode ? (
            <div className="edit-grid">
              <label>Story ID</label>
              <input value={storyInfo.storyId || ''} onChange={(e) => handleFieldChange('storyInfo', { ...storyInfo, storyId: e.target.value })} />
              <label>Story Title</label>
              <input value={storyInfo.storyTitle || ''} onChange={(e) => handleFieldChange('storyInfo', { ...storyInfo, storyTitle: e.target.value })} />
              <label>Epic ID</label>
              <input value={storyInfo.epicId || ''} onChange={(e) => handleFieldChange('storyInfo', { ...storyInfo, epicId: e.target.value })} />
              <label>Evaluator</label>
              <input value={storyInfo.evaluator || ''} onChange={(e) => handleFieldChange('storyInfo', { ...storyInfo, evaluator: e.target.value })} />
            </div>
          ) : (
            <>
              <div><strong>{storyInfo.storyId}</strong>: {storyInfo.storyTitle}</div>
              {storyInfo.epicId && <div className="rr-muted">Epic: {storyInfo.epicId} {storyInfo.epicTitle && `— ${storyInfo.epicTitle}`}</div>}
              {storyInfo.evaluator && <div className="rr-muted">Evaluator: {storyInfo.evaluator} {storyInfo.evaluationDate && `(${storyInfo.evaluationDate})`}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Coverage Summary */}
      {coverageSummary.overall && (
        <CollapsibleSection title="Coverage Summary" sectionId="tm-coverage">
          <div className="rr-flex rr-gap-12 rr-wrap rr-mb-4">
            {['p0', 'p1', 'p2', 'p3'].map(p => {
              const data = coverageSummary[p];
              return data ? (
                <div key={p} className="rr-text-center">
                  <strong>{p.toUpperCase()}</strong>
                  <div className="rr-text-xl rr-bold">{data.percentage != null ? `${data.percentage}%` : '—'}</div>
                  <div className="rr-text-sm rr-muted">{data.covered}/{data.total}</div>
                  {data.status && <span className="tag" style={{ backgroundColor: statusColor(data.status) }}>{data.status}</span>}
                </div>
              ) : null;
            })}
            {coverageSummary.overall && (
              <div className="rr-text-center rr-border-l rr-pl-12">
                <strong>Overall</strong>
                <div className="rr-text-xl rr-bold">{coverageSummary.overall.percentage != null ? `${coverageSummary.overall.percentage}%` : '—'}</div>
                <div className="rr-text-sm rr-muted">{coverageSummary.overall.covered}/{coverageSummary.overall.total}</div>
              </div>
            )}
          </div>
          {traceability.overview && <div className="rr-mt-4"><Md text={traceability.overview} /></div>}
        </CollapsibleSection>
      )}

      {/* Detailed Mapping */}
      {detailedMapping.length > 0 && (
        <CollapsibleSection title="Detailed Mapping" count={detailedMapping.length} sectionId="tm-mapping">
          {detailedMapping.map((m: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: `2px solid ${m.coverage === 'full' ? 'var(--vscode-testing-iconPassed)' : m.coverage === 'none' ? 'var(--vscode-errorForeground)' : 'var(--vscode-editorWarning-foreground)'}` }}>
              <div>
                {m.criterionId && <span className="tag rr-mr-4">{m.criterionId}</span>}
                {m.priority && <span className="tag rr-mr-4">{m.priority}</span>}
                <strong>{m.criterion || `Criterion ${i + 1}`}</strong>
                {m.coverage && <span className="tag" style={{ marginLeft: '4px', backgroundColor: statusColor(m.coverage === 'full' ? 'pass' : m.coverage === 'none' ? 'fail' : 'warn') }}>{m.coverage}</span>}
              </div>
              {m.tests?.length > 0 && (
                <div className="rr-ml-16 rr-text-sm rr-mt-2">
                  {m.tests.map((t: any, ti: number) => (
                    <div key={ti} className="rr-mb-2">
                      {t.testId && <code className="rr-mr-4">{t.testId}</code>}
                      <strong>{t.testName || `Test ${ti + 1}`}</strong>
                      {t.testLevel && <span className="tag rr-ml-4">{t.testLevel}</span>}
                      {t.status && <span className="tag" style={{ marginLeft: '4px', backgroundColor: statusColor(t.status === 'passing' ? 'pass' : t.status === 'failing' ? 'fail' : 'warn') }}>{t.status}</span>}
                      {t.automationStatus && <span className="tag rr-ml-4">{t.automationStatus}</span>}
                    </div>
                  ))}
                </div>
              )}
              {m.coverageNotes && <div className="rr-text-sm rr-muted rr-mt-2">{m.coverageNotes}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Coverage by Test Level */}
      {traceability.coverageByTestLevel && (
        <CollapsibleSection title="Coverage by Test Level" sectionId="tm-levels">
          <div className="rr-flex rr-gap-12 rr-wrap">
            {['unit', 'integration', 'component', 'api', 'e2e'].map(level => {
              const data = traceability.coverageByTestLevel[level];
              return data ? (
                <div key={level} className="rr-text-center">
                  <strong>{level}</strong>
                  <div>{data.count} tests</div>
                  <div className="rr-muted">{data.percentage}%</div>
                </div>
              ) : null;
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Gap Analysis */}
      {(gapAnalysis.summary || gapAnalysis.critical?.length > 0) && (
        <CollapsibleSection title="Gap Analysis" sectionId="tm-gaps">
          {gapAnalysis.summary && <div className="rr-mb-4"><Md text={gapAnalysis.summary} /></div>}
          {['critical', 'high', 'medium', 'low'].map(severity => {
            const gaps: any[] = gapAnalysis[severity] || [];
            return gaps.length > 0 ? (
              <div key={severity} className="rr-mb-4">
                <h4 style={{ color: severity === 'critical' ? 'var(--vscode-errorForeground)' : undefined }}>{severity.charAt(0).toUpperCase() + severity.slice(1)} ({gaps.length})</h4>
                {gaps.map((g: any, gi: number) => (
                  <div key={gi} className="rr-p-2-8 rr-mb-2">
                    {g.gapId && <span className="tag rr-mr-4">{g.gapId}</span>}
                    <strong>{g.gap || `Gap ${gi + 1}`}</strong>
                    {g.impact && <div className="rr-text-sm rr-muted">Impact: {g.impact}</div>}
                    {g.recommendation && <div className="rr-text-sm rr-fg-link">Rec: {g.recommendation}</div>}
                  </div>
                ))}
              </div>
            ) : null;
          })}
        </CollapsibleSection>
      )}

      {/* Quality Assessment */}
      {qualityAssessment.overall && (
        <CollapsibleSection title="Quality Assessment" sectionId="tm-quality">
          <div>
            <strong>Overall: </strong>
            <span className="tag" style={{ backgroundColor: statusColor(qualityAssessment.overall === 'excellent' || qualityAssessment.overall === 'good' ? 'pass' : qualityAssessment.overall === 'poor' ? 'fail' : 'warn') }}>{qualityAssessment.overall}</span>
          </div>
          {qualityAssessment.summary && <div className="rr-mt-4"><Md text={qualityAssessment.summary} /></div>}
          {qualityAssessment.scores && (
            <div className="rr-flex rr-gap-12 rr-wrap rr-mt-4">
              {Object.entries(qualityAssessment.scores).map(([k, v]) => (
                <div key={k} className="rr-text-center">
                  <strong>{k}</strong>
                  <div className="rr-text-lg">{String(v)}</div>
                </div>
              ))}
            </div>
          )}
          {qualityAssessment.findings?.length > 0 && (
            <div className="rr-mt-4">
              {qualityAssessment.findings.map((f: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <span className={`tag agent-renderer-tag ${f.type === 'positive' ? 'agent-renderer-tag--success' : f.type === 'issue' ? 'agent-renderer-tag--error' : ''}`} style={{ marginRight: '4px' }}>{f.type}</span>
                  {f.finding}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Gate Decision */}
      {gateDecision.decision && (
        <CollapsibleSection title="Gate Decision" sectionId="tm-gate">
          <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: statusColor(gateDecision.decision) }}>
            {gateDecision.decision}
          </div>
          {gateDecision.gateType && <span className="tag">{gateDecision.gateType}</span>}
          {gateDecision.decisionMode && <span className="tag rr-ml-4">{gateDecision.decisionMode}</span>}
          {gateDecision.rationale && <div className="rr-mt-4"><Md text={gateDecision.rationale} /></div>}

          {/* Evidence Summary */}
          {gateDecision.evidenceSummary?.testExecution && (
            <div className="rr-mt-4">
              <h4>Test Execution</h4>
              <div className="rr-flex rr-gap-8 rr-wrap">
                <span className="tag agent-renderer-tag agent-renderer-tag--success">Passed: {gateDecision.evidenceSummary.testExecution.passed}</span>
                {gateDecision.evidenceSummary.testExecution.failed > 0 && <span className="tag rr-bg-error-solid">Failed: {gateDecision.evidenceSummary.testExecution.failed}</span>}
                {gateDecision.evidenceSummary.testExecution.skipped > 0 && <span className="tag">Skipped: {gateDecision.evidenceSummary.testExecution.skipped}</span>}
                {gateDecision.evidenceSummary.testExecution.passRate != null && <span className="tag">Pass Rate: {gateDecision.evidenceSummary.testExecution.passRate}%</span>}
              </div>
            </div>
          )}

          {/* Decision Criteria */}
          {gateDecision.decisionCriteria && (
            <div className="rr-mt-4">
              <h4>Decision Criteria</h4>
              {['p0', 'p1', 'p2', 'p3'].map(p => {
                const dc = gateDecision.decisionCriteria[p];
                return dc ? (
                  <div key={p} className="rr-p-2-8">
                    <strong>{p.toUpperCase()}:</strong> {dc.actual}/{dc.required}
                    {dc.pass != null && <span className={`tag agent-renderer-tag ${dc.pass ? 'agent-renderer-tag--success' : 'agent-renderer-tag--error'}`} style={{ marginLeft: '4px' }}>{dc.pass ? 'PASS' : 'FAIL'}</span>}
                  </div>
                ) : null;
              })}
            </div>
          )}

          {/* Residual Risks */}
          {gateDecision.residualRisks?.length > 0 && (
            <div className="rr-mt-4">
              <h4>Residual Risks</h4>
              {gateDecision.residualRisks.map((r: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{r.risk || `Risk ${i + 1}`}</strong>
                  {r.severity && <span className="tag rr-ml-4">{r.severity}</span>}
                  {r.mitigation && <div className="rr-text-sm rr-muted">{r.mitigation}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Next Steps */}
          {gateDecision.nextSteps?.length > 0 && (
            <div className="rr-mt-4">
              <h4>Next Steps</h4>
              {gateDecision.nextSteps.map((s: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{s.step || `Step ${i + 1}`}</strong>
                  {s.owner && <span className="tag rr-ml-4">{s.owner}</span>}
                  {s.deadline && <span className="rr-muted"> — by {s.deadline}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Sign Off */}
      {signOff.signedBy && (
        <CollapsibleSection title="Sign Off" sectionId="tm-signoff">
          <div><strong>{signOff.signedBy}</strong> {signOff.role && <span className="rr-muted">({signOff.role})</span>}</div>
          {signOff.date && <div className="rr-muted">{signOff.date}</div>}
          {signOff.comments && <div className="rr-mt-4"><Md text={signOff.comments} /></div>}
        </CollapsibleSection>
      )}

      {/* Related Artifacts */}
      {relatedArtifacts.length > 0 && (
        <CollapsibleSection title="Related Artifacts" count={relatedArtifacts.length} sectionId="tm-related">
          {relatedArtifacts.map((a: any, i: number) => (
            <div key={i} className="rr-p-2-8">
              <strong>{a.artifact || `Artifact ${i + 1}`}</strong>
              {a.path && <code className="rr-ml-4">{a.path}</code>}
              {a.version && <span className="tag rr-ml-4">{a.version}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* CI/CD YAML Snippet */}
      {d.cicdYamlSnippet && !editMode && (
        <CollapsibleSection title="CI/CD YAML Snippet" sectionId="tm-cicd-yaml">
          <pre><code>{typeof d.cicdYamlSnippet === 'string' ? d.cicdYamlSnippet : JSON.stringify(d.cicdYamlSnippet, null, 2)}</code></pre>
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// CI PIPELINE DETAILS
// ==========================================================================

export function renderCiPipelineDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const platform = d.platform || {};
  const pipeline = d.pipeline || {};
  const jobs: any[] = d.jobs || [];
  const testExecution = d.testExecution || {};
  const qualityGates: any[] = d.qualityGates || [];
  const artifacts: any[] = d.artifacts || [];
  const caching = d.caching || {};
  const secrets: any[] = d.secrets || [];
  const documentation = d.documentation || {};

  return (
    <>
      {/* Platform */}
      {platform.name && (
        <CollapsibleSection title="Platform" sectionId="ci-platform">
          {editMode ? (
            <div className="edit-grid">
              <label>Platform</label>
              <select value={platform.name || ''} onChange={(e) => handleFieldChange('platform', { ...platform, name: e.target.value })}>
                <option value="">Select...</option>
                {['github-actions', 'gitlab-ci', 'circle-ci', 'jenkins', 'azure-devops', 'other'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <label>Config File</label>
              <input value={platform.configFile || ''} onChange={(e) => handleFieldChange('platform', { ...platform, configFile: e.target.value })} />
            </div>
          ) : (
            <>
              <div><strong>{platform.name}</strong></div>
              {platform.configFile && <div><code>{platform.configFile}</code></div>}
              {platform.selectionRationale && <div className="rr-muted rr-text-sm">{platform.selectionRationale}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Pipeline Triggers */}
      {pipeline.triggers?.length > 0 && (
        <CollapsibleSection title="Triggers" count={pipeline.triggers.length} sectionId="ci-triggers">
          {pipeline.name && <div className="rr-mb-4"><strong>Pipeline:</strong> {pipeline.name}</div>}
          {pipeline.triggers.map((t: any, i: number) => (
            <div key={i} className="rr-p-2-8">
              <span className="tag">{t.event}</span>
              {t.branches?.length > 0 && <span className="rr-ml-4">Branches: {t.branches.join(', ')}</span>}
              {t.schedule && <span className="rr-ml-4"><code>{t.schedule}</code></span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Jobs */}
      {jobs.length > 0 && (
        <CollapsibleSection title="Jobs" count={jobs.length} sectionId="ci-jobs">
          {jobs.map((j: any, i: number) => (
            <CollapsibleSection key={i} title={j.name || j.id || `Job ${i + 1}`} sectionId={`ci-job-${i}`}>
              {j.description && <div className="rr-subtle">{j.description}</div>}
              {j.runsOn && <div><strong>Runs on:</strong> <code>{j.runsOn}</code></div>}
              {j.dependsOn?.length > 0 && <div><strong>Depends on:</strong> {j.dependsOn.join(', ')}</div>}
              {j.condition && <div><strong>Condition:</strong> <code>{j.condition}</code></div>}
              {j.timeout && <div><strong>Timeout:</strong> {j.timeout}m</div>}
              {j.steps?.length > 0 && (
                <>
                  <h4>Steps ({j.steps.length})</h4>
                  {j.steps.map((s: any, si: number) => (
                    <div key={si} className="rr-p-2-8 rr-accent-border">
                      <strong>{s.name || `Step ${si + 1}`}</strong>
                      {s.uses && <div className="rr-text-sm"><code>{s.uses}</code></div>}
                      {s.run && <pre className="rr-text-sm rr-m-2-0">{s.run}</pre>}
                    </div>
                  ))}
                </>
              )}
              {j.services?.length > 0 && (
                <div className="rr-mt-4">
                  <strong>Services:</strong> {j.services.map((s: any) => `${s.name} (${s.image})`).join(', ')}
                </div>
              )}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* Test Execution */}
      {testExecution.testSuites?.length > 0 && (
        <CollapsibleSection title="Test Execution" count={testExecution.testSuites.length} sectionId="ci-tests">
          {testExecution.testSuites.map((ts: any, i: number) => (
            <div key={i} className="rr-p-2-8">
              <strong>{ts.name || `Suite ${i + 1}`}</strong>
              {ts.type && <span className="tag rr-ml-4">{ts.type}</span>}
              {ts.command && <div className="rr-text-sm"><code>{ts.command}</code></div>}
              {ts.timeout && <span className="tag rr-ml-4">{ts.timeout}m timeout</span>}
            </div>
          ))}
          {testExecution.burnIn?.enabled && (
            <div className="rr-mt-4">
              <strong>Burn-in:</strong> {testExecution.burnIn.iterations} iterations, threshold {testExecution.burnIn.failureThreshold}
            </div>
          )}
          {testExecution.sharding?.enabled && (
            <div><strong>Sharding:</strong> {testExecution.sharding.shards} shards ({testExecution.sharding.strategy})</div>
          )}
        </CollapsibleSection>
      )}

      {/* Quality Gates */}
      {qualityGates.length > 0 && (
        <CollapsibleSection title="Quality Gates" count={qualityGates.length} sectionId="ci-gates">
          {qualityGates.map((g: any, i: number) => (
            <div key={i} className="rr-p-2-8">
              <strong>{g.name || `Gate ${i + 1}`}</strong>
              {g.type && <span className="tag rr-ml-4">{g.type}</span>}
              {g.threshold && <span className="tag rr-ml-4">{g.threshold}</span>}
              {g.blocking && <span className="tag rr-ml-4 rr-bg-error-solid">blocking</span>}
              {g.tool && <span className="rr-muted"> ({g.tool})</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <CollapsibleSection title="Artifacts" count={artifacts.length} sectionId="ci-artifacts">
          {artifacts.map((a: any, i: number) => (
            <div key={i} className="rr-p-2-8">
              <strong>{a.name || `Artifact ${i + 1}`}</strong>
              {a.type && <span className="tag rr-ml-4">{a.type}</span>}
              {a.path && <code className="rr-ml-4">{a.path}</code>}
              {a.retention && <span className="rr-muted"> — Retention: {a.retention}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Caching */}
      {caching.enabled && caching.caches?.length > 0 && (
        <CollapsibleSection title="Caching" count={caching.caches.length} sectionId="ci-caching">
          {caching.caches.map((c: any, i: number) => (
            <div key={i} className="rr-p-2-8">
              <strong>{c.name || `Cache ${i + 1}`}</strong>
              {c.key && <div className="rr-text-sm">Key: <code>{c.key}</code></div>}
              {c.paths?.length > 0 && <div className="rr-text-sm rr-muted">Paths: {c.paths.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Secrets */}
      {secrets.length > 0 && (
        <CollapsibleSection title="Secrets Required" count={secrets.length} sectionId="ci-secrets">
          {secrets.map((s: any, i: number) => (
            <div key={i} className="rr-p-2-8">
              <code>{s.name}</code>
              {s.required && <span className="tag rr-ml-4">required</span>}
              {s.purpose && <span className="rr-muted"> — {s.purpose}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Troubleshooting */}
      {documentation.troubleshooting?.length > 0 && (
        <CollapsibleSection title="Troubleshooting" count={documentation.troubleshooting.length} sectionId="ci-trouble">
          {documentation.troubleshooting.map((t: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-mb-2">
              <strong>{t.issue || `Issue ${i + 1}`}</strong>
              {t.solution && <div className="rr-subtle rr-text-sm">{t.solution}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Notifications */}
      {d.notifications && !editMode && (
        <CollapsibleSection title="Notifications" sectionId="ci-notifications">
          {d.notifications.channels?.length > 0 && (
            <>
              <strong>Channels</strong>
              <ul>
                {d.notifications.channels.map((ch: any, i: number) => (
                  <li key={i}>{typeof ch === 'string' ? ch : ch.name || ch.channel || JSON.stringify(ch)}</li>
                ))}
              </ul>
            </>
          )}
          {d.notifications.events?.length > 0 && (
            <>
              <strong>Events</strong>
              <ul>
                {d.notifications.events.map((ev: any, i: number) => (
                  <li key={i}>
                    {typeof ev === 'string' ? ev : (
                      <>
                        <strong>{ev.event || ev.name || `Event ${i + 1}`}</strong>
                        {ev.channel && <span className="tag rr-ml-4">{ev.channel}</span>}
                        {ev.severity && <span className="tag rr-ml-4">{ev.severity}</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.notifications.customMessages?.length > 0 && (
            <>
              <strong>Custom Messages</strong>
              <ul>
                {d.notifications.customMessages.map((msg: any, i: number) => (
                  <li key={i}>
                    {typeof msg === 'string' ? msg : (
                      <>
                        <strong>{msg.trigger || msg.event || `Message ${i + 1}`}</strong>
                        {msg.template && <div className="rr-text-sm"><code>{msg.template}</code></div>}
                        {msg.message && <div className="rr-muted rr-text-sm">{msg.message}</div>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// AUTOMATION SUMMARY DETAILS
// ==========================================================================

export function renderAutomationSummaryDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const summary = d.summary || {};
  const coverageAnalysis = d.coverageAnalysis || {};
  const testsCreated: any[] = d.testsCreated || [];
  const fixturesCreated: any[] = d.fixturesCreated || [];
  const factoriesCreated: any[] = d.factoriesCreated || [];
  const automationStrategy = d.automationStrategy || {};
  const recommendations: any[] = d.recommendations || [];
  const executionResults = d.executionResults || {};

  return (
    <>
      {/* Summary */}
      {summary.scope && (
        <CollapsibleSection title="Summary" sectionId="as-summary">
          {editMode ? (
            <div className="edit-grid">
              <label>Scope</label>
              <input value={summary.scope || ''} onChange={(e) => handleFieldChange('summary', { ...summary, scope: e.target.value })} />
              <label>Framework</label>
              <input value={summary.framework || ''} onChange={(e) => handleFieldChange('summary', { ...summary, framework: e.target.value })} />
              <label>Coverage Target</label>
              <select value={summary.coverageTarget || ''} onChange={(e) => handleFieldChange('summary', { ...summary, coverageTarget: e.target.value })}>
                <option value="">Select...</option>
                {['critical-paths', 'comprehensive', 'selective'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div><Md text={summary.scope} /></div>
              <div className="rr-flex rr-gap-8 rr-wrap rr-mt-4">
                {summary.mode && <span className="tag">{summary.mode}</span>}
                {summary.coverageTarget && <span className="tag">{summary.coverageTarget}</span>}
                {summary.framework && <span className="tag">{summary.framework}</span>}
                {summary.totalTestsCreated != null && <span className="tag">{summary.totalTestsCreated} tests</span>}
                {summary.totalFilesCreated != null && <span className="tag">{summary.totalFilesCreated} files</span>}
                {summary.estimatedCoverageIncrease && <span className="tag">+{summary.estimatedCoverageIncrease}</span>}
              </div>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Coverage Analysis */}
      {(coverageAnalysis.baseline || coverageAnalysis.target) && (
        <CollapsibleSection title="Coverage Analysis" sectionId="as-coverage">
          {(coverageAnalysis.baseline || coverageAnalysis.target) && (
            <table className="rr-w-full rr-text-sm">
              <thead><tr><th>Metric</th><th>Baseline</th><th>Target</th></tr></thead>
              <tbody>
                {['statement', 'branch', 'function', 'line', 'e2e'].map(m => {
                  const base = coverageAnalysis.baseline?.[m];
                  const target = coverageAnalysis.target?.[m];
                  return (base || target) ? (
                    <tr key={m}><td>{m}</td><td>{base || '—'}</td><td>{target || '—'}</td></tr>
                  ) : null;
                })}
              </tbody>
            </table>
          )}
          {coverageAnalysis.gaps?.length > 0 && (
            <>
              <h4>Gaps ({coverageAnalysis.gaps.length})</h4>
              {coverageAnalysis.gaps.map((g: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{g.area || `Gap ${i + 1}`}</strong>
                  {g.gapType && <span className="tag rr-ml-4">{g.gapType}</span>}
                  {g.priority && <span className="tag rr-ml-4">{g.priority}</span>}
                  {g.addressed && <span className="tag agent-renderer-tag agent-renderer-tag--success rr-ml-4">addressed</span>}
                </div>
              ))}
            </>
          )}
          {coverageAnalysis.criticalPaths?.length > 0 && (
            <>
              <h4>Critical Paths ({coverageAnalysis.criticalPaths.length})</h4>
              {coverageAnalysis.criticalPaths.map((cp: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{cp.path || `Path ${i + 1}`}</strong>
                  {cp.status && <span className="tag rr-ml-4">{cp.status}</span>}
                  {cp.description && <div className="rr-muted rr-text-sm">{cp.description}</div>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Tests Created */}
      {testsCreated.length > 0 && (
        <CollapsibleSection title="Tests Created" count={testsCreated.length} sectionId="as-tests">
          {testsCreated.map((tc: any, i: number) => (
            <div key={i} className="rr-p-4-8 rr-mb-4 rr-accent-link">
              <code>{tc.filePath || `File ${i + 1}`}</code>
              {tc.testType && <span className="tag rr-ml-4">{tc.testType}</span>}
              {tc.testCount != null && <span className="tag rr-ml-4">{tc.testCount} tests</span>}
              {tc.targetFeature && <div className="rr-subtle">Feature: {tc.targetFeature}</div>}
              {tc.tests?.length > 0 && (
                <div className="rr-text-sm rr-mt-2">
                  {tc.tests.map((t: any, ti: number) => (
                    <div key={ti} className="rr-ml-8">
                      {t.priority && <span className="tag rr-mr-4">{t.priority}</span>}
                      {t.category && <span className="tag rr-mr-4">{t.category}</span>}
                      {t.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Fixtures & Factories */}
      {(fixturesCreated.length > 0 || factoriesCreated.length > 0) && (
        <CollapsibleSection title="Fixtures & Factories" count={fixturesCreated.length + factoriesCreated.length} sectionId="as-fixtures">
          {fixturesCreated.length > 0 && (
            <>
              <h4>Fixtures</h4>
              {fixturesCreated.map((f: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{f.name || `Fixture ${i + 1}`}</strong>
                  {f.filePath && <code className="rr-ml-4">{f.filePath}</code>}
                  {f.purpose && <span className="rr-muted"> — {f.purpose}</span>}
                </div>
              ))}
            </>
          )}
          {factoriesCreated.length > 0 && (
            <>
              <h4>Factories</h4>
              {factoriesCreated.map((f: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{f.name || `Factory ${i + 1}`}</strong>
                  {f.entityType && <span className="tag rr-ml-4">{f.entityType}</span>}
                  {f.filePath && <code className="rr-ml-4">{f.filePath}</code>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Automation Strategy */}
      {automationStrategy.approach && (
        <CollapsibleSection title="Automation Strategy" sectionId="as-strategy">
          <div><Md text={automationStrategy.approach} /></div>
          {automationStrategy.prioritization && <div><strong>Prioritization:</strong> {automationStrategy.prioritization}</div>}
          {automationStrategy.testLevels?.length > 0 && (
            <div className="rr-mt-4">
              {automationStrategy.testLevels.map((tl: any, i: number) => (
                <div key={i} className="rr-p-1-8">
                  <strong>{tl.level}:</strong> {tl.percentage} {tl.rationale && <span className="rr-muted">— {tl.rationale}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Execution Results */}
      {executionResults.totalTests != null && (
        <CollapsibleSection title="Execution Results" sectionId="as-results">
          <div className="rr-flex rr-gap-8 rr-wrap">
            <span className="tag">Total: {executionResults.totalTests}</span>
            {executionResults.passed != null && <span className="tag agent-renderer-tag agent-renderer-tag--success">Passed: {executionResults.passed}</span>}
            {executionResults.failed != null && executionResults.failed > 0 && <span className="tag rr-bg-error-solid">Failed: {executionResults.failed}</span>}
            {executionResults.skipped != null && executionResults.skipped > 0 && <span className="tag">Skipped: {executionResults.skipped}</span>}
            {executionResults.duration && <span className="tag">{executionResults.duration}</span>}
          </div>
          {executionResults.failureDetails?.length > 0 && (
            <div className="rr-mt-4">
              <h4>Failures</h4>
              {executionResults.failureDetails.map((f: any, i: number) => (
                <div key={i} className="rr-p-2-8 rr-accent-error">
                  <strong>{f.test || `Failure ${i + 1}`}</strong>
                  {f.error && <div className="rr-fg-error rr-text-sm">{f.error}</div>}
                  {f.resolution && <div className="rr-text-sm rr-fg-passed">Fix: {f.resolution}</div>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <CollapsibleSection title="Recommendations" count={recommendations.length} sectionId="as-recs">
          {recommendations.map((r: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-mb-2">
              <strong>{r.recommendation || r.area || `Rec ${i + 1}`}</strong>
              {r.priority && <span className="tag rr-ml-4">{r.priority}</span>}
              {r.effort && <span className="tag rr-ml-4">Effort: {r.effort}</span>}
              {r.impact && <div className="rr-muted rr-text-sm">{r.impact}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* BMAD Integration */}
      {d.bmadIntegration && !editMode && (
        <CollapsibleSection title="BMAD Integration" sectionId="as-bmad-integration">
          {d.bmadIntegration.artifactsUsed?.length > 0 && (
            <>
              <strong>Artifacts Used</strong>
              <ul>
                {d.bmadIntegration.artifactsUsed.map((a: any, i: number) => (
                  <li key={i}>
                    {typeof a === 'string' ? a : (
                      <>
                        <strong>{a.name || a.artifact || `Artifact ${i + 1}`}</strong>
                        {a.type && <span className="tag rr-ml-4">{a.type}</span>}
                        {a.version && <span className="tag rr-ml-4">{a.version}</span>}
                        {a.purpose && <div className="rr-muted rr-text-sm">{a.purpose}</div>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.bmadIntegration.gateStatus && (
            <div className="rr-mt-4">
              <strong>Gate Status:</strong>{' '}
              {typeof d.bmadIntegration.gateStatus === 'string'
                ? <span className="tag">{d.bmadIntegration.gateStatus}</span>
                : <Md text={JSON.stringify(d.bmadIntegration.gateStatus, null, 2)} />}
            </div>
          )}
          {d.bmadIntegration.traceabilityLinks?.length > 0 && (
            <>
              <strong>Traceability Links</strong>
              <ul>
                {d.bmadIntegration.traceabilityLinks.map((link: any, i: number) => (
                  <li key={i}>
                    {typeof link === 'string' ? link : (
                      <>
                        <strong>{link.source || link.from || `Link ${i + 1}`}</strong>
                        {link.target && <span> → {link.target || link.to}</span>}
                        {link.type && <span className="tag rr-ml-4">{link.type}</span>}
                        {link.status && <span className="tag rr-ml-4">{link.status}</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// ATDD CHECKLIST DETAILS
// ==========================================================================

export function renderAtddChecklistDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem } = props;
  const d: any = editedData;
  const storyInfo = d.storyInfo || {};
  const acceptanceCriteria: any[] = d.acceptanceCriteria || [];
  const failingTests = d.failingTestsCreated || {};
  const testScenarios: any[] = d.testScenarios || [];
  const mocks: any[] = d.mockRequirements || [];
  const testIds: any[] = d.requiredDataTestIds || [];
  const pageObjects: any[] = d.pageObjects || [];
  const checklist: any[] = d.implementationChecklist || [];
  const runningTests = d.runningTests || {};
  const rgr = d.redGreenRefactorWorkflow || {};
  const testEvidence = d.testExecutionEvidence || {};
  const completion = d.completionStatus || {};

  const testLevels = ['e2e', 'api', 'integration', 'component', 'unit'];

  return (
    <>
      {/* Story Info */}
      {(storyInfo.storyId || storyInfo.storyTitle) && (
        <CollapsibleSection title="Story Info" sectionId="atdd-story">
          {editMode ? (
            <div className="edit-grid">
              <label>Story ID</label>
              <input value={storyInfo.storyId || ''} onChange={(e) => handleFieldChange('storyInfo', { ...storyInfo, storyId: e.target.value })} />
              <label>Story Title</label>
              <input value={storyInfo.storyTitle || ''} onChange={(e) => handleFieldChange('storyInfo', { ...storyInfo, storyTitle: e.target.value })} />
              <label>Story Description</label>
              <textarea rows={3} value={storyInfo.storyDescription || ''} onChange={(e) => handleFieldChange('storyInfo', { ...storyInfo, storyDescription: e.target.value })} />
              <label>Primary Test Level</label>
              <select value={storyInfo.primaryTestLevel || ''} onChange={(e) => handleFieldChange('storyInfo', { ...storyInfo, primaryTestLevel: e.target.value })}>
                <option value="">Select...</option>
                {testLevels.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div><strong>{storyInfo.storyId}:</strong> {storyInfo.storyTitle}</div>
              {storyInfo.epicId && <div className="rr-muted">Epic: {storyInfo.epicId}</div>}
              {storyInfo.primaryTestLevel && <span className="tag">{storyInfo.primaryTestLevel}</span>}
              {storyInfo.storyDescription && <div className="rr-mt-4"><Md text={storyInfo.storyDescription} /></div>}
              {storyInfo.businessValue && <div className="rr-muted rr-text-sm"><strong>Business Value:</strong> {storyInfo.businessValue}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Completion Status */}
      {completion.status && (
        <div className="rr-p-4-8 rr-mb-4 rr-flex rr-gap-8 rr-items-center">
          <span className={`tag agent-renderer-tag ${completion.status === 'complete' ? 'agent-renderer-tag--success' : completion.status === 'blocked' ? 'agent-renderer-tag--error' : ''}`}>{completion.status}</span>
          {completion.percentComplete != null && <span>{completion.percentComplete}%</span>}
          {completion.blockers?.length > 0 && <span className="rr-fg-error">Blockers: {completion.blockers.length}</span>}
        </div>
      )}

      {/* Acceptance Criteria */}
      {acceptanceCriteria.length > 0 && (
        <CollapsibleSection title="Acceptance Criteria" count={acceptanceCriteria.length} sectionId="atdd-ac">
          {acceptanceCriteria.map((ac: any, i: number) => (
            <div key={i} className="rr-p-4-8 rr-mb-4 rr-accent-link">
              {ac.id && <span className="tag rr-mr-4">{ac.id}</span>}
              <strong>{ac.title || ac.description || `AC ${i + 1}`}</strong>
              {ac.given && <div className="rr-text-sm"><strong>Given</strong> {ac.given}</div>}
              {ac.when && <div className="rr-text-sm"><strong>When</strong> {ac.when}</div>}
              {ac.then && <div className="rr-text-sm"><strong>Then</strong> {ac.then}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Failing Tests Created (RED phase) */}
      {(() => {
        const allTests: { level: string; tests: any[] }[] = testLevels
          .map(level => ({ level, tests: failingTests[level] || [] }))
          .filter(lt => lt.tests.length > 0);
        const totalCount = allTests.reduce((sum, lt) => sum + lt.tests.length, 0);
        return totalCount > 0 ? (
          <CollapsibleSection title="Failing Tests (RED)" count={totalCount} sectionId="atdd-red">
            {allTests.map(({ level, tests }) => (
              <div key={level} className="rr-mb-4">
                <h4>{level.toUpperCase()} ({tests.length})</h4>
                {tests.map((t: any, i: number) => (
                  <div key={i} className="rr-p-2-8 rr-mb-2">
                    {t.testId && <code className="rr-mr-4">{t.testId}</code>}
                    <strong>{t.name || `Test ${i + 1}`}</strong>
                    {t.status && <span className="tag rr-ml-4">{t.status}</span>}
                    {t.acReference && <span className="tag rr-ml-4">{t.acReference}</span>}
                    {t.filePath && <div className="rr-text-sm"><code>{t.filePath}</code></div>}
                  </div>
                ))}
              </div>
            ))}
          </CollapsibleSection>
        ) : null;
      })()}

      {/* Test Scenarios */}
      {testScenarios.length > 0 && (
        <CollapsibleSection title="Test Scenarios" count={testScenarios.length} sectionId="atdd-scenarios">
          {testScenarios.map((s: any, i: number) => (
            <div key={i} className="rr-p-4-8 rr-mb-4 rr-accent-border">
              {s.scenarioId && <span className="tag rr-mr-4">{s.scenarioId}</span>}
              <strong>{s.name || `Scenario ${i + 1}`}</strong>
              {s.testLevel && <span className="tag rr-ml-4">{s.testLevel}</span>}
              {s.automationStatus && <span className="tag rr-ml-4">{s.automationStatus}</span>}
              {s.given?.length > 0 && <div className="rr-text-sm"><strong>Given</strong> {s.given.join(' AND ')}</div>}
              {s.when?.length > 0 && <div className="rr-text-sm"><strong>When</strong> {s.when.join(' AND ')}</div>}
              {s.then?.length > 0 && <div className="rr-text-sm"><strong>Then</strong> {s.then.join(' AND ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Implementation Checklist */}
      {checklist.length > 0 && (
        <CollapsibleSection title="Implementation Checklist" count={checklist.length} sectionId="atdd-checklist">
          {checklist.map((item: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-flex rr-items-center rr-gap-8">
              {editMode ? (
                <input type="checkbox" checked={item.completed || false} onChange={(e) => updateArrayItem('implementationChecklist', i, { ...item, completed: e.target.checked })} />
              ) : (
                <span>{item.completed ? '\u2705' : '\u2B1C'}</span>
              )}
              <span style={{ textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.6 : 1 }}>
                {item.item || `Item ${i + 1}`}
              </span>
              {item.category && <span className="tag">{item.category}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Red-Green-Refactor Workflow */}
      {rgr.iterations?.length > 0 && (
        <CollapsibleSection title="Red-Green-Refactor" count={rgr.iterations.length} sectionId="atdd-rgr">
          {rgr.currentPhase && <div><strong>Current Phase:</strong> <span className={`tag agent-renderer-tag ${rgr.currentPhase === 'red' ? 'agent-renderer-tag--error' : rgr.currentPhase === 'green' ? 'agent-renderer-tag--success' : ''}`}>{rgr.currentPhase}</span></div>}
          {rgr.iterations.map((it: any, i: number) => (
            <CollapsibleSection key={i} title={`Iteration ${it.iteration || i + 1}: ${it.targetAC || ''}`} sectionId={`atdd-rgr-${i}`}>
              {it.red && (
                <div className="rr-p-2-8 rr-accent-strong-error">
                  <strong>RED:</strong> {it.red.description}
                  {it.red.testFile && <div className="rr-text-sm"><code>{it.red.testFile}</code></div>}
                  {it.red.failureMessage && <div className="rr-text-sm rr-fg-error">{it.red.failureMessage}</div>}
                </div>
              )}
              {it.green && (
                <div className="rr-p-2-8 rr-accent-strong-passed">
                  <strong>GREEN:</strong> {it.green.description}
                  {it.green.filesChanged?.length > 0 && <div className="rr-text-sm">Files: {it.green.filesChanged.join(', ')}</div>}
                </div>
              )}
              {it.refactor && (
                <div className="rr-p-2-8 rr-accent-strong-link">
                  <strong>REFACTOR:</strong> {it.refactor.description}
                  {it.refactor.improvements?.length > 0 && <ul className="rr-text-sm">{it.refactor.improvements.map((imp: string, ii: number) => <li key={ii}>{imp}</li>)}</ul>}
                </div>
              )}
            </CollapsibleSection>
          ))}
        </CollapsibleSection>
      )}

      {/* Running Tests Commands */}
      {Object.values(runningTests).some(Boolean) && (
        <CollapsibleSection title="Running Tests" sectionId="atdd-run">
          {Object.entries(runningTests).map(([key, val]) => val ? (
            <div key={key} className="rr-p-1-8">
              <strong>{key}:</strong> <code>{String(val)}</code>
            </div>
          ) : null)}
        </CollapsibleSection>
      )}

      {/* Test Execution Evidence */}
      {testEvidence.results && (
        <CollapsibleSection title="Test Execution Evidence" sectionId="atdd-evidence">
          {testEvidence.lastRun && <div className="rr-muted">Last run: {testEvidence.lastRun}</div>}
          <div className="rr-flex rr-gap-8 rr-wrap rr-mt-4">
            {testEvidence.results.passed != null && <span className="tag agent-renderer-tag agent-renderer-tag--success">Passed: {testEvidence.results.passed}</span>}
            {testEvidence.results.failed != null && testEvidence.results.failed > 0 && <span className="tag rr-bg-error-solid">Failed: {testEvidence.results.failed}</span>}
            {testEvidence.results.skipped != null && testEvidence.results.skipped > 0 && <span className="tag">Skipped: {testEvidence.results.skipped}</span>}
            {testEvidence.results.totalDuration && <span className="tag">{testEvidence.results.totalDuration}</span>}
          </div>
          {testEvidence.coverage && (
            <div className="rr-mt-4">
              <strong>Coverage:</strong>
              {Object.entries(testEvidence.coverage).map(([k, v]) => (
                <span key={k} className="tag rr-ml-4">{k}: {String(v)}%</span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Mocks & Page Objects */}
      {(mocks.length > 0 || pageObjects.length > 0) && (
        <CollapsibleSection title="Mocks & Page Objects" count={mocks.length + pageObjects.length} sectionId="atdd-mocks">
          {mocks.length > 0 && (
            <>
              <h4>Mocks ({mocks.length})</h4>
              {mocks.map((m: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{m.service || `Mock ${i + 1}`}</strong>
                  {m.mockType && <span className="tag rr-ml-4">{m.mockType}</span>}
                  {m.description && <div className="rr-muted rr-text-sm">{m.description}</div>}
                </div>
              ))}
            </>
          )}
          {pageObjects.length > 0 && (
            <>
              <h4>Page Objects ({pageObjects.length})</h4>
              {pageObjects.map((po: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{po.name || `PO ${i + 1}`}</strong>
                  {po.page && <span className="rr-muted"> — {po.page}</span>}
                  {po.filePath && <div className="rr-text-sm"><code>{po.filePath}</code></div>}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Data Test IDs */}
      {testIds.length > 0 && (
        <CollapsibleSection title="Required Test IDs" count={testIds.length} sectionId="atdd-testids">
          {testIds.map((tid: any, i: number) => (
            <div key={i} className="rr-p-2-8">
              <code>{tid.testId}</code>
              {tid.element && <span className="tag rr-ml-4">{tid.element}</span>}
              {tid.status && <span className={`tag agent-renderer-tag ${tid.status === 'verified' ? 'agent-renderer-tag--success' : ''}`} style={{ marginLeft: '4px' }}>{tid.status}</span>}
              {tid.purpose && <div className="rr-muted rr-text-sm">{tid.purpose}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Story Summary */}
      {d.storySummary && !editMode && (
        <CollapsibleSection title="Story Summary" sectionId="atdd-story-summary">
          <Md text={d.storySummary} />
        </CollapsibleSection>
      )}

      {/* Data Factories Created */}
      {d.dataFactoriesCreated?.length > 0 && !editMode && (
        <CollapsibleSection title="Data Factories Created" count={d.dataFactoriesCreated.length} sectionId="atdd-data-factories">
          {d.dataFactoriesCreated.map((f: any, i: number) => (
            <div key={i} className="rr-p-4-8 rr-mb-2 rr-accent-link">
              <strong>{typeof f === 'string' ? f : f.name || f.factory || `Factory ${i + 1}`}</strong>
              {typeof f === 'object' && f.path && <div className="rr-text-sm"><code>{f.path}</code></div>}
              {typeof f === 'object' && f.entity && <span className="tag rr-ml-4">{f.entity}</span>}
              {typeof f === 'object' && f.description && <div className="rr-muted rr-text-sm">{f.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Fixtures Created */}
      {d.fixturesCreated?.length > 0 && !editMode && (
        <CollapsibleSection title="Fixtures Created" count={d.fixturesCreated.length} sectionId="atdd-fixtures">
          {d.fixturesCreated.map((f: any, i: number) => (
            <div key={i} className="rr-p-4-8 rr-mb-2 rr-accent-link">
              <strong>{typeof f === 'string' ? f : f.name || f.fixture || `Fixture ${i + 1}`}</strong>
              {typeof f === 'object' && f.path && <div className="rr-text-sm"><code>{f.path}</code></div>}
              {typeof f === 'object' && f.scope && <span className="tag rr-ml-4">{f.scope}</span>}
              {typeof f === 'object' && f.description && <div className="rr-muted rr-text-sm">{f.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Knowledge Base References */}
      {d.knowledgeBaseReferences?.length > 0 && !editMode && (
        <CollapsibleSection title="Knowledge Base References" count={d.knowledgeBaseReferences.length} sectionId="atdd-kb-refs">
          {d.knowledgeBaseReferences.map((ref: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-mb-2">
              <strong>{typeof ref === 'string' ? ref : ref.title || ref.name || `Reference ${i + 1}`}</strong>
              {typeof ref === 'object' && ref.url && <div className="rr-text-sm"><code>{ref.url}</code></div>}
              {typeof ref === 'object' && ref.type && <span className="tag rr-ml-4">{ref.type}</span>}
              {typeof ref === 'object' && ref.relevance && <div className="rr-muted rr-text-sm">{ref.relevance}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// NFR ASSESSMENT DETAILS
// ==========================================================================

export function renderNfrAssessmentDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const featureInfo = d.featureInfo || {};
  const assessments = d.assessments || {};
  const nfrRequirements: any[] = d.nfrRequirements || [];
  const quickWins: any[] = d.quickWins || [];
  const recommendedActions: any[] = d.recommendedActions || [];
  const monitoringHooks: any[] = d.monitoringHooks || [];
  const evidenceGaps: any[] = d.evidenceGaps || [];
  const findingsSummary = d.findingsSummary || {};
  const signOff = d.signOff || {};

  const statusColor = (s: string) => {
    if (s === 'pass' || s === 'approved') return 'var(--vscode-testing-iconPassed)';
    if (s === 'fail' || s === 'rejected') return 'var(--vscode-errorForeground)';
    if (s === 'warn' || s === 'pass-with-concerns') return 'var(--vscode-editorWarning-foreground)';
    return undefined;
  };

  return (
    <>
      {/* Feature Info */}
      {featureInfo.featureName && (
        <CollapsibleSection title="Feature Info" sectionId="nfr-feature">
          {editMode ? (
            <div className="edit-grid">
              <label>Feature Name</label>
              <input value={featureInfo.featureName || ''} onChange={(e) => handleFieldChange('featureInfo', { ...featureInfo, featureName: e.target.value })} />
              <label>Version</label>
              <input value={featureInfo.version || ''} onChange={(e) => handleFieldChange('featureInfo', { ...featureInfo, version: e.target.value })} />
              <label>Environment</label>
              <input value={featureInfo.environment || ''} onChange={(e) => handleFieldChange('featureInfo', { ...featureInfo, environment: e.target.value })} />
              <label>Assessor</label>
              <input value={featureInfo.assessor || ''} onChange={(e) => handleFieldChange('featureInfo', { ...featureInfo, assessor: e.target.value })} />
              <label>Overall Status</label>
              <select value={featureInfo.overallStatus || ''} onChange={(e) => handleFieldChange('featureInfo', { ...featureInfo, overallStatus: e.target.value })}>
                <option value="">Select...</option>
                {['pass', 'pass-with-concerns', 'fail', 'incomplete'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div><strong>{featureInfo.featureName}</strong> {featureInfo.version && <span className="tag">{featureInfo.version}</span>}</div>
              {featureInfo.overallStatus && <div><span className="tag" style={{ backgroundColor: statusColor(featureInfo.overallStatus) }}>{featureInfo.overallStatus}</span></div>}
              {featureInfo.storyId && <div className="rr-muted">Story: {featureInfo.storyId} {featureInfo.epicId && `| Epic: ${featureInfo.epicId}`}</div>}
              {featureInfo.environment && <div className="rr-muted">Environment: {featureInfo.environment}</div>}
              {featureInfo.assessor && <div className="rr-muted">Assessor: {featureInfo.assessor} {featureInfo.assessmentDate && `(${featureInfo.assessmentDate})`}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Executive Summary */}
      {d.executiveSummary && (
        <CollapsibleSection title="Executive Summary" sectionId="nfr-exec">
          {editMode ? (
            <textarea rows={5} value={d.executiveSummary} className="rr-w-full" onChange={(e) => handleFieldChange('executiveSummary', e.target.value)} />
          ) : (
            <Md text={d.executiveSummary} />
          )}
        </CollapsibleSection>
      )}

      {/* NFR Requirements */}
      {nfrRequirements.length > 0 && (
        <CollapsibleSection title="NFR Requirements" count={nfrRequirements.length} sectionId="nfr-reqs">
          {nfrRequirements.map((r: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-mb-2">
              {r.id && <span className="tag rr-mr-4">{r.id}</span>}
              <strong>{r.requirement || `Req ${i + 1}`}</strong>
              {r.category && <span className="tag rr-ml-4">{r.category}</span>}
              {r.priority && <span className="tag rr-ml-4">{r.priority}</span>}
              {r.target && <div className="rr-text-sm">Target: <code>{r.target}</code></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Performance Assessment */}
      {assessments.performance?.status && (
        <CollapsibleSection title="Performance" sectionId="nfr-perf">
          <span className="tag" style={{ backgroundColor: statusColor(assessments.performance.status) }}>{assessments.performance.status}</span>
          {assessments.performance.summary && <div className="rr-mt-4"><Md text={assessments.performance.summary} /></div>}
          {assessments.performance.responseTime && (
            <div className="rr-mt-4">
              <h4>Response Time</h4>
              <div className="rr-flex rr-gap-8 rr-wrap">
                {assessments.performance.responseTime.target && <span className="tag">Target: {assessments.performance.responseTime.target}</span>}
                {assessments.performance.responseTime.actual && <span className="tag">Actual: {assessments.performance.responseTime.actual}</span>}
                {assessments.performance.responseTime.p50 && <span className="tag">P50: {assessments.performance.responseTime.p50}</span>}
                {assessments.performance.responseTime.p95 && <span className="tag">P95: {assessments.performance.responseTime.p95}</span>}
                {assessments.performance.responseTime.p99 && <span className="tag">P99: {assessments.performance.responseTime.p99}</span>}
              </div>
            </div>
          )}
          {assessments.performance.scalability?.bottlenecks?.length > 0 && (
            <div className="rr-mt-4">
              <h4>Bottlenecks</h4>
              {assessments.performance.scalability.bottlenecks.map((b: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{b.bottleneck || `Bottleneck ${i + 1}`}</strong>
                  {b.impact && <span className="rr-muted"> — {b.impact}</span>}
                  {b.recommendation && <div className="rr-text-sm rr-fg-link">Rec: {b.recommendation}</div>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Security Assessment */}
      {assessments.security?.status && (
        <CollapsibleSection title="Security" sectionId="nfr-security">
          <span className="tag" style={{ backgroundColor: statusColor(assessments.security.status) }}>{assessments.security.status}</span>
          {assessments.security.summary && <div className="rr-mt-4"><Md text={assessments.security.summary} /></div>}
          {assessments.security.vulnerabilities?.length > 0 && (
            <div className="rr-mt-4">
              <h4>Vulnerabilities ({assessments.security.vulnerabilities.length})</h4>
              {assessments.security.vulnerabilities.map((v: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px', borderLeft: `2px solid ${v.severity === 'critical' || v.severity === 'high' ? 'var(--vscode-errorForeground)' : 'var(--vscode-widget-border)'}` }}>
                  {v.id && <span className="tag rr-mr-4">{v.id}</span>}
                  {v.severity && <span className="tag" style={{ marginRight: '4px', backgroundColor: v.severity === 'critical' ? 'var(--vscode-errorForeground)' : undefined }}>{v.severity}</span>}
                  <strong>{v.vulnerability || `Vuln ${i + 1}`}</strong>
                  {v.status && <span className="tag rr-ml-4">{v.status}</span>}
                  {v.remediation && <div className="rr-text-sm rr-muted">Fix: {v.remediation}</div>}
                </div>
              ))}
            </div>
          )}
          {assessments.security.securityScans?.length > 0 && (
            <div className="rr-mt-4">
              <h4>Security Scans</h4>
              {assessments.security.securityScans.map((s: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{s.scanType}</strong> ({s.tool})
                  {s.findingsCount && <span className="rr-ml-4">C:{s.findingsCount.critical} H:{s.findingsCount.high} M:{s.findingsCount.medium} L:{s.findingsCount.low}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Reliability Assessment */}
      {assessments.reliability?.status && (
        <CollapsibleSection title="Reliability" sectionId="nfr-reliability">
          <span className="tag" style={{ backgroundColor: statusColor(assessments.reliability.status) }}>{assessments.reliability.status}</span>
          {assessments.reliability.summary && <div className="rr-mt-4"><Md text={assessments.reliability.summary} /></div>}
          {assessments.reliability.availability && (
            <div className="rr-mt-4">
              <strong>Availability:</strong> Target {assessments.reliability.availability.target} | Actual {assessments.reliability.availability.actual}
            </div>
          )}
          {assessments.reliability.errorRate && (
            <div>
              <strong>Error Rate:</strong> Target {assessments.reliability.errorRate.target} | Actual {assessments.reliability.errorRate.actual}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Maintainability Assessment */}
      {assessments.maintainability?.status && (
        <CollapsibleSection title="Maintainability" sectionId="nfr-maintain">
          <span className="tag" style={{ backgroundColor: statusColor(assessments.maintainability.status) }}>{assessments.maintainability.status}</span>
          {assessments.maintainability.summary && <div className="rr-mt-4"><Md text={assessments.maintainability.summary} /></div>}
          {assessments.maintainability.testCoverage && (
            <div className="rr-mt-4">
              <strong>Test Coverage:</strong> Overall {assessments.maintainability.testCoverage.overall} (Target: {assessments.maintainability.testCoverage.target})
            </div>
          )}
          {assessments.maintainability.technicalDebt?.majorItems?.length > 0 && (
            <div className="rr-mt-4">
              <h4>Technical Debt</h4>
              {assessments.maintainability.technicalDebt.majorItems.map((item: any, i: number) => (
                <div key={i} className="rr-p-2-8">
                  <strong>{item.item || `Item ${i + 1}`}</strong>
                  {item.effort && <span className="tag rr-ml-4">{item.effort}</span>}
                  {item.impact && <span className="rr-muted"> — {item.impact}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Findings Summary */}
      {findingsSummary.categories?.length > 0 && (
        <CollapsibleSection title="Findings Summary" sectionId="nfr-findings">
          {findingsSummary.overallScore != null && <div className="rr-text-xl rr-bold">Score: {findingsSummary.overallScore}</div>}
          {findingsSummary.gateDecision && <span className="tag" style={{ backgroundColor: statusColor(findingsSummary.gateDecision) }}>{findingsSummary.gateDecision}</span>}
          {findingsSummary.categories.map((cat: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginTop: '4px', borderLeft: `2px solid ${statusColor(cat.status) || 'var(--vscode-widget-border)'}` }}>
              <strong>{cat.category}</strong>
              {cat.status && <span className="tag" style={{ marginLeft: '4px', backgroundColor: statusColor(cat.status) }}>{cat.status}</span>}
              {cat.score != null && <span className="tag rr-ml-4">{cat.score}</span>}
              {cat.findings?.length > 0 && (
                <div className="rr-text-sm rr-mt-2">
                  {cat.findings.map((f: any, fi: number) => (
                    <div key={fi} className="rr-ml-8">
                      {f.severity && <span className="tag rr-mr-4">{f.severity}</span>}
                      {f.finding}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Quick Wins */}
      {quickWins.length > 0 && (
        <CollapsibleSection title="Quick Wins" count={quickWins.length} sectionId="nfr-quickwins">
          {quickWins.map((qw: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-mb-2">
              {qw.id && <span className="tag rr-mr-4">{qw.id}</span>}
              <strong>{qw.improvement || `QW ${i + 1}`}</strong>
              {qw.category && <span className="tag rr-ml-4">{qw.category}</span>}
              {qw.effort && <span className="tag rr-ml-4">Effort: {qw.effort}</span>}
              {qw.impact && <span className="tag rr-ml-4">Impact: {qw.impact}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Recommended Actions */}
      {recommendedActions.length > 0 && (
        <CollapsibleSection title="Recommended Actions" count={recommendedActions.length} sectionId="nfr-actions">
          {recommendedActions.map((ra: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-mb-2">
              {ra.id && <span className="tag rr-mr-4">{ra.id}</span>}
              <strong>{ra.action || `Action ${i + 1}`}</strong>
              {ra.category && <span className="tag rr-ml-4">{ra.category}</span>}
              {ra.priority && <span className="tag rr-ml-4">{ra.priority}</span>}
              {ra.effort && <span className="tag rr-ml-4">{ra.effort}</span>}
              {ra.impact && <div className="rr-muted rr-text-sm">{ra.impact}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Monitoring Hooks */}
      {monitoringHooks.length > 0 && (
        <CollapsibleSection title="Monitoring Hooks" count={monitoringHooks.length} sectionId="nfr-monitoring">
          {monitoringHooks.map((mh: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-mb-2">
              <strong>{mh.metric || `Metric ${i + 1}`}</strong>
              {mh.threshold && <span className="tag rr-ml-4">Alert: {mh.threshold}</span>}
              {mh.warningThreshold && <span className="tag rr-ml-4">Warn: {mh.warningThreshold}</span>}
              {mh.description && <div className="rr-muted rr-text-sm">{mh.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Evidence Gaps */}
      {evidenceGaps.length > 0 && (
        <CollapsibleSection title="Evidence Gaps" count={evidenceGaps.length} sectionId="nfr-gaps">
          {evidenceGaps.map((eg: any, i: number) => (
            <div key={i} className="rr-p-2-8 rr-mb-2 rr-accent-warning">
              {eg.id && <span className="tag rr-mr-4">{eg.id}</span>}
              <strong>{eg.gap || `Gap ${i + 1}`}</strong>
              {eg.priority && <span className="tag rr-ml-4">{eg.priority}</span>}
              {eg.impact && <div className="rr-muted rr-text-sm">Impact: {eg.impact}</div>}
              {eg.recommendation && <div className="rr-text-sm rr-fg-link">Rec: {eg.recommendation}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Fail-Fast Mechanisms */}
      {d.failFastMechanisms?.length > 0 && !editMode && (
        <CollapsibleSection title="Fail-Fast Mechanisms" count={d.failFastMechanisms.length} sectionId="nfr-failfast">
          {d.failFastMechanisms.map((m: any, i: number) => (
            <div key={i} className="rr-p-4-8 rr-mb-2 rr-accent-orange">
              <strong>{typeof m === 'string' ? m : m.mechanism || m.name || `Mechanism ${i + 1}`}</strong>
              {typeof m === 'object' && m.trigger && <div className="rr-text-sm"><strong>Trigger:</strong> {m.trigger}</div>}
              {typeof m === 'object' && m.action && <div className="rr-text-sm"><strong>Action:</strong> {m.action}</div>}
              {typeof m === 'object' && m.threshold && <span className="tag rr-ml-4">Threshold: {m.threshold}</span>}
              {typeof m === 'object' && m.description && <div className="rr-muted rr-text-sm">{m.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Gate YAML Snippet */}
      {d.gateYamlSnippet && !editMode && (
        <CollapsibleSection title="Gate YAML Snippet" sectionId="nfr-gate-yaml">
          <pre><code>{typeof d.gateYamlSnippet === 'string' ? d.gateYamlSnippet : JSON.stringify(d.gateYamlSnippet, null, 2)}</code></pre>
        </CollapsibleSection>
      )}

      {/* Test Evidence */}
      {d.testEvidence && !editMode && (
        <CollapsibleSection title="Test Evidence" sectionId="nfr-test-evidence">
          {d.testEvidence.required?.length > 0 && (
            <>
              <strong>Required Evidence</strong>
              <ul>
                {d.testEvidence.required.map((e: any, i: number) => (
                  <li key={i}>
                    {typeof e === 'string' ? e : (
                      <>
                        <strong>{e.name || e.evidence || `Evidence ${i + 1}`}</strong>
                        {e.type && <span className="tag rr-ml-4">{e.type}</span>}
                        {e.status && <span className="tag rr-ml-4">{e.status}</span>}
                        {e.description && <div className="rr-muted rr-text-sm">{e.description}</div>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.testEvidence.collected?.length > 0 && (
            <>
              <strong>Collected Evidence</strong>
              <ul>
                {d.testEvidence.collected.map((e: any, i: number) => (
                  <li key={i}>
                    {typeof e === 'string' ? e : (
                      <>
                        <strong>{e.name || e.evidence || `Evidence ${i + 1}`}</strong>
                        {e.type && <span className="tag rr-ml-4">{e.type}</span>}
                        {e.date && <span className="muted rr-ml-4">{e.date}</span>}
                        {e.location && <div className="rr-text-sm"><code>{e.location}</code></div>}
                        {e.result && <div className="rr-text-sm"><strong>Result:</strong> {e.result}</div>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Sign Off */}
      {signOff.signedBy && (
        <CollapsibleSection title="Sign Off" sectionId="nfr-signoff">
          <div><strong>{signOff.signedBy}</strong> {signOff.role && <span className="rr-muted">({signOff.role})</span>}</div>
          {signOff.decision && <span className="tag" style={{ backgroundColor: statusColor(signOff.decision) }}>{signOff.decision}</span>}
          {signOff.date && <div className="rr-muted">{signOff.date}</div>}
          {signOff.conditions?.length > 0 && <div className="rr-mt-4"><strong>Conditions:</strong><ul>{signOff.conditions.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul></div>}
          {signOff.comments && <div className="rr-mt-4"><Md text={signOff.comments} /></div>}
        </CollapsibleSection>
      )}
    </>
  );
}
