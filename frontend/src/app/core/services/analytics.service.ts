import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, catchError, map, of, shareReplay, tap, throwError } from "rxjs";
import { environment } from '../../../environments/environment';

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

// --------------------------------------------------
// PERSONAL (ROLE-SCOPED) ANALYTICS
// --------------------------------------------------
// Live backend aggregations from
// GET /analytics/{citizen,researcher,organization}/overview.
// Untracked metrics (views, eligibility checks, comparisons) arrive
// as explicit zeros with tracked=false — never fabricated.

export type PersonalAnalyticsRange = "7d" | "30d" | "6m" | "12m" | "custom";

export interface PersonalAnalyticsParams {
  range: PersonalAnalyticsRange;
  date_from?: string;
  date_to?: string;
}

export interface PersonalKpi {
  value: number | null;
  delta_pct?: number | null;
  unread?: number;
  tracked?: boolean;
  reason?: string;
}

export interface TrendPoint {
  key: string;
  label: string;
  searches: number;
  saved_policies: number;
  saved_schemes: number;
  notifications: number;
  policy_views: number;
  scheme_views: number;
  eligibility_checks: number;
  comparisons: number;
}

export interface BreakdownSlice {
  key: string;
  label: string;
  count: number;
  description: string;
}

export interface RecentActivityItem {
  type: string;
  title: string;
  subtitle: string;
  timestamp: string | null;
  entity_id?: number;
  is_read?: boolean;
}

export interface TopSearchItem {
  keyword: string;
  count: number;
  pct: number;
}

export interface AnalyticsNotificationItem {
  notification_id: number;
  title: string;
  notification_type: string;
  category: string;
  created_at: string | null;
  is_read: boolean;
}

export interface SavedPolicyRow {
  policy_id: number;
  title: string;
  category: string | null;
  state: string | null;
  status: string | null;
  saved_on: string | null;
}

export interface SavedSchemeRow {
  scheme_id: number;
  title: string;
  category: string | null;
  state: string | null;
  status: string | null;
  saved_on: string | null;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface PersonalAnalyticsOverview {
  role: string;
  window: { range: string; from: string; to: string; bucket: string };
  generated_at: string;
  kpis: Record<string, PersonalKpi>;
  trend: TrendPoint[];
  breakdown: BreakdownSlice[];
  total_activities: number;
  recent_activity: RecentActivityItem[];
  top_searches: TopSearchItem[];
  search_types: { type: string; count: number }[];
  recent_notifications: AnalyticsNotificationItem[];
  saved_policies: SavedPolicyRow[];
  saved_schemes: SavedSchemeRow[];
  policies_by_category: CategoryCount[];
  schemes_by_category: CategoryCount[];
  comparisons: unknown[];
  comparisons_tracked: boolean;
  most_viewed_policies: unknown[];
  most_viewed_schemes: unknown[];
  popularity_tracked: boolean;
  limitations: string[];
}

// --------------------------------------------------
// GOVERNMENT ANALYTICS (platform-wide, role-guarded)
// --------------------------------------------------

export interface GovtAnalyticsParams {
  months?: number;
  date_from?: string;
  date_to?: string;
}

export interface GovtPolicySchemeParams extends GovtAnalyticsParams {
  policy_status?: string;
  scheme_status?: string;
  category?: string;
}

export interface GovtDepartmentParams extends GovtAnalyticsParams {
  department?: string;
}

export interface GovtUserNotificationParams extends GovtAnalyticsParams {
  role?: string;
  channel?: string;
}

export interface GovtKpi {
  value: number;
  tracked?: boolean;
  reason?: string;
}

export interface GovtRecentPolicy {
  policy_id: number;
  title: string;
  category: string | null;
  department: string | null;
  status: string | null;
  created_at: string | null;
}

export interface GovtRecentScheme {
  scheme_id: number;
  title: string;
  category: string | null;
  department: string | null;
  status: string | null;
  created_at: string | null;
}

export interface GovtBroadcast {
  notification_id: number;
  title: string;
  notification_type: string;
  channel: string;
  created_at: string | null;
}

export interface GovtOverview {
  window: { from: string; to: string };
  generated_at: string;
  kpis: Record<string, GovtKpi>;
  trends: { labels: string[]; policies: number[]; schemes: number[] };
  status_distribution: {
    policies: Record<string, number>;
    schemes: Record<string, number>;
  };
  top_departments: { department: string; count: number }[];
  users_by_role: { role: string; count: number }[];
  notifications_by_type: { type: string; count: number }[];
  recent_policies: GovtRecentPolicy[];
  recent_schemes: GovtRecentScheme[];
  recent_notifications: GovtBroadcast[];
  limitations: string[];
}

export interface GovtPolicyScheme {
  window: { from: string; to: string };
  generated_at: string;
  filters: { policy_status: string | null; scheme_status: string | null; category: string | null };
  filter_options: { statuses: string[]; categories: string[] };
  kpis: Record<string, GovtKpi>;
  trends: { labels: string[]; policies: number[]; schemes: number[] };
  policy_vs_scheme: { label: string; count: number }[];
  policies_by_category: { category: string; count: number }[];
  schemes_by_category: { category: string; count: number }[];
  policy_status: Record<string, number>;
  scheme_status: Record<string, number>;
  recent_policies: GovtRecentPolicy[];
  recent_schemes: GovtRecentScheme[];
  limitations: string[];
}

export interface GovtDepartments {
  window: { from: string; to: string };
  generated_at: string;
  filters: { department: string | null };
  filter_options: { departments: string[] };
  kpis: Record<string, GovtKpi>;
  grouped: { departments: string[]; policies: number[]; schemes: number[] };
  distribution: { department: string; count: number }[];
  top_policy_departments: { department: string; count: number }[];
  top_scheme_departments: { department: string; count: number }[];
  activity_trend: { labels: string[]; policies: number[]; schemes: number[] };
  recent_activities: {
    type: string;
    title: string;
    department: string | null;
    status: string | null;
    created_at: string | null;
    entity: string;
    entity_id: number;
  }[];
  department_table: {
    department: string;
    policies: number;
    schemes: number;
    approved: number;
    pending: number;
  }[];
  limitations: string[];
}

export interface GovtUserNotifications {
  window: { from: string; to: string };
  generated_at: string;
  filters: { role: string | null; channel: string | null };
  filter_options: { roles: string[]; channels: string[] };
  kpis: Record<string, GovtKpi>;
  growth_trend: {
    labels: string[];
    total: number[];
    by_role: { role: string; values: number[] }[];
  };
  users_by_role: { role: string; count: number }[];
  users_by_state: { state: string; count: number }[];
  active_by_role: { role: string; count: number }[];
  notifications_by_type: { type: string; count: number }[];
  notifications_by_channel: { channel: string; total: number; read: number }[];
  recent_users: {
    user_id: number;
    full_name: string;
    role: string;
    state: string | null;
    is_active: boolean;
    created_at: string | null;
  }[];
  recent_notifications: GovtBroadcast[];
  limitations: string[];
}

@Injectable({
  providedIn: "root",
})
export class AnalyticsService {
  private readonly baseUrl = `${environment.apiUrl}/analytics`;

  private readonly notificationsUrl = `${environment.apiUrl}/notifications`;

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
  // PERSONAL (ROLE-SCOPED) OVERVIEWS
  //
  // Single aggregated backend call per role+range. Responses are cached
  // for a short TTL so navigating back to Analytics renders instantly
  // without refetching; concurrent subscribers share one in-flight
  // request instead of firing duplicates.
  // --------------------------------------------------

  private static readonly OVERVIEW_TTL_MS = 60_000;

  private readonly jsonCache = new Map<string, { at: number; data: unknown }>();

  private readonly jsonInflight = new Map<string, Observable<unknown>>();

  /** Short-TTL GET cache shared by analytics pages: instant back-navigation
   * without refetching, one in-flight request per key, no cross-user leak
   * (per-browser-memory + existing auth interceptor on every request). */
  private cachedGet<T>(key: string, url: string, forceRefresh = false): Observable<T> {
    if (!forceRefresh) {
      const cached = this.jsonCache.get(key);
      if (cached && Date.now() - cached.at < AnalyticsService.OVERVIEW_TTL_MS) {
        return of(cached.data as T);
      }
      const inflight = this.jsonInflight.get(key);
      if (inflight) {
        return inflight as Observable<T>;
      }
    }

    const request = this.http.get<T>(url).pipe(
      tap((data) => {
        this.jsonCache.set(key, { at: Date.now(), data });
        this.jsonInflight.delete(key);
      }),
      catchError((err) => {
        this.jsonInflight.delete(key);
        // Must return an error Observable: a synchronous `throw` here would
        // escape as an uncaught exception and the subscriber's error
        // callback (loading/error states, retry UI) would never run.
        return throwError(() => err);
      }),
      shareReplay(1),
    );
    this.jsonInflight.set(key, request);
    return request;
  }

  private personalOverview(
    role: "citizen" | "researcher" | "organization",
    params: PersonalAnalyticsParams,
    forceRefresh = false,
  ): Observable<PersonalAnalyticsOverview> {
    const key = `${role}|${params.range}|${params.date_from ?? ""}|${params.date_to ?? ""}`;

    if (!forceRefresh) {
      const cached = this.jsonCache.get(key);
      if (cached && Date.now() - cached.at < AnalyticsService.OVERVIEW_TTL_MS) {
        return of(cached.data as PersonalAnalyticsOverview);
      }
      const inflight = this.jsonInflight.get(key);
      if (inflight) {
        return inflight as Observable<PersonalAnalyticsOverview>;
      }
    }

    let query = `range=${encodeURIComponent(params.range)}`;
    if (params.range === "custom") {
      query += `&date_from=${encodeURIComponent(params.date_from ?? "")}&date_to=${encodeURIComponent(params.date_to ?? "")}`;
    }
    return this.cachedGet<PersonalAnalyticsOverview>(
      key,
      `${this.baseUrl}/${role}/overview?${query}`,
      forceRefresh,
    );
  }

  // --------------------------------------------------
  // GOVERNMENT ANALYTICS (platform-wide, role-guarded)
  // --------------------------------------------------

  private govtParams(params: GovtAnalyticsParams): string {
    let query = `months=${encodeURIComponent(String(params.months ?? 12))}`;
    if (params.date_from && params.date_to) {
      query += `&date_from=${encodeURIComponent(params.date_from)}&date_to=${encodeURIComponent(params.date_to)}`;
    }
    for (const [name, value] of Object.entries(params)) {
      if (
        name === "months" ||
        name === "date_from" ||
        name === "date_to" ||
        value === undefined ||
        value === null ||
        value === ""
      ) {
        continue;
      }
      query += `&${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`;
    }
    return query;
  }

  getGovernmentOverview(
    params: GovtAnalyticsParams = {},
    forceRefresh = false,
  ): Observable<GovtOverview> {
    const query = this.govtParams(params);
    return this.cachedGet<GovtOverview>(
      `govt-overview|${query}`,
      `${this.baseUrl}/government/overview?${query}`,
      forceRefresh,
    );
  }

  getGovernmentPolicyScheme(
    params: GovtPolicySchemeParams = {},
    forceRefresh = false,
  ): Observable<GovtPolicyScheme> {
    const query = this.govtParams(params);
    return this.cachedGet<GovtPolicyScheme>(
      `govt-policy-scheme|${query}`,
      `${this.baseUrl}/government/policy-scheme?${query}`,
      forceRefresh,
    );
  }

  getGovernmentDepartments(
    params: GovtDepartmentParams = {},
    forceRefresh = false,
  ): Observable<GovtDepartments> {
    const query = this.govtParams(params);
    return this.cachedGet<GovtDepartments>(
      `govt-departments|${query}`,
      `${this.baseUrl}/government/departments?${query}`,
      forceRefresh,
    );
  }

  getGovernmentUserNotifications(
    params: GovtUserNotificationParams = {},
    forceRefresh = false,
  ): Observable<GovtUserNotifications> {
    const query = this.govtParams(params);
    return this.cachedGet<GovtUserNotifications>(
      `govt-user-notifications|${query}`,
      `${this.baseUrl}/government/user-notifications?${query}`,
      forceRefresh,
    );
  }

  getCitizenOverview(
    params: PersonalAnalyticsParams,
    forceRefresh = false,
  ): Observable<PersonalAnalyticsOverview> {
    return this.personalOverview("citizen", params, forceRefresh);
  }

  getResearcherOverview(
    params: PersonalAnalyticsParams,
    forceRefresh = false,
  ): Observable<PersonalAnalyticsOverview> {
    return this.personalOverview("researcher", params, forceRefresh);
  }

  getOrganizationOverview(
    params: PersonalAnalyticsParams,
    forceRefresh = false,
  ): Observable<PersonalAnalyticsOverview> {
    return this.personalOverview("organization", params, forceRefresh);
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
