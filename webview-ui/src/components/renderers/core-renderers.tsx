/**
 * Core renderer functions extracted from DetailPanel.
 *
 * Covers: story, epic, requirement, vision, use-case, prd, architecture,
 * product-brief, test-case, test-strategy, architecture-decision,
 * system-component, task, risk, nfr, additional-req, definition-of-done,
 * fit-criteria, success-metrics, retrospective, sprint-status, code-review,
 * and generic details.
 *
 * Each function accepts RendererProps and returns JSX.
 * No hooks are used inside these functions.
 */
import type {
  PriorityLevel,
  TestCaseMetadata,
  TestStrategyMetadata,
  ArchitectureDecision,
} from '../../types';

import {
  PRIORITY_OPTIONS,
  REQUIREMENT_STATUS_OPTIONS,
  VERIFICATION_METHOD_OPTIONS,
} from '../../types';

import { RendererProps, Md, CollapsibleSection, ArtifactPicker } from './shared';

// ==========================================================================
// SHARED HELPERS
// ==========================================================================

/**
 * Renders a priority select/badge field.
 * Extracted from the closure — needs editMode passed explicitly.
 */
export function renderPriorityField(
  value: PriorityLevel | string | undefined,
  onChange: (v: PriorityLevel) => void,
  editMode: boolean,
) {
  return (
    <section className="detail-section inline">
      <h4>Priority</h4>
      {editMode ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value as PriorityLevel)}
          className="status-select"
        >
          <option value="">Not set</option>
          {PRIORITY_OPTIONS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      ) : (
        value ? (
          <span className={`priority-badge priority-${value}`}>{value}</span>
        ) : (
          <span className="empty-message">Not set</span>
        )
      )}
    </section>
  );
}

/**
 * Renders a labels/tags editable list.
 * Extracted from the closure — needs editMode, updateArrayItem, removeFromArray, addToArray passed explicitly.
 */
export function renderLabelsField(
  labels: string[],
  editMode: boolean,
  updateArrayItem: (field: string, index: number, value: any) => void,
  removeFromArray: (field: string, index: number) => void,
  addToArray: (field: string, defaultItem: any) => void,
) {
  return (
    <CollapsibleSection title="Labels" count={labels.length} sectionId="labels">
      {editMode ? (
        <div className="editable-list horizontal">
          {labels.map((label: string, i: number) => (
            <div key={i} className="editable-tag">
              <input
                type="text"
                value={label}
                onChange={(e) => updateArrayItem('labels', i, e.target.value)}
                placeholder="Label"
              />
              <button className="remove-btn" onClick={() => removeFromArray('labels', i)}>×</button>
            </div>
          ))}
          <button className="btn btn-secondary btn-small" onClick={() => addToArray('labels', '')}>
            + Add Label
          </button>
        </div>
      ) : (
        labels.length > 0 ? (
          <div className="tags-list">
            {labels.map((label: string, i: number) => (
              <span key={i} className="tag">{label}</span>
            ))}
          </div>
        ) : (
          <p className="empty-message">No labels defined</p>
        )
      )}
    </CollapsibleSection>
  );
}

// ==========================================================================
// STORY DETAILS
// ==========================================================================

export function renderStoryDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray, artifact, allArtifacts } = props;

  // --- Normalize tasks: each task's subtasks may be plain strings ---
  const rawTasks: any[] = editedData.tasks || [];
  const tasks: any[] = rawTasks.map((task: any) => {
    if (!task.subtasks || !Array.isArray(task.subtasks)) return task;
    return {
      ...task,
      subtasks: task.subtasks.map((st: any) =>
        typeof st === 'string' ? { description: st } : st
      )
    };
  });

  const acceptanceCriteria: any[] = editedData.acceptanceCriteria || [];

  // --- Normalize dependencies ---
  const rawDeps = editedData.dependencies;
  // dependencies can be string[] (simple) or object (rich) — normalize to object
  const dependencies: any = Array.isArray(rawDeps)
    ? { blockedBy: rawDeps.map((id: string) => ({ storyId: id })) }
    : (rawDeps || {});
  // Normalize externalDependencies: sample uses {name, status}, renderer expects {dependency, status}
  if (dependencies.externalDependencies) {
    dependencies.externalDependencies = dependencies.externalDependencies.map((d: any) => {
      if (typeof d === 'string') return d;
      if (d.name && !d.dependency) return { ...d, dependency: d.name };
      return d;
    });
  }

  // --- Normalize devNotes ---
  // Sample shape: {implementationApproach, technicalConsiderations, testingStrategy (string), relatedFiles[], estimatedEffort}
  // Renderer expects: {overview, architecturePatterns[], testingStrategy ({unitTests[], integrationTests[], e2eTests[]}),
  //                    securityConsiderations[], performanceConsiderations[], edgeCases[], componentsToCreate[], componentsToModify[],
  //                    dataModels[], apiEndpoints[], accessibilityConsiderations[], potentialChallenges[]}
  const rawDevNotes: any = editedData.devNotes || {};
  const devNotes: any = (() => {
    const dn = { ...rawDevNotes };
    // Map implementationApproach -> overview
    if (dn.implementationApproach && !dn.overview) {
      dn.overview = dn.implementationApproach;
    }
    // Map technicalConsiderations string -> performanceConsiderations[]
    if (typeof dn.technicalConsiderations === 'string' && dn.technicalConsiderations) {
      if (!dn.performanceConsiderations || dn.performanceConsiderations.length === 0) {
        dn.performanceConsiderations = [dn.technicalConsiderations];
      }
    }
    // Map testingStrategy string -> testingStrategy object, or leave as-is if already object
    if (typeof dn.testingStrategy === 'string' && dn.testingStrategy) {
      dn.testingStrategy = { unitTests: [dn.testingStrategy] };
    }
    // Map relatedFiles -> componentsToModify if none exist
    if (Array.isArray(dn.relatedFiles) && dn.relatedFiles.length > 0 && (!dn.componentsToModify || dn.componentsToModify.length === 0)) {
      dn.componentsToModify = dn.relatedFiles.map((f: string) => (typeof f === 'string' ? { path: f } : f));
    }
    return dn;
  })();

  const rawUserStory: any = editedData.userStory || {};
  // Backward-compat aliases: role→asA, action→iWant, benefit→soThat
  const userStory: any = {
    ...rawUserStory,
    asA: rawUserStory.asA || rawUserStory.role || '',
    iWant: rawUserStory.iWant || rawUserStory.action || '',
    soThat: rawUserStory.soThat || rawUserStory.benefit || '',
  };
  const labels: string[] = editedData.labels || [];
  const implementationDetails: string[] = editedData.implementationDetails || [];
  const requirementRefs: string[] = editedData.requirementRefs || [];
  const uxReferences: any[] = editedData.uxReferences || [];
  const references: any[] = editedData.references || [];
  const solutionDetails: string[] = editedData.solutionDetails || [];
  const devAgentRecord: any = editedData.devAgentRecord || {};
  const history: any[] = editedData.history || [];

  return (
    <>
      {/* Priority & Effort Row */}
      <div className="detail-row">
        {renderPriorityField(editedData.priority, (v) => handleFieldChange('priority', v), editMode)}

        {(editMode || editedData.storyFormat) && (
          <section className="detail-section inline">
            <h4>Format</h4>
            {editMode ? (
              <select
                value={editedData.storyFormat || ''}
                onChange={(e) => handleFieldChange('storyFormat', e.target.value)}
                className="status-select"
              >
                <option value="">Not set</option>
                {['user-story', 'job-story', 'technical', 'enabler'].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            ) : (
              <span className="artifact-badge">{editedData.storyFormat}</span>
            )}
          </section>
        )}

        <section className="detail-section inline">
          <h4>Story Points</h4>
          {editMode ? (
            <input
              type="number"
              value={editedData.storyPoints ?? ''}
              onChange={(e) => handleFieldChange('storyPoints', e.target.value ? Number(e.target.value) : undefined)}
              min="0"
              placeholder="Points"
              style={{ width: '60px' }}
            />
          ) : (
            <span>{editedData.storyPoints ?? <span className="empty-message">Not estimated</span>}</span>
          )}
        </section>

        {(editMode || editedData.estimatedEffort) && (
          <section className="detail-section inline">
            <h4>Effort</h4>
            {editMode ? (
              <input
                type="text"
                value={editedData.estimatedEffort || ''}
                onChange={(e) => handleFieldChange('estimatedEffort', e.target.value)}
                placeholder="S/M/L/XL or days"
                style={{ width: '80px' }}
              />
            ) : (
              <span className="tag">{editedData.estimatedEffort}</span>
            )}
          </section>
        )}

        <section className="detail-section inline">
          <h4>Epic</h4>
          {editMode ? (
            <ArtifactPicker
              artifacts={allArtifacts}
              artifactType="epic"
              selectedIds={editedData.epicId ? [editedData.epicId] : []}
              onChange={(ids) => handleFieldChange('epicId', ids[0] || '')}
              mode="single"
              placeholder="Search epics..."
              excludeIds={[artifact.id]}
            />
          ) : (
            editedData.epicId ? (
              <span className="tag">{editedData.epicId}{editedData.epicTitle ? ` — ${editedData.epicTitle}` : ''}</span>
            ) : (
              <span className="empty-message">No epic</span>
            )
          )}
        </section>

        {(editMode || editedData.assignee) && (
          <section className="detail-section inline">
            <h4>Assignee</h4>
            {editMode ? (
              <input
                type="text"
                value={editedData.assignee || ''}
                onChange={(e) => handleFieldChange('assignee', e.target.value)}
                placeholder="Assignee..."
                style={{ width: '120px' }}
              />
            ) : (
              <span>{editedData.assignee}</span>
            )}
          </section>
        )}
      </div>

      {/* User Story */}
      <CollapsibleSection title="User Story" sectionId="story-userstory">
        {editMode ? (
          <div className="user-story-edit">
            <label>
              <span className="field-label">As a</span>
              <input type="text" value={userStory.asA || ''} onChange={(e) => handleFieldChange('userStory', { ...userStory, asA: e.target.value })} placeholder="role/persona..." />
            </label>
            <label>
              <span className="field-label">I want</span>
              <textarea value={userStory.iWant || ''} onChange={(e) => handleFieldChange('userStory', { ...userStory, iWant: e.target.value })} rows={2} placeholder="capability..." />
            </label>
            <label>
              <span className="field-label">So that</span>
              <textarea value={userStory.soThat || ''} onChange={(e) => handleFieldChange('userStory', { ...userStory, soThat: e.target.value })} rows={2} placeholder="benefit..." />
            </label>
            {(userStory.formatted !== undefined || (!userStory.asA && !userStory.iWant && !userStory.soThat)) && (
              <label>
                <span className="field-label">Or formatted text</span>
                <textarea value={userStory.formatted || ''} onChange={(e) => handleFieldChange('userStory', { ...userStory, formatted: e.target.value })} rows={3} placeholder="As a..., I want..., so that..." />
              </label>
            )}
            <label>
              <span className="field-label">Context</span>
              <textarea value={userStory.context || ''} onChange={(e) => handleFieldChange('userStory', { ...userStory, context: e.target.value })} rows={2} placeholder="Additional context..." />
            </label>
            <label>
              <span className="field-label">Notes</span>
              <textarea value={userStory.notes || ''} onChange={(e) => handleFieldChange('userStory', { ...userStory, notes: e.target.value })} rows={2} placeholder="Notes..." />
            </label>
          </div>
        ) : (
          userStory.asA || userStory.iWant || userStory.soThat ? (
            <div className="user-story-display">
              <p><strong>As a</strong> {userStory.asA || '...'}, <strong>I want</strong> {userStory.iWant || '...'}, <strong>so that</strong> {userStory.soThat || '...'}.</p>
              {userStory.context && <p className="muted">{userStory.context}</p>}
              {userStory.notes && <p className="muted"><strong>Notes:</strong> {userStory.notes}</p>}
            </div>
          ) : userStory.formatted ? (
            <Md text={userStory.formatted} />
          ) : (
            <p className="empty-message">No user story defined</p>
          )
        )}
      </CollapsibleSection>

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="story-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={4}
            placeholder="Describe the user story..."
          />
        ) : (
          artifact.description ? <Md text={artifact.description} /> : <p className="empty-message">No description defined</p>
        )}
      </CollapsibleSection>

      {/* Acceptance Criteria */}
      <CollapsibleSection title="Acceptance Criteria" count={acceptanceCriteria.length} sectionId="story-ac">
        {editMode ? (
          <div className="editable-list">
            {acceptanceCriteria.map((ac: any, i: number) => {
              const isGwt = typeof ac === 'object' && ac !== null && (ac.given || ac.when || ac.then);
              return (
                <div key={i} className="editable-list-item ac-edit-item">
                  <div className="ac-edit-header">
                    {ac.id && <span className="ac-id-badge">{ac.id}</span>}
                    <input
                      type="text"
                      value={ac.title || ''}
                      onChange={(e) => updateArrayItem('acceptanceCriteria', i, { ...ac, title: e.target.value })}
                      placeholder="AC title (optional)..."
                      className="ac-title-input"
                    />
                    <select
                      value={isGwt ? 'gwt' : 'prose'}
                      onChange={(e) => {
                        if (e.target.value === 'gwt') {
                          const { criterion, ...rest } = ac;
                          updateArrayItem('acceptanceCriteria', i, { ...rest, given: criterion || '', when: '', then: '' });
                        } else {
                          const { given, when, then: thenVal, and: andVal, but: butVal, ...rest } = ac;
                          const text = given ? `Given ${given}, When ${when}, Then ${thenVal}` : '';
                          updateArrayItem('acceptanceCriteria', i, { ...rest, criterion: text });
                        }
                      }}
                      className="ac-format-select"
                      title="AC format"
                    >
                      <option value="prose">Prose</option>
                      <option value="gwt">Given/When/Then</option>
                    </select>
                    <button className="remove-btn" onClick={() => removeFromArray('acceptanceCriteria', i)}>×</button>
                  </div>
                  {isGwt ? (
                    <div className="ac-gwt-edit">
                      <label><span className="gwt-label">Given</span>
                        <textarea value={ac.given || ''} onChange={(e) => updateArrayItem('acceptanceCriteria', i, { ...ac, given: e.target.value })} rows={2} placeholder="Given..." />
                      </label>
                      <label><span className="gwt-label">When</span>
                        <textarea value={ac.when || ''} onChange={(e) => updateArrayItem('acceptanceCriteria', i, { ...ac, when: e.target.value })} rows={2} placeholder="When..." />
                      </label>
                      <label><span className="gwt-label">Then</span>
                        <textarea value={ac.then || ''} onChange={(e) => updateArrayItem('acceptanceCriteria', i, { ...ac, then: e.target.value })} rows={2} placeholder="Then..." />
                      </label>
                      {(ac.and?.length > 0 || true) && (
                        <div className="ac-gwt-extras">
                          {(ac.and || []).map((item: string, ai: number) => (
                            <div key={`and-${ai}`} className="editable-list-item">
                              <span className="gwt-label">And</span>
                              <input type="text" value={item} onChange={(e) => {
                                const updated = [...(ac.and || [])]; updated[ai] = e.target.value;
                                updateArrayItem('acceptanceCriteria', i, { ...ac, and: updated });
                              }} placeholder="And..." />
                              <button className="remove-btn" onClick={() => {
                                const updated = [...(ac.and || [])]; updated.splice(ai, 1);
                                updateArrayItem('acceptanceCriteria', i, { ...ac, and: updated });
                              }}>×</button>
                            </div>
                          ))}
                          <button className="btn btn-secondary btn-small" onClick={() => {
                            updateArrayItem('acceptanceCriteria', i, { ...ac, and: [...(ac.and || []), ''] });
                          }}>+ And</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <textarea
                      value={typeof ac === 'string' ? ac : ac.criterion || ac.description || ''}
                      onChange={(e) => updateArrayItem('acceptanceCriteria', i, typeof ac === 'string' ? e.target.value : { ...ac, criterion: e.target.value })}
                      rows={2}
                      placeholder="Acceptance criterion..."
                    />
                  )}
                  {typeof ac === 'object' && ac.notes && !isGwt && (
                    <textarea
                      value={ac.notes || ''}
                      onChange={(e) => updateArrayItem('acceptanceCriteria', i, { ...ac, notes: e.target.value })}
                      rows={1}
                      placeholder="Notes..."
                      className="ac-notes-input"
                    />
                  )}
                </div>
              );
            })}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('acceptanceCriteria', { criterion: '' })}>
              + Add Criterion
            </button>
          </div>
        ) : (
          acceptanceCriteria.length > 0 ? (
            <ul className="criteria-list">
              {acceptanceCriteria.map((ac: any, i: number) => {
                if (typeof ac === 'string') return <li key={i}>{ac}</li>;
                const isGwt = ac.given || ac.when || ac.then;
                return (
                  <li key={i} className={isGwt ? 'ac-gwt' : ''}>
                    {ac.id && <span className="ac-id">{ac.id}</span>}
                    {ac.title && <strong className="ac-title">{ac.title}</strong>}
                    {isGwt ? (
                      <div className="ac-gwt-display">
                        {ac.given && <div><span className="gwt-keyword">Given</span> {ac.given}</div>}
                        {ac.when && <div><span className="gwt-keyword">When</span> {ac.when}</div>}
                        {ac.then && <div><span className="gwt-keyword">Then</span> {ac.then}</div>}
                        {ac.and?.map((a: string, ai: number) => (
                          <div key={ai}><span className="gwt-keyword">And</span> {a}</div>
                        ))}
                        {ac.but?.map((b: string, bi: number) => (
                          <div key={bi}><span className="gwt-keyword">But</span> {b}</div>
                        ))}
                      </div>
                    ) : (
                      <span>{ac.criterion || ac.description || ''}</span>
                    )}
                    {ac.notes && <div className="ac-notes">{ac.notes}</div>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-message">No acceptance criteria defined</p>
          )
        )}
      </CollapsibleSection>

      {/* Tasks */}
      <CollapsibleSection title="Tasks" count={tasks.length} sectionId="story-tasks">
        {editMode ? (
          <div className="editable-list">
            {tasks.map((task: any, i: number) => (
              <div key={i} className="task-edit">
                <div className="editable-item-header">
                  {task.id && <span className="ac-id-badge">{task.id}</span>}
                  <textarea
                    value={task.description || ''}
                    onChange={(e) => updateArrayItem('tasks', i, { ...task, description: e.target.value })}
                    rows={2}
                    placeholder="Task description..."
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('tasks', i)}>×</button>
                </div>
                <div className="detail-row">
                  <input
                    type="text"
                    value={task.acReference || ''}
                    onChange={(e) => updateArrayItem('tasks', i, { ...task, acReference: e.target.value })}
                    placeholder="AC ref (e.g. AC-1)"
                    style={{ width: '100px' }}
                  />
                  <input
                    type="number"
                    value={task.estimatedHours ?? ''}
                    onChange={(e) => updateArrayItem('tasks', i, { ...task, estimatedHours: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="Hours"
                    min="0"
                    step="0.5"
                    style={{ width: '70px' }}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={!!task.completed}
                      onChange={(e) => updateArrayItem('tasks', i, { ...task, completed: e.target.checked })}
                    /> Done
                  </label>
                </div>
                {task.notes !== undefined && (
                  <textarea
                    value={task.notes || ''}
                    onChange={(e) => updateArrayItem('tasks', i, { ...task, notes: e.target.value })}
                    rows={1}
                    placeholder="Notes..."
                    className="ac-notes-input"
                  />
                )}
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('tasks', { description: '', completed: false })}>
              + Add Task
            </button>
          </div>
        ) : (
          tasks.length > 0 ? (
            <ul className="task-list">
              {tasks.map((task: any, i: number) => (
                <li key={i} className={`task-item${task.completed ? ' completed' : ''}`}>
                  <span className="task-check">{task.completed ? '☑' : '☐'}</span>
                  {task.id && <span className="ac-id-badge">{task.id}</span>}
                  <span className="task-title">{task.description || task.title || 'Untitled task'}</span>
                  {task.acReference && <span className="tag">{task.acReference}</span>}
                  {task.estimatedHours != null && <span className="task-hours">{task.estimatedHours}h</span>}
                  {task.notes && <p className="task-desc muted">{task.notes}</p>}
                  {task.subtasks?.length > 0 && (
                    <ul className="subtask-list">
                      {task.subtasks.map((st: any, si: number) => (
                        <li key={si} className={st.completed ? 'completed' : ''}>
                          {st.completed ? '☑' : '☐'} {st.id && <span className="ac-id-badge">{st.id}</span>} {st.description}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-message">No tasks defined</p>
          )
        )}
      </CollapsibleSection>

      {/* Dependencies */}
      {(editMode || dependencies.blockedBy?.length || dependencies.blocks?.length || dependencies.relatedStories?.length || dependencies.externalDependencies?.length) && (
        <CollapsibleSection title="Dependencies" sectionId="story-dependencies">
          {editMode ? (
            <div className="dependencies-edit">
              <div>
                <span className="field-label">Blocked By</span>
                <ArtifactPicker
                  artifacts={allArtifacts}
                  artifactType="story"
                  selectedIds={(dependencies.blockedBy || []).map((d: any) => typeof d === 'string' ? d : d.storyId || '')}
                  onChange={(ids) => handleFieldChange('dependencies', { ...dependencies, blockedBy: ids.map((id: string) => ({ storyId: id })) })}
                  placeholder="Search stories..."
                  excludeIds={[artifact.id]}
                />
              </div>
              <div>
                <span className="field-label">Blocks</span>
                <ArtifactPicker
                  artifacts={allArtifacts}
                  artifactType="story"
                  selectedIds={(dependencies.blocks || []).map((d: any) => typeof d === 'string' ? d : d.storyId || '')}
                  onChange={(ids) => handleFieldChange('dependencies', { ...dependencies, blocks: ids.map((id: string) => ({ storyId: id })) })}
                  placeholder="Search stories..."
                  excludeIds={[artifact.id]}
                />
              </div>
              <div>
                <span className="field-label">Related Stories</span>
                <ArtifactPicker
                  artifacts={allArtifacts}
                  artifactType="story"
                  selectedIds={dependencies.relatedStories || []}
                  onChange={(ids) => handleFieldChange('dependencies', { ...dependencies, relatedStories: ids })}
                  placeholder="Search stories..."
                  excludeIds={[artifact.id]}
                />
              </div>
            </div>
          ) : (
            <div className="dependencies-display">
              {dependencies.blockedBy?.length ? (
                <div className="dep-group">
                  <strong>Blocked By:</strong>
                  <div className="tags-list">{dependencies.blockedBy.map((d: any, i: number) => {
                    const id = typeof d === 'string' ? d : d.storyId || '';
                    const title = typeof d === 'object' ? d.title : undefined;
                    return <span key={i} className="tag dep-tag blocked" title={d.reason || ''}>{id}{title ? ` — ${title}` : ''}</span>;
                  })}</div>
                </div>
              ) : null}
              {dependencies.blocks?.length ? (
                <div className="dep-group">
                  <strong>Blocks:</strong>
                  <div className="tags-list">{dependencies.blocks.map((d: any, i: number) => {
                    const id = typeof d === 'string' ? d : d.storyId || '';
                    const title = typeof d === 'object' ? d.title : undefined;
                    return <span key={i} className="tag dep-tag" style={{ borderColor: 'var(--badge-blocks-bg, orange)' }}>{id}{title ? ` — ${title}` : ''}</span>;
                  })}</div>
                </div>
              ) : null}
              {dependencies.relatedStories?.length ? (
                <div className="dep-group">
                  <strong>Related Stories:</strong>
                  <div className="tags-list">{dependencies.relatedStories.map((id: string, i: number) => <span key={i} className="tag dep-tag">{id}</span>)}</div>
                </div>
              ) : null}
              {dependencies.externalDependencies?.length ? (
                <div className="dep-group">
                  <strong>External Dependencies:</strong>
                  <ul>{dependencies.externalDependencies.map((d: any, i: number) => (
                    <li key={i}>{d.dependency || d}{d.status ? ` (${d.status})` : ''}{d.owner ? ` — ${d.owner}` : ''}</li>
                  ))}</ul>
                </div>
              ) : null}
              {!dependencies.blockedBy?.length && !dependencies.blocks?.length && !dependencies.relatedStories?.length && !dependencies.externalDependencies?.length && (
                <p className="empty-message">No dependencies</p>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Technical Notes */}
      {(editMode || editedData.technicalNotes) && (
        <CollapsibleSection title="Technical Notes" sectionId="story-technicalnotes">
          {editMode ? (
            <textarea
              value={editedData.technicalNotes || ''}
              onChange={(e) => handleFieldChange('technicalNotes', e.target.value)}
              rows={4}
              placeholder="Technical implementation notes..."
            />
          ) : (
            <Md text={editedData.technicalNotes} />
          )}
        </CollapsibleSection>
      )}

      {/* Implementation Details */}
      {(editMode || implementationDetails.length > 0) && (
        <CollapsibleSection title="Implementation Details" count={implementationDetails.length} sectionId="story-implementation">
          {editMode ? (
            <div className="editable-list">
              {implementationDetails.map((item: string, i: number) => (
                <div key={i} className="editable-list-item">
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => updateArrayItem('implementationDetails', i, e.target.value)}
                    placeholder="Implementation detail..."
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('implementationDetails', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('implementationDetails', '')}>+ Add</button>
            </div>
          ) : (
            <ul>{implementationDetails.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
          )}
        </CollapsibleSection>
      )}

      {/* Dev Notes */}
      {(editMode || devNotes.overview || devNotes.architecturePatterns?.length || devNotes.componentsToCreate?.length || devNotes.componentsToModify?.length || devNotes.dataModels?.length || devNotes.apiEndpoints?.length || devNotes.testingStrategy || devNotes.securityConsiderations?.length || devNotes.performanceConsiderations?.length || devNotes.edgeCases?.length || devNotes.potentialChallenges?.length || devNotes.accessibilityConsiderations?.length) && (
        <CollapsibleSection title="Dev Notes" sectionId="story-devnotes">
          {editMode ? (
            <div className="devnotes-edit">
              <label>
                <span className="field-label">Overview</span>
                <textarea
                  value={devNotes.overview || ''}
                  onChange={(e) => handleFieldChange('devNotes', { ...devNotes, overview: e.target.value })}
                  rows={3}
                  placeholder="Implementation approach overview..."
                />
              </label>
              <span className="field-label">Architecture Patterns</span>
              <div className="editable-list">
                {(devNotes.architecturePatterns || []).map((item: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const updated = [...(devNotes.architecturePatterns || [])];
                        updated[i] = e.target.value;
                        handleFieldChange('devNotes', { ...devNotes, architecturePatterns: updated });
                      }}
                      placeholder="Architecture pattern..."
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(devNotes.architecturePatterns || [])];
                      updated.splice(i, 1);
                      handleFieldChange('devNotes', { ...devNotes, architecturePatterns: updated });
                    }}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => {
                  handleFieldChange('devNotes', { ...devNotes, architecturePatterns: [...(devNotes.architecturePatterns || []), ''] });
                }}>+ Add</button>
              </div>
              <span className="field-label">Security Considerations</span>
              <div className="editable-list">
                {(devNotes.securityConsiderations || []).map((item: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const updated = [...(devNotes.securityConsiderations || [])];
                        updated[i] = e.target.value;
                        handleFieldChange('devNotes', { ...devNotes, securityConsiderations: updated });
                      }}
                      placeholder="Security consideration..."
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(devNotes.securityConsiderations || [])];
                      updated.splice(i, 1);
                      handleFieldChange('devNotes', { ...devNotes, securityConsiderations: updated });
                    }}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => {
                  handleFieldChange('devNotes', { ...devNotes, securityConsiderations: [...(devNotes.securityConsiderations || []), ''] });
                }}>+ Add</button>
              </div>
              <span className="field-label">Performance Considerations</span>
              <div className="editable-list">
                {(devNotes.performanceConsiderations || []).map((item: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const updated = [...(devNotes.performanceConsiderations || [])];
                        updated[i] = e.target.value;
                        handleFieldChange('devNotes', { ...devNotes, performanceConsiderations: updated });
                      }}
                      placeholder="Performance consideration..."
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(devNotes.performanceConsiderations || [])];
                      updated.splice(i, 1);
                      handleFieldChange('devNotes', { ...devNotes, performanceConsiderations: updated });
                    }}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => {
                  handleFieldChange('devNotes', { ...devNotes, performanceConsiderations: [...(devNotes.performanceConsiderations || []), ''] });
                }}>+ Add</button>
              </div>
              <span className="field-label">Edge Cases</span>
              <div className="editable-list">
                {(devNotes.edgeCases || []).map((item: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const updated = [...(devNotes.edgeCases || [])];
                        updated[i] = e.target.value;
                        handleFieldChange('devNotes', { ...devNotes, edgeCases: updated });
                      }}
                      placeholder="Edge case..."
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(devNotes.edgeCases || [])];
                      updated.splice(i, 1);
                      handleFieldChange('devNotes', { ...devNotes, edgeCases: updated });
                    }}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => {
                  handleFieldChange('devNotes', { ...devNotes, edgeCases: [...(devNotes.edgeCases || []), ''] });
                }}>+ Add</button>
              </div>
            </div>
          ) : (
            <div className="devnotes-display">
              {devNotes.overview && (
                <div className="devnote-group">
                  <h5>Overview</h5>
                  <Md text={devNotes.overview} />
                </div>
              )}
              {devNotes.architecturePatterns?.length > 0 && (
                <div className="devnote-group">
                  <h5>Architecture Patterns</h5>
                  <ul>{devNotes.architecturePatterns.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
              {devNotes.componentsToCreate?.length > 0 && (
                <div className="devnote-group">
                  <h5>Components to Create</h5>
                  <ul>{devNotes.componentsToCreate.map((c: any, i: number) => (
                    <li key={i}><code>{c.path}</code>{c.type ? ` (${c.type})` : ''}{c.description ? ` — ${c.description}` : ''}</li>
                  ))}</ul>
                </div>
              )}
              {devNotes.componentsToModify?.length > 0 && (
                <div className="devnote-group">
                  <h5>Components to Modify</h5>
                  <ul>{devNotes.componentsToModify.map((c: any, i: number) => (
                    <li key={i}><code>{c.path}</code>{c.changes ? ` — ${c.changes}` : ''}</li>
                  ))}</ul>
                </div>
              )}
              {devNotes.dataModels?.length > 0 && (
                <div className="devnote-group">
                  <h5>Data Models</h5>
                  <ul>{devNotes.dataModels.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
              {devNotes.apiEndpoints?.length > 0 && (
                <div className="devnote-group">
                  <h5>API Endpoints</h5>
                  <ul>{devNotes.apiEndpoints.map((ep: any, i: number) => (
                    <li key={i}><span className="tag">{ep.method}</span> <code>{ep.path}</code>{ep.description ? ` — ${ep.description}` : ''}</li>
                  ))}</ul>
                </div>
              )}
              {devNotes.testingStrategy && (
                <div className="devnote-group">
                  <h5>Testing Strategy</h5>
                  {devNotes.testingStrategy.unitTests?.length > 0 && <p><strong>Unit:</strong> {devNotes.testingStrategy.unitTests.join(', ')}</p>}
                  {devNotes.testingStrategy.integrationTests?.length > 0 && <p><strong>Integration:</strong> {devNotes.testingStrategy.integrationTests.join(', ')}</p>}
                  {devNotes.testingStrategy.e2eTests?.length > 0 && <p><strong>E2E:</strong> {devNotes.testingStrategy.e2eTests.join(', ')}</p>}
                </div>
              )}
              {devNotes.securityConsiderations?.length > 0 && (
                <div className="devnote-group">
                  <h5>Security Considerations</h5>
                  <ul>{devNotes.securityConsiderations.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
              {devNotes.performanceConsiderations?.length > 0 && (
                <div className="devnote-group">
                  <h5>Performance Considerations</h5>
                  <ul>{devNotes.performanceConsiderations.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
              {devNotes.accessibilityConsiderations?.length > 0 && (
                <div className="devnote-group">
                  <h5>Accessibility</h5>
                  <ul>{devNotes.accessibilityConsiderations.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
              {devNotes.edgeCases?.length > 0 && (
                <div className="devnote-group">
                  <h5>Edge Cases</h5>
                  <ul>{devNotes.edgeCases.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
              {devNotes.potentialChallenges?.length > 0 && (
                <div className="devnote-group">
                  <h5>Potential Challenges</h5>
                  <ul>{devNotes.potentialChallenges.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Prose-Style Story Fields (background, problemStatement, proposedSolution, solutionDetails) */}
      {(editMode || editedData.background || editedData.problemStatement || editedData.proposedSolution || solutionDetails.length > 0) && (
        <CollapsibleSection title="Background & Context" sectionId="story-prose-context">
          {editMode ? (
            <div className="prose-context-edit">
              <label>
                <span className="field-label">Background</span>
                <textarea
                  value={editedData.background || ''}
                  onChange={(e) => handleFieldChange('background', e.target.value)}
                  rows={3}
                  placeholder="Background context or problem context..."
                />
              </label>
              <label>
                <span className="field-label">Problem Statement</span>
                <textarea
                  value={editedData.problemStatement || ''}
                  onChange={(e) => handleFieldChange('problemStatement', e.target.value)}
                  rows={3}
                  placeholder="Detailed problem description..."
                />
              </label>
              <label>
                <span className="field-label">Proposed Solution</span>
                <textarea
                  value={editedData.proposedSolution || ''}
                  onChange={(e) => handleFieldChange('proposedSolution', e.target.value)}
                  rows={3}
                  placeholder="High-level solution description..."
                />
              </label>
              <span className="field-label">Solution Details</span>
              <div className="editable-list">
                {solutionDetails.map((item: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => updateArrayItem('solutionDetails', i, e.target.value)}
                      placeholder="Solution detail..."
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('solutionDetails', i)}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => addToArray('solutionDetails', '')}>+ Add Detail</button>
              </div>
            </div>
          ) : (
            <div className="prose-context-display">
              {editedData.background && (
                <div className="devnote-group">
                  <h5>Background</h5>
                  <Md text={editedData.background} />
                </div>
              )}
              {editedData.problemStatement && (
                <div className="devnote-group">
                  <h5>Problem Statement</h5>
                  <Md text={editedData.problemStatement} />
                </div>
              )}
              {editedData.proposedSolution && (
                <div className="devnote-group">
                  <h5>Proposed Solution</h5>
                  <Md text={editedData.proposedSolution} />
                </div>
              )}
              {solutionDetails.length > 0 && (
                <div className="devnote-group">
                  <h5>Solution Details</h5>
                  <ul>{solutionDetails.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Requirement References */}
      {(editMode || requirementRefs.length > 0) && (
        <CollapsibleSection title="Requirement References" count={requirementRefs.length} sectionId="story-requirement-refs">
          {editMode ? (
            <div className="editable-list horizontal">
              {requirementRefs.map((ref: string, i: number) => (
                <div key={i} className="editable-tag">
                  <input
                    type="text"
                    value={ref}
                    onChange={(e) => updateArrayItem('requirementRefs', i, e.target.value)}
                    placeholder="FR-1, NFR-2..."
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('requirementRefs', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('requirementRefs', '')}>+ Add Ref</button>
            </div>
          ) : (
            <div className="tags-list">
              {requirementRefs.map((ref: string, i: number) => (
                <span key={i} className="tag">{ref}</span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* UX References */}
      {(editMode || uxReferences.length > 0) && (
        <CollapsibleSection title="UX References" count={uxReferences.length} sectionId="story-ux-refs">
          {editMode ? (
            <div className="editable-list">
              {uxReferences.map((ref: any, i: number) => (
                <div key={i} className="editable-list-item" style={{ flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={typeof ref === 'string' ? ref : ref.type || ''}
                      onChange={(e) => updateArrayItem('uxReferences', i, typeof ref === 'string' ? e.target.value : { ...ref, type: e.target.value })}
                      placeholder="Type (e.g., wireframe, mockup)"
                      style={{ width: '120px' }}
                    />
                    <input
                      type="text"
                      value={typeof ref === 'string' ? '' : ref.reference || ''}
                      onChange={(e) => updateArrayItem('uxReferences', i, { ...(typeof ref === 'string' ? { type: ref } : ref), reference: e.target.value })}
                      placeholder="Reference URL or path..."
                      style={{ flex: 1 }}
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('uxReferences', i)}>×</button>
                  </div>
                  <input
                    type="text"
                    value={typeof ref === 'string' ? '' : ref.description || ''}
                    onChange={(e) => updateArrayItem('uxReferences', i, { ...(typeof ref === 'string' ? { type: ref } : ref), description: e.target.value })}
                    placeholder="Description..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('uxReferences', { type: '', reference: '', description: '' })}>+ Add UX Reference</button>
            </div>
          ) : (
            <ul>
              {uxReferences.map((ref: any, i: number) => {
                if (typeof ref === 'string') return <li key={i}>{ref}</li>;
                return (
                  <li key={i}>
                    {ref.type && <span className="tag">{ref.type}</span>}
                    {ref.reference && <span> {ref.reference}</span>}
                    {ref.description && <span className="muted"> — {ref.description}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Source Document References */}
      {(editMode || references.length > 0) && (
        <CollapsibleSection title="References" count={references.length} sectionId="story-references">
          {editMode ? (
            <div className="editable-list">
              {references.map((ref: any, i: number) => (
                <div key={i} className="editable-list-item" style={{ flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={typeof ref === 'string' ? ref : ref.source || ''}
                      onChange={(e) => updateArrayItem('references', i, typeof ref === 'string' ? e.target.value : { ...ref, source: e.target.value })}
                      placeholder="Source document..."
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      value={typeof ref === 'string' ? '' : ref.section || ''}
                      onChange={(e) => updateArrayItem('references', i, { ...(typeof ref === 'string' ? { source: ref } : ref), section: e.target.value })}
                      placeholder="Section..."
                      style={{ width: '120px' }}
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('references', i)}>×</button>
                  </div>
                  <input
                    type="text"
                    value={typeof ref === 'string' ? '' : ref.relevance || ''}
                    onChange={(e) => updateArrayItem('references', i, { ...(typeof ref === 'string' ? { source: ref } : ref), relevance: e.target.value })}
                    placeholder="Relevance..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('references', { source: '', section: '', relevance: '' })}>+ Add Reference</button>
            </div>
          ) : (
            <ul>
              {references.map((ref: any, i: number) => {
                if (typeof ref === 'string') return <li key={i}>{ref}</li>;
                return (
                  <li key={i}>
                    <strong>{ref.source}</strong>
                    {ref.section && <span> ({ref.section})</span>}
                    {ref.relevance && <span className="muted"> — {ref.relevance}</span>}
                    {ref.quote && <blockquote className="muted">{ref.quote}</blockquote>}
                  </li>
                );
              })}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Reviewer */}
      {(editMode || editedData.reviewer) && (
        <section className="detail-section">
          <h4>Reviewer</h4>
          {editMode ? (
            <input
              type="text"
              value={editedData.reviewer || ''}
              onChange={(e) => handleFieldChange('reviewer', e.target.value)}
              placeholder="Code reviewer..."
              style={{ width: '200px' }}
            />
          ) : (
            <span>{editedData.reviewer}</span>
          )}
        </section>
      )}

      {/* Notes */}
      {(editMode || editedData.notes) && (
        <CollapsibleSection title="Notes" sectionId="story-notes">
          {editMode ? (
            <textarea
              value={editedData.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              rows={3}
              placeholder="Additional notes..."
            />
          ) : (
            <Md text={editedData.notes} />
          )}
        </CollapsibleSection>
      )}

      {/* Dev Agent Record (view-only) */}
      {(devAgentRecord.agentModel || devAgentRecord.sessionId || devAgentRecord.completionNotes?.length || devAgentRecord.filesModified?.length || devAgentRecord.testsRun || devAgentRecord.issuesEncountered?.length) && (
        <CollapsibleSection title="Dev Agent Record" sectionId="story-dev-agent-record">
          <div className="dev-agent-record">
            {devAgentRecord.agentModel && <p><strong>Agent Model:</strong> {devAgentRecord.agentModel}</p>}
            {devAgentRecord.sessionId && <p><strong>Session:</strong> <code>{devAgentRecord.sessionId}</code></p>}
            {(devAgentRecord.startedAt || devAgentRecord.completedAt) && (
              <p><strong>Period:</strong> {devAgentRecord.startedAt || '?'} — {devAgentRecord.completedAt || '?'}</p>
            )}
            {devAgentRecord.completionNotes?.length > 0 && (
              <div className="devnote-group">
                <h5>Completion Notes</h5>
                <ul>{devAgentRecord.completionNotes.map((note: string, i: number) => <li key={i}>{note}</li>)}</ul>
              </div>
            )}
            {devAgentRecord.filesModified?.length > 0 && (
              <div className="devnote-group">
                <h5>Files Modified ({devAgentRecord.filesModified.length})</h5>
                <ul>{devAgentRecord.filesModified.map((f: any, i: number) => (
                  <li key={i}>
                    <code>{f.path}</code>
                    {f.action && <span className="tag">{f.action}</span>}
                    {f.linesChanged != null && <span className="muted"> ({f.linesChanged} lines)</span>}
                    {f.description && <span> — {f.description}</span>}
                  </li>
                ))}</ul>
              </div>
            )}
            {devAgentRecord.testsRun && (
              <div className="devnote-group">
                <h5>Tests Run</h5>
                <p>
                  Total: {devAgentRecord.testsRun.total ?? 0},
                  Passed: {devAgentRecord.testsRun.passed ?? 0},
                  Failed: {devAgentRecord.testsRun.failed ?? 0}
                  {devAgentRecord.testsRun.skipped ? `, Skipped: ${devAgentRecord.testsRun.skipped}` : ''}
                </p>
              </div>
            )}
            {devAgentRecord.issuesEncountered?.length > 0 && (
              <div className="devnote-group">
                <h5>Issues Encountered</h5>
                <ul>{devAgentRecord.issuesEncountered.map((issue: any, i: number) => (
                  <li key={i}>
                    <strong>{issue.issue}</strong>
                    {issue.resolution && <span className="muted"> — Resolution: {issue.resolution}</span>}
                  </li>
                ))}</ul>
              </div>
            )}
            {devAgentRecord.debugLogRefs?.length > 0 && (
              <div className="devnote-group">
                <h5>Debug Logs</h5>
                <ul>{devAgentRecord.debugLogRefs.map((ref: string, i: number) => <li key={i}><code>{ref}</code></li>)}</ul>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Status Change History (view-only) */}
      {history.length > 0 && (
        <CollapsibleSection title="History" count={history.length} sectionId="story-history">
          <div className="history-list">
            {history.map((entry: any, i: number) => (
              <div key={i} className="history-entry" style={{ marginBottom: '8px', padding: '4px 0', borderBottom: '1px solid var(--vscode-panel-border, #333)' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {entry.fromStatus && <span className={`tag tag-${entry.fromStatus}`}>{entry.fromStatus}</span>}
                  {(entry.fromStatus || entry.toStatus) && <span>→</span>}
                  {entry.toStatus && <span className={`tag tag-${entry.toStatus}`}>{entry.toStatus}</span>}
                  {entry.changedBy && <span className="muted">by {entry.changedBy}</span>}
                  {entry.timestamp && <span className="muted">{entry.timestamp}</span>}
                </div>
                {entry.notes && <p className="muted" style={{ marginTop: '2px' }}>{entry.notes}</p>}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Labels */}
      {renderLabelsField(labels, editMode, updateArrayItem, removeFromArray, addToArray)}
    </>
  );
}

// ==========================================================================
// EPIC DETAILS
// ==========================================================================

export function renderEpicDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, artifact, allArtifacts } = props;
  const epicDependencies: any = editedData.epicDependencies || {};
  const effortEstimate: any = editedData.effortEstimate || {};

  // --- Normalize technicalSummary: sample may be a plain string ---
  const rawTechSummary = editedData.technicalSummary;
  const technicalSummary: any = typeof rawTechSummary === 'string'
    ? { overview: rawTechSummary }
    : (rawTechSummary || {});

  const implementationNotes: string[] = editedData.implementationNotes || [];
  const functionalReqs: string[] = editedData.functionalRequirements || [];
  const nonFunctionalReqs: string[] = editedData.nonFunctionalRequirements || [];
  const additionalReqs: string[] = editedData.additionalRequirements || [];
  const allReqIds = [...functionalReqs, ...nonFunctionalReqs, ...additionalReqs];

  return (
    <>
      {/* Priority & Effort Row */}
      <div className="detail-row">
        {renderPriorityField(editedData.priority, (v) => handleFieldChange('priority', v), editMode)}

        {(editMode || editedData.totalStoryPoints != null) && (
          <section className="detail-section inline">
            <h4>Story Points</h4>
            <span className="tag">{editedData.totalStoryPoints ?? 0}</span>
          </section>
        )}

        <section className="detail-section inline">
          <h4>Stories</h4>
          <span className="tag">{editedData.doneStoryCount ?? 0}/{editedData.totalStoryCount ?? artifact.childCount ?? 0}</span>
        </section>

        {(editMode || effortEstimate.totalSprints != null) && (
          <section className="detail-section inline">
            <h4>Sprints</h4>
            {editMode ? (
              <input
                type="number"
                value={effortEstimate.totalSprints ?? ''}
                onChange={(e) => handleFieldChange('effortEstimate', { ...effortEstimate, totalSprints: e.target.value ? Number(e.target.value) : undefined })}
                min="0"
                placeholder="Sprints"
                style={{ width: '60px' }}
              />
            ) : (
              <span>{effortEstimate.totalSprints}</span>
            )}
          </section>
        )}

        {(editMode || effortEstimate.totalDays != null) && (
          <section className="detail-section inline">
            <h4>Days</h4>
            {editMode ? (
              <input
                type="number"
                value={effortEstimate.totalDays ?? ''}
                onChange={(e) => handleFieldChange('effortEstimate', { ...effortEstimate, totalDays: e.target.value ? Number(e.target.value) : undefined })}
                min="0"
                placeholder="Days"
                style={{ width: '60px' }}
              />
            ) : (
              <span>{effortEstimate.totalDays}</span>
            )}
          </section>
        )}
      </div>

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="epic-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={4}
            placeholder="Describe the epic..."
          />
        ) : (
          artifact.description ? <Md text={artifact.description} /> : <p className="empty-message">No description defined</p>
        )}
      </CollapsibleSection>

      {/* Goal */}
      <CollapsibleSection title="Goal" sectionId="epic-goal">
        {editMode ? (
          <textarea
            value={editedData.goal || ''}
            onChange={(e) => handleFieldChange('goal', e.target.value)}
            rows={3}
            placeholder="Epic goal / user outcome..."
          />
        ) : (
          editedData.goal ? <Md text={editedData.goal} /> : <p className="empty-message">No goal defined</p>
        )}
      </CollapsibleSection>

      {/* Value Delivered */}
      {(editMode || editedData.valueDelivered) && (
        <CollapsibleSection title="Value Delivered" sectionId="epic-value">
          {editMode ? (
            <textarea
              value={editedData.valueDelivered || ''}
              onChange={(e) => handleFieldChange('valueDelivered', e.target.value)}
              rows={2}
              placeholder="Value delivered..."
            />
          ) : (
            <Md text={editedData.valueDelivered} />
          )}
        </CollapsibleSection>
      )}

      {/* Acceptance Summary */}
      {(editMode || editedData.acceptanceSummary) && (
        <CollapsibleSection title="Acceptance Summary" sectionId="epic-acceptance">
          {editMode ? (
            <textarea
              value={editedData.acceptanceSummary || ''}
              onChange={(e) => handleFieldChange('acceptanceSummary', e.target.value)}
              rows={3}
              placeholder="When is this epic considered complete?"
            />
          ) : (
            <Md text={editedData.acceptanceSummary} />
          )}
        </CollapsibleSection>
      )}

      {/* Requirements */}
      {(editMode || allReqIds.length > 0) && (
        <CollapsibleSection title="Requirements" count={allReqIds.length} sectionId="epic-requirements">
          {editMode ? (
            <div className="dependencies-edit">
              <span className="field-label">Functional Requirements</span>
              <div className="editable-list">
                {functionalReqs.map((id: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input type="text" value={id} onChange={(e) => {
                      const updated = [...functionalReqs]; updated[i] = e.target.value;
                      handleFieldChange('functionalRequirements', updated);
                    }} placeholder="FR ID..." />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...functionalReqs]; updated.splice(i, 1);
                      handleFieldChange('functionalRequirements', updated);
                    }}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('functionalRequirements', [...functionalReqs, ''])}>+ Add FR</button>
              </div>
            </div>
          ) : (
            <div className="requirements-display">
              {functionalReqs.length > 0 && (
                <div className="dep-group">
                  <strong>Functional:</strong>
                  <div className="tags-list">{functionalReqs.map((id: string, i: number) => <span key={i} className="tag">{id}</span>)}</div>
                </div>
              )}
              {nonFunctionalReqs.length > 0 && (
                <div className="dep-group">
                  <strong>Non-Functional:</strong>
                  <div className="tags-list">{nonFunctionalReqs.map((id: string, i: number) => <span key={i} className="tag">{id}</span>)}</div>
                </div>
              )}
              {additionalReqs.length > 0 && (
                <div className="dep-group">
                  <strong>Additional:</strong>
                  <div className="tags-list">{additionalReqs.map((id: string, i: number) => <span key={i} className="tag">{id}</span>)}</div>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Dependencies */}
      {(editMode || epicDependencies.upstream?.length || epicDependencies.downstream?.length || epicDependencies.relatedEpics?.length) && (
        <CollapsibleSection title="Dependencies" sectionId="epic-dependencies">
          {editMode ? (
            <div className="dependencies-edit">
              <div>
                <span className="field-label">Upstream (blocked by)</span>
                <ArtifactPicker
                  artifacts={allArtifacts}
                  artifactType="epic"
                  selectedIds={(epicDependencies.upstream || []).map((d: any) => typeof d === 'string' ? d : d.epicId || '')}
                  onChange={(ids) => handleFieldChange('epicDependencies', { ...epicDependencies, upstream: ids.map((id: string) => ({ epicId: id })) })}
                  placeholder="Search epics..."
                  excludeIds={[artifact.id]}
                />
              </div>
              <div>
                <span className="field-label">Downstream (enables)</span>
                <ArtifactPicker
                  artifacts={allArtifacts}
                  artifactType="epic"
                  selectedIds={(epicDependencies.downstream || []).map((d: any) => typeof d === 'string' ? d : d.epicId || '')}
                  onChange={(ids) => handleFieldChange('epicDependencies', { ...epicDependencies, downstream: ids.map((id: string) => ({ epicId: id })) })}
                  placeholder="Search epics..."
                  excludeIds={[artifact.id]}
                />
              </div>
              <div>
                <span className="field-label">Related Epics</span>
                <ArtifactPicker
                  artifacts={allArtifacts}
                  artifactType="epic"
                  selectedIds={epicDependencies.relatedEpics || []}
                  onChange={(ids) => handleFieldChange('epicDependencies', { ...epicDependencies, relatedEpics: ids })}
                  placeholder="Search epics..."
                  excludeIds={[artifact.id]}
                />
              </div>
            </div>
          ) : (
            <div className="dependencies-display">
              {epicDependencies.upstream?.length ? (
                <div className="dep-group">
                  <strong>Upstream (blocked by):</strong>
                  <div className="tags-list">{epicDependencies.upstream.map((d: any, i: number) => {
                    const id = typeof d === 'string' ? d : d.epicId || '';
                    return <span key={i} className="tag dep-tag blocked" title={d.reason || ''}>{id}{d.reason ? ` — ${d.reason}` : ''}</span>;
                  })}</div>
                </div>
              ) : null}
              {epicDependencies.downstream?.length ? (
                <div className="dep-group">
                  <strong>Downstream (enables):</strong>
                  <div className="tags-list">{epicDependencies.downstream.map((d: any, i: number) => {
                    const id = typeof d === 'string' ? d : d.epicId || '';
                    return <span key={i} className="tag dep-tag" style={{ borderColor: 'var(--badge-blocks-bg, orange)' }}>{id}{d.reason ? ` — ${d.reason}` : ''}</span>;
                  })}</div>
                </div>
              ) : null}
              {epicDependencies.relatedEpics?.length ? (
                <div className="dep-group">
                  <strong>Related:</strong>
                  <div className="tags-list">{epicDependencies.relatedEpics.map((id: string, i: number) => <span key={i} className="tag dep-tag">{id}</span>)}</div>
                </div>
              ) : null}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Implementation Notes */}
      {(editMode || implementationNotes.length > 0) && (
        <CollapsibleSection title="Implementation Notes" count={implementationNotes.length} sectionId="epic-impl-notes">
          {editMode ? (
            <div className="editable-list">
              {implementationNotes.map((note: string, i: number) => (
                <div key={i} className="editable-list-item">
                  <input type="text" value={note} onChange={(e) => {
                    const updated = [...implementationNotes]; updated[i] = e.target.value;
                    handleFieldChange('implementationNotes', updated);
                  }} placeholder="Implementation note..." />
                  <button className="remove-btn" onClick={() => {
                    const updated = [...implementationNotes]; updated.splice(i, 1);
                    handleFieldChange('implementationNotes', updated);
                  }}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('implementationNotes', [...implementationNotes, ''])}>+ Add</button>
            </div>
          ) : (
            <ul>{implementationNotes.map((note: string, i: number) => <li key={i}>{note}</li>)}</ul>
          )}
        </CollapsibleSection>
      )}

      {/* Technical Summary */}
      {(technicalSummary.overview || technicalSummary.architecturePattern || technicalSummary.components?.length || technicalSummary.filesChanged?.length) && (
        <CollapsibleSection title="Technical Summary" sectionId="epic-tech-summary">
          {technicalSummary.overview && <Md text={technicalSummary.overview} />}
          {technicalSummary.architecturePattern && (
            <p><strong>Architecture Pattern:</strong> {technicalSummary.architecturePattern}</p>
          )}
          {technicalSummary.components?.length > 0 && (
            <div className="devnote-group">
              <h5>Components</h5>
              <ul>{technicalSummary.components.map((c: any, i: number) => (
                <li key={i}><strong>{c.name}</strong>{c.responsibility ? ` — ${c.responsibility}` : ''}{c.changes ? <span className="muted"> ({c.changes})</span> : ''}</li>
              ))}</ul>
            </div>
          )}
          {technicalSummary.filesChanged?.length > 0 && (
            <div className="devnote-group">
              <h5>Files Changed</h5>
              <ul>{technicalSummary.filesChanged.map((f: any, i: number) => (
                <li key={i}><code>{f.path}</code> <span className="tag">{f.action}</span>{f.description ? ` — ${f.description}` : ''}</li>
              ))}</ul>
            </div>
          )}
          {technicalSummary.configuration && (technicalSummary.configuration.file || technicalSummary.configuration.settings?.length > 0) && (
            <div className="devnote-group">
              <h5>Configuration</h5>
              {technicalSummary.configuration.file && <p><strong>File:</strong> <code>{technicalSummary.configuration.file}</code></p>}
              {technicalSummary.configuration.settings?.length > 0 && (
                <ul>{technicalSummary.configuration.settings.map((s: any, i: number) => (
                  <li key={i}><code>{s.key}</code>: {s.value}{s.description ? ` — ${s.description}` : ''}</li>
                ))}</ul>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Use Cases (view-only — embedded use case objects) */}
      {editedData.useCases?.length > 0 && (
        <CollapsibleSection title="Use Cases" count={editedData.useCases.length} sectionId="epic-use-cases">
          {editedData.useCases.map((uc: any, i: number) => (
            <div key={uc.id || i} className="use-case-item" style={{ marginBottom: '16px', padding: '8px', borderLeft: '3px solid var(--vscode-textLink-foreground, #3794ff)', paddingLeft: '12px' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '4px' }}>
                {uc.id && <span className="tag">{uc.id}</span>}
                <strong>{uc.title || 'Untitled Use Case'}</strong>
              </div>
              {uc.summary && <Md text={uc.summary} />}
              {uc.primaryActor && <p><strong>Actor:</strong> <span className="person-badge">{uc.primaryActor}</span></p>}
              {uc.trigger && <p><strong>Trigger:</strong> {uc.trigger}</p>}
              {uc.scenario && (
                <div style={{ marginTop: '4px' }}>
                  {uc.scenario.context && <p><strong>Context:</strong> {uc.scenario.context}</p>}
                  {uc.scenario.before && <p><strong>Before:</strong> {uc.scenario.before}</p>}
                  {uc.scenario.after && <p><strong>After:</strong> {uc.scenario.after}</p>}
                  {uc.scenario.impact && <p><strong>Impact:</strong> {uc.scenario.impact}</p>}
                </div>
              )}
              {uc.mainFlow?.length > 0 && (
                <div style={{ marginTop: '4px' }}>
                  <strong>Main Flow:</strong>
                  <ol>{uc.mainFlow.map((step: any, si: number) => (
                    <li key={si}>
                      {typeof step === 'string' ? step : (step.action || JSON.stringify(step))}
                      {step.actor && <span className="muted"> ({step.actor})</span>}
                    </li>
                  ))}</ol>
                </div>
              )}
              {uc.preconditions?.length > 0 && (
                <p><strong>Preconditions:</strong> {uc.preconditions.join('; ')}</p>
              )}
              {uc.postconditions?.length > 0 && (
                <p><strong>Postconditions:</strong> {uc.postconditions.join('; ')}</p>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Fit Criteria (view-only — from fit-criteria.schema.json) */}
      {(() => {
        const fitCriteria = editedData.fitCriteria || {};
        const fcFunctional = fitCriteria.functional || [];
        const fcNonFunctional = fitCriteria.nonFunctional || [];
        const fcSecurity = fitCriteria.security || [];
        const totalFC = fcFunctional.length + fcNonFunctional.length + fcSecurity.length;
        if (totalFC === 0) return null;
        return (
          <CollapsibleSection title="Fit Criteria" count={totalFC} sectionId="epic-fit-criteria">
            {fcFunctional.length > 0 && (
              <div className="devnote-group">
                <h5>Functional ({fcFunctional.length})</h5>
                <ul>{fcFunctional.map((fc: any, i: number) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    {fc.id && <span className="tag">{fc.id}</span>} {fc.criterion}
                    {fc.verified && <span className="tag" style={{ background: 'var(--badge-done-bg, #2ecc71)', color: '#fff', marginLeft: '4px' }}>verified</span>}
                    {fc.verificationMethod && <span className="muted"> ({fc.verificationMethod})</span>}
                    {fc.relatedRequirement && <span className="muted"> [Req: {fc.relatedRequirement}]</span>}
                    {fc.notes && <p className="muted" style={{ marginTop: '2px' }}>{fc.notes}</p>}
                  </li>
                ))}</ul>
              </div>
            )}
            {fcNonFunctional.length > 0 && (
              <div className="devnote-group">
                <h5>Non-Functional ({fcNonFunctional.length})</h5>
                <ul>{fcNonFunctional.map((fc: any, i: number) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    {fc.id && <span className="tag">{fc.id}</span>}
                    {fc.category && <span className="tag">{fc.category}</span>}
                    {' '}{fc.criterion}
                    {fc.metric && (
                      <span className="muted"> (Target: {fc.metric.target}{fc.metric.unit ? ` ${fc.metric.unit}` : ''}{fc.metric.threshold ? `, Threshold: ${fc.metric.threshold}` : ''})</span>
                    )}
                    {fc.verified && <span className="tag" style={{ background: 'var(--badge-done-bg, #2ecc71)', color: '#fff', marginLeft: '4px' }}>verified</span>}
                    {fc.notes && <p className="muted" style={{ marginTop: '2px' }}>{fc.notes}</p>}
                  </li>
                ))}</ul>
              </div>
            )}
            {fcSecurity.length > 0 && (
              <div className="devnote-group">
                <h5>Security &amp; Compliance ({fcSecurity.length})</h5>
                <ul>{fcSecurity.map((fc: any, i: number) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    {fc.id && <span className="tag">{fc.id}</span>}
                    {fc.category && <span className="tag">{fc.category}</span>}
                    {' '}{fc.criterion}
                    {fc.complianceStandard && <span className="tag">{fc.complianceStandard}</span>}
                    {fc.verified && <span className="tag" style={{ background: 'var(--badge-done-bg, #2ecc71)', color: '#fff', marginLeft: '4px' }}>verified</span>}
                    {fc.notes && <p className="muted" style={{ marginTop: '2px' }}>{fc.notes}</p>}
                  </li>
                ))}</ul>
              </div>
            )}
          </CollapsibleSection>
        );
      })()}

      {/* Success Metrics (view-only — from success-metrics.schema.json) */}
      {(() => {
        const sm = editedData.successMetrics || {};
        const categories = [
          { key: 'codeQuality', label: 'Code Quality' },
          { key: 'operational', label: 'Operational' },
          { key: 'customerImpact', label: 'Customer Impact' },
          { key: 'deployment', label: 'Deployment' },
          { key: 'business', label: 'Business' },
        ];
        const allMetrics = categories.flatMap(c => sm[c.key] || []);
        if (allMetrics.length === 0) return null;
        return (
          <CollapsibleSection title="Success Metrics" count={allMetrics.length} sectionId="epic-success-metrics">
            {categories.map(({ key, label }) => {
              const items = sm[key] || [];
              if (items.length === 0) return null;
              return (
                <div key={key} className="devnote-group">
                  <h5>{label} ({items.length})</h5>
                  <ul>{items.map((m: any, i: number) => (
                    <li key={i} style={{ marginBottom: '4px' }}>
                      {m.id && <span className="tag">{m.id}</span>} {m.metric}
                      {m.target && <span className="muted"> — Target: {m.target}</span>}
                      {m.measurement && <span className="muted"> [Measurement: {m.measurement}]</span>}
                      {m.baseline && <span className="muted"> [Baseline: {m.baseline}]</span>}
                      {m.actualValue && <span className="muted"> [Actual: {m.actualValue}]</span>}
                      {m.achieved && <span className="tag" style={{ background: 'var(--badge-done-bg, #2ecc71)', color: '#fff', marginLeft: '4px' }}>achieved</span>}
                      {m.notes && <p className="muted" style={{ marginTop: '2px' }}>{m.notes}</p>}
                    </li>
                  ))}</ul>
                </div>
              );
            })}
          </CollapsibleSection>
        );
      })()}

      {/* Definition of Done (view-only — from definition-of-done.schema.json) */}
      {(() => {
        const dod = editedData.definitionOfDone || {};
        const dodItems = dod.items || [];
        const qualityGates = dod.qualityGates || [];
        if (dodItems.length === 0 && qualityGates.length === 0) return null;
        return (
          <CollapsibleSection title="Definition of Done" count={dodItems.length + qualityGates.length} sectionId="epic-definition-of-done">
            {dodItems.length > 0 && (
              <div className="devnote-group">
                <h5>Checklist ({dodItems.length})</h5>
                <ul style={{ listStyleType: 'none', paddingLeft: '4px' }}>{dodItems.map((item: any, i: number) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    <span style={{ marginRight: '6px' }}>{item.completed ? '☑' : '☐'}</span>
                    {item.id && <span className="tag">{item.id}</span>}
                    {item.category && <span className="tag">{item.category}</span>}
                    {' '}{item.item}
                    {item.required === false && <span className="muted"> (optional)</span>}
                    {item.completedBy && <span className="muted"> — by {item.completedBy}</span>}
                    {item.completedAt && <span className="muted"> at {item.completedAt}</span>}
                    {item.evidence && <p className="muted" style={{ marginTop: '2px' }}>Evidence: {item.evidence}</p>}
                    {item.notes && <p className="muted" style={{ marginTop: '2px' }}>{item.notes}</p>}
                  </li>
                ))}</ul>
              </div>
            )}
            {qualityGates.length > 0 && (
              <div className="devnote-group">
                <h5>Quality Gates ({qualityGates.length})</h5>
                <ul>{qualityGates.map((gate: any, i: number) => (
                  <li key={i} style={{ marginBottom: '6px' }}>
                    {gate.id && <span className="tag">{gate.id}</span>}
                    {' '}<strong>{gate.gate}</strong>
                    {gate.passed && <span className="tag" style={{ background: 'var(--badge-done-bg, #2ecc71)', color: '#fff', marginLeft: '4px' }}>passed</span>}
                    {gate.approver && <span className="muted"> — approved by {gate.approver}</span>}
                    {gate.passedAt && <span className="muted"> at {gate.passedAt}</span>}
                    {gate.criteria?.length > 0 && (
                      <ul>{gate.criteria.map((c: string, ci: number) => <li key={ci}>{c}</li>)}</ul>
                    )}
                  </li>
                ))}</ul>
              </div>
            )}
            {dod.acceptanceSummary && (
              <div className="devnote-group">
                <h5>Acceptance Summary</h5>
                <p>
                  Total: {dod.acceptanceSummary.totalCriteria ?? '?'},
                  Passed: {dod.acceptanceSummary.passedCriteria ?? '?'},
                  Failed: {dod.acceptanceSummary.failedCriteria ?? 0}
                  {dod.acceptanceSummary.blockedCriteria ? `, Blocked: ${dod.acceptanceSummary.blockedCriteria}` : ''}
                  {dod.acceptanceSummary.passPercentage ? ` (${dod.acceptanceSummary.passPercentage})` : ''}
                </p>
              </div>
            )}
          </CollapsibleSection>
        );
      })()}

      {/* Effort Estimate Detail */}
      {(editMode || effortEstimate.breakdown?.length) && (
        <CollapsibleSection title="Effort Breakdown" sectionId="epic-effort">
          {editMode ? (
            <div className="editable-list">
              {(effortEstimate.breakdown || []).map((item: any, i: number) => (
                <div key={i} className="editable-list-item">
                  <input type="text" value={item.phase || ''} onChange={(e) => {
                    const updated = [...(effortEstimate.breakdown || [])]; updated[i] = { ...item, phase: e.target.value };
                    handleFieldChange('effortEstimate', { ...effortEstimate, breakdown: updated });
                  }} placeholder="Phase..." style={{ flex: 1 }} />
                  <input type="text" value={item.effort || item.duration || ''} onChange={(e) => {
                    const updated = [...(effortEstimate.breakdown || [])]; updated[i] = { ...item, effort: e.target.value, duration: e.target.value };
                    handleFieldChange('effortEstimate', { ...effortEstimate, breakdown: updated });
                  }} placeholder="Duration/Effort..." style={{ width: '80px' }} />
                  <button className="remove-btn" onClick={() => {
                    const updated = [...(effortEstimate.breakdown || [])]; updated.splice(i, 1);
                    handleFieldChange('effortEstimate', { ...effortEstimate, breakdown: updated });
                  }}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('effortEstimate', { ...effortEstimate, breakdown: [...(effortEstimate.breakdown || []), { phase: '', duration: '' }] });
              }}>+ Add</button>
            </div>
          ) : (
            <ul>{(effortEstimate.breakdown || []).map((item: any, i: number) => (
              <li key={i}><strong>{item.phase || `Phase ${i + 1}`}:</strong> {item.effort || item.duration || 'TBD'}{item.description ? ` — ${item.description}` : ''}</li>
            ))}</ul>
          )}
        </CollapsibleSection>
      )}

      {/* Risks (from test-design riskAssessment or epic-level risks) */}
      {(editedData.risks?.length > 0) && (
        <CollapsibleSection title="Risks" count={editedData.risks.length} sectionId="epic-risks">
          {editedData.risks.map((risk: any, i: number) => (
            <div key={risk.id || i} className="risk-item" style={{ marginBottom: '12px', padding: '8px', borderLeft: '3px solid var(--badge-risk-bg, #e74c3c)', paddingLeft: '12px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                {risk.id && <span className="tag">{risk.id}</span>}
                {risk.category && <span className="tag">{risk.category}</span>}
                {risk.probability && <span className="tag">P: {risk.probability}</span>}
                {risk.impact && <span className="tag">I: {risk.impact}</span>}
                {risk.riskScore != null && <span className="tag">Score: {risk.riskScore}</span>}
              </div>
              <Md text={risk.description || risk.risk || risk.title || 'No description'} />
              {risk.mitigation && (
                <div style={{ marginTop: '4px' }}>
                  <strong>Mitigation:</strong> <Md text={risk.mitigation} />
                </div>
              )}
              {risk.testStrategy && (
                <div style={{ marginTop: '4px' }}>
                  <strong>Test Strategy:</strong> <Md text={risk.testStrategy} />
                </div>
              )}
              {risk.owner && <div style={{ marginTop: '4px' }}><strong>Owner:</strong> {risk.owner}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// REQUIREMENT DETAILS
// ==========================================================================

export function renderRequirementDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray, artifact } = props;
  // Schema fields from requirement.schema.json
  const acceptanceCriteria: any[] = editedData.acceptanceCriteria || [];
  const dependencies: string[] = editedData.dependencies || [];
  const relatedEpics: string[] = editedData.relatedEpics || [];
  const relatedStories: string[] = editedData.relatedStories || [];
  const metrics: { target?: string; threshold?: string; unit?: string } =
    (editedData.metrics && typeof editedData.metrics === 'object' && !Array.isArray(editedData.metrics))
      ? editedData.metrics
      : {};

  return (
    <>
      {/* Type, Priority, Status, Verification Row */}
      <div className="detail-row">
        {editedData.type && (
          <section className="detail-section inline">
            <h4>Type</h4>
            {editMode ? (
              <select
                value={editedData.type || ''}
                onChange={(e) => handleFieldChange('type', e.target.value)}
                className="status-select"
              >
                <option value="">Not set</option>
                {['functional', 'non-functional', 'additional', 'business', 'technical', 'constraint'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <span className="tag">{editedData.type}</span>
            )}
          </section>
        )}

        {renderPriorityField(editedData.priority, (v) => handleFieldChange('priority', v), editMode)}

        <section className="detail-section inline">
          <h4>Status</h4>
          {editMode ? (
            <select
              value={editedData.requirementStatus || editedData.status || ''}
              onChange={(e) => handleFieldChange('requirementStatus', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {REQUIREMENT_STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            (editedData.requirementStatus || editedData.status) ? (
              <span className={`status-badge status-${editedData.requirementStatus || editedData.status}`}>{editedData.requirementStatus || editedData.status}</span>
            ) : (
              <span className="empty-message">Not set</span>
            )
          )}
        </section>

        <section className="detail-section inline">
          <h4>Verification</h4>
          {editMode ? (
            <select
              value={editedData.verificationMethod || ''}
              onChange={(e) => handleFieldChange('verificationMethod', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {VERIFICATION_METHOD_OPTIONS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            editedData.verificationMethod ? (
              <span className="tag">{editedData.verificationMethod}</span>
            ) : (
              <span className="empty-message">Not set</span>
            )
          )}
        </section>
      </div>

      {/* Capability Area + Category Row */}
      {(editMode || editedData.capabilityArea || editedData.category) && (
        <div className="detail-row">
          <section className="detail-section inline">
            <h4>Capability Area</h4>
            {editMode ? (
              <input
                type="text"
                value={editedData.capabilityArea || ''}
                onChange={(e) => handleFieldChange('capabilityArea', e.target.value)}
                placeholder="e.g., File Parsing & Data Ingestion"
                className="full-width-input"
              />
            ) : (
              editedData.capabilityArea ? (
                <span className="tag">{editedData.capabilityArea}</span>
              ) : <span className="empty-message">Not set</span>
            )}
          </section>

          {(editMode || editedData.category) && (
            <section className="detail-section inline">
              <h4>Category</h4>
              {editMode ? (
                <input
                  type="text"
                  value={editedData.category || ''}
                  onChange={(e) => handleFieldChange('category', e.target.value)}
                  placeholder="e.g., authentication, performance"
                  className="full-width-input"
                />
              ) : (
                <span className="tag">{editedData.category}</span>
              )}
            </section>
          )}
        </div>
      )}

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="req-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={4}
            placeholder="Describe the requirement..."
          />
        ) : (
          artifact.description ? <Md text={artifact.description} /> : <p className="empty-message">No description defined</p>
        )}
      </CollapsibleSection>

      {/* Rationale */}
      {(editMode || editedData.rationale) && (
        <CollapsibleSection title="Rationale" sectionId="req-rationale">
          {editMode ? (
            <textarea
              value={editedData.rationale || ''}
              onChange={(e) => handleFieldChange('rationale', e.target.value)}
              rows={3}
              placeholder="Why is this requirement needed?"
            />
          ) : (
            <Md text={editedData.rationale} />
          )}
        </CollapsibleSection>
      )}

      {/* Acceptance Criteria (GWT format from acceptance-criteria.schema) */}
      {(editMode || acceptanceCriteria.length > 0) && (
        <CollapsibleSection title="Acceptance Criteria" count={acceptanceCriteria.length} sectionId="req-acceptance-criteria">
          {editMode ? (
            <div className="editable-list">
              {acceptanceCriteria.map((ac: any, i: number) => (
                <div key={i} className="editable-list-item" style={{ flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <strong style={{ minWidth: '30px' }}>{ac.id || `AC-${i + 1}`}</strong>
                    <input
                      type="text"
                      value={ac.title || ''}
                      onChange={(e) => {
                        const updated = [...acceptanceCriteria];
                        updated[i] = { ...updated[i], title: e.target.value };
                        handleFieldChange('acceptanceCriteria', updated);
                      }}
                      placeholder="AC title..."
                      style={{ flex: 1 }}
                    />
                    <button className="remove-btn" onClick={() => {
                      handleFieldChange('acceptanceCriteria', acceptanceCriteria.filter((_: any, idx: number) => idx !== i));
                    }}>×</button>
                  </div>
                  <input
                    type="text"
                    value={typeof ac.given === 'string' ? ac.given : (Array.isArray(ac.given) ? ac.given.join('; ') : '')}
                    onChange={(e) => {
                      const updated = [...acceptanceCriteria];
                      updated[i] = { ...updated[i], given: e.target.value };
                      handleFieldChange('acceptanceCriteria', updated);
                    }}
                    placeholder="Given..."
                  />
                  <input
                    type="text"
                    value={typeof ac.when === 'string' ? ac.when : (Array.isArray(ac.when) ? ac.when.join('; ') : '')}
                    onChange={(e) => {
                      const updated = [...acceptanceCriteria];
                      updated[i] = { ...updated[i], when: e.target.value };
                      handleFieldChange('acceptanceCriteria', updated);
                    }}
                    placeholder="When..."
                  />
                  <input
                    type="text"
                    value={typeof ac.then === 'string' ? ac.then : (Array.isArray(ac.then) ? ac.then.join('; ') : '')}
                    onChange={(e) => {
                      const updated = [...acceptanceCriteria];
                      updated[i] = { ...updated[i], then: e.target.value };
                      handleFieldChange('acceptanceCriteria', updated);
                    }}
                    placeholder="Then..."
                  />
                  <input
                    type="text"
                    value={typeof ac.and === 'string' ? ac.and : (Array.isArray(ac.and) ? ac.and.join('; ') : '')}
                    onChange={(e) => {
                      const updated = [...acceptanceCriteria];
                      updated[i] = { ...updated[i], and: e.target.value };
                      handleFieldChange('acceptanceCriteria', updated);
                    }}
                    placeholder="And... (optional)"
                  />
                  <input
                    type="text"
                    value={typeof ac.but === 'string' ? ac.but : (Array.isArray(ac.but) ? ac.but.join('; ') : '')}
                    onChange={(e) => {
                      const updated = [...acceptanceCriteria];
                      updated[i] = { ...updated[i], but: e.target.value };
                      handleFieldChange('acceptanceCriteria', updated);
                    }}
                    placeholder="But... (optional)"
                  />
                  <input
                    type="text"
                    value={ac.notes || ''}
                    onChange={(e) => {
                      const updated = [...acceptanceCriteria];
                      updated[i] = { ...updated[i], notes: e.target.value };
                      handleFieldChange('acceptanceCriteria', updated);
                    }}
                    placeholder="Notes (optional)"
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() =>
                handleFieldChange('acceptanceCriteria', [...acceptanceCriteria, { id: `AC-${acceptanceCriteria.length + 1}`, given: '', when: '', then: '' }])
              }>
                + Add Acceptance Criterion
              </button>
            </div>
          ) : (
            <div className="structured-list">
              {acceptanceCriteria.map((ac: any, i: number) => {
                const givenArr = Array.isArray(ac.given) ? ac.given : (ac.given ? [ac.given] : []);
                const whenArr = Array.isArray(ac.when) ? ac.when : (ac.when ? [ac.when] : []);
                const thenArr = Array.isArray(ac.then) ? ac.then : (ac.then ? [ac.then] : []);
                const andArr = Array.isArray(ac.and) ? ac.and : (ac.and ? [ac.and] : []);
                const butArr = Array.isArray(ac.but) ? ac.but : (ac.but ? [ac.but] : []);
                return (
                  <div key={i} className="structured-list-item">
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '4px' }}>
                      {ac.id && <span className="tag">{ac.id}</span>}
                      {ac.title && <strong>{ac.title}</strong>}
                      {ac.priority && <span className={`priority-badge priority-${ac.priority}`}>{ac.priority}</span>}
                      {ac.automationStatus && <span className="tag">{ac.automationStatus}</span>}
                    </div>
                    <div className="gwt-block">
                      {givenArr.map((g: string, gi: number) => (
                        <div key={`g${gi}`} className="gwt-line"><span className="gwt-keyword">Given</span> {g}</div>
                      ))}
                      {whenArr.map((w: string, wi: number) => (
                        <div key={`w${wi}`} className="gwt-line"><span className="gwt-keyword">When</span> {w}</div>
                      ))}
                      {thenArr.map((t: string, ti: number) => (
                        <div key={`t${ti}`} className="gwt-line"><span className="gwt-keyword">Then</span> {t}</div>
                      ))}
                      {andArr.map((a: string, ai: number) => (
                        <div key={`a${ai}`} className="gwt-line"><span className="gwt-keyword">And</span> {a}</div>
                      ))}
                      {butArr.map((b: string, bi: number) => (
                        <div key={`b${bi}`} className="gwt-line"><span className="gwt-keyword">But</span> {b}</div>
                      ))}
                    </div>
                    {ac.testIds?.length > 0 && (
                      <div className="tags-list" style={{ marginTop: '4px' }}>
                        <span className="muted">Tests:</span>
                        {ac.testIds.map((tid: string, ti: number) => (
                          <span key={ti} className="tag">{tid}</span>
                        ))}
                      </div>
                    )}
                    {ac.notes && <p className="item-notes">{ac.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Metrics (object with target/threshold/unit — same as NFR) */}
      {(editMode || metrics.target || metrics.threshold || metrics.unit) && (
        <CollapsibleSection title="Metrics" sectionId="req-metrics">
          {editMode ? (
            <div className="structured-form">
              <div className="form-row">
                <label>Target</label>
                <input
                  type="text"
                  value={metrics.target || ''}
                  onChange={(e) => handleFieldChange('metrics', { ...metrics, target: e.target.value })}
                  placeholder="e.g., < 200ms, > 99.9%"
                />
              </div>
              <div className="form-row">
                <label>Threshold</label>
                <input
                  type="text"
                  value={metrics.threshold || ''}
                  onChange={(e) => handleFieldChange('metrics', { ...metrics, threshold: e.target.value })}
                  placeholder="Minimum acceptable value"
                />
              </div>
              <div className="form-row">
                <label>Unit</label>
                <input
                  type="text"
                  value={metrics.unit || ''}
                  onChange={(e) => handleFieldChange('metrics', { ...metrics, unit: e.target.value })}
                  placeholder="e.g., ms, %, seconds"
                />
              </div>
            </div>
          ) : (
            <div className="detail-grid">
              {metrics.target && (
                <div className="detail-grid-item">
                  <span className="detail-grid-label">Target</span>
                  <span className="detail-grid-value">{metrics.target}</span>
                </div>
              )}
              {metrics.threshold && (
                <div className="detail-grid-item">
                  <span className="detail-grid-label">Threshold</span>
                  <span className="detail-grid-value">{metrics.threshold}</span>
                </div>
              )}
              {metrics.unit && (
                <div className="detail-grid-item">
                  <span className="detail-grid-label">Unit</span>
                  <span className="detail-grid-value">{metrics.unit}</span>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Source */}
      {(editMode || editedData.source) && (
        <CollapsibleSection title="Source" sectionId="req-source">
          {editMode ? (
            <input
              type="text"
              value={editedData.source || ''}
              onChange={(e) => handleFieldChange('source', e.target.value)}
              placeholder="Requirement source..."
              className="full-width-input"
            />
          ) : (
            <span>{editedData.source}</span>
          )}
        </CollapsibleSection>
      )}

      {/* Implementation Notes */}
      {(editMode || editedData.implementationNotes) && (
        <CollapsibleSection title="Implementation Notes" sectionId="req-impl-notes">
          {editMode ? (
            <textarea
              value={editedData.implementationNotes || ''}
              onChange={(e) => handleFieldChange('implementationNotes', e.target.value)}
              rows={3}
              placeholder="Technical implementation guidance..."
            />
          ) : (
            <Md text={editedData.implementationNotes} />
          )}
        </CollapsibleSection>
      )}

      {/* Notes */}
      {(editMode || editedData.notes) && (
        <CollapsibleSection title="Notes" sectionId="req-notes">
          {editMode ? (
            <textarea
              value={editedData.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              rows={3}
              placeholder="Additional notes..."
            />
          ) : (
            <Md text={editedData.notes} />
          )}
        </CollapsibleSection>
      )}

      {/* Dependencies (requirement IDs this depends on) */}
      {(editMode || dependencies.length > 0) && (
        <CollapsibleSection title="Dependencies" count={dependencies.length} sectionId="req-dependencies">
          {editMode ? (
            <div className="editable-list">
              {dependencies.map((d: string, i: number) => (
                <div key={i} className="editable-list-item">
                  <input
                    type="text"
                    value={d}
                    onChange={(e) => updateArrayItem('dependencies', i, e.target.value)}
                    placeholder="Requirement ID..."
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('dependencies', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('dependencies', '')}>
                + Add Dependency
              </button>
            </div>
          ) : (
            <div className="tags-list">
              {dependencies.map((d: string, i: number) => (
                <span key={i} className="tag">{d}</span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Related Epics */}
      {(editMode || relatedEpics.length > 0) && (
        <CollapsibleSection title="Related Epics" count={relatedEpics.length} sectionId="req-related-epics">
          {editMode ? (
            <div className="editable-list">
              {relatedEpics.map((r: string, i: number) => (
                <div key={i} className="editable-list-item">
                  <input
                    type="text"
                    value={r}
                    onChange={(e) => updateArrayItem('relatedEpics', i, e.target.value)}
                    placeholder="Epic ID..."
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('relatedEpics', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('relatedEpics', '')}>
                + Add Epic
              </button>
            </div>
          ) : (
            <div className="tags-list">
              {relatedEpics.map((r: string, i: number) => (
                <span key={i} className="tag">{r}</span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Related Stories */}
      {(editMode || relatedStories.length > 0) && (
        <CollapsibleSection title="Related Stories" count={relatedStories.length} sectionId="req-related-stories">
          {editMode ? (
            <div className="editable-list">
              {relatedStories.map((r: string, i: number) => (
                <div key={i} className="editable-list-item">
                  <input
                    type="text"
                    value={r}
                    onChange={(e) => updateArrayItem('relatedStories', i, e.target.value)}
                    placeholder="Story ID..."
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('relatedStories', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('relatedStories', '')}>
                + Add Story
              </button>
            </div>
          ) : (
            <div className="tags-list">
              {relatedStories.map((r: string, i: number) => (
                <span key={i} className="tag">{r}</span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// VISION DETAILS
// ==========================================================================

export function renderVisionDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray, artifact } = props;

  // --- Normalize data: sample JSON has nested vision object and rich arrays ---
  // Vision statement: may be in editedData.vision.statement, editedData.description, or artifact.description
  const visionObj = editedData.vision || {};
  const visionStatement = typeof visionObj === 'object' ? (visionObj.statement || '') : (typeof visionObj === 'string' ? visionObj : '');
  const problemStatement = typeof visionObj === 'object' ? (visionObj.problemStatement || '') : '';
  const proposedSolution = typeof visionObj === 'object' ? (visionObj.proposedSolution || '') : '';
  const displayVisionStatement = visionStatement || editedData.description || artifact.description || '';

  // Core values: may not exist in sample data
  const coreValues: string[] = editedData.coreValues || [];

  // Target audience: sample has targetUsers [{persona, description}], renderer had targetAudience string[]
  const rawTargetUsers: any[] = editedData.targetUsers || editedData.targetAudience || [];
  const targetUsers: { persona: string; description: string }[] = rawTargetUsers.map((u: any) =>
    typeof u === 'string' ? { persona: u, description: '' } : { persona: u.persona || u.role || u.name || '', description: u.description || '' }
  );

  // Success metrics: sample has [{metric, description}], renderer had string[]
  const rawMetrics: any[] = editedData.successMetrics || [];
  const successMetrics: { metric: string; description: string }[] = rawMetrics.map((m: any) =>
    typeof m === 'string' ? { metric: m, description: '' } : { metric: m.metric || m.name || '', description: m.description || '' }
  );

  return (
    <>
      {/* Vision Statement */}
      <CollapsibleSection title="Vision Statement" sectionId="vision-statement">
        {editMode ? (
          <textarea
            value={editedData.description || visionStatement || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={4}
            placeholder="The vision statement..."
          />
        ) : (
          displayVisionStatement ? <Md text={displayVisionStatement} /> : <p className="empty-message">No vision statement defined</p>
        )}
      </CollapsibleSection>

      {/* Problem Statement */}
      {(problemStatement || editMode) && (
        <CollapsibleSection title="Problem Statement" sectionId="vision-problem">
          {editMode ? (
            <textarea
              value={editedData.problemStatement || problemStatement}
              onChange={(e) => handleFieldChange('problemStatement', e.target.value)}
              rows={4}
              placeholder="The problem being solved..."
            />
          ) : (
            problemStatement ? <Md text={problemStatement} /> : <p className="empty-message">No problem statement defined</p>
          )}
        </CollapsibleSection>
      )}

      {/* Proposed Solution */}
      {(proposedSolution || editMode) && (
        <CollapsibleSection title="Proposed Solution" sectionId="vision-solution">
          {editMode ? (
            <textarea
              value={editedData.proposedSolution || proposedSolution}
              onChange={(e) => handleFieldChange('proposedSolution', e.target.value)}
              rows={4}
              placeholder="The proposed solution..."
            />
          ) : (
            proposedSolution ? <Md text={proposedSolution} /> : <p className="empty-message">No proposed solution defined</p>
          )}
        </CollapsibleSection>
      )}

      {/* Core Values */}
      {(coreValues.length > 0 || editMode) && (
        <CollapsibleSection title="Core Values" count={coreValues.length} sectionId="vision-values">
          {editMode ? (
            <div className="editable-list">
              {coreValues.map((val: string, i: number) => (
                <div key={i} className="editable-list-item">
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => updateArrayItem('coreValues', i, e.target.value)}
                    placeholder="Core value..."
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('coreValues', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('coreValues', '')}>
                + Add Core Value
              </button>
            </div>
          ) : (
            <ul className="criteria-list">
              {coreValues.map((val: string, i: number) => <li key={i}>{val}</li>)}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Target Users / Audience */}
      <CollapsibleSection title="Target Users" count={targetUsers.length} sectionId="vision-audience">
        {editMode ? (
          <div className="editable-list">
            {(editedData.targetUsers || editedData.targetAudience || []).map((a: any, i: number) => (
              <div key={i} className="editable-list-item">
                <input
                  type="text"
                  value={typeof a === 'string' ? a : (a.persona || a.role || '')}
                  onChange={(e) => updateArrayItem(editedData.targetUsers ? 'targetUsers' : 'targetAudience', i, typeof a === 'string' ? e.target.value : { ...a, persona: e.target.value })}
                  placeholder="Target user..."
                />
                <button className="remove-btn" onClick={() => removeFromArray(editedData.targetUsers ? 'targetUsers' : 'targetAudience', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray(editedData.targetUsers ? 'targetUsers' : 'targetAudience', '')}>
              + Add Target User
            </button>
          </div>
        ) : (
          targetUsers.length > 0 ? (
            <ul className="criteria-list">
              {targetUsers.map((u, i: number) => (
                <li key={i}>
                  <strong>{u.persona}</strong>
                  {u.description && <> — {u.description}</>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-message">No target users defined</p>
          )
        )}
      </CollapsibleSection>

      {/* Success Metrics */}
      <CollapsibleSection title="Success Metrics" count={successMetrics.length} sectionId="vision-metrics">
        {editMode ? (
          <div className="editable-list">
            {(editedData.successMetrics || []).map((m: any, i: number) => (
              <div key={i} className="editable-list-item">
                <input
                  type="text"
                  value={typeof m === 'string' ? m : (m.metric || m.name || '')}
                  onChange={(e) => updateArrayItem('successMetrics', i, typeof m === 'string' ? e.target.value : { ...m, metric: e.target.value })}
                  placeholder="Success metric..."
                />
                <button className="remove-btn" onClick={() => removeFromArray('successMetrics', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('successMetrics', '')}>
              + Add Metric
            </button>
          </div>
        ) : (
          successMetrics.length > 0 ? (
            <ul className="criteria-list">
              {successMetrics.map((m, i: number) => (
                <li key={i}>
                  <strong>{m.metric}</strong>
                  {m.description && <> — {m.description}</>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-message">No success metrics defined</p>
          )
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// GENERIC DETAILS
// ==========================================================================

export function renderGenericDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, artifact } = props;
  return (
    <CollapsibleSection title="Description" sectionId="generic-description">
      {editMode ? (
        <textarea
          value={editedData.description || ''}
          onChange={(e) => handleFieldChange('description', e.target.value)}
          rows={4}
          placeholder="Description..."
        />
      ) : (
        artifact.description ? <Md text={artifact.description} /> : <p className="empty-message">No description defined</p>
      )}
    </CollapsibleSection>
  );
}

// ==========================================================================
// TEST CASE DETAILS
// ==========================================================================

export function renderTestCaseDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray, artifact, allArtifacts } = props;
  const meta = artifact.metadata as TestCaseMetadata | undefined;
  const steps: any[] = editedData.steps ?? meta?.steps ?? [];
  const relatedRequirements: string[] = editedData.relatedRequirements ?? meta?.relatedRequirements ?? [];
  const preconditions: string[] = editedData.preconditions ?? meta?.preconditions ?? [];
  const tags: string[] = editedData.tags ?? meta?.tags ?? [];

  return (
    <>
      {/* Priority, Type & Level Row */}
      <div className="detail-row">
        {renderPriorityField(editedData.priority, (v) => handleFieldChange('priority', v), editMode)}

        <section className="detail-section inline">
          <h4>Type</h4>
          {editMode ? (
            <select
              value={editedData.type || meta?.type || 'acceptance'}
              onChange={(e) => handleFieldChange('type', e.target.value)}
              className="status-select"
            >
              {['unit', 'integration', 'e2e', 'acceptance'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          ) : (
            <span className="tag">{editedData.type || meta?.type || 'acceptance'}</span>
          )}
        </section>

        <section className="detail-section inline">
          <h4>Level</h4>
          {editMode ? (
            <select
              value={editedData.level || meta?.level || ''}
              onChange={(e) => handleFieldChange('level', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {['unit', 'integration', 'component', 'api', 'e2e', 'performance', 'security'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          ) : (
            (editedData.level || meta?.level) ? (
              <span className="tag">{editedData.level || meta?.level}</span>
            ) : <span className="empty-message">Not set</span>
          )}
        </section>
      </div>

      {/* Links */}
      <CollapsibleSection title="Links" sectionId="testcase-links">
        {editMode ? (
          <div className="related-links-edit">
            <div>
              <span className="field-label">Parent Story</span>
              <ArtifactPicker
                artifacts={allArtifacts}
                artifactType="story"
                selectedIds={(editedData.storyId ?? meta?.storyId) ? [editedData.storyId ?? meta?.storyId ?? ''] : []}
                onChange={(ids) => handleFieldChange('storyId', ids[0] || '')}
                mode="single"
                placeholder="Search stories..."
              />
            </div>
            <div>
              <span className="field-label">Parent Epic</span>
              <ArtifactPicker
                artifacts={allArtifacts}
                artifactType="epic"
                selectedIds={(editedData.epicId ?? meta?.epicId) ? [editedData.epicId ?? meta?.epicId ?? ''] : []}
                onChange={(ids) => handleFieldChange('epicId', ids[0] || '')}
                mode="single"
                placeholder="Search epics..."
              />
            </div>
          </div>
        ) : (
          <>
            {(meta?.storyId || meta?.epicId) ? (
              <div className="detail-row">
                {meta?.storyId && (
                  <section className="detail-section inline">
                    <h4>Parent Story</h4>
                    <span className="tag">{meta.storyId}</span>
                  </section>
                )}
                {meta?.epicId && (
                  <section className="detail-section inline">
                    <h4>Parent Epic</h4>
                    <span className="tag">{meta.epicId}</span>
                  </section>
                )}
              </div>
            ) : (
              <p className="empty-message">No parent links defined</p>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="testcase-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={3}
            placeholder="Describe the test case..."
          />
        ) : (
          artifact.description ? <Md text={artifact.description} /> : <p className="empty-message">No description defined</p>
        )}
      </CollapsibleSection>

      {/* Preconditions */}
      <CollapsibleSection title="Preconditions" count={preconditions.length} sectionId="testcase-preconditions">
        {editMode ? (
          <div className="editable-list">
            {preconditions.map((p: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input
                  type="text"
                  value={p}
                  onChange={(e) => updateArrayItem('preconditions', i, e.target.value)}
                  placeholder="Precondition..."
                />
                <button className="remove-btn" onClick={() => removeFromArray('preconditions', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('preconditions', '')}>
              + Add Precondition
            </button>
          </div>
        ) : (
          preconditions.length > 0
            ? <ul className="preconditions-list">{preconditions.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
            : <p className="empty-message">No preconditions defined</p>
        )}
      </CollapsibleSection>

      {/* Steps */}
      <CollapsibleSection title="Test Steps" count={steps.length} sectionId="testcase-steps">
        {editMode ? (
          <div className="editable-list">
            {steps.map((step: any, i: number) => {
              // Detect format: BDD if any of given/when/then exist, schema if action exists
              const isBDD = typeof step === 'object' && step !== null && (step.given !== undefined || step.when !== undefined || step.then !== undefined);
              const isSchema = typeof step === 'object' && step !== null && (step.action !== undefined || step.expectedResult !== undefined) && !isBDD;
              const isString = typeof step === 'string';

              if (isString) {
                return (
                  <div key={i} className="test-step-edit">
                    <div className="test-step-fields">
                      <label>
                        <span className="field-label">Step {i + 1}</span>
                        <input
                          type="text"
                          value={step}
                          onChange={(e) => updateArrayItem('steps', i, e.target.value)}
                          placeholder="Step description..."
                        />
                      </label>
                    </div>
                    <button className="remove-btn" onClick={() => removeFromArray('steps', i)}>×</button>
                  </div>
                );
              }

              if (isSchema) {
                return (
                  <div key={i} className="test-step-edit">
                    <div className="test-step-fields">
                      <label>
                        <span className="field-label">Step {step.step ?? i + 1} — Action</span>
                        <input
                          type="text"
                          value={step.action || ''}
                          onChange={(e) => updateArrayItem('steps', i, { ...step, action: e.target.value })}
                          placeholder="Action..."
                        />
                      </label>
                      <label>
                        <span className="field-label">Expected Result</span>
                        <input
                          type="text"
                          value={step.expectedResult || ''}
                          onChange={(e) => updateArrayItem('steps', i, { ...step, expectedResult: e.target.value })}
                          placeholder="Expected result..."
                        />
                      </label>
                    </div>
                    <button className="remove-btn" onClick={() => removeFromArray('steps', i)}>×</button>
                  </div>
                );
              }

              // BDD format (default for objects)
              return (
                <div key={i} className="test-step-edit">
                  <div className="test-step-fields">
                    <label>
                      <span className="field-label">Given</span>
                      <input
                        type="text"
                        value={step?.given || ''}
                        onChange={(e) => updateArrayItem('steps', i, { ...step, given: e.target.value })}
                        placeholder="Given..."
                      />
                    </label>
                    <label>
                      <span className="field-label">When</span>
                      <input
                        type="text"
                        value={step?.when || ''}
                        onChange={(e) => updateArrayItem('steps', i, { ...step, when: e.target.value })}
                        placeholder="When..."
                      />
                    </label>
                    <label>
                      <span className="field-label">Then</span>
                      <input
                        type="text"
                        value={step?.then || ''}
                        onChange={(e) => updateArrayItem('steps', i, { ...step, then: e.target.value })}
                        placeholder="Then..."
                      />
                    </label>
                  </div>
                  <button className="remove-btn" onClick={() => removeFromArray('steps', i)}>×</button>
                </div>
              );
            })}
            <button
              className="btn btn-secondary btn-small"
              onClick={() => addToArray('steps', { action: '', expectedResult: '' })}
            >
              + Add Step
            </button>
          </div>
        ) : (
          steps.length > 0 ? (
            <div className="test-steps">
              {steps.map((step: any, i: number) => {
                // Handle non-object primitives (strings, numbers, null, etc.)
                if (step === null || step === undefined) {
                  return <div key={i} className="test-step"><strong>Step {i + 1}:</strong> <span className="empty-message">(empty)</span></div>;
                }
                if (typeof step !== 'object') {
                  return <div key={i} className="test-step"><strong>Step {i + 1}:</strong> {String(step)}</div>;
                }
                // Detect which recognised format this step uses
                const hasBDD = !!(step.given || step.when || step.then);
                const hasSchema = !!step.action;
                const hasDescription = !!step.description;

                // If none of the known formats match, render all non-internal
                // key/value pairs so the content is never invisible.
                const isUnrecognised = !hasBDD && !hasSchema && !hasDescription;

                return (
                  <div key={i} className="test-step">
                    {/* BDD Given/When/Then format */}
                    {step.given && <div><strong>Given</strong> {step.given}</div>}
                    {step.when && <div><strong>When</strong> {step.when}</div>}
                    {step.then && <div><strong>Then</strong> {step.then}</div>}
                    {step.and?.map((a: string, j: number) => <div key={j}><strong>And</strong> {a}</div>)}
                    {/* Step/Action/ExpectedResult format */}
                    {hasSchema && !hasBDD && (
                      <div>
                        <strong>Step {step.step ?? i + 1}:</strong> {step.action}
                        {step.expectedResult && <div className="muted">Expected: {step.expectedResult}</div>}
                      </div>
                    )}
                    {/* Fallback description */}
                    {hasDescription && !hasBDD && !hasSchema && <div>{step.description}</div>}
                    {/* Ultimate fallback: render all key/value pairs so steps are never invisible */}
                    {isUnrecognised && (
                      <div>
                        <strong>Step {step.step ?? i + 1}:</strong>{' '}
                        {Object.entries(step)
                          .filter(([k]) => k !== 'step')
                          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                          .join(' | ') || '(empty step)'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-message">No steps defined</p>
          )
        )}
      </CollapsibleSection>

      {/* Expected Result */}
      <CollapsibleSection title="Expected Result" sectionId="testcase-expectedResult">
        {editMode ? (
          <textarea
            value={editedData.expectedResult || meta?.expectedResult || ''}
            onChange={(e) => handleFieldChange('expectedResult', e.target.value)}
            rows={3}
            placeholder="Describe the expected result..."
          />
        ) : (
          (editedData.expectedResult || meta?.expectedResult) ? <Md text={editedData.expectedResult || meta?.expectedResult} /> : <p className="empty-message">No expected result defined</p>
        )}
      </CollapsibleSection>

      {/* Test Data */}
      <CollapsibleSection title="Test Data" sectionId="testcase-testData">
        {editMode ? (
          <textarea
            value={editedData.testData || meta?.testData || ''}
            onChange={(e) => handleFieldChange('testData', e.target.value)}
            rows={3}
            placeholder="Describe test data requirements..."
          />
        ) : (
          (editedData.testData || meta?.testData) ? <Md text={editedData.testData || meta?.testData} /> : <p className="empty-message">No test data defined</p>
        )}
      </CollapsibleSection>

      {/* Related Requirements */}
      {(editMode || relatedRequirements.length > 0) && (
        <CollapsibleSection title="Related Requirements" count={relatedRequirements.length} sectionId="testcase-relatedRequirements">
          {editMode ? (
            <ArtifactPicker
              artifacts={allArtifacts}
              artifactType="requirement"
              selectedIds={relatedRequirements}
              onChange={(ids) => handleFieldChange('relatedRequirements', ids)}
              placeholder="Search requirements..."
            />
          ) : (
            <div className="tags-list">
              {relatedRequirements.map((r: string, i: number) => <span key={i} className="tag">{r}</span>)}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Related Risks */}
      {(editMode || (editedData.relatedRisks ?? meta?.relatedRisks ?? []).length > 0) && (
        <CollapsibleSection title="Related Risks" count={(editedData.relatedRisks ?? meta?.relatedRisks ?? []).length} sectionId="testcase-relatedRisks">
          {editMode ? (
            <div className="editable-list">
              {(editedData.relatedRisks ?? meta?.relatedRisks ?? []).map((r: string, i: number) => (
                <div key={i} className="editable-list-item">
                  <input
                    type="text"
                    value={r}
                    onChange={(e) => updateArrayItem('relatedRisks', i, e.target.value)}
                    placeholder="Risk ID or description"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('relatedRisks', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('relatedRisks', '')}>+ Add Risk</button>
            </div>
          ) : (
            <div className="tags-list">
              {(editedData.relatedRisks ?? meta?.relatedRisks ?? []).map((r: string, i: number) => <span key={i} className="tag risk-tag">{r}</span>)}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Tags */}
      <CollapsibleSection title="Tags" count={tags.length} sectionId="testcase-tags">
        {editMode ? (
          <div className="editable-list horizontal">
            {tags.map((tag: string, i: number) => (
              <div key={i} className="editable-tag">
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => updateArrayItem('tags', i, e.target.value)}
                  placeholder="Tag"
                />
                <button className="remove-btn" onClick={() => removeFromArray('tags', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('tags', '')}>
              + Add Tag
            </button>
          </div>
        ) : (
          tags.length > 0 ? (
            <div className="tags-list">
              {tags.map((tag: string, i: number) => (
                <span key={i} className="tag">{tag}</span>
              ))}
            </div>
          ) : (
            <p className="empty-message">No tags defined</p>
          )
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// TEST STRATEGY DETAILS
// ==========================================================================

export function renderTestStrategyDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray, artifact } = props;
  const meta = artifact.metadata as TestStrategyMetadata | undefined;
  // Normalize: sample uses 'testLevels', renderer schema uses 'testTypes'
  const testTypes: string[] = editedData.testTypes || editedData.testLevels || meta?.testTypes || (meta as any)?.testLevels || [];
  // Normalize: sample uses 'tools', renderer schema uses 'tooling'
  const tooling: string[] = editedData.tooling || editedData.tools || meta?.tooling || (meta as any)?.tools || [];
  // Normalize: sample uses object {unit: "85%", ...}, renderer expects [{area, target}]
  const rawCoverage = editedData.coverageTargets || meta?.coverageTargets;
  const coverageTargets: any[] = Array.isArray(rawCoverage) ? rawCoverage
    : (rawCoverage && typeof rawCoverage === 'object')
      ? Object.entries(rawCoverage).map(([area, target]) => ({ area, target: typeof target === 'string' ? target : JSON.stringify(target) }))
      : [];
  // Normalize: sample uses 'riskBasedPriority', renderer schema uses 'riskAreas'
  const riskAreas: string[] = editedData.riskAreas || editedData.riskBasedPriority || meta?.riskAreas || (meta as any)?.riskBasedPriority || [];
  // Environments (not in original renderer but present in sample data)
  const environments: any[] = editedData.environments || (meta as any)?.environments || [];

  return (
    <>
      {/* Scope */}
      <CollapsibleSection title="Scope" sectionId="teststrategy-scope">
        {editMode ? (
          <textarea
            value={editedData.scope || ''}
            onChange={(e) => handleFieldChange('scope', e.target.value)}
            rows={3}
            placeholder="Define the scope of testing..."
          />
        ) : (
          (editedData.scope || meta?.scope) ? <Md text={editedData.scope || meta?.scope} /> : <p className="empty-message">No scope defined</p>
        )}
      </CollapsibleSection>

      {/* Approach */}
      <CollapsibleSection title="Approach" sectionId="teststrategy-approach">
        {editMode ? (
          <textarea
            value={editedData.approach || ''}
            onChange={(e) => handleFieldChange('approach', e.target.value)}
            rows={3}
            placeholder="Describe the testing approach..."
          />
        ) : (
          (editedData.approach || meta?.approach) ? <Md text={editedData.approach || meta?.approach} /> : <p className="empty-message">No approach defined</p>
        )}
      </CollapsibleSection>

      {/* Test Types */}
      <CollapsibleSection title="Test Types" count={testTypes.length} sectionId="teststrategy-testTypes">
        {editMode ? (
          <div className="editable-list">
            {testTypes.map((t: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input type="text" value={t} onChange={(e) => updateArrayItem('testTypes', i, e.target.value)} placeholder="Test type..." />
                <button className="remove-btn" onClick={() => removeFromArray('testTypes', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('testTypes', '')}>+ Add Type</button>
          </div>
        ) : testTypes.length > 0 ? (
          <div className="tags-list">
            {testTypes.map((t: string, i: number) => (
              <span key={i} className="tag">{t}</span>
            ))}
          </div>
        ) : (
          <p className="empty-message">No test types defined</p>
        )}
      </CollapsibleSection>

      {/* Tooling */}
      <CollapsibleSection title="Tooling" count={tooling.length} sectionId="teststrategy-tooling">
        {editMode ? (
          <div className="editable-list">
            {tooling.map((tool: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input type="text" value={tool} onChange={(e) => updateArrayItem('tooling', i, e.target.value)} placeholder="Tool name..." />
                <button className="remove-btn" onClick={() => removeFromArray('tooling', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('tooling', '')}>+ Add Tool</button>
          </div>
        ) : tooling.length > 0 ? (
          <ul className="tooling-list">
            {tooling.map((tool: string, i: number) => <li key={i}>{tool}</li>)}
          </ul>
        ) : (
          <p className="empty-message">No tooling defined</p>
        )}
      </CollapsibleSection>

      {/* Environments */}
      {environments.length > 0 && (
        <CollapsibleSection title="Environments" count={environments.length} sectionId="teststrategy-environments">
          <div className="structured-list">
            {environments.map((env: any, i: number) => (
              <div key={i} className="structured-list-item">
                <strong>{typeof env === 'string' ? env : env.name || `Environment ${i + 1}`}</strong>
                {typeof env === 'object' && env.purpose && <div style={{ opacity: 0.8 }}>{env.purpose}</div>}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Coverage Targets */}
      {(editMode || coverageTargets.length > 0) && (
        <CollapsibleSection title="Coverage Targets" count={coverageTargets.length} sectionId="teststrategy-coverageTargets">
          {editMode ? (
            <div className="coverage-target-edit">
              {coverageTargets.map((ct: { area?: string; target?: string }, i: number) => (
                <div key={i} className="editable-item-header">
                  <input
                    type="text"
                    value={ct.area || ''}
                    onChange={(e) => updateArrayItem('coverageTargets', i, { ...ct, area: e.target.value })}
                    placeholder="Area (e.g. Unit Tests)"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    value={ct.target || ''}
                    onChange={(e) => updateArrayItem('coverageTargets', i, { ...ct, target: e.target.value })}
                    placeholder="Target (e.g. 80%)"
                    style={{ width: '120px' }}
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('coverageTargets', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('coverageTargets', { area: '', target: '' })}>+ Add Coverage Target</button>
            </div>
          ) : (
            <ul className="coverage-targets-list">
              {coverageTargets.map((ct: { area?: string; target?: string }, i: number) => (
                <li key={i}><strong>{ct.area}</strong>: {ct.target}</li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Risk Areas */}
      <CollapsibleSection title="Risk Areas" count={riskAreas.length} sectionId="teststrategy-riskAreas">
        {editMode ? (
          <div className="editable-list">
            {riskAreas.map((r: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input type="text" value={r} onChange={(e) => updateArrayItem('riskAreas', i, e.target.value)} placeholder="Risk area..." />
                <button className="remove-btn" onClick={() => removeFromArray('riskAreas', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('riskAreas', '')}>+ Add Risk Area</button>
          </div>
        ) : riskAreas.length > 0 ? (
          <ul className="risk-areas-list">
            {riskAreas.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        ) : (
          <p className="empty-message">No risk areas defined</p>
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// ARCHITECTURE DECISION DETAILS
// ==========================================================================

export function renderArchitectureDecisionDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray } = props;
  const alternatives: any[] = editedData.alternatives || [];
  const consequences: string[] = editedData.consequences || [];
  const relatedDecisions: string[] = editedData.relatedDecisions || [];
  const deciders: string[] = editedData.deciders || [];

  return (
    <>
      {/* Context */}
      <CollapsibleSection title="Context" sectionId="arch-decision-context">
        {editMode ? (
          <textarea
            value={editedData.context || ''}
            onChange={(e) => handleFieldChange('context', e.target.value)}
            rows={4}
            placeholder="What is the context for this decision?"
          />
        ) : (
          editedData.context ? <Md text={editedData.context} /> : <p className="empty-message">No context defined</p>
        )}
      </CollapsibleSection>

      {/* Decision */}
      <CollapsibleSection title="Decision" sectionId="arch-decision-decision">
        {editMode ? (
          <textarea
            value={editedData.decision || ''}
            onChange={(e) => handleFieldChange('decision', e.target.value)}
            rows={3}
            placeholder="What was decided?"
          />
        ) : (
          editedData.decision ? <Md text={editedData.decision} /> : <p className="empty-message">No decision recorded</p>
        )}
      </CollapsibleSection>

      {/* Rationale */}
      <CollapsibleSection title="Rationale" sectionId="arch-decision-rationale">
        {editMode ? (
          <textarea
            value={editedData.rationale || ''}
            onChange={(e) => handleFieldChange('rationale', e.target.value)}
            rows={3}
            placeholder="Why was this decision made?"
          />
        ) : (
          editedData.rationale ? <Md text={editedData.rationale} /> : <p className="empty-message">No rationale provided</p>
        )}
      </CollapsibleSection>

      {/* Consequences */}
      <CollapsibleSection title="Consequences" count={consequences.length} sectionId="arch-decision-consequences">
        {editMode ? (
          <div className="editable-list">
            {consequences.map((c: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input
                  type="text"
                  value={c}
                  onChange={(e) => updateArrayItem('consequences', i, e.target.value)}
                  placeholder="Consequence..."
                />
                <button className="remove-btn" onClick={() => removeFromArray('consequences', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('consequences', '')}>
              + Add Consequence
            </button>
          </div>
        ) : (
          consequences.length > 0 ? (
            <ul className="criteria-list">
              {consequences.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ul>
          ) : (
            <p className="empty-message">No consequences listed</p>
          )
        )}
      </CollapsibleSection>

      {/* Alternatives */}
      <CollapsibleSection title="Alternatives Considered" count={alternatives.length} sectionId="arch-decision-alternatives">
        {alternatives.length > 0 ? (
          <div className="alternatives-list">
            {alternatives.map((alt: any, i: number) => (
              <div key={i} className="alternative-item" style={{ marginBottom: '8px', padding: '8px', borderRadius: '4px', background: 'var(--vscode-editor-background)' }}>
                <strong>{alt.title || alt.option || `Option ${i + 1}`}</strong>
                {alt.pros && <div style={{ marginTop: '4px', color: 'var(--vscode-charts-green)' }}>Pros: {Array.isArray(alt.pros) ? alt.pros.join(', ') : alt.pros}</div>}
                {alt.cons && <div style={{ color: 'var(--vscode-charts-red)' }}>Cons: {Array.isArray(alt.cons) ? alt.cons.join(', ') : alt.cons}</div>}
                {alt.rationale && <div style={{ marginTop: '4px', opacity: 0.8 }}>{alt.rationale}</div>}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No alternatives documented</p>
        )}
      </CollapsibleSection>

      {/* Related Decisions */}
      <CollapsibleSection title="Related Decisions" count={relatedDecisions.length} sectionId="arch-decision-related">
        <div className="tags-list">
          {relatedDecisions.length > 0 ? relatedDecisions.map((d: string, i: number) => (
            <span key={i} className="tag">{d}</span>
          )) : <span className="empty-message">None</span>}
        </div>
      </CollapsibleSection>

      {/* Date & Deciders Row */}
      <div className="detail-row">
        <section className="detail-section inline">
          <h4>Date</h4>
          {editMode ? (
            <input
              type="text"
              value={editedData.date || ''}
              onChange={(e) => handleFieldChange('date', e.target.value)}
              placeholder="YYYY-MM-DD"
              className="full-width-input"
            />
          ) : (
            <span>{editedData.date || <span className="empty-message">Not set</span>}</span>
          )}
        </section>
        <section className="detail-section inline">
          <h4>Deciders</h4>
          <div className="tags-list">
            {deciders.length > 0 ? deciders.map((d: string, i: number) => (
              <span key={i} className="tag">{d}</span>
            )) : <span className="empty-message">None</span>}
          </div>
        </section>
      </div>

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="arch-decision-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={4}
            placeholder="Additional details..."
          />
        ) : (
          editedData.description ? <Md text={editedData.description} /> : <p className="empty-message">No description</p>
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// SYSTEM COMPONENT DETAILS
// ==========================================================================

export function renderSystemComponentDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray } = props;
  const responsibilities: string[] = editedData.responsibilities || [];
  const interfaces: any[] = editedData.interfaces || [];
  const componentDependencies: string[] = editedData.componentDependencies || [];
  const technology: string[] = Array.isArray(editedData.technology) ? editedData.technology :
    (editedData.technology ? [editedData.technology] : []);

  return (
    <>
      {/* Component Type */}
      <div className="detail-row">
        <section className="detail-section inline">
          <h4>Component Type</h4>
          {editMode ? (
            <input
              type="text"
              value={editedData.componentType || ''}
              onChange={(e) => handleFieldChange('componentType', e.target.value)}
              placeholder="e.g., Service, Library, API"
              className="full-width-input"
            />
          ) : (
            editedData.componentType ? (
              <span className="tag">{editedData.componentType}</span>
            ) : <span className="empty-message">Not specified</span>
          )}
        </section>
      </div>

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="sys-component-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={3}
            placeholder="Component description..."
          />
        ) : (
          editedData.description ? <Md text={editedData.description} /> : <p className="empty-message">No description</p>
        )}
      </CollapsibleSection>

      {/* Responsibilities */}
      <CollapsibleSection title="Responsibilities" count={responsibilities.length} sectionId="sys-component-responsibilities">
        {editMode ? (
          <div className="editable-list">
            {responsibilities.map((r: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input
                  type="text"
                  value={r}
                  onChange={(e) => updateArrayItem('responsibilities', i, e.target.value)}
                  placeholder="Responsibility..."
                />
                <button className="remove-btn" onClick={() => removeFromArray('responsibilities', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('responsibilities', '')}>
              + Add Responsibility
            </button>
          </div>
        ) : (
          responsibilities.length > 0 ? (
            <ul className="criteria-list">
              {responsibilities.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <p className="empty-message">No responsibilities defined</p>
          )
        )}
      </CollapsibleSection>

      {/* Interfaces */}
      <CollapsibleSection title="Interfaces" count={interfaces.length} sectionId="sys-component-interfaces">
        {interfaces.length > 0 ? (
          <div className="interfaces-list">
            {interfaces.map((iface: any, i: number) => (
              <div key={i} style={{ marginBottom: '8px', padding: '8px', borderRadius: '4px', background: 'var(--vscode-editor-background)' }}>
                <strong>{iface.name || `Interface ${i + 1}`}</strong>
                {iface.type && <span className="tag" style={{ marginLeft: '8px' }}>{iface.type}</span>}
                {iface.description && <div style={{ marginTop: '4px', opacity: 0.8 }}>{iface.description}</div>}
                {iface.protocol && <div style={{ marginTop: '2px' }}>Protocol: {iface.protocol}</div>}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No interfaces defined</p>
        )}
      </CollapsibleSection>

      {/* Technology Stack */}
      <CollapsibleSection title="Technology" count={technology.length} sectionId="sys-component-technology">
        <div className="tags-list">
          {technology.length > 0 ? technology.map((t: string, i: number) => (
            <span key={i} className="tag">{t}</span>
          )) : <span className="empty-message">No technologies specified</span>}
        </div>
      </CollapsibleSection>

      {/* Dependencies */}
      <CollapsibleSection title="Dependencies" count={componentDependencies.length} sectionId="sys-component-dependencies">
        <div className="tags-list">
          {componentDependencies.length > 0 ? componentDependencies.map((d: string, i: number) => (
            <span key={i} className="tag">{d}</span>
          )) : <span className="empty-message">No dependencies</span>}
        </div>
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// TASK DETAILS
// ==========================================================================

export function renderTaskDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  // Normalize subtasks: sample data may have plain strings instead of objects
  const subtasks: any[] = (editedData.subtasks || []).map((st: any) =>
    typeof st === 'string' ? { description: st } : st
  );

  return (
    <>
      {/* AC Reference & Status Row */}
      <div className="detail-row">
        <section className="detail-section inline">
          <h4>AC Reference</h4>
          {editMode ? (
            <input
              type="text"
              value={editedData.acReference || ''}
              onChange={(e) => handleFieldChange('acReference', e.target.value)}
              placeholder="Acceptance criteria reference..."
              className="full-width-input"
            />
          ) : (
            editedData.acReference ? (
              <span>{editedData.acReference}</span>
            ) : <span className="empty-message">None</span>
          )}
        </section>

        <section className="detail-section inline">
          <h4>Estimated Hours</h4>
          {editMode ? (
            <input
              type="number"
              value={editedData.estimatedHours ?? ''}
              onChange={(e) => handleFieldChange('estimatedHours', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Hours"
              min="0"
              step="0.5"
              style={{ width: '80px' }}
            />
          ) : (
            editedData.estimatedHours != null ? (
              <span>{editedData.estimatedHours}h</span>
            ) : <span className="empty-message">Not estimated</span>
          )}
        </section>

        <section className="detail-section inline">
          <h4>Status</h4>
          <span className={`status-badge status-${editedData.completed ? 'complete' : 'draft'}`}>
            {editedData.completed ? 'Complete' : 'Pending'}
          </span>
        </section>
      </div>

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="task-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={4}
            placeholder="Task description..."
          />
        ) : (
          editedData.description ? <Md text={editedData.description} /> : <p className="empty-message">No description</p>
        )}
      </CollapsibleSection>

      {/* Subtasks */}
      <CollapsibleSection title="Subtasks" count={subtasks.length} sectionId="task-subtasks">
        {subtasks.length > 0 ? (
          <ul className="criteria-list">
            {subtasks.map((st: any, i: number) => (
              <li key={i} style={{ opacity: st.completed ? 0.6 : 1 }}>
                <span style={{ textDecoration: st.completed ? 'line-through' : 'none' }}>
                  {st.title || st.description || `Subtask ${i + 1}`}
                </span>
                {st.completed && <span className="tag" style={{ marginLeft: '6px', fontSize: '0.75em' }}>Done</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-message">No subtasks</p>
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// RISK DETAILS
// ==========================================================================

export function renderRiskDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray } = props;
  const triggers: string[] = editedData.triggers || [];
  // Support both PRD-inline `contingency` and standalone risks.schema `contingencyPlan`
  const contingencyValue: string = editedData.contingencyPlan || editedData.contingency || '';
  const contingencyField = editedData.contingencyPlan !== undefined ? 'contingencyPlan' : 'contingency';
  const mitigationStrategies: any[] = editedData.mitigationStrategies || [];
  const relatedRequirements: string[] = editedData.relatedRequirements || [];

  return (
    <>
      {/* Category, Probability, Impact, Score Row */}
      <div className="detail-row">
        <section className="detail-section inline">
          <h4>Category</h4>
          {editMode ? (
            <select
              value={editedData.category || ''}
              onChange={(e) => handleFieldChange('category', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {['technical', 'operational', 'security', 'compliance', 'resource', 'schedule', 'integration', 'performance', 'data'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            editedData.category ? (
              <span className="tag">{editedData.category}</span>
            ) : <span className="empty-message">Not categorized</span>
          )}
        </section>

        <section className="detail-section inline">
          <h4>Probability</h4>
          {editMode ? (
            <select
              value={editedData.probability || ''}
              onChange={(e) => handleFieldChange('probability', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {['low', 'medium', 'high', 'very-high'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            editedData.probability ? (
              <span className={`tag risk-${editedData.probability}`}>{editedData.probability}</span>
            ) : <span className="empty-message">Not set</span>
          )}
        </section>

        <section className="detail-section inline">
          <h4>Impact</h4>
          {editMode ? (
            <select
              value={editedData.impact || ''}
              onChange={(e) => handleFieldChange('impact', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {['low', 'medium', 'high', 'critical'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            editedData.impact ? (
              <span className={`tag risk-${editedData.impact}`}>{editedData.impact}</span>
            ) : <span className="empty-message">Not set</span>
          )}
        </section>

        <section className="detail-section inline">
          <h4>Risk Score</h4>
          {editMode ? (
            <select
              value={editedData.riskScore || ''}
              onChange={(e) => handleFieldChange('riskScore', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {['low', 'medium', 'high', 'critical'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            editedData.riskScore ? (
              <span className={`tag risk-${editedData.riskScore}`}>{editedData.riskScore}</span>
            ) : <span className="empty-message">N/A</span>
          )}
        </section>
      </div>

      {/* Risk Status + Residual Risk + Owner Row */}
      <div className="detail-row">
        <section className="detail-section inline">
          <h4>Risk Status</h4>
          {editMode ? (
            <select
              value={editedData.riskStatus || editedData.status || ''}
              onChange={(e) => handleFieldChange('riskStatus', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {['identified', 'analyzing', 'mitigating', 'monitoring', 'accepted', 'closed', 'occurred'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            (editedData.riskStatus || editedData.status) ? (
              <span className={`status-badge status-${editedData.riskStatus || editedData.status}`}>
                {editedData.riskStatus || editedData.status}
              </span>
            ) : <span className="empty-message">Not set</span>
          )}
        </section>

        <section className="detail-section inline">
          <h4>Residual Risk</h4>
          {editMode ? (
            <select
              value={editedData.residualRisk || ''}
              onChange={(e) => handleFieldChange('residualRisk', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {['none', 'low', 'medium', 'high'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          ) : (
            editedData.residualRisk ? (
              <span className={`tag risk-${editedData.residualRisk}`}>{editedData.residualRisk}</span>
            ) : <span className="empty-message">Not assessed</span>
          )}
        </section>

        <section className="detail-section inline">
          <h4>Owner</h4>
          {editMode ? (
            <input
              type="text"
              value={editedData.owner || ''}
              onChange={(e) => handleFieldChange('owner', e.target.value)}
              placeholder="Risk owner"
              className="full-width-input"
            />
          ) : (
            editedData.owner ? (
              <span>{editedData.owner}</span>
            ) : <span className="empty-message">Not assigned</span>
          )}
        </section>
      </div>

      {/* Description / Impact Description */}
      <CollapsibleSection title="Description" sectionId="risk-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={3}
            placeholder="Risk description..."
          />
        ) : (
          editedData.description ? <Md text={editedData.description} /> : <p className="empty-message">No description</p>
        )}
      </CollapsibleSection>

      {(editMode || editedData.impactDescription) && (
        <CollapsibleSection title="Impact Description" sectionId="risk-impact-desc">
          {editMode ? (
            <textarea
              value={editedData.impactDescription || ''}
              onChange={(e) => handleFieldChange('impactDescription', e.target.value)}
              rows={3}
              placeholder="Detailed description of the impact..."
            />
          ) : (
            <Md text={editedData.impactDescription} />
          )}
        </CollapsibleSection>
      )}

      {/* Primary Mitigation */}
      <CollapsibleSection title="Mitigation Strategy" sectionId="risk-mitigation">
        {editMode ? (
          <textarea
            value={editedData.mitigation || ''}
            onChange={(e) => handleFieldChange('mitigation', e.target.value)}
            rows={3}
            placeholder="How to mitigate this risk..."
          />
        ) : (
          editedData.mitigation ? <Md text={editedData.mitigation} /> : <p className="empty-message">No mitigation strategy</p>
        )}
      </CollapsibleSection>

      {/* Mitigation Strategies (array from risks.schema) */}
      {(editMode || mitigationStrategies.length > 0) && (
        <CollapsibleSection title="Mitigation Strategies" count={mitigationStrategies.length} sectionId="risk-mitigation-strategies">
          {editMode ? (
            <div className="editable-list">
              {mitigationStrategies.map((ms: any, i: number) => (
                <div key={i} className="editable-list-item" style={{ flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                  <input
                    type="text"
                    value={ms.strategy || ''}
                    onChange={(e) => {
                      const updated = [...mitigationStrategies];
                      updated[i] = { ...updated[i], strategy: e.target.value };
                      handleFieldChange('mitigationStrategies', updated);
                    }}
                    placeholder="Strategy..."
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      type="text"
                      value={ms.owner || ''}
                      onChange={(e) => {
                        const updated = [...mitigationStrategies];
                        updated[i] = { ...updated[i], owner: e.target.value };
                        handleFieldChange('mitigationStrategies', updated);
                      }}
                      placeholder="Owner..."
                      style={{ flex: 1 }}
                    />
                    <select
                      value={ms.status || ''}
                      onChange={(e) => {
                        const updated = [...mitigationStrategies];
                        updated[i] = { ...updated[i], status: e.target.value };
                        handleFieldChange('mitigationStrategies', updated);
                      }}
                      className="status-select"
                    >
                      <option value="">Status...</option>
                      {['planned', 'in-progress', 'implemented', 'verified'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button className="remove-btn" onClick={() => {
                      const updated = mitigationStrategies.filter((_: any, idx: number) => idx !== i);
                      handleFieldChange('mitigationStrategies', updated);
                    }}>×</button>
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() =>
                handleFieldChange('mitigationStrategies', [...mitigationStrategies, { strategy: '', owner: '', status: 'planned' }])
              }>
                + Add Mitigation Strategy
              </button>
            </div>
          ) : (
            <div className="structured-list">
              {mitigationStrategies.map((ms: any, i: number) => (
                <div key={i} className="structured-list-item">
                  <Md text={ms.strategy || 'No strategy description'} />
                  <div className="tags-list" style={{ marginTop: '4px' }}>
                    {ms.owner && <span className="tag">Owner: {ms.owner}</span>}
                    {ms.status && <span className={`status-badge status-${ms.status}`}>{ms.status}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Contingency Plan */}
      <CollapsibleSection title="Contingency Plan" sectionId="risk-contingency">
        {editMode ? (
          <textarea
            value={contingencyValue}
            onChange={(e) => handleFieldChange(contingencyField, e.target.value)}
            rows={3}
            placeholder="Contingency plan if risk materializes..."
          />
        ) : (
          contingencyValue ? <Md text={contingencyValue} /> : <p className="empty-message">No contingency plan</p>
        )}
      </CollapsibleSection>

      {/* Triggers */}
      <CollapsibleSection title="Triggers" count={triggers.length} sectionId="risk-triggers">
        {editMode ? (
          <div className="editable-list">
            {triggers.map((t: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input
                  type="text"
                  value={t}
                  onChange={(e) => updateArrayItem('triggers', i, e.target.value)}
                  placeholder="Trigger condition..."
                />
                <button className="remove-btn" onClick={() => removeFromArray('triggers', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('triggers', '')}>
              + Add Trigger
            </button>
          </div>
        ) : (
          triggers.length > 0 ? (
            <ul className="criteria-list">
              {triggers.map((t: string, i: number) => <li key={i}>{t}</li>)}
            </ul>
          ) : (
            <p className="empty-message">No triggers defined</p>
          )
        )}
      </CollapsibleSection>

      {/* Related Requirements */}
      {(editMode || relatedRequirements.length > 0) && (
        <CollapsibleSection title="Related Requirements" count={relatedRequirements.length} sectionId="risk-related-reqs">
          {editMode ? (
            <div className="editable-list">
              {relatedRequirements.map((r: string, i: number) => (
                <div key={i} className="editable-list-item">
                  <input
                    type="text"
                    value={r}
                    onChange={(e) => updateArrayItem('relatedRequirements', i, e.target.value)}
                    placeholder="Requirement ID..."
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('relatedRequirements', i)}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('relatedRequirements', '')}>
                + Add Requirement
              </button>
            </div>
          ) : (
            <div className="tags-list">
              {relatedRequirements.map((r: string, i: number) => (
                <span key={i} className="tag">{r}</span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Notes */}
      {(editMode || editedData.notes) && (
        <CollapsibleSection title="Notes" sectionId="risk-notes">
          {editMode ? (
            <textarea
              value={editedData.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              rows={3}
              placeholder="Additional notes..."
            />
          ) : (
            <Md text={editedData.notes} />
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// NFR (NON-FUNCTIONAL REQUIREMENT) DETAILS
// ==========================================================================

export function renderNFRDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  // Schema defines metrics as object {target, threshold, unit} — NOT string[]
  const metrics: { target?: string; threshold?: string; unit?: string } =
    (editedData.metrics && typeof editedData.metrics === 'object' && !Array.isArray(editedData.metrics))
      ? editedData.metrics
      : {};

  return (
    <>
      {/* Category */}
      <div className="detail-row">
        <section className="detail-section inline">
          <h4>Category</h4>
          {editMode ? (
            <select
              value={editedData.category || ''}
              onChange={(e) => handleFieldChange('category', e.target.value)}
              className="status-select"
            >
              <option value="">Not set</option>
              {['performance', 'scalability', 'reliability', 'availability', 'security', 'usability', 'maintainability', 'portability', 'compliance'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            editedData.category ? (
              <span className="tag">{editedData.category}</span>
            ) : <span className="empty-message">Not categorized</span>
          )}
        </section>
      </div>

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="nfr-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={4}
            placeholder="Non-functional requirement description..."
          />
        ) : (
          editedData.description ? <Md text={editedData.description} /> : <p className="empty-message">No description</p>
        )}
      </CollapsibleSection>

      {/* Metrics — object with target, threshold, unit */}
      <CollapsibleSection title="Metrics" sectionId="nfr-metrics">
        {editMode ? (
          <div className="structured-form">
            <div className="form-row">
              <label>Target</label>
              <input
                type="text"
                value={metrics.target || ''}
                onChange={(e) => handleFieldChange('metrics', { ...metrics, target: e.target.value })}
                placeholder="e.g., < 200ms, > 99.9%"
              />
            </div>
            <div className="form-row">
              <label>Threshold</label>
              <input
                type="text"
                value={metrics.threshold || ''}
                onChange={(e) => handleFieldChange('metrics', { ...metrics, threshold: e.target.value })}
                placeholder="Minimum acceptable value, e.g., < 500ms"
              />
            </div>
            <div className="form-row">
              <label>Unit</label>
              <input
                type="text"
                value={metrics.unit || ''}
                onChange={(e) => handleFieldChange('metrics', { ...metrics, unit: e.target.value })}
                placeholder="e.g., ms, %, seconds, requests/sec"
              />
            </div>
          </div>
        ) : (
          (metrics.target || metrics.threshold || metrics.unit) ? (
            <div className="detail-grid">
              {metrics.target && (
                <div className="detail-grid-item">
                  <span className="detail-grid-label">Target</span>
                  <span className="detail-grid-value">{metrics.target}</span>
                </div>
              )}
              {metrics.threshold && (
                <div className="detail-grid-item">
                  <span className="detail-grid-label">Threshold</span>
                  <span className="detail-grid-value">{metrics.threshold}</span>
                </div>
              )}
              {metrics.unit && (
                <div className="detail-grid-item">
                  <span className="detail-grid-label">Unit</span>
                  <span className="detail-grid-value">{metrics.unit}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="empty-message">No metrics defined</p>
          )
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// ADDITIONAL REQUIREMENT DETAILS
// ==========================================================================

export function renderAdditionalReqDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;

  return (
    <>
      {/* Category */}
      <div className="detail-row">
        <section className="detail-section inline">
          <h4>Category</h4>
          {editMode ? (
            <input
              type="text"
              value={editedData.category || ''}
              onChange={(e) => handleFieldChange('category', e.target.value)}
              placeholder="Requirement category"
              className="full-width-input"
            />
          ) : (
            editedData.category ? (
              <span className="tag">{editedData.category}</span>
            ) : <span className="empty-message">Not categorized</span>
          )}
        </section>
      </div>

      {/* Description */}
      <CollapsibleSection title="Description" sectionId="additional-req-description">
        {editMode ? (
          <textarea
            value={editedData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            rows={4}
            placeholder="Requirement description..."
          />
        ) : (
          editedData.description ? <Md text={editedData.description} /> : <p className="empty-message">No description</p>
        )}
      </CollapsibleSection>
    </>
  );
}

// ==========================================================================
// USE CASE DETAILS
// ==========================================================================

export function renderUseCaseDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray, allArtifacts } = props;

  const scenario = editedData.scenario || {};
  const preconditions: string[] = editedData.preconditions || [];
  const postconditions: string[] = editedData.postconditions || [];
  const alternativeFlows: { id?: string; name?: string; branchPoint?: string; steps?: string[] }[] = (editedData.alternativeFlows || []).map((f: any) =>
    typeof f === 'string' ? { name: f } : f
  );
  // Normalize mainFlow: sample data may have plain strings instead of {step, action} objects
  const mainFlow: any[] = (editedData.mainFlow || []).map((item: any, i: number) =>
    typeof item === 'string' ? { step: i + 1, action: item } : item
  );

  return (
    <>
      {/* Priority & Actor Row */}
      <div className="detail-row">
        {renderPriorityField(editedData.priority, (v) => handleFieldChange('priority', v), editMode)}

        <section className="detail-section inline">
          <h4>Primary Actor</h4>
          {editMode ? (
            <input
              type="text"
              value={editedData.primaryActor || ''}
              onChange={(e) => handleFieldChange('primaryActor', e.target.value)}
              placeholder="Primary actor"
              className="person-input"
            />
          ) : (
            <span className="person-badge">{editedData.primaryActor || 'Not specified'}</span>
          )}
        </section>
      </div>

      {/* Secondary Actors */}
      {(() => {
        const secondaryActors: string[] = editedData.secondaryActors || [];
        return (editMode || secondaryActors.length > 0) ? (
          <CollapsibleSection title="Secondary Actors" count={secondaryActors.length} sectionId="usecase-secondary-actors">
            {editMode ? (
              <div className="editable-list">
                {secondaryActors.map((actor: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={actor}
                      onChange={(e) => updateArrayItem('secondaryActors', i, e.target.value)}
                      placeholder="Actor name or role"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('secondaryActors', i)}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => addToArray('secondaryActors', '')}>+ Add Actor</button>
              </div>
            ) : (
              <div className="tags-list">
                {secondaryActors.map((actor: string, i: number) => (
                  <span key={i} className="person-badge">{actor}</span>
                ))}
              </div>
            )}
          </CollapsibleSection>
        ) : null;
      })()}

      {/* Summary */}
      <CollapsibleSection title="Summary" sectionId="usecase-summary">
        {editMode ? (
          <textarea
            value={editedData.summary || editedData.description || ''}
            onChange={(e) => {
              handleFieldChange('summary', e.target.value);
              handleFieldChange('description', e.target.value);
            }}
            rows={3}
            placeholder="Brief summary of this use case..."
          />
        ) : (
          (editedData.summary || editedData.description) ? <Md text={editedData.summary || editedData.description} /> : <p className="empty-message">No summary defined</p>
        )}
      </CollapsibleSection>

      {/* Trigger */}
      <CollapsibleSection title="Trigger" sectionId="usecase-trigger">
        {editMode ? (
          <input
            type="text"
            value={editedData.trigger || ''}
            onChange={(e) => handleFieldChange('trigger', e.target.value)}
            placeholder="What initiates this use case?"
            className="full-width-input"
          />
        ) : (
          editedData.trigger ? <Md text={editedData.trigger} /> : <p className="empty-message">No trigger defined</p>
        )}
      </CollapsibleSection>

      {/* Main Flow */}
      {(() => {
        return (
          <CollapsibleSection title="Main Flow" count={mainFlow.length} sectionId="usecase-main-flow">
            {editMode ? (
              <div className="editable-list">
                {mainFlow.map((item: any, i: number) => (
                  <div key={i} className="editable-list-item">
                    <span className="step-number">{i + 1}.</span>
                    <input
                      type="text"
                      value={item.action || ''}
                      onChange={(e) => updateArrayItem('mainFlow', i, { ...item, step: i + 1, action: e.target.value })}
                      placeholder="Action step..."
                      style={{ flex: 2 }}
                    />
                    <input
                      type="text"
                      value={item.actor || ''}
                      onChange={(e) => updateArrayItem('mainFlow', i, { ...item, step: i + 1, actor: e.target.value || undefined })}
                      placeholder="Actor"
                      style={{ width: '100px' }}
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('mainFlow', i)}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => addToArray('mainFlow', { step: (mainFlow.length + 1), action: '' })}>
                  + Add Step
                </button>
              </div>
            ) : (
              mainFlow.length > 0 ? (
                <ol className="main-flow-list">
                  {mainFlow.map((item: any, i: number) => (
                    <li key={i}>
                      {typeof item === 'string' ? item : (item.action || JSON.stringify(item))}
                      {item.actor && <span className="flow-actor"> ({item.actor})</span>}
                    </li>
                  ))}
                </ol>
              ) : <p className="empty-message">No main flow defined</p>
            )}
          </CollapsibleSection>
        );
      })()}

      {/* Preconditions */}
      <CollapsibleSection title="Preconditions" count={preconditions.length} sectionId="usecase-preconditions">
        {editMode ? (
          <div className="editable-list">
            {preconditions.map((item: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => updateArrayItem('preconditions', i, e.target.value)}
                  placeholder="Precondition..."
                />
                <button className="remove-btn" onClick={() => removeFromArray('preconditions', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('preconditions', '')}>
              + Add Precondition
            </button>
          </div>
        ) : (
          preconditions.length > 0
            ? <ul>{preconditions.map((p, i) => <li key={i}>{p}</li>)}</ul>
            : <p className="empty-message">No preconditions defined</p>
        )}
      </CollapsibleSection>

      {/* Postconditions */}
      <CollapsibleSection title="Postconditions" count={postconditions.length} sectionId="usecase-postconditions">
        {editMode ? (
          <div className="editable-list">
            {postconditions.map((item: string, i: number) => (
              <div key={i} className="editable-list-item">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => updateArrayItem('postconditions', i, e.target.value)}
                  placeholder="Postcondition..."
                />
                <button className="remove-btn" onClick={() => removeFromArray('postconditions', i)}>×</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('postconditions', '')}>
              + Add Postcondition
            </button>
          </div>
        ) : (
          postconditions.length > 0
            ? <ul>{postconditions.map((p, i) => <li key={i}>{p}</li>)}</ul>
            : <p className="empty-message">No postconditions defined</p>
        )}
      </CollapsibleSection>

      {/* Scenario */}
      <CollapsibleSection title="Scenario" sectionId="usecase-scenario">
        {editMode ? (
          <div className="scenario-edit">
            <label>
              <span className="field-label">Context</span>
              <input
                type="text"
                value={scenario.context || ''}
                onChange={(e) => handleFieldChange('scenario', { ...scenario, context: e.target.value })}
                placeholder="When/where does this occur?"
              />
            </label>
            <label>
              <span className="field-label">Before</span>
              <input
                type="text"
                value={scenario.before || ''}
                onChange={(e) => handleFieldChange('scenario', { ...scenario, before: e.target.value })}
                placeholder="Current state"
              />
            </label>
            <label>
              <span className="field-label">After</span>
              <input
                type="text"
                value={scenario.after || ''}
                onChange={(e) => handleFieldChange('scenario', { ...scenario, after: e.target.value })}
                placeholder="Desired outcome"
              />
            </label>
            <label>
              <span className="field-label">Impact</span>
              <input
                type="text"
                value={scenario.impact || ''}
                onChange={(e) => handleFieldChange('scenario', { ...scenario, impact: e.target.value })}
                placeholder="Business value"
              />
            </label>
          </div>
        ) : (
          <div className="scenario-display">
            <p><strong>Context:</strong> {scenario.context || <span className="empty-value">Not specified</span>}</p>
            <p><strong>Before:</strong> {scenario.before || <span className="empty-value">Not specified</span>}</p>
            <p><strong>After:</strong> {scenario.after || <span className="empty-value">Not specified</span>}</p>
            <p><strong>Impact:</strong> {scenario.impact || <span className="empty-value">Not specified</span>}</p>
          </div>
        )}
      </CollapsibleSection>

      {/* Alternative Flows */}
      <CollapsibleSection title="Alternative Flows" count={alternativeFlows.length} sectionId="usecase-alternative-flows">
        {editMode ? (
          <div className="exception-flow-edit">
            {alternativeFlows.map((af: { id?: string; name?: string; branchPoint?: string; steps?: string[] }, i: number) => (
              <div key={i} className="editable-item-header" style={{ flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={af.name || ''}
                  onChange={(e) => updateArrayItem('alternativeFlows', i, { ...af, name: e.target.value })}
                  placeholder="Flow name"
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  value={af.id || ''}
                  onChange={(e) => updateArrayItem('alternativeFlows', i, { ...af, id: e.target.value })}
                  placeholder="ID"
                  style={{ width: '80px' }}
                />
                <button className="remove-btn" onClick={() => removeFromArray('alternativeFlows', i)}>×</button>
                <input
                  type="text"
                  value={af.branchPoint || ''}
                  onChange={(e) => updateArrayItem('alternativeFlows', i, { ...af, branchPoint: e.target.value })}
                  placeholder="Branch point (e.g. after step 3)"
                  style={{ width: '100%' }}
                />
                <div style={{ width: '100%' }}>
                  <label className="field-label" style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '4px' }}>Steps</label>
                  {(af.steps || []).map((step: string, si: number) => (
                    <div key={si} className="editable-list-item" style={{ marginBottom: '2px' }}>
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => {
                          const newSteps = [...(af.steps || [])];
                          newSteps[si] = e.target.value;
                          updateArrayItem('alternativeFlows', i, { ...af, steps: newSteps });
                        }}
                        placeholder={`Step ${si + 1}`}
                      />
                      <button className="remove-btn" onClick={() => {
                        const newSteps = [...(af.steps || [])];
                        newSteps.splice(si, 1);
                        updateArrayItem('alternativeFlows', i, { ...af, steps: newSteps });
                      }}>×</button>
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary btn-small"
                    style={{ marginTop: '4px' }}
                    onClick={() => updateArrayItem('alternativeFlows', i, { ...af, steps: [...(af.steps || []), ''] })}
                  >+ Add Step</button>
                </div>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('alternativeFlows', { id: '', name: '', branchPoint: '', steps: [] })}>
              + Add Alternative Flow
            </button>
          </div>
        ) : (
          alternativeFlows.length > 0
            ? <ul>{alternativeFlows.map((af, i) => (
                <li key={i}>
                  <strong>{af.name || af.id || `Alt Flow ${i + 1}`}</strong>
                  {af.branchPoint && <span> (branches at: {af.branchPoint})</span>}
                  {af.steps && af.steps.length > 0 && (
                    <ol style={{ marginTop: '4px' }}>
                      {af.steps.map((step, si) => <li key={si}>{step}</li>)}
                    </ol>
                  )}
                </li>
              ))}</ul>
            : <p className="empty-message">No alternative flows defined</p>
        )}
      </CollapsibleSection>

      {/* Exception Flows */}
      {(() => {
        const exceptionFlows: { id?: string; name?: string; trigger?: string; handling?: string }[] = editedData.exceptionFlows || [];
        return (editMode || exceptionFlows.length > 0) ? (
          <CollapsibleSection title="Exception Flows" count={exceptionFlows.length} sectionId="usecase-exception-flows">
            {editMode ? (
              <div className="exception-flow-edit">
                {exceptionFlows.map((ef: { id?: string; name?: string; trigger?: string; handling?: string }, i: number) => (
                  <div key={i} className="editable-item-header" style={{ flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={ef.name || ''}
                      onChange={(e) => updateArrayItem('exceptionFlows', i, { ...ef, name: e.target.value })}
                      placeholder="Exception name"
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      value={ef.id || ''}
                      onChange={(e) => updateArrayItem('exceptionFlows', i, { ...ef, id: e.target.value })}
                      placeholder="ID"
                      style={{ width: '80px' }}
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('exceptionFlows', i)}>×</button>
                    <input
                      type="text"
                      value={ef.trigger || ''}
                      onChange={(e) => updateArrayItem('exceptionFlows', i, { ...ef, trigger: e.target.value })}
                      placeholder="Trigger condition"
                      style={{ width: '100%' }}
                    />
                    <textarea
                      value={ef.handling || ''}
                      onChange={(e) => updateArrayItem('exceptionFlows', i, { ...ef, handling: e.target.value })}
                      rows={2}
                      placeholder="How to handle this exception..."
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => addToArray('exceptionFlows', { id: '', name: '', trigger: '', handling: '' })}>+ Add Exception Flow</button>
              </div>
            ) : (
              <ul>
                {exceptionFlows.map((ef: { id?: string; name?: string; trigger?: string; handling?: string }, i: number) => (
                  <li key={i}>
                    <strong>{ef.name || ef.id || `Exception ${i + 1}`}</strong>
                    {ef.trigger && <span>: Trigger: {ef.trigger}</span>}
                    {ef.handling && <Md text={ef.handling} />}
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        ) : null;
      })()}

      {/* Business Rules */}
      {(() => {
        const businessRules: string[] = editedData.businessRules || [];
        return (
          <CollapsibleSection title="Business Rules" count={businessRules.length} sectionId="usecase-business-rules">
            {editMode ? (
              <div className="editable-list">
                {businessRules.map((rule: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={rule}
                      onChange={(e) => updateArrayItem('businessRules', i, e.target.value)}
                      placeholder="Business rule..."
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('businessRules', i)}>×</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => addToArray('businessRules', '')}>
                  + Add Rule
                </button>
              </div>
            ) : (
              businessRules.length > 0
                ? <ul>{businessRules.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                : <p className="empty-message">No business rules defined</p>
            )}
          </CollapsibleSection>
        );
      })()}

      {/* Notes */}
      <CollapsibleSection title="Notes" sectionId="usecase-notes">
        {editMode ? (
          <textarea
            value={editedData.notes || ''}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            rows={3}
            placeholder="Additional notes..."
          />
        ) : (
          editedData.notes
            ? <Md text={editedData.notes} />
            : <p className="empty-message">No notes defined</p>
        )}
      </CollapsibleSection>

      {/* Source Document */}
      {(editMode || editedData.sourceDocument) && (
        <section className="detail-section">
          <h4>Source Document</h4>
          {editMode ? (
            <input
              type="text"
              value={editedData.sourceDocument || ''}
              onChange={(e) => handleFieldChange('sourceDocument', e.target.value)}
              placeholder="Reference to source document..."
              className="full-width-input"
            />
          ) : (
            <span>{editedData.sourceDocument}</span>
          )}
        </section>
      )}

      {/* Related Links */}
      {(() => {
        const relatedRequirements: string[] = editedData.relatedRequirements || [];
        const relatedEpic: string = editedData.relatedEpic || '';
        const relatedStories: string[] = editedData.relatedStories || [];
        const hasLinks = relatedRequirements.length > 0 || relatedEpic || relatedStories.length > 0;
        return (editMode || hasLinks) ? (
          <CollapsibleSection title="Related Links" sectionId="usecase-related-links">
            {editMode ? (
              <div className="related-links-edit">
                <div>
                  <span className="field-label">Related Epic</span>
                  <ArtifactPicker
                    artifacts={allArtifacts}
                    artifactType="epic"
                    selectedIds={relatedEpic ? [relatedEpic] : []}
                    onChange={(ids) => handleFieldChange('relatedEpic', ids[0] || '')}
                    mode="single"
                    placeholder="Search epics..."
                  />
                </div>
                <div>
                  <span className="field-label">Related Requirements</span>
                  <ArtifactPicker
                    artifacts={allArtifacts}
                    artifactType="requirement"
                    selectedIds={relatedRequirements}
                    onChange={(ids) => handleFieldChange('relatedRequirements', ids)}
                    placeholder="Search requirements..."
                  />
                </div>
                <div>
                  <span className="field-label">Related Stories</span>
                  <ArtifactPicker
                    artifacts={allArtifacts}
                    artifactType="story"
                    selectedIds={relatedStories}
                    onChange={(ids) => handleFieldChange('relatedStories', ids)}
                    placeholder="Search stories..."
                  />
                </div>
              </div>
            ) : (
              <>
                {relatedEpic && <p><strong>Epic:</strong> <span className="tag epic-tag">{relatedEpic}</span></p>}
                {relatedRequirements.length > 0 && (
                  <p><strong>Requirements:</strong> {relatedRequirements.map((r, i) => <span key={i} className="tag requirement-tag">{r}</span>)}</p>
                )}
                {relatedStories.length > 0 && (
                  <p><strong>Stories:</strong> {relatedStories.map((s, i) => <span key={i} className="tag story-tag">{s}</span>)}</p>
                )}
              </>
            )}
          </CollapsibleSection>
        ) : null;
      })()}
    </>
  );
}

// ==========================================================================
// PRD DETAILS
// ==========================================================================

export function renderPRDDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray } = props;

  const productOverview = editedData.productOverview || {};

  // --- Normalize projectType: sample may be a plain string like "greenfield-saas" ---
  const rawProjectType = editedData.projectType;
  const projectType = typeof rawProjectType === 'string'
    ? { type: rawProjectType, complexity: undefined, characteristics: [] as string[] }
    : (rawProjectType || {});

  // --- Normalize userPersonas: sample uses "frustrations" instead of "painPoints" ---
  const userPersonas = (editedData.userPersonas || []).map((p: any) => ({
    ...p,
    painPoints: p.painPoints || p.frustrations || [],
  }));

  // --- Normalize successCriteria: sample has plain strings, renderer expects objects ---
  const rawSuccessCriteria = editedData.successCriteria || [];
  const successCriteria = rawSuccessCriteria.map((sc: any) =>
    typeof sc === 'string' ? { criterion: sc } : sc
  );

  // --- Normalize userJourneys: sample steps are plain strings, renderer expects {action, ...} ---
  const rawJourneys = editedData.userJourneys || [];
  const userJourneys = rawJourneys.map((j: any) => ({
    ...j,
    steps: (j.steps || []).map((step: any) =>
      typeof step === 'string' ? { action: step } : step
    ),
  }));

  // --- Normalize domainModel: sample has {entities[], relationships: string} ---
  const rawDomainModel = editedData.domainModel || {};
  const domainModel = (() => {
    const dm: any = { ...rawDomainModel };
    // If sample has entities array but no coreConcepts, build overview from entities+relationships
    if (dm.entities && !dm.overview && !dm.coreConcepts) {
      const parts: string[] = [];
      if (Array.isArray(dm.entities) && dm.entities.length > 0) {
        parts.push(`**Entities:** ${dm.entities.join(', ')}`);
      }
      if (typeof dm.relationships === 'string' && dm.relationships) {
        parts.push(`**Relationships:** ${dm.relationships}`);
      }
      dm.overview = parts.join('\n\n');
    }
    return dm;
  })();

  const requirements = editedData.requirements || {};
  const scope = editedData.scope || {};
  const risks = editedData.risks || [];

  // --- Normalize constraints: sample has plain strings, renderer expects objects ---
  const rawConstraints = editedData.constraints || [];
  const constraints = rawConstraints.map((c: any) =>
    typeof c === 'string' ? { description: c } : c
  );

  // --- Normalize timeline: sample has {startDate, milestones[{name,date}]}, renderer expects {overview, phases[]} ---
  const rawTimeline = editedData.timeline || {};
  const timeline = (() => {
    const tl: any = { ...rawTimeline };
    // If sample has milestones at top level but no phases, convert
    if (tl.milestones && !tl.phases) {
      const startPart = tl.startDate ? `**Start Date:** ${tl.startDate}` : '';
      tl.overview = startPart || tl.overview || '';
      tl.phases = [{
        name: 'Project Timeline',
        milestones: tl.milestones.map((ms: any) => ({
          name: ms.name || ms.milestone || '',
          date: ms.date || ms.targetDate || '',
          deliverables: ms.deliverables || [],
        })),
      }];
    }
    return tl;
  })();

  // --- Normalize appendices: sample has {title, reference}, renderer expects {title, content} ---
  const rawAppendices = editedData.appendices || [];
  const appendices = rawAppendices.map((a: any) => ({
    ...a,
    content: a.content || (a.reference ? `Reference: ${a.reference}` : ''),
  }));

  // --- Normalize approvals: sample has {approver, notes}, renderer expects {role, name, comments} ---
  const rawApprovals = editedData.approvals || [];
  const approvals = rawApprovals.map((a: any) => ({
    ...a,
    role: a.role || '',
    name: a.name || a.approver || '',
    comments: a.comments || a.notes || '',
  }));

  return (
    <>
      {/* Product Overview */}
      <CollapsibleSection title="Product Overview" sectionId="prd-product-overview">
        {editMode ? (
          <div className="product-overview-edit">
            <label>
              <span className="field-label">Product Name</span>
              <input
                type="text"
                value={productOverview.productName || ''}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, productName: e.target.value })}
                placeholder="Product name"
              />
            </label>
            <label>
              <span className="field-label">Version</span>
              <input
                type="text"
                value={productOverview.version || ''}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, version: e.target.value })}
                placeholder="PRD version"
              />
            </label>
            <label>
              <span className="field-label">Purpose</span>
              <textarea
                value={productOverview.purpose || ''}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, purpose: e.target.value })}
                rows={2}
                placeholder="Why this product exists"
              />
            </label>
            <label>
              <span className="field-label">Product Vision</span>
              <textarea
                value={productOverview.productVision || ''}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, productVision: e.target.value })}
                rows={2}
                placeholder="Product vision statement"
              />
            </label>
            <label>
              <span className="field-label">Target Audience</span>
              <input
                type="text"
                value={productOverview.targetAudience || ''}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, targetAudience: e.target.value })}
                placeholder="Who is this for"
              />
            </label>
            <label>
              <span className="field-label">Problem Statement</span>
              <textarea
                value={productOverview.problemStatement || ''}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, problemStatement: e.target.value })}
                rows={2}
                placeholder="Problem being solved"
              />
            </label>
            <label>
              <span className="field-label">Proposed Solution</span>
              <textarea
                value={productOverview.proposedSolution || ''}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, proposedSolution: e.target.value })}
                rows={2}
                placeholder="Proposed solution description"
              />
            </label>
            <label>
              <span className="field-label">Value Proposition</span>
              <textarea
                value={productOverview.valueProposition || ''}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, valueProposition: e.target.value })}
                rows={2}
                placeholder="Unique value"
              />
            </label>
            <label>
              <span className="field-label">Key Benefits (comma-separated)</span>
              <textarea
                value={Array.isArray(productOverview.keyBenefits) ? productOverview.keyBenefits.join(', ') : (productOverview.keyBenefits || '')}
                onChange={(e) => handleFieldChange('productOverview', { ...productOverview, keyBenefits: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                rows={2}
                placeholder="Benefit 1, Benefit 2, ..."
              />
            </label>
          </div>
        ) : (
          <div className="product-overview-display">
            <p><strong>Name:</strong> {productOverview.productName || <span className="empty-value">Not specified</span>}</p>
            {productOverview.version && <p><strong>Version:</strong> {productOverview.version}</p>}
            {productOverview.purpose && <p><strong>Purpose:</strong> {productOverview.purpose}</p>}
            {productOverview.productVision && <p><strong>Vision:</strong> {productOverview.productVision}</p>}
            {productOverview.targetAudience && <p><strong>Audience:</strong> {productOverview.targetAudience}</p>}
            {productOverview.problemStatement && <p><strong>Problem:</strong> {productOverview.problemStatement}</p>}
            {productOverview.proposedSolution && <p><strong>Proposed Solution:</strong> {productOverview.proposedSolution}</p>}
            {productOverview.valueProposition && <p><strong>Value:</strong> {productOverview.valueProposition}</p>}
            {productOverview.keyBenefits?.length > 0 && (
              <div>
                <strong>Key Benefits:</strong>
                <ul>{productOverview.keyBenefits.map((b: string, i: number) => <li key={i}>{b}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* Project Type */}
      {(editMode || projectType.type || projectType.complexity || projectType.characteristics?.length > 0) && (
        <CollapsibleSection title="Project Type" sectionId="prd-project-type">
          {editMode ? (
            <div className="project-type-edit">
              <label>
                <span className="field-label">Type</span>
                <select
                  value={projectType.type || ''}
                  onChange={(e) => handleFieldChange('projectType', { ...projectType, type: e.target.value })}
                >
                  <option value="">Not set</option>
                  {['greenfield', 'brownfield', 'migration', 'integration', 'prototype', 'refactor'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Complexity</span>
                <select
                  value={projectType.complexity || ''}
                  onChange={(e) => handleFieldChange('projectType', { ...projectType, complexity: e.target.value })}
                >
                  <option value="">Not set</option>
                  {['low', 'medium', 'high', 'very-high'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Domain Complexity</span>
                <input
                  type="text"
                  value={projectType.domainComplexity || ''}
                  onChange={(e) => handleFieldChange('projectType', { ...projectType, domainComplexity: e.target.value })}
                  placeholder="e.g., Complex regulatory domain"
                />
              </label>
              <label>
                <span className="field-label">Technical Complexity</span>
                <input
                  type="text"
                  value={projectType.technicalComplexity || ''}
                  onChange={(e) => handleFieldChange('projectType', { ...projectType, technicalComplexity: e.target.value })}
                  placeholder="e.g., Distributed microservices"
                />
              </label>
              <label>
                <span className="field-label">Integration Complexity</span>
                <input
                  type="text"
                  value={projectType.integrationComplexity || ''}
                  onChange={(e) => handleFieldChange('projectType', { ...projectType, integrationComplexity: e.target.value })}
                  placeholder="e.g., Multiple external APIs"
                />
              </label>
              <label>
                <span className="field-label">Characteristics (comma-separated)</span>
                <input
                  type="text"
                  value={Array.isArray(projectType.characteristics) ? projectType.characteristics.join(', ') : ''}
                  onChange={(e) => handleFieldChange('projectType', { ...projectType, characteristics: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="e.g., SaaS, Multi-tenant, Real-time"
                />
              </label>
            </div>
          ) : (
            <div className="project-type-display">
              {projectType.type && <p><strong>Type:</strong> <span className="tag">{projectType.type}</span></p>}
              {projectType.complexity && <p><strong>Complexity:</strong> <span className={`tag tag-${projectType.complexity}`}>{projectType.complexity}</span></p>}
              {projectType.domainComplexity && <p><strong>Domain Complexity:</strong> {projectType.domainComplexity}</p>}
              {projectType.technicalComplexity && <p><strong>Technical Complexity:</strong> {projectType.technicalComplexity}</p>}
              {projectType.integrationComplexity && <p><strong>Integration Complexity:</strong> {projectType.integrationComplexity}</p>}
              {projectType.characteristics?.length > 0 && (
                <div>
                  <strong>Characteristics:</strong>
                  <div className="tags-row">{projectType.characteristics.map((c: string, i: number) => <span key={i} className="tag">{c}</span>)}</div>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* User Personas */}
      <CollapsibleSection title="User Personas" count={userPersonas.length} sectionId="prd-user-personas">
        {editMode ? (
          <div className="personas-list">
            {userPersonas.map((persona: any, i: number) => (
              <div key={i} className="persona-item persona-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={persona.name || ''}
                    onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, name: e.target.value })}
                    placeholder="Persona name"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('userPersonas', i)}>×</button>
                </div>
                <input
                  type="text"
                  value={persona.role || ''}
                  onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, role: e.target.value })}
                  placeholder="Role (e.g., Product Manager)"
                  className="full-width-input"
                />
                <textarea
                  value={persona.description || ''}
                  onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, description: e.target.value })}
                  rows={2}
                  placeholder="Description of this persona..."
                />
                <input
                  type="text"
                  value={persona.technicalProficiency || ''}
                  onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, technicalProficiency: e.target.value })}
                  placeholder="Technical proficiency (e.g., low, medium, high)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(persona.goals) ? persona.goals.map((g: any) => typeof g === 'string' ? g : g.goal || '').join(', ') : ''}
                  onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, goals: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Goals (comma-separated)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(persona.painPoints) ? persona.painPoints.join(', ') : ''}
                  onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, painPoints: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Pain points (comma-separated)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(persona.behaviors) ? persona.behaviors.join(', ') : ''}
                  onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, behaviors: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Behaviors (comma-separated)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={persona.frequency || ''}
                  onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, frequency: e.target.value })}
                  placeholder="Usage frequency (e.g., daily, weekly)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(persona.primaryTasks) ? persona.primaryTasks.join(', ') : ''}
                  onChange={(e) => updateArrayItem('userPersonas', i, { ...persona, primaryTasks: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Primary tasks (comma-separated)"
                  className="full-width-input"
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('userPersonas', { name: '', role: '', description: '' })}>+ Add Persona</button>
          </div>
        ) : userPersonas.length > 0 ? (
          <div className="personas-list">
            {userPersonas.map((persona: any, i: number) => (
              <div key={i} className="persona-item">
                <h5>{persona.name || 'Unnamed Persona'}{persona.id && <span className="item-id"> ({persona.id})</span>}</h5>
                {persona.role && <p className="persona-role">{persona.role}</p>}
                {persona.description && <Md text={persona.description} />}
                {persona.technicalProficiency && <p><strong>Technical Proficiency:</strong> <span className="tag">{persona.technicalProficiency}</span></p>}
                {persona.frequency && <p><strong>Usage Frequency:</strong> {persona.frequency}</p>}
                {persona.goals?.length > 0 && (
                  <p><strong>Goals:</strong> {persona.goals.map((g: any) => typeof g === 'string' ? g : g.goal || JSON.stringify(g)).join(', ')}</p>
                )}
                {persona.painPoints?.length > 0 && (
                  <p><strong>Pain Points:</strong> {persona.painPoints.join(', ')}</p>
                )}
                {persona.behaviors?.length > 0 && (
                  <p><strong>Behaviors:</strong> {persona.behaviors.join(', ')}</p>
                )}
                {persona.primaryTasks?.length > 0 && (
                  <p><strong>Primary Tasks:</strong> {persona.primaryTasks.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No personas defined</p>
        )}
      </CollapsibleSection>

      {/* Success Criteria */}
      <CollapsibleSection title="Success Criteria" count={successCriteria.length} sectionId="prd-success-criteria">
        {editMode ? (
          <div className="success-criteria-list">
            {successCriteria.map((sc: any, i: number) => (
              <div key={i} className="criteria-item criteria-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={sc.criterion || ''}
                    onChange={(e) => updateArrayItem('successCriteria', i, { ...sc, criterion: e.target.value })}
                    placeholder="Success criterion"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('successCriteria', i)}>×</button>
                </div>
                <div className="detail-row">
                  <input
                    type="text"
                    value={sc.metric || ''}
                    onChange={(e) => updateArrayItem('successCriteria', i, { ...sc, metric: e.target.value })}
                    placeholder="Metric"
                  />
                  <input
                    type="text"
                    value={sc.target || ''}
                    onChange={(e) => updateArrayItem('successCriteria', i, { ...sc, target: e.target.value })}
                    placeholder="Target"
                  />
                  <input
                    type="text"
                    value={sc.category || ''}
                    onChange={(e) => updateArrayItem('successCriteria', i, { ...sc, category: e.target.value })}
                    placeholder="Category"
                  />
                </div>
                <div className="detail-row">
                  <input
                    type="text"
                    value={sc.baseline || ''}
                    onChange={(e) => updateArrayItem('successCriteria', i, { ...sc, baseline: e.target.value })}
                    placeholder="Baseline"
                  />
                  <input
                    type="text"
                    value={sc.measurement || ''}
                    onChange={(e) => updateArrayItem('successCriteria', i, { ...sc, measurement: e.target.value })}
                    placeholder="Measurement method"
                  />
                  <input
                    type="text"
                    value={sc.timeframe || ''}
                    onChange={(e) => updateArrayItem('successCriteria', i, { ...sc, timeframe: e.target.value })}
                    placeholder="Timeframe"
                  />
                </div>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('successCriteria', { criterion: '', metric: '', target: '' })}>+ Add Criterion</button>
          </div>
        ) : successCriteria.length > 0 ? (
          <div className="success-criteria-list">
            {successCriteria.map((sc: any, i: number) => (
              <div key={i} className="criteria-item">
                <p>
                  {sc.id && <span className="item-id">{sc.id}</span>}
                  <strong>{sc.criterion}</strong>
                  {sc.category && <span className="tag">{sc.category}</span>}
                </p>
                {sc.metric && <p><strong>Metric:</strong> {sc.metric}</p>}
                {sc.target && <p><strong>Target:</strong> {sc.target}</p>}
                {sc.baseline && <p><strong>Baseline:</strong> {sc.baseline}</p>}
                {sc.measurement && <p><strong>Measurement:</strong> {sc.measurement}</p>}
                {sc.timeframe && <p><strong>Timeframe:</strong> {sc.timeframe}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No success criteria defined</p>
        )}
      </CollapsibleSection>

      {/* User Journeys */}
      {(editMode || userJourneys.length > 0) && (
        <CollapsibleSection title="User Journeys" count={userJourneys.length} sectionId="prd-user-journeys">
          {editMode ? (
            <div className="component-edit">
              {userJourneys.map((journey: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={journey.name || ''}
                      onChange={(e) => updateArrayItem('userJourneys', i, { ...journey, name: e.target.value })}
                      placeholder="Journey name"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('userJourneys', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={journey.persona || ''}
                      onChange={(e) => updateArrayItem('userJourneys', i, { ...journey, persona: e.target.value })}
                      placeholder="Persona"
                    />
                    <input
                      type="text"
                      value={journey.goal || ''}
                      onChange={(e) => updateArrayItem('userJourneys', i, { ...journey, goal: e.target.value })}
                      placeholder="Goal"
                    />
                  </div>
                  <textarea
                    value={journey.successCriteria || ''}
                    onChange={(e) => updateArrayItem('userJourneys', i, { ...journey, successCriteria: e.target.value })}
                    rows={2}
                    placeholder="Success criteria..."
                  />
                  <textarea
                    value={journey.notes || ''}
                    onChange={(e) => updateArrayItem('userJourneys', i, { ...journey, notes: e.target.value })}
                    rows={2}
                    placeholder="Notes..."
                  />
                  <div style={{ marginTop: '4px' }}>
                    <span className="field-label">Steps</span>
                    {(journey.steps || []).map((step: any, si: number) => (
                      <div key={si} className="editable-list-item" style={{ marginBottom: '2px' }}>
                        <span className="step-number">{si + 1}.</span>
                        <input
                          type="text"
                          value={typeof step === 'string' ? step : (step.action || '')}
                          onChange={(e) => {
                            const newSteps = [...(journey.steps || [])];
                            newSteps[si] = typeof step === 'string' ? e.target.value : { ...step, action: e.target.value };
                            updateArrayItem('userJourneys', i, { ...journey, steps: newSteps });
                          }}
                          placeholder={`Step ${si + 1} action...`}
                          style={{ flex: 1 }}
                        />
                        <button className="remove-btn" onClick={() => {
                          const newSteps = [...(journey.steps || [])];
                          newSteps.splice(si, 1);
                          updateArrayItem('userJourneys', i, { ...journey, steps: newSteps });
                        }}>×</button>
                      </div>
                    ))}
                    <button
                      className="btn btn-secondary btn-small"
                      style={{ marginTop: '4px' }}
                      onClick={() => updateArrayItem('userJourneys', i, { ...journey, steps: [...(journey.steps || []), { action: '' }] })}
                    >+ Add Step</button>
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('userJourneys', { name: '', persona: '', goal: '' })}>+ Add Journey</button>
            </div>
          ) : (
            <div className="user-journeys-list">
              {userJourneys.map((journey: any, i: number) => (
                <div key={i} className="journey-item">
                  <h5>{journey.name || `Journey ${i + 1}`}{journey.id && <span className="item-id"> ({journey.id})</span>}</h5>
                  {journey.persona && <p><strong>Persona:</strong> {journey.persona}</p>}
                  {journey.goal && <p><strong>Goal:</strong> {journey.goal}</p>}
                  {journey.preconditions?.length > 0 && (
                    <p><strong>Preconditions:</strong> {journey.preconditions.join('; ')}</p>
                  )}
                  {journey.steps?.length > 0 && (
                    <div className="journey-steps">
                      <strong>Steps:</strong>
                      <ol>
                        {journey.steps.map((step: any, si: number) => (
                          <li key={si}>
                            <p><strong>{step.action}</strong></p>
                            {step.systemResponse && <p className="step-detail">System: {step.systemResponse}</p>}
                            {step.outcome && <p className="step-detail">Outcome: {step.outcome}</p>}
                            {step.errorHandling && <p className="step-detail">Error handling: {step.errorHandling}</p>}
                            {step.alternativeFlows?.length > 0 && (
                              <p className="step-detail">Alternatives: {step.alternativeFlows.join('; ')}</p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {journey.successCriteria && <p><strong>Success Criteria:</strong> {journey.successCriteria}</p>}
                  {journey.postconditions?.length > 0 && (
                    <p><strong>Postconditions:</strong> {journey.postconditions.join('; ')}</p>
                  )}
                  {journey.notes && <p><strong>Notes:</strong> {journey.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Domain Model */}
      {(editMode || domainModel.overview || domainModel.coreConcepts?.length > 0 || domainModel.glossary?.length > 0) && (
        <CollapsibleSection title="Domain Model" sectionId="prd-domain-model">
          {editMode ? (
            <div className="arch-context-edit">
              <label>
                <span className="field-label">Overview</span>
                <textarea
                  value={domainModel.overview || ''}
                  onChange={(e) => handleFieldChange('domainModel', { ...domainModel, overview: e.target.value })}
                  rows={3}
                  placeholder="Domain model overview..."
                />
              </label>
              <h5>Glossary</h5>
              {(domainModel.glossary || []).map((entry: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={entry.term || ''}
                      onChange={(e) => {
                        const updated = [...(domainModel.glossary || [])];
                        updated[i] = { ...entry, term: e.target.value };
                        handleFieldChange('domainModel', { ...domainModel, glossary: updated });
                      }}
                      placeholder="Term"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(domainModel.glossary || [])];
                      updated.splice(i, 1);
                      handleFieldChange('domainModel', { ...domainModel, glossary: updated });
                    }}>×</button>
                  </div>
                  <textarea
                    value={entry.definition || ''}
                    onChange={(e) => {
                      const updated = [...(domainModel.glossary || [])];
                      updated[i] = { ...entry, definition: e.target.value };
                      handleFieldChange('domainModel', { ...domainModel, glossary: updated });
                    }}
                    rows={2}
                    placeholder="Definition..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('domainModel', { ...domainModel, glossary: [...(domainModel.glossary || []), { term: '', definition: '' }] });
              }}>+ Add Glossary Term</button>
              {domainModel.coreConcepts?.length > 0 && (
                <div className="domain-concepts">
                  <h5>Core Concepts ({domainModel.coreConcepts.length})</h5>
                  <p className="empty-message">Core concepts are read-only — use AI to refine</p>
                  {domainModel.coreConcepts.map((concept: any, i: number) => (
                    <div key={i} className="concept-item">
                      <h5>{concept.name}</h5>
                      {concept.description && <Md text={concept.description} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {domainModel.overview && <Md text={domainModel.overview} />}
              {domainModel.coreConcepts?.length > 0 && (
                <div className="domain-concepts">
                  <h5>Core Concepts ({domainModel.coreConcepts.length})</h5>
                  {domainModel.coreConcepts.map((concept: any, i: number) => (
                    <div key={i} className="concept-item">
                      <h5>{concept.name}</h5>
                      {concept.description && <Md text={concept.description} />}
                      {concept.attributes?.length > 0 && (
                        <div>
                          <strong>Attributes:</strong>
                          <ul>
                            {concept.attributes.map((attr: any, ai: number) => (
                              <li key={ai}>
                                <code>{attr.name}</code>{attr.type && `: ${attr.type}`}{attr.required && ' (required)'}
                                {attr.description && ` — ${attr.description}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {concept.relationships?.length > 0 && (
                        <div>
                          <strong>Relationships:</strong>
                          <ul>
                            {concept.relationships.map((rel: any, ri: number) => (
                              <li key={ri}>
                                → <strong>{rel.target}</strong> ({rel.type}{rel.cardinality && `, ${rel.cardinality}`})
                                {rel.description && ` — ${rel.description}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {concept.businessRules?.length > 0 && (
                        <div>
                          <strong>Business Rules:</strong>
                          <ul>{concept.businessRules.map((rule: string, ri: number) => <li key={ri}>{rule}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {domainModel.glossary?.length > 0 && (
                <div className="domain-glossary">
                  <h5>Glossary ({domainModel.glossary.length})</h5>
                  <dl>
                    {domainModel.glossary.map((entry: any, i: number) => (
                      <div key={i}>
                        <dt><strong>{entry.term}</strong></dt>
                        <dd>
                          {entry.definition}
                          {entry.synonyms?.length > 0 && <span className="glossary-meta"> (Synonyms: {entry.synonyms.join(', ')})</span>}
                          {entry.relatedTerms?.length > 0 && <span className="glossary-meta"> (Related: {entry.relatedTerms.join(', ')})</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Requirements */}
      {(editMode || requirements.functional?.length > 0 || requirements.nonFunctional?.length > 0 || requirements.technical?.length > 0) && (
        <CollapsibleSection title="Requirements" sectionId="prd-requirements">
          {editMode ? (
            <div className="component-edit">
              {/* Functional Requirements */}
              <h5>Functional Requirements</h5>
              {(requirements.functional || []).map((req: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={req.title || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.functional || [])];
                        updated[i] = { ...req, title: e.target.value };
                        handleFieldChange('requirements', { ...requirements, functional: updated });
                      }}
                      placeholder="Requirement title"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(requirements.functional || [])];
                      updated.splice(i, 1);
                      handleFieldChange('requirements', { ...requirements, functional: updated });
                    }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={req.id || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.functional || [])];
                        updated[i] = { ...req, id: e.target.value };
                        handleFieldChange('requirements', { ...requirements, functional: updated });
                      }}
                      placeholder="ID (e.g., FR-1)"
                    />
                    <select
                      value={req.priority || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.functional || [])];
                        updated[i] = { ...req, priority: e.target.value };
                        handleFieldChange('requirements', { ...requirements, functional: updated });
                      }}
                    >
                      <option value="">Priority...</option>
                      {['critical', 'high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      type="text"
                      value={req.capabilityArea || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.functional || [])];
                        updated[i] = { ...req, capabilityArea: e.target.value };
                        handleFieldChange('requirements', { ...requirements, functional: updated });
                      }}
                      placeholder="Capability area"
                    />
                  </div>
                  <textarea
                    value={req.description || ''}
                    onChange={(e) => {
                      const updated = [...(requirements.functional || [])];
                      updated[i] = { ...req, description: e.target.value };
                      handleFieldChange('requirements', { ...requirements, functional: updated });
                    }}
                    rows={2}
                    placeholder="Description..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('requirements', { ...requirements, functional: [...(requirements.functional || []), { id: '', title: '', description: '', priority: '' }] });
              }}>+ Add Functional Requirement</button>

              {/* Non-Functional Requirements */}
              <h5>Non-Functional Requirements</h5>
              {(requirements.nonFunctional || []).map((req: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={req.title || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.nonFunctional || [])];
                        updated[i] = { ...req, title: e.target.value };
                        handleFieldChange('requirements', { ...requirements, nonFunctional: updated });
                      }}
                      placeholder="Requirement title"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(requirements.nonFunctional || [])];
                      updated.splice(i, 1);
                      handleFieldChange('requirements', { ...requirements, nonFunctional: updated });
                    }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={req.id || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.nonFunctional || [])];
                        updated[i] = { ...req, id: e.target.value };
                        handleFieldChange('requirements', { ...requirements, nonFunctional: updated });
                      }}
                      placeholder="ID (e.g., NFR-1)"
                    />
                    <select
                      value={req.priority || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.nonFunctional || [])];
                        updated[i] = { ...req, priority: e.target.value };
                        handleFieldChange('requirements', { ...requirements, nonFunctional: updated });
                      }}
                    >
                      <option value="">Priority...</option>
                      {['critical', 'high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      type="text"
                      value={req.category || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.nonFunctional || [])];
                        updated[i] = { ...req, category: e.target.value };
                        handleFieldChange('requirements', { ...requirements, nonFunctional: updated });
                      }}
                      placeholder="Category"
                    />
                  </div>
                  <textarea
                    value={req.description || ''}
                    onChange={(e) => {
                      const updated = [...(requirements.nonFunctional || [])];
                      updated[i] = { ...req, description: e.target.value };
                      handleFieldChange('requirements', { ...requirements, nonFunctional: updated });
                    }}
                    rows={2}
                    placeholder="Description..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('requirements', { ...requirements, nonFunctional: [...(requirements.nonFunctional || []), { id: '', title: '', description: '', priority: '' }] });
              }}>+ Add Non-Functional Requirement</button>

              {/* Technical Requirements */}
              <h5>Technical Requirements</h5>
              {(requirements.technical || []).map((req: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={req.title || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.technical || [])];
                        updated[i] = { ...req, title: e.target.value };
                        handleFieldChange('requirements', { ...requirements, technical: updated });
                      }}
                      placeholder="Requirement title"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(requirements.technical || [])];
                      updated.splice(i, 1);
                      handleFieldChange('requirements', { ...requirements, technical: updated });
                    }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={req.id || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.technical || [])];
                        updated[i] = { ...req, id: e.target.value };
                        handleFieldChange('requirements', { ...requirements, technical: updated });
                      }}
                      placeholder="ID (e.g., TR-1)"
                    />
                    <input
                      type="text"
                      value={req.category || ''}
                      onChange={(e) => {
                        const updated = [...(requirements.technical || [])];
                        updated[i] = { ...req, category: e.target.value };
                        handleFieldChange('requirements', { ...requirements, technical: updated });
                      }}
                      placeholder="Category"
                    />
                  </div>
                  <textarea
                    value={req.description || ''}
                    onChange={(e) => {
                      const updated = [...(requirements.technical || [])];
                      updated[i] = { ...req, description: e.target.value };
                      handleFieldChange('requirements', { ...requirements, technical: updated });
                    }}
                    rows={2}
                    placeholder="Description..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('requirements', { ...requirements, technical: [...(requirements.technical || []), { id: '', title: '', description: '' }] });
              }}>+ Add Technical Requirement</button>
            </div>
          ) : (
            <>
              {/* Functional Requirements */}
              {requirements.functional?.length > 0 && (
                <div className="requirements-group">
                  <h5>Functional Requirements ({requirements.functional.length})</h5>
                  {requirements.functional.map((req: any, i: number) => (
                    <div key={i} className="requirement-item">
                      <p>
                        {req.id && <span className="item-id">{req.id}</span>}
                        <strong>{req.title}</strong>
                        {req.priority && <span className={`tag tag-${req.priority}`}>{req.priority}</span>}
                        {req.capabilityArea && <span className="tag">{req.capabilityArea}</span>}
                      </p>
                      {req.description && <p>{req.description}</p>}
                      {req.rationale && <p><strong>Rationale:</strong> {req.rationale}</p>}
                      {req.source && <p><strong>Source:</strong> {req.source}</p>}
                      {req.acceptanceCriteria?.length > 0 && (
                        <div><strong>Acceptance Criteria:</strong><ul>{req.acceptanceCriteria.map((ac: string, ai: number) => <li key={ai}>{ac}</li>)}</ul></div>
                      )}
                      {req.dependencies?.length > 0 && (
                        <p><strong>Dependencies:</strong> {req.dependencies.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Non-Functional Requirements */}
              {requirements.nonFunctional?.length > 0 && (
                <div className="requirements-group">
                  <h5>Non-Functional Requirements ({requirements.nonFunctional.length})</h5>
                  {requirements.nonFunctional.map((req: any, i: number) => (
                    <div key={i} className="requirement-item">
                      <p>
                        {req.id && <span className="item-id">{req.id}</span>}
                        <strong>{req.title}</strong>
                        {req.priority && <span className={`tag tag-${req.priority}`}>{req.priority}</span>}
                        {req.category && <span className="tag">{req.category}</span>}
                      </p>
                      {req.description && <p>{req.description}</p>}
                      {req.metrics && (
                        <p><strong>Metrics:</strong> Target: {req.metrics.target || '—'}{req.metrics.threshold && `, Threshold: ${req.metrics.threshold}`}{req.metrics.unit && ` (${req.metrics.unit})`}</p>
                      )}
                      {req.measurementMethod && <p><strong>Measurement:</strong> {req.measurementMethod}</p>}
                      {req.testStrategy && <p><strong>Test Strategy:</strong> {req.testStrategy}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Technical Requirements */}
              {requirements.technical?.length > 0 && (
                <div className="requirements-group">
                  <h5>Technical Requirements ({requirements.technical.length})</h5>
                  {requirements.technical.map((req: any, i: number) => (
                    <div key={i} className="requirement-item">
                      <p>
                        {req.id && <span className="item-id">{req.id}</span>}
                        <strong>{req.title}</strong>
                        {req.category && <span className="tag">{req.category}</span>}
                      </p>
                      {req.description && <p>{req.description}</p>}
                      {req.rationale && <p><strong>Rationale:</strong> {req.rationale}</p>}
                      {req.impact && <p><strong>Impact:</strong> {req.impact}</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Scope */}
      {(editMode || scope.inScope?.length > 0 || scope.outOfScope?.length > 0 || scope.assumptions?.length > 0 || scope.dependencies?.length > 0) && (
        <CollapsibleSection title="Scope" sectionId="prd-scope">
          {editMode ? (
            <div className="scope-edit">
              <div className="scope-group">
                <h5>In Scope ({(scope.inScope || []).length})</h5>
                <div className="editable-list">
                  {(scope.inScope || []).map((item: any, i: number) => (
                    <div key={i} className="editable-list-item">
                      <input
                        type="text"
                        value={typeof item === 'string' ? item : item.item || ''}
                        onChange={(e) => {
                          const updated = [...(scope.inScope || [])];
                          updated[i] = typeof item === 'string' ? e.target.value : { ...item, item: e.target.value };
                          handleFieldChange('scope', { ...scope, inScope: updated });
                        }}
                        placeholder="In-scope item..."
                      />
                      <button className="remove-btn" onClick={() => {
                        const updated = [...(scope.inScope || [])];
                        updated.splice(i, 1);
                        handleFieldChange('scope', { ...scope, inScope: updated });
                      }}>×</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('scope', { ...scope, inScope: [...(scope.inScope || []), ''] })}>+ Add In Scope</button>
                </div>
              </div>
              <div className="scope-group">
                <h5>Out of Scope ({(scope.outOfScope || []).length})</h5>
                <div className="editable-list">
                  {(scope.outOfScope || []).map((item: any, i: number) => (
                    <div key={i} className="editable-list-item">
                      <input
                        type="text"
                        value={typeof item === 'string' ? item : item.item || ''}
                        onChange={(e) => {
                          const updated = [...(scope.outOfScope || [])];
                          updated[i] = typeof item === 'string' ? e.target.value : { ...item, item: e.target.value };
                          handleFieldChange('scope', { ...scope, outOfScope: updated });
                        }}
                        placeholder="Out-of-scope item..."
                      />
                      <button className="remove-btn" onClick={() => {
                        const updated = [...(scope.outOfScope || [])];
                        updated.splice(i, 1);
                        handleFieldChange('scope', { ...scope, outOfScope: updated });
                      }}>×</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('scope', { ...scope, outOfScope: [...(scope.outOfScope || []), ''] })}>+ Add Out of Scope</button>
                </div>
              </div>
              <div className="scope-group">
                <h5>Assumptions ({(scope.assumptions || []).length})</h5>
                <div className="editable-list">
                  {(scope.assumptions || []).map((item: any, i: number) => (
                    <div key={i} className="editable-list-item">
                      <input
                        type="text"
                        value={typeof item === 'string' ? item : item.assumption || ''}
                        onChange={(e) => {
                          const updated = [...(scope.assumptions || [])];
                          updated[i] = typeof item === 'string' ? e.target.value : { ...item, assumption: e.target.value };
                          handleFieldChange('scope', { ...scope, assumptions: updated });
                        }}
                        placeholder="Assumption..."
                      />
                      <button className="remove-btn" onClick={() => {
                        const updated = [...(scope.assumptions || [])];
                        updated.splice(i, 1);
                        handleFieldChange('scope', { ...scope, assumptions: updated });
                      }}>×</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('scope', { ...scope, assumptions: [...(scope.assumptions || []), ''] })}>+ Add Assumption</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {scope.inScope?.length > 0 && (
                <div className="scope-group">
                  <h5>In Scope ({scope.inScope.length})</h5>
                  <ul>
                    {scope.inScope.map((item: any, i: number) => (
                      <li key={i}>
                        <strong>{typeof item === 'string' ? item : item.item}</strong>
                        {item.priority && <span className={`tag tag-${item.priority}`}>{item.priority}</span>}
                        {item.description && <span> — {item.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scope.outOfScope?.length > 0 && (
                <div className="scope-group">
                  <h5>Out of Scope ({scope.outOfScope.length})</h5>
                  <ul>
                    {scope.outOfScope.map((item: any, i: number) => (
                      <li key={i}>
                        <strong>{typeof item === 'string' ? item : item.item}</strong>
                        {item.futureConsideration && <span className="tag">future consideration</span>}
                        {item.rationale && <span> — {item.rationale}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scope.assumptions?.length > 0 && (
                <div className="scope-group">
                  <h5>Assumptions ({scope.assumptions.length})</h5>
                  <ul>
                    {scope.assumptions.map((item: any, i: number) => (
                      <li key={i}>
                        <strong>{typeof item === 'string' ? item : item.assumption}</strong>
                        {item.validated !== undefined && <span className="tag">{item.validated ? 'validated' : 'unvalidated'}</span>}
                        {item.impact && <span> — Impact: {item.impact}</span>}
                        {item.validationMethod && <span> (Method: {item.validationMethod})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scope.dependencies?.length > 0 && (
                <div className="scope-group">
                  <h5>Dependencies ({scope.dependencies.length})</h5>
                  <ul>
                    {scope.dependencies.map((dep: any, i: number) => (
                      <li key={i}>
                        <strong>{typeof dep === 'string' ? dep : dep.dependency}</strong>
                        {dep.type && <span className="tag">{dep.type}</span>}
                        {dep.status && <span className="tag">{dep.status}</span>}
                        {dep.owner && <span> — Owner: {dep.owner}</span>}
                        {dep.risk && <span> — Risk: {dep.risk}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Constraints */}
      <CollapsibleSection title="Constraints" count={constraints.length} sectionId="prd-constraints">
        {editMode ? (
          <div className="constraints-list">
            {constraints.map((c: any, i: number) => (
              <div key={i} className="constraint-item constraint-edit">
                <div className="editable-item-header">
                  <select
                    value={c.type || ''}
                    onChange={(e) => updateArrayItem('constraints', i, { ...c, type: e.target.value })}
                  >
                    <option value="">Type...</option>
                    {['technical', 'business', 'regulatory', 'resource', 'time', 'budget'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    value={c.flexibility || ''}
                    onChange={(e) => updateArrayItem('constraints', i, { ...c, flexibility: e.target.value })}
                  >
                    <option value="">Flexibility...</option>
                    {['fixed', 'negotiable', 'flexible'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <button className="remove-btn" onClick={() => removeFromArray('constraints', i)}>×</button>
                </div>
                <textarea
                  value={c.description || ''}
                  onChange={(e) => updateArrayItem('constraints', i, { ...c, description: e.target.value })}
                  rows={2}
                  placeholder="Constraint description..."
                />
                <input
                  type="text"
                  value={c.impact || ''}
                  onChange={(e) => updateArrayItem('constraints', i, { ...c, impact: e.target.value })}
                  placeholder="Impact on project..."
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={c.mitigation || ''}
                  onChange={(e) => updateArrayItem('constraints', i, { ...c, mitigation: e.target.value })}
                  placeholder="Mitigation strategy..."
                  className="full-width-input"
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('constraints', { type: '', description: '', flexibility: '' })}>+ Add Constraint</button>
          </div>
        ) : constraints.length > 0 ? (
          <div className="constraints-list">
            {constraints.map((c: any, i: number) => (
              <div key={i} className={`constraint-item constraint-${c.type || 'general'}`}>
                <p>
                  {c.id && <span className="item-id">{c.id}</span>}
                  {c.type && <span className="constraint-type">{c.type}</span>}
                  {c.flexibility && <span className={`tag tag-${c.flexibility}`}>{c.flexibility}</span>}
                </p>
                <p className="constraint-desc">{c.description || c.constraint || ''}</p>
                {c.impact && <p><strong>Impact:</strong> {c.impact}</p>}
                {c.mitigation && <p><strong>Mitigation:</strong> {c.mitigation}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No constraints defined</p>
        )}
      </CollapsibleSection>

      {/* Risks */}
      <CollapsibleSection title="Risks" count={risks.length} sectionId="prd-risks">
        {editMode ? (
          <div className="risks-list">
            {risks.map((risk: any, i: number) => (
              <div key={i} className="risk-item risk-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={risk.risk || ''}
                    onChange={(e) => updateArrayItem('risks', i, { ...risk, risk: e.target.value })}
                    placeholder="Risk description"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('risks', i)}>×</button>
                </div>
                <div className="detail-row">
                  <select
                    value={risk.probability || ''}
                    onChange={(e) => updateArrayItem('risks', i, { ...risk, probability: e.target.value })}
                  >
                    <option value="">Probability...</option>
                    {['low', 'medium', 'high'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <select
                    value={risk.impact || ''}
                    onChange={(e) => updateArrayItem('risks', i, { ...risk, impact: e.target.value })}
                  >
                    <option value="">Impact...</option>
                    {['low', 'medium', 'high', 'critical'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={risk.category || ''}
                    onChange={(e) => updateArrayItem('risks', i, { ...risk, category: e.target.value })}
                    placeholder="Category"
                  />
                </div>
                <input
                  type="text"
                  value={risk.mitigation || ''}
                  onChange={(e) => updateArrayItem('risks', i, { ...risk, mitigation: e.target.value })}
                  placeholder="Mitigation strategy..."
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={risk.contingency || ''}
                  onChange={(e) => updateArrayItem('risks', i, { ...risk, contingency: e.target.value })}
                  placeholder="Contingency plan..."
                  className="full-width-input"
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('risks', { risk: '', probability: '', impact: '', mitigation: '' })}>+ Add Risk</button>
          </div>
        ) : risks.length > 0 ? (
          <div className="risks-list">
            {risks.map((risk: any, i: number) => (
              <div key={i} className={`risk-item risk-${risk.impact}`}>
                <p>
                  {risk.id && <span className="item-id">{risk.id}</span>}
                  <strong>{risk.risk}</strong>
                  {risk.category && <span className="tag">{risk.category}</span>}
                  {risk.status && <span className={`tag tag-${risk.status}`}>{risk.status}</span>}
                </p>
                {(risk.probability || risk.impact || risk.riskScore) && (
                  <p>
                    {risk.probability && <span><strong>Probability:</strong> {risk.probability} </span>}
                    {risk.impact && <span><strong>Impact:</strong> {risk.impact} </span>}
                    {risk.riskScore && <span><strong>Score:</strong> {risk.riskScore}</span>}
                  </p>
                )}
                {risk.mitigation && <p><strong>Mitigation:</strong> {risk.mitigation}</p>}
                {risk.contingency && <p><strong>Contingency:</strong> {risk.contingency}</p>}
                {risk.owner && <p><strong>Owner:</strong> {risk.owner}</p>}
                {risk.triggers?.length > 0 && (
                  <p><strong>Triggers:</strong> {risk.triggers.join('; ')}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No risks defined</p>
        )}
      </CollapsibleSection>

      {/* Timeline */}
      {(editMode || timeline.overview || timeline.phases?.length > 0) && (
        <CollapsibleSection title="Timeline" sectionId="prd-timeline">
          {editMode ? (
            <div className="arch-context-edit">
              <label>
                <span className="field-label">Overview</span>
                <textarea
                  value={timeline.overview || ''}
                  onChange={(e) => handleFieldChange('timeline', { ...timeline, overview: e.target.value })}
                  rows={2}
                  placeholder="Timeline overview..."
                />
              </label>
              <h5>Phases</h5>
              {(timeline.phases || []).map((phase: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={phase.name || ''}
                      onChange={(e) => {
                        const updated = [...(timeline.phases || [])];
                        updated[i] = { ...phase, name: e.target.value };
                        handleFieldChange('timeline', { ...timeline, phases: updated });
                      }}
                      placeholder="Phase name"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(timeline.phases || [])];
                      updated.splice(i, 1);
                      handleFieldChange('timeline', { ...timeline, phases: updated });
                    }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={phase.startDate || ''}
                      onChange={(e) => {
                        const updated = [...(timeline.phases || [])];
                        updated[i] = { ...phase, startDate: e.target.value };
                        handleFieldChange('timeline', { ...timeline, phases: updated });
                      }}
                      placeholder="Start date"
                    />
                    <input
                      type="text"
                      value={phase.endDate || ''}
                      onChange={(e) => {
                        const updated = [...(timeline.phases || [])];
                        updated[i] = { ...phase, endDate: e.target.value };
                        handleFieldChange('timeline', { ...timeline, phases: updated });
                      }}
                      placeholder="End date"
                    />
                  </div>
                  <textarea
                    value={phase.description || ''}
                    onChange={(e) => {
                      const updated = [...(timeline.phases || [])];
                      updated[i] = { ...phase, description: e.target.value };
                      handleFieldChange('timeline', { ...timeline, phases: updated });
                    }}
                    rows={2}
                    placeholder="Description..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('timeline', { ...timeline, phases: [...(timeline.phases || []), { name: '', startDate: '', endDate: '', description: '' }] });
              }}>+ Add Phase</button>
            </div>
          ) : (
            <>
              {timeline.overview && <Md text={timeline.overview} />}
              {timeline.phases?.length > 0 && (
                <div className="timeline-phases">
                  {timeline.phases.map((phase: any, i: number) => (
                    <div key={i} className="phase-item">
                      <h5>{phase.name || `Phase ${i + 1}`}</h5>
                      {phase.description && <Md text={phase.description} />}
                      {(phase.startDate || phase.endDate) && (
                        <p><strong>Period:</strong> {phase.startDate || '?'} — {phase.endDate || '?'}</p>
                      )}
                      {phase.deliverables?.length > 0 && (
                        <p><strong>Deliverables:</strong> {phase.deliverables.join(', ')}</p>
                      )}
                      {phase.milestones?.length > 0 && (
                        <div>
                          <strong>Milestones:</strong>
                          <ul>
                            {phase.milestones.map((ms: any, mi: number) => (
                              <li key={mi}>
                                <strong>{ms.name}</strong>{ms.date && ` (${ms.date})`}
                                {ms.deliverables?.length > 0 && <span> — {ms.deliverables.join(', ')}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Appendices */}
      {(editMode || appendices.length > 0) && (
        <CollapsibleSection title="Appendices" count={appendices.length} sectionId="prd-appendices">
          {editMode ? (
            <div className="component-edit">
              {appendices.map((appendix: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={appendix.title || ''}
                      onChange={(e) => updateArrayItem('appendices', i, { ...appendix, title: e.target.value })}
                      placeholder="Appendix title"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('appendices', i)}>×</button>
                  </div>
                  <input
                    type="text"
                    value={appendix.id || ''}
                    onChange={(e) => updateArrayItem('appendices', i, { ...appendix, id: e.target.value })}
                    placeholder="ID (e.g., A, B)"
                    className="full-width-input"
                  />
                  <textarea
                    value={appendix.content || ''}
                    onChange={(e) => updateArrayItem('appendices', i, { ...appendix, content: e.target.value })}
                    rows={3}
                    placeholder="Content..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('appendices', { title: '', content: '' })}>+ Add Appendix</button>
            </div>
          ) : (
            <>
              {appendices.map((appendix: any, i: number) => (
                <div key={i} className="appendix-item">
                  <h5>{appendix.id && <span className="item-id">{appendix.id}</span>} {appendix.title || `Appendix ${i + 1}`}</h5>
                  {appendix.content && <Md text={appendix.content} />}
                  {appendix.references?.length > 0 && (
                    <p><strong>References:</strong> {appendix.references.join(', ')}</p>
                  )}
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Approvals */}
      {(editMode || approvals.length > 0) && (
        <CollapsibleSection title="Approvals" count={approvals.length} sectionId="prd-approvals">
          {editMode ? (
            <div className="component-edit">
              {approvals.map((approval: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={approval.role || ''}
                      onChange={(e) => updateArrayItem('approvals', i, { ...approval, role: e.target.value })}
                      placeholder="Role"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('approvals', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={approval.name || ''}
                      onChange={(e) => updateArrayItem('approvals', i, { ...approval, name: e.target.value })}
                      placeholder="Name"
                    />
                    <select
                      value={approval.status || ''}
                      onChange={(e) => updateArrayItem('approvals', i, { ...approval, status: e.target.value })}
                    >
                      <option value="">Status...</option>
                      {['pending', 'approved', 'rejected', 'deferred'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input
                      type="text"
                      value={approval.date || ''}
                      onChange={(e) => updateArrayItem('approvals', i, { ...approval, date: e.target.value })}
                      placeholder="Date"
                    />
                  </div>
                  <textarea
                    value={approval.comments || ''}
                    onChange={(e) => updateArrayItem('approvals', i, { ...approval, comments: e.target.value })}
                    rows={2}
                    placeholder="Comments..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('approvals', { role: '', name: '', status: '' })}>+ Add Approval</button>
            </div>
          ) : (
            <div className="approvals-list">
              {approvals.map((approval: any, i: number) => (
                <div key={i} className="approval-item">
                  <p>
                    <strong>{approval.role || 'Unknown Role'}</strong>
                    {approval.name && <span> — {approval.name}</span>}
                    {approval.status && <span className={`tag tag-${approval.status}`}>{approval.status}</span>}
                    {approval.date && <span className="approval-date"> ({approval.date})</span>}
                  </p>
                  {approval.comments && <Md text={approval.comments} className="approval-comments" />}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// ARCHITECTURE DETAILS
// ==========================================================================

export function renderArchitectureDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray } = props;
  const overview = editedData.overview || {};
  const context = editedData.context || {};
  const rawTechStack = editedData.techStack || {};
  // Normalize techStack: real-world data often has arrays of strings per category
  // e.g. { frontend: ["React 18", "TypeScript 5.4", "Tailwind CSS", "Zustand"] }
  // but the renderer expects objects like { frontend: { framework: "React 18", language: "TypeScript 5.4", ... } }
  const normalizeTechCategory = (
    category: any,
    primaryField: string,
    secondaryField?: string,
    restField?: string
  ): any => {
    if (!category) return category;
    if (!Array.isArray(category)) return category; // already an object — pass through
    if (category.length === 0) return {};
    const result: any = {};
    result[primaryField] = category[0] || '';
    if (secondaryField && category.length > 1) result[secondaryField] = category[1] || '';
    const remaining = category.slice(secondaryField ? 2 : 1);
    if (remaining.length > 0 && restField === 'additionalLibraries') {
      result.additionalLibraries = remaining.map((item: string) => ({ name: item }));
    } else if (remaining.length > 0) {
      // For categories like database/infrastructure, join remaining into a summary
      result._extraItems = remaining;
    }
    return result;
  };
  const techStack: any = {
    ...rawTechStack,
    frontend: normalizeTechCategory(rawTechStack.frontend, 'framework', 'language', 'additionalLibraries'),
    backend: normalizeTechCategory(rawTechStack.backend, 'framework', 'language', 'additionalLibraries'),
    database: normalizeTechCategory(rawTechStack.database, 'primary', 'secondary'),
    infrastructure: normalizeTechCategory(rawTechStack.infrastructure, 'hosting'),
  };
  // Preserve extra categories (testing, devOps, etc.) that aren't in the standard renderer layout
  // These will be rendered as additional tech categories below
  const extraTechCategories: { label: string; items: string[] }[] = [];
  for (const key of Object.keys(rawTechStack)) {
    if (['frontend', 'backend', 'database', 'infrastructure', 'devTools'].includes(key)) continue;
    const val = rawTechStack[key];
    if (Array.isArray(val)) {
      extraTechCategories.push({ label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase()), items: val });
    }
  }
  const decisions: ArchitectureDecision[] = editedData.decisions || [];
  // Normalize patterns: sample data may have plain strings instead of {pattern, category, usage} objects
  const patterns = (editedData.patterns || []).map((p: any) =>
    typeof p === 'string' ? { pattern: p } : p
  );
  const systemComponents = editedData.systemComponents || [];
  const projectStructure = editedData.projectStructure || {};
  // Normalize dataFlow.diagrams: sample data may have plain strings instead of {name, type, description, reference}
  const rawDataFlow = editedData.dataFlow || {};
  const dataFlow = {
    ...rawDataFlow,
    diagrams: (rawDataFlow.diagrams || []).map((d: any) =>
      typeof d === 'string' ? { name: d } : d
    )
  };
  // Normalize security.compliance: sample data may have plain strings instead of {standard, requirements[], implementation}
  const rawSecurity = editedData.security || {};
  const security = {
    ...rawSecurity,
    compliance: (rawSecurity.compliance || []).map((c: any) =>
      typeof c === 'string' ? { standard: c } : c
    )
  };
  const scalability = editedData.scalability || {};
  const reliability = editedData.reliability || {};
  const observability = editedData.observability || {};
  // Normalize deployment: environments may be plain strings, pipeline may be a plain string
  const rawDeployment = editedData.deployment || {};
  const deployment = {
    ...rawDeployment,
    environments: (rawDeployment.environments || []).map((env: any) =>
      typeof env === 'string' ? { name: env } : env
    ),
    pipeline: typeof rawDeployment.pipeline === 'string'
      ? { stages: [], triggers: [], description: rawDeployment.pipeline }
      : (rawDeployment.pipeline || undefined)
  };
  // Normalize integrations: sample uses 'purpose' field, renderer expects 'description'
  const integrations = (editedData.integrations || []).map((integ: any) => {
    if (integ.purpose && !integ.description) return { ...integ, description: integ.purpose };
    return integ;
  });
  const validation = editedData.validation || {};
  const implNotes = editedData.implementationNotes || [];
  const references = editedData.references || [];

  return (
    <>
      {/* Overview */}
      <CollapsibleSection title="Architecture Overview" sectionId="arch-overview">
        {editMode ? (
          <div className="arch-overview-edit">
            <label>
              <span className="field-label">Project Name</span>
              <input type="text" value={overview.projectName || ''} onChange={(e) => handleFieldChange('overview', { ...overview, projectName: e.target.value })} placeholder="Project name" />
            </label>
            <label>
              <span className="field-label">Architecture Style</span>
              <input type="text" value={overview.architectureStyle || ''} onChange={(e) => handleFieldChange('overview', { ...overview, architectureStyle: e.target.value })} placeholder="e.g., Microservices, Monolithic, Event-Driven" />
            </label>
            <label>
              <span className="field-label">Summary</span>
              <textarea value={overview.summary || ''} onChange={(e) => handleFieldChange('overview', { ...overview, summary: e.target.value })} rows={3} placeholder="Architecture summary..." />
            </label>
            <label>
              <span className="field-label">Vision</span>
              <textarea value={overview.vision || ''} onChange={(e) => handleFieldChange('overview', { ...overview, vision: e.target.value })} rows={2} placeholder="Architecture vision statement" />
            </label>
          </div>
        ) : (
          <div className="arch-overview-display">
            {overview.projectName && <p><strong>Project:</strong> {overview.projectName}</p>}
            {overview.architectureStyle && (
              <p><strong>Style:</strong> <span className="arch-style-badge">{overview.architectureStyle}</span></p>
            )}
            {overview.summary && <Md text={overview.summary} />}
            {overview.vision && <p><strong>Vision:</strong> {overview.vision}</p>}
            {!overview.architectureStyle && !overview.summary && !overview.vision && (
              <p className="empty-message">No overview defined</p>
            )}
          </div>
        )}
        {(editMode || overview.principles?.length > 0) && (
          <div className="arch-principles">
            <h5>Guiding Principles ({(overview.principles || []).length})</h5>
            {editMode ? (
              <div className="principles-list">
                {(overview.principles || []).map((p: any, i: number) => (
                  <div key={i} className="principle-item principle-edit">
                    <div className="editable-item-header">
                      <input type="text" value={p.name || ''} onChange={(e) => { const updated = [...(overview.principles || [])]; updated[i] = { ...p, name: e.target.value }; handleFieldChange('overview', { ...overview, principles: updated }); }} placeholder="Principle name" className="full-width-input" />
                      <button className="remove-btn" onClick={() => { const updated = (overview.principles || []).filter((_: any, idx: number) => idx !== i); handleFieldChange('overview', { ...overview, principles: updated }); }}>×</button>
                    </div>
                    <textarea value={p.description || ''} onChange={(e) => { const updated = [...(overview.principles || [])]; updated[i] = { ...p, description: e.target.value }; handleFieldChange('overview', { ...overview, principles: updated }); }} rows={2} placeholder="Description..." />
                    <input type="text" value={p.rationale || ''} onChange={(e) => { const updated = [...(overview.principles || [])]; updated[i] = { ...p, rationale: e.target.value }; handleFieldChange('overview', { ...overview, principles: updated }); }} placeholder="Rationale..." className="full-width-input" />
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => { handleFieldChange('overview', { ...overview, principles: [...(overview.principles || []), { name: '', description: '', rationale: '' }] }); }}>+ Add Principle</button>
              </div>
            ) : (
              overview.principles.map((p: any, i: number) => (
                <div key={i} className="principle-item">
                  <strong>{p.name}</strong>
                  {p.description && <p>{p.description}</p>}
                  {p.rationale && <p className="step-detail">Rationale: {p.rationale}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* Context */}
      {(editMode || context.businessContext || context.technicalContext || context.assumptions?.length > 0 || context.constraints?.length > 0 || context.qualityAttributes?.length > 0 || context.stakeholders?.length > 0) && (
        <CollapsibleSection title="Architecture Context" sectionId="arch-context">
          {editMode ? (
            <div className="arch-context-edit">
              <label><span className="field-label">Business Context</span>
                <textarea value={context.businessContext || ''} onChange={(e) => handleFieldChange('context', { ...context, businessContext: e.target.value })} rows={3} placeholder="Business context and drivers..." />
              </label>
              <label><span className="field-label">Technical Context</span>
                <textarea value={context.technicalContext || ''} onChange={(e) => handleFieldChange('context', { ...context, technicalContext: e.target.value })} rows={3} placeholder="Technical context and constraints..." />
              </label>
            </div>
          ) : (
            <>
              {context.businessContext && <p><strong>Business Context:</strong> {context.businessContext}</p>}
              {context.technicalContext && <p><strong>Technical Context:</strong> {context.technicalContext}</p>}
            </>
          )}
          {(editMode || context.assumptions?.length > 0) && (
            <div>
              <h5>Assumptions ({(context.assumptions || []).length})</h5>
              {editMode ? (
                <div className="assumptions-list">
                  {(context.assumptions || []).map((a: any, i: number) => (
                    <div key={i} className="arch-context-edit">
                      <div className="editable-item-header">
                        <input type="text" value={typeof a === 'string' ? a : a.assumption || ''} onChange={(e) => { const updated = [...(context.assumptions || [])]; updated[i] = typeof a === 'string' ? { assumption: e.target.value } : { ...a, assumption: e.target.value }; handleFieldChange('context', { ...context, assumptions: updated }); }} placeholder="Assumption..." className="full-width-input" />
                        <button className="remove-btn" onClick={() => { const updated = (context.assumptions || []).filter((_: any, idx: number) => idx !== i); handleFieldChange('context', { ...context, assumptions: updated }); }}>×</button>
                      </div>
                      <div className="detail-row">
                        <input type="text" value={a.impact || ''} onChange={(e) => { const updated = [...(context.assumptions || [])]; updated[i] = { ...(typeof a === 'string' ? { assumption: a } : a), impact: e.target.value }; handleFieldChange('context', { ...context, assumptions: updated }); }} placeholder="Impact..." />
                        <input type="text" value={a.validatedBy || ''} onChange={(e) => { const updated = [...(context.assumptions || [])]; updated[i] = { ...(typeof a === 'string' ? { assumption: a } : a), validatedBy: e.target.value }; handleFieldChange('context', { ...context, assumptions: updated }); }} placeholder="Validated by..." />
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-small" onClick={() => { handleFieldChange('context', { ...context, assumptions: [...(context.assumptions || []), { assumption: '', impact: '', validatedBy: '' }] }); }}>+ Add Assumption</button>
                </div>
              ) : (
                <ul>
                  {context.assumptions.map((a: any, i: number) => (
                    <li key={i}>
                      <strong>{typeof a === 'string' ? a : a.assumption}</strong>
                      {a.impact && <span> — Impact: {a.impact}</span>}
                      {a.validatedBy && <span> (Validated by: {a.validatedBy})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {(editMode || context.constraints?.length > 0) && (
            <div>
              <h5>Constraints ({(context.constraints || []).length})</h5>
              {editMode ? (
                <div className="constraints-list">
                  {(context.constraints || []).map((c: any, i: number) => (
                    <div key={i} className="arch-context-edit">
                      <div className="editable-item-header">
                        <input type="text" value={typeof c === 'string' ? c : c.constraint || ''} onChange={(e) => { const updated = [...(context.constraints || [])]; updated[i] = typeof c === 'string' ? { constraint: e.target.value } : { ...c, constraint: e.target.value }; handleFieldChange('context', { ...context, constraints: updated }); }} placeholder="Constraint..." className="full-width-input" />
                        <button className="remove-btn" onClick={() => { const updated = (context.constraints || []).filter((_: any, idx: number) => idx !== i); handleFieldChange('context', { ...context, constraints: updated }); }}>×</button>
                      </div>
                      <div className="detail-row">
                        <input type="text" value={c.type || ''} onChange={(e) => { const updated = [...(context.constraints || [])]; updated[i] = { ...(typeof c === 'string' ? { constraint: c } : c), type: e.target.value }; handleFieldChange('context', { ...context, constraints: updated }); }} placeholder="Type..." />
                        <input type="text" value={c.rationale || ''} onChange={(e) => { const updated = [...(context.constraints || [])]; updated[i] = { ...(typeof c === 'string' ? { constraint: c } : c), rationale: e.target.value }; handleFieldChange('context', { ...context, constraints: updated }); }} placeholder="Rationale..." />
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-small" onClick={() => { handleFieldChange('context', { ...context, constraints: [...(context.constraints || []), { constraint: '', type: '', rationale: '' }] }); }}>+ Add Constraint</button>
                </div>
              ) : (
                <ul>
                  {context.constraints.map((c: any, i: number) => (
                    <li key={i}>
                      <strong>{typeof c === 'string' ? c : c.constraint}</strong>
                      {c.type && <span className="tag">{c.type}</span>}
                      {c.rationale && <span> — {c.rationale}</span>}
                      {c.impact && <span> (Impact: {c.impact})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {(editMode || context.qualityAttributes?.length > 0) && (
            <div>
              <h5>Quality Attributes ({(context.qualityAttributes || []).length})</h5>
              {editMode ? (
                <div className="quality-attrs-list">
                  {(context.qualityAttributes || []).map((qa: any, i: number) => (
                    <div key={i} className="arch-context-edit">
                      <div className="editable-item-header">
                        <input type="text" value={qa.attribute || ''} onChange={(e) => { const updated = [...(context.qualityAttributes || [])]; updated[i] = { ...qa, attribute: e.target.value }; handleFieldChange('context', { ...context, qualityAttributes: updated }); }} placeholder="Attribute name" className="full-width-input" />
                        <button className="remove-btn" onClick={() => { const updated = (context.qualityAttributes || []).filter((_: any, idx: number) => idx !== i); handleFieldChange('context', { ...context, qualityAttributes: updated }); }}>×</button>
                      </div>
                      <div className="detail-row">
                        <select value={qa.priority || ''} onChange={(e) => { const updated = [...(context.qualityAttributes || [])]; updated[i] = { ...qa, priority: e.target.value }; handleFieldChange('context', { ...context, qualityAttributes: updated }); }}>
                          <option value="">Priority...</option>
                          {['critical', 'high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input type="text" value={qa.target || ''} onChange={(e) => { const updated = [...(context.qualityAttributes || [])]; updated[i] = { ...qa, target: e.target.value }; handleFieldChange('context', { ...context, qualityAttributes: updated }); }} placeholder="Target..." />
                      </div>
                      <textarea value={qa.description || ''} onChange={(e) => { const updated = [...(context.qualityAttributes || [])]; updated[i] = { ...qa, description: e.target.value }; handleFieldChange('context', { ...context, qualityAttributes: updated }); }} rows={2} placeholder="Description..." />
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-small" onClick={() => { handleFieldChange('context', { ...context, qualityAttributes: [...(context.qualityAttributes || []), { attribute: '', priority: '', description: '', target: '' }] }); }}>+ Add Quality Attribute</button>
                </div>
              ) : (
                context.qualityAttributes.map((qa: any, i: number) => (
                  <div key={i} className="quality-attr-item">
                    <p><strong>{qa.attribute}</strong>{qa.priority && <span className={`tag tag-${qa.priority}`}>{qa.priority}</span>}</p>
                    {qa.description && <Md text={qa.description} />}
                    {qa.target && <p><strong>Target:</strong> {qa.target}</p>}
                    {qa.measurementMethod && <p><strong>Measurement:</strong> {qa.measurementMethod}</p>}
                  </div>
                ))
              )}
            </div>
          )}
          {(editMode || context.stakeholders?.length > 0) && (
            <div>
              <h5>Stakeholders ({(context.stakeholders || []).length})</h5>
              {editMode ? (
                <div className="stakeholders-list">
                  {(context.stakeholders || []).map((s: any, i: number) => (
                    <div key={i} className="arch-context-edit">
                      <div className="editable-item-header">
                        <input type="text" value={s.role || ''} onChange={(e) => { const updated = [...(context.stakeholders || [])]; updated[i] = { ...s, role: e.target.value }; handleFieldChange('context', { ...context, stakeholders: updated }); }} placeholder="Role" className="full-width-input" />
                        <button className="remove-btn" onClick={() => { const updated = (context.stakeholders || []).filter((_: any, idx: number) => idx !== i); handleFieldChange('context', { ...context, stakeholders: updated }); }}>×</button>
                      </div>
                      <input type="text" value={(s.concerns || []).join(', ')} onChange={(e) => { const updated = [...(context.stakeholders || [])]; updated[i] = { ...s, concerns: e.target.value.split(',').map((c: string) => c.trim()).filter(Boolean) }; handleFieldChange('context', { ...context, stakeholders: updated }); }} placeholder="Concerns (comma-separated)" className="full-width-input" />
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-small" onClick={() => { handleFieldChange('context', { ...context, stakeholders: [...(context.stakeholders || []), { role: '', concerns: [] }] }); }}>+ Add Stakeholder</button>
                </div>
              ) : (
                <ul>
                  {context.stakeholders.map((s: any, i: number) => (
                    <li key={i}><strong>{s.role}</strong>{s.concerns?.length > 0 && <span> — Concerns: {s.concerns.join(', ')}</span>}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Tech Stack */}
      <CollapsibleSection title="Technology Stack" sectionId="arch-tech-stack">
        {editMode ? (
          <div className="tech-stack-edit">
            <div className="tech-category-edit">
              <h5>Frontend</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Framework</span><input type="text" value={techStack.frontend?.framework || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, framework: e.target.value } })} placeholder="e.g., React, Vue, Angular" /></label>
                  <label><span className="field-label">Language</span><input type="text" value={techStack.frontend?.language || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, language: e.target.value } })} placeholder="e.g., TypeScript" /></label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">State Management</span><input type="text" value={techStack.frontend?.stateManagement || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, stateManagement: e.target.value } })} placeholder="e.g., Redux, Zustand" /></label>
                  <label><span className="field-label">Styling</span><input type="text" value={techStack.frontend?.styling || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, styling: e.target.value } })} placeholder="e.g., Tailwind, CSS Modules" /></label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">Testing</span><input type="text" value={techStack.frontend?.testing || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, testing: e.target.value } })} placeholder="e.g., Vitest, Jest" /></label>
                  <label><span className="field-label">Build Tool</span><input type="text" value={techStack.frontend?.buildTool || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, buildTool: e.target.value } })} placeholder="e.g., Vite, Webpack" /></label>
                </div>
                <label><span className="field-label">Rationale</span><textarea value={techStack.frontend?.rationale || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, rationale: e.target.value } })} rows={2} placeholder="Why these choices..." /></label>
                <h6>Additional Libraries</h6>
                {(techStack.frontend?.additionalLibraries || []).map((lib: { name: string; version?: string; purpose?: string }, li: number) => (
                  <div key={li} className="arch-context-edit">
                    <div className="editable-item-header">
                      <input type="text" value={lib.name || ''} onChange={(e) => { const libs = [...(techStack.frontend?.additionalLibraries || [])]; libs[li] = { ...lib, name: e.target.value }; handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, additionalLibraries: libs } }); }} placeholder="Library name" className="full-width-input" />
                      <button className="remove-btn" onClick={() => { const libs = (techStack.frontend?.additionalLibraries || []).filter((_: { name: string; version?: string; purpose?: string }, idx: number) => idx !== li); handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, additionalLibraries: libs } }); }}>×</button>
                    </div>
                    <div className="detail-row">
                      <input type="text" value={lib.version || ''} onChange={(e) => { const libs = [...(techStack.frontend?.additionalLibraries || [])]; libs[li] = { ...lib, version: e.target.value }; handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, additionalLibraries: libs } }); }} placeholder="Version" />
                      <input type="text" value={lib.purpose || ''} onChange={(e) => { const libs = [...(techStack.frontend?.additionalLibraries || [])]; libs[li] = { ...lib, purpose: e.target.value }; handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, additionalLibraries: libs } }); }} placeholder="Purpose" />
                    </div>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('techStack', { ...techStack, frontend: { ...techStack.frontend, additionalLibraries: [...(techStack.frontend?.additionalLibraries || []), { name: '', version: '', purpose: '' }] } })}>+ Add Library</button>
              </div>
            </div>
            <div className="tech-category-edit">
              <h5>Backend</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Framework</span><input type="text" value={techStack.backend?.framework || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, framework: e.target.value } })} placeholder="e.g., Express, NestJS" /></label>
                  <label><span className="field-label">Language</span><input type="text" value={techStack.backend?.language || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, language: e.target.value } })} placeholder="e.g., TypeScript, Python" /></label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">Runtime</span><input type="text" value={techStack.backend?.runtime || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, runtime: e.target.value } })} placeholder="e.g., Node.js, Deno" /></label>
                  <label><span className="field-label">API Style</span><input type="text" value={techStack.backend?.apiStyle || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, apiStyle: e.target.value } })} placeholder="e.g., REST, GraphQL" /></label>
                </div>
                <label><span className="field-label">Rationale</span><textarea value={techStack.backend?.rationale || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, rationale: e.target.value } })} rows={2} placeholder="Why these choices..." /></label>
                <h6>Additional Libraries</h6>
                {(techStack.backend?.additionalLibraries || []).map((lib: { name: string; version?: string; purpose?: string }, li: number) => (
                  <div key={li} className="arch-context-edit">
                    <div className="editable-item-header">
                      <input type="text" value={lib.name || ''} onChange={(e) => { const libs = [...(techStack.backend?.additionalLibraries || [])]; libs[li] = { ...lib, name: e.target.value }; handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, additionalLibraries: libs } }); }} placeholder="Library name" className="full-width-input" />
                      <button className="remove-btn" onClick={() => { const libs = (techStack.backend?.additionalLibraries || []).filter((_: { name: string; version?: string; purpose?: string }, idx: number) => idx !== li); handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, additionalLibraries: libs } }); }}>×</button>
                    </div>
                    <div className="detail-row">
                      <input type="text" value={lib.version || ''} onChange={(e) => { const libs = [...(techStack.backend?.additionalLibraries || [])]; libs[li] = { ...lib, version: e.target.value }; handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, additionalLibraries: libs } }); }} placeholder="Version" />
                      <input type="text" value={lib.purpose || ''} onChange={(e) => { const libs = [...(techStack.backend?.additionalLibraries || [])]; libs[li] = { ...lib, purpose: e.target.value }; handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, additionalLibraries: libs } }); }} placeholder="Purpose" />
                    </div>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('techStack', { ...techStack, backend: { ...techStack.backend, additionalLibraries: [...(techStack.backend?.additionalLibraries || []), { name: '', version: '', purpose: '' }] } })}>+ Add Library</button>
              </div>
            </div>
            <div className="tech-category-edit">
              <h5>Database</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Primary</span><input type="text" value={techStack.database?.primary || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, database: { ...techStack.database, primary: e.target.value } })} placeholder="e.g., PostgreSQL" /></label>
                  <label><span className="field-label">Secondary</span><input type="text" value={techStack.database?.secondary || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, database: { ...techStack.database, secondary: e.target.value } })} placeholder="e.g., Redis" /></label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">Caching</span><input type="text" value={techStack.database?.caching || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, database: { ...techStack.database, caching: e.target.value } })} placeholder="e.g., Redis, Memcached" /></label>
                  <label><span className="field-label">ORM</span><input type="text" value={techStack.database?.orm || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, database: { ...techStack.database, orm: e.target.value } })} placeholder="e.g., Prisma, TypeORM" /></label>
                </div>
                <label><span className="field-label">Schema Strategy</span><input type="text" value={techStack.database?.schemaStrategy || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, database: { ...techStack.database, schemaStrategy: e.target.value } })} placeholder="e.g., Code-first, DB-first" /></label>
                <label><span className="field-label">Rationale</span><textarea value={techStack.database?.rationale || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, database: { ...techStack.database, rationale: e.target.value } })} rows={2} placeholder="Why these choices..." /></label>
              </div>
            </div>
            <div className="tech-category-edit">
              <h5>Infrastructure</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Hosting</span><input type="text" value={techStack.infrastructure?.hosting || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, infrastructure: { ...techStack.infrastructure, hosting: e.target.value } })} placeholder="e.g., AWS, GCP, Azure" /></label>
                  <label><span className="field-label">Containerization</span><input type="text" value={techStack.infrastructure?.containerization || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, infrastructure: { ...techStack.infrastructure, containerization: e.target.value } })} placeholder="e.g., Docker" /></label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">Orchestration</span><input type="text" value={techStack.infrastructure?.orchestration || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, infrastructure: { ...techStack.infrastructure, orchestration: e.target.value } })} placeholder="e.g., Kubernetes, ECS" /></label>
                  <label><span className="field-label">CI/CD</span><input type="text" value={techStack.infrastructure?.cicd || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, infrastructure: { ...techStack.infrastructure, cicd: e.target.value } })} placeholder="e.g., GitHub Actions" /></label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">Monitoring</span><input type="text" value={techStack.infrastructure?.monitoring || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, infrastructure: { ...techStack.infrastructure, monitoring: e.target.value } })} placeholder="e.g., Datadog, Grafana" /></label>
                  <label><span className="field-label">Logging</span><input type="text" value={techStack.infrastructure?.logging || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, infrastructure: { ...techStack.infrastructure, logging: e.target.value } })} placeholder="e.g., ELK, CloudWatch" /></label>
                </div>
                <label><span className="field-label">Rationale</span><textarea value={techStack.infrastructure?.rationale || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, infrastructure: { ...techStack.infrastructure, rationale: e.target.value } })} rows={2} placeholder="Why these choices..." /></label>
              </div>
            </div>
            <div className="tech-category-edit">
              <h5>Dev Tools</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">IDE</span><input type="text" value={techStack.devTools?.ide || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, devTools: { ...techStack.devTools, ide: e.target.value } })} placeholder="e.g., VS Code" /></label>
                  <label><span className="field-label">Linting</span><input type="text" value={techStack.devTools?.linting || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, devTools: { ...techStack.devTools, linting: e.target.value } })} placeholder="e.g., ESLint" /></label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">Formatting</span><input type="text" value={techStack.devTools?.formatting || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, devTools: { ...techStack.devTools, formatting: e.target.value } })} placeholder="e.g., Prettier" /></label>
                  <label><span className="field-label">Version Control</span><input type="text" value={techStack.devTools?.versionControl || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, devTools: { ...techStack.devTools, versionControl: e.target.value } })} placeholder="e.g., Git" /></label>
                </div>
                <label><span className="field-label">Package Manager</span><input type="text" value={techStack.devTools?.packageManager || ''} onChange={(e) => handleFieldChange('techStack', { ...techStack, devTools: { ...techStack.devTools, packageManager: e.target.value } })} placeholder="e.g., npm, pnpm, yarn" /></label>
              </div>
            </div>
          </div>
        ) : (
          <div className="tech-stack-display">
            {techStack.frontend && (
              <div className="tech-category">
                <h5>Frontend</h5>
                <p>{techStack.frontend.framework} {techStack.frontend.language && `(${techStack.frontend.language})`}</p>
                {techStack.frontend.stateManagement && <p><strong>State:</strong> {techStack.frontend.stateManagement}</p>}
                {techStack.frontend.styling && <p><strong>Styling:</strong> {techStack.frontend.styling}</p>}
                {techStack.frontend.testing && <p><strong>Testing:</strong> {techStack.frontend.testing}</p>}
                {techStack.frontend.buildTool && <p><strong>Build:</strong> {techStack.frontend.buildTool}</p>}
                {techStack.frontend.rationale && <p className="step-detail">Rationale: {techStack.frontend.rationale}</p>}
                {techStack.frontend.additionalLibraries?.length > 0 && (
                  <div><strong>Libraries:</strong> {techStack.frontend.additionalLibraries.map((lib: { name: string; version?: string; purpose?: string }) => `${lib.name}${lib.version ? ` ${lib.version}` : ''}${lib.purpose ? ` (${lib.purpose})` : ''}`).join(', ')}</div>
                )}
              </div>
            )}
            {techStack.backend && (
              <div className="tech-category">
                <h5>Backend</h5>
                <p>{techStack.backend.framework} {techStack.backend.language && `(${techStack.backend.language})`}</p>
                {techStack.backend.runtime && <p><strong>Runtime:</strong> {techStack.backend.runtime}</p>}
                {techStack.backend.apiStyle && <p><strong>API Style:</strong> {techStack.backend.apiStyle}</p>}
                {techStack.backend.rationale && <p className="step-detail">Rationale: {techStack.backend.rationale}</p>}
                {techStack.backend.additionalLibraries?.length > 0 && (
                  <div><strong>Libraries:</strong> {techStack.backend.additionalLibraries.map((lib: { name: string; version?: string; purpose?: string }) => `${lib.name}${lib.version ? ` ${lib.version}` : ''}${lib.purpose ? ` (${lib.purpose})` : ''}`).join(', ')}</div>
                )}
              </div>
            )}
            {techStack.database && (
              <div className="tech-category">
                <h5>Database</h5>
                <p><strong>Primary:</strong> {techStack.database.primary}</p>
                {techStack.database.secondary && <p><strong>Secondary:</strong> {techStack.database.secondary}</p>}
                {techStack.database.caching && <p><strong>Caching:</strong> {techStack.database.caching}</p>}
                {techStack.database.orm && <p><strong>ORM:</strong> {techStack.database.orm}</p>}
                {techStack.database.schemaStrategy && <p><strong>Schema Strategy:</strong> {techStack.database.schemaStrategy}</p>}
                {techStack.database.rationale && <p className="step-detail">Rationale: {techStack.database.rationale}</p>}
                {techStack.database._extraItems?.length > 0 && (
                  <div><strong>Additional:</strong> {techStack.database._extraItems.join(', ')}</div>
                )}
              </div>
            )}
            {techStack.infrastructure && (
              <div className="tech-category">
                <h5>Infrastructure</h5>
                {techStack.infrastructure.hosting && <p><strong>Hosting:</strong> {techStack.infrastructure.hosting}</p>}
                {techStack.infrastructure.containerization && <p><strong>Containers:</strong> {techStack.infrastructure.containerization}</p>}
                {techStack.infrastructure.orchestration && <p><strong>Orchestration:</strong> {techStack.infrastructure.orchestration}</p>}
                {techStack.infrastructure.cicd && <p><strong>CI/CD:</strong> {techStack.infrastructure.cicd}</p>}
                {techStack.infrastructure.monitoring && <p><strong>Monitoring:</strong> {techStack.infrastructure.monitoring}</p>}
                {techStack.infrastructure.logging && <p><strong>Logging:</strong> {techStack.infrastructure.logging}</p>}
                {techStack.infrastructure.rationale && <p className="step-detail">Rationale: {techStack.infrastructure.rationale}</p>}
                {techStack.infrastructure._extraItems?.length > 0 && (
                  <div><strong>Additional:</strong> {techStack.infrastructure._extraItems.join(', ')}</div>
                )}
              </div>
            )}
            {techStack.devTools && (
              <div className="tech-category">
                <h5>Dev Tools</h5>
                {techStack.devTools.ide && <p><strong>IDE:</strong> {techStack.devTools.ide}</p>}
                {techStack.devTools.linting && <p><strong>Linting:</strong> {techStack.devTools.linting}</p>}
                {techStack.devTools.formatting && <p><strong>Formatting:</strong> {techStack.devTools.formatting}</p>}
                {techStack.devTools.versionControl && <p><strong>VCS:</strong> {techStack.devTools.versionControl}</p>}
                {techStack.devTools.packageManager && <p><strong>Package Manager:</strong> {techStack.devTools.packageManager}</p>}
              </div>
            )}
            {extraTechCategories.map((cat, ci) => (
              <div key={`extra-tech-${ci}`} className="tech-category">
                <h5>{cat.label}</h5>
                <ul>{cat.items.map((item, ii) => <li key={ii}>{item}</li>)}</ul>
              </div>
            ))}
            {!techStack.frontend && !techStack.backend && !techStack.database && !techStack.infrastructure && !techStack.devTools && extraTechCategories.length === 0 && (
              <p className="empty-message">No tech stack defined</p>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* Architecture Decisions (ADRs) */}
      <CollapsibleSection title="Architecture Decisions" count={decisions.length} sectionId="arch-decisions">
        {editMode ? (
          <div className="adrs-list">
            {decisions.map((adr: ArchitectureDecision, i: number) => (
              <div key={i} className="adr-item adr-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={adr.title || ''}
                    onChange={(e) => updateArrayItem('decisions', i, { ...adr, title: e.target.value })}
                    placeholder="Decision title"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('decisions', i)}>×</button>
                </div>
                <div className="detail-row">
                  <input
                    type="text"
                    value={adr.id || ''}
                    onChange={(e) => updateArrayItem('decisions', i, { ...adr, id: e.target.value })}
                    placeholder="ADR-001"
                  />
                  <select
                    value={adr.status || ''}
                    onChange={(e) => updateArrayItem('decisions', i, { ...adr, status: e.target.value as ArchitectureDecision['status'] })}
                  >
                    <option value="">Status...</option>
                    {['proposed', 'accepted', 'deprecated', 'superseded', 'draft', 'rejected'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={adr.date || ''}
                    onChange={(e) => updateArrayItem('decisions', i, { ...adr, date: e.target.value })}
                    placeholder="Date (e.g., 2025-01-15)"
                    style={{ width: '140px' }}
                  />
                </div>
                <textarea
                  value={adr.context || ''}
                  onChange={(e) => updateArrayItem('decisions', i, { ...adr, context: e.target.value })}
                  rows={2}
                  placeholder="Decision context..."
                />
                <textarea
                  value={adr.decision || ''}
                  onChange={(e) => updateArrayItem('decisions', i, { ...adr, decision: e.target.value })}
                  rows={2}
                  placeholder="Decision made..."
                />
                <textarea
                  value={adr.rationale || ''}
                  onChange={(e) => updateArrayItem('decisions', i, { ...adr, rationale: e.target.value })}
                  rows={2}
                  placeholder="Rationale for this decision..."
                />
                <div className="detail-row">
                  <input
                    type="text"
                    value={adr.supersedes || ''}
                    onChange={(e) => updateArrayItem('decisions', i, { ...adr, supersedes: e.target.value })}
                    placeholder="Supersedes (ADR ID)"
                  />
                  <input
                    type="text"
                    value={adr.supersededBy || ''}
                    onChange={(e) => updateArrayItem('decisions', i, { ...adr, supersededBy: e.target.value })}
                    placeholder="Superseded by (ADR ID)"
                  />
                </div>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('decisions', { id: '', title: '', status: 'proposed', context: '', decision: '', rationale: '' })}>+ Add Decision</button>
          </div>
        ) : decisions.length > 0 ? (
          <div className="adrs-list">
            {decisions.map((adr: ArchitectureDecision, i: number) => (
              <div key={i} className={`adr-item adr-${adr.status}`}>
                <div className="adr-header">
                  <span className="adr-id">{adr.id}</span>
                  <span className="adr-title">{adr.title}</span>
                  <span className={`adr-status status-${adr.status}`}>{adr.status}</span>
                  {adr.date && <span className="adr-date">{adr.date}</span>}
                </div>
                {adr.context && <p><strong>Context:</strong> {adr.context}</p>}
                <p className="adr-decision"><strong>Decision:</strong> {adr.decision}</p>
                {adr.rationale && <p><strong>Rationale:</strong> {adr.rationale}</p>}
                {adr.deciders?.length ? <p><strong>Deciders:</strong> {adr.deciders.join(', ')}</p> : null}
                {adr.consequences && (
                  <div className="adr-consequences">
                    {adr.consequences.positive?.length ? (
                      <p><strong>Positive:</strong> {adr.consequences.positive.join('; ')}</p>
                    ) : null}
                    {adr.consequences.negative?.length ? (
                      <p><strong>Negative:</strong> {adr.consequences.negative.join('; ')}</p>
                    ) : null}
                    {adr.consequences.neutral?.length ? (
                      <p><strong>Neutral:</strong> {adr.consequences.neutral.join('; ')}</p>
                    ) : null}
                  </div>
                )}
                {adr.alternatives?.length ? (
                  <div className="adr-alternatives">
                    <strong>Alternatives Considered:</strong>
                    <ul>
                      {adr.alternatives.map((alt, ai) => (
                        <li key={ai}>
                          <strong>{alt.option}</strong>
                          {alt.description && <span> — {alt.description}</span>}
                          {alt.rejectionReason && <span className="step-detail"> (Rejected: {alt.rejectionReason})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {adr.supersedes && (
                  <p><strong>Supersedes:</strong> {adr.supersedes}</p>
                )}
                {adr.supersededBy && (
                  <p><strong>Superseded By:</strong> {adr.supersededBy}</p>
                )}
                {adr.relatedDecisions?.length ? (
                  <p><strong>Related:</strong> {adr.relatedDecisions.join(', ')}</p>
                ) : null}
                {adr.implementationNotes?.length ? (
                  <p><strong>Implementation Notes:</strong> {adr.implementationNotes.join('; ')}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No architecture decisions defined</p>
        )}
      </CollapsibleSection>

      {/* Patterns */}
      <CollapsibleSection title="Patterns" count={patterns.length} sectionId="arch-patterns">
        {editMode ? (
          <div className="patterns-list">
            {patterns.map((pattern: any, i: number) => (
              <div key={i} className="pattern-item pattern-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={pattern.pattern || ''}
                    onChange={(e) => updateArrayItem('patterns', i, { ...pattern, pattern: e.target.value })}
                    placeholder="Pattern name"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('patterns', i)}>×</button>
                </div>
                <input
                  type="text"
                  value={pattern.category || ''}
                  onChange={(e) => updateArrayItem('patterns', i, { ...pattern, category: e.target.value })}
                  placeholder="Category (e.g., creational, structural, behavioral)"
                  className="full-width-input"
                />
                <textarea
                  value={pattern.usage || ''}
                  onChange={(e) => updateArrayItem('patterns', i, { ...pattern, usage: e.target.value })}
                  rows={2}
                  placeholder="How this pattern is used..."
                />
                <input
                  type="text"
                  value={pattern.rationale || ''}
                  onChange={(e) => updateArrayItem('patterns', i, { ...pattern, rationale: e.target.value })}
                  placeholder="Rationale..."
                  className="full-width-input"
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('patterns', { pattern: '', category: '', usage: '' })}>+ Add Pattern</button>
          </div>
        ) : patterns.length > 0 ? (
          <div className="patterns-list">
            {patterns.map((pattern: any, i: number) => (
              <div key={i} className="pattern-item">
                <p>
                  <span className="pattern-name">{pattern.pattern}</span>
                  {pattern.category && <span className="tag">{pattern.category}</span>}
                </p>
                {pattern.usage && <Md text={pattern.usage} className="pattern-usage" />}
                {pattern.implementation && <p><strong>Implementation:</strong> {pattern.implementation}</p>}
                {pattern.rationale && <p className="step-detail">Rationale: {pattern.rationale}</p>}
                {pattern.examples?.length > 0 && (
                  <div>
                    <strong>Examples:</strong>
                    <ul>{pattern.examples.map((ex: any, ei: number) => (
                      <li key={ei}><strong>{ex.name}</strong>{ex.location && ` @ ${ex.location}`}{ex.description && ` — ${ex.description}`}</li>
                    ))}</ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No patterns defined</p>
        )}
      </CollapsibleSection>

      {/* System Components */}
      <CollapsibleSection title="System Components" count={systemComponents.length} sectionId="arch-system-components">
        {editMode ? (
          <div className="components-list">
            {systemComponents.map((comp: any, i: number) => (
              <div key={i} className="component-item component-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={comp.name || ''}
                    onChange={(e) => updateArrayItem('systemComponents', i, { ...comp, name: e.target.value })}
                    placeholder="Component name"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('systemComponents', i)}>×</button>
                </div>
                <div className="detail-row">
                  <input
                    type="text"
                    value={comp.type || ''}
                    onChange={(e) => updateArrayItem('systemComponents', i, { ...comp, type: e.target.value })}
                    placeholder="Type (e.g., service, library)"
                  />
                  <input
                    type="text"
                    value={comp.technology || ''}
                    onChange={(e) => updateArrayItem('systemComponents', i, { ...comp, technology: e.target.value })}
                    placeholder="Technology"
                  />
                </div>
                <textarea
                  value={comp.description || ''}
                  onChange={(e) => updateArrayItem('systemComponents', i, { ...comp, description: e.target.value })}
                  rows={2}
                  placeholder="Component description..."
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('systemComponents', { name: '', type: '', technology: '', description: '' })}>+ Add Component</button>
          </div>
        ) : systemComponents.length > 0 ? (
          <div className="components-list">
            {systemComponents.map((comp: any, i: number) => (
              <div key={i} className="component-item">
                <h5>{comp.name}{comp.id && <span className="item-id"> ({comp.id})</span>}</h5>
                {comp.type && <span className="component-type tag">{comp.type}</span>}
                {comp.technology && <span className="tag">{comp.technology}</span>}
                {comp.description && <Md text={comp.description} />}
                {comp.responsibilities?.length > 0 && (
                  <div><strong>Responsibilities:</strong><ul>{comp.responsibilities.map((r: string, ri: number) => <li key={ri}>{r}</li>)}</ul></div>
                )}
                {comp.interfaces?.length > 0 && (
                  <div><strong>Interfaces:</strong><ul>{comp.interfaces.map((ifc: any, ii: number) => (
                    <li key={ii}><code>{ifc.name}</code>{ifc.type && ` (${ifc.type})`}{ifc.description && ` — ${ifc.description}`}</li>
                  ))}</ul></div>
                )}
                {comp.dependencies?.length > 0 && (
                  <p><strong>Dependencies:</strong> {comp.dependencies.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No components defined</p>
        )}
      </CollapsibleSection>

      {/* Project Structure */}
      {(editMode || projectStructure.description || projectStructure.structure?.length > 0 || projectStructure.namingConventions?.length > 0) && (
        <CollapsibleSection title="Project Structure" sectionId="arch-project-structure">
          {projectStructure.monorepo !== undefined && (
            <p><strong>Repository Type:</strong> {projectStructure.monorepo ? 'Monorepo' : 'Single Repo'}</p>
          )}
          {editMode ? (
            <div className="arch-context-edit">
              <div className="detail-row">
                <label><span className="field-label">Monorepo</span>
                  <select value={projectStructure.monorepo === true ? 'true' : projectStructure.monorepo === false ? 'false' : ''} onChange={(e) => handleFieldChange('projectStructure', { ...projectStructure, monorepo: e.target.value === '' ? undefined : e.target.value === 'true' })}>
                    <option value="">Not specified</option>
                    <option value="true">Yes (Monorepo)</option>
                    <option value="false">No (Single Repo)</option>
                  </select>
                </label>
              </div>
              <label><span className="field-label">Description</span>
                <textarea value={projectStructure.description || ''} onChange={(e) => handleFieldChange('projectStructure', { ...projectStructure, description: e.target.value })} rows={3} placeholder="Project structure overview..." />
              </label>
              <label><span className="field-label">Module Organization</span>
                <input type="text" value={projectStructure.moduleOrganization || ''} onChange={(e) => handleFieldChange('projectStructure', { ...projectStructure, moduleOrganization: e.target.value })} placeholder="e.g., Feature-based, Layer-based" />
              </label>
              <h5>Directory Structure ({(projectStructure.structure || []).length})</h5>
              {(projectStructure.structure || []).map((entry: { path: string; purpose?: string; contents?: string; conventions?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={entry.path || ''} onChange={(e) => { const updated = [...(projectStructure.structure || [])]; updated[i] = { ...entry, path: e.target.value }; handleFieldChange('projectStructure', { ...projectStructure, structure: updated }); }} placeholder="Path (e.g., src/components/)" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (projectStructure.structure || []).filter((_: { path: string; purpose?: string; contents?: string; conventions?: string }, idx: number) => idx !== i); handleFieldChange('projectStructure', { ...projectStructure, structure: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={entry.purpose || ''} onChange={(e) => { const updated = [...(projectStructure.structure || [])]; updated[i] = { ...entry, purpose: e.target.value }; handleFieldChange('projectStructure', { ...projectStructure, structure: updated }); }} placeholder="Purpose..." />
                    <input type="text" value={entry.contents || ''} onChange={(e) => { const updated = [...(projectStructure.structure || [])]; updated[i] = { ...entry, contents: e.target.value }; handleFieldChange('projectStructure', { ...projectStructure, structure: updated }); }} placeholder="Contents..." />
                  </div>
                  <input type="text" value={entry.conventions || ''} onChange={(e) => { const updated = [...(projectStructure.structure || [])]; updated[i] = { ...entry, conventions: e.target.value }; handleFieldChange('projectStructure', { ...projectStructure, structure: updated }); }} placeholder="Conventions..." className="full-width-input" />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('projectStructure', { ...projectStructure, structure: [...(projectStructure.structure || []), { path: '', purpose: '', contents: '', conventions: '' }] })}>+ Add Directory Entry</button>
              <h5>Naming Conventions ({(projectStructure.namingConventions || []).length})</h5>
              {(projectStructure.namingConventions || []).map((nc: { type: string; convention?: string; example?: string; rationale?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={nc.type || ''} onChange={(e) => { const updated = [...(projectStructure.namingConventions || [])]; updated[i] = { ...nc, type: e.target.value }; handleFieldChange('projectStructure', { ...projectStructure, namingConventions: updated }); }} placeholder="Type (e.g., components, files)" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (projectStructure.namingConventions || []).filter((_: { type: string; convention?: string; example?: string; rationale?: string }, idx: number) => idx !== i); handleFieldChange('projectStructure', { ...projectStructure, namingConventions: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={nc.convention || ''} onChange={(e) => { const updated = [...(projectStructure.namingConventions || [])]; updated[i] = { ...nc, convention: e.target.value }; handleFieldChange('projectStructure', { ...projectStructure, namingConventions: updated }); }} placeholder="Convention..." />
                    <input type="text" value={nc.example || ''} onChange={(e) => { const updated = [...(projectStructure.namingConventions || [])]; updated[i] = { ...nc, example: e.target.value }; handleFieldChange('projectStructure', { ...projectStructure, namingConventions: updated }); }} placeholder="Example..." />
                  </div>
                  <input type="text" value={nc.rationale || ''} onChange={(e) => { const updated = [...(projectStructure.namingConventions || [])]; updated[i] = { ...nc, rationale: e.target.value }; handleFieldChange('projectStructure', { ...projectStructure, namingConventions: updated }); }} placeholder="Rationale..." className="full-width-input" />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('projectStructure', { ...projectStructure, namingConventions: [...(projectStructure.namingConventions || []), { type: '', convention: '', example: '', rationale: '' }] })}>+ Add Naming Convention</button>
            </div>
          ) : (
            <>
              {projectStructure.description && <Md text={projectStructure.description} />}
              {projectStructure.moduleOrganization && <p><strong>Module Organization:</strong> {projectStructure.moduleOrganization}</p>}
              {projectStructure.structure?.length > 0 && (
                <div>
                  <h5>Directory Structure</h5>
                  <ul>
                    {projectStructure.structure.map((entry: { path: string; purpose?: string; contents?: string; conventions?: string }, i: number) => (
                      <li key={i}>
                        <code>{entry.path}</code>
                        {entry.purpose && <span> — {entry.purpose}</span>}
                        {entry.contents && <span className="step-detail"> ({entry.contents})</span>}
                        {entry.conventions && <span className="step-detail"> [Convention: {entry.conventions}]</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {projectStructure.namingConventions?.length > 0 && (
                <div>
                  <h5>Naming Conventions</h5>
                  <ul>
                    {projectStructure.namingConventions.map((nc: { type: string; convention?: string; example?: string; rationale?: string }, i: number) => (
                      <li key={i}>
                        <strong>{nc.type}:</strong> {nc.convention}
                        {nc.example && <code> e.g., {nc.example}</code>}
                        {nc.rationale && <span className="step-detail"> ({nc.rationale})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!projectStructure.description && !(projectStructure.structure?.length > 0) && !(projectStructure.namingConventions?.length > 0) && (
                <p className="empty-message">No project structure defined</p>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Data Flow */}
      {(editMode || dataFlow.description || dataFlow.flows?.length > 0 || dataFlow.diagrams?.length > 0) && (
        <CollapsibleSection title="Data Flow" sectionId="arch-data-flow">
          {editMode ? (
            <div className="arch-context-edit">
              <label><span className="field-label">Description</span>
                <textarea value={dataFlow.description || ''} onChange={(e) => handleFieldChange('dataFlow', { ...dataFlow, description: e.target.value })} rows={3} placeholder="Data flow overview..." />
              </label>
              <h5>Flows ({(dataFlow.flows || []).length})</h5>
              {(dataFlow.flows || []).map((flow: { id?: string; name: string; description?: string; source?: string; destination?: string; dataType?: string; protocol?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={flow.name || ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, name: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} placeholder="Flow name" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (dataFlow.flows || []).filter((_: { id?: string; name: string; description?: string; source?: string; destination?: string; dataType?: string; protocol?: string }, idx: number) => idx !== i); handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={flow.id || ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, id: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} placeholder="ID" />
                    <input type="text" value={flow.protocol || ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, protocol: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} placeholder="Protocol" />
                  </div>
                  <div className="detail-row">
                    <input type="text" value={flow.source || ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, source: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} placeholder="Source" />
                    <input type="text" value={flow.destination || ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, destination: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} placeholder="Destination" />
                    <input type="text" value={flow.dataType || ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, dataType: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} placeholder="Data type" />
                  </div>
                  <textarea value={flow.description || ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, description: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} rows={2} placeholder="Description..." />
                  <input type="text" value={Array.isArray((flow as any).transformations) ? (flow as any).transformations.join(', ') : ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, transformations: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} placeholder="Transformations (comma-separated)" className="full-width-input" />
                  <input type="text" value={(flow as any).validation || ''} onChange={(e) => { const updated = [...(dataFlow.flows || [])]; updated[i] = { ...flow, validation: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, flows: updated }); }} placeholder="Validation rules" className="full-width-input" />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('dataFlow', { ...dataFlow, flows: [...(dataFlow.flows || []), { name: '', source: '', destination: '', dataType: '', protocol: '' }] })}>+ Add Flow</button>
              <h5>Diagrams ({(dataFlow.diagrams || []).length})</h5>
              {(dataFlow.diagrams || []).map((d: { name: string; type?: string; description?: string; reference?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={d.name || ''} onChange={(e) => { const updated = [...(dataFlow.diagrams || [])]; updated[i] = { ...d, name: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, diagrams: updated }); }} placeholder="Diagram name" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (dataFlow.diagrams || []).filter((_: { name: string; type?: string; description?: string; reference?: string }, idx: number) => idx !== i); handleFieldChange('dataFlow', { ...dataFlow, diagrams: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={d.type || ''} onChange={(e) => { const updated = [...(dataFlow.diagrams || [])]; updated[i] = { ...d, type: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, diagrams: updated }); }} placeholder="Type" />
                    <input type="text" value={d.reference || ''} onChange={(e) => { const updated = [...(dataFlow.diagrams || [])]; updated[i] = { ...d, reference: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, diagrams: updated }); }} placeholder="Reference / URL" />
                  </div>
                  <input type="text" value={d.description || ''} onChange={(e) => { const updated = [...(dataFlow.diagrams || [])]; updated[i] = { ...d, description: e.target.value }; handleFieldChange('dataFlow', { ...dataFlow, diagrams: updated }); }} placeholder="Description..." className="full-width-input" />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('dataFlow', { ...dataFlow, diagrams: [...(dataFlow.diagrams || []), { name: '', type: '', description: '', reference: '' }] })}>+ Add Diagram</button>
            </div>
          ) : (
            <>
              {dataFlow.description && <p>{dataFlow.description}</p>}
              {dataFlow.flows?.length > 0 && (
                <div>
                  <h5>Flows ({dataFlow.flows.length})</h5>
                  {dataFlow.flows.map((flow: { id?: string; name: string; description?: string; source?: string; destination?: string; dataType?: string; protocol?: string; transformations?: string[]; validation?: string }, i: number) => (
                    <div key={i} className="flow-item">
                      <p>
                        {flow.id && <span className="item-id">{flow.id}</span>}
                        <strong>{flow.name || `Flow ${i + 1}`}</strong>
                        {flow.protocol && <span className="tag">{flow.protocol}</span>}
                      </p>
                      {flow.description && <p>{flow.description}</p>}
                      {(flow.source || flow.destination) && (
                        <p><strong>{flow.source || '?'}</strong> → <strong>{flow.destination || '?'}</strong>{flow.dataType && ` (${flow.dataType})`}</p>
                      )}
                      {flow.transformations?.length ? (
                        <p><strong>Transformations:</strong> {flow.transformations.join(', ')}</p>
                      ) : null}
                      {flow.validation && <p><strong>Validation:</strong> {flow.validation}</p>}
                    </div>
                  ))}
                </div>
              )}
              {dataFlow.diagrams?.length > 0 && (
                <div>
                  <h5>Diagrams</h5>
                  <ul>{dataFlow.diagrams.map((d: { name: string; type?: string; description?: string; reference?: string }, i: number) => (
                    <li key={i}><strong>{d.name}</strong>{d.type && ` (${d.type})`}{d.description && ` — ${d.description}`}{d.reference && ` [${d.reference}]`}</li>
                  ))}</ul>
                </div>
              )}
              {!dataFlow.description && !(dataFlow.flows?.length > 0) && !(dataFlow.diagrams?.length > 0) && (
                <p className="empty-message">No data flow defined</p>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Security */}
      {(editMode || security.overview || security.authentication || security.authorization || security.dataProtection || security.securityPatterns?.length > 0 || security.threats?.length > 0 || security.compliance?.length > 0) && (
        <CollapsibleSection title="Security Architecture" sectionId="arch-security">
          {editMode ? (
            <div className="arch-context-edit">
              <label><span className="field-label">Overview</span>
                <textarea value={security.overview || ''} onChange={(e) => handleFieldChange('security', { ...security, overview: e.target.value })} rows={3} placeholder="Security architecture overview..." />
              </label>
              <h5>Authentication</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Method</span>
                    <input type="text" value={security.authentication?.method || ''} onChange={(e) => handleFieldChange('security', { ...security, authentication: { ...security.authentication, method: e.target.value } })} placeholder="e.g., JWT, OAuth2, Session" />
                  </label>
                  <label><span className="field-label">Provider</span>
                    <input type="text" value={security.authentication?.provider || ''} onChange={(e) => handleFieldChange('security', { ...security, authentication: { ...security.authentication, provider: e.target.value } })} placeholder="e.g., Auth0, Firebase Auth" />
                  </label>
                </div>
                <label><span className="field-label">Description</span>
                  <textarea value={security.authentication?.description || ''} onChange={(e) => handleFieldChange('security', { ...security, authentication: { ...security.authentication, description: e.target.value } })} rows={2} placeholder="Authentication description..." />
                </label>
                <div className="detail-row">
                  <label><span className="field-label">Token Strategy</span>
                    <input type="text" value={security.authentication?.tokenStrategy || ''} onChange={(e) => handleFieldChange('security', { ...security, authentication: { ...security.authentication, tokenStrategy: e.target.value } })} placeholder="e.g., Short-lived access + refresh" />
                  </label>
                  <label><span className="field-label">Session Management</span>
                    <input type="text" value={security.authentication?.sessionManagement || ''} onChange={(e) => handleFieldChange('security', { ...security, authentication: { ...security.authentication, sessionManagement: e.target.value } })} placeholder="e.g., Stateless JWT" />
                  </label>
                </div>
              </div>
              <h5>Authorization</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Method</span>
                    <input type="text" value={security.authorization?.method || ''} onChange={(e) => handleFieldChange('security', { ...security, authorization: { ...security.authorization, method: e.target.value } })} placeholder="e.g., RBAC, ABAC" />
                  </label>
                </div>
                <label><span className="field-label">Description</span>
                  <textarea value={security.authorization?.description || ''} onChange={(e) => handleFieldChange('security', { ...security, authorization: { ...security.authorization, description: e.target.value } })} rows={2} placeholder="Authorization description..." />
                </label>
                <h6>Roles ({(security.authorization?.roles || []).length})</h6>
                {(security.authorization?.roles || []).map((r: { role: string; permissions?: string[] }, i: number) => (
                  <div key={i} className="arch-context-edit">
                    <div className="editable-item-header">
                      <input type="text" value={r.role || ''} onChange={(e) => { const roles = [...(security.authorization?.roles || [])]; roles[i] = { ...r, role: e.target.value }; handleFieldChange('security', { ...security, authorization: { ...security.authorization, roles } }); }} placeholder="Role name" className="full-width-input" />
                      <button className="remove-btn" onClick={() => { const roles = (security.authorization?.roles || []).filter((_: { role: string; permissions?: string[] }, idx: number) => idx !== i); handleFieldChange('security', { ...security, authorization: { ...security.authorization, roles } }); }}>×</button>
                    </div>
                    <input type="text" value={(r.permissions || []).join(', ')} onChange={(e) => { const roles = [...(security.authorization?.roles || [])]; roles[i] = { ...r, permissions: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }; handleFieldChange('security', { ...security, authorization: { ...security.authorization, roles } }); }} placeholder="Permissions (comma-separated)" className="full-width-input" />
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('security', { ...security, authorization: { ...security.authorization, roles: [...(security.authorization?.roles || []), { role: '', permissions: [] }] } })}>+ Add Role</button>
              </div>
              <h5>Data Protection</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">At Rest</span>
                    <input type="text" value={security.dataProtection?.atRest || ''} onChange={(e) => handleFieldChange('security', { ...security, dataProtection: { ...security.dataProtection, atRest: e.target.value } })} placeholder="e.g., AES-256 encryption" />
                  </label>
                  <label><span className="field-label">In Transit</span>
                    <input type="text" value={security.dataProtection?.inTransit || ''} onChange={(e) => handleFieldChange('security', { ...security, dataProtection: { ...security.dataProtection, inTransit: e.target.value } })} placeholder="e.g., TLS 1.3" />
                  </label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">Sensitive Data</span>
                    <input type="text" value={security.dataProtection?.sensitiveData || ''} onChange={(e) => handleFieldChange('security', { ...security, dataProtection: { ...security.dataProtection, sensitiveData: e.target.value } })} placeholder="Handling strategy..." />
                  </label>
                  <label><span className="field-label">PII</span>
                    <input type="text" value={security.dataProtection?.pii || ''} onChange={(e) => handleFieldChange('security', { ...security, dataProtection: { ...security.dataProtection, pii: e.target.value } })} placeholder="PII handling..." />
                  </label>
                </div>
              </div>
              <h5>Security Patterns ({(security.securityPatterns || []).length})</h5>
              {(security.securityPatterns || []).map((sp: { pattern: string; description?: string; implementation?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={sp.pattern || ''} onChange={(e) => { const updated = [...(security.securityPatterns || [])]; updated[i] = { ...sp, pattern: e.target.value }; handleFieldChange('security', { ...security, securityPatterns: updated }); }} placeholder="Pattern name" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (security.securityPatterns || []).filter((_: { pattern: string; description?: string; implementation?: string }, idx: number) => idx !== i); handleFieldChange('security', { ...security, securityPatterns: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={sp.description || ''} onChange={(e) => { const updated = [...(security.securityPatterns || [])]; updated[i] = { ...sp, description: e.target.value }; handleFieldChange('security', { ...security, securityPatterns: updated }); }} placeholder="Description" />
                    <input type="text" value={sp.implementation || ''} onChange={(e) => { const updated = [...(security.securityPatterns || [])]; updated[i] = { ...sp, implementation: e.target.value }; handleFieldChange('security', { ...security, securityPatterns: updated }); }} placeholder="Implementation" />
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('security', { ...security, securityPatterns: [...(security.securityPatterns || []), { pattern: '', description: '', implementation: '' }] })}>+ Add Security Pattern</button>
              <h5>Threats ({(security.threats || []).length})</h5>
              {(security.threats || []).map((t: { threat: string; category?: string; mitigation?: string; status?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={t.threat || ''} onChange={(e) => { const updated = [...(security.threats || [])]; updated[i] = { ...t, threat: e.target.value }; handleFieldChange('security', { ...security, threats: updated }); }} placeholder="Threat description" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (security.threats || []).filter((_: { threat: string; category?: string; mitigation?: string; status?: string }, idx: number) => idx !== i); handleFieldChange('security', { ...security, threats: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={t.category || ''} onChange={(e) => { const updated = [...(security.threats || [])]; updated[i] = { ...t, category: e.target.value }; handleFieldChange('security', { ...security, threats: updated }); }} placeholder="Category" />
                    <select value={t.status || ''} onChange={(e) => { const updated = [...(security.threats || [])]; updated[i] = { ...t, status: e.target.value }; handleFieldChange('security', { ...security, threats: updated }); }}>
                      <option value="">Status...</option>
                      {['identified', 'mitigated', 'accepted', 'monitoring'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <input type="text" value={t.mitigation || ''} onChange={(e) => { const updated = [...(security.threats || [])]; updated[i] = { ...t, mitigation: e.target.value }; handleFieldChange('security', { ...security, threats: updated }); }} placeholder="Mitigation..." className="full-width-input" />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('security', { ...security, threats: [...(security.threats || []), { threat: '', category: '', mitigation: '', status: '' }] })}>+ Add Threat</button>
              <h5>Compliance ({(security.compliance || []).length})</h5>
              {(security.compliance || []).map((c: { standard: string; requirements?: string[]; implementation?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={c.standard || ''} onChange={(e) => { const updated = [...(security.compliance || [])]; updated[i] = { ...c, standard: e.target.value }; handleFieldChange('security', { ...security, compliance: updated }); }} placeholder="Standard (e.g., GDPR, SOC2)" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (security.compliance || []).filter((_: { standard: string; requirements?: string[]; implementation?: string }, idx: number) => idx !== i); handleFieldChange('security', { ...security, compliance: updated }); }}>×</button>
                  </div>
                  <input type="text" value={(c.requirements || []).join(', ')} onChange={(e) => { const updated = [...(security.compliance || [])]; updated[i] = { ...c, requirements: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }; handleFieldChange('security', { ...security, compliance: updated }); }} placeholder="Requirements (comma-separated)" className="full-width-input" />
                  <input type="text" value={c.implementation || ''} onChange={(e) => { const updated = [...(security.compliance || [])]; updated[i] = { ...c, implementation: e.target.value }; handleFieldChange('security', { ...security, compliance: updated }); }} placeholder="Implementation details..." className="full-width-input" />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('security', { ...security, compliance: [...(security.compliance || []), { standard: '', requirements: [], implementation: '' }] })}>+ Add Compliance Standard</button>
            </div>
          ) : (
            <>
              {security.overview && <p>{security.overview}</p>}
              {security.authentication && (
                <div>
                  <h5>Authentication</h5>
                  {security.authentication.method && <p><strong>Method:</strong> {security.authentication.method}</p>}
                  {security.authentication.description && <p>{security.authentication.description}</p>}
                  {security.authentication.provider && <p><strong>Provider:</strong> {security.authentication.provider}</p>}
                  {security.authentication.tokenStrategy && <p><strong>Token Strategy:</strong> {security.authentication.tokenStrategy}</p>}
                  {security.authentication.sessionManagement && <p><strong>Session:</strong> {security.authentication.sessionManagement}</p>}
                </div>
              )}
              {security.authorization && (
                <div>
                  <h5>Authorization</h5>
                  {security.authorization.method && <p><strong>Method:</strong> {security.authorization.method}</p>}
                  {security.authorization.description && <p>{security.authorization.description}</p>}
                  {security.authorization.roles?.length > 0 && (
                    <ul>{security.authorization.roles.map((r: { role: string; permissions?: string[] }, i: number) => (
                      <li key={i}><strong>{r.role}</strong>{r.permissions?.length ? `: ${r.permissions.join(', ')}` : ''}</li>
                    ))}</ul>
                  )}
                </div>
              )}
              {security.dataProtection && (
                <div>
                  <h5>Data Protection</h5>
                  {security.dataProtection.atRest && <p><strong>At Rest:</strong> {security.dataProtection.atRest}</p>}
                  {security.dataProtection.inTransit && <p><strong>In Transit:</strong> {security.dataProtection.inTransit}</p>}
                  {security.dataProtection.sensitiveData && <p><strong>Sensitive Data:</strong> {security.dataProtection.sensitiveData}</p>}
                  {security.dataProtection.pii && <p><strong>PII:</strong> {security.dataProtection.pii}</p>}
                </div>
              )}
              {security.securityPatterns?.length > 0 && (
                <div>
                  <h5>Security Patterns</h5>
                  <ul>{security.securityPatterns.map((sp: { pattern: string; description?: string; implementation?: string }, i: number) => (
                    <li key={i}><strong>{sp.pattern}</strong>{sp.description && ` — ${sp.description}`}{sp.implementation && <span className="step-detail"> ({sp.implementation})</span>}</li>
                  ))}</ul>
                </div>
              )}
              {security.threats?.length > 0 && (
                <div>
                  <h5>Threats ({security.threats.length})</h5>
                  <ul>{security.threats.map((t: { threat: string; category?: string; mitigation?: string; status?: string }, i: number) => (
                    <li key={i}>
                      <strong>{t.threat}</strong>
                      {t.category && <span className="tag">{t.category}</span>}
                      {t.status && <span className={`tag tag-${t.status}`}>{t.status}</span>}
                      {t.mitigation && <span> — Mitigation: {t.mitigation}</span>}
                    </li>
                  ))}</ul>
                </div>
              )}
              {security.compliance?.length > 0 && (
                <div>
                  <h5>Compliance</h5>
                  <ul>{security.compliance.map((c: { standard: string; requirements?: string[]; implementation?: string }, i: number) => (
                    <li key={i}>
                      <strong>{c.standard}</strong>
                      {c.requirements?.length ? <span>: {c.requirements.join(', ')}</span> : null}
                      {c.implementation && <span className="step-detail"> ({c.implementation})</span>}
                    </li>
                  ))}</ul>
                </div>
              )}
              {!security.overview && !security.authentication && !security.authorization && !security.dataProtection && !(security.securityPatterns?.length > 0) && !(security.threats?.length > 0) && !(security.compliance?.length > 0) && (
                <p className="empty-message">No security architecture defined</p>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Scalability */}
      {(editMode || scalability.strategy || scalability.horizontalScaling || scalability.verticalScaling || scalability.bottlenecks?.length > 0 || scalability.capacityPlanning) && (
        <CollapsibleSection title="Scalability" sectionId="arch-scalability">
          {editMode ? (
            <div className="arch-context-edit">
              <label><span className="field-label">Strategy</span>
                <textarea value={scalability.strategy || ''} onChange={(e) => handleFieldChange('scalability', { ...scalability, strategy: e.target.value })} rows={3} placeholder="Scalability strategy overview..." />
              </label>
              <h5>Horizontal Scaling</h5>
              <div className="arch-context-edit">
                <label><span className="field-label">Approach</span>
                  <textarea value={scalability.horizontalScaling?.approach || ''} onChange={(e) => handleFieldChange('scalability', { ...scalability, horizontalScaling: { ...scalability.horizontalScaling, approach: e.target.value } })} rows={2} placeholder="Horizontal scaling approach..." />
                </label>
                <label><span className="field-label">Triggers</span>
                  <input type="text" value={(scalability.horizontalScaling?.triggers || []).join(', ')} onChange={(e) => handleFieldChange('scalability', { ...scalability, horizontalScaling: { ...scalability.horizontalScaling, triggers: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })} placeholder="Triggers (comma-separated)" />
                </label>
                <label><span className="field-label">Limitations</span>
                  <input type="text" value={(scalability.horizontalScaling?.limitations || []).join(', ')} onChange={(e) => handleFieldChange('scalability', { ...scalability, horizontalScaling: { ...scalability.horizontalScaling, limitations: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })} placeholder="Limitations (comma-separated)" />
                </label>
              </div>
              <h5>Vertical Scaling</h5>
              <div className="arch-context-edit">
                <label><span className="field-label">Approach</span>
                  <textarea value={scalability.verticalScaling?.approach || ''} onChange={(e) => handleFieldChange('scalability', { ...scalability, verticalScaling: { ...scalability.verticalScaling, approach: e.target.value } })} rows={2} placeholder="Vertical scaling approach..." />
                </label>
                <label><span className="field-label">Limits</span>
                  <input type="text" value={scalability.verticalScaling?.limits || ''} onChange={(e) => handleFieldChange('scalability', { ...scalability, verticalScaling: { ...scalability.verticalScaling, limits: e.target.value } })} placeholder="Scaling limits..." />
                </label>
              </div>
              <h5>Bottlenecks ({(scalability.bottlenecks || []).length})</h5>
              {(scalability.bottlenecks || []).map((b: { area: string; description?: string; severity?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={b.area || ''} onChange={(e) => { const updated = [...(scalability.bottlenecks || [])]; updated[i] = { ...b, area: e.target.value }; handleFieldChange('scalability', { ...scalability, bottlenecks: updated }); }} placeholder="Area" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (scalability.bottlenecks || []).filter((_: { area: string; description?: string; severity?: string }, idx: number) => idx !== i); handleFieldChange('scalability', { ...scalability, bottlenecks: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <select value={b.severity || ''} onChange={(e) => { const updated = [...(scalability.bottlenecks || [])]; updated[i] = { ...b, severity: e.target.value }; handleFieldChange('scalability', { ...scalability, bottlenecks: updated }); }}>
                      <option value="">Severity...</option>
                      {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="text" value={b.description || ''} onChange={(e) => { const updated = [...(scalability.bottlenecks || [])]; updated[i] = { ...b, description: e.target.value }; handleFieldChange('scalability', { ...scalability, bottlenecks: updated }); }} placeholder="Description" />
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('scalability', { ...scalability, bottlenecks: [...(scalability.bottlenecks || []), { area: '', description: '', severity: '' }] })}>+ Add Bottleneck</button>
              <h5>Mitigations ({(scalability.mitigations || []).length})</h5>
              {(scalability.mitigations || []).map((m: { bottleneck: string; mitigation?: string; implementation?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={m.bottleneck || ''} onChange={(e) => { const updated = [...(scalability.mitigations || [])]; updated[i] = { ...m, bottleneck: e.target.value }; handleFieldChange('scalability', { ...scalability, mitigations: updated }); }} placeholder="Bottleneck" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (scalability.mitigations || []).filter((_: { bottleneck: string; mitigation?: string; implementation?: string }, idx: number) => idx !== i); handleFieldChange('scalability', { ...scalability, mitigations: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={m.mitigation || ''} onChange={(e) => { const updated = [...(scalability.mitigations || [])]; updated[i] = { ...m, mitigation: e.target.value }; handleFieldChange('scalability', { ...scalability, mitigations: updated }); }} placeholder="Mitigation" />
                    <input type="text" value={m.implementation || ''} onChange={(e) => { const updated = [...(scalability.mitigations || [])]; updated[i] = { ...m, implementation: e.target.value }; handleFieldChange('scalability', { ...scalability, mitigations: updated }); }} placeholder="Implementation" />
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('scalability', { ...scalability, mitigations: [...(scalability.mitigations || []), { bottleneck: '', mitigation: '', implementation: '' }] })}>+ Add Mitigation</button>
            </div>
          ) : (
            <>
              {scalability.strategy && <p>{scalability.strategy}</p>}
              {scalability.horizontalScaling && (
                <div>
                  <h5>Horizontal Scaling</h5>
                  {scalability.horizontalScaling.approach && <p>{scalability.horizontalScaling.approach}</p>}
                  {scalability.horizontalScaling.triggers?.length > 0 && <p><strong>Triggers:</strong> {scalability.horizontalScaling.triggers.join(', ')}</p>}
                  {scalability.horizontalScaling.limitations?.length > 0 && <p><strong>Limitations:</strong> {scalability.horizontalScaling.limitations.join(', ')}</p>}
                </div>
              )}
              {scalability.verticalScaling && (
                <div>
                  <h5>Vertical Scaling</h5>
                  {scalability.verticalScaling.approach && <p>{scalability.verticalScaling.approach}</p>}
                  {scalability.verticalScaling.limits && <p><strong>Limits:</strong> {scalability.verticalScaling.limits}</p>}
                </div>
              )}
              {scalability.bottlenecks?.length > 0 && (
                <div>
                  <h5>Bottlenecks ({scalability.bottlenecks.length})</h5>
                  <ul>{scalability.bottlenecks.map((b: { area: string; description?: string; severity?: string }, i: number) => (
                    <li key={i}>
                      <strong>{b.area}</strong>
                      {b.severity && <span className={`tag tag-${b.severity}`}>{b.severity}</span>}
                      {b.description && <span> — {b.description}</span>}
                    </li>
                  ))}</ul>
                </div>
              )}
              {scalability.mitigations?.length > 0 && (
                <div>
                  <h5>Mitigations</h5>
                  <ul>{scalability.mitigations.map((m: { bottleneck: string; mitigation?: string; implementation?: string }, i: number) => (
                    <li key={i}><strong>{m.bottleneck}:</strong> {m.mitigation}{m.implementation && <span className="step-detail"> ({m.implementation})</span>}</li>
                  ))}</ul>
                </div>
              )}
              {scalability.capacityPlanning && (
                <div>
                  <h5>Capacity Planning</h5>
                  {scalability.capacityPlanning.currentCapacity && <p><strong>Current:</strong> {scalability.capacityPlanning.currentCapacity}</p>}
                  {scalability.capacityPlanning.projectedGrowth && <p><strong>Projected Growth:</strong> {scalability.capacityPlanning.projectedGrowth}</p>}
                  {scalability.capacityPlanning.scalingThresholds?.length > 0 && <p><strong>Thresholds:</strong> {scalability.capacityPlanning.scalingThresholds.join(', ')}</p>}
                </div>
              )}
              {!scalability.strategy && !scalability.horizontalScaling && !scalability.verticalScaling && !(scalability.bottlenecks?.length > 0) && !scalability.capacityPlanning && (
                <p className="empty-message">No scalability defined</p>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Reliability */}
      {(editMode || reliability.availabilityTarget || reliability.faultTolerance || reliability.errorHandling || reliability.backupStrategy) && (
        <CollapsibleSection title="Reliability" sectionId="arch-reliability">
          {editMode ? (
            <div className="arch-context-edit">
              <label><span className="field-label">Availability Target</span>
                <input type="text" value={reliability.availabilityTarget || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, availabilityTarget: e.target.value })} placeholder="e.g., 99.9% uptime" />
              </label>
              <h5>Fault Tolerance</h5>
              <div className="arch-context-edit">
                <label><span className="field-label">Strategy</span>
                  <textarea value={reliability.faultTolerance?.strategy || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, faultTolerance: { ...reliability.faultTolerance, strategy: e.target.value } })} rows={2} placeholder="Fault tolerance strategy..." />
                </label>
                <div className="detail-row">
                  <label><span className="field-label">Failover Mechanism</span>
                    <input type="text" value={reliability.faultTolerance?.failoverMechanism || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, faultTolerance: { ...reliability.faultTolerance, failoverMechanism: e.target.value } })} placeholder="Failover approach..." />
                  </label>
                  <label><span className="field-label">Recovery Time</span>
                    <input type="text" value={reliability.faultTolerance?.recoveryTime || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, faultTolerance: { ...reliability.faultTolerance, recoveryTime: e.target.value } })} placeholder="e.g., < 5 minutes" />
                  </label>
                </div>
              </div>
              <h5>Error Handling</h5>
              <div className="arch-context-edit">
                <label><span className="field-label">Strategy</span>
                  <textarea value={reliability.errorHandling?.strategy || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, errorHandling: { ...reliability.errorHandling, strategy: e.target.value } })} rows={2} placeholder="Error handling strategy..." />
                </label>
                <div className="detail-row">
                  <label><span className="field-label">Retry Policy</span>
                    <input type="text" value={reliability.errorHandling?.retryPolicy || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, errorHandling: { ...reliability.errorHandling, retryPolicy: e.target.value } })} placeholder="e.g., Exponential backoff" />
                  </label>
                  <label><span className="field-label">Circuit Breaker</span>
                    <input type="text" value={reliability.errorHandling?.circuitBreaker || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, errorHandling: { ...reliability.errorHandling, circuitBreaker: e.target.value } })} placeholder="Circuit breaker config..." />
                  </label>
                </div>
              </div>
              <h5>Backup Strategy</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Frequency</span>
                    <input type="text" value={reliability.backupStrategy?.frequency || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, backupStrategy: { ...reliability.backupStrategy, frequency: e.target.value } })} placeholder="e.g., Daily, Hourly" />
                  </label>
                  <label><span className="field-label">Retention</span>
                    <input type="text" value={reliability.backupStrategy?.retention || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, backupStrategy: { ...reliability.backupStrategy, retention: e.target.value } })} placeholder="e.g., 30 days" />
                  </label>
                </div>
                <label><span className="field-label">Recovery Process</span>
                  <textarea value={reliability.backupStrategy?.recoveryProcess || ''} onChange={(e) => handleFieldChange('reliability', { ...reliability, backupStrategy: { ...reliability.backupStrategy, recoveryProcess: e.target.value } })} rows={2} placeholder="Recovery process description..." />
                </label>
              </div>
            </div>
          ) : (
            <>
              {reliability.availabilityTarget && <p><strong>Availability Target:</strong> {reliability.availabilityTarget}</p>}
              {reliability.faultTolerance && (
                <div>
                  <h5>Fault Tolerance</h5>
                  {reliability.faultTolerance.strategy && <p><strong>Strategy:</strong> {reliability.faultTolerance.strategy}</p>}
                  {reliability.faultTolerance.failoverMechanism && <p><strong>Failover:</strong> {reliability.faultTolerance.failoverMechanism}</p>}
                  {reliability.faultTolerance.recoveryTime && <p><strong>Recovery Time:</strong> {reliability.faultTolerance.recoveryTime}</p>}
                </div>
              )}
              {reliability.errorHandling && (
                <div>
                  <h5>Error Handling</h5>
                  {reliability.errorHandling.strategy && <p><strong>Strategy:</strong> {reliability.errorHandling.strategy}</p>}
                  {reliability.errorHandling.retryPolicy && <p><strong>Retry Policy:</strong> {reliability.errorHandling.retryPolicy}</p>}
                  {reliability.errorHandling.circuitBreaker && <p><strong>Circuit Breaker:</strong> {reliability.errorHandling.circuitBreaker}</p>}
                </div>
              )}
              {reliability.backupStrategy && (
                <div>
                  <h5>Backup Strategy</h5>
                  {reliability.backupStrategy.frequency && <p><strong>Frequency:</strong> {reliability.backupStrategy.frequency}</p>}
                  {reliability.backupStrategy.retention && <p><strong>Retention:</strong> {reliability.backupStrategy.retention}</p>}
                  {reliability.backupStrategy.recoveryProcess && <p><strong>Recovery Process:</strong> {reliability.backupStrategy.recoveryProcess}</p>}
                </div>
              )}
              {!reliability.availabilityTarget && !reliability.faultTolerance && !reliability.errorHandling && !reliability.backupStrategy && (
                <p className="empty-message">No reliability defined</p>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Observability */}
      {(editMode || observability.logging || observability.metrics || observability.tracing || observability.alerting) && (
        <CollapsibleSection title="Observability" sectionId="arch-observability">
          {editMode ? (
            <div className="arch-context-edit">
              <h5>Logging</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Strategy</span>
                    <input type="text" value={observability.logging?.strategy || ''} onChange={(e) => handleFieldChange('observability', { ...observability, logging: { ...observability.logging, strategy: e.target.value } })} placeholder="Logging strategy..." />
                  </label>
                  <label><span className="field-label">Format</span>
                    <input type="text" value={observability.logging?.format || ''} onChange={(e) => handleFieldChange('observability', { ...observability, logging: { ...observability.logging, format: e.target.value } })} placeholder="e.g., JSON, structured" />
                  </label>
                </div>
                <div className="detail-row">
                  <label><span className="field-label">Levels</span>
                    <input type="text" value={(observability.logging?.levels || []).join(', ')} onChange={(e) => handleFieldChange('observability', { ...observability, logging: { ...observability.logging, levels: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })} placeholder="Levels (comma-separated)" />
                  </label>
                  <label><span className="field-label">Aggregation</span>
                    <input type="text" value={observability.logging?.aggregation || ''} onChange={(e) => handleFieldChange('observability', { ...observability, logging: { ...observability.logging, aggregation: e.target.value } })} placeholder="e.g., ELK Stack, Loki" />
                  </label>
                </div>
              </div>
              <h5>Metrics</h5>
              <div className="arch-context-edit">
                <label><span className="field-label">Strategy</span>
                  <input type="text" value={observability.metrics?.strategy || ''} onChange={(e) => handleFieldChange('observability', { ...observability, metrics: { ...observability.metrics, strategy: e.target.value } })} placeholder="Metrics collection strategy..." />
                </label>
                <h6>Key Metrics ({(observability.metrics?.keyMetrics || []).length})</h6>
                {(observability.metrics?.keyMetrics || []).map((m: { name: string; type?: string; threshold?: string }, i: number) => (
                  <div key={i} className="arch-context-edit">
                    <div className="editable-item-header">
                      <input type="text" value={m.name || ''} onChange={(e) => { const updated = [...(observability.metrics?.keyMetrics || [])]; updated[i] = { ...m, name: e.target.value }; handleFieldChange('observability', { ...observability, metrics: { ...observability.metrics, keyMetrics: updated } }); }} placeholder="Metric name" className="full-width-input" />
                      <button className="remove-btn" onClick={() => { const updated = (observability.metrics?.keyMetrics || []).filter((_: { name: string; type?: string; threshold?: string }, idx: number) => idx !== i); handleFieldChange('observability', { ...observability, metrics: { ...observability.metrics, keyMetrics: updated } }); }}>×</button>
                    </div>
                    <div className="detail-row">
                      <input type="text" value={m.type || ''} onChange={(e) => { const updated = [...(observability.metrics?.keyMetrics || [])]; updated[i] = { ...m, type: e.target.value }; handleFieldChange('observability', { ...observability, metrics: { ...observability.metrics, keyMetrics: updated } }); }} placeholder="Type (e.g., counter, gauge)" />
                      <input type="text" value={m.threshold || ''} onChange={(e) => { const updated = [...(observability.metrics?.keyMetrics || [])]; updated[i] = { ...m, threshold: e.target.value }; handleFieldChange('observability', { ...observability, metrics: { ...observability.metrics, keyMetrics: updated } }); }} placeholder="Threshold" />
                    </div>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('observability', { ...observability, metrics: { ...observability.metrics, keyMetrics: [...(observability.metrics?.keyMetrics || []), { name: '', type: '', threshold: '' }] } })}>+ Add Key Metric</button>
              </div>
              <h5>Tracing</h5>
              <div className="arch-context-edit">
                <div className="detail-row">
                  <label><span className="field-label">Strategy</span>
                    <input type="text" value={observability.tracing?.strategy || ''} onChange={(e) => handleFieldChange('observability', { ...observability, tracing: { ...observability.tracing, strategy: e.target.value } })} placeholder="Distributed tracing strategy..." />
                  </label>
                  <label><span className="field-label">Implementation</span>
                    <input type="text" value={observability.tracing?.implementation || ''} onChange={(e) => handleFieldChange('observability', { ...observability, tracing: { ...observability.tracing, implementation: e.target.value } })} placeholder="e.g., OpenTelemetry, Jaeger" />
                  </label>
                </div>
              </div>
              <h5>Alerting</h5>
              <div className="arch-context-edit">
                <label><span className="field-label">Strategy</span>
                  <input type="text" value={observability.alerting?.strategy || ''} onChange={(e) => handleFieldChange('observability', { ...observability, alerting: { ...observability.alerting, strategy: e.target.value } })} placeholder="Alerting strategy..." />
                </label>
                <label><span className="field-label">Channels</span>
                  <input type="text" value={(observability.alerting?.channels || []).join(', ')} onChange={(e) => handleFieldChange('observability', { ...observability, alerting: { ...observability.alerting, channels: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })} placeholder="Channels (comma-separated, e.g., Slack, PagerDuty)" />
                </label>
                <label><span className="field-label">Escalation</span>
                  <input type="text" value={observability.alerting?.escalation || ''} onChange={(e) => handleFieldChange('observability', { ...observability, alerting: { ...observability.alerting, escalation: e.target.value } })} placeholder="Escalation policy..." />
                </label>
              </div>
            </div>
          ) : (
            <>
              {observability.logging && (
                <div>
                  <h5>Logging</h5>
                  {observability.logging.strategy && <p><strong>Strategy:</strong> {observability.logging.strategy}</p>}
                  {observability.logging.format && <p><strong>Format:</strong> {observability.logging.format}</p>}
                  {observability.logging.levels?.length > 0 && <p><strong>Levels:</strong> {observability.logging.levels.join(', ')}</p>}
                  {observability.logging.aggregation && <p><strong>Aggregation:</strong> {observability.logging.aggregation}</p>}
                </div>
              )}
              {observability.metrics && (
                <div>
                  <h5>Metrics</h5>
                  {observability.metrics.strategy && <p><strong>Strategy:</strong> {observability.metrics.strategy}</p>}
                  {observability.metrics.keyMetrics?.length > 0 && (
                    <ul>{observability.metrics.keyMetrics.map((m: { name: string; type?: string; threshold?: string }, i: number) => (
                      <li key={i}><strong>{m.name}</strong>{m.type && ` (${m.type})`}{m.threshold && ` — Threshold: ${m.threshold}`}</li>
                    ))}</ul>
                  )}
                </div>
              )}
              {observability.tracing && (
                <div>
                  <h5>Tracing</h5>
                  {observability.tracing.strategy && <p><strong>Strategy:</strong> {observability.tracing.strategy}</p>}
                  {observability.tracing.implementation && <p><strong>Implementation:</strong> {observability.tracing.implementation}</p>}
                </div>
              )}
              {observability.alerting && (
                <div>
                  <h5>Alerting</h5>
                  {observability.alerting.strategy && <p><strong>Strategy:</strong> {observability.alerting.strategy}</p>}
                  {observability.alerting.channels?.length > 0 && <p><strong>Channels:</strong> {observability.alerting.channels.join(', ')}</p>}
                  {observability.alerting.escalation && <p><strong>Escalation:</strong> {observability.alerting.escalation}</p>}
                </div>
              )}
              {!observability.logging && !observability.metrics && !observability.tracing && !observability.alerting && (
                <p className="empty-message">No observability defined</p>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Deployment */}
      {(editMode || deployment.strategy || deployment.environments?.length > 0 || deployment.pipeline || deployment.rollback) && (
        <CollapsibleSection title="Deployment" sectionId="arch-deployment">
          {editMode ? (
            <div className="arch-context-edit">
              <label><span className="field-label">Strategy</span>
                <textarea value={deployment.strategy || ''} onChange={(e) => handleFieldChange('deployment', { ...deployment, strategy: e.target.value })} rows={3} placeholder="Deployment strategy (e.g., Blue-Green, Rolling, Canary)..." />
              </label>
              <h5>Environments ({(deployment.environments || []).length})</h5>
              {(deployment.environments || []).map((env: { name: string; purpose?: string; configuration?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={env.name || ''} onChange={(e) => { const updated = [...(deployment.environments || [])]; updated[i] = { ...env, name: e.target.value }; handleFieldChange('deployment', { ...deployment, environments: updated }); }} placeholder="Environment name" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (deployment.environments || []).filter((_: { name: string; purpose?: string; configuration?: string }, idx: number) => idx !== i); handleFieldChange('deployment', { ...deployment, environments: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={env.purpose || ''} onChange={(e) => { const updated = [...(deployment.environments || [])]; updated[i] = { ...env, purpose: e.target.value }; handleFieldChange('deployment', { ...deployment, environments: updated }); }} placeholder="Purpose" />
                    <input type="text" value={env.configuration || ''} onChange={(e) => { const updated = [...(deployment.environments || [])]; updated[i] = { ...env, configuration: e.target.value }; handleFieldChange('deployment', { ...deployment, environments: updated }); }} placeholder="Configuration" />
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('deployment', { ...deployment, environments: [...(deployment.environments || []), { name: '', purpose: '', configuration: '' }] })}>+ Add Environment</button>
              <h5>Pipeline</h5>
              <div className="arch-context-edit">
                <h6>Stages ({(deployment.pipeline?.stages || []).length})</h6>
                {(deployment.pipeline?.stages || []).map((stage: { name: string; purpose?: string; tools?: string[] }, i: number) => (
                  <div key={i} className="arch-context-edit">
                    <div className="editable-item-header">
                      <input type="text" value={stage.name || ''} onChange={(e) => { const stages = [...(deployment.pipeline?.stages || [])]; stages[i] = { ...stage, name: e.target.value }; handleFieldChange('deployment', { ...deployment, pipeline: { ...deployment.pipeline, stages } }); }} placeholder="Stage name" className="full-width-input" />
                      <button className="remove-btn" onClick={() => { const stages = (deployment.pipeline?.stages || []).filter((_: { name: string; purpose?: string; tools?: string[] }, idx: number) => idx !== i); handleFieldChange('deployment', { ...deployment, pipeline: { ...deployment.pipeline, stages } }); }}>×</button>
                    </div>
                    <div className="detail-row">
                      <input type="text" value={stage.purpose || ''} onChange={(e) => { const stages = [...(deployment.pipeline?.stages || [])]; stages[i] = { ...stage, purpose: e.target.value }; handleFieldChange('deployment', { ...deployment, pipeline: { ...deployment.pipeline, stages } }); }} placeholder="Purpose" />
                      <input type="text" value={(stage.tools || []).join(', ')} onChange={(e) => { const stages = [...(deployment.pipeline?.stages || [])]; stages[i] = { ...stage, tools: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }; handleFieldChange('deployment', { ...deployment, pipeline: { ...deployment.pipeline, stages } }); }} placeholder="Tools (comma-separated)" />
                    </div>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('deployment', { ...deployment, pipeline: { ...deployment.pipeline, stages: [...(deployment.pipeline?.stages || []), { name: '', purpose: '', tools: [] }] } })}>+ Add Stage</button>
                <label><span className="field-label">Triggers</span>
                  <input type="text" value={(deployment.pipeline?.triggers || []).join(', ')} onChange={(e) => handleFieldChange('deployment', { ...deployment, pipeline: { ...deployment.pipeline, triggers: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })} placeholder="Triggers (comma-separated)" />
                </label>
              </div>
              <h5>Rollback</h5>
              <div className="arch-context-edit">
                <label><span className="field-label">Strategy</span>
                  <input type="text" value={deployment.rollback?.strategy || ''} onChange={(e) => handleFieldChange('deployment', { ...deployment, rollback: { ...deployment.rollback, strategy: e.target.value } })} placeholder="Rollback strategy..." />
                </label>
                <label><span className="field-label">Procedure</span>
                  <textarea value={deployment.rollback?.procedure || ''} onChange={(e) => handleFieldChange('deployment', { ...deployment, rollback: { ...deployment.rollback, procedure: e.target.value } })} rows={2} placeholder="Rollback procedure..." />
                </label>
              </div>
            </div>
          ) : (
            <>
              {deployment.strategy && <p>{deployment.strategy}</p>}
              {deployment.environments?.length > 0 && (
                <div>
                  <h5>Environments ({deployment.environments.length})</h5>
                  <ul>{deployment.environments.map((env: { name: string; purpose?: string; configuration?: string }, i: number) => (
                    <li key={i}>
                      <strong>{env.name}</strong>
                      {env.purpose && <span> — {env.purpose}</span>}
                      {env.configuration && <span className="step-detail"> ({env.configuration})</span>}
                    </li>
                  ))}</ul>
                </div>
              )}
              {deployment.pipeline?.stages?.length > 0 && (
                <div>
                  <h5>Pipeline Stages</h5>
                  <ol>{deployment.pipeline.stages.map((stage: { name: string; purpose?: string; tools?: string[] }, i: number) => (
                    <li key={i}>
                      <strong>{stage.name}</strong>
                      {stage.purpose && <span> — {stage.purpose}</span>}
                      {stage.tools?.length ? <span className="step-detail"> [{stage.tools.join(', ')}]</span> : null}
                    </li>
                  ))}</ol>
                  {deployment.pipeline.triggers?.length > 0 && <p><strong>Triggers:</strong> {deployment.pipeline.triggers.join(', ')}</p>}
                </div>
              )}
              {deployment.rollback && (
                <div>
                  <h5>Rollback</h5>
                  {deployment.rollback.strategy && <p><strong>Strategy:</strong> {deployment.rollback.strategy}</p>}
                  {deployment.rollback.procedure && <p><strong>Procedure:</strong> {deployment.rollback.procedure}</p>}
                </div>
              )}
              {!deployment.strategy && !(deployment.environments?.length > 0) && !deployment.pipeline && !deployment.rollback && (
                <p className="empty-message">No deployment defined</p>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Integrations */}
      {(editMode || integrations.length > 0) && (
        <CollapsibleSection title="Integrations" count={integrations.length} sectionId="arch-integrations">
          {editMode ? (
            <div className="integrations-list">
              {integrations.map((integ: any, i: number) => (
                <div key={i} className="integration-item component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={integ.name || ''}
                      onChange={(e) => updateArrayItem('integrations', i, { ...integ, name: e.target.value })}
                      placeholder="Integration name"
                      className="full-width-input"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('integrations', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={integ.type || ''}
                      onChange={(e) => updateArrayItem('integrations', i, { ...integ, type: e.target.value })}
                      placeholder="Type (e.g., API, SDK)"
                    />
                    <input
                      type="text"
                      value={integ.protocol || ''}
                      onChange={(e) => updateArrayItem('integrations', i, { ...integ, protocol: e.target.value })}
                      placeholder="Protocol (e.g., REST, gRPC)"
                    />
                  </div>
                  <textarea
                    value={integ.description || ''}
                    onChange={(e) => updateArrayItem('integrations', i, { ...integ, description: e.target.value })}
                    rows={2}
                    placeholder="Description..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('integrations', { name: '', type: '', protocol: '', description: '' })}>+ Add Integration</button>
            </div>
          ) : (
            <div className="integrations-list">
              {integrations.map((integ: any, i: number) => (
                <div key={i} className="integration-item">
                  <p>
                    <strong>{integ.name}</strong>
                    {integ.type && <span className="tag">{integ.type}</span>}
                    {integ.protocol && <span className="tag">{integ.protocol}</span>}
                  </p>
                  {integ.description && <Md text={integ.description} />}
                  {integ.authentication && <p><strong>Auth:</strong> {integ.authentication}</p>}
                  {integ.dataFormat && <p><strong>Data Format:</strong> {integ.dataFormat}</p>}
                  {integ.errorHandling && <p><strong>Error Handling:</strong> {integ.errorHandling}</p>}
                  {integ.sla && <p><strong>SLA:</strong> {integ.sla}</p>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Validation */}
      {(editMode || validation.status || validation.findings?.length > 0) && (
        <CollapsibleSection title="Architecture Validation" sectionId="arch-validation">
          {editMode ? (
            <div className="arch-context-edit">
              <div className="detail-row">
                <label><span className="field-label">Status</span>
                  <select value={validation.status || ''} onChange={(e) => handleFieldChange('validation', { ...validation, status: e.target.value })}>
                    <option value="">Status...</option>
                    {['pending', 'in-progress', 'validated', 'failed', 'needs-review'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label><span className="field-label">Date</span>
                  <input type="text" value={validation.validationDate || ''} onChange={(e) => handleFieldChange('validation', { ...validation, validationDate: e.target.value })} placeholder="Validation date..." />
                </label>
              </div>
              <label><span className="field-label">Validators</span>
                <input type="text" value={(validation.validators || []).join(', ')} onChange={(e) => handleFieldChange('validation', { ...validation, validators: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="Validators (comma-separated)" />
              </label>
              <h5>Findings ({(validation.findings || []).length})</h5>
              {(validation.findings || []).map((f: { id?: string; type?: string; severity?: string; status?: string; finding?: string; recommendation?: string }, i: number) => (
                <div key={i} className="arch-context-edit">
                  <div className="editable-item-header">
                    <input type="text" value={f.finding || ''} onChange={(e) => { const updated = [...(validation.findings || [])]; updated[i] = { ...f, finding: e.target.value }; handleFieldChange('validation', { ...validation, findings: updated }); }} placeholder="Finding description" className="full-width-input" />
                    <button className="remove-btn" onClick={() => { const updated = (validation.findings || []).filter((_: { id?: string; type?: string; severity?: string; status?: string; finding?: string; recommendation?: string }, idx: number) => idx !== i); handleFieldChange('validation', { ...validation, findings: updated }); }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input type="text" value={f.id || ''} onChange={(e) => { const updated = [...(validation.findings || [])]; updated[i] = { ...f, id: e.target.value }; handleFieldChange('validation', { ...validation, findings: updated }); }} placeholder="ID" />
                    <select value={f.type || ''} onChange={(e) => { const updated = [...(validation.findings || [])]; updated[i] = { ...f, type: e.target.value }; handleFieldChange('validation', { ...validation, findings: updated }); }}>
                      <option value="">Type...</option>
                      {['issue', 'risk', 'improvement', 'observation'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={f.severity || ''} onChange={(e) => { const updated = [...(validation.findings || [])]; updated[i] = { ...f, severity: e.target.value }; handleFieldChange('validation', { ...validation, findings: updated }); }}>
                      <option value="">Severity...</option>
                      {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={f.status || ''} onChange={(e) => { const updated = [...(validation.findings || [])]; updated[i] = { ...f, status: e.target.value }; handleFieldChange('validation', { ...validation, findings: updated }); }}>
                      <option value="">Status...</option>
                      {['open', 'resolved', 'accepted', 'deferred'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <textarea value={f.recommendation || ''} onChange={(e) => { const updated = [...(validation.findings || [])]; updated[i] = { ...f, recommendation: e.target.value }; handleFieldChange('validation', { ...validation, findings: updated }); }} rows={2} placeholder="Recommendation..." />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => handleFieldChange('validation', { ...validation, findings: [...(validation.findings || []), { id: '', type: '', severity: '', status: '', finding: '', recommendation: '' }] })}>+ Add Finding</button>
            </div>
          ) : (
            <>
              {validation.status && <p><strong>Status:</strong> <span className={`tag tag-${validation.status}`}>{validation.status}</span></p>}
              {validation.validationDate && <p><strong>Date:</strong> {validation.validationDate}</p>}
              {validation.validators?.length > 0 && <p><strong>Validators:</strong> {validation.validators.join(', ')}</p>}
              {validation.findings?.length > 0 && (
                <div>
                  <h5>Findings ({validation.findings.length})</h5>
                  {validation.findings.map((f: { id?: string; type?: string; severity?: string; status?: string; finding?: string; recommendation?: string }, i: number) => (
                    <div key={i} className="finding-item">
                      <p>
                        {f.id && <span className="item-id">{f.id}</span>}
                        {f.type && <span className="tag">{f.type}</span>}
                        {f.severity && <span className={`tag tag-${f.severity}`}>{f.severity}</span>}
                        {f.status && <span className={`tag tag-${f.status}`}>{f.status}</span>}
                      </p>
                      {f.finding && <p>{f.finding}</p>}
                      {f.recommendation && <p><strong>Recommendation:</strong> {f.recommendation}</p>}
                    </div>
                  ))}
                </div>
              )}
              {!validation.status && !(validation.findings?.length > 0) && (
                <p className="empty-message">No validation defined</p>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Implementation Notes */}
      {(editMode || implNotes.length > 0) && (
        <CollapsibleSection title="Implementation Notes" count={implNotes.length} sectionId="arch-implementation-notes">
          {editMode ? (
            <div className="scope-edit">
              <div className="editable-list">
                {implNotes.map((note: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => {
                        const updated = [...implNotes];
                        updated[i] = e.target.value;
                        handleFieldChange('implementationNotes', updated);
                      }}
                      placeholder="Implementation note..."
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('implementationNotes', i)}>×</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('implementationNotes', '')}>+ Add Note</button>
            </div>
          ) : (
            <ul>{implNotes.map((note: string, i: number) => <li key={i}>{note}</li>)}</ul>
          )}
        </CollapsibleSection>
      )}

      {/* References */}
      {(editMode || references.length > 0) && (
        <CollapsibleSection title="References" count={references.length} sectionId="arch-references">
          {editMode ? (
            <div className="component-edit">
              {references.map((ref: { title?: string; type?: string; location?: string; description?: string }, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={ref.title || ''}
                      onChange={(e) => updateArrayItem('references', i, { ...ref, title: e.target.value })}
                      placeholder="Title"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('references', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={ref.type || ''}
                      onChange={(e) => updateArrayItem('references', i, { ...ref, type: e.target.value })}
                      placeholder="Type (e.g., ADR, RFC, Doc)"
                    />
                    <input
                      type="text"
                      value={ref.location || ''}
                      onChange={(e) => updateArrayItem('references', i, { ...ref, location: e.target.value })}
                      placeholder="Location / URL"
                    />
                  </div>
                  <textarea
                    value={ref.description || ''}
                    onChange={(e) => updateArrayItem('references', i, { ...ref, description: e.target.value })}
                    rows={2}
                    placeholder="Description..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('references', { title: '', type: '', location: '', description: '' })}>+ Add Reference</button>
            </div>
          ) : (
            <ul>{references.map((ref: { title?: string; type?: string; location?: string; description?: string }, i: number) => (
              <li key={i}>
                <strong>{ref.title}</strong>
                {ref.type && <span className="tag">{ref.type}</span>}
                {ref.location && <span> — {ref.location}</span>}
                {ref.description && <span className="step-detail"> ({ref.description})</span>}
              </li>
             ))}</ul>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// PRODUCT BRIEF DETAILS
// ==========================================================================

export function renderProductBriefDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange, updateArrayItem, removeFromArray, addToArray, artifact } = props;
  const vision = editedData.vision || {};

  // --- Defensive normalisation: real-world data may use alternate field names ---
  // targetUsers: accept both `persona` and `role` field names
  const targetUsers: any[] = (editedData.targetUsers || []).map((u: any) =>
    typeof u === 'string' ? { persona: u } : { ...u, persona: u.persona || u.role || '' }
  );
  // keyFeatures: accept plain strings or {name, description, priority} objects
  const keyFeatures: any[] = (editedData.keyFeatures || []).map((f: any) =>
    typeof f === 'string' ? { name: f, description: '', priority: '' } : f
  );
  // successMetrics: normalise plain strings to {metric} objects
  const successMetrics: any[] = (editedData.successMetrics || []).map((m: any) =>
    typeof m === 'string' ? { metric: m } : m
  );
  const scope = editedData.scope || {};
  const marketContext = editedData.marketContext || {};
  // constraints: accept plain strings or {constraint, type, impact} objects
  const constraints: any[] = (editedData.constraints || []).map((c: any) =>
    typeof c === 'string' ? { constraint: c } : c
  );
  // assumptions: accept plain strings or {assumption, category, risk} objects
  const assumptions: any[] = (editedData.assumptions || []).map((a: any) =>
    typeof a === 'string' ? { assumption: a } : a
  );
  // risks: check top-level risks first, then riskManagement.risks (product-brief nesting)
  const rawRisks: any[] = editedData.risks || editedData.riskManagement?.risks || [];
  const risks: any[] = rawRisks.map((r: any) =>
    typeof r === 'string' ? { risk: r } : r
  );
  const riskManagementSummary: string = editedData.riskManagement?.summary || '';
  const dependencies: any[] = editedData.dependencies || [];
  // timeline: normalise milestone field names (name→milestone, date→targetDate)
  const rawTimeline = editedData.timeline || {};
  const timeline = {
    ...rawTimeline,
    milestones: (rawTimeline.milestones || []).map((m: any) => ({
      ...m,
      milestone: m.milestone || m.name || '',
      targetDate: m.targetDate || m.date || '',
    })),
  };
  // stakeholders: normalise responsibility→responsibilities
  const stakeholders: any[] = (editedData.stakeholders || []).map((s: any) => ({
    ...s,
    responsibilities: s.responsibilities || (s.responsibility ? [s.responsibility] : []),
  }));
  // additionalContext: accept plain string or {background, notes[], openQuestions[]} object
  const additionalContext = typeof editedData.additionalContext === 'string'
    ? { background: editedData.additionalContext }
    : (editedData.additionalContext || {});

  return (
    <>
      {/* Product Info */}
      <CollapsibleSection title="Product" sectionId="brief-product">
        {editMode ? (
          <div className="product-info-edit">
            <input
              type="text"
              value={editedData.productName || ''}
              onChange={(e) => handleFieldChange('productName', e.target.value)}
              placeholder="Product name"
              className="full-width-input"
            />
            <input
              type="text"
              value={editedData.tagline || ''}
              onChange={(e) => handleFieldChange('tagline', e.target.value)}
              placeholder="Product tagline..."
              className="full-width-input"
            />
            <input
              type="text"
              value={editedData.version || ''}
              onChange={(e) => handleFieldChange('version', e.target.value)}
              placeholder="Version (e.g., 1.0.0)"
              style={{ width: '120px' }}
            />
          </div>
        ) : (
          <div className="product-info">
            <p className="product-name">{editedData.productName || artifact.title}</p>
            {editedData.tagline && <p className="product-tagline">"{editedData.tagline}"</p>}
            {editedData.version && <span className="tag">v{editedData.version}</span>}
          </div>
        )}
      </CollapsibleSection>

      {/* Vision */}
      <CollapsibleSection title="Vision" sectionId="brief-vision">
        {editMode ? (
          <div className="vision-edit">
            <label>
              <span className="field-label">Vision Statement</span>
              <textarea
                value={vision.statement || ''}
                onChange={(e) => handleFieldChange('vision', { ...vision, statement: e.target.value })}
                rows={2}
                placeholder="Core vision statement"
              />
            </label>
            <label>
              <span className="field-label">Mission</span>
              <textarea
                value={vision.mission || ''}
                onChange={(e) => handleFieldChange('vision', { ...vision, mission: e.target.value })}
                rows={2}
                placeholder="Product mission statement"
              />
            </label>
            <label>
              <span className="field-label">Problem Statement</span>
              <textarea
                value={vision.problemStatement || ''}
                onChange={(e) => handleFieldChange('vision', { ...vision, problemStatement: e.target.value })}
                rows={2}
                placeholder="Problem being solved"
              />
            </label>
            <label>
              <span className="field-label">Proposed Solution</span>
              <textarea
                value={vision.proposedSolution || ''}
                onChange={(e) => handleFieldChange('vision', { ...vision, proposedSolution: e.target.value })}
                rows={2}
                placeholder="High-level solution description"
              />
            </label>
            <label>
              <span className="field-label">Unique Value Proposition</span>
              <textarea
                value={vision.uniqueValueProposition || ''}
                onChange={(e) => handleFieldChange('vision', { ...vision, uniqueValueProposition: e.target.value })}
                rows={2}
                placeholder="What makes this unique"
              />
            </label>
            <h5>Differentiators</h5>
            {(vision.differentiators || []).map((d: any, i: number) => (
              <div key={i} className="component-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={d.differentiator || ''}
                    onChange={(e) => {
                      const updated = [...(vision.differentiators || [])];
                      updated[i] = { ...d, differentiator: e.target.value };
                      handleFieldChange('vision', { ...vision, differentiators: updated });
                    }}
                    placeholder="Differentiator"
                  />
                  <button className="remove-btn" onClick={() => {
                    const updated = [...(vision.differentiators || [])];
                    updated.splice(i, 1);
                    handleFieldChange('vision', { ...vision, differentiators: updated });
                  }}>×</button>
                </div>
                <input
                  type="text"
                  value={d.competitiveAdvantage || ''}
                  onChange={(e) => {
                    const updated = [...(vision.differentiators || [])];
                    updated[i] = { ...d, competitiveAdvantage: e.target.value };
                    handleFieldChange('vision', { ...vision, differentiators: updated });
                  }}
                  placeholder="Competitive advantage..."
                  className="full-width-input"
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => {
              handleFieldChange('vision', { ...vision, differentiators: [...(vision.differentiators || []), { differentiator: '', competitiveAdvantage: '' }] });
            }}>+ Add Differentiator</button>
            <h5>Problem Details</h5>
            {(vision.problemDetails || []).map((p: any, i: number) => (
              <div key={i} className="component-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={p.problem || ''}
                    onChange={(e) => {
                      const updated = [...(vision.problemDetails || [])];
                      updated[i] = { ...p, problem: e.target.value };
                      handleFieldChange('vision', { ...vision, problemDetails: updated });
                    }}
                    placeholder="Problem"
                  />
                  <button className="remove-btn" onClick={() => {
                    const updated = [...(vision.problemDetails || [])];
                    updated.splice(i, 1);
                    handleFieldChange('vision', { ...vision, problemDetails: updated });
                  }}>×</button>
                </div>
                <input
                  type="text"
                  value={p.impact || ''}
                  onChange={(e) => {
                    const updated = [...(vision.problemDetails || [])];
                    updated[i] = { ...p, impact: e.target.value };
                    handleFieldChange('vision', { ...vision, problemDetails: updated });
                  }}
                  placeholder="Impact..."
                  className="full-width-input"
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => {
              handleFieldChange('vision', { ...vision, problemDetails: [...(vision.problemDetails || []), { problem: '', impact: '' }] });
            }}>+ Add Problem Detail</button>
            <h5>Solution Approach</h5>
            {(vision.solutionApproach || []).map((s: any, i: number) => (
              <div key={i} className="component-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={s.aspect || ''}
                    onChange={(e) => {
                      const updated = [...(vision.solutionApproach || [])];
                      updated[i] = { ...s, aspect: e.target.value };
                      handleFieldChange('vision', { ...vision, solutionApproach: updated });
                    }}
                    placeholder="Aspect"
                  />
                  <button className="remove-btn" onClick={() => {
                    const updated = [...(vision.solutionApproach || [])];
                    updated.splice(i, 1);
                    handleFieldChange('vision', { ...vision, solutionApproach: updated });
                  }}>×</button>
                </div>
                <textarea
                  value={s.description || ''}
                  onChange={(e) => {
                    const updated = [...(vision.solutionApproach || [])];
                    updated[i] = { ...s, description: e.target.value };
                    handleFieldChange('vision', { ...vision, solutionApproach: updated });
                  }}
                  rows={2}
                  placeholder="Description..."
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => {
              handleFieldChange('vision', { ...vision, solutionApproach: [...(vision.solutionApproach || []), { aspect: '', description: '' }] });
            }}>+ Add Solution Approach</button>
          </div>
        ) : (
          <div className="vision-display">
            {vision.statement && <p><strong>Vision:</strong> {vision.statement}</p>}
            {vision.mission && <p><strong>Mission:</strong> {vision.mission}</p>}
            {vision.problemStatement && <p><strong>Problem:</strong> {vision.problemStatement}</p>}
            {vision.proposedSolution && <p><strong>Solution:</strong> {vision.proposedSolution}</p>}
            {vision.uniqueValueProposition && <p><strong>Value:</strong> {vision.uniqueValueProposition}</p>}
            {vision.differentiators?.length > 0 && (
              <div><strong>Differentiators:</strong>
                <ul>{vision.differentiators.map((d: any, i: number) => (
                  <li key={i}>{d.differentiator}{d.competitiveAdvantage && ` — ${d.competitiveAdvantage}`}</li>
                ))}</ul>
              </div>
            )}
            {vision.problemDetails?.length > 0 && (
              <div><strong>Problem Details:</strong>
                <ul>{vision.problemDetails.map((p: any, i: number) => (
                  <li key={i}>{p.problem}{p.impact && ` (Impact: ${p.impact})`}</li>
                ))}</ul>
              </div>
            )}
            {vision.solutionApproach?.length > 0 && (
              <div><strong>Solution Approach:</strong>
                <ul>{vision.solutionApproach.map((s: any, i: number) => (
                  <li key={i}><strong>{s.aspect}:</strong> {s.description}{s.rationale && ` — ${s.rationale}`}</li>
                ))}</ul>
              </div>
            )}
            {!vision.statement && !vision.problemStatement && (
              <p className="empty-message">No vision defined</p>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* Target Users */}
      <CollapsibleSection title="Target Users" count={targetUsers.length} sectionId="brief-targetUsers">
        {editMode ? (
          <div className="target-users-list">
            {targetUsers.map((user: any, i: number) => (
              <div key={i} className="target-user-item target-user-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={user.persona || ''}
                    onChange={(e) => updateArrayItem('targetUsers', i, { ...user, persona: e.target.value })}
                    placeholder="Persona name"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('targetUsers', i)}>×</button>
                </div>
                <textarea
                  value={user.description || ''}
                  onChange={(e) => updateArrayItem('targetUsers', i, { ...user, description: e.target.value })}
                  rows={2}
                  placeholder="Description of this user group..."
                />
                <input
                  type="text"
                  value={user.technicalProficiency || ''}
                  onChange={(e) => updateArrayItem('targetUsers', i, { ...user, technicalProficiency: e.target.value })}
                  placeholder="Technical proficiency (e.g., low, medium, high)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(user.goals) ? user.goals.map((g: any) => typeof g === 'string' ? g : g.goal || '').join(', ') : ''}
                  onChange={(e) => updateArrayItem('targetUsers', i, { ...user, goals: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Goals (comma-separated)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(user.painPoints) ? user.painPoints.map((p: any) => typeof p === 'string' ? p : p.painPoint || '').join(', ') : ''}
                  onChange={(e) => updateArrayItem('targetUsers', i, { ...user, painPoints: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Pain points (comma-separated)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(user.needs) ? user.needs.map((n: any) => typeof n === 'string' ? n : n.need || '').join(', ') : ''}
                  onChange={(e) => updateArrayItem('targetUsers', i, { ...user, needs: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Needs (comma-separated)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(user.behaviors) ? user.behaviors.join(', ') : ''}
                  onChange={(e) => updateArrayItem('targetUsers', i, { ...user, behaviors: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Behaviors (comma-separated)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(user.motivations) ? user.motivations.join(', ') : ''}
                  onChange={(e) => updateArrayItem('targetUsers', i, { ...user, motivations: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Motivations (comma-separated)"
                  className="full-width-input"
                />
                <input
                  type="text"
                  value={Array.isArray(user.frustrations) ? user.frustrations.join(', ') : ''}
                  onChange={(e) => updateArrayItem('targetUsers', i, { ...user, frustrations: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                  placeholder="Frustrations (comma-separated)"
                  className="full-width-input"
                />
                <div className="detail-row">
                  <input
                    type="text"
                    value={user.demographics?.age || ''}
                    onChange={(e) => updateArrayItem('targetUsers', i, { ...user, demographics: { ...(user.demographics || {}), age: e.target.value } })}
                    placeholder="Demographics: Age"
                  />
                  <input
                    type="text"
                    value={user.demographics?.role || ''}
                    onChange={(e) => updateArrayItem('targetUsers', i, { ...user, demographics: { ...(user.demographics || {}), role: e.target.value } })}
                    placeholder="Demographics: Role"
                  />
                  <input
                    type="text"
                    value={user.demographics?.industry || ''}
                    onChange={(e) => updateArrayItem('targetUsers', i, { ...user, demographics: { ...(user.demographics || {}), industry: e.target.value } })}
                    placeholder="Demographics: Industry"
                  />
                  <input
                    type="text"
                    value={user.demographics?.experience || ''}
                    onChange={(e) => updateArrayItem('targetUsers', i, { ...user, demographics: { ...(user.demographics || {}), experience: e.target.value } })}
                    placeholder="Demographics: Experience"
                  />
                </div>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('targetUsers', { persona: '', description: '' })}>+ Add Target User</button>
          </div>
        ) : targetUsers.length > 0 ? (
          <div className="target-users-list">
            {targetUsers.map((user: any, i: number) => (
              <div key={i} className="target-user-item">
                <h5>{user.persona}</h5>
                {user.description && <Md text={user.description} />}
                {user.technicalProficiency && <p><strong>Tech Level:</strong> {user.technicalProficiency}</p>}
                {user.goals?.length > 0 && (
                  <p><strong>Goals:</strong> {user.goals.map((g: any) => typeof g === 'string' ? g : g.goal || JSON.stringify(g)).join(', ')}</p>
                )}
                {user.painPoints?.length > 0 && (
                  <p><strong>Pain Points:</strong> {user.painPoints.map((p: any) => typeof p === 'string' ? p : p.painPoint || JSON.stringify(p)).join(', ')}</p>
                )}
                {user.needs?.length > 0 && (
                  <p><strong>Needs:</strong> {user.needs.map((n: any) => typeof n === 'string' ? n : n.need || JSON.stringify(n)).join(', ')}</p>
                )}
                {user.behaviors?.length > 0 && (
                  <p><strong>Behaviors:</strong> {user.behaviors.join(', ')}</p>
                )}
                {user.motivations?.length > 0 && (
                  <p><strong>Motivations:</strong> {user.motivations.join(', ')}</p>
                )}
                {user.frustrations?.length > 0 && (
                  <p><strong>Frustrations:</strong> {user.frustrations.join(', ')}</p>
                )}
                {user.demographics && (user.demographics.age || user.demographics.role || user.demographics.industry || user.demographics.experience) && (
                  <p><strong>Demographics:</strong>
                    {user.demographics.age && ` Age: ${user.demographics.age}`}
                    {user.demographics.role && ` | Role: ${user.demographics.role}`}
                    {user.demographics.industry && ` | Industry: ${user.demographics.industry}`}
                    {user.demographics.experience && ` | Experience: ${user.demographics.experience}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">No target users defined</p>
        )}
      </CollapsibleSection>

      {/* Market Context */}
      {(editMode || marketContext.overview || marketContext.currentLandscape || marketContext.opportunity || marketContext.targetMarket || marketContext.competitors?.length > 0) && (
        <CollapsibleSection title="Market Context" sectionId="brief-marketContext">
          {editMode ? (
            <div className="arch-context-edit">
              <label>
                <span className="field-label">Overview</span>
                <textarea
                  value={marketContext.overview || ''}
                  onChange={(e) => handleFieldChange('marketContext', { ...marketContext, overview: e.target.value })}
                  rows={3}
                  placeholder="Market overview..."
                />
              </label>
              <label>
                <span className="field-label">Target Market</span>
                <textarea
                  value={marketContext.targetMarket || ''}
                  onChange={(e) => handleFieldChange('marketContext', { ...marketContext, targetMarket: e.target.value })}
                  rows={2}
                  placeholder="Target market description..."
                />
              </label>
              <label>
                <span className="field-label">Competitive Landscape</span>
                <textarea
                  value={marketContext.competitiveLandscape || ''}
                  onChange={(e) => handleFieldChange('marketContext', { ...marketContext, competitiveLandscape: e.target.value })}
                  rows={2}
                  placeholder="Competitive landscape..."
                />
              </label>
              <h5>Competitors</h5>
              {(marketContext.competitors || []).map((c: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={c.name || ''}
                      onChange={(e) => {
                        const updated = [...(marketContext.competitors || [])];
                        updated[i] = { ...c, name: e.target.value };
                        handleFieldChange('marketContext', { ...marketContext, competitors: updated });
                      }}
                      placeholder="Competitor name"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(marketContext.competitors || [])];
                      updated.splice(i, 1);
                      handleFieldChange('marketContext', { ...marketContext, competitors: updated });
                    }}>×</button>
                  </div>
                  <textarea
                    value={c.description || ''}
                    onChange={(e) => {
                      const updated = [...(marketContext.competitors || [])];
                      updated[i] = { ...c, description: e.target.value };
                      handleFieldChange('marketContext', { ...marketContext, competitors: updated });
                    }}
                    rows={2}
                    placeholder="Description..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('marketContext', { ...marketContext, competitors: [...(marketContext.competitors || []), { name: '', description: '' }] });
              }}>+ Add Competitor</button>
              <h5>Trends</h5>
              {(marketContext.trends || []).map((t: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={t.trend || ''}
                      onChange={(e) => {
                        const updated = [...(marketContext.trends || [])];
                        updated[i] = { ...t, trend: e.target.value };
                        handleFieldChange('marketContext', { ...marketContext, trends: updated });
                      }}
                      placeholder="Trend"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(marketContext.trends || [])];
                      updated.splice(i, 1);
                      handleFieldChange('marketContext', { ...marketContext, trends: updated });
                    }}>×</button>
                  </div>
                  <input
                    type="text"
                    value={t.impact || ''}
                    onChange={(e) => {
                      const updated = [...(marketContext.trends || [])];
                      updated[i] = { ...t, impact: e.target.value };
                      handleFieldChange('marketContext', { ...marketContext, trends: updated });
                    }}
                    placeholder="Impact..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('marketContext', { ...marketContext, trends: [...(marketContext.trends || []), { trend: '', impact: '' }] });
              }}>+ Add Trend</button>
            </div>
          ) : (
            <div className="market-context-display">
              {marketContext.overview && <Md text={marketContext.overview} />}
              {marketContext.currentLandscape && <p><strong>Landscape:</strong> {marketContext.currentLandscape}</p>}
              {marketContext.opportunity && <p><strong>Opportunity:</strong> {marketContext.opportunity}</p>}
              {marketContext.targetMarket && <p><strong>Target Market:</strong> {marketContext.targetMarket}</p>}
              {marketContext.marketSize && (
                <p><strong>Market Size:</strong> TAM: {marketContext.marketSize.tam || 'N/A'}, SAM: {marketContext.marketSize.sam || 'N/A'}, SOM: {marketContext.marketSize.som || 'N/A'}</p>
              )}
              {marketContext.competitiveLandscape && <p><strong>Competitive Landscape:</strong> {marketContext.competitiveLandscape}</p>}
              {marketContext.competitors?.length > 0 && (
                <div><strong>Competitors:</strong>
                  <ul>{marketContext.competitors.map((c: any, i: number) => (
                    <li key={i}>
                      <strong>{c.name}</strong>
                      {c.description && `: ${c.description}`}
                      {c.strengths && <span> — <em>Strengths:</em> {c.strengths}</span>}
                      {c.weaknesses && <span> — <em>Weaknesses:</em> {c.weaknesses}</span>}
                    </li>
                  ))}</ul>
                </div>
              )}
              {marketContext.trends?.length > 0 && (
                <div><strong>Trends:</strong>
                  <ul>{marketContext.trends.map((t: any, i: number) => (
                    <li key={i}>{t.trend}{t.impact && ` — Impact: ${t.impact}`}</li>
                  ))}</ul>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Key Features */}
      <CollapsibleSection title="Key Features" count={keyFeatures.length} sectionId="brief-keyFeatures">
        {editMode ? (
          <div className="features-list">
            {keyFeatures.map((feature: any, i: number) => (
              <div key={i} className="feature-item feature-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={feature.name || ''}
                    onChange={(e) => updateArrayItem('keyFeatures', i, { ...feature, name: e.target.value })}
                    placeholder="Feature name"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('keyFeatures', i)}>×</button>
                </div>
                <textarea
                  value={feature.description || ''}
                  onChange={(e) => updateArrayItem('keyFeatures', i, { ...feature, description: e.target.value })}
                  rows={2}
                  placeholder="Feature description..."
                />
                <div className="detail-row">
                  <select
                    value={feature.priority || ''}
                    onChange={(e) => updateArrayItem('keyFeatures', i, { ...feature, priority: e.target.value })}
                  >
                    <option value="">Priority...</option>
                    {['must-have', 'should-have', 'nice-to-have'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={feature.userBenefit || ''}
                    onChange={(e) => updateArrayItem('keyFeatures', i, { ...feature, userBenefit: e.target.value })}
                    placeholder="User benefit"
                  />
                </div>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('keyFeatures', { name: '', description: '', priority: '' })}>+ Add Feature</button>
          </div>
        ) : keyFeatures.length > 0 ? (
          <ul className="features-list">
            {keyFeatures.map((feature: any, i: number) => (
              <li key={i} className="feature-item">
                <span className="feature-name">{feature.name}</span>
                {feature.priority && <span className={`priority-badge priority-${feature.priority}`}>{feature.priority}</span>}
                {feature.complexity && <span className="tag">{feature.complexity}</span>}
                {feature.description && <Md text={feature.description} className="feature-desc" />}
                {feature.userBenefit && <p><em>Benefit: {feature.userBenefit}</em></p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-message">No key features defined</p>
        )}
      </CollapsibleSection>

      {/* Scope */}
      <CollapsibleSection title="Scope" sectionId="brief-scope">
        {editMode ? (
          <div className="scope-edit">
            <label>
              <span className="field-label">Overview</span>
              <textarea
                value={scope.overview || ''}
                onChange={(e) => handleFieldChange('scope', { ...scope, overview: e.target.value })}
                rows={3}
                placeholder="Scope overview..."
              />
            </label>
            <div className="scope-group">
              <h5>In Scope</h5>
              <div className="editable-list">
                {(scope.inScope || []).map((item: any, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={typeof item === 'string' ? item : item.item || ''}
                      onChange={(e) => {
                        const updated = [...(scope.inScope || [])];
                        updated[i] = typeof item === 'string' ? e.target.value : { ...item, item: e.target.value };
                        handleFieldChange('scope', { ...scope, inScope: updated });
                      }}
                      placeholder="In-scope item..."
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(scope.inScope || [])];
                      updated.splice(i, 1);
                      handleFieldChange('scope', { ...scope, inScope: updated });
                    }}>×</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('scope', { ...scope, inScope: [...(scope.inScope || []), { item: '' }] });
              }}>+ Add In-Scope Item</button>
            </div>
            <div className="scope-group">
              <h5>Out of Scope</h5>
              <div className="editable-list">
                {(scope.outOfScope || []).map((item: any, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={typeof item === 'string' ? item : item.item || ''}
                      onChange={(e) => {
                        const updated = [...(scope.outOfScope || [])];
                        updated[i] = typeof item === 'string' ? e.target.value : { ...item, item: e.target.value };
                        handleFieldChange('scope', { ...scope, outOfScope: updated });
                      }}
                      placeholder="Out-of-scope item..."
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(scope.outOfScope || [])];
                      updated.splice(i, 1);
                      handleFieldChange('scope', { ...scope, outOfScope: updated });
                    }}>×</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('scope', { ...scope, outOfScope: [...(scope.outOfScope || []), { item: '' }] });
              }}>+ Add Out-of-Scope Item</button>
            </div>
            <div className="scope-group">
              <h5>Future Considerations</h5>
              <div className="editable-list">
                {(scope.futureConsiderations || []).map((item: any, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={item.item || ''}
                      onChange={(e) => {
                        const updated = [...(scope.futureConsiderations || [])];
                        updated[i] = { ...item, item: e.target.value };
                        handleFieldChange('scope', { ...scope, futureConsiderations: updated });
                      }}
                      placeholder="Future consideration..."
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(scope.futureConsiderations || [])];
                      updated.splice(i, 1);
                      handleFieldChange('scope', { ...scope, futureConsiderations: updated });
                    }}>×</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('scope', { ...scope, futureConsiderations: [...(scope.futureConsiderations || []), { item: '' }] });
              }}>+ Add Future Consideration</button>
            </div>
          </div>
        ) : (
          <div className="scope-display">
            {scope.overview && <Md text={scope.overview} />}
            {scope.mvpDefinition && (
              <div className="scope-section">
                <h5>MVP Definition</h5>
                {scope.mvpDefinition.description && <Md text={scope.mvpDefinition.description} />}
                {scope.mvpDefinition.features?.length > 0 && (
                  <ul>{scope.mvpDefinition.features.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
                )}
              </div>
            )}
            {scope.inScope?.length > 0 && (
              <div className="scope-section">
                <h5>In Scope</h5>
                <ul>
                  {scope.inScope.map((item: any, i: number) => (
                    <li key={i}>
                      {typeof item === 'string' ? item : item.item || item.description || JSON.stringify(item)}
                      {item.priority && <span className={`priority-badge priority-${item.priority}`}> {item.priority}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scope.outOfScope?.length > 0 && (
              <div className="scope-section">
                <h5>Out of Scope</h5>
                <ul>
                  {scope.outOfScope.map((item: any, i: number) => (
                    <li key={i}>
                      {typeof item === 'string' ? item : item.item || item.description || JSON.stringify(item)}
                      {item.reason && <em> — {item.reason}</em>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scope.futureConsiderations?.length > 0 && (
              <div className="scope-section">
                <h5>Future Considerations</h5>
                <ul>
                  {scope.futureConsiderations.map((item: any, i: number) => (
                    <li key={i}>{item.item}{item.timeframe && ` (${item.timeframe})`}</li>
                  ))}
                </ul>
              </div>
            )}
            {!scope.inScope?.length && !scope.outOfScope?.length && !scope.overview && (
              <p className="empty-message">No scope defined</p>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* Success Metrics */}
      <CollapsibleSection title="Success Metrics" count={successMetrics.length} sectionId="brief-successMetrics">
        {editMode ? (
          <div className="metrics-list">
            {successMetrics.map((metric: any, i: number) => (
              <div key={i} className="metric-item metric-edit">
                <div className="editable-item-header">
                  <input
                    type="text"
                    value={metric.metric || ''}
                    onChange={(e) => updateArrayItem('successMetrics', i, { ...metric, metric: e.target.value })}
                    placeholder="Metric name"
                    className="full-width-input"
                  />
                  <button className="remove-btn" onClick={() => removeFromArray('successMetrics', i)}>×</button>
                </div>
                <div className="detail-row">
                  <input
                    type="text"
                    value={metric.target || ''}
                    onChange={(e) => updateArrayItem('successMetrics', i, { ...metric, target: e.target.value })}
                    placeholder="Target value"
                  />
                  <input
                    type="text"
                    value={metric.category || ''}
                    onChange={(e) => updateArrayItem('successMetrics', i, { ...metric, category: e.target.value })}
                    placeholder="Category"
                  />
                  <input
                    type="text"
                    value={metric.timeframe || ''}
                    onChange={(e) => updateArrayItem('successMetrics', i, { ...metric, timeframe: e.target.value })}
                    placeholder="Timeframe"
                  />
                </div>
                <div className="detail-row">
                  <input
                    type="text"
                    value={metric.baseline || ''}
                    onChange={(e) => updateArrayItem('successMetrics', i, { ...metric, baseline: e.target.value })}
                    placeholder="Baseline"
                  />
                  <input
                    type="text"
                    value={metric.measurementMethod || ''}
                    onChange={(e) => updateArrayItem('successMetrics', i, { ...metric, measurementMethod: e.target.value })}
                    placeholder="Measurement method"
                  />
                </div>
                <textarea
                  value={metric.rationale || ''}
                  onChange={(e) => updateArrayItem('successMetrics', i, { ...metric, rationale: e.target.value })}
                  rows={2}
                  placeholder="Rationale — why this metric matters..."
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" onClick={() => addToArray('successMetrics', { metric: '', target: '', category: '' })}>+ Add Metric</button>
          </div>
        ) : successMetrics.length > 0 ? (
          <ul className="metrics-list">
            {successMetrics.map((metric: any, i: number) => (
              <li key={i}>
                <strong>{metric.metric}</strong>
                {metric.category && <span className="tag">{metric.category}</span>}
                {metric.target && <span> — Target: {metric.target}</span>}
                {metric.baseline && <span> (Baseline: {metric.baseline})</span>}
                {metric.timeframe && <span> ({metric.timeframe})</span>}
                {metric.description && <p>{metric.description}</p>}
                {metric.rationale && <p><strong>Rationale:</strong> {metric.rationale}</p>}
                {metric.measurementMethod && <p><strong>Measurement:</strong> {metric.measurementMethod}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-message">No success metrics defined</p>
        )}
      </CollapsibleSection>

      {/* Constraints */}
      {(editMode || constraints.length > 0) && (
        <CollapsibleSection title="Constraints" count={constraints.length} sectionId="brief-constraints">
          {editMode ? (
            <div className="constraint-edit">
              {constraints.map((c: any, i: number) => (
                <div key={i} className="constraint-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={c.constraint || ''}
                      onChange={(e) => updateArrayItem('constraints', i, { ...c, constraint: e.target.value })}
                      placeholder="Constraint"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('constraints', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={c.type || ''}
                      onChange={(e) => updateArrayItem('constraints', i, { ...c, type: e.target.value })}
                      placeholder="Type (e.g., technical, business)"
                    />
                    <input
                      type="text"
                      value={c.impact || ''}
                      onChange={(e) => updateArrayItem('constraints', i, { ...c, impact: e.target.value })}
                      placeholder="Impact"
                    />
                  </div>
                  <input
                    type="text"
                    value={c.mitigation || ''}
                    onChange={(e) => updateArrayItem('constraints', i, { ...c, mitigation: e.target.value })}
                    placeholder="Mitigation..."
                    className="full-width-input"
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('constraints', { constraint: '', type: '', impact: '' })}>+ Add Constraint</button>
            </div>
          ) : (
            <ul className="constraints-list">
              {constraints.map((c: any, i: number) => (
                <li key={i} className={`constraint-item constraint-${c.type}`}>
                  {c.type && <span className="constraint-type">{c.type}</span>}
                  <span>{c.constraint}</span>
                  {c.impact && <p><em>Impact: {c.impact}</em></p>}
                  {c.mitigation && <p><em>Mitigation: {c.mitigation}</em></p>}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Assumptions */}
      {(editMode || assumptions.length > 0) && (
        <CollapsibleSection title="Assumptions" count={assumptions.length} sectionId="brief-assumptions">
          {editMode ? (
            <div className="constraint-edit">
              {assumptions.map((a: any, i: number) => (
                <div key={i} className="constraint-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={a.assumption || ''}
                      onChange={(e) => updateArrayItem('assumptions', i, { ...a, assumption: e.target.value })}
                      placeholder="Assumption"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('assumptions', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={a.category || ''}
                      onChange={(e) => updateArrayItem('assumptions', i, { ...a, category: e.target.value })}
                      placeholder="Category"
                    />
                    <input
                      type="text"
                      value={a.risk || ''}
                      onChange={(e) => updateArrayItem('assumptions', i, { ...a, risk: e.target.value })}
                      placeholder="Risk if wrong"
                    />
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('assumptions', { assumption: '', category: '' })}>+ Add Assumption</button>
            </div>
          ) : (
            <ul className="assumptions-list">
              {assumptions.map((a: any, i: number) => (
                <li key={i}>
                  {a.assumption}
                  {a.category && <span className="tag">{a.category}</span>}
                  {a.risk && <p><em>Risk if wrong: {a.risk}</em></p>}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Risks */}
      {(editMode || risks.length > 0) && (
        <CollapsibleSection title="Risks" count={risks.length} sectionId="brief-risks">
          {editMode ? (
            <div className="risk-edit">
              {risks.map((risk: any, i: number) => (
                <div key={i} className="risk-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={risk.risk || ''}
                      onChange={(e) => updateArrayItem('risks', i, { ...risk, risk: e.target.value })}
                      placeholder="Risk description"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('risks', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <select
                      value={risk.probability || ''}
                      onChange={(e) => updateArrayItem('risks', i, { ...risk, probability: e.target.value })}
                    >
                      <option value="">Probability...</option>
                      {['low', 'medium', 'high'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select
                      value={risk.impact || ''}
                      onChange={(e) => updateArrayItem('risks', i, { ...risk, impact: e.target.value })}
                    >
                      <option value="">Impact...</option>
                      {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <textarea
                    value={risk.mitigation || ''}
                    onChange={(e) => updateArrayItem('risks', i, { ...risk, mitigation: e.target.value })}
                    rows={2}
                    placeholder="Mitigation strategy..."
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('risks', { risk: '', probability: '', impact: '', mitigation: '' })}>+ Add Risk</button>
            </div>
          ) : (
            <>
              {riskManagementSummary && <p className="step-detail">{riskManagementSummary}</p>}
              <ul className="risks-list">
                {risks.map((risk: any, i: number) => (
                  <li key={i} className={`risk-item risk-${risk.impact || risk.probability}`}>
                    <span className="risk-text">{risk.risk}</span>
                    {risk.probability && <span className="tag">P: {risk.probability}</span>}
                    {risk.impact && <span className="risk-impact">{risk.impact}</span>}
                    {risk.priority && <span className="tag">{risk.priority}</span>}
                    {(risk.mitigation || risk.response) && <p><em>Mitigation: {risk.mitigation || risk.response}</em></p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Dependencies */}
      {(editMode || dependencies.length > 0) && (
        <CollapsibleSection title="Dependencies" count={dependencies.length} sectionId="brief-dependencies">
          {editMode ? (
            <div className="constraint-edit">
              {dependencies.map((d: any, i: number) => (
                <div key={i} className="constraint-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={d.dependency || ''}
                      onChange={(e) => updateArrayItem('dependencies', i, { ...d, dependency: e.target.value })}
                      placeholder="Dependency"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('dependencies', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={d.type || ''}
                      onChange={(e) => updateArrayItem('dependencies', i, { ...d, type: e.target.value })}
                      placeholder="Type (e.g., technical, team)"
                    />
                    <select
                      value={d.status || ''}
                      onChange={(e) => updateArrayItem('dependencies', i, { ...d, status: e.target.value })}
                    >
                      <option value="">Status...</option>
                      {['pending', 'in-progress', 'resolved', 'blocked'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('dependencies', { dependency: '', type: '', status: '' })}>+ Add Dependency</button>
            </div>
          ) : (
            <ul className="dependencies-list">
              {dependencies.map((d: any, i: number) => (
                <li key={i}>
                  {d.dependency}
                  {d.type && <span className="tag">{d.type}</span>}
                  {d.status && <span className="tag">{d.status}</span>}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Timeline */}
      {(editMode || timeline.overview || timeline.milestones?.length > 0 || timeline.phases?.length > 0) && (
        <CollapsibleSection title="Timeline" sectionId="brief-timeline">
          {editMode ? (
            <div className="arch-context-edit">
              <label>
                <span className="field-label">Overview</span>
                <textarea
                  value={timeline.overview || ''}
                  onChange={(e) => handleFieldChange('timeline', { ...timeline, overview: e.target.value })}
                  rows={2}
                  placeholder="Timeline overview..."
                />
              </label>
              <h5>Milestones</h5>
              {(timeline.milestones || []).map((m: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={m.milestone || ''}
                      onChange={(e) => {
                        const updated = [...(timeline.milestones || [])];
                        updated[i] = { ...m, milestone: e.target.value };
                        handleFieldChange('timeline', { ...timeline, milestones: updated });
                      }}
                      placeholder="Milestone name"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(timeline.milestones || [])];
                      updated.splice(i, 1);
                      handleFieldChange('timeline', { ...timeline, milestones: updated });
                    }}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={m.targetDate || ''}
                      onChange={(e) => {
                        const updated = [...(timeline.milestones || [])];
                        updated[i] = { ...m, targetDate: e.target.value };
                        handleFieldChange('timeline', { ...timeline, milestones: updated });
                      }}
                      placeholder="Target date"
                    />
                    <input
                      type="text"
                      value={m.description || ''}
                      onChange={(e) => {
                        const updated = [...(timeline.milestones || [])];
                        updated[i] = { ...m, description: e.target.value };
                        handleFieldChange('timeline', { ...timeline, milestones: updated });
                      }}
                      placeholder="Description"
                    />
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('timeline', { ...timeline, milestones: [...(timeline.milestones || []), { milestone: '', targetDate: '' }] });
              }}>+ Add Milestone</button>
              <h5>Phases</h5>
              {(timeline.phases || []).map((p: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={p.phase || ''}
                      onChange={(e) => {
                        const updated = [...(timeline.phases || [])];
                        updated[i] = { ...p, phase: e.target.value };
                        handleFieldChange('timeline', { ...timeline, phases: updated });
                      }}
                      placeholder="Phase name"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(timeline.phases || [])];
                      updated.splice(i, 1);
                      handleFieldChange('timeline', { ...timeline, phases: updated });
                    }}>×</button>
                  </div>
                  <input
                    type="text"
                    value={p.duration || ''}
                    onChange={(e) => {
                      const updated = [...(timeline.phases || [])];
                      updated[i] = { ...p, duration: e.target.value };
                      handleFieldChange('timeline', { ...timeline, phases: updated });
                    }}
                    placeholder="Duration"
                    className="full-width-input"
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('timeline', { ...timeline, phases: [...(timeline.phases || []), { phase: '', duration: '' }] });
              }}>+ Add Phase</button>
            </div>
          ) : (
            <>
              {timeline.overview && <Md text={timeline.overview} />}
              {timeline.milestones?.length > 0 && (
                <div className="timeline-subsection">
                  <h5>Milestones</h5>
                  <ul className="milestones-list">{timeline.milestones.map((m: any, i: number) => (
                    <li key={i}><strong>{m.milestone}</strong>{m.targetDate && ` — ${m.targetDate}`}{m.description && `: ${m.description}`}</li>
                  ))}</ul>
                </div>
              )}
              {timeline.phases?.length > 0 && (
                <div className="timeline-subsection">
                  <h5>Phases</h5>
                  <ul className="phases-list">{timeline.phases.map((p: any, i: number) => (
                    <li key={i}><strong>{p.phase}</strong>{p.duration && ` (${p.duration})`}</li>
                  ))}</ul>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Stakeholders */}
      {(editMode || stakeholders.length > 0) && (
        <CollapsibleSection title="Stakeholders" count={stakeholders.length} sectionId="brief-stakeholders">
          {editMode ? (
            <div className="component-edit">
              {stakeholders.map((s: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={s.role || ''}
                      onChange={(e) => updateArrayItem('stakeholders', i, { ...s, role: e.target.value })}
                      placeholder="Role"
                    />
                    <button className="remove-btn" onClick={() => removeFromArray('stakeholders', i)}>×</button>
                  </div>
                  <div className="detail-row">
                    <input
                      type="text"
                      value={s.name || ''}
                      onChange={(e) => updateArrayItem('stakeholders', i, { ...s, name: e.target.value })}
                      placeholder="Name"
                    />
                    <select
                      value={s.involvement || ''}
                      onChange={(e) => updateArrayItem('stakeholders', i, { ...s, involvement: e.target.value })}
                    >
                      <option value="">Involvement...</option>
                      {['sponsor', 'decision-maker', 'contributor', 'informed'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={Array.isArray(s.responsibilities) ? s.responsibilities.join(', ') : ''}
                    onChange={(e) => updateArrayItem('stakeholders', i, { ...s, responsibilities: e.target.value.split(',').map((r: string) => r.trim()).filter(Boolean) })}
                    placeholder="Responsibilities (comma-separated)"
                    className="full-width-input"
                  />
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addToArray('stakeholders', { role: '', name: '', involvement: '' })}>+ Add Stakeholder</button>
            </div>
          ) : (
            <ul className="stakeholders-list">
              {stakeholders.map((s: any, i: number) => (
                <li key={i}>
                  <strong>{s.role}</strong>{s.name && ` — ${s.name}`}
                  {s.involvement && <span className="tag">{s.involvement}</span>}
                  {s.responsibilities?.length > 0 && <p>{s.responsibilities.join(', ')}</p>}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Additional Context */}
      {(editMode || additionalContext.background || additionalContext.notes?.length > 0 || additionalContext.openQuestions?.length > 0) && (
        <CollapsibleSection title="Additional Context" sectionId="brief-additionalContext">
          {editMode ? (
            <div className="arch-context-edit">
              <label>
                <span className="field-label">Background</span>
                <textarea
                  value={additionalContext.background || ''}
                  onChange={(e) => handleFieldChange('additionalContext', { ...additionalContext, background: e.target.value })}
                  rows={3}
                  placeholder="Background context..."
                />
              </label>
              <h5>Notes</h5>
              <div className="editable-list">
                {(additionalContext.notes || []).map((n: string, i: number) => (
                  <div key={i} className="editable-list-item">
                    <input
                      type="text"
                      value={n}
                      onChange={(e) => {
                        const updated = [...(additionalContext.notes || [])];
                        updated[i] = e.target.value;
                        handleFieldChange('additionalContext', { ...additionalContext, notes: updated });
                      }}
                      placeholder="Note..."
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(additionalContext.notes || [])];
                      updated.splice(i, 1);
                      handleFieldChange('additionalContext', { ...additionalContext, notes: updated });
                    }}>×</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('additionalContext', { ...additionalContext, notes: [...(additionalContext.notes || []), ''] });
              }}>+ Add Note</button>
              <h5>Open Questions</h5>
              {(additionalContext.openQuestions || []).map((q: any, i: number) => (
                <div key={i} className="component-edit">
                  <div className="editable-item-header">
                    <input
                      type="text"
                      value={q.question || ''}
                      onChange={(e) => {
                        const updated = [...(additionalContext.openQuestions || [])];
                        updated[i] = { ...q, question: e.target.value };
                        handleFieldChange('additionalContext', { ...additionalContext, openQuestions: updated });
                      }}
                      placeholder="Question"
                    />
                    <button className="remove-btn" onClick={() => {
                      const updated = [...(additionalContext.openQuestions || [])];
                      updated.splice(i, 1);
                      handleFieldChange('additionalContext', { ...additionalContext, openQuestions: updated });
                    }}>×</button>
                  </div>
                  <select
                    value={q.status || ''}
                    onChange={(e) => {
                      const updated = [...(additionalContext.openQuestions || [])];
                      updated[i] = { ...q, status: e.target.value };
                      handleFieldChange('additionalContext', { ...additionalContext, openQuestions: updated });
                    }}
                  >
                    <option value="">Status...</option>
                    {['open', 'in-discussion', 'resolved', 'deferred'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => {
                handleFieldChange('additionalContext', { ...additionalContext, openQuestions: [...(additionalContext.openQuestions || []), { question: '', status: 'open' }] });
              }}>+ Add Question</button>
            </div>
          ) : (
            <>
              {additionalContext.background && <p>{additionalContext.background}</p>}
              {additionalContext.notes?.length > 0 && (
                <div className="context-subsection"><h5>Notes</h5>
                  <ul className="notes-list">{additionalContext.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
                </div>
              )}
              {additionalContext.openQuestions?.length > 0 && (
                <div className="context-subsection"><h5>Open Questions</h5>
                  <ul className="open-questions-list">{additionalContext.openQuestions.map((q: any, i: number) => (
                    <li key={i}>{q.question}{q.status && <span className="tag">{q.status}</span>}</li>
                  ))}</ul>
                </div>
              )}
              {additionalContext.references?.length > 0 && (
                <div className="context-subsection"><h5>References</h5>
                  <ul className="references-list">{additionalContext.references.map((r: any, i: number) => (
                    <li key={i}><strong>{r.title}</strong>{r.location && ` — ${r.location}`}{r.description && `: ${r.description}`}</li>
                  ))}</ul>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}
