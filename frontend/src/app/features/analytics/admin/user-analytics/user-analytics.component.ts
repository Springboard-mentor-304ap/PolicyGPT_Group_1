import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import { DateRangePickerComponent } from "../../shared/date-range-picker/date-range-picker.component";
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

  readonly isSampleData = this.dataService.isSampleData;

  // Selected date range
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  isDownloading = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);

  // KPI Cards
  kpis = signal<UserKpiCard[]>([]);

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

  // User Engagement Metrics (4 cards)
  engagementMetrics = signal<EngagementMetric[]>([]);

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
    this.loadAllData();
  }

  loadAllData(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    // Single aggregate request for all sections (no duplicate HTTPs).
    this.dataService
      .getAdminUserAnalytics({
        growth_period: this.growthPeriod(),
        reg_period: this.regPeriod(),
        state_limit: String(this.stateOptions.find((o) => o.label === this.selectedStateOption())?.count ?? 10),
        heatmap_period: this.heatmapPeriod(),
      })
      .subscribe({
        next: (res) => {
          this.kpis.set(res.kpis || []);
          this.growthLabels.set(res.growth_trend?.labels || []);
          this.growthDatasets.set(
            (res.growth_trend?.series || []).map((s) => ({
              label: s.label,
              data: s.data,
              borderColor: s.color,
              fill: false,
            })),
          );
          this.roleLabels.set(res.role_distribution?.labels || []);
          this.roleData.set(res.role_distribution?.data || []);
          this.roleColors.set(res.role_distribution?.colors || []);
          this.roleTotal.set(res.role_distribution?.total || "0");
          this.regLabels.set(res.registration_trend?.labels || []);
          this.regValues.set(res.registration_trend?.values || []);
          this.stateLabels.set(res.users_by_state?.labels || []);
          this.stateValues.set(res.users_by_state?.values || []);
          this.engagementMetrics.set(res.engagement_metrics || []);
          this.heatmapDays.set(res.heatmap?.days || []);
          this.heatmapTimes.set(res.heatmap?.times || []);
          this.heatmapCells.set(res.heatmap?.cells || []);
          this.recentUsers.set(res.recent_registered_users || []);
          this.topActiveUsers.set(res.top_active_users || []);
          this.hasLoaded.set(true);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error("Failed to load user analytics:", err);
          this.loadError.set("Could not load user analytics. Please retry.");
          this.isLoading.set(false);
        },
      });
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  downloadReport(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);

    this.dataService.downloadReport("USER_REPORT", "PDF", "User Analytics Report", {}).subscribe({
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
  setGrowthPeriod(period: string): void {
    this.growthPeriod.set(period);
    this.showGrowthMenu.set(false);
    this.loadAllData();
  }

  private updateGrowthTrend(): void {
    this.dataService.getUserGrowthTrend(this.growthPeriod()).subscribe((trend) => {
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
  setRegPeriod(period: string): void {
    this.regPeriod.set(period);
    this.showRegMenu.set(false);
    this.loadAllData();
  }

  private updateRegTrend(): void {
    this.dataService.getUserRegistrationTrend(this.regPeriod()).subscribe((data) => {
      this.regLabels.set(data.labels);
      this.regValues.set(data.values);
    });
  }

  // State Count Selector
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

  private updateHeatmap(): void {
    this.dataService.getUserHeatmapData(this.heatmapPeriod()).subscribe((data) => {
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
