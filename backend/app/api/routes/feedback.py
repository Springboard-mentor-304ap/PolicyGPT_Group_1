from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
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
):
    return create_feedback(db, data)


@router.get(
    "",
    response_model=list[FeedbackResponse],
)
def get_all_feedback_route(
    db: Session = Depends(get_db),
):
    return get_all_feedback(db)


@router.get(
    "/me/{user_id}",
    response_model=list[FeedbackResponse],
)
def get_user_feedback_route(
    user_id: int,
    db: Session = Depends(get_db),
):
    return get_user_feedback(db, user_id)


@router.get(
    "/{feedback_id}",
    response_model=FeedbackResponse,
)
def get_feedback_route(
    feedback_id: int,
    db: Session = Depends(get_db),
):
    feedback = get_feedback(db, feedback_id)

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
    db: Session = Depends(get_db),
):
    feedback = update_feedback(db, feedback_id, data)

    if not feedback:
        raise HTTPException(
            status_code=404,
            detail="Feedback not found",
        )

    return feedback


@router.delete("/{feedback_id}")
def delete_feedback_route(
    feedback_id: int,
    db: Session = Depends(get_db),
):
    feedback = delete_feedback(db, feedback_id)

    if not feedback:
        raise HTTPException(
            status_code=404,
            detail="Feedback not found",
        )

    return {
        "message": "Feedback deleted successfully",
        "feedback_id": feedback_id,
    }