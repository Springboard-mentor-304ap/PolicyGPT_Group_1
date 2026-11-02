/**
 * Shared pagination helpers for PolicyGPT list pages
 * (Manage Policies, Manage Schemes, Notification Centre, ...).
 *
 * Keeps every paginated table consistent: a sliding window of page
 * numbers and a rows-per-page value that never exceeds the result set.
 */

/** Default number of page buttons shown in the sliding window. */
export const PAGINATION_WINDOW_SIZE = 3;

/**
 * Sliding window of consecutive page numbers (1-based).
 *
 * Forward-sliding window of at most `maxVisible` entries: the window
 * starts at `current - 2` clamped into range, i.e. start =
 * clamp(current - 2, 1, total - maxVisible + 1). Examples (6 pages):
 * page 1 -> [1, 2, 3]; page 2 -> [1, 2, 3]; page 3 -> [1, 2, 3];
 * page 4 -> [2, 3, 4]; page 5 -> [3, 4, 5]; page 6 -> [4, 5, 6].
 * Fewer pages than `maxVisible` yield only the available pages;
 * zero pages yield [].
 */
export function visiblePageWindow(
  currentPage: number,
  totalPages: number,
  maxVisible: number = PAGINATION_WINDOW_SIZE,
): number[] {
  const total = Math.max(0, Math.floor(totalPages));
  if (total === 0) {
    return [];
  }
  const cap = Math.min(Math.max(1, Math.floor(maxVisible)), total);
  const raw = Math.floor(currentPage);
  const safe = Number.isFinite(raw)
    ? Math.min(Math.max(1, raw), total)
    : 1;
  const start = Math.max(1, Math.min(safe - (cap - 1), total - cap + 1));
  const pages: number[] = [];
  for (let p = start; p < start + cap && p <= total; p++) {
    pages.push(p);
  }
  return pages;
}

/**
 * Effective rows-per-page for a result set.
 *
 * Returns the smaller of the user's selected size and the record
 * count so small result sets fit on one page. Empty sets keep the
 * selected size (never zero) so the control and empty state stay sane.
 */
export function fitPageSize(selectedPageSize: number, totalRecords: number): number {
  const selected =
    Number.isInteger(selectedPageSize) && selectedPageSize > 0
      ? selectedPageSize
      : 1;
  const total = Math.floor(totalRecords);
  if (!Number.isFinite(total) || total <= 0) {
    return selected;
  }
  return Math.min(selected, total);
}
