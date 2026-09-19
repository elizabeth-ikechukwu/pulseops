# PulseOps

A multi-tenant incident management platform, built solo from database schema to deployed AWS infrastructure. Simplified PagerDuty meets Jira Service Management.

**Live:** [pulseops-app.online](https://pulseops-app.online)
**Infrastructure:** [pulseops-infra](https://github.com/elizabeth-ikechukwu/pulseops-infra)

Built by Elizabeth Ikechukwu ([LinkedIn](https://linkedin.com/in/ikechukwu-elizabeth))

## What it does

Teams declare an incident, tag it P1, P2, or P3, and track it through a real status lifecycle with a live resolution timer. Once resolved, the platform generates a blameless postmortem pre-filled with the actual timeline and response data, so the write-up is a review, not a reconstruction from memory.

## Results

- 29 automated tests (Jest, Supertest) run against real PostgreSQL and Redis, not mocks, on every push through GitHub Actions before anything merges
- Tenant isolation is proven by test, not assumed: one organization fetching another's incident by its exact database ID gets a 404, not a 403, so the system never confirms the record even exists
- Refresh-token rotation verified: a token that's already been used cannot be replayed, tested directly against the code path
- Deployed to real AWS infrastructure with zero static credentials anywhere in the pipeline (see the infra repo for how)

## How it works

JWT auth with refresh-token rotation and three role tiers: admin, engineer, viewer. Every database query is scoped to a tenant organization at the query level, not filtered after the fact. Incident status moves through a real state machine, open to acknowledged to in progress to resolved to closed, illegal transitions get rejected outright, and every change writes to an immutable audit trail.

MTTR and MTTA analytics compute mean, median, and worst-case per time bucket, entirely in PostgreSQL, not pulled into Node and aggregated there.

## Stack

React 18, TypeScript (strict), Tailwind, served by Nginx. Node.js 20, Express. PostgreSQL 16 with a raw-SQL migration runner using advisory locking. Redis 7 for the refresh-token whitelist and rate limiting.

## Run it locally

```bash
cp backend/.env.example backend/.env
# generate JWT secrets:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
docker compose up --build
```

App runs at `http://localhost:8080`. Nginx serves the frontend and proxies `/api` to the backend, so the browser only ever talks to one origin, no CORS configuration exists anywhere in this project because it was never needed.

First run: click "Create one" on the login screen to register an organization and its admin account.

### Without Docker

Backend: `cd backend && npm install && npm run migrate && npm run dev` (needs local Postgres 16 and Redis).
Frontend: `cd frontend && npm install && npm run dev` (Vite proxies `/api` to `:4000`).

## Notes worth knowing

Migrations run as a separate step (`npm run migrate`). The Docker Compose file runs them on container boot for local convenience only, production runs them explicitly, on purpose.

Durations are always computed from timestamps at read time, never stored as a separate field, so they can never drift out of sync with the events that produced them.