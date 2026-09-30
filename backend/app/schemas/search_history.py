from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SearchHistoryResponse(BaseModel):
    history_id: int
    user_id: int
    search_query: str
    search_type: str
    filters: dict | None
    searched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SearchHistoryCreate(BaseModel):
    search_query: str
    search_type: str
    filters: dict | None = None