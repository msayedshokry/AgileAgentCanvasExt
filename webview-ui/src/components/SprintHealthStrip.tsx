// Sprint health strip: what to run next, what is at risk, and which
// retrospective action items are still open. Data is computed by the
// extension (src/sprint/sprint-health.ts) from sprint-status.yaml.
import { useState } from 'react';
import { Icon } from './Icon';
import type { SprintHealth } from './SprintPlanningView';

type Recommendation = NonNullable<SprintHealth['recommendation']>;

interface SprintHealthStripProps {
  health: SprintHealth;
  /** Starts the recommended skill; without it the Next action is plain text. */
  onRunNext?: (recommendation: Recommendation) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function SprintHealthStrip({ health, onRunNext }: SprintHealthStripProps) {
  const [itemsOpen, setItemsOpen] = useState(false);
  const { recommendation, allDone, risks, openActionItems } = health;
  const itemCount = openActionItems.length;

  return (
    <section className="sprint-health" aria-label="Sprint health">
      <div className="sprint-health-next">
        {recommendation ? (
          <>
            <span className="sprint-health-label">Next</span>
            {onRunNext ? (
              <button
                type="button"
                className="sprint-health-run"
                aria-label={`Run ${recommendation.skill}${recommendation.story_key ? ` for ${recommendation.story_key}` : ''}`}
                onClick={() => onRunNext(recommendation)}
              >
                <code className="sprint-health-skill">{recommendation.skill}</code>
                {recommendation.story_key && <span className="sprint-health-story">{recommendation.story_key}</span>}
                <Icon name="chevron-right" size={12} />
              </button>
            ) : (
              <>
                <code className="sprint-health-skill">{recommendation.skill}</code>
                {recommendation.story_key && <span className="sprint-health-story">{recommendation.story_key}</span>}
              </>
            )}
            <span className="sprint-health-reason">— {recommendation.reason}</span>
          </>
        ) : allDone ? (
          <span className="sprint-health-done">All stories and retrospectives are done</span>
        ) : null}
      </div>

      {risks.length > 0 && (
        <div className="sprint-health-risks">
          <span className="sprint-health-label sprint-health-label--warn">{plural(risks.length, 'risk')}</span>
          <ul>
            {risks.map((risk) => <li key={risk}>{risk}</li>)}
          </ul>
        </div>
      )}

      {itemCount > 0 && (
        <div className="sprint-health-items">
          <button
            type="button"
            className="sprint-health-items-toggle"
            aria-expanded={itemsOpen}
            onClick={() => setItemsOpen((open) => !open)}
          >
            <Icon name={itemsOpen ? 'chevron-down' : 'chevron-right'} size={12} />
            {plural(itemCount, 'open action item')}
          </button>
          {itemsOpen && (
            <ul className="sprint-health-items-list">
              {openActionItems.map((item, i) => (
                <li key={`${String(item.action)}-${i}`}>
                  <span>{String(item.action ?? '')}</span>
                  <span className="sprint-health-item-meta">
                    {item.owner ? ` · ${String(item.owner)}` : ''}
                    {item.epic !== undefined && item.epic !== null ? ` · epic ${String(item.epic)}` : ''}
                    {item.status === 'in-progress' ? ' · in progress' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
