import { Component, ElementRef, OnInit, computed, inject, signal, viewChildren } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import {
  DepartmentItem,
  DepartmentPerformanceRow,
} from "../models/admin-analytics.models";
import { DateRangePickerComponent } from "../../shared/date-range-picker/date-range-picker.component";
import { HbarChartComponent } from "../../shared/hbar-chart/hbar-chart.component";
import {
  LineChartComponent,
  LineDataset,
} from "../../shared/line-chart/line-chart.component";
import { DoughnutChartComponent } from "../../shared/doughnut-chart/doughnut-chart.component";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

@Component({
  selector: "app-department-analytics",
  standalone: true,
  imports: [
    CommonModule,
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

  departmentsList: DepartmentItem[] = [
    {
      id: "all",
      name: "All Departments",
      count: 56,
      icon: "account_balance",
      iconBg: "#e8f0fe",
      iconColor: "#2f6fed",
      overview: {
        title: "Ministry of Agriculture & Farmers Welfare",
        totalPolicies: 120,
        activePolicies: 108,
        pendingPolicies: 8,
        rejectedPolicies: 4,
        totalSchemes: 45,
        activeSchemes: 38,
        pendingSchemes: 5,
        rejectedSchemes: 2,
      },
    },
    {
      id: "agriculture",
      name: "Agriculture",
      count: 6,
      icon: "eco",
      iconBg: "#e6f4ea",
      iconColor: "#3cb371",
      overview: {
        title: "Ministry of Agriculture & Farmers Welfare",
        totalPolicies: 120,
        activePolicies: 108,
        pendingPolicies: 8,
        rejectedPolicies: 4,
        totalSchemes: 45,
        activeSchemes: 38,
        pendingSchemes: 5,
        rejectedSchemes: 2,
      },
    },
    {
      id: "education",
      name: "Education",
      count: 5,
      icon: "school",
      iconBg: "#e8f0fe",
      iconColor: "#2f6fed",
      overview: {
        title: "Ministry of Education & Literacy",
        totalPolicies: 95,
        activePolicies: 82,
        pendingPolicies: 9,
        rejectedPolicies: 4,
        totalSchemes: 32,
        activeSchemes: 28,
        pendingSchemes: 3,
        rejectedSchemes: 1,
      },
    },
    {
      id: "health",
      name: "Health & Family Welfare",
      count: 4,
      icon: "favorite",
      iconBg: "#ffe4e6",
      iconColor: "#e5484d",
      overview: {
        title: "Department of Health & Family Welfare",
        totalPolicies: 88,
        activePolicies: 76,
        pendingPolicies: 8,
        rejectedPolicies: 4,
        totalSchemes: 28,
        activeSchemes: 24,
        pendingSchemes: 3,
        rejectedSchemes: 1,
      },
    },
    {
      id: "rural",
      name: "Rural Development",
      count: 5,
      icon: "park",
      iconBg: "#e6f4ea",
      iconColor: "#3cb371",
      overview: {
        title: "Department of Rural Development",
        totalPolicies: 76,
        activePolicies: 68,
        pendingPolicies: 5,
        rejectedPolicies: 3,
        totalSchemes: 38,
        activeSchemes: 32,
        pendingSchemes: 4,
        rejectedSchemes: 2,
      },
    },
    {
      id: "urban",
      name: "Urban Development",
      count: 4,
      icon: "apartment",
      iconBg: "#fef3c7",
      iconColor: "#f5a524",
      overview: {
        title: "Ministry of Housing & Urban Affairs",
        totalPolicies: 64,
        activePolicies: 58,
        pendingPolicies: 4,
        rejectedPolicies: 2,
        totalSchemes: 24,
        activeSchemes: 20,
        pendingSchemes: 3,
        rejectedSchemes: 1,
      },
    },
    {
      id: "finance",
      name: "Finance",
      count: 3,
      icon: "account_balance_wallet",
      iconBg: "#fef3c7",
      iconColor: "#d97706",
      overview: {
        title: "Ministry of Finance",
        totalPolicies: 52,
        activePolicies: 46,
        pendingPolicies: 4,
        rejectedPolicies: 2,
        totalSchemes: 18,
        activeSchemes: 16,
        pendingSchemes: 1,
        rejectedSchemes: 1,
      },
    },
    {
      id: "home",
      name: "Home Affairs",
      count: 4,
      icon: "security",
      iconBg: "#f3e8ff",
      iconColor: "#8b5cf6",
      overview: {
        title: "Ministry of Home Affairs",
        totalPolicies: 45,
        activePolicies: 40,
        pendingPolicies: 3,
        rejectedPolicies: 2,
        totalSchemes: 15,
        activeSchemes: 13,
        pendingSchemes: 1,
        rejectedSchemes: 1,
      },
    },
    {
      id: "labour",
      name: "Labour & Employment",
      count: 4,
      icon: "work",
      iconBg: "#ffe4e6",
      iconColor: "#e5484d",
      overview: {
        title: "Ministry of Labour & Employment",
        totalPolicies: 48,
        activePolicies: 42,
        pendingPolicies: 4,
        rejectedPolicies: 2,
        totalSchemes: 20,
        activeSchemes: 18,
        pendingSchemes: 1,
        rejectedSchemes: 1,
      },
    },
    {
      id: "social",
      name: "Social Justice",
      count: 3,
      icon: "groups",
      iconBg: "#f3e8ff",
      iconColor: "#8b5cf6",
      overview: {
        title: "Ministry of Social Justice & Empowerment",
        totalPolicies: 38,
        activePolicies: 32,
        pendingPolicies: 4,
        rejectedPolicies: 2,
        totalSchemes: 18,
        activeSchemes: 15,
        pendingSchemes: 2,
        rejectedSchemes: 1,
      },
    },
    {
      id: "environment",
      name: "Environment & Forests",
      count: 3,
      icon: "forest",
      iconBg: "#e6f4ea",
      iconColor: "#3cb371",
      overview: {
        title: "Ministry of Environment, Forest & Climate Change",
        totalPolicies: 32,
        activePolicies: 28,
        pendingPolicies: 3,
        rejectedPolicies: 1,
        totalSchemes: 16,
        activeSchemes: 14,
        pendingSchemes: 1,
        rejectedSchemes: 1,
      },
    },
    {
      id: "skill",
      name: "Skill Development",
      count: 2,
      icon: "build",
      iconBg: "#e8f0fe",
      iconColor: "#2f6fed",
      overview: {
        title: "Ministry of Skill Development & Entrepreneurship",
        totalPolicies: 28,
        activePolicies: 24,
        pendingPolicies: 3,
        rejectedPolicies: 1,
        totalSchemes: 14,
        activeSchemes: 12,
        pendingSchemes: 1,
        rejectedSchemes: 1,
      },
    },
    {
      id: "women",
      name: "Women & Child Development",
      count: 3,
      icon: "child_care",
      iconBg: "#f3e8ff",
      iconColor: "#8b5cf6",
      overview: {
        title: "Ministry of Women & Child Development",
        totalPolicies: 25,
        activePolicies: 21,
        pendingPolicies: 3,
        rejectedPolicies: 1,
        totalSchemes: 12,
        activeSchemes: 10,
        pendingSchemes: 1,
        rejectedSchemes: 1,
      },
    },
  ];

  filteredDepartments = signal<DepartmentItem[]>(this.departmentsList);
  selectedDept = signal<DepartmentItem>(this.departmentsList[0]);
  currentOverview = signal(this.departmentsList[0].overview);

  // Full-width search results panel state.
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
  monthLabels = [
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
  trendDatasets: LineDataset[] = [
    {
      label: "Policies",
      data: [15, 20, 25, 24, 30, 28, 35, 38, 38, 42, 45, 48],
      borderColor: "#2f6fed",
      backgroundColor: "transparent",
    },
    {
      label: "Schemes",
      data: [10, 12, 16, 18, 20, 24, 25, 26, 25, 28, 30, 32],
      borderColor: "#3cb371",
      backgroundColor: "transparent",
    },
  ];

  // HBar Charts Data
  policyDeptLabels = [
    "Agriculture",
    "Education",
    "Health & Family Welfare",
    "Rural Development",
    "Urban Development",
    "Finance",
    "Labour & Employment",
    "Home Affairs",
    "Social Justice",
    "Environment & Forests",
  ];
  policyDeptData = [120, 95, 88, 76, 64, 52, 48, 45, 38, 32];

  schemeDeptLabels = [
    "Agriculture",
    "Rural Development",
    "Education",
    "Health & Family Welfare",
    "Urban Development",
    "Labour & Employment",
    "Social Justice",
    "Environment & Forests",
    "Skill Development",
    "Women & Child Development",
  ];
  schemeDeptData = [45, 38, 32, 28, 24, 20, 18, 16, 14, 12];

  // Doughnut Data
  engagementLabels = [
    "Agriculture (24%)",
    "Education (18%)",
    "Health & Family Welfare (15%)",
    "Rural Development (12%)",
    "Urban Development (9%)",
    "Finance (7%)",
    "Others (15%)",
  ];
  engagementData = [24, 18, 15, 12, 9, 7, 15];

  // Table Data
  tableRows: DepartmentPerformanceRow[] = [
    {
      rank: 1,
      name: "Agriculture & Farmers Welfare",
      totalPolicies: 120,
      activePolicies: 108,
      totalSchemes: 45,
      activeSchemes: 38,
      totalViews: "45,230",
      downloads: "7,890",
      lastUpdated: "Sep 30, 2024",
    },
    {
      rank: 2,
      name: "Education",
      totalPolicies: 95,
      activePolicies: 82,
      totalSchemes: 32,
      activeSchemes: 28,
      totalViews: "32,450",
      downloads: "5,620",
      lastUpdated: "Sep 29, 2024",
    },
    {
      rank: 3,
      name: "Health & Family Welfare",
      totalPolicies: 88,
      activePolicies: 76,
      totalSchemes: 28,
      activeSchemes: 24,
      totalViews: "28,760",
      downloads: "4,980",
      lastUpdated: "Sep 29, 2024",
    },
    {
      rank: 4,
      name: "Rural Development",
      totalPolicies: 76,
      activePolicies: 68,
      totalSchemes: 38,
      activeSchemes: 32,
      totalViews: "26,540",
      downloads: "4,120",
      lastUpdated: "Sep 28, 2024",
    },
    {
      rank: 5,
      name: "Urban Development",
      totalPolicies: 64,
      activePolicies: 58,
      totalSchemes: 24,
      activeSchemes: 20,
      totalViews: "22,180",
      downloads: "3,860",
      lastUpdated: "Sep 28, 2024",
    },
  ];

  selectedRowDepartment = signal<DepartmentPerformanceRow | null>(null);

  ngOnInit(): void {
    this.dataService.getDepartmentAnalytics().subscribe();
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
      this.filteredDepartments.set(this.departmentsList);
      return;
    }
    this.filteredDepartments.set(
      this.departmentsList.filter(
        (d) =>
          d.name.toLowerCase().includes(query) ||
          d.id.toLowerCase().includes(query) ||
          d.overview.title.toLowerCase().includes(query),
      ),
    );
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
    this.filteredDepartments.set(this.departmentsList);
    this.selectDepartment(this.departmentsList[0]);
  }

  selectDepartment(dept: DepartmentItem): void {
    this.selectedDept.set(dept);
    this.currentOverview.set(dept.overview);
  }

  viewDepartmentDetails(row: DepartmentPerformanceRow): void {
    this.selectedRowDepartment.set(row);
  }

  closeDetailsModal(): void {
    this.selectedRowDepartment.set(null);
  }

  downloadReport(): void {
    this.dataService.downloadReport("pdf").subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "department-analytics-report.pdf";
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        console.error("Could not download report");
      },
    });
  }
}
