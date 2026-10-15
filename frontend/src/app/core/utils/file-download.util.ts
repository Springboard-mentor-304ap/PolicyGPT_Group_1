/**
 * Browser file-download helper for client-generated exports.
 *
 * Large UI libraries (jsPDF's `doc.save()`, SheetJS's `XLSX.writeFile()`)
 * detect a non-browser runtime and silently fall back to writing files
 * with Node's `fs` module. That fallback is what dropped export files
 * such as `policygpt-policies-*.pdf` into the project directory when
 * exports ran outside a real browser (tests, SSR-style runners).
 *
 * Always exchanging library output for an explicit Blob + anchor
 * download keeps every export on the browser-managed download path:
 * the file lands in the user's configured Downloads location on any
 * machine, and nothing is ever written to the project directory.
 * Temporary object URLs are revoked after the click is dispatched.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  // Strip any directory portion: the `download` attribute must be a
  // bare filename so the browser — never this code — picks the folder.
  const safeName =
    filename.split("/").pop()?.split("\\").pop() || "download";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** MIME type for `.xlsx` workbooks produced via `XLSX.write(..., { type: "array" })`. */
export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
