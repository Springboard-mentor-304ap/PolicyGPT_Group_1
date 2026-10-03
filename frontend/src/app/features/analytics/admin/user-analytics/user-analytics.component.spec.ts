import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import { UserAnalyticsComponent } from "./user-analytics.component";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";

describe("UserAnalyticsComponent", () => {
  let component: UserAnalyticsComponent;
  let fixture: ComponentFixture<UserAnalyticsComponent>;
  let mockDataService: any;

  const mockKpis = [
    {
      label: "Total Users",
      value: "5,820",
      change: "+12%",
      isPositive: true,
      icon: "people",
      iconClass: "blue",
    },
    {
      label: "Active Users",
      value: "4,320",
      change: "+8%",
      isPositive: true,
      icon: "person",
      iconClass: "green",
    },
    {
      label: "New Users",
      value: "340",
      change: "+15%",
      isPositive: true,
      icon: "person_add",
      iconClass: "orange",
    },
    {
      label: "Govt. Officials",
      value: "640",
      change: "+5%",
      isPositive: true,
      icon: "badge",
      iconClass: "purple",
    },
    {
      label: "Organizations",
      value: "290",
      change: "+10%",
      isPositive: true,
      icon: "business",
      iconClass: "teal",
    },
    {
      label: "Researchers",
      value: "410",
      change: "+7%",
      isPositive: true,
      icon: "science",
      iconClass: "pink",
    },
  ];

  const mockGrowthTrend = (period: string) => ({
    labels: period.includes("6")
      ? ["Apr", "May", "Jun", "Jul", "Aug", "Sep"]
      : ["Jan", "Feb", "Mar"],
    series: [
      { label: "Citizens", data: [10, 20, 30], color: "#2f6fed" },
      { label: "Officials", data: [2, 4, 6], color: "#3cb371" },
      { label: "Researchers", data: [1, 2, 3], color: "#8b5cf6" },
    ],
  });

  const mockRoleDist = {
    labels: ["Citizen", "Official", "Researcher", "Org", "Admin"],
    data: [70, 15, 8, 5, 2],
    colors: ["#2f6fed", "#3cb371", "#8b5cf6", "#f5a524", "#e5484d"],
    total: "5,820",
  };

  const mockRegTrend = {
    labels: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
    values: [40, 50, 60, 70, 80, 90],
  };

  const mockStates = {
    labels: [
      "Uttar Pradesh",
      "Maharashtra",
      "Tamil Nadu",
      "Karnataka",
      "Gujarat",
      "Rajasthan",
      "West Bengal",
      "Madhya Pradesh",
      "Delhi",
      "Kerala",
    ],
    values: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10],
  };

  const mockEngagement = [
    {
      label: "Total Logins",
      value: "12,450",
      change: "+14%",
      isPositive: true,
      icon: "login",
      iconClass: "blue",
    },
    {
      label: "Search Queries",
      value: "28,900",
      change: "+22%",
      isPositive: true,
      icon: "search",
      iconClass: "purple",
    },
    {
      label: "Reports Generated",
      value: "3,120",
      change: "+8%",
      isPositive: true,
      icon: "description",
      iconClass: "orange",
    },
    {
      label: "Notifications Sent",
      value: "45,600",
      change: "+18%",
      isPositive: true,
      icon: "notifications",
      iconClass: "green",
    },
  ];

  const mockHeatmap = {
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    times: ["12 AM", "3 AM", "6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"],
    cells: Array.from({ length: 56 }, (_, i) => ({
      day: "Mon",
      time: "12 AM",
      hour: 0,
      dayIndex: 0,
      value: 5,
      level: 1,
    })),
  };

  const mockRecentUsers = [
    {
      rank: 1,
      name: "Rahul Sharma",
      email: "rahul@gov.in",
      role: "Govt. Official",
      state: "Delhi",
      joinDate: "Sep 30, 2024",
    },
    {
      rank: 2,
      name: "Priya Patel",
      email: "priya@example.com",
      role: "Citizen",
      state: "Gujarat",
      joinDate: "Sep 29, 2024",
    },
  ];

  const mockActiveUsers = [
    {
      rank: 1,
      name: "Dr. Ananya Roy",
      role: "Researcher",
      logins: 45,
      searches: 120,
      lastActive: "2 mins ago",
    },
  ];

  beforeEach(async () => {
    mockDataService = {
      isSampleData: false,
      getAdminUserAnalytics: (params?: Record<string, string>) => {
        const sixMonth = (params?.["growth_period"] ?? "").includes("6");
        const labels6 = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
        const labels3 = ["Jan", "Feb", "Mar"];
        const labels = sixMonth ? labels6 : labels3;
        const data = (base: number[]) => (sixMonth ? [...base, ...base] : base);
        return of({
          kpis: mockKpis,
          growth_trend: {
            labels,
            series: [
              { label: "Citizens", data: data([10, 20, 30]), color: "#2f6fed" },
              { label: "Officials", data: data([2, 4, 6]), color: "#3cb371" },
              { label: "Researchers", data: data([1, 2, 3]), color: "#8b5cf6" },
            ],
          },
          role_distribution: mockRoleDist,
          registration_trend: mockRegTrend,
          users_by_state: mockStates,
          engagement_metrics: mockEngagement,
          heatmap: mockHeatmap,
          recent_registered_users: mockRecentUsers,
          top_active_users: mockActiveUsers,
        });
      },
      downloadReport: () => of(new Blob(["test"], { type: "application/pdf" })),
    };

    await TestBed.configureTestingModule({
      imports: [UserAnalyticsComponent],
      providers: [
        provideRouter([]),
        { provide: AdminAnalyticsDataService, useValue: mockDataService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should load 6 KPI cards", () => {
    expect(component.kpis().length).toBe(6);
    expect(component.kpis()[0].label).toBe("Total Users");
    expect(component.kpis()[0].value).toBe("5,820");
  });

  it("should load user growth trend datasets", () => {
    expect(component.growthDatasets().length).toBe(3);
    expect(component.growthLabels().length).toBeGreaterThan(0);
  });

  it("should update growth period when changed", () => {
    component.setGrowthPeriod("Last 6 Months");
    expect(component.growthPeriod()).toBe("Last 6 Months");
    expect(component.growthLabels().length).toBe(6);
  });

  it("should load user distribution by role", () => {
    expect(component.roleLabels().length).toBe(5);
    expect(component.roleTotal()).toBe("5,820");
  });

  it("should load registration trend values", () => {
    expect(component.regLabels().length).toBe(6);
    expect(component.regValues().length).toBe(6);
  });

  it("should load users by state", () => {
    expect(component.stateLabels().length).toBe(10);
    expect(component.stateLabels()[0]).toBe("Uttar Pradesh");
  });

  it("should load 4 engagement metrics", () => {
    expect(component.engagementMetrics().length).toBe(4);
    expect(component.engagementMetrics()[0].label).toBe("Total Logins");
  });

  it("should load activity heatmap grid", () => {
    expect(component.heatmapDays().length).toBe(7);
    expect(component.heatmapTimes().length).toBe(8);
    expect(component.heatmapCells().length).toBe(56);
  });

  it("should load recent registered users and top active users", () => {
    expect(component.recentUsers().length).toBeGreaterThan(0);
    expect(component.topActiveUsers().length).toBeGreaterThan(0);
  });

  it("should handle open and close modal", () => {
    component.openModal("recent");
    expect(component.activeModal()).toBe("recent");
    component.closeModal();
    expect(component.activeModal()).toBeNull();
  });

  it("should filter recent users by search term", () => {
    component.modalSearchTerm.set("Rahul");
    expect(component.filteredRecentUsers().length).toBe(1);
    expect(component.filteredRecentUsers()[0].name).toBe("Rahul Sharma");
  });

  it("should return correct role badge class", () => {
    expect(component.getRoleBadgeClass("Citizen")).toBe("badge-citizen");
    expect(component.getRoleBadgeClass("Govt. Official")).toBe(
      "badge-official",
    );
    expect(component.getRoleBadgeClass("Researcher")).toBe("badge-researcher");
    expect(component.getRoleBadgeClass("Organization")).toBe(
      "badge-organization",
    );
  });
});
