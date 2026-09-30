"""Report export orchestration (stateless).

Generation lifecycle:

PENDING -> build dataset -> render bytes (in memory) -> COMPLETED.

On failure: FAILED with a safe message. The database always holds
the final status.

Generated PDF/XLSX bytes are NEVER written to the backend
filesystem. They are returned directly as the HTTP binary
response, and re-generated deterministically from the stored
report parameters whenever a later download is requested.
History therefore works without any stored artifact.
"""

import re
from datetime import datetime, timezone

from app.models.report import Report

_EXTENSION_BY_FORMAT = {"PDF": ".pdf", "EXCEL": ".xlsx"}
_MEDIA_BY_FORMAT = {
    "PDF": "application/pdf",
    "EXCEL": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def sanitize_fragment(value: object) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip())
    cleaned = cleaned.strip("_") or "report"
    return cleaned[:60]


def build_filename(report_id: int, report_type: str, report_format: str) -> str:
    """Official download name: PolicyGPT_<Type>_Report_YYYY-MM-DD.<ext>.

    Never exposes a filesystem path or host-specific URL; the bytes are
    returned directly as the HTTP binary response.
    """
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ext = _EXTENSION_BY_FORMAT.get(
        str(report_format or "").upper(), ".bin"
    )
    # USER_REPORT -> User, POLICY_REPORT -> Policy, etc.
    parts = [p.capitalize() for p in str(report_type or "").lower().split("_") if p and p != "report"]
    type_part = "_".join(parts) or "General"
    return f"PolicyGPT_{type_part}_Report_{stamp}{ext}"


def media_type_for(report_format: str) -> str:
    return _MEDIA_BY_FORMAT.get(
        str(report_format or "").upper(), "application/octet-stream"
    )


def render_dataset(
    dataset: dict, metadata: dict, report_format: str
) -> bytes:
    normalized = str(report_format or "").upper()
    if normalized == "PDF":
        from app.services.pdf_service import render_report_pdf

        return render_report_pdf(dataset, metadata)
    if normalized == "EXCEL":
        from app.services.excel_service import render_report_excel

        return render_report_excel(dataset, metadata)
    raise ValueError(f"Unsupported report format: {report_format}")


def complete_report(
    db,
    report: Report,
    content: bytes,
    filename: str,
) -> Report:
    """Mark the report COMPLETED.

    The bytes are returned to the caller for the HTTP response;
    only metadata (size, no path) is persisted. ``filename`` is
    accepted for API compatibility and intentionally not stored
    as a filesystem reference.
    """
    report.file_path = None
    report.file_size = len(content)
    report.status = "COMPLETED"
    report.error_message = None
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def fail_report(db, report: Report, error: Exception) -> Report:
    """Mark FAILED. Never leaks tracebacks; no files involved."""
    report.file_path = None
    report.file_size = None
    report.status = "FAILED"
    # Safe message only: exception class names and paths are stripped.
    report.error_message = "Report generation failed. Please retry."
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
