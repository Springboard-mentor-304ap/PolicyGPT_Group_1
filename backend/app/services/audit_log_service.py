from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def get_audit_logs(
    db: Session,
    user_id: int | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    from_date=None,
    to_date=None,
):
    query = db.query(AuditLog)

    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)

    if action:
        query = query.filter(AuditLog.action == action)

    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)

    if from_date:
        query = query.filter(AuditLog.created_at >= from_date)

    if to_date:
        query = query.filter(AuditLog.created_at <= to_date)

    return query.order_by(AuditLog.created_at.desc()).all()


def get_audit_log(db: Session, audit_id: int):
    return (
        db.query(AuditLog)
        .filter(AuditLog.audit_id == audit_id)
        .first()
    )