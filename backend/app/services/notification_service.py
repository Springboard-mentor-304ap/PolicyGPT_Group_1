from datetime import datetime

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.schemas.notification import NotificationCreate


def create_notification(
    db: Session,
    data: NotificationCreate
):
    notification = Notification(
        user_id=data.user_id,
        title=data.title,
        message=data.message,
        notification_type=data.notification_type,
        related_policy_id=data.related_policy_id,
        related_scheme_id=data.related_scheme_id,
        is_read=False,
        created_at=datetime.utcnow(),
    )

    db.add(notification)
    db.commit()
    db.refresh(notification)

    return notification


def get_user_notifications(
    db: Session,
    user_id: int
):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .all()
    )


def mark_notification_read(
    db: Session,
    notification_id: int
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.notification_id == notification_id
        )
        .first()
    )

    if not notification:
        return None

    notification.is_read = True

    db.commit()
    db.refresh(notification)

    return notification
def mark_all_notifications_read(db: Session, user_id: int):
    notifications = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.is_read.is_(False)
        )
        .all()
    )

    for notification in notifications:
        notification.is_read = True

    db.commit()

    return {
        "message": "All notifications marked as read",
        "updated_count": len(notifications)
    }

def delete_notification(db: Session, notification_id: int):
    notification = (
        db.query(Notification)
        .filter(Notification.notification_id == notification_id)
        .first()
    )

    if not notification:
        return None

    db.delete(notification)
    db.commit()

    return {
        "message": "Notification deleted successfully",
        "notification_id": notification_id
    }

def get_notification_stats(db: Session, user_id: int):
    total = (
            db.query(Notification)
            .filter(Notification.user_id == user_id)
            .count()
    )

    read = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.is_read.is_(True)
        )
        .count()
    )

    unread = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.is_read.is_(False)
        )
        .count()
    )

    return {
        "total": total,
        "read": read,
        "unread": unread
    }