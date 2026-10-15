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
import { RouterLink } from "@angular/router";
import { Subscription, forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";

import {
  AnalyticsService,
  PersonalAnalyticsOverview,
  PersonalAnalyticsRange,
  PolicyTrendItem,
  ResearcherTrendsResponse,
} from "../../../core/services/analytics.service";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";
import { LoadingIndicatorComponent } from "../../../shared/components/loading-indicator/loading-indicator.component";
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
import { CountUpDirective } from "../../../shared/directives/count-up.directive";
import { downloadResearcherTrendsCsv, printAnalyticsPdf } from "../shared/analytics-export";

/**
 * Researcher Policy & Scheme Trends.
 *
 * DISTINCT from Research Overview (RoleAnalyticsComponent):
 * - Overview = personal activity (own searches/saves/notifications).
 * - This page = public research corpus (APPROVED policies/schemes only):
 *   publication time-series, category distributions and totals from
 *   GET /analytics/researcher/trends, plus the researcher's own search
 *   activity from GET /analytics/researcher/overview for context.
 * No mock data; untracked metrics are omitted, never fabricated.
 */
@Component({
  selector: "app-researcher-trends",
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
    LoadingIndicatorComponent,
  ],
  templateUrl: "./researcher-trends.component.html",
  styleUrl: "./researcher-trends.component.scss",
})
export class ResearcherTrendsComponent implements OnInit, OnDestroy {
  private readonly analytics = inject(AnalyticsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subscription: Subscription | null = null;

  readonly crumbs: BreadcrumbItem[] = [
    { label: "Home", route: ["/dashboard/researcher"] },
    { label: "Research Analytics", route: ["/dashboard/researcher/analytics"] },
    { label: "Policy & Scheme Trends" },
  ];

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

  range: PersonalAnalyticsRange = "30d";
  customFrom = "";
  customTo = "";
  customError: string | null = null;
  showExportMenu = false;

  loading = true;
  error: string | null = null;

  trends: ResearcherTrendsResponse | null = null;
  overview: PersonalAnalyticsOverview | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  setRange(range: PersonalAnalyticsRange): void {
    if (this.range === range || this.loading) {
      return;
    }
    this.range = range;
    this.customError = null;
    this.load();
  }

  /** Display label for the shared picker, derived from the active range. */
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
   * Map a shared picker selection onto the trends windows. Standard
   * presets reuse the existing server-side overview range; any other
   * label or calendar range becomes an explicit custom window so the
   * personal-activity sections always match the selected period. The
   * approved-corpus publication series (all-time from the backend) is
   * sliced client-side to the same window — never fabricated.
   */
  onPickerSelect(sel: DateRangeSelection): void {
    if (this.loading) return;
    const label = (sel.label || "").trim();
    if (label === "Last 7 Days") {
      this.customError = null;
      this.setRange("7d");
      return;
    }
    if (label === "Last 30 Days") {
      this.customError = null;
      this.setRange("30d");
      return;
    }
    if (label === "Last 6 Months") {
      this.customError = null;
      this.setRange("6m");
      return;
    }
    if (label === "Last 12 Months") {
      this.customError = null;
      this.setRange("12m");
      return;
    }
    if (!sel.startISO || !sel.endISO) return;
    if (sel.endISO < sel.startISO) {
      this.customError = "End date cannot be before start date.";
      this.cdr.markForCheck();
      return;
    }
    this.customError = null;
    this.range = "custom";
    this.customFrom = sel.startISO;
    this.customTo = sel.endISO;
    this.load();
  }

  onPickerLabel(_label: string): void {
    // Display label is derived from `range`; the full selection
    // (onPickerSelect) drives data loading. Kept for compat.
  }

  retry(): void {
    this.load(true);
  }

  load(forceRefresh = false): void {
    this.loading = true;
    this.error = null;
    this.subscription?.unsubscribe();
    const overviewParams =
      this.range === "custom" && this.customFrom && this.customTo
        ? { range: this.range, date_from: this.customFrom, date_to: this.customTo }
        : { range: this.range };
    this.subscription = forkJoin({
      trends: this.analytics.getResearcherTrends(forceRefresh).pipe(
        catchError(() => of(null as ResearcherTrendsResponse | null)),
      ),
      overview: this.analytics
        .getResearcherOverview(overviewParams, forceRefresh)
        .pipe(catchError(() => of(null as PersonalAnalyticsOverview | null))),
    }).subscribe({
      next: ({ trends, overview }) => {
        if (!trends && !overview) {
          this.error =
            "Unable to load trends. Please check your connection and try again.";
        }
        this.trends = trends;
        this.overview = overview;
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
    if (status === 0) {
      return "Cannot reach the analytics server. Check that the backend is running and reachable, then retry.";
    }
    if (status === 401) {
      return "Your session has expired. Please log in again, then retry.";
    }
    if (status === 403) {
      return "Access denied for this analytics view. Please log in with an authorised role, then retry.";
    }
    return "Unable to load trends. Please check your connection and try again.";
  }

  // --------------------------------------------------
  // KPI summary (APPROVED corpus totals + own activity)
  // --------------------------------------------------

  get totalApprovedPolicies(): number {
    return this.trends?.policies.total_approved ?? 0;
  }

  get totalApprovedSchemes(): number {
    return this.trends?.schemes.total_approved ?? 0;
  }

  get ownSearches(): number {
    return this.overview?.kpis["total_searches"]?.value ?? 0;
  }

  get ownSaved(): number {
    const k = this.overview?.kpis;
    if (!k) {
      return 0;
    }
    return (
      (k["saved_policies"]?.value ?? 0) + (k["saved_schemes"]?.value ?? 0)
    );
  }

  // --------------------------------------------------
  // Publication time-series (APPROVED only, all-time from
  // backend; sliced client-side by the selected window so
  // the range filter remains functional without refetching
  // the corpus or fabricating values).
  // --------------------------------------------------

  private monthKey(t: PolicyTrendItem): string {
    return `${t.year}-${String(t.month).padStart(2, "0")}`;
  }

  private monthLabel(t: PolicyTrendItem): string {
    const names = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${names[(t.month - 1) % 12]} ${t.year}`;
  }

  private windowedPoints(): { labels: string[]; policies: number[]; schemes: number[] } {
    const policies = this.trends?.policies.trend ?? [];
    const schemes = this.trends?.schemes.trend ?? [];
    let limit: number;
    if (this.range === "custom" && this.customFrom && this.customTo) {
      const span = Math.max(
        1,
        Math.round(
          (new Date(`${this.customTo}T00:00:00`).getTime() -
            new Date(`${this.customFrom}T00:00:00`).getTime()) / 86_400_000,
        ) + 1,
      );
      limit = span <= 14 ? 3 : span <= 62 ? 6 : span <= 186 ? 6 : 12;
    } else {
      limit =
        this.range === "7d" ? 3 : this.range === "30d" ? 6 : this.range === "6m" ? 6 : 12;
    }
    const keys = Array.from(
      new Set([...policies.map((t) => this.monthKey(t)), ...schemes.map((t) => this.monthKey(t))]),
    ).sort();
    const windowed = keys.slice(-limit);
    const pmap = new Map(policies.map((t) => [this.monthKey(t), t.count]));
    const smap = new Map(schemes.map((t) => [this.monthKey(t), t.count]));
    const labelFor = (key: string): string => {
      const [y, m] = key.split("-").map(Number);
      return this.monthLabel({ year: y, month: m, count: 0 });
    };
    return {
      labels: windowed.map(labelFor),
      policies: windowed.map((k) => pmap.get(k) ?? 0),
      schemes: windowed.map((k) => smap.get(k) ?? 0),
    };
  }

  get trendLabels(): string[] {
    return this.windowedPoints().labels;
  }

  get trendSeries(): LineSeries[] {
    const pts = this.windowedPoints();
    return [
      { key: "policies", label: "Policies", color: "#1461a0", values: pts.policies },
      { key: "schemes", label: "Schemes", color: "#17833d", values: pts.schemes },
    ];
  }

  get hasTrendData(): boolean {
    const pts = this.windowedPoints();
    return pts.labels.length > 0 && [...pts.policies, ...pts.schemes].some((v) => v > 0);
  }

  // --------------------------------------------------
  // Category distributions (APPROVED only)
  // --------------------------------------------------

  get policyCategoryBars(): { label: string; value: number }[] {
    return (this.trends?.policies.by_category ?? [])
      .slice(0, 7)
      .map((row) => ({ label: row.category, value: row.count }));
  }

  get schemeCategoryBars(): { label: string; value: number }[] {
    return (this.trends?.schemes.by_category ?? [])
      .slice(0, 7)
      .map((row) => ({ label: row.category, value: row.count }));
  }

  get corpusDonut(): { label: string; count: number; color: string }[] {
    if (!this.trends) {
      return [];
    }
    return [
      { label: "Approved Policies", count: this.totalApprovedPolicies, color: "#1461a0" },
      { label: "Approved Schemes", count: this.totalApprovedSchemes, color: "#17833d" },
    ];
  }

  // --------------------------------------------------
  // Own search activity (from overview, server-filtered
  // by the selected range)
  // --------------------------------------------------

  get searchSeries(): LineSeries[] {
    const trend = this.overview?.trend ?? [];
    return [
      {
        key: "searches",
        label: "My Searches",
        color: "#7e22ce",
        values: trend.map((t) => t.searches),
      },
    ];
  }

  get searchLabels(): string[] {
    return this.overview?.trend.map((t) => t.label) ?? [];
  }

  get topSearchBars(): { label: string; value: number }[] {
    return (this.overview?.top_searches ?? [])
      .slice(0, 7)
      .map((row) => ({ label: row.keyword, value: row.count }));
  }

  // --------------------------------------------------
  // Report downloads (same placement and Admin styling as
  // every other analytics page; exports the selected range
  // with the current page data — no placeholders).
  // --------------------------------------------------

  toggleExportMenu(): void {
    this.showExportMenu = !this.showExportMenu;
  }

  exportCsv(): void {
    this.showExportMenu = false;
    if (!this.trends && !this.overview) return;
    downloadResearcherTrendsCsv({
      rangeLabel: this.pickerLabel,
      customFrom: this.range === "custom" ? this.customFrom : "",
      customTo: this.range === "custom" ? this.customTo : "",
      trends: this.trends,
      overview: this.overview,
      trendLabels: this.trendLabels,
      trendSeries: this.trendSeries,
    });
  }

  exportPdf(): void {
    this.showExportMenu = false;
    if (!this.trends && !this.overview) return;
    const previous = document.title;
    const stamp =
      this.range === "custom" && this.customFrom && this.customTo
        ? `${this.customFrom}_to_${this.customTo}`
        : this.overview?.window.to ?? new Date().toISOString().slice(0, 10);
    document.title = `researcher_trends_${stamp}`;
    printAnalyticsPdf();
    document.title = previous;
  }
}
