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
    # Timeline enrichment (populated only by the per-entity timeline
    # endpoint; None on the generic listing endpoints).
    action_label: str | None = None
    from_status: str | None = None
    to_status: str | None = None
    reason: str | None = None

    model_config = ConfigDict(from_attributes=True)


class EntityAuditTimelineResponse(BaseModel):
    entity_type: str
    entity_id: int
    total: int
    page: int
    limit: int
    pages: int
    events: list[AuditLogResponse]