import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import { DepartmentAnalyticsComponent } from "./department-analytics.component";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import { AdminDepartmentAnalyticsResponse } from "../models/admin-analytics.models";

describe("DepartmentAnalyticsComponent", () => {
  let component: DepartmentAnalyticsComponent;
  let fixture: ComponentFixture<DepartmentAnalyticsComponent>;
  let mockDataService: any;

  const mockDeptsList = [
    {
      id: "all",
      name: "All Departments",
      count: 2,
      icon: "account_balance",
      iconBg: "#e8f0fe",
      iconColor: "#2f6fed",
      overview: {
        title: "All Departments",
        totalPolicies: 25,
        activePolicies: 20,
        pendingPolicies: 3,
        rejectedPolicies: 2,
        totalSchemes: 15,
        activeSchemes: 12,
        pendingSchemes: 2,
        rejectedSchemes: 1,
      },
    },
    {
      id: "agriculture",
      name: "Agriculture",
      count: 15,
      icon: "eco",
      iconBg: "#e6f4ea",
      iconColor: "#3cb371",
      overview: {
        title: "Ministry of Agriculture & Farmers Welfare",
        totalPolicies: 15,
        activePolicies: 12,
        pendingPolicies: 2,
        rejectedPolicies: 1,
        totalSchemes: 10,
        activeSchemes: 8,
        pendingSchemes: 1,
        rejectedSchemes: 1,
      },
    },
    {
      id: "education",
      name: "Education",
      count: 10,
      icon: "school",
      iconBg: "#e8f0fe",
      iconColor: "#2f6fed",
      overview: {
        title: "Ministry of Education",
        totalPolicies: 10,
        activePolicies: 8,
        pendingPolicies: 1,
        rejectedPolicies: 1,
        totalSchemes: 5,
        activeSchemes: 4,
        pendingSchemes: 1,
        rejectedSchemes: 0,
      },
    },
  ];

  const mockDeptResponse: AdminDepartmentAnalyticsResponse = {
    departments_list: mockDeptsList,
    all_departments_list: mockDeptsList,
    selected_overview: mockDeptsList[0].overview,
    month_labels: ["Jan", "Feb", "Mar"],
    trend_datasets: [
      { label: "Policies", data: [5, 10, 15], borderColor: "#2f6fed" },
      { label: "Schemes", data: [3, 6, 9], borderColor: "#3cb371" },
    ],
    top_by_policies: [
      { label: "Agriculture", value: 15 },
      { label: "Education", value: 10 },
    ],
    top_by_schemes: [
      { label: "Agriculture", value: 10 },
      { label: "Education", value: 5 },
    ],
    performance_table: [
      {
        rank: 1,
        name: "Agriculture & Farmers Welfare",
        totalPolicies: 15,
        activePolicies: 12,
        pendingPolicies: 2,
        rejectedPolicies: 1,
        totalSchemes: 10,
        activeSchemes: 8,
        pendingSchemes: 1,
        rejectedSchemes: 1,
        totalViews: 24,
        lastUpdated: "Recently",
      },
    ],
    view_totals: { policy_views: 30, scheme_views: 18, total_views: 48 },
  };

  beforeEach(async () => {
    mockDataService = {
      isSampleData: false,
      getAdminDepartmentAnalytics: (_search?: string, deptId?: string) => {
        const matched = mockDeptsList.find((d) => d.id === deptId) || mockDeptsList[0];
        return of({
          ...mockDeptResponse,
          selected_overview: matched.overview,
        });
      },
      downloadReport: () => of(new Blob(["test"], { type: "application/pdf" })),
    };

    await TestBed.configureTestingModule({
      imports: [DepartmentAnalyticsComponent],
      providers: [
        provideRouter([]),
        { provide: AdminAnalyticsDataService, useValue: mockDataService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DepartmentAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create DepartmentAnalyticsComponent", () => {
    expect(component).toBeTruthy();
  });

  it("should render 4 metric cards", () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector(".page-title")?.textContent).toContain(
      "Department Analytics",
    );
    expect(
      compiled.querySelectorAll(".top-cards-grid .metric-card").length,
    ).toBe(4);
  });

  it("should filter departments based on search query", () => {
    const event = { target: { value: "Edu" } } as unknown as Event;
    component.updateSearch(event);
    expect(component.searchQuery()).toBe("Edu");
    expect(component.showResults()).toBe(true);
    expect(component.filteredDepartments().length).toBeGreaterThan(0);
    expect(component.filteredDepartments()[0].name).toContain("Education");
  });

  it("should match departments by id or overview title", () => {
    const event = { target: { value: "ministry" } } as unknown as Event;
    component.updateSearch(event);
    const items = component.filteredDepartments();
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((d) => d.name)).toContain("Agriculture");
    expect(
      items.every((d) => d.overview.title.toLowerCase().includes("ministry")),
    ).toBe(true);
  });

  it("should show an empty state when nothing matches", () => {
    const event = { target: { value: "zzz-no-such-dept" } } as unknown as Event;
    component.updateSearch(event);
    expect(component.showResults()).toBe(true);
    expect(component.filteredDepartments().length).toBe(0);
  });

  it("should select a department and close the results panel", () => {
    const targetDept = component.departmentsList[2]; // Education
    component.selectDepartmentAndClose(targetDept);
    expect(component.selectedDept().id).toBe("education");
    expect(component.currentOverview().title).toBe(targetDept.overview.title);
    expect(component.resultsOpen()).toBe(false);
  });

  it("should clear the search and restore the default view", () => {
    component.selectDepartment(component.departmentsList[2]);
    const event = { target: { value: "health" } } as unknown as Event;
    component.updateSearch(event);
    component.clearSearch();
    expect(component.searchQuery()).toBe("");
    expect(component.showResults()).toBe(false);
    expect(component.filteredDepartments().length).toBe(
      component.departmentsList.length,
    );
    expect(component.selectedDept().id).toBe("all");
  });

  it("should select department and update overview", () => {
    const targetDept = component.departmentsList[1]; // Agriculture
    component.selectDepartment(targetDept);
    expect(component.selectedDept().id).toBe("agriculture");
    expect(component.currentOverview().title).toBe(targetDept.overview.title);
  });

  it("should open and close details modal", () => {
    const row = component.tableRows[0];
    component.viewDepartmentDetails(row);
    expect(component.selectedRowDepartment()).toBe(row);

    component.closeDetailsModal();
    expect(component.selectedRowDepartment()).toBeNull();
  });
});