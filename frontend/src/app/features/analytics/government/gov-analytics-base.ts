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

/** Backend custom windows are capped at 24 months (see resolve_gov_window). */
const MAX_CUSTOM_DAYS = 731;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
};

/**
 * Shared behaviour for the four Government Analytics pages:
 * segmented day/month presets + custom range, loading/error states,
 * OnPush refresh, export menu, date formatting and label prettifying.
 */
@Directive()
export abstract class GovAnalyticsBase implements OnInit, OnDestroy {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly cdr = inject(ChangeDetectorRef);
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
   * Standardized segmented timeline (Last 7 Days through Custom).
   * Day-based presets resolve to explicit trailing custom windows because
   * the backend `months` parameter is calendar-month based; month presets
   * keep using it directly. Default stays Last 12 Months on every page.
   */
  range: GovtRangeKey = "12m";
  readonly rangeOptions = GOVT_RANGE_OPTIONS;
  private lastPreset: GovtRangeKey = "12m";

  months = 12;
  customFrom = "";
  customTo = "";
  showCustom = false;
  showExportMenu = false;

  readonly monthOptions = GOVT_MONTHS;

  ngOnInit(): void {
    this.crumbs = [
      { label: "Home", route: ["/dashboard/government"] },
      { label: this.pageTitle },
    ];
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
    if (this.range === "7d" || this.range === "30d") {
      // Trailing day window: custom dates override `months` server-side.
      const days = this.range === "7d" ? 7 : 30;
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - (days - 1));
      return { months: 1, date_from: toISODate(start), date_to: toISODate(end) };
    }
    if (this.range === "custom" && this.customFrom && this.customTo) {
      return { months: this.months, date_from: this.customFrom, date_to: this.customTo };
    }
    return { months: this.months };
  }

  setRange(key: GovtRangeKey): void {
    if (key === "custom") {
      // Custom pill toggles the calendar open/closed (close cancels
      // back to the last applied preset).
      this.toggleCustom();
      return;
    }
    if (this.range === key && !this.showCustom) {
      return;
    }
    this.range = key;
    this.lastPreset = key;
    this.months = key === "7d" || key === "30d" ? 1 : Number(key.replace("m", ""));
    this.showCustom = false;
    this.loadData(false);
  }

  setMonths(months: number): void {
    if (months === 6) {
      this.setRange("6m");
    } else if (months === 9) {
      this.setRange("9m");
    } else {
      this.setRange("12m");
    }
  }

  toggleCustom(): void {
    this.showCustom = !this.showCustom;
    if (this.showCustom) {
      this.range = "custom";
      this.cdr.markForCheck();
    } else {
      // Cancel back to the last applied preset (data stays untouched
      // until a preset or Apply triggers a reload).
      this.range = this.lastPreset;
      this.months =
        this.lastPreset === "7d" || this.lastPreset === "30d"
          ? 1
          : Number(this.lastPreset.replace("m", ""));
      this.loadData(false);
    }
  }

  applyCustom(): void {
    if (!this.customFrom || !this.customTo) {
      this.error = "Select both a start and an end date for the custom range.";
      this.cdr.markForCheck();
      return;
    }
    if (this.customTo < this.customFrom) {
      this.error = "End date cannot be before start date.";
      this.cdr.markForCheck();
      return;
    }
    const spanDays =
      Math.round(
        (Date.parse(this.customTo) - Date.parse(this.customFrom)) / 86_400_000,
      ) + 1;
    if (Number.isFinite(spanDays) && spanDays > MAX_CUSTOM_DAYS) {
      this.error = "Date window is limited to 24 months.";
      this.cdr.markForCheck();
      return;
    }
    this.range = "custom";
    this.loadData(false);
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
