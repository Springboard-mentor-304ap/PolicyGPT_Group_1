import { ChangeDetectorRef, Component, HostListener, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { finalize } from "rxjs";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import { NotificationService } from "../../../../core/services/notification.service";
import { DateRangePickerComponent, type DateRangeSelection } from "../../shared/date-range-picker/date-range-picker.component";
import { AnalyticsDateRangeService } from "../../shared/analytics-date-range.service";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import { VbarChartComponent } from "../../shared/vbar-chart/vbar-chart.component";
import {
  AnalyticsStat,
  RecentActivityItem,
  NotificationActivityItem,
} from "../models/admin-analytics.models";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";
import { BreadcrumbComponent, BreadcrumbItem } from "../../../../shared/components/breadcrumb/breadcrumb.component";

@Component({
  selector: "app-admin-dashboard",
  standalone: true,
  imports: [
    CommonModule,
    BreadcrumbComponent,
    DateRangePickerComponent,
    LineChartComponent,
    DoughnutChartComponent,
    VbarChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./admin-dashboard.component.html",
  styleUrl: "./admin-dashboard.component.scss",
})
export class AdminDashboardComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notificationService = inject(NotificationService);
  private readonly rangeService = inject(AnalyticsDateRangeService);
  private readonly router = inject(Router);

  readonly isSampleData = this.dataService.isSampleData;

  get breadcrumbItems(): BreadcrumbItem[] {
    return [{ label: "Home", route: ["/dashboard/admin"] }, { label: "Analytics Overview" }];
  }

  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);
  isDownloading = signal<boolean>(false);
  /** True while THIS user's notifications are being fetched (vs empty). */
  notificationsLoading = signal<boolean>(true);
  /** Current user's API total; null until their request completes. */
  private userNotificationTotal = signal<string | null>(null);

  // Selected date range
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");

  // Trend timeframe selection
  trendTimeframe = signal<string>("Last 9 Months");
  showTimeframeMenu = signal<boolean>(false);
  timeframeOptions = [
    "Last 3 Months",
    "Last 6 Months",
    "Last 9 Months",
    "Last 12 Months",
  ];

  // Top 8 Metric Cards Signal (no comparison until backend provides one)
  metrics = signal<AnalyticsStat[]>([
    { label: "Total Users", value: "0", change: "", isPositive: true },
    { label: "Total Policies", value: "0", change: "", isPositive: true },
    { label: "Total Schemes", value: "0", change: "", isPositive: true },
    { label: "Approved Policies", value: "0", change: "", isPositive: true },
    { label: "Pending Policies", value: "0", change: "", isPositive: true },
    { label: "Rejected Policies", value: "0", change: "", isPositive: true, goodWhenDown: true },
    { label: "Active Schemes", value: "0", change: "", isPositive: true },
    { label: "Total Notifications", value: "0", change: "", isPositive: true },
  ]);

  // Policies Trend Line Chart Data
  trendLabels: string[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  policiesTrendDatasets: LineDataset[] = [
    { label: "Approved", data: [], borderColor: "#3cb371" },
    { label: "Pending", data: [], borderColor: "#f5a524" },
    { label: "Rejected", data: [], borderColor: "#e5484d" },
  ];

  // Schemes by Category
  schemesCategoryLabels: string[] = [];
  schemesCategoryData: number[] = [];
  schemesTotal = signal<string>("0");

  // User Distribution
  userDistLabels: string[] = [];
  userDistData: number[] = [];
  userDistTotal = signal<string>("0");

  // Policies by Category (reuses the Policy Analytics aggregate)
  policyCategoryLabels: string[] = [];
  policyCategoryData: number[] = [];
  policyCategoryTotal = signal<string>("0");

  // Scheme Trend (reuses the Scheme Analytics aggregate)
  schemeTrendLabels: string[] = [];
  schemeTrendDatasets: LineDataset[] = [];
  schemeTrendPeriod = signal<string>("Last 12 Months");
  schemeTrendOptions = ["Last 3 Months", "Last 6 Months", "Last 12 Months"];
  showSchemeMenu = signal<boolean>(false);

  // Department Distribution (reuses the Department Analytics aggregate:
  // union of top-by-policies and top-by-schemes, ranked per the selected
  // Both / Policies / Schemes filter and capped at the top 10).
  deptFilter = signal<string>("Both");
  deptFilterOptions = ["Both", "Policies", "Schemes"];
  showDeptMenu = signal<boolean>(false);
  private deptRows: { label: string; policies: number; schemes: number }[] = [];

  /** Top-10 department rows for the active filter (no extra API calls). */
  private rankedDeptRows(): { label: string; policies: number; schemes: number }[] {
    const filter = this.deptFilter();
    const rows = [...this.deptRows];
    if (filter === "Policies") {
      rows.sort((a, b) => b.policies - a.policies);
    } else if (filter === "Schemes") {
      rows.sort((a, b) => b.schemes - a.schemes);
    } else {
      rows.sort((a, b) => b.policies + b.schemes - (a.policies + a.schemes));
    }
    return rows.slice(0, 10);
  }

  visibleDeptLabels(): string[] {
    return this.rankedDeptRows().map((r) => r.label);
  }

  /** Primary column values: policies, or schemes when Schemes is selected. */
  visibleDeptPrimaryValues(): number[] {
    const rows = this.rankedDeptRows();
    return this.deptFilter() === "Schemes"
      ? rows.map((r) => r.schemes)
      : rows.map((r) => r.policies);
  }

  visibleDeptPrimaryColor(): string {
    return this.deptFilter() === "Schemes" ? "#3cb371" : "#2f6fed";
  }

  visibleDeptPrimaryLabel(): string {
    return this.deptFilter() === "Schemes" ? "Schemes" : "Policies";
  }

  /** Schemes column values for the grouped Both view; null hides the series. */
  visibleDeptSecondValues(): number[] | null {
    if (this.deptFilter() !== "Both") return null;
    return this.rankedDeptRows().map((r) => r.schemes);
  }

  toggleDeptMenu(event: Event): void {
    event.stopPropagation();
    this.showTimeframeMenu.set(false);
    this.showSchemeMenu.set(false);
    this.showDeptMenu.update((v) => !v);
  }

  selectDeptFilter(option: string): void {
    this.deptFilter.set(option);
    this.showDeptMenu.set(false);
  }

  // Recent User Activity Data
  recentActivities: RecentActivityItem[] = [];

  // Latest Notifications Data
  notifications: NotificationActivityItem[] = [];

  /**
   * Reload generations are tracked PER LOADER (overview, extra sections,
   * notifications load in parallel): only a newer call to the SAME loader
   * invalidates its in-flight response. A single shared counter is wrong
   * here — the three loaders fire synchronously in sequence, so sharing
   * would mark the first two responses stale on arrival and leave their
   * sections loading forever. Rapid filter changes still resolve
   * latest-wins within each loader.
   */
  private overviewSeq = 0;
  private extraSeq = 0;
  private notifSeq = 0;

  ngOnInit(): void {
    // Shared range (restored after refresh/navigation when previously set).
    this.currentRange.set(this.rangeService.label());
    const timeframe = `Last ${this.rangeService.snapMonths([3, 6, 9, 12])} Months`;
    this.trendTimeframe.set(timeframe);
    this.schemeTrendPeriod.set(`Last ${this.rangeService.snapMonths([3, 6, 12])} Months`);
    this.loadOverviewData(timeframe);
    // User notifications load independently (in parallel): they must appear
    // even if the overview aggregate is slow or fails, and on every entry
    // (first open, refresh, back-navigation).
    this.loadAdminNotifications();
    // Extra sections reuse their pages' aggregates (no new endpoints).
    this.loadExtraSections();
  }

  loadOverviewData(timeframe: string): void {
    const seq = ++this.overviewSeq;
    this.isLoading.set(true);
    this.loadError.set(null);
    this.dataService.getAdminOverview(timeframe).pipe(finalize(() => this.cdr.markForCheck())).subscribe({
      next: (res) => {
        if (seq !== this.overviewSeq) return;
        if (res.metrics && res.metrics.length > 0) {
          this.metrics.set(res.metrics);
        }
        if (res.policyStatusTrend) {
          this.trendLabels = res.policyStatusTrend.labels || [];
          this.policiesTrendDatasets = (res.policyStatusTrend.series || []).map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
          }));
        }
        if (res.schemesByCategory) {
          this.schemesCategoryLabels = res.schemesByCategory.map(
            (c) => `${c.label} (${c.percentage}%)`
          );
          this.schemesCategoryData = res.schemesByCategory.map((c) => c.percentage);
          const schemesCount = res.metrics.find((m) => m.label === "Total Schemes")?.value;
          this.schemesTotal.set(String(schemesCount || "0"));
        }
        if (res.userDistribution) {
          this.userDistLabels = res.userDistribution.labels || [];
          this.userDistData = res.userDistribution.data || [];
          this.userDistTotal.set(res.userDistribution.total || "0");
        }
        if (res.recentActivities) {
          this.recentActivities = res.recentActivities.slice(0, 5);
        }
        // NOTE: res.notifications (platform broadcast history) is
        // intentionally ignored — the admin sees only their own received
        // notifications (loadAdminNotifications, token-scoped API).
        this.applyUserNotificationTotal();
        this.hasLoaded.set(true);
        this.isLoading.set(false);
      },
      error: (err) => {
        if (seq !== this.overviewSeq) return;
        console.error("Failed to load admin overview analytics:", err);
        // No sample fallback: keep empty placeholders and surface error.
        this.loadError.set("Could not load analytics overview. Please retry.");
        this.isLoading.set(false);
      },
    });
  }

  getMetric(label: string): AnalyticsStat {
    return (
      this.metrics().find(
        (m) => m.label.toLowerCase().trim() === label.toLowerCase().trim()
      ) || {
        label,
        value: "0",
        change: "",
        isPositive: true,
      }
    );
  }

  /** Data-driven Y-axis max so large datasets are never clipped at 200. */
  chartYMax(): number {
    let max = 0;
    for (const ds of this.policiesTrendDatasets || []) {
      for (const v of ds.data || []) {
        if (typeof v === "number" && v > max) max = v;
      }
    }
    if (max <= 0) return 10;
    return Math.ceil(max * 1.2);
  }

  /** Data-driven Y-axis max for the Scheme Trend chart. */
  schemeChartYMax(): number {
    let max = 0;
    for (const ds of this.visibleSchemeTrendDatasets() || []) {
      for (const v of ds.data || []) {
        if (typeof v === "number" && v > max) max = v;
      }
    }
    if (max <= 0) return 10;
    return Math.ceil(max * 1.2);
  }

  private schemeWindowSize(): number {
    const m = /(\d+)/.exec(this.schemeTrendPeriod());
    return m ? Number(m[1]) : 12;
  }

  /** Scheme trend labels for the selected window (newest N points). */
  visibleSchemeTrendLabels(): string[] {
    const labels = this.schemeTrendLabels;
    const size = this.schemeWindowSize();
    return labels.slice(Math.max(0, labels.length - size));
  }

  /** Scheme trend datasets trimmed to the selected window. */
  visibleSchemeTrendDatasets(): LineDataset[] {
    const size = this.schemeWindowSize();
    return this.schemeTrendDatasets.map((ds) => ({
      ...ds,
      data: ds.data.slice(Math.max(0, ds.data.length - size)),
    }));
  }

  toggleSchemeMenu(event: Event): void {
    event.stopPropagation();
    this.showTimeframeMenu.set(false);
    this.showDeptMenu.set(false);
    this.showSchemeMenu.update((v) => !v);
  }

  selectSchemePeriod(option: string): void {
    this.schemeTrendPeriod.set(option);
    this.showSchemeMenu.set(false);
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  /**
   * Scheme Trend, Policies by Category and Department Distribution reuse
   * the exact aggregates of their dedicated pages (same service methods, no
   * new endpoints, no duplicated logic). Range changes re-fetch with the
   * global start/end bounds while charts render their built-in empty
   * states until data arrives (no skeleton flash, correct first-load
   * sizing via rAF).
   */
  loadExtraSections(): void {
    const seq = ++this.extraSeq;
    const isStale = (): boolean => seq !== this.extraSeq;
    this.dataService.getAdminPolicyAnalytics({}).pipe(finalize(() => this.cdr.markForCheck())).subscribe({
      next: (res) => {
        if (isStale()) return;
        const cats = res.by_category || [];
        this.policyCategoryLabels = cats.map((c) => `${c.label} (${c.percentage}%)`);
        this.policyCategoryData = cats.map((c) => c.percentage);
        const total = (res.stats || []).find((s) => s.label === "Total Policies")?.value;
        this.policyCategoryTotal.set(String(total ?? "0"));
      },
      error: (err) => console.error("Failed to load overview policy categories:", err),
    });
    this.dataService.getAdminSchemeAnalytics({}).pipe(finalize(() => this.cdr.markForCheck())).subscribe({
      next: (res) => {
        if (isStale()) return;
        this.schemeTrendLabels = res.trend?.labels || [];
        this.schemeTrendDatasets = (res.trend?.series || []).map((s) => ({
          label: s.label,
          data: s.data,
          borderColor: s.color,
          backgroundColor: "transparent",
        }));
      },
      error: (err) => console.error("Failed to load overview scheme trend:", err),
    });
    this.dataService.getAdminDepartmentAnalytics(undefined, "all").pipe(finalize(() => this.cdr.markForCheck())).subscribe({
      next: (res) => {
        if (isStale()) return;
        const byPolicies = new Map<string, number>();
        for (const p of res.top_by_policies || []) {
          if (p?.label) byPolicies.set(p.label, Number(p.value) || 0);
        }
        const bySchemes = new Map<string, number>();
        for (const s of res.top_by_schemes || []) {
          if (s?.label) bySchemes.set(s.label, Number(s.value) || 0);
        }
        const names = [...new Set([...byPolicies.keys(), ...bySchemes.keys()])];
        this.deptRows = names.map((label) => ({
          label,
          policies: byPolicies.get(label) ?? 0,
          schemes: bySchemes.get(label) ?? 0,
        }));
      },
      error: (err) => console.error("Failed to load overview department distribution:", err),
    });
  }

  /**
   * Newest 5 notifications RECEIVED BY THE CURRENTLY LOGGED-IN USER.
   * GET /notifications is scoped server-side to the request token
   * (user_id=current_user), so no frontend user filtering is needed and no
   * other users' notifications can appear here. Works for every role.
   */
  loadAdminNotifications(): void {
    const seq = ++this.notifSeq;
    this.notificationsLoading.set(true);
    this.notificationService
      .getNotifications({ page: 1, page_size: 5, sort_by: "latest" })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (res) => {
          if (seq !== this.notifSeq) return;
          const items = (res.items || [])
            .slice()
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )
            .slice(0, 5);
          this.notifications = items.map((n) => ({
            title: n.title,
            type: n.notification_type,
            typeClass: this.notificationTypeClass(n.notification_type),
            date: this.formatRelativeTime(n.created_at),
            status: n.is_read ? "Read" : "Unread",
          }));
          // Total Notifications card = THIS user's API total (res.total),
          // never the global overview count.
          this.userNotificationTotal.set(String(res.total ?? items.length));
          this.applyUserNotificationTotal();
          this.notificationsLoading.set(false);
        },
        error: (err) => {
          if (seq !== this.notifSeq) return;
          console.error("Failed to load admin notifications:", err);
          this.notifications = [];
          this.notificationsLoading.set(false);
        },
      });
  }

  /**
   * Override the "Total Notifications" metric with the current user's total.
   * Runs after either request finishes so a late overview response can
   * never clobber the user-scoped value with the global count.
   */
  private applyUserNotificationTotal(): void {
    const total = this.userNotificationTotal();
    if (total === null) return;
    this.metrics.update((list) =>
      list.map((m) =>
        m.label === "Total Notifications" ? { ...m, value: total } : m,
      ),
    );
  }

  notificationTypeClass(type: string): string {
    const t = (type || "").toUpperCase();
    if (t.includes("SYSTEM")) return "blue";
    if (t.includes("FEEDBACK")) return "purple";
    if (t.includes("POLICY")) return "orange";
    if (t.includes("SCHEME")) return "green";
    if (t.includes("DEADLINE")) return "red";
    return "gray";
  }

  /** Same relative-time wording as the Notifications centre. */
  formatRelativeTime(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSeconds < 60) return "Just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1) return "1 week ago";
    return `${diffWeeks} weeks ago`;
  }

  openAuditLogs(): void {
    void this.router.navigate(["/dashboard/admin/audit-logs"]);
  }

  openNotifications(): void {
    void this.router.navigate(["/dashboard/admin/notifications"]);
  }

  onDateRangeSelect(sel: DateRangeSelection): void {
    this.rangeService.applySelection(sel);
    this.currentRange.set(sel.label);
    const timeframe = `Last ${this.rangeService.snapMonths([3, 6, 9, 12])} Months`;
    this.trendTimeframe.set(timeframe);
    this.schemeTrendPeriod.set(`Last ${this.rangeService.snapMonths([3, 6, 12])} Months`);
    this.showTimeframeMenu.set(false);
    this.showSchemeMenu.set(false);
    this.showDeptMenu.set(false);
    this.loadOverviewData(timeframe);
    this.loadExtraSections();
  }

  downloadReport(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);
    this.dataService
      .downloadReport("ANALYTICS_REPORT", "PDF", "Admin Analytics Report", {
        ...this.rangeService.toReportParams(),
      })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `admin-analytics-report-${new Date().toISOString().split("T")[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.isDownloading.set(false);
        },
        error: (err) => {
          console.error("Could not download admin analytics report:", err);
          this.isDownloading.set(false);
        },
      });
  }

  toggleTimeframeMenu(event: Event): void {
    event.stopPropagation();
    this.showSchemeMenu.set(false);
    this.showDeptMenu.set(false);
    this.showTimeframeMenu.update((v) => !v);
  }

  selectTimeframe(option: string): void {
    this.trendTimeframe.set(option);
    this.showTimeframeMenu.set(false);
    this.loadOverviewData(option);
  }

  private closeCardMenus(): void {
    this.showTimeframeMenu.set(false);
    this.showSchemeMenu.set(false);
    this.showDeptMenu.set(false);
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    this.closeCardMenus();
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeCardMenus();
  }
}
