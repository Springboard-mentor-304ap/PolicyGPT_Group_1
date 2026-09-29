"""Excel report renderer (Part 2) using openpyxl.

Workbook layout: Summary / Data / Analytics / Meta. Only relevant
sheets are included. No filesystem paths, credentials, tokens,
unnecessary PII, or stack traces are ever written.
"""

from copy import copy
from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HEADER_FILL = PatternFill("solid", fgColor="1B3A5F")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
TITLE_FONT = Font(color="1B3A5F", bold=True, size=14)
SUBTITLE_FONT = Font(color="1B3A5F", bold=True, size=11)
THIN_BORDER = Border(
    left=Side(style="thin", color="B0B0B0"),
    right=Side(style="thin", color="B0B0B0"),
    top=Side(style="thin", color="B0B0B0"),
    bottom=Side(style="thin", color="B0B0B0"),
)
WRAP = Alignment(wrap_text=True, vertical="top")


def _clean(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, (datetime,)):
        return value
    text = str(value)
    # Neutralize spreadsheet formula injection: user-controlled strings
    # (titles, names, filter values) must never evaluate as formulas.
    if text[:1] in ("=", "+", "-", "@"):
        text = "'" + text
    return text[:5000]


def _style_header(ws, row: int, count: int):
    for col in range(1, count + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = copy(HEADER_FILL)
        cell.font = copy(HEADER_FONT)
        cell.border = copy(THIN_BORDER)
        cell.alignment = copy(WRAP)


def _auto_width(ws, headers: list, rows: list[list], max_width: int = 45):
    for idx, head in enumerate(headers, start=1):
        longest = len(str(head or ""))
        for row in rows:
            if idx - 1 < len(row):
                longest = max(longest, len(str(row[idx - 1] or "")))
        ws.column_dimensions[get_column_letter(idx)].width = min(
            max(longest + 2, 12), max_width
        )


def _write_table(ws, start_row: int, headers: list, rows: list[list]) -> int:
    for col, head in enumerate(headers, start=1):
        ws.cell(row=start_row, column=col, value=_clean(head))
    _style_header(ws, start_row, len(headers))
    row_no = start_row + 1
    for data in rows:
        for col in range(1, len(headers) + 1):
            value = data[col - 1] if col - 1 < len(data) else ""
            cell = ws.cell(row=row_no, column=col, value=_clean(value))
            cell.border = copy(THIN_BORDER)
            cell.alignment = copy(WRAP)
        row_no += 1
    ws.freeze_panes = ws.cell(row=start_row + 1, column=1).coordinate
    ws.auto_filter.ref = (
        f"A{start_row}:{get_column_letter(len(headers))}{max(row_no - 1, start_row)}"
    )
    _auto_width(ws, headers, rows)
    return row_no


def render_report_excel(dataset: dict, metadata: dict) -> bytes:
    """Render a report dataset to XLSX bytes."""
    title = str(dataset.get("title") or metadata.get("title") or "Report")
    report_type = str(dataset.get("report_type") or metadata.get("report_type") or "")
    detail = str(dataset.get("detail") or metadata.get("detail") or "")
    generated_at = str(dataset.get("generated_at") or metadata.get("generated_at") or "")
    filters = {
        key: value
        for key, value in (
            dataset.get("filters") or metadata.get("filters") or {}
        ).items()
        if key != "detail"
    }
    summary = dataset.get("summary") or []
    sections = dataset.get("sections") or []

    wb = Workbook()

    # ---------- Summary ----------
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = title[:120]
    ws["A1"].font = copy(TITLE_FONT)
    ws["A2"] = f"Type: {report_type}"
    next_row = 3
    if detail:
        ws[f"A{next_row}"] = f"Detail: {detail}"
        next_row += 1
    ws[f"A{next_row}"] = f"Generated: {generated_at}"
    next_row += 1
    if metadata.get("report_id") is not None:
        ws[f"A{next_row}"] = f"Report ID: {metadata.get('report_id')}"
        next_row += 1
    row = max(next_row + 1, 6)
    ws.cell(row=row, column=1, value="Filters").font = copy(SUBTITLE_FONT)
    row += 1
    if filters:
        for key, value in filters.items():
            ws.cell(row=row, column=1, value=str(key))
            ws.cell(row=row, column=2, value=_clean(value))
            row += 1
    else:
        ws.cell(row=row, column=1, value="None (full scope)")
        row += 1
    row += 1
    ws.cell(row=row, column=1, value="Key metrics").font = copy(SUBTITLE_FONT)
    row += 1
    metric_rows = [[label, value] for label, value in summary] or [["No metrics", ""]]
    row = _write_table(ws, row, ["Metric", "Value"], metric_rows)

    # ---------- Data (first tabular section) ----------
    data_section = next(
        (s for s in sections if s.get("headers") and s.get("rows")), None
    )
    if data_section and not dataset.get("empty"):
        ws_data = wb.create_sheet("Data")
        ws_data["A1"] = str(data_section.get("heading") or "Data")[:60]
        ws_data["A1"].font = copy(SUBTITLE_FONT)
        _write_table(
            ws_data, 3,
            list(data_section["headers"]), list(data_section["rows"]),
        )
    elif dataset.get("empty"):
        ws_data = wb.create_sheet("Data")
        ws_data["A1"] = "Results"
        ws_data["A1"].font = copy(SUBTITLE_FONT)
        ws_data["A2"] = str(
            dataset.get("empty_message") or "No data available."
        )

    # ---------- Analytics (remaining sections) ----------
    remaining = [s for s in sections if s is not data_section and s.get("rows")]
    if remaining:
        ws_a = wb.create_sheet("Analytics")
        row = 1
        for section in remaining:
            ws_a.cell(
                row=row, column=1,
                value=str(section.get("heading") or "Analytics")[:60],
            ).font = copy(SUBTITLE_FONT)
            row += 1
            row = _write_table(
                ws_a, row,
                list(section.get("headers") or []),
                list(section.get("rows") or []),
            )
            row += 2

    # ---------- Meta ----------
    ws_m = wb.create_sheet("Meta")
    meta_rows = [
        ["Report ID", metadata.get("report_id", "")],
        ["Title", title],
        ["Type", report_type],
        ["Detail", detail or "overview"],
        ["Format", metadata.get("report_format", "EXCEL")],
        ["Status", metadata.get("status", "")],
        ["Generated", generated_at],
        ["Filters", str(filters)],
        ["Data source", "PolicyGPT platform database (live query)"],
    ]
    _write_table(ws_m, 1, ["Field", "Value"], meta_rows)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
