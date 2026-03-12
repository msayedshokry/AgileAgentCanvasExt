// ==========================================================================
// TEA RENDERERS — Test Engineering & Automation renderers
// Contains: traceability-matrix, atdd-checklist, ci-pipeline,
//   automation-summary, nfr-assessment
// ==========================================================================

import { RendererProps, CollapsibleSection, Md } from './shared';

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
              {storyInfo.epicId && <div style={{ opacity: 0.7 }}>Epic: {storyInfo.epicId} {storyInfo.epicTitle && `— ${storyInfo.epicTitle}`}</div>}
              {storyInfo.evaluator && <div style={{ opacity: 0.7 }}>Evaluator: {storyInfo.evaluator} {storyInfo.evaluationDate && `(${storyInfo.evaluationDate})`}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Coverage Summary */}
      {coverageSummary.overall && (
        <CollapsibleSection title="Coverage Summary" sectionId="tm-coverage">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {['p0', 'p1', 'p2', 'p3'].map(p => {
              const data = coverageSummary[p];
              return data ? (
                <div key={p} style={{ textAlign: 'center' }}>
                  <strong>{p.toUpperCase()}</strong>
                  <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{data.percentage != null ? `${data.percentage}%` : '—'}</div>
                  <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{data.covered}/{data.total}</div>
                  {data.status && <span className="tag" style={{ backgroundColor: statusColor(data.status) }}>{data.status}</span>}
                </div>
              ) : null;
            })}
            {coverageSummary.overall && (
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--vscode-widget-border)', paddingLeft: '12px' }}>
                <strong>Overall</strong>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{coverageSummary.overall.percentage != null ? `${coverageSummary.overall.percentage}%` : '—'}</div>
                <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{coverageSummary.overall.covered}/{coverageSummary.overall.total}</div>
              </div>
            )}
          </div>
          {traceability.overview && <div style={{ marginTop: '4px' }}><Md text={traceability.overview} /></div>}
        </CollapsibleSection>
      )}

      {/* Detailed Mapping */}
      {detailedMapping.length > 0 && (
        <CollapsibleSection title="Detailed Mapping" count={detailedMapping.length} sectionId="tm-mapping">
          {detailedMapping.map((m: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: `2px solid ${m.coverage === 'full' ? 'var(--vscode-testing-iconPassed)' : m.coverage === 'none' ? 'var(--vscode-errorForeground)' : 'var(--vscode-editorWarning-foreground)'}` }}>
              <div>
                {m.criterionId && <span className="tag" style={{ marginRight: '4px' }}>{m.criterionId}</span>}
                {m.priority && <span className="tag" style={{ marginRight: '4px' }}>{m.priority}</span>}
                <strong>{m.criterion || `Criterion ${i + 1}`}</strong>
                {m.coverage && <span className="tag" style={{ marginLeft: '4px', backgroundColor: statusColor(m.coverage === 'full' ? 'pass' : m.coverage === 'none' ? 'fail' : 'warn') }}>{m.coverage}</span>}
              </div>
              {m.tests?.length > 0 && (
                <div style={{ marginLeft: '16px', fontSize: '0.85em', marginTop: '2px' }}>
                  {m.tests.map((t: any, ti: number) => (
                    <div key={ti} style={{ marginBottom: '2px' }}>
                      {t.testId && <code style={{ marginRight: '4px' }}>{t.testId}</code>}
                      <strong>{t.testName || `Test ${ti + 1}`}</strong>
                      {t.testLevel && <span className="tag" style={{ marginLeft: '4px' }}>{t.testLevel}</span>}
                      {t.status && <span className="tag" style={{ marginLeft: '4px', backgroundColor: statusColor(t.status === 'passing' ? 'pass' : t.status === 'failing' ? 'fail' : 'warn') }}>{t.status}</span>}
                      {t.automationStatus && <span className="tag" style={{ marginLeft: '4px' }}>{t.automationStatus}</span>}
                    </div>
                  ))}
                </div>
              )}
              {m.coverageNotes && <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: '2px' }}>{m.coverageNotes}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Coverage by Test Level */}
      {traceability.coverageByTestLevel && (
        <CollapsibleSection title="Coverage by Test Level" sectionId="tm-levels">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {['unit', 'integration', 'component', 'api', 'e2e'].map(level => {
              const data = traceability.coverageByTestLevel[level];
              return data ? (
                <div key={level} style={{ textAlign: 'center' }}>
                  <strong>{level}</strong>
                  <div>{data.count} tests</div>
                  <div style={{ opacity: 0.7 }}>{data.percentage}%</div>
                </div>
              ) : null;
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Gap Analysis */}
      {(gapAnalysis.summary || gapAnalysis.critical?.length > 0) && (
        <CollapsibleSection title="Gap Analysis" sectionId="tm-gaps">
          {gapAnalysis.summary && <div style={{ marginBottom: '4px' }}><Md text={gapAnalysis.summary} /></div>}
          {['critical', 'high', 'medium', 'low'].map(severity => {
            const gaps: any[] = gapAnalysis[severity] || [];
            return gaps.length > 0 ? (
              <div key={severity} style={{ marginBottom: '4px' }}>
                <h4 style={{ color: severity === 'critical' ? 'var(--vscode-errorForeground)' : undefined }}>{severity.charAt(0).toUpperCase() + severity.slice(1)} ({gaps.length})</h4>
                {gaps.map((g: any, gi: number) => (
                  <div key={gi} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                    {g.gapId && <span className="tag" style={{ marginRight: '4px' }}>{g.gapId}</span>}
                    <strong>{g.gap || `Gap ${gi + 1}`}</strong>
                    {g.impact && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Impact: {g.impact}</div>}
                    {g.recommendation && <div style={{ fontSize: '0.85em', color: 'var(--vscode-textLink-foreground)' }}>Rec: {g.recommendation}</div>}
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
          {qualityAssessment.summary && <div style={{ marginTop: '4px' }}><Md text={qualityAssessment.summary} /></div>}
          {qualityAssessment.scores && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
              {Object.entries(qualityAssessment.scores).map(([k, v]) => (
                <div key={k} style={{ textAlign: 'center' }}>
                  <strong>{k}</strong>
                  <div style={{ fontSize: '1.1em' }}>{String(v)}</div>
                </div>
              ))}
            </div>
          )}
          {qualityAssessment.findings?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              {qualityAssessment.findings.map((f: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <span className="tag" style={{ marginRight: '4px', backgroundColor: f.type === 'positive' ? 'var(--vscode-testing-iconPassed)' : f.type === 'issue' ? 'var(--vscode-errorForeground)' : undefined }}>{f.type}</span>
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
          {gateDecision.decisionMode && <span className="tag" style={{ marginLeft: '4px' }}>{gateDecision.decisionMode}</span>}
          {gateDecision.rationale && <div style={{ marginTop: '4px' }}><Md text={gateDecision.rationale} /></div>}

          {/* Evidence Summary */}
          {gateDecision.evidenceSummary?.testExecution && (
            <div style={{ marginTop: '4px' }}>
              <h4>Test Execution</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="tag" style={{ backgroundColor: 'var(--vscode-testing-iconPassed)' }}>Passed: {gateDecision.evidenceSummary.testExecution.passed}</span>
                {gateDecision.evidenceSummary.testExecution.failed > 0 && <span className="tag" style={{ backgroundColor: 'var(--vscode-errorForeground)' }}>Failed: {gateDecision.evidenceSummary.testExecution.failed}</span>}
                {gateDecision.evidenceSummary.testExecution.skipped > 0 && <span className="tag">Skipped: {gateDecision.evidenceSummary.testExecution.skipped}</span>}
                {gateDecision.evidenceSummary.testExecution.passRate != null && <span className="tag">Pass Rate: {gateDecision.evidenceSummary.testExecution.passRate}%</span>}
              </div>
            </div>
          )}

          {/* Decision Criteria */}
          {gateDecision.decisionCriteria && (
            <div style={{ marginTop: '4px' }}>
              <h4>Decision Criteria</h4>
              {['p0', 'p1', 'p2', 'p3'].map(p => {
                const dc = gateDecision.decisionCriteria[p];
                return dc ? (
                  <div key={p} style={{ padding: '2px 8px' }}>
                    <strong>{p.toUpperCase()}:</strong> {dc.actual}/{dc.required}
                    {dc.pass != null && <span className="tag" style={{ marginLeft: '4px', backgroundColor: dc.pass ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-errorForeground)' }}>{dc.pass ? 'PASS' : 'FAIL'}</span>}
                  </div>
                ) : null;
              })}
            </div>
          )}

          {/* Residual Risks */}
          {gateDecision.residualRisks?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <h4>Residual Risks</h4>
              {gateDecision.residualRisks.map((r: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{r.risk || `Risk ${i + 1}`}</strong>
                  {r.severity && <span className="tag" style={{ marginLeft: '4px' }}>{r.severity}</span>}
                  {r.mitigation && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{r.mitigation}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Next Steps */}
          {gateDecision.nextSteps?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <h4>Next Steps</h4>
              {gateDecision.nextSteps.map((s: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{s.step || `Step ${i + 1}`}</strong>
                  {s.owner && <span className="tag" style={{ marginLeft: '4px' }}>{s.owner}</span>}
                  {s.deadline && <span style={{ opacity: 0.7 }}> — by {s.deadline}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Sign Off */}
      {signOff.signedBy && (
        <CollapsibleSection title="Sign Off" sectionId="tm-signoff">
          <div><strong>{signOff.signedBy}</strong> {signOff.role && <span style={{ opacity: 0.7 }}>({signOff.role})</span>}</div>
          {signOff.date && <div style={{ opacity: 0.7 }}>{signOff.date}</div>}
          {signOff.comments && <div style={{ marginTop: '4px' }}><Md text={signOff.comments} /></div>}
        </CollapsibleSection>
      )}

      {/* Related Artifacts */}
      {relatedArtifacts.length > 0 && (
        <CollapsibleSection title="Related Artifacts" count={relatedArtifacts.length} sectionId="tm-related">
          {relatedArtifacts.map((a: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{a.artifact || `Artifact ${i + 1}`}</strong>
              {a.path && <code style={{ marginLeft: '4px' }}>{a.path}</code>}
              {a.version && <span className="tag" style={{ marginLeft: '4px' }}>{a.version}</span>}
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
              {platform.selectionRationale && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{platform.selectionRationale}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Pipeline Triggers */}
      {pipeline.triggers?.length > 0 && (
        <CollapsibleSection title="Triggers" count={pipeline.triggers.length} sectionId="ci-triggers">
          {pipeline.name && <div style={{ marginBottom: '4px' }}><strong>Pipeline:</strong> {pipeline.name}</div>}
          {pipeline.triggers.map((t: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <span className="tag">{t.event}</span>
              {t.branches?.length > 0 && <span style={{ marginLeft: '4px' }}>Branches: {t.branches.join(', ')}</span>}
              {t.schedule && <span style={{ marginLeft: '4px' }}><code>{t.schedule}</code></span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Jobs */}
      {jobs.length > 0 && (
        <CollapsibleSection title="Jobs" count={jobs.length} sectionId="ci-jobs">
          {jobs.map((j: any, i: number) => (
            <CollapsibleSection key={i} title={j.name || j.id || `Job ${i + 1}`} sectionId={`ci-job-${i}`}>
              {j.description && <div style={{ opacity: 0.85 }}>{j.description}</div>}
              {j.runsOn && <div><strong>Runs on:</strong> <code>{j.runsOn}</code></div>}
              {j.dependsOn?.length > 0 && <div><strong>Depends on:</strong> {j.dependsOn.join(', ')}</div>}
              {j.condition && <div><strong>Condition:</strong> <code>{j.condition}</code></div>}
              {j.timeout && <div><strong>Timeout:</strong> {j.timeout}m</div>}
              {j.steps?.length > 0 && (
                <>
                  <h4>Steps ({j.steps.length})</h4>
                  {j.steps.map((s: any, si: number) => (
                    <div key={si} style={{ padding: '2px 8px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
                      <strong>{s.name || `Step ${si + 1}`}</strong>
                      {s.uses && <div style={{ fontSize: '0.85em' }}><code>{s.uses}</code></div>}
                      {s.run && <pre style={{ fontSize: '0.85em', margin: '2px 0' }}>{s.run}</pre>}
                    </div>
                  ))}
                </>
              )}
              {j.services?.length > 0 && (
                <div style={{ marginTop: '4px' }}>
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
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{ts.name || `Suite ${i + 1}`}</strong>
              {ts.type && <span className="tag" style={{ marginLeft: '4px' }}>{ts.type}</span>}
              {ts.command && <div style={{ fontSize: '0.85em' }}><code>{ts.command}</code></div>}
              {ts.timeout && <span className="tag" style={{ marginLeft: '4px' }}>{ts.timeout}m timeout</span>}
            </div>
          ))}
          {testExecution.burnIn?.enabled && (
            <div style={{ marginTop: '4px' }}>
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
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{g.name || `Gate ${i + 1}`}</strong>
              {g.type && <span className="tag" style={{ marginLeft: '4px' }}>{g.type}</span>}
              {g.threshold && <span className="tag" style={{ marginLeft: '4px' }}>{g.threshold}</span>}
              {g.blocking && <span className="tag" style={{ marginLeft: '4px', backgroundColor: 'var(--vscode-errorForeground)' }}>blocking</span>}
              {g.tool && <span style={{ opacity: 0.7 }}> ({g.tool})</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <CollapsibleSection title="Artifacts" count={artifacts.length} sectionId="ci-artifacts">
          {artifacts.map((a: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{a.name || `Artifact ${i + 1}`}</strong>
              {a.type && <span className="tag" style={{ marginLeft: '4px' }}>{a.type}</span>}
              {a.path && <code style={{ marginLeft: '4px' }}>{a.path}</code>}
              {a.retention && <span style={{ opacity: 0.7 }}> — Retention: {a.retention}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Caching */}
      {caching.enabled && caching.caches?.length > 0 && (
        <CollapsibleSection title="Caching" count={caching.caches.length} sectionId="ci-caching">
          {caching.caches.map((c: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <strong>{c.name || `Cache ${i + 1}`}</strong>
              {c.key && <div style={{ fontSize: '0.85em' }}>Key: <code>{c.key}</code></div>}
              {c.paths?.length > 0 && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Paths: {c.paths.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Secrets */}
      {secrets.length > 0 && (
        <CollapsibleSection title="Secrets Required" count={secrets.length} sectionId="ci-secrets">
          {secrets.map((s: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <code>{s.name}</code>
              {s.required && <span className="tag" style={{ marginLeft: '4px' }}>required</span>}
              {s.purpose && <span style={{ opacity: 0.7 }}> — {s.purpose}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Troubleshooting */}
      {documentation.troubleshooting?.length > 0 && (
        <CollapsibleSection title="Troubleshooting" count={documentation.troubleshooting.length} sectionId="ci-trouble">
          {documentation.troubleshooting.map((t: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{t.issue || `Issue ${i + 1}`}</strong>
              {t.solution && <div style={{ opacity: 0.85, fontSize: '0.85em' }}>{t.solution}</div>}
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
                        {ev.channel && <span className="tag" style={{ marginLeft: '4px' }}>{ev.channel}</span>}
                        {ev.severity && <span className="tag" style={{ marginLeft: '4px' }}>{ev.severity}</span>}
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
                        {msg.template && <div style={{ fontSize: '0.85em' }}><code>{msg.template}</code></div>}
                        {msg.message && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{msg.message}</div>}
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
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
            <table style={{ width: '100%', fontSize: '0.85em' }}>
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
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{g.area || `Gap ${i + 1}`}</strong>
                  {g.gapType && <span className="tag" style={{ marginLeft: '4px' }}>{g.gapType}</span>}
                  {g.priority && <span className="tag" style={{ marginLeft: '4px' }}>{g.priority}</span>}
                  {g.addressed && <span className="tag" style={{ marginLeft: '4px', backgroundColor: 'var(--vscode-testing-iconPassed)' }}>addressed</span>}
                </div>
              ))}
            </>
          )}
          {coverageAnalysis.criticalPaths?.length > 0 && (
            <>
              <h4>Critical Paths ({coverageAnalysis.criticalPaths.length})</h4>
              {coverageAnalysis.criticalPaths.map((cp: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{cp.path || `Path ${i + 1}`}</strong>
                  {cp.status && <span className="tag" style={{ marginLeft: '4px' }}>{cp.status}</span>}
                  {cp.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{cp.description}</div>}
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
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <code>{tc.filePath || `File ${i + 1}`}</code>
              {tc.testType && <span className="tag" style={{ marginLeft: '4px' }}>{tc.testType}</span>}
              {tc.testCount != null && <span className="tag" style={{ marginLeft: '4px' }}>{tc.testCount} tests</span>}
              {tc.targetFeature && <div style={{ opacity: 0.85 }}>Feature: {tc.targetFeature}</div>}
              {tc.tests?.length > 0 && (
                <div style={{ fontSize: '0.85em', marginTop: '2px' }}>
                  {tc.tests.map((t: any, ti: number) => (
                    <div key={ti} style={{ marginLeft: '8px' }}>
                      {t.priority && <span className="tag" style={{ marginRight: '4px' }}>{t.priority}</span>}
                      {t.category && <span className="tag" style={{ marginRight: '4px' }}>{t.category}</span>}
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
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{f.name || `Fixture ${i + 1}`}</strong>
                  {f.filePath && <code style={{ marginLeft: '4px' }}>{f.filePath}</code>}
                  {f.purpose && <span style={{ opacity: 0.7 }}> — {f.purpose}</span>}
                </div>
              ))}
            </>
          )}
          {factoriesCreated.length > 0 && (
            <>
              <h4>Factories</h4>
              {factoriesCreated.map((f: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{f.name || `Factory ${i + 1}`}</strong>
                  {f.entityType && <span className="tag" style={{ marginLeft: '4px' }}>{f.entityType}</span>}
                  {f.filePath && <code style={{ marginLeft: '4px' }}>{f.filePath}</code>}
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
            <div style={{ marginTop: '4px' }}>
              {automationStrategy.testLevels.map((tl: any, i: number) => (
                <div key={i} style={{ padding: '1px 8px' }}>
                  <strong>{tl.level}:</strong> {tl.percentage} {tl.rationale && <span style={{ opacity: 0.7 }}>— {tl.rationale}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Execution Results */}
      {executionResults.totalTests != null && (
        <CollapsibleSection title="Execution Results" sectionId="as-results">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className="tag">Total: {executionResults.totalTests}</span>
            {executionResults.passed != null && <span className="tag" style={{ backgroundColor: 'var(--vscode-testing-iconPassed)' }}>Passed: {executionResults.passed}</span>}
            {executionResults.failed != null && executionResults.failed > 0 && <span className="tag" style={{ backgroundColor: 'var(--vscode-errorForeground)' }}>Failed: {executionResults.failed}</span>}
            {executionResults.skipped != null && executionResults.skipped > 0 && <span className="tag">Skipped: {executionResults.skipped}</span>}
            {executionResults.duration && <span className="tag">{executionResults.duration}</span>}
          </div>
          {executionResults.failureDetails?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <h4>Failures</h4>
              {executionResults.failureDetails.map((f: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', borderLeft: '2px solid var(--vscode-errorForeground)' }}>
                  <strong>{f.test || `Failure ${i + 1}`}</strong>
                  {f.error && <div style={{ color: 'var(--vscode-errorForeground)', fontSize: '0.85em' }}>{f.error}</div>}
                  {f.resolution && <div style={{ fontSize: '0.85em', color: 'var(--vscode-testing-iconPassed)' }}>Fix: {f.resolution}</div>}
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
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{r.recommendation || r.area || `Rec ${i + 1}`}</strong>
              {r.priority && <span className="tag" style={{ marginLeft: '4px' }}>{r.priority}</span>}
              {r.effort && <span className="tag" style={{ marginLeft: '4px' }}>Effort: {r.effort}</span>}
              {r.impact && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{r.impact}</div>}
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
                        {a.type && <span className="tag" style={{ marginLeft: '4px' }}>{a.type}</span>}
                        {a.version && <span className="tag" style={{ marginLeft: '4px' }}>{a.version}</span>}
                        {a.purpose && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{a.purpose}</div>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.bmadIntegration.gateStatus && (
            <div style={{ marginTop: '4px' }}>
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
                        {link.type && <span className="tag" style={{ marginLeft: '4px' }}>{link.type}</span>}
                        {link.status && <span className="tag" style={{ marginLeft: '4px' }}>{link.status}</span>}
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
              {storyInfo.epicId && <div style={{ opacity: 0.7 }}>Epic: {storyInfo.epicId}</div>}
              {storyInfo.primaryTestLevel && <span className="tag">{storyInfo.primaryTestLevel}</span>}
              {storyInfo.storyDescription && <div style={{ marginTop: '4px' }}><Md text={storyInfo.storyDescription} /></div>}
              {storyInfo.businessValue && <div style={{ opacity: 0.7, fontSize: '0.85em' }}><strong>Business Value:</strong> {storyInfo.businessValue}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Completion Status */}
      {completion.status && (
        <div style={{ padding: '4px 8px', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="tag" style={{ backgroundColor: completion.status === 'complete' ? 'var(--vscode-testing-iconPassed)' : completion.status === 'blocked' ? 'var(--vscode-errorForeground)' : undefined }}>{completion.status}</span>
          {completion.percentComplete != null && <span>{completion.percentComplete}%</span>}
          {completion.blockers?.length > 0 && <span style={{ color: 'var(--vscode-errorForeground)' }}>Blockers: {completion.blockers.length}</span>}
        </div>
      )}

      {/* Acceptance Criteria */}
      {acceptanceCriteria.length > 0 && (
        <CollapsibleSection title="Acceptance Criteria" count={acceptanceCriteria.length} sectionId="atdd-ac">
          {acceptanceCriteria.map((ac: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              {ac.id && <span className="tag" style={{ marginRight: '4px' }}>{ac.id}</span>}
              <strong>{ac.title || ac.description || `AC ${i + 1}`}</strong>
              {ac.given && <div style={{ fontSize: '0.85em' }}><strong>Given</strong> {ac.given}</div>}
              {ac.when && <div style={{ fontSize: '0.85em' }}><strong>When</strong> {ac.when}</div>}
              {ac.then && <div style={{ fontSize: '0.85em' }}><strong>Then</strong> {ac.then}</div>}
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
              <div key={level} style={{ marginBottom: '4px' }}>
                <h4>{level.toUpperCase()} ({tests.length})</h4>
                {tests.map((t: any, i: number) => (
                  <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
                    {t.testId && <code style={{ marginRight: '4px' }}>{t.testId}</code>}
                    <strong>{t.name || `Test ${i + 1}`}</strong>
                    {t.status && <span className="tag" style={{ marginLeft: '4px' }}>{t.status}</span>}
                    {t.acReference && <span className="tag" style={{ marginLeft: '4px' }}>{t.acReference}</span>}
                    {t.filePath && <div style={{ fontSize: '0.85em' }}><code>{t.filePath}</code></div>}
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
            <div key={i} style={{ padding: '4px 8px', marginBottom: '4px', borderLeft: '2px solid var(--vscode-widget-border)' }}>
              {s.scenarioId && <span className="tag" style={{ marginRight: '4px' }}>{s.scenarioId}</span>}
              <strong>{s.name || `Scenario ${i + 1}`}</strong>
              {s.testLevel && <span className="tag" style={{ marginLeft: '4px' }}>{s.testLevel}</span>}
              {s.automationStatus && <span className="tag" style={{ marginLeft: '4px' }}>{s.automationStatus}</span>}
              {s.given?.length > 0 && <div style={{ fontSize: '0.85em' }}><strong>Given</strong> {s.given.join(' AND ')}</div>}
              {s.when?.length > 0 && <div style={{ fontSize: '0.85em' }}><strong>When</strong> {s.when.join(' AND ')}</div>}
              {s.then?.length > 0 && <div style={{ fontSize: '0.85em' }}><strong>Then</strong> {s.then.join(' AND ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Implementation Checklist */}
      {checklist.length > 0 && (
        <CollapsibleSection title="Implementation Checklist" count={checklist.length} sectionId="atdd-checklist">
          {checklist.map((item: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          {rgr.currentPhase && <div><strong>Current Phase:</strong> <span className="tag" style={{ backgroundColor: rgr.currentPhase === 'red' ? 'var(--vscode-errorForeground)' : rgr.currentPhase === 'green' ? 'var(--vscode-testing-iconPassed)' : undefined }}>{rgr.currentPhase}</span></div>}
          {rgr.iterations.map((it: any, i: number) => (
            <CollapsibleSection key={i} title={`Iteration ${it.iteration || i + 1}: ${it.targetAC || ''}`} sectionId={`atdd-rgr-${i}`}>
              {it.red && (
                <div style={{ padding: '2px 8px', borderLeft: '3px solid var(--vscode-errorForeground)' }}>
                  <strong>RED:</strong> {it.red.description}
                  {it.red.testFile && <div style={{ fontSize: '0.85em' }}><code>{it.red.testFile}</code></div>}
                  {it.red.failureMessage && <div style={{ fontSize: '0.85em', color: 'var(--vscode-errorForeground)' }}>{it.red.failureMessage}</div>}
                </div>
              )}
              {it.green && (
                <div style={{ padding: '2px 8px', borderLeft: '3px solid var(--vscode-testing-iconPassed)' }}>
                  <strong>GREEN:</strong> {it.green.description}
                  {it.green.filesChanged?.length > 0 && <div style={{ fontSize: '0.85em' }}>Files: {it.green.filesChanged.join(', ')}</div>}
                </div>
              )}
              {it.refactor && (
                <div style={{ padding: '2px 8px', borderLeft: '3px solid var(--vscode-textLink-foreground)' }}>
                  <strong>REFACTOR:</strong> {it.refactor.description}
                  {it.refactor.improvements?.length > 0 && <ul style={{ fontSize: '0.85em' }}>{it.refactor.improvements.map((imp: string, ii: number) => <li key={ii}>{imp}</li>)}</ul>}
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
            <div key={key} style={{ padding: '1px 8px' }}>
              <strong>{key}:</strong> <code>{String(val)}</code>
            </div>
          ) : null)}
        </CollapsibleSection>
      )}

      {/* Test Execution Evidence */}
      {testEvidence.results && (
        <CollapsibleSection title="Test Execution Evidence" sectionId="atdd-evidence">
          {testEvidence.lastRun && <div style={{ opacity: 0.7 }}>Last run: {testEvidence.lastRun}</div>}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
            {testEvidence.results.passed != null && <span className="tag" style={{ backgroundColor: 'var(--vscode-testing-iconPassed)' }}>Passed: {testEvidence.results.passed}</span>}
            {testEvidence.results.failed != null && testEvidence.results.failed > 0 && <span className="tag" style={{ backgroundColor: 'var(--vscode-errorForeground)' }}>Failed: {testEvidence.results.failed}</span>}
            {testEvidence.results.skipped != null && testEvidence.results.skipped > 0 && <span className="tag">Skipped: {testEvidence.results.skipped}</span>}
            {testEvidence.results.totalDuration && <span className="tag">{testEvidence.results.totalDuration}</span>}
          </div>
          {testEvidence.coverage && (
            <div style={{ marginTop: '4px' }}>
              <strong>Coverage:</strong>
              {Object.entries(testEvidence.coverage).map(([k, v]) => (
                <span key={k} className="tag" style={{ marginLeft: '4px' }}>{k}: {String(v)}%</span>
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
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{m.service || `Mock ${i + 1}`}</strong>
                  {m.mockType && <span className="tag" style={{ marginLeft: '4px' }}>{m.mockType}</span>}
                  {m.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{m.description}</div>}
                </div>
              ))}
            </>
          )}
          {pageObjects.length > 0 && (
            <>
              <h4>Page Objects ({pageObjects.length})</h4>
              {pageObjects.map((po: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{po.name || `PO ${i + 1}`}</strong>
                  {po.page && <span style={{ opacity: 0.7 }}> — {po.page}</span>}
                  {po.filePath && <div style={{ fontSize: '0.85em' }}><code>{po.filePath}</code></div>}
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
            <div key={i} style={{ padding: '2px 8px' }}>
              <code>{tid.testId}</code>
              {tid.element && <span className="tag" style={{ marginLeft: '4px' }}>{tid.element}</span>}
              {tid.status && <span className="tag" style={{ marginLeft: '4px', backgroundColor: tid.status === 'verified' ? 'var(--vscode-testing-iconPassed)' : undefined }}>{tid.status}</span>}
              {tid.purpose && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{tid.purpose}</div>}
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
            <div key={i} style={{ padding: '4px 8px', marginBottom: '2px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{typeof f === 'string' ? f : f.name || f.factory || `Factory ${i + 1}`}</strong>
              {typeof f === 'object' && f.path && <div style={{ fontSize: '0.85em' }}><code>{f.path}</code></div>}
              {typeof f === 'object' && f.entity && <span className="tag" style={{ marginLeft: '4px' }}>{f.entity}</span>}
              {typeof f === 'object' && f.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{f.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Fixtures Created */}
      {d.fixturesCreated?.length > 0 && !editMode && (
        <CollapsibleSection title="Fixtures Created" count={d.fixturesCreated.length} sectionId="atdd-fixtures">
          {d.fixturesCreated.map((f: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '2px', borderLeft: '2px solid var(--vscode-textLink-foreground)' }}>
              <strong>{typeof f === 'string' ? f : f.name || f.fixture || `Fixture ${i + 1}`}</strong>
              {typeof f === 'object' && f.path && <div style={{ fontSize: '0.85em' }}><code>{f.path}</code></div>}
              {typeof f === 'object' && f.scope && <span className="tag" style={{ marginLeft: '4px' }}>{f.scope}</span>}
              {typeof f === 'object' && f.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{f.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Knowledge Base References */}
      {d.knowledgeBaseReferences?.length > 0 && !editMode && (
        <CollapsibleSection title="Knowledge Base References" count={d.knowledgeBaseReferences.length} sectionId="atdd-kb-refs">
          {d.knowledgeBaseReferences.map((ref: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{typeof ref === 'string' ? ref : ref.title || ref.name || `Reference ${i + 1}`}</strong>
              {typeof ref === 'object' && ref.url && <div style={{ fontSize: '0.85em' }}><code>{ref.url}</code></div>}
              {typeof ref === 'object' && ref.type && <span className="tag" style={{ marginLeft: '4px' }}>{ref.type}</span>}
              {typeof ref === 'object' && ref.relevance && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{ref.relevance}</div>}
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
              {featureInfo.storyId && <div style={{ opacity: 0.7 }}>Story: {featureInfo.storyId} {featureInfo.epicId && `| Epic: ${featureInfo.epicId}`}</div>}
              {featureInfo.environment && <div style={{ opacity: 0.7 }}>Environment: {featureInfo.environment}</div>}
              {featureInfo.assessor && <div style={{ opacity: 0.7 }}>Assessor: {featureInfo.assessor} {featureInfo.assessmentDate && `(${featureInfo.assessmentDate})`}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Executive Summary */}
      {d.executiveSummary && (
        <CollapsibleSection title="Executive Summary" sectionId="nfr-exec">
          {editMode ? (
            <textarea rows={5} value={d.executiveSummary} style={{ width: '100%' }} onChange={(e) => handleFieldChange('executiveSummary', e.target.value)} />
          ) : (
            <Md text={d.executiveSummary} />
          )}
        </CollapsibleSection>
      )}

      {/* NFR Requirements */}
      {nfrRequirements.length > 0 && (
        <CollapsibleSection title="NFR Requirements" count={nfrRequirements.length} sectionId="nfr-reqs">
          {nfrRequirements.map((r: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              {r.id && <span className="tag" style={{ marginRight: '4px' }}>{r.id}</span>}
              <strong>{r.requirement || `Req ${i + 1}`}</strong>
              {r.category && <span className="tag" style={{ marginLeft: '4px' }}>{r.category}</span>}
              {r.priority && <span className="tag" style={{ marginLeft: '4px' }}>{r.priority}</span>}
              {r.target && <div style={{ fontSize: '0.85em' }}>Target: <code>{r.target}</code></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Performance Assessment */}
      {assessments.performance?.status && (
        <CollapsibleSection title="Performance" sectionId="nfr-perf">
          <span className="tag" style={{ backgroundColor: statusColor(assessments.performance.status) }}>{assessments.performance.status}</span>
          {assessments.performance.summary && <div style={{ marginTop: '4px' }}><Md text={assessments.performance.summary} /></div>}
          {assessments.performance.responseTime && (
            <div style={{ marginTop: '4px' }}>
              <h4>Response Time</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {assessments.performance.responseTime.target && <span className="tag">Target: {assessments.performance.responseTime.target}</span>}
                {assessments.performance.responseTime.actual && <span className="tag">Actual: {assessments.performance.responseTime.actual}</span>}
                {assessments.performance.responseTime.p50 && <span className="tag">P50: {assessments.performance.responseTime.p50}</span>}
                {assessments.performance.responseTime.p95 && <span className="tag">P95: {assessments.performance.responseTime.p95}</span>}
                {assessments.performance.responseTime.p99 && <span className="tag">P99: {assessments.performance.responseTime.p99}</span>}
              </div>
            </div>
          )}
          {assessments.performance.scalability?.bottlenecks?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <h4>Bottlenecks</h4>
              {assessments.performance.scalability.bottlenecks.map((b: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{b.bottleneck || `Bottleneck ${i + 1}`}</strong>
                  {b.impact && <span style={{ opacity: 0.7 }}> — {b.impact}</span>}
                  {b.recommendation && <div style={{ fontSize: '0.85em', color: 'var(--vscode-textLink-foreground)' }}>Rec: {b.recommendation}</div>}
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
          {assessments.security.summary && <div style={{ marginTop: '4px' }}><Md text={assessments.security.summary} /></div>}
          {assessments.security.vulnerabilities?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <h4>Vulnerabilities ({assessments.security.vulnerabilities.length})</h4>
              {assessments.security.vulnerabilities.map((v: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px', marginBottom: '2px', borderLeft: `2px solid ${v.severity === 'critical' || v.severity === 'high' ? 'var(--vscode-errorForeground)' : 'var(--vscode-widget-border)'}` }}>
                  {v.id && <span className="tag" style={{ marginRight: '4px' }}>{v.id}</span>}
                  {v.severity && <span className="tag" style={{ marginRight: '4px', backgroundColor: v.severity === 'critical' ? 'var(--vscode-errorForeground)' : undefined }}>{v.severity}</span>}
                  <strong>{v.vulnerability || `Vuln ${i + 1}`}</strong>
                  {v.status && <span className="tag" style={{ marginLeft: '4px' }}>{v.status}</span>}
                  {v.remediation && <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Fix: {v.remediation}</div>}
                </div>
              ))}
            </div>
          )}
          {assessments.security.securityScans?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <h4>Security Scans</h4>
              {assessments.security.securityScans.map((s: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{s.scanType}</strong> ({s.tool})
                  {s.findingsCount && <span style={{ marginLeft: '4px' }}>C:{s.findingsCount.critical} H:{s.findingsCount.high} M:{s.findingsCount.medium} L:{s.findingsCount.low}</span>}
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
          {assessments.reliability.summary && <div style={{ marginTop: '4px' }}><Md text={assessments.reliability.summary} /></div>}
          {assessments.reliability.availability && (
            <div style={{ marginTop: '4px' }}>
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
          {assessments.maintainability.summary && <div style={{ marginTop: '4px' }}><Md text={assessments.maintainability.summary} /></div>}
          {assessments.maintainability.testCoverage && (
            <div style={{ marginTop: '4px' }}>
              <strong>Test Coverage:</strong> Overall {assessments.maintainability.testCoverage.overall} (Target: {assessments.maintainability.testCoverage.target})
            </div>
          )}
          {assessments.maintainability.technicalDebt?.majorItems?.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <h4>Technical Debt</h4>
              {assessments.maintainability.technicalDebt.majorItems.map((item: any, i: number) => (
                <div key={i} style={{ padding: '2px 8px' }}>
                  <strong>{item.item || `Item ${i + 1}`}</strong>
                  {item.effort && <span className="tag" style={{ marginLeft: '4px' }}>{item.effort}</span>}
                  {item.impact && <span style={{ opacity: 0.7 }}> — {item.impact}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Findings Summary */}
      {findingsSummary.categories?.length > 0 && (
        <CollapsibleSection title="Findings Summary" sectionId="nfr-findings">
          {findingsSummary.overallScore != null && <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>Score: {findingsSummary.overallScore}</div>}
          {findingsSummary.gateDecision && <span className="tag" style={{ backgroundColor: statusColor(findingsSummary.gateDecision) }}>{findingsSummary.gateDecision}</span>}
          {findingsSummary.categories.map((cat: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginTop: '4px', borderLeft: `2px solid ${statusColor(cat.status) || 'var(--vscode-widget-border)'}` }}>
              <strong>{cat.category}</strong>
              {cat.status && <span className="tag" style={{ marginLeft: '4px', backgroundColor: statusColor(cat.status) }}>{cat.status}</span>}
              {cat.score != null && <span className="tag" style={{ marginLeft: '4px' }}>{cat.score}</span>}
              {cat.findings?.length > 0 && (
                <div style={{ fontSize: '0.85em', marginTop: '2px' }}>
                  {cat.findings.map((f: any, fi: number) => (
                    <div key={fi} style={{ marginLeft: '8px' }}>
                      {f.severity && <span className="tag" style={{ marginRight: '4px' }}>{f.severity}</span>}
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
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              {qw.id && <span className="tag" style={{ marginRight: '4px' }}>{qw.id}</span>}
              <strong>{qw.improvement || `QW ${i + 1}`}</strong>
              {qw.category && <span className="tag" style={{ marginLeft: '4px' }}>{qw.category}</span>}
              {qw.effort && <span className="tag" style={{ marginLeft: '4px' }}>Effort: {qw.effort}</span>}
              {qw.impact && <span className="tag" style={{ marginLeft: '4px' }}>Impact: {qw.impact}</span>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Recommended Actions */}
      {recommendedActions.length > 0 && (
        <CollapsibleSection title="Recommended Actions" count={recommendedActions.length} sectionId="nfr-actions">
          {recommendedActions.map((ra: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              {ra.id && <span className="tag" style={{ marginRight: '4px' }}>{ra.id}</span>}
              <strong>{ra.action || `Action ${i + 1}`}</strong>
              {ra.category && <span className="tag" style={{ marginLeft: '4px' }}>{ra.category}</span>}
              {ra.priority && <span className="tag" style={{ marginLeft: '4px' }}>{ra.priority}</span>}
              {ra.effort && <span className="tag" style={{ marginLeft: '4px' }}>{ra.effort}</span>}
              {ra.impact && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{ra.impact}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Monitoring Hooks */}
      {monitoringHooks.length > 0 && (
        <CollapsibleSection title="Monitoring Hooks" count={monitoringHooks.length} sectionId="nfr-monitoring">
          {monitoringHooks.map((mh: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px' }}>
              <strong>{mh.metric || `Metric ${i + 1}`}</strong>
              {mh.threshold && <span className="tag" style={{ marginLeft: '4px' }}>Alert: {mh.threshold}</span>}
              {mh.warningThreshold && <span className="tag" style={{ marginLeft: '4px' }}>Warn: {mh.warningThreshold}</span>}
              {mh.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{mh.description}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Evidence Gaps */}
      {evidenceGaps.length > 0 && (
        <CollapsibleSection title="Evidence Gaps" count={evidenceGaps.length} sectionId="nfr-gaps">
          {evidenceGaps.map((eg: any, i: number) => (
            <div key={i} style={{ padding: '2px 8px', marginBottom: '2px', borderLeft: '2px solid var(--vscode-editorWarning-foreground)' }}>
              {eg.id && <span className="tag" style={{ marginRight: '4px' }}>{eg.id}</span>}
              <strong>{eg.gap || `Gap ${i + 1}`}</strong>
              {eg.priority && <span className="tag" style={{ marginLeft: '4px' }}>{eg.priority}</span>}
              {eg.impact && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>Impact: {eg.impact}</div>}
              {eg.recommendation && <div style={{ fontSize: '0.85em', color: 'var(--vscode-textLink-foreground)' }}>Rec: {eg.recommendation}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Fail-Fast Mechanisms */}
      {d.failFastMechanisms?.length > 0 && !editMode && (
        <CollapsibleSection title="Fail-Fast Mechanisms" count={d.failFastMechanisms.length} sectionId="nfr-failfast">
          {d.failFastMechanisms.map((m: any, i: number) => (
            <div key={i} style={{ padding: '4px 8px', marginBottom: '2px', borderLeft: '2px solid var(--vscode-charts-orange)' }}>
              <strong>{typeof m === 'string' ? m : m.mechanism || m.name || `Mechanism ${i + 1}`}</strong>
              {typeof m === 'object' && m.trigger && <div style={{ fontSize: '0.85em' }}><strong>Trigger:</strong> {m.trigger}</div>}
              {typeof m === 'object' && m.action && <div style={{ fontSize: '0.85em' }}><strong>Action:</strong> {m.action}</div>}
              {typeof m === 'object' && m.threshold && <span className="tag" style={{ marginLeft: '4px' }}>Threshold: {m.threshold}</span>}
              {typeof m === 'object' && m.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{m.description}</div>}
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
                        {e.type && <span className="tag" style={{ marginLeft: '4px' }}>{e.type}</span>}
                        {e.status && <span className="tag" style={{ marginLeft: '4px' }}>{e.status}</span>}
                        {e.description && <div style={{ opacity: 0.7, fontSize: '0.85em' }}>{e.description}</div>}
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
                        {e.type && <span className="tag" style={{ marginLeft: '4px' }}>{e.type}</span>}
                        {e.date && <span className="muted" style={{ marginLeft: '4px' }}>{e.date}</span>}
                        {e.location && <div style={{ fontSize: '0.85em' }}><code>{e.location}</code></div>}
                        {e.result && <div style={{ fontSize: '0.85em' }}><strong>Result:</strong> {e.result}</div>}
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
          <div><strong>{signOff.signedBy}</strong> {signOff.role && <span style={{ opacity: 0.7 }}>({signOff.role})</span>}</div>
          {signOff.decision && <span className="tag" style={{ backgroundColor: statusColor(signOff.decision) }}>{signOff.decision}</span>}
          {signOff.date && <div style={{ opacity: 0.7 }}>{signOff.date}</div>}
          {signOff.conditions?.length > 0 && <div style={{ marginTop: '4px' }}><strong>Conditions:</strong><ul>{signOff.conditions.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul></div>}
          {signOff.comments && <div style={{ marginTop: '4px' }}><Md text={signOff.comments} /></div>}
        </CollapsibleSection>
      )}
    </>
  );
}
