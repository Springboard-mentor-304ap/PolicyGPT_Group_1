from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    audit_id: int
    user_id: int | None
    user_name: str | None = None
    user_email: str | None = None
    user_role: str | None = None
    action: str
    entity_type: str | None
    entity_id: int | None
    description: str | None
    ip_address: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)