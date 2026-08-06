-- 003_create_postmortems.sql
-- One postmortem per incident. The generator pre-fills content from
-- incident data; engineers then edit and publish it.

BEGIN;

CREATE TYPE postmortem_status AS ENUM ('draft', 'published');

CREATE TABLE postmortems (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    status       postmortem_status NOT NULL DEFAULT 'draft',
    content_md   TEXT NOT NULL,
    created_by   UUID NOT NULL REFERENCES users(id),
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT postmortems_one_per_incident UNIQUE (incident_id),
    CONSTRAINT postmortems_published_consistency CHECK (
        (status = 'published') = (published_at IS NOT NULL)
    )
);

CREATE INDEX idx_postmortems_org ON postmortems (org_id, created_at DESC);

CREATE TRIGGER trg_postmortems_updated_at
    BEFORE UPDATE ON postmortems
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
