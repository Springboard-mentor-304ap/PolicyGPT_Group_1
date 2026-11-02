from pydantic import BaseModel, ConfigDict

from app.schemas.policy import PolicyResponse
from app.schemas.scheme import SchemeResponse


class GlobalSearchResponse(BaseModel):
    """Combined dropdown payload: top policies + top schemes."""

    model_config = ConfigDict(from_attributes=True)

    query: str

    total_policies: int

    total_schemes: int

    policies: list[PolicyResponse]

    schemes: list[SchemeResponse]
