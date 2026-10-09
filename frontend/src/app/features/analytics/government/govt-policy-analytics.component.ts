import {
  ChangeDetectionStrategy,
  Component,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { GovtPolicyAnalytics } from "../../../core/services/analytics.service";
import { BreadcrumbComponent } from "../../../shared/components/breadcrumb/breadcrumb.component";
import { DateRangePickerComponent } from "../shared/date-range-picker/date-range-picker.component";
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
import { CountUpDirective } from "../../../shared/directives/count-up.directive";

@Component({
  selector: "app-govt-policy-analytics",
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
  ],
  templateUrl: "./govt-policy-analytics.component.html",
  styleUrl: "./government-analytics.scss",
})
export class GovtPolicyAnalyticsComponent extends GovAnalyticsBase {
  pageTitle = "Policy Analytics";
  pageDescription = "Policies you created: approvals, requests and distributions.";
  exportPrefix = "government_policies";

  data: GovtPolicyAnalytics | null = null;

  status = "";
  category = "";

  loadData(forceRefresh: boolean): void {
    this.subscribe(
      this.analytics.getGovernmentPolicies(
        {
          ...this.windowParams(),
          status: this.status || undefined,
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
    const pending = k["pending_requests"];
    const pendingTip =
      pending?.delete !== undefined || pending?.archive !== undefined
        ? `Your policies awaiting a decision: ${pending?.delete ?? 0} deletion, ${pending?.archive ?? 0} archival.`
        : "Your policies with outstanding deletion or archival requests.";
    return [
      card("total_policies", "Total Policies", "description", "blue", "Policies you are authorized to access (other officials' drafts and pending approvals stay hidden)."),
      card("own_policies", "Your Created Policies", "person", "green", "Policies you created, in any status."),
      card("approved_policies", "Approved Policies", "check_circle", "green", "Policies you created that have been approved."),
      card("rejected_policies", "Rejected Policies", "cancel", "orange", "Policies you created whose approval was rejected. Not deletion requests."),
      card("pending_policies", "Pending Policies", "pending_actions", "purple", "Policies you created that are awaiting an approval decision."),
      card("pending_requests", "Pending Requests", "delete", "blue", pendingTip),
      card("draft_policies", "Draft Policies", "edit_note", "orange", "Policies you created that remain in draft status."),
    ];
  }

  get trendSeries(): LineSeries[] {
    const t = this.data?.trends;
    if (!t) {
      return [];
    }
    return [
      { key: "policies", label: "Policies Created", color: "#1461a0", values: t.policies },
    ];
  }

  get statusSlices(): { label: string; count: number; color: string; description?: string }[] {
    const record = this.data?.policy_status;
    if (!record) {
      return [];
    }
    return Object.entries(record)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        label: this.pretty(status),
        count,
        color: STATUS_COLORS[status] ?? "#64748b",
        description: `${this.pretty(status)} policies you created`,
      }));
  }

  get categoryBars(): { label: string; value: number }[] {
    return (this.data?.policies_by_category ?? [])
      .slice(0, 8)
      .map((r) => ({ label: r.category, value: r.count }));
  }

  get periodLabel(): string {
    return this.data ? `${this.data.window.from} to ${this.data.window.to}` : "";
  }

  get scopeNote(): string {
    return this.data?.scope ?? "";
  }

  downloadExcel(): void {
    if (!this.data) {
      return;
    }
    const d = this.data;
    this.showExportMenu = false;
    downloadGovtCsv(
      "PolicyGPT — Policy Analytics (Your Records)",
      this.exportPrefix,
      d.window.to,
      d.window.from,
      this.kpis.map((k) => [k.label, k.value]),
      [
        {
          heading: "Active Filters",
          headers: ["Filter", "Value"],
          rows: [
            ["Status", d.filters.status ?? "All"],
            ["Category", d.filters.category ?? "All"],
          ],
        },
        {
          heading: "Policy Creation Trend",
          headers: ["Month", "Policies Created"],
          rows: d.trends.labels.map((label, i) => [
            label,
            d.trends.policies[i] ?? 0,
          ]),
        },
        {
          heading: "Policies by Status (Your Records)",
          headers: ["Status", "Count"],
          rows: Object.entries(d.policy_status).map(([s, c]) => [this.pretty(s), c]),
        },
        {
          heading: "Recent Policies (Your Records)",
          headers: ["Title", "Category", "Status", "Created"],
          rows: d.recent_policies.map((r) => [
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
