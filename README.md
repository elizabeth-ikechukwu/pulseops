# PulseOps

Multi-tenant incident management platform: a simplified PagerDuty meets
Jira Service Management. Built by Elizabeth Ikechukwu (LizzyCloudLab).

## Stack

- **Frontend:** React 18 + TypeScript (strict) + Tailwind, served by Nginx
- **Backend:** Node.js 20 + Express REST API
- **Database:** PostgreSQL 16 (raw SQL, migration runner with advisory locking)
- **Cache:** Redis 7 (refresh-token rotation whitelist, rate limiting)

## Features

- JWT auth with refresh-token rotation and role-based access (admin / engineer / viewer)
- Multi-tenant: org-scoped data, per-org INC numbering, tenant isolation on every query
- Incident lifecycle state machine: open → acknowledged → in progress → resolved → closed
- Live resolution timers derived from server-side timestamps
- MTTR / MTTA analytics: trend with mean, median, and worst-case per bucket
- Blameless postmortem generator pre-filled from the incident timeline, with a
  draft → published lifecycle and markdown export
- Immutable status audit trail per incident

## Run it

```bash
cp backend/.env.example backend/.env
# fill JWT secrets:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
docker compose up --build
```

App: http://localhost:8080 (Nginx serves the SPA and proxies /api).
First run: use "Create one" on the login screen to register your org
and its admin account.

### Without Docker

Backend: `cd backend && npm install && npm run migrate && npm run dev` (needs local Postgres 16 + Redis).
Frontend: `cd frontend && npm install && npm run dev` (Vite proxies /api to :4000).

## Architecture notes

- Migrations run as a separate step (`npm run migrate`); the compose file runs
  them on container boot for local convenience only.
- The browser talks to one origin (Nginx), so there is no CORS configuration:
  it was architected away with a reverse proxy.
- All aggregation (MTTR, percentiles) happens in PostgreSQL, not in Node.
- Durations are always derived from timestamps at read time, never stored.
