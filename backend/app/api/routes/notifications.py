from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.notification import (
    NotificationCreate,
    NotificationResponse,
)
from app.services.notification_service import (
    create_notification,
    get_user_notifications,
    mark_notification_read,
    mark_all_notifications_read,
    delete_notification,
    get_notification_stats,
)

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


@router.post(
    "",
    response_model=NotificationResponse
)
def create_notification_route(
    data: NotificationCreate,
    db: Session = Depends(get_db),
):
    return create_notification(db, data)


@router.get(
    "/me/{user_id}",
    response_model=list[NotificationResponse]
)
def get_my_notifications(
    user_id: int,
    db: Session = Depends(get_db),
):
    return get_user_notifications(db, user_id)


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse
)
def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
):
    notification = mark_notification_read(
        db,
        notification_id
    )

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    return notification

@router.patch("/me/{user_id}/read-all")
def mark_all_notifications_as_read(
    user_id: int,
    db: Session = Depends(get_db),
):
    return mark_all_notifications_read(db, user_id)

@router.delete("/{notification_id}")
def delete_notification_route(
    notification_id: int,
    db: Session = Depends(get_db),
):
    notification = delete_notification(db, notification_id)

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    return notification


@router.get("/me/{user_id}/stats")
def notification_stats(
    user_id: int,
    db: Session = Depends(get_db),
):
    return get_notification_stats(db, user_id)