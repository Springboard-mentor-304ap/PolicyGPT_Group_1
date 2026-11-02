from datetime import date, datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


# =========================================================
# ROLES
# =========================================================

ALLOWED_ROLES = {
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
    "GOVERNMENT_OFFICIAL",
    "ADMIN",
    "GUEST",
}


# =========================================================
# PUBLIC REGISTRATION ROLES
# =========================================================
#
# These are the roles that can normally be selected by a
# public user during registration.
#
# ADMIN and GOVERNMENT_OFFICIAL can still be accepted by
# the schema. If you want to restrict public registration,
# enforce this in the registration route/service.
# =========================================================

PUBLIC_REGISTRATION_ROLES = {
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
}


# =========================================================
# ROLE ALIASES
# =========================================================
#
# All user-friendly role names are converted into one
# canonical role before reaching the database.
#
# Example:
#
# admin
# ADMIN
# administrator
# ADMINISTRATOR
#
#        ↓
#
# ADMIN
# =========================================================

ROLE_ALIASES = {

    # -----------------------------------------------------
    # ADMIN
    # -----------------------------------------------------

    "ADMIN": "ADMIN",
    "ADMINISTRATOR": "ADMIN",

    # -----------------------------------------------------
    # GOVERNMENT
    # -----------------------------------------------------

    "GOVERNMENT": "GOVERNMENT_OFFICIAL",
    "GOVT": "GOVERNMENT_OFFICIAL",
    "GOVERNMENT OFFICIAL": "GOVERNMENT_OFFICIAL",
    "GOVERNMENT_OFFICIAL": "GOVERNMENT_OFFICIAL",

    # -----------------------------------------------------
    # CITIZEN
    # -----------------------------------------------------

    "CITIZEN": "CITIZEN",

    # -----------------------------------------------------
    # RESEARCHER
    # -----------------------------------------------------

    "RESEARCHER": "RESEARCHER",

    # -----------------------------------------------------
    # ORGANIZATION
    # -----------------------------------------------------

    "ORGANIZATION": "ORGANIZATION",
    "ORG": "ORGANIZATION",

    # -----------------------------------------------------
    # GUEST
    # -----------------------------------------------------

    "GUEST": "GUEST",
    "GUEST_USER": "GUEST",
    "GUEST USER": "GUEST",
}


# =========================================================
# ROLE NORMALIZATION HELPER
# =========================================================

def normalize_role(value: str) -> str:
    """
    Normalize a role entered by the user.

    Examples:

        admin
        ADMIN
        administrator
        ADMINISTRATOR

        -> ADMIN


        government
        GOVERNMENT
        govt
        GOVT
        government official

        -> GOVERNMENT_OFFICIAL
    """

    if not isinstance(value, str):
        raise ValueError(
            "Role must be a string"
        )

    # Remove leading/trailing spaces
    value = value.strip()

    # Make case-insensitive
    value = value.upper()

    # Convert aliases to canonical role
    value = ROLE_ALIASES.get(
        value,
        value
    )

    # Final validation
    if value not in ALLOWED_ROLES:
        raise ValueError(
            "Invalid role. Allowed roles: "
            "CITIZEN, RESEARCHER, ORGANIZATION, "
            "GOVERNMENT_OFFICIAL, ADMIN, GUEST"
        )

    return value


# =========================================================
# PASSWORD VALIDATION
# =========================================================

def validate_password_strength(
    value: str
) -> str:
    """
    Password requirements:

    1. Minimum 8 characters
    2. Maximum 72 characters
    3. At least 3 of the following 4 types:
       - lowercase letter
       - uppercase letter
       - number
       - special character
    """

    # -----------------------------------------------------
    # REQUIRED
    # -----------------------------------------------------

    if not value:
        raise ValueError(
            "Password is required"
        )

    # -----------------------------------------------------
    # MINIMUM LENGTH
    # -----------------------------------------------------

    if len(value) < 8:
        raise ValueError(
            "Password must be at least 8 characters long"
        )

    # -----------------------------------------------------
    # MAXIMUM LENGTH
    # -----------------------------------------------------

    if len(value) > 72:
        raise ValueError(
            "Password must not exceed 72 characters"
        )

    # -----------------------------------------------------
    # PASSWORD TYPES
    # -----------------------------------------------------

    has_lowercase = any(
        char.islower()
        for char in value
    )

    has_uppercase = any(
        char.isupper()
        for char in value
    )

    has_number = any(
        char.isdigit()
        for char in value
    )

    has_special = any(
        not char.isalnum()
        for char in value
    )

    # -----------------------------------------------------
    # COUNT PASSWORD TYPES
    # -----------------------------------------------------

    type_count = sum(
        [
            has_lowercase,
            has_uppercase,
            has_number,
            has_special,
        ]
    )

    # -----------------------------------------------------
    # REQUIRE AT LEAST 3 OF 4
    # -----------------------------------------------------

    if type_count < 3:
        raise ValueError(
            "Password must contain at least 3 of: "
            "uppercase, lowercase, number, or special character"
        )

    return value


# =========================================================
# REGISTER REQUEST
# =========================================================

class RegisterRequest(BaseModel):

    # =====================================================
    # BASIC INFORMATION
    # =====================================================

    full_name: str = Field(
        min_length=2,
        max_length=150
    )

    email: EmailStr

    phone: str | None = Field(
        default=None,
        min_length=10,
        max_length=20
    )

    date_of_birth: date | None = None

    # =====================================================
    # LOCATION
    # =====================================================

    state: str | None = Field(
        default=None,
        max_length=100
    )

    district: str | None = Field(
        default=None,
        max_length=100
    )

    # =====================================================
    # PROFESSIONAL INFORMATION
    # =====================================================

    occupation: str | None = Field(
        default=None,
        max_length=150
    )

    organization: str | None = Field(
        default=None,
        max_length=200
    )

    # =====================================================
    # PASSWORD
    # =====================================================

    password: str = Field(
        min_length=8,
        max_length=72
    )

    confirm_password: str = Field(
        min_length=8,
        max_length=72
    )

    # =====================================================
    # ROLE
    # =====================================================

    role: str = Field(
        min_length=1,
        max_length=50
    )

    # =====================================================
    # FULL NAME VALIDATOR
    # =====================================================

    @field_validator("full_name")
    @classmethod
    def validate_full_name(
        cls,
        value: str
    ) -> str:

        value = value.strip()

        if not value:
            raise ValueError(
                "Full name is required"
            )

        return value

    # =====================================================
    # EMAIL VALIDATOR
    # =====================================================

    @field_validator("email")
    @classmethod
    def validate_email(
        cls,
        value: EmailStr
    ) -> EmailStr:

        return value

    # =====================================================
    # ROLE VALIDATOR
    # =====================================================

    @field_validator("role")
    @classmethod
    def validate_role(
        cls,
        value: str
    ) -> str:

        return normalize_role(value)

    # =====================================================
    # PHONE VALIDATOR
    # =====================================================

    @field_validator("phone")
    @classmethod
    def validate_phone(
        cls,
        value: str | None
    ) -> str | None:

        if value is None:
            return None

        value = value.strip()

        if not value:
            return None

        if not value.isdigit():
            raise ValueError(
                "Phone number must contain only digits"
            )

        if len(value) < 10:
            raise ValueError(
                "Phone number must contain at least 10 digits"
            )

        if len(value) > 20:
            raise ValueError(
                "Phone number must not exceed 20 digits"
            )

        return value

    # =====================================================
    # PASSWORD VALIDATOR
    # =====================================================

    @field_validator("password")
    @classmethod
    def validate_password(
        cls,
        value: str
    ) -> str:

        return validate_password_strength(value)

    # =====================================================
    # CONFIRM PASSWORD VALIDATOR
    # =====================================================

    @field_validator("confirm_password")
    @classmethod
    def validate_confirm_password(
        cls,
        value: str
    ) -> str:

        if not value:
            raise ValueError(
                "Confirm password is required"
            )

        return value

    # =====================================================
    # PASSWORD MATCH VALIDATOR
    # =====================================================

    @model_validator(mode="after")
    def validate_passwords_match(self):

        if self.password != self.confirm_password:
            raise ValueError(
                "Passwords do not match"
            )

        return self


# =========================================================
# LOGIN REQUEST
# =========================================================

class LoginRequest(BaseModel):

    # =====================================================
    # EMAIL OR PHONE
    # =====================================================

    identifier: str = Field(
        min_length=3
    )

    # =====================================================
    # PASSWORD
    # =====================================================

    password: str = Field(
        min_length=1
    )

    # =====================================================
    # IDENTIFIER VALIDATOR
    # =====================================================

    @field_validator("identifier")
    @classmethod
    def validate_identifier(
        cls,
        value: str
    ) -> str:

        value = value.strip()

        if not value:
            raise ValueError(
                "Email or phone number is required"
            )

        return value


# =========================================================
# USER RESPONSE
# =========================================================

class UserResponse(BaseModel):

    model_config = ConfigDict(
        from_attributes=True
    )

    # =====================================================
    # USER ID
    # =====================================================

    user_id: int

    # =====================================================
    # BASIC INFORMATION
    # =====================================================

    full_name: str

    email: EmailStr

    role: str

    phone: str | None

    # =====================================================
    # GENDER
    # =====================================================

    gender: str | None = None

    # =====================================================
    # PERSONAL INFORMATION
    # =====================================================

    date_of_birth: date | None

    # =====================================================
    # LOCATION
    # =====================================================

    state: str | None

    district: str | None

    # =====================================================
    # PROFESSIONAL INFORMATION
    # =====================================================

    occupation: str | None

    organization: str | None

    # =====================================================
    # ACCOUNT STATUS
    # =====================================================

    is_active: bool

    # =====================================================
    # PROFILE PHOTO
    # =====================================================
    # Version signal for avatar caching. None means the user has no
    # photo (frontend shows the default avatar). The bytes themselves
    # are served via GET /auth/profile/photo, never in JSON.

    profile_photo_updated_at: datetime | None = None

    # =====================================================
    # TIMESTAMPS
    # =====================================================

    created_at: datetime

    updated_at: datetime


# =========================================================
# AUTH RESPONSE
# =========================================================

class AuthResponse(BaseModel):

    access_token: str

    token_type: str = "bearer"

    user: UserResponse


# =========================================================
# PROFILE UPDATE REQUEST
# =========================================================

class ProfileUpdateRequest(BaseModel):

    # =====================================================
    # BASIC INFORMATION
    # =====================================================

    full_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=150
    )

    # =====================================================
    # PHONE
    # =====================================================

    phone: str | None = Field(
        default=None,
        min_length=10,
        max_length=20
    )

    # =====================================================
    # GENDER
    # =====================================================

    gender: str | None = Field(
        default=None,
        max_length=30
    )

    # =====================================================
    # DATE OF BIRTH
    # =====================================================

    date_of_birth: date | None = None

    # =====================================================
    # LOCATION
    # =====================================================

    state: str | None = Field(
        default=None,
        max_length=100
    )

    district: str | None = Field(
        default=None,
        max_length=100
    )

    # =====================================================
    # PROFESSIONAL INFORMATION
    # =====================================================

    occupation: str | None = Field(
        default=None,
        max_length=150
    )

    organization: str | None = Field(
        default=None,
        max_length=200
    )

    # =====================================================
    # FULL NAME VALIDATOR
    # =====================================================

    @field_validator("full_name")
    @classmethod
    def validate_full_name(
        cls,
        value: str | None
    ) -> str | None:

        if value is None:
            return None

        value = value.strip()

        if not value:
            raise ValueError(
                "Full name cannot be empty"
            )

        return value

    # =====================================================
    # PHONE VALIDATOR
    # =====================================================

    @field_validator("phone")
    @classmethod
    def validate_phone(
        cls,
        value: str | None
    ) -> str | None:

        if value is None:
            return None

        value = value.strip()

        if not value:
            return None

        if not value.isdigit():
            raise ValueError(
                "Phone number must contain only digits"
            )

        if len(value) < 10:
            raise ValueError(
                "Phone number must contain at least 10 digits"
            )

        if len(value) > 20:
            raise ValueError(
                "Phone number must not exceed 20 digits"
            )

        return value

    # =====================================================
    # GENDER VALIDATOR
    # =====================================================

    @field_validator("gender")
    @classmethod
    def validate_gender(
        cls,
        value: str | None
    ) -> str | None:

        if value is None:
            return None

        value = value.strip()

        if not value:
            raise ValueError(
                "Gender cannot be empty"
            )

        return value


# =========================================================
# CHANGE PASSWORD REQUEST
# =========================================================

class ChangePasswordRequest(BaseModel):

    # =====================================================
    # CURRENT PASSWORD
    # =====================================================

    current_password: str = Field(
        min_length=1
    )

    # =====================================================
    # NEW PASSWORD
    # =====================================================

    new_password: str = Field(
        min_length=8,
        max_length=72
    )

    # =====================================================
    # CONFIRM PASSWORD
    # =====================================================

    confirm_password: str = Field(
        min_length=8,
        max_length=72
    )

    # =====================================================
    # NEW PASSWORD VALIDATOR
    # =====================================================

    @field_validator("new_password")
    @classmethod
    def validate_new_password(
        cls,
        value: str
    ) -> str:

        return validate_password_strength(value)

    # =====================================================
    # CONFIRM PASSWORD VALIDATOR
    # =====================================================

    @field_validator("confirm_password")
    @classmethod
    def validate_confirm_password(
        cls,
        value: str
    ) -> str:

        if not value:
            raise ValueError(
                "Confirm password is required"
            )

        return value

    # =====================================================
    # PASSWORD MATCH
    # =====================================================

    @model_validator(mode="after")
    def validate_passwords_match(self):

        if self.new_password != self.confirm_password:
            raise ValueError(
                "Passwords do not match"
            )

        return self


# =========================================================
# FORGOT PASSWORD REQUEST
# =========================================================

class ForgotPasswordRequest(BaseModel):

    email: EmailStr | None = None

    phone: str | None = Field(
        default=None,
        min_length=10,
        max_length=20,
    )

    channel: Literal["email", "sms"] = Field(
        default="email",
    )

    @model_validator(mode="after")
    def validate_channel_requirements(self):
        if self.channel == "email" and not self.email:
            raise ValueError(
                "Email address is required when channel is email"
            )
        if self.channel == "sms" and not self.phone:
            raise ValueError(
                "Phone number is required when channel is sms"
            )

        return self


# =========================================================
# RESET PASSWORD REQUEST
# =========================================================

class ResetPasswordRequest(BaseModel):

    # =====================================================
    # RESET TOKEN
    # =====================================================

    token: str = Field(
        min_length=1
    )

    # =====================================================
    # NEW PASSWORD
    # =====================================================

    new_password: str = Field(
        min_length=8,
        max_length=72
    )

    # =====================================================
    # CONFIRM PASSWORD
    # =====================================================

    confirm_password: str = Field(
        min_length=8,
        max_length=72
    )

    # =====================================================
    # NEW PASSWORD VALIDATOR
    # =====================================================

    @field_validator("new_password")
    @classmethod
    def validate_new_password(
        cls,
        value: str
    ) -> str:

        return validate_password_strength(value)

    # =====================================================
    # CONFIRM PASSWORD VALIDATOR
    # =====================================================

    @field_validator("confirm_password")
    @classmethod
    def validate_confirm_password(
        cls,
        value: str
    ) -> str:

        if not value:
            raise ValueError(
                "Confirm password is required"
            )

        return value

    # =====================================================
    # PASSWORD MATCH
    # =====================================================

    @model_validator(mode="after")
    def validate_passwords_match(self):

        if self.new_password != self.confirm_password:
            raise ValueError(
                "Passwords do not match"
            )

        return self


# =========================================================
# DELETE ACCOUNT REQUEST
# =========================================================

class DeleteAccountRequest(BaseModel):

    password: str = Field(
        min_length=1,
        max_length=72
    )


# =========================================================
# SEND OTP REQUEST
# =========================================================

class SendOTPRequest(BaseModel):

    email: EmailStr | None = None

    phone: str | None = Field(
        default=None,
        min_length=10,
        max_length=20,
    )

    channel: Literal["email", "sms"] = Field(
        default="email",
    )

    @model_validator(mode="after")
    def validate_channel_requirements(self):
        if self.channel == "email" and not self.email:
            raise ValueError(
                "Email address is required when channel is email"
            )
        if self.channel == "sms" and not self.phone:
            raise ValueError(
                "Phone number is required when channel is sms"
            )

        return self


# =========================================================
# VERIFY OTP REQUEST
# =========================================================

class VerifyOTPRequest(BaseModel):

    email: EmailStr | None = None

    phone: str | None = Field(
        default=None,
        min_length=10,
        max_length=20,
    )

    channel: str = Field(
        default="email",
        pattern="^(email|sms)$",
    )

    otp: str = Field(
        min_length=6,
        max_length=6
    )

    # =====================================================
    # OTP VALIDATOR
    # =====================================================

    @field_validator("otp")
    @classmethod
    def validate_otp(
        cls,
        value: str
    ) -> str:

        if not value.isdigit():
            raise ValueError(
                "OTP must contain only digits"
            )

        return value

    @model_validator(mode="after")
    def validate_channel_requirements(self):
        if self.channel == "email" and not self.email:
            raise ValueError(
                "Email address is required when channel is email"
            )
        if self.channel == "sms" and not self.phone and not self.email:
            raise ValueError(
                "Phone number is required when channel is sms"
            )

        return self
