import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import { DateRangePickerComponent } from "../../shared/date-range-picker/date-range-picker.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import {
  AnalyticsStat,
  RecentActivityItem,
  NotificationActivityItem,
} from "../models/admin-analytics.models";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

@Component({
  selector: "app-admin-dashboard",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DateRangePickerComponent,
    LineChartComponent,
    DoughnutChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./admin-dashboard.component.html",
  styleUrl: "./admin-dashboard.component.scss",
})
export class AdminDashboardComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);

  readonly isSampleData = this.dataService.isSampleData;

  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);

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

  // Recent User Activity Data
  recentActivities: RecentActivityItem[] = [];

  // Latest Notifications Data
  notifications: NotificationActivityItem[] = [];

  ngOnInit(): void {
    this.loadOverviewData(this.trendTimeframe());
  }

  loadOverviewData(timeframe: string): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.dataService.getAdminOverview(timeframe).subscribe({
      next: (res) => {
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
          this.recentActivities = res.recentActivities;
        }
        if (res.notifications) {
          this.notifications = res.notifications;
        }
        this.hasLoaded.set(true);
        this.isLoading.set(false);
      },
      error: (err) => {
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

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  toggleTimeframeMenu(event: Event): void {
    event.stopPropagation();
    this.showTimeframeMenu.update((v) => !v);
  }

  selectTimeframe(option: string): void {
    this.trendTimeframe.set(option);
    this.showTimeframeMenu.set(false);
    this.loadOverviewData(option);
  }
}
