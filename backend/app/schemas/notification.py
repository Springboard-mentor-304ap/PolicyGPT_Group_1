from datetime import datetime

from pydantic import BaseModel


class NotificationCreate(BaseModel):
    user_id: int | None = None
    title: str
    message: str
    notification_type: str
    related_policy_id: int | None = None
    related_scheme_id: int | None = None


class NotificationResponse(BaseModel):
    notification_id: int
    user_id: int | None
    title: str
    message: str
    notification_type: str
    related_policy_id: int | None
    related_scheme_id: int | None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True