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
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

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
    CountUpDirective,
  ],
  templateUrl: "./scheme-analytics.component.html",
  styleUrl: "./scheme-analytics.component.scss",
})
export class SchemeAnalyticsComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);

  readonly isSampleData = this.dataService.isSampleData;

  activeFilters = signal<Record<string, string>>({});
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);
  isExporting = signal<boolean>(false);

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
    this.isLoading.set(true);
    this.loadError.set(null);

    // Single aggregate request; slices share one HTTP via cache.
    this.dataService.getAdminSchemeAnalytics(filters).subscribe({
      next: (res) => {
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
        this.stateLabels.set((res.by_state || []).map((r) => r.label));
        this.stateData.set((res.by_state || []).map((r) => r.value));
        this.topViewedSchemes.set(res.top_schemes || []);
        this.recentUpdates.set(res.recent_updates || []);
        this.hasLoaded.set(true);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error("Failed to load scheme analytics:", err);
        // Keep any previously loaded cards visible; surface error + retry.
        this.loadError.set("Could not load scheme analytics. Please retry.");
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

  downloadReport(): void {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    const filters = this.activeFilters();
    this.dataService
      .downloadReport("SCHEME_REPORT", "PDF", "Scheme Analytics Report", filters)
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `scheme-analytics-report-${new Date().toISOString().split("T")[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.isExporting.set(false);
        },
        error: (err) => {
          console.error("Could not download scheme report:", err);
          this.isExporting.set(false);
        },
      });
  }

  /** Live doughnut center total (no hardcoded 438). */
  categoryTotal(): string {
    const found = this.stats().find((s) => s.label === "Total Schemes")?.value;
    return String(found ?? "0");
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
