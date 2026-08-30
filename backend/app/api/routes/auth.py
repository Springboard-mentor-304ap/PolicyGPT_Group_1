from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.db.database import get_db
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


security = HTTPBearer()


# =========================================================
# HELPERS
# =========================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:

    token = credentials.credentials

    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    token_version = payload.get("ver")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(
        User.user_id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )

    if token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_roles(*allowed_roles: str):

    def role_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:

        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource"
            )

        return current_user

    return role_checker


def create_user_token(user: User) -> str:

    return create_access_token(
        user_id=user.user_id,
        role=user.role,
        token_version=user.token_version
    )


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
    db: Session = Depends(get_db)
):

    email = str(data.email).lower().strip()

    existing_email = db.query(User).filter(
        User.email == email
    ).first()

    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered"
        )

    if data.phone:

        existing_phone = db.query(User).filter(
            User.phone == data.phone
        ).first()

        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number is already registered"
            )

    if data.password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match"
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    user = User(
        full_name=data.full_name,
        email=email,
        password_hash=hash_password(data.password),
        role=data.role,
        phone=data.phone,
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

    try:

        db.add(user)
        db.commit()
        db.refresh(user)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or phone number is already registered"
        )

    token = create_user_token(user)

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=user
    )


# =========================================================
# LOGIN
# =========================================================

@router.post(
    "/login",
    response_model=AuthResponse
)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db)
):

    identifier = data.identifier.strip()

    user = db.query(User).filter(
        or_(
            User.email == identifier.lower(),
            User.phone == identifier
        )
    ).first()

    if not user:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/phone or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(
        data.password,
        user.password_hash
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/phone or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )

    token = create_user_token(user)

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=user
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    updates = data.model_dump(
        exclude_unset=True
    )

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

    for field, value in updates.items():

        setattr(
            current_user,
            field,
            value
        )

    current_user.updated_at = (
        datetime.now(timezone.utc)
        .replace(tzinfo=None)
    )

    try:

        db.commit()
        db.refresh(current_user)

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile update conflicts with existing data"
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if not verify_password(
        data.current_password,
        current_user.password_hash
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )

    if data.new_password != data.confirm_password:

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match"
        )

    if data.current_password == data.new_password:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )

    current_user.password_hash = hash_password(
        data.new_password
    )

    # Revoke all existing JWTs
    current_user.token_version += 1

    current_user.updated_at = (
        datetime.now(timezone.utc)
        .replace(tzinfo=None)
    )

    db.commit()

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # Incrementing this invalidates existing tokens.
    current_user.token_version += 1

    current_user.updated_at = (
        datetime.now(timezone.utc)
        .replace(tzinfo=None)
    )

    db.commit()

    return {
        "message": "Logged out successfully"
    }


# =========================================================
# FORGOT PASSWORD
# =========================================================

@router.post(
    "/forgot-password"
)
def forgot_password(
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):

    email = str(data.email).lower().strip()

    user = db.query(User).filter(
        User.email == email
    ).first()

    # Do not reveal whether email exists.
    generic_response = {
        "message": "If an account exists with this email, a password reset link has been generated."
    }

    if not user:
        return generic_response

    # Invalidate previous unused tokens.
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.user_id,
        PasswordResetToken.used == False
    ).update({
        "used": True
    })

    raw_token = secrets.token_urlsafe(32)

    token_hash = hash_reset_token(raw_token)

    now = datetime.now(timezone.utc).replace(
        tzinfo=None
    )

    reset_token = PasswordResetToken(
        user_id=user.user_id,
        token_hash=token_hash,
        expires_at=now + timedelta(minutes=15),
        used=False,
        created_at=now
    )

    db.add(reset_token)
    db.commit()

    # DEVELOPMENT ONLY
    if settings.DEBUG:

        return {
            **generic_response,
            "development_reset_token": raw_token
        }

    return generic_response


# =========================================================
# RESET PASSWORD
# =========================================================

@router.post(
    "/reset-password"
)
def reset_password(
    data: ResetPasswordRequest,
    db: Session = Depends(get_db)
):

    if data.new_password != data.confirm_password:

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Passwords do not match"
        )

    token_hash = hash_reset_token(
        data.token
    )

    reset_record = db.query(
        PasswordResetToken
    ).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used == False
    ).first()

    if not reset_record:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used reset token"
        )

    now = datetime.now(timezone.utc).replace(
        tzinfo=None
    )

    if reset_record.expires_at < now:

        reset_record.used = True

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )

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

    user.password_hash = hash_password(
        data.new_password
    )

    # Invalidate all existing JWTs.
    user.token_version += 1

    user.updated_at = now

    reset_record.used = True

    db.commit()

    return {
        "message": "Password reset successfully. Please login again."
    }


# =========================================================
# ROLE PROTECTED TEST ENDPOINTS
# =========================================================

@router.get(
    "/admin-test"
)
def admin_test(
    current_user: User = Depends(
        require_roles("ADMINISTRATOR")
    )
):

    return {
        "message": "Administrator access granted",
        "user_id": current_user.user_id,
        "role": current_user.role
    }


@router.get(
    "/government-test"
)
def government_test(
    current_user: User = Depends(
        require_roles(
            "ADMINISTRATOR",
            "GOVERNMENT_OFFICIAL"
        )
    )
):

    return {
        "message": "Government access granted",
        "user_id": current_user.user_id,
        "role": current_user.role
    }


@router.get(
    "/researcher-test"
)
def researcher_test(
    current_user: User = Depends(
        require_roles(
            "ADMINISTRATOR",
            "RESEARCHER"
        )
    )
):

    return {
        "message": "Researcher access granted",
        "user_id": current_user.user_id,
        "role": current_user.role
    }


@router.get(
    "/citizen-test"
)
def citizen_test(
    current_user: User = Depends(
        require_roles(
            "ADMINISTRATOR",
            "CITIZEN"
        )
    )
):

    return {
        "message": "Citizen access granted",
        "user_id": current_user.user_id,
        "role": current_user.role
    }


@router.get(
    "/organization-test"
)
def organization_test(
    current_user: User = Depends(
        require_roles(
            "ADMINISTRATOR",
            "ORGANIZATION"
        )
    )
):

    return {
        "message": "Organization access granted",
        "user_id": current_user.user_id,
        "role": current_user.role
    }
