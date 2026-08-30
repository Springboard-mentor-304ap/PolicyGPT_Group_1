from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)

    email: EmailStr

    phone: str | None = Field(
        default=None,
        min_length=10,
        max_length=20
    )

    date_of_birth: date | None = None

    state: str | None = Field(
        default=None,
        max_length=100
    )

    district: str | None = Field(
        default=None,
        max_length=100
    )

    occupation: str | None = Field(
        default=None,
        max_length=150
    )

    organization: str | None = Field(
        default=None,
        max_length=200
    )

    password: str = Field(
        min_length=8,
        max_length=72
    )

    confirm_password: str = Field(
        min_length=8,
        max_length=72
    )

    role: str

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Full name is required")

        return value

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        value = value.upper().strip()

        if value not in ALLOWED_ROLES:
            raise ValueError("Invalid role")

        if value not in PUBLIC_REGISTRATION_ROLES:
            raise ValueError(
                "This role cannot be selected during public registration"
            )

        return value

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None

        value = value.strip()

        if not value.isdigit():
            raise ValueError(
                "Phone number must contain only digits"
            )

        return value


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3)
    password: str = Field(min_length=1)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    full_name: str
    email: EmailStr
    role: str
    phone: str | None
    date_of_birth: date | None
    state: str | None
    district: str | None
    occupation: str | None
    organization: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=150
    )

    phone: str | None = Field(
        default=None,
        min_length=10,
        max_length=20
    )

    date_of_birth: date | None = None

    state: str | None = Field(
        default=None,
        max_length=100
    )

    district: str | None = Field(
        default=None,
        max_length=100
    )

    occupation: str | None = Field(
        default=None,
        max_length=150
    )

    organization: str | None = Field(
        default=None,
        max_length=200
    )


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(
        min_length=8,
        max_length=72
    )
    confirm_password: str = Field(
        min_length=8,
        max_length=72
    )


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(
        min_length=8,
        max_length=72
    )
    confirm_password: str = Field(
        min_length=8,
        max_length=72
    )
