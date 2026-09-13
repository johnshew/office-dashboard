CREATE TABLE IF NOT EXISTS relay_slots (
    slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 0 AND 9),
    session_id TEXT NOT NULL UNIQUE CHECK (length(session_id) = 64),
    phone_hash TEXT NOT NULL CHECK (length(phone_hash) = 64),
    tesla_hash TEXT NOT NULL CHECK (length(tesla_hash) = 64),
    challenge TEXT NOT NULL CHECK (length(challenge) = 43),
    state TEXT NOT NULL CHECK (length(state) = 43),
    expires_at INTEGER NOT NULL,
    code TEXT CHECK (code IS NULL OR length(code) BETWEEN 1 AND 4096)
);