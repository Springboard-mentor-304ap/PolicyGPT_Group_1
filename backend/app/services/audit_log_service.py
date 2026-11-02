from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User


def get_audit_logs(
    db: Session,
    user_id: int,
    user_role: str,
    action: str | None = None,
    entity_type: str | None = None,
    from_date=None,
    to_date=None,
):
    query = (
        db.query(AuditLog)
        .join(
            User,
            AuditLog.user_id == User.user_id
        )
    )

    # ADMIN → Citizen + Admin audit logs
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → only their own audit logs
    else:
        query = query.filter(
            AuditLog.user_id == user_id
        )

    # Optional filters
    if action:
        query = query.filter(
            AuditLog.action == action
        )

    if entity_type:
        query = query.filter(
            AuditLog.entity_type == entity_type
        )

    if from_date:
        query = query.filter(
            AuditLog.created_at >= from_date
        )

    if to_date:
        query = query.filter(
            AuditLog.created_at <= to_date
        )

    return (
        query
        .order_by(AuditLog.created_at.desc())
        .all()
    )


def get_audit_log(
    db: Session,
    audit_id: int,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(AuditLog)
        .join(
            User,
            AuditLog.user_id == User.user_id
        )
        .filter(
            AuditLog.audit_id == audit_id
        )
    )

    # ADMIN → Citizen + Admin audit logs
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → only their own audit log
    else:
        query = query.filter(
            AuditLog.user_id == user_id
        )

    return query.first()