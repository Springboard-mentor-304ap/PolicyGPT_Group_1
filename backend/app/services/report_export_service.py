"""Report export orchestration (Part 2).

PENDING -> build dataset -> render bytes -> atomic write -> COMPLETED.
On failure: delete partial file -> FAILED. The database always holds
the final status; a report is never marked COMPLETED before its file
exists on disk.
"""

import os
import re
import tempfile
from datetime import datetime, timezone

from app.models.report import Report

REPORTS_DIR_NAME = "storage/reports"
_EXTENSION_BY_FORMAT = {"PDF": ".pdf", "EXCEL": ".xlsx"}
_MEDIA_BY_FORMAT = {
    "PDF": "application/pdf",
    "EXCEL": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def get_reports_dir() -> str:
    """Absolute storage directory, created on demand (not web-served)."""
    base = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    path = os.path.join(base, REPORTS_DIR_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def sanitize_fragment(value: object) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip())
    cleaned = cleaned.strip("_") or "report"
    return cleaned[:60]


def build_filename(report_id: int, report_type: str, report_format: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ext = _EXTENSION_BY_FORMAT.get(
        str(report_format or "").upper(), ".bin"
    )
    return (
        f"report_{int(report_id)}_"
        f"{sanitize_fragment(report_type)}_{stamp}{ext}"
    )


def resolve_inside_reports_dir(reports_dir: str, reference: str | None) -> str:
    """Resolve a stored relative reference; reject traversal/absolute paths."""
    if not reference:
        raise FileNotFoundError("Report file is not available")
    if os.path.isabs(reference):
        raise ValueError("Invalid report file reference")
    normalized = os.path.normpath(reference)
    if normalized.startswith("..") or os.path.isabs(normalized):
        raise ValueError("Invalid report file reference")
    # Reject encoded traversal and unexpected separators.
    lowered = reference.lower()
    if "%2e" in lowered or "%2f" in lowered or "%5c" in lowered:
        raise ValueError("Invalid report file reference")
    if "\\" in normalized:
        raise ValueError("Invalid report file reference")
    absolute = os.path.realpath(os.path.join(reports_dir, normalized))
    root = os.path.realpath(reports_dir)
    if absolute != root and not absolute.startswith(root + os.sep):
        raise ValueError("Invalid report file reference")
    return absolute


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


def finalize_report_file(
    db,
    report: Report,
    content: bytes,
    filename: str,
) -> Report:
    """Atomically write bytes and update the report row."""
    reports_dir = get_reports_dir()
    fd, tmp_path = tempfile.mkstemp(
        dir=reports_dir, prefix=".tmp_report_", suffix=".part"
    )
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
        final_path = os.path.join(reports_dir, filename)
        os.replace(tmp_path, final_path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise

    report.file_path = filename
    report.file_size = len(content)
    report.status = "COMPLETED"
    report.error_message = None
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def fail_report(db, report: Report, error: Exception) -> Report:
    """Mark FAILED and remove any partial file. Never leaks tracebacks."""
    reports_dir = get_reports_dir()
    reference = report.file_path
    if reference:
        try:
            absolute = resolve_inside_reports_dir(reports_dir, reference)
            if os.path.exists(absolute):
                os.unlink(absolute)
        except (ValueError, OSError):
            pass
    report.file_path = None
    report.file_size = None
    report.status = "FAILED"
    # Safe message only: exception class names and paths are stripped.
    report.error_message = "Report generation failed. Please retry."
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def read_report_file(report: Report) -> tuple[str, bytes, str]:
    """Read a COMPLETED report file for download."""
    reports_dir = get_reports_dir()
    absolute = resolve_inside_reports_dir(reports_dir, report.file_path)
    if not os.path.isfile(absolute):
        raise FileNotFoundError("Report file is not available")
    with open(absolute, "rb") as handle:
        content = handle.read()
    return (
        os.path.basename(absolute),
        content,
        media_type_for(report.report_format),
    )
