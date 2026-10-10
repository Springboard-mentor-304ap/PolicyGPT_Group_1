from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ReportType = Literal[
    "POLICY_REPORT",
    "SCHEME_REPORT",
    "USER_REPORT",
    "USER_ACTIVITY_REPORT",
    "DEPARTMENT_REPORT",
    "MINISTRY_REPORT",
    "STATE_REPORT",
    "ANALYTICS_REPORT",
    "AUDIT_REPORT",
]

ReportFormat = Literal["PDF", "EXCEL"]

ReportStatus = Literal["PENDING", "COMPLETED", "FAILED"]


class ReportCreate(BaseModel):
    generated_by: int | None = None
    report_type: str
    report_format: str
    title: str | None = None
    status: str = "COMPLETED"
    parameters: dict | None = None
    file_path: str | None = None
    error_message: str | None = None
    file_size: int | None = None
    expires_at: datetime | None = None


class ReportGenerateRequest(BaseModel):
    report_type: ReportType
    report_format: ReportFormat = "PDF"
    title: str | None = Field(default=None, max_length=255)
    detail: str | None = Field(default=None, max_length=50)
    parameters: dict | None = None


class ReportResponse(BaseModel):
    report_id: int
    generated_by: int | None = None
    report_type: str
    report_format: str
    title: str | None = None
    status: str = "COMPLETED"
    parameters: dict | None = None
    file_path: str | None = None
    error_message: str | None = None
    file_size: int | None = None
    expires_at: datetime | None = None
    generated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportGenerateResponse(BaseModel):
    report: ReportResponse
    # JSON preview of the underlying analytics payload.
    # PDF/EXCEL file rendering lands in Part 2.
    data: dict | list | None = None
