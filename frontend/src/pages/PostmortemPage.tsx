// src/pages/PostmortemPage.tsx
// Postmortem lifecycle: generate a pre-filled draft, edit it in a
// full-width mono editor, publish (admin, irreversible), download the
// markdown. Published postmortems render read-only.

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiRequestError } from '../api/client';
import type { Incident } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import Shell from '../components/Shell';
import { StatusPill } from '../components/Pills';
import { fmtTimestamp } from '../lib/format';

interface Postmortem {
  id: string;
  incident_id: string;
  status: 'draft' | 'published';
  content_md: string;
  created_by_name?: string;
  published_at: string | null;
  updated_at: string;
}

export default function PostmortemPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canEdit = user!.role === 'admin' || user!.role === 'engineer';
  const isAdmin = user!.role === 'admin';

  const [incident, setIncident] = useState<Incident | null>(null);
  const [pm, setPm] = useState<Postmortem | null>(null);
  const [missing, setMissing] = useState(false);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const inc = await api<Incident>(`/api/incidents/${id}`);
      setIncident(inc);
      try {
        const found = await api<Postmortem>(`/api/incidents/${id}/postmortem`);
        setPm(found);
        setContent(found.content_md);
        setMissing(false);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          setMissing(true);
        } else {
          throw err;
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    try {
      const created = await api<Postmortem>(`/api/incidents/${id}/postmortem`, { method: 'POST' });
      setPm(created);
      setContent(created.content_md);
      setMissing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const updated = await api<Postmortem>(`/api/incidents/${id}/postmortem`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      setPm(updated);
      setDirty(false);
      setSavedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!window.confirm('Publish this postmortem? Published postmortems cannot be edited.')) return;
    setBusy(true);
    try {
      if (dirty) {
        await api<Postmortem>(`/api/incidents/${id}/postmortem`, {
          method: 'PATCH',
          body: JSON.stringify({ content }),
        });
      }
      const published = await api<Postmortem>(`/api/incidents/${id}/postmortem/publish`, {
        method: 'POST',
      });
      setPm(published);
      setDirty(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    try {
      // The editor state is the latest content, so the file is built
      // client-side; no extra round trip needed.
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `postmortem-INC-${incident?.incident_number ?? 'x'}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
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

  const published = pm?.status === 'published';

  return (
    <Shell>
      <div className="mb-1 font-mono text-xs text-dim">
        <Link to="/" className="hover:text-body">Incidents</Link>
        <span className="mx-1.5">/</span>
        <Link to={`/incidents/${id}`} className="hover:text-body">
          INC-{incident.incident_number}
        </Link>
        <span className="mx-1.5">/</span>
        Postmortem
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">Postmortem</h1>
          {pm && (
            <span className={`pill ${published ? 'pill-resolved' : 'pill-acknowledged'}`}>
              {published ? 'Published' : 'Draft'}
            </span>
          )}
        </div>
        {pm && (
          <div className="flex items-center gap-2">
            {!published && canEdit && (
              <button className="btn" disabled={busy || !dirty} onClick={save}>
                {dirty ? 'Save draft' : savedAt ? 'Saved' : 'Save draft'}
              </button>
            )}
            {!published && isAdmin && (
              <button className="btn btn-primary" disabled={busy} onClick={publish}>
                Publish
              </button>
            )}
            <button className="btn" onClick={download}>Download .md</button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded border border-sev1 bg-sev1/10 px-3 py-2 text-sm text-sev1" role="alert">
          {error}
        </div>
      )}

      {missing && (
        <div className="rounded border border-line bg-panel px-6 py-14 text-center">
          <p className="mb-1 font-medium">No postmortem yet for INC-{incident.incident_number}.</p>
          <p className="mb-5 text-sm text-dim">
            Generation pre-fills the template with the incident's timeline, severity, and
            response metrics. You write the analysis.
          </p>
          {canEdit ? (
            <button className="btn btn-primary" disabled={busy} onClick={generate}>
              {busy ? 'Generating…' : 'Generate postmortem'}
            </button>
          ) : (
            <p className="text-sm text-dim">An engineer or admin can generate it.</p>
          )}
        </div>
      )}

      {pm && (
        <>
          <div className="mb-2 flex items-center justify-between font-mono text-xs text-dim">
            <span>
              <StatusPill status={incident.status} />
              <span className="ml-2">{incident.title}</span>
            </span>
            <span>
              {published
                ? `published ${fmtTimestamp(pm.published_at)}`
                : `last edited ${fmtTimestamp(pm.updated_at)}`}
            </span>
          </div>
          {published || !canEdit ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-line bg-panel p-5 font-mono text-[13px] leading-relaxed">
              {content}
            </pre>
          ) : (
            <textarea
              className="field-input min-h-[560px] w-full font-mono text-[13px] leading-relaxed"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
              aria-label="Postmortem markdown"
            />
          )}
        </>
      )}
    </Shell>
  );
}
