import { ChangeDetectorRef, Component, HostListener, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { finalize } from "rxjs";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import {
  DateRangePickerComponent,
  type DateRangeSelection,
} from "../../shared/date-range-picker/date-range-picker.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import { VbarChartComponent } from "../../shared/vbar-chart/vbar-chart.component";
import {
  UsageKpiCard,
  TopSearchedItem,
  MostActiveUserUsage,
  RecentSearchActivityItem,
} from "../models/admin-analytics.models";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";
import { AnalyticsDateRangeService } from "../../shared/analytics-date-range.service";

@Component({
  selector: "app-usage-statistics",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DateRangePickerComponent,
    LineChartComponent,
    DoughnutChartComponent,
    VbarChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./usage-statistics.component.html",
  styleUrl: "./usage-statistics.component.scss",
})
export class UsageStatisticsComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly rangeService = inject(AnalyticsDateRangeService);
  private readonly router = inject(Router);

  readonly isSampleData = this.dataService.isSampleData;

  // Selected date range
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  isDownloading = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);

  // 5 KPI Cards (pre-populated so the final layout renders immediately;
  // live API values replace these defaults when the response arrives).
  // NOTE: there is no Eligibility Checks card: eligibility is evaluated
  // in memory and never stored, so no such metric exists.
  kpis = signal<UsageKpiCard[]>([
    {
      label: "Total Visits",
      value: "0",
      change: "",
      isPositive: true,
      icon: "visibility",
      iconClass: "blue",
    },
    {
      label: "Total Searches",
      value: "0",
      change: "",
      isPositive: true,
      icon: "search",
      iconClass: "purple",
    },
    {
      label: "Policy Views",
      value: "0",
      change: "",
      isPositive: true,
      icon: "description",
      iconClass: "green",
    },
    {
      label: "Scheme Views",
      value: "0",
      change: "",
      isPositive: true,
      icon: "folder",
      iconClass: "teal",
    },
    {
      label: "Document Downloads",
      value: "0",
      change: "",
      isPositive: true,
      icon: "download",
      iconClass: "red",
    },
  ]);

  // User Activity Trend (Multi-series Line Chart)
  activityTrendPeriod = signal<string>("Last 12 Months");
  activityPeriodOptions = ["Last 3 Months", "Last 6 Months", "Last 12 Months"];
  showActivityMenu = signal<boolean>(false);
  activityLabels = signal<string[]>([]);
  activityDatasets = signal<LineDataset[]>([]);

  // Daily Usage (Vertical Bar Chart)
  dailyUsagePeriod = signal<string>("Last 30 Days");
  dailyPeriodOptions = ["Last 7 Days", "Last 14 Days", "Last 30 Days"];
  showDailyMenu = signal<boolean>(false);
  dailyLabels = signal<string[]>([]);
  dailyValues = signal<number[]>([]);

  // User Distribution by Role (Doughnut Chart)
  roleLabels = signal<string[]>([]);
  roleData = signal<number[]>([]);
  roleColors = signal<string[]>([]);
  roleTotal = signal<string>("0");

  // Middle Tables (Top 10 Policies, Top 10 Schemes, Most Active Users)
  topPolicies = signal<TopSearchedItem[]>([]);
  topSchemes = signal<TopSearchedItem[]>([]);
  mostActiveUsers = signal<MostActiveUserUsage[]>([]);

  // Bottom Table: Recent Search Activity
  recentSearches = signal<RecentSearchActivityItem[]>([]);

  /**
   * Reload generation: only the latest loadAllData call may touch state
   * so a slow older response can never overwrite newer filter data.
   */
  private loadSeq = 0;

  // Modals for "View All"
  activeModal = signal<"policies" | "schemes" | "users" | "searches" | null>(
    null,
  );
  modalSearchTerm = signal<string>("");
  modalTypeFilter = signal<string>("ALL");

  // Filtered lists for modals
  filteredPolicies = computed(() => {
    const query = this.modalSearchTerm().toLowerCase().trim();
    if (!query) return this.topPolicies();
    return this.topPolicies().filter((p) =>
      p.title.toLowerCase().includes(query),
    );
  });

  filteredSchemes = computed(() => {
    const query = this.modalSearchTerm().toLowerCase().trim();
    if (!query) return this.topSchemes();
    return this.topSchemes().filter((s) =>
      s.title.toLowerCase().includes(query),
    );
  });

  filteredUsers = computed(() => {
    const query = this.modalSearchTerm().toLowerCase().trim();
    if (!query) return this.mostActiveUsers();
    return this.mostActiveUsers().filter(
      (u) =>
        u.user.toLowerCase().includes(query) ||
        u.role.toLowerCase().includes(query),
    );
  });

  filteredSearches = computed(() => {
    let list = this.recentSearches();
    const query = this.modalSearchTerm().toLowerCase().trim();
    const type = this.modalTypeFilter();

    if (type !== "ALL") {
      list = list.filter((s) => s.type === type);
    }
    if (query) {
      list = list.filter(
        (s) =>
          s.user.toLowerCase().includes(query) ||
          s.query.toLowerCase().includes(query),
      );
    }
    return list;
  });

  ngOnInit(): void {
    this.currentRange.set(this.rangeService.label());
    this.loadAllData();
  }

  loadAllData(): void {
    const seq = ++this.loadSeq;
    this.isLoading.set(true);
    this.loadError.set(null);
    // Single aggregate request for all sections (no duplicate HTTPs).
    this.dataService
      .getAdminUsageStatistics({
        activity_period: this.activityTrendPeriod(),
        daily_period: this.dailyUsagePeriod(),
      })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (res) => {
          if (seq !== this.loadSeq) return;
          // Eligibility Checks is not a stored metric: drop the card even
          // if the API still returns it. Remaining cards are normalized so
          // numeric values (including 0) display, while genuinely missing
          // values keep the "Not tracked yet" empty state.
          this.kpis.set(
            (res.kpis || [])
              .filter((k) => k.label !== "Eligibility Checks")
              .map((k) => normalizeUsageKpi(k)),
          );
          this.activityLabels.set(res.activity_trend?.labels || []);
          this.activityDatasets.set(
            (res.activity_trend?.series || []).map((s) => ({
              label: s.label,
              data: s.data,
              borderColor: s.color,
              fill: false,
            })),
          );
          this.dailyLabels.set(res.daily_usage?.labels || []);
          this.dailyValues.set(res.daily_usage?.values || []);
          this.roleLabels.set(res.role_distribution?.labels || []);
          this.roleData.set(res.role_distribution?.data || []);
          this.roleColors.set(res.role_distribution?.colors || []);
          this.roleTotal.set(res.role_distribution?.total || "0");
          this.topPolicies.set(res.top_policies || []);
          this.topSchemes.set(res.top_schemes || []);
          this.mostActiveUsers.set(res.most_active_users || []);
          // Date filter: the API already scopes recent searches to the
          // global window; re-apply client-side as a safety net so rows
          // can never leak outside the selected range.
          this.recentSearches.set(
            this.rangeService.filterByDate(
              res.recent_searches || [],
              (s) => s.dateTime,
            ),
          );
          this.hasLoaded.set(true);
          this.isLoading.set(false);
        },
        error: (err) => {
          if (seq !== this.loadSeq) return;
          console.error("Failed to load usage statistics:", err);
          this.loadError.set("Could not load usage statistics. Please retry.");
          this.isLoading.set(false);
        },
      });
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  onDateRangeSelect(sel: DateRangeSelection): void {
    this.rangeService.applySelection(sel);
    this.currentRange.set(sel.label);
    // Drive the existing trend windows from the shared range; the
    // per-chart dropdowns remain independently adjustable afterwards.
    this.activityTrendPeriod.set(
      `Last ${this.rangeService.snapMonths([3, 6, 12])} Months`,
    );
    this.showActivityMenu.set(false);
    const days = this.rangeService.daysSpan();
    this.dailyUsagePeriod.set(
      days <= 7 ? "Last 7 Days" : days <= 14 ? "Last 14 Days" : "Last 30 Days",
    );
    this.showDailyMenu.set(false);
    this.loadAllData();
  }

  downloadReport(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);

    this.dataService
      .downloadReport("ANALYTICS_REPORT", "PDF", "Usage Statistics Report", {
        ...this.rangeService.toReportParams(),
      })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `usage-statistics-report-${new Date().toISOString().split("T")[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.isDownloading.set(false);
        },
        error: (err) => {
          console.error("Could not download usage report:", err);
          this.isDownloading.set(false);
        },
      });
  }

  setActivityPeriod(period: string): void {
    this.activityTrendPeriod.set(period);
    this.showActivityMenu.set(false);
    this.loadAllData();
  }

  toggleActivityMenu(event: Event): void {
    event.stopPropagation();
    this.showDailyMenu.set(false);
    this.showActivityMenu.update((v) => !v);
  }

  private updateActivityTrend(): void {
    this.dataService
      .getUserActivityTrend(this.activityTrendPeriod())
      .subscribe((trend) => {
        this.activityLabels.set(trend.labels);
        this.activityDatasets.set(
          trend.series.map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            fill: false,
          })),
        );
      });
  }

  setDailyPeriod(period: string): void {
    this.dailyUsagePeriod.set(period);
    this.showDailyMenu.set(false);
    this.loadAllData();
  }

  toggleDailyMenu(event: Event): void {
    event.stopPropagation();
    this.showActivityMenu.set(false);
    this.showDailyMenu.update((v) => !v);
  }

  private closeCardMenus(): void {
    this.showActivityMenu.set(false);
    this.showDailyMenu.set(false);
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    this.closeCardMenus();
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeCardMenus();
  }

  private updateDailyUsage(): void {
    this.dataService
      .getDailyUsage(this.dailyUsagePeriod())
      .subscribe((data) => {
        this.dailyLabels.set(data.labels);
        this.dailyValues.set(data.values);
      });
  }

  openModal(type: "policies" | "schemes" | "users" | "searches"): void {
    this.modalSearchTerm.set("");
    this.modalTypeFilter.set("ALL");
    this.activeModal.set(type);
  }

  closeModal(): void {
    this.activeModal.set(null);
  }

  /**
   * Most Active Users "View All": the complete activity dataset lives on
   * the existing Audit Logs page (paginated, filterable); the card keeps
   * showing the top 10 from the usage aggregate.
   */
  openAuditLogs(): void {
    void this.router.navigate(["/dashboard/admin/audit-logs"]);
  }
}

/**
 * Normalize one usage KPI for display.
 *
 * A genuinely numeric value — a number, or a numeric string such as "0" or
 * "1,234" — is displayed as-is (0 is real data, not missing data). Only a
 * missing/non-numeric value (null, undefined, "", "—") keeps the
 * "Not tracked yet" empty state. Policy/scheme detail views are recorded
 * as POLICY_VIEW / SCHEME_VIEW audit rows, so those cards render live
 * counts; anything still untracked keeps the empty state.
 */
function normalizeUsageKpi(kpi: UsageKpiCard): UsageKpiCard {
  const numeric = toNumericText(kpi.value);
  if (numeric !== null) {
    const change = typeof kpi.change === "string" ? kpi.change.trim() : "";
    return {
      ...kpi,
      value: numeric,
      change:
        change === "" || change === "—" || change === "-" ? "" : kpi.change,
    };
  }
  return {
    ...kpi,
    value: "—",
    change: "",
    subtext: kpi.subtext || "Not tracked yet",
  };
}

function toNumericText(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === "—" || text === "-") return null;
  const compact = text.replace(/,/g, "");
  if (!/^[-+]?\d+(\.\d+)?$/.test(compact)) return null;
  return text;
}
