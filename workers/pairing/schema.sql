-- Additive migration from the PR62 code-only relay: keep relay_slots intact.
-- This service intentionally does NOT expose the retired code-relay endpoints.
-- Apply this schema to D1 before enabling the new Worker. Old relay rows can be
-- dropped after the old deployment is retired; never run both deployments.
CREATE TABLE IF NOT EXISTS phone_slots (
    slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 0 AND 9),
    session_id TEXT NOT NULL UNIQUE,
    phone_hash TEXT,
    tesla_hash TEXT NOT NULL,
    cookie_hash TEXT UNIQUE,
    state_hash TEXT UNIQUE,
    label TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','oauth','exchanging','confirm','active','denied','failed')),
    expires_at INTEGER NOT NULL,
    vault TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    refresh_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS phone_expiry ON phone_slots(expires_at);
