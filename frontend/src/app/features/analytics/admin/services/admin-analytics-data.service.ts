import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable, of, throwError } from "rxjs";
import { catchError, map, shareReplay, tap } from "rxjs/operators";
import { Auth } from "../../../../core/services/auth";
import {
  AnalyticsStat,
  CategorySlice,
  TrendData,
  BarChartData,
  PolicyRow,
  SchemeRow,
  SchemeUpdateRow,
  DepartmentItem,
  DepartmentOverview,
  UserKpiCard,
  EngagementMetric,
  HeatmapData,
  RecentRegisteredUser,
  TopActiveUser,
  UsageKpiCard,
  TopSearchedItem,
  MostActiveUserUsage,
  RecentSearchActivityItem,
  UserDistributionData,
  AdminOverviewResponse,
  AdminPolicyAnalyticsResponse,
  AdminSchemeAnalyticsResponse,
  AdminUserAnalyticsResponse,
  AdminDepartmentAnalyticsResponse,
  AdminUsageStatisticsResponse,
} from "../models/admin-analytics.models";
import { environment } from '../../../../../environments/environment';
import { AnalyticsDateRangeService } from '../../shared/analytics-date-range.service';

@Injectable({
  providedIn: "root",
})
export class AdminAnalyticsDataService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly rangeService = inject(AnalyticsDateRangeService);
  private readonly baseUrl = `${environment.apiUrl}/analytics/admin`;
  private readonly reportsUrl = `${environment.apiUrl}/reports`;

  // Flag indicating real backend dynamic data mode
  readonly isSampleData = false;

  /**
   * Intelligent cache: fresh data served instantly, stale data served
   * immediately while refreshing in the background (SWR), expired data
   * refetched. Keys embed user + params so one admin never sees another's
   * data and filter/date changes always miss the cache.
   */
  private static readonly FRESH_MS = 90_000;
  private static readonly STALE_MS = 10 * 60_000;
  private static readonly MAX_ENTRIES = 60;
  private cache = new Map<string, { at: number; data: unknown }>();
  private inflight = new Map<string, Observable<unknown>>();

  constructor() {
    // Never retain one user's protected analytics after logout.
    this.auth.onLoggedOut(() => this.clearCache());
  }

  /**
   * Global date-filter bounds merged into every admin analytics request
   * so all pages aggregate the same selected window. Cache keys embed the
   * full params, so a range change always misses the cache (never stale).
   */
  private rangeParams(): { start_date: string; end_date: string } {
    return {
      start_date: this.rangeService.startISO(),
      end_date: this.rangeService.endISO(),
    };
  }

  private scopedKey(key: string): string {
    const uid = this.auth.getStoredUser()?.user_id ?? "anon";
    return `${uid}|${key}`;
  }

  private store(key: string, data: unknown): void {
    if (this.cache.size >= AdminAnalyticsDataService.MAX_ENTRIES) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(key, { at: Date.now(), data });
  }

  private getCached<T>(key: string, fetchFn: () => Observable<T>): Observable<T> {
    const skey = this.scopedKey(key);
    const now = Date.now();
    const hit = this.cache.get(skey);
    if (hit && now - hit.at < AdminAnalyticsDataService.FRESH_MS) {
      return of(hit.data as T);
    }
    if (hit && now - hit.at < AdminAnalyticsDataService.STALE_MS) {
      // Stale-while-revalidate: instant paint + background refresh.
      this.refreshInBackground(skey, fetchFn);
      return of(hit.data as T);
    }
    const ongoing = this.inflight.get(skey);
    if (ongoing) return ongoing as Observable<T>;
    const req = fetchFn().pipe(
      tap((data) => {
        this.store(skey, data);
        this.inflight.delete(skey);
      }),
      catchError((err) => {
        this.inflight.delete(skey);
        return throwError(() => err);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.inflight.set(skey, req);
    return req;
  }

  private refreshInBackground<T>(skey: string, fetchFn: () => Observable<T>): void {
    if (this.inflight.has(skey)) return;
    const req = fetchFn().pipe(
      tap((data) => {
        this.store(skey, data);
        this.inflight.delete(skey);
      }),
      catchError(() => {
        // Background refresh must never surface: the stale view stays.
        this.inflight.delete(skey);
        return of(null as unknown as T);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.inflight.set(skey, req);
    req.subscribe();
  }

  /**
   * Clears the in-memory cache to force a fresh data fetch.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  // =========================================================
  // 1. ADMIN OVERVIEW
  // =========================================================

  getAdminOverview(timeframe: string = "Last 9 Months"): Observable<AdminOverviewResponse> {
    const range = this.rangeParams();
    const key = `overview:${timeframe}:${range.start_date}:${range.end_date}`;
    return this.getCached(key, () => {
      let params = new HttpParams().set("timeframe", timeframe);
      params = params.set("start_date", range.start_date).set("end_date", range.end_date);
      return this.http.get<AdminOverviewResponse>(`${this.baseUrl}/overview`, { params });
    });
  }

  getAdminAnalytics(_filters?: Record<string, string>): Observable<{
    totalUsers: number;
    activePolicies: number;
    totalSchemes: number;
    usageStats: { month: string; queries: number }[];
  }> {
    return this.getAdminOverview().pipe(
      map((res) => {
        const totalUsers = Number(res.metrics.find((m) => m.label === "Total Users")?.value || 0);
        const activePolicies = Number(res.metrics.find((m) => m.label === "Approved Policies")?.value || 0);
        const totalSchemes = Number(res.metrics.find((m) => m.label === "Total Schemes")?.value || 0);
        const usageStats = res.policyStatusTrend.labels.map((month, idx) => ({
          month,
          queries: res.policyStatusTrend.series[0]?.data[idx] || 0,
        }));
        return { totalUsers, activePolicies, totalSchemes, usageStats };
      })
    );
  }

  // =========================================================
  // 2. POLICY ANALYTICS
  // =========================================================

  getAdminPolicyAnalytics(filters?: Record<string, string>): Observable<AdminPolicyAnalyticsResponse> {
    const normalized = { ...this.normalizeFilters(filters), ...this.rangeParams() };
    const filterKey = JSON.stringify(normalized);
    const key = `policies:${filterKey}`;
    return this.getCached(key, () => {
      let params = new HttpParams();
      Object.entries(normalized).forEach(([k, v]) => {
        params = params.set(k, v);
      });
      return this.http.get<AdminPolicyAnalyticsResponse>(`${this.baseUrl}/policies`, { params });
    });
  }

  getPolicyAnalyticsStats(filters?: Record<string, string>): Observable<AnalyticsStat[]> {
    return this.getAdminPolicyAnalytics(filters).pipe(map((res) => res.stats));
  }

  getPoliciesByCategory(filters?: Record<string, string>): Observable<CategorySlice[]> {
    return this.getAdminPolicyAnalytics(filters).pipe(map((res) => res.by_category));
  }

  getPolicyStatusTrend(filters?: Record<string, string>): Observable<TrendData> {
    return this.getAdminPolicyAnalytics(filters).pipe(map((res) => res.trend));
  }

  getPoliciesByState(filters?: Record<string, string>): Observable<BarChartData[]> {
    return this.getAdminPolicyAnalytics(filters).pipe(map((res) => res.by_state));
  }

  getPoliciesByMinistry(filters?: Record<string, string>): Observable<BarChartData[]> {
    return this.getAdminPolicyAnalytics(filters).pipe(map((res) => res.by_ministry));
  }

  getLatestPolicies(filters?: Record<string, string>): Observable<PolicyRow[]> {
    return this.getAdminPolicyAnalytics(filters).pipe(map((res) => res.latest_policies));
  }

  // =========================================================
  // 3. SCHEME ANALYTICS
  // =========================================================

  getAdminSchemeAnalytics(filters?: Record<string, string>): Observable<AdminSchemeAnalyticsResponse> {
    const normalized = { ...this.normalizeFilters(filters), ...this.rangeParams() };
    const filterKey = JSON.stringify(normalized);
    const key = `schemes:${filterKey}`;
    return this.getCached(key, () => {
      let params = new HttpParams();
      Object.entries(normalized).forEach(([k, v]) => {
        params = params.set(k, v);
      });
      return this.http.get<AdminSchemeAnalyticsResponse>(`${this.baseUrl}/schemes`, { params });
    });
  }

  getSchemeAnalyticsStats(filters?: Record<string, string>): Observable<AnalyticsStat[]> {
    return this.getAdminSchemeAnalytics(filters).pipe(map((res) => res.stats));
  }

  getSchemesByCategoryDetailed(filters?: Record<string, string>): Observable<CategorySlice[]> {
    return this.getAdminSchemeAnalytics(filters).pipe(map((res) => res.by_category));
  }

  getSchemeTrend(filters?: Record<string, string>): Observable<TrendData> {
    return this.getAdminSchemeAnalytics(filters).pipe(map((res) => res.trend));
  }

  getSchemesByState(filters?: Record<string, string>): Observable<BarChartData[]> {
    return this.getAdminSchemeAnalytics(filters).pipe(map((res) => res.by_state));
  }

  getTopViewedSchemes(filters?: Record<string, string>): Observable<SchemeRow[]> {
    return this.getAdminSchemeAnalytics(filters).pipe(map((res) => res.top_schemes));
  }

  getRecentSchemeUpdates(filters?: Record<string, string>): Observable<SchemeUpdateRow[]> {
    return this.getAdminSchemeAnalytics(filters).pipe(map((res) => res.recent_updates));
  }

  // =========================================================
  // 4. USER ANALYTICS
  // =========================================================

  getAdminUserAnalytics(paramsObj?: Record<string, string>): Observable<AdminUserAnalyticsResponse> {
    const finalParams = {
      growth_period: "Last 12 Months",
      reg_period: "Last 6 Months",
      state_limit: "10",
      heatmap_period: "Last 4 Weeks",
      ...(paramsObj || {}),
      ...this.rangeParams(),
    };
    const key = `users:${JSON.stringify(finalParams)}`;
    return this.getCached(key, () => {
      let params = new HttpParams();
      Object.entries(finalParams).forEach(([k, v]) => {
        params = params.set(k, v);
      });
      return this.http.get<AdminUserAnalyticsResponse>(`${this.baseUrl}/users`, { params });
    });
  }

  getUserKpis(): Observable<UserKpiCard[]> {
    return this.getAdminUserAnalytics().pipe(map((res) => res.kpis));
  }

  getUserGrowthTrend(period: string = "Last 12 Months"): Observable<TrendData> {
    return this.getAdminUserAnalytics({ growth_period: period }).pipe(map((res) => res.growth_trend));
  }

  getUserRoleDistribution(): Observable<UserDistributionData> {
    return this.getAdminUserAnalytics().pipe(map((res) => res.role_distribution));
  }

  getUserRegistrationTrend(period: string = "Last 6 Months"): Observable<{ labels: string[]; values: number[] }> {
    return this.getAdminUserAnalytics({ reg_period: period }).pipe(map((res) => res.registration_trend));
  }

  getUsersByState(limit: number = 10): Observable<{ labels: string[]; values: number[] }> {
    return this.getAdminUserAnalytics({ state_limit: String(limit) }).pipe(map((res) => res.users_by_state));
  }

  getUserEngagementMetrics(): Observable<EngagementMetric[]> {
    return this.getAdminUserAnalytics().pipe(map((res) => res.engagement_metrics));
  }

  getUserHeatmapData(period: string = "Last 4 Weeks"): Observable<HeatmapData> {
    return this.getAdminUserAnalytics({ heatmap_period: period }).pipe(map((res) => res.heatmap));
  }

  getRecentRegisteredUsers(): Observable<RecentRegisteredUser[]> {
    return this.getAdminUserAnalytics().pipe(map((res) => res.recent_registered_users));
  }

  getTopActiveUsers(): Observable<TopActiveUser[]> {
    return this.getAdminUserAnalytics().pipe(map((res) => res.top_active_users));
  }

  // =========================================================
  // 5. DEPARTMENT ANALYTICS
  // =========================================================

  getAdminDepartmentAnalytics(
    search?: string,
    selectedDept: string = "all"
  ): Observable<AdminDepartmentAnalyticsResponse> {
    const range = this.rangeParams();
    const key = `depts:${search || ""}:${selectedDept}:${range.start_date}:${range.end_date}`;
    return this.getCached(key, () => {
      let params = new HttpParams().set("selected_department", selectedDept || "all");
      if (search && search.trim()) {
        params = params.set("search", search.trim());
      }
      params = params.set("start_date", range.start_date).set("end_date", range.end_date);
      return this.http.get<AdminDepartmentAnalyticsResponse>(`${this.baseUrl}/departments`, { params });
    });
  }

  getDepartmentAnalytics(): Observable<DepartmentOverview> {
    return this.getAdminDepartmentAnalytics().pipe(map((res) => res.selected_overview));
  }

  getDepartmentsList(): Observable<DepartmentItem[]> {
    return this.getAdminDepartmentAnalytics().pipe(map((res) => res.departments_list));
  }

  // =========================================================
  // 6. USAGE STATISTICS
  // =========================================================

  getAdminUsageStatistics(paramsObj?: Record<string, string>): Observable<AdminUsageStatisticsResponse> {
    const finalParams = {
      activity_period: "Last 12 Months",
      daily_period: "Last 30 Days",
      ...(paramsObj || {}),
      ...this.rangeParams(),
    };
    const key = `usage:${JSON.stringify(finalParams)}`;
    return this.getCached(key, () => {
      let params = new HttpParams();
      Object.entries(finalParams).forEach(([k, v]) => {
        params = params.set(k, v);
      });
      return this.http.get<AdminUsageStatisticsResponse>(`${this.baseUrl}/usage`, { params });
    });
  }

  getUsageKpis(): Observable<UsageKpiCard[]> {
    return this.getAdminUsageStatistics().pipe(map((res) => res.kpis));
  }

  getUserActivityTrend(period: string = "Last 12 Months"): Observable<TrendData> {
    return this.getAdminUsageStatistics({ activity_period: period }).pipe(map((res) => res.activity_trend));
  }

  getDailyUsage(period: string = "Last 30 Days"): Observable<{ labels: string[]; values: number[] }> {
    return this.getAdminUsageStatistics({ daily_period: period }).pipe(map((res) => res.daily_usage));
  }

  getTopSearchedPolicies(): Observable<TopSearchedItem[]> {
    return this.getAdminUsageStatistics().pipe(map((res) => res.top_policies));
  }

  getTopSearchedSchemes(): Observable<TopSearchedItem[]> {
    return this.getAdminUsageStatistics().pipe(map((res) => res.top_schemes));
  }

  getMostActiveUsersUsage(): Observable<MostActiveUserUsage[]> {
    return this.getAdminUsageStatistics().pipe(map((res) => res.most_active_users));
  }

  getRecentSearchActivities(): Observable<RecentSearchActivityItem[]> {
    return this.getAdminUsageStatistics().pipe(map((res) => res.recent_searches));
  }

  // =========================================================
  // REPORT DOWNLOAD (real backend export via POST /reports/generate)
  // =========================================================

  /**
   * Generate a real server-rendered report (PDF/EXCEL) backed by
   * PostgreSQL datasets. No mock Blob, no fake success: HTTP errors
   * propagate to the caller for empty/error states.
   */
  downloadReport(
    reportType: string,
    format: string = "PDF",
    title?: string,
    parameters?: Record<string, unknown>,
  ): Observable<Blob> {
    const normalizedType = (reportType || "ANALYTICS_REPORT").trim().toUpperCase();
    const normalizedFormat = (format || "PDF").trim().toUpperCase();
    const body: Record<string, unknown> = {
      report_type: normalizedType,
      report_format: normalizedFormat,
      title: title || normalizedType,
      parameters: parameters || {},
    };
    return this.http.post(`${this.reportsUrl}/generate`, body, {
      responseType: "blob",
    });
  }

  /**
   * Drop frontend "All ..." defaults so a default Apply sends no
   * filter params. Backend treats absent params as unfiltered; sending
   * literal "All Status" would otherwise match zero rows.
   */
  private normalizeFilters(filters?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!filters) return out;
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null) continue;
      const text = String(v).trim();
      if (!text) continue;
      const upper = text.toUpperCase();
      if (upper === "ALL" || upper.startsWith("ALL ")) continue;
      out[k] = text;
    }
    return out;
  }
}
