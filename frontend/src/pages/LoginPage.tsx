// src/pages/LoginPage.tsx
// Same dark console identity as the app: a single sharp card on the
// near-black field, bold heading, one green action.

import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [orgSlug, setOrgSlug] = useState('');
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(orgSlug, email, password);
      } else {
        await register({ orgName, orgSlug, email, password, fullName });
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong, try again');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: the pitch, in one glance — what this is, why it matters */}
      <div className="hidden flex-col justify-center bg-body px-16 py-12 lg:flex">
        <div className="font-mono text-base font-bold tracking-wide text-white">
          <span className="text-[#3ddc84]">Pulse</span>Ops
        </div>
        <h1 className="mt-8 text-6xl font-black leading-[0.98] tracking-tight text-white">
          Know it broke<br />
          <span className="text-[#3ddc84]">before they do.</span>
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-white/70">
          Incident tracking, severity triage, and MTTR analytics in one console.
          Declare an incident, watch the clock start, and never lose the timeline.
        </p>
        <div className="mt-10 flex gap-8 font-mono text-sm text-white/50">
          <span>P1 / P2 / P3 triage</span>
          <span>Live resolution timers</span>
          <span>Blameless postmortems</span>
        </div>
      </div>

      {/* Right: the actual form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <div className="font-mono text-lg font-bold tracking-wide">
              <span className="text-signal">Pulse</span>Ops
            </div>
          </div>
          <h2 className="mb-1 text-2xl font-extrabold tracking-tight">
            {mode === 'login' ? 'Sign in' : 'Create your organization'}
          </h2>
          <p className="mb-6 text-dim">
            {mode === 'login' ? 'Welcome back to the console.' : 'Set up your team in under a minute.'}
          </p>

          {error && (
            <div
              className="mb-4 rounded border border-sev1 bg-sev1/10 px-3 py-2 text-sm text-sev1"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={onSubmit}>
            {mode === 'register' && (
              <div className="mb-3.5">
                <label className="field-label" htmlFor="orgName">Organization name</label>
                <input
                  id="orgName"
                  className="field-input"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="mb-3.5">
              <label className="field-label" htmlFor="orgSlug">Organization slug</label>
              <input
                id="orgSlug"
                className="field-input font-mono"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="lizzycloudlab"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Lowercase letters, numbers, and hyphens"
                required
              />
            </div>
            {mode === 'register' && (
              <div className="mb-3.5">
                <label className="field-label" htmlFor="fullName">Your full name</label>
                <input
                  id="fullName"
                  className="field-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="mb-3.5">
              <label className="field-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="field-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="mb-5">
              <label className="field-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="field-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                required
              />
            </div>

            <button className="btn btn-primary w-full justify-center" disabled={busy}>
              {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create organization'}
            </button>
          </form>

          <p className="mt-4 text-center text-dim">
            {mode === 'login' ? (
              <>
                New organization?{' '}
                <button className="text-signal hover:underline" onClick={() => switchMode('register')}>
                  Create one
                </button>
              </>
            ) : (
              <>
                Already registered?{' '}
                <button className="text-signal hover:underline" onClick={() => switchMode('login')}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
