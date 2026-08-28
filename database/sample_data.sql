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
   





-- ============================================
-- ADDITIONAL SAMPLE DATA FOR FULL POLICYGPT DATABASE
-- ============================================

-- ROLES
INSERT INTO roles (role_name, description)
VALUES
('ADMIN', 'System administrator with full access'),
('CITIZEN', 'Citizen using the PolicyGPT platform'),
('GOVERNMENT_OFFICIAL', 'Government official managing policies and schemes');

-- USER PROFILES
INSERT INTO user_profiles
(user_id, age, gender, income, occupation, education, state, district, social_category, disability_status)
VALUES
(1, 30, 'Male', 750000.00, 'Government Officer', 'Postgraduate', 'Andhra Pradesh', 'Amaravati', 'General', FALSE),
(2, 28, 'Female', 650000.00, 'Policy Analyst', 'Postgraduate', 'Telangana', 'Hyderabad', 'General', FALSE),
(3, 21, 'Female', 300000.00, 'Student', 'Undergraduate', 'Andhra Pradesh', 'Kadapa', 'General', FALSE);

-- POLICY CATEGORIES
INSERT INTO policy_categories (category_name, description)
VALUES
('Education', 'Policies related to education and student welfare'),
('Healthcare', 'Policies related to public healthcare'),
('Employment', 'Policies related to employment and skill development');

-- SCHEME CATEGORIES
INSERT INTO scheme_categories (category_name, description)
VALUES
('Education', 'Education support and scholarship schemes'),
('Healthcare', 'Healthcare assistance schemes'),
('Employment', 'Employment and skill development schemes');

-- POLICY DOCUMENTS
INSERT INTO policy_documents
(policy_id, document_name, document_type, document_url, uploaded_by)
VALUES
(1, 'National Education Support Policy Guidelines', 'PDF', 'https://example.gov.in/policies/education-guidelines.pdf', 1),
(2, 'Public Healthcare Policy Guidelines', 'PDF', 'https://example.gov.in/policies/healthcare-guidelines.pdf', 1),
(3, 'Employment Policy Guidelines', 'PDF', 'https://example.gov.in/policies/employment-guidelines.pdf', 2);

-- SCHEME DOCUMENTS
INSERT INTO scheme_documents
(scheme_id, document_name, document_type, document_url, uploaded_by)
VALUES
(1, 'Student Education Support Scheme Guidelines', 'PDF', 'https://example.gov.in/schemes/student-support.pdf', 1),
(2, 'Healthcare Assistance Scheme Guidelines', 'PDF', 'https://example.gov.in/schemes/healthcare-assistance.pdf', 1),
(3, 'Youth Employment Scheme Guidelines', 'PDF', 'https://example.gov.in/schemes/youth-employment.pdf', 2);

-- SCHEME APPLICATIONS
INSERT INTO scheme_applications
(user_id, scheme_id, application_status, reference_number, remarks)
VALUES
(3, 1, 'SUBMITTED', 'APP-2026-001', 'Application submitted successfully');

-- SAVED POLICIES
INSERT INTO saved_policies (user_id, policy_id)
VALUES
(3, 1);

-- SAVED SCHEMES
INSERT INTO saved_schemes (user_id, scheme_id)
VALUES
(3, 1);

-- NOTIFICATION PREFERENCES
INSERT INTO notification_preferences
(user_id, email_enabled, sms_enabled, in_app_enabled, policy_alerts, scheme_updates, deadline_reminders)
VALUES
(3, TRUE, FALSE, TRUE, TRUE, TRUE, TRUE);

-- SUPPORT QUERIES
INSERT INTO support_queries
(user_id, subject, description, priority, status, assigned_to)
VALUES
(3,
'Unable to understand scheme eligibility',
'I need help understanding whether I am eligible for the Student Education Support Scheme.',
'MEDIUM',
'OPEN',
1);
