import { Injectable, signal } from "@angular/core";

/** ISO calendar day: `YYYY-MM-DD`. */
export type IsoDay = string;

export interface AnalyticsDateRange {
  /** Display label, e.g. `Jan 1, 2024 - Sep 30, 2024` or `Last 7 Days`. */
  label: string;
  /** Inclusive range bounds as ISO days. */
  startISO: IsoDay;
  endISO: IsoDay;
  /** True once the administrator picked a range (vs the built-in default). */
  touched: boolean;
}

export interface DateRangeSelection {
  label: string;
  startISO: IsoDay;
  endISO: IsoDay;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const STORAGE_KEY = "policygpt.analytics.dateRange.v1";

/**
 * Built-in default range: trailing Last 12 Months from today.
 *
 * A live trailing window (not a fixed historical span) so every
 * date-bounded aggregate is populated on first load without the admin
 * touching the filter. Explicitly stored selections still win on restore.
 */
export function defaultSelection(anchor: Date = new Date()): DateRangeSelection {
  const startOfToday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const start = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - 11, 1);
  const fmt = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return {
    label: "Last 12 Months",
    startISO: toISODay(start),
    endISO: toISODay(startOfToday),
  };
}

/** Default range shown by every Analytics page on first load. */
export const DEFAULT_RANGE_START_ISO = "2024-01-01";
export const DEFAULT_RANGE_END_ISO = "2024-09-30";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODay(d: Date): IsoDay {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDay(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Single source of truth for the Analytics date-range filter.
 *
 * All Admin Analytics pages (overview, policies, schemes, users,
 * departments, usage, support) consume this service instead of keeping
 * private date state, so a range picked on one page applies everywhere.
 * The selection is persisted to sessionStorage so it survives navigation
 * and browser refresh.
 *
 * The backend analytics endpoints expose no start_date/end_date
 * parameters (only `timeframe`/`*_period` presets), so pages map the
 * selected window onto those existing parameters (see monthsSpan /
 * snapMonths) and filter dated rows client-side (see inWindow). Nothing
 * is fabricated: aggregates the API cannot slice by date stay as-is.
 */
@Injectable({ providedIn: "root" })
export class AnalyticsDateRangeService {
  private readonly state = signal<AnalyticsDateRange>(this.restore());

  /** Current range (reactive). */
  readonly range = this.state.asReadonly();

  label(): string {
    return this.state().label;
  }

  startISO(): IsoDay {
    return this.state().startISO;
  }

  endISO(): IsoDay {
    return this.state().endISO;
  }

  touched(): boolean {
    return this.state().touched;
  }

  /** Apply a picker selection (preset or custom calendar range). */
  applySelection(sel: DateRangeSelection): void {
    this.set({ label: sel.label, startISO: sel.startISO, endISO: sel.endISO, touched: true });
  }

  /** Apply a preset label such as `Today`, `Last 7 Days`, `Year to Date`. */
  applyLabel(label: string): void {
    const text = (label || "").trim();
    if (!text) return;
    const sel = selectionForLabel(text);
    if (sel) {
      this.set({ ...sel, touched: true });
      return;
    }
    // Unknown label (e.g. a trend-dropdown value): keep the text so the
    // button still reflects the selection, without constraining the window.
    this.set({ label: text, startISO: this.state().startISO, endISO: this.state().endISO, touched: true });
  }

  /** Reset to the built-in default range. */
  clear(): void {
    const sel = defaultSelection();
    this.set({ ...sel, touched: false });
  }

  /** Millisecond window for client-side row filtering, or null when open. */
  windowMs(): { start: number; end: number } | null {
    const start = parseISODay(this.state().startISO);
    const end = parseISODay(this.state().endISO);
    if (!start || !end) return null;
    const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    return { start: start.getTime(), end: endOfDay.getTime() };
  }

  /**
   * Keep rows whose date falls inside the selected window. Rows without a
   * parseable date are kept (never drop real data the range cannot place).
   */
  inWindow(value: unknown): boolean {
    const win = this.windowMs();
    if (!win) return true;
    const ts = parseRowDate(value);
    if (ts === null) return true;
    return ts >= win.start && ts <= win.end;
  }

  /** Filter dated rows to the selected window (see inWindow). */
  filterByDate<T>(rows: T[], pickDate: (row: T) => unknown): T[] {
    if (!rows || rows.length === 0) return rows;
    return rows.filter((row) => this.inWindow(pickDate(row)));
  }

  /** Inclusive calendar-month span of the selected window (>= 1). */
  monthsSpan(): number {
    const start = parseISODay(this.state().startISO);
    const end = parseISODay(this.state().endISO);
    if (!start || !end) return 9;
    const span = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    return Math.max(1, span);
  }

  /** Whole-day span of the selected window (>= 1). */
  daysSpan(): number {
    const win = this.windowMs();
    if (!win) return 30;
    return Math.max(1, Math.round((win.end - win.start) / 86_400_000));
  }

  /** Nearest supported preset length for `timeframe`/`period` parameters. */
  snapMonths(options: number[]): number {
    const span = this.monthsSpan();
    let best = options[0];
    for (const opt of options) {
      if (Math.abs(opt - span) < Math.abs(best - span)) best = opt;
    }
    return best;
  }

  /** Date params merged into report/export requests for the current range. */
  toReportParams(): Record<string, string> {
    return {
      start_date: this.state().startISO,
      end_date: this.state().endISO,
      date_range: this.state().label,
    };
  }

  formatRange(start: Date, end: Date): string {
    return `${formatDay(start)} - ${formatDay(end)}`;
  }

  private set(next: AnalyticsDateRange): void {
    this.state.set(next);
    this.persist(next);
  }

  private persist(next: AnalyticsDateRange): void {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // Storage unavailable (private mode, SSR): state still works in-memory.
    }
  }

  private restore(): AnalyticsDateRange {
    const live = defaultSelection();
    const fallback: AnalyticsDateRange = {
      label: live.label,
      startISO: live.startISO,
      endISO: live.endISO,
      touched: false,
    };
    try {
      if (typeof sessionStorage === "undefined") return fallback;
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<AnalyticsDateRange>;
      if (!parsed || typeof parsed.label !== "string") return fallback;
      if (!parseISODay(parsed.startISO || "") || !parseISODay(parsed.endISO || "")) return fallback;
      return {
        label: parsed.label,
        startISO: parsed.startISO as IsoDay,
        endISO: parsed.endISO as IsoDay,
        touched: parsed.touched === true,
      };
    } catch {
      return fallback;
    }
  }
}

/**
 * Best-effort timestamp for analytics row dates (`Sep 30, 2024`, ISO
 * strings, epoch millis, Date objects). Returns null when the value
 * carries no usable date (`Recently`, `—`, empty) so callers keep the row.
 */
export function parseRowDate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isNaN(ts) ? null : ts;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const text = String(value).trim();
  if (!text || text === "—" || text === "-" || /^recently$/i.test(text)) return null;
  const ts = Date.parse(text);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Pure selection builder shared by the picker and the service: resolve any
 * preset label or explicit `start - end` display range into concrete ISO
 * bounds without mutating global state. Returns null for labels that carry
 * no date meaning (callers keep the label text only).
 */
export function selectionForLabel(label: string, anchor: Date = new Date()): DateRangeSelection | null {
  const text = (label || "").trim();
  if (!text) return null;
  const startOfToday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const fmt = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const pair = /(.+?)\s*-\s*(.+)/.exec(text);
  if (pair) {
    const s = new Date(pair[1].trim());
    const e = new Date(pair[2].trim());
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      const [from, to] = s.getTime() <= e.getTime() ? [s, e] : [e, s];
      return { label: `${fmt(from)} - ${fmt(to)}`, startISO: toISODay(from), endISO: toISODay(to) };
    }
    return null;
  }
  if (/^today$/i.test(text)) {
    return { label: text, startISO: toISODay(startOfToday), endISO: toISODay(startOfToday) };
  }
  let m = /last\s+(\d+)\s+days?/i.exec(text);
  if (m) {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - (Math.max(1, Number(m[1])) - 1));
    return { label: text, startISO: toISODay(start), endISO: toISODay(startOfToday) };
  }
  m = /last\s+(\d+)\s+months?/i.exec(text);
  if (m) {
    const start = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - (Math.max(1, Number(m[1])) - 1), 1);
    return { label: text, startISO: toISODay(start), endISO: toISODay(startOfToday) };
  }
  if (/year\s*to\s*date/i.test(text)) {
    const start = new Date(startOfToday.getFullYear(), 0, 1);
    return { label: text, startISO: toISODay(start), endISO: toISODay(startOfToday) };
  }
  return null;
}

/** Build a selection from two calendar days (end must not precede start). */
export function selectionForCustom(startISO: IsoDay, endISO: IsoDay): DateRangeSelection | null {
  const s = parseISODay(startISO);
  const e = parseISODay(endISO);
  if (!s || !e || e.getTime() < s.getTime()) return null;
  const fmt = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return { label: `${fmt(s)} - ${fmt(e)}`, startISO: toISODay(s), endISO: toISODay(e) };
}
