import { Injectable } from "@angular/core";
import { Observable, of } from "rxjs";
import { delay } from "rxjs/operators";
import {
  AnalyticsStat,
  CategorySlice,
  TrendData,
  BarChartData,
  PolicyRow,
  SchemeRow,
  SchemeUpdateRow,
  DepartmentItem,
  UserKpiCard,
  EngagementMetric,
  HeatmapCell,
  RecentRegisteredUser,
  TopActiveUser,
  UsageKpiCard,
  TopSearchedItem,
  MostActiveUserUsage,
  RecentSearchActivityItem,
} from "../models/admin-analytics.models";

@Injectable({
  providedIn: "root",
})
export class AdminAnalyticsDataService {
  // Flag indicating frontend sample data mode
  readonly isSampleData = true;

  // =========================================================
  // ADMIN OVERVIEW DATA
  // =========================================================

  getAdminAnalytics(_filters?: Record<string, string>): Observable<{
    totalUsers: number;
    activePolicies: number;
    totalSchemes: number;
    usageStats: { month: string; queries: number }[];
  }> {
    return of({
      totalUsers: 5820,
      activePolicies: 1250,
      totalSchemes: 438,
      usageStats: [
        { month: "Jan", queries: 400 },
        { month: "Feb", queries: 600 },
        { month: "Mar", queries: 800 },
      ],
    });
  }

  // =========================================================
  // POLICY ANALYTICS METHODS
  // =========================================================

  getPolicyAnalyticsStats(
    _filters?: Record<string, string>,
  ): Observable<AnalyticsStat[]> {
    return of([
      {
        label: "Total Policies",
        value: "1,250",
        change: "+8%",
        isPositive: true,
      },
      {
        label: "Approved Policies",
        value: "1,020",
        change: "+10%",
        isPositive: true,
      },
      {
        label: "Pending Policies",
        value: "85",
        change: "-5%",
        isPositive: true,
        goodWhenDown: true,
      },
      {
        label: "Rejected Policies",
        value: "42",
        change: "-12%",
        isPositive: true,
        goodWhenDown: true,
      },
      {
        label: "Archived Policies",
        value: "103",
        change: "+6%",
        isPositive: true,
      },
    ]);
  }

  getPoliciesByCategory(
    _filters?: Record<string, string>,
  ): Observable<CategorySlice[]> {
    return of([
      { label: "Education", percentage: 18 },
      { label: "Healthcare", percentage: 15 },
      { label: "Agriculture", percentage: 14 },
      { label: "Employment", percentage: 12 },
      { label: "Finance", percentage: 10 },
      { label: "Environment", percentage: 8 },
      { label: "Housing", percentage: 8 },
      { label: "Others", percentage: 15 },
    ]);
  }

  getPolicyStatusTrend(
    _filters?: Record<string, string>,
  ): Observable<TrendData> {
    return of({
      labels: [
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
      ],
      series: [
        {
          label: "Approved",
          data: [100, 110, 125, 130, 140, 135, 145, 150, 160, 165, 170, 175],
          color: "#3cb371",
        },
        {
          label: "Pending",
          data: [85, 90, 80, 75, 70, 65, 60, 55, 50, 48, 46, 45],
          color: "#f5a524",
        },
        {
          label: "Rejected",
          data: [25, 24, 22, 20, 18, 16, 15, 14, 12, 11, 10, 10],
          color: "#e5484d",
        },
        {
          label: "Archived",
          data: [5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 10],
          color: "#2f6fed",
        },
      ],
    });
  }

  getPoliciesByState(
    _filters?: Record<string, string>,
  ): Observable<BarChartData[]> {
    return of([
      { label: "Uttar Pradesh", value: 180 },
      { label: "Maharashtra", value: 150 },
      { label: "Bihar", value: 120 },
      { label: "West Bengal", value: 110 },
      { label: "Madhya Pradesh", value: 95 },
      { label: "Rajasthan", value: 80 },
      { label: "Tamil Nadu", value: 75 },
      { label: "Gujarat", value: 70 },
      { label: "Karnataka", value: 65 },
      { label: "Others", value: 105 },
    ]);
  }

  getPoliciesByMinistry(
    _filters?: Record<string, string>,
  ): Observable<BarChartData[]> {
    return of([
      { label: "Education", value: 180 },
      { label: "Health", value: 140 },
      { label: "Agriculture", value: 120 },
      { label: "Finance", value: 100 },
      { label: "Home Affairs", value: 90 },
      { label: "Rural Dev", value: 80 },
      { label: "Environment", value: 70 },
      { label: "Skill Dev", value: 60 },
      { label: "Women & Child", value: 50 },
      { label: "Others", value: 40 },
    ]);
  }

  getLatestPolicies(filters?: Record<string, string>): Observable<PolicyRow[]> {
    const list: PolicyRow[] = [
      {
        title: "National Education Policy 2024",
        ministry: "Ministry of Education",
        state: "All India",
        category: "Education",
        status: "Approved",
        date: "Sep 28, 2024",
      },
      {
        title: "Digital Agriculture Mission",
        ministry: "Ministry of Agriculture",
        state: "All India",
        category: "Agriculture",
        status: "Approved",
        date: "Sep 25, 2024",
      },
      {
        title: "Clean Air Rural Initiative",
        ministry: "Ministry of Environment",
        state: "Uttar Pradesh",
        category: "Environment",
        status: "Pending",
        date: "Sep 22, 2024",
      },
      {
        title: "Urban Housing Subsidy Norms",
        ministry: "Ministry of Housing",
        state: "Maharashtra",
        category: "Housing",
        status: "Rejected",
        date: "Sep 20, 2024",
      },
      {
        title: "National Apprenticeship Scheme",
        ministry: "Ministry of Skill Dev",
        state: "Delhi",
        category: "Employment",
        status: "Approved",
        date: "Sep 18, 2024",
      },
      {
        title: "PM Ayushman Bharat Expansion",
        ministry: "Ministry of Health",
        state: "All India",
        category: "Healthcare",
        status: "Approved",
        date: "Sep 15, 2024",
      },
      {
        title: "Credit Guarantee Scheme MSME",
        ministry: "Ministry of Finance",
        state: "Karnataka",
        category: "Finance",
        status: "Pending",
        date: "Sep 12, 2024",
      },
    ];

    if (!filters) {
      return of(list);
    }

    const filtered = list.filter((item) => {
      if (
        filters["state"] &&
        filters["state"] !== "All States" &&
        item.state !== "All India" &&
        item.state !== filters["state"]
      ) {
        return false;
      }
      if (
        filters["category"] &&
        filters["category"] !== "All Categories" &&
        item.category !== filters["category"]
      ) {
        return false;
      }
      if (
        filters["status"] &&
        filters["status"] !== "All Status" &&
        item.status !== filters["status"]
      ) {
        return false;
      }
      return true;
    });

    return of(filtered);
  }

  // =========================================================
  // SCHEME ANALYTICS METHODS
  // =========================================================

  getSchemeAnalyticsStats(
    _filters?: Record<string, string>,
  ): Observable<AnalyticsStat[]> {
    return of([
      {
        label: "Total Schemes",
        value: "438",
        change: "+15%",
        isPositive: true,
      },
      {
        label: "Active Schemes",
        value: "390",
        change: "+18%",
        isPositive: true,
      },
      {
        label: "Pending Schemes",
        value: "28",
        change: "-5%",
        isPositive: true,
        goodWhenDown: true,
      },
      {
        label: "Rejected Schemes",
        value: "10",
        change: "-12%",
        isPositive: true,
        goodWhenDown: true,
      },
      {
        label: "Archived Schemes",
        value: "10",
        change: "+8%",
        isPositive: true,
      },
    ]);
  }

  getSchemesByCategoryDetailed(
    _filters?: Record<string, string>,
  ): Observable<CategorySlice[]> {
    return of([
      { label: "Scholarships", percentage: 18 },
      { label: "Farmer Welfare", percentage: 16 },
      { label: "Healthcare", percentage: 14 },
      { label: "Housing", percentage: 12 },
      { label: "Business Support", percentage: 10 },
      { label: "Employment Programs", percentage: 8 },
      { label: "Women Empowerment", percentage: 8 },
      { label: "Senior Citizen Welfare", percentage: 7 },
      { label: "Social Security", percentage: 7 },
    ]);
  }

  getSchemeTrend(_filters?: Record<string, string>): Observable<TrendData> {
    return of({
      labels: [
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
      ],
      series: [
        {
          label: "New Schemes",
          data: [35, 36, 38, 40, 42, 41, 43, 44, 45, 44, 45, 45],
          color: "#3cb371",
        },
        {
          label: "Active Schemes",
          data: [40, 45, 50, 55, 60, 65, 70, 75, 78, 80, 82, 85],
          color: "#2f6fed",
        },
        {
          label: "Closed/Archived",
          data: [30, 28, 25, 22, 20, 18, 16, 15, 14, 12, 11, 10],
          color: "#f5a524",
        },
      ],
    });
  }

  getSchemesByState(
    _filters?: Record<string, string>,
  ): Observable<BarChartData[]> {
    return of([
      { label: "Uttar Pradesh", value: 72 },
      { label: "Maharashtra", value: 58 },
      { label: "Bihar", value: 46 },
      { label: "West Bengal", value: 38 },
      { label: "Madhya Pradesh", value: 32 },
      { label: "Rajasthan", value: 28 },
      { label: "Tamil Nadu", value: 26 },
      { label: "Gujarat", value: 24 },
      { label: "Karnataka", value: 22 },
      { label: "Others", value: 48 },
    ]);
  }

  getTopViewedSchemes(
    _filters?: Record<string, string>,
  ): Observable<SchemeRow[]> {
    return of([
      {
        rank: 1,
        name: "PM Kisan Samman Nidhi",
        ministry: "Ministry of Agriculture",
        views: 12450,
        applications: 3210,
      },
      {
        rank: 2,
        name: "Ayushman Bharat PM-JAY",
        ministry: "Ministry of Health",
        views: 10890,
        applications: 2840,
      },
      {
        rank: 3,
        name: "PM Awas Yojana (Urban)",
        ministry: "Ministry of Housing",
        views: 9540,
        applications: 2150,
      },
      {
        rank: 4,
        name: "National Means-cum-Merit Scholarship",
        ministry: "Ministry of Education",
        views: 8720,
        applications: 1920,
      },
      {
        rank: 5,
        name: "PM Mudra Yojana",
        ministry: "Ministry of Finance",
        views: 7890,
        applications: 1650,
      },
    ]);
  }

  getRecentSchemeUpdates(
    _filters?: Record<string, string>,
  ): Observable<SchemeUpdateRow[]> {
    return of([
      {
        title: "New Subsidy Guidelines for Farmers",
        ministry: "Agriculture",
        type: "Update",
        date: "Sep 28, 2024",
        status: "Active",
      },
      {
        title: "Scholarship Application Deadline Extended",
        ministry: "Education",
        type: "Notification",
        date: "Sep 27, 2024",
        status: "Active",
      },
      {
        title: "PM Vishwakarma Scheme Revision",
        ministry: "Skill Dev",
        type: "New Scheme",
        date: "Sep 25, 2024",
        status: "Active",
      },
      {
        title: "Health Insurance Coverage Expansion",
        ministry: "Health",
        type: "Update",
        date: "Sep 24, 2024",
        status: "Active",
      },
      {
        title: "Solar Rooftop Subsidy Portal Live",
        ministry: "Renewable Energy",
        type: "Notification",
        date: "Sep 22, 2024",
        status: "Active",
      },
    ]);
  }

  // =========================================================
  // DEPARTMENT ANALYTICS METHODS
  // =========================================================

  getDepartmentAnalytics(): Observable<{
    departments: { name: string; queries: number; policiesCount: number }[];
  }> {
    return of({
      departments: [
        { name: "Health & Family Welfare", queries: 1250, policiesCount: 14 },
        { name: "Education & Literacy", queries: 980, policiesCount: 22 },
        {
          name: "Agriculture & Farmers Welfare",
          queries: 870,
          policiesCount: 18,
        },
      ],
    });
  }

  getDepartmentsList(): Observable<DepartmentItem[]> {
    return of([
      {
        id: "all",
        name: "All Departments",
        count: 56,
        icon: "account_balance",
        iconBg: "#e8f0fe",
        iconColor: "#2f6fed",
        overview: {
          title: "All Government Ministries & Departments",
          totalPolicies: 1250,
          activePolicies: 1020,
          pendingPolicies: 85,
          rejectedPolicies: 42,
          totalSchemes: 438,
          activeSchemes: 390,
          pendingSchemes: 28,
          rejectedSchemes: 10,
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
    ]);
  }

  // =========================================================
  // USER ANALYTICS METHODS
  // =========================================================

  getUserKpis(): Observable<UserKpiCard[]> {
    return of([
      {
        label: "Total Users",
        value: "5,820",
        change: "↑ 18%",
        isPositive: true,
        subtext: "from last period",
        icon: "people",
        iconClass: "blue",
      },
      {
        label: "Active Users",
        value: "4,320",
        change: "↑ 22%",
        isPositive: true,
        subtext: "from last period",
        icon: "person",
        iconClass: "green",
      },
      {
        label: "New Users",
        value: "980",
        change: "↑ 15%",
        isPositive: true,
        subtext: "from last period",
        icon: "person_add",
        iconClass: "purple",
      },
      {
        label: "Government Officials",
        value: "640",
        change: "↑ 8%",
        isPositive: true,
        subtext: "from last period",
        icon: "groups",
        iconClass: "red",
      },
      {
        label: "Organizations",
        value: "290",
        change: "↑ 12%",
        isPositive: true,
        subtext: "from last period",
        icon: "business_center",
        iconClass: "orange",
      },
      {
        label: "Researchers",
        value: "410",
        change: "↑ 20%",
        isPositive: true,
        subtext: "from last period",
        icon: "school",
        iconClass: "blue-light",
      },
    ]);
  }

  getUserGrowthTrend(period: string = "Last 12 Months"): Observable<TrendData> {
    let labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let totalData = [520, 580, 620, 680, 720, 780, 810, 840, 890, 920, 950, 980];
    let activeData = [380, 420, 450, 490, 520, 560, 580, 610, 640, 670, 700, 720];
    let newData = [110, 130, 140, 160, 170, 180, 190, 200, 210, 220, 230, 240];

    if (period === "Last 6 Months") {
      labels = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      totalData = totalData.slice(6);
      activeData = activeData.slice(6);
      newData = newData.slice(6);
    } else if (period === "Last 3 Months") {
      labels = ["Oct", "Nov", "Dec"];
      totalData = totalData.slice(9);
      activeData = activeData.slice(9);
      newData = newData.slice(9);
    }

    return of({
      labels,
      series: [
        {
          label: "Total Users",
          data: totalData,
          color: "#3cb371",
        },
        {
          label: "Active Users",
          data: activeData,
          color: "#2563eb",
        },
        {
          label: "New Users",
          data: newData,
          color: "#f59e0b",
        },
      ],
    });
  }

  getUserRoleDistribution(): Observable<{
    labels: string[];
    data: number[];
    colors: string[];
    total: string;
  }> {
    return of({
      labels: [
        "Citizens (77%)",
        "Government Officials (11%)",
        "Researchers (7%)",
        "Organizations (5%)",
        "Administrators (1%)",
      ],
      data: [77, 11, 7, 5, 1],
      colors: ["#2563eb", "#3cb371", "#8b5cf6", "#f59e0b", "#ef4444"],
      total: "5,820",
    });
  }

  getUserRegistrationTrend(period: string = "Last 6 Months"): Observable<{
    labels: string[];
    values: number[];
  }> {
    if (period === "Last 3 Months") {
      return of({
        labels: ["Jul", "Aug", "Sep"],
        values: [178, 165, 210],
      });
    }

    return of({
      labels: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
      values: [120, 145, 162, 178, 165, 210],
    });
  }

  getUsersByState(count: number = 10): Observable<{
    labels: string[];
    values: number[];
  }> {
    const allStates = [
      { label: "Uttar Pradesh", value: 1020 },
      { label: "Maharashtra", value: 780 },
      { label: "Bihar", value: 520 },
      { label: "West Bengal", value: 410 },
      { label: "Madhya Pradesh", value: 380 },
      { label: "Rajasthan", value: 320 },
      { label: "Tamil Nadu", value: 280 },
      { label: "Gujarat", value: 260 },
      { label: "Karnataka", value: 240 },
      { label: "Others", value: 630 },
      { label: "Odisha", value: 210 },
      { label: "Telangana", value: 190 },
      { label: "Kerala", value: 180 },
      { label: "Punjab", value: 170 },
      { label: "Haryana", value: 160 },
    ];

    const slice = allStates.slice(0, count);
    return of({
      labels: slice.map((s) => s.label),
      values: slice.map((s) => s.value),
    });
  }

  getUserEngagementMetrics(): Observable<EngagementMetric[]> {
    return of([
      {
        label: "Total Logins",
        value: "42,850",
        change: "↑ 25%",
        isPositive: true,
        icon: "visibility",
        iconClass: "blue",
      },
      {
        label: "Total Searches",
        value: "28,450",
        change: "↑ 18%",
        isPositive: true,
        icon: "search",
        iconClass: "purple",
      },
      {
        label: "Policies Viewed",
        value: "18,500",
        change: "↑ 20%",
        isPositive: true,
        icon: "description",
        iconClass: "orange",
      },
      {
        label: "Schemes Viewed",
        value: "22,000",
        change: "↑ 22%",
        isPositive: true,
        icon: "folder",
        iconClass: "green",
      },
    ]);
  }

  getUserHeatmapData(_period: string = "Last 4 Weeks"): Observable<{
    days: string[];
    times: string[];
    cells: HeatmapCell[];
  }> {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const times = ["12 AM", "3 AM", "6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"];

    // 7 days x 8 time blocks = 56 cells with realistic intensities matching screenshot
    const pattern = [
      // Mon
      [1, 1, 2, 3, 4, 3, 2, 1],
      // Tue
      [1, 1, 2, 4, 4, 3, 2, 1],
      // Wed
      [1, 1, 2, 4, 3, 3, 2, 1],
      // Thu
      [1, 1, 2, 3, 4, 4, 3, 1],
      // Fri
      [1, 2, 2, 4, 4, 3, 2, 1],
      // Sat
      [1, 1, 1, 2, 3, 3, 2, 1],
      // Sun
      [0, 1, 1, 2, 2, 2, 1, 1],
    ];

    const cells: HeatmapCell[] = [];
    days.forEach((day, dIdx) => {
      times.forEach((time, tIdx) => {
        const level = pattern[dIdx][tIdx];
        const baseValue = level === 0 ? 12 : level === 1 ? 45 : level === 2 ? 110 : level === 3 ? 240 : 380;
        cells.push({
          day,
          time,
          hour: tIdx * 3,
          dayIndex: dIdx,
          value: baseValue + (dIdx * 3 + tIdx * 2),
          level,
        });
      });
    });

    return of({ days, times, cells });
  }

  getRecentRegisteredUsers(): Observable<RecentRegisteredUser[]> {
    return of([
      {
        rank: 1,
        name: "Rahul Sharma",
        email: "rahul@example.com",
        role: "Citizen",
        state: "Uttar Pradesh",
        joinDate: "Sep 29, 2024",
      },
      {
        rank: 2,
        name: "Priya Singh",
        email: "priya@example.com",
        role: "Researcher",
        state: "Delhi",
        joinDate: "Sep 29, 2024",
      },
      {
        rank: 3,
        name: "Amit Patel",
        email: "amit@example.com",
        role: "Govt. Official",
        state: "Gujarat",
        joinDate: "Sep 28, 2024",
      },
      {
        rank: 4,
        name: "Sneha Das",
        email: "sneha@example.com",
        role: "Citizen",
        state: "West Bengal",
        joinDate: "Sep 28, 2024",
      },
      {
        rank: 5,
        name: "Vikram Mehta",
        email: "vikram@example.com",
        role: "Organization",
        state: "Maharashtra",
        joinDate: "Sep 27, 2024",
      },
      {
        rank: 6,
        name: "Ananya Roy",
        email: "ananya@example.com",
        role: "Researcher",
        state: "Karnataka",
        joinDate: "Sep 26, 2024",
      },
      {
        rank: 7,
        name: "Rajesh Kumar",
        email: "rajesh@gov.in",
        role: "Govt. Official",
        state: "Rajasthan",
        joinDate: "Sep 25, 2024",
      },
      {
        rank: 8,
        name: "Pooja Hegde",
        email: "pooja@ngo.org",
        role: "Organization",
        state: "Tamil Nadu",
        joinDate: "Sep 24, 2024",
      },
    ]);
  }

  getTopActiveUsers(): Observable<TopActiveUser[]> {
    return of([
      {
        rank: 1,
        name: "rahul.kumar@example.com",
        email: "rahul.kumar@example.com",
        role: "Citizen",
        logins: 1250,
        searches: 980,
        lastActive: "Sep 30, 2024",
      },
      {
        rank: 2,
        name: "priya.singh@gov.in",
        email: "priya.singh@gov.in",
        role: "Govt. Official",
        logins: 980,
        searches: 760,
        lastActive: "Sep 30, 2024",
      },
      {
        rank: 3,
        name: "amit.patel@org.in",
        email: "amit.patel@org.in",
        role: "Organization",
        logins: 760,
        searches: 620,
        lastActive: "Sep 29, 2024",
      },
      {
        rank: 4,
        name: "neha.sharma@example.com",
        email: "neha.sharma@example.com",
        role: "Researcher",
        logins: 690,
        searches: 580,
        lastActive: "Sep 29, 2024",
      },
      {
        rank: 5,
        name: "arjun.mehta@univ.ac.in",
        email: "arjun.mehta@univ.ac.in",
        role: "Researcher",
        logins: 620,
        searches: 540,
        lastActive: "Sep 28, 2024",
      },
      {
        rank: 6,
        name: "sneha.das@example.com",
        email: "sneha.das@example.com",
        role: "Citizen",
        logins: 580,
        searches: 490,
        lastActive: "Sep 27, 2024",
      },
      {
        rank: 7,
        name: "vikram.jain@gov.in",
        email: "vikram.jain@gov.in",
        role: "Govt. Official",
        logins: 540,
        searches: 430,
        lastActive: "Sep 27, 2024",
      },
    ]);
  }

  // =========================================================
  // USAGE STATISTICS METHODS
  // =========================================================

  getUsageKpis(): Observable<UsageKpiCard[]> {
    return of([
      {
        label: "Total Visits",
        value: "50,240",
        change: "↑ 18%",
        isPositive: true,
        subtext: "from last period",
        icon: "people",
        iconClass: "blue",
      },
      {
        label: "Total Searches",
        value: "28,450",
        change: "↑ 12%",
        isPositive: true,
        subtext: "from last period",
        icon: "search",
        iconClass: "purple",
      },
      {
        label: "Policy Views",
        value: "18,500",
        change: "↑ 15%",
        isPositive: true,
        subtext: "from last period",
        icon: "description",
        iconClass: "orange",
      },
      {
        label: "Scheme Views",
        value: "22,000",
        change: "↑ 20%",
        isPositive: true,
        subtext: "from last period",
        icon: "folder",
        iconClass: "green",
      },
      {
        label: "Eligibility Checks",
        value: "12,800",
        change: "↑ 25%",
        isPositive: true,
        subtext: "from last period",
        icon: "check_circle",
        iconClass: "green-light",
      },
      {
        label: "Document Downloads",
        value: "5,600",
        change: "↑ 10%",
        isPositive: true,
        subtext: "from last period",
        icon: "download",
        iconClass: "blue-light",
      },
    ]);
  }

  getUserActivityTrend(period: string = "Last 12 Months"): Observable<TrendData> {
    let labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let visits = [4200, 4800, 5500, 6800, 6200, 7100, 7800, 7600, 7200, 7500, 8600, 8800];
    let searches = [2400, 3100, 3800, 4200, 3900, 4100, 4400, 4200, 3900, 4100, 4800, 4600];
    let policyViews = [1800, 2100, 2500, 2800, 2600, 2800, 2900, 2800, 2700, 2800, 3100, 3200];
    let schemeViews = [1200, 1400, 1600, 1800, 1700, 1900, 2100, 2000, 1900, 2100, 2200, 2300];

    if (period === "Last 6 Months") {
      labels = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      visits = visits.slice(6);
      searches = searches.slice(6);
      policyViews = policyViews.slice(6);
      schemeViews = schemeViews.slice(6);
    } else if (period === "Last 3 Months") {
      labels = ["Oct", "Nov", "Dec"];
      visits = visits.slice(9);
      searches = searches.slice(9);
      policyViews = policyViews.slice(9);
      schemeViews = schemeViews.slice(9);
    }

    return of({
      labels,
      series: [
        {
          label: "Visits",
          data: visits,
          color: "#2563eb",
        },
        {
          label: "Searches",
          data: searches,
          color: "#16a34a",
        },
        {
          label: "Policy Views",
          data: policyViews,
          color: "#f59e0b",
        },
        {
          label: "Scheme Views",
          data: schemeViews,
          color: "#8b5cf6",
        },
      ],
    });
  }

  getDailyUsage(range: string = "Last 30 Days"): Observable<{
    labels: string[];
    values: number[];
  }> {
    const fullLabels = [
      "Aug 21", "Aug 22", "Aug 23", "Aug 24", "Aug 25", "Aug 26", "Aug 27", "Aug 28", "Aug 29", "Aug 30",
      "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5", "Sep 6", "Sep 7", "Sep 8", "Sep 9",
      "Sep 10", "Sep 11", "Sep 12", "Sep 13", "Sep 14", "Sep 15", "Sep 16", "Sep 17", "Sep 18", "Sep 19", "Sep 20",
    ];
    const fullValues = [
      1100, 850, 920, 1200, 1480, 820, 950, 1100, 780, 890,
      1120, 1280, 1050, 980, 1340, 1420, 960, 1150, 890, 1080,
      1240, 1310, 920, 1180, 1450, 1620, 980, 1240, 1150, 1380, 1290,
    ];

    if (range === "Last 7 Days") {
      return of({
        labels: fullLabels.slice(-7),
        values: fullValues.slice(-7),
      });
    }

    if (range === "Last 14 Days") {
      return of({
        labels: fullLabels.slice(-14),
        values: fullValues.slice(-14),
      });
    }

    return of({
      labels: fullLabels,
      values: fullValues,
    });
  }

  getTopSearchedPolicies(): Observable<TopSearchedItem[]> {
    return of([
      { rank: 1, title: "National Education Policy 2020", searches: "2,450", trend: "↑ 18%", isPositive: true },
      { rank: 2, title: "Digital India 2.0 Guidelines", searches: "1,980", trend: "↑ 12%", isPositive: true },
      { rank: 3, title: "PM Kisan Samman Nidhi", searches: "1,750", trend: "↑ 25%", isPositive: true },
      { rank: 4, title: "Ayushman Bharat Policy", searches: "1,620", trend: "↑ 10%", isPositive: true },
      { rank: 5, title: "New Labour Codes", searches: "1,480", trend: "↑ 8%", isPositive: true },
      { rank: 6, title: "National Health Mission", searches: "1,320", trend: "↑ 15%", isPositive: true },
      { rank: 7, title: "Startup India Policy", searches: "1,210", trend: "↑ 20%", isPositive: true },
      { rank: 8, title: "Right to Education Act", searches: "980", trend: "↑ 5%", isPositive: true },
      { rank: 9, title: "Atmanirbhar Bharat", searches: "860", trend: "↑ 12%", isPositive: true },
      { rank: 10, title: "Swachh Bharat Mission", searches: "750", trend: "↑ 18%", isPositive: true },
      { rank: 11, title: "PM Gati Shakti Master Plan", searches: "720", trend: "↑ 14%", isPositive: true },
      { rank: 12, title: "National Green Hydrogen Mission", searches: "690", trend: "↑ 22%", isPositive: true },
    ]);
  }

  getTopSearchedSchemes(): Observable<TopSearchedItem[]> {
    return of([
      { rank: 1, title: "PM Kisan Samman Nidhi", searches: "2,980", trend: "↑ 22%", isPositive: true },
      { rank: 2, title: "Ayushman Bharat", searches: "2,450", trend: "↑ 18%", isPositive: true },
      { rank: 3, title: "PM Awas Yojana", searches: "2,100", trend: "↑ 15%", isPositive: true },
      { rank: 4, title: "PM Ujjwala Yojana", searches: "1,860", trend: "↑ 12%", isPositive: true },
      { rank: 5, title: "National Scholarship Portal", searches: "1,620", trend: "↑ 20%", isPositive: true },
      { rank: 6, title: "PM Mudra Yojana", searches: "1,450", trend: "↑ 10%", isPositive: true },
      { rank: 7, title: "PM Matru Vandana Yojana", searches: "1,200", trend: "↑ 8%", isPositive: true },
      { rank: 8, title: "Skill India Mission", searches: "980", trend: "↑ 15%", isPositive: true },
      { rank: 9, title: "Make in India", searches: "860", trend: "↑ 6%", isPositive: true },
      { rank: 10, title: "Stand Up India", searches: "750", trend: "↑ 9%", isPositive: true },
      { rank: 11, title: "PM Vishwakarma Yojana", searches: "710", trend: "↑ 25%", isPositive: true },
      { rank: 12, title: "Jal Jeevan Mission", searches: "680", trend: "↑ 11%", isPositive: true },
    ]);
  }

  getMostActiveUsersUsage(): Observable<MostActiveUserUsage[]> {
    return of([
      { rank: 1, user: "rahul.kumar@example.com", role: "Citizen", activities: "1,250" },
      { rank: 2, user: "priya.singh@gov.in", role: "Govt. Official", activities: "980" },
      { rank: 3, user: "amit.patel@org.in", role: "Organization", activities: "760" },
      { rank: 4, user: "neha.sharma@example.com", role: "Citizen", activities: "690" },
      { rank: 5, user: "arjun.mehta@univ.ac.in", role: "Researcher", activities: "620" },
      { rank: 6, user: "sneha.das@example.com", role: "Citizen", activities: "580" },
      { rank: 7, user: "vikram.jain@gov.in", role: "Govt. Official", activities: "540" },
      { rank: 8, user: "kavita.r@ngo.org", role: "Organization", activities: "510" },
      { rank: 9, user: "rohit.verma@example.com", role: "Citizen", activities: "480" },
      { rank: 10, user: "ananya@college.ac.in", role: "Researcher", activities: "450" },
      { rank: 11, user: "rajesh.gupta@gov.in", role: "Govt. Official", activities: "420" },
      { rank: 12, user: "meera.iyer@org.in", role: "Organization", activities: "390" },
    ]);
  }

  getRecentSearchActivities(): Observable<RecentSearchActivityItem[]> {
    return of([
      {
        rank: 1,
        user: "john.doe@example.com",
        query: "PM Kisan Yojana",
        type: "Scheme",
        dateTime: "Sep 30, 2024 10:24 AM",
      },
      {
        rank: 2,
        user: "priya.singh@gov.in",
        query: "education policy 2020",
        type: "Policy",
        dateTime: "Sep 30, 2024 10:18 AM",
      },
      {
        rank: 3,
        user: "meera.sharma@org.in",
        query: "scholarship for girls",
        type: "Scheme",
        dateTime: "Sep 30, 2024 10:12 AM",
      },
      {
        rank: 4,
        user: "rahul.kumar@example.com",
        query: "healthcare schemes",
        type: "Scheme",
        dateTime: "Sep 30, 2024 10:05 AM",
      },
      {
        rank: 5,
        user: "amit.patel@gov.in",
        query: "labour code",
        type: "Policy",
        dateTime: "Sep 30, 2024 09:58 AM",
      },
      {
        rank: 6,
        user: "sunita.deshmukh@example.com",
        query: "ayushman bharat hospital list",
        type: "Scheme",
        dateTime: "Sep 30, 2024 09:45 AM",
      },
      {
        rank: 7,
        user: "dev.nair@univ.ac.in",
        query: "digital personal data protection",
        type: "Policy",
        dateTime: "Sep 30, 2024 09:30 AM",
      },
    ]);
  }

  // =========================================================
  // REPORT DOWNLOAD METHOD
  // =========================================================

  downloadReport(
    pageTitleOrFormat: string = "Analytics Report",
    format: "pdf" | "xlsx" = "pdf",
  ): Observable<Blob> {
    const isFormatParam = pageTitleOrFormat === "pdf" || pageTitleOrFormat === "xlsx";
    const actualTitle = isFormatParam ? "Admin Analytics Report" : pageTitleOrFormat;
    const actualFormat = isFormatParam ? pageTitleOrFormat : format;

    const reportContent = `
PolicyGPT Admin Analytics Report
Generated: ${new Date().toLocaleString()}
Page: ${actualTitle}
Data Mode: Sample Analytics Snapshot

============================================================
Summary Snapshot:
- Platform Users: 5,820 (Active: 4,320)
- Platform Visits: 50,240
- Total Searches: 28,450
- Policy Views: 18,500
- Scheme Views: 22,000
- Eligibility Checks: 12,800
- Document Downloads: 5,600
============================================================
`;
    const mimeType = actualFormat === "pdf" ? "application/pdf" : "text/plain";
    const blob = new Blob([reportContent], { type: mimeType });
    return of(blob).pipe(delay(250));
  }
}

