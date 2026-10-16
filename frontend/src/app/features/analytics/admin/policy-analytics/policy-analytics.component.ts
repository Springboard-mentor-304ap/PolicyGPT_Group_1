import { ChangeDetectorRef, Component, HostListener, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { finalize } from "rxjs";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import {
  AnalyticsStat,
  PolicyRow,
} from "../models/admin-analytics.models";
import { DateRangePickerComponent, type DateRangeSelection } from "../../shared/date-range-picker/date-range-picker.component";
import { FiltersBarComponent } from "../../shared/filters-bar/filters-bar.component";
import { HbarChartComponent } from "../../shared/hbar-chart/hbar-chart.component";
import { VbarChartComponent } from "../../shared/vbar-chart/vbar-chart.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";
import { BreadcrumbComponent, BreadcrumbItem } from "../../../../shared/components/breadcrumb/breadcrumb.component";
import { AnalyticsDateRangeService } from "../../shared/analytics-date-range.service";
import {
  CategoryInput,
  getCategoryIconName,
  getCategoryIconStyle,
} from "../../../../core/utils/category-icon.util";

@Component({
  selector: "app-policy-analytics",
  standalone: true,
  imports: [
    CommonModule,
    BreadcrumbComponent,
    DateRangePickerComponent,
    FiltersBarComponent,
    HbarChartComponent,
    VbarChartComponent,
    LineChartComponent,
    DoughnutChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./policy-analytics.component.html",
  styleUrl: "./policy-analytics.component.scss",
})
export class PolicyAnalyticsComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly rangeService = inject(AnalyticsDateRangeService);
  private readonly router = inject(Router);

  readonly isSampleData = this.dataService.isSampleData;

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: "Home", route: ["/dashboard/admin"] },
      { label: "Analytics", route: ["/dashboard/admin/analytics"] },
      { label: "Policy Analytics" },
    ];
  }

  activeFilters = signal<Record<string, string>>({});
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);
  isExporting = signal<boolean>(false);

  /**
   * Reload generation: only the latest loadData call may touch state so
   * a slow older response can never overwrite newer filter data.
   */
  private loadSeq = 0;

  stats = signal<AnalyticsStat[]>([
    { label: "Total Policies", value: "0", change: "", isPositive: true },
    { label: "Approved Policies", value: "0", change: "", isPositive: true },
    { label: "Pending Policies", value: "0", change: "", isPositive: true },
    { label: "Rejected Policies", value: "0", change: "", isPositive: true, goodWhenDown: true },
    { label: "Archived Policies", value: "0", change: "", isPositive: true },
  ]);
  categoryLabels = signal<string[]>([]);
  categoryData = signal<number[]>([]);
  trendLabels = signal<string[]>([]);
  trendDatasets = signal<LineDataset[]>([]);
  stateLabels = signal<string[]>([]);
  stateData = signal<number[]>([]);
  ministryLabels = signal<string[]>([]);
  ministryData = signal<number[]>([]);
  latestPolicies = signal<PolicyRow[]>([]);

  // Trend window dropdown (client-side slice of the loaded series; the
  // backend serves the last 12 calendar months, shown in full by default).
  trendPeriod = signal<string>("Last 12 Months");
  trendPeriodOptions = ["Last 3 Months", "Last 6 Months", "Last 12 Months"];
  showTrendMenu = signal<boolean>(false);

  // Top-states dropdown (client-side limit of the loaded ranking).
  stateLimitLabel = signal<string>("Top 10 States");
  stateLimitOptions = [
    { label: "Top 5 States", count: 5 },
    { label: "Top 10 States", count: 10 },
    { label: "All States", count: Number.MAX_SAFE_INTEGER },
  ];
  showStateMenu = signal<boolean>(false);

  // Top-ministries dropdown (client-side limit of the loaded ranking).
  ministryLimitLabel = signal<string>("Top 10 Ministries");
  ministryLimitOptions = [
    { label: "Top 5 Ministries", count: 5 },
    { label: "Top 10 Ministries", count: 10 },
    { label: "All Ministries", count: Number.MAX_SAFE_INTEGER },
  ];
  showMinistryMenu = signal<boolean>(false);

  private trendWindowSize = computed<number>(() => {
    const m = /(\d+)/.exec(this.trendPeriod());
    return m ? Number(m[1]) : 12;
  });

  private stateLimitCount = computed<number>(
    () => this.stateLimitOptions.find((o) => o.label === this.stateLimitLabel())?.count ?? 10,
  );

  private ministryLimitCount = computed<number>(
    () => this.ministryLimitOptions.find((o) => o.label === this.ministryLimitLabel())?.count ?? 10,
  );

  /** Trend labels for the selected window (newest N points of the series). */
  visibleTrendLabels = computed<string[]>(() => {
    const labels = this.trendLabels();
    return labels.slice(Math.max(0, labels.length - this.trendWindowSize()));
  });

  /** Trend datasets trimmed to the selected window. */
  visibleTrendDatasets = computed<LineDataset[]>(() => {
    const size = this.trendWindowSize();
    return this.trendDatasets().map((ds) => ({
      ...ds,
      data: ds.data.slice(Math.max(0, ds.data.length - size)),
    }));
  });

  /** Data-driven Y-axis max so status-series values are never flattened. */
  trendYMax = computed<number>(() => {
    let max = 0;
    for (const ds of this.visibleTrendDatasets()) {
      for (const v of ds.data || []) {
        if (typeof v === "number" && v > max) max = v;
      }
    }
    if (max <= 0) return 10;
    return Math.ceil(max * 1.2);
  });

  visibleStateLabels = computed<string[]>(() => this.stateLabels().slice(0, this.stateLimitCount()));
  visibleStateData = computed<number[]>(() => this.stateData().slice(0, this.stateLimitCount()));
  visibleMinistryLabels = computed<string[]>(() => this.ministryLabels().slice(0, this.ministryLimitCount()));
  visibleMinistryData = computed<number[]>(() => this.ministryData().slice(0, this.ministryLimitCount()));

  ngOnInit(): void {
    this.currentRange.set(this.rangeService.label());
    this.loadData();
  }

  loadData(): void {
    const filters = this.activeFilters();
    const seq = ++this.loadSeq;
    this.isLoading.set(true);
    this.loadError.set(null);

    // Single aggregate request; derived slices share one HTTP via cache.
    this.dataService.getAdminPolicyAnalytics(filters).pipe(finalize(() => this.cdr.markForCheck())).subscribe({
      next: (res) => {
        if (seq !== this.loadSeq) return;
        this.stats.set(res.stats || []);
        const cats = res.by_category || [];
        this.categoryLabels.set(cats.map((c) => `${c.label} (${c.percentage}%)`));
        this.categoryData.set(cats.map((c) => c.percentage));
        this.trendLabels.set(res.trend?.labels || []);
        this.trendDatasets.set(
          (res.trend?.series || []).map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            backgroundColor: "transparent",
          })),
        );
        // Policies by State: group actual per-policy state values, drop
        // null/undefined/empty (and the "Unknown" placeholder the API uses
        // for them), sort by count descending, keep the Top 10. A genuine
        // "All India" state is real data and stays. No duplicate API call:
        // this is the same aggregate response as every other section.
        // NOTE: today's database holds "All India" on these rows, so the
        // chart truthfully shows that single slice until varied states exist.
        const statePairs = (res.by_state || [])
          .filter((r) => r && typeof r.label === "string" && r.label.trim() !== "" && r.label !== "Unknown")
          .map((r) => ({ label: r.label, value: Number(r.value) || 0 }))
          .sort((a, b) => b.value - a.value);
        this.stateLabels.set(statePairs.map((r) => r.label));
        this.stateData.set(statePairs.map((r) => r.value));
        this.ministryLabels.set((res.by_ministry || []).map((r) => r.label));
        this.ministryData.set((res.by_ministry || []).map((r) => r.value));
        // Latest Policies: newest 5 of the (already newest-first,
        // filter- and range-scoped) backend list. No extra slicing here:
        // the API applies the global date window server-side.
        this.latestPolicies.set((res.latest_policies || []).slice(0, 5));
        this.hasLoaded.set(true);
        this.isLoading.set(false);
      },
      error: (err) => {
        if (seq !== this.loadSeq) return;
        console.error("Failed to load policy analytics:", err);
        // Keep any previously loaded cards visible; surface error + retry.
        this.loadError.set("Could not load policy analytics. Please retry.");
        this.isLoading.set(false);
      },
    });
  }

  onApplyFilters(filters: Record<string, string>): void {
    this.activeFilters.set(filters);
    this.loadData();
  }

  onResetFilters(): void {
    this.activeFilters.set({});
    this.loadData();
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  onDateRangeSelect(sel: DateRangeSelection): void {
    this.rangeService.applySelection(sel);
    this.currentRange.set(sel.label);
    this.trendPeriod.set(`Last ${this.rangeService.snapMonths([3, 6, 12])} Months`);
    this.showTrendMenu.set(false);
    this.loadData();
  }

  // Card dropdown menus (trend window, top-states, top-ministries).
  toggleTrendMenu(event: Event): void {
    event.stopPropagation();
    this.showStateMenu.set(false);
    this.showMinistryMenu.set(false);
    this.showTrendMenu.update((v) => !v);
  }

  selectTrendPeriod(option: string): void {
    this.trendPeriod.set(option);
    this.showTrendMenu.set(false);
  }

  toggleStateMenu(event: Event): void {
    event.stopPropagation();
    this.showTrendMenu.set(false);
    this.showMinistryMenu.set(false);
    this.showStateMenu.update((v) => !v);
  }

  selectStateLimit(option: { label: string; count: number }): void {
    this.stateLimitLabel.set(option.label);
    this.showStateMenu.set(false);
  }

  toggleMinistryMenu(event: Event): void {
    event.stopPropagation();
    this.showTrendMenu.set(false);
    this.showStateMenu.set(false);
    this.showMinistryMenu.update((v) => !v);
  }

  selectMinistryLimit(option: { label: string; count: number }): void {
    this.ministryLimitLabel.set(option.label);
    this.showMinistryMenu.set(false);
  }

  private closeCardMenus(): void {
    this.showTrendMenu.set(false);
    this.showStateMenu.set(false);
    this.showMinistryMenu.set(false);
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    this.closeCardMenus();
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeCardMenus();
  }

  /** Open the complete policy list (existing Policies page). */
  viewAllPolicies(): void {
    void this.router.navigate(["/dashboard/admin/policies"]);
  }

  exportReport(): void {    if (this.isExporting()) return;
    this.isExporting.set(true);
    const filters = this.activeFilters();
    this.dataService
      .downloadReport("POLICY_REPORT", "PDF", "Policy Analytics Report", {
        ...filters,
        ...this.rangeService.toReportParams(),
      })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `policy-analytics-report-${new Date().toISOString().split("T")[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.isExporting.set(false);
        },
        error: (err) => {
          console.error("Could not export policy report:", err);
          this.isExporting.set(false);
        },
      });
  }

  /** Live doughnut center total (no hardcoded 1,250). */
  categoryTotal(): string {
    const found = this.stats().find((s) => s.label === "Total Policies")?.value;
    return String(found ?? "0");
  }

  getStatIcon(index: number): string {
    const icons = [
      "description",
      "check_circle",
      "schedule",
      "close",
      "archive",
    ];
    return icons[index % icons.length];
  }

  getStatIconClass(index: number): string {
    const classes = ["blue", "green", "orange", "red", "purple"];
    return classes[index % classes.length];
  }

  getStatusChipClass(status: string): string {
    switch (status?.toLowerCase()) {
      case "approved":
        return "chip-green";
      case "pending":
        return "chip-orange";
      case "rejected":
        return "chip-red";
      default:
        return "chip-gray";
    }
  }

  /**
   * Category icon (centralized mapping — same icon/color for a
   * category on every page, including analytics lists).
   */
  categoryIcon(category: CategoryInput): string {
    return getCategoryIconName(category);
  }

  categoryIconStyle(category: CategoryInput): {
    "background-color": string;
    color: string;
    "border-color": string;
  } {
    return getCategoryIconStyle(category);
  }
}
