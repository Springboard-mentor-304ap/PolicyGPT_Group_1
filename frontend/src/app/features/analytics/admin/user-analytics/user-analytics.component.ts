import { Component, HostListener, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
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
import { HbarChartComponent } from "../../shared/hbar-chart/hbar-chart.component";
import { VbarChartComponent } from "../../shared/vbar-chart/vbar-chart.component";
import {
  UserKpiCard,
  EngagementMetric,
  HeatmapCell,
  RecentRegisteredUser,
  TopActiveUser,
} from "../models/admin-analytics.models";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";
import { AnalyticsDateRangeService } from "../../shared/analytics-date-range.service";

@Component({
  selector: "app-user-analytics",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DateRangePickerComponent,
    LineChartComponent,
    DoughnutChartComponent,
    HbarChartComponent,
    VbarChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./user-analytics.component.html",
  styleUrl: "./user-analytics.component.scss",
})
export class UserAnalyticsComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);
  private readonly rangeService = inject(AnalyticsDateRangeService);

  readonly isSampleData = this.dataService.isSampleData;

  // Selected date range
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  isDownloading = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);

  // KPI Cards (pre-populated so the final layout renders immediately;
  // live API values replace these defaults when the response arrives).
  // Admins/Citizens counts come from role_distribution in the same response.
  kpis = signal<UserKpiCard[]>([
    {
      label: "Total Users",
      value: "0",
      change: "",
      isPositive: true,
      icon: "people",
      iconClass: "blue",
    },
    {
      label: "Active Users",
      value: "0",
      change: "",
      isPositive: true,
      icon: "person",
      iconClass: "green",
    },
    {
      label: "New Users",
      value: "0",
      change: "",
      isPositive: true,
      icon: "person_add",
      iconClass: "orange",
    },
    {
      label: "Govt. Officials",
      value: "0",
      change: "",
      isPositive: true,
      icon: "badge",
      iconClass: "purple",
    },
    {
      label: "Organizations",
      value: "0",
      change: "",
      isPositive: true,
      icon: "business",
      iconClass: "teal",
    },
    {
      label: "Researchers",
      value: "0",
      change: "",
      isPositive: true,
      icon: "science",
      iconClass: "pink",
    },
    {
      label: "Admins",
      value: "0",
      change: "",
      isPositive: true,
      icon: "admin_panel_settings",
      iconClass: "red",
    },
    {
      label: "Citizens",
      value: "0",
      change: "",
      isPositive: true,
      icon: "groups",
      iconClass: "blue-light",
    },
  ]);

  // User Growth Trend
  growthPeriod = signal<string>("Last 12 Months");
  growthPeriodOptions = ["Last 3 Months", "Last 6 Months", "Last 12 Months"];
  showGrowthMenu = signal<boolean>(false);
  growthLabels = signal<string[]>([]);
  growthDatasets = signal<LineDataset[]>([]);

  // User Distribution by Role
  roleLabels = signal<string[]>([]);
  roleData = signal<number[]>([]);
  roleColors = signal<string[]>([]);
  roleTotal = signal<string>("0");

  // User Registration Trend
  regPeriod = signal<string>("Last 6 Months");
  regPeriodOptions = ["Last 3 Months", "Last 6 Months"];
  showRegMenu = signal<boolean>(false);
  regLabels = signal<string[]>([]);
  regValues = signal<number[]>([]);

  // Users by State
  selectedStateOption = signal<string>("Top 10 States");
  stateOptions = [
    { label: "Top 5 States", count: 5 },
    { label: "Top 10 States", count: 10 },
    { label: "All States", count: 15 },
  ];
  showStateMenu = signal<boolean>(false);
  stateLabels = signal<string[]>([]);
  stateValues = signal<number[]>([]);

  // User Engagement Metrics (4 cards, pre-populated with defaults so the
  // final layout renders immediately; live values replace them on load).
  engagementMetrics = signal<EngagementMetric[]>([
    {
      label: "Total Logins",
      value: "0",
      change: "",
      isPositive: true,
      icon: "login",
      iconClass: "blue",
    },
    {
      label: "Search Queries",
      value: "0",
      change: "",
      isPositive: true,
      icon: "search",
      iconClass: "purple",
    },
    {
      label: "Reports Generated",
      value: "0",
      change: "",
      isPositive: true,
      icon: "description",
      iconClass: "orange",
    },
    {
      label: "Notifications Sent",
      value: "0",
      change: "",
      isPositive: true,
      icon: "notifications",
      iconClass: "green",
    },
  ]);

  // User Activity Heatmap
  heatmapPeriod = signal<string>("Last 4 Weeks");
  heatmapPeriodOptions = ["Last 2 Weeks", "Last 4 Weeks", "Last 8 Weeks"];
  showHeatmapMenu = signal<boolean>(false);
  heatmapDays = signal<string[]>([]);
  heatmapTimes = signal<string[]>([]);
  heatmapCells = signal<HeatmapCell[]>([]);
  hoveredCell = signal<HeatmapCell | null>(null);

  // Tables
  recentUsers = signal<RecentRegisteredUser[]>([]);
  topActiveUsers = signal<TopActiveUser[]>([]);

  /**
   * Reload generation: only the latest loadAllData call may touch state
   * so a slow older response can never overwrite newer filter data.
   */
  private loadSeq = 0;

  // "View All" Modals
  activeModal = signal<"recent" | "active" | null>(null);
  modalSearchTerm = signal<string>("");
  modalRoleFilter = signal<string>("ALL");

  // Computed filtered list for Recent Users modal
  filteredRecentUsers = computed(() => {
    let list = this.recentUsers();
    const query = this.modalSearchTerm().toLowerCase().trim();
    const role = this.modalRoleFilter();

    if (role !== "ALL") {
      list = list.filter((u) => u.role === role);
    }
    if (query) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          u.state.toLowerCase().includes(query),
      );
    }
    return list;
  });

  // Computed filtered list for Top Active Users modal
  filteredTopActiveUsers = computed(() => {
    let list = this.topActiveUsers();
    const query = this.modalSearchTerm().toLowerCase().trim();
    const role = this.modalRoleFilter();

    if (role !== "ALL") {
      list = list.filter((u) => u.role === role);
    }
    if (query) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          (u.email && u.email.toLowerCase().includes(query)),
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
      .getAdminUserAnalytics({
        growth_period: this.growthPeriod(),
        reg_period: this.regPeriod(),
        state_limit: String(
          this.stateOptions.find((o) => o.label === this.selectedStateOption())
            ?.count ?? 10,
        ),
        heatmap_period: this.heatmapPeriod(),
      })
      .subscribe({
        next: (res) => {
          if (seq !== this.loadSeq) return;
          this.roleLabels.set(res.role_distribution?.labels || []);
          this.roleData.set(res.role_distribution?.data || []);
          this.roleColors.set(res.role_distribution?.colors || []);
          this.roleTotal.set(res.role_distribution?.total || "0");
          // Admins/Citizens cards reuse the role_distribution from this
          // same response (no extra API call); missing roles read as 0.
          this.kpis.set(
            withAdminCitizenKpis(
              res.kpis || [],
              res.role_distribution?.labels || [],
              res.role_distribution?.data || [],
            ),
          );
          this.growthLabels.set(res.growth_trend?.labels || []);
          this.growthDatasets.set(
            (res.growth_trend?.series || []).map((s) => ({
              label: s.label,
              data: s.data,
              borderColor: s.color,
              fill: false,
            })),
          );
          this.regLabels.set(res.registration_trend?.labels || []);
          this.regValues.set(res.registration_trend?.values || []);
          this.stateLabels.set(res.users_by_state?.labels || []);
          this.stateValues.set(res.users_by_state?.values || []);
          this.engagementMetrics.set(res.engagement_metrics || []);
          this.heatmapDays.set(res.heatmap?.days || []);
          this.heatmapTimes.set(res.heatmap?.times || []);
          this.heatmapCells.set(res.heatmap?.cells || []);
          // Recent Registered Users is the overall latest-users list
          // (newest 10 by created_at desc from the API, sliced to 5 in the
          // template). It is intentionally NOT date-range filtered: the
          // default/shared window ends in 2024 while real registrations are
          // newer, so filtering here emptied the table entirely.
          this.recentUsers.set(res.recent_registered_users || []);
          this.topActiveUsers.set(res.top_active_users || []);
          this.hasLoaded.set(true);
          this.isLoading.set(false);
        },
        error: (err) => {
          if (seq !== this.loadSeq) return;
          console.error("Failed to load user analytics:", err);
          this.loadError.set("Could not load user analytics. Please retry.");
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
    this.growthPeriod.set(
      `Last ${this.rangeService.snapMonths([3, 6, 12])} Months`,
    );
    this.showGrowthMenu.set(false);
    this.regPeriod.set(
      this.rangeService.monthsSpan() <= 3 ? "Last 3 Months" : "Last 6 Months",
    );
    this.showRegMenu.set(false);
    this.loadAllData();
  }

  downloadReport(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);

    this.dataService
      .downloadReport("USER_REPORT", "PDF", "User Analytics Report", {
        ...this.rangeService.toReportParams(),
      })
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `user-analytics-report-${new Date().toISOString().split("T")[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.isDownloading.set(false);
        },
        error: (err) => {
          console.error("Could not download user report:", err);
          this.isDownloading.set(false);
        },
      });
  }

  // Growth Trend Period Selector
  toggleGrowthMenu(event: Event): void {
    event.stopPropagation();
    this.showStateMenu.set(false);
    this.showRegMenu.set(false);
    this.showHeatmapMenu.set(false);
    this.showGrowthMenu.update((v) => !v);
  }

  setGrowthPeriod(period: string): void {
    this.growthPeriod.set(period);
    this.showGrowthMenu.set(false);
    this.loadAllData();
  }

  private updateGrowthTrend(): void {
    this.dataService
      .getUserGrowthTrend(this.growthPeriod())
      .subscribe((trend) => {
        this.growthLabels.set(trend.labels);
        this.growthDatasets.set(
          trend.series.map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            fill: false,
          })),
        );
      });
  }

  // Registration Trend Period Selector
  toggleRegMenu(event: Event): void {
    event.stopPropagation();
    this.showGrowthMenu.set(false);
    this.showStateMenu.set(false);
    this.showHeatmapMenu.set(false);
    this.showRegMenu.update((v) => !v);
  }

  setRegPeriod(period: string): void {
    this.regPeriod.set(period);
    this.showRegMenu.set(false);
    this.loadAllData();
  }

  private updateRegTrend(): void {
    this.dataService
      .getUserRegistrationTrend(this.regPeriod())
      .subscribe((data) => {
        this.regLabels.set(data.labels);
        this.regValues.set(data.values);
      });
  }

  // State Count Selector
  toggleStateMenu(event: Event): void {
    event.stopPropagation();
    this.showGrowthMenu.set(false);
    this.showRegMenu.set(false);
    this.showHeatmapMenu.set(false);
    this.showStateMenu.update((v) => !v);
  }

  selectStateOption(option: { label: string; count: number }): void {
    this.selectedStateOption.set(option.label);
    this.showStateMenu.set(false);
    this.loadAllData();
  }

  private updateStateDistribution(count: number): void {
    this.dataService.getUsersByState(count).subscribe((data) => {
      this.stateLabels.set(data.labels);
      this.stateValues.set(data.values);
    });
  }

  // Heatmap Period Selector
  setHeatmapPeriod(period: string): void {
    this.heatmapPeriod.set(period);
    this.showHeatmapMenu.set(false);
    this.loadAllData();
  }

  private closeCardMenus(): void {
    this.showGrowthMenu.set(false);
    this.showStateMenu.set(false);
    this.showRegMenu.set(false);
    this.showHeatmapMenu.set(false);
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    this.closeCardMenus();
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeCardMenus();
  }

  private updateHeatmap(): void {
    this.dataService
      .getUserHeatmapData(this.heatmapPeriod())
      .subscribe((data) => {
        this.heatmapDays.set(data.days);
        this.heatmapTimes.set(data.times);
        this.heatmapCells.set(data.cells);
      });
  }

  getCell(dayIndex: number, timeIndex: number): HeatmapCell | undefined {
    return this.heatmapCells().find(
      (c) => c.dayIndex === dayIndex && c.hour === timeIndex * 3,
    );
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case "Citizen":
        return "badge-citizen";
      case "Researcher":
        return "badge-researcher";
      case "Govt. Official":
        return "badge-official";
      case "Organization":
        return "badge-organization";
      case "Administrator":
        return "badge-admin";
      default:
        return "badge-default";
    }
  }

  openModal(type: "recent" | "active"): void {
    this.modalSearchTerm.set("");
    this.modalRoleFilter.set("ALL");
    this.activeModal.set(type);
  }

  closeModal(): void {
    this.activeModal.set(null);
  }
}

/**
 * Merge Admins/Citizens KPI cards into the API KPI list.
 *
 * Counts come from the role_distribution of the SAME user-analytics
 * response (labels like "Admin"/"Citizen" paired with data counts; roles
 * absent from the database read as 0). No extra API call, no hardcoding.
 * Both cards are appended after the six API cards in
 * Total → … → Researchers → Admins → Citizens order.
 */
function withAdminCitizenKpis(
  kpis: UserKpiCard[],
  roleLabels: string[],
  roleData: number[],
): UserKpiCard[] {
  const counts = new Map<string, number>();
  roleLabels.forEach((label, i) => {
    const key = label.replace(/[^a-z0-9]/gi, "").toUpperCase();
    const value = Number(roleData[i] ?? 0);
    counts.set(
      key,
      (counts.get(key) ?? 0) + (Number.isFinite(value) ? value : 0),
    );
  });
  const adminCount =
    (counts.get("ADMIN") ?? 0) + (counts.get("ADMINISTRATOR") ?? 0);
  const citizenCount = counts.get("CITIZEN") ?? 0;
  const fmt = (n: number): string => n.toLocaleString("en-US");

  const admins: UserKpiCard = {
    label: "Admins",
    value: fmt(adminCount),
    change: "",
    isPositive: true,
    icon: "admin_panel_settings",
    iconClass: "red",
  };
  const citizens: UserKpiCard = {
    label: "Citizens",
    value: fmt(citizenCount),
    change: "",
    isPositive: true,
    icon: "groups",
    iconClass: "blue-light",
  };

  const rest = kpis.filter(
    (k) => k.label !== "Admins" && k.label !== "Citizens",
  );
  return [...rest, admins, citizens];
}
