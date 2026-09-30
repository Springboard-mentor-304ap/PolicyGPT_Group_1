"""PDF report renderer using fpdf2.

Shared official-government-report layout system: branded header,
metadata block, compact summary grid, data tables with measured
row heights, repeated headers and natural pagination, footer with
page numbers, and an empty-state message.

Orientation is chosen from the actual report layout: tables wider
than six columns render on A4 landscape, everything else stays on
A4 portrait. No remote assets, no filesystem paths, no internal
exception details in the output.
"""

from datetime import datetime

from fpdf import FPDF
from fpdf.enums import MethodReturnValue

BRAND_TITLE = "PolicyGPT"
BRAND_TAGLINE = "Government Information. Simplified."
FOOTER_TEXT = "PolicyGPT \u00b7 Official Report \u00b7 System generated"

NAVY = (27, 58, 95)
BODY_TEXT = (30, 30, 30)
MUTED_TEXT = (110, 110, 110)
HEADER_FILL = (27, 58, 95)
ROW_ALT_FILL = (240, 244, 248)

TABLE_HEADER_PT = 8
TABLE_BODY_PT = 7.5
LINE_HEIGHT = 4.6

#: Tables wider than this many columns switch the document to
#: A4 landscape so columns stay readable.
LANDSCAPE_MIN_COLUMNS = 6


class _ReportPDF(FPDF):
    def __init__(self, title: str, landscape: bool = False):
        # NOTE: fpdf2 honours add_page(orientation=...) only from the
        # second page on, so the constructor must carry the orientation
        # for page 1 to have the correct MediaBox.
        super().__init__(
            orientation="L" if landscape else "P", unit="mm", format="A4"
        )
        self.set_auto_page_break(True, margin=20)
        self.set_title(title)
        self.set_author(BRAND_TITLE)

    def header(self):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*NAVY)
        self.cell(0, 8, BRAND_TITLE, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED_TEXT)
        self.cell(0, 4, BRAND_TAGLINE, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*NAVY)
        self.set_line_width(0.6)
        right = self.w - self.r_margin
        self.line(self.l_margin, self.get_y() + 1, right, self.get_y() + 1)
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED_TEXT)
        self.cell(
            0, 5, FOOTER_TEXT, align="L",
            new_x="LMARGIN", new_y="NEXT",
        )
        self.cell(
            0, 5, f"Page {self.page_no()}/{{nb}}", align="R",
            new_x="LMARGIN", new_y="NEXT",
        )


def _clean(text: object) -> str:
    """fpdf2 core fonts are latin-1; replace unsupported glyphs safely."""
    if text is None:
        return ""
    return (
        str(text)
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2026", "...")
        .replace("\u00b7", "-")
        .replace("\u20b9", "Rs.")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def _prettify_header(header: str) -> str:
    """full_name -> Full Name, user_id -> User ID (display only)."""
    words = str(header or "").strip().lower().replace("_", " ").split()
    fixed = {"Id": "ID"}
    return " ".join(fixed.get(w[:1].upper() + w[1:], w[:1].upper() + w[1:]) for w in words)


def _prettify_report_type(report_type: str) -> str:
    """USER_REPORT -> User Report (display only, value unchanged)."""
    words = str(report_type or "").strip().lower().replace("_", " ").split()
    return " ".join(w[:1].upper() + w[1:] for w in words) or "Report"


def _prettify_detail(detail: str) -> str:
    """ministry-wise -> Ministry Wise (display only)."""
    words = str(detail or "").strip().lower().replace("_", " ").replace("-", " ").split()
    return " ".join(w[:1].upper() + w[1:] for w in words)


def _format_generated(value: str) -> str:
    """2026-09-29T... -> 29 Sep 2026 (falls back to the raw value)."""
    text = str(value or "").strip()
    for pattern in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:19], pattern).strftime("%d %b %Y")
        except ValueError:
            continue
    return text[:10] or datetime.utcnow().strftime("%d %b %Y")


def _widest_table(sections: list) -> int:
    """Maximum column count across sections with actual rows."""
    width = 0
    for section in sections or []:
        headers = section.get("headers") or []
        rows = section.get("rows") or []
        if headers and rows:
            width = max(width, len(headers))
    return width


def _col_widths(headers: list, rows: list[list], usable: float) -> list[float]:
    """Relative widths from header + capped content length.

    Content sampled per column is capped so one long value cannot
    starve narrow columns; every column keeps a usable minimum and
    widths always sum to exactly the usable page width.
    """
    count = len(headers)
    if not count:
        return []
    weights = []
    for i, head in enumerate(headers):
        sample = len(str(head or "")) + 2
        for row in rows:
            if i < len(row) and row[i] is not None:
                sample = max(sample, min(len(str(row[i])), 26))
        weights.append(max(sample, 6))
    total = sum(weights) or 1
    widths = [usable * w / total for w in weights]
    minimum = usable / count * 0.45
    widths = [max(w, minimum) for w in widths]
    scale = usable / (sum(widths) or 1)
    return [w * scale for w in widths]


def _measure_lines(pdf: _ReportPDF, text: str, width: float) -> int:
    """Exact wrapped-line count using fpdf2 dry-run measurement."""
    lines = pdf.multi_cell(
        width,
        LINE_HEIGHT,
        text,
        dry_run=True,
        output=MethodReturnValue.LINES,
    )
    return max(1, len(lines) if isinstance(lines, list) else 1)


def _table(pdf: _ReportPDF, headers: list, rows: list[list]):
    usable = pdf.w - pdf.l_margin - pdf.r_margin
    widths = _col_widths(headers, rows, usable)

    def header_row():
        pdf.set_font("Helvetica", "B", TABLE_HEADER_PT)
        pdf.set_fill_color(*HEADER_FILL)
        pdf.set_text_color(255, 255, 255)
        h = LINE_HEIGHT + 1.2
        x0 = pdf.get_x()
        y0 = pdf.get_y()
        for i, head in enumerate(headers):
            pdf.set_xy(x0 + sum(widths[:i]), y0)
            pdf.multi_cell(
                widths[i], h, _clean(_prettify_header(head))[:60],
                border=1, fill=True, align="C",
                max_line_height=h,
            )
        pdf.set_xy(x0, y0 + h)
        pdf.set_text_color(*BODY_TEXT)

    def row_height(row: list) -> float:
        pdf.set_font("Helvetica", "", TABLE_BODY_PT)
        tallest = 1
        for i in range(len(headers)):
            text = _clean(row[i] if i < len(row) else "")[:300]
            tallest = max(tallest, _measure_lines(pdf, text, widths[i]))
        return tallest * LINE_HEIGHT + 1.4

    pdf.set_font("Helvetica", "", TABLE_BODY_PT)
    header_row()
    fill = False
    limit = pdf.page_break_trigger
    for row in rows:
        height = row_height(row)
        if pdf.get_y() + height > limit:
            pdf.add_page()
            header_row()
        pdf.set_fill_color(*ROW_ALT_FILL if fill else (255, 255, 255))
        x0 = pdf.get_x()
        y0 = pdf.get_y()
        bottom = y0 + LINE_HEIGHT
        for i in range(len(headers)):
            text = _clean(row[i] if i < len(row) else "")[:300]
            pdf.set_xy(x0 + sum(widths[:i]), y0)
            pdf.multi_cell(
                widths[i], LINE_HEIGHT, text,
                border=0, fill=True, max_line_height=LINE_HEIGHT,
            )
            bottom = max(bottom, pdf.get_y())
        row_h = bottom - y0
        # Crisp frame drawn at the measured height: outer rect plus
        # column dividers (cells themselves carry no borders).
        pdf.rect(x0, y0, usable, row_h)
        for i in range(1, len(headers)):
            x = x0 + sum(widths[:i])
            pdf.line(x, y0, x, y0 + row_h)
        pdf.set_xy(x0, y0 + row_h)
        fill = not fill


def _metadata_block(pdf: _ReportPDF, items: list[tuple[str, str]]):
    """Compact two-column label/value block (never overflows)."""
    usable = pdf.w - pdf.l_margin - pdf.r_margin
    label_w = usable * 0.28
    value_w = usable - label_w
    pdf.set_font("Helvetica", "", 10)
    for label, value in items:
        pdf.set_text_color(*MUTED_TEXT)
        x0, y0 = pdf.get_x(), pdf.get_y()
        pdf.set_font("Helvetica", "", 10)
        label_lines = _measure_lines(pdf, label, label_w - 2)
        pdf.set_xy(x0, y0)
        pdf.multi_cell(label_w, 6, label, max_line_height=6)
        after_label = pdf.get_y()
        pdf.set_xy(x0 + label_w, y0)
        pdf.set_text_color(*BODY_TEXT)
        pdf.set_font("Helvetica", "B", 10)
        pdf.multi_cell(value_w, 6, value, max_line_height=6)
        after_value = pdf.get_y()
        pdf.set_xy(x0, max(after_label, after_value))
    pdf.set_text_color(*BODY_TEXT)


def _summary_grid(pdf: _ReportPDF, summary: list):
    """Three KPI cards per row instead of a long bullet list."""
    if not summary:
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 5, "No summary values.", new_x="LMARGIN", new_y="NEXT")
        return
    usable = pdf.w - pdf.l_margin - pdf.r_margin
    cols = 3
    cell_w = usable / cols
    pdf.set_draw_color(223, 230, 238)
    pdf.set_line_width(0.3)
    row_items: list[tuple[str, str]] = []
    for label, value in summary:
        row_items.append((_clean(label)[:40], _clean(value)[:40]))
        if len(row_items) == cols:
            _summary_row(pdf, row_items, cell_w)
            row_items = []
    if row_items:
        _summary_row(pdf, row_items, cell_w)
    pdf.set_draw_color(*NAVY)
    pdf.set_line_width(0.6)


def _summary_row(pdf: _ReportPDF, items: list[tuple[str, str]], cell_w: float):
    x0 = pdf.get_x()
    y0 = pdf.get_y()
    h = 13
    if y0 + h > pdf.page_break_trigger:
        pdf.add_page()
        x0, y0 = pdf.get_x(), pdf.get_y()
    for i in range(3):
        x = x0 + i * cell_w
        pdf.set_xy(x, y0)
        if i < len(items):
            label, value = items[i]
            pdf.set_fill_color(250, 251, 253)
            pdf.cell(cell_w, h, border=1, fill=True)
            pdf.set_xy(x + 2, y0 + 1.5)
            pdf.set_font("Helvetica", "", 7.5)
            pdf.set_text_color(*MUTED_TEXT)
            pdf.cell(cell_w - 4, 4, label)
            pdf.set_xy(x + 2, y0 + 6.5)
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(*BODY_TEXT)
            pdf.cell(cell_w - 4, 5.5, value)
        else:
            pdf.set_xy(x, y0)
            pdf.cell(cell_w, h, border=0)
    pdf.set_xy(x0, y0 + h + 1.5)
    pdf.set_text_color(*BODY_TEXT)


def _section_title(pdf: _ReportPDF, text: str):
    if pdf.get_y() > pdf.page_break_trigger - 20:
        pdf.add_page()
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 7, _clean(text)[:100], new_x="LMARGIN", new_y="NEXT")


def render_report_pdf(dataset: dict, metadata: dict) -> bytes:
    """Render a report dataset to PDF bytes."""
    raw_title = str(dataset.get("title") or metadata.get("title") or "Report")
    report_type = str(dataset.get("report_type") or metadata.get("report_type") or "")
    detail = str(dataset.get("detail") or metadata.get("detail") or "")
    generated_at = str(
        dataset.get("generated_at") or metadata.get("generated_at") or ""
    )
    filters = {
        key: value
        for key, value in (
            dataset.get("filters") or metadata.get("filters") or {}
        ).items()
        if key != "detail"
    }
    summary = dataset.get("summary") or []
    sections = dataset.get("sections") or []

    display_title = _prettify_report_type(report_type)

    landscape = _widest_table(sections) > LANDSCAPE_MIN_COLUMNS
    pdf = _ReportPDF(title=raw_title[:120], landscape=landscape)
    pdf.alias_nb_pages()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*NAVY)
    pdf.multi_cell(0, 8, _clean(display_title)[:120])
    if raw_title and raw_title != report_type:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(60, 60, 60)
        pdf.multi_cell(0, 6, _clean(raw_title)[:120])
    pdf.ln(1)

    meta_items = [
        ("Report Type", report_type),
        ("Detail", _prettify_detail(detail) if detail else "Overview"),
        ("Generated", _format_generated(generated_at)),
    ]
    if metadata.get("report_id") is not None:
        meta_items.append(("Report ID", str(metadata.get("report_id"))))
    _metadata_block(pdf, meta_items)
    pdf.ln(2)

    _section_title(pdf, "Selected Filters")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(40, 40, 40)
    if filters:
        for key, value in filters.items():
            pdf.cell(
                0, 5, f"- {_clean(key)}: {_clean(value)[:100]}",
                new_x="LMARGIN", new_y="NEXT",
            )
    else:
        pdf.cell(0, 5, "None (full scope)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    _section_title(pdf, "Summary")
    _summary_grid(pdf, summary)
    pdf.ln(2)

    if dataset.get("empty"):
        _section_title(pdf, "Results")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(60, 60, 60)
        pdf.multi_cell(
            0, 6, _clean(dataset.get("empty_message") or "No data available.")
        )
    else:
        for section in sections:
            heading = str(section.get("heading") or "Data")
            headers = list(section.get("headers") or [])
            rows = list(section.get("rows") or [])
            _section_title(pdf, heading)
            if headers and rows:
                _table(pdf, headers, rows)
            elif headers:
                pdf.set_font("Helvetica", "", 9)
                pdf.set_text_color(60, 60, 60)
                pdf.cell(
                    0, 5, "No rows in this section.",
                    new_x="LMARGIN", new_y="NEXT",
                )
            pdf.ln(2)

    output = pdf.output()
    if isinstance(output, (bytes, bytearray)):
        return bytes(output)
    return str(output).encode("latin-1")
