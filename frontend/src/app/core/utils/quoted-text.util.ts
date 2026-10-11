/**
 * Shared quoted-name text splitting for PolicyGPT notifications,
 * dialogs, and notification surfaces.
 *
 * Operational messages wrap policy/scheme record names in double
 * quotation marks (`Policy "River Plan" approved successfully.`).
 * This helper splits such text into plain/bold segments so shared
 * components can render every quoted name in bold WITHOUT the
 * quotation marks, using text interpolation only (never innerHTML).
 *
 * Safety rules (unrelated text is never corrupted):
 * - Only double quotation marks act as delimiters; apostrophes in
 *   normal prose are untouched.
 * - Only paired quotes with non-blank content split; a lone or empty
 *   `""` pair stays literal.
 * - All original characters are preserved across segments.
 */

export interface QuotedTextSegment {
  /** Segment text with surrounding quotes already removed. */
  text: string;
  /** True for quoted record names (render bold). */
  bold: boolean;
}

/** Split `text` into plain/bold segments on double-quoted names. */
export function splitQuotedSegments(text: string): QuotedTextSegment[] {
  const source = text ?? "";
  const segments: QuotedTextSegment[] = [];
  const pattern = /"([^"]+)"/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const name = match[1];
    if (!name.trim()) {
      continue;
    }
    if (match.index > lastIndex) {
      segments.push({ text: source.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: name, bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    segments.push({ text: source.slice(lastIndex), bold: false });
  }
  if (segments.length === 0) {
    segments.push({ text: source, bold: false });
  }
  return segments;
}
