-- 002_create_incidents.sql
-- Incidents with severity, assignment, status lifecycle, and the
-- timestamps needed for resolution timer + MTTR without extra queries.

BEGIN;

CREATE TYPE incident_severity AS ENUM ('P1', 'P2', 'P3');
CREATE TYPE incident_status   AS ENUM ('open', 'acknowledged', 'in_progress', 'resolved', 'closed');

CREATE TABLE incidents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

    -- human-friendly per-org incident number (INC-42), assigned by
    -- the model layer inside a transaction using org_counters below
    incident_number BIGINT NOT NULL,

    title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
    description     TEXT NOT NULL DEFAULT '',
    severity        incident_severity NOT NULL,
    status          incident_status NOT NULL DEFAULT 'open',

    created_by      UUID NOT NULL REFERENCES users(id),
    assigned_to     UUID REFERENCES users(id),

    -- lifecycle timestamps: the source of truth for MTTA/MTTR.
    -- Never computed client-side, always set server-side on transition.
    acknowledged_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT incidents_org_number_unique UNIQUE (org_id, incident_number),
    -- resolved implies a resolved_at timestamp, and vice versa
    CONSTRAINT incidents_resolved_consistency CHECK (
        (status IN ('resolved', 'closed')) = (resolved_at IS NOT NULL)
    )
);

-- every list view is org-scoped, so org_id leads each index
CREATE INDEX idx_incidents_org_status   ON incidents (org_id, status);
CREATE INDEX idx_incidents_org_severity ON incidents (org_id, severity);
CREATE INDEX idx_incidents_org_created  ON incidents (org_id, created_at DESC);
CREATE INDEX idx_incidents_assigned_to  ON incidents (assigned_to) WHERE assigned_to IS NOT NULL;

CREATE TRIGGER trg_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- Per-org incident number sequence (gapless enough, race-safe)
-- ---------------------------------------------------------------
CREATE TABLE org_counters (
    org_id       UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    incident_seq BIGINT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------
-- Immutable status audit trail: powers the timeline view and lets
-- you rebuild MTTR analytics from raw events later
-- ---------------------------------------------------------------
CREATE TABLE incident_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    from_status incident_status,
    to_status   incident_status NOT NULL,
    changed_by  UUID NOT NULL REFERENCES users(id),
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_history_incident ON incident_status_history (incident_id, created_at);

COMMIT;
