import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.db.database import get_db
from app.models.otp import OTPVerification
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SendOTPRequest,
    UserResponse,
    VerifyOTPRequest,
)
from app.services.audit_log_service import log_request_action
from app.services.email_service import send_otp_email, send_password_reset_email
from app.services.sms_service import normalize_indian_phone
from app.services.twilio_verify_service import (
    check_sms_verification,
    start_sms_verification,
)

logger = logging.getLogger("uvicorn.error")


def _password_reset_rate_limited(db: Session, user_id: int) -> bool:
    """True when this user already hit the hourly OTP/reset request cap.

    Counts OTP rows created in the last hour (each forgot-password /
    send-otp request creates exactly one). Prevents unlimited email/SMS
    abuse while keeping the check cheap and race-tolerant.
    """
    window_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
    recent = (
        db.query(OTPVerification)
        .filter(
            OTPVerification.user_id == user_id,
            OTPVerification.created_at >= window_start,
        )
        .count()
    )
    return recent >= max(1, settings.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR)


# =========================================================
# ROUTER
# =========================================================

router = APIRouter(prefix="/auth", tags=["Authentication"])


# =========================================================
# SECURITY
# =========================================================

security = HTTPBearer()


# =========================================================
# GET CURRENT USER
# =========================================================


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:

    token = credentials.credentials

    payload = decode_access_token(token)

    # -----------------------------------------------------
    # INVALID OR EXPIRED TOKEN
    # -----------------------------------------------------

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # -----------------------------------------------------
    # GET USER ID AND TOKEN VERSION
    # -----------------------------------------------------

    user_id = payload.get("sub")
    token_version = payload.get("ver")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # -----------------------------------------------------
    # CONVERT USER ID TO INTEGER
    # -----------------------------------------------------

    try:
        user_id = int(user_id)

    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # -----------------------------------------------------
    # FIND USER (PK lookup; photo bytes deferred — every
    # authenticated request hits this, and pulling up to 5 MB
    # of BYTEA on each call makes even text-only saves slow
    # on remote Postgres)
    # -----------------------------------------------------

    user = (
        db.query(User)
        .options(defer(User.profile_photo))
        .filter(User.user_id == user_id)
        .first()
    )

    # -----------------------------------------------------
    # USER DOES NOT EXIST
    # -----------------------------------------------------

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # -----------------------------------------------------
    # ACCOUNT INACTIVE
    # -----------------------------------------------------

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive"
        )

    # -----------------------------------------------------
    # TOKEN VERSION CHECK
    # -----------------------------------------------------

    if (token_version if token_version is not None else 0) != (user.token_version or 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


# =========================================================
# ROLE SYSTEM
# =========================================================

# Canonical roles used by the application.
# ADMIN is the superuser and can access every protected role route.
CANONICAL_ROLES = {
    "ADMIN",
    "GOVERNMENT_OFFICIAL",
    "RESEARCHER",
    "ORGANIZATION",
    "CITIZEN",
    "GUEST",
}

# Backward-compatible aliases. This means ADMIN, administrator,
# GOVERNMENT, govt, etc. can all be used safely.
ROLE_ALIASES = {
    "ADMIN": "ADMIN",
    "ADMINISTRATOR": "ADMIN",
    "ADMINISTRATOR_ROLE": "ADMIN",
    "GOVERNMENT": "GOVERNMENT_OFFICIAL",
    "GOVT": "GOVERNMENT_OFFICIAL",
    "GOVERNMENT OFFICIAL": "GOVERNMENT_OFFICIAL",
    "GOVERNMENT_OFFICIAL": "GOVERNMENT_OFFICIAL",
    "CITIZEN": "CITIZEN",
    "RESEARCHER": "RESEARCHER",
    "ORGANIZATION": "ORGANIZATION",
    "ORG": "ORGANIZATION",
    "GUEST": "GUEST",
    "GUEST_USER": "GUEST",
    "GUEST USER": "GUEST",
}


def normalize_role(role: str | None) -> str:
    """
    Convert a stored/requested role to one canonical role.

    Examples:
        admin -> ADMIN
        ADMINISTRATOR -> ADMIN
        government -> GOVERNMENT_OFFICIAL
        govt -> GOVERNMENT_OFFICIAL
    """
    if role is None:
        return ""

    normalized = str(role).strip().upper()
    return ROLE_ALIASES.get(normalized, normalized)


def require_roles(*allowed_roles: str):

    normalized_allowed_roles = {normalize_role(role) for role in allowed_roles}

    def role_checker(current_user: User = Depends(get_current_user)) -> User:

        user_role = normalize_role(current_user.role)

        # -------------------------------------------------
        # ADMIN = SUPERUSER
        # -------------------------------------------------
        # ADMIN can access every protected role endpoint.
        if user_role == "ADMIN":
            return current_user

        # -------------------------------------------------
        # ROLE CHECK
        # -------------------------------------------------
        if user_role not in normalized_allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Required role(s): "
                    f"{', '.join(sorted(normalized_allowed_roles))}. "
                    f"Your role: {user_role or 'UNKNOWN'}"
                ),
            )

        return current_user

    return role_checker


# =========================================================
# CREATE USER TOKEN
# =========================================================


def create_user_token(user: User) -> str:

    return create_access_token(
        user_id=user.user_id, role=user.role, token_version=user.token_version
    )


def find_user_by_phone(db: Session, phone_raw: str | None) -> User | None:
    if not phone_raw:
        return None
    normalized = normalize_indian_phone(phone_raw)
    digits = re.sub(r"\D", "", str(phone_raw))
    ten_digits = digits[-10:] if len(digits) >= 10 else digits

    variants = {str(phone_raw).strip()}
    if normalized:
        variants.add(normalized)
    if digits:
        variants.add(digits)
    if ten_digits:
        variants.add(ten_digits)
        variants.add(f"+91{ten_digits}")
        variants.add(f"91{ten_digits}")

    return db.query(User).filter(User.phone.in_(variants)).first()


# =========================================================
# HASH RESET TOKEN
# =========================================================


def hash_reset_token(token: str) -> str:

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# =========================================================
# REGISTER
# =========================================================


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest, request: Request, db: Session = Depends(get_db)):

    # -----------------------------------------------------
    # CLEAN EMAIL
    # -----------------------------------------------------

    email = str(data.email).lower().strip()

    # -----------------------------------------------------
    # CHECK EMAIL
    # -----------------------------------------------------

    existing_email = db.query(User).filter(User.email == email).first()

    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )

    # -----------------------------------------------------
    # CHECK PHONE
    # -----------------------------------------------------

    if data.phone:
        normalized_registration_phone = re.sub(r"\D", "", data.phone)

        existing_phone = (
            db.query(User).filter(User.phone == normalized_registration_phone).first()
        )

        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number is already registered",
            )

    # -----------------------------------------------------
    # CHECK PASSWORD
    # -----------------------------------------------------

    if data.password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match",
        )

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # -----------------------------------------------------
    # CREATE USER
    # -----------------------------------------------------

    user = User(
        full_name=data.full_name,
        email=email,
        password_hash=hash_password(data.password),
        role=normalize_role(data.role),
        phone=(re.sub(r"\D", "", data.phone) if data.phone else None),
        date_of_birth=data.date_of_birth,
        state=data.state,
        district=data.district,
        occupation=data.occupation,
        organization=data.organization,
        is_active=True,
        token_version=0,
        created_at=now,
        updated_at=now,
    )

    # -----------------------------------------------------
    # SAVE USER
    # -----------------------------------------------------

    try:
        db.add(user)
        db.commit()
        db.refresh(user)

        # Initialize default notification preferences and dispatch
        # registration alerts
        try:
            from app.services.notification_preference_service import (
                get_or_create_preferences,
            )
            from app.services.notification_service import NotificationService

            get_or_create_preferences(db, user.user_id, user.role)
            NotificationService.notify_new_user(db, user)
        except Exception as notif_err:
            logger.error(
                f"Error initializing user notification preferences or alert: "
                f"{notif_err}"
            )

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or phone number is already registered",
        )

    # -----------------------------------------------------
    # CREATE TOKEN
    # -----------------------------------------------------

    log_request_action(
        request,
        db,
        user,
        "AUTH_REGISTERED",
        "USER",
        user.user_id,
        f"New {user.role} account registered ({user.email}).",
    )

    token = create_user_token(user)

    # -----------------------------------------------------
    # RESPONSE
    # -----------------------------------------------------

    return AuthResponse(access_token=token, token_type="bearer", user=user)


# =========================================================
# LOGIN
# =========================================================

# =========================================================
# LOGIN
# =========================================================


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):

    # -----------------------------------------------------
    # CLEAN IDENTIFIER
    # -----------------------------------------------------

    identifier = data.identifier.strip()

    # -----------------------------------------------------
    # NORMALIZE EMAIL / PHONE
    # -----------------------------------------------------

    normalized_email = identifier.casefold()

    normalized_phone = re.sub(r"\D", "", identifier)

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = (
        db.query(User)
        .filter(
            or_(
                func.lower(func.trim(User.email)) == normalized_email,
                User.phone == identifier,
                User.phone == normalized_phone,
            )
        )
        .first()
    )

    # -----------------------------------------------------
    # ACCOUNT DOES NOT EXIST
    # -----------------------------------------------------

    if not user:
        log_request_action(
            request,
            db,
            None,
            "AUTH_LOGIN_FAILED",
            "USER",
            None,
            "Login failed: unknown identifier.",
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_CREDENTIAL",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # -----------------------------------------------------
    # CHECK PASSWORD
    # -----------------------------------------------------

    password_valid = verify_password(data.password, user.password_hash)

    # -----------------------------------------------------
    # PASSWORD IS WRONG
    # -----------------------------------------------------

    if not password_valid:
        log_request_action(
            request,
            db,
            user,
            "AUTH_LOGIN_FAILED",
            "USER",
            user.user_id,
            "Login failed: incorrect password.",
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_PASSWORD",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # -----------------------------------------------------
    # CHECK ACCOUNT STATUS
    # -----------------------------------------------------

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive"
        )

    # -----------------------------------------------------
    # CREATE ACCESS TOKEN
    # -----------------------------------------------------

    log_request_action(
        request,
        db,
        user,
        "AUTH_LOGIN_SUCCESS",
        "USER",
        user.user_id,
        f"User {user.email} logged in.",
    )

    token = create_user_token(user)

    # -----------------------------------------------------
    # RETURN LOGIN RESPONSE
    # -----------------------------------------------------

    return AuthResponse(access_token=token, token_type="bearer", user=user)


# =========================================================
# GUEST LOGIN
# =========================================================


@router.post(
    "/guest-login",
    response_model=AuthResponse,
    summary="Guest User Login",
    description=(
        "Authenticates as a guest user, returning a guest session "
        "token and user profile."
    ),
)
@router.post("/guest", response_model=AuthResponse, include_in_schema=False)
def guest_login(db: Session = Depends(get_db)):
    guest_email = "guest@policygpt.com"
    guest_user = db.query(User).filter(User.email == guest_email).first()

    if not guest_user:
        now = datetime.now(timezone.utc)
        guest_user = User(
            full_name="Guest User",
            email=guest_email,
            password_hash=hash_password(secrets.token_urlsafe(16)),
            role="GUEST",
            phone=None,
            date_of_birth=None,
            state=None,
            district=None,
            occupation="Guest",
            organization=None,
            is_active=True,
            token_version=0,
            created_at=now,
            updated_at=now,
        )
        db.add(guest_user)
        try:
            db.commit()
            db.refresh(guest_user)
        except IntegrityError:
            db.rollback()
            guest_user = db.query(User).filter(User.email == guest_email).first()

    token = create_user_token(guest_user)

    return AuthResponse(access_token=token, token_type="bearer", user=guest_user)


# =========================================================
# CURRENT USER
# =========================================================


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):

    return current_user


# =========================================================
# UPDATE PROFILE
# =========================================================


@router.put("/profile", response_model=UserResponse)
def update_profile(
    data: ProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    updates = data.model_dump(exclude_unset=True)

    # -----------------------------------------------------
    # PHONE VALIDATION
    # -----------------------------------------------------

    if updates.get("phone"):
        if not updates["phone"].isdigit():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Phone number must contain only digits",
            )

        existing_phone = (
            db.query(User)
            .filter(
                User.phone == updates["phone"],
                User.user_id != current_user.user_id,
            )
            .first()
        )

        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number is already registered",
            )

    # -----------------------------------------------------
    # APPLY UPDATES
    # -----------------------------------------------------

    for field, value in updates.items():
        setattr(current_user, field, value)

    # -----------------------------------------------------
    # UPDATE TIMESTAMP
    # -----------------------------------------------------

    current_user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # -----------------------------------------------------
    # SAVE (single business transaction; photo bytes are
    # deferred so refresh must NOT pull the up-to-5 MB BYTEA
    # back on a text-only save — refresh only the small
    # columns the response actually serializes)
    # -----------------------------------------------------

    try:
        db.commit()
        db.refresh(
            current_user,
            attribute_names=[
                "full_name",
                "phone",
                "gender",
                "date_of_birth",
                "state",
                "district",
                "occupation",
                "organization",
                "is_active",
                "profile_photo_updated_at",
                "profile_photo_mime",
                "updated_at",
            ],
        )

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile update conflicts with existing data",
        )

    log_request_action(
        request,
        db,
        current_user,
        "AUTH_PROFILE_UPDATED",
        "USER",
        current_user.user_id,
        f"Profile updated (fields: {', '.join(sorted(updates.keys()))}).",
    )

    return current_user


# =========================================================
# PROFILE PHOTO (avatar for the authenticated user)
# =========================================================
# Identity always comes from the JWT via get_current_user. No user_id
# is accepted from the client, so a user can only ever read, change,
# or remove their OWN photo. Guests share one row and have no
# personal photo: upload/removal is rejected for them.


def _require_personal_profile(current_user: User) -> None:
    if normalize_role(current_user.role) == "GUEST":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guest users do not have a personal profile photo.",
        )


@router.put("/profile/photo", response_model=UserResponse)
async def update_profile_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a new profile photo for the authenticated user."""
    _require_personal_profile(current_user)

    from app.services.profile_photo_service import (
        MAX_PHOTO_BYTES,
        set_profile_photo,
    )

    # Read with a one-byte cap so an oversize upload is rejected
    # without buffering an unbounded body in memory.
    try:
        content = await file.read(MAX_PHOTO_BYTES + 1)
    except Exception as exc:
        logger.error(f"Profile photo read error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to read the uploaded file.",
        )
    finally:
        try:
            await file.close()
        except Exception:
            pass

    updated = set_profile_photo(
        db=db,
        user=current_user,
        filename=file.filename,
        content=content,
    )

    log_request_action(
        request,
        db,
        current_user,
        "AUTH_PROFILE_PHOTO_UPDATED",
        "USER",
        current_user.user_id,
        "Profile photo updated.",
    )

    return updated


@router.get("/profile/photo")
def get_profile_photo(
    current_user: User = Depends(get_current_user),
):
    """Return the authenticated user's own profile photo bytes."""
    if not current_user.profile_photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile photo.",
        )
    return Response(
        content=bytes(current_user.profile_photo),
        media_type=current_user.profile_photo_mime or "image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.delete("/profile/photo", response_model=UserResponse)
def delete_profile_photo(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the authenticated user's profile photo."""
    _require_personal_profile(current_user)

    from app.services.profile_photo_service import remove_profile_photo

    updated = remove_profile_photo(db=db, user=current_user)

    log_request_action(
        request,
        db,
        current_user,
        "AUTH_PROFILE_PHOTO_REMOVED",
        "USER",
        current_user.user_id,
        "Profile photo removed.",
    )

    return updated


# =========================================================
# CHANGE PASSWORD
# =========================================================


@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    # -----------------------------------------------------
    # CHECK CURRENT PASSWORD
    # -----------------------------------------------------

    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    # -----------------------------------------------------
    # CHECK PASSWORD MATCH
    # -----------------------------------------------------

    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match",
        )

    # -----------------------------------------------------
    # NEW PASSWORD MUST BE DIFFERENT
    # -----------------------------------------------------

    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    # -----------------------------------------------------
    # HASH NEW PASSWORD
    # -----------------------------------------------------

    current_user.password_hash = hash_password(data.new_password)

    # -----------------------------------------------------
    # REVOKE OLD TOKENS
    # -----------------------------------------------------

    current_user.token_version += 1

    # -----------------------------------------------------
    # UPDATE TIME
    # -----------------------------------------------------

    current_user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    db.commit()

    log_request_action(
        request,
        db,
        current_user,
        "AUTH_PASSWORD_CHANGED",
        "USER",
        current_user.user_id,
        "Password changed; existing tokens revoked.",
    )

    return {"message": "Password changed successfully. Please login again."}


# =========================================================
# LOGOUT
# =========================================================


@router.post("/logout")
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    # -----------------------------------------------------
    # INVALIDATE EXISTING TOKENS
    # -----------------------------------------------------

    current_user.token_version += 1

    current_user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()

    log_request_action(
        request,
        db,
        current_user,
        "AUTH_LOGOUT",
        "USER",
        current_user.user_id,
        f"User {current_user.email} logged out.",
    )

    return {"message": "Logged out successfully"}


# =========================================================
# SEND OTP (EMAIL + SMS - EXPLICIT CHANNEL ONLY)
# =========================================================


@router.post("/send-otp")
def send_otp(data: SendOTPRequest, request: Request, db: Session = Depends(get_db)):

    # -----------------------------------------------------
    # CLEAN EMAIL + RESOLVE CHANNEL
    # -----------------------------------------------------

    email = str(data.email).lower().strip() if data.email else None

    channel = (data.channel or "email").lower().strip()
    if channel not in ("email", "sms"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid channel. Allowed values: email, sms",
        )

    # -----------------------------------------------------
    # VALIDATE AND FIND USER
    # -----------------------------------------------------

    normalized_phone: str | None = None
    user: User | None = None

    if channel == "sms":
        normalized_phone = normalize_indian_phone(data.phone)
        if not normalized_phone:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Valid phone number is required when channel is sms",
            )
        user = find_user_by_phone(db, data.phone)
        if not user and email:
            user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this phone number",
            )
    else:
        if not email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email address is required when channel is email",
            )
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid email address",
            )

    # -----------------------------------------------------
    # RATE LIMIT (abuse protection)
    # -----------------------------------------------------

    if _password_reset_rate_limited(db, user.user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests. Please try again later.",
        )

    # -----------------------------------------------------
    # INVALIDATE PREVIOUS UNUSED OTPS FOR THIS CHANNEL
    # -----------------------------------------------------

    db.query(OTPVerification).filter(
        OTPVerification.user_id == user.user_id,
        OTPVerification.channel == channel,
        OTPVerification.used.is_(False),
    ).update({"used": True})

    # -----------------------------------------------------
    # SMS CHANNEL USES TWILIO VERIFY (NO LOCAL OTP ROW)
    # -----------------------------------------------------
    # Twilio Trial rejects custom Messaging bodies (error 21608), so the
    # SMS OTP path starts a Twilio Verify verification instead. Twilio
    # owns OTP generation, delivery (trial-approved template) and expiry;
    # nothing OTP-related is stored locally. Success here means Twilio
    # *accepted* the verification (status pending) — never "delivered".
    if channel == "sms":
        verify_phone = (
            normalized_phone
            or normalize_indian_phone(user.phone)
            or ""
        )
        verify_result = start_sms_verification(
            recipient_phone=verify_phone,
        )
        provider_error = (
            verify_result.get("error")
            if isinstance(verify_result, dict)
            else None
        )
        if not isinstance(verify_result, dict) or not verify_result.get(
            "success"
        ):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "SMS verification failed: "
                    f"{provider_error or 'unknown error'}"
                ),
            )

        log_request_action(
            request,
            db,
            user,
            "AUTH_OTP_SENT",
            "USER",
            user.user_id if user else None,
            "Twilio Verify SMS verification started.",
        )

        return {
            "message": "OTP sent successfully",
            "channel": channel,
        }

    # -----------------------------------------------------
    # GENERATE 6 DIGIT OTP
    # -----------------------------------------------------

    otp = f"{secrets.randbelow(900000) + 100000:06d}"

    # -----------------------------------------------------
    # HASH OTP
    # -----------------------------------------------------

    otp_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # -----------------------------------------------------
    # CREATE OTP RECORD (EXPLICIT CHANNEL)
    # -----------------------------------------------------

    otp_record = OTPVerification(
        user_id=user.user_id,
        otp_hash=otp_hash,
        channel=channel,
        expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        used=False,
        created_at=now,
    )

    # -----------------------------------------------------
    # SAVE OTP
    # -----------------------------------------------------

    db.add(otp_record)
    db.commit()

    # -----------------------------------------------------
    # SEND VIA EMAIL (SMS RETURNS EARLIER VIA TWILIO VERIFY)
    # -----------------------------------------------------

    try:
        result = send_otp_email(
            recipient_email=user.email,
            otp=otp,
        )
        provider_error = result.get("error") if isinstance(result, dict) else None
        if not isinstance(result, dict) or not result.get("success"):
            try:
                otp_record.used = True
                db.commit()
            except Exception:
                db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"Email delivery failed: {provider_error or 'unknown error'}"
                ),
            )

    except HTTPException:
        raise

    except Exception as exc:
        logger.error(f"OTP delivery error ({channel}): {exc}")
        try:
            otp_record.used = True
            db.commit()
        except Exception:
            db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to send OTP",
        )

    # -----------------------------------------------------
    # SUCCESS
    # -----------------------------------------------------

    log_request_action(
        request,
        db,
        user,
        "AUTH_OTP_SENT",
        "USER",
        user.user_id if user else None,
        f"OTP sent via {channel}.",
    )

    return {
        "message": "OTP sent successfully",
        "channel": channel,
    }


# =========================================================
# VERIFY EMAIL OTP
# =========================================================


@router.post("/verify-otp")
def verify_otp(data: VerifyOTPRequest, request: Request, db: Session = Depends(get_db)):

    # -----------------------------------------------------
    # CLEAN IDENTIFIER AND FIND USER
    # -----------------------------------------------------

    channel = (data.channel or "email").lower().strip()
    email = str(data.email).lower().strip() if data.email else None
    user: User | None = None

    if channel == "sms":
        if data.phone:
            user = find_user_by_phone(db, data.phone)
        if not user and email:
            user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this phone number",
            )
    else:
        if not email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email address is required when channel is email",
            )
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid email address",
            )

    # -----------------------------------------------------
    # SMS CHANNEL IS VERIFIED BY TWILIO VERIFY (NO LOCAL OTP ROW)
    # -----------------------------------------------------
    # The Verify-started code is checked with Twilio, never against a
    # local hash. On approval the flow converges below with the email
    # path at reset-token issuance (same user/channel/expiry/one-time
    # guarantees; Twilio owns OTP expiry and single-attempt semantics).

    otp_record = None
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if channel == "sms":
        check_phone = (
            normalize_indian_phone(data.phone)
            or (normalize_indian_phone(user.phone) if user else None)
            or ""
        )
        check_result = check_sms_verification(
            recipient_phone=check_phone,
            code=data.otp,
        )
        if isinstance(check_result, dict) and check_result.get("expired"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP has expired",
            )
        if not isinstance(check_result, dict) or not check_result.get(
            "approved"
        ):
            log_request_action(
                request,
                db,
                user,
                "AUTH_OTP_FAILED",
                "USER",
                user.user_id,
                "OTP verification failed: invalid code (Twilio Verify).",
            )

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP"
            )
    else:
        # -----------------------------------------------------
        # FIND LATEST ACTIVE OTP
        # -----------------------------------------------------

        otp_record = (
            db.query(OTPVerification)
            .filter(
                OTPVerification.user_id == user.user_id,
                OTPVerification.channel == channel,
                OTPVerification.used.is_(False),
            )
            .order_by(OTPVerification.created_at.desc())
            .first()
        )

        if not otp_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP not found or already used",
            )

        # -----------------------------------------------------
        # CURRENT TIME
        # -----------------------------------------------------

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # -----------------------------------------------------
        # CHECK OTP EXPIRATION
        # -----------------------------------------------------

        if otp_record.expires_at < now:
            otp_record.used = True

            db.commit()

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="OTP has expired"
            )

        # -----------------------------------------------------
        # HASH ENTERED OTP
        # -----------------------------------------------------

        entered_otp_hash = hashlib.sha256(data.otp.encode("utf-8")).hexdigest()

        # -----------------------------------------------------
        # CHECK OTP (constant-time compare to avoid timing oracle)
        # -----------------------------------------------------

        if not hmac.compare_digest(entered_otp_hash, otp_record.otp_hash):
            log_request_action(
                request,
                db,
                user,
                "AUTH_OTP_FAILED",
                "USER",
                user.user_id,
                "OTP verification failed: invalid code.",
            )

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP"
            )

    # -----------------------------------------------------
    # INVALIDATE OLD RESET TOKENS
    # -----------------------------------------------------

    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.user_id,
        PasswordResetToken.used.is_(False),
    ).update({"used": True})

    # -----------------------------------------------------
    # CREATE NEW RESET TOKEN
    # -----------------------------------------------------

    raw_reset_token = secrets.token_urlsafe(32)

    token_hash = hash_reset_token(raw_reset_token)

    # -----------------------------------------------------
    # CREATE RESET RECORD
    # -----------------------------------------------------

    reset_record = PasswordResetToken(
        user_id=user.user_id,
        token_hash=token_hash,
        expires_at=now
        + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        used=False,
        created_at=now,
    )

    # -----------------------------------------------------
    # MARK OTP USED (EMAIL PATH ONLY; VERIFY OWNS SMS LIFECYCLE)
    # -----------------------------------------------------

    if otp_record is not None:
        otp_record.used = True

    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    try:
        db.add(reset_record)

        db.commit()

    except Exception as exc:
        db.rollback()

        print("PASSWORD RESET TOKEN ERROR:", exc)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create password reset session",
        )

    # -----------------------------------------------------
    # SUCCESS
    # -----------------------------------------------------

    log_request_action(
        request,
        db,
        user,
        "AUTH_OTP_VERIFIED",
        "USER",
        user.user_id,
        "OTP verified successfully.",
    )

    return {
        "message": "OTP verified successfully",
        "verified": True,
        "reset_token": raw_reset_token,
    }


# =========================================================
# FORGOT PASSWORD
# =========================================================


@router.post("/forgot-password")
def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):

    # -----------------------------------------------------
    # RESOLVE CHANNEL AND FIND USER
    # -----------------------------------------------------

    channel = (data.channel or "email").lower().strip()
    if channel not in ("email", "sms"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid channel. Allowed values: email, sms",
        )

    user: User | None = None
    normalized_phone: str | None = None
    email = str(data.email).lower().strip() if data.email else None

    if channel == "sms":
        normalized_phone = normalize_indian_phone(data.phone)
        if not normalized_phone:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Valid phone number is required when channel is sms",
            )
        user = find_user_by_phone(db, data.phone)
        if not user and email:
            user = db.query(User).filter(User.email == email).first()
        generic_response = {
            "message": "If an account exists with this phone number, "
            "a verification code has been sent."
        }
    else:
        if not email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email address is required when channel is email",
            )
        user = db.query(User).filter(User.email == email).first()
        generic_response = {
            "message": "If an account exists with this email, "
            "a verification code has been sent."
        }

    # -----------------------------------------------------
    # DO NOT REVEAL ACCOUNT EXISTENCE
    # -----------------------------------------------------

    if not user:
        return generic_response

    # Inactive accounts get the same generic response without an email,
    # so existence/activity cannot be probed.
    if not user.is_active:
        return generic_response

    # Abuse protection: same generic response, no new OTP/email.
    if _password_reset_rate_limited(db, user.user_id):
        logger.warning("Password-reset rate limited for user_id=%s", user.user_id)
        return generic_response

    # -----------------------------------------------------
    # INVALIDATE OLD UNUSED OTPS FOR THIS CHANNEL
    # -----------------------------------------------------

    db.query(OTPVerification).filter(
        OTPVerification.user_id == user.user_id,
        OTPVerification.channel == channel,
        OTPVerification.used.is_(False),
    ).update({"used": True})

    # -----------------------------------------------------
    # INVALIDATE OLD RESET TOKENS
    # -----------------------------------------------------

    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.user_id,
        PasswordResetToken.used.is_(False),
    ).update({"used": True})

    # -----------------------------------------------------
    # SMS CHANNEL USES TWILIO VERIFY (NO LOCAL OTP ROW)
    # -----------------------------------------------------
    # Twilio Trial rejects custom Messaging bodies (error 21608), so the
    # SMS OTP path starts a Twilio Verify verification instead. Twilio
    # owns OTP generation, delivery (trial-approved template) and expiry;
    # nothing OTP-related is stored locally. Success here means Twilio
    # *accepted* the verification (status pending) — never "delivered".
    if channel == "sms":
        verify_phone = (
            normalized_phone
            or normalize_indian_phone(user.phone)
            or ""
        )
        verify_result = start_sms_verification(
            recipient_phone=verify_phone,
        )
        provider_error = (
            verify_result.get("error")
            if isinstance(verify_result, dict)
            else None
        )
        if not isinstance(verify_result, dict) or not verify_result.get(
            "success"
        ):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "SMS verification failed: "
                    f"{provider_error or 'unknown error'}"
                ),
            )

        log_request_action(
            request,
            db,
            user,
            "AUTH_PASSWORD_RESET_REQUESTED",
            "USER",
            user.user_id if user else None,
            "Twilio Verify SMS verification started.",
        )

        return generic_response

    # -----------------------------------------------------
    # GENERATE 6 DIGIT OTP
    # -----------------------------------------------------

    otp = f"{secrets.randbelow(900000) + 100000:06d}"

    # -----------------------------------------------------
    # HASH OTP
    # -----------------------------------------------------

    otp_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # -----------------------------------------------------
    # CREATE OTP RECORD (EXPLICIT CHANNEL)
    # -----------------------------------------------------

    otp_record = OTPVerification(
        user_id=user.user_id,
        otp_hash=otp_hash,
        channel=channel,
        expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        used=False,
        created_at=now,
    )

    # -----------------------------------------------------
    # SAVE OTP
    # -----------------------------------------------------

    db.add(otp_record)

    try:
        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create verification code",
        )

    # -----------------------------------------------------
    # SEND OTP VIA EMAIL (SMS RETURNS EARLIER VIA TWILIO VERIFY)
    # -----------------------------------------------------

    try:
        result = send_otp_email(
            recipient_email=user.email,
            otp=otp,
        )
        provider_error = result.get("error") if isinstance(result, dict) else None
        if not isinstance(result, dict) or not result.get("success"):
            try:
                otp_record.used = True
                db.commit()
            except Exception:
                db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    f"Email delivery failed: {provider_error or 'unknown error'}"
                ),
            )

    except HTTPException:
        raise

    except Exception as exc:
        logger.error(f"Forgot-password delivery error ({channel}): {exc}")

        try:
            otp_record.used = True

            db.commit()

        except Exception:
            db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to send verification code",
        )

    # -----------------------------------------------------
    # SUCCESS (GENERIC TO PRESERVE ANTI-ENUMERATION)
    # -----------------------------------------------------

    log_request_action(
        request,
        db,
        user,
        "AUTH_PASSWORD_RESET_REQUESTED",
        "USER",
        user.user_id if user else None,
        f"Password reset code sent via {channel}.",
    )

    return generic_response


# =========================================================
# FORGOT PASSWORD (RESET LINK)
# =========================================================


@router.post("/forgot-password-link")
def forgot_password_link(
    data: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Link-based reset: email a single-use FRONTEND_URL reset link.

    Keeps the OTP flow untouched. The link points at the Angular route
    /auth/password-reset?token=... so the frontend can validate it and
    let the user set a new password without an OTP round-trip.
    """
    email = str(data.email).lower().strip() if data.email else None
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email address is required",
        )
    generic_response = {
        "message": "If an account exists with this email, "
        "a password reset link has been sent."
    }
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        return generic_response
    if _password_reset_rate_limited(db, user.user_id):
        logger.warning("Password-reset-link rate limited for user_id=%s", user.user_id)
        return generic_response

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.user_id,
        PasswordResetToken.used.is_(False),
    ).update({"used": True})

    raw_token = secrets.token_urlsafe(32)
    record = PasswordResetToken(
        user_id=user.user_id,
        token_hash=hash_reset_token(raw_token),
        expires_at=now
        + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        used=False,
        created_at=now,
    )
    db.add(record)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create password reset link",
        )

    result = send_password_reset_email(
        recipient_email=user.email,
        reset_token=raw_token,
    )
    if isinstance(result, dict) and not result.get("success"):
        try:
            record.used = True
            db.commit()
        except Exception:
            db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Email delivery failed: {result.get('error') or 'unknown error'}",
        )

    log_request_action(
        request,
        db,
        user,
        "AUTH_PASSWORD_RESET_LINK_SENT",
        "USER",
        user.user_id,
        "Password reset link sent.",
    )
    return generic_response


# =========================================================
# RESET TOKEN STATUS (for frontend link validation)
# =========================================================


@router.get("/reset-token-status")
def reset_token_status(
    token: str,
    db: Session = Depends(get_db),
):
    """Validate a reset link without consuming it.

    Returns distinct statuses so the frontend can show valid / expired /
    invalid / already-used messages.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset link",
        )
    record = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == hash_reset_token(token.strip()))
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset link",
        )
    if record.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used",
        )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if record.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has expired",
        )
    return {"valid": True, "message": "Reset link is valid"}


# =========================================================
# DELETE CURRENT ACCOUNT
# =========================================================


@router.delete("/account")
def delete_account(
    data: DeleteAccountRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    # -----------------------------------------------------
    # VERIFY PASSWORD
    # -----------------------------------------------------

    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    user_id = current_user.user_id
    deleted_email = current_user.email
    deleted_role = current_user.role

    try:
        # -------------------------------------------------
        # DELETE RESET TOKENS
        # -------------------------------------------------
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user_id
        ).delete(synchronize_session=False)

        # -------------------------------------------------
        # DELETE NON-CASCADE USER DATA
        # -------------------------------------------------
        db.execute(
            text("DELETE FROM scheme_applications WHERE user_id = :user_id"),
            {"user_id": user_id},
        )

        db.execute(
            text("DELETE FROM search_history WHERE user_id = :user_id"),
            {"user_id": user_id},
        )

        db.execute(
            text("DELETE FROM support_queries WHERE user_id = :user_id"),
            {"user_id": user_id},
        )

        # -------------------------------------------------
        # DELETE USER
        # -------------------------------------------------
        db.delete(current_user)
        db.commit()

    except Exception as exc:
        db.rollback()
        print("ACCOUNT DELETE ERROR:", exc)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete account",
        )

    # NOTE: logged with user_id=None because the user row no longer exists
    # (audit_logs.user_id references users.user_id).
    log_request_action(
        request,
        db,
        None,
        "AUTH_ACCOUNT_DELETED",
        "USER",
        None,
        f"Account {deleted_email} ({deleted_role}, user_id {user_id}) self-deleted.",
    )

    return {"message": "Account deleted successfully"}


# =========================================================
# SAFE ADMIN USER REMOVAL HELPER
# =========================================================


def _admin_remove_user_safely(
    user: User,
    current_user: User,
    request: Request,
    db: Session,
) -> dict[str, Any]:
    """
    Safely delete a user account requested by an authenticated Admin.
    Enforces security validations, checks for blocking associated records,
    disassociates retained records without silent deletion, and performs
    the deletion within a single database transaction with audit logging.
    """
    if user.user_id == current_user.user_id or (
        user.email
        and current_user.email
        and user.email.strip().lower() == current_user.email.strip().lower()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own administrator account.",
        )

    # -----------------------------------------------------
    # INSPECT RELATED BLOCKING RECORDS
    # -----------------------------------------------------
    from app.models.feedback import Feedback
    from app.models.policy import Policy
    from app.models.report import Report
    from app.models.scheme import Scheme
    from app.models.support_query import SupportQuery

    # Check for active policies created by this user
    has_policies = (
        db.query(Policy.policy_id)
        .filter(Policy.created_by == user.user_id)
        .first()
    )
    if has_policies:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete user with active policy assignments.",
        )

    # Check for active schemes created by this user
    has_schemes = (
        db.query(Scheme.scheme_id)
        .filter(Scheme.created_by == user.user_id)
        .first()
    )
    if has_schemes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete user with active scheme assignments.",
        )

    # Check for generated reports (reports.generated_by is NOT NULL)
    has_reports = (
        db.query(Report.report_id)
        .filter(Report.generated_by == user.user_id)
        .first()
    )
    if has_reports:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete user with associated report records.",
        )

    # Check for feedback (feedback.user_id is NOT NULL)
    has_feedback = (
        db.query(Feedback.feedback_id)
        .filter(Feedback.user_id == user.user_id)
        .first()
    )
    if has_feedback:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete user with associated feedback records.",
        )

    # Check for support queries (support_queries.user_id is NOT NULL)
    has_queries = (
        db.query(SupportQuery.query_id)
        .filter(SupportQuery.user_id == user.user_id)
        .first()
    )
    if has_queries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete user with associated support tickets.",
        )

    removed_id = user.user_id
    removed_email = user.email
    removed_phone = user.phone
    removed_role = user.role

    try:
        # Disassociate retained non-blocking records without deleting them
        db.execute(
            text("UPDATE audit_logs SET user_id = NULL WHERE user_id = :uid"),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE notifications SET user_id = NULL WHERE user_id = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE policies SET approved_by = NULL WHERE approved_by = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE policies SET archive_requested_by = NULL WHERE archive_requested_by = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE policies SET delete_requested_by = NULL WHERE delete_requested_by = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE schemes SET approved_by = NULL WHERE approved_by = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE schemes SET archive_requested_by = NULL WHERE archive_requested_by = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE schemes SET delete_requested_by = NULL WHERE delete_requested_by = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE support_queries SET assigned_to = NULL WHERE assigned_to = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE chatbot_conversations SET user_id = NULL WHERE user_id = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE chatbot_usage SET user_id = NULL WHERE user_id = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE policy_documents SET uploaded_by = NULL WHERE uploaded_by = :uid"
            ),
            {"uid": removed_id},
        )
        db.execute(
            text(
                "UPDATE scheme_documents SET uploaded_by = NULL WHERE uploaded_by = :uid"
            ),
            {"uid": removed_id},
        )

        # Clean up user-specific non-cascade records per established cleanup rules
        db.execute(
            text("DELETE FROM search_history WHERE user_id = :uid"),
            {"uid": removed_id},
        )
        db.execute(
            text("DELETE FROM scheme_applications WHERE user_id = :uid"),
            {"uid": removed_id},
        )

        # Delete user
        db.delete(user)
        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Admin delete user failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove user due to a database constraint or error.",
        )

    log_request_action(
        request,
        db,
        current_user,
        "AUTH_ADMIN_USER_DELETED",
        "USER",
        None,
        f"Admin deleted user {removed_email or removed_phone} ({removed_role}, user_id {removed_id}).",
    )

    response_payload: dict[str, Any] = {"message": "User deleted successfully"}
    if removed_email:
        response_payload["email"] = removed_email
    if removed_phone:
        response_payload["phone"] = removed_phone
    return response_payload


# =========================================================
# DELETE USER BY EMAIL
# =========================================================


@router.delete("/users/email/{email}")
def delete_user(
    email: str,
    request: Request,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(func.lower(User.email) == email.strip().lower())
        .first()
    )

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return _admin_remove_user_safely(user, current_user, request, db)


# =========================================================
# DELETE USER BY PHONE
# =========================================================


@router.delete("/users/phone/{phone}")
def delete_user_by_phone(
    phone: str,
    request: Request,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.phone == phone.strip()).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return _admin_remove_user_safely(user, current_user, request, db)


# =========================================================
# DELETE USER BY ID
# =========================================================


@router.delete("/users/{user_id}")
def delete_user_by_id(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return _admin_remove_user_safely(user, current_user, request, db)


# =========================================================
# RESET PASSWORD
# =========================================================


@router.post("/reset-password")
def reset_password(
    data: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # CHECK PASSWORD MATCH
    # -----------------------------------------------------

    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match",
        )

    # -----------------------------------------------------
    # HASH TOKEN
    # -----------------------------------------------------

    token_hash = hash_reset_token(data.token)

    # -----------------------------------------------------
    # FIND RESET TOKEN
    # -----------------------------------------------------

    reset_record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used.is_(False),
        )
        .first()
    )

    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used reset token",
        )

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # -----------------------------------------------------
    # CHECK EXPIRATION
    # -----------------------------------------------------

    if reset_record.expires_at < now:
        reset_record.used = True

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired",
        )

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(User.user_id == reset_record.user_id).first()

    if not user:
        reset_record.used = True

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset request",
        )

    # -----------------------------------------------------
    # UPDATE PASSWORD
    # -----------------------------------------------------

    user.password_hash = hash_password(data.new_password)

    # -----------------------------------------------------
    # INVALIDATE OLD TOKENS
    # -----------------------------------------------------

    user.token_version += 1

    user.updated_at = now

    # -----------------------------------------------------
    # MARK TOKEN USED
    # -----------------------------------------------------

    reset_record.used = True

    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    db.commit()

    log_request_action(
        request,
        db,
        user,
        "AUTH_PASSWORD_RESET_COMPLETED",
        "USER",
        user.user_id,
        "Password reset completed via reset token.",
    )

    return {"message": "Password reset successfully. Please login again."}


# =========================================================
# ADMIN TEST
# =========================================================


@router.get("/admin-test")
def admin_test(current_user: User = Depends(require_roles("ADMIN"))):
    return {
        "message": "Administrator access granted",
        "user_id": current_user.user_id,
        "role": normalize_role(current_user.role),
    }


# =========================================================
# GOVERNMENT TEST
# =========================================================


@router.get("/government-test")
def government_test(
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):
    return {
        "message": "Government access granted",
        "user_id": current_user.user_id,
        "role": normalize_role(current_user.role),
    }


# =========================================================
# RESEARCHER TEST
# =========================================================


@router.get("/researcher-test")
def researcher_test(current_user: User = Depends(require_roles("RESEARCHER"))):
    return {
        "message": "Researcher access granted",
        "user_id": current_user.user_id,
        "role": normalize_role(current_user.role),
    }


# =========================================================
# CITIZEN TEST
# =========================================================


@router.get("/citizen-test")
def citizen_test(current_user: User = Depends(require_roles("CITIZEN"))):
    return {
        "message": "Citizen access granted",
        "user_id": current_user.user_id,
        "role": normalize_role(current_user.role),
    }


# =========================================================
# ORGANIZATION TEST
# =========================================================


@router.get("/organization-test")
def organization_test(
    current_user: User = Depends(require_roles("ORGANIZATION")),
):
    return {
        "message": "Organization access granted",
        "user_id": current_user.user_id,
        "role": normalize_role(current_user.role),
    }
