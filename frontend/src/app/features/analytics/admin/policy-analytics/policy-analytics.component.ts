import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import {
  AnalyticsStat,
  PolicyRow,
} from "../models/admin-analytics.models";
import { DateRangePickerComponent } from "../../shared/date-range-picker/date-range-picker.component";
import { FiltersBarComponent } from "../../shared/filters-bar/filters-bar.component";
import { HbarChartComponent } from "../../shared/hbar-chart/hbar-chart.component";
import { VbarChartComponent } from "../../shared/vbar-chart/vbar-chart.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";

@Component({
  selector: "app-policy-analytics",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DateRangePickerComponent,
    FiltersBarComponent,
    HbarChartComponent,
    VbarChartComponent,
    LineChartComponent,
    DoughnutChartComponent,
  ],
  templateUrl: "./policy-analytics.component.html",
  styleUrl: "./policy-analytics.component.scss",
})
export class PolicyAnalyticsComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);

  readonly isSampleData = this.dataService.isSampleData;

  activeFilters = signal<Record<string, string>>({});
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");

  stats = signal<AnalyticsStat[]>([]);
  categoryLabels = signal<string[]>([]);
  categoryData = signal<number[]>([]);
  trendLabels = signal<string[]>([]);
  trendDatasets = signal<LineDataset[]>([]);
  stateLabels = signal<string[]>([]);
  stateData = signal<number[]>([]);
  ministryLabels = signal<string[]>([]);
  ministryData = signal<number[]>([]);
  latestPolicies = signal<PolicyRow[]>([]);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const filters = this.activeFilters();

    // Stats
    this.dataService
      .getPolicyAnalyticsStats(filters)
      .subscribe((res) => this.stats.set(res));

    // Category Doughnut
    this.dataService.getPoliciesByCategory(filters).subscribe((res) => {
      this.categoryLabels.set(res.map((c) => `${c.label} (${c.percentage}%)`));
      this.categoryData.set(res.map((c) => c.percentage));
    });

    // Trend Line
    this.dataService.getPolicyStatusTrend(filters).subscribe((res) => {
      this.trendLabels.set(res.labels);
      this.trendDatasets.set(
        res.series.map((s) => ({
          label: s.label,
          data: s.data,
          borderColor: s.color,
          backgroundColor: "transparent",
        })),
      );
    });

    // Policies by State HBar
    this.dataService.getPoliciesByState(filters).subscribe((res) => {
      this.stateLabels.set(res.map((r) => r.label));
      this.stateData.set(res.map((r) => r.value));
    });

    // Policies by Ministry VBar
    this.dataService.getPoliciesByMinistry(filters).subscribe((res) => {
      this.ministryLabels.set(res.map((r) => r.label));
      this.ministryData.set(res.map((r) => r.value));
    });

    // Latest Policies
    this.dataService
      .getLatestPolicies(filters)
      .subscribe((res) => this.latestPolicies.set(res));
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

  exportReport(): void {
    this.dataService.downloadReport("pdf").subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "policy-analytics-report.pdf";
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        // Fallback notification
        console.error("Could not export report");
      },
    });
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
}
