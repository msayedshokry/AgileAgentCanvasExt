// Agent editor: create, edit and delete named agents. Each agent is a name,
// one of the installed CLIs, and optionally a model. Models are listed by the
// CLI itself (see model-discovery.ts); a typed model is always accepted, and
// CLIs that can't list models just take a typed one.

import { useEffect, useRef, useState } from 'react';
import { vscode } from '../vscodeApi';
import { getAvatarColor, getInitials } from './kanban-helpers';
import { describeAgent, type AgentTeamView, type TeamAgentView } from './agent-team-view';
import './AgentEditor.css';

interface DiscoveredModel { id: string; label: string; description?: string }
interface ModelState { loading: boolean; models: DiscoveredModel[]; supported: boolean; error?: string }

interface Draft { id?: string; name: string; harness: string; model: string; role: string; instructions: string; lead: boolean }

const IDLE_MODELS: ModelState = { loading: false, models: [], supported: true };

function AgentForm({ team, draft, onCancel }: { team: AgentTeamView; draft: Draft; onCancel: () => void }) {
  const [form, setForm] = useState<Draft>(draft);
  const [models, setModels] = useState<ModelState>(IDLE_MODELS);
  const [error, setError] = useState<string>();
  const nameRef = useRef<HTMLInputElement>(null);
  const cli = team.installed.find(c => c.id === form.harness);

  useEffect(() => { nameRef.current?.focus(); }, []);

  // Ask the chosen CLI for its models whenever the CLI changes.
  useEffect(() => {
    if (!cli?.acceptsModel || !cli.listsModels) {
      setModels({ loading: false, models: [], supported: false });
      return;
    }
    setModels({ ...IDLE_MODELS, loading: true });
    vscode.postMessage({ type: 'kanban:listModels', harness: form.harness });
  }, [form.harness, cli?.acceptsModel, cli?.listsModels]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'kanban:models' && msg.harness === form.harness) {
        setModels({ loading: false, models: Array.isArray(msg.models) ? msg.models : [], supported: msg.supported !== false, error: msg.error });
      }
      if (msg?.type === 'kanban:agentError') setError(String(msg.error));
      if (msg?.type === 'kanban:agentSaved') onCancel();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [form.harness, onCancel]);

  const save = () => {
    setError(undefined);
    vscode.postMessage({
      type: 'kanban:saveAgent',
      agent: {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(), harness: form.harness, model: cli?.acceptsModel ? form.model.trim() : '',
        role: form.role.trim(), instructions: form.instructions.trim(), lead: form.lead,
      },
    });
  };

  const known = models.models.find(m => m.id === form.model.trim());
  const leadName = team.agents.find(a => a.lead)?.name;
  const modelHint = !cli
    ? `${form.harness} is not installed, so its models can't be listed.`
    : !cli.acceptsModel
      ? `${cli.label} uses its own model setting; the board can't choose one for it.`
      : models.loading
        ? `Asking ${cli.label} for its models…`
        : models.error
          ? `Couldn't list models: ${models.error}. You can still type one.`
          : !models.supported
            ? `${cli.label} can't list its models. Type one, or leave empty for its default.`
            : known?.description ?? `${models.models.length} models from ${cli.label}. Leave empty for its default.`;

  return (
    <form className="agent-editor-form" onSubmit={e => { e.preventDefault(); save(); }} aria-label={form.id ? `Edit ${draft.name}` : 'New agent'}>
      <label className="agent-editor-field">
        <span>Name</span>
        <input ref={nameRef} value={form.name} maxLength={40} required onChange={e => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="agent-editor-field">
        <span>CLI</span>
        <select value={form.harness} onChange={e => setForm({ ...form, harness: e.target.value, model: '' })}>
          {!cli && <option value={form.harness}>{form.harness} (not installed)</option>}
          {team.installed.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label className="agent-editor-field">
        <span>Model</span>
        <input
          list="agent-editor-models"
          value={form.model}
          placeholder={cli?.acceptsModel ? 'CLI default' : 'Set by the CLI'}
          disabled={!cli?.acceptsModel}
          maxLength={100}
          aria-describedby="agent-editor-model-hint"
          onChange={e => setForm({ ...form, model: e.target.value })}
        />
        <datalist id="agent-editor-models">
          {models.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </datalist>
      </label>
      <p id="agent-editor-model-hint" className="agent-editor-hint" role="status">{modelHint}</p>
      <label className="agent-editor-field">
        <span>Role</span>
        <input value={form.role} maxLength={120} placeholder="What this agent is for, in one line" onChange={e => setForm({ ...form, role: e.target.value })} />
      </label>
      <label className="agent-editor-field agent-editor-field--top">
        <span>Instructions</span>
        <textarea
          rows={4}
          value={form.instructions}
          maxLength={4000}
          placeholder="Rules this agent follows on every run, e.g. Add a Playwright test for every UI change."
          onChange={e => setForm({ ...form, instructions: e.target.value })}
        />
      </label>
      <label className="agent-editor-check">
        <input type="checkbox" checked={form.lead} onChange={e => setForm({ ...form, lead: e.target.checked })} />
        <span>
          <strong>Lead</strong> — plans the epics you give it and hands stories to the other agents. It never implements.
          {form.lead && leadName && leadName !== draft.name ? ` Replaces ${leadName} as lead.` : ''}
        </span>
      </label>
      {error && <p className="agent-editor-error" role="alert">{error}</p>}
      <div className="agent-editor-actions">
        <button type="button" className="agent-editor-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="agent-editor-btn agent-editor-btn--primary" disabled={!form.name.trim() || !form.harness}>
          {form.id ? 'Save' : 'Add agent'}
        </button>
      </div>
    </form>
  );
}

function AgentRow({ agent, team, onEdit }: { agent: TeamAgentView; team: AgentTeamView; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const cards = Object.values(team.assignments).filter(id => id === agent.id).length;
  return (
    <li className="agent-editor-row">
      <span className="agent-editor-avatar" style={{ '--avatar-color': getAvatarColor(agent.name) } as React.CSSProperties} aria-hidden="true">
        {getInitials(agent.name)}
      </span>
      <span className="agent-editor-who">
        <span className="agent-editor-name">{agent.name}{agent.lead && <span className="agent-editor-lead">Lead</span>}</span>
        {agent.role && <span className="agent-editor-role">{agent.role}</span>}
        <span className="agent-editor-meta">{describeAgent(agent, team.installed)}{cards > 0 ? ` · ${cards} card${cards === 1 ? '' : 's'}` : ''}</span>
      </span>
      {confirming ? (
        <span className="agent-editor-confirm" role="group" aria-label={`Delete ${agent.name}?`}>
          <span>{cards > 0 ? `Delete? Its ${cards} card${cards === 1 ? '' : 's'} go back to the board default.` : 'Delete?'}</span>
          <button className="agent-editor-btn agent-editor-btn--danger" onClick={() => vscode.postMessage({ type: 'kanban:deleteAgent', id: agent.id })}>Delete</button>
          <button className="agent-editor-btn" onClick={() => setConfirming(false)}>Keep</button>
        </span>
      ) : (
        <span className="agent-editor-row-actions">
          <button className="agent-editor-btn" onClick={onEdit} aria-label={`Edit ${agent.name}`}>Edit</button>
          <button className="agent-editor-btn agent-editor-btn--quiet" onClick={() => setConfirming(true)} aria-label={`Delete ${agent.name}`}>Delete</button>
        </span>
      )}
    </li>
  );
}

export function AgentEditor({ team, onClose }: { team: AgentTeamView; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startNew = () => setDraft({ name: '', harness: team.installed[0]?.id ?? 'claude', model: '', role: '', instructions: '', lead: false });

  return (
    <div className="agent-editor-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="agent-editor" role="dialog" aria-modal="true" aria-labelledby="agent-editor-title">
        <header className="agent-editor-head">
          <h3 id="agent-editor-title">Agents</h3>
          <button className="agent-editor-close" onClick={onClose} aria-label="Close agents">×</button>
        </header>
        <p className="agent-editor-intro">
          {team.rosterDefined
            ? 'Assign cards to these agents from a card’s detail panel. Each runs on its CLI and model.'
            : 'No agents named yet, so each installed CLI acts as one. Add an agent to choose its name, CLI and model.'}
        </p>

        {team.rosterDefined && (
          <ul className="agent-editor-list">
            {team.agents.map(a => (
              <AgentRow key={a.id} agent={a} team={team} onEdit={() => setDraft({ id: a.id, name: a.name, harness: a.harness, model: a.model ?? '', role: a.role ?? '', instructions: a.instructions ?? '', lead: a.lead === true })} />
            ))}
          </ul>
        )}

        {draft ? (
          <AgentForm key={draft.id ?? 'new'} team={team} draft={draft} onCancel={() => setDraft(null)} />
        ) : (
          <div className="agent-editor-foot">
            <button className="agent-editor-btn agent-editor-btn--primary" onClick={startNew} disabled={team.installed.length === 0}>
              New agent
            </button>
            {team.installed.length === 0 && <span className="agent-editor-hint">Install a coding-agent CLI first.</span>}
            <button className="agent-editor-link" onClick={() => vscode.postMessage({ type: 'kanban:editAgentTeam' })}>Open team file</button>
          </div>
        )}
      </section>
    </div>
  );
}
