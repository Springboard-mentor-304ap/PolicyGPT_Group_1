from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import (
    get_current_user,
    normalize_role,
    require_roles,
)
from app.models.user import User
from app.services.audit_log_service import log_request_action

from app.schemas.feedback import (
    FeedbackCreate,
    FeedbackUpdate,
    FeedbackResponse,
)

from app.services.feedback_service import (
    create_feedback,
    get_feedback,
    get_all_feedback,
    get_user_feedback,
    update_feedback,
    delete_feedback,
)


router = APIRouter(
    prefix="/feedback",
    tags=["Feedback"],
)


@router.post(
    "",
    response_model=FeedbackResponse,
)
def create_feedback_route(
    data: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.user_id:
        data.user_id = current_user.user_id
    elif current_user.role != "ADMIN" and current_user.user_id != data.user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only submit feedback for your own account",
        )

    if (
        normalize_role(current_user.role) == "ADMIN"
        and data.user_id == current_user.user_id
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Administrators cannot submit feedback. "
                "Use the Admin Support Center to respond to users."
            ),
        )

    return create_feedback(db, data)


@router.get(
    "",
    response_model=list[FeedbackResponse],
)
def get_all_feedback_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_all_feedback(db, current_user.user_id, current_user.role)


@router.get(
    "/me/{user_id}",
    response_model=list[FeedbackResponse],
)
def get_user_feedback_route(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.user_id != user_id and current_user.role != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail="You can only access your own feedback",
        )

    return get_user_feedback(
        db,
        user_id,
        current_user.role,
    )


@router.get(
    "/{feedback_id}",
    response_model=FeedbackResponse,
)
def get_feedback_route(
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    feedback = get_feedback(
        db, feedback_id, current_user.user_id, current_user.role)

    if not feedback:
        raise HTTPException(
            status_code=404,
            detail="Feedback not found",
        )

    return feedback


@router.patch(
    "/{feedback_id}",
    response_model=FeedbackResponse,
)
def update_feedback_route(
    feedback_id: int,
    data: FeedbackUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    feedback = update_feedback(
        db,
        feedback_id,
        current_user.user_id,
        current_user.role,
        data,
    )

    if not feedback:
        raise HTTPException(
            status_code=404,
            detail="Feedback not found or access denied",
        )

    log_request_action(
        request,
        db,
        current_user,
        "FEEDBACK_RESPONDED",
        "FEEDBACK",
        feedback_id,
        f"Admin responded to feedback #{feedback_id} "
        f"(status: {feedback.status}).",
    )

    return feedback


@router.delete("/{feedback_id}")
def delete_feedback_route(
    feedback_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    feedback = delete_feedback(
        db,
        feedback_id,
        current_user.user_id,
        current_user.role,
    )

    if not feedback:
        raise HTTPException(
            status_code=404,
            detail="Feedback not found or access denied",
        )

    log_request_action(
        request,
        db,
        current_user,
        "FEEDBACK_DELETED",
        "FEEDBACK",
        feedback_id,
        f"Feedback #{feedback_id} deleted by administrator.",
    )

    return {
        "message": "Feedback deleted successfully",
        "feedback_id": feedback_id,
    }