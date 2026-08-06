// src/api/client.ts
// Fetch wrapper that:
//  - attaches the access token
//  - on a 401, performs one refresh-rotation attempt, then retries
//  - deduplicates concurrent refreshes (single in-flight promise)
//
// Token storage tradeoff, stated honestly: the access token lives in
// memory only; the refresh token lives in localStorage so sessions
// survive a page reload. localStorage is XSS-readable, so the
// production-hardened version moves refresh into an httpOnly cookie.
// That requires CSRF handling on the backend and is a known Phase 2
// item, not an oversight.

import type { AuthResponse } from './types';

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

const REFRESH_KEY = 'pulseops.refreshToken';

export function setSession(auth: { accessToken: string; refreshToken: string }): void {
  accessToken = auth.accessToken;
  localStorage.setItem(REFRESH_KEY, auth.refreshToken);
}

export function clearSession(): void {
  accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
}

export function hasSession(): boolean {
  return localStorage.getItem(REFRESH_KEY) !== null;
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  const tokens = (await res.json()) as Pick<AuthResponse, 'accessToken' | 'refreshToken'>;
  setSession(tokens);
  return true;
}

/** One refresh at a time: parallel 401s share the same attempt. */
function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function rawRequest(path: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(path, { ...options, headers });
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res = await rawRequest(path, options);

  if (res.status === 401 && hasSession()) {
    const refreshed = await refreshOnce();
    if (refreshed) res = await rawRequest(path, options);
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = body?.error?.code ?? 'UNKNOWN';
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiRequestError(res.status, code, message);
  }
  return body as T;
}

/** Called on app boot: restore a session from the stored refresh token. */
export async function bootstrapSession(): Promise<boolean> {
  if (!hasSession()) return false;
  return refreshOnce();
}
