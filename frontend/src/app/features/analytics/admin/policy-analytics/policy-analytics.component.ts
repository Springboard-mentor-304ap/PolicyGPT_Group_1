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
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

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
    CountUpDirective,
  ],
  templateUrl: "./policy-analytics.component.html",
  styleUrl: "./policy-analytics.component.scss",
})
export class PolicyAnalyticsComponent implements OnInit {
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
  ministryLabels = signal<string[]>([]);
  ministryData = signal<number[]>([]);
  latestPolicies = signal<PolicyRow[]>([]);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const filters = this.activeFilters();
    this.isLoading.set(true);
    this.loadError.set(null);

    // Single aggregate request; derived slices share one HTTP via cache.
    this.dataService.getAdminPolicyAnalytics(filters).subscribe({
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
        this.ministryLabels.set((res.by_ministry || []).map((r) => r.label));
        this.ministryData.set((res.by_ministry || []).map((r) => r.value));
        this.latestPolicies.set(res.latest_policies || []);
        this.hasLoaded.set(true);
        this.isLoading.set(false);
      },
      error: (err) => {
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

  exportReport(): void {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    const filters = this.activeFilters();
    this.dataService
      .downloadReport("POLICY_REPORT", "PDF", "Policy Analytics Report", filters)
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
}
