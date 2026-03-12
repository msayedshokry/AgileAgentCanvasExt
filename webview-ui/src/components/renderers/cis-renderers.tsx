// ==========================================================================
// CIS RENDERERS — Creative & Innovation Strategy renderers
// Contains: storytelling, problem-solving, innovation-strategy, design-thinking
// ==========================================================================

import { RendererProps, CollapsibleSection, Md } from './shared';

// ==========================================================================
// STORYTELLING DETAILS
// ==========================================================================

export function renderStorytellingDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const targetAudience = d.targetAudience || {};
  const audienceProfile = targetAudience.audienceProfile || {};
  const stateChange = targetAudience.stateChange || {};
  const strategicContext = d.strategicContext || {};
  const frameworkApplication = d.frameworkApplication || {};
  const frameworkElements: any[] = frameworkApplication.frameworkElements || [];
  const structure = d.structure || {};
  const openingHook = structure.openingHook || {};
  const setup = structure.setup || {};
  const storyBeats: any[] = structure.storyBeats || [];
  const emotionalArc = structure.emotionalArc || {};
  const arcPoints: any[] = emotionalArc.arcPoints || [];
  const conflict = structure.conflict || {};
  const resolution = structure.resolution || {};
  const elements = d.elements || {};
  const characters: any[] = elements.characters || [];
  const setting = elements.setting || {};
  const emotionalTouchpoints: any[] = elements.emotionalTouchpoints || [];
  const keyMessages: any[] = elements.keyMessages || [];
  const memorableLines: any[] = elements.memorableLines || [];
  const variations = d.variations || {};
  const visualElements = d.visualElements || {};
  const suggestedImagery: any[] = visualElements.suggestedImagery || [];
  const dataVisualization: any[] = visualElements.dataVisualization || [];
  const usageGuidelines = d.usageGuidelines || {};
  const bestChannels: any[] = usageGuidelines.bestChannels || [];
  const deliveryTips: any[] = usageGuidelines.deliveryTips || [];
  const adaptationSuggestions: any[] = usageGuidelines.adaptationSuggestions || [];
  const doNotChange: any[] = usageGuidelines.doNotChange || [];
  const flexibleElements: any[] = usageGuidelines.flexibleElements || [];
  const testing = d.testing || {};
  const feedback: any[] = testing.feedback || [];
  const metrics: any[] = testing.metrics || [];
  const nextSteps = d.nextSteps || {};
  const refinementOpportunities: any[] = nextSteps.refinementOpportunities || [];
  const additionalVersionsNeeded: any[] = nextSteps.additionalVersionsNeeded || [];
  const relatedStories: any[] = nextSteps.relatedStories || [];
  const strategicKeyMessages: any[] = strategicContext.keyMessages || [];
  const constraints: any[] = strategicContext.constraints || [];

  return (
    <>
      {/* Story Type & Framework */}
      {(d.storyType || d.frameworkName || d.storyTitle) && (
        <CollapsibleSection title="Story Overview" sectionId="st-overview">
          {editMode ? (
            <div className="edit-grid">
              <label>Story Title</label>
              <input value={d.storyTitle || ''} onChange={(e) => handleFieldChange('storyTitle', e.target.value)} />
              <label>Story Type</label>
              <input value={d.storyType || ''} onChange={(e) => handleFieldChange('storyType', e.target.value)} placeholder="pitch, case study, brand story..." />
              <label>Framework</label>
              <input value={d.frameworkName || ''} onChange={(e) => handleFieldChange('frameworkName', e.target.value)} placeholder="Hero's Journey, STAR, PAS..." />
              <label>Purpose</label>
              <textarea rows={3} value={d.purpose || ''} onChange={(e) => handleFieldChange('purpose', e.target.value)} />
            </div>
          ) : (
            <div className="detail-grid">
              {d.storyTitle && <><span className="label">Title</span><span>{d.storyTitle}</span></>}
              {d.storyType && <><span className="label">Type</span><span className="badge">{d.storyType}</span></>}
              {d.frameworkName && <><span className="label">Framework</span><span className="badge">{d.frameworkName}</span></>}
              {d.purpose && <><span className="label">Purpose</span><span><Md text={d.purpose} /></span></>}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Target Audience */}
      {(targetAudience.primary || audienceProfile.demographics) && (
        <CollapsibleSection title="Target Audience" sectionId="st-audience">
          {editMode ? (
            <div className="edit-grid">
              <label>Primary Audience</label>
              <textarea rows={2} value={targetAudience.primary || ''} onChange={(e) => handleFieldChange('targetAudience', { ...targetAudience, primary: e.target.value })} />
              <label>Secondary Audience</label>
              <input value={targetAudience.secondary || ''} onChange={(e) => handleFieldChange('targetAudience', { ...targetAudience, secondary: e.target.value })} />
              <label>Demographics</label>
              <input value={audienceProfile.demographics || ''} onChange={(e) => handleFieldChange('targetAudience', { ...targetAudience, audienceProfile: { ...audienceProfile, demographics: e.target.value } })} />
              <label>Psychographics</label>
              <input value={audienceProfile.psychographics || ''} onChange={(e) => handleFieldChange('targetAudience', { ...targetAudience, audienceProfile: { ...audienceProfile, psychographics: e.target.value } })} />
              <label>Knowledge Level</label>
              <input value={audienceProfile.knowledgeLevel || ''} onChange={(e) => handleFieldChange('targetAudience', { ...targetAudience, audienceProfile: { ...audienceProfile, knowledgeLevel: e.target.value } })} />
              <label>Current State</label>
              <textarea rows={2} value={stateChange.currentState || ''} onChange={(e) => handleFieldChange('targetAudience', { ...targetAudience, stateChange: { ...stateChange, currentState: e.target.value } })} />
              <label>Desired State</label>
              <textarea rows={2} value={stateChange.desiredState || ''} onChange={(e) => handleFieldChange('targetAudience', { ...targetAudience, stateChange: { ...stateChange, desiredState: e.target.value } })} />
            </div>
          ) : (
            <>
              <div className="detail-grid">
                {targetAudience.primary && <><span className="label">Primary</span><span><Md text={targetAudience.primary} /></span></>}
                {targetAudience.secondary && <><span className="label">Secondary</span><span>{targetAudience.secondary}</span></>}
              </div>
              {audienceProfile.demographics && (
                <div className="detail-grid" style={{ marginTop: 8 }}>
                  {audienceProfile.demographics && <><span className="label">Demographics</span><span>{audienceProfile.demographics}</span></>}
                  {audienceProfile.psychographics && <><span className="label">Psychographics</span><span>{audienceProfile.psychographics}</span></>}
                  {audienceProfile.knowledgeLevel && <><span className="label">Knowledge Level</span><span>{audienceProfile.knowledgeLevel}</span></>}
                </div>
              )}
              {(audienceProfile.painPoints?.length > 0 || audienceProfile.aspirations?.length > 0) && (
                <div style={{ marginTop: 8 }}>
                  {audienceProfile.painPoints?.length > 0 && <div><strong>Pain Points:</strong> {audienceProfile.painPoints.join(', ')}</div>}
                  {audienceProfile.aspirations?.length > 0 && <div><strong>Aspirations:</strong> {audienceProfile.aspirations.join(', ')}</div>}
                </div>
              )}
              {(stateChange.currentState || stateChange.desiredState) && (
                <div className="detail-grid" style={{ marginTop: 8 }}>
                  {stateChange.currentState && <><span className="label">Current State</span><span>{stateChange.currentState}</span></>}
                  {stateChange.desiredState && <><span className="label">Desired State</span><span>{stateChange.desiredState}</span></>}
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Strategic Context */}
      {(strategicContext.brandVoice || strategicKeyMessages.length > 0 || strategicContext.callToAction) && (
        <CollapsibleSection title="Strategic Context" sectionId="st-strategic">
          {editMode ? (
            <div className="edit-grid">
              <label>Brand Voice</label>
              <textarea rows={2} value={strategicContext.brandVoice || ''} onChange={(e) => handleFieldChange('strategicContext', { ...strategicContext, brandVoice: e.target.value })} />
              <label>Call to Action</label>
              <textarea rows={2} value={strategicContext.callToAction || ''} onChange={(e) => handleFieldChange('strategicContext', { ...strategicContext, callToAction: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="detail-grid">
                {strategicContext.brandVoice && <><span className="label">Brand Voice</span><span><Md text={strategicContext.brandVoice} /></span></>}
                {strategicContext.callToAction && <><span className="label">Call to Action</span><span>{strategicContext.callToAction}</span></>}
              </div>
              {strategicKeyMessages.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Key Messages:</strong>
                  <ul className="compact-list">{strategicKeyMessages.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
                </div>
              )}
              {constraints.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Constraints:</strong>
                  <ul className="compact-list">{constraints.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Framework Application */}
      {frameworkElements.length > 0 && (
        <CollapsibleSection title="Framework Application" count={frameworkElements.length} sectionId="st-framework">
          {editMode ? (
            <div className="edit-grid">
              <label>Framework Notes</label>
              <textarea rows={3} value={frameworkApplication.frameworkNotes || ''} onChange={(e) => handleFieldChange('frameworkApplication', { ...frameworkApplication, frameworkNotes: e.target.value })} />
            </div>
          ) : (
            <>
              {frameworkApplication.frameworkNotes && <div style={{ marginBottom: 8 }}><Md text={frameworkApplication.frameworkNotes} /></div>}
              {frameworkElements.map((el: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="nested-card-header">{el.element || `Element ${i + 1}`}</div>
                  {el.content && <div style={{ marginBottom: 4 }}><Md text={el.content} /></div>}
                  <div className="detail-grid">
                    {el.purpose && <><span className="label">Purpose</span><span>{el.purpose}</span></>}
                    {el.emotionalGoal && <><span className="label">Emotional Goal</span><span>{el.emotionalGoal}</span></>}
                  </div>
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Story Structure */}
      {(openingHook.text || setup.text || structure.coreNarrative || storyBeats.length > 0) && (
        <CollapsibleSection title="Story Structure" sectionId="st-structure">
          {editMode ? (
            <div className="edit-grid">
              <label>Opening Hook</label>
              <textarea rows={3} value={openingHook.text || ''} onChange={(e) => handleFieldChange('structure', { ...structure, openingHook: { ...openingHook, text: e.target.value } })} />
              <label>Hook Technique</label>
              <input value={openingHook.technique || ''} onChange={(e) => handleFieldChange('structure', { ...structure, openingHook: { ...openingHook, technique: e.target.value } })} />
              <label>Setup</label>
              <textarea rows={3} value={setup.text || ''} onChange={(e) => handleFieldChange('structure', { ...structure, setup: { ...setup, text: e.target.value } })} />
              <label>Core Narrative</label>
              <textarea rows={6} value={structure.coreNarrative || ''} onChange={(e) => handleFieldChange('structure', { ...structure, coreNarrative: e.target.value })} />
              <label>Resolution</label>
              <textarea rows={3} value={resolution.text || ''} onChange={(e) => handleFieldChange('structure', { ...structure, resolution: { ...resolution, text: e.target.value } })} />
              <label>Call to Action</label>
              <textarea rows={2} value={resolution.callToAction || ''} onChange={(e) => handleFieldChange('structure', { ...structure, resolution: { ...resolution, callToAction: e.target.value } })} />
            </div>
          ) : (
            <>
              {openingHook.text && (
                <div className="nested-card">
                  <div className="nested-card-header">Opening Hook</div>
                  <Md text={openingHook.text} />
                  <div className="detail-grid" style={{ marginTop: 4 }}>
                    {openingHook.technique && <><span className="label">Technique</span><span className="badge">{openingHook.technique}</span></>}
                    {openingHook.emotionalTrigger && <><span className="label">Emotional Trigger</span><span>{openingHook.emotionalTrigger}</span></>}
                  </div>
                </div>
              )}
              {setup.text && (
                <div className="nested-card">
                  <div className="nested-card-header">Setup</div>
                  <Md text={setup.text} />
                  {(setup.worldBuilding || setup.stakesEstablished) && (
                    <div className="detail-grid" style={{ marginTop: 4 }}>
                      {setup.worldBuilding && <><span className="label">World Building</span><span>{setup.worldBuilding}</span></>}
                      {setup.stakesEstablished && <><span className="label">Stakes</span><span>{setup.stakesEstablished}</span></>}
                    </div>
                  )}
                </div>
              )}
              {structure.coreNarrative && (
                <div className="nested-card">
                  <div className="nested-card-header">Core Narrative</div>
                  <Md text={structure.coreNarrative} />
                </div>
              )}
              {storyBeats.length > 0 && storyBeats.map((beat: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="nested-card-header">Beat {beat.beatNumber || i + 1}</div>
                  {beat.beat && <Md text={beat.beat} />}
                  <div className="detail-grid" style={{ marginTop: 4 }}>
                    {beat.purpose && <><span className="label">Purpose</span><span>{beat.purpose}</span></>}
                    {beat.emotion && <><span className="label">Emotion</span><span>{beat.emotion}</span></>}
                    {beat.transition && <><span className="label">Transition</span><span>{beat.transition}</span></>}
                  </div>
                </div>
              ))}
              {(conflict.mainConflict || (conflict.obstacles?.length > 0)) && (
                <div className="nested-card">
                  <div className="nested-card-header">Conflict</div>
                  {conflict.mainConflict && <div><Md text={conflict.mainConflict} /></div>}
                  {conflict.stakes && <div className="detail-grid"><span className="label">Stakes</span><span>{conflict.stakes}</span></div>}
                  {conflict.obstacles?.length > 0 && (
                    <div style={{ marginTop: 4 }}><strong>Obstacles:</strong>
                      <ul className="compact-list">{conflict.obstacles.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
              {resolution.text && (
                <div className="nested-card">
                  <div className="nested-card-header">Resolution</div>
                  <Md text={resolution.text} />
                  <div className="detail-grid" style={{ marginTop: 4 }}>
                    {resolution.transformation && <><span className="label">Transformation</span><span>{resolution.transformation}</span></>}
                    {resolution.callToAction && <><span className="label">Call to Action</span><span>{resolution.callToAction}</span></>}
                    {resolution.lingeringEmotion && <><span className="label">Lingering Emotion</span><span>{resolution.lingeringEmotion}</span></>}
                  </div>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Emotional Arc */}
      {(emotionalArc.description || arcPoints.length > 0) && (
        <CollapsibleSection title="Emotional Arc" sectionId="st-arc">
          {editMode ? (
            <div className="edit-grid">
              <label>Arc Description</label>
              <textarea rows={3} value={emotionalArc.description || ''} onChange={(e) => handleFieldChange('structure', { ...structure, emotionalArc: { ...emotionalArc, description: e.target.value } })} />
              <label>Climax</label>
              <textarea rows={2} value={emotionalArc.climax || ''} onChange={(e) => handleFieldChange('structure', { ...structure, emotionalArc: { ...emotionalArc, climax: e.target.value } })} />
            </div>
          ) : (
            <>
              {emotionalArc.description && <div style={{ marginBottom: 8 }}><Md text={emotionalArc.description} /></div>}
              {arcPoints.length > 0 && arcPoints.map((ap: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span className="badge" style={{ background: ap.intensity === 'peak' ? 'var(--vscode-errorForeground)' : ap.intensity === 'high' ? 'var(--vscode-editorWarning-foreground)' : undefined }}>{ap.intensity || 'medium'}</span>
                  <span><strong>{ap.point}</strong> — {ap.emotion}</span>
                </div>
              ))}
              {emotionalArc.climax && <div style={{ marginTop: 8 }}><strong>Climax:</strong> {emotionalArc.climax}</div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Complete Story */}
      {d.completeStory && (
        <CollapsibleSection title="Complete Story" sectionId="st-complete">
          {editMode ? (
            <textarea rows={12} style={{ width: '100%' }} value={d.completeStory || ''} onChange={(e) => handleFieldChange('completeStory', e.target.value)} />
          ) : (
            <Md text={d.completeStory} />
          )}
        </CollapsibleSection>
      )}

      {/* Characters */}
      {characters.length > 0 && (
        <CollapsibleSection title="Characters" count={characters.length} sectionId="st-characters">
          {characters.map((ch: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">
                {ch.name || `Character ${i + 1}`}
                {ch.role && <span className="badge" style={{ marginLeft: 8 }}>{ch.role}</span>}
              </div>
              {editMode ? (
                <div className="edit-grid">
                  <label>Name</label>
                  <input value={ch.name || ''} onChange={(e) => { const chars = [...characters]; chars[i] = { ...ch, name: e.target.value }; handleFieldChange('elements', { ...elements, characters: chars }); }} />
                  <label>Description</label>
                  <textarea rows={2} value={ch.description || ''} onChange={(e) => { const chars = [...characters]; chars[i] = { ...ch, description: e.target.value }; handleFieldChange('elements', { ...elements, characters: chars }); }} />
                  <label>Motivation</label>
                  <input value={ch.motivation || ''} onChange={(e) => { const chars = [...characters]; chars[i] = { ...ch, motivation: e.target.value }; handleFieldChange('elements', { ...elements, characters: chars }); }} />
                </div>
              ) : (
                <>
                  {ch.description && <div style={{ marginBottom: 4 }}><Md text={ch.description} /></div>}
                  <div className="detail-grid">
                    {ch.motivation && <><span className="label">Motivation</span><span>{ch.motivation}</span></>}
                    {ch.arc && <><span className="label">Arc</span><span>{ch.arc}</span></>}
                  </div>
                </>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Story Elements */}
      {(elements.characterVoice || setting.description || elements.theme || elements.conflictTension || elements.transformation) && (
        <CollapsibleSection title="Story Elements" sectionId="st-elements">
          {editMode ? (
            <div className="edit-grid">
              <label>Narrative Voice</label>
              <textarea rows={2} value={elements.characterVoice || ''} onChange={(e) => handleFieldChange('elements', { ...elements, characterVoice: e.target.value })} />
              <label>Setting</label>
              <textarea rows={2} value={setting.description || ''} onChange={(e) => handleFieldChange('elements', { ...elements, setting: { ...setting, description: e.target.value } })} />
              <label>Theme</label>
              <textarea rows={2} value={elements.theme || ''} onChange={(e) => handleFieldChange('elements', { ...elements, theme: e.target.value })} />
              <label>Conflict & Tension</label>
              <textarea rows={2} value={elements.conflictTension || ''} onChange={(e) => handleFieldChange('elements', { ...elements, conflictTension: e.target.value })} />
              <label>Transformation</label>
              <textarea rows={2} value={elements.transformation || ''} onChange={(e) => handleFieldChange('elements', { ...elements, transformation: e.target.value })} />
            </div>
          ) : (
            <div className="detail-grid">
              {elements.characterVoice && <><span className="label">Narrative Voice</span><span><Md text={elements.characterVoice} /></span></>}
              {setting.description && <><span className="label">Setting</span><span><Md text={setting.description} /></span></>}
              {setting.significance && <><span className="label">Setting Significance</span><span>{setting.significance}</span></>}
              {elements.theme && <><span className="label">Theme</span><span><Md text={elements.theme} /></span></>}
              {elements.conflictTension && <><span className="label">Conflict & Tension</span><span><Md text={elements.conflictTension} /></span></>}
              {elements.transformation && <><span className="label">Transformation</span><span><Md text={elements.transformation} /></span></>}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Emotional Touchpoints */}
      {emotionalTouchpoints.length > 0 && (
        <CollapsibleSection title="Emotional Touchpoints" count={emotionalTouchpoints.length} sectionId="st-touchpoints">
          {emotionalTouchpoints.map((tp: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{tp.moment}</strong></div>
              <div className="detail-grid">
                {tp.emotion && <><span className="label">Emotion</span><span>{tp.emotion}</span></>}
                {tp.technique && <><span className="label">Technique</span><span>{tp.technique}</span></>}
                {tp.locationInStory && <><span className="label">Location</span><span>{tp.locationInStory}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Key Messages */}
      {keyMessages.length > 0 && (
        <CollapsibleSection title="Key Messages" count={keyMessages.length} sectionId="st-messages">
          {keyMessages.map((km: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{km.message}</strong></div>
              <div className="detail-grid">
                {km.howConveyed && <><span className="label">How Conveyed</span><span>{km.howConveyed}</span></>}
                {km.subtlety && <><span className="label">Subtlety</span><span className="badge">{km.subtlety}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Memorable Lines */}
      {memorableLines.length > 0 && (
        <CollapsibleSection title="Memorable Lines" count={memorableLines.length} sectionId="st-lines">
          {memorableLines.map((ml: any, i: number) => (
            <div key={i} className="nested-card">
              <div style={{ fontStyle: 'italic', marginBottom: 4 }}>"{ml.line}"</div>
              <div className="detail-grid">
                {ml.context && <><span className="label">Context</span><span>{ml.context}</span></>}
                {ml.useCase && <><span className="label">Use Case</span><span>{ml.useCase}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Story Variations */}
      {(variations.elevator || variations.short || variations.medium || variations.extended || variations.presentation || variations.video) && (
        <CollapsibleSection title="Story Variations" sectionId="st-variations">
          {(() => {
            const varList = [
              { key: 'elevator', label: 'Elevator Pitch', data: variations.elevator },
              { key: 'short', label: 'Short Version', data: variations.short },
              { key: 'medium', label: 'Medium Version', data: variations.medium },
              { key: 'extended', label: 'Extended Version', data: variations.extended },
              { key: 'presentation', label: 'Presentation', data: variations.presentation },
              { key: 'video', label: 'Video Script', data: variations.video },
            ].filter(v => v.data);
            return varList.map((v: any) => (
              <div key={v.key} className="nested-card">
                <div className="nested-card-header">{v.label}</div>
                {editMode ? (
                  <textarea rows={4} style={{ width: '100%' }} value={v.data.text || v.data.script || ''} onChange={(e) => handleFieldChange('variations', { ...variations, [v.key]: { ...v.data, [v.key === 'video' ? 'script' : 'text']: e.target.value } })} />
                ) : (
                  <>
                    <Md text={v.data.text || v.data.script || ''} />
                    <div className="detail-grid" style={{ marginTop: 4 }}>
                      {v.data.wordCount && <><span className="label">Words</span><span>{v.data.wordCount}</span></>}
                      {v.data.characterCount && <><span className="label">Characters</span><span>{v.data.characterCount}</span></>}
                      {v.data.duration && <><span className="label">Duration</span><span>{v.data.duration}</span></>}
                      {v.data.useCase && <><span className="label">Use Case</span><span>{v.data.useCase}</span></>}
                      {v.data.platform && <><span className="label">Platform</span><span>{v.data.platform}</span></>}
                    </div>
                    {v.data.slideNotes?.length > 0 && (
                      <div style={{ marginTop: 8 }}><strong>Slide Notes:</strong>
                        {v.data.slideNotes.map((sn: any, j: number) => (
                          <div key={j} className="nested-card">
                            <div className="detail-grid">
                              {sn.slideNumber !== undefined && <><span className="label">Slide</span><span>{sn.slideNumber}</span></>}
                              {sn.content && <><span className="label">Content</span><span>{sn.content}</span></>}
                              {sn.speakerNotes && <><span className="label">Speaker Notes</span><span>{sn.speakerNotes}</span></>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {v.data.visualNotes?.length > 0 && (
                      <div style={{ marginTop: 8 }}><strong>Visual Notes:</strong>
                        <ul className="compact-list">{v.data.visualNotes.map((vn: string, j: number) => <li key={j}>{vn}</li>)}</ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            ));
          })()}
        </CollapsibleSection>
      )}

      {/* Visual Elements */}
      {(suggestedImagery.length > 0 || dataVisualization.length > 0) && (
        <CollapsibleSection title="Visual Elements" sectionId="st-visuals">
          {suggestedImagery.length > 0 && suggestedImagery.map((img: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="detail-grid">
                {img.description && <><span className="label">Description</span><span>{img.description}</span></>}
                {img.purpose && <><span className="label">Purpose</span><span>{img.purpose}</span></>}
                {img.placement && <><span className="label">Placement</span><span>{img.placement}</span></>}
              </div>
            </div>
          ))}
          {dataVisualization.length > 0 && dataVisualization.map((dv: any, i: number) => (
            <div key={`dv-${i}`} className="nested-card">
              <div className="detail-grid">
                {dv.type && <><span className="label">Type</span><span className="badge">{dv.type}</span></>}
                {dv.data && <><span className="label">Data</span><span>{dv.data}</span></>}
                {dv.narrative && <><span className="label">Narrative</span><span>{dv.narrative}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Usage Guidelines */}
      {(bestChannels.length > 0 || usageGuidelines.toneNotes || deliveryTips.length > 0) && (
        <CollapsibleSection title="Usage Guidelines" sectionId="st-usage">
          {editMode ? (
            <div className="edit-grid">
              <label>Audience Considerations</label>
              <textarea rows={2} value={usageGuidelines.audienceConsiderations || ''} onChange={(e) => handleFieldChange('usageGuidelines', { ...usageGuidelines, audienceConsiderations: e.target.value })} />
              <label>Tone Notes</label>
              <textarea rows={2} value={usageGuidelines.toneNotes || ''} onChange={(e) => handleFieldChange('usageGuidelines', { ...usageGuidelines, toneNotes: e.target.value })} />
            </div>
          ) : (
            <>
              {usageGuidelines.audienceConsiderations && <div style={{ marginBottom: 8 }}><strong>Audience Considerations:</strong> <Md text={usageGuidelines.audienceConsiderations} /></div>}
              {usageGuidelines.toneNotes && <div style={{ marginBottom: 8 }}><strong>Tone Notes:</strong> <Md text={usageGuidelines.toneNotes} /></div>}
              {bestChannels.length > 0 && (
                <div style={{ marginBottom: 8 }}><strong>Best Channels:</strong>
                  {bestChannels.map((ch: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Channel</span><span>{ch.channel}</span>
                        {ch.format && <><span className="label">Format</span><span>{ch.format}</span></>}
                        {ch.notes && <><span className="label">Notes</span><span>{ch.notes}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {deliveryTips.length > 0 && <div style={{ marginBottom: 8 }}><strong>Delivery Tips:</strong><ul className="compact-list">{deliveryTips.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></div>}
              {adaptationSuggestions.length > 0 && (
                <div style={{ marginBottom: 8 }}><strong>Adaptation Suggestions:</strong>
                  {adaptationSuggestions.map((a: any, i: number) => (
                    <div key={i} className="nested-card"><strong>{a.scenario}:</strong> {a.suggestion}</div>
                  ))}
                </div>
              )}
              {doNotChange.length > 0 && <div style={{ marginBottom: 8 }}><strong>Do Not Change:</strong><ul className="compact-list">{doNotChange.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul></div>}
              {flexibleElements.length > 0 && <div><strong>Flexible Elements:</strong><ul className="compact-list">{flexibleElements.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Testing & Feedback */}
      {(testing.testingPlan || feedback.length > 0 || metrics.length > 0) && (
        <CollapsibleSection title="Testing & Feedback" sectionId="st-testing">
          {testing.testingPlan && <div style={{ marginBottom: 8 }}><strong>Testing Plan:</strong> <Md text={testing.testingPlan} /></div>}
          {feedback.length > 0 && feedback.map((fb: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="detail-grid">
                {fb.source && <><span className="label">Source</span><span>{fb.source}</span></>}
                {fb.feedback && <><span className="label">Feedback</span><span>{fb.feedback}</span></>}
                {fb.actionTaken && <><span className="label">Action</span><span>{fb.actionTaken}</span></>}
              </div>
            </div>
          ))}
          {metrics.length > 0 && metrics.map((m: any, i: number) => (
            <div key={`m-${i}`} className="nested-card">
              <div className="detail-grid">
                <span className="label">Metric</span><span>{m.metric}</span>
                <span className="label">Result</span><span>{m.result}</span>
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Next Steps */}
      {(refinementOpportunities.length > 0 || additionalVersionsNeeded.length > 0 || nextSteps.distributionPlan || relatedStories.length > 0) && (
        <CollapsibleSection title="Next Steps" sectionId="st-next">
          {editMode ? (
            <div className="edit-grid">
              <label>Distribution Plan</label>
              <textarea rows={3} value={nextSteps.distributionPlan || ''} onChange={(e) => handleFieldChange('nextSteps', { ...nextSteps, distributionPlan: e.target.value })} />
              <label>Feedback Plan</label>
              <textarea rows={3} value={nextSteps.feedbackPlan || ''} onChange={(e) => handleFieldChange('nextSteps', { ...nextSteps, feedbackPlan: e.target.value })} />
            </div>
          ) : (
            <>
              {refinementOpportunities.length > 0 && (
                <div style={{ marginBottom: 8 }}><strong>Refinement Opportunities:</strong>
                  {refinementOpportunities.map((r: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Area</span><span>{r.area}</span>
                        <span className="label">Opportunity</span><span>{r.opportunity}</span>
                        {r.priority && <><span className="label">Priority</span><span className="badge">{r.priority}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {additionalVersionsNeeded.length > 0 && (
                <div style={{ marginBottom: 8 }}><strong>Additional Versions Needed:</strong>
                  {additionalVersionsNeeded.map((v: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Version</span><span>{v.version}</span>
                        {v.purpose && <><span className="label">Purpose</span><span>{v.purpose}</span></>}
                        {v.deadline && <><span className="label">Deadline</span><span>{v.deadline}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {nextSteps.distributionPlan && <div style={{ marginBottom: 8 }}><strong>Distribution Plan:</strong> <Md text={nextSteps.distributionPlan} /></div>}
              {nextSteps.feedbackPlan && <div style={{ marginBottom: 8 }}><strong>Feedback Plan:</strong> <Md text={nextSteps.feedbackPlan} /></div>}
              {relatedStories.length > 0 && <div><strong>Related Stories:</strong><ul className="compact-list">{relatedStories.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>}
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// PROBLEM SOLVING DETAILS
// ==========================================================================

export function renderProblemSolvingDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const sessionInfo = d.sessionInfo || {};
  const participants: any[] = sessionInfo.participants || [];
  const problemDef = d.problemDefinition || {};
  const stakeholders: any[] = problemDef.stakeholders || [];
  const impact = problemDef.impact || {};
  const successCriteria: any[] = problemDef.successCriteria || [];
  const diagnosis = d.diagnosis || {};
  const problemBoundaries = diagnosis.problemBoundaries || {};
  const isItems: any[] = problemBoundaries.is || [];
  const isNotItems: any[] = problemBoundaries.isNot || [];
  const rootCauseAnalysis = diagnosis.rootCauseAnalysis || {};
  const rootCauses: any[] = rootCauseAnalysis.rootCauses || [];
  const contributingFactors: any[] = diagnosis.contributingFactors || [];
  const timelineAnalysis: any[] = diagnosis.timelineAnalysis || [];
  const analysis = d.analysis || {};
  const forceField = analysis.forceField || {};
  const drivingForces: any[] = forceField.drivingForces || [];
  const restrainingForces: any[] = forceField.restrainingForces || [];
  const analysisConstraints: any[] = analysis.constraints || [];
  const assumptions: any[] = analysis.assumptions || [];
  const keyInsights: any[] = analysis.keyInsights || [];
  const solutionGen = d.solutionGeneration || {};
  const generatedSolutions: any[] = solutionGen.generatedSolutions || [];
  const solutionEval = d.solutionEvaluation || {};
  const evaluationCriteria: any[] = solutionEval.evaluationCriteria || [];
  const solutionAnalysis: any[] = solutionEval.solutionAnalysis || [];
  const recommended = d.recommendedSolution || {};
  const rootCausesAddressed: any[] = recommended.rootCausesAddressed || [];
  const expectedOutcomes: any[] = recommended.expectedOutcomes || [];
  const tradeoffs: any[] = recommended.tradeoffs || [];
  const implPlan = d.implementationPlan || {};
  const phases: any[] = implPlan.phases || [];
  const actionSteps: any[] = implPlan.actionSteps || [];
  const resourcesNeeded: any[] = implPlan.resourcesNeeded || [];
  const monitoring = d.monitoring || {};
  const monitorMetrics: any[] = monitoring.successMetrics || [];
  const checkpoints: any[] = monitoring.checkpoints || [];
  const riskMitigation: any[] = monitoring.riskMitigation || [];
  const lessonsLearned = d.lessonsLearned || {};
  const keyLearnings: any[] = lessonsLearned.keyLearnings || [];

  const urgencyColor = (u: string) => {
    if (u === 'critical') return 'var(--vscode-errorForeground)';
    if (u === 'high') return 'var(--vscode-editorWarning-foreground)';
    return undefined;
  };

  return (
    <>
      {/* Session Info & Problem Header */}
      {(d.problemTitle || d.problemCategory || sessionInfo.facilitator) && (
        <CollapsibleSection title="Problem Overview" sectionId="ps-overview">
          {editMode ? (
            <div className="edit-grid">
              <label>Problem Title</label>
              <input value={d.problemTitle || ''} onChange={(e) => handleFieldChange('problemTitle', e.target.value)} />
              <label>Category</label>
              <input value={d.problemCategory || ''} onChange={(e) => handleFieldChange('problemCategory', e.target.value)} placeholder="technical, process, organizational..." />
              <label>Methodology</label>
              <input value={sessionInfo.methodology || ''} onChange={(e) => handleFieldChange('sessionInfo', { ...sessionInfo, methodology: e.target.value })} />
              <label>Facilitator</label>
              <input value={sessionInfo.facilitator || ''} onChange={(e) => handleFieldChange('sessionInfo', { ...sessionInfo, facilitator: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="detail-grid">
                {d.problemTitle && <><span className="label">Problem</span><span><strong>{d.problemTitle}</strong></span></>}
                {d.problemCategory && <><span className="label">Category</span><span className="badge">{d.problemCategory}</span></>}
                {sessionInfo.methodology && <><span className="label">Methodology</span><span className="badge">{sessionInfo.methodology}</span></>}
                {sessionInfo.facilitator && <><span className="label">Facilitator</span><span>{sessionInfo.facilitator}</span></>}
                {sessionInfo.date && <><span className="label">Date</span><span>{sessionInfo.date}</span></>}
                {sessionInfo.duration && <><span className="label">Duration</span><span>{sessionInfo.duration}</span></>}
              </div>
              {participants.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>Participants:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {participants.map((p: any, i: number) => (
                      <span key={i} className="badge" title={p.expertise}>{p.name} ({p.role})</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Problem Definition */}
      {(problemDef.refinedStatement || problemDef.initialStatement || problemDef.context) && (
        <CollapsibleSection title="Problem Definition" sectionId="ps-definition">
          {editMode ? (
            <div className="edit-grid">
              <label>Initial Statement</label>
              <textarea rows={3} value={problemDef.initialStatement || ''} onChange={(e) => handleFieldChange('problemDefinition', { ...problemDef, initialStatement: e.target.value })} />
              <label>Refined Statement</label>
              <textarea rows={3} value={problemDef.refinedStatement || ''} onChange={(e) => handleFieldChange('problemDefinition', { ...problemDef, refinedStatement: e.target.value })} />
              <label>Context</label>
              <textarea rows={4} value={problemDef.context || ''} onChange={(e) => handleFieldChange('problemDefinition', { ...problemDef, context: e.target.value })} />
              <label>Urgency</label>
              <select value={problemDef.urgency || ''} onChange={(e) => handleFieldChange('problemDefinition', { ...problemDef, urgency: e.target.value })}>
                <option value="">Select...</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          ) : (
            <>
              {problemDef.refinedStatement && (
                <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-focusBorder)' }}>
                  <div className="nested-card-header">Refined Problem Statement</div>
                  <Md text={problemDef.refinedStatement} />
                </div>
              )}
              {problemDef.initialStatement && problemDef.initialStatement !== problemDef.refinedStatement && (
                <div style={{ marginTop: 8, opacity: 0.8 }}><strong>Initial Statement:</strong> <Md text={problemDef.initialStatement} /></div>
              )}
              {problemDef.context && <div style={{ marginTop: 8 }}><strong>Context:</strong> <Md text={problemDef.context} /></div>}
              {problemDef.urgency && (
                <div style={{ marginTop: 8 }}>
                  <span className="label">Urgency:</span>{' '}
                  <span className="badge" style={{ color: urgencyColor(problemDef.urgency) }}>{problemDef.urgency}</span>
                </div>
              )}
              {(impact.businessImpact || impact.financialImpact || impact.operationalImpact || impact.customerImpact) && (
                <div className="detail-grid" style={{ marginTop: 8 }}>
                  {impact.businessImpact && <><span className="label">Business Impact</span><span>{impact.businessImpact}</span></>}
                  {impact.financialImpact && <><span className="label">Financial Impact</span><span>{impact.financialImpact}</span></>}
                  {impact.operationalImpact && <><span className="label">Operational Impact</span><span>{impact.operationalImpact}</span></>}
                  {impact.customerImpact && <><span className="label">Customer Impact</span><span>{impact.customerImpact}</span></>}
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Stakeholders */}
      {stakeholders.length > 0 && (
        <CollapsibleSection title="Stakeholders" count={stakeholders.length} sectionId="ps-stakeholders">
          {stakeholders.map((s: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="detail-grid">
                <span className="label">Stakeholder</span><span><strong>{s.stakeholder}</strong></span>
                {s.impact && <><span className="label">Impact</span><span>{s.impact}</span></>}
                {s.interest && <><span className="label">Interest</span><span>{s.interest}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Success Criteria */}
      {successCriteria.length > 0 && (
        <CollapsibleSection title="Success Criteria" count={successCriteria.length} sectionId="ps-success">
          {successCriteria.map((sc: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="detail-grid">
                <span className="label">Criterion</span><span>{sc.criterion}</span>
                {sc.metric && <><span className="label">Metric</span><span>{sc.metric}</span></>}
                {sc.target && <><span className="label">Target</span><span>{sc.target}</span></>}
                {sc.priority && <><span className="label">Priority</span><span className="badge">{sc.priority}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Root Cause Analysis */}
      {(rootCauseAnalysis.analysis || rootCauses.length > 0) && (
        <CollapsibleSection title="Root Cause Analysis" sectionId="ps-rca">
          {editMode ? (
            <div className="edit-grid">
              <label>Method</label>
              <input value={rootCauseAnalysis.method || ''} onChange={(e) => handleFieldChange('diagnosis', { ...diagnosis, rootCauseAnalysis: { ...rootCauseAnalysis, method: e.target.value } })} placeholder="5 Whys, Fishbone, etc." />
              <label>Analysis</label>
              <textarea rows={5} value={rootCauseAnalysis.analysis || ''} onChange={(e) => handleFieldChange('diagnosis', { ...diagnosis, rootCauseAnalysis: { ...rootCauseAnalysis, analysis: e.target.value } })} />
            </div>
          ) : (
            <>
              {rootCauseAnalysis.method && <div style={{ marginBottom: 8 }}><strong>Method:</strong> <span className="badge">{rootCauseAnalysis.method}</span></div>}
              {rootCauseAnalysis.analysis && <div style={{ marginBottom: 8 }}><Md text={rootCauseAnalysis.analysis} /></div>}
              {rootCauses.length > 0 && rootCauses.map((rc: any, i: number) => (
                <div key={i} className="nested-card">
                  <div><strong>{rc.cause}</strong></div>
                  <div className="detail-grid" style={{ marginTop: 4 }}>
                    {rc.category && <><span className="label">Category</span><span className="badge">{rc.category}</span></>}
                    {rc.confidence && <><span className="label">Confidence</span><span className="badge">{rc.confidence}</span></>}
                    {rc.evidence && <><span className="label">Evidence</span><span>{rc.evidence}</span></>}
                  </div>
                </div>
              ))}
              {rootCauseAnalysis.fishboneDiagram && <div style={{ marginTop: 8 }}><Md text={rootCauseAnalysis.fishboneDiagram} /></div>}
              {(diagnosis.dataCollection?.sources?.length > 0 || diagnosis.dataCollection?.keyData?.length > 0) && (
                <div style={{ marginTop: 12 }}><strong>Data Collection:</strong>
                  {diagnosis.dataCollection?.sources?.length > 0 && (
                    <div style={{ marginTop: 4 }}><strong>Sources:</strong>
                      <ul className="compact-list">{diagnosis.dataCollection.sources.map((s: string, j: number) => <li key={j}>{s}</li>)}</ul>
                    </div>
                  )}
                  {diagnosis.dataCollection?.keyData?.length > 0 && (
                    <div style={{ marginTop: 4 }}><strong>Key Data:</strong>
                      {diagnosis.dataCollection.keyData.map((kd: any, j: number) => (
                        <div key={j} className="nested-card">
                          <div className="detail-grid">
                            {kd.dataPoint && <><span className="label">Data Point</span><span>{kd.dataPoint}</span></>}
                            {kd.value && <><span className="label">Value</span><span>{kd.value}</span></>}
                            {kd.significance && <><span className="label">Significance</span><span>{kd.significance}</span></>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {diagnosis.systemDynamics && <div style={{ marginTop: 8 }}><strong>System Dynamics:</strong> <Md text={diagnosis.systemDynamics} /></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Problem Boundaries */}
      {(isItems.length > 0 || isNotItems.length > 0) && (
        <CollapsibleSection title="Problem Boundaries" sectionId="ps-boundaries">
          {isItems.length > 0 && (
            <div style={{ marginBottom: 8 }}><strong>IS (Part of the problem):</strong>
              {isItems.map((item: any, i: number) => (
                <div key={i} className="nested-card">
                  <span>{item.item}</span>
                  {item.evidence && <span style={{ opacity: 0.7 }}> — {item.evidence}</span>}
                </div>
              ))}
            </div>
          )}
          {isNotItems.length > 0 && (
            <div><strong>IS NOT (Not part of the problem):</strong>
              {isNotItems.map((item: any, i: number) => (
                <div key={i} className="nested-card">
                  <span>{item.item}</span>
                  {item.rationale && <span style={{ opacity: 0.7 }}> — {item.rationale}</span>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Contributing Factors */}
      {contributingFactors.length > 0 && (
        <CollapsibleSection title="Contributing Factors" count={contributingFactors.length} sectionId="ps-factors">
          {contributingFactors.map((cf: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{cf.factor}</strong></div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {cf.influence && <><span className="label">Influence</span><span>{cf.influence}</span></>}
                {cf.addressable !== undefined && <><span className="label">Addressable</span><span className="badge">{cf.addressable ? 'Yes' : 'No'}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Timeline Analysis */}
      {timelineAnalysis.length > 0 && (
        <CollapsibleSection title="Timeline Analysis" count={timelineAnalysis.length} sectionId="ps-timeline">
          {timelineAnalysis.map((te: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="detail-grid">
                {te.date && <><span className="label">Date</span><span>{te.date}</span></>}
                <span className="label">Event</span><span>{te.event}</span>
                {te.significance && <><span className="label">Significance</span><span>{te.significance}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Force Field Analysis */}
      {(drivingForces.length > 0 || restrainingForces.length > 0) && (
        <CollapsibleSection title="Force Field Analysis" sectionId="ps-forces">
          {drivingForces.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong style={{ color: 'var(--vscode-testing-iconPassed)' }}>Driving Forces:</strong>
              {drivingForces.map((f: any, i: number) => (
                <div key={i} className="nested-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{f.force}</span>
                    {f.strength && <span className="badge">Strength: {f.strength}/5</span>}
                  </div>
                  {f.leverageStrategy && <div style={{ opacity: 0.7, marginTop: 4 }}>Leverage: {f.leverageStrategy}</div>}
                </div>
              ))}
            </div>
          )}
          {restrainingForces.length > 0 && (
            <div><strong style={{ color: 'var(--vscode-errorForeground)' }}>Restraining Forces:</strong>
              {restrainingForces.map((f: any, i: number) => (
                <div key={i} className="nested-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{f.force}</span>
                    {f.strength && <span className="badge">Strength: {f.strength}/5</span>}
                  </div>
                  {f.mitigationStrategy && <div style={{ opacity: 0.7, marginTop: 4 }}>Mitigation: {f.mitigationStrategy}</div>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Analysis Constraints & Insights */}
      {(analysisConstraints.length > 0 || keyInsights.length > 0 || assumptions.length > 0) && (
        <CollapsibleSection title="Analysis Insights" sectionId="ps-insights">
          {keyInsights.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Key Insights:</strong>
              {keyInsights.map((ki: any, i: number) => (
                <div key={i} className="nested-card">
                  <div><strong>{ki.insight}</strong></div>
                  <div className="detail-grid" style={{ marginTop: 4 }}>
                    {ki.source && <><span className="label">Source</span><span>{ki.source}</span></>}
                    {ki.implication && <><span className="label">Implication</span><span>{ki.implication}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {analysisConstraints.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Constraints:</strong>
              {analysisConstraints.map((c: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Constraint</span><span>{c.constraint}</span>
                    {c.type && <><span className="label">Type</span><span className="badge">{c.type}</span></>}
                    {c.flexibility && <><span className="label">Flexibility</span><span className="badge">{c.flexibility}</span></>}
                    {c.implications && <><span className="label">Implications</span><span>{c.implications}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {assumptions.length > 0 && (
            <div><strong>Assumptions:</strong>
              {assumptions.map((a: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Assumption</span><span>{a.assumption}</span>
                    {a.risk && <><span className="label">Risk</span><span>{a.risk}</span></>}
                    {a.validation && <><span className="label">Validation</span><span>{a.validation}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Generated Solutions */}
      {(generatedSolutions.length > 0 || solutionGen.methodsUsed?.length > 0 || solutionGen.creativeAlternatives?.length > 0) && (
        <CollapsibleSection title="Generated Solutions" count={generatedSolutions.length} sectionId="ps-solutions">
          {solutionGen.methodsUsed?.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Methods Used:</strong>
              {solutionGen.methodsUsed.map((m: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    {m.method && <><span className="label">Method</span><span>{m.method}</span></>}
                    {m.description && <><span className="label">Description</span><span>{m.description}</span></>}
                    {m.solutionsGenerated && <><span className="label">Solutions Generated</span><span>{m.solutionsGenerated}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {solutionGen.creativeAlternatives?.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Creative Alternatives:</strong>
              {solutionGen.creativeAlternatives.map((ca: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    {ca.alternative && <><span className="label">Alternative</span><span>{ca.alternative}</span></>}
                    {ca.rationale && <><span className="label">Rationale</span><span>{ca.rationale}</span></>}
                    {ca.feasibility && <><span className="label">Feasibility</span><span className="badge">{ca.feasibility}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {generatedSolutions.map((sol: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">{sol.title || sol.id || `Solution ${i + 1}`}</div>
              {sol.description && <div style={{ marginBottom: 4 }}><Md text={sol.description} /></div>}
              <div className="detail-grid">
                {sol.approach && <><span className="label">Approach</span><span>{sol.approach}</span></>}
                {sol.contributor && <><span className="label">Contributor</span><span>{sol.contributor}</span></>}
              </div>
              {sol.rootCausesAddressed?.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Addresses:</strong> {sol.rootCausesAddressed.join(', ')}</div>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Solution Evaluation */}
      {solutionAnalysis.length > 0 && (
        <CollapsibleSection title="Solution Evaluation" sectionId="ps-evaluation">
          {evaluationCriteria.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Evaluation Criteria:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {evaluationCriteria.map((ec: any, i: number) => (
                  <span key={i} className="badge" title={ec.rationale}>{ec.criterion} (w: {ec.weight})</span>
                ))}
              </div>
            </div>
          )}
          {solutionAnalysis.map((sa: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">
                {sa.solutionId || `Solution ${i + 1}`}
                {sa.totalScore !== undefined && <span className="badge" style={{ marginLeft: 8 }}>Score: {sa.totalScore}</span>}
                {sa.recommendation && <span className="badge" style={{ marginLeft: 4, color: sa.recommendation === 'recommended' ? 'var(--vscode-testing-iconPassed)' : sa.recommendation === 'not-recommended' ? 'var(--vscode-errorForeground)' : undefined }}>{sa.recommendation}</span>}
              </div>
              {sa.pros?.length > 0 && <div><strong>Pros:</strong><ul className="compact-list">{sa.pros.map((p: string, j: number) => <li key={j}>{p}</li>)}</ul></div>}
              {sa.cons?.length > 0 && <div><strong>Cons:</strong><ul className="compact-list">{sa.cons.map((c: string, j: number) => <li key={j}>{c}</li>)}</ul></div>}
              {sa.criteriaScores?.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Criteria Scores:</strong>
                  {sa.criteriaScores.map((cs: any, j: number) => (
                    <div key={j} className="nested-card">
                      <div className="detail-grid">
                        {cs.criterion && <><span className="label">Criterion</span><span>{cs.criterion}</span></>}
                        {cs.score !== undefined && <><span className="label">Score</span><span>{cs.score}</span></>}
                        {cs.notes && <><span className="label">Notes</span><span>{cs.notes}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sa.risks?.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Risks:</strong>
                  {sa.risks.map((r: any, j: number) => (
                    <div key={j} className="nested-card">
                      <div className="detail-grid">
                        {r.risk && <><span className="label">Risk</span><span>{r.risk}</span></>}
                        {r.likelihood && <><span className="label">Likelihood</span><span className="badge">{r.likelihood}</span></>}
                        {r.impact && <><span className="label">Impact</span><span className="badge">{r.impact}</span></>}
                        {r.mitigation && <><span className="label">Mitigation</span><span>{r.mitigation}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {solutionEval.comparisonMatrix && <div style={{ marginTop: 8 }}><Md text={solutionEval.comparisonMatrix} /></div>}
        </CollapsibleSection>
      )}

      {/* Recommended Solution */}
      {(recommended.title || recommended.description) && (
        <CollapsibleSection title="Recommended Solution" sectionId="ps-recommended">
          {editMode ? (
            <div className="edit-grid">
              <label>Title</label>
              <input value={recommended.title || ''} onChange={(e) => handleFieldChange('recommendedSolution', { ...recommended, title: e.target.value })} />
              <label>Description</label>
              <textarea rows={5} value={recommended.description || ''} onChange={(e) => handleFieldChange('recommendedSolution', { ...recommended, description: e.target.value })} />
              <label>Rationale</label>
              <textarea rows={3} value={recommended.rationale || ''} onChange={(e) => handleFieldChange('recommendedSolution', { ...recommended, rationale: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-testing-iconPassed)' }}>
                <div className="nested-card-header">{recommended.title}</div>
                {recommended.solutionId && <div style={{ marginBottom: 4 }}><span className="label">Solution ID:</span> <span className="badge">{recommended.solutionId}</span></div>}
                {recommended.description && <Md text={recommended.description} />}
                {recommended.rationale && <div style={{ marginTop: 8 }}><strong>Rationale:</strong> <Md text={recommended.rationale} /></div>}
              </div>
              {rootCausesAddressed.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Root Causes Addressed:</strong>
                  {rootCausesAddressed.map((rc: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Cause</span><span>{rc.rootCause}</span>
                        <span className="label">How</span><span>{rc.howAddressed}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {expectedOutcomes.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Expected Outcomes:</strong>
                  {expectedOutcomes.map((eo: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Outcome</span><span>{eo.outcome}</span>
                        {eo.metric && <><span className="label">Metric</span><span>{eo.metric}</span></>}
                        {eo.target && <><span className="label">Target</span><span>{eo.target}</span></>}
                        {eo.timeframe && <><span className="label">Timeframe</span><span>{eo.timeframe}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {tradeoffs.length > 0 && <div style={{ marginTop: 8 }}><strong>Tradeoffs:</strong><ul className="compact-list">{tradeoffs.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Implementation Plan */}
      {(implPlan.approach || phases.length > 0 || actionSteps.length > 0) && (
        <CollapsibleSection title="Implementation Plan" sectionId="ps-impl">
          {editMode ? (
            <div className="edit-grid">
              <label>Approach</label>
              <textarea rows={4} value={implPlan.approach || ''} onChange={(e) => handleFieldChange('implementationPlan', { ...implPlan, approach: e.target.value })} />
              <label>Timeline</label>
              <textarea rows={2} value={implPlan.timeline || ''} onChange={(e) => handleFieldChange('implementationPlan', { ...implPlan, timeline: e.target.value })} />
              <label>Communication Plan</label>
              <textarea rows={2} value={implPlan.communicationPlan || ''} onChange={(e) => handleFieldChange('implementationPlan', { ...implPlan, communicationPlan: e.target.value })} />
            </div>
          ) : (
            <>
              {implPlan.approach && <div style={{ marginBottom: 8 }}><Md text={implPlan.approach} /></div>}
              {implPlan.timeline && <div style={{ marginBottom: 8 }}><strong>Timeline:</strong> {implPlan.timeline}</div>}
              {phases.length > 0 && phases.map((ph: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="nested-card-header">{ph.phase || `Phase ${i + 1}`}</div>
                  {ph.objective && <div style={{ marginBottom: 4 }}>{ph.objective}</div>}
                  <div className="detail-grid">
                    {ph.duration && <><span className="label">Duration</span><span>{ph.duration}</span></>}
                  </div>
                  {ph.deliverables?.length > 0 && <div style={{ marginTop: 4 }}><strong>Deliverables:</strong> {ph.deliverables.join(', ')}</div>}
                  {ph.dependencies?.length > 0 && <div style={{ marginTop: 4 }}><strong>Dependencies:</strong><ul className="compact-list">{ph.dependencies.map((dep: string, j: number) => <li key={j}>{dep}</li>)}</ul></div>}
                </div>
              ))}
              {actionSteps.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Action Steps:</strong>
                  {actionSteps.map((as: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Step</span><span>{as.step}</span>
                        {as.owner && <><span className="label">Owner</span><span>{as.owner}</span></>}
                        {as.deadline && <><span className="label">Deadline</span><span>{as.deadline}</span></>}
                        {as.status && <><span className="label">Status</span><span className="badge">{as.status}</span></>}
                      </div>
                      {as.dependencies?.length > 0 && <div style={{ marginTop: 4 }}><strong>Dependencies:</strong><ul className="compact-list">{as.dependencies.map((dep: string, j: number) => <li key={j}>{dep}</li>)}</ul></div>}
                    </div>
                  ))}
                </div>
              )}
              {resourcesNeeded.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Resources Needed:</strong>
                  {resourcesNeeded.map((r: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Resource</span><span>{r.resource}</span>
                        {r.type && <><span className="label">Type</span><span className="badge">{r.type}</span></>}
                        {r.quantity && <><span className="label">Quantity</span><span>{r.quantity}</span></>}
                        {r.availability && <><span className="label">Availability</span><span>{r.availability}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {implPlan.responsibleParties?.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Responsible Parties:</strong>
                  {implPlan.responsibleParties.map((rp: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        {rp.party && <><span className="label">Party</span><span>{rp.party}</span></>}
                        {rp.role && <><span className="label">Role</span><span>{rp.role}</span></>}
                        {rp.responsibilities && <><span className="label">Responsibilities</span><span>{rp.responsibilities}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {implPlan.communicationPlan && <div style={{ marginTop: 8 }}><strong>Communication Plan:</strong> <Md text={implPlan.communicationPlan} /></div>}
              {implPlan.changeManagement && <div style={{ marginTop: 8 }}><strong>Change Management:</strong> <Md text={implPlan.changeManagement} /></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Monitoring */}
      {(monitorMetrics.length > 0 || monitoring.validationPlan || checkpoints.length > 0) && (
        <CollapsibleSection title="Monitoring & Validation" sectionId="ps-monitoring">
          {monitoring.validationPlan && <div style={{ marginBottom: 8 }}><strong>Validation Plan:</strong> <Md text={monitoring.validationPlan} /></div>}
          {monitorMetrics.length > 0 && (
            <div style={{ marginBottom: 8 }}><strong>Success Metrics:</strong>
              {monitorMetrics.map((m: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Metric</span><span>{m.metric}</span>
                    {m.baseline && <><span className="label">Baseline</span><span>{m.baseline}</span></>}
                    {m.target && <><span className="label">Target</span><span>{m.target}</span></>}
                    {m.frequency && <><span className="label">Frequency</span><span>{m.frequency}</span></>}
                    {m.owner && <><span className="label">Owner</span><span>{m.owner}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {checkpoints.length > 0 && (
            <div style={{ marginBottom: 8 }}><strong>Checkpoints:</strong>
              {checkpoints.map((cp: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Checkpoint</span><span>{cp.checkpoint}</span>
                    {cp.date && <><span className="label">Date</span><span>{cp.date}</span></>}
                    {cp.criteria && <><span className="label">Criteria</span><span>{cp.criteria}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {riskMitigation.length > 0 && (
            <div><strong>Risk Mitigation:</strong>
              {riskMitigation.map((rm: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Risk</span><span>{rm.risk}</span>
                    <span className="label">Mitigation</span><span>{rm.mitigation}</span>
                    {rm.trigger && <><span className="label">Trigger</span><span>{rm.trigger}</span></>}
                    {rm.owner && <><span className="label">Owner</span><span>{rm.owner}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {monitoring.adjustmentTriggers?.length > 0 && (
            <div style={{ marginTop: 8 }}><strong>Adjustment Triggers:</strong>
              {monitoring.adjustmentTriggers.map((at: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    {at.trigger && <><span className="label">Trigger</span><span>{at.trigger}</span></>}
                    {at.threshold && <><span className="label">Threshold</span><span>{at.threshold}</span></>}
                    {at.action && <><span className="label">Action</span><span>{at.action}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {monitoring.escalationPath && <div style={{ marginTop: 8 }}><strong>Escalation Path:</strong> {monitoring.escalationPath}</div>}
        </CollapsibleSection>
      )}

      {/* Lessons Learned */}
      {(keyLearnings.length > 0 || lessonsLearned.whatWorked?.length > 0 || lessonsLearned.whatToAvoid?.length > 0) && (
        <CollapsibleSection title="Lessons Learned" sectionId="ps-lessons">
          {keyLearnings.length > 0 && keyLearnings.map((kl: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{kl.learning}</strong></div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {kl.context && <><span className="label">Context</span><span>{kl.context}</span></>}
                {kl.applicability && <><span className="label">Applicability</span><span>{kl.applicability}</span></>}
              </div>
            </div>
          ))}
          {lessonsLearned.whatWorked?.length > 0 && <div style={{ marginTop: 8 }}><strong style={{ color: 'var(--vscode-testing-iconPassed)' }}>What Worked:</strong><ul className="compact-list">{lessonsLearned.whatWorked.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></div>}
          {lessonsLearned.whatToAvoid?.length > 0 && <div style={{ marginTop: 8 }}><strong style={{ color: 'var(--vscode-errorForeground)' }}>What to Avoid:</strong><ul className="compact-list">{lessonsLearned.whatToAvoid.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></div>}
          {lessonsLearned.processImprovements?.length > 0 && <div style={{ marginTop: 8 }}><strong>Process Improvements:</strong><ul className="compact-list">{lessonsLearned.processImprovements.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></div>}
          {lessonsLearned.knowledgeSharing && <div style={{ marginTop: 8 }}><strong>Knowledge Sharing:</strong> <Md text={lessonsLearned.knowledgeSharing} /></div>}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// INNOVATION STRATEGY DETAILS
// ==========================================================================

export function renderInnovationStrategyDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const sessionInfo = d.sessionInfo || {};
  const strategicContext = d.strategicContext || {};
  const strategicObjectives: any[] = strategicContext.strategicObjectives || [];
  const keyQuestions: any[] = strategicContext.keyQuestions || [];
  const marketAnalysis = d.marketAnalysis || {};
  const marketLandscape = marketAnalysis.marketLandscape || {};
  const marketSize = marketLandscape.marketSize || {};
  const keyTrends: any[] = marketLandscape.keyTrends || [];
  const compDynamics = marketAnalysis.competitiveDynamics || {};
  const competitors: any[] = compDynamics.competitors || [];
  const competitiveAdvantages: any[] = compDynamics.competitiveAdvantages || [];
  const marketOpps: any[] = marketAnalysis.marketOpportunities || [];
  const criticalInsights: any[] = marketAnalysis.criticalInsights || [];
  const swot = marketAnalysis.swotAnalysis || {};
  const businessModelAnalysis = d.businessModelAnalysis || {};
  const businessModelCanvas = businessModelAnalysis.businessModelCanvas || {};
  const modelWeaknesses: any[] = businessModelAnalysis.modelWeaknesses || [];
  const disruption = d.disruptionOpportunities || {};
  const disruptionVectors: any[] = disruption.disruptionVectors || [];
  const unmetJobs: any[] = disruption.unmetJobs || [];
  const technologyEnablers: any[] = disruption.technologyEnablers || [];
  const blueOcean: any[] = disruption.blueOceanOpportunities || [];
  const innovationOpps = d.innovationOpportunities || {};
  const innovationInitiatives: any[] = innovationOpps.innovationInitiatives || [];
  const valueChainOpps: any[] = innovationOpps.valueChainOpportunities || [];
  const partnershipOpps: any[] = innovationOpps.partnershipOpportunities || [];
  const innovationPortfolio = innovationOpps.innovationPortfolio || {};
  const strategicOptions: any[] = d.strategicOptions || [];
  const recommended = d.recommendedStrategy || {};
  const keyHypotheses: any[] = recommended.keyHypotheses || [];
  const criticalSuccessFactors: any[] = recommended.criticalSuccessFactors || [];
  const strategicPriorities: any[] = recommended.strategicPriorities || [];
  const roadmap = d.executionRoadmap || {};
  const roadmapPhases: any[] = roadmap.phases || [];
  const quickWins: any[] = roadmap.quickWins || [];
  const capabilityBuild: any[] = roadmap.capabilityBuildPlan || [];
  const successMetrics = d.successMetrics || {};
  const northStar = successMetrics.northStarMetric || {};
  const leadingIndicators: any[] = successMetrics.leadingIndicators || [];
  const laggingIndicators: any[] = successMetrics.laggingIndicators || [];
  const decisionGates: any[] = successMetrics.decisionGates || [];
  const risks = d.risks || {};
  const keyRisks: any[] = risks.keyRisks || [];
  const mitigationStrategies: any[] = risks.mitigationStrategies || [];
  const contingencyPlans: any[] = risks.contingencyPlans || [];
  const governance = d.governanceAndReview || {};

  return (
    <>
      {/* Strategy Overview */}
      {(d.companyName || d.strategicFocus || sessionInfo.facilitator) && (
        <CollapsibleSection title="Strategy Overview" sectionId="is-overview">
          {editMode ? (
            <div className="edit-grid">
              <label>Company Name</label>
              <input value={d.companyName || ''} onChange={(e) => handleFieldChange('companyName', e.target.value)} />
              <label>Strategic Focus</label>
              <textarea rows={2} value={d.strategicFocus || ''} onChange={(e) => handleFieldChange('strategicFocus', e.target.value)} />
            </div>
          ) : (
            <>
              <div className="detail-grid">
                {d.companyName && <><span className="label">Company</span><span><strong>{d.companyName}</strong></span></>}
                {d.strategicFocus && <><span className="label">Focus</span><span><Md text={d.strategicFocus} /></span></>}
                {sessionInfo.facilitator && <><span className="label">Facilitator</span><span>{sessionInfo.facilitator}</span></>}
                {sessionInfo.date && <><span className="label">Date</span><span>{sessionInfo.date}</span></>}
                {sessionInfo.duration && <><span className="label">Duration</span><span>{sessionInfo.duration}</span></>}
              </div>
              {sessionInfo.frameworksUsed?.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Frameworks:</strong>{' '}
                  {sessionInfo.frameworksUsed.map((f: string, i: number) => <span key={i} className="badge" style={{ marginRight: 4 }}>{f}</span>)}
                </div>
              )}
              {sessionInfo.participants?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>Participants:</strong>
                  {sessionInfo.participants.map((p: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        {p.name && <><span className="label">Name</span><span>{p.name}</span></>}
                        {p.role && <><span className="label">Role</span><span>{p.role}</span></>}
                        {p.expertise && <><span className="label">Expertise</span><span>{p.expertise}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Strategic Context */}
      {(strategicContext.currentSituation || strategicContext.strategicChallenge || strategicObjectives.length > 0) && (
        <CollapsibleSection title="Strategic Context" sectionId="is-context">
          {editMode ? (
            <div className="edit-grid">
              <label>Current Situation</label>
              <textarea rows={4} value={strategicContext.currentSituation || ''} onChange={(e) => handleFieldChange('strategicContext', { ...strategicContext, currentSituation: e.target.value })} />
              <label>Strategic Challenge</label>
              <textarea rows={3} value={strategicContext.strategicChallenge || ''} onChange={(e) => handleFieldChange('strategicContext', { ...strategicContext, strategicChallenge: e.target.value })} />
              <label>Vision</label>
              <textarea rows={2} value={strategicContext.visionStatement || ''} onChange={(e) => handleFieldChange('strategicContext', { ...strategicContext, visionStatement: e.target.value })} />
            </div>
          ) : (
            <>
              {strategicContext.currentSituation && <div style={{ marginBottom: 8 }}><strong>Current Situation:</strong> <Md text={strategicContext.currentSituation} /></div>}
              {strategicContext.strategicChallenge && <div style={{ marginBottom: 8 }}><strong>Strategic Challenge:</strong> <Md text={strategicContext.strategicChallenge} /></div>}
              {strategicContext.visionStatement && <div style={{ marginBottom: 8 }}><strong>Vision:</strong> {strategicContext.visionStatement}</div>}
              {strategicObjectives.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Strategic Objectives:</strong>
                  {strategicObjectives.map((obj: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div>{obj.objective}</div>
                      <div className="detail-grid" style={{ marginTop: 4 }}>
                        {obj.timeframe && <><span className="label">Timeframe</span><span>{obj.timeframe}</span></>}
                        {obj.metrics?.length > 0 && <><span className="label">Metrics</span><span>{obj.metrics.join(', ')}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {keyQuestions.length > 0 && <div style={{ marginTop: 8 }}><strong>Key Questions:</strong><ul className="compact-list">{keyQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Market Landscape */}
      {(marketLandscape.overview || keyTrends.length > 0 || marketSize.tam) && (
        <CollapsibleSection title="Market Landscape" sectionId="is-market">
          {marketLandscape.overview && <div style={{ marginBottom: 8 }}><Md text={marketLandscape.overview} /></div>}
          {(marketSize.tam || marketSize.sam || marketSize.som) && (
            <div className="detail-grid" style={{ marginBottom: 8 }}>
              {marketSize.tam && <><span className="label">TAM</span><span>{marketSize.tam}</span></>}
              {marketSize.sam && <><span className="label">SAM</span><span>{marketSize.sam}</span></>}
              {marketSize.som && <><span className="label">SOM</span><span>{marketSize.som}</span></>}
              {marketLandscape.growthRate && <><span className="label">Growth Rate</span><span>{marketLandscape.growthRate}</span></>}
            </div>
          )}
          {keyTrends.length > 0 && keyTrends.map((t: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="detail-grid">
                <span className="label">Trend</span><span>{t.trend}</span>
                {t.impact && <><span className="label">Impact</span><span>{t.impact}</span></>}
                {t.timeframe && <><span className="label">Timeframe</span><span>{t.timeframe}</span></>}
              </div>
            </div>
          ))}
          {marketLandscape.regulatoryEnvironment && <div style={{ marginTop: 8 }}><strong>Regulatory:</strong> <Md text={marketLandscape.regulatoryEnvironment} /></div>}
        </CollapsibleSection>
      )}

      {/* Competitive Dynamics */}
      {(compDynamics.overview || competitors.length > 0) && (
        <CollapsibleSection title="Competitive Dynamics" count={competitors.length} sectionId="is-competitors">
          {compDynamics.overview && <div style={{ marginBottom: 8 }}><Md text={compDynamics.overview} /></div>}
          {compDynamics.threatLevel && <div style={{ marginBottom: 8 }}><strong>Threat Level:</strong> <span className="badge">{compDynamics.threatLevel}</span></div>}
          {competitors.map((c: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">
                {c.name}
                {c.type && <span className="badge" style={{ marginLeft: 8 }}>{c.type}</span>}
                {c.marketShare && <span style={{ marginLeft: 8, opacity: 0.7 }}>{c.marketShare}</span>}
              </div>
              {c.strategy && <div style={{ marginBottom: 4 }}>{c.strategy}</div>}
              <div className="detail-grid">
                {c.strengths?.length > 0 && <><span className="label">Strengths</span><span>{c.strengths.join(', ')}</span></>}
                {c.weaknesses?.length > 0 && <><span className="label">Weaknesses</span><span>{c.weaknesses.join(', ')}</span></>}
                {c.differentiation && <><span className="label">Differentiation</span><span>{c.differentiation}</span></>}
              </div>
            </div>
          ))}
          {competitiveAdvantages.length > 0 && (
            <div style={{ marginTop: 12 }}><strong>Our Competitive Advantages:</strong>
              {competitiveAdvantages.map((ca: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Advantage</span><span>{ca.advantage}</span>
                    {ca.sustainability && <><span className="label">Sustainability</span><span className="badge">{ca.sustainability}</span></>}
                    {ca.evidenc && <><span className="label">Evidence</span><span>{ca.evidenc}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* SWOT Analysis */}
      {(swot.strengths?.length > 0 || swot.weaknesses?.length > 0 || swot.opportunities?.length > 0 || swot.threats?.length > 0) && (
        <CollapsibleSection title="SWOT Analysis" sectionId="is-swot">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {swot.strengths?.length > 0 && (
              <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-testing-iconPassed)' }}>
                <div className="nested-card-header" style={{ color: 'var(--vscode-testing-iconPassed)' }}>Strengths</div>
                {swot.strengths.map((s: any, i: number) => <div key={i}>{s.strength}{s.leverage && <span style={{ opacity: 0.7 }}> — {s.leverage}</span>}</div>)}
              </div>
            )}
            {swot.weaknesses?.length > 0 && (
              <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-errorForeground)' }}>
                <div className="nested-card-header" style={{ color: 'var(--vscode-errorForeground)' }}>Weaknesses</div>
                {swot.weaknesses.map((w: any, i: number) => <div key={i}>{w.weakness}{w.mitigation && <span style={{ opacity: 0.7 }}> — {w.mitigation}</span>}</div>)}
              </div>
            )}
            {swot.opportunities?.length > 0 && (
              <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-terminal-ansiBlue)' }}>
                <div className="nested-card-header" style={{ color: 'var(--vscode-terminal-ansiBlue)' }}>Opportunities</div>
                {swot.opportunities.map((o: any, i: number) => <div key={i}>{o.opportunity}{o.captureStrategy && <span style={{ opacity: 0.7 }}> — {o.captureStrategy}</span>}</div>)}
              </div>
            )}
            {swot.threats?.length > 0 && (
              <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-editorWarning-foreground)' }}>
                <div className="nested-card-header" style={{ color: 'var(--vscode-editorWarning-foreground)' }}>Threats</div>
                {swot.threats.map((t: any, i: number) => <div key={i}>{t.threat}{t.response && <span style={{ opacity: 0.7 }}> — {t.response}</span>}</div>)}
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Market Opportunities */}
      {marketOpps.length > 0 && (
        <CollapsibleSection title="Market Opportunities" count={marketOpps.length} sectionId="is-mktopps">
          {marketOpps.map((mo: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{mo.opportunity}</strong></div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {mo.size && <><span className="label">Size</span><span>{mo.size}</span></>}
                {mo.timing && <><span className="label">Timing</span><span className="badge">{mo.timing}</span></>}
                {mo.fitWithCapabilities && <><span className="label">Fit</span><span className="badge">{mo.fitWithCapabilities}</span></>}
              </div>
              {mo.barriers?.length > 0 && <div style={{ marginTop: 4 }}><strong>Barriers:</strong> {mo.barriers.join(', ')}</div>}
              {mo.requiredCapabilities?.length > 0 && <div style={{ marginTop: 4 }}><strong>Required Capabilities:</strong><ul className="compact-list">{mo.requiredCapabilities.map((rc: string, j: number) => <li key={j}>{rc}</li>)}</ul></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Critical Insights */}
      {criticalInsights.length > 0 && (
        <CollapsibleSection title="Critical Market Insights" count={criticalInsights.length} sectionId="is-critical">
          {criticalInsights.map((ci: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{ci.insight}</strong></div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {ci.source && <><span className="label">Source</span><span>{ci.source}</span></>}
                {ci.strategicImplication && <><span className="label">Implication</span><span>{ci.strategicImplication}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Business Model Analysis */}
      {(businessModelAnalysis.currentBusinessModel || businessModelCanvas.valuePropositions?.length > 0) && (
        <CollapsibleSection title="Business Model" sectionId="is-bmodel">
          {businessModelAnalysis.currentBusinessModel && <div style={{ marginBottom: 8 }}><Md text={businessModelAnalysis.currentBusinessModel} /></div>}
          {businessModelAnalysis.valueProposition && <div style={{ marginBottom: 8 }}><strong>Value Proposition:</strong> <Md text={businessModelAnalysis.valueProposition} /></div>}
          {businessModelAnalysis.revenueCostStructure && <div style={{ marginBottom: 8 }}><strong>Revenue & Cost Structure:</strong> <Md text={businessModelAnalysis.revenueCostStructure} /></div>}
          {businessModelCanvas.valuePropositions?.length > 0 && (
            <div className="detail-grid">
              {businessModelCanvas.valuePropositions?.length > 0 && <><span className="label">Value Props</span><span>{businessModelCanvas.valuePropositions.join(', ')}</span></>}
              {businessModelCanvas.customerSegments?.length > 0 && <><span className="label">Customer Segments</span><span>{businessModelCanvas.customerSegments.join(', ')}</span></>}
              {businessModelCanvas.channels?.length > 0 && <><span className="label">Channels</span><span>{businessModelCanvas.channels.join(', ')}</span></>}
              {businessModelCanvas.customerRelationships?.length > 0 && <><span className="label">Customer Relationships</span><span>{businessModelCanvas.customerRelationships.join(', ')}</span></>}
              {businessModelCanvas.revenueStreams?.length > 0 && <><span className="label">Revenue</span><span>{businessModelCanvas.revenueStreams.join(', ')}</span></>}
              {businessModelCanvas.keyResources?.length > 0 && <><span className="label">Resources</span><span>{businessModelCanvas.keyResources.join(', ')}</span></>}
              {businessModelCanvas.keyActivities?.length > 0 && <><span className="label">Activities</span><span>{businessModelCanvas.keyActivities.join(', ')}</span></>}
              {businessModelCanvas.keyPartnerships?.length > 0 && <><span className="label">Partnerships</span><span>{businessModelCanvas.keyPartnerships.join(', ')}</span></>}
              {businessModelCanvas.costStructure?.length > 0 && <><span className="label">Cost Structure</span><span>{businessModelCanvas.costStructure.join(', ')}</span></>}
            </div>
          )}
          {businessModelAnalysis.modelStrengths?.length > 0 && (
            <div style={{ marginTop: 8 }}><strong>Strengths:</strong>
              <ul className="compact-list">{businessModelAnalysis.modelStrengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {modelWeaknesses.length > 0 && (
            <div style={{ marginTop: 8 }}><strong>Weaknesses:</strong>
              {modelWeaknesses.map((w: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Weakness</span><span>{w.weakness}</span>
                    {w.urgency && <><span className="label">Urgency</span><span className="badge">{w.urgency}</span></>}
                    {w.impact && <><span className="label">Impact</span><span>{w.impact}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Disruption Opportunities */}
      {(disruptionVectors.length > 0 || unmetJobs.length > 0 || technologyEnablers.length > 0) && (
        <CollapsibleSection title="Disruption Opportunities" sectionId="is-disruption">
          {disruptionVectors.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Disruption Vectors:</strong>
              {disruptionVectors.map((dv: any, i: number) => (
                <div key={i} className="nested-card">
                  <div><strong>{dv.vector}</strong></div>
                  <div className="detail-grid" style={{ marginTop: 4 }}>
                    {dv.type && <><span className="label">Type</span><span className="badge">{dv.type}</span></>}
                    {dv.likelihood && <><span className="label">Likelihood</span><span className="badge">{dv.likelihood}</span></>}
                    {dv.timeframe && <><span className="label">Timeframe</span><span>{dv.timeframe}</span></>}
                    {dv.potentialImpact && <><span className="label">Impact</span><span>{dv.potentialImpact}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {unmetJobs.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Unmet Jobs-to-be-Done:</strong>
              {unmetJobs.map((j: any, i: number) => (
                <div key={i} className="nested-card">
                  <div><strong>{j.job}</strong></div>
                  <div className="detail-grid" style={{ marginTop: 4 }}>
                    {j.currentSolutions && <><span className="label">Current</span><span>{j.currentSolutions}</span></>}
                    {j.opportunity && <><span className="label">Opportunity</span><span>{j.opportunity}</span></>}
                  </div>
                  {j.gaps?.length > 0 && <div style={{ marginTop: 4 }}><strong>Gaps:</strong> {j.gaps.join(', ')}</div>}
                </div>
              ))}
            </div>
          )}
          {technologyEnablers.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Technology Enablers:</strong>
              {technologyEnablers.map((te: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Technology</span><span>{te.technology}</span>
                    {te.maturity && <><span className="label">Maturity</span><span className="badge">{te.maturity}</span></>}
                    {te.applicationOpportunity && <><span className="label">Application</span><span>{te.applicationOpportunity}</span></>}
                    {te.competitiveImplication && <><span className="label">Competitive Implication</span><span>{te.competitiveImplication}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {disruption.strategicWhitespace && <div style={{ marginBottom: 12 }}><strong>Strategic Whitespace:</strong> <Md text={disruption.strategicWhitespace} /></div>}
          {blueOcean.length > 0 && (
            <div><strong>Blue Ocean Opportunities:</strong>
              {blueOcean.map((bo: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="nested-card-header">{bo.opportunity}</div>
                  <div className="detail-grid">
                    {bo.eliminate?.length > 0 && <><span className="label">Eliminate</span><span>{bo.eliminate.join(', ')}</span></>}
                    {bo.reduce?.length > 0 && <><span className="label">Reduce</span><span>{bo.reduce.join(', ')}</span></>}
                    {bo.raise?.length > 0 && <><span className="label">Raise</span><span>{bo.raise.join(', ')}</span></>}
                    {bo.create?.length > 0 && <><span className="label">Create</span><span>{bo.create.join(', ')}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Innovation Initiatives */}
      {innovationInitiatives.length > 0 && (
        <CollapsibleSection title="Innovation Initiatives" count={innovationInitiatives.length} sectionId="is-initiatives">
          {innovationInitiatives.map((ii: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">
                {ii.name || ii.id || `Initiative ${i + 1}`}
                {ii.innovationType && <span className="badge" style={{ marginLeft: 8 }}>{ii.innovationType}</span>}
              </div>
              {ii.description && <div style={{ marginBottom: 4 }}><Md text={ii.description} /></div>}
              <div className="detail-grid">
                {ii.impact && <><span className="label">Impact</span><span>{ii.impact}</span></>}
                {ii.effort && <><span className="label">Effort</span><span className="badge">{ii.effort}</span></>}
                {ii.timeToValue && <><span className="label">Time to Value</span><span>{ii.timeToValue}</span></>}
              </div>
              {ii.risks?.length > 0 && <div style={{ marginTop: 4 }}><strong>Risks:</strong> {ii.risks.join(', ')}</div>}
              {ii.requiredCapabilities?.length > 0 && <div style={{ marginTop: 4 }}><strong>Required Capabilities:</strong><ul className="compact-list">{ii.requiredCapabilities.map((rc: string, j: number) => <li key={j}>{rc}</li>)}</ul></div>}
              {ii.dependencies?.length > 0 && <div style={{ marginTop: 4 }}><strong>Dependencies:</strong><ul className="compact-list">{ii.dependencies.map((dep: string, j: number) => <li key={j}>{dep}</li>)}</ul></div>}
            </div>
          ))}
          {(innovationPortfolio.core || innovationPortfolio.adjacent || innovationPortfolio.transformational) && (
            <div style={{ marginTop: 12 }}><strong>Innovation Portfolio Balance:</strong>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {innovationPortfolio.core?.allocation && <><span className="label">Core</span><span>{innovationPortfolio.core.allocation}</span></>}
                {innovationPortfolio.adjacent?.allocation && <><span className="label">Adjacent</span><span>{innovationPortfolio.adjacent.allocation}</span></>}
                {innovationPortfolio.transformational?.allocation && <><span className="label">Transformational</span><span>{innovationPortfolio.transformational.allocation}</span></>}
              </div>
              {innovationPortfolio.core?.initiatives?.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Core Initiatives:</strong><ul className="compact-list">{innovationPortfolio.core.initiatives.map((init: string, j: number) => <li key={j}>{init}</li>)}</ul></div>
              )}
              {innovationPortfolio.adjacent?.initiatives?.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Adjacent Initiatives:</strong><ul className="compact-list">{innovationPortfolio.adjacent.initiatives.map((init: string, j: number) => <li key={j}>{init}</li>)}</ul></div>
              )}
              {innovationPortfolio.transformational?.initiatives?.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Transformational Initiatives:</strong><ul className="compact-list">{innovationPortfolio.transformational.initiatives.map((init: string, j: number) => <li key={j}>{init}</li>)}</ul></div>
              )}
            </div>
          )}
          {(innovationOpps.businessModelInnovation?.overview || innovationOpps.businessModelInnovation?.opportunities?.length > 0) && (
            <div style={{ marginTop: 12 }}><strong>Business Model Innovation:</strong>
              {innovationOpps.businessModelInnovation?.overview && <div style={{ marginTop: 4 }}><Md text={innovationOpps.businessModelInnovation.overview} /></div>}
              {innovationOpps.businessModelInnovation?.opportunities?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {innovationOpps.businessModelInnovation.opportunities.map((opp: any, j: number) => (
                    <div key={j} className="nested-card">
                      <div className="detail-grid">
                        {opp.opportunity && <><span className="label">Opportunity</span><span>{opp.opportunity}</span></>}
                        {opp.description && <><span className="label">Description</span><span>{opp.description}</span></>}
                        {opp.feasibility && <><span className="label">Feasibility</span><span className="badge">{opp.feasibility}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Value Chain & Partnership Opportunities */}
      {(valueChainOpps.length > 0 || partnershipOpps.length > 0) && (
        <CollapsibleSection title="Value Chain & Partnerships" sectionId="is-valuechain">
          {valueChainOpps.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Value Chain Opportunities:</strong>
              {valueChainOpps.map((vc: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Opportunity</span><span>{vc.opportunity}</span>
                    {vc.valueChainStage && <><span className="label">Stage</span><span className="badge">{vc.valueChainStage}</span></>}
                    {vc.potentialValue && <><span className="label">Value</span><span>{vc.potentialValue}</span></>}
                    {vc.implementation && <><span className="label">Implementation</span><span>{vc.implementation}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {partnershipOpps.length > 0 && (
            <div><strong>Partnership Opportunities:</strong>
              {partnershipOpps.map((po: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Opportunity</span><span>{po.opportunity}</span>
                    {po.partnerType && <><span className="label">Type</span><span className="badge">{po.partnerType}</span></>}
                    {po.valueExchange && <><span className="label">Value Exchange</span><span>{po.valueExchange}</span></>}
                    {po.potentialPartners?.length > 0 && <><span className="label">Partners</span><span>{po.potentialPartners.join(', ')}</span></>}
                  </div>
                  {po.risks?.length > 0 && <div style={{ marginTop: 4 }}><strong>Risks:</strong><ul className="compact-list">{po.risks.map((r: string, j: number) => <li key={j}>{r}</li>)}</ul></div>}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Strategic Options */}
      {strategicOptions.length > 0 && (
        <CollapsibleSection title="Strategic Options" count={strategicOptions.length} sectionId="is-options">
          {strategicOptions.map((so: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">
                {so.name || so.id || `Option ${i + 1}`}
                {so.riskLevel && <span className="badge" style={{ marginLeft: 8 }}>{so.riskLevel} risk</span>}
              </div>
              {so.description && <div style={{ marginBottom: 4 }}><Md text={so.description} /></div>}
              {so.strategicRationale && <div style={{ marginBottom: 4, opacity: 0.8 }}>{so.strategicRationale}</div>}
              <div className="detail-grid">
                {so.timeframe && <><span className="label">Timeframe</span><span>{so.timeframe}</span></>}
                {so.expectedReturn && <><span className="label">Expected Return</span><span>{so.expectedReturn}</span></>}
                {so.resourceRequirements && <><span className="label">Resources</span><span>{so.resourceRequirements}</span></>}
              </div>
              {so.pros?.length > 0 && <div style={{ marginTop: 4 }}><strong>Pros:</strong><ul className="compact-list">{so.pros.map((p: any, j: number) => <li key={j}>{p.pro}{p.significance && <span className="badge" style={{ marginLeft: 4 }}>{p.significance}</span>}</li>)}</ul></div>}
              {so.cons?.length > 0 && <div style={{ marginTop: 4 }}><strong>Cons:</strong><ul className="compact-list">{so.cons.map((c: any, j: number) => <li key={j}>{c.con}{c.severity && <span className="badge" style={{ marginLeft: 4 }}>{c.severity}</span>}{c.mitigation && <span style={{ opacity: 0.7 }}> — {c.mitigation}</span>}</li>)}</ul></div>}
              {so.keyAssumptions?.length > 0 && <div style={{ marginTop: 4 }}><strong>Key Assumptions:</strong><ul className="compact-list">{so.keyAssumptions.map((a: string, j: number) => <li key={j}>{a}</li>)}</ul></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Recommended Strategy */}
      {(recommended.direction || recommended.strategicThesis) && (
        <CollapsibleSection title="Recommended Strategy" sectionId="is-recommended">
          {editMode ? (
            <div className="edit-grid">
              <label>Strategic Direction</label>
              <textarea rows={4} value={recommended.direction || ''} onChange={(e) => handleFieldChange('recommendedStrategy', { ...recommended, direction: e.target.value })} />
              <label>Strategic Thesis</label>
              <textarea rows={3} value={recommended.strategicThesis || ''} onChange={(e) => handleFieldChange('recommendedStrategy', { ...recommended, strategicThesis: e.target.value })} />
              <label>Competitive Moat</label>
              <textarea rows={2} value={recommended.competitiveMoat || ''} onChange={(e) => handleFieldChange('recommendedStrategy', { ...recommended, competitiveMoat: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-testing-iconPassed)' }}>
                <div className="nested-card-header">Strategic Direction</div>
                {recommended.strategicOptionId && <div style={{ marginBottom: 4 }}><span className="label">Option ID:</span> <span className="badge">{recommended.strategicOptionId}</span></div>}
                <Md text={recommended.direction} />
              </div>
              {recommended.strategicThesis && <div style={{ marginTop: 8 }}><strong>Strategic Thesis:</strong> <Md text={recommended.strategicThesis} /></div>}
              {recommended.competitiveMoat && <div style={{ marginTop: 8 }}><strong>Competitive Moat:</strong> <Md text={recommended.competitiveMoat} /></div>}
              {keyHypotheses.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Key Hypotheses:</strong>
                  {keyHypotheses.map((h: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div>{h.hypothesis}</div>
                      <div className="detail-grid" style={{ marginTop: 4 }}>
                        {h.validationApproach && <><span className="label">Validation</span><span>{h.validationApproach}</span></>}
                        {h.validationTimeline && <><span className="label">Timeline</span><span>{h.validationTimeline}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {criticalSuccessFactors.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Critical Success Factors:</strong>
                  {criticalSuccessFactors.map((csf: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Factor</span><span>{csf.factor}</span>
                        {csf.currentState && <><span className="label">Current</span><span>{csf.currentState}</span></>}
                        {csf.requiredState && <><span className="label">Required</span><span>{csf.requiredState}</span></>}
                        {csf.gap && <><span className="label">Gap</span><span>{csf.gap}</span></>}
                      </div>
                      {csf.actions?.length > 0 && <div style={{ marginTop: 4 }}><strong>Actions:</strong><ul className="compact-list">{csf.actions.map((a: string, j: number) => <li key={j}>{a}</li>)}</ul></div>}
                    </div>
                  ))}
                </div>
              )}
              {strategicPriorities.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>Strategic Priorities:</strong>
                  <ol className="compact-list">{strategicPriorities.sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0)).map((sp: any, i: number) => (
                    <li key={i}><strong>{sp.description}</strong>{sp.rationale && <span style={{ opacity: 0.7 }}> — {sp.rationale}</span>}</li>
                  ))}</ol>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Execution Roadmap */}
      {(roadmap.overview || roadmapPhases.length > 0) && (
        <CollapsibleSection title="Execution Roadmap" sectionId="is-roadmap">
          {roadmap.overview && <div style={{ marginBottom: 8 }}><Md text={roadmap.overview} /></div>}
          {quickWins.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Quick Wins:</strong>
              {quickWins.map((qw: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Win</span><span>{qw.quickWin}</span>
                    {qw.timeframe && <><span className="label">Timeframe</span><span>{qw.timeframe}</span></>}
                    {qw.expectedImpact && <><span className="label">Impact</span><span>{qw.expectedImpact}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {roadmapPhases.map((ph: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">Phase {ph.phaseNumber || i + 1}: {ph.name}</div>
              {ph.description && <div style={{ marginBottom: 4 }}><Md text={ph.description} /></div>}
              <div className="detail-grid">
                {ph.objective && <><span className="label">Objective</span><span>{ph.objective}</span></>}
                {ph.duration && <><span className="label">Duration</span><span>{ph.duration}</span></>}
                {ph.startTrigger && <><span className="label">Trigger</span><span>{ph.startTrigger}</span></>}
              </div>
              {ph.deliverables?.length > 0 && <div style={{ marginTop: 4 }}><strong>Deliverables:</strong> {ph.deliverables.join(', ')}</div>}
              {ph.resourceRequirements?.length > 0 && <div style={{ marginTop: 4 }}><strong>Resource Requirements:</strong><ul className="compact-list">{ph.resourceRequirements.map((r: string, j: number) => <li key={j}>{r}</li>)}</ul></div>}
              {ph.dependencies?.length > 0 && <div style={{ marginTop: 4 }}><strong>Dependencies:</strong><ul className="compact-list">{ph.dependencies.map((dep: string, j: number) => <li key={j}>{dep}</li>)}</ul></div>}
              {ph.risks?.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Risks:</strong>
                  {ph.risks.map((r: any, j: number) => (
                    <div key={j} className="nested-card">
                      <div className="detail-grid">
                        {r.risk && <><span className="label">Risk</span><span>{r.risk}</span></>}
                        {r.mitigation && <><span className="label">Mitigation</span><span>{r.mitigation}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {ph.keyMilestones?.length > 0 && (
                <div style={{ marginTop: 4 }}><strong>Milestones:</strong>
                  {ph.keyMilestones.map((m: any, j: number) => (
                    <div key={j} style={{ display: 'flex', gap: 8 }}>
                      <span className="badge">{m.targetDate}</span> <span>{m.milestone}</span>
                      {m.criteria && <span style={{ opacity: 0.7 }}> — {m.criteria}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {capabilityBuild.length > 0 && (
            <div style={{ marginTop: 12 }}><strong>Capability Build Plan:</strong>
              {capabilityBuild.map((cb: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Capability</span><span>{cb.capability}</span>
                    {cb.buildVsBuy && <><span className="label">Build vs Buy</span><span className="badge">{cb.buildVsBuy}</span></>}
                    {cb.timeline && <><span className="label">Timeline</span><span>{cb.timeline}</span></>}
                    {cb.investment && <><span className="label">Investment</span><span>{cb.investment}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Success Metrics */}
      {(northStar.metric || leadingIndicators.length > 0 || laggingIndicators.length > 0) && (
        <CollapsibleSection title="Success Metrics" sectionId="is-metrics">
          {northStar.metric && (
            <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-focusBorder)' }}>
              <div className="nested-card-header">North Star Metric</div>
              <div className="detail-grid">
                <span className="label">Metric</span><span>{northStar.metric}</span>
                {northStar.currentValue && <><span className="label">Current</span><span>{northStar.currentValue}</span></>}
                {northStar.targetValue && <><span className="label">Target</span><span>{northStar.targetValue}</span></>}
                {northStar.timeframe && <><span className="label">Timeframe</span><span>{northStar.timeframe}</span></>}
              </div>
            </div>
          )}
          {leadingIndicators.length > 0 && (
            <div style={{ marginTop: 8 }}><strong>Leading Indicators:</strong>
              {leadingIndicators.map((li: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Indicator</span><span>{li.indicator}</span>
                    {li.metric && <><span className="label">Metric</span><span>{li.metric}</span></>}
                    {li.target && <><span className="label">Target</span><span>{li.target}</span></>}
                    {li.frequency && <><span className="label">Frequency</span><span>{li.frequency}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {laggingIndicators.length > 0 && (
            <div style={{ marginTop: 8 }}><strong>Lagging Indicators:</strong>
              {laggingIndicators.map((li: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Indicator</span><span>{li.indicator}</span>
                    {li.metric && <><span className="label">Metric</span><span>{li.metric}</span></>}
                    {li.target && <><span className="label">Target</span><span>{li.target}</span></>}
                    {li.frequency && <><span className="label">Frequency</span><span>{li.frequency}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {decisionGates.length > 0 && (
            <div style={{ marginTop: 8 }}><strong>Decision Gates:</strong>
              {decisionGates.map((dg: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Gate</span><span>{dg.gate}</span>
                    {dg.timing && <><span className="label">Timing</span><span>{dg.timing}</span></>}
                    {dg.criteria?.length > 0 && <><span className="label">Criteria</span><span>{dg.criteria.join(', ')}</span></>}
                    {dg.goNoGoDecision && <><span className="label">Go/No-Go</span><span>{dg.goNoGoDecision}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Risks */}
      {(keyRisks.length > 0 || mitigationStrategies.length > 0) && (
        <CollapsibleSection title="Risks & Mitigation" count={keyRisks.length} sectionId="is-risks">
          {keyRisks.map((r: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">
                {r.id && <span className="badge" style={{ marginRight: 8 }}>{r.id}</span>}
                {r.risk}
                {r.category && <span className="badge" style={{ marginLeft: 8 }}>{r.category}</span>}
              </div>
              <div className="detail-grid">
                {r.likelihood && <><span className="label">Likelihood</span><span className="badge">{r.likelihood}</span></>}
                {r.impact && <><span className="label">Impact</span><span className="badge">{r.impact}</span></>}
                {r.riskScore && <><span className="label">Score</span><span>{r.riskScore}</span></>}
                {r.owner && <><span className="label">Owner</span><span>{r.owner}</span></>}
              </div>
              {r.triggers?.length > 0 && <div style={{ marginTop: 4 }}><strong>Triggers:</strong> {r.triggers.join(', ')}</div>}
            </div>
          ))}
          {mitigationStrategies.length > 0 && (
            <div style={{ marginTop: 12 }}><strong>Mitigation Strategies:</strong>
              {mitigationStrategies.map((ms: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    {ms.riskId && <><span className="label">Risk</span><span>{ms.riskId}</span></>}
                    <span className="label">Strategy</span><span>{ms.strategy}</span>
                    {ms.owner && <><span className="label">Owner</span><span>{ms.owner}</span></>}
                    {ms.status && <><span className="label">Status</span><span className="badge">{ms.status}</span></>}
                  </div>
                  {ms.actions?.length > 0 && <div style={{ marginTop: 4 }}><strong>Actions:</strong><ul className="compact-list">{ms.actions.map((a: string, j: number) => <li key={j}>{a}</li>)}</ul></div>}
                </div>
              ))}
            </div>
          )}
          {contingencyPlans.length > 0 && (
            <div style={{ marginTop: 12 }}><strong>Contingency Plans:</strong>
              {contingencyPlans.map((cp: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Scenario</span><span>{cp.scenario}</span>
                    {cp.trigger && <><span className="label">Trigger</span><span>{cp.trigger}</span></>}
                    <span className="label">Response</span><span>{cp.response}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Governance */}
      {(governance.reviewCadence || governance.reviewForum) && (
        <CollapsibleSection title="Governance & Review" sectionId="is-governance">
          <div className="detail-grid">
            {governance.reviewCadence && <><span className="label">Review Cadence</span><span>{governance.reviewCadence}</span></>}
            {governance.reviewForum && <><span className="label">Review Forum</span><span>{governance.reviewForum}</span></>}
            {governance.escalationPath && <><span className="label">Escalation</span><span>{governance.escalationPath}</span></>}
            {governance.nextReviewDate && <><span className="label">Next Review</span><span>{governance.nextReviewDate}</span></>}
          </div>
        </CollapsibleSection>
      )}

      {/* Appendix */}
      {(d.appendix?.dataSources || d.appendix?.analysisDetails || d.appendix?.competitorProfiles) && (
        <CollapsibleSection title="Appendix" sectionId="is-appendix" defaultCollapsed>
          {d.appendix?.dataSources && <div style={{ marginBottom: 8 }}><strong>Data Sources:</strong> <Md text={d.appendix.dataSources} /></div>}
          {d.appendix?.analysisDetails && <div style={{ marginBottom: 8 }}><strong>Analysis Details:</strong> <Md text={d.appendix.analysisDetails} /></div>}
          {d.appendix?.competitorProfiles && <div style={{ marginBottom: 8 }}><strong>Competitor Profiles:</strong> <Md text={d.appendix.competitorProfiles} /></div>}
        </CollapsibleSection>
      )}
    </>
  );
}

// ==========================================================================
// DESIGN THINKING DETAILS
// ==========================================================================

export function renderDesignThinkingDetails(props: RendererProps) {
  const { editedData, editMode, handleFieldChange } = props;
  const d: any = editedData;
  const sessionInfo = d.sessionInfo || {};
  const participants: any[] = sessionInfo.participants || [];
  const empathize = d.empathize || {};
  const researchMethods: any[] = empathize.researchMethods || [];
  const userProfiles: any[] = empathize.userProfiles || [];
  const userInsights: any[] = empathize.userInsights || [];
  const keyObservations: any[] = empathize.keyObservations || [];
  const empathyMap = empathize.empathyMap || {};
  const journeyMap = empathize.journeyMap || {};
  const journeyStages: any[] = journeyMap.stages || [];
  const define = d.define || {};
  const hmwQuestions: any[] = define.howMightWeQuestions || [];
  const problemInsights: any[] = define.problemInsights || [];
  const designPrinciples: any[] = define.designPrinciples || [];
  const defineConstraints: any[] = define.constraints || [];
  const ideate = d.ideate || {};
  const selectedMethods: any[] = ideate.selectedMethods || [];
  const generatedIdeas: any[] = ideate.generatedIdeas || [];
  const ideaClustering: any[] = ideate.ideaClustering || [];
  const topConcepts: any[] = ideate.topConcepts || [];
  const prototype = d.prototype || {};
  const prototypes: any[] = prototype.prototypes || [];
  const featuresToTest: any[] = prototype.featuresToTest || [];
  const test = d.test || {};
  const testSessions: any[] = test.testSessions || [];
  const userFeedback: any[] = test.userFeedback || [];
  const usabilityIssues: any[] = test.usabilityIssues || [];
  const keyLearnings: any[] = test.keyLearnings || [];
  const hypothesisValidation: any[] = test.hypothesisValidation || [];
  const nextSteps = d.nextSteps || {};
  const refinementsNeeded: any[] = nextSteps.refinementsNeeded || [];
  const actionItems: any[] = nextSteps.actionItems || [];
  const successMetricsArr: any[] = nextSteps.successMetrics || [];

  const sentimentColor = (s: string) => {
    if (s === 'positive') return 'var(--vscode-testing-iconPassed)';
    if (s === 'negative') return 'var(--vscode-errorForeground)';
    return undefined;
  };

  return (
    <>
      {/* Session Overview */}
      {(d.projectName || d.designChallenge || sessionInfo.facilitator) && (
        <CollapsibleSection title="Design Challenge" sectionId="dt-overview">
          {editMode ? (
            <div className="edit-grid">
              <label>Project Name</label>
              <input value={d.projectName || ''} onChange={(e) => handleFieldChange('projectName', e.target.value)} />
              <label>Design Challenge</label>
              <textarea rows={4} value={d.designChallenge || ''} onChange={(e) => handleFieldChange('designChallenge', e.target.value)} />
            </div>
          ) : (
            <>
              {d.projectName && <div style={{ marginBottom: 8 }}><strong>{d.projectName}</strong></div>}
              {d.designChallenge && (
                <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-focusBorder)' }}>
                  <Md text={d.designChallenge} />
                </div>
              )}
              <div className="detail-grid" style={{ marginTop: 8 }}>
                {sessionInfo.facilitator && <><span className="label">Facilitator</span><span>{sessionInfo.facilitator}</span></>}
                {sessionInfo.date && <><span className="label">Date</span><span>{sessionInfo.date}</span></>}
                {sessionInfo.duration && <><span className="label">Duration</span><span>{sessionInfo.duration}</span></>}
                {sessionInfo.location && <><span className="label">Location</span><span>{sessionInfo.location}</span></>}
              </div>
              {participants.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>Participants:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {participants.map((p: any, i: number) => (
                      <span key={i} className="badge" title={p.expertise}>{p.name} ({p.role})</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* EMPATHIZE - Research Methods */}
      {researchMethods.length > 0 && (
        <CollapsibleSection title="Empathize: Research Methods" count={researchMethods.length} sectionId="dt-research">
          {researchMethods.map((rm: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">{rm.method}</div>
              {rm.description && <div style={{ marginBottom: 4 }}>{rm.description}</div>}
              <div className="detail-grid">
                {rm.participantCount && <><span className="label">Participants</span><span>{rm.participantCount}</span></>}
                {rm.duration && <><span className="label">Duration</span><span>{rm.duration}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* EMPATHIZE - User Profiles */}
      {userProfiles.length > 0 && (
        <CollapsibleSection title="Empathize: User Profiles" count={userProfiles.length} sectionId="dt-profiles">
          {userProfiles.map((up: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">{up.name || `User ${i + 1}`}{up.role && <span className="badge" style={{ marginLeft: 8 }}>{up.role}</span>}</div>
              {up.demographics && <div style={{ marginBottom: 4, opacity: 0.8 }}>{up.demographics}</div>}
              {up.context && <div style={{ marginBottom: 4 }}><Md text={up.context} /></div>}
              {up.goals?.length > 0 && <div><strong>Goals:</strong><ul className="compact-list">{up.goals.map((g: string, j: number) => <li key={j}>{g}</li>)}</ul></div>}
              {up.painPoints?.length > 0 && <div><strong>Pain Points:</strong><ul className="compact-list">{up.painPoints.map((p: string, j: number) => <li key={j}>{p}</li>)}</ul></div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* EMPATHIZE - User Insights */}
      {userInsights.length > 0 && (
        <CollapsibleSection title="Empathize: Key Insights" count={userInsights.length} sectionId="dt-insights">
          {userInsights.map((ui: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{ui.insight}</strong></div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {ui.source && <><span className="label">Source</span><span>{ui.source}</span></>}
                {ui.evidence && <><span className="label">Evidence</span><span style={{ fontStyle: 'italic' }}>"{ui.evidence}"</span></>}
                {ui.significance && <><span className="label">Significance</span><span>{ui.significance}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* EMPATHIZE - Key Observations */}
      {keyObservations.length > 0 && (
        <CollapsibleSection title="Empathize: Observations" count={keyObservations.length} sectionId="dt-observations">
          {keyObservations.map((ko: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{ko.observation}</strong></div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {ko.context && <><span className="label">Context</span><span>{ko.context}</span></>}
                {ko.frequency && <><span className="label">Frequency</span><span>{ko.frequency}</span></>}
                {ko.implications && <><span className="label">Implications</span><span>{ko.implications}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* EMPATHIZE - Empathy Map */}
      {(empathyMap.says?.length > 0 || empathyMap.thinks?.length > 0 || empathyMap.does?.length > 0 || empathyMap.feels?.length > 0) && (
        <CollapsibleSection title="Empathize: Empathy Map" sectionId="dt-empathy-map">
          {empathyMap.targetUser && <div style={{ marginBottom: 8 }}><strong>Target User:</strong> {empathyMap.targetUser}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {empathyMap.says?.length > 0 && (
              <div className="nested-card">
                <div className="nested-card-header">Says</div>
                {empathyMap.says.map((s: any, i: number) => <div key={i} style={{ fontStyle: 'italic' }}>"{s.quote}"{s.context && <span style={{ opacity: 0.7 }}> — {s.context}</span>}</div>)}
              </div>
            )}
            {empathyMap.thinks?.length > 0 && (
              <div className="nested-card">
                <div className="nested-card-header">Thinks</div>
                {empathyMap.thinks.map((t: any, i: number) => <div key={i}>{t.thought}{t.evidence && <span style={{ opacity: 0.7 }}> — {t.evidence}</span>}</div>)}
              </div>
            )}
            {empathyMap.does?.length > 0 && (
              <div className="nested-card">
                <div className="nested-card-header">Does</div>
                {empathyMap.does.map((d: any, i: number) => <div key={i}>{d.action}{d.frequency && <span className="badge" style={{ marginLeft: 4 }}>{d.frequency}</span>}{d.context && <span style={{ opacity: 0.7 }}> — {d.context}</span>}</div>)}
              </div>
            )}
            {empathyMap.feels?.length > 0 && (
              <div className="nested-card">
                <div className="nested-card-header">Feels</div>
                {empathyMap.feels.map((f: any, i: number) => <div key={i}>{f.emotion}{f.intensity && <span className="badge" style={{ marginLeft: 4 }}>{f.intensity}</span>}{f.trigger && <span style={{ opacity: 0.7 }}> — {f.trigger}</span>}</div>)}
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* EMPATHIZE - Journey Map */}
      {journeyStages.length > 0 && (
        <CollapsibleSection title="Empathize: Journey Map" count={journeyStages.length} sectionId="dt-journey">
          {journeyStages.map((stage: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">{stage.stage || `Stage ${i + 1}`}</div>
              {stage.emotions && <div style={{ marginBottom: 4 }}>Emotions: {stage.emotions}</div>}
              {stage.actions?.length > 0 && <div><strong>Actions:</strong> {stage.actions.join(', ')}</div>}
              {stage.thoughts?.length > 0 && <div><strong>Thoughts:</strong> {stage.thoughts.join(', ')}</div>}
              {stage.painPoints?.length > 0 && <div><strong>Pain Points:</strong> {stage.painPoints.join(', ')}</div>}
              {stage.opportunities?.length > 0 && <div><strong>Opportunities:</strong> {stage.opportunities.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* DEFINE - POV & HMW */}
      {(define.povStatement || hmwQuestions.length > 0) && (
        <CollapsibleSection title="Define: POV & HMW" sectionId="dt-define">
          {editMode ? (
            <div className="edit-grid">
              <label>Synthesis Process</label>
              <textarea rows={3} value={define.synthesisProcess || ''} onChange={(e) => handleFieldChange('define', { ...define, synthesisProcess: e.target.value })} />
              <label>POV Statement</label>
              <textarea rows={3} value={define.povStatement || ''} onChange={(e) => handleFieldChange('define', { ...define, povStatement: e.target.value })} />
            </div>
          ) : (
            <>
              {define.synthesisProcess && <div style={{ marginBottom: 8 }}><strong>Synthesis:</strong> <Md text={define.synthesisProcess} /></div>}
              {define.povStatement && (
                <div className="nested-card" style={{ borderLeft: '3px solid var(--vscode-focusBorder)' }}>
                  <div className="nested-card-header">Point of View</div>
                  <Md text={define.povStatement} />
                </div>
              )}
              {define.povVariations?.length > 0 && (
                <div style={{ marginTop: 8 }}><strong>POV Variations:</strong>
                  <ul className="compact-list">{define.povVariations.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
                </div>
              )}
              {hmwQuestions.length > 0 && (
                <div style={{ marginTop: 12 }}><strong>How Might We Questions:</strong>
                  {hmwQuestions.map((q: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        {q.priority && <span className="badge">{q.priority}</span>}
                        <span>{q.question}</span>
                      </div>
                      {q.rationale && <div style={{ opacity: 0.7, marginTop: 4 }}>{q.rationale}</div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* DEFINE - Problem Insights */}
      {problemInsights.length > 0 && (
        <CollapsibleSection title="Define: Problem Insights" count={problemInsights.length} sectionId="dt-prob-insights">
          {problemInsights.map((pi: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{pi.insight}</strong></div>
              {pi.supportingEvidence?.length > 0 && <div style={{ marginTop: 4 }}><strong>Evidence:</strong> {pi.supportingEvidence.join(', ')}</div>}
              {pi.designImplications && <div style={{ marginTop: 4, opacity: 0.8 }}>{pi.designImplications}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* DEFINE - Design Principles & Constraints */}
      {(designPrinciples.length > 0 || defineConstraints.length > 0) && (
        <CollapsibleSection title="Define: Principles & Constraints" sectionId="dt-principles">
          {designPrinciples.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Design Principles:</strong>
              {designPrinciples.map((dp: any, i: number) => (
                <div key={i} className="nested-card">
                  <div><strong>{dp.principle}</strong></div>
                  {dp.rationale && <div style={{ opacity: 0.7 }}>{dp.rationale}</div>}
                </div>
              ))}
            </div>
          )}
          {defineConstraints.length > 0 && (
            <div><strong>Constraints:</strong>
              {defineConstraints.map((c: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    <span className="label">Constraint</span><span>{c.constraint}</span>
                    {c.type && <><span className="label">Type</span><span className="badge">{c.type}</span></>}
                    {c.flexibility && <><span className="label">Flexibility</span><span className="badge">{c.flexibility}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* IDEATE - Methods & Ideas */}
      {(selectedMethods.length > 0 || generatedIdeas.length > 0) && (
        <CollapsibleSection title="Ideate: Generated Ideas" count={generatedIdeas.length} sectionId="dt-ideate">
          {selectedMethods.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Methods Used:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {selectedMethods.map((m: any, i: number) => (
                  <span key={i} className="badge" title={m.description}>{m.method}{m.duration ? ` (${m.duration})` : ''}{m.ideasGenerated ? ` — ${m.ideasGenerated} ideas` : ''}</span>
                ))}
              </div>
            </div>
          )}
          {generatedIdeas.map((idea: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">
                {idea.title || idea.id || `Idea ${i + 1}`}
                {idea.category && <span className="badge" style={{ marginLeft: 8 }}>{idea.category}</span>}
                {idea.votes !== undefined && <span className="badge" style={{ marginLeft: 4 }}>{idea.votes} votes</span>}
              </div>
              {idea.description && <div style={{ marginBottom: 4 }}><Md text={idea.description} /></div>}
              <div className="detail-grid">
                {idea.hmwQuestion && <><span className="label">HMW</span><span>{idea.hmwQuestion}</span></>}
                {idea.feasibility && <><span className="label">Feasibility</span><span className="badge">{idea.feasibility}</span></>}
                {idea.impact && <><span className="label">Impact</span><span className="badge">{idea.impact}</span></>}
                {idea.contributor && <><span className="label">Contributor</span><span>{idea.contributor}</span></>}
              </div>
            </div>
          ))}
          {ideaClustering.length > 0 && (
            <div style={{ marginTop: 12 }}><strong>Idea Clusters:</strong>
              {ideaClustering.map((cl: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="nested-card-header">{cl.clusterName}</div>
                  {cl.theme && <div>{cl.theme}</div>}
                  {cl.ideaIds?.length > 0 && <div style={{ opacity: 0.7 }}>Ideas: {cl.ideaIds.join(', ')}</div>}
                </div>
              ))}
            </div>
          )}
          {ideate.selectionCriteria?.length > 0 && (
            <div style={{ marginTop: 8 }}><strong>Selection Criteria:</strong> {ideate.selectionCriteria.join(', ')}</div>
          )}
        </CollapsibleSection>
      )}

      {/* IDEATE - Top Concepts */}
      {topConcepts.length > 0 && (
        <CollapsibleSection title="Ideate: Top Concepts" count={topConcepts.length} sectionId="dt-concepts">
          {topConcepts.map((tc: any, i: number) => (
            <div key={i} className="nested-card">
              <div className="nested-card-header">{tc.name || tc.conceptId || `Concept ${i + 1}`}</div>
              {tc.description && <div style={{ marginBottom: 4 }}><Md text={tc.description} /></div>}
              {tc.rationale && <div style={{ marginBottom: 4, opacity: 0.8 }}>{tc.rationale}</div>}
              <div className="detail-grid">
                {tc.userBenefit && <><span className="label">User Benefit</span><span>{tc.userBenefit}</span></>}
                {tc.technicalConsiderations && <><span className="label">Technical</span><span>{tc.technicalConsiderations}</span></>}
              </div>
              {tc.sourceIdeas?.length > 0 && <div style={{ marginTop: 4 }}><strong>Source Ideas:</strong> {tc.sourceIdeas.join(', ')}</div>}
              {tc.risks?.length > 0 && <div style={{ marginTop: 4 }}><strong>Risks:</strong> {tc.risks.join(', ')}</div>}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* PROTOTYPE */}
      {(prototype.prototypeApproach || prototypes.length > 0) && (
        <CollapsibleSection title="Prototype" count={prototypes.length} sectionId="dt-prototype">
          {editMode ? (
            <div className="edit-grid">
              <label>Approach</label>
              <textarea rows={3} value={prototype.prototypeApproach || ''} onChange={(e) => handleFieldChange('prototype', { ...prototype, prototypeApproach: e.target.value })} />
              <label>Type</label>
              <select value={prototype.prototypeType || ''} onChange={(e) => handleFieldChange('prototype', { ...prototype, prototypeType: e.target.value })}>
                <option value="">Select...</option>
                <option value="paper">Paper</option>
                <option value="digital-lo-fi">Digital Lo-Fi</option>
                <option value="digital-hi-fi">Digital Hi-Fi</option>
                <option value="physical">Physical</option>
                <option value="service-blueprint">Service Blueprint</option>
                <option value="storyboard">Storyboard</option>
                <option value="wizard-of-oz">Wizard of Oz</option>
              </select>
            </div>
          ) : (
            <>
              {prototype.prototypeApproach && <div style={{ marginBottom: 8 }}><Md text={prototype.prototypeApproach} /></div>}
              {prototype.prototypeType && <div style={{ marginBottom: 8 }}><strong>Type:</strong> <span className="badge">{prototype.prototypeType}</span></div>}
              {prototypes.map((p: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="nested-card-header">
                    {p.name || `Prototype ${i + 1}`}
                    {p.fidelity && <span className="badge" style={{ marginLeft: 8 }}>{p.fidelity} fidelity</span>}
                  </div>
                  {p.description && <div style={{ marginBottom: 4 }}><Md text={p.description} /></div>}
                  <div className="detail-grid">
                    {p.conceptId && <><span className="label">Concept</span><span>{p.conceptId}</span></>}
                    {p.timeToCreate && <><span className="label">Time to Create</span><span>{p.timeToCreate}</span></>}
                  </div>
                  {p.materials?.length > 0 && <div style={{ marginTop: 4 }}><strong>Materials:</strong> {p.materials.join(', ')}</div>}
                  {p.artifacts?.length > 0 && <div style={{ marginTop: 4 }}><strong>Artifacts:</strong><ul className="compact-list">{p.artifacts.map((a: string, j: number) => <li key={j}>{a}</li>)}</ul></div>}
                </div>
              ))}
              {featuresToTest.length > 0 && (
                <div style={{ marginTop: 12 }}><strong>Features to Test:</strong>
                  {featuresToTest.map((ft: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Feature</span><span>{ft.feature}</span>
                        {ft.hypothesis && <><span className="label">Hypothesis</span><span>{ft.hypothesis}</span></>}
                        {ft.successMetric && <><span className="label">Success Metric</span><span>{ft.successMetric}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {prototype.limitations?.length > 0 && <div style={{ marginTop: 8 }}><strong>Limitations:</strong><ul className="compact-list">{prototype.limitations.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul></div>}
            </>
          )}
        </CollapsibleSection>
      )}

      {/* TEST - Sessions & Feedback */}
      {(test.testingPlan || testSessions.length > 0 || userFeedback.length > 0) && (
        <CollapsibleSection title="Test: User Feedback" count={userFeedback.length} sectionId="dt-test">
          {test.testingPlan && <div style={{ marginBottom: 8 }}><strong>Testing Plan:</strong> <Md text={test.testingPlan} /></div>}
          {testSessions.length > 0 && (
            <div style={{ marginBottom: 12 }}><strong>Sessions:</strong>
              {testSessions.map((ts: any, i: number) => (
                <div key={i} className="nested-card">
                  <div className="detail-grid">
                    {ts.sessionId && <><span className="label">Session</span><span>{ts.sessionId}</span></>}
                    {ts.date && <><span className="label">Date</span><span>{ts.date}</span></>}
                    {ts.duration && <><span className="label">Duration</span><span>{ts.duration}</span></>}
                    {ts.participantProfile && <><span className="label">Participant</span><span>{ts.participantProfile}</span></>}
                    {ts.prototype && <><span className="label">Prototype</span><span>{ts.prototype}</span></>}
                  </div>
                  {ts.tasks?.length > 0 && <div style={{ marginTop: 4 }}><strong>Tasks:</strong> {ts.tasks.join(', ')}</div>}
                </div>
              ))}
            </div>
          )}
          {userFeedback.map((fb: any, i: number) => (
            <div key={i} className="nested-card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {fb.sentiment && <span className="badge" style={{ color: sentimentColor(fb.sentiment) }}>{fb.sentiment}</span>}
                {fb.priority && <span className="badge">{fb.priority}</span>}
                <span style={{ flex: 1 }}><strong>{fb.feedback}</strong></span>
              </div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {fb.user && <><span className="label">User</span><span>{fb.user}</span></>}
                {fb.feature && <><span className="label">Feature</span><span>{fb.feature}</span></>}
                {fb.actionability && <><span className="label">Actionability</span><span className="badge">{fb.actionability}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* TEST - Usability Issues */}
      {usabilityIssues.length > 0 && (
        <CollapsibleSection title="Test: Usability Issues" count={usabilityIssues.length} sectionId="dt-usability">
          {usabilityIssues.map((ui: any, i: number) => (
            <div key={i} className="nested-card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {ui.severity && <span className="badge" style={{ color: ui.severity === 'critical' ? 'var(--vscode-errorForeground)' : ui.severity === 'major' ? 'var(--vscode-editorWarning-foreground)' : undefined }}>{ui.severity}</span>}
                <span>{ui.issue}</span>
              </div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {ui.frequency && <><span className="label">Frequency</span><span>{ui.frequency}</span></>}
                {ui.recommendation && <><span className="label">Recommendation</span><span>{ui.recommendation}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* TEST - Key Learnings */}
      {keyLearnings.length > 0 && (
        <CollapsibleSection title="Test: Key Learnings" count={keyLearnings.length} sectionId="dt-learnings">
          {keyLearnings.map((kl: any, i: number) => (
            <div key={i} className="nested-card">
              <div><strong>{kl.learning}</strong></div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {kl.evidence && <><span className="label">Evidence</span><span>{kl.evidence}</span></>}
                {kl.implication && <><span className="label">Implication</span><span>{kl.implication}</span></>}
                {kl.action && <><span className="label">Action</span><span>{kl.action}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* TEST - Hypothesis Validation */}
      {hypothesisValidation.length > 0 && (
        <CollapsibleSection title="Test: Hypothesis Validation" count={hypothesisValidation.length} sectionId="dt-hypotheses">
          {hypothesisValidation.map((hv: any, i: number) => (
            <div key={i} className="nested-card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge" style={{
                  color: hv.status === 'validated' ? 'var(--vscode-testing-iconPassed)'
                    : hv.status === 'invalidated' ? 'var(--vscode-errorForeground)'
                    : hv.status === 'partially-validated' ? 'var(--vscode-editorWarning-foreground)'
                    : undefined
                }}>{hv.status}</span>
                <span>{hv.hypothesis}</span>
              </div>
              <div className="detail-grid" style={{ marginTop: 4 }}>
                {hv.evidence && <><span className="label">Evidence</span><span>{hv.evidence}</span></>}
                {hv.nextSteps && <><span className="label">Next Steps</span><span>{hv.nextSteps}</span></>}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* NEXT STEPS */}
      {(nextSteps.iterationPlan || refinementsNeeded.length > 0 || actionItems.length > 0) && (
        <CollapsibleSection title="Next Steps" sectionId="dt-next">
          {editMode ? (
            <div className="edit-grid">
              <label>Iteration Plan</label>
              <textarea rows={4} value={nextSteps.iterationPlan || ''} onChange={(e) => handleFieldChange('nextSteps', { ...nextSteps, iterationPlan: e.target.value })} />
              <label>Handoff Notes</label>
              <textarea rows={3} value={nextSteps.handoffNotes || ''} onChange={(e) => handleFieldChange('nextSteps', { ...nextSteps, handoffNotes: e.target.value })} />
            </div>
          ) : (
            <>
              {nextSteps.iterationPlan && <div style={{ marginBottom: 8 }}><strong>Iteration Plan:</strong> <Md text={nextSteps.iterationPlan} /></div>}
              {refinementsNeeded.length > 0 && (
                <div style={{ marginBottom: 12 }}><strong>Refinements Needed:</strong>
                  {refinementsNeeded.map((r: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Area</span><span>{r.area}</span>
                        <span className="label">Refinement</span><span>{r.refinement}</span>
                        {r.priority && <><span className="label">Priority</span><span className="badge">{r.priority}</span></>}
                        {r.effort && <><span className="label">Effort</span><span className="badge">{r.effort}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {actionItems.length > 0 && (
                <div style={{ marginBottom: 12 }}><strong>Action Items:</strong>
                  {actionItems.map((ai: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Action</span><span>{ai.action}</span>
                        {ai.owner && <><span className="label">Owner</span><span>{ai.owner}</span></>}
                        {ai.dueDate && <><span className="label">Due</span><span>{ai.dueDate}</span></>}
                        {ai.status && <><span className="label">Status</span><span className="badge">{ai.status}</span></>}
                      </div>
                      {ai.dependencies?.length > 0 && <div style={{ marginTop: 4 }}><strong>Dependencies:</strong><ul className="compact-list">{ai.dependencies.map((dep: string, j: number) => <li key={j}>{dep}</li>)}</ul></div>}
                    </div>
                  ))}
                </div>
              )}
              {successMetricsArr.length > 0 && (
                <div style={{ marginBottom: 12 }}><strong>Success Metrics:</strong>
                  {successMetricsArr.map((m: any, i: number) => (
                    <div key={i} className="nested-card">
                      <div className="detail-grid">
                        <span className="label">Metric</span><span>{m.metric}</span>
                        {m.target && <><span className="label">Target</span><span>{m.target}</span></>}
                        {m.measurementMethod && <><span className="label">Measurement</span><span>{m.measurementMethod}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {nextSteps.handoffNotes && <div><strong>Handoff Notes:</strong> <Md text={nextSteps.handoffNotes} /></div>}
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}
