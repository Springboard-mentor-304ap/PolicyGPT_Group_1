from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    audit_id: int
    user_id: int | None
    action: str
    entity_type: str | None
    entity_id: int | None
    description: str | None
    ip_address: str | None
    created_at: datetime

    class Config:
        from_attributes = True