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
 * month presets + custom range, loading/error states, OnPush refresh,
 * export menu, date formatting and label prettifying.
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

  months = 12;
  customFrom = "";
  customTo = "";
  showCustom = false;
  showExportMenu = false;

  readonly monthOptions = GOVT_MONTHS;

  ngOnInit(): void {
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
    if (this.showCustom && this.customFrom && this.customTo) {
      return { months: this.months, date_from: this.customFrom, date_to: this.customTo };
    }
    return { months: this.months };
  }

  setMonths(months: number): void {
    if (this.months === months && !this.showCustom) {
      return;
    }
    this.months = months;
    this.showCustom = false;
    this.loadData(false);
  }

  toggleCustom(): void {
    this.showCustom = !this.showCustom;
    if (!this.showCustom) {
      this.loadData(false);
    }
  }

  applyCustom(): void {
    if (!this.customFrom || !this.customTo) {
      this.error = "Select both a start and an end date for the custom range.";
      this.cdr.markForCheck();
      return;
    }
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
