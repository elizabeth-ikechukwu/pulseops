// src/pages/IncidentDetailPage.tsx
// The 2am page. Everything an on-call engineer needs on one screen:
// what's broken, how long it's been burning, the next legal action as
// a single obvious button, and the timeline of what already happened.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiRequestError } from '../api/client';
import type { Incident, IncidentStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import Shell from '../components/Shell';
import { StatusPill, SevText, STATUS_LABEL } from '../components/Pills';
import { fmtDuration, fmtElapsed, fmtTimestamp } from '../lib/format';

interface HistoryEntry {
  id: string;
  from_status: IncidentStatus | null;
  to_status: IncidentStatus;
  note: string | null;
  created_at: string;
  changed_by_name: string;
}

interface OrgUser {
  id: string;
  full_name: string;
  role: string;
}

// Mirrors the backend state machine; the server is still the referee.
const NEXT: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['acknowledged'],
  acknowledged: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

const ACTION_LABEL: Record<IncidentStatus, string> = {
  open: 'Reopen',
  acknowledged: 'Acknowledge',
  in_progress: 'Start work',
  resolved: 'Resolve',
  closed: 'Close incident',
};

function LiveElapsed({ createdAt }: { createdAt: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 1000));
  return <span className="font-mono text-3xl font-bold text-sev2 tabular-nums">{fmtElapsed(elapsed)}</span>;
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user!.role === 'admin' || user!.role === 'engineer';
  const isAdmin = user!.role === 'admin';

  const [incident, setIncident] = useState<Incident | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [members, setMembers] = useState<OrgUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const [inc, hist] = await Promise.all([
        api<Incident>(`/api/incidents/${id}`),
        api<{ history: HistoryEntry[] }>(`/api/incidents/${id}/history`),
      ]);
      setIncident(inc);
      setHistory(hist.history);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load incident');
    }
  }, [id]);

  useEffect(() => {
    void load();
    if (canEdit) {
      api<{ users: OrgUser[] }>('/api/users')
        .then((r) => setMembers(r.users))
        .catch(() => {});
    }
  }, [load, canEdit]);

  async function transition(toStatus: IncidentStatus) {
    setBusy(true);
    try {
      await api<Incident>(`/api/incidents/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status: toStatus, note: note.trim() || undefined }),
      });
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Transition failed');
    } finally {
      setBusy(false);
    }
  }

  async function assign(assignedTo: string) {
    setBusy(true);
    try {
      await api<Incident>(`/api/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedTo: assignedTo === '' ? null : assignedTo }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Assignment failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete INC-${incident?.incident_number}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api<void>(`/api/incidents/${id}`, { method: 'DELETE' });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Delete failed');
      setBusy(false);
    }
  }

  if (!incident) {
    return (
      <Shell>
        {error ? (
          <div className="rounded border border-sev1 bg-sev1/10 px-3 py-2 text-sm text-sev1" role="alert">
            {error} · <Link to="/" className="text-signal">Back to incidents</Link>
          </div>
        ) : (
          <p className="text-dim">Loading…</p>
        )}
      </Shell>
    );
  }

  const resolved = incident.timers.time_to_resolve_seconds !== null;
  const nextStates = NEXT[incident.status];
  const postmortemReady = incident.status === 'resolved' || incident.status === 'closed';

  return (
    <Shell>
      <div className="mb-1 font-mono text-xs text-dim">
        <Link to="/" className="hover:text-body">Incidents</Link>
        <span className="mx-1.5">/</span>
        INC-{incident.incident_number}
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight">{incident.title}</h1>
          <div className="mt-2 flex items-center gap-2.5">
            <StatusPill status={incident.status} />
            <SevText severity={incident.severity} />
            <span className="text-xs text-dim">
              declared {fmtTimestamp(incident.created_at)}
            </span>
          </div>
        </div>
        <div className="rounded border border-line bg-panel px-4 py-2.5 text-right">
          <div className="text-xs uppercase tracking-wider text-dim">
            {resolved ? 'Time to resolve' : 'Elapsed'}
          </div>
          {resolved ? (
            <span className="font-mono text-3xl font-bold text-okay tabular-nums">
              {fmtElapsed(incident.timers.time_to_resolve_seconds!)}
            </span>
          ) : (
            <LiveElapsed createdAt={incident.created_at} />
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-sev1 bg-sev1/10 px-3 py-2 text-sm text-sev1" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="rounded border border-line bg-panel p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-dim">
              Description
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {incident.description || <span className="text-dim">No description provided.</span>}
            </p>
          </section>

          <section className="rounded border border-line bg-panel p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-dim">
              Timeline
            </h2>
            <ol className="space-y-0">
              {history.map((h, idx) => (
                <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 h-2 w-2 rounded-full ${
                        h.to_status === 'resolved' || h.to_status === 'closed'
                          ? 'bg-okay'
                          : h.to_status === 'open'
                            ? 'bg-sev1'
                            : 'bg-sev2'
                      }`}
                    />
                    {idx < history.length - 1 && <span className="w-px flex-1 bg-line" />}
                  </div>
                  <div className="min-w-0 pb-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">
                        {h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : ''}
                        {STATUS_LABEL[h.to_status]}
                      </span>
                      <span className="font-mono text-xs text-dim">
                        {fmtTimestamp(h.created_at)} · {h.changed_by_name}
                      </span>
                    </div>
                    {h.note && <p className="mt-0.5 text-sm text-dim">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-5">
          {canEdit && nextStates.length > 0 && (
            <section className="rounded border border-line bg-panel p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-dim">
                Actions
              </h2>
              <label className="field-label" htmlFor="note">Note (goes on the timeline)</label>
              <textarea
                id="note"
                className="field-input mb-3"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Rolled back deploy 4211"
                maxLength={2000}
              />
              <div className="flex flex-col gap-2">
                {nextStates.map((s, idx) => (
                  <button
                    key={s}
                    className={`btn justify-center ${idx === 0 ? 'btn-primary' : ''}`}
                    disabled={busy}
                    onClick={() => transition(s)}
                  >
                    {ACTION_LABEL[s]}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded border border-line bg-panel p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-dim">
              Assignment
            </h2>
            {canEdit ? (
              <select
                className="field-input"
                value={incident.assigned_to ?? ''}
                disabled={busy || incident.status === 'closed'}
                onChange={(e) => assign(e.target.value)}
                aria-label="Assign to"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.role})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm">{incident.assigned_to_name ?? 'Unassigned'}</p>
            )}
          </section>

          <section className="rounded border border-line bg-panel p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-dim">
              Metrics
            </h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-dim">Time to acknowledge</dt>
                <dd className="font-mono text-xs">
                  {fmtDuration(incident.timers.time_to_acknowledge_seconds)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-dim">Time to resolve</dt>
                <dd className="font-mono text-xs">
                  {fmtDuration(incident.timers.time_to_resolve_seconds)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded border border-line bg-panel p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-dim">
              Postmortem
            </h2>
            {postmortemReady ? (
              <Link to={`/incidents/${incident.id}/postmortem`} className="btn w-full justify-center">
                Open postmortem
              </Link>
            ) : (
              <p className="text-sm text-dim">Available once the incident is resolved.</p>
            )}
          </section>

          {isAdmin && (
            <button
              className="w-full rounded border border-sev1/40 px-3.5 py-2 text-sm text-sev1 hover:border-sev1"
              disabled={busy}
              onClick={remove}
            >
              Delete incident
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
