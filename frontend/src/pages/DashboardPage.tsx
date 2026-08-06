// src/pages/DashboardPage.tsx
// MTTR dashboard. Charts are hand-rolled SVG in the console's own
// design language rather than a chart library: no dependency weight,
// exact control of the dark palette, and everything renders from the
// same tokens as the rest of the UI.

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '../api/client';
import type { Severity } from '../api/types';
import Shell from '../components/Shell';
import { fmtDuration, fmtDate } from '../lib/format';

interface TrendRow {
  period: string;
  resolved_count: number;
  mttr_seconds: number;
  mtta_seconds: number | null;
  median_ttr_seconds: number;
  worst_ttr_seconds: number;
}

interface Summary {
  window_days: number;
  open_count: number;
  open_p1_count: number;
  resolved_in_window: number;
  mttr_seconds: number | null;
  mtta_seconds: number | null;
  by_severity: { severity: Severity; resolved_count: number; mttr_seconds: number }[];
}

const SEV_COLOR: Record<Severity, string> = {
  P1: '#e0342a',
  P2: '#c47f0a',
  P3: '#1a68d1',
};

const WINDOWS = [
  { days: 7, bucket: 'day', label: '7 days' },
  { days: 30, bucket: 'day', label: '30 days' },
  { days: 90, bucket: 'week', label: '90 days' },
] as const;

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="rounded border border-line bg-panel px-4 py-4">
      <div className="text-xs font-bold uppercase tracking-wider text-dim">{label}</div>
      <div
        className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
          tone === 'bad' ? 'text-sev1' : tone === 'good' ? 'text-okay' : 'text-body'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** Vertical bar chart of MTTR per period, median marked as a tick. */
function TrendChart({ rows }: { rows: TrendRow[] }) {
  const W = 720;
  const H = 220;
  const PAD = { top: 16, right: 8, bottom: 28, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const max = Math.max(...rows.map((r) => r.mttr_seconds), 1);
  const barW = Math.min(48, (innerW / rows.length) * 0.6);
  const step = innerW / rows.length;

  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => ({
    yPos: y(max * f),
    label: fmtDuration(Math.round(max * f)),
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Mean time to resolve per period"
    >
      {gridLines.map((g) => (
        <g key={g.yPos}>
          <line x1={PAD.left} x2={W - PAD.right} y1={g.yPos} y2={g.yPos} stroke="#e3e6ea" strokeWidth="1" />
          <text x={PAD.left - 8} y={g.yPos + 3} textAnchor="end" fontSize="10" fill="#6b7280" fontFamily="IBM Plex Mono, monospace">
            {g.label}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="#e3e6ea" strokeWidth="1" />

      {rows.map((r, i) => {
        const cx = PAD.left + step * i + step / 2;
        const barH = ((r.mttr_seconds / max) * innerH) || 1;
        const medianY = y(r.median_ttr_seconds);
        return (
          <g key={r.period}>
            <rect
              x={cx - barW / 2}
              y={PAD.top + innerH - barH}
              width={barW}
              height={barH}
              fill="#0a8a43"
              opacity="0.75"
            >
              <title>
                {fmtDate(r.period)}: mean {fmtDuration(r.mttr_seconds)}, median{' '}
                {fmtDuration(r.median_ttr_seconds)}, {r.resolved_count} resolved
              </title>
            </rect>
            <line
              x1={cx - barW / 2 - 3}
              x2={cx + barW / 2 + 3}
              y1={medianY}
              y2={medianY}
              stroke="#16191d"
              strokeWidth="1.5"
            />
            <text x={cx} y={H - 10} textAnchor="middle" fontSize="10" fill="#6b7280" fontFamily="IBM Plex Mono, monospace">
              {fmtDate(r.period)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal MTTR-by-severity comparison. */
function SeverityBars({ rows }: { rows: Summary['by_severity'] }) {
  const max = Math.max(...rows.map((r) => r.mttr_seconds), 1);
  return (
    <div className="space-y-3">
      {(['P1', 'P2', 'P3'] as Severity[]).map((sev) => {
        const row = rows.find((r) => r.severity === sev);
        const pct = row ? Math.max((row.mttr_seconds / max) * 100, 2) : 0;
        return (
          <div key={sev}>
            <div className="mb-1 flex justify-between font-mono text-xs">
              <span style={{ color: SEV_COLOR[sev] }}>{sev}</span>
              <span className="text-dim">
                {row ? `${fmtDuration(row.mttr_seconds)} · ${row.resolved_count} resolved` : 'no data'}
              </span>
            </div>
            <div className="h-2 rounded-sm bg-raise">
              {row && (
                <div
                  className="h-2 rounded-sm"
                  style={{ width: `${pct}%`, background: SEV_COLOR[sev] }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [windowIdx, setWindowIdx] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { days, bucket } = WINDOWS[windowIdx];

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        api<Summary>(`/api/analytics/summary?days=${days}`),
        api<{ trend: TrendRow[] }>(`/api/analytics/mttr?days=${days}&bucket=${bucket}`),
      ]);
      setSummary(s);
      setTrend(t.trend);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load analytics');
    }
  }, [days, bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Analytics</h1>
        <div className="flex rounded border border-line" role="group" aria-label="Time window">
          {WINDOWS.map((w, i) => (
            <button
              key={w.days}
              className={`px-3 py-1.5 text-sm ${
                i === windowIdx ? 'bg-raise text-body' : 'text-dim hover:text-body'
              } ${i > 0 ? 'border-l border-line' : ''}`}
              onClick={() => setWindowIdx(i)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-sev1 bg-sev1/10 px-3 py-2 text-sm text-sev1" role="alert">
          {error}
        </div>
      )}

      {summary && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard
              label="Open now"
              value={String(summary.open_count)}
              tone={summary.open_count > 0 ? 'bad' : 'good'}
            />
            <StatCard
              label="Open P1"
              value={String(summary.open_p1_count)}
              tone={summary.open_p1_count > 0 ? 'bad' : 'good'}
            />
            <StatCard label={`Resolved (${days}d)`} value={String(summary.resolved_in_window)} />
            <StatCard label="MTTR" value={fmtDuration(summary.mttr_seconds)} />
            <StatCard label="MTTA" value={fmtDuration(summary.mtta_seconds)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
            <section className="rounded border border-line bg-panel p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-dim">
                  Mean time to resolve, per {bucket}
                </h2>
                <span className="font-mono text-xs text-dim">
                  bar = mean · tick = median
                </span>
              </div>
              {trend.length > 0 ? (
                <TrendChart rows={trend} />
              ) : (
                <p className="py-12 text-center text-dim">
                  No resolved incidents in this window yet.
                </p>
              )}
            </section>

            <section className="rounded border border-line bg-panel p-5">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-dim">
                MTTR by severity
              </h2>
              <SeverityBars rows={summary.by_severity} />
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}
