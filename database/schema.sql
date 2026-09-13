-- PolicyGPT - Milestone 1 PostgreSQL Database Schema
-- Required tables: 20
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
    phone VARCHAR(20) UNIQUE,
    date_of_birth DATE,
    state VARCHAR(100),
    district VARCHAR(100),
    occupation VARCHAR(150),
    organization VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    token_version INTEGER NOT NULL DEFAULT 0
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
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    document_url TEXT,
    source_url TEXT,
    benefits TEXT[],
    eligibility_rules JSONB,
    created_by BIGINT REFERENCES users(user_id),
    approved_by BIGINT REFERENCES users(user_id),
    rejection_reason TEXT,
    archive_reason TEXT,
    archive_requested_by BIGINT REFERENCES users(user_id),
    archive_requested_at TIMESTAMP,
    delete_reason TEXT,
    delete_requested_by BIGINT REFERENCES users(user_id),
    delete_requested_at TIMESTAMP,
    delete_requested_from_status VARCHAR(30),
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
    benefits TEXT[],
    documents_required TEXT,
    application_process TEXT,
    application_url TEXT,
    source_url TEXT,
    status VARCHAR(30) NOT NULL,
    eligibility_rules JSONB,
    created_by BIGINT REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- 4. ELIGIBILITY RULES
-- ============================================

CREATE TABLE eligibility_rules (
    rule_id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT
        REFERENCES policies(policy_id)
        ON DELETE CASCADE,
    scheme_id BIGINT
        REFERENCES schemes(scheme_id)
        ON DELETE CASCADE,
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
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_policy_or_scheme
        CHECK (
            (policy_id IS NOT NULL AND scheme_id IS NULL)
            OR
            (policy_id IS NULL AND scheme_id IS NOT NULL)
        ),
    CONSTRAINT chk_age_range
        CHECK (
            min_age IS NULL
            OR max_age IS NULL
            OR min_age <= max_age
        ),
    CONSTRAINT chk_min_age
        CHECK (
            min_age IS NULL OR min_age >= 0
        ),
    CONSTRAINT chk_max_age
        CHECK (
            max_age IS NULL OR max_age >= 0
        ),
    CONSTRAINT chk_max_income
        CHECK (
            max_income IS NULL OR max_income >= 0
        )
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
-- PolicyGPT - Additional Database Tables
-- PostgreSQL

-- ============================================
-- ROLES
-- ============================================

CREATE TABLE roles (
    role_id BIGSERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- USER PROFILES
-- ============================================

CREATE TABLE user_profiles (
    profile_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    age INTEGER,
    gender VARCHAR(30),
    income NUMERIC(12,2),
    occupation VARCHAR(150),
    education VARCHAR(150),
    state VARCHAR(100),
    district VARCHAR(100),
    social_category VARCHAR(100),
    disability_status BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- POLICY CATEGORIES
-- ============================================

CREATE TABLE policy_categories (
    category_id BIGSERIAL PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SCHEME CATEGORIES
-- ============================================

CREATE TABLE scheme_categories (
    category_id BIGSERIAL PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- POLICY DOCUMENTS
-- ============================================

CREATE TABLE policy_documents (
    document_id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES policies(policy_id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(50),
    document_url TEXT,
    uploaded_by BIGINT REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SCHEME DOCUMENTS
-- ============================================

CREATE TABLE scheme_documents (
    document_id BIGSERIAL PRIMARY KEY,
    scheme_id BIGINT NOT NULL REFERENCES schemes(scheme_id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(50),
    document_url TEXT,
    uploaded_by BIGINT REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SCHEME APPLICATIONS
-- ============================================

CREATE TABLE scheme_applications (
    application_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    scheme_id BIGINT NOT NULL REFERENCES schemes(scheme_id),
    application_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    application_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reference_number VARCHAR(100) UNIQUE,
    remarks TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SAVED POLICIES
-- ============================================

CREATE TABLE saved_policies (
    saved_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    policy_id BIGINT NOT NULL REFERENCES policies(policy_id) ON DELETE CASCADE,
    saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, policy_id)
);

-- ============================================
-- SAVED SCHEMES
-- ============================================

CREATE TABLE saved_schemes (
    saved_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    scheme_id BIGINT NOT NULL REFERENCES schemes(scheme_id) ON DELETE CASCADE,
    saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, scheme_id)
);

-- ============================================
-- NOTIFICATION PREFERENCES
-- ============================================

CREATE TABLE notification_preferences (
    preference_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    policy_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    scheme_updates BOOLEAN NOT NULL DEFAULT TRUE,
    deadline_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SUPPORT QUERIES
-- ============================================

CREATE TABLE support_queries (
    query_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(30) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    assigned_to BIGINT REFERENCES users(user_id),
    response TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);
