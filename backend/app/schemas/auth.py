from datetime import date, datetime

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
    "ADMINISTRATOR",
}


PUBLIC_REGISTRATION_ROLES = {
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
}


# =========================================================
# PASSWORD VALIDATION
# =========================================================

def validate_password_strength(value: str) -> str:
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
    # COUNT TYPES
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
    # AT LEAST 3 OF 4
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

    role: str

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

        value = value.upper().strip()

        if value not in ALLOWED_ROLES:
            raise ValueError(
                "Invalid role"
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
    # PASSWORD MATCH
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

        return value


# =========================================================
# CHANGE PASSWORD REQUEST
# =========================================================

class ChangePasswordRequest(BaseModel):

    # =====================================================
    # CURRENT PASSWORD
    # =====================================================

    current_password: str

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

    email: EmailStr


# =========================================================
# RESET PASSWORD REQUEST
# =========================================================

class ResetPasswordRequest(BaseModel):

    # =====================================================
    # RESET TOKEN
    # =====================================================

    token: str

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

    email: EmailStr


# =========================================================
# VERIFY OTP REQUEST
# =========================================================

class VerifyOTPRequest(BaseModel):

    email: EmailStr

    otp: str = Field(
        min_length=6,
        max_length=6
    )

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

