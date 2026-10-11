import { TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { firstValueFrom } from "rxjs";
import { AdminAnalyticsDataService } from "./admin-analytics-data.service";
import {
  AdminOverviewResponse,
  AdminPolicyAnalyticsResponse,
  AdminSchemeAnalyticsResponse,
  AdminUserAnalyticsResponse,
  AdminDepartmentAnalyticsResponse,
  AdminUsageStatisticsResponse,
} from "../models/admin-analytics.models";

describe("AdminAnalyticsDataService", () => {
  let service: AdminAnalyticsDataService;
  let httpMock: HttpTestingController;
  const baseUrl = "http://localhost:8000/analytics/admin";

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AdminAnalyticsDataService],
    });
    service = TestBed.inject(AdminAnalyticsDataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("should be created and indicate real backend data mode", () => {
    expect(service).toBeTruthy();
    expect(service.isSampleData).toBe(false);
  });

  it("should fetch admin overview analytics with caching", async () => {
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
        labels: ["Jan", "Feb", "Mar"],
        series: [{ label: "Approved", data: [5, 7, 10], color: "#3cb371" }],
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

    const promise1 = firstValueFrom(service.getAdminOverview("Last 9 Months"));
    const req1 = httpMock.expectOne(
      (r) =>
        r.url === `${baseUrl}/overview` &&
        r.params.get("timeframe") === "Last 9 Months" &&
        r.params.has("start_date") &&
        r.params.has("end_date"),
    );
    expect(req1.request.method).toBe("GET");
    req1.flush(mockOverview);

    const res1 = await promise1;
    expect(res1.metrics.length).toBe(8);
    expect(res1.metrics[0].value).toBe("34");

    // Second call with same params should hit memory cache (no HTTP request)
    const promise2 = firstValueFrom(service.getAdminOverview("Last 9 Months"));
    const res2 = await promise2;
    expect(res2.metrics.length).toBe(8);
    httpMock.expectNone(
      (r) =>
        r.url === `${baseUrl}/overview` &&
        r.params.get("timeframe") === "Last 9 Months",
    );
  });

  it("should fetch policy analytics with filters", async () => {
    const mockPolicies: AdminPolicyAnalyticsResponse = {
      stats: [{ label: "Total Policies", value: "15", change: "+0%", isPositive: true }],
      by_category: [{ label: "Agriculture", percentage: 40 }],
      trend: { labels: ["Jan"], series: [] },
      by_state: [{ label: "Delhi", value: 5 }],
      by_ministry: [{ label: "Ministry of Agriculture", value: 8 }],
      latest_policies: [
        {
          title: "PM-KISAN Guidelines",
          ministry: "Ministry of Agriculture",
          state: "All India",
          category: "Agriculture",
          status: "Approved",
          date: "Sep 30, 2024",
        },
      ],
    };

    const promise = firstValueFrom(service.getAdminPolicyAnalytics({ status: "APPROVED" }));
    const req = httpMock.expectOne(
      (r) =>
        r.url === `${baseUrl}/policies` &&
        r.params.get("status") === "APPROVED" &&
        r.params.has("start_date") &&
        r.params.has("end_date"),
    );
    expect(req.request.method).toBe("GET");
    req.flush(mockPolicies);

    const res = await promise;
    expect(res.stats.length).toBe(1);
    expect(res.latest_policies.length).toBe(1);
    expect(res.latest_policies[0].status).toBe("Approved");
  });

  it("should fetch scheme analytics", async () => {
    const mockSchemes: AdminSchemeAnalyticsResponse = {
      stats: [{ label: "Total Schemes", value: "12", change: "+0%", isPositive: true }],
      by_category: [{ label: "Education", percentage: 30 }],
      trend: { labels: ["Jan"], series: [] },
      by_state: [{ label: "Maharashtra", value: 4 }],
      top_schemes: [
        { rank: 1, name: "National Scholarship Portal", ministry: "Education", views: 0, applications: 0 },
      ],
      recent_updates: [],
    };

    const promise = firstValueFrom(service.getAdminSchemeAnalytics());
    const req = httpMock.expectOne(
      (r) =>
        r.url === `${baseUrl}/schemes` &&
        r.params.has("start_date") &&
        r.params.has("end_date"),
    );
    expect(req.request.method).toBe("GET");
    req.flush(mockSchemes);

    const res = await promise;
    expect(res.stats[0].value).toBe("12");
    expect(res.top_schemes[0].rank).toBe(1);
  });

  it("should fetch user analytics", async () => {
    const mockUsers: AdminUserAnalyticsResponse = {
      kpis: [{ label: "Total Users", value: "34", change: "+0%", isPositive: true, icon: "people", iconClass: "blue" }],
      growth_trend: { labels: ["Jan"], series: [] },
      role_distribution: { labels: [], data: [], colors: [], total: "34" },
      registration_trend: { labels: [], values: [] },
      users_by_state: { labels: ["Delhi"], values: [10] },
      engagement_metrics: [],
      heatmap: { days: ["Mon"], times: ["12 AM"], cells: [] },
      recent_registered_users: [],
      top_active_users: [],
    };

    const promise = firstValueFrom(service.getAdminUserAnalytics());
    const req = httpMock.expectOne(
      (r) => r.url === `${baseUrl}/users` && r.params.has("growth_period"),
    );
    expect(req.request.method).toBe("GET");
    req.flush(mockUsers);

    const res = await promise;
    expect(res.kpis[0].value).toBe("34");
  });

  it("should fetch department analytics", async () => {
    const mockDepts: AdminDepartmentAnalyticsResponse = {
      departments_list: [
        {
          id: "all",
          name: "All Departments",
          count: 5,
          icon: "account_balance",
          iconBg: "#e8f0fe",
          iconColor: "#2f6fed",
          overview: {
            title: "All Departments",
            totalPolicies: 15,
            activePolicies: 10,
            pendingPolicies: 3,
            rejectedPolicies: 1,
            totalSchemes: 12,
            activeSchemes: 9,
            pendingSchemes: 2,
            rejectedSchemes: 1,
          },
        },
      ],
      all_departments_list: [],
      selected_overview: {
        title: "All Departments",
        totalPolicies: 15,
        activePolicies: 10,
        pendingPolicies: 3,
        rejectedPolicies: 1,
        totalSchemes: 12,
        activeSchemes: 9,
        pendingSchemes: 2,
        rejectedSchemes: 1,
      },
      month_labels: ["Jan", "Feb"],
      trend_datasets: [],
      top_by_policies: [],
      top_by_schemes: [],
      performance_table: [],
    };

    const promise = firstValueFrom(service.getAdminDepartmentAnalytics());
    const req = httpMock.expectOne(
      (r) =>
        r.url === `${baseUrl}/departments` &&
        r.params.get("selected_department") === "all" &&
        r.params.has("start_date") &&
        r.params.has("end_date"),
    );
    expect(req.request.method).toBe("GET");
    req.flush(mockDepts);

    const res = await promise;
    expect(res.departments_list.length).toBe(1);
    expect(res.departments_list[0].id).toBe("all");
  });

  it("should fetch usage statistics", async () => {
    const mockUsage: AdminUsageStatisticsResponse = {
      kpis: [{ label: "Total Searches", value: "4", change: "+0%", isPositive: true, icon: "search", iconClass: "blue" }],
      activity_trend: { labels: ["Jan"], series: [] },
      daily_usage: { labels: ["Day 1"], values: [2] },
      role_distribution: { labels: [], data: [], colors: [], total: "34" },
      top_policies: [],
      top_schemes: [],
      most_active_users: [],
      recent_searches: [],
    };

    const promise = firstValueFrom(service.getAdminUsageStatistics());
    const req = httpMock.expectOne(
      (r) => r.url === `${baseUrl}/usage` && r.params.has("activity_period"),
    );
    expect(req.request.method).toBe("GET");
    req.flush(mockUsage);

    const res = await promise;
    expect(res.kpis[0].value).toBe("4");
  });

  it("should drop frontend All defaults from policy filters", async () => {
    const mockPolicies: AdminPolicyAnalyticsResponse = {
      stats: [],
      by_category: [],
      trend: { labels: [], series: [] },
      by_state: [],
      by_ministry: [],
      latest_policies: [],
    };
    const promise = firstValueFrom(
      service.getAdminPolicyAnalytics({
        state: "All States",
        category: "All Categories",
        ministry: "All Ministries",
        department: "All Departments",
        status: "All Status",
      }),
    );
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/policies`);
    expect(req.request.method).toBe("GET");
    // Frontend "All ..." defaults are dropped; only the global range bounds remain.
    for (const key of ["state", "category", "ministry", "department", "status"]) {
      expect(req.request.params.has(key)).toBe(false);
    }
    expect(req.request.params.has("start_date")).toBe(true);
    expect(req.request.params.has("end_date")).toBe(true);
    req.flush(mockPolicies);
    const res = await promise;
    expect(res.stats.length).toBe(0);
  });

  it("should generate a downloadable report via POST /reports/generate", async () => {
    const reportsUrl = "http://localhost:8000/reports";
    const blobPromise = firstValueFrom(
      service.downloadReport("POLICY_REPORT", "PDF", "Policy Analytics Report", { state: "Delhi" }),
    );
    const req = httpMock.expectOne(`${reportsUrl}/generate`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body.report_type).toBe("POLICY_REPORT");
    expect(req.request.body.report_format).toBe("PDF");
    req.flush(new Blob(["%PDF-test"], { type: "application/pdf" }));

    const blob = await blobPromise;
    expect(blob).toBeTruthy();
    expect(blob.type).toBe("application/pdf");
  });
});
