-- ============================================================
-- SECURE OPERATIONAL SIGNAL DISSEMINATION PLATFORM
-- Database Schema — PostgreSQL
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name       VARCHAR(150) NOT NULL,
    rank            VARCHAR(100) NOT NULL,
    unit            VARCHAR(150) NOT NULL,
    phone           VARCHAR(20) UNIQUE NOT NULL,
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(50) NOT NULL CHECK (role IN (
                        'super_admin',
                        'state_command_admin',
                        'area_command_admin',
                        'division_officer'
                    )),
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. DEVICES
-- Each user is bound to one approved device
-- ============================================================
CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id       VARCHAR(255) UNIQUE NOT NULL,   -- hardware/OS identifier
    device_model    VARCHAR(100),
    os_version      VARCHAR(50),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
    last_login      TIMESTAMPTZ,
    last_ip         VARCHAR(45),                     -- supports IPv6
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 3. SYSTEM SETTINGS
-- Admin-configurable platform options
-- ============================================================
CREATE TABLE settings (
    key             VARCHAR(100) PRIMARY KEY,
    value           TEXT NOT NULL,
    description     TEXT,
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default settings
INSERT INTO settings (key, value, description) VALUES
    ('sms_fallback_mode', 'manual', 'How SMS fallback triggers for emergency signals: auto or manual'),
    ('session_duration_minutes', '60', 'How long a JWT session lasts before officer must re-login'),
    ('max_failed_logins', '5', 'Max failed login attempts before account is locked');


-- ============================================================
-- 4. SIGNALS
-- Core operational messages
-- ============================================================
CREATE TABLE signals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_number       VARCHAR(50) UNIQUE NOT NULL,   -- human-readable reference e.g. SIG-2024-001
    title               TEXT NOT NULL,
    content_type        VARCHAR(20) NOT NULL CHECK (content_type IN ('text', 'pdf', 'image', 'audio')),
    content_encrypted   BYTEA,                          -- AES-encrypted text content
    file_path           TEXT,                           -- path for PDF/image/audio files
    classification      VARCHAR(20) NOT NULL CHECK (classification IN ('routine', 'confidential', 'secret', 'emergency')),
    sender_id           UUID NOT NULL REFERENCES users(id),
    expiry_time         TIMESTAMPTZ,                    -- NULL means no expiry
    is_expired          BOOLEAN NOT NULL DEFAULT FALSE,
    forwarding_allowed  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 5. SIGNAL RECIPIENTS
-- Who is this signal distributed to
-- ============================================================
CREATE TABLE signal_recipients (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id   UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (signal_id, user_id)
);


-- ============================================================
-- 6. SIGNAL RECEIPTS
-- Tracks delivery, open, and acknowledgment per recipient
-- ============================================================
CREATE TABLE signal_receipts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id           UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id),
    device_id           UUID REFERENCES devices(id),
    delivered_at        TIMESTAMPTZ,
    viewed_at           TIMESTAMPTZ,
    acknowledged_at     TIMESTAMPTZ,
    delivery_method     VARCHAR(20) CHECK (delivery_method IN ('push', 'sms', 'offline_pending')),
    UNIQUE (signal_id, user_id)
);


-- ============================================================
-- 7. WATERMARK LOGS
-- Records each unique QR/barcode watermark generated per signal per user
-- Used for leak tracing
-- ============================================================
CREATE TABLE watermark_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id       UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    watermark_code  VARCHAR(255) NOT NULL UNIQUE,   -- unique code encoded into QR
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 8. SCREENSHOT LOGS
-- Recorded when screenshot attempt is detected
-- ============================================================
CREATE TABLE screenshot_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    signal_id   UUID REFERENCES signals(id),
    device_id   UUID REFERENCES devices(id),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address  VARCHAR(45)
);


-- ============================================================
-- 9. AUDIT LOGS
-- Every sensitive action is recorded here
-- ============================================================
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id),
    action      VARCHAR(100) NOT NULL,   -- e.g. LOGIN, SIGNAL_VIEWED, DEVICE_APPROVED
    entity_type VARCHAR(50),             -- e.g. signal, device, user
    entity_id   UUID,                    -- ID of the affected record
    ip_address  VARCHAR(45),
    metadata    JSONB,                   -- any extra context
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- INDEXES — for query performance
-- ============================================================
CREATE INDEX idx_devices_user_id         ON devices(user_id);
CREATE INDEX idx_signals_sender_id       ON signals(sender_id);
CREATE INDEX idx_signals_classification  ON signals(classification);
CREATE INDEX idx_signal_recipients_signal ON signal_recipients(signal_id);
CREATE INDEX idx_signal_receipts_signal  ON signal_receipts(signal_id);
CREATE INDEX idx_signal_receipts_user    ON signal_receipts(user_id);
CREATE INDEX idx_watermark_logs_signal   ON watermark_logs(signal_id);
CREATE INDEX idx_audit_logs_user_id      ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action       ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at   ON audit_logs(created_at);
