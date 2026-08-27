-- PolicyGPT - Milestone 1 Sample Data
-- PostgreSQL

-- ============================================
-- USERS
-- ============================================

INSERT INTO users
(full_name, email, password_hash, role, phone, state, organization)
VALUES
(
    'Admin User',
    'admin@policygpt.local',
    '$2b$12$exampleadminhash',
    'ADMIN',
    '9000000001',
    'Andhra Pradesh',
    'PolicyGPT'
),
(
    'Government Official',
    'official@policygpt.local',
    '$2b$12$exampleofficialhash',
    'GOVERNMENT_OFFICIAL',
    '9000000002',
    'Andhra Pradesh',
    'Government Department'
),
(
    'Test Citizen',
    'citizen@policygpt.local',
    '$2b$12$examplecitizenhash',
    'CITIZEN',
    '9000000003',
    'Andhra Pradesh',
    NULL
);


-- ============================================
-- POLICIES
-- ============================================

INSERT INTO policies
(title, description, category, ministry, department, state,
 sector, publication_date, effective_date, status,
 document_url, source_url, created_by, approved_by)
VALUES
(
    'National Education Support Policy',
    'Policy supporting education, students, schools, colleges, and skill development.',
    'Education',
    'Ministry of Education',
    'Department of School Education and Literacy',
    'All India',
    'Education',
    '2025-01-15',
    '2025-04-01',
    'ACTIVE',
    NULL,
    'https://www.education.gov.in/',
    2,
    2
),
(
    'National Public Health Policy',
    'Policy focused on improving public healthcare services and health outcomes.',
    'Healthcare',
    'Ministry of Health and Family Welfare',
    'Department of Health and Family Welfare',
    'All India',
    'Healthcare',
    '2025-02-10',
    '2025-04-01',
    'ACTIVE',
    NULL,
    'https://www.mohfw.gov.in/',
    2,
    2
),
(
    'National Employment and Skill Development Policy',
    'Policy supporting employment, workforce development, and skill training.',
    'Employment',
    'Ministry of Skill Development and Entrepreneurship',
    'Department of Skill Development',
    'All India',
    'Employment',
    '2025-03-05',
    '2025-04-01',
    'ACTIVE',
    NULL,
    'https://www.msde.gov.in/',
    2,
    2
);


-- ============================================
-- SCHEMES
-- ============================================

INSERT INTO schemes
(name, description, category, ministry, department, state,
 benefits, documents_required, application_process,
 application_url, source_url, status, created_by)
VALUES
(
    'Student Education Support Scheme',
    'Scheme providing financial and educational support to eligible students.',
    'Education',
    'Ministry of Education',
    'Department of Higher Education',
    'All India',
    'Financial assistance for eligible students.',
    'Aadhaar Card, Income Certificate, Educational Certificate',
    'Apply online through the official scheme portal and submit required documents.',
    'https://www.education.gov.in/',
    'https://www.education.gov.in/',
    'ACTIVE',
    2
),
(
    'Public Healthcare Assistance Scheme',
    'Scheme providing healthcare assistance to eligible citizens.',
    'Healthcare',
    'Ministry of Health and Family Welfare',
    'Department of Health and Family Welfare',
    'All India',
    'Healthcare and medical assistance.',
    'Aadhaar Card, Income Certificate',
    'Register through the official healthcare portal and submit the required documents.',
    'https://www.mohfw.gov.in/',
    'https://www.mohfw.gov.in/',
    'ACTIVE',
    2
),
(
    'Youth Employment and Skill Scheme',
    'Scheme supporting youth employment, training, and skill development.',
    'Employment',
    'Ministry of Skill Development and Entrepreneurship',
    'Department of Skill Development',
    'All India',
    'Skill training and employment support.',
    'Aadhaar Card, Educational Certificate',
    'Register online and select an eligible training or employment program.',
    'https://www.msde.gov.in/',
    'https://www.msde.gov.in/',
    'ACTIVE',
    2
);


-- ============================================
-- ELIGIBILITY RULES
-- ============================================

INSERT INTO eligibility_rules
(scheme_id, min_age, max_age, gender, max_income,
 occupation, education, state, social_category, disability_status)
VALUES
(
    1,
    16,
    30,
    'ANY',
    500000.00,
    'Student',
    'Undergraduate',
    'All India',
    'ANY',
    FALSE
),
(
    2,
    18,
    70,
    'ANY',
    600000.00,
    'ANY',
    'ANY',
    'All India',
    'ANY',
    FALSE
),
(
    3,
    18,
    35,
    'ANY',
    500000.00,
    'Job Seeker',
    'ANY',
    'All India',
    'ANY',
    FALSE
);


-- ============================================
-- NOTIFICATIONS
-- ============================================

INSERT INTO notifications
(user_id, title, message, notification_type, related_scheme_id)
VALUES
(
    3,
    'Scheme Available',
    'The Student Education Support Scheme is available for eligible citizens.',
    'SCHEME_UPDATE',
    1
);


-- ============================================
-- FEEDBACK
-- ============================================

INSERT INTO feedback
(user_id, scheme_id, feedback_type, subject, message, status)
VALUES
(
    3,
    1,
    'SCHEME',
    'Platform Feedback',
    'The policy and scheme search features are easy to understand.',
    'OPEN'
);


-- ============================================
-- REPORTS
-- ============================================

INSERT INTO reports
(generated_by, report_type, report_format, parameters, file_path)
VALUES
(
    1,
    'Scheme Usage Report',
    'PDF',
    '{"category": "Education", "state": "Andhra Pradesh"}',
    NULL
);


-- ============================================
-- AUDIT LOGS
-- ============================================

INSERT INTO audit_logs
(user_id, action, entity_type, entity_id, description, ip_address)
VALUES
(
    2,
    'CREATE',
    'POLICY',
    1,
    'Created National Education Support Policy',
    '127.0.0.1'
);


-- ============================================
-- SEARCH HISTORY
-- ============================================

INSERT INTO search_history
(user_id, search_query, search_type, filters)
VALUES
(
    3,
    'education schemes',
    'SCHEME',
    '{"state": "Andhra Pradesh", "category": "Education"}'
);
