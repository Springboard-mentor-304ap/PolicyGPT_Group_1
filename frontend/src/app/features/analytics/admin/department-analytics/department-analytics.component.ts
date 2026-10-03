import {
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChildren,
} from "@angular/core";
import { CommonModule, DecimalPipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import {
  DepartmentItem,
  DepartmentPerformanceRow,
  DepartmentOverview,
} from "../models/admin-analytics.models";
import { DateRangePickerComponent } from "../../shared/date-range-picker/date-range-picker.component";
import { HbarChartComponent } from "../../shared/hbar-chart/hbar-chart.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

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
  get tableRows(): DepartmentPerformanceRow[] {
    return this.tableRowsSignal();
  }
  set tableRows(val: DepartmentPerformanceRow[]) {
    this.tableRowsSignal.set(val);
  }

  selectedRowDepartment = signal<DepartmentPerformanceRow | null>(null);

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
    this.loadData();
  }

  loadData(searchTerm?: string, selectedDeptId?: string): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.dataService
      .getAdminDepartmentAnalytics(
        searchTerm,
        selectedDeptId || this.selectedDept().id,
      )
      .subscribe({
        next: (res) => {
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

          // Table
          this.tableRowsSignal.set(res.performance_table || []);
          this.hasLoaded.set(true);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error("Failed to load department analytics:", err);
          this.loadError.set("Could not load department analytics. Please retry.");
          this.isLoading.set(false);
        },
      });
  }

  onDateRangeChange(range: string): void {
    this.currentRange.set(range);
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

  closeDetailsModal(): void {
    this.selectedRowDepartment.set(null);
  }

  downloadReport(): void {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.dataService
      .downloadReport("DEPARTMENT_REPORT", "PDF", "Department Analytics Report", {
        department: this.selectedDept().name,
      })
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
