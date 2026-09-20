from pydantic import BaseModel
from typing import Any


class DashboardAnalytics(BaseModel):
    total_policies: int = 0
    total_schemes: int = 0
    approved_policies: int = 0
    pending_policies: int = 0
    rejected_policies: int = 0
    archived_policies: int = 0
    active_schemes: int = 0
    total_users: int = 0
    total_notifications: int = 0
    total_feedback: int = 0


class PolicyAnalytics(BaseModel):
    total: int = 0
    approved: int = 0
    pending: int = 0
    rejected: int = 0
    archived: int = 0
    by_category: list[Any] = []
    by_state: list[Any] = []
    by_ministry: list[Any] = []
    monthly_trend: list[Any] = []


class SchemeAnalytics(BaseModel):
    total: int = 0
    active: int = 0
    pending: int = 0
    rejected: int = 0
    archived: int = 0
    by_category: list[Any] = []
    by_state: list[Any] = []
    by_ministry: list[Any] = []
    monthly_trend: list[Any] = []