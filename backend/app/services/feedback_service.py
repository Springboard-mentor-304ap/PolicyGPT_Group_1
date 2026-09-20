from datetime import datetime

from sqlalchemy.orm import Session

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
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return feedback


def get_feedback(
    db: Session,
    feedback_id: int,
):
    return (
        db.query(Feedback)
        .filter(Feedback.feedback_id == feedback_id)
        .first()
    )


def get_all_feedback(
    db: Session,
):
    return (
        db.query(Feedback)
        .order_by(Feedback.created_at.desc())
        .all()
    )


def get_user_feedback(
    db: Session,
    user_id: int,
):
    return (
        db.query(Feedback)
        .filter(Feedback.user_id == user_id)
        .order_by(Feedback.created_at.desc())
        .all()
    )


def update_feedback(
    db: Session,
    feedback_id: int,
    data: FeedbackUpdate,
):
    feedback = get_feedback(db, feedback_id)

    if not feedback:
        return None

    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(feedback, field, value)

    feedback.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(feedback)

    return feedback


def delete_feedback(
    db: Session,
    feedback_id: int,
):
    feedback = get_feedback(db, feedback_id)

    if not feedback:
        return None

    db.delete(feedback)
    db.commit()

    return feedback