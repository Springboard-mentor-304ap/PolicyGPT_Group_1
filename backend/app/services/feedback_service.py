from datetime import datetime, timezone
from app.models.user import User
from sqlalchemy.orm import Session


def _is_admin(role: str | None) -> bool:
    # Local normalizer to avoid a service->route import cycle.
    # Mirrors app.api.routes.auth.normalize_role for the ADMIN check.
    value = str(role or "").strip().upper()
    return value in ("ADMIN", "ADMINISTRATOR", "ADMINISTRATOR_ROLE")

from app.models.feedback import Feedback
from app.schemas.feedback import FeedbackCreate, FeedbackUpdate


def create_feedback(
    db: Session,
    data: FeedbackCreate,
):
    feedback = Feedback(
        user_id=data.user_id,
        policy_id=data.policy_id,
        scheme_id=data.scheme_id,
        feedback_type=data.feedback_type,
        subject=data.subject,
        message=data.message,
        status="OPEN",
        admin_response=None,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )

    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    try:
        from app.services.notification_service import notify_feedback_received
        notify_feedback_received(
            db=db,
            feedback_id=feedback.feedback_id,
            subject=feedback.subject,
            user_id=feedback.user_id,
        )
    except Exception as e:
        print(f"Notification error on feedback creation: {e}")

    return feedback


def get_feedback(
    db: Session,
    feedback_id: int,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(Feedback)
        .outerjoin(
            User,
            Feedback.user_id == User.user_id
        )
        .filter(
            Feedback.feedback_id == feedback_id
        )
    )

    # NORMAL USER → own feedback only; ADMIN → all feedback
    if not _is_admin(user_role):
        query = query.filter(
            Feedback.user_id == user_id
        )

    return query.first()


def get_all_feedback(
    db: Session,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(Feedback)
        .outerjoin(
            User,
            Feedback.user_id == User.user_id
        )
    )

    # NORMAL USER → own feedback only; ADMIN → all feedback
    if not _is_admin(user_role):
        query = query.filter(
            Feedback.user_id == user_id
        )

    return (
        query
        .order_by(Feedback.created_at.desc())
        .all()
    )


def get_user_feedback(
    db: Session,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(Feedback)
        .outerjoin(
            User,
            Feedback.user_id == User.user_id
        )
        .filter(
            Feedback.user_id == user_id
        )
    )

    return (
        query
        .order_by(Feedback.created_at.desc())
        .all()
    )

def update_feedback(
    db: Session,
    feedback_id: int,
    user_id: int,
    user_role: str,
    data: FeedbackUpdate,
):
    feedback = get_feedback(
        db,
        feedback_id,
        user_id,
        user_role,
    )

    if not feedback:
        return None

    update_data = data.model_dump(exclude_unset=True)

    previous_status = feedback.status

    for field, value in update_data.items():
        setattr(feedback, field, value)

    feedback.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    db.refresh(feedback)

    status_changed = (
        "status" in update_data
        and (previous_status or "") != (feedback.status or "")
    )
    if (update_data.get("admin_response") or status_changed) and feedback.user_id:
        try:
            from app.services.notification_service import (
                notify_feedback_updated,
            )
            notify_feedback_updated(
                db=db,
                feedback_id=feedback.feedback_id,
                subject=feedback.subject,
                user_id=feedback.user_id,
                response_summary=feedback.admin_response[:
                    80] if feedback.admin_response else None,
            )
        except Exception as e:
            print(f"Notification error on feedback update: {e}")

    return feedback


def delete_feedback(
    db: Session,
    feedback_id: int,
    user_id: int,
    user_role: str,
):
    feedback = get_feedback(
        db,
        feedback_id,
        user_id,
        user_role,
    )

    if not feedback:
        return None

    db.delete(feedback)
    db.commit()

    return feedback