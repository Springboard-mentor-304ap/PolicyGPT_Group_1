export interface NotificationGroupMeta {
  key: string;
  label: string;
  description: string;
  icon: string;
  iconClass: string;
}

export interface RoleNotificationItemConfig {
  type: string;
  label: string;
  description: string;
  icon: string;
  iconClass: string;
  category: string;
}

export interface RoleNotificationCategoryConfig {
  key: string;
  label: string;
  description: string;
  icon: string;
  iconClass: string;
  types: string[];
}

export const NOTIFICATION_GROUP_TAXONOMY: Record<string, NotificationGroupMeta> = {
  // Public policy lifecycle
  new_policy: {
    key: "new_policy",
    label: "New Policy Alerts",
    description: "Receive notifications when new government policies are published.",
    icon: "description",
    iconClass: "icon--policy",
  },
  policy_updates: {
    key: "policy_updates",
    label: "Policy Updates",
    description: "Receive notifications when published policies are updated.",
    icon: "edit_document",
    iconClass: "icon--policy",
  },

  // Public scheme lifecycle
  new_scheme: {
    key: "new_scheme",
    label: "New Scheme Alerts",
    description: "Receive notifications when new government schemes are launched.",
    icon: "layers",
    iconClass: "icon--scheme",
  },
  scheme_updates: {
    key: "scheme_updates",
    label: "Scheme Updates",
    description: "Receive notifications when published schemes are updated.",
    icon: "update",
    iconClass: "icon--scheme",
  },

  // Deadlines & expiry
  deadline_reminders: {
    key: "deadline_reminders",
    label: "Scheme Deadline Alerts",
    description: "Receive reminders when relevant scheme deadlines are approaching.",
    icon: "event",
    iconClass: "icon--deadline",
  },
  scheme_ended: {
    key: "scheme_ended",
    label: "Scheme Ended Notices",
    description: "Receive notice when schemes have reached their final application deadline.",
    icon: "event_busy",
    iconClass: "icon--deadline",
  },

  // Government Official approval results
  policy_approval_results: {
    key: "policy_approval_results",
    label: "Policy Approval Results",
    description: "Notifications when your submitted policies are approved or rejected.",
    icon: "check_circle",
    iconClass: "icon--gov",
  },
  scheme_approval_results: {
    key: "scheme_approval_results",
    label: "Scheme Approval Results",
    description: "Notifications when your submitted schemes are approved or rejected.",
    icon: "task_alt",
    iconClass: "icon--gov",
  },
  request_approval_results: {
    key: "request_approval_results",
    label: "Archive & Delete Request Results",
    description: "Notifications when your archive or deletion requests are approved or rejected.",
    icon: "published_with_changes",
    iconClass: "icon--gov",
  },

  // Administrator workflow requests
  policy_requests: {
    key: "policy_requests",
    label: "Policy Requests",
    description: "Government Official submitted policies and policy approval requests.",
    icon: "rule",
    iconClass: "icon--policy",
  },
  scheme_requests: {
    key: "scheme_requests",
    label: "Scheme Requests",
    description: "Government Official submitted schemes and scheme approval requests.",
    icon: "fact_check",
    iconClass: "icon--scheme",
  },
  archive_requests: {
    key: "archive_requests",
    label: "Archive Requests",
    description: "Requests to archive published government policies or schemes.",
    icon: "archive",
    iconClass: "icon--gov",
  },
  delete_requests: {
    key: "delete_requests",
    label: "Delete Requests",
    description: "Requests to delete government policies or schemes from the repository.",
    icon: "delete",
    iconClass: "icon--system",
  },
  admin_action_updates: {
    key: "admin_action_updates",
    label: "Other Administrator Updates",
    description: "Decisions and workflow updates when another administrator acts on a request.",
    icon: "admin_panel_settings",
    iconClass: "icon--user",
  },
  user_administration: {
    key: "user_administration",
    label: "User Administration",
    description: "New user registrations, role modifications, and platform account status changes.",
    icon: "manage_accounts",
    iconClass: "icon--user",
  },

  // Applications
  application_updates: {
    key: "application_updates",
    label: "Application Updates",
    description: "Status changes and progression updates for scheme applications you have submitted.",
    icon: "assignment_turned_in",
    iconClass: "icon--app",
  },

  // Research / Regulatory
  research_reports: {
    key: "research_reports",
    label: "Research & Regulatory Updates",
    description: "Regulatory frameworks, analytical reports, and saved search intelligence alerts.",
    icon: "analytics",
    iconClass: "icon--reg",
  },

  // System
  system_alerts: {
    key: "system_alerts",
    label: "System Alerts",
    description: "Platform health notices, maintenance alerts, and delivery service monitoring.",
    icon: "notifications_active",
    iconClass: "icon--system",
  },

  // Support
  support_updates: {
    key: "support_updates",
    label: "Support & Feedback",
    description: "Citizen feedback, reported issues, ticket escalations, and resolution updates.",
    icon: "support_agent",
    iconClass: "icon--report",
  },

  // Backward compatibility aliases
  expiry: {
    key: "expiry",
    label: "Scheme Deadline Alerts",
    description: "Receive reminders before scheme deadlines and notice when programmes close.",
    icon: "event",
    iconClass: "icon--deadline",
  },
  approval_results: {
    key: "approval_results",
    label: "Approval Notifications",
    description: "Approval and rejection decisions made on your submitted policies and schemes.",
    icon: "check_circle",
    iconClass: "icon--gov",
  },
  request_updates: {
    key: "request_updates",
    label: "Workflow Requests",
    description: "New policy and scheme requests awaiting administrative review and action.",
    icon: "pending_actions",
    iconClass: "icon--feedback",
  },
};

/**
 * Centralized Role-Based Notification Configuration (Spec Section 5).
 * Maps authoritative backend notification type identifiers to presentation models for all 5 roles.
 */
export const ROLE_NOTIFICATION_CONFIG: Record<string, RoleNotificationCategoryConfig[]> = {
  ADMINISTRATOR: [
    {
      key: "policy_requests",
      label: "Policy Submissions",
      description: "New policy submissions and approval requests awaiting administrative review.",
      icon: "rule",
      iconClass: "icon--policy",
      types: ["POLICY_APPROVAL_REQUEST", "POLICY_PENDING_REQUEST", "POLICY_SUBMITTED"],
    },
    {
      key: "scheme_requests",
      label: "Scheme Submissions",
      description: "New scheme submissions and approval requests awaiting administrative review.",
      icon: "fact_check",
      iconClass: "icon--scheme",
      types: ["SCHEME_APPROVAL_REQUEST", "SCHEME_APPROVAL_REQUIRED", "SCHEME_PENDING_REQUEST", "SCHEME_SUBMITTED"],
    },
    {
      key: "policy_approval_results",
      label: "Policy Decisions",
      description: "Policy approvals and rejections issued on the platform, including resulting publications.",
      icon: "check_circle",
      iconClass: "icon--policy",
      types: ["POLICY_APPROVED", "POLICY_REJECTED"],
    },
    {
      key: "scheme_approval_results",
      label: "Scheme Decisions",
      description: "Scheme approvals and rejections issued on the platform, including resulting publications.",
      icon: "task_alt",
      iconClass: "icon--scheme",
      types: ["SCHEME_APPROVED", "SCHEME_REJECTED"],
    },
    {
      key: "request_approval_results",
      label: "Archive & Delete Decisions",
      description: "Decisions issued on policy and scheme archive or deletion requests.",
      icon: "published_with_changes",
      iconClass: "icon--gov",
      types: ["REQUEST_APPROVED", "REQUEST_REJECTED"],
    },
    {
      key: "new_policy",
      label: "Policy Publications",
      description: "Newly published policies and platform-wide policy announcements.",
      icon: "description",
      iconClass: "icon--policy",
      types: ["NEW_POLICY", "POLICY_PUBLISHED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates & Status Changes",
      description: "Updates, status changes, and revisions to published policies.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "new_scheme",
      label: "Scheme Publications",
      description: "Newly launched schemes and platform-wide scheme announcements.",
      icon: "layers",
      iconClass: "icon--scheme",
      types: ["NEW_SCHEME", "SCHEME_PUBLISHED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates & Status Changes",
      description: "Updates, status changes, and revisions to published schemes.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "archive_requests",
      label: "Archive Requests",
      description: "Requests to archive published policies or schemes.",
      icon: "archive",
      iconClass: "icon--gov",
      types: ["POLICY_ARCHIVE_REQUEST", "POLICY_ARCHIVE_REQUESTED", "SCHEME_ARCHIVE_REQUEST"],
    },
    {
      key: "delete_requests",
      label: "Delete Requests",
      description: "Requests to delete policies or schemes from the repository.",
      icon: "delete",
      iconClass: "icon--system",
      types: ["POLICY_DELETE_REQUEST", "SCHEME_DELETE_REQUEST"],
    },
    {
      key: "admin_action_updates",
      label: "Administrator Activity",
      description: "Actions taken by other administrators on requests and platform workflows.",
      icon: "admin_panel_settings",
      iconClass: "icon--user",
      types: ["ADMIN_ACTION_UPDATE", "ADMIN_REQUEST_UPDATED"],
    },
    {
      key: "user_administration",
      label: "User & Platform Management",
      description: "New user registrations, role changes, account status changes, and official activity.",
      icon: "manage_accounts",
      iconClass: "icon--user",
      types: ["NEW_USER", "USER_ROLE_CHANGE", "USER_STATUS_CHANGE"],
    },
    {
      key: "deadline_reminders",
      label: "Deadline Oversight",
      description: "Scheme deadline reminders across the platform, including approaching end dates.",
      icon: "event",
      iconClass: "icon--deadline",
      types: ["DEADLINE_REMINDER", "SCHEME_ENDING"],
    },
    {
      key: "scheme_ended",
      label: "Scheme Closures",
      description: "Notices when schemes reach their final application deadline.",
      icon: "event_busy",
      iconClass: "icon--deadline",
      types: ["SCHEME_ENDED"],
    },
    {
      key: "application_updates",
      label: "Application Activity",
      description: "Citizen and organization application submissions and status changes.",
      icon: "assignment_turned_in",
      iconClass: "icon--app",
      types: ["APPLICATION_UPDATE", "APPLICATION_SUBMITTED", "APPLICATION_APPROVED", "APPLICATION_REJECTED"],
    },
    {
      key: "support_updates",
      label: "Support & Grievances",
      description: "New feedback, grievances, support requests, escalations, and resolution updates.",
      icon: "support_agent",
      iconClass: "icon--report",
      types: [
        "NEW_FEEDBACK",
        "ISSUE_REPORTED",
        "FEEDBACK_ESCALATED",
        "FEEDBACK_RESOLVED",
        "CITIZEN_FEEDBACK",
        "FEEDBACK_UPDATE",
        "SUPPORT_UPDATE",
      ],
    },
    {
      key: "system_alerts",
      label: "System & Maintenance Alerts",
      description: "System alerts, platform maintenance notices, and operational events.",
      icon: "notifications_active",
      iconClass: "icon--system",
      types: [
        "SYSTEM_ALERT",
        "BACKGROUND_JOB_FAILURE",
        "API_FAILURE",
        "DATABASE_ALERT",
        "SECURITY_ALERT",
        "EMAIL_DELIVERY_FAILURE",
        "SMS_DELIVERY_FAILURE",
        "EMAIL_BOUNCE",
        "SMS_FAILURE",
        "NOTIFICATION_DELIVERY_FAILURE",
      ],
    },
  ],

  GOVERNMENT_OFFICIAL: [
    {
      key: "new_policy",
      label: "Department Policy Publications",
      description: "New policies published by your department, plus platform-wide policy announcements.",
      icon: "description",
      iconClass: "icon--policy",
      types: ["NEW_POLICY", "POLICY_PUBLISHED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates & Status Changes",
      description: "Updates, status changes, and revisions to policies you are authorized to manage.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "new_scheme",
      label: "Department Scheme Publications",
      description: "New schemes published by your department, plus platform-wide scheme announcements.",
      icon: "layers",
      iconClass: "icon--scheme",
      types: ["NEW_SCHEME", "SCHEME_PUBLISHED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates & Status Changes",
      description: "Updates, status changes, and revisions to schemes you are authorized to manage.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "policy_approval_results",
      label: "My Policy Submissions — Decisions",
      description: "Approval results, confirmations, and revision requests for policies you submitted.",
      icon: "check_circle",
      iconClass: "icon--gov",
      types: ["POLICY_APPROVED", "POLICY_REJECTED"],
    },
    {
      key: "scheme_approval_results",
      label: "My Scheme Submissions — Decisions",
      description: "Approval results, confirmations, and revision requests for schemes you submitted.",
      icon: "task_alt",
      iconClass: "icon--gov",
      types: ["SCHEME_APPROVED", "SCHEME_REJECTED"],
    },
    {
      key: "request_approval_results",
      label: "My Archive & Delete Requests",
      description: "Results of archive and deletion requests you submitted for policies or schemes.",
      icon: "published_with_changes",
      iconClass: "icon--gov",
      types: ["REQUEST_APPROVED", "REQUEST_REJECTED"],
    },
    {
      key: "deadline_reminders",
      label: "Approval & Deadline Reminders",
      description: "Pending-approval reminders and alerts for approaching scheme deadlines.",
      icon: "event",
      iconClass: "icon--deadline",
      types: ["DEADLINE_REMINDER", "SCHEME_ENDING"],
    },
    {
      key: "scheme_ended",
      label: "Scheme Ended Notices",
      description: "Notices when schemes you manage reach their final application deadline.",
      icon: "event_busy",
      iconClass: "icon--deadline",
      types: ["SCHEME_ENDED"],
    },
    {
      key: "admin_action_updates",
      label: "Administrator Messages",
      description: "Messages and workflow updates from administrators about your submissions.",
      icon: "admin_panel_settings",
      iconClass: "icon--user",
      types: ["ADMIN_ACTION_UPDATE", "ADMIN_REQUEST_UPDATED"],
    },
    {
      key: "support_updates",
      label: "Support Responses",
      description: "Responses to your support requests, feedback, and grievance inquiries.",
      icon: "support_agent",
      iconClass: "icon--report",
      types: [
        "NEW_FEEDBACK",
        "ISSUE_REPORTED",
        "FEEDBACK_ESCALATED",
        "FEEDBACK_RESOLVED",
        "CITIZEN_FEEDBACK",
        "FEEDBACK_UPDATE",
        "SUPPORT_UPDATE",
      ],
    },
    {
      key: "system_alerts",
      label: "System Alerts",
      description: "System alerts, department-level updates, and platform announcements.",
      icon: "notifications_active",
      iconClass: "icon--system",
      types: ["SYSTEM_ALERT", "GOVERNMENT_ANNOUNCEMENT", "DEPARTMENT_ALERT"],
    },
  ],

  CITIZEN: [
    {
      key: "new_policy",
      label: "New Policy Alerts",
      description: "Alerts when new government policies are published, including withdrawals or archival notices.",
      icon: "description",
      iconClass: "icon--policy",
      types: ["NEW_POLICY", "POLICY_PUBLISHED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates",
      description: "Updates to published policies, including changes to policies you have saved.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "new_scheme",
      label: "New Scheme Alerts",
      description: "Alerts when new government schemes are published, including eligibility and benefit highlights.",
      icon: "layers",
      iconClass: "icon--scheme",
      types: ["NEW_SCHEME", "SCHEME_PUBLISHED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates",
      description: "Scheme updates, eligibility or benefit changes for schemes relevant to you.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "deadline_reminders",
      label: "Scheme Deadline Alerts",
      description: "Reminders for approaching application deadlines and closing schemes.",
      icon: "event",
      iconClass: "icon--deadline",
      types: ["DEADLINE_REMINDER", "SCHEME_ENDING"],
    },
    {
      key: "scheme_ended",
      label: "Scheme Ended Notices",
      description: "Notices when schemes close for applications or reach their end date.",
      icon: "event_busy",
      iconClass: "icon--deadline",
      types: ["SCHEME_ENDED"],
    },
    {
      key: "application_updates",
      label: "My Applications",
      description: "Submission confirmations, status updates, approvals, rejections, document requests, and deadline reminders for your applications. Delivered only to you.",
      icon: "assignment_turned_in",
      iconClass: "icon--app",
      types: ["APPLICATION_UPDATE", "APPLICATION_SUBMITTED", "APPLICATION_APPROVED", "APPLICATION_REJECTED"],
    },
    {
      key: "support_updates",
      label: "Feedback & Grievance Updates",
      description: "Confirmations and status updates for your feedback, grievances, support requests, and issue resolutions.",
      icon: "support_agent",
      iconClass: "icon--report",
      types: [
        "NEW_FEEDBACK",
        "ISSUE_REPORTED",
        "FEEDBACK_ESCALATED",
        "FEEDBACK_RESOLVED",
        "CITIZEN_FEEDBACK",
        "FEEDBACK_UPDATE",
        "SUPPORT_UPDATE",
      ],
    },
    {
      key: "system_alerts",
      label: "Announcements & System Alerts",
      description: "Public announcements, important platform notices, and system alerts.",
      icon: "campaign",
      iconClass: "icon--system",
      types: ["SYSTEM_ALERT", "GOVERNMENT_ANNOUNCEMENT", "DEPARTMENT_ALERT"],
    },
  ],

  RESEARCHER: [
    {
      key: "new_policy",
      label: "New Policy Publications",
      description: "New policy publications, category or department updates, and policy intelligence for your research.",
      icon: "science",
      iconClass: "icon--policy",
      types: ["NEW_POLICY", "POLICY_PUBLISHED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates & Revisions",
      description: "Policy updates, amendments, revisions, withdrawals, and archival notices.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "new_scheme",
      label: "New Scheme Publications",
      description: "New scheme publications and scheme intelligence supporting your research.",
      icon: "layers",
      iconClass: "icon--scheme",
      types: ["NEW_SCHEME", "SCHEME_PUBLISHED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates & Benefit Changes",
      description: "Scheme updates, benefit changes, eligibility changes, and end-date updates.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "deadline_reminders",
      label: "Scheme Deadline Alerts",
      description: "Reminders for approaching scheme deadlines and end dates relevant to your work.",
      icon: "event",
      iconClass: "icon--deadline",
      types: ["DEADLINE_REMINDER", "SCHEME_ENDING"],
    },
    {
      key: "scheme_ended",
      label: "Scheme Ended Notices",
      description: "Notices when schemes close or reach their end date.",
      icon: "event_busy",
      iconClass: "icon--deadline",
      types: ["SCHEME_ENDED"],
    },
    {
      key: "research_reports",
      label: "Research Reports & Regulatory Intelligence",
      description: "Regulatory frameworks, analytical reports, saved-item updates, and completed report exports.",
      icon: "analytics",
      iconClass: "icon--reg",
      types: ["REGULATORY_UPDATE", "RESEARCH_REPORT", "REPORT_COMPLETED", "SAVED_SEARCH_ALERT"],
    },
    {
      key: "support_updates",
      label: "Feedback & Support Responses",
      description: "Responses to your feedback and support requests, plus system announcements.",
      icon: "support_agent",
      iconClass: "icon--report",
      types: [
        "NEW_FEEDBACK",
        "ISSUE_REPORTED",
        "FEEDBACK_ESCALATED",
        "FEEDBACK_RESOLVED",
        "CITIZEN_FEEDBACK",
        "FEEDBACK_UPDATE",
        "SUPPORT_UPDATE",
      ],
    },
    {
      key: "system_alerts",
      label: "System Announcements",
      description: "System announcements and platform notices relevant to researchers.",
      icon: "campaign",
      iconClass: "icon--system",
      types: ["SYSTEM_ALERT", "GOVERNMENT_ANNOUNCEMENT", "DEPARTMENT_ALERT"],
    },
  ],

  ORGANIZATION: [
    {
      key: "new_policy",
      label: "New Relevant Policies",
      description: "Alerts when new government policies relevant to your organization are published.",
      icon: "description",
      iconClass: "icon--policy",
      types: ["NEW_POLICY", "POLICY_PUBLISHED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates",
      description: "Updates and amendments to policies relevant to your organization, including saved policies.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "new_scheme",
      label: "New Relevant Schemes",
      description: "Alerts when new government schemes relevant to your organization are launched.",
      icon: "business",
      iconClass: "icon--scheme",
      types: ["NEW_SCHEME", "SCHEME_PUBLISHED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates",
      description: "Scheme updates and eligibility or benefit changes for schemes relevant to you.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "deadline_reminders",
      label: "Scheme Deadline Reminders",
      description: "Reminders for approaching scheme application deadlines.",
      icon: "event",
      iconClass: "icon--deadline",
      types: ["DEADLINE_REMINDER", "SCHEME_ENDING"],
    },
    {
      key: "scheme_ended",
      label: "Scheme Ended Notices",
      description: "Notices when schemes close for applications or reach their end date.",
      icon: "event_busy",
      iconClass: "icon--deadline",
      types: ["SCHEME_ENDED"],
    },
    {
      key: "application_updates",
      label: "Application Status",
      description: "Status changes for applications associated with your organization, plus saved-item updates.",
      icon: "assignment_turned_in",
      iconClass: "icon--app",
      types: ["APPLICATION_UPDATE", "APPLICATION_SUBMITTED", "APPLICATION_APPROVED", "APPLICATION_REJECTED"],
    },
    {
      key: "support_updates",
      label: "Support & Feedback Updates",
      description: "Responses to your support requests, feedback, grievance updates, and account notices.",
      icon: "support_agent",
      iconClass: "icon--report",
      types: [
        "NEW_FEEDBACK",
        "ISSUE_REPORTED",
        "FEEDBACK_ESCALATED",
        "FEEDBACK_RESOLVED",
        "CITIZEN_FEEDBACK",
        "FEEDBACK_UPDATE",
        "SUPPORT_UPDATE",
      ],
    },
    {
      key: "system_alerts",
      label: "System Announcements",
      description: "System announcements and platform notices for your organization.",
      icon: "campaign",
      iconClass: "icon--system",
      types: ["SYSTEM_ALERT", "GOVERNMENT_ANNOUNCEMENT", "DEPARTMENT_ALERT"],
    },
  ],
};

// Aliases for matching roles
ROLE_NOTIFICATION_CONFIG["ADMIN"] = ROLE_NOTIFICATION_CONFIG["ADMINISTRATOR"];
ROLE_NOTIFICATION_CONFIG["GOVERNMENT"] = ROLE_NOTIFICATION_CONFIG["GOVERNMENT_OFFICIAL"];
ROLE_NOTIFICATION_CONFIG["GOVT"] = ROLE_NOTIFICATION_CONFIG["GOVERNMENT_OFFICIAL"];
ROLE_NOTIFICATION_CONFIG["ORGANISATION"] = ROLE_NOTIFICATION_CONFIG["ORGANIZATION"];

/**
 * Fallback metadata generator if an unrecognized group key is returned.
 */
export function getNotificationGroupMeta(
  groupKey: string,
  fallbackLabel?: string,
  fallbackDesc?: string,
): NotificationGroupMeta {
  const normalizedKey = (groupKey || "").trim().toLowerCase();
  if (NOTIFICATION_GROUP_TAXONOMY[normalizedKey]) {
    return NOTIFICATION_GROUP_TAXONOMY[normalizedKey];
  }

  // Derive human-readable title from snake_case key
  const title =
    fallbackLabel ||
    groupKey
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return {
    key: normalizedKey,
    label: title,
    description: fallbackDesc || "Notifications related to this category.",
    icon: "notifications",
    iconClass: "icon--gov",
  };
}

/**
 * Format a raw notification type enum (e.g. `POLICY_APPROVAL_REQUEST`) into a friendly label.
 */
export function formatNotificationTypeLabel(rawType: string): string {
  if (!rawType) return "Alert";
  return rawType
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
