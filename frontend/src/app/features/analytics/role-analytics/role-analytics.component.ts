import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Subscription } from "rxjs";

import {
  AnalyticsService,
  PersonalAnalyticsOverview,
  PersonalAnalyticsRange,
  PersonalKpi,
} from "../../../core/services/analytics.service";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";
import {
  AnalyticsDonutChartComponent,
  AnalyticsHBarChartComponent,
  AnalyticsLineChartComponent,
  LineSeries,
} from "../shared/analytics-charts.component";
import {
  DateRangePickerComponent,
  type DateRangeSelection,
} from "../shared/date-range-picker/date-range-picker.component";
import {
  downloadAnalyticsCsv,
  printAnalyticsPdf,
} from "../shared/analytics-export";

export type AnalyticsRole = "citizen" | "researcher" | "organization";

interface RoleConfig {
  role: AnalyticsRole;
  filePrefix: string;
  pageTitle: string;
  pageDescription: string;
  homeRoute: string[];
}

const ROLE_CONFIGS: Record<AnalyticsRole, RoleConfig> = {
  citizen: {
    role: "citizen",
    filePrefix: "citizen",
    pageTitle: "Citizen Analytics",
    pageDescription:
      "Your activity, saved items, searches and recent notifications.",
    homeRoute: ["/dashboard/citizen"],
  },
  researcher: {
    role: "researcher",
    filePrefix: "researcher",
    pageTitle: "Research Analytics",
    pageDescription:
      "Explore policy and scheme trends, research activity, comparisons and key government insights.",
    homeRoute: ["/dashboard/researcher"],
  },
  organization: {
    role: "organization",
    filePrefix: "organization",
    pageTitle: "Organization Analytics",
    pageDescription:
      "Track your organization's engagement, policy and scheme usage, and research activity.",
    homeRoute: ["/dashboard/organization"],
  },
};

export interface KpiCard {
  key: string;
  label: string;
  icon: string;
  tone: "blue" | "green" | "orange" | "purple";
  value: string;
  delta: number | null;
  deltaHint: string;
  tooltip: string;
  tracked: boolean;
}

const CHART_COLORS = {
  searches: "#1461a0",
  savedPolicies: "#17833d",
  savedSchemes: "#c26a00",
  notifications: "#7e22ce",
  saves: "#0e7490",
};

/**
 * Shared role analytics page.
 *
 * One component serves /dashboard/{citizen,researcher,organization}/analytics.
 * The route's `data.analyticsRole` selects titles, KPI sets and sections;
 * all values come from GET /analytics/{role}/overview (live backend
 * aggregations). Metrics the backend cannot track yet render as honest
 * zero / empty states labelled "Not tracked yet".
 */
import { CountUpDirective } from "../../../shared/directives/count-up.directive";

@Component({
  selector: "app-role-analytics",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    BreadcrumbComponent,
    DateRangePickerComponent,
    AnalyticsLineChartComponent,
    AnalyticsDonutChartComponent,
    AnalyticsHBarChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./role-analytics.component.html",
  styleUrl: "./role-analytics.component.scss",
})
export class RoleAnalyticsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly analytics = inject(AnalyticsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subscription: Subscription | null = null;

  role: AnalyticsRole = "citizen";
  config: RoleConfig = ROLE_CONFIGS["citizen"];
  crumbs: BreadcrumbItem[] = [];

  loading = true;
  error: string | null = null;
  data: PersonalAnalyticsOverview | null = null;

  range: PersonalAnalyticsRange = "30d";
  customFrom = "";
  customTo = "";
  readonly ranges: { key: PersonalAnalyticsRange; label: string }[] = [
    { key: "7d", label: "Last 7 Days" },
    { key: "30d", label: "Last 30 Days" },
    { key: "6m", label: "Last 6 Months" },
    { key: "12m", label: "Last 12 Months" },
    { key: "custom", label: "Custom" },
  ];

  /**
   * Standardized Admin-style date-filter presets bound to the shared
   * app-date-range-picker (same dropdown styling, custom calendar and
   * end-before-start validation as the Admin Analytics pages).
   */
  readonly pickerPresets: string[] = [
    "Last 7 Days",
    "Last 30 Days",
    "Last 6 Months",
    "Last 12 Months",
  ];

  /** Display label for the shared picker, derived from the backend range. */
  get pickerLabel(): string {
    switch (this.range) {
      case "7d":
        return "Last 7 Days";
      case "30d":
        return "Last 30 Days";
      case "6m":
        return "Last 6 Months";
      case "12m":
        return "Last 12 Months";
      case "custom":
        if (this.customFrom && this.customTo) {
          return `${this.formatPickerDay(this.customFrom)} - ${this.formatPickerDay(this.customTo)}`;
        }
        return "Custom";
    }
  }

  private formatPickerDay(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  /**
   * Map a shared picker selection onto the personal-overview backend
   * range. Standard presets reuse the server-side windows (with honest
   * previous-period deltas); any other label or calendar range becomes
   * an explicit custom window so displayed metrics always match the
   * selected period instead of relabelling stale data.
   */
  onPickerSelect(sel: DateRangeSelection): void {
    const label = (sel.label || "").trim();
    if (label === "Last 7 Days") {
      this.setRange("7d");
      return;
    }
    if (label === "Last 30 Days") {
      this.setRange("30d");
      return;
    }
    if (label === "Last 6 Months") {
      this.setRange("6m");
      return;
    }
    if (label === "Last 12 Months") {
      this.setRange("12m");
      return;
    }
    if (!sel.startISO || !sel.endISO) return;
    if (sel.endISO < sel.startISO) {
      this.error = "End date cannot be before start date.";
      this.cdr.markForCheck();
      return;
    }
    this.range = "custom";
    this.customFrom = sel.startISO;
    this.customTo = sel.endISO;
    this.load();
  }

  onPickerLabel(_label: string): void {
    // Display label is derived from `range`; the full selection
    // (onPickerSelect) drives data loading. Kept for compat.
  }

  showExportMenu = false;

  ngOnInit(): void {
    const role = this.route.snapshot.data["analyticsRole"] as AnalyticsRole;
    this.role = ROLE_CONFIGS[role] ? role : "citizen";
    this.config = ROLE_CONFIGS[this.role];
    this.crumbs = [
      { label: "Home", route: this.config.homeRoute },
      { label: this.config.pageTitle },
    ];
    this.load();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  // =========================================================
  // DATA LOADING
  // =========================================================

  load(forceRefresh = false): void {
    this.loading = true;
    this.error = null;
    this.subscription?.unsubscribe();
    const params =
      this.range === "custom"
        ? {
            range: this.range,
            date_from: this.customFrom,
            date_to: this.customTo,
          }
        : { range: this.range };
    const fetcher =
      this.role === "citizen"
        ? this.analytics.getCitizenOverview(params, forceRefresh)
        : this.role === "researcher"
          ? this.analytics.getResearcherOverview(params, forceRefresh)
          : this.analytics.getOrganizationOverview(params, forceRefresh);
    this.subscription = fetcher.subscribe({
      next: (data) => {
        this.data = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = this.describeError(err);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private describeError(err: unknown): string {
    const status = (err as { status?: number })?.status;
    const detail = (err as { error?: { detail?: unknown } })?.error?.detail;
    if (status === 0) {
      return "Cannot reach the analytics server. Check that the backend is running and reachable, then retry.";
    }
    if (status === 401) {
      return "Your session has expired. Please log in again, then retry.";
    }
    if (status === 403) {
      return "Access denied for this analytics view. Please log in with an authorised role, then retry.";
    }
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    return "Unable to load analytics. Please check your connection and try again.";
  }

  setRange(range: PersonalAnalyticsRange): void {
    if (this.range === range) {
      return;
    }
    this.range = range;
    if (range !== "custom") {
      this.load();
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
    this.load();
  }

  retry(): void {
    // Bypass the cache so a failed load is genuinely retried.
    this.load(true);
  }

  // =========================================================
  // EXPORT
  // =========================================================

  toggleExportMenu(): void {
    this.showExportMenu = !this.showExportMenu;
  }

  exportExcel(): void {
    this.showExportMenu = false;
    if (!this.data) {
      return;
    }
    downloadAnalyticsCsv(this.config.filePrefix, this.data);
  }

  exportPdf(): void {
    this.showExportMenu = false;
    if (!this.data) {
      return;
    }
    // The browser uses the document title as the default PDF filename.
    const previous = document.title;
    document.title = `${this.config.filePrefix}_analytics_${this.data.window.to}`;
    printAnalyticsPdf();
    document.title = previous;
  }

  // =========================================================
  // KPI CARDS
  // =========================================================

  get kpis(): KpiCard[] {
    const k = this.data?.kpis;
    if (!k) {
      return [];
    }
    const card = (
      key: string,
      label: string,
      icon: string,
      tone: KpiCard["tone"],
      tooltip: string,
      metric?: PersonalKpi,
    ): KpiCard => ({
      key,
      label,
      icon,
      tone,
      value: this.kpiValue(key, metric),
      delta: metric?.delta_pct ?? null,
      deltaHint: this.deltaHint(metric),
      tooltip:
        metric?.tracked === false
          ? `${tooltip} ${metric.reason ?? ""}`
          : tooltip,
      tracked: metric?.tracked !== false,
    });

    if (this.role === "citizen") {
      return [
        card(
          "saved_policies",
          "Saved Policies",
          "bookmark",
          "blue",
          "Policies you bookmarked in this period.",
          k["saved_policies"],
        ),
        card(
          "saved_schemes",
          "Saved Schemes",
          "account_balance",
          "green",
          "Schemes you bookmarked in this period.",
          k["saved_schemes"],
        ),
        card(
          "total_searches",
          "Total Searches",
          "history",
          "orange",
          "Policy and scheme searches you ran in this period.",
          k["total_searches"],
        ),
        card(
          "notifications",
          "Notifications",
          "notifications",
          "blue",
          "Alerts delivered to you in this period, including broadcast alerts.",
          k["notifications"],
        ),
      ];
    }
    if (this.role === "researcher") {
      return [
        card(
          "policy_views",
          "Policy Views",
          "description",
          "blue",
          "Policy detail views are not recorded by the backend yet.",
          k["policy_views"],
        ),
        card(
          "scheme_views",
          "Scheme Views",
          "account_balance",
          "green",
          "Scheme detail views are not recorded by the backend yet.",
          k["scheme_views"],
        ),
        card(
          "total_searches",
          "Total Searches",
          "history",
          "orange",
          "Policy and scheme searches you ran in this period.",
          k["total_searches"],
        ),
        card(
          "saved_policies",
          "Saved Policies",
          "bookmark",
          "purple",
          "Policies you bookmarked in this period.",
          k["saved_policies"],
        ),
        card(
          "saved_schemes",
          "Saved Schemes",
          "account_balance",
          "orange",
          "Schemes you bookmarked in this period.",
          k["saved_schemes"],
        ),
        card(
          "comparisons",
          "Comparisons",
          "compare_arrows",
          "blue",
          "Comparisons are stateless reads; no comparison history is stored.",
          k["comparisons"],
        ),
      ];
    }
    return [
      card(
        "policy_views",
        "Policy Views",
        "description",
        "blue",
        "Policy detail views are not recorded by the backend yet.",
        k["policy_views"],
      ),
      card(
        "scheme_views",
        "Scheme Views",
        "account_balance",
        "green",
        "Scheme detail views are not recorded by the backend yet.",
        k["scheme_views"],
      ),
      card(
        "total_searches",
        "Total Searches",
        "history",
        "orange",
        "Searches run in this scope in this period.",
        k["total_searches"],
      ),
      card(
        "team_members",
        "Team Members",
        "group",
        "purple",
        "Accounts sharing your organization name. Organization membership is free text; there is no team table yet.",
        k["team_members"],
      ),
      card(
        "comparisons",
        "Comparisons",
        "compare_arrows",
        "orange",
        "Comparisons are stateless reads; no comparison history is stored.",
        k["comparisons"],
      ),
      card(
        "saved_items",
        "Saved Items",
        "bookmark",
        "blue",
        "Policies and schemes bookmarked in this period.",
        k["saved_items"],
      ),
    ];
  }

  private kpiValue(key: string, metric?: PersonalKpi): string {
    if (!metric) {
      return "0";
    }
    if (metric.tracked === false) {
      return "0";
    }
    if (
      key === "team_members" &&
      (metric.value === null || metric.value === undefined)
    ) {
      return "—";
    }
    if (
      key === "notifications" &&
      metric.unread !== undefined &&
      metric.unread > 0
    ) {
      return `${metric.value ?? 0}`;
    }
    return `${metric.value ?? 0}`;
  }

  get unreadCount(): number {
    return this.data?.kpis["notifications"]?.unread ?? 0;
  }

  private deltaHint(metric?: PersonalKpi): string {
    if (!metric || metric.tracked === false) {
      return "Not tracked yet";
    }
    if (metric.delta_pct === null || metric.delta_pct === undefined) {
      return "No previous-period data";
    }
    return "vs previous equivalent period";
  }

  // =========================================================
  // CHART DATA
  // =========================================================

  get trendLabels(): string[] {
    return this.data?.trend.map((t) => t.label) ?? [];
  }

  get trendSeries(): LineSeries[] {
    const trend = this.data?.trend ?? [];
    const values = (pick: (t: (typeof trend)[number]) => number): number[] =>
      trend.map(pick);
    if (this.role === "researcher" || this.role === "organization") {
      return [
        {
          key: "searches",
          label: "Searches",
          color: CHART_COLORS.searches,
          values: values((t) => t.searches),
        },
        {
          key: "saves",
          label: "Saves",
          color: CHART_COLORS.saves,
          values: trend.map((t) => t.saved_policies + t.saved_schemes),
        },
        {
          key: "notifications",
          label: "Notifications",
          color: CHART_COLORS.notifications,
          values: values((t) => t.notifications),
        },
      ];
    }
    return [
      {
        key: "searches",
        label: "Searches",
        color: CHART_COLORS.searches,
        values: values((t) => t.searches),
      },
      {
        key: "saved_policies",
        label: "Saved Policies",
        color: CHART_COLORS.savedPolicies,
        values: values((t) => t.saved_policies),
      },
      {
        key: "saved_schemes",
        label: "Saved Schemes",
        color: CHART_COLORS.savedSchemes,
        values: values((t) => t.saved_schemes),
      },
      {
        key: "notifications",
        label: "Notifications",
        color: CHART_COLORS.notifications,
        values: values((t) => t.notifications),
      },
    ];
  }

  get trendTitle(): string {
    return this.role === "organization"
      ? "Policy & Scheme Usage Trend"
      : this.role === "researcher"
        ? "Policy & Scheme Trends"
        : "Activity Trend";
  }

  get donutSlices(): {
    label: string;
    count: number;
    color: string;
    description?: string;
  }[] {
    const breakdown = this.data?.breakdown ?? [];
    const colorFor = (key: string): string =>
      key === "searches"
        ? CHART_COLORS.searches
        : key === "saved_policies"
          ? CHART_COLORS.savedPolicies
          : key === "saved_schemes"
            ? CHART_COLORS.savedSchemes
            : CHART_COLORS.notifications;
    return breakdown.map((b) => ({
      label: b.label,
      count: b.count,
      color: colorFor(b.key),
      description: b.description,
    }));
  }

  get donutTitle(): string {
    return this.role === "citizen"
      ? "Activity by Type"
      : this.role === "researcher"
        ? "Research Activity by Type"
        : "Usage by Type";
  }

  /** Bar-chart projections (backend shapes mapped to {label, value}). */
  get topSearchBars(): { label: string; value: number }[] {
    return (this.data?.top_searches ?? [])
      .slice(0, 7)
      .map((row) => ({ label: row.keyword, value: row.count }));
  }

  get policyCategoryBars(): { label: string; value: number }[] {
    return (this.data?.policies_by_category ?? [])
      .slice(0, 7)
      .map((row) => ({ label: row.category, value: row.count }));
  }

  get schemeCategoryBars(): { label: string; value: number }[] {
    return (this.data?.schemes_by_category ?? [])
      .slice(0, 7)
      .map((row) => ({ label: row.category, value: row.count }));
  }

  // =========================================================
  // HELPERS FOR THE TEMPLATE
  // =========================================================

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

  activityIcon(type: string): string {
    switch (type) {
      case "search":
        return "search";
      case "saved_policy":
        return "description";
      case "saved_scheme":
        return "account_balance";
      case "notification":
        return "notifications";
      default:
        return "insights";
    }
  }

  activityLink(type: string, entityId?: number): string[] {
    const base = this.config.homeRoute[0];
    switch (type) {
      case "search":
        return [base, "history"];
      case "saved_policy":
        return entityId
          ? [base, "policies", String(entityId)]
          : [base, "saved"];
      case "saved_scheme":
        return entityId ? [base, "schemes", String(entityId)] : [base, "saved"];
      case "notification":
        return [base, "notifications"];
      default:
        return [base];
    }
  }

  get baseRoute(): string {
    return this.config.homeRoute[0];
  }
}
