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
  roleTotal = signal<string>("5,820");

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
    // 1. KPI Cards
    this.dataService.getUserKpis().subscribe((data) => {
      this.kpis.set(data);
    });

    // 2. Growth Trend
    this.updateGrowthTrend();

    // 3. Role Distribution
    this.dataService.getUserRoleDistribution().subscribe((dist) => {
      this.roleLabels.set(dist.labels);
      this.roleData.set(dist.data);
      this.roleColors.set(dist.colors);
      this.roleTotal.set(dist.total);
    });

    // 4. Registration Trend
    this.updateRegTrend();

    // 5. Users by State
    this.updateStateDistribution(10);

    // 6. Engagement Metrics
    this.dataService.getUserEngagementMetrics().subscribe((metrics) => {
      this.engagementMetrics.set(metrics);
    });

    // 7. Heatmap Data
    this.updateHeatmap();

    // 8. Recent Registered Users
    this.dataService.getRecentRegisteredUsers().subscribe((users) => {
      this.recentUsers.set(users);
    });

    // 9. Top Active Users
    this.dataService.getTopActiveUsers().subscribe((users) => {
      this.topActiveUsers.set(users);
    });
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  downloadReport(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);

    this.dataService.downloadReport("User Analytics Report", "pdf").subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `user-analytics-report-${new Date().toISOString().split("T")[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.isDownloading.set(false);
      },
      error: () => {
        this.isDownloading.set(false);
      },
    });
  }

  // Growth Trend Period Selector
  setGrowthPeriod(period: string): void {
    this.growthPeriod.set(period);
    this.showGrowthMenu.set(false);
    this.updateGrowthTrend();
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
    this.updateRegTrend();
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
    this.updateStateDistribution(option.count);
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
    this.updateHeatmap();
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
