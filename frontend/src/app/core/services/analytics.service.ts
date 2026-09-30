import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, map } from "rxjs";

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

export interface UsageStatisticsResponse {
  users: number;
  policies: number;
  schemes: number;
  approved_policies: number;
  approved_schemes: number;
  active_users: number;
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
    return this.http.get<any>(`${this.baseUrl}/dashboard`).pipe(
      map((data: any) => {
        const policies = data?.policies ?? {};
        const schemes = data?.schemes ?? {};
        const users = data?.users ?? {};

        const total_policies = data?.total_policies ?? policies.total ?? 0;
        const approved_policies = data?.approved_policies ?? policies.approved ?? 0;
        const pending_policies = data?.pending_policies ?? policies.pending ?? 0;
        const rejected_policies = data?.rejected_policies ?? policies.rejected ?? 0;
        const archived_policies = data?.archived_policies ?? policies.archived ?? 0;

        const total_schemes = data?.total_schemes ?? schemes.total ?? 0;
        const approved_schemes = data?.approved_schemes ?? schemes.approved ?? 0;
        const active_schemes = data?.active_schemes ?? approved_schemes;
        const pending_schemes = data?.pending_schemes ?? schemes.pending ?? 0;
        const rejected_schemes = data?.rejected_schemes ?? schemes.rejected ?? 0;
        const archived_schemes = data?.archived_schemes ?? schemes.archived ?? 0;

        const total_users = data?.total_users ?? users.total ?? 0;
        const active_users = data?.active_users ?? users.active ?? 0;
        const inactive_users = data?.inactive_users ?? users.inactive ?? 0;

        return {
          ...data,
          policies: {
            total: total_policies,
            approved: approved_policies,
            pending: pending_policies,
            rejected: rejected_policies,
            archived: archived_policies,
            ...policies,
          },
          schemes: {
            total: total_schemes,
            approved: approved_schemes,
            pending: pending_schemes,
            rejected: rejected_schemes,
            archived: archived_schemes,
            ...schemes,
          },
          users: {
            total: total_users,
            active: active_users,
            inactive: inactive_users,
            ...users,
          },
          total_policies,
          approved_policies,
          pending_policies,
          rejected_policies,
          archived_policies,
          total_schemes,
          approved_schemes,
          active_schemes,
          pending_schemes,
          rejected_schemes,
          archived_schemes,
          total_users,
          active_users,
          inactive_users,
        };
      })
    );
  }

  // --------------------------------------------------
  // POLICY ANALYTICS
  // --------------------------------------------------

  getPolicyAnalytics(): Observable<PolicyAnalyticsResponse & PolicyAnalytics & any> {
    return this.http.get<any>(`${this.baseUrl}/policies`).pipe(
      map((data: any) => ({
        ...data,
        approved: data?.approved ?? 0,
      }))
    );
  }

  getPolicyTrends(): Observable<PolicyTrendItem[] | any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/policies/trends`);
  }

  // --------------------------------------------------
  // SCHEME ANALYTICS
  // --------------------------------------------------

  getSchemeAnalytics(): Observable<SchemeAnalyticsResponse & SchemeAnalytics & any> {
    return this.http.get<any>(`${this.baseUrl}/schemes`).pipe(
      map((data: any) => {
        const approved = data?.approved ?? data?.active ?? 0;
        return {
          ...data,
          approved,
          active: data?.active ?? approved,
        };
      })
    );
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
  // USAGE STATISTICS (existing backend GET /analytics/usage)
  // --------------------------------------------------

  getUsageStatistics(): Observable<UsageStatisticsResponse> {
    return this.http.get<UsageStatisticsResponse>(`${this.baseUrl}/usage`);
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
