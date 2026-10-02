import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule, DecimalPipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import {
  AnalyticsStat,
  SchemeRow,
  SchemeUpdateRow,
} from "../models/admin-analytics.models";
import { DateRangePickerComponent } from "../../shared/date-range-picker/date-range-picker.component";
import { FiltersBarComponent } from "../../shared/filters-bar/filters-bar.component";
import { HbarChartComponent } from "../../shared/hbar-chart/hbar-chart.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";

@Component({
  selector: "app-scheme-analytics",
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    RouterLink,
    DateRangePickerComponent,
    FiltersBarComponent,
    HbarChartComponent,
    LineChartComponent,
    DoughnutChartComponent,
  ],
  templateUrl: "./scheme-analytics.component.html",
  styleUrl: "./scheme-analytics.component.scss",
})
export class SchemeAnalyticsComponent implements OnInit {
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
  topViewedSchemes = signal<SchemeRow[]>([]);
  recentUpdates = signal<SchemeUpdateRow[]>([]);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const filters = this.activeFilters();

    // Stats
    this.dataService
      .getSchemeAnalyticsStats(filters)
      .subscribe((res) => this.stats.set(res));

    // Category Doughnut
    this.dataService.getSchemesByCategoryDetailed(filters).subscribe((res) => {
      this.categoryLabels.set(res.map((c) => `${c.label} (${c.percentage}%)`));
      this.categoryData.set(res.map((c) => c.percentage));
    });

    // Trend Line
    this.dataService.getSchemeTrend(filters).subscribe((res) => {
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

    // Schemes by State HBar
    this.dataService.getSchemesByState(filters).subscribe((res) => {
      this.stateLabels.set(res.map((r) => r.label));
      this.stateData.set(res.map((r) => r.value));
    });

    // Top Viewed Schemes Table
    this.dataService
      .getTopViewedSchemes(filters)
      .subscribe((res) => this.topViewedSchemes.set(res));

    // Recent Scheme Updates Table
    this.dataService
      .getRecentSchemeUpdates(filters)
      .subscribe((res) => this.recentUpdates.set(res));
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

  downloadReport(): void {
    this.dataService.downloadReport("pdf").subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "scheme-analytics-report.pdf";
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        console.error("Could not download report");
      },
    });
  }

  getStatIcon(index: number): string {
    const icons = ["folder", "check_circle", "schedule", "close", "archive"];
    return icons[index % icons.length];
  }

  getStatIconClass(index: number): string {
    const classes = ["green", "blue", "orange", "red", "purple"];
    return classes[index % classes.length];
  }

  getTypeChipClass(type: string): string {
    switch (type?.toLowerCase()) {
      case "update":
        return "type-blue";
      case "notification":
        return "type-purple";
      case "new scheme":
        return "type-green";
      default:
        return "type-gray";
    }
  }
}
