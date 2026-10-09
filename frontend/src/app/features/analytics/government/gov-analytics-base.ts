import {
  ChangeDetectorRef,
  Directive,
  OnDestroy,
  OnInit,
  inject,
} from "@angular/core";
import { Observable, Subscription } from "rxjs";

import { AnalyticsService } from "../../../core/services/analytics.service";
import { BreadcrumbItem } from "../../../shared/components/breadcrumb/breadcrumb.component";
import {
  AnalyticsDateRangeService,
  selectionForCustom,
  type DateRangeSelection,
} from "../shared/analytics-date-range.service";

export interface GovtKpiCard {
  key: string;
  label: string;
  icon: string;
  tone: "blue" | "green" | "orange" | "purple";
  value: string;
  tooltip: string;
  tracked: boolean;
}

export const GOVT_MONTHS = [6, 9, 12];

export type GovtRangeKey = "7d" | "30d" | "6m" | "9m" | "12m" | "custom";

export const GOVT_RANGE_OPTIONS: { key: GovtRangeKey; label: string }[] = [
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "6m", label: "Last 6 Months" },
  { key: "9m", label: "Last 9 Months" },
  { key: "12m", label: "Last 12 Months" },
  { key: "custom", label: "Custom" },
];

/**
 * Admin-aligned preset options bound to the shared
 * `app-date-range-picker` on every Government Analytics page.
 * Same dropdown styling, calendar interaction and validation as the
 * Admin Analytics pages; the picker's built-in custom calendar covers
 * the Custom Date Range option.
 */
export const GOVT_DATE_PRESETS = [
  "Last 6 Months",
  "Last 9 Months",
  "Last 12 Months",
];

/** Backend custom windows are capped at 24 months (see resolve_gov_window). */
const MAX_CUSTOM_DAYS = 731;

export const ROLE_COLORS: Record<string, string> = {
  CITIZEN: "#1461a0",
  RESEARCHER: "#17833d",
  ORGANIZATION: "#c26a00",
  GOVERNMENT_OFFICIAL: "#7e22ce",
  ADMIN: "#0e7490",
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  PENDING_APPROVAL: "#c26a00",
  APPROVED: "#17833d",
  REJECTED: "#c0392b",
  ARCHIVED: "#7e22ce",
  DELETE_REQUESTED: "#ea580c",
  ARCHIVE_REQUESTED: "#0e7490",
};

/**
 * Shared behaviour for the four Government Analytics pages:
 * Admin-aligned date filter (shared `app-date-range-picker` +
 * `AnalyticsDateRangeService`), loading/error states, OnPush refresh,
 * export menu, date formatting and label prettifying.
 */
@Directive()
export abstract class GovAnalyticsBase implements OnInit, OnDestroy {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly cdr = inject(ChangeDetectorRef);
  protected readonly rangeService = inject(AnalyticsDateRangeService);
  private subscription: Subscription | null = null;

  abstract pageTitle: string;
  abstract pageDescription: string;
  abstract exportPrefix: string;

  crumbs: BreadcrumbItem[] = [
    { label: "Home", route: ["/dashboard/government"] },
    { label: "Analytics" },
  ];

  loading = true;
  error: string | null = null;

  /**
   * Admin-aligned date filter (shared `app-date-range-picker` +
   * `AnalyticsDateRangeService`, same as every Admin Analytics page).
   * Display label bound to the picker's `[value]`; the picker emits
   * `rangeChange` (label preview) and `rangeSelect` (full ISO bounds
   * used to reload data and stamp exports).
   */
  currentRange = "";
  readonly datePresets = GOVT_DATE_PRESETS;

  /**
   * @deprecated Legacy segmented state, kept as a mirror for backwards
   * compatibility. The picker + `rangeService` is the source of truth;
   * `windowParams()` no longer reads these fields.
   */
  range: GovtRangeKey = "12m";
  readonly rangeOptions = GOVT_RANGE_OPTIONS;
  private lastPreset: GovtRangeKey = "12m";

  /** @deprecated Mirror of the shared range window (see rangeService). */
  months = 12;
  /** @deprecated Mirror of the shared custom window (picker owns it now). */
  customFrom = "";
  /** @deprecated Mirror of the shared custom window (picker owns it now). */
  customTo = "";
  /** @deprecated No longer rendered (picker has its own dropdown). */
  showCustom = false;
  showExportMenu = false;

  readonly monthOptions = GOVT_MONTHS;

  ngOnInit(): void {
    this.crumbs = [
      { label: "Home", route: ["/dashboard/government"] },
      { label: this.pageTitle },
    ];
    this.currentRange = this.rangeService.label();
    this.syncLegacyFromService();
    this.loadData(false);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  abstract loadData(forceRefresh: boolean): void;

  abstract downloadExcel(): void;

  protected subscribe<T>(source: Observable<T>, onData: (data: T) => void): void {
    this.loading = true;
    this.error = null;
    this.subscription?.unsubscribe();
    this.subscription = source.subscribe({
      next: (data) => {
        onData(data);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error =
          err?.error?.detail ??
          "Unable to load analytics. Please check your connection and try again.";
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  protected windowParams(): { months: number; date_from?: string; date_to?: string } {
    // Shared Admin window: exact ISO bounds always accompany `months`
    // (custom dates override `months` server-side in resolve_gov_window),
    // so the displayed picker range always matches the queried data.
    // `months` snaps to the backend-friendly 6/9/12 presets.
    return {
      months: this.rangeService.snapMonths([6, 9, 12]),
      date_from: this.rangeService.startISO(),
      date_to: this.rangeService.endISO(),
    };
  }

  /** Picker label preview (compat with Admin `rangeChange` handling). */
  onDateRangeChange(range: string): void {
    this.currentRange = range;
    this.cdr.markForCheck();
  }

  /** Picker selection: apply the shared window and reload (Admin parity). */
  onDateRangeSelect(sel: DateRangeSelection): void {
    if (!sel || !sel.startISO || !sel.endISO) {
      this.error = "Select both a start and an end date for the custom range.";
      this.cdr.markForCheck();
      return;
    }
    if (sel.endISO < sel.startISO) {
      this.error = "End date cannot be before start date.";
      this.cdr.markForCheck();
      return;
    }
    const spanDays =
      Math.round(
        (Date.parse(sel.endISO) - Date.parse(sel.startISO)) / 86_400_000,
      ) + 1;
    if (Number.isFinite(spanDays) && spanDays > MAX_CUSTOM_DAYS) {
      this.error = "Date window is limited to 24 months.";
      this.cdr.markForCheck();
      return;
    }
    this.rangeService.applySelection(sel);
    this.currentRange = sel.label;
    this.syncLegacyFromService();
    this.loadData(false);
  }

  /**
   * Mirror the shared window onto legacy fields so any programmatic
   * readers of `range`/`months`/`customFrom`/`customTo` stay correct.
   * Never triggers a reload; the picker + service own the state.
   */
  private syncLegacyFromService(): void {
    const label = this.rangeService.label();
    this.months = this.rangeService.snapMonths([6, 9, 12]);
    if (label === "Last 6 Months") {
      this.range = "6m";
      this.lastPreset = "6m";
      this.showCustom = false;
    } else if (label === "Last 9 Months") {
      this.range = "9m";
      this.lastPreset = "9m";
      this.showCustom = false;
    } else if (label === "Last 12 Months") {
      this.range = "12m";
      this.lastPreset = "12m";
      this.showCustom = false;
    } else if (label === "Last 7 Days") {
      this.range = "7d";
      this.lastPreset = "7d";
      this.months = 1;
      this.showCustom = false;
    } else if (label === "Last 30 Days") {
      this.range = "30d";
      this.lastPreset = "30d";
      this.months = 1;
      this.showCustom = false;
    } else {
      this.range = "custom";
      this.customFrom = this.rangeService.startISO();
      this.customTo = this.rangeService.endISO();
      this.showCustom = false;
    }
    this.customFrom = this.range === "custom" ? this.rangeService.startISO() : this.customFrom;
    this.customTo = this.range === "custom" ? this.rangeService.endISO() : this.customTo;
  }

  /** @deprecated Use the shared picker; routes through rangeService. */
  setRange(key: GovtRangeKey): void {
    if (key === "custom") {
      this.toggleCustom();
      return;
    }
    const label =
      key === "6m"
        ? "Last 6 Months"
        : key === "9m"
          ? "Last 9 Months"
          : key === "12m"
            ? "Last 12 Months"
            : key === "7d"
              ? "Last 7 Days"
              : "Last 30 Days";
    this.rangeService.applyLabel(label);
    this.currentRange = this.rangeService.label();
    this.syncLegacyFromService();
    this.loadData(false);
  }

  /** @deprecated Use the shared picker; routes through rangeService. */
  setMonths(months: number): void {
    if (months === 6) {
      this.setRange("6m");
    } else if (months === 9) {
      this.setRange("9m");
    } else {
      this.setRange("12m");
    }
  }

  /** @deprecated The picker owns the custom calendar now. */
  toggleCustom(): void {
    this.showCustom = !this.showCustom;
    if (this.showCustom) {
      this.range = "custom";
      this.cdr.markForCheck();
    } else {
      // Cancel back to the last applied preset without touching data
      // until a preset or Apply triggers a reload.
      this.range = this.lastPreset;
      this.months =
        this.lastPreset === "7d" || this.lastPreset === "30d"
          ? 1
          : Number(this.lastPreset.replace("m", ""));
      this.loadData(false);
    }
  }

  /** @deprecated The picker validates + applies custom ranges now. */
  applyCustom(): void {
    if (!this.customFrom || !this.customTo) {
      this.error = "Select both a start and an end date for the custom range.";
      this.cdr.markForCheck();
      return;
    }
    const sel = selectionForCustom(this.customFrom, this.customTo);
    if (!sel) {
      this.error = "End date cannot be before start date.";
      this.cdr.markForCheck();
      return;
    }
    this.onDateRangeSelect(sel);
  }

  retry(): void {
    this.loadData(true);
  }

  toggleExportMenu(): void {
    this.showExportMenu = !this.showExportMenu;
  }

  formatDate(value: string | null): string {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10);
    }
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  pretty(value: string | null | undefined): string {
    return String(value ?? "—")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
