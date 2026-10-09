import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
  viewChildren,
} from "@angular/core";
import { finalize } from "rxjs";
import { CommonModule, DecimalPipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import {
  DepartmentItem,
  DepartmentPerformanceRow,
  DepartmentOverview,
} from "../models/admin-analytics.models";
import { DateRangePickerComponent, type DateRangeSelection } from "../../shared/date-range-picker/date-range-picker.component";
import { HbarChartComponent } from "../../shared/hbar-chart/hbar-chart.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";
import {
  AnalyticsDateRangeService,
  selectionForLabel,
} from "../../shared/analytics-date-range.service";

const DEFAULT_OVERVIEW: DepartmentOverview = {
  title: "All Departments",
  totalPolicies: 0,
  activePolicies: 0,
  pendingPolicies: 0,
  rejectedPolicies: 0,
  totalSchemes: 0,
  activeSchemes: 0,
  pendingSchemes: 0,
  rejectedSchemes: 0,
};

const DEFAULT_DEPT_ITEM: DepartmentItem = {
  id: "all",
  name: "All Departments",
  count: 0,
  icon: "account_balance",
  iconBg: "#e8f0fe",
  iconColor: "#2f6fed",
  overview: DEFAULT_OVERVIEW,
};

@Component({
  selector: "app-department-analytics",
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    RouterLink,
    DateRangePickerComponent,
    HbarChartComponent,
    LineChartComponent,
    DoughnutChartComponent,
    CountUpDirective,
  ],
  templateUrl: "./department-analytics.component.html",
  styleUrl: "./department-analytics.component.scss",
})
export class DepartmentAnalyticsComponent implements OnInit {
  private readonly dataService = inject(AdminAnalyticsDataService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly rangeService = inject(AnalyticsDateRangeService);

  readonly isSampleData = this.dataService.isSampleData;

  searchQuery = signal<string>("");
  currentRange = signal<string>("Jan 1, 2024 - Sep 30, 2024");
  isLoading = signal<boolean>(true);
  hasLoaded = signal<boolean>(false);
  loadError = signal<string | null>(null);
  isExporting = signal<boolean>(false);

  // Departments List (dynamic from database)
  departmentsListSignal = signal<DepartmentItem[]>([
    DEFAULT_DEPT_ITEM,
    {
      id: "agriculture",
      name: "Agriculture",
      count: 0,
      icon: "eco",
      iconBg: "#e6f4ea",
      iconColor: "#3cb371",
      overview: {
        title: "Ministry of Agriculture & Farmers Welfare",
        totalPolicies: 0,
        activePolicies: 0,
        pendingPolicies: 0,
        rejectedPolicies: 0,
        totalSchemes: 0,
        activeSchemes: 0,
        pendingSchemes: 0,
        rejectedSchemes: 0,
      },
    },
    {
      id: "education",
      name: "Education",
      count: 0,
      icon: "school",
      iconBg: "#e8f0fe",
      iconColor: "#2f6fed",
      overview: {
        title: "Ministry of Education",
        totalPolicies: 0,
        activePolicies: 0,
        pendingPolicies: 0,
        rejectedPolicies: 0,
        totalSchemes: 0,
        activeSchemes: 0,
        pendingSchemes: 0,
        rejectedSchemes: 0,
      },
    },
  ]);

  get departmentsList(): DepartmentItem[] {
    return this.departmentsListSignal();
  }
  set departmentsList(val: DepartmentItem[]) {
    this.departmentsListSignal.set(val);
  }

  filteredDepartments = signal<DepartmentItem[]>(this.departmentsListSignal());
  selectedDept = signal<DepartmentItem>(DEFAULT_DEPT_ITEM);
  currentOverview = signal<DepartmentOverview>(DEFAULT_OVERVIEW);

  // Top 6 KPI summary counts
  overviewMetrics = signal<{
    totalDepts: number;
    totalPolicies: number;
    totalSchemes: number;
    activeDepts: number;
    totalViews: number;
    totalDownloads: number;
  }>({
    totalDepts: 0,
    totalPolicies: 0,
    totalSchemes: 0,
    activeDepts: 0,
    totalViews: 0,
    totalDownloads: 0,
  });

  // Full-width search results panel state
  resultsOpen = signal<boolean>(false);
  activeResultIndex = signal<number>(-1);
  showResults = computed<boolean>(
    () => this.resultsOpen() && this.searchQuery().trim().length > 0,
  );

  activeDescendantId = computed<string | null>(() => {
    const items = this.filteredDepartments();
    const index = this.activeResultIndex();
    if (!this.showResults() || index < 0 || index >= items.length) {
      return null;
    }
    return `dept-option-${items[index].id}`;
  });

  private readonly resultOptions = viewChildren("resultOption", {
    read: ElementRef,
  });

  // Line Chart Data
  monthLabels = signal<string[]>([]);
  trendDatasets = signal<LineDataset[]>([]);

  // HBar Charts Data
  policyDeptLabels = signal<string[]>([]);
  policyDeptData = signal<number[]>([]);

  schemeDeptLabels = signal<string[]>([]);
  schemeDeptData = signal<number[]>([]);

  // Doughnut Data
  engagementLabels = signal<string[]>([]);
  engagementData = signal<number[]>([]);

  // Table Data
  tableRowsSignal = signal<DepartmentPerformanceRow[]>([]);

  /**
   * Reload generation: only the latest loadData call may touch state so
   * a slow older response can never overwrite newer filter data.
   */
  private loadSeq = 0;  get tableRows(): DepartmentPerformanceRow[] {
    return this.tableRowsSignal();
  }
  set tableRows(val: DepartmentPerformanceRow[]) {
    this.tableRowsSignal.set(val);
  }

  selectedRowDepartment = signal<DepartmentPerformanceRow | null>(null);

  /** Global windowed view totals (policy/scheme split) for the details modal. */
  viewTotals = signal<{ policy_views: number; scheme_views: number; total_views: number }>({
    policy_views: 0,
    scheme_views: 0,
    total_views: 0,
  });

  // Details-modal controls (client-side only; the modal reuses the
  // already-loaded aggregate response — no extra API call).
  modalDistFilter = signal<"Both" | "Policies" | "Schemes">("Both");
  modalDistFilterOptions: ("Both" | "Policies" | "Schemes")[] = ["Both", "Policies", "Schemes"];
  showModalDistMenu = signal<boolean>(false);
  modalTopSort = signal<"Total Content" | "Policies" | "Schemes" | "Views">("Total Content");
  modalTopSortOptions: ("Total Content" | "Policies" | "Schemes" | "Views")[] = [
    "Total Content",
    "Policies",
    "Schemes",
    "Views",
  ];
  showModalSortMenu = signal<boolean>(false);

  // Performance-table ranking filter (client-side re-sort of the loaded
  // backend ranking; no extra API call, Total Views stays visible).
  perfFilter = signal<"All" | "Policies" | "Schemes">("All");
  perfFilterOptions: ("All" | "Policies" | "Schemes")[] = ["All", "Policies", "Schemes"];
  showPerfMenu = signal<boolean>(false);

  /**
   * Backend-ranked rows re-sorted per filter with dynamic numbering:
   * All → Total Policies + Total Schemes (ties: Total Views, then name);
   * Policies → Total Policies (ties: Active Policies, then name);
   * Schemes → Total Schemes (ties: Active Schemes, then name).
   */
  visibleTableRows(): DepartmentPerformanceRow[] {
    const filter = this.perfFilter();
    const rows = [...this.tableRowsSignal()];
    const byName = (a: DepartmentPerformanceRow, b: DepartmentPerformanceRow) =>
      a.name.localeCompare(b.name);
    if (filter === "Policies") {
      rows.sort(
        (a, b) =>
          b.totalPolicies - a.totalPolicies ||
          b.activePolicies - a.activePolicies ||
          byName(a, b),
      );
    } else if (filter === "Schemes") {
      rows.sort(
        (a, b) =>
          b.totalSchemes - a.totalSchemes ||
          b.activeSchemes - a.activeSchemes ||
          byName(a, b),
      );
    } else {
      rows.sort(
        (a, b) =>
          b.totalPolicies + b.totalSchemes - (a.totalPolicies + a.totalSchemes) ||
          b.totalViews - a.totalViews ||
          byName(a, b),
      );
    }
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  }

  togglePerfMenu(event: Event): void {
    event.stopPropagation();
    this.showModalDistMenu.set(false);
    this.showModalSortMenu.set(false);
    this.showTrendMenu.set(false);
    this.showPerfMenu.update((v) => !v);
  }

  selectPerfFilter(option: "All" | "Policies" | "Schemes"): void {
    this.perfFilter.set(option);
    this.showPerfMenu.set(false);
  }

  toggleModalDistMenu(event: Event): void {
    event.stopPropagation();
    this.showModalSortMenu.set(false);
    this.showPerfMenu.set(false);
    this.showTrendMenu.set(false);
    this.showModalDistMenu.update((v) => !v);
  }

  selectModalDistFilter(option: "Both" | "Policies" | "Schemes"): void {
    this.modalDistFilter.set(option);
    this.showModalDistMenu.set(false);
  }

  toggleModalSortMenu(event: Event): void {
    event.stopPropagation();
    this.showModalDistMenu.set(false);
    this.showPerfMenu.set(false);
    this.showTrendMenu.set(false);
    this.showModalSortMenu.update((v) => !v);
  }

  selectModalTopSort(option: "Total Content" | "Policies" | "Schemes" | "Views"): void {
    this.modalTopSort.set(option);
    this.showModalSortMenu.set(false);
  }

  @HostListener("document:click")
  closePerfMenu(): void {
    this.showPerfMenu.set(false);
    this.showModalDistMenu.set(false);
    this.showModalSortMenu.set(false);
    this.showTrendMenu.set(false);
  }

  @HostListener("document:keydown.escape")
  closePerfMenuOnEscape(): void {
    this.showPerfMenu.set(false);
    this.showModalDistMenu.set(false);
    this.showModalSortMenu.set(false);
    this.showTrendMenu.set(false);
  }

  /** Live doughnut center: sum of top policy counts (no fake 185,420). */
  engagementTotal(): string {
    const data = this.engagementData();
    if (!data || data.length === 0) {
      const ov = this.currentOverview();
      return String((ov.totalPolicies || 0) + (ov.totalSchemes || 0));
    }
    // engagementData holds percentages; recover live total from dept data.
    const total = this.policyDeptData().reduce((a, b) => a + (b || 0), 0) +
      this.schemeDeptData().reduce((a, b) => a + (b || 0), 0);
    return String(total);
  }

  ngOnInit(): void {
    this.currentRange.set(this.rangeService.label());
    this.loadData();
  }

  loadData(searchTerm?: string, selectedDeptId?: string): void {
    const seq = ++this.loadSeq;
    this.isLoading.set(true);
    this.loadError.set(null);
    this.dataService
      .getAdminDepartmentAnalytics(
        searchTerm,
        selectedDeptId || this.selectedDept().id,
      )
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (res) => {
          if (seq !== this.loadSeq) return;
          if (res.all_departments_list && res.all_departments_list.length > 0) {
            this.departmentsListSignal.set(res.all_departments_list);
            this.filteredDepartments.set(res.departments_list);
          } else {
            // No sample fallback: show empty, not fake departments.
            this.departmentsListSignal.set([DEFAULT_DEPT_ITEM]);
            this.filteredDepartments.set([DEFAULT_DEPT_ITEM]);
          }

          const matchedDept =
            res.all_departments_list.find(
              (d) => d.id === (selectedDeptId || this.selectedDept().id),
            ) || res.all_departments_list[0] || DEFAULT_DEPT_ITEM;

          this.selectedDept.set(matchedDept);
          this.currentOverview.set(matchedDept.overview || res.selected_overview);

          // Top KPIs
          const nonAllDepts = res.all_departments_list.filter((d) => d.id !== "all");
          const totalDepts = nonAllDepts.length;
          const activeDepts = nonAllDepts.filter(
            (d) =>
              (d.overview?.activePolicies || 0) +
                (d.overview?.activeSchemes || 0) >
              0,
          ).length;

          this.overviewMetrics.set({
            totalDepts,
            totalPolicies: res.selected_overview?.totalPolicies || 0,
            totalSchemes: res.selected_overview?.totalSchemes || 0,
            activeDepts,
            totalViews: 0,
            totalDownloads: 0,
          });

          // Charts
          this.monthLabels.set(res.month_labels);
          this.trendDatasets.set(
            res.trend_datasets.map((t) => ({
              label: t.label,
              data: t.data,
              borderColor: t.borderColor,
              backgroundColor: t.backgroundColor || "transparent",
            })),
          );

          this.policyDeptLabels.set(res.top_by_policies.map((p) => p.label));
          this.policyDeptData.set(res.top_by_policies.map((p) => p.value));

          this.schemeDeptLabels.set(res.top_by_schemes.map((s) => s.label));
          this.schemeDeptData.set(res.top_by_schemes.map((s) => s.value));

          // Engagement
          if (res.top_by_policies.length > 0) {
            const sumP = res.top_by_policies.reduce((a, b) => a + b.value, 0) || 1;
            this.engagementLabels.set(
              res.top_by_policies.map(
                (p) => `${p.label} (${Math.round((p.value / sumP) * 100)}%)`,
              ),
            );
            this.engagementData.set(
              res.top_by_policies.map((p) => Math.round((p.value / sumP) * 100)),
            );
          } else {
            this.engagementLabels.set([]);
            this.engagementData.set([]);
          }

          // Table: full backend performance ranking (backend-assigned
          // rank order preserved). lastUpdated is sync metadata — the
          // latest max(updated_at) per department — not a row metric, so
          // it must NOT be calendar-range filtered: real timestamps fall
          // outside the shared window and the filter emptied the table
          // while the (unfiltered) charts still showed data. Same rule
          // as Latest Policies / Recent Scheme Updates on the sibling
          // pages: no range slicing where the API exposes no date param.
          // No extra request: res.performance_table rides the same
          // aggregate response as every other section above.
          this.tableRowsSignal.set(res.performance_table || []);
          // Windowed global view totals (policy/scheme split) feeding the
          // details modal; missing shape degrades to zeros, never NaN.
          const vt = res.view_totals;
          this.viewTotals.set({
            policy_views: Number(vt?.policy_views) || 0,
            scheme_views: Number(vt?.scheme_views) || 0,
            total_views: Number(vt?.total_views) || 0,
          });
          this.hasLoaded.set(true);
          this.isLoading.set(false);
        },
        error: (err) => {
          if (seq !== this.loadSeq) return;
          console.error("Failed to load department analytics:", err);
          this.loadError.set("Could not load department analytics. Please retry.");
          this.isLoading.set(false);
        },
      });
  }

  // Policies vs Schemes Trend day-window selector (3 options). The
  // selection is applied through the shared global date-filter service
  // (same state, same reload path as the header picker) so the chart
  // re-queries with real start/end bounds — no second filter system.
  trendPeriod = signal<string>("Last 30 Days");
  trendPeriodOptions = ["Last 7 Days", "Last 14 Days", "Last 30 Days"];
  showTrendMenu = signal<boolean>(false);

  toggleTrendMenu(event: Event): void {
    event.stopPropagation();
    this.showPerfMenu.set(false);
    this.showModalDistMenu.set(false);
    this.showModalSortMenu.set(false);
    this.showTrendMenu.update((v) => !v);
  }

  selectTrendPeriod(option: string): void {
    this.trendPeriod.set(option);
    this.showTrendMenu.set(false);
    // Reuse the existing global date logic: Last N Days presets resolve
    // to concrete ISO bounds, update shared state, and reload once.
    const sel = selectionForLabel(option);
    if (sel) {
      this.onDateRangeSelect(sel);
    }
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
  }

  onDateRangeSelect(sel: DateRangeSelection): void {
    this.rangeService.applySelection(sel);
    this.currentRange.set(sel.label);
    // Keep the trend control in sync when the global range matches one
    // of its day options (e.g. picked from another control).
    if ((this.trendPeriodOptions as string[]).includes(sel.label)) {
      this.trendPeriod.set(sel.label);
    }
    this.loadData();
  }

  updateSearch(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const query = raw.toLowerCase().trim();
    this.searchQuery.set(raw);
    this.activeResultIndex.set(-1);
    this.resultsOpen.set(true);

    if (query.length === 0) {
      this.filteredDepartments.set(this.departmentsListSignal());
      return;
    }

    // Local filter for instant responsiveness
    const filtered = this.departmentsListSignal().filter(
      (d) =>
        d.name.toLowerCase().includes(query) ||
        d.id.toLowerCase().includes(query) ||
        (d.overview?.title && d.overview.title.toLowerCase().includes(query)),
    );
    this.filteredDepartments.set(filtered);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const items = this.filteredDepartments();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!this.showResults() || items.length === 0) {
          return;
        }
        this.activeResultIndex.set(
          (this.activeResultIndex() + 1) % items.length,
        );
        this.scrollActiveResultIntoView();
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!this.showResults() || items.length === 0) {
          return;
        }
        this.activeResultIndex.set(
          (this.activeResultIndex() - 1 + items.length) % items.length,
        );
        this.scrollActiveResultIntoView();
        break;
      case "Enter": {
        const index = this.activeResultIndex();
        if (this.showResults() && index >= 0 && index < items.length) {
          event.preventDefault();
          this.selectDepartmentAndClose(items[index]);
        }
        break;
      }
      case "Escape":
        if (this.showResults()) {
          event.preventDefault();
          this.resultsOpen.set(false);
          this.activeResultIndex.set(-1);
        } else if (this.searchQuery().length > 0) {
          this.clearSearch();
        }
        break;
    }
  }

  setActiveResultIndex(index: number): void {
    this.activeResultIndex.set(index);
  }

  private scrollActiveResultIntoView(): void {
    const index = this.activeResultIndex();
    const el = this.resultOptions()[index]?.nativeElement as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }

  selectDepartmentAndClose(dept: DepartmentItem): void {
    this.selectDepartment(dept);
    this.resultsOpen.set(false);
    this.activeResultIndex.set(-1);
  }

  clearSearch(): void {
    this.searchQuery.set("");
    this.activeResultIndex.set(-1);
    this.resultsOpen.set(false);
    this.filteredDepartments.set(this.departmentsListSignal());
    if (this.departmentsListSignal().length > 0) {
      this.selectDepartment(this.departmentsListSignal()[0]);
    }
  }

  selectDepartment(dept: DepartmentItem): void {
    this.selectedDept.set(dept);
    this.currentOverview.set(dept.overview);
    this.loadData(this.searchQuery(), dept.id);
  }

  viewDepartmentDetails(row: DepartmentPerformanceRow): void {
    this.selectedRowDepartment.set(row);
  }

  /** Live total of the performance table's Total Views (same API rows). */
  allDeptViewsTotal(): number {
    return this.tableRowsSignal().reduce(
      (sum, r) => sum + (Number(r.totalViews) || 0),
      0,
    );
  }

  // =========================================================
  // All Departments details-modal data (all derived from the
  // already-loaded aggregate response — no extra API calls).
  // =========================================================

  /** Departments excluding the synthetic "all" entry. */
  private modalDepartments(): DepartmentItem[] {
    return this.departmentsListSignal().filter((d) => d.id !== "all");
  }

  /** Windowed per-department rows backing every modal section. */
  modalRows(): DepartmentPerformanceRow[] {
    return [...this.tableRowsSignal()];
  }

  /** Overall summary: department counts live here; content counts and
   * views come from the windowed performance rows + view totals. */
  modalSummary(): {
    totalDepartments: number;
    activeDepartments: number;
    totalPolicies: number;
    activePolicies: number;
    pendingPolicies: number;
    rejectedPolicies: number;
    totalSchemes: number;
    activeSchemes: number;
    pendingSchemes: number;
    rejectedSchemes: number;
    policyViews: number;
    schemeViews: number;
    totalViews: number;
  } {
    const rows = this.modalRows();
    const sum = (pick: (r: DepartmentPerformanceRow) => number): number =>
      rows.reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);
    const depts = this.modalDepartments();
    const activeDepartments = depts.filter(
      (d) =>
        (d.overview?.activePolicies || 0) + (d.overview?.activeSchemes || 0) > 0,
    ).length;
    const views = this.viewTotals();
    return {
      totalDepartments: depts.length,
      activeDepartments,
      totalPolicies: sum((r) => r.totalPolicies),
      activePolicies: sum((r) => r.activePolicies),
      pendingPolicies: sum((r) => r.pendingPolicies),
      rejectedPolicies: sum((r) => r.rejectedPolicies),
      totalSchemes: sum((r) => r.totalSchemes),
      activeSchemes: sum((r) => r.activeSchemes),
      pendingSchemes: sum((r) => r.pendingSchemes),
      rejectedSchemes: sum((r) => r.rejectedSchemes),
      policyViews: Number(views.policy_views) || 0,
      schemeViews: Number(views.scheme_views) || 0,
      totalViews: Number(views.total_views) || 0,
    };
  }

  /** "a (b%)" status fragment; 0 denominators render "0 (0%)". */
  modalStatusShare(part: number, total: number): string {
    const safe = Number(total) || 0;
    const pct = safe > 0 ? Math.round(((Number(part) || 0) / safe) * 100) : 0;
    return `${Number(part) || 0} (${pct}%)`;
  }

  /** Bar width percent for stacked/banded visuals (0 when total is 0). */
  modalSharePct(part: number, total: number): number {
    const safe = Number(total) || 0;
    if (safe <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round(((Number(part) || 0) / safe) * 100)));
  }

  /** Policies-vs-schemes comparison bars (percent of the larger side). */
  modalVsBars(): { label: string; value: number; pct: number; color: string }[] {
    const s = this.modalSummary();
    const max = Math.max(s.totalPolicies, s.totalSchemes, 1);
    return [
      { label: "Policies", value: s.totalPolicies, pct: Math.round((s.totalPolicies / max) * 100), color: "#2f6fed" },
      { label: "Schemes", value: s.totalSchemes, pct: Math.round((s.totalSchemes / max) * 100), color: "#3cb371" },
    ];
  }

  /** Distribution source: top 10 departments by combined content. */
  private modalTopDistRows(): DepartmentPerformanceRow[] {
    return [...this.modalRows()]
      .sort(
        (a, b) =>
          b.totalPolicies + b.totalSchemes - (a.totalPolicies + a.totalSchemes) ||
          b.totalViews - a.totalViews ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 10);
  }

  modalPolicyDistLabels(): string[] {
    return this.modalTopDistRows().map((r) => r.name);
  }

  modalPolicyDistData(): number[] {
    return this.modalTopDistRows().map((r) => r.totalPolicies);
  }

  modalSchemeDistLabels(): string[] {
    return this.modalTopDistRows().map((r) => r.name);
  }

  modalSchemeDistData(): number[] {
    return this.modalTopDistRows().map((r) => r.totalSchemes);
  }

  /** Grouped comparison series honoring the modal Both/Policies/Schemes filter. */
  modalComparisonLabels(): string[] {
    return this.modalTopDistRows().map((r) => r.name);
  }

  modalComparisonPrimaryValues(): number[] {
    const rows = this.modalTopDistRows();
    return this.modalDistFilter() === "Schemes"
      ? rows.map((r) => r.totalSchemes)
      : rows.map((r) => r.totalPolicies);
  }

  modalComparisonPrimaryColor(): string {
    return this.modalDistFilter() === "Schemes" ? "#3cb371" : "#2f6fed";
  }

  modalComparisonPrimaryLabel(): string {
    return this.modalDistFilter() === "Schemes" ? "Schemes" : "Policies";
  }

  modalComparisonSecondValues(): number[] | null {
    if (this.modalDistFilter() !== "Both") return null;
    return this.modalTopDistRows().map((r) => r.totalSchemes);
  }

  /** Ranked table honoring the modal sort control, with live numbering. */
  modalTopDepartments(): DepartmentPerformanceRow[] {
    const sort = this.modalTopSort();
    const rows = [...this.modalRows()];
    const byName = (a: DepartmentPerformanceRow, b: DepartmentPerformanceRow) =>
      a.name.localeCompare(b.name);
    const content = (r: DepartmentPerformanceRow) => r.totalPolicies + r.totalSchemes;
    if (sort === "Policies") {
      rows.sort(
        (a, b) => b.totalPolicies - a.totalPolicies || b.totalViews - a.totalViews || byName(a, b),
      );
    } else if (sort === "Schemes") {
      rows.sort(
        (a, b) => b.totalSchemes - a.totalSchemes || b.totalViews - a.totalViews || byName(a, b),
      );
    } else if (sort === "Views") {
      rows.sort((a, b) => b.totalViews - a.totalViews || content(b) - content(a) || byName(a, b));
    } else {
      rows.sort(
        (a, b) => content(b) - content(a) || b.totalViews - a.totalViews || byName(a, b),
      );
    }
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  }

  /** Latest sync across rows (formatted backend dates or "—"). */
  modalLastUpdated(): string {
    let best: number | null = null;
    for (const r of this.modalRows()) {
      const ts = Date.parse(String(r.lastUpdated ?? ""));
      if (!Number.isNaN(ts) && (best === null || ts > best)) best = ts;
    }
    if (best === null) return "—";
    return new Date(best).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }

  closeDetailsModal(): void {
    this.selectedRowDepartment.set(null);
  }

  downloadReport(): void {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.dataService
      .downloadReport("DEPARTMENT_REPORT", "PDF", "Department Analytics Report", {
        department: this.selectedDept().name,
        ...this.rangeService.toReportParams(),
      })
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `department-analytics-report-${new Date().toISOString().split("T")[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.isExporting.set(false);
        },
        error: (err) => {
          console.error("Could not download department report:", err);
          this.isExporting.set(false);
        },
      });
  }
}
