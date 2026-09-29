/** Backend canonical set is LOW/NORMAL/HIGH/URGENT. `MEDIUM` is retained
 *  because rows written before the normalisation may still carry it. */
export type NotificationPriority = 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS';
/** Mirrors the backend `NotificationCategory` enum. */
export type NotificationCategory =
  | 'ADMIN_REQUEST'
  | 'APPLICATION'
  | 'APPROVAL'
  | 'DEADLINE'
  | 'POLICY'
  | 'SCHEME'
  | 'SUPPORT'
  | 'SYSTEM';
export type NotificationFrequency = 'INSTANT' | 'DAILY_DIGEST' | 'WEEKLY_DIGEST';

export enum NotificationType {
  NEW_POLICY = 'NEW_POLICY',
  POLICY_UPDATE = 'POLICY_UPDATE',
  NEW_SCHEME = 'NEW_SCHEME',
  SCHEME_UPDATE = 'SCHEME_UPDATE',
  DEADLINE_REMINDER = 'DEADLINE_REMINDER',

  POLICY_PENDING_REQUEST = 'POLICY_PENDING_REQUEST',
  POLICY_APPROVAL_REQUEST = 'POLICY_APPROVAL_REQUEST',
  POLICY_DELETE_REQUEST = 'POLICY_DELETE_REQUEST',
  POLICY_ARCHIVE_REQUEST = 'POLICY_ARCHIVE_REQUEST',
  POLICY_SUBMITTED = 'POLICY_SUBMITTED',
  POLICY_ARCHIVE_REQUESTED = 'POLICY_ARCHIVE_REQUESTED',

  SCHEME_PENDING_REQUEST = 'SCHEME_PENDING_REQUEST',
  SCHEME_APPROVAL_REQUEST = 'SCHEME_APPROVAL_REQUEST',
  SCHEME_DELETE_REQUEST = 'SCHEME_DELETE_REQUEST',
  SCHEME_ARCHIVE_REQUEST = 'SCHEME_ARCHIVE_REQUEST',
  SCHEME_SUBMITTED = 'SCHEME_SUBMITTED',
  SCHEME_APPROVAL_REQUIRED = 'SCHEME_APPROVAL_REQUIRED',

  NEW_USER = 'NEW_USER',
  USER_ROLE_CHANGE = 'USER_ROLE_CHANGE',
  USER_STATUS_CHANGE = 'USER_STATUS_CHANGE',

  NEW_FEEDBACK = 'NEW_FEEDBACK',
  ISSUE_REPORTED = 'ISSUE_REPORTED',
  FEEDBACK_ESCALATED = 'FEEDBACK_ESCALATED',
  FEEDBACK_RESOLVED = 'FEEDBACK_RESOLVED',
  CITIZEN_FEEDBACK = 'CITIZEN_FEEDBACK',
  FEEDBACK_UPDATE = 'FEEDBACK_UPDATE',

  SYSTEM_ALERT = 'SYSTEM_ALERT',
  BACKGROUND_JOB_FAILURE = 'BACKGROUND_JOB_FAILURE',
  API_FAILURE = 'API_FAILURE',
  DATABASE_ALERT = 'DATABASE_ALERT',
  SECURITY_ALERT = 'SECURITY_ALERT',

  EMAIL_DELIVERY_FAILURE = 'EMAIL_DELIVERY_FAILURE',
  SMS_DELIVERY_FAILURE = 'SMS_DELIVERY_FAILURE',
  EMAIL_BOUNCE = 'EMAIL_BOUNCE',
  SMS_FAILURE = 'SMS_FAILURE',
  NOTIFICATION_DELIVERY_FAILURE = 'NOTIFICATION_DELIVERY_FAILURE',

  POLICY_APPROVED = 'POLICY_APPROVED',
  POLICY_REJECTED = 'POLICY_REJECTED',
  SCHEME_APPROVED = 'SCHEME_APPROVED',
  SCHEME_REJECTED = 'SCHEME_REJECTED',
  REQUEST_APPROVED = 'REQUEST_APPROVED',
  REQUEST_REJECTED = 'REQUEST_REJECTED',

  APPLICATION_UPDATE = 'APPLICATION_UPDATE',
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  APPLICATION_APPROVED = 'APPLICATION_APPROVED',
  APPLICATION_REJECTED = 'APPLICATION_REJECTED',

  GOVERNMENT_ANNOUNCEMENT = 'GOVERNMENT_ANNOUNCEMENT',
  REGULATORY_UPDATE = 'REGULATORY_UPDATE',
  RESEARCH_REPORT = 'RESEARCH_REPORT',
  SAVED_SEARCH_ALERT = 'SAVED_SEARCH_ALERT',
  REPORT_COMPLETED = 'REPORT_COMPLETED',
  DEPARTMENT_ALERT = 'DEPARTMENT_ALERT',

  // Types introduced with the canonical taxonomy (see notification_taxonomy.py).
  POLICY_PUBLISHED = 'POLICY_PUBLISHED',
  POLICY_UPDATED = 'POLICY_UPDATED',
  SCHEME_PUBLISHED = 'SCHEME_PUBLISHED',
  SCHEME_UPDATED = 'SCHEME_UPDATED',
  SCHEME_ENDING = 'SCHEME_ENDING',
  SCHEME_ENDED = 'SCHEME_ENDED',
  SUPPORT_UPDATE = 'SUPPORT_UPDATE',
  ADMIN_ACTION_UPDATE = 'ADMIN_ACTION_UPDATE',
}

export interface NotificationItem {
  notification_id: number;
  user_id: number | null;
  title: string;
  message: string;
  notification_type: string;
  category?: NotificationCategory | string;
  priority: NotificationPriority;
  channel: NotificationChannel;
  action_url: string | null;
  entity_type: string | null;
  entity_id: number | null;
  source_name: string | null;
  related_policy_id: number | null;
  related_scheme_id: number | null;
  is_read: boolean;
  read_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  created_at: string;

  // Enriched Dynamic Entity Fields
  entity_title?: string | null;
  entity_status?: string | null;
  entity_ministry?: string | null;
  entity_department?: string | null;
  entity_category?: string | null;
  entity_description?: string | null;
  entity_benefits?: string[] | null;
  decision_by_name?: string | null;
  decision_date?: string | null;
  decision_reason?: string | null;
  submitted_by_name?: string | null;
  submitted_date?: string | null;
  deadline_date?: string | null;
  days_remaining?: number | null;
  application_url?: string | null;
  request_type?: string | null;
}

export interface AdminNotificationStats {
  total_notifications: number;
  in_app_count: number;
  email_sent: number;
  email_failed: number;
  sms_sent: number;
  sms_failed: number;
  pending_deliveries: number;
  delivered_count: number;
  skipped_count: number;
}

export interface NotificationDeliveryRecord {
  delivery_id: number;
  notification_id: number;
  channel: NotificationChannel;
  provider: string;
  status: string;
  provider_message_id?: string | null;
  attempt_count: number;
  sent_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TestDeliveryResponse {
  success: boolean;
  provider: string;
  message_id?: string | null;
  error?: string | null;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  read: number;
  this_week: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  unread_count: number;
  summary: NotificationSummary;
}

export interface NotificationPreferences {
  preference_id: number;
  user_id: number;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  policy_alerts: boolean;
  scheme_updates: boolean;
  deadline_reminders: boolean;
  application_updates: boolean;
  government_announcements: boolean;
  regulatory_updates: boolean;
  research_reports: boolean;
  system_alerts: boolean;
  frequency: NotificationFrequency;
  updated_at: string;
}

export interface NotificationPreferencesUpdatePayload {
  email_enabled?: boolean;
  sms_enabled?: boolean;
  in_app_enabled?: boolean;
  policy_alerts?: boolean;
  scheme_updates?: boolean;
  deadline_reminders?: boolean;
  application_updates?: boolean;
  government_announcements?: boolean;
  regulatory_updates?: boolean;
  research_reports?: boolean;
  system_alerts?: boolean;
  frequency?: NotificationFrequency;
}

export interface NotificationTab {
  id: string;
  label: string;
  badge?: number;
  icon?: string;
}

export interface NotificationQueryParams {
  search?: string;
  category?: string;
  is_read?: boolean | null;
  priority?: string;
  channel?: string;
  date_range?: string;
  sort_by?: string;
  page?: number;
  page_size?: number;
}

// ============================================================
// PER-TYPE CHANNEL MATRIX
// Mirrors the backend `NotificationMatrixResponse` schema.
// ============================================================

export type NotificationChannelKey = 'in_app_enabled' | 'email_enabled' | 'sms_enabled';

export type NotificationChannelMap = Record<NotificationChannelKey, boolean>;

export interface NotificationTypePreference {
  notification_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  /** True when the user has explicitly saved a rule for this type. */
  explicit: boolean;
}

export interface NotificationPreferenceGroup {
  key: string;
  label: string;
  description: string;
  section: string;
  types: string[];
  default_channels: Record<string, boolean>;
  type_preferences: NotificationTypePreference[];
}

export interface NotificationMatrixResponse {
  user_id: number;
  role: string;
  global_settings: NotificationPreferences;
  groups: NotificationPreferenceGroup[];
}

export interface NotificationTypeRuleUpdate {
  notification_type: string;
  in_app_enabled?: boolean;
  email_enabled?: boolean;
  sms_enabled?: boolean;
}

export interface NotificationMatrixUpdatePayload {
  global_settings?: Partial<NotificationPreferencesUpdatePayload>;
  rules?: NotificationTypeRuleUpdate[];
}
