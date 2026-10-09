from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.api.routes.auth import (
    get_current_user,
    normalize_role,
    require_roles,
)
from app.db.database import get_db
from app.models.user import User
from app.schemas.faq import FAQResponse
from app.schemas.support import (
    AdminSupportRequestResponse,
    SupportRequestCreate,
    SupportRequestResponse,
    SupportRequestUpdate,
    SupportTicketMessageCreate,
    SupportTicketMessageResponse,
)
from app.models.support_query import SupportQuery
from app.services import support_service
from app.services.audit_log_service import log_request_action

router = APIRouter(
    prefix="/support",
    tags=["Support & Help"],
)

optional_security = HTTPBearer(auto_error=False)


def _get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
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


def _request_role(user: Optional[User]) -> str:
    """Resolve the caller's canonical FAQ audience server-side.

    Authenticated users resolve from their JWT identity; anonymous
    callers are GUEST. No role is ever accepted from query params or
    the request body, so clients cannot escalate into another role's
    FAQs by manipulation.
    """
    if not user:
        return "GUEST"
    return normalize_role(user.role) or "GUEST"


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
        None, description="Search keyword in question, answer, or category"
    ),
    category: Optional[str] = Query(None, description="Category filter"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_get_optional_current_user),
):
    """Retrieve published FAQs visible to the caller's role.

    Prohibits Administrator access. Role is derived server-side from
    the JWT (GUEST when anonymous); query params cannot override it.
    """
    _verify_not_admin(current_user)
    return support_service.get_published_faqs(
        db=db,
        search=search,
        category=category,
        skip=skip,
        limit=limit,
        role=_request_role(current_user),
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
    """Retrieve available categories from published FAQs visible to
    the caller's role."""
    _verify_not_admin(current_user)
    return support_service.get_faq_categories(db, role=_request_role(current_user))


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
    """Retrieve a single published FAQ by ID when visible to the
    caller's role."""
    _verify_not_admin(current_user)
    faq = support_service.get_published_faq(
        db, faq_id, role=_request_role(current_user)
    )
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
    background_tasks: BackgroundTasks,
    idempotency_key: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a support request. Available to non-admin authenticated users.

    Accepts an optional ``Idempotency-Key`` header: when the client retries
    the same submission (timeout, double-click), the key lets a repeated
    POST safely return the already-created ticket instead of a duplicate.
    Content-based deduplication in the service is the authoritative guard,
    so retries are safe even without the header.
    """
    _verify_not_admin(current_user)
    return support_service.create_support_request(
        db=db,
        user_id=current_user.user_id,
        data=data,
        background_tasks=background_tasks,
    )


@router.get(
    "/requests",
    response_model=list[SupportRequestResponse],
    summary="List current user's support requests",
)
def list_my_support_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve support requests submitted by the logged-in user (paged)."""
    _verify_not_admin(current_user)
    return support_service.get_user_support_requests(
        db=db,
        user_id=current_user.user_id,
        skip=skip,
        limit=limit,
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


# ============================================================
# TICKET CONVERSATION (OWNER ONLY — non-admin authenticated users)
# ============================================================


@router.get(
    "/requests/{query_id}/messages",
    response_model=list[SupportTicketMessageResponse],
    summary="List conversation messages for own support request",
)
def list_my_ticket_messages(
    query_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Chronological replies on the caller's own ticket."""
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
    return support_service.list_ticket_messages(db=db, ticket=query)


@router.post(
    "/requests/{query_id}/messages",
    response_model=SupportTicketMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Reply to own support request",
)
def reply_to_my_ticket(
    query_id: int,
    data: SupportTicketMessageCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Post a user reply; replying to a RESOLVED/CLOSED ticket reopens it."""
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
    try:
        return support_service.post_ticket_message(
            db=db,
            ticket=query,
            sender_id=current_user.user_id,
            sender_role=current_user.role,
            message=data.message,
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )


# ============================================================
# ADMIN SUPPORT MANAGEMENT (ADMIN ONLY)
# ============================================================


@router.get(
    "/admin/requests",
    response_model=list[AdminSupportRequestResponse],
    summary="List all support requests (Admin)",
)
def list_all_support_requests(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    """Retrieve every support request with user details (Admin only)."""
    return support_service.get_all_support_requests(
        db=db,
        status=status,
        category=category,
        search=search,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/admin/requests/{query_id}",
    response_model=AdminSupportRequestResponse,
    summary="Get a support request by ID (Admin)",
)
def get_support_request_admin(
    query_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    """Retrieve a single support request with user details (Admin only)."""
    query = support_service.get_support_request_by_id(
        db=db,
        query_id=query_id,
    )
    if not query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support request not found",
        )
    return query


@router.patch(
    "/admin/requests/{query_id}",
    response_model=AdminSupportRequestResponse,
    summary="Respond to a support request (Admin)",
)
def respond_to_support_request(
    query_id: int,
    data: SupportRequestUpdate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    """Record an admin response and/or status change (Admin only)."""
    try:
        query = support_service.respond_to_support_request(
            db=db,
            query_id=query_id,
            admin_user_id=current_user.user_id,
            response=data.response,
            status=data.status,
            assigned_to=data.assigned_to,
            priority=data.priority,
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    if not query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support request not found",
        )

    log_request_action(
        request,
        db,
        current_user,
        "SUPPORT_REQUEST_RESPONDED",
        "SUPPORT_QUERY",
        query_id,
        f"Admin responded to support request {query['request_id']} "
        f"(status: {query['status']}).",
    )

    return query


@router.get(
    "/admin/requests/{query_id}/messages",
    response_model=list[SupportTicketMessageResponse],
    summary="List conversation messages for a support request (Admin)",
)
def list_ticket_messages_admin(
    query_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    """Chronological replies on any ticket (Admin only)."""
    query = support_service.get_support_request_by_id(
        db=db,
        query_id=query_id,
    )
    if not query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support request not found",
        )
    ticket = (
        db.query(SupportQuery)
        .filter(SupportQuery.query_id == query_id)
        .first()
    )
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support request not found",
        )
    return support_service.list_ticket_messages(db=db, ticket=ticket)


@router.post(
    "/admin/requests/{query_id}/messages",
    response_model=SupportTicketMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Reply to a support request (Admin)",
)
def reply_to_ticket_admin(
    query_id: int,
    data: SupportTicketMessageCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    """Post an admin reply without touching response/status fields."""
    query = support_service.get_support_request_by_id(
        db=db,
        query_id=query_id,
    )
    if not query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support request not found",
        )
    ticket = (
        db.query(SupportQuery)
        .filter(SupportQuery.query_id == query_id)
        .first()
    )
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support request not found",
        )
    try:
        message = support_service.post_ticket_message(
            db=db,
            ticket=ticket,
            sender_id=current_user.user_id,
            sender_role="ADMIN",
            message=data.message,
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    return message


@router.get(
    "/admin/analytics",
    summary="Support analytics aggregates (Admin)",
)
def get_support_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    """Ticket/feedback counts by status, category, priority and role."""
    return support_service.get_support_analytics(db=db)
