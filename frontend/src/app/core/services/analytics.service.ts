import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

export interface DashboardAnalyticsResponse {
  total_policies: number;
  total_schemes: number;
  approved_policies: number;
  pending_policies: number;
  rejected_policies: number;
  archived_policies: number;
  active_schemes: number;
  total_users: number;
  total_notifications: number;
  total_feedback: number;
}

export interface DashboardAnalytics {
  policies: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    archived: number;
  };

  schemes: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    archived: number;
  };

  users: {
    total: number;
    active: number;
    inactive: number;
  };
}

export interface PolicyCategoryCount {
  category: string;
  count: number;
}

export interface PolicyStateCount {
  state: string;
  count: number;
}

export interface PolicyMinistryCount {
  ministry: string;
  count: number;
}

export interface PolicyAnalyticsResponse {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  archived: number;
  by_category: PolicyCategoryCount[];
  by_state: PolicyStateCount[];
  by_ministry: PolicyMinistryCount[];
  monthly_trend: any[];
}

export interface PolicyAnalytics {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  archived: number;

  by_category: {
    category: string;
    count: number;
  }[];

  by_state: {
    state: string;
    count: number;
  }[];

  by_ministry: {
    ministry: string;
    count: number;
  }[];

  monthly_trend: any[];
}

export interface SchemeCategoryCount {
  category: string;
  count: number;
}

export interface SchemeStateCount {
  state: string;
  count: number;
}

export interface SchemeMinistryCount {
  ministry: string;
  count: number;
}

export interface SchemeAnalyticsResponse {
  total: number;
  active: number;
  pending: number;
  rejected: number;
  archived: number;
  by_category: SchemeCategoryCount[];
  by_state: SchemeStateCount[];
  by_ministry: SchemeMinistryCount[];
  monthly_trend: any[];
}

export interface SchemeAnalytics {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  archived: number;

  by_category: {
    category: string;
    count: number;
  }[];

  by_state: {
    state: string;
    count: number;
  }[];

  by_ministry: {
    ministry: string;
    count: number;
  }[];

  monthly_trend: any[];
}

export interface PolicyTrendItem {
  year: number;
  month: number;
  count: number;
}

export interface SchemeUsageResponse {
  total_schemes: number;
  approved_schemes: number;
  pending_schemes: number;
  rejected_schemes: number;
  archived_schemes: number;
}

export interface UserAnalyticsResponse {
  total_users: number;
  active_users: number;
  inactive_users: number;
  by_role: { role: string; count: number }[];
  by_state: { state: string; count: number }[];
}

export interface UserAnalytics {
  total_users: number;
  active_users: number;
  inactive_users: number;

  by_role: {
    role: string;
    count: number;
  }[];

  by_state: {
    state: string;
    count: number;
  }[];
}

@Injectable({
  providedIn: "root",
})
export class AnalyticsService {
  private readonly baseUrl = "http://localhost:8000/analytics";

  private readonly notificationsUrl = "http://localhost:8000/notifications";

  constructor(private readonly http: HttpClient) {}

  // --------------------------------------------------
  // DASHBOARD
  // --------------------------------------------------

  getDashboardAnalytics(): Observable<DashboardAnalyticsResponse & DashboardAnalytics & any> {
    return this.http.get<any>(`${this.baseUrl}/dashboard`);
  }

  // --------------------------------------------------
  // POLICY ANALYTICS
  // --------------------------------------------------

  getPolicyAnalytics(): Observable<PolicyAnalyticsResponse & PolicyAnalytics & any> {
    return this.http.get<any>(`${this.baseUrl}/policies`);
  }

  getPolicyTrends(): Observable<PolicyTrendItem[] | any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/policies/trends`);
  }

  // --------------------------------------------------
  // SCHEME ANALYTICS
  // --------------------------------------------------

  getSchemeAnalytics(): Observable<SchemeAnalyticsResponse & SchemeAnalytics & any> {
    return this.http.get<any>(`${this.baseUrl}/schemes`);
  }

  getSchemeUsage(): Observable<SchemeUsageResponse> {
    return this.http.get<SchemeUsageResponse>(`${this.baseUrl}/schemes/usage`);
  }

  // --------------------------------------------------
  // USER ANALYTICS
  // --------------------------------------------------

  getUserAnalytics(): Observable<UserAnalyticsResponse & UserAnalytics & any> {
    return this.http.get<any>(`${this.baseUrl}/users`);
  }

  getUserActivity(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/users/activity`);
  }

  // --------------------------------------------------
  // DEPARTMENT ANALYTICS
  // --------------------------------------------------

  getDepartments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/departments`);
  }

  getDepartmentAnalytics(department: string): Observable<any> {
    return this.http.get<any>(
      `${this.baseUrl}/departments/${encodeURIComponent(department)}`
    );
  }

  // --------------------------------------------------
  // NOTIFICATIONS
  // --------------------------------------------------

  getNotifications(): Observable<any[]> {
    return this.http.get<any[]>(this.notificationsUrl);
  }
}
