from pydantic import BaseModel
from typing import Any


class UsageStatistics(BaseModel):
    total_users: int = 0
    active_users: int = 0
    total_policies: int = 0
    total_schemes: int = 0
    approved_policies: int = 0
    approved_schemes: int = 0


class UsageDaily(BaseModel):
    data: list[Any] = []


class UsageWeekly(BaseModel):
    data: list[Any] = []


class UsageMonthly(BaseModel):
    data: list[Any] = []


class SearchUsage(BaseModel):
    total_searches: int = 0
    policy_searches: int = 0
    scheme_searches: int = 0


class ViewUsage(BaseModel):
    total_policy_views: int = 0
    total_scheme_views: int = 0