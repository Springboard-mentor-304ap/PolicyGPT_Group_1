import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private readonly baseUrl = 'http://localhost:8000/analytics';

  constructor(private readonly http: HttpClient) {}

  getDashboardAnalytics(): Observable<DashboardAnalyticsResponse> {
    return this.http.get<DashboardAnalyticsResponse>(`${this.baseUrl}/dashboard`);
  }

  getPolicyAnalytics(): Observable<PolicyAnalyticsResponse> {
    return this.http.get<PolicyAnalyticsResponse>(`${this.baseUrl}/policies`);
  }

  getSchemeAnalytics(): Observable<SchemeAnalyticsResponse> {
    return this.http.get<SchemeAnalyticsResponse>(`${this.baseUrl}/schemes`);
  }

  getPolicyTrends(): Observable<PolicyTrendItem[]> {
    return this.http.get<PolicyTrendItem[]>(`${this.baseUrl}/policies/trends`);
  }

  getSchemeUsage(): Observable<SchemeUsageResponse> {
    return this.http.get<SchemeUsageResponse>(`${this.baseUrl}/schemes/usage`);
  }

  getUserAnalytics(): Observable<UserAnalyticsResponse> {
    return this.http.get<UserAnalyticsResponse>(`${this.baseUrl}/users`);
  }
}
