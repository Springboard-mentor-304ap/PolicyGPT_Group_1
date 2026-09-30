from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import require_roles
from app.models.user import User
from app.services.audit_log_service import log_request_action

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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    result = create_faq(db, data)

    log_request_action(
        request,
        db,
        current_user,
        "FAQ_CREATED",
        "FAQ",
        result.faq_id,
        f"FAQ '{result.question[:120]}' created.",
    )

    return result


@router.get(
    "",
    response_model=list[FAQResponse],
)
def get_all_faqs_route(
    db: Session = Depends(get_db),
):
    return get_all_faqs(db)


@router.get(
    "/{faq_id}",
    response_model=FAQResponse,
)
def get_faq_route(
    faq_id: int,
    db: Session = Depends(get_db),
):
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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    faq = update_faq(db, faq_id, data)

    if not faq:
        raise HTTPException(
            status_code=404,
            detail="FAQ not found",
        )

    log_request_action(
        request,
        db,
        current_user,
        "FAQ_UPDATED",
        "FAQ",
        faq_id,
        f"FAQ #{faq_id} updated.",
    )

    return faq


@router.delete("/{faq_id}")
def delete_faq_route(
    faq_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    faq = delete_faq(db, faq_id)

    if not faq:
        raise HTTPException(
            status_code=404,
            detail="FAQ not found",
        )

    log_request_action(
        request,
        db,
        current_user,
        "FAQ_DELETED",
        "FAQ",
        faq_id,
        f"FAQ #{faq_id} deleted by administrator.",
    )

    return {
        "message": "FAQ deleted successfully",
        "faq_id": faq_id,
    }