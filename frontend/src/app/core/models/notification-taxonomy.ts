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
      label: "Policy Requests",
      description: "Submissions and approval requests for government policies.",
      icon: "rule",
      iconClass: "icon--policy",
      types: ["POLICY_APPROVAL_REQUEST", "POLICY_PENDING_REQUEST", "POLICY_SUBMITTED"],
    },
    {
      key: "scheme_requests",
      label: "Scheme Requests",
      description: "Submissions and approval requests for government schemes.",
      icon: "fact_check",
      iconClass: "icon--scheme",
      types: ["SCHEME_APPROVAL_REQUEST", "SCHEME_APPROVAL_REQUIRED", "SCHEME_PENDING_REQUEST", "SCHEME_SUBMITTED"],
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
      label: "Other Administrator Updates",
      description: "Workflow updates when another administrator reviews, approves, or rejects requests.",
      icon: "admin_panel_settings",
      iconClass: "icon--user",
      types: ["ADMIN_ACTION_UPDATE", "ADMIN_REQUEST_UPDATED"],
    },
    {
      key: "user_administration",
      label: "User Administration",
      description: "New user registrations, role changes, and account status updates.",
      icon: "manage_accounts",
      iconClass: "icon--user",
      types: ["NEW_USER", "USER_ROLE_CHANGE", "USER_STATUS_CHANGE"],
    },
    {
      key: "system_alerts",
      label: "System Alerts",
      description: "Platform health events, maintenance notices, and delivery service monitoring.",
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
    {
      key: "support_updates",
      label: "Support & Feedback",
      description: "Feedback reports, user inquiries, ticket escalations, and resolution updates.",
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
  ],

  GOVERNMENT_OFFICIAL: [
    {
      key: "policy_approval_results",
      label: "Policy Approval Results",
      description: "Notifications when your submitted policies are approved or rejected.",
      icon: "check_circle",
      iconClass: "icon--gov",
      types: ["POLICY_APPROVED", "POLICY_REJECTED"],
    },
    {
      key: "scheme_approval_results",
      label: "Scheme Approval Results",
      description: "Notifications when your submitted schemes are approved or rejected.",
      icon: "task_alt",
      iconClass: "icon--gov",
      types: ["SCHEME_APPROVED", "SCHEME_REJECTED"],
    },
    {
      key: "request_approval_results",
      label: "Archive & Delete Request Results",
      description: "Notifications when your archive or deletion requests are approved or rejected.",
      icon: "published_with_changes",
      iconClass: "icon--gov",
      types: ["REQUEST_APPROVED", "REQUEST_REJECTED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates",
      description: "Receive notifications when published policies are updated.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates",
      description: "Receive notifications when published schemes are updated.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "system_alerts",
      label: "System Alerts",
      description: "Platform health notices and departmental announcements.",
      icon: "notifications_active",
      iconClass: "icon--system",
      types: ["SYSTEM_ALERT", "GOVERNMENT_ANNOUNCEMENT", "DEPARTMENT_ALERT"],
    },
  ],

  CITIZEN: [
    {
      key: "new_policy",
      label: "New Policy Alerts",
      description: "Receive notifications when new government policies are published.",
      icon: "description",
      iconClass: "icon--policy",
      types: ["NEW_POLICY", "POLICY_PUBLISHED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates",
      description: "Receive notifications when published policies are updated.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "new_scheme",
      label: "New Scheme Alerts",
      description: "Receive notifications when new government schemes are published.",
      icon: "layers",
      iconClass: "icon--scheme",
      types: ["NEW_SCHEME", "SCHEME_PUBLISHED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates",
      description: "Receive notifications when published schemes are updated.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "deadline_reminders",
      label: "Scheme Deadline Alerts",
      description: "Receive reminders when relevant scheme deadlines are approaching.",
      icon: "event",
      iconClass: "icon--deadline",
      types: ["DEADLINE_REMINDER", "SCHEME_ENDING"],
    },
    {
      key: "scheme_ended",
      label: "Scheme Ended",
      description: "Receive notice when schemes have closed for applications.",
      icon: "event_busy",
      iconClass: "icon--deadline",
      types: ["SCHEME_ENDED"],
    },
    {
      key: "application_updates",
      label: "Application Updates",
      description: "Status changes and verification updates for scheme applications you have submitted.",
      icon: "assignment_turned_in",
      iconClass: "icon--app",
      types: ["APPLICATION_UPDATE", "APPLICATION_SUBMITTED", "APPLICATION_APPROVED", "APPLICATION_REJECTED"],
    },
    {
      key: "system_alerts",
      label: "System Alerts",
      description: "Important platform notifications and public announcements.",
      icon: "notifications_active",
      iconClass: "icon--system",
      types: ["SYSTEM_ALERT", "GOVERNMENT_ANNOUNCEMENT", "DEPARTMENT_ALERT"],
    },
  ],

  RESEARCHER: [
    {
      key: "new_policy",
      label: "New Policy Alerts",
      description: "Receive notifications when new government policies are published.",
      icon: "description",
      iconClass: "icon--policy",
      types: ["NEW_POLICY", "POLICY_PUBLISHED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates",
      description: "Receive notifications when published policies are updated.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "new_scheme",
      label: "New Scheme Alerts",
      description: "Receive notifications when new government schemes are published.",
      icon: "layers",
      iconClass: "icon--scheme",
      types: ["NEW_SCHEME", "SCHEME_PUBLISHED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates",
      description: "Receive notifications when published schemes are updated.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "deadline_reminders",
      label: "Scheme Deadline Alerts",
      description: "Receive reminders when relevant scheme deadlines are approaching.",
      icon: "event",
      iconClass: "icon--deadline",
      types: ["DEADLINE_REMINDER", "SCHEME_ENDING"],
    },
    {
      key: "scheme_ended",
      label: "Scheme Ended",
      description: "Receive notice when schemes have closed for applications.",
      icon: "event_busy",
      iconClass: "icon--deadline",
      types: ["SCHEME_ENDED"],
    },
    {
      key: "research_reports",
      label: "Research & Regulatory Updates",
      description: "Receive updates on regulatory frameworks, analytical reports, and research alerts.",
      icon: "analytics",
      iconClass: "icon--reg",
      types: ["REGULATORY_UPDATE", "RESEARCH_REPORT", "REPORT_COMPLETED", "SAVED_SEARCH_ALERT"],
    },
    {
      key: "system_alerts",
      label: "System Alerts",
      description: "Important platform notifications and research-relevant announcements.",
      icon: "notifications_active",
      iconClass: "icon--system",
      types: ["SYSTEM_ALERT", "GOVERNMENT_ANNOUNCEMENT", "DEPARTMENT_ALERT"],
    },
  ],

  ORGANIZATION: [
    {
      key: "new_policy",
      label: "New Policy Alerts",
      description: "Receive notifications when new government policies are published.",
      icon: "description",
      iconClass: "icon--policy",
      types: ["NEW_POLICY", "POLICY_PUBLISHED"],
    },
    {
      key: "policy_updates",
      label: "Policy Updates",
      description: "Receive notifications when published policies are updated.",
      icon: "edit_document",
      iconClass: "icon--policy",
      types: ["POLICY_UPDATED"],
    },
    {
      key: "new_scheme",
      label: "New Scheme Alerts",
      description: "Receive notifications when new government schemes are published.",
      icon: "layers",
      iconClass: "icon--scheme",
      types: ["NEW_SCHEME", "SCHEME_PUBLISHED"],
    },
    {
      key: "scheme_updates",
      label: "Scheme Updates",
      description: "Receive notifications when published schemes are updated.",
      icon: "update",
      iconClass: "icon--scheme",
      types: ["SCHEME_UPDATED"],
    },
    {
      key: "deadline_reminders",
      label: "Scheme Deadline Alerts",
      description: "Receive reminders when relevant scheme deadlines are approaching.",
      icon: "event",
      iconClass: "icon--deadline",
      types: ["DEADLINE_REMINDER", "SCHEME_ENDING"],
    },
    {
      key: "scheme_ended",
      label: "Scheme Ended",
      description: "Receive notice when schemes have closed for applications.",
      icon: "event_busy",
      iconClass: "icon--deadline",
      types: ["SCHEME_ENDED"],
    },
    {
      key: "application_updates",
      label: "Application Updates",
      description: "Status changes and verification updates for institutional applications you have submitted.",
      icon: "assignment_turned_in",
      iconClass: "icon--app",
      types: ["APPLICATION_UPDATE", "APPLICATION_SUBMITTED", "APPLICATION_APPROVED", "APPLICATION_REJECTED"],
    },
    {
      key: "system_alerts",
      label: "System Alerts",
      description: "Important platform notifications and organizational announcements.",
      icon: "notifications_active",
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
