from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FAQCreate(BaseModel):
    question: str
    answer: str
    category: str | None = None
    status: str = "PUBLISHED"
    display_order: int = 0


class FAQUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    category: str | None = None
    status: str | None = None
    display_order: int | None = None


class FAQResponse(BaseModel):
    faq_id: int
    question: str
    answer: str
    category: str | None = None
    status: str = "PUBLISHED"
    display_order: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)