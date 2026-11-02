import { ChangeDetectionStrategy, Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { GovtOverview } from "../../../core/services/analytics.service";
import { BreadcrumbComponent } from "../../../shared/components/breadcrumb/breadcrumb.component";
import { LoadingIndicatorComponent } from "../../../shared/components/loading-indicator/loading-indicator.component";
import {
  AnalyticsDonutChartComponent,
  AnalyticsHBarChartComponent,
  AnalyticsLineChartComponent,
  LineSeries,
} from "../shared/analytics-charts.component";
import { DateRangePickerComponent } from "../shared/date-range-picker/date-range-picker.component";
import { downloadGovtCsv, printAnalyticsPdf } from "../shared/analytics-export";
import {
  GovAnalyticsBase,
  GovtKpiCard,
  ROLE_COLORS,
  STATUS_COLORS,
} from "./gov-analytics-base";
import { CountUpDirective } from "../../../shared/directives/count-up.directive";

@Component({
  selector: "app-govt-analytics-overview",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    BreadcrumbComponent,
    DateRangePickerComponent,
    AnalyticsLineChartComponent,
    AnalyticsDonutChartComponent,
    AnalyticsHBarChartComponent,
    CountUpDirective,
    LoadingIndicatorComponent,
  ],
  templateUrl: "./govt-analytics-overview.component.html",
  styleUrl: "./government-analytics.scss",
})
export class GovtAnalyticsOverviewComponent extends GovAnalyticsBase {
  pageTitle = "Analytics Overview";
  pageDescription = "Government platform overview and key metrics.";
  exportPrefix = "government_overview";

  data: GovtOverview | null = null;

  loadData(forceRefresh: boolean): void {
    this.subscribe(
      this.analytics.getGovernmentOverview(this.windowParams(), forceRefresh),
      (data) => {
        this.data = data;
      },
    );
  }

  get kpis(): GovtKpiCard[] {
    const k = this.data?.kpis;
    if (!k) {
      return [];
    }
    const card = (
      key: string,
      label: string,
      icon: string,
      tone: GovtKpiCard["tone"],
      tooltip: string,
    ): GovtKpiCard => ({
      key,
      label,
      icon,
      tone,
      value: `${k[key]?.value ?? 0}`,
      tooltip,
      tracked: true,
    });
    return [
      card(
        "total_policies",
        "Total Policies",
        "description",
        "blue",
        "All policy records on the platform.",
      ),
      card(
        "total_schemes",
        "Total Schemes",
        "account_balance",
        "green",
        "All scheme records on the platform.",
      ),
      card(
        "departments",
        "Departments",
        "domain",
        "purple",
        "Distinct departments across policies and schemes.",
      ),
      card(
        "new_notifications",
        "New Notifications",
        "notifications",
        "green",
        "Broadcast notifications issued in this period.",
      ),
    ];
  }

  get trendSeries(): LineSeries[] {
    const t = this.data?.trends;
    if (!t) {
      return [];
    }
    return [
      {
        key: "policies",
        label: "Policies",
        color: "#1461a0",
        values: t.policies,
      },
      { key: "schemes", label: "Schemes", color: "#17833d", values: t.schemes },
    ];
  }

  get statusSlices(): {
    label: string;
    count: number;
    color: string;
    description?: string;
  }[] {
    const dist = this.data?.status_distribution;
    if (!dist) {
      return [];
    }
    const out: {
      label: string;
      count: number;
      color: string;
      description?: string;
    }[] = [];
    for (const [status, count] of Object.entries(dist.policies)) {
      out.push({
        label: `Policies · ${this.pretty(status)}`,
        count,
        color: STATUS_COLORS[status] ?? "#64748b",
        description: `${this.pretty(status)} policies`,
      });
    }
    for (const [status, count] of Object.entries(dist.schemes)) {
      out.push({
        label: `Schemes · ${this.pretty(status)}`,
        count,
        color: STATUS_COLORS[status] ?? "#64748b",
        description: `${this.pretty(status)} schemes`,
      });
    }
    return out.filter((s) => s.count > 0);
  }

  get departmentBars(): { label: string; value: number }[] {
    return (this.data?.top_departments ?? [])
      .slice(0, 7)
      .map((r) => ({ label: r.department, value: r.count }));
  }

  get roleSlices(): {
    label: string;
    count: number;
    color: string;
    description?: string;
  }[] {
    return (this.data?.users_by_role ?? []).map((r) => ({
      label: this.pretty(r.role),
      count: r.count,
      color: ROLE_COLORS[r.role] ?? "#64748b",
      description: `${this.pretty(r.role)} accounts`,
    }));
  }

  get notificationBars(): { label: string; value: number }[] {
    return (this.data?.notifications_by_type ?? [])
      .slice(0, 7)
      .map((r) => ({ label: this.pretty(r.type), value: r.count }));
  }

  get periodLabel(): string {
    return this.data
      ? `${this.data.window.from} to ${this.data.window.to}`
      : "";
  }

  downloadExcel(): void {
    if (!this.data) {
      return;
    }
    const d = this.data;
    this.showExportMenu = false;
    downloadGovtCsv(
      "PolicyGPT — Government Analytics Overview",
      this.exportPrefix,
      d.window.to,
      d.window.from,
      this.kpis.map((k) => [k.label, k.value]),
      [
        {
          heading: "Policy & Scheme Trend",
          headers: ["Month", "New Policies", "New Schemes"],
          rows: d.trends.labels.map((label, i) => [
            label,
            d.trends.policies[i] ?? 0,
            d.trends.schemes[i] ?? 0,
          ]),
        },
        {
          heading: "Top Departments by Policy Count",
          headers: ["Department", "Policies"],
          rows: d.top_departments.map((r) => [r.department, r.count]),
        },
        {
          heading: "Recent Policies",
          headers: ["Title", "Category", "Status", "Created"],
          rows: d.recent_policies.map((r) => [
            r.title,
            r.category ?? "",
            r.status ?? "",
            r.created_at ?? "",
          ]),
        },
        {
          heading: "Recent Schemes",
          headers: ["Title", "Category", "Status", "Created"],
          rows: d.recent_schemes.map((r) => [
            r.title,
            r.category ?? "",
            r.status ?? "",
            r.created_at ?? "",
          ]),
        },
      ],
    );
  }

  downloadPdf(): void {
    if (!this.data) {
      return;
    }
    this.showExportMenu = false;
    const previous = document.title;
    document.title = `${this.exportPrefix}_${this.data.window.to}`;
    printAnalyticsPdf();
    document.title = previous;
  }
}
