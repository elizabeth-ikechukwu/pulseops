// src/components/Shell.tsx — top bar + page frame shared by all
// authenticated pages, so navigation state lives in one place.

import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { ReactNode } from 'react';

export default function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  const nav = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'text-body' : 'text-dim hover:text-body';

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-line bg-panel px-6">
        <div className="flex items-center gap-8">
          <NavLink to="/" className="font-mono text-base font-bold tracking-wide text-body">
            <span className="text-signal">Pulse</span>Ops
          </NavLink>
          <nav className="flex gap-6 text-[15px] font-semibold">
            <NavLink to="/" end className={nav}>Incidents</NavLink>
            <NavLink to="/dashboard" className={nav}>Analytics</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-dim">
          <span>
            {user!.full_name}
            <span className="ml-2 rounded border border-line px-1.5 py-0.5 font-mono text-xs uppercase">
              {user!.role}
            </span>
          </span>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </>
  );
}
