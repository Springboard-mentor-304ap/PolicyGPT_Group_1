"""PDF report renderer (Part 2) using fpdf2.

Official-government-portal style: branded header, title block, filter
summary, KPI summary, data tables with repeated headers, page numbers,
footer, and an empty-state message. No remote assets, no filesystem
paths, no internal exception details in the output.
"""

from datetime import datetime

from fpdf import FPDF

BRAND_TITLE = "PolicyGPT"
BRAND_TAGLINE = "Government Information. Simplified."
FOOTER_TEXT = "PolicyGPT \u00b7 Official Report \u00b7 System generated"


class _ReportPDF(FPDF):
    def __init__(self, title: str, report_type: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self._doc_title = title
        self._report_type = report_type
        self.set_auto_page_break(True, margin=20)
        self.set_title(title)
        self.set_author(BRAND_TITLE)

    def header(self):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(27, 58, 95)
        self.cell(0, 8, BRAND_TITLE, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 8)
        self.set_text_color(110, 110, 110)
        self.cell(0, 4, BRAND_TAGLINE, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(27, 58, 95)
        self.set_line_width(0.6)
        self.line(self.l_margin, self.get_y() + 1, 210 - self.r_margin, self.get_y() + 1)
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(110, 110, 110)
        self.cell(0, 5, FOOTER_TEXT, align="L")
        self.cell(0, 5, f"Page {self.page_no()}/{{nb}}", align="R")


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


def _col_widths(headers: list, rows: list[list], usable: float) -> list[float]:
    """Proportional widths from max content length, clamped to min/max."""
    if not headers:
        return []
    widths = [len(str(h)) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            if i < len(widths):
                widths[i] = max(widths[i], min(len(str(cell)), 40))
    total = sum(widths) or 1
    raw = [usable * w / total for w in widths]
    minimum = usable * 0.08
    fixed = [max(minimum, min(w, usable * 0.45)) for w in raw]
    scale = usable / (sum(fixed) or 1)
    return [w * scale for w in fixed]


def _table(pdf: _ReportPDF, headers: list, rows: list[list]):
    usable = pdf.w - pdf.l_margin - pdf.r_margin
    widths = _col_widths(headers, rows, usable)
    line_h = 6

    def header_row():
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(27, 58, 95)
        pdf.set_text_color(255, 255, 255)
        for i, head in enumerate(headers):
            pdf.cell(widths[i], line_h, _clean(head)[:60], border=1, fill=True)
        pdf.ln()
        pdf.set_text_color(30, 30, 30)

    pdf.set_font("Helvetica", "", 8)
    header_row()
    fill = False
    for row in rows:
        if pdf.get_y() > 265:
            pdf.add_page()
            header_row()
        # Row height from the longest wrapped cell.
        max_lines = 1
        for i, cell in enumerate(row):
            text = _clean(cell)
            lines = max(1, int(len(text) * pdf.get_string_width("x") / max(widths[i], 1)) + 1)
            max_lines = max(max_lines, min(lines, 4))
        height = line_h * min(max_lines, 3)
        if pdf.get_y() + height > 268:
            pdf.add_page()
            header_row()
        if fill:
            pdf.set_fill_color(240, 244, 248)
        else:
            pdf.set_fill_color(255, 255, 255)
        x0 = pdf.get_x()
        y0 = pdf.get_y()
        for i in range(len(headers)):
            text = _clean(row[i] if i < len(row) else "")[:200]
            pdf.set_xy(x0 + sum(widths[:i]), y0)
            pdf.multi_cell(widths[i], line_h, text, border=1, fill=True, max_line_height=line_h)
        # Normalize cursor to the row bottom.
        pdf.set_xy(x0, y0 + height)
        fill = not fill


def render_report_pdf(dataset: dict, metadata: dict) -> bytes:
    """Render a report dataset to PDF bytes."""
    title = str(dataset.get("title") or metadata.get("title") or "Report")
    report_type = str(dataset.get("report_type") or metadata.get("report_type") or "")
    detail = str(
        dataset.get("detail") or metadata.get("detail") or ""
    )
    generated_at = str(
        dataset.get("generated_at") or metadata.get("generated_at") or ""
    )
    filters = dataset.get("filters") or metadata.get("filters") or {}
    summary = dataset.get("summary") or []
    sections = dataset.get("sections") or []

    pdf = _ReportPDF(title=title[:120], report_type=report_type)
    pdf.alias_nb_pages()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(27, 58, 95)
    pdf.multi_cell(0, 8, _clean(title)[:120])
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 6, f"Type: {_clean(report_type)}", new_x="LMARGIN", new_y="NEXT")
    if detail:
        pdf.cell(0, 6, f"Detail: {_clean(detail)}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(
        0,
        6,
        f"Generated: {_clean(generated_at or datetime.utcnow().isoformat())}",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    if metadata.get("report_id") is not None:
        pdf.cell(
            0, 6, f"Report ID: {metadata.get('report_id')}",
            new_x="LMARGIN", new_y="NEXT",
        )
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(27, 58, 95)
    pdf.cell(0, 7, "Selected filters", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(40, 40, 40)
    if filters:
        for key, value in filters.items():
            pdf.cell(0, 5, f"- {_clean(key)}: {_clean(value)[:100]}",
                     new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.cell(0, 5, "- None (full scope)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(27, 58, 95)
    pdf.cell(0, 7, "Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(40, 40, 40)
    if summary:
        for label, value in summary:
            pdf.cell(0, 5, f"- {_clean(label)}: {_clean(value)}",
                     new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.cell(0, 5, "- No summary values.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    if dataset.get("empty"):
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(27, 58, 95)
        pdf.cell(0, 7, "Results", new_x="LMARGIN", new_y="NEXT")
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
            if pdf.get_y() > 250:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(27, 58, 95)
            pdf.cell(0, 7, _clean(heading)[:100], new_x="LMARGIN", new_y="NEXT")
            if headers and rows:
                _table(pdf, headers, rows)
            elif headers:
                pdf.set_font("Helvetica", "", 9)
                pdf.set_text_color(60, 60, 60)
                pdf.cell(0, 5, "No rows in this section.",
                         new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

    output = pdf.output()
    if isinstance(output, (bytes, bytearray)):
        return bytes(output)
    return str(output).encode("latin-1")
