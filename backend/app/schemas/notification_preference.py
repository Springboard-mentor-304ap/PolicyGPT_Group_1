from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


VALID_FREQUENCIES = ("INSTANT", "DAILY_DIGEST", "WEEKLY_DIGEST")


class NotificationPreferenceCreate(BaseModel):
    user_id: int | None = None
    email_enabled: bool = True
    sms_enabled: bool = False
    in_app_enabled: bool = True
    policy_alerts: bool = True
    scheme_updates: bool = True
    deadline_reminders: bool = True
    application_updates: bool = True
    government_announcements: bool = False
    regulatory_updates: bool = True
    research_reports: bool = False
    system_alerts: bool = True
    frequency: str = "INSTANT"

    @model_validator(mode="after")
    def _check_frequency(self) -> "NotificationPreferenceCreate":
        if self.frequency not in VALID_FREQUENCIES:
            raise ValueError(
                f"frequency must be one of {', '.join(VALID_FREQUENCIES)}"
            )
        return self


class NotificationPreferenceUpdate(BaseModel):
    email_enabled: bool | None = None
    sms_enabled: bool | None = None
    in_app_enabled: bool | None = None
    policy_alerts: bool | None = None
    scheme_updates: bool | None = None
    deadline_reminders: bool | None = None
    application_updates: bool | None = None
    government_announcements: bool | None = None
    regulatory_updates: bool | None = None
    research_reports: bool | None = None
    system_alerts: bool | None = None
    frequency: str | None = None

    @model_validator(mode="after")
    def _check_frequency(self) -> "NotificationPreferenceUpdate":
        if (
            self.frequency is not None
            and self.frequency not in VALID_FREQUENCIES
        ):
            raise ValueError(
                f"frequency must be one of {', '.join(VALID_FREQUENCIES)}"
            )
        return self


class NotificationPreferenceResponse(BaseModel):
    preference_id: int
    user_id: int
    email_enabled: bool
    sms_enabled: bool
    in_app_enabled: bool
    policy_alerts: bool
    scheme_updates: bool
    deadline_reminders: bool
    application_updates: bool
    government_announcements: bool
    regulatory_updates: bool
    research_reports: bool
    system_alerts: bool
    frequency: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Per-notification-type channel matrix
# ---------------------------------------------------------------------------


class NotificationTypeChannel(BaseModel):
    in_app_enabled: bool
    email_enabled: bool
    sms_enabled: bool


class NotificationTypePreference(BaseModel):
    notification_type: str
    in_app_enabled: bool
    email_enabled: bool
    sms_enabled: bool
    explicit: bool = Field(
        description=(
            "True when the user has explicitly saved a rule for this type."
        )
    )


class NotificationPreferenceGroupResponse(BaseModel):
    key: str
    label: str
    description: str
    section: str
    types: list[str]
    default_channels: dict[str, bool]
    type_preferences: list[NotificationTypePreference]


class NotificationMatrixResponse(BaseModel):
    user_id: int
    role: str
    # Named `global_settings` rather than `global` because `global` is a
    # Python keyword and cannot be an attribute name.
    global_settings: NotificationPreferenceResponse
    groups: list[NotificationPreferenceGroupResponse]


class NotificationTypeRuleUpdate(BaseModel):
    notification_type: str
    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    sms_enabled: bool | None = None


class NotificationMatrixUpdate(BaseModel):
    """Bulk save from the preferences screen.

    ``global_settings`` is optional so a client can save only the matrix, or
    only the master switches.
    """

    global_settings: NotificationPreferenceUpdate | None = None
    rules: list[NotificationTypeRuleUpdate] = Field(default_factory=list)
