from datetime import datetime

from pydantic import BaseModel


class FAQCreate(BaseModel):
    question: str
    answer: str
    category: str | None = None


class FAQUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    category: str | None = None


class FAQResponse(BaseModel):
    faq_id: int
    question: str
    answer: str
    category: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True