import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

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

  private readonly notificationsUrl =
    "http://localhost:8000/notifications";

  constructor(private readonly http: HttpClient) {}

  // --------------------------------------------------
  // DASHBOARD
  // --------------------------------------------------

  getDashboardAnalytics(): Observable<DashboardAnalytics> {
    return this.http.get<DashboardAnalytics>(
      `${this.baseUrl}/dashboard`
    );
  }

  // --------------------------------------------------
  // POLICY ANALYTICS
  // --------------------------------------------------

  getPolicyAnalytics(): Observable<PolicyAnalytics> {
    return this.http.get<PolicyAnalytics>(
      `${this.baseUrl}/policies`
    );
  }

  getPolicyTrends(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.baseUrl}/policies/trends`
    );
  }

  // --------------------------------------------------
  // SCHEME ANALYTICS
  // --------------------------------------------------

  getSchemeAnalytics(): Observable<SchemeAnalytics> {
    return this.http.get<SchemeAnalytics>(
      `${this.baseUrl}/schemes`
    );
  }

  // --------------------------------------------------
  // USER ANALYTICS
  // --------------------------------------------------

  getUserAnalytics(): Observable<UserAnalytics> {
    return this.http.get<UserAnalytics>(
      `${this.baseUrl}/users`
    );
  }

  getUserActivity(): Observable<any> {
    return this.http.get<any>(
      `${this.baseUrl}/users/activity`
    );
  }

  // --------------------------------------------------
  // DEPARTMENT ANALYTICS
  // --------------------------------------------------

  getDepartments(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.baseUrl}/departments`
    );
  }

  getDepartmentAnalytics(
    department: string
  ): Observable<any> {
    return this.http.get<any>(
      `${this.baseUrl}/departments/${encodeURIComponent(
        department
      )}`
    );
  }

  // --------------------------------------------------
  // NOTIFICATIONS
  // Correct backend endpoint:
  // GET /notifications
  // --------------------------------------------------

  getNotifications(): Observable<any[]> {
    return this.http.get<any[]>(
      this.notificationsUrl
    );
  }
}
