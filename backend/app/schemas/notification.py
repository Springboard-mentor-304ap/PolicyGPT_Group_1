from datetime import datetime
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field


class NotificationCategory(str, Enum):
    """Canonical categories. Values must match
    app.services.notification_taxonomy."""

    ADMIN_REQUEST = "ADMIN_REQUEST"
    APPROVAL = "APPROVAL"
    POLICY = "POLICY"
    SCHEME = "SCHEME"
    APPLICATION = "APPLICATION"
    DEADLINE = "DEADLINE"
    SYSTEM = "SYSTEM"
    SUPPORT = "SUPPORT"


class NotificationPriority(str, Enum):
    """LOW / NORMAL / HIGH / URGENT.

    ``MEDIUM`` is retained as a read-time alias for rows written before the
    rename; it is normalised to NORMAL by the service layer.
    """

    LOW = "LOW"
    NORMAL = "NORMAL"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class NotificationChannel(str, Enum):
    IN_APP = "IN_APP"
    EMAIL = "EMAIL"
    SMS = "SMS"


class NotificationTypeEnum(str, Enum):
    # Public Notifications (Citizen, Researcher, Organization)
    NEW_POLICY = "NEW_POLICY"
    POLICY_PUBLISHED = "POLICY_PUBLISHED"
    POLICY_UPDATED = "POLICY_UPDATED"
    POLICY_UPDATE = "POLICY_UPDATE"
    NEW_SCHEME = "NEW_SCHEME"
    SCHEME_PUBLISHED = "SCHEME_PUBLISHED"
    SCHEME_UPDATE = "SCHEME_UPDATE"
    SCHEME_ENDING = "SCHEME_ENDING"
    SCHEME_ENDED = "SCHEME_ENDED"
    DEADLINE_REMINDER = "DEADLINE_REMINDER"

    # Admin Workflow Notifications (Administrator Only)
    POLICY_PENDING_REQUEST = "POLICY_PENDING_REQUEST"
    POLICY_APPROVAL_REQUEST = "POLICY_APPROVAL_REQUEST"
    POLICY_DELETE_REQUEST = "POLICY_DELETE_REQUEST"
    POLICY_ARCHIVE_REQUEST = "POLICY_ARCHIVE_REQUEST"
    POLICY_SUBMITTED = "POLICY_SUBMITTED"
    POLICY_ARCHIVE_REQUESTED = "POLICY_ARCHIVE_REQUESTED"

    SCHEME_PENDING_REQUEST = "SCHEME_PENDING_REQUEST"
    SCHEME_APPROVAL_REQUEST = "SCHEME_APPROVAL_REQUEST"
    SCHEME_DELETE_REQUEST = "SCHEME_DELETE_REQUEST"
    SCHEME_ARCHIVE_REQUEST = "SCHEME_ARCHIVE_REQUEST"
    SCHEME_SUBMITTED = "SCHEME_SUBMITTED"
    SCHEME_APPROVAL_REQUIRED = "SCHEME_APPROVAL_REQUIRED"
    ADMIN_ACTION_UPDATE = "ADMIN_ACTION_UPDATE"

    NEW_USER = "NEW_USER"
    USER_ROLE_CHANGE = "USER_ROLE_CHANGE"
    USER_STATUS_CHANGE = "USER_STATUS_CHANGE"

    NEW_FEEDBACK = "NEW_FEEDBACK"
    ISSUE_REPORTED = "ISSUE_REPORTED"
    FEEDBACK_ESCALATED = "FEEDBACK_ESCALATED"
    FEEDBACK_RESOLVED = "FEEDBACK_RESOLVED"
    CITIZEN_FEEDBACK = "CITIZEN_FEEDBACK"
    FEEDBACK_UPDATE = "FEEDBACK_UPDATE"
    SUPPORT_UPDATE = "SUPPORT_UPDATE"

    SYSTEM_ALERT = "SYSTEM_ALERT"
    BACKGROUND_JOB_FAILURE = "BACKGROUND_JOB_FAILURE"
    API_FAILURE = "API_FAILURE"
    DATABASE_ALERT = "DATABASE_ALERT"
    SECURITY_ALERT = "SECURITY_ALERT"

    EMAIL_DELIVERY_FAILURE = "EMAIL_DELIVERY_FAILURE"
    SMS_DELIVERY_FAILURE = "SMS_DELIVERY_FAILURE"
    EMAIL_BOUNCE = "EMAIL_BOUNCE"
    SMS_FAILURE = "SMS_FAILURE"
    NOTIFICATION_DELIVERY_FAILURE = "NOTIFICATION_DELIVERY_FAILURE"

    # Government Official Decision Notifications (Govt Official Only)
    POLICY_APPROVED = "POLICY_APPROVED"
    POLICY_REJECTED = "POLICY_REJECTED"
    SCHEME_APPROVED = "SCHEME_APPROVED"
    SCHEME_REJECTED = "SCHEME_REJECTED"
    REQUEST_APPROVED = "REQUEST_APPROVED"
    REQUEST_REJECTED = "REQUEST_REJECTED"

    # Citizen Application Notifications
    APPLICATION_UPDATE = "APPLICATION_UPDATE"
    APPLICATION_SUBMITTED = "APPLICATION_SUBMITTED"
    APPLICATION_APPROVED = "APPLICATION_APPROVED"
    APPLICATION_REJECTED = "APPLICATION_REJECTED"

    # Other existing types
    GOVERNMENT_ANNOUNCEMENT = "GOVERNMENT_ANNOUNCEMENT"
    REGULATORY_UPDATE = "REGULATORY_UPDATE"
    RESEARCH_REPORT = "RESEARCH_REPORT"
    SAVED_SEARCH_ALERT = "SAVED_SEARCH_ALERT"
    REPORT_COMPLETED = "REPORT_COMPLETED"
    DEPARTMENT_ALERT = "DEPARTMENT_ALERT"


class NotificationCreate(BaseModel):
    user_id: int | None = None
    title: str = Field(..., max_length=200)
    message: str
    notification_type: str
    category: str = "SYSTEM"
    priority: str = "NORMAL"
    channel: str = "IN_APP"
    action_url: str | None = None
    entity_type: str | None = None
    entity_id: int | None = None
    source_name: str | None = None
    related_policy_id: int | None = None
    related_scheme_id: int | None = None


class NotificationResponse(BaseModel):
    notification_id: int
    user_id: int | None = None
    title: str
    message: str
    notification_type: str
    category: str = "SYSTEM"
    priority: str = "NORMAL"
    channel: str = "IN_APP"
    action_url: str | None = None
    entity_type: str | None = None
    entity_id: int | None = None
    source_name: str | None = None
    related_policy_id: int | None = None
    related_scheme_id: int | None = None
    is_read: bool = False
    read_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None
    expires_at: datetime | None = None

    # Dynamically enriched entity details for full-width view
    entity_title: str | None = None
    entity_status: str | None = None
    entity_ministry: str | None = None
    entity_department: str | None = None
    entity_category: str | None = None
    entity_description: str | None = None
    entity_benefits: list[str] | None = None
    entity_state: str | None = None
    entity_published_date: str | None = None
    decision_by_name: str | None = None
    decision_date: datetime | None = None
    decision_reason: str | None = None
    submitted_by_name: str | None = None
    submitted_date: datetime | None = None
    deadline_date: str | None = None
    days_remaining: int | None = None
    application_url: str | None = None
    request_type: str | None = None
    feedback_status: str | None = None
    feedback_subject: str | None = None
    feedback_message: str | None = None
    feedback_response: str | None = None
    feedback_created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class NotificationSummaryResponse(BaseModel):
    total: int
    unread: int
    read: int
    this_week: int


class UnreadCountResponse(BaseModel):
    unread_count: int


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    unread_count: int
    summary: NotificationSummaryResponse


class NotificationDeliveryResponse(BaseModel):
    delivery_id: int
    notification_id: int
    channel: str
    provider: str
    status: str
    provider_message_id: str | None = None
    attempt_count: int = 1
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    failed_at: datetime | None = None
    failure_reason: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AdminNotificationStatsResponse(BaseModel):
    total_notifications: int
    in_app_count: int
    email_sent: int
    email_failed: int
    sms_sent: int
    sms_failed: int
    pending_deliveries: int
    delivered_count: int
    skipped_count: int = 0


class TestEmailRequest(BaseModel):
    email: str


class TestSmsRequest(BaseModel):
    phone_number: str