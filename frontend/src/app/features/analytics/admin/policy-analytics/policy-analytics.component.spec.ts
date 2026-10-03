import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import { PolicyAnalyticsComponent } from "./policy-analytics.component";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";

describe("PolicyAnalyticsComponent", () => {
  let component: PolicyAnalyticsComponent;
  let fixture: ComponentFixture<PolicyAnalyticsComponent>;
  let mockDataService: any;

  const mockStats = [
    { label: "Total Policies", value: "15", change: "+0%", isPositive: true },
    { label: "Approved Policies", value: "10", change: "+0%", isPositive: true },
    { label: "Pending Policies", value: "3", change: "+0%", isPositive: true },
    { label: "Rejected Policies", value: "1", change: "+0%", isPositive: true },
    { label: "Archived Policies", value: "1", change: "+0%", isPositive: true },
  ];

  const mockPolicies = [
    {
      title: "National Education Policy",
      ministry: "Education",
      state: "All India",
      category: "Education",
      status: "Approved",
      date: "Sep 30, 2024",
    },
    {
      title: "PM-KISAN",
      ministry: "Agriculture",
      state: "All India",
      category: "Agriculture",
      status: "Approved",
      date: "Sep 29, 2024",
    },
  ];

  beforeEach(async () => {
    mockDataService = {
      isSampleData: false,
      getAdminPolicyAnalytics: (filters?: Record<string, string>) => {
        const latest =
          filters?.["status"] === "Approved"
            ? mockPolicies.filter((p) => p.status === "Approved")
            : mockPolicies;
        return of({
          stats: mockStats,
          by_category: [
            { label: "Education", percentage: 50 },
            { label: "Agriculture", percentage: 50 },
          ],
          trend: { labels: ["Jan"], series: [] },
          by_state: [{ label: "Delhi", value: 5 }],
          by_ministry: [{ label: "Education", value: 8 }],
          latest_policies: latest,
        });
      },
      downloadReport: () => of(new Blob(["test"], { type: "application/pdf" })),
    };

    await TestBed.configureTestingModule({
      imports: [PolicyAnalyticsComponent],
      providers: [
        provideRouter([]),
        { provide: AdminAnalyticsDataService, useValue: mockDataService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PolicyAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create PolicyAnalyticsComponent", () => {
    expect(component).toBeTruthy();
  });

  it("should render page title and stat cards", () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector(".page-title")?.textContent).toContain(
      "Policy Analytics",
    );
    expect(compiled.querySelectorAll(".stat-card").length).toBe(5);
  });

  it("should apply and reset filters", () => {
    component.onApplyFilters({ status: "Approved" });
    expect(component.activeFilters()).toEqual({ status: "Approved" });
    expect(
      component.latestPolicies().every((p) => p.status === "Approved"),
    ).toBe(true);

    component.onResetFilters();
    expect(component.activeFilters()).toEqual({});
  });

  it("should return correct chip classes for status", () => {
    expect(component.getStatusChipClass("Approved")).toBe("chip-green");
    expect(component.getStatusChipClass("Pending")).toBe("chip-orange");
    expect(component.getStatusChipClass("Rejected")).toBe("chip-red");
    expect(component.getStatusChipClass("Draft")).toBe("chip-gray");
  });
});
