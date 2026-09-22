-- PostgreSQL Reference Schema for DigOut
-- Automatically managed by Hibernate (ddl-auto: update), provided here for reference.

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    canonical_email VARCHAR(255) NOT NULL UNIQUE,
    google_id VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'USER',
    age INTEGER,
    gender VARCHAR(50),
    height_cm DOUBLE PRECISION,
    weight_kg DOUBLE PRECISION,
    activity_level VARCHAR(50),
    calorie_goal VARCHAR(50),
    medical_conditions TEXT,
    profile_completed BOOLEAN DEFAULT FALSE,
    strictness_level VARCHAR(50) DEFAULT 'STANDARD',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scan_history (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    product_name VARCHAR(255),
    raw_ocr_text TEXT,
    who_assessment_json JSONB,
    health_status VARCHAR(20),
    scanned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_scanned_at ON scan_history(user_id, scanned_at DESC);

CREATE TABLE IF NOT EXISTS cached_analysis (
    id BIGSERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    country_code VARCHAR(32) NOT NULL DEFAULT 'world',
    analysis_result_json TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_product_country UNIQUE (product_name, country_code)
);

CREATE INDEX IF NOT EXISTS idx_product_country ON cached_analysis(product_name, country_code);
