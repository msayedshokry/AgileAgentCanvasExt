// Agent editor: create, edit and delete named agents, and see what they use.
// Each agent is a name, one of the installed CLIs, optionally a model, a role,
// standing instructions, skills and how many runs it may have at once; one
// agent may be the lead. Models and skills are listed by the extension; the
// brief preview is built by the same code a run uses. The Usage tab totals
// runs, time and tokens per agent.

import { useCallback, useEffect, useRef, useState } from 'react';
import { vscode } from '../vscodeApi';
import { describeAgent, parseTeamMessage, type AgentTeamView, type TeamAgentView } from './agent-team-view';
import './AgentEditor.css';
import { AgentAvatar } from './AgentAvatar';
import { AGENT_AVATARS } from './agent-avatar';

interface DiscoveredModel { id: string; label: string; description?: string }
interface ModelState { loading: boolean; models: DiscoveredModel[]; supported: boolean; error?: string }
interface SkillInfo { id: string; name: string; description: string; source: 'bundled' | 'workspace' }

interface Draft {
  id?: string; name: string; harness: string; model: string; role: string; instructions: string; lead: boolean;
  skills: string[]; maxConcurrent: number;
  /** A person on the team: name and role only; their cards never start a run. */
  person?: boolean;
  /** Emoji avatar; empty on a person means their initials. */
  avatar?: string;
}

/** The avatar, large, beside the name; click it to choose another from the set. */
function AvatarPicker({ name, value, taken, allowInitials, onChange }: {
  name: string; value: string; taken: readonly string[]; allowInitials?: boolean; onChange: (avatar: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pick = (avatar: string) => { onChange(avatar); setOpen(false); };
  return (
    <div className="avatar-picker">
      <button type="button" className="avatar-picker-current" aria-expanded={open} aria-label="Choose an avatar" title="Choose an avatar" onClick={() => setOpen(o => !o)}>
        <AgentAvatar name={name || 'New'} avatar={value || undefined} person={!value} size={44} />
      </button>
      {open && (
        <div className="avatar-picker-grid" role="radiogroup" aria-label="Avatar">
          {allowInitials && (
            <button type="button" role="radio" aria-checked={!value} className="avatar-picker-option" title="Initials" onClick={() => pick('')}>
              <AgentAvatar name={name || '?'} person size={26} />
            </button>
          )}
          {AGENT_AVATARS.map(a => {
            const usedByOther = taken.includes(a) && value !== a;
            return (
              <button key={a} type="button" role="radio" aria-checked={value === a} aria-label={a}
                className={`avatar-picker-option${usedByOther ? ' is-used' : ''}`}
                title={usedByOther ? 'Another member has this one' : undefined}
                onClick={() => pick(a)}>
                <span aria-hidden="true">{a}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const IDLE_MODELS: ModelState = { loading: false, models: [], supported: true };
const MAX_SKILLS = 20;
const MAX_CONCURRENT = 10;

/** Searchable checklist of skills; selected ones stay on top. */
function SkillPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'kanban:skills' && Array.isArray(event.data.skills)) setSkills(event.data.skills);
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'kanban:listSkills' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const q = filter.trim().toLowerCase();
  const shown = (skills ?? [])
    .filter(s => !q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || a.id.localeCompare(b.id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id].slice(0, MAX_SKILLS));

  return (
    <div className="agent-editor-skills">
      <input
        className="agent-editor-skill-filter"
        value={filter}
        placeholder={skills ? `Filter ${skills.length} skills…` : 'Loading skills…'}
        aria-label="Filter skills"
        onChange={e => setFilter(e.target.value)}
      />
      <p className="agent-editor-hint agent-editor-hint--flush">{selected.length} of up to {MAX_SKILLS} chosen. The agent reads a skill when the task calls for it.</p>
      <ul className="agent-editor-skill-list" aria-label="Skills">
        {shown.slice(0, 60).map(s => (
          <li key={s.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                disabled={!selected.includes(s.id) && selected.length >= MAX_SKILLS}
                onChange={() => toggle(s.id)}
              />
              <span className="agent-editor-skill-name">{s.id}</span>
              {s.source === 'workspace' && <span className="agent-editor-skill-tag">workspace</span>}
              <span className="agent-editor-skill-desc">{s.description}</span>
            </label>
          </li>
        ))}
        {skills && shown.length === 0 && <li className="agent-editor-hint agent-editor-hint--flush">No skills match.</li>}
      </ul>
    </div>
  );
}

/** A person: you, or someone you name. The lead can hand them stories through the Inbox. */
function PersonForm({ draft, taken, onCancel }: { draft: Draft; taken: readonly string[]; onCancel: () => void }) {
  const [name, setName] = useState(draft.name);
  const [avatar, setAvatar] = useState(draft.avatar ?? '');
  const [role, setRole] = useState(draft.role);
  const [error, setError] = useState<string>();
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'kanban:agentError') setError(String(event.data.error));
      if (event.data?.type === 'kanban:agentSaved') onCancel();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onCancel]);
  const save = () => {
    setError(undefined);
    vscode.postMessage({ type: 'kanban:saveAgent', agent: { ...(draft.id ? { id: draft.id } : {}), name: name.trim(), kind: 'person', role: role.trim(), ...(avatar ? { avatar } : {}) } });
  };
  return (
    <form className="agent-editor-form" onSubmit={e => { e.preventDefault(); save(); }} aria-label={draft.id ? `Edit ${draft.name}` : 'New person'}>
      <div className="agent-editor-identity">
        <AvatarPicker name={name} value={avatar} taken={taken} allowInitials onChange={setAvatar} />
        <label className="agent-editor-field agent-editor-field--grow">
          <span>Name</span>
          <input ref={nameRef} value={name} maxLength={40} required onChange={e => setName(e.target.value)} />
        </label>
      </div>
      <label className="agent-editor-field">
        <span>Role</span>
        <input value={role} maxLength={120} placeholder="What they do, in one line" onChange={e => setRole(e.target.value)} />
      </label>
      <p className="agent-editor-hint">
        A person’s cards never start an agent. When the lead assigns them a story it shows in the Inbox; moving that card to done wakes the lead.
      </p>
      {error && <p className="agent-editor-error" role="alert">{error}</p>}
      <div className="agent-editor-actions">
        <button type="button" className="agent-editor-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="agent-editor-btn agent-editor-btn--primary" disabled={!name.trim()}>
          {draft.id ? 'Save' : 'Add person'}
        </button>
      </div>
    </form>
  );
}

interface AiDraft { name?: string; role?: string; instructions?: string; skills?: string[]; harness?: string; model?: string }

/** "Build with AI": say what the agent is for; the model fills the form for you to review. */
function BuildWithAi({ form, onDraft }: { form: Draft; onDraft: (draft: AiDraft) => void }) {
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string }>();
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type !== 'kanban:agentDraft') return;
      setBusy(false);
      if (msg.error) { setNote({ error: true, text: String(msg.error) }); return; }
      if (msg.draft && typeof msg.draft === 'object') {
        onDraft(msg.draft as AiDraft);
        setNote({ error: false, text: 'Drafted. Read every field before you save; ask again to change it.' });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onDraft]);
  const ask = () => {
    if (!request.trim() || busy) return;
    setBusy(true);
    setNote(undefined);
    vscode.postMessage({
      type: 'kanban:draftAgent', request: request.trim(),
      draft: { name: form.name, role: form.role, instructions: form.instructions, skills: form.skills, harness: form.harness, model: form.model },
    });
  };
  return (
    <section className="agent-builder" aria-label="Build with AI">
      <label className="agent-builder-label" htmlFor="agent-builder-request">Build with AI</label>
      <textarea
        id="agent-builder-request"
        rows={2}
        value={request}
        maxLength={2000}
        placeholder="What should this agent do? e.g. Review frontend pull requests for accessibility; never edit code."
        onChange={e => setRequest(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ask(); } }}
      />
      <div className="agent-builder-row">
        <span className={`agent-builder-note${note?.error ? ' is-error' : ''}`} role="status">
          {busy ? 'Drafting with your AI model…' : note?.text ?? 'Fills in name, role, instructions, skills and CLI. Nothing is saved until you press Add agent.'}
        </span>
        <button type="button" className="agent-editor-btn" onClick={ask} disabled={!request.trim() || busy}>
          {busy ? 'Drafting…' : form.instructions || form.role ? 'Redraft with AI' : 'Draft with AI'}
        </button>
      </div>
    </section>
  );
}

function AgentForm({ team, draft, taken, onCancel }: { team: AgentTeamView; draft: Draft; taken: readonly string[]; onCancel: () => void }) {
  const [form, setForm] = useState<Draft>(draft);
  const applyDraft = useCallback((d: AiDraft) => setForm(f => ({
    ...f,
    ...(d.name ? { name: d.name } : {}),
    ...(d.role ? { role: d.role } : {}),
    ...(d.instructions ? { instructions: d.instructions } : {}),
    ...(d.skills ? { skills: d.skills.slice(0, MAX_SKILLS) } : {}),
    ...(d.harness && team.installed.some(c => c.id === d.harness) ? { harness: d.harness, model: d.model ?? '' } : d.model ? { model: d.model } : {}),
  })), [team.installed]);
  const [models, setModels] = useState<ModelState>(IDLE_MODELS);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<string | null>(null);
  const [showSkills, setShowSkills] = useState(false);
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
      if (msg?.type === 'kanban:briefPreview') setPreview(msg.error ? `Can't preview: ${msg.error}` : String(msg.brief ?? ''));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [form.harness, onCancel]);

  const payload = () => ({
    ...(form.id ? { id: form.id } : {}),
    name: form.name.trim(), harness: form.harness, model: cli?.acceptsModel ? form.model.trim() : '',
    role: form.role.trim(), instructions: form.instructions.trim(), lead: form.lead,
    skills: form.skills, maxConcurrent: form.maxConcurrent,
    ...(form.avatar ? { avatar: form.avatar } : {}),
  });

  const save = () => {
    setError(undefined);
    vscode.postMessage({ type: 'kanban:saveAgent', agent: payload() });
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
      <BuildWithAi form={form} onDraft={applyDraft} />
      <div className="agent-editor-identity">
        <AvatarPicker name={form.name} value={form.avatar ?? ''} taken={taken} onChange={avatar => setForm({ ...form, avatar })} />
        <label className="agent-editor-field agent-editor-field--grow">
          <span>Name</span>
          <input ref={nameRef} value={form.name} maxLength={40} required placeholder="e.g. Reviewer, Frontend dev" onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
      </div>
      <div className="agent-editor-field agent-editor-field--top">
        <span id="agent-editor-cli-label">Runs on</span>
        <div className="agent-editor-cli" role="radiogroup" aria-labelledby="agent-editor-cli-label">
          {!cli && (
            <button type="button" role="radio" aria-checked className="agent-editor-cli-option is-missing">
              {form.harness} · not installed
            </button>
          )}
          {team.installed.map(c => (
            <button key={c.id} type="button" role="radio" aria-checked={form.harness === c.id} className="agent-editor-cli-option"
              onClick={() => setForm({ ...form, harness: c.id, model: form.harness === c.id ? form.model : '' })}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
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
      <div className="agent-editor-field agent-editor-field--top">
        <span>Skills</span>
        <div>
          <button type="button" className="agent-editor-btn" aria-expanded={showSkills} onClick={() => setShowSkills(s => !s)}>
            {form.skills.length ? `${form.skills.length} skill${form.skills.length === 1 ? '' : 's'}` : 'Choose skills'}
          </button>
          {showSkills && <SkillPicker selected={form.skills} onChange={skills => setForm({ ...form, skills })} />}
        </div>
      </div>
      <label className="agent-editor-field">
        <span>Runs at once</span>
        <input
          type="number"
          min={1}
          max={MAX_CONCURRENT}
          value={form.maxConcurrent}
          className="agent-editor-number"
          aria-describedby="agent-editor-capacity-hint"
          onChange={e => setForm({ ...form, maxConcurrent: Math.min(MAX_CONCURRENT, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
        />
      </label>
      <p id="agent-editor-capacity-hint" className="agent-editor-hint">More cards for this agent wait their turn, highest priority first.</p>
      <label className="agent-editor-check">
        <input type="checkbox" checked={form.lead} onChange={e => setForm({ ...form, lead: e.target.checked })} />
        <span>
          <strong>Lead</strong> — plans the epics you give it and hands stories to the other agents. It never implements.
          {form.lead && leadName && leadName !== draft.name ? ` Replaces ${leadName} as lead.` : ''}
        </span>
      </label>
      {preview !== null && (
        <details className="agent-editor-preview" open>
          <summary>What this agent receives on each run</summary>
          <pre>{preview}</pre>
        </details>
      )}
      {error && <p className="agent-editor-error" role="alert">{error}</p>}
      <div className="agent-editor-actions">
        <button type="button" className="agent-editor-link" onClick={() => vscode.postMessage({ type: 'kanban:previewBrief', agent: payload() })}>
          Preview brief
        </button>
        <button type="button" className="agent-editor-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="agent-editor-btn agent-editor-btn--primary" disabled={!form.name.trim() || !form.harness}>
          {form.id ? 'Save' : 'Add agent'}
        </button>
      </div>
    </form>
  );
}

function AgentRow({ agent, team, saved, onEdit }: { agent: TeamAgentView; team: AgentTeamView; saved: boolean; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const cards = Object.values(team.assignments).filter(id => id === agent.id).length;
  const capacity = agent.maxConcurrent ?? 1;
  return (
    <li className="agent-editor-row">
      <AgentAvatar name={agent.name} id={agent.id} avatar={agent.avatar} person={agent.kind === 'person'} size={34} />
      <span className="agent-editor-who">
        <span className="agent-editor-name">{agent.name}{agent.lead && <span className="agent-editor-lead">Lead</span>}</span>
        {agent.role && <span className="agent-editor-role">{agent.role}</span>}
        <span className="agent-editor-meta">
          {describeAgent(agent, team.installed)}
          {cards > 0 ? ` · ${cards} card${cards === 1 ? '' : 's'}` : ''}
          {agent.skills?.length ? ` · ${agent.skills.length} skill${agent.skills.length === 1 ? '' : 's'}` : ''}
          {capacity > 1 ? ` · ${capacity} at once` : ''}
        </span>
      </span>
      {confirming ? (
        <span className="agent-editor-confirm" role="group" aria-label={`Delete ${agent.name}?`}>
          <span>{cards > 0 ? `Delete? Its ${cards} card${cards === 1 ? '' : 's'} go back to the board default.` : 'Delete?'}</span>
          <button className="agent-editor-btn agent-editor-btn--danger" onClick={() => vscode.postMessage({ type: 'kanban:deleteAgent', id: agent.id })}>Delete</button>
          <button className="agent-editor-btn" onClick={() => setConfirming(false)}>Keep</button>
        </span>
      ) : (
        <span className="agent-editor-row-actions">
          <button
            className="agent-editor-btn agent-editor-btn--quiet agent-editor-save-lib"
            onClick={() => vscode.postMessage({ type: 'kanban:saveToLibrary', id: agent.id })}
            aria-label={saved ? `Update ${agent.name} in my agents` : `Save ${agent.name} to my agents`}
            title={saved ? 'Saved in your agents. Click to update the saved copy.' : 'Save to your agents to add it in other projects'}
          >
            {saved ? '★ Saved' : '☆ Save'}
          </button>
          <button className="agent-editor-btn" onClick={onEdit} aria-label={`Edit ${agent.name}`}>Edit</button>
          <button className="agent-editor-btn agent-editor-btn--quiet" onClick={() => setConfirming(true)} aria-label={`Delete ${agent.name}`}>Delete</button>
        </span>
      )}
    </li>
  );
}

type UsageWindow = 'today' | 'week' | 'month';
interface UsageTotals { runs: number; succeeded: number; timeMs: number; tokensIn: number; tokensOut: number; cards: number }
interface AgentUsage { who: string; windows: Record<UsageWindow, UsageTotals> }

const WINDOW_LABEL: Record<UsageWindow, string> = { today: 'Today', week: '7 days', month: '30 days' };

const tokens = (n: number) => (n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : `${(n / 1_000_000).toFixed(1)}M`);
const duration = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** Runs, success, time, tokens and cards per agent. Tokens and time only, no prices. */
function UsagePanel() {
  const [usage, setUsage] = useState<AgentUsage[] | null>(null);
  const [window_, setWindow] = useState<UsageWindow>('week');

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'kanban:usage' && Array.isArray(event.data.usage)) setUsage(event.data.usage);
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'kanban:getUsage' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const rows = (usage ?? []).filter(u => u.windows[window_].runs > 0);
  return (
    <div className="agent-editor-usage">
      <div className="agent-editor-tabs" role="radiogroup" aria-label="Period">
        {(Object.keys(WINDOW_LABEL) as UsageWindow[]).map(w => (
          <button key={w} role="radio" aria-checked={window_ === w} className={`agent-editor-tab${window_ === w ? ' is-active' : ''}`} onClick={() => setWindow(w)}>
            {WINDOW_LABEL[w]}
          </button>
        ))}
      </div>
      {usage === null ? (
        <p className="agent-editor-hint agent-editor-hint--flush">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="agent-editor-hint agent-editor-hint--flush">No agent runs in this period.</p>
      ) : (
        <table className="agent-editor-usage-table">
          <thead>
            <tr><th scope="col">Agent</th><th scope="col">Runs</th><th scope="col">Succeeded</th><th scope="col">Time</th><th scope="col">Tokens in / out</th><th scope="col">Cards</th></tr>
          </thead>
          <tbody>
            {rows.map(u => {
              const t = u.windows[window_];
              return (
                <tr key={u.who}>
                  <th scope="row">{u.who}</th>
                  <td>{t.runs}</td>
                  <td>{Math.round((t.succeeded / t.runs) * 100)}%</td>
                  <td>{duration(t.timeMs)}</td>
                  <td>{t.tokensIn || t.tokensOut ? `${tokens(t.tokensIn)} / ${tokens(t.tokensOut)}` : '—'}</td>
                  <td>{t.cards}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="agent-editor-hint agent-editor-hint--flush">Tokens are reported by Claude Code only; other CLIs show time and runs.</p>
    </div>
  );
}

/** Your saved agents (kept outside the project): add one to this project's team. */
function MyAgents({ library, team, onClose }: { library: TeamAgentView[]; team: AgentTeamView; onClose: () => void }) {
  const onTeam = new Set(team.rosterDefined ? team.agents.map(a => a.id) : []);
  const available = library.filter(a => !onTeam.has(a.id));
  return (
    <section className="agent-library" aria-label="My agents">
      <header className="agent-library-head">
        <span className="agent-library-title">My agents</span>
        <span className="agent-editor-hint agent-editor-hint--flush">Saved in your home folder; add them to any project.</span>
        <button type="button" className="agent-editor-btn agent-editor-btn--quiet" onClick={onClose}>Done</button>
      </header>
      {library.length === 0 ? (
        <p className="agent-editor-hint agent-editor-hint--flush">No saved agents yet. Use ☆ Save on an agent to keep it for other projects.</p>
      ) : available.length === 0 ? (
        <p className="agent-editor-hint agent-editor-hint--flush">All your saved agents are already on this team.</p>
      ) : (
        <ul className="agent-library-list">
          {available.map(a => (
            <li key={a.id} className="agent-library-row">
              <AgentAvatar name={a.name} id={a.id} avatar={a.avatar} person={a.kind === 'person'} size={28} />
              <span className="agent-editor-who">
                <span className="agent-editor-name">{a.name}{a.lead && <span className="agent-editor-lead">Lead</span>}</span>
                <span className="agent-editor-meta">{a.role ? `${a.role} · ` : ''}{describeAgent(a, team.installed)}</span>
              </span>
              <button type="button" className="agent-editor-btn agent-editor-btn--primary" aria-label={`Add ${a.name} to this project`}
                onClick={() => vscode.postMessage({ type: 'kanban:addFromLibrary', id: a.id })}>Add</button>
              <button type="button" className="agent-editor-btn agent-editor-btn--quiet" aria-label={`Remove ${a.name} from my agents`}
                onClick={() => vscode.postMessage({ type: 'kanban:removeFromLibrary', id: a.id })}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AgentEditor({ team, onClose }: { team: AgentTeamView; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<'team' | 'usage'>('team');
  const [library, setLibrary] = useState<TeamAgentView[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'kanban:agentLibrary') return;
      setLibrary(parseTeamMessage({ agents: event.data.agents, assignments: {} })?.agents ?? []);
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'kanban:getAgentLibrary' });
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const savedIds = new Set(library.map(a => a.id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Avatars other members already have; a new agent starts with one nobody uses.
  const taken = team.rosterDefined ? team.agents.flatMap(a => (a.avatar ? [a.avatar] : [])) : [];
  const takenBy = (id?: string) => (id ? team.agents.flatMap(a => (a.avatar && a.id !== id ? [a.avatar] : [])) : taken);
  const startNew = () => setDraft({
    name: '', harness: team.installed[0]?.id ?? 'claude', model: '', role: '', instructions: '', lead: false, skills: [], maxConcurrent: 1,
    avatar: AGENT_AVATARS.find(a => !taken.includes(a)) ?? AGENT_AVATARS[0],
  });
  const edit = (a: TeamAgentView) => setDraft({
    id: a.id, name: a.name, harness: a.harness, model: a.model ?? '', role: a.role ?? '', instructions: a.instructions ?? '',
    lead: a.lead === true, skills: a.skills ?? [], maxConcurrent: a.maxConcurrent ?? 1, person: a.kind === 'person',
    avatar: a.avatar ?? '',
  });
  const startPerson = () => setDraft({
    name: '', harness: '', model: '', role: '', instructions: '', lead: false, skills: [], maxConcurrent: 1, person: true,
  });

  return (
    <div className="agent-editor-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="agent-editor" role="dialog" aria-modal="true" aria-labelledby="agent-editor-title">
        <header className="agent-editor-head">
          <h3 id="agent-editor-title">Agents</h3>
          <div className="agent-editor-tabs" role="tablist" aria-label="Agents view">
            <button role="tab" aria-selected={tab === 'team'} className={`agent-editor-tab${tab === 'team' ? ' is-active' : ''}`} onClick={() => setTab('team')}>Team</button>
            <button role="tab" aria-selected={tab === 'usage'} className={`agent-editor-tab${tab === 'usage' ? ' is-active' : ''}`} onClick={() => setTab('usage')}>Usage</button>
          </div>
          <button className="agent-editor-close" onClick={onClose} aria-label="Close agents">×</button>
        </header>

        {tab === 'usage' ? <UsagePanel /> : (
          <>
            <p className="agent-editor-intro">
              {team.rosterDefined
                ? 'Assign cards to these agents from a card’s detail panel. Each runs on its CLI and model.'
                : 'No agents named yet, so each installed CLI acts as one. Add an agent to choose its name, CLI and model.'}
            </p>

            {team.rosterDefined && (
              <ul className="agent-editor-list">
                {team.agents.map(a => <AgentRow key={a.id} agent={a} team={team} saved={savedIds.has(a.id)} onEdit={() => edit(a)} />)}
              </ul>
            )}

            {showLibrary && !draft && <MyAgents library={library} team={team} onClose={() => setShowLibrary(false)} />}

            {draft ? (
              draft.person
                ? <PersonForm key={draft.id ?? 'new-person'} draft={draft} taken={takenBy(draft.id)} onCancel={() => setDraft(null)} />
                : <AgentForm key={draft.id ?? 'new'} team={team} draft={draft} taken={takenBy(draft.id)} onCancel={() => setDraft(null)} />
            ) : (
              <div className="agent-editor-foot">
                <button className="agent-editor-btn agent-editor-btn--primary" onClick={startNew} disabled={team.installed.length === 0}>
                  New agent
                </button>
                <button className="agent-editor-btn" onClick={startPerson}>Add person</button>
                <button className="agent-editor-btn" aria-expanded={showLibrary} onClick={() => setShowLibrary(s => !s)}>
                  Add from my agents{library.length ? ` (${library.length})` : ''}
                </button>
                {team.installed.length === 0 && <span className="agent-editor-hint">Install a coding-agent CLI first.</span>}
                <button className="agent-editor-link" onClick={() => vscode.postMessage({ type: 'kanban:editAgentTeam' })}>Open team file</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
