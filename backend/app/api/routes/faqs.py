from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.api.routes.auth import normalize_role, require_roles
from app.models.faq import FAQ
from app.models.user import User
from app.services.audit_log_service import log_request_action

from app.schemas.faq import (
    FAQCreate,
    FAQUpdate,
    FAQResponse,
)

from app.services.faq_service import (
    audience_filter,
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

optional_security = HTTPBearer(auto_error=False)


def _get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Extract the authenticated user when a bearer token is supplied,
    else return None (Guest). Role is always resolved server-side."""
    if not credentials:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.user_id == int(user_id)).first()
    except (JWTError, ValueError):
        return None


def _detail_role(user: Optional[User]) -> str:
    if not user:
        return "GUEST"
    return normalize_role(user.role) or "GUEST"


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
    current_user: User = Depends(require_roles("ADMIN")),
):
    """Admin management list: every FAQ regardless of status or
    audience. User-facing reads use /support/faqs (role-filtered)."""
    return get_all_faqs(db)


@router.get(
    "/{faq_id}",
    response_model=FAQResponse,
)
def get_faq_route(
    faq_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_get_optional_current_user),
):
    """Single FAQ with server-side visibility enforcement.

    ADMIN sees any status. Everyone else sees only PUBLISHED FAQs in
    their own audience (GUEST when anonymous); anything else is 404 so
    restricted existence is never confirmed.
    """
    role = _detail_role(current_user)
    if role == "ADMIN":
        faq = get_faq(db, faq_id)
    else:
        faq = (
            audience_filter(db.query(FAQ), role)
            .filter(
                FAQ.faq_id == faq_id,
                FAQ.status == "PUBLISHED",
            )
            .first()
        )

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