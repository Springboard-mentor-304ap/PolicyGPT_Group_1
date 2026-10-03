import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import { UsageStatisticsComponent } from "./usage-statistics.component";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";

describe("UsageStatisticsComponent", () => {
  let component: UsageStatisticsComponent;
  let fixture: ComponentFixture<UsageStatisticsComponent>;
  let mockDataService: any;

  const mockKpis = [
    { label: "Total Visits", value: "50,240", change: "+15%", isPositive: true, icon: "visibility", iconClass: "blue" },
    { label: "Total Searches", value: "28,450", change: "+20%", isPositive: true, icon: "search", iconClass: "purple" },
    { label: "Policy Views", value: "18,500", change: "+12%", isPositive: true, icon: "description", iconClass: "green" },
    { label: "Scheme Views", value: "22,000", change: "+18%", isPositive: true, icon: "folder", iconClass: "teal" },
    { label: "Eligibility Checks", value: "12,800", change: "+8%", isPositive: true, icon: "rule", iconClass: "orange" },
    { label: "Document Downloads", value: "5,600", change: "+25%", isPositive: true, icon: "download", iconClass: "red" },
  ];

  const mockActivityTrend = (period: string) => ({
    labels: period.includes("6") ? ["Apr", "May", "Jun", "Jul", "Aug", "Sep"] : ["Jan", "Feb", "Mar"],
    series: [
      { label: "Searches", data: [10, 20, 30], color: "#2f6fed" },
      { label: "Views", data: [15, 25, 35], color: "#3cb371" },
      { label: "Checks", data: [5, 10, 15], color: "#f5a524" },
      { label: "Downloads", data: [2, 4, 6], color: "#e5484d" },
    ],
  });

  const mockDailyUsage = (range: string) => ({
    labels: range.includes("7") ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Day 1", "Day 2"],
    values: range.includes("7") ? [10, 20, 30, 40, 50, 60, 70] : [100, 200],
  });

  const mockPolicies = [
    { rank: 1, title: "National Education Policy 2020", searches: "5,420", trend: "+12%", isPositive: true },
    { rank: 2, title: "Higher Education Policy Guidelines", searches: "4,120", trend: "+8%", isPositive: true },
    ...Array.from({ length: 10 }, (_, i) => ({
      rank: i + 3,
      title: `Policy ${i + 3}`,
      searches: "1,000",
      trend: "+5%",
      isPositive: true,
    })),
  ];

  const mockSchemes = [
    { rank: 1, title: "PM Kisan Samman Nidhi", searches: "8,920", trend: "+18%", isPositive: true },
    ...Array.from({ length: 11 }, (_, i) => ({
      rank: i + 2,
      title: `Scheme ${i + 2}`,
      searches: "1,200",
      trend: "+4%",
      isPositive: true,
    })),
  ];

  const mockSearches = [
    { rank: 1, user: "Rahul", query: "kisan scheme", type: "Scheme", dateTime: "Sep 30, 2024" },
    { rank: 2, user: "Priya", query: "education policy", type: "Policy", dateTime: "Sep 29, 2024" },
  ];

  beforeEach(async () => {
    mockDataService = {
      isSampleData: false,
      getAdminUsageStatistics: (params?: Record<string, string>) => {
        const sixMonth = (params?.["activity_period"] ?? "").includes("6");
        const sevenDay = (params?.["daily_period"] ?? "").includes("7");
        return of({
          kpis: mockKpis,
          activity_trend: mockActivityTrend(
            sixMonth ? "Last 6 Months" : "Last 12 Months",
          ),
          daily_usage: mockDailyUsage(
            sevenDay ? "Last 7 Days" : "Last 30 Days",
          ),
          role_distribution: {
            labels: [],
            data: [],
            colors: [],
            total: "5,820",
          },
          top_policies: mockPolicies,
          top_schemes: mockSchemes,
          most_active_users: [
            { rank: 1, user: "User 1", role: "Citizen", activities: "150" },
          ],
          recent_searches: mockSearches,
        });
      },
      downloadReport: () => of(new Blob(["test"], { type: "application/pdf" })),
    };

    await TestBed.configureTestingModule({
      imports: [UsageStatisticsComponent],
      providers: [
        provideRouter([]),
        { provide: AdminAnalyticsDataService, useValue: mockDataService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsageStatisticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should load 6 KPI cards", () => {
    expect(component.kpis().length).toBe(6);
    expect(component.kpis()[0].label).toBe("Total Visits");
    expect(component.kpis()[0].value).toBe("50,240");
  });

  it("should load activity trend with 4 series", () => {
    expect(component.activityDatasets().length).toBe(4);
    expect(component.activityLabels().length).toBeGreaterThan(0);
  });

  it("should update activity trend period", () => {
    component.setActivityPeriod("Last 6 Months");
    expect(component.activityTrendPeriod()).toBe("Last 6 Months");
    expect(component.activityLabels().length).toBe(6);
  });

  it("should load daily usage values", () => {
    expect(component.dailyLabels().length).toBeGreaterThan(0);
    expect(component.dailyValues().length).toBeGreaterThan(0);
  });

  it("should update daily usage period", () => {
    component.setDailyPeriod("Last 7 Days");
    expect(component.dailyUsagePeriod()).toBe("Last 7 Days");
    expect(component.dailyLabels().length).toBe(7);
  });

  it("should load top searched policies and schemes", () => {
    expect(component.topPolicies().length).toBe(12);
    expect(component.topPolicies()[0].title).toBe("National Education Policy 2020");
    expect(component.topSchemes().length).toBe(12);
    expect(component.topSchemes()[0].title).toBe("PM Kisan Samman Nidhi");
  });

  it("should load most active users and recent search activities", () => {
    expect(component.mostActiveUsers().length).toBeGreaterThan(0);
    expect(component.recentSearches().length).toBeGreaterThan(0);
  });

  it("should open and close modal", () => {
    component.openModal("policies");
    expect(component.activeModal()).toBe("policies");
    component.closeModal();
    expect(component.activeModal()).toBeNull();
  });

  it("should filter policies in modal by search term", () => {
    component.modalSearchTerm.set("Education");
    expect(component.filteredPolicies().length).toBe(2);
  });

  it("should filter searches in modal by type", () => {
    component.modalTypeFilter.set("Scheme");
    expect(component.filteredSearches().every((s) => s.type === "Scheme")).toBe(true);
  });
});
