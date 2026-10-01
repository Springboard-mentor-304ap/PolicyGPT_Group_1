import {
  ChangeDetectionStrategy,
  Component,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { GovtPolicyScheme } from "../../../core/services/analytics.service";
import { BreadcrumbComponent } from "../../../shared/components/breadcrumb/breadcrumb.component";
import {
  AnalyticsDonutChartComponent,
  AnalyticsHBarChartComponent,
  AnalyticsLineChartComponent,
  LineSeries,
} from "../shared/analytics-charts.component";
import {
  downloadGovtCsv,
  printAnalyticsPdf,
} from "../shared/analytics-export";
import {
  GovAnalyticsBase,
  GovtKpiCard,
  STATUS_COLORS,
} from "./gov-analytics-base";

@Component({
  selector: "app-govt-policy-scheme",
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
  ],
  templateUrl: "./govt-policy-scheme.component.html",
  styleUrl: "./government-analytics.scss",
})
export class GovtPolicySchemeComponent extends GovAnalyticsBase {
  pageTitle = "Policy & Scheme Analytics";
  pageDescription = "Policy and scheme portfolio status, distribution and trends.";
  exportPrefix = "government_policy_scheme";

  data: GovtPolicyScheme | null = null;

  policyStatus = "";
  schemeStatus = "";
  category = "";

  loadData(forceRefresh: boolean): void {
    this.subscribe(
      this.analytics.getGovernmentPolicyScheme(
        {
          ...this.windowParams(),
          policy_status: this.policyStatus || undefined,
          scheme_status: this.schemeStatus || undefined,
          category: this.category || undefined,
        },
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
      card("total_policies", "Total Policies", "description", "blue", "All policy records on the platform."),
      card("draft_policies", "Draft Policies", "edit_note", "orange", "Policies currently in draft status."),
      card("approved_policies", "Approved Policies", "check_circle", "green", "Policies currently approved."),
      card("total_schemes", "Total Schemes", "account_balance", "blue", "All scheme records on the platform."),
      card("draft_schemes", "Draft Schemes", "edit_note", "orange", "Schemes currently in draft status."),
      card("approved_schemes", "Approved Schemes", "verified", "green", "Schemes currently approved."),
    ];
  }

  get trendSeries(): LineSeries[] {
    const t = this.data?.trends;
    if (!t) {
      return [];
    }
    return [
      { key: "policies", label: "Policies", color: "#1461a0", values: t.policies },
      { key: "schemes", label: "Schemes", color: "#17833d", values: t.schemes },
    ];
  }

  get policyVsSchemeSlices(): { label: string; count: number; color: string }[] {
    return (this.data?.policy_vs_scheme ?? []).map((r, i) => ({
      label: r.label,
      count: r.count,
      color: i === 0 ? "#1461a0" : "#17833d",
    }));
  }

  private statusSlices(record: Record<string, number> | undefined): {
    label: string;
    count: number;
    color: string;
    description?: string;
  }[] {
    if (!record) {
      return [];
    }
    return Object.entries(record)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        label: this.pretty(status),
        count,
        color: STATUS_COLORS[status] ?? "#64748b",
        description: `${this.pretty(status)} records`,
      }));
  }

  get policyStatusSlices(): { label: string; count: number; color: string; description?: string }[] {
    return this.statusSlices(this.data?.policy_status);
  }

  get schemeStatusSlices(): { label: string; count: number; color: string; description?: string }[] {
    return this.statusSlices(this.data?.scheme_status);
  }

  get policyCategoryBars(): { label: string; value: number }[] {
    return (this.data?.policies_by_category ?? [])
      .slice(0, 8)
      .map((r) => ({ label: r.category, value: r.count }));
  }

  get schemeCategoryBars(): { label: string; value: number }[] {
    return (this.data?.schemes_by_category ?? [])
      .slice(0, 8)
      .map((r) => ({ label: r.category, value: r.count }));
  }

  get periodLabel(): string {
    return this.data ? `${this.data.window.from} to ${this.data.window.to}` : "";
  }

  downloadExcel(): void {
    if (!this.data) {
      return;
    }
    const d = this.data;
    this.showExportMenu = false;
    downloadGovtCsv(
      "PolicyGPT — Policy & Scheme Analytics",
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
          heading: "Policies by Category",
          headers: ["Category", "Count"],
          rows: d.policies_by_category.map((r) => [r.category, r.count]),
        },
        {
          heading: "Schemes by Category",
          headers: ["Category", "Count"],
          rows: d.schemes_by_category.map((r) => [r.category, r.count]),
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
