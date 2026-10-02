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
import { VbarChartComponent } from "../../shared/vbar-chart/vbar-chart.component";
import {
  UsageKpiCard,
  TopSearchedItem,
  MostActiveUserUsage,
  RecentSearchActivityItem,
} from "../models/admin-analytics.models";

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
  ],
  templateUrl: "./usage-statistics.component.html",
  styleUrl: "./usage-statistics.component.scss",
})
export class UsageStatisticsComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);

  readonly isSampleData = this.dataService.isSampleData;

  // Selected date range
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  isDownloading = signal<boolean>(false);

  // 6 KPI Cards
  kpis = signal<UsageKpiCard[]>([]);

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
  roleTotal = signal<string>("5,820");

  // Middle Tables (Top 10 Policies, Top 10 Schemes, Most Active Users)
  topPolicies = signal<TopSearchedItem[]>([]);
  topSchemes = signal<TopSearchedItem[]>([]);
  mostActiveUsers = signal<MostActiveUserUsage[]>([]);

  // Bottom Table: Recent Search Activity
  recentSearches = signal<RecentSearchActivityItem[]>([]);

  // Modals for "View All"
  activeModal = signal<"policies" | "schemes" | "users" | "searches" | null>(null);
  modalSearchTerm = signal<string>("");
  modalTypeFilter = signal<string>("ALL");

  // Filtered lists for modals
  filteredPolicies = computed(() => {
    const query = this.modalSearchTerm().toLowerCase().trim();
    if (!query) return this.topPolicies();
    return this.topPolicies().filter((p) => p.title.toLowerCase().includes(query));
  });

  filteredSchemes = computed(() => {
    const query = this.modalSearchTerm().toLowerCase().trim();
    if (!query) return this.topSchemes();
    return this.topSchemes().filter((s) => s.title.toLowerCase().includes(query));
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
    this.loadAllData();
  }

  loadAllData(): void {
    // 1. KPI Cards
    this.dataService.getUsageKpis().subscribe((data) => {
      this.kpis.set(data);
    });

    // 2. Activity Trend
    this.updateActivityTrend();

    // 3. Daily Usage
    this.updateDailyUsage();

    // 4. Role Distribution
    this.dataService.getUserRoleDistribution().subscribe((dist) => {
      this.roleLabels.set(dist.labels);
      this.roleData.set(dist.data);
      this.roleColors.set(dist.colors);
      this.roleTotal.set(dist.total);
    });

    // 5. Top Searched Policies
    this.dataService.getTopSearchedPolicies().subscribe((policies) => {
      this.topPolicies.set(policies);
    });

    // 6. Top Searched Schemes
    this.dataService.getTopSearchedSchemes().subscribe((schemes) => {
      this.topSchemes.set(schemes);
    });

    // 7. Most Active Users
    this.dataService.getMostActiveUsersUsage().subscribe((users) => {
      this.mostActiveUsers.set(users);
    });

    // 8. Recent Search Activity
    this.dataService.getRecentSearchActivities().subscribe((searches) => {
      this.recentSearches.set(searches);
    });
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  downloadReport(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);

    this.dataService.downloadReport("Usage Statistics Report", "pdf").subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `usage-statistics-report-${new Date().toISOString().split("T")[0]}.txt`;
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

  setActivityPeriod(period: string): void {
    this.activityTrendPeriod.set(period);
    this.showActivityMenu.set(false);
    this.updateActivityTrend();
  }

  private updateActivityTrend(): void {
    this.dataService.getUserActivityTrend(this.activityTrendPeriod()).subscribe((trend) => {
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
    this.updateDailyUsage();
  }

  private updateDailyUsage(): void {
    this.dataService.getDailyUsage(this.dailyUsagePeriod()).subscribe((data) => {
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
}
