from datetime import datetime

from pydantic import BaseModel


class SearchHistoryResponse(BaseModel):
    history_id: int
    user_id: int
    search_query: str
    search_type: str
    filters: dict | None
    searched_at: datetime

    class Config:
        from_attributes = True