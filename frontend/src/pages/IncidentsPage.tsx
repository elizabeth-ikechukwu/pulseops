// src/pages/IncidentsPage.tsx
// Operations console, modeled on the PagerDuty incident table:
// a real <table>, status pills, severity as colored text, summary as
// the dominant column, dense rows, one green accent. Dark, no
// decoration that doesn't carry information.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../api/client';
import type { Incident, IncidentList, IncidentStatus, Severity } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import Shell from '../components/Shell';
import { StatusPill, SevText, STATUS_LABEL } from '../components/Pills';
import { fmtElapsed } from '../lib/format';

const SEVERITIES: Severity[] = ['P1', 'P2', 'P3'];
const STATUSES: IncidentStatus[] = ['open', 'acknowledged', 'in_progress', 'resolved', 'closed'];

function IncidentTimer({ incident }: { incident: Incident }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (incident.timers.elapsed_seconds === null) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [incident.timers.elapsed_seconds]);

  if (incident.timers.time_to_resolve_seconds !== null) {
    return (
      <span className="font-mono text-xs text-okay tabular-nums" title="Time to resolve">
        {fmtElapsed(incident.timers.time_to_resolve_seconds)}
      </span>
    );
  }

  const elapsed = Math.max(
    0,
    Math.round((Date.now() - new Date(incident.created_at).getTime()) / 1000)
  );
  return (
    <span className="font-mono text-xs text-sev2 tabular-nums" title="Time since created">
      {fmtElapsed(elapsed)}
    </span>
  );
}

export default function IncidentsPage() {
  const { user } = useAuth();
  const canEdit = user!.role === 'admin' || user!.role === 'engineer';

  const [data, setData] = useState<IncidentList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('P2');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter) params.set('status', statusFilter);
      if (severityFilter) params.set('severity', severityFilter);
      const result = await api<IncidentList>(`/api/incidents?${params}`);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load incidents');
    }
  }, [page, statusFilter, severityFilter]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api<Incident>('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({ title, description, severity }),
      });
      setTitle('');
      setDescription('');
      setSeverity('P2');
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create incident');
    } finally {
      setCreating(false);
    }
  }

  const openCount =
    data?.incidents.filter((i) => i.timers.time_to_resolve_seconds === null).length ?? 0;

  return (
    <Shell>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">Operations console</h1>
            {data && (
              <span className="rounded border border-line px-2 py-0.5 font-mono text-xs text-dim">
                {data.pagination.total} total · {openCount} on page unresolved
              </span>
            )}
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Cancel' : 'Declare incident'}
            </button>
          )}
        </div>

        {error && (
          <div
            className="mb-4 rounded border border-sev1 bg-sev1/10 px-3 py-2 text-sm text-sev1"
            role="alert"
          >
            {error}
          </div>
        )}

        {showCreate && (
          <form className="mb-5 rounded border border-line bg-panel p-5" onSubmit={onCreate}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-dim">
              Declare an incident
            </h2>
            <div className="mb-3 flex gap-3">
              <div className="flex-[3]">
                <label className="field-label" htmlFor="title">Title</label>
                <input
                  id="title"
                  className="field-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  minLength={3}
                  maxLength={200}
                  placeholder="API latency spike on checkout service"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="field-label" htmlFor="severity">Severity</label>
                <select
                  id="severity"
                  className="field-input"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="field-label" htmlFor="description">Description</label>
              <textarea
                id="description"
                className="field-input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is broken, since when, and what is affected?"
              />
            </div>
            <button className="btn btn-primary" disabled={creating}>
              {creating ? 'Declaring…' : 'Declare incident'}
            </button>
          </form>
        )}

        <div className="mb-3 flex gap-2">
          <select
            aria-label="Filter by status"
            className="field-input w-auto"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select
            aria-label="Filter by severity"
            className="field-input w-auto"
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
          >
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded border border-line">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-panel text-xs font-bold uppercase tracking-wider text-dim">
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Sev</th>
                <th className="w-full px-4 py-2.5">Summary</th>
                <th className="px-4 py-2.5">Assignee</th>
                <th className="px-4 py-2.5 text-right">Timer</th>
              </tr>
            </thead>
            <tbody>
              {data?.incidents.map((inc) => (
                <tr
                  key={inc.id}
                  className="border-b border-line bg-panel last:border-b-0 hover:bg-raise"
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-dim">
                    INC-{inc.incident_number}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={inc.status} />
                  </td>
                  <td className="px-4 py-3">
                    <SevText severity={inc.severity} />
                  </td>
                  <td className="max-w-0 truncate px-4 py-3 font-semibold" title={inc.title}>
                    <Link to={`/incidents/${inc.id}`} className="text-signal hover:underline">
                      {inc.title}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-dim">
                    {inc.assigned_to_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <IncidentTimer incident={inc} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data && data.incidents.length === 0 && (
            <div className="bg-panel px-4 py-14 text-center text-dim">
              No incidents match.{' '}
              {canEdit ? 'Declare one when something breaks.' : 'All quiet.'}
            </div>
          )}
        </div>

        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-dim">
            <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span className="font-mono text-xs">
              {data.pagination.page} / {data.pagination.totalPages}
            </span>
            <button
              className="btn"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
    </Shell>
  );
}
