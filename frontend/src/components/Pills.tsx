// src/components/Pills.tsx — status pill and severity text, the two
// atoms of the console's visual language.

import type { IncidentStatus, Severity } from '../api/types';

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function StatusPill({ status }: { status: IncidentStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function SevText({ severity }: { severity: Severity }) {
  return <span className={`font-mono text-xs sev-text-${severity}`}>{severity}</span>;
}
