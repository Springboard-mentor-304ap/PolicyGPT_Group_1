-- PolicyGPT - Milestone 1 PostgreSQL Database Schema
-- Required tables: 9
-- Database: policygpt_db

-- ============================================
-- 1. USERS
-- ============================================

CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL,
    phone VARCHAR(20),
    state VARCHAR(100),
    organization VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 2. POLICIES
-- ============================================

CREATE TABLE policies (
    policy_id BIGSERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    ministry VARCHAR(200),
    department VARCHAR(200),
    state VARCHAR(100),
    sector VARCHAR(100),
    publication_date DATE,
    effective_date DATE,
    status VARCHAR(30) NOT NULL,
    document_url TEXT,
    source_url TEXT,
    created_by BIGINT REFERENCES users(user_id),
    approved_by BIGINT REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 3. SCHEMES
-- ============================================

CREATE TABLE schemes (
    scheme_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    ministry VARCHAR(200),
    department VARCHAR(200),
    state VARCHAR(100),
    benefits TEXT,
    documents_required TEXT,
    application_process TEXT,
    application_url TEXT,
    source_url TEXT,
    status VARCHAR(30) NOT NULL,
    created_by BIGINT REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 4. ELIGIBILITY RULES
-- ============================================

CREATE TABLE eligibility_rules (
    rule_id BIGSERIAL PRIMARY KEY,
    scheme_id BIGINT NOT NULL REFERENCES schemes(scheme_id),
    min_age INTEGER,
    max_age INTEGER,
    gender VARCHAR(30),
    max_income NUMERIC(12,2),
    occupation VARCHAR(150),
    education VARCHAR(150),
    state VARCHAR(100),
    social_category VARCHAR(100),
    disability_status BOOLEAN,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 5. NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
    notification_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    related_policy_id BIGINT REFERENCES policies(policy_id),
    related_scheme_id BIGINT REFERENCES schemes(scheme_id),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 6. FEEDBACK
-- ============================================

CREATE TABLE feedback (
    feedback_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    policy_id BIGINT REFERENCES policies(policy_id),
    scheme_id BIGINT REFERENCES schemes(scheme_id),
    feedback_type VARCHAR(50) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    admin_response TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 7. REPORTS
-- ============================================

CREATE TABLE reports (
    report_id BIGSERIAL PRIMARY KEY,
    generated_by BIGINT NOT NULL REFERENCES users(user_id),
    report_type VARCHAR(100) NOT NULL,
    report_format VARCHAR(20) NOT NULL,
    parameters JSONB,
    file_path TEXT,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 8. AUDIT LOGS
-- ============================================

CREATE TABLE audit_logs (
    audit_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(user_id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id BIGINT,
    description TEXT,
    ip_address INET,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 9. SEARCH HISTORY
-- ============================================

CREATE TABLE search_history (
    history_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    search_query TEXT NOT NULL,
    search_type VARCHAR(30) NOT NULL,
    filters JSONB,
    searched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
