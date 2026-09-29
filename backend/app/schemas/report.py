from datetime import datetime

from pydantic import BaseModel, ConfigDict


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

    model_config = ConfigDict(from_attributes=True)