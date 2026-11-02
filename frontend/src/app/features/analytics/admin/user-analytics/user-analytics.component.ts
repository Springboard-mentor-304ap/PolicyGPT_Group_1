import { ChangeDetectorRef, Component, HostListener, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { finalize } from "rxjs";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import {
  DateRangePickerComponent,
  type DateRangeSelection,
} from "../../shared/date-range-picker/date-range-picker.component";
import {
  selectionForCustom,
  selectionForLabel,
} from "../../shared/analytics-date-range.service";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import { HbarChartComponent } from "../../shared/hbar-chart/hbar-chart.component";
import { VbarChartComponent } from "../../shared/vbar-chart/vbar-chart.component";
import {
  UserKpiCard,
  EngagementMetric,
  HeatmapCell,
  RecentRegisteredUser,
  TopActiveUser,
} from "../models/admin-analytics.models";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";
import { AnalyticsDateRangeService } from "../../shared/analytics-date-range.service";
import { SearchableSelectComponent } from "../../../../shared/components/searchable-select/searchable-select.component";
import { BreadcrumbComponent, BreadcrumbItem } from "../../../../shared/components/breadcrumb/breadcrumb.component";

@Component({
  selector: "app-user-analytics",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BreadcrumbComponent,
    DateRangePickerComponent,
    LineChartComponent,
    DoughnutChartComponent,
    HbarChartComponent,
    VbarChartComponent,
    CountUpDirective,
    SearchableSelectComponent,
  ],
  templateUrl: "./user-analytics.component.html",
  styleUrl: "./user-analytics.component.scss",
})
export class UserAnalyticsComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly rangeService = inject(AnalyticsDateRangeService);

  readonly isSampleData = this.dataService.isSampleData;

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: "Home", route: ["/dashboard/admin"] },
      { label: "Analytics", route: ["/dashboard/admin/analytics"] },
      { label: "User Analytics" },
    ];
  }

  // Selected date range
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  isDownloading = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);

  // KPI Cards (pre-populated so the final layout renders immediately;
  // live API values replace these defaults when the response arrives).
  // Admins/Citizens counts come from role_distribution in the same response.
  kpis = signal<UserKpiCard[]>([
    {
      label: "Total Users",
      value: "0",
      change: "",
      isPositive: true,
      icon: "people",
      iconClass: "blue",
    },
    {
      label: "Active Users",
      value: "0",
      change: "",
      isPositive: true,
      icon: "person",
      iconClass: "green",
    },
    {
      label: "New Users",
      value: "0",
      change: "",
      isPositive: true,
      icon: "person_add",
      iconClass: "orange",
    },
    {
      label: "Govt. Officials",
      value: "0",
      change: "",
      isPositive: true,
      icon: "badge",
      iconClass: "purple",
    },
    {
      label: "Organizations",
      value: "0",
      change: "",
      isPositive: true,
      icon: "business",
      iconClass: "teal",
    },
    {
      label: "Researchers",
      value: "0",
      change: "",
      isPositive: true,
      icon: "science",
      iconClass: "pink",
    },
    {
      label: "Admins",
      value: "0",
      change: "",
      isPositive: true,
      icon: "admin_panel_settings",
      iconClass: "red",
    },
    {
      label: "Citizens",
      value: "0",
      change: "",
      isPositive: true,
      icon: "groups",
      iconClass: "blue-light",
    },
  ]);

  // User Growth Trend
  growthPeriod = signal<string>("Last 12 Months");
  growthPeriodOptions = ["Last 3 Months", "Last 6 Months", "Last 12 Months"];
  showGrowthMenu = signal<boolean>(false);
  growthLabels = signal<string[]>([]);
  growthDatasets = signal<LineDataset[]>([]);

  // User Distribution by Role
  roleLabels = signal<string[]>([]);
  roleData = signal<number[]>([]);
  roleColors = signal<string[]>([]);
  roleTotal = signal<string>("0");

  // User Registration Trend
  regPeriod = signal<string>("Last 6 Months");
  regPeriodOptions = ["Last 3 Months", "Last 6 Months"];
  showRegMenu = signal<boolean>(false);
  regLabels = signal<string[]>([]);
  regValues = signal<number[]>([]);

  // Users by State
  selectedStateOption = signal<string>("Top 10 States");
  stateOptions = [
    { label: "Top 5 States", count: 5 },
    { label: "Top 10 States", count: 10 },
    { label: "All States", count: 15 },
  ];
  showStateMenu = signal<boolean>(false);
  stateLabels = signal<string[]>([]);
  stateValues = signal<number[]>([]);

  // User Engagement Metrics (4 cards, pre-populated with defaults so the
  // final layout renders immediately; live values replace them on load).
  engagementMetrics = signal<EngagementMetric[]>([
    {
      label: "Total Logins",
      value: "0",
      change: "",
      isPositive: true,
      icon: "login",
      iconClass: "blue",
    },
    {
      label: "Search Queries",
      value: "0",
      change: "",
      isPositive: true,
      icon: "search",
      iconClass: "purple",
    },
    {
      label: "Reports Generated",
      value: "0",
      change: "",
      isPositive: true,
      icon: "description",
      iconClass: "orange",
    },
    {
      label: "Notifications Sent",
      value: "0",
      change: "",
      isPositive: true,
      icon: "notifications",
      iconClass: "green",
    },
  ]);

  // User Activity Heatmap
  heatmapPeriod = signal<string>("Last 4 Weeks");
  heatmapPeriodOptions = ["Last 2 Weeks", "Last 4 Weeks", "Last 8 Weeks"];
  showHeatmapMenu = signal<boolean>(false);
  heatmapDays = signal<string[]>([]);
  heatmapTimes = signal<string[]>([]);
  heatmapCells = signal<HeatmapCell[]>([]);
  hoveredCell = signal<HeatmapCell | null>(null);

  // Tables
  recentUsers = signal<RecentRegisteredUser[]>([]);
  topActiveUsers = signal<TopActiveUser[]>([]);

  /**
   * Reload generation: only the latest loadAllData call may touch state
   * so a slow older response can never overwrite newer filter data.
   */
  private loadSeq = 0;

  // "View All" Modals
  activeModal = signal<"recent" | "active" | null>(null);
  modalSearchTerm = signal<string>("");
  modalRoleFilter = signal<string>("ALL");

  // =========================================================
  // FILTER PANEL (Policy Analytics styling; staged selections
  // applied explicitly via Apply, cleared via Reset).
  //
  // Backend honesty note: GET /analytics/admin/users accepts only
  // growth/reg/state/heatmap periods plus the global start/end
  // window — it has NO role/status/search params. Role, status and
  // search are therefore scoped client-side from this same
  // response (role shares from the per-role growth series, status
  // from the windowed active/total counts, search across the
  // returned user rows). Anything that cannot be scoped is shown
  // as "—" with an explanatory tooltip instead of a fabricated
  // number. Registration-date presets reuse the shared
  // rangeService flow, so they refetch server-windowed data like
  // the header picker.
  // =========================================================

  readonly roleOptions = [
    { value: "ALL", label: "All Roles" },
    { value: "CITIZEN", label: "Citizen" },
    { value: "GOVERNMENT_OFFICIAL", label: "Government Official" },
    { value: "ADMINISTRATOR", label: "Administrator" },
    { value: "RESEARCHER", label: "Researcher" },
    { value: "ORGANIZATION", label: "Organization" },
    { value: "GUEST", label: "Guest" },
  ];
  readonly statusOptions = [
    { value: "ALL", label: "All Statuses" },
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" },
  ];
  readonly dateOptions = [
    "All Dates",
    "Last 7 Days",
    "Last 30 Days",
    "Last 6 Months",
    "Last 12 Months",
    "Custom",
  ];
  readonly modalRoleOptions = [
    { value: "ALL", label: "All Roles" },
    { value: "Citizen", label: "Citizen" },
    { value: "Govt. Official", label: "Govt. Official" },
    { value: "Researcher", label: "Researcher" },
    { value: "Organization", label: "Organization" },
    { value: "Administrator", label: "Administrator" },
  ];

  // Staged (dropdown/input) selections.
  fRole = signal<string>("ALL");
  fStatus = signal<string>("ALL");
  fDate = signal<string>("Last 12 Months");
  fCustomFrom = signal<string>("");
  fCustomTo = signal<string>("");
  fSearch = signal<string>("");
  filterError = signal<string | null>(null);

  // Applied selections (drive the visible views).
  aRole = signal<string>("ALL");
  aStatus = signal<string>("ALL");
  aSearch = signal<string>("");

  /** Active (non-default) filter summary for tooltips/empty states. */
  filtersActive = computed(
    () => this.aRole() !== "ALL" || this.aStatus() !== "ALL" || this.aSearch().trim() !== "",
  );

  // ---------- filtered views (default = raw response, unchanged) ----------

  /** Growth series scoped to the applied role (all series by default). */
  visibleGrowthDatasets = computed<LineDataset[]>(() => {
    const all = this.growthDatasets();
    if (this.aRole() === "ALL") return all;
    return all.filter((s) => canonicalUserRole(s.label) === this.aRole());
  });

  /** Role donut scoped to the applied role (all slices by default). */
  visibleRoleLabels = computed<string[]>(() => {
    if (this.aRole() === "ALL") return this.roleLabels();
    return this.roleLabels().filter((l) => canonicalUserRole(l) === this.aRole());
  });

  visibleRoleData = computed<number[]>(() => {
    const labels = this.roleLabels();
    const data = this.roleData();
    if (this.aRole() === "ALL") return data;
    return labels
      .map((l, i) => ({ l, v: data[i] ?? 0 }))
      .filter((r) => canonicalUserRole(r.l) === this.aRole())
      .map((r) => r.v);
  });

  visibleRoleColors = computed<string[]>(() => {
    const labels = this.roleLabels();
    const colors = this.roleColors();
    if (this.aRole() === "ALL") return colors;
    return labels
      .map((l, i) => ({ l, c: colors[i] ?? "#64748b" }))
      .filter((r) => canonicalUserRole(r.l) === this.aRole())
      .map((r) => r.c);
  });

  visibleRoleTotal = computed<string>(() => {
    if (this.aRole() === "ALL" && this.aStatus() === "ALL") return this.roleTotal();
    if (this.aRole() !== "ALL" && this.aStatus() === "ALL") {
      return fmtCount(this.visibleRoleData().reduce((s, v) => s + v, 0));
    }
    // Status-scoped donut composition is not tracked by the backend.
    return "—";
  });

  /**
   * KPI cards scoped to the applied role/status. Role shares come from
   * the windowed per-role growth series (same source as the growth
   * chart, so totals stay consistent); status shares come from the
   * windowed active/total counts. Combinations the dataset cannot back
   * render as "—" with a tooltip — never a fabricated value.
   */
  visibleKpis = computed<UserKpiCard[]>(() => {
    const raw = this.kpis();
    const role = this.aRole();
    const status = this.aStatus();
    if (role === "ALL" && status === "ALL") return raw;
    const withTitle = (k: UserKpiCard, title: string): UserKpiCard => ({ ...k, title });
    const blank = (k: UserKpiCard, title: string): UserKpiCard =>
      withTitle({ ...k, value: "—", change: "" }, title);
    const num = (v: string): number => Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
    const find = (label: string): UserKpiCard | undefined =>
      raw.find((k) => k.label === label);

    if (role !== "ALL" && status === "ALL") {
      const sums = this.roleSeriesSums();
      const scoped = (key: string): number => sums.get(key) ?? 0;
      return raw.map((k) => {
        switch (k.label) {
          case "Total Users":
            return withTitle(
              { ...k, value: fmtCount(scoped(role)), change: "" },
              `Registered ${this.roleDisplayName(role)} in the selected window.`,
            );
          case "New Users":
            return withTitle(
              { ...k, value: fmtCount(scoped(role)), change: "" },
              `Registered ${this.roleDisplayName(role)} in the selected window.`,
            );
          case "Active Users":
            return blank(k, "Active status is not tracked per role by the backend.");
          case "Govt. Officials":
            return withTitle(
              { ...k, value: fmtCount(scoped("GOVERNMENT_OFFICIAL")), change: "" },
              "Registered government officials in the selected window.",
            );
          case "Organizations":
            return withTitle(
              { ...k, value: fmtCount(scoped("ORGANIZATION")), change: "" },
              "Registered organizations in the selected window.",
            );
          case "Researchers":
            return withTitle(
              { ...k, value: fmtCount(scoped("RESEARCHER")), change: "" },
              "Registered researchers in the selected window.",
            );
          case "Admins":
            return withTitle(
              { ...k, value: fmtCount(scoped("ADMINISTRATOR")), change: "" },
              "Registered administrators in the selected window.",
            );
          case "Citizens":
            return withTitle(
              { ...k, value: fmtCount(scoped("CITIZEN")), change: "" },
              "Registered citizens in the selected window.",
            );
          default:
            return blank(k, "Not scoped by the applied filters.");
        }
      });
    }

    // Status scope (with or without a role): only headline registration
    // totals can be scoped — active/inactive is not tracked per role or
    // per series by the backend.
    const total = num(find("Total Users")?.value ?? "0");
    const active = num(find("Active Users")?.value ?? "0");
    const scoped = status === "ACTIVE" ? active : Math.max(0, total - active);
    const statusName = status === "ACTIVE" ? "Active" : "Inactive";
    return raw.map((k) => {
      if (k.label === "Total Users") {
        return withTitle(
          { ...k, value: fmtCount(scoped), change: "" },
          `${statusName} users registered in the selected window.`,
        );
      }
      if (k.label === "Active Users" && status === "ACTIVE") {
        return withTitle({ ...k, change: "" }, "Active users registered in the selected window.");
      }
      return blank(
        k,
        role !== "ALL"
          ? "Role and status cannot be combined: activity by role and status is not tracked by the backend."
          : "Only headline totals can be scoped by account status with the available data.",
      );
    });
  });

  /** Recent users scoped by applied role + search (top-5 in template). */
  visibleRecentUsers = computed<RecentRegisteredUser[]>(() => {
    let list = this.recentUsers();
    const role = this.aRole();
    if (role !== "ALL") {
      list = list.filter((u) => canonicalUserRole(u.role) === role);
    }
    const q = this.aSearch().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.state.toLowerCase().includes(q),
      );
    }
    return list;
  });

  /** Top active users scoped by applied role + search (top-5 in template). */
  visibleTopActiveUsers = computed<TopActiveUser[]>(() => {
    let list = this.topActiveUsers();
    const role = this.aRole();
    if (role !== "ALL") {
      list = list.filter((u) => canonicalUserRole(u.role) === role);
    }
    const q = this.aSearch().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  /** Windowed per-role registration totals from the growth series. */
  private roleSeriesSums(): Map<string, number> {
    const sums = new Map<string, number>();
    for (const s of this.growthDatasets()) {
      const key = canonicalUserRole(s.label);
      const total = (s.data || []).reduce((a, v) => a + (Number(v) || 0), 0);
      sums.set(key, (sums.get(key) ?? 0) + total);
    }
    return sums;
  }

  private roleDisplayName(key: string): string {
    return (
      this.roleOptions.find((o) => o.value === key)?.label.toLowerCase() ?? key.toLowerCase()
    );
  }

  // ---------- filter actions ----------

  /** Non-default applied filters merged into report parameters. */
  private activeFilterParams(): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.aRole() !== "ALL") out["role"] = this.aRole();
    if (this.aStatus() !== "ALL") out["status"] = this.aStatus();
    const q = this.aSearch().trim();
    if (q) out["search"] = q;
    return out;
  }

  onApplyFilters(): void {
    this.filterError.set(null);
    if (this.fDate() === "Custom") {
      if (!this.fCustomFrom() || !this.fCustomTo()) {
        this.filterError.set("Select both a start and an end date for the custom range.");
        return;
      }
      const sel = selectionForCustom(this.fCustomFrom(), this.fCustomTo());
      if (!sel) {
        this.filterError.set("End date cannot be before start date.");
        return;
      }
      this.aRole.set(this.fRole());
      this.aStatus.set(this.fStatus());
      this.aSearch.set(this.fSearch());
      this.onDateRangeSelect(sel);
      return;
    }
    this.aRole.set(this.fRole());
    this.aStatus.set(this.fStatus());
    this.aSearch.set(this.fSearch());
    if (this.fDate() === "All Dates") {
      // The backend is always windowed (default trailing 12 months);
      // "All Dates" restores that default window rather than implying
      // unwindowed all-time data the API cannot provide.
      this.rangeService.clear();
      this.currentRange.set(this.rangeService.label());
      this.growthPeriod.set("Last 12 Months");
      this.regPeriod.set("Last 6 Months");
      this.loadAllData();
      return;
    }
    const sel = selectionForLabel(this.fDate());
    if (sel) {
      this.onDateRangeSelect(sel);
      return;
    }
    this.cdr.markForCheck();
  }

  onResetFilters(): void {
    this.fRole.set("ALL");
    this.fStatus.set("ALL");
    this.fDate.set("Last 12 Months");
    this.fCustomFrom.set("");
    this.fCustomTo.set("");
    this.fSearch.set("");
    this.filterError.set(null);
    this.aRole.set("ALL");
    this.aStatus.set("ALL");
    this.aSearch.set("");
    this.rangeService.clear();
    this.currentRange.set(this.rangeService.label());
    this.growthPeriod.set("Last 12 Months");
    this.regPeriod.set("Last 6 Months");
    this.loadAllData();
  }

  // Computed filtered list for Recent Users modal
  filteredRecentUsers = computed(() => {
    let list = this.recentUsers();
    const query = this.modalSearchTerm().toLowerCase().trim();
    const role = this.modalRoleFilter();

    if (role !== "ALL") {
      list = list.filter((u) => u.role === role);
    }
    if (query) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          u.state.toLowerCase().includes(query),
      );
    }
    return list;
  });

  // Computed filtered list for Top Active Users modal
  filteredTopActiveUsers = computed(() => {
    let list = this.topActiveUsers();
    const query = this.modalSearchTerm().toLowerCase().trim();
    const role = this.modalRoleFilter();

    if (role !== "ALL") {
      list = list.filter((u) => u.role === role);
    }
    if (query) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          (u.email && u.email.toLowerCase().includes(query)),
      );
    }
    return list;
  });

  ngOnInit(): void {
    this.currentRange.set(this.rangeService.label());
    this.loadAllData();
  }

  loadAllData(): void {
    const seq = ++this.loadSeq;
    this.isLoading.set(true);
    this.loadError.set(null);
    // Single aggregate request for all sections (no duplicate HTTPs).
    this.dataService
      .getAdminUserAnalytics({
        growth_period: this.growthPeriod(),
        reg_period: this.regPeriod(),
        state_limit: String(
          this.stateOptions.find((o) => o.label === this.selectedStateOption())
            ?.count ?? 10,
        ),
        heatmap_period: this.heatmapPeriod(),
      })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (res) => {
          if (seq !== this.loadSeq) return;
          this.roleLabels.set(res.role_distribution?.labels || []);
          this.roleData.set(res.role_distribution?.data || []);
          this.roleColors.set(res.role_distribution?.colors || []);
          this.roleTotal.set(res.role_distribution?.total || "0");
          // Admins/Citizens cards reuse the role_distribution from this
          // same response (no extra API call); missing roles read as 0.
          this.kpis.set(
            withAdminCitizenKpis(
              res.kpis || [],
              res.role_distribution?.labels || [],
              res.role_distribution?.data || [],
            ),
          );
          this.growthLabels.set(res.growth_trend?.labels || []);
          this.growthDatasets.set(
            (res.growth_trend?.series || []).map((s) => ({
              label: s.label,
              data: s.data,
              borderColor: s.color,
              fill: false,
            })),
          );
          this.regLabels.set(res.registration_trend?.labels || []);
          this.regValues.set(res.registration_trend?.values || []);
          this.stateLabels.set(res.users_by_state?.labels || []);
          this.stateValues.set(res.users_by_state?.values || []);
          this.engagementMetrics.set(res.engagement_metrics || []);
          this.heatmapDays.set(res.heatmap?.days || []);
          this.heatmapTimes.set(res.heatmap?.times || []);
          this.heatmapCells.set(res.heatmap?.cells || []);
          // Recent Registered Users is the overall latest-users list
          // (newest 10 by created_at desc from the API, sliced to 5 in the
          // template). It is intentionally NOT date-range filtered: the
          // default/shared window ends in 2024 while real registrations are
          // newer, so filtering here emptied the table entirely.
          this.recentUsers.set(res.recent_registered_users || []);
          this.topActiveUsers.set(res.top_active_users || []);
          this.hasLoaded.set(true);
          this.isLoading.set(false);
        },
        error: (err) => {
          if (seq !== this.loadSeq) return;
          console.error("Failed to load user analytics:", err);
          this.loadError.set("Could not load user analytics. Please retry.");
          this.isLoading.set(false);
        },
      });
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  onDateRangeSelect(sel: DateRangeSelection): void {
    this.rangeService.applySelection(sel);
    this.currentRange.set(sel.label);
    // Drive the existing trend windows from the shared range; the
    // per-chart dropdowns remain independently adjustable afterwards.
    this.growthPeriod.set(
      `Last ${this.rangeService.snapMonths([3, 6, 12])} Months`,
    );
    this.showGrowthMenu.set(false);
    this.regPeriod.set(
      this.rangeService.monthsSpan() <= 3 ? "Last 3 Months" : "Last 6 Months",
    );
    this.showRegMenu.set(false);
    this.loadAllData();
  }

  downloadReport(): void {
    if (this.isDownloading()) return;
    this.isDownloading.set(true);

    this.dataService
      .downloadReport("USER_REPORT", "PDF", "User Analytics Report", {
        ...this.rangeService.toReportParams(),
        ...this.activeFilterParams(),
      })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `user-analytics-report-${new Date().toISOString().split("T")[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.isDownloading.set(false);
        },
        error: (err) => {
          console.error("Could not download user report:", err);
          this.isDownloading.set(false);
        },
      });
  }

  // Growth Trend Period Selector
  toggleGrowthMenu(event: Event): void {
    event.stopPropagation();
    this.showStateMenu.set(false);
    this.showRegMenu.set(false);
    this.showHeatmapMenu.set(false);
    this.showGrowthMenu.update((v) => !v);
  }

  setGrowthPeriod(period: string): void {
    this.growthPeriod.set(period);
    this.showGrowthMenu.set(false);
    this.loadAllData();
  }

  private updateGrowthTrend(): void {
    this.dataService
      .getUserGrowthTrend(this.growthPeriod())
      .subscribe((trend) => {
        this.growthLabels.set(trend.labels);
        this.growthDatasets.set(
          trend.series.map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            fill: false,
          })),
        );
      });
  }

  // Registration Trend Period Selector
  toggleRegMenu(event: Event): void {
    event.stopPropagation();
    this.showGrowthMenu.set(false);
    this.showStateMenu.set(false);
    this.showHeatmapMenu.set(false);
    this.showRegMenu.update((v) => !v);
  }

  setRegPeriod(period: string): void {
    this.regPeriod.set(period);
    this.showRegMenu.set(false);
    this.loadAllData();
  }

  private updateRegTrend(): void {
    this.dataService
      .getUserRegistrationTrend(this.regPeriod())
      .subscribe((data) => {
        this.regLabels.set(data.labels);
        this.regValues.set(data.values);
      });
  }

  // State Count Selector
  toggleStateMenu(event: Event): void {
    event.stopPropagation();
    this.showGrowthMenu.set(false);
    this.showRegMenu.set(false);
    this.showHeatmapMenu.set(false);
    this.showStateMenu.update((v) => !v);
  }

  selectStateOption(option: { label: string; count: number }): void {
    this.selectedStateOption.set(option.label);
    this.showStateMenu.set(false);
    this.loadAllData();
  }

  private updateStateDistribution(count: number): void {
    this.dataService.getUsersByState(count).subscribe((data) => {
      this.stateLabels.set(data.labels);
      this.stateValues.set(data.values);
    });
  }

  // Heatmap Period Selector
  setHeatmapPeriod(period: string): void {
    this.heatmapPeriod.set(period);
    this.showHeatmapMenu.set(false);
    this.loadAllData();
  }

  private closeCardMenus(): void {
    this.showGrowthMenu.set(false);
    this.showStateMenu.set(false);
    this.showRegMenu.set(false);
    this.showHeatmapMenu.set(false);
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    this.closeCardMenus();
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeCardMenus();
  }

  private updateHeatmap(): void {
    this.dataService
      .getUserHeatmapData(this.heatmapPeriod())
      .subscribe((data) => {
        this.heatmapDays.set(data.days);
        this.heatmapTimes.set(data.times);
        this.heatmapCells.set(data.cells);
      });
  }

  getCell(dayIndex: number, timeIndex: number): HeatmapCell | undefined {
    return this.heatmapCells().find(
      (c) => c.dayIndex === dayIndex && c.hour === timeIndex * 3,
    );
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case "Citizen":
        return "badge-citizen";
      case "Researcher":
        return "badge-researcher";
      case "Govt. Official":
        return "badge-official";
      case "Organization":
        return "badge-organization";
      case "Administrator":
        return "badge-admin";
      default:
        return "badge-default";
    }
  }

  openModal(type: "recent" | "active"): void {
    this.modalSearchTerm.set("");
    this.modalRoleFilter.set("ALL");
    this.activeModal.set(type);
  }

  closeModal(): void {
    this.activeModal.set(null);
  }
}

/**
 * Merge Admins/Citizens KPI cards into the API KPI list.
 *
 * Counts come from the role_distribution of the SAME user-analytics
 * response (labels like "Admin"/"Citizen" paired with data counts; roles
 * absent from the database read as 0). No extra API call, no hardcoding.
 * Both cards are appended after the six API cards in
 * Total → … → Researchers → Admins → Citizens order.
 */
function withAdminCitizenKpis(
  kpis: UserKpiCard[],
  roleLabels: string[],
  roleData: number[],
): UserKpiCard[] {
  const counts = new Map<string, number>();
  roleLabels.forEach((label, i) => {
    const key = label.replace(/[^a-z0-9]/gi, "").toUpperCase();
    const value = Number(roleData[i] ?? 0);
    counts.set(
      key,
      (counts.get(key) ?? 0) + (Number.isFinite(value) ? value : 0),
    );
  });
  const adminCount =
    (counts.get("ADMIN") ?? 0) + (counts.get("ADMINISTRATOR") ?? 0);
  const citizenCount = counts.get("CITIZEN") ?? 0;
  const fmt = (n: number): string => n.toLocaleString("en-US");

  const admins: UserKpiCard = {
    label: "Admins",
    value: fmt(adminCount),
    change: "",
    isPositive: true,
    icon: "admin_panel_settings",
    iconClass: "red",
  };
  const citizens: UserKpiCard = {
    label: "Citizens",
    value: fmt(citizenCount),
    change: "",
    isPositive: true,
    icon: "groups",
    iconClass: "blue-light",
  };

  const rest = kpis.filter(
    (k) => k.label !== "Admins" && k.label !== "Citizens",
  );
  return [...rest, admins, citizens];
}

/** Format a count with locale grouping (matches backend "1,234" style). */
export function fmtCount(n: number): string {
  return (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0).toLocaleString("en-US");
}

/**
 * Canonical role key for any role label variant found in user-analytics
 * payloads ("Citizen", "Govt. Official", "Government Official",
 * "Official", "Admin"/"Administrator", "Organisation", "Guests",
 * growth-series names like "Govt. Officials", ...). Unknown labels map
 * to "" so they never match a real filter and are excluded honestly.
 */
export function canonicalUserRole(label: string): string {
  const key = (label || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!key) return "";
  if (key.includes("GOVERNMENT") || key.includes("OFFICIAL")) {
    return "GOVERNMENT_OFFICIAL";
  }
  if (key.includes("ORGANI") || key === "ORG") return "ORGANIZATION";
  if (key.includes("RESEARCH")) return "RESEARCHER";
  if (key.includes("ADMIN")) return "ADMINISTRATOR";
  if (key.includes("CITIZEN")) return "CITIZEN";
  if (key.includes("GUEST")) return "GUEST";
  return "";
}
