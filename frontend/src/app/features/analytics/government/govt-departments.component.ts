import { ChangeDetectionStrategy, Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { GovtDepartments } from "../../../core/services/analytics.service";
import { BreadcrumbComponent } from "../../../shared/components/breadcrumb/breadcrumb.component";
import {
  AnalyticsDonutChartComponent,
  AnalyticsGroupedBarChartComponent,
  AnalyticsHBarChartComponent,
  AnalyticsLineChartComponent,
  GroupedBarSeries,
  LineSeries,
} from "../shared/analytics-charts.component";
import { downloadGovtCsv, printAnalyticsPdf } from "../shared/analytics-export";
import { GovAnalyticsBase, GovtKpiCard } from "./gov-analytics-base";

import { CountUpDirective } from "../../../shared/directives/count-up.directive";

@Component({
  selector: "app-govt-departments",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    BreadcrumbComponent,
    AnalyticsLineChartComponent,
    AnalyticsDonutChartComponent,
    AnalyticsHBarChartComponent,
    AnalyticsGroupedBarChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./govt-departments.component.html",
  styleUrl: "./government-analytics.scss",
})
export class GovtDepartmentsComponent extends GovAnalyticsBase {
  pageTitle = "Department Analytics";
  pageDescription = "Ministry and department aggregations.";
  exportPrefix = "government_departments";

  data: GovtDepartments | null = null;

  department = "";
  tableSearch = "";

  loadData(forceRefresh: boolean): void {
    this.subscribe(
      this.analytics.getGovernmentDepartments(
        { ...this.windowParams(), department: this.department || undefined },
        forceRefresh,
      ),
      (data) => {
        this.data = data;
      },
    );
  }

  onFilterChange(): void {
    this.loadData(false);
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
    ): GovtKpiCard => {
      const metric = k[key];
      const tracked = metric?.tracked !== false;
      return {
        key,
        label,
        icon,
        tone,
        value: tracked ? `${metric?.value ?? 0}` : "n/a",
        tooltip: tracked ? tooltip : `${tooltip} ${metric?.reason ?? ""}`,
        tracked,
      };
    };
    return [
      card(
        "total_departments",
        "Total Departments",
        "domain",
        "blue",
        "Distinct departments across policies and schemes.",
      ),
      card(
        "total_policies",
        "Total Policies",
        "description",
        "green",
        "Policy records attributed to a department.",
      ),
      card(
        "total_schemes",
        "Total Schemes",
        "account_balance",
        "orange",
        "Scheme records attributed to a department.",
      ),
      card(
        "approved_requests",
        "Approved Requests",
        "check_circle",
        "green",
        "Approved policy and scheme records.",
      ),
      card(
        "pending_requests",
        "Pending Requests",
        "pending",
        "orange",
        "Records awaiting approval.",
      ),
    ];
  }

  get groupedSeries(): GroupedBarSeries[] {
    const g = this.data?.grouped;
    if (!g) {
      return [];
    }
    return [
      { label: "Policies", color: "#1461a0", values: g.policies },
      { label: "Schemes", color: "#17833d", values: g.schemes },
    ];
  }

  get distributionSlices(): {
    label: string;
    count: number;
    color: string;
    description?: string;
  }[] {
    const palette = [
      "#1461a0",
      "#17833d",
      "#c26a00",
      "#7e22ce",
      "#0e7490",
      "#be123c",
      "#64748b",
    ];
    return (this.data?.distribution ?? []).map((r, i) => ({
      label: r.department,
      count: r.count,
      color: palette[i % palette.length],
      description: `${r.count} policies`,
    }));
  }

  get topPolicyBars(): { label: string; value: number }[] {
    return (this.data?.top_policy_departments ?? []).map((r) => ({
      label: r.department,
      value: r.count,
    }));
  }

  get topSchemeBars(): { label: string; value: number }[] {
    return (this.data?.top_scheme_departments ?? []).map((r) => ({
      label: r.department,
      value: r.count,
    }));
  }

  get activitySeries(): LineSeries[] {
    const t = this.data?.activity_trend;
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

  get filteredTable(): GovtDepartments["department_table"] {
    const q = this.tableSearch.trim().toLowerCase();
    const rows = this.data?.department_table ?? [];
    if (!q) {
      return rows;
    }
    return rows.filter((r) => r.department.toLowerCase().includes(q));
  }

  get periodLabel(): string {
    return this.data
      ? `${this.data.window.from} to ${this.data.window.to}`
      : "";
  }

  activityLink(entity: string, entityId: number): string[] {
    return ["/dashboard/government", entity, String(entityId)];
  }

  downloadExcel(): void {
    if (!this.data) {
      return;
    }
    const d = this.data;
    this.showExportMenu = false;
    downloadGovtCsv(
      "PolicyGPT — Department Analytics",
      this.exportPrefix,
      d.window.to,
      d.window.from,
      this.kpis.map((k) => [k.label, k.value]),
      [
        {
          heading: "Department-wise Policy and Scheme Count",
          headers: ["Department", "Policies", "Schemes", "Approved", "Pending"],
          rows: d.department_table.map((r) => [
            r.department,
            r.policies,
            r.schemes,
            r.approved,
            r.pending,
          ]),
        },
        {
          heading: "Department Activity Trend",
          headers: ["Month", "New Policies", "New Schemes"],
          rows: d.activity_trend.labels.map((label, i) => [
            label,
            d.activity_trend.policies[i] ?? 0,
            d.activity_trend.schemes[i] ?? 0,
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
