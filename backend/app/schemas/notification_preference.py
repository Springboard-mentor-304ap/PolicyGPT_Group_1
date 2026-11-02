from datetime import datetime

from pydantic import BaseModel


class NotificationPreferenceCreate(BaseModel):
    user_id: int
    email_enabled: bool = True
    sms_enabled: bool = False
    in_app_enabled: bool = True
    policy_alerts: bool = True
    scheme_updates: bool = True
    deadline_reminders: bool = True


class NotificationPreferenceUpdate(BaseModel):
    email_enabled: bool | None = None
    sms_enabled: bool | None = None
    in_app_enabled: bool | None = None
    policy_alerts: bool | None = None
    scheme_updates: bool | None = None
    deadline_reminders: bool | None = None


class NotificationPreferenceResponse(BaseModel):
    preference_id: int
    user_id: int
    email_enabled: bool
    sms_enabled: bool
    in_app_enabled: bool
    policy_alerts: bool
    scheme_updates: bool
    deadline_reminders: bool
    updated_at: datetime

    class Config:
        from_attributes = True