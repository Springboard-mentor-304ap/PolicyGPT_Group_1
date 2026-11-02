from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class SupportRequestCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=100,
                          description="Support request category")
    subject: str = Field(..., min_length=3, max_length=255,
                         description="Subject of the support request")
    description: str = Field(..., min_length=5,
                             description=(
                                 "Detailed description of the issue or inquiry"
                             ))
    priority: str = Field("MEDIUM", max_length=30,
                          description=(
                              "Priority level: LOW, MEDIUM, HIGH, URGENT"
                          ))


class SupportRequestResponse(BaseModel):
    query_id: int
    request_id: str
    user_id: int | None = None
    category: str
    subject: str
    description: str
    priority: str
    status: str
    response: str | None = None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SupportRequestUpdate(BaseModel):
    response: str | None = None
    status: str | None = None
    assigned_to: int | None = None
    priority: str | None = None


class SupportTicketMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000,
                         description="Reply text for the ticket conversation")


class SupportTicketMessageResponse(BaseModel):
    id: int
    ticket_id: int
    sender_id: int | None = None
    sender_role: str
    sender_name: str | None = None
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminSupportRequestResponse(SupportRequestResponse):
    user_name: str | None = None
    user_email: str | None = None
    user_role: str | None = None
    assigned_to: int | None = None
