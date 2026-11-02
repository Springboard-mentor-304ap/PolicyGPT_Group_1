from datetime import datetime

from sqlalchemy.orm import Session
from app.models.user import User
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
    user_id: int,
    user_role: str,
):
    query = (
        db.query(Notification)
        .join(
            User,
            Notification.user_id == User.user_id
        )
    )

    # ADMIN → Citizen + Admin notifications
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → only their own notifications
    else:
        query = query.filter(
            Notification.user_id == user_id
        )

    return (
        query
        .order_by(Notification.created_at.desc())
        .all()
    )

def mark_notification_read(
    db: Session,
    notification_id: int,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(Notification)
        .join(
            User,
            Notification.user_id == User.user_id
        )
        .filter(
            Notification.notification_id == notification_id
        )
    )

    # ADMIN → Citizen + Admin notifications
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → own notification only
    else:
        query = query.filter(
            Notification.user_id == user_id
        )

    notification = query.first()

    if not notification:
        return None

    notification.is_read = True

    db.commit()
    db.refresh(notification)

    return notification
def mark_all_notifications_read(
    db: Session,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(Notification)
        .join(
            User,
            Notification.user_id == User.user_id
        )
        .filter(
            Notification.is_read.is_(False)
        )
    )

    # ADMIN → Citizen + Admin notifications
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → own notifications only
    else:
        query = query.filter(
            Notification.user_id == user_id
        )

    notifications = query.all()

    for notification in notifications:
        notification.is_read = True

    db.commit()

    return {
        "message": "All notifications marked as read",
        "updated_count": len(notifications),
    }

def delete_notification(
    db: Session,
    notification_id: int,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(Notification)
        .join(
            User,
            Notification.user_id == User.user_id
        )
        .filter(
            Notification.notification_id == notification_id
        )
    )

    # ADMIN → Citizen + Admin notifications
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → own notification only
    else:
        query = query.filter(
            Notification.user_id == user_id
        )

    notification = query.first()

    if not notification:
        return None

    notification_id_value = notification.notification_id

    db.delete(notification)
    db.commit()

    return {
        "message": "Notification deleted successfully",
        "notification_id": notification_id_value,
    }

def get_notification_stats(
    db: Session,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(Notification)
        .join(
            User,
            Notification.user_id == User.user_id
        )
    )

    # ADMIN → Citizen + Admin
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → own notifications
    else:
        query = query.filter(
            Notification.user_id == user_id
        )

    total = query.count()

    read = (
        query
        .filter(Notification.is_read.is_(True))
        .count()
    )

    unread = (
        query
        .filter(Notification.is_read.is_(False))
        .count()
    )

    return {
        "total": total,
        "read": read,
        "unread": unread,
    }