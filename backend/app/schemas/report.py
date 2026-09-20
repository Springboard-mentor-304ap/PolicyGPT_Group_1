from datetime import datetime

from pydantic import BaseModel


class ReportCreate(BaseModel):
    generated_by: int
    report_type: str
    report_format: str
    parameters: dict | None = None
    file_path: str | None = None


class ReportResponse(BaseModel):
    report_id: int
    generated_by: int
    report_type: str
    report_format: str
    parameters: dict | None
    file_path: str | None
    generated_at: datetime

    class Config:
        from_attributes = True