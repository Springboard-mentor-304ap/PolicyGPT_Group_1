from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SavedPolicyResponse(BaseModel):
    saved_id: int
    user_id: int
    policy_id: int
    saved_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class SavedSchemeResponse(BaseModel):
    saved_id: int
    user_id: int
    scheme_id: int
    saved_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class SavedPolicyItemResponse(BaseModel):
    saved_id: int
    policy_id: int
    title: str

    category: str | None = None
    ministry: str | None = None
    department: str | None = None
    state: str | None = None
    status: str | None = None

    saved_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class SavedSchemeItemResponse(BaseModel):
    saved_id: int
    scheme_id: int
    name: str

    category: str | None = None
    ministry: str | None = None
    department: str | None = None
    state: str | None = None
    status: str | None = None

    saved_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class SavedStatusResponse(BaseModel):
    saved: bool


class UnsaveResponse(BaseModel):
    message: str
