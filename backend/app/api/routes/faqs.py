from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import get_current_user, require_roles
from app.models.user import User

from app.schemas.faq import (
    FAQCreate,
    FAQUpdate,
    FAQResponse,
)

from app.services.faq_service import (
    create_faq,
    get_all_faqs,
    get_faq,
    update_faq,
    delete_faq,
)


router = APIRouter(
    prefix="/faqs",
    tags=["FAQs"],
)


@router.post(
    "",
    response_model=FAQResponse,
)
def create_faq_route(
    data: FAQCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return create_faq(db, data)


@router.get(
    "",
    response_model=list[FAQResponse],
)
def get_all_faqs_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_all_faqs(db)


@router.get(
    "/{faq_id}",
    response_model=FAQResponse,
)
def get_faq_route(
    faq_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    faq = get_faq(db, faq_id)

    if not faq:
        raise HTTPException(
            status_code=404,
            detail="FAQ not found",
        )

    return faq


@router.patch(
    "/{faq_id}",
    response_model=FAQResponse,
)
def update_faq_route(
    faq_id: int,
    data: FAQUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    faq = update_faq(db, faq_id, data)

    if not faq:
        raise HTTPException(
            status_code=404,
            detail="FAQ not found",
        )

    return faq


@router.delete("/{faq_id}")
def delete_faq_route(
    faq_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    faq = delete_faq(db, faq_id)

    if not faq:
        raise HTTPException(
            status_code=404,
            detail="FAQ not found",
        )

    return {
        "message": "FAQ deleted successfully",
        "faq_id": faq_id,
    }