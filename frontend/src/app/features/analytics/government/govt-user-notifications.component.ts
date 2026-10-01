import {
  ChangeDetectionStrategy,
  Component,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { GovtUserNotifications } from "../../../core/services/analytics.service";
import { BreadcrumbComponent } from "../../../shared/components/breadcrumb/breadcrumb.component";
import {
  AnalyticsDonutChartComponent,
  AnalyticsGroupedBarChartComponent,
  AnalyticsHBarChartComponent,
  AnalyticsLineChartComponent,
  GroupedBarSeries,
  LineSeries,
} from "../shared/analytics-charts.component";
import {
  downloadGovtCsv,
  printAnalyticsPdf,
} from "../shared/analytics-export";
import {
  GovAnalyticsBase,
  GovtKpiCard,
  ROLE_COLORS,
} from "./gov-analytics-base";

@Component({
  selector: "app-govt-user-notifications",
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
  ],
  templateUrl: "./govt-user-notifications.component.html",
  styleUrl: "./government-analytics.scss",
})
export class GovtUserNotificationsComponent extends GovAnalyticsBase {
  pageTitle = "User & Notification Statistics";
  pageDescription = "User accounts and notification delivery in your scope.";
  exportPrefix = "government_user_notifications";

  data: GovtUserNotifications | null = null;

  role = "";
  channel = "";

  loadData(forceRefresh: boolean): void {
    this.subscribe(
      this.analytics.getGovernmentUserNotifications(
        {
          ...this.windowParams(),
          role: this.role || undefined,
          channel: this.channel || undefined,
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
      card("total_users", "Total Users", "group", "blue", "All registered user accounts."),
      card("citizens", "Citizens", "person", "green", "Registered citizen accounts."),
      card("researchers", "Researchers", "science", "orange", "Registered researcher accounts."),
      card("organizations", "Organizations", "business", "purple", "Registered organization accounts."),
      card("government_officials", "Government Officials", "account_balance", "blue", "Registered government official accounts."),
      card("administrators", "Administrators", "admin_panel_settings", "green", "Administrator accounts."),
    ];
  }

  get growthSeries(): LineSeries[] {
    const t = this.data?.growth_trend;
    if (!t) {
      return [];
    }
    return [
      { key: "total", label: "New Users", color: "#1461a0", values: t.total },
    ];
  }

  get roleSlices(): { label: string; count: number; color: string; description?: string }[] {
    return (this.data?.users_by_role ?? []).map((r) => ({
      label: this.pretty(r.role),
      count: r.count,
      color: ROLE_COLORS[r.role] ?? "#64748b",
      description: `${this.pretty(r.role)} accounts`,
    }));
  }

  get stateBars(): { label: string; value: number }[] {
    return (this.data?.users_by_state ?? [])
      .slice(0, 8)
      .map((r) => ({ label: r.state, value: r.count }));
  }

  get registrationSeries(): GroupedBarSeries[] {
    const t = this.data?.growth_trend;
    if (!t) {
      return [];
    }
    return t.by_role.map((r) => ({
      label: this.pretty(r.role),
      color: ROLE_COLORS[r.role] ?? "#64748b",
      values: r.values,
    }));
  }

  get activeBars(): { label: string; value: number }[] {
    return (this.data?.active_by_role ?? []).map((r) => ({
      label: this.pretty(r.role),
      value: r.count,
    }));
  }

  get channelGrouped(): { categories: string[]; series: GroupedBarSeries[] } {
    const rows = this.data?.notifications_by_channel ?? [];
    return {
      categories: rows.map((r) => this.pretty(r.channel)),
      series: [
        { label: "Sent", color: "#1461a0", values: rows.map((r) => r.total) },
        { label: "Read", color: "#17833d", values: rows.map((r) => r.read) },
      ],
    };
  }

  get typeBars(): { label: string; value: number }[] {
    return (this.data?.notifications_by_type ?? [])
      .slice(0, 8)
      .map((r) => ({ label: this.pretty(r.type), value: r.count }));
  }

  get channelSlices(): { label: string; count: number; color: string; description?: string }[] {
    const palette = ["#1461a0", "#17833d", "#c26a00", "#7e22ce", "#0e7490"];
    return (this.data?.notifications_by_channel ?? []).map((r, i) => ({
      label: this.pretty(r.channel),
      count: r.total,
      color: palette[i % palette.length],
      description: `${r.total} sent, ${r.read} read`,
    }));
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
      "PolicyGPT — User & Notification Statistics",
      this.exportPrefix,
      d.window.to,
      d.window.from,
      this.kpis.map((k) => [k.label, k.value]),
      [
        {
          heading: "User Growth Trend",
          headers: ["Month", "New Users"],
          rows: d.growth_trend.labels.map((label, i) => [
            label,
            d.growth_trend.total[i] ?? 0,
          ]),
        },
        {
          heading: "Notifications by Type",
          headers: ["Type", "Count"],
          rows: d.notifications_by_type.map((r) => [r.type, r.count]),
        },
        {
          heading: "Recent Users",
          headers: ["Name", "Role", "State", "Status", "Registered"],
          rows: d.recent_users.map((u) => [
            u.full_name,
            u.role,
            u.state ?? "",
            u.is_active ? "Active" : "Inactive",
            u.created_at ?? "",
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
