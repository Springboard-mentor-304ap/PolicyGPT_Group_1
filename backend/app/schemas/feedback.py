from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FeedbackCreate(BaseModel):
    user_id: int | None = None
    policy_id: int | None = None
    scheme_id: int | None = None
    feedback_type: str
    subject: str | None = None
    message: str


class FeedbackUpdate(BaseModel):
    status: str | None = None
    admin_response: str | None = None


class FeedbackResponse(BaseModel):
    feedback_id: int
    user_id: int | None = None
    policy_id: int | None = None
    scheme_id: int | None = None
    feedback_type: str
    subject: str | None = None
    message: str
    status: str
    admin_response: str | None = None
    created_at: datetime
    updated_at: datetime
    user_name: str | None = None
    user_email: str | None = None
    user_role: str | None = None

    model_config = ConfigDict(from_attributes=True)