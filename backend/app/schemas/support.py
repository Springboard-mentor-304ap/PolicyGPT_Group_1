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
    user_id: int
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
