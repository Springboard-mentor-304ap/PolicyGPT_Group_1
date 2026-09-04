from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import re
import random
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.services.email_service import send_otp_email
from app.core.config import settings
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

    if token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    return user


# =========================================================
# ROLE CHECK
# =========================================================

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


# =========================================================
# CREATE USER TOKEN
# =========================================================

def create_user_token(user: User) -> str:

    return create_access_token(
        user_id=user.user_id,
        role=user.role,
        token_version=user.token_version
    )


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
        role=data.role,
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

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or phone number is already registered"
        )

    # -----------------------------------------------------
    # CREATE TOKEN
    # -----------------------------------------------------

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

    return {
        "message": "Logged out successfully"
    }

    # =========================================================
# SEND EMAIL OTP
# =========================================================

@router.post(
    "/send-otp"
)
def send_otp(
    data: SendOTPRequest,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # CLEAN EMAIL
    # -----------------------------------------------------

    email = str(
        data.email
    ).lower().strip()

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.email == email
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid email address"
        )

    # -----------------------------------------------------
    # INVALIDATE PREVIOUS OTP
    # -----------------------------------------------------

    db.query(
        OTPVerification
    ).filter(
        OTPVerification.user_id == user.user_id,
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
    # CREATE OTP RECORD
    # -----------------------------------------------------

    otp_record = OTPVerification(
        user_id=user.user_id,
        otp_hash=otp_hash,
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
    # SEND EMAIL
    # -----------------------------------------------------

    try:

        send_otp_email(
            recipient_email=email,
            otp=otp
        )

    except Exception:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to send OTP email"
        )

    # -----------------------------------------------------
    # SUCCESS
    # -----------------------------------------------------

    return {
        "message": "OTP sent successfully"
    }

# =========================================================
# VERIFY EMAIL OTP
# =========================================================

@router.post(
    "/verify-otp"
)
def verify_otp(
    data: VerifyOTPRequest,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # CLEAN EMAIL
    # -----------------------------------------------------

    email = str(
        data.email
    ).lower().strip()

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.email == email
    ).first()

    if not user:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid email address"
        )

    # -----------------------------------------------------
    # FIND ACTIVE OTP
    # -----------------------------------------------------

    otp_record = db.query(
        OTPVerification
    ).filter(
        OTPVerification.user_id == user.user_id,
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
    # CHECK EXPIRATION
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

    if entered_otp_hash != otp_record.otp_hash:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP"
        )

    # -----------------------------------------------------
    # MARK OTP USED
    # -----------------------------------------------------

    otp_record.used = True

    db.commit()

    # -----------------------------------------------------
    # SUCCESS
    # -----------------------------------------------------

    return {
        "message": "OTP verified successfully",
        "verified": True
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

    # -----------------------------------------------------
    # CLEAN EMAIL
    # -----------------------------------------------------

    email = str(
        data.email
    ).lower().strip()

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.email == email
    ).first()

    # -----------------------------------------------------
    # GENERIC RESPONSE
    # -----------------------------------------------------

    generic_response = {
        "message": "If account exists, password reset link generated."
    }

    if not user:
        return generic_response

    # -----------------------------------------------------
    # INVALIDATE OLD RESET TOKENS
    # -----------------------------------------------------

    db.query(
        PasswordResetToken
    ).filter(
        PasswordResetToken.user_id == user.user_id,
        PasswordResetToken.used.is_(False)
    ).update({
        "used": True
    })

    # -----------------------------------------------------
    # CREATE RESET TOKEN
    # -----------------------------------------------------

    raw_token = secrets.token_urlsafe(32)

    token_hash = hash_reset_token(
        raw_token
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
    # CREATE RESET RECORD
    # -----------------------------------------------------

    reset_token = PasswordResetToken(
        user_id=user.user_id,
        token_hash=token_hash,
        expires_at=now + timedelta(
            minutes=15
        ),
        used=False,
        created_at=now
    )

    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    db.add(reset_token)
    db.commit()

    # -----------------------------------------------------
    # DEVELOPMENT TOKEN
    # -----------------------------------------------------

    if settings.DEBUG:
        return {
            **generic_response,
            "development_reset_token": raw_token
        }

    return generic_response


# =========================================================
# DELETE CURRENT ACCOUNT
# =========================================================

@router.delete("/account")
def delete_account(
    data: DeleteAccountRequest,
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
    current_user: User = Depends(get_current_user),
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

    db.delete(user)
    db.commit()

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
    current_user: User = Depends(get_current_user),
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

    db.delete(user)
    db.commit()

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

    return {
        "message": "Password reset successfully. Please login again."
    }


# =========================================================
# ADMIN TEST
# =========================================================

@router.get(
    "/admin-test"
)
def admin_test(
    current_user: User = Depends(
        require_roles(
            "ADMINISTRATOR"
        )
    )
):

    return {
        "message": "Administrator access granted",
        "user_id": current_user.user_id,
        "role": current_user.role
    }


# =========================================================
# GOVERNMENT TEST
# =========================================================

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


# =========================================================
# RESEARCHER TEST
# =========================================================

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


# =========================================================
# CITIZEN TEST
# =========================================================

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


# =========================================================
# ORGANIZATION TEST
# =========================================================

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
