from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.api.routes.auth import get_current_user, normalize_role
from app.db.database import get_db
from app.models.user import User
from app.schemas.faq import FAQResponse
from app.schemas.support import (
    SupportRequestCreate,
    SupportRequestResponse,
)
from app.services import support_service

router = APIRouter(
    prefix="/support",
    tags=["Support & Help"],
)

optional_security = HTTPBearer(auto_error=False)


def _get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Extract authenticated user if bearer token is supplied, else
    return None (Guest)."""
    if not credentials:
        return None

    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id_str = payload.get("sub")
        if not user_id_str:
            return None
        user_id = int(user_id_str)
        user = db.query(User).filter(User.user_id == user_id).first()
        return user
    except (JWTError, ValueError):
        return None


def _verify_not_admin(user: Optional[User]):
    """Strictly prohibit Administrators from using the user Support portal."""
    if user:
        role = normalize_role(user.role)
        if role in ("ADMIN", "ADMINISTRATOR"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Administrators use the Admin FAQ Management portal "
                    "and cannot access the normal Support portal."
                ),
            )


# ============================================================
# PUBLISHED FAQ ENDPOINTS (PUBLIC / NON-ADMIN)
# ============================================================

@router.get(
    "/faqs",
    response_model=list[FAQResponse],
    summary="List published FAQs",
)
def get_support_faqs(
    search: Optional[str] = Query(
        None, description="Search keyword in question, answer, or category"),
    category: Optional[str] = Query(None, description="Category filter"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_get_optional_current_user),
):
    """Retrieve published FAQs. Prohibits Administrator access."""
    _verify_not_admin(current_user)
    return support_service.get_published_faqs(
        db=db,
        search=search,
        category=category,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/faqs/categories",
    response_model=list[str],
    summary="Get published FAQ categories",
)
def get_support_faq_categories(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_get_optional_current_user),
):
    """Retrieve available categories from published FAQs."""
    _verify_not_admin(current_user)
    return support_service.get_faq_categories(db)


@router.get(
    "/faqs/{faq_id}",
    response_model=FAQResponse,
    summary="Get single published FAQ",
)
def get_support_faq_detail(
    faq_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_get_optional_current_user),
):
    """Retrieve single published FAQ by ID."""
    _verify_not_admin(current_user)
    faq = support_service.get_published_faq(db, faq_id)
    if not faq:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="FAQ not found or not published",
        )
    return faq


# ============================================================
# SUPPORT REQUEST ENDPOINTS (AUTHENTICATED NON-ADMIN ONLY)
# ============================================================

@router.post(
    "/requests",
    response_model=SupportRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a support request",
)
def submit_support_request(
    data: SupportRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a support request. Available to non-admin authenticated users."""
    _verify_not_admin(current_user)
    return support_service.create_support_request(
        db=db,
        user_id=current_user.user_id,
        data=data,
    )


@router.get(
    "/requests",
    response_model=list[SupportRequestResponse],
    summary="List current user's support requests",
)
def list_my_support_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all support requests submitted by the logged-in user."""
    _verify_not_admin(current_user)
    return support_service.get_user_support_requests(
        db=db,
        user_id=current_user.user_id,
    )


@router.get(
    "/requests/{query_id}",
    response_model=SupportRequestResponse,
    summary="Get details of a specific support request",
)
def get_my_support_request(
    query_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single support request enforcing ownership security."""
    _verify_not_admin(current_user)
    query = support_service.get_support_request(
        db=db,
        query_id=query_id,
        user_id=current_user.user_id,
    )
    if not query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support request not found",
        )
    return query
