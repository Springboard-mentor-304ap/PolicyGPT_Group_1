import {
  ChangeDetectionStrategy,
  Component,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { GovtSchemeAnalytics } from "../../../core/services/analytics.service";
import { BreadcrumbComponent } from "../../../shared/components/breadcrumb/breadcrumb.component";
import { DateRangePickerComponent } from "../shared/date-range-picker/date-range-picker.component";
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import { LoadingIndicatorComponent } from "../../../shared/components/loading-indicator/loading-indicator.component";
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
  selector: "app-govt-scheme-analytics",
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
    SearchableSelectComponent,
    LoadingIndicatorComponent,
  ],
  templateUrl: "./govt-scheme-analytics.component.html",
  styleUrl: "./government-analytics.scss",
})
export class GovtSchemeAnalyticsComponent extends GovAnalyticsBase {
  pageTitle = "Scheme Analytics";
  pageDescription = "Schemes you created: approvals, requests and distributions.";
  exportPrefix = "government_schemes";

  data: GovtSchemeAnalytics | null = null;

  status = "";
  category = "";

  /** PolicyGPT dropdown options: status values shown pretty, category raw. */
  get statusFilterOptions(): { value: string; label: string }[] {
    return (this.data?.filter_options.statuses ?? []).map((s) => ({
      value: s,
      label: this.pretty(s),
    }));
  }

  get categoryFilterOptions(): { value: string; label: string }[] {
    return (this.data?.filter_options.categories ?? []).map((c) => ({
      value: c,
      label: c,
    }));
  }

  loadData(forceRefresh: boolean): void {
    this.subscribe(
      this.analytics.getGovernmentSchemes(
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
        ? `Your schemes awaiting a decision: ${pending?.delete ?? 0} deletion, ${pending?.archive ?? 0} archival.`
        : "Your schemes with outstanding deletion or archival requests.";
    return [
      card("total_schemes", "Total Schemes", "account_balance", "blue", "Schemes you are authorized to access (other officials' drafts and pending approvals stay hidden)."),
      card("own_schemes", "Your Created Schemes", "person", "green", "Schemes you created, in any status."),
      card("approved_schemes", "Approved Schemes", "verified", "green", "Schemes you created that have been approved."),
      card("rejected_schemes", "Rejected Schemes", "cancel", "orange", "Schemes you created whose approval was rejected. Not deletion requests."),
      card("pending_schemes", "Pending Schemes", "pending_actions", "purple", "Schemes you created that are awaiting an approval decision."),
      card("pending_requests", "Pending Requests", "delete", "blue", pendingTip),
      card("draft_schemes", "Draft Schemes", "edit_note", "orange", "Schemes you created that remain in draft status."),
    ];
  }

  get trendSeries(): LineSeries[] {
    const t = this.data?.trends;
    if (!t) {
      return [];
    }
    return [
      { key: "schemes", label: "Schemes Created", color: "#17833d", values: t.schemes },
    ];
  }

  get statusSlices(): { label: string; count: number; color: string; description?: string }[] {
    const record = this.data?.scheme_status;
    if (!record) {
      return [];
    }
    return Object.entries(record)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        label: this.pretty(status),
        count,
        color: STATUS_COLORS[status] ?? "#64748b",
        description: `${this.pretty(status)} schemes you created`,
      }));
  }

  get categoryBars(): { label: string; value: number }[] {
    return (this.data?.schemes_by_category ?? [])
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
      "PolicyGPT — Scheme Analytics (Your Records)",
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
          heading: "Scheme Creation Trend",
          headers: ["Month", "Schemes Created"],
          rows: d.trends.labels.map((label, i) => [
            label,
            d.trends.schemes[i] ?? 0,
          ]),
        },
        {
          heading: "Schemes by Status (Your Records)",
          headers: ["Status", "Count"],
          rows: Object.entries(d.scheme_status).map(([s, c]) => [this.pretty(s), c]),
        },
        {
          heading: "Recent Schemes (Your Records)",
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
