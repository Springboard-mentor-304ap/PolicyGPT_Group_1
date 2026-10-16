import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { AnalyticsService } from "../../../../../../core/services/analytics.service";
import { BreadcrumbComponent, BreadcrumbItem } from "../../../../../../shared/components/breadcrumb/breadcrumb.component";

interface DashboardAnalytics {
  policies: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    archived: number;
  };
  schemes: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    archived: number;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
  };
}

interface PolicyAnalytics {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  archived: number;
  by_category: { category: string; count: number }[];
  by_state: { state: string; count: number }[];
  by_ministry: { ministry: string; count: number }[];
  monthly_trend: any[];
}

interface SchemeAnalytics {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  archived: number;
  by_category: { category: string; count: number }[];
  by_state: { state: string; count: number }[];
  by_ministry: { ministry: string; count: number }[];
  monthly_trend: any[];
}

interface UserAnalytics {
  total_users: number;
  active_users: number;
  inactive_users: number;
  by_role: { role: string; count: number }[];
  by_state: { state: string; count: number }[];
}

@Component({
  selector: "app-admin-analytics",
  standalone: true,
  imports: [CommonModule, BreadcrumbComponent],
  templateUrl: "./admin-analytics.component.html",
  styleUrls: ["./admin-analytics.component.scss"],
})
export class AdminAnalyticsComponent implements OnInit {
  // private readonly apiUrl = "http://localhost:8000";

  loading = true;
  errorMessage = "";

  dashboard: DashboardAnalytics | null = null;
  policies: PolicyAnalytics | null = null;
  schemes: SchemeAnalytics | null = null;
  users: UserAnalytics | null = null;

  policyTrend: any[] = [];
  schemeCategories: { category: string; count: number }[] = [];
  userRoles: { role: string; count: number }[] = [];

  totalNotifications = 0;
  recentNotifications: any[] = [];

  activityAvailable = false;
  recentUserActivity: any[] = [];

  get breadcrumbItems(): BreadcrumbItem[] {
    return [{ label: "Home", route: ["/dashboard/admin"] }, { label: "Analytics" }];
  }

  constructor(private readonly analyticsService: AnalyticsService) {}

  ngOnInit(): void {
    this.loadAnalytics();
  }

  // =========================================================
  // LOAD ANALYTICS
  // =========================================================

  loadAnalytics(): void {
    this.loading = true;
    this.errorMessage = "";

    // -------------------------
    // Dashboard
    // -------------------------
    this.analyticsService.getDashboardAnalytics().subscribe({
      next: (data) => {
        this.dashboard = data;
        this.loading = false;
      },
      error: (error) => {
        console.error(
            "❌ DASHBOARD ERROR:",
            error
          );
          this.loading = false;
        },
      });

    // -------------------------
    // Policies
    // -------------------------
    this.analyticsService.getPolicyAnalytics().subscribe({
      next: (data) => {
          this.policies = data;
          this.policyTrend =
            data?.monthly_trend ?? [];
        },
        error: (error) => {
          console.error(
            "❌ POLICIES ERROR:",
            error
          );
        },
      });

    // -------------------------
    // Schemes
    // -------------------------
    this.analyticsService.getSchemeAnalytics().subscribe({
      next: (data) => {
          this.schemes = data;
          this.schemeCategories =
            data?.by_category ?? [];
        },
        error: (error) => {
          console.error(
            "❌ SCHEMES ERROR:",
            error
          );
        },
      });

    // -------------------------
    // Users
    // -------------------------
    this.analyticsService.getUserAnalytics().subscribe({
      next: (data) => {
          this.users = data;
          this.userRoles =
            data?.by_role ?? [];
        },
        error: (error) => {
          console.error(
            "❌ USERS ERROR:",
            error
          );
        },
      });


    // -------------------------
    // Notifications
    // -------------------------
    this.analyticsService.getNotifications().subscribe({
  next: (data) => {
  this.totalNotifications = data.length ?? 0;
  this.recentNotifications = data;
  },
      error: (error) => {
          console.error(
            "❌ NOTIFICATIONS ERROR:",
            error
          );
        },
      });

    // -------------------------
    // Audit Logs / Activity
    // -------------------------

    this.activityAvailable = false;
    // this.recentUserActivity = [];
  }

  // =========================================================
  // REFRESH
  // =========================================================

  refresh(): void {
    this.loadAnalytics();
  }

  // =========================================================
  // USER COUNTS
  // =========================================================

  get totalUsers(): number {
    return (
      this.dashboard?.users?.total ??
      this.users?.total_users ??
      0
    );
  }

  get activeUsers(): number {
    return (
      this.dashboard?.users?.active ??
      this.users?.active_users ??
      0
    );
  }

  get inactiveUsers(): number {
    return (
      this.dashboard?.users?.inactive ??
      this.users?.inactive_users ??
      0
    );
  }

  // =========================================================
  // POLICY COUNTS
  // =========================================================

  get totalPolicies(): number {
    return (
      this.dashboard?.policies?.total ??
      this.policies?.total ??
      0
    );
  }

  get approvedPolicies(): number {
    return (
      this.dashboard?.policies?.approved ??
      this.policies?.approved ??
      0
    );
  }

  get pendingPolicies(): number {
    return (
      this.dashboard?.policies?.pending ??
      this.policies?.pending ??
      0
    );
  }

  get rejectedPolicies(): number {
    return (
      this.dashboard?.policies?.rejected ??
      this.policies?.rejected ??
      0
    );
  }

  // =========================================================
  // SCHEME COUNTS
  // =========================================================

  get totalSchemes(): number {
    return (
      this.dashboard?.schemes?.total ??
      this.schemes?.total ??
      0
    );
  }

  get activeSchemes(): number {
    return (
      this.dashboard?.schemes?.approved ??
      this.schemes?.approved ??
      0
    );
  }

  get approvedSchemes(): number {
    return (
      this.dashboard?.schemes?.approved ??
      this.schemes?.approved ??
      0
    );
  }

  get pendingSchemes(): number {
    return (
      this.dashboard?.schemes?.pending ??
      this.schemes?.pending ??
      0
    );
  }

  get rejectedSchemes(): number {
    return (
      this.dashboard?.schemes?.rejected ??
      this.schemes?.rejected ??
      0
    );
  }

  // =========================================================
  // TREND CHART
  // =========================================================

  get policyTrendPoints(): string {
    return this.createTrendPoints(
      this.policyTrend,
      "count"
    );
  }

  getApprovedTrendPoints(): string {
    return this.createTrendPoints(this.policyTrend, "approved");
  }

  getPendingTrendPoints(): string {
    return this.createTrendPoints(this.policyTrend, "pending");
  }

  getRejectedTrendPoints(): string {
    return this.createTrendPoints(this.policyTrend, "rejected");
  }

  getApprovedCurvePath(): string {
    return this.createTrendCurvePath(this.policyTrend, "approved");
  }

  getPendingCurvePath(): string {
    return this.createTrendCurvePath(this.policyTrend, "pending");
  }

  getRejectedCurvePath(): string {
    return this.createTrendCurvePath(this.policyTrend, "rejected");
  }

  getTrendYForField(item: any, field: string): number {
    if (!item) return 115;
    const value = Number(item?.[field] ?? 0);
    const values = this.policyTrend.map((trend: any) =>
      Math.max(
        Number(trend?.approved ?? 0),
        Number(trend?.pending ?? 0),
        Number(trend?.rejected ?? 0),
        Number(trend?.count ?? 0)
      )
    );
    const max = Math.max(...values, 1);
    const height = 120;
    const padding = 5;
    return height - padding - (value / max) * (height - padding * 2);
  }

  private createTrendCurvePath(data: any[], field: string): string {
    if (!data || data.length === 0) return "";
    const values = data.map((item: any) => Number(item?.[field] ?? 0));
    const allValues = data.map((item: any) =>
      Math.max(
        Number(item?.approved ?? 0),
        Number(item?.pending ?? 0),
        Number(item?.rejected ?? 0),
        Number(item?.count ?? 0)
      )
    );
    const max = Math.max(...allValues, 1);
    const width = 290;
    const height = 120;
    const paddingX = 5;
    const paddingY = 5;

    const pts = values.map((val, idx) => ({
      x: values.length === 1 ? width / 2 : paddingX + (idx * (width - paddingX * 2)) / (values.length - 1),
      y: height - paddingY - (val / max) * (height - paddingY * 2)
    }));

    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    if (pts.length === 2) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;

    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    const tension = 0.18;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  private createTrendPoints(
    data: any[],
    field: string
  ): string {
    if (!data || data.length === 0) {
      return "";
    }

    const values = data.map((item: any) => {
      if (field === "count") {
        return Number(
          item?.count ??
          item?.total ??
          item?.value ??
          0
        );
      }

      return Number(item?.[field] ?? 0);
    });

    const max = Math.max(...values, 1);

    const width = 290;
    const height = 120;
    const paddingX = 5;
    const paddingY = 5;

    return values
      .map((value, index) => {
        const x =
          values.length === 1
            ? width / 2
            : paddingX +
              (index *
                (width - paddingX * 2)) /
                (values.length - 1);

        const y =
          height -
          paddingY -
          (value / max) *
            (height - paddingY * 2);

        return `${x},${y}`;
      })
      .join(" ");
  }

  getTrendX(index: number): number {
    const count = this.policyTrend.length;

    if (count <= 1) {
      return 145;
    }

    const width = 290;
    const padding = 5;

    return (
      padding +
      (index *
        (width - padding * 2)) /
        (count - 1)
    );
  }

  getTrendY(item: any): number {
    if (!item) {
      return 115;
    }

    const value = Number(
      item.approved ??
      item.count ??
      item.total ??
      item.value ??
      0
    );

    const values = this.policyTrend.map(
      (trend: any) =>
        Number(
          trend?.approved ??
          trend?.count ??
          trend?.total ??
          trend?.value ??
          0
        )
    );

    const max = Math.max(...values, 1);

    const height = 120;
    const padding = 5;

    return (
      height -
      padding -
      (value / max) *
        (height - padding * 2)
    );
  }

  getTrendMonth(
    item: any,
    index: number
  ): string {
    if (!item) {
      return "";
    }

    const month =
      item.month ??
      item.month_name ??
      item.label ??
      item.period ??
      item.date;

    if (month) {
      const parsed = new Date(month);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(
          "en-US",
          {
            month: "short",
          }
        );
      }

      return String(month).substring(0, 3);
    }

    const fallbackMonths = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    return fallbackMonths[index] ?? "";
  }

  // =========================================================
  // SCHEME DONUT
  // =========================================================

  getSchemeDonutBackground(): string {
    if (
      !this.schemeCategories ||
      this.schemeCategories.length === 0
    ) {
      return "conic-gradient(#e5e7eb 0deg 360deg)";
    }

    const total =
      this.schemeCategories.reduce(
        (sum, item) =>
          sum + Number(item.count || 0),
        0
      );

    if (total <= 0) {
      return "conic-gradient(#e5e7eb 0deg 360deg)";
    }

    const colors = [
      "#6366f1",
      "#55bd91",
      "#e6b24d",
      "#e95e67",
      "#8b5cf6",
      "#38bdf8",
    ];

    let currentDegree = 0;

    const segments =
      this.schemeCategories.map(
        (item, index) => {
          const percentage =
            Number(item.count || 0) /
            total;

          const degrees =
            percentage * 360;

          const start = currentDegree;
          const end =
            currentDegree + degrees;

          currentDegree = end;

          return `${colors[index % colors.length]} ${start}deg ${end}deg`;
        }
      );

    return `conic-gradient(${segments.join(
      ", "
    )})`;
  }

  // =========================================================
  // USER DONUT
  // =========================================================

  getUserDonutBackground(): string {
    if (
      !this.userRoles ||
      this.userRoles.length === 0
    ) {
      return "conic-gradient(#e5e7eb 0deg 360deg)";
    }

    const total =
      this.userRoles.reduce(
        (sum, item) =>
          sum + Number(item.count || 0),
        0
      );

    if (total <= 0) {
      return "conic-gradient(#e5e7eb 0deg 360deg)";
    }

    const colors = [
      "#6366f1",
      "#55bd91",
      "#e6b24d",
      "#e95e67",
      "#8b5cf6",
    ];

    let currentDegree = 0;

    const segments =
      this.userRoles.map(
        (item, index) => {
          const percentage =
            Number(item.count || 0) /
            total;

          const degrees =
            percentage * 360;

          const start = currentDegree;
          const end =
            currentDegree + degrees;

          currentDegree = end;

          return `${colors[index % colors.length]} ${start}deg ${end}deg`;
        }
      );

    return `conic-gradient(${segments.join(
      ", "
    )})`;
  }

  // =========================================================
  // PERCENTAGES
  // =========================================================

  getPercentage(
    value: number,
    total: number
  ): number {
    if (!total || total <= 0) {
      return 0;
    }

    return Math.round(
      (value / total) * 100
    );
  }

  getCategoryPercentage(
    count: number
  ): number {
    const total =
      this.schemeCategories.reduce(
        (sum, item) =>
          sum + Number(item.count || 0),
        0
      );

    return this.getPercentage(
      count,
      total
    );
  }

  getRolePercentage(
    count: number
  ): number {
    const total =
      this.userRoles.reduce(
        (sum, item) =>
          sum + Number(item.count || 0),
        0
      );

    return this.getPercentage(
      count,
      total
    );
  }

  // =========================================================
  // ROLE FORMATTING
  // =========================================================

  formatRole(role: string): string {
    if (!role) {
      return "Unknown";
    }

    return role
      .toLowerCase()
      .split("_")
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1)
      )
      .join(" ");
  }

  // =========================================================
  // DATE FORMATTING
  // =========================================================

  formatDate(date?: string): string {
    if (!date) {
      return "—";
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  // =========================================================
  // NOTIFICATIONS
  // =========================================================

  getNotificationTitle(
    notification: any
  ): string {
    return (
      notification?.title ??
      "Notification"
    );
  }

  getNotificationType(
    notification: any
  ): string {
    return (
      notification?.type ??
      "General"
    );
  }

  getNotificationDate(
    notification: any
  ): string {
    return this.formatDate(
      notification?.created_at
    );
  }

  getNotificationStatus(
    notification: any
  ): string {
    return notification?.is_read === true
      ? "Read"
      : "Unread";
  }
}
