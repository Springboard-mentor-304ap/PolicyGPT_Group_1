/**
 * Shared URL linkification for PolicyGPT detail surfaces.
 *
 * Splits plain text into text/link segments so templates can render
 * real anchor elements with interpolation only (never innerHTML, so
 * no markup or script can ever be injected through record data).
 *
 * Safety rules:
 * - Only `http://` and `https://` URLs become links; any other
 *   scheme (notably `javascript:`) stays plain text.
 * - Trailing punctuation (`.,;:!?` and closing quotes/brackets) is
 *   preserved as surrounding text, never swallowed into the link.
 * - All original characters are preserved across segments.
 * - Non-string input yields no segments; empty text yields none.
 */

export interface LinkSegment {
  /** Plain prose (`text`) or a clickable URL (`link`). */
  kind: "text" | "link";
  /** Display text (the URL itself for links, punctuation kept). */
  text: string;
  /** Absolute URL for links; identical to `text` for links. */
  href: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`\]]+/g;

/** Punctuation that visually trails a URL but is not part of it. */
const TRAILING_PUNCT = /[.,;:!?'")\]]+$/;

/** Split `value` into plain-text and clickable-URL segments. */
export function splitLinkSegments(value: unknown): LinkSegment[] {
  if (value === null || value === undefined) return [];

  const source = String(value);

  if (!source) return [];

  const segments: LinkSegment[] = [];

  URL_PATTERN.lastIndex = 0;

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_PATTERN.exec(source)) !== null) {
    if (match.index > cursor) {
      segments.push({
        kind: "text",
        text: source.slice(cursor, match.index),
        href: "",
      });
    }

    let url = match[0];
    // Keep a trailing ")" only when it balances an opening paren
    // inside the URL itself (e.g. Wikipedia article paths).
    const trailing = url.match(TRAILING_PUNCT)?.[0] ?? "";
    if (trailing) {
      let drop = trailing;
      if (drop.endsWith(")")) {
        const opens = (url.match(/\(/g) ?? []).length;
        const closes = (url.match(/\)/g) ?? []).length;
        if (opens >= closes) drop = drop.slice(0, -1);
      }
      if (drop) url = url.slice(0, -drop.length);
    }

    segments.push({ kind: "link", text: url, href: url });

    cursor = match.index + url.length;

    const tail = source.slice(cursor, match.index + match[0].length);
    if (tail) {
      segments.push({ kind: "text", text: tail, href: "" });
      cursor = match.index + match[0].length;
    }
  }

  if (cursor < source.length) {
    segments.push({ kind: "text", text: source.slice(cursor), href: "" });
  }

  // Coalesce adjacent plain-text segments (e.g. trailing punctuation
  // split from its sentence) so rendering stays a minimal run list.
  const merged: LinkSegment[] = [];
  for (const segment of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === "text" && segment.kind === "text") {
      prev.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}
