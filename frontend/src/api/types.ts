// src/api/types.ts — mirrors the backend's response shapes.

export type Role = 'admin' | 'engineer' | 'viewer';
export type Severity = 'P1' | 'P2' | 'P3';
export type IncidentStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';

export interface User {
  id: string;
  org_id: string;
  email: string;
  full_name: string;
  role: Role;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface IncidentTimers {
  time_to_acknowledge_seconds: number | null;
  time_to_resolve_seconds: number | null;
  elapsed_seconds: number | null;
}

export interface Incident {
  id: string;
  incident_number: number;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  created_by: string;
  assigned_to: string | null;
  assigned_to_name?: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  timers: IncidentTimers;
}

export interface IncidentList {
  incidents: Incident[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiError {
  error: { code: string; message: string };
}
