from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets
import re
import random
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

logger = logging.getLogger("uvicorn.error")
from app.services.email_service import send_otp_email
from app.services.sms_service import normalize_indian_phone, send_otp_sms
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

from app.db.database import get_db

from app.models.password_reset import PasswordResetToken
from app.models.otp import OTPVerification
from app.models.user import User
from app.services.audit_log_service import log_request_action

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
    VerifyOTPRequest,
    UserResponse,
)


# =========================================================
# ROUTER
# =========================================================

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


# =========================================================
# SECURITY
# =========================================================

security = HTTPBearer()


# =========================================================
# GET CURRENT USER
# =========================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
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
            headers={
                "WWW-Authenticate": "Bearer"
            },
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
            headers={
                "WWW-Authenticate": "Bearer"
            },
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
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    # -----------------------------------------------------
    # USER DOES NOT EXIST
    # -----------------------------------------------------

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # -----------------------------------------------------
    # ACCOUNT INACTIVE
    # -----------------------------------------------------

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )

    # -----------------------------------------------------
    # TOKEN VERSION CHECK
    # -----------------------------------------------------

    if (
        (token_version if token_version is not None else 0)
        != (user.token_version or 0)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={
                "WWW-Authenticate": "Bearer"
            },
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

    normalized_allowed_roles = {
        normalize_role(role)
        for role in allowed_roles
    }

    def role_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:

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
        user_id=user.user_id,
        role=user.role,
        token_version=user.token_version
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

    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


# =========================================================
# REGISTER
# =========================================================

@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED
)
def register(
    data: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # CLEAN EMAIL
    # -----------------------------------------------------

    email = str(
        data.email
    ).lower().strip()

    # -----------------------------------------------------
    # CHECK EMAIL
    # -----------------------------------------------------

    existing_email = db.query(User).filter(
        User.email == email
    ).first()

    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered"
        )

    # -----------------------------------------------------
    # CHECK PHONE
    # -----------------------------------------------------

    if data.phone:

        normalized_registration_phone = re.sub(
            r"\D",
            "",
            data.phone
        )

        existing_phone = db.query(User).filter(
            User.phone == normalized_registration_phone
        ).first()

        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number is already registered"
            )

    # -----------------------------------------------------
    # CHECK PASSWORD
    # -----------------------------------------------------

    if data.password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match"
        )

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = datetime.now(
        timezone.utc
    ).replace(
        tzinfo=None
    )

    # -----------------------------------------------------
    # CREATE USER
    # -----------------------------------------------------

    user = User(
        full_name=data.full_name,
        email=email,
        password_hash=hash_password(
            data.password
        ),
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
        updated_at=now
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
                f"{notif_err}")

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or phone number is already registered"
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

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=user
    )


# =========================================================
# LOGIN
# =========================================================

# =========================================================
# LOGIN
# =========================================================

@router.post(
    "/login",
    response_model=AuthResponse
)
def login(
    data: LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # CLEAN IDENTIFIER
    # -----------------------------------------------------

    identifier = data.identifier.strip()

    # -----------------------------------------------------
    # NORMALIZE EMAIL / PHONE
    # -----------------------------------------------------

    normalized_email = identifier.casefold()

    normalized_phone = re.sub(
        r"\D",
        "",
        identifier
    )

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(
        or_(
            func.lower(
                func.trim(User.email)
            ) == normalized_email,

            User.phone == identifier,

            User.phone == normalized_phone
        )
    ).first()

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
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    # -----------------------------------------------------
    # CHECK PASSWORD
    # -----------------------------------------------------

    password_valid = verify_password(
        data.password,
        user.password_hash
    )

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
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    # -----------------------------------------------------
    # CHECK ACCOUNT STATUS
    # -----------------------------------------------------

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
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

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=user
    )


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
    )
)
@router.post(
    "/guest",
    response_model=AuthResponse,
    include_in_schema=False
)
def guest_login(
    db: Session = Depends(get_db)
):
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
            guest_user = db.query(User).filter(
                User.email == guest_email).first()

    token = create_user_token(guest_user)

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=guest_user
    )


# =========================================================
# CURRENT USER
# =========================================================

@router.get(
    "/me",
    response_model=UserResponse
)
def get_me(
    current_user: User = Depends(get_current_user)
):

    return current_user


# =========================================================
# UPDATE PROFILE
# =========================================================

@router.put(
    "/profile",
    response_model=UserResponse
)
def update_profile(
    data: ProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    updates = data.model_dump(
        exclude_unset=True
    )

    # -----------------------------------------------------
    # PHONE VALIDATION
    # -----------------------------------------------------

    if "phone" in updates and updates["phone"]:

        if not updates["phone"].isdigit():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Phone number must contain only digits"
            )

        existing_phone = db.query(User).filter(
            User.phone == updates["phone"],
            User.user_id != current_user.user_id
        ).first()

        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number is already registered"
            )

    # -----------------------------------------------------
    # APPLY UPDATES
    # -----------------------------------------------------

    for field, value in updates.items():

        setattr(
            current_user,
            field,
            value
        )

    # -----------------------------------------------------
    # UPDATE TIMESTAMP
    # -----------------------------------------------------

    current_user.updated_at = (
        datetime.now(
            timezone.utc
        ).replace(
            tzinfo=None
        )
    )

    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    try:

        db.commit()
        db.refresh(current_user)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile update conflicts with existing data"
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
# CHANGE PASSWORD
# =========================================================

@router.post(
    "/change-password"
)
def change_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # CHECK CURRENT PASSWORD
    # -----------------------------------------------------

    if not verify_password(
        data.current_password,
        current_user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )

    # -----------------------------------------------------
    # CHECK PASSWORD MATCH
    # -----------------------------------------------------

    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match"
        )

    # -----------------------------------------------------
    # NEW PASSWORD MUST BE DIFFERENT
    # -----------------------------------------------------

    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )

    # -----------------------------------------------------
    # HASH NEW PASSWORD
    # -----------------------------------------------------

    current_user.password_hash = hash_password(
        data.new_password
    )

    # -----------------------------------------------------
    # REVOKE OLD TOKENS
    # -----------------------------------------------------

    current_user.token_version += 1

    # -----------------------------------------------------
    # UPDATE TIME
    # -----------------------------------------------------

    current_user.updated_at = (
        datetime.now(
            timezone.utc
        ).replace(
            tzinfo=None
        )
    )

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

    return {
        "message": "Password changed successfully. Please login again."
    }


# =========================================================
# LOGOUT
# =========================================================

@router.post(
    "/logout"
)
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # INVALIDATE EXISTING TOKENS
    # -----------------------------------------------------

    current_user.token_version += 1

    current_user.updated_at = (
        datetime.now(
            timezone.utc
        ).replace(
            tzinfo=None
        )
    )

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

    return {
        "message": "Logged out successfully"
    }


# =========================================================
# SEND OTP (EMAIL + SMS - EXPLICIT CHANNEL ONLY)
# =========================================================

@router.post(
    "/send-otp"
)
def send_otp(
    data: SendOTPRequest,
    request: Request,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # CLEAN EMAIL + RESOLVE CHANNEL
    # -----------------------------------------------------

    email = str(data.email).lower().strip() if data.email else None

    channel = (data.channel or "email").lower().strip()
    if channel not in ("email", "sms"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid channel. Allowed values: email, sms"
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
                detail="Valid phone number is required when channel is sms"
            )
        user = find_user_by_phone(db, data.phone)
        if not user and email:
            user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this phone number"
            )
    else:
        if not email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email address is required when channel is email"
            )
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid email address"
            )

    # -----------------------------------------------------
    # INVALIDATE PREVIOUS UNUSED OTPS FOR THIS CHANNEL
    # -----------------------------------------------------

    db.query(
        OTPVerification
    ).filter(
        OTPVerification.user_id == user.user_id,
        OTPVerification.channel == channel,
        OTPVerification.used.is_(False)
    ).update({
        "used": True
    })

    # -----------------------------------------------------
    # GENERATE 6 DIGIT OTP
    # -----------------------------------------------------

    otp = str(
        random.randint(
            100000,
            999999
        )
    )

    # -----------------------------------------------------
    # HASH OTP
    # -----------------------------------------------------

    otp_hash = hashlib.sha256(
        otp.encode("utf-8")
    ).hexdigest()

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = (
        datetime.now(
            timezone.utc
        ).replace(
            tzinfo=None
        )
    )

    # -----------------------------------------------------
    # CREATE OTP RECORD (EXPLICIT CHANNEL)
    # -----------------------------------------------------

    otp_record = OTPVerification(
        user_id=user.user_id,
        otp_hash=otp_hash,
        channel=channel,
        expires_at=now + timedelta(
            minutes=5
        ),
        used=False,
        created_at=now
    )

    # -----------------------------------------------------
    # SAVE OTP
    # -----------------------------------------------------

    db.add(otp_record)
    db.commit()

    # -----------------------------------------------------
    # SEND VIA EXPLICIT CHANNEL (CHECK SUCCESS DICT)
    # -----------------------------------------------------

    try:
        if channel == "sms":
            result = send_otp_sms(
                recipient_phone=normalized_phone or normalize_indian_phone(
                    user.phone) or "",
                otp=otp,
            )
            provider_error = result.get(
                "error") if isinstance(result, dict) else None
            if not isinstance(result, dict) or not result.get("success"):
                try:
                    otp_record.used = True
                    db.commit()
                except Exception:
                    db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                    f"SMS delivery failed: "
                    f"{provider_error or 'unknown error'}"
                ),
                )
        else:
            result = send_otp_email(
                recipient_email=email or user.email,
                otp=otp,
            )
            provider_error = result.get(
                "error") if isinstance(result, dict) else None
            if isinstance(result, dict) and not result.get("success"):
                try:
                    otp_record.used = True
                    db.commit()
                except Exception:
                    db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                    f"Email delivery failed: "
                    f"{provider_error or 'unknown error'}"
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
            detail="Unable to send OTP"
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

@router.post(
    "/verify-otp"
)
def verify_otp(
    data: VerifyOTPRequest,
    request: Request,
    db: Session = Depends(get_db)
):

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
                detail="No account found with this phone number"
            )
    else:
        if not email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email address is required when channel is email"
            )
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid email address"
            )

    # -----------------------------------------------------
    # FIND LATEST ACTIVE OTP
    # -----------------------------------------------------

    otp_record = db.query(
        OTPVerification
    ).filter(
        OTPVerification.user_id == user.user_id,
        OTPVerification.channel == data.channel,
        OTPVerification.used.is_(False)
    ).order_by(
        OTPVerification.created_at.desc()
    ).first()

    if not otp_record:

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="OTP not found or already used"

        )

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = (
        datetime.now(
            timezone.utc
        ).replace(
            tzinfo=None
        )
    )

    # -----------------------------------------------------
    # CHECK OTP EXPIRATION
    # -----------------------------------------------------

    if otp_record.expires_at < now:

        otp_record.used = True

        db.commit()

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="OTP has expired"

        )

    # -----------------------------------------------------
    # HASH ENTERED OTP
    # -----------------------------------------------------

    entered_otp_hash = hashlib.sha256(
            data.otp.encode("utf-8")
        ).hexdigest()

    # -----------------------------------------------------
    # CHECK OTP
    # -----------------------------------------------------

    if (
        entered_otp_hash
        != otp_record.otp_hash
    ):

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

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="Invalid OTP"

        )

    # -----------------------------------------------------
    # INVALIDATE OLD RESET TOKENS
    # -----------------------------------------------------

    db.query(
        PasswordResetToken
    ).filter(
        PasswordResetToken.user_id == user.user_id,
        PasswordResetToken.used.is_(False)
    ).update(
        {
            "used": True
        }
    )

    # -----------------------------------------------------
    # CREATE NEW RESET TOKEN
    # -----------------------------------------------------

    raw_reset_token = secrets.token_urlsafe(32)

    token_hash = hash_reset_token(
            raw_reset_token
        )

    # -----------------------------------------------------
    # CREATE RESET RECORD
    # -----------------------------------------------------

    reset_record = PasswordResetToken(
            user_id=user.user_id,

            token_hash=token_hash,

            expires_at=now + timedelta(
                minutes=15
            ),

            used=False,

            created_at=now,

        )

    # -----------------------------------------------------
    # MARK OTP USED
    # -----------------------------------------------------

    otp_record.used = True

    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    try:

        db.add(
            reset_record
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        print(
            "PASSWORD RESET TOKEN ERROR:",
            exc
        )

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail="Unable to create password reset session"

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

        "message":
            "OTP verified successfully",

        "verified":
            True,

        "reset_token":
            raw_reset_token,

    }


# =========================================================
# FORGOT PASSWORD
# =========================================================

@router.post(
    "/forgot-password"
)
def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # RESOLVE CHANNEL AND FIND USER
    # -----------------------------------------------------

    channel = (data.channel or "email").lower().strip()
    if channel not in ("email", "sms"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid channel. Allowed values: email, sms"
        )

    user: User | None = None
    normalized_phone: str | None = None
    email = str(data.email).lower().strip() if data.email else None

    if channel == "sms":
        normalized_phone = normalize_indian_phone(data.phone)
        if not normalized_phone:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Valid phone number is required when channel is sms"
            )
        user = find_user_by_phone(db, data.phone)
        if not user and email:
            user = db.query(User).filter(User.email == email).first()
        generic_response = {
            "message":
                "If an account exists with this phone number, "
                "a verification code has been sent."
        }
    else:
        if not email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email address is required when channel is email"
            )
        user = db.query(User).filter(User.email == email).first()
        generic_response = {
            "message":
                "If an account exists with this email, "
                "a verification code has been sent."
        }

    # -----------------------------------------------------
    # DO NOT REVEAL ACCOUNT EXISTENCE
    # -----------------------------------------------------

    if not user:

        return generic_response

    # -----------------------------------------------------
    # INVALIDATE OLD UNUSED OTPS FOR THIS CHANNEL
    # -----------------------------------------------------

    db.query(
        OTPVerification
    ).filter(
        OTPVerification.user_id == user.user_id,
        OTPVerification.channel == channel,
        OTPVerification.used.is_(False)
    ).update(
        {
            "used": True
        }
    )

    # -----------------------------------------------------
    # INVALIDATE OLD RESET TOKENS
    # -----------------------------------------------------

    db.query(
        PasswordResetToken
    ).filter(
        PasswordResetToken.user_id == user.user_id,
        PasswordResetToken.used.is_(False)
    ).update(
        {
            "used": True
        }
    )

    # -----------------------------------------------------
    # GENERATE 6 DIGIT OTP
    # -----------------------------------------------------

    otp = str(
        random.randint(
            100000,
            999999
        )
    )

    # -----------------------------------------------------
    # HASH OTP
    # -----------------------------------------------------

    otp_hash = hashlib.sha256(
        otp.encode("utf-8")
    ).hexdigest()

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = (
        datetime.now(
            timezone.utc
        ).replace(
            tzinfo=None
        )
    )

    # -----------------------------------------------------
    # CREATE OTP RECORD (EXPLICIT CHANNEL)
    # -----------------------------------------------------

    otp_record = OTPVerification(

        user_id=user.user_id,

        otp_hash=otp_hash,

        channel=channel,

        expires_at=now + timedelta(
            minutes=5
        ),

        used=False,

        created_at=now,

    )

    # -----------------------------------------------------
    # SAVE OTP
    # -----------------------------------------------------

    db.add(
        otp_record
    )

    try:

        db.commit()

    except Exception:

        db.rollback()

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail="Unable to create verification code"

        )

    # -----------------------------------------------------
    # SEND OTP VIA EXPLICIT CHANNEL ONLY
    # -----------------------------------------------------

    try:

        if channel == "sms":

            result = send_otp_sms(

                recipient_phone=normalized_phone or "",

                otp=otp,

            )
            provider_error = result.get(
                "error") if isinstance(result, dict) else None
            if not isinstance(result, dict) or not result.get("success"):
                try:
                    otp_record.used = True
                    db.commit()
                except Exception:
                    db.rollback()
                raise HTTPException(

                    status_code=status.HTTP_502_BAD_GATEWAY,

                    detail=(
                    f"SMS delivery failed: "
                    f"{provider_error or 'unknown error'}"
                )

                )

        else:

            result = send_otp_email(

                recipient_email=email,

                otp=otp,

            )
            provider_error = result.get(
                "error") if isinstance(result, dict) else None
            if isinstance(result, dict) and not result.get("success"):
                try:
                    otp_record.used = True
                    db.commit()
                except Exception:
                    db.rollback()
                raise HTTPException(

                    status_code=status.HTTP_502_BAD_GATEWAY,

                    detail=(
                    f"Email delivery failed: "
                    f"{provider_error or 'unknown error'}"
                )

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

            detail="Unable to send verification code"

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
# DELETE CURRENT ACCOUNT
# =========================================================

@router.delete("/account")
def delete_account(
    data: DeleteAccountRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # VERIFY PASSWORD
    # -----------------------------------------------------

    if not verify_password(
        data.password,
        current_user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
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
            {"user_id": user_id}
        )

        db.execute(
            text("DELETE FROM search_history WHERE user_id = :user_id"),
            {"user_id": user_id}
        )

        db.execute(
            text("DELETE FROM support_queries WHERE user_id = :user_id"),
            {"user_id": user_id}
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
            detail="Unable to delete account"
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
        f"Account {deleted_email} ({deleted_role}, user_id {user_id}) "
        "self-deleted.",
    )

    return {
        "message": "Account deleted successfully"
    }


# =========================================================
# DELETE USER BY EMAIL
# =========================================================

@router.delete(
    "/users/email/{email}"
)
def delete_user(
    email: str,
    request: Request,
    current_user: User = Depends(
        require_roles("ADMIN")
    ),
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.email == email
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # -----------------------------------------------------
    # DELETE
    # -----------------------------------------------------

    removed_id = user.user_id
    removed_role = user.role

    db.delete(user)
    db.commit()

    log_request_action(
        request,
        db,
        current_user,
        "AUTH_ADMIN_USER_DELETED",
        "USER",
        None,
        f"Admin deleted user {email} ({removed_role}, "
        f"user_id {removed_id}).",
    )

    return {
        "message": "User deleted successfully",
        "email": email
    }


# =========================================================
# DELETE USER BY PHONE
# =========================================================

@router.delete(
    "/users/phone/{phone}"
)
def delete_user_by_phone(
    phone: str,
    request: Request,
    current_user: User = Depends(
        require_roles("ADMIN")
    ),
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.phone == phone
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # -----------------------------------------------------
    # DELETE
    # -----------------------------------------------------

    removed_id = user.user_id
    removed_role = user.role

    db.delete(user)
    db.commit()

    log_request_action(
        request,
        db,
        current_user,
        "AUTH_ADMIN_USER_DELETED",
        "USER",
        None,
        f"Admin deleted user with phone {phone} ({removed_role}, "
        f"user_id {removed_id}).",
    )

    return {
        "message": "User deleted successfully",
        "phone": phone
    }


# =========================================================
# RESET PASSWORD
# =========================================================

@router.post(
    "/reset-password"
)
def reset_password(
    data: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # CHECK PASSWORD MATCH
    # -----------------------------------------------------

    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match"
        )

    # -----------------------------------------------------
    # HASH TOKEN
    # -----------------------------------------------------

    token_hash = hash_reset_token(
        data.token
    )

    # -----------------------------------------------------
    # FIND RESET TOKEN
    # -----------------------------------------------------

    reset_record = db.query(
        PasswordResetToken
    ).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used.is_(False)
    ).first()

    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used reset token"
        )

    # -----------------------------------------------------
    # CURRENT TIME
    # -----------------------------------------------------

    now = (
        datetime.now(
            timezone.utc
        ).replace(
            tzinfo=None
        )
    )

    # -----------------------------------------------------
    # CHECK EXPIRATION
    # -----------------------------------------------------

    if reset_record.expires_at < now:

        reset_record.used = True

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.user_id == reset_record.user_id
    ).first()

    if not user:

        reset_record.used = True

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset request"
        )

    # -----------------------------------------------------
    # UPDATE PASSWORD
    # -----------------------------------------------------

    user.password_hash = hash_password(
        data.new_password
    )

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

    return {
        "message": "Password reset successfully. Please login again."
    }


# =========================================================
# ADMIN TEST
# =========================================================

@router.get("/admin-test")
def admin_test(
    current_user: User = Depends(
        require_roles("ADMIN")
    )
):
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
    current_user: User = Depends(
        require_roles("GOVERNMENT_OFFICIAL")
    )
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
def researcher_test(
    current_user: User = Depends(
        require_roles("RESEARCHER")
    )
):
    return {
        "message": "Researcher access granted",
        "user_id": current_user.user_id,
        "role": normalize_role(current_user.role),
    }


# =========================================================
# CITIZEN TEST
# =========================================================

@router.get("/citizen-test")
def citizen_test(
    current_user: User = Depends(
        require_roles("CITIZEN")
    )
):
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
    current_user: User = Depends(
        require_roles("ORGANIZATION")
    )
):
    return {
        "message": "Organization access granted",
        "user_id": current_user.user_id,
        "role": normalize_role(current_user.role),
    }
