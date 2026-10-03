import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import { AdminDashboardComponent } from "./admin-dashboard.component";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";
import { AdminOverviewResponse } from "../models/admin-analytics.models";

describe("AdminDashboardComponent", () => {
  let component: AdminDashboardComponent;
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let mockDataService: any;

  const mockOverview: AdminOverviewResponse = {
    metrics: [
      { label: "Total Users", value: "34", change: "+0%", isPositive: true },
      { label: "Total Policies", value: "15", change: "+0%", isPositive: true },
      { label: "Total Schemes", value: "12", change: "+0%", isPositive: true },
      { label: "Approved Policies", value: "10", change: "+0%", isPositive: true },
      { label: "Pending Policies", value: "3", change: "+0%", isPositive: true },
      { label: "Rejected Policies", value: "1", change: "+0%", isPositive: true },
      { label: "Active Schemes", value: "9", change: "+0%", isPositive: true },
      { label: "Total Notifications", value: "362", change: "+0%", isPositive: true },
    ],
    policyStatusTrend: {
      labels: ["Jul", "Aug", "Sep"],
      series: [{ label: "Approved", data: [8, 9, 10], color: "#3cb371" }],
    },
    schemesByCategory: [{ label: "Agriculture", percentage: 50, count: 6 }],
    userDistribution: {
      labels: ["Citizens (70%)"],
      data: [24],
      colors: ["#2f6fed"],
      total: "34",
    },
    recentActivities: [],
    notifications: [],
  };

  beforeEach(async () => {
    mockDataService = {
      isSampleData: false,
      getAdminOverview: (timeframe?: string) => {
        if (timeframe === "Last 6 Months") {
          return of({
            ...mockOverview,
            policyStatusTrend: {
              labels: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
              series: [{ label: "Approved", data: [5, 6, 7, 8, 9, 10], color: "#3cb371" }],
            },
          });
        }
        return of(mockOverview);
      },
    };

    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AdminAnalyticsDataService, useValue: mockDataService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create AdminDashboardComponent", () => {
    expect(component).toBeTruthy();
  });

  it("should render page title without sample data badge", () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector(".page-title")?.textContent).toContain("Admin Analytics Dashboard");
    expect(compiled.querySelector(".sample-data-badge")).toBeFalsy();
  });

  it("should switch timeframe correctly and update trend labels", () => {
    component.selectTimeframe("Last 3 Months");
    expect(component.trendTimeframe()).toBe("Last 3 Months");
    expect(component.trendLabels).toEqual(["Jul", "Aug", "Sep"]);

    component.selectTimeframe("Last 6 Months");
    expect(component.trendTimeframe()).toBe("Last 6 Months");
    expect(component.trendLabels.length).toBe(6);
  });

  it("should update currentRange on date range change", () => {
    component.onDateRangeChange("Custom Range");
    expect(component.currentRange()).toBe("Custom Range");
  });
});
