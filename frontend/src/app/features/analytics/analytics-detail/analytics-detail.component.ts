import { Component, DestroyRef, OnInit, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Observable, Subscription, catchError, forkJoin, map, of } from "rxjs";

import { AnalyticsService } from "../../../core/services/analytics.service";
import { NotificationService } from "../../../core/services/notification.service";
import { SavedItemsService } from "../../../core/services/saved-items.service";
import { SearchHistoryService } from "../../../core/services/search-history.service";
import { Auth } from "../../../core/services/auth";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";

export type AnalyticsVariant =
  | "overview"
  | "policies"
  | "schemes"
  | "users"
  | "departments"
  | "usage"
  | "personal"
  | "policy-scheme"
  | "user-notifications"
  | "saved-search-application"
  | "research"
  | "policy-scheme-trends"
  | "organization"
  | "policy-scheme-usage";

export interface AnalyticsKpi {
  label: string;
  value: number | string;
  sub: string;
  icon: string;
  tone: "blue" | "green" | "orange" | "purple";
}

export interface AnalyticsTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface AnalyticsNote {
  icon: string;
  title: string;
  text: string;
}

export interface AnalyticsCta {
  label: string;
  icon: string;
  route: string[];
}

interface AnalyticsViewModel {
  kpis: AnalyticsKpi[];
  tables: AnalyticsTable[];
  note: AnalyticsNote | null;
}

interface NotificationSummary {
  total: number;
  unread: number;
  read: number;
  rows: (string | number)[][];
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = "—"): string {
  const str = String(value ?? "").trim();
  return str ? str : fallback;
}

function shortDate(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function prettyLabel(value: unknown): string {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1))
    .trim();
}

/**
 * Shared role-neutral analytics screen.
 *
 * One lazy-loaded component serves every Analytics child route. The route's
 * `data` selects the variant (which existing backend APIs to combine), the
 * page title/description, the breadcrumb trail and optional call-to-action
 * links:
 *
 *   data: {
 *     variant: 'policy-scheme',
 *     pageTitle: 'Policy & Scheme Analytics',
 *     pageDescription: '...',
 *     crumbs: [{ label: 'Home', route: [...] }, ...],
 *     cta: [{ label: '...', icon: '...', route: [...] }],
 *   }
 *
 * Consolidated variants combine several existing endpoints at the frontend
 * level (frontend composition, no backend changes). Every variant renders
 * live backend data or an honest empty state. No mock data.
 */
@Component({
  selector: "app-analytics-detail",
  standalone: true,
  imports: [CommonModule, RouterLink, BreadcrumbComponent],
  templateUrl: "./analytics-detail.component.html",
  styleUrl: "./analytics-detail.component.scss",
})
export class AnalyticsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly analytics = inject(AnalyticsService);
  private readonly notifications = inject(NotificationService);
  private readonly savedItems = inject(SavedItemsService);
  private readonly searchHistory = inject(SearchHistoryService);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub: Subscription | null = null;

  variant: AnalyticsVariant = "overview";
  pageTitle = "Analytics";
  pageDescription = "";
  crumbs: BreadcrumbItem[] = [];
  ctas: AnalyticsCta[] = [];

  loading = true;
  error: string | null = null;

  kpis: AnalyticsKpi[] = [];
  tables: AnalyticsTable[] = [];
  note: AnalyticsNote | null = null;

  ngOnInit(): void {
    const data = this.route.snapshot.data;
    this.variant = (data["variant"] as AnalyticsVariant) ?? "overview";
    this.pageTitle = String(data["pageTitle"] ?? "Analytics");
    this.pageDescription = String(data["pageDescription"] ?? "");
    this.crumbs = (data["crumbs"] as BreadcrumbItem[]) ?? [];
    this.ctas = (data["cta"] as AnalyticsCta[]) ?? [];
    this.load();
  }

  refresh(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  private load(): void {
    // Cancel any in-flight load (refresh/retry spam) before starting anew.
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.error = null;
    this.kpis = [];
    this.tables = [];
    this.note = null;
    this.loadSub = this.buildViewModel(this.variant).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (vm) => {
        this.kpis = vm.kpis;
        this.tables = vm.tables;
        this.note = vm.note;
        this.loading = false;
      },
      error: () => {
        this.error = "Unable to load analytics. Please try again.";
        this.loading = false;
      },
    });
  }

  // =========================================================
  // SHARED FETCHERS (existing APIs only, null-safe)
  // =========================================================

  private fetchNotifications(limit = 10): Observable<NotificationSummary> {
    return this.notifications
      .getNotifications({ page: 1, page_size: limit, sort_by: "latest" })
      .pipe(
        map((res: any): NotificationSummary => {
          const items = res?.items ?? [];
          const total = num(res?.total ?? items.length);
          const unread = num(res?.unread_count ?? res?.summary?.unread ?? 0);
          const read = num(res?.summary?.read ?? Math.max(0, total - unread));
          return {
            total,
            unread,
            read,
            rows: items.slice(0, limit).map((n: any) => [
              text(n?.title, "Notification").slice(0, 60),
              text(n?.notification_type),
              shortDate(n?.created_at),
              n?.is_read ? "Read" : "Unread",
            ]),
          };
        }),
        catchError(() =>
          of({ total: 0, unread: 0, read: 0, rows: [] } as NotificationSummary),
        ),
      );
  }

  private fetchSaved(): Observable<{ policies: any[]; schemes: any[] }> {
    return forkJoin({
      policies: this.savedItems
        .getSavedPolicies()
        .pipe(catchError(() => of([] as any[]))),
      schemes: this.savedItems
        .getSavedSchemes()
        .pipe(catchError(() => of([] as any[]))),
    }).pipe(
      map((res) => ({
        policies: Array.isArray(res.policies) ? res.policies : [],
        schemes: Array.isArray(res.schemes) ? res.schemes : [],
      })),
    );
  }

  private fetchSearches(): Observable<any[]> {
    const userId = this.auth.getStoredUser()?.user_id;
    if (!userId) {
      return of([]);
    }
    return this.searchHistory.getUserSearchHistory(userId).pipe(
      map((list: any) => (Array.isArray(list) ? list : [])),
      catchError(() => of([])),
    );
  }

  // =========================================================
  // VARIANT BUILDERS
  // =========================================================

  private buildViewModel(variant: AnalyticsVariant): Observable<AnalyticsViewModel> {
    switch (variant) {
      case "policies":
        return this.analytics.getPolicyAnalytics().pipe(
          map((d: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Total Policies", num(d?.total), "All policies", "description", "blue"),
              this.kpi("Approved", num(d?.approved), "Approved policies", "check_circle", "green"),
              this.kpi("Pending", num(d?.pending), "Awaiting approval", "pending", "orange"),
              this.kpi("Rejected", num(d?.rejected), "Rejected policies", "cancel", "purple"),
            ],
            tables: [
              this.pairTable("By Category", d?.by_category, "category", "Category"),
              this.pairTable("By State", d?.by_state, "state", "State"),
              this.pairTable("By Ministry", d?.by_ministry, "ministry", "Ministry"),
            ],
          })),
        );

      case "schemes":
        return this.analytics.getSchemeAnalytics().pipe(
          map((d: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Total Schemes", num(d?.total), "All schemes", "account_balance", "blue"),
              this.kpi("Approved", num(d?.approved), "Approved schemes", "check_circle", "green"),
              this.kpi("Pending", num(d?.pending), "Awaiting approval", "pending", "orange"),
              this.kpi("Archived", num(d?.archived), "Archived schemes", "archive", "purple"),
            ],
            tables: [
              this.pairTable("By Category", d?.by_category, "category", "Category"),
              this.pairTable("By State", d?.by_state, "state", "State"),
              this.pairTable("By Ministry", d?.by_ministry, "ministry", "Ministry"),
            ],
          })),
        );

      case "users":
        return this.analytics.getUserAnalytics().pipe(
          map((d: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Total Users", num(d?.total_users), "All accounts", "group", "blue"),
              this.kpi("Active Users", num(d?.active_users), "Currently active", "check_circle", "green"),
              this.kpi("Inactive Users", num(d?.inactive_users), "Currently inactive", "cancel", "orange"),
            ],
            tables: [
              this.pairTable("By Role", d?.by_role, "role", "Role", true),
              this.pairTable("By State", d?.by_state, "state", "State"),
            ],
          })),
        );

      case "departments":
        return this.analytics.getDepartments().pipe(
          map((list: any): AnalyticsViewModel => {
            const rows = Array.isArray(list) ? list : [];
            return {
              note: null,
              kpis: [
                this.kpi("Departments", rows.length, "Distinct departments", "domain", "blue"),
              ],
              tables: [
                {
                  title: "Departments",
                  headers: ["Department"],
                  rows: rows.map((r: any) => [text(r?.department)]),
                },
              ],
            };
          }),
        );

      case "usage":
        return forkJoin({
          usage: this.analytics.getUsageStatistics().pipe(catchError(() => of(null))),
          notif: this.fetchNotifications(5),
        }).pipe(
          map(({ usage: d, notif }: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Users", num(d?.users), "Accounts in scope", "group", "blue"),
              this.kpi("Policies", num(d?.policies), "Total policies", "description", "green"),
              this.kpi("Schemes", num(d?.schemes), "Total schemes", "account_balance", "orange"),
              this.kpi("Active Users", num(d?.active_users), "Currently active", "check_circle", "purple"),
              this.kpi("Notifications", num(notif?.total), "Total notifications", "notifications", "blue"),
              this.kpi("Unread", num(notif?.unread), "Needs attention", "mark_as_unread", "orange"),
            ],
            tables: [
              {
                title: "Approvals",
                headers: ["Metric", "Count"],
                rows: [
                  ["Approved Policies", num(d?.approved_policies)],
                  ["Approved Schemes", num(d?.approved_schemes)],
                ],
              },
              {
                title: "Recent Notifications",
                headers: ["Title", "Type", "Date", "Status"],
                rows: notif?.rows ?? [],
              },
            ],
          })),
        );

      case "policy-scheme":
        return forkJoin({
          policies: this.analytics.getPolicyAnalytics().pipe(catchError(() => of(null))),
          schemes: this.analytics.getSchemeAnalytics().pipe(catchError(() => of(null))),
          policyTrends: this.analytics.getPolicyTrends().pipe(catchError(() => of([]))),
          schemeUsage: this.analytics.getSchemeUsage().pipe(catchError(() => of(null))),
        }).pipe(
          map(({ policies: p, schemes: s, policyTrends, schemeUsage }: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Total Policies", num(p?.total), "All policies", "description", "blue"),
              this.kpi("Total Schemes", num(s?.total), "All schemes", "account_balance", "green"),
              this.kpi("Approved Policies", num(p?.approved), "Approved policies", "check_circle", "orange"),
              this.kpi("Approved Schemes", num(s?.approved ?? s?.active), "Approved schemes", "verified", "purple"),
            ],
            tables: [
              {
                title: "Status Distribution",
                headers: ["Metric", "Count"],
                rows: [
                  ["Pending Policies", num(p?.pending)],
                  ["Pending Schemes", num(s?.pending)],
                  ["Rejected Policies", num(p?.rejected)],
                  ["Rejected Schemes", num(s?.rejected)],
                ],
              },
              this.pairTable("Policies By Category", p?.by_category, "category", "Category"),
              this.pairTable("Schemes By Category", s?.by_category, "category", "Category"),
              {
                title: "Policy Trend",
                headers: ["Year", "Month", "New Policies"],
                rows: (Array.isArray(policyTrends) ? policyTrends : []).map((t: any) => [
                  text(t?.year),
                  text(t?.month),
                  num(t?.count),
                ]),
              },
              {
                title: "Scheme Trend",
                headers: ["Year", "Month", "New Schemes"],
                rows: (Array.isArray(schemeUsage?.monthly_trend)
                  ? schemeUsage.monthly_trend
                  : []
                ).map((t: any) => [text(t?.year), text(t?.month), num(t?.count)]),
              },
            ],
          })),
        );

      case "user-notifications":
        return forkJoin({
          activity: this.analytics.getUserActivity().pipe(catchError(() => of(null))),
          notif: this.fetchNotifications(10),
        }).pipe(
          map(({ activity: a, notif }: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Total Users", num(a?.total_users), "Users in scope", "group", "blue"),
              this.kpi("Active Users", num(a?.active_users), "Active accounts", "check_circle", "green"),
              this.kpi("Total Notifications", num(notif?.total), "All notifications", "notifications", "orange"),
              this.kpi("Unread", num(notif?.unread), "Needs attention", "mark_as_unread", "purple"),
            ],
            tables: [
              {
                title: "Recent Notifications",
                headers: ["Title", "Type", "Date", "Status"],
                rows: notif?.rows ?? [],
              },
            ],
          })),
        );

      case "personal":
        return forkJoin({
          usage: this.analytics.getUsageStatistics().pipe(catchError(() => of(null))),
          saved: this.fetchSaved(),
          searches: this.fetchSearches(),
          notif: this.fetchNotifications(5),
        }).pipe(
          map(({ usage: u, saved, searches, notif }: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Saved Policies", saved.policies.length, "Policies you saved", "bookmark", "blue"),
              this.kpi("Saved Schemes", saved.schemes.length, "Schemes you saved", "account_balance", "green"),
              this.kpi("Total Searches", searches.length, "Your searches", "history", "orange"),
              this.kpi("Unread Notifications", num(notif?.unread), "Needs attention", "notifications", "purple"),
              this.kpi("Open Schemes", num(u?.approved_schemes), "Schemes open now", "verified", "green"),
              this.kpi("Platform Policies", num(u?.policies), "Available policies", "description", "blue"),
            ],
            tables: [
              {
                title: "Recent Searches",
                headers: ["Query", "Type", "Date"],
                rows: searches.slice(0, 5).map((r: any) => [
                  text(r?.search_query, "Search").slice(0, 50),
                  text(r?.search_type),
                  shortDate(r?.searched_at),
                ]),
              },
              {
                title: "Recent Notifications",
                headers: ["Title", "Type", "Date", "Status"],
                rows: notif?.rows ?? [],
              },
            ],
          })),
        );

      case "saved-search-application":
        return forkJoin({
          saved: this.fetchSaved(),
          searches: this.fetchSearches(),
          notif: this.fetchNotifications(5),
        }).pipe(
          map(({ saved, searches, notif }: any): AnalyticsViewModel => ({
            note: {
              icon: "assignment",
              title: "Application Status",
              text: "PolicyGPT does not track scheme applications yet. Your saved items and searches below reflect your current activity.",
            },
            kpis: [
              this.kpi("Saved Policies", saved.policies.length, "Policies you saved", "bookmark", "blue"),
              this.kpi("Saved Schemes", saved.schemes.length, "Schemes you saved", "account_balance", "green"),
              this.kpi("Total Searches", searches.length, "Your searches", "history", "orange"),
              this.kpi("Unread Notifications", num(notif?.unread), "Needs attention", "notifications", "purple"),
            ],
            tables: [
              {
                title: "Saved Policies",
                headers: ["Policy", "Category", "State", "Status", "Saved On"],
                rows: saved.policies.slice(0, 10).map((p: any) => [
                  text(p?.title, "Policy").slice(0, 50),
                  text(p?.category),
                  text(p?.state),
                  prettyLabel(p?.status),
                  shortDate(p?.saved_at),
                ]),
              },
              {
                title: "Saved Schemes",
                headers: ["Scheme", "Category", "State", "Status", "Saved On"],
                rows: saved.schemes.slice(0, 10).map((s: any) => [
                  text(s?.name, "Scheme").slice(0, 50),
                  text(s?.category),
                  text(s?.state),
                  prettyLabel(s?.status),
                  shortDate(s?.saved_at),
                ]),
              },
              {
                title: "Recent Searches",
                headers: ["Query", "Type", "Date"],
                rows: searches.slice(0, 10).map((r: any) => [
                  text(r?.search_query, "Search").slice(0, 50),
                  text(r?.search_type),
                  shortDate(r?.searched_at),
                ]),
              },
            ],
          })),
        );

      case "research":
        return forkJoin({
          policies: this.analytics.getPolicyAnalytics().pipe(catchError(() => of(null))),
          schemes: this.analytics.getSchemeAnalytics().pipe(catchError(() => of(null))),
          usage: this.analytics.getUsageStatistics().pipe(catchError(() => of(null))),
          searches: this.fetchSearches(),
          saved: this.fetchSaved(),
        }).pipe(
          map(({ policies: p, schemes: s, usage: u, searches, saved }: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Total Policies", num(p?.total), "Research corpus", "description", "blue"),
              this.kpi("Total Schemes", num(s?.total), "Research corpus", "account_balance", "green"),
              this.kpi("Total Searches", searches.length, "Your searches", "history", "orange"),
              this.kpi(
                "Saved Items",
                saved.policies.length + saved.schemes.length,
                "Your saved research",
                "bookmark",
                "purple",
              ),
              this.kpi("Platform Users", num(u?.users), "Accounts in scope", "group", "blue"),
              this.kpi("Approved Policies", num(p?.approved), "Approved corpus", "check_circle", "green"),
            ],
            tables: [
              this.pairTable("Policies By Category", p?.by_category, "category", "Category"),
              this.pairTable("Schemes By Category", s?.by_category, "category", "Category"),
              {
                title: "Recent Searches",
                headers: ["Query", "Type", "Date"],
                rows: searches.slice(0, 5).map((r: any) => [
                  text(r?.search_query, "Search").slice(0, 50),
                  text(r?.search_type),
                  shortDate(r?.searched_at),
                ]),
              },
            ],
          })),
        );

      case "policy-scheme-trends":
        return forkJoin({
          policies: this.analytics.getPolicyAnalytics().pipe(catchError(() => of(null))),
          schemes: this.analytics.getSchemeAnalytics().pipe(catchError(() => of(null))),
          policyTrends: this.analytics.getPolicyTrends().pipe(catchError(() => of([]))),
          schemeUsage: this.analytics.getSchemeUsage().pipe(catchError(() => of(null))),
        }).pipe(
          map(({ policies: p, schemes: s, policyTrends, schemeUsage }: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Total Policies", num(p?.total), "All policies", "description", "blue"),
              this.kpi("Total Schemes", num(s?.total), "All schemes", "account_balance", "green"),
              this.kpi("Approved Policies", num(p?.approved), "Approved policies", "check_circle", "orange"),
              this.kpi("Approved Schemes", num(s?.approved ?? s?.active), "Approved schemes", "verified", "purple"),
            ],
            tables: [
              {
                title: "Policy Trend",
                headers: ["Year", "Month", "New Policies"],
                rows: (Array.isArray(policyTrends) ? policyTrends : []).map((t: any) => [
                  text(t?.year),
                  text(t?.month),
                  num(t?.count),
                ]),
              },
              {
                title: "Scheme Trend",
                headers: ["Year", "Month", "New Schemes"],
                rows: (Array.isArray(schemeUsage?.monthly_trend)
                  ? schemeUsage.monthly_trend
                  : []
                ).map((t: any) => [text(t?.year), text(t?.month), num(t?.count)]),
              },
              this.pairTable("Policies By Category", p?.by_category, "category", "Category"),
              this.pairTable("Schemes By Category", s?.by_category, "category", "Category"),
              this.pairTable("Policies By State", p?.by_state, "state", "State"),
              this.pairTable("Schemes By State", s?.by_state, "state", "State"),
            ],
          })),
        );

      case "organization":
        return forkJoin({
          dashboard: this.analytics.getDashboardAnalytics().pipe(catchError(() => of(null))),
          saved: this.fetchSaved(),
          searches: this.fetchSearches(),
        }).pipe(
          map(({ dashboard: d, saved, searches }: any): AnalyticsViewModel => {
            const p = d?.policies ?? {};
            const s = d?.schemes ?? {};
            return {
              note: null,
              kpis: [
                this.kpi("Total Policies", num(p?.total ?? d?.total_policies), "Platform policies", "description", "blue"),
                this.kpi("Total Schemes", num(s?.total ?? d?.total_schemes), "Platform schemes", "account_balance", "green"),
                this.kpi(
                  "Saved Items",
                  saved.policies.length + saved.schemes.length,
                  "Your saved content",
                  "bookmark",
                  "orange",
                ),
                this.kpi("Total Searches", searches.length, "Your searches", "history", "purple"),
              ],
              tables: [
                {
                  title: "Policy Status",
                  headers: ["Status", "Count"],
                  rows: [
                    ["Approved", num(p?.approved)],
                    ["Pending", num(p?.pending)],
                    ["Rejected", num(p?.rejected)],
                    ["Archived", num(p?.archived)],
                  ],
                },
                {
                  title: "Scheme Status",
                  headers: ["Status", "Count"],
                  rows: [
                    ["Approved", num(s?.approved)],
                    ["Pending", num(s?.pending)],
                    ["Rejected", num(s?.rejected)],
                    ["Archived", num(s?.archived)],
                  ],
                },
                {
                  title: "Recent Searches",
                  headers: ["Query", "Type", "Date"],
                  rows: searches.slice(0, 5).map((r: any) => [
                    text(r?.search_query, "Search").slice(0, 50),
                    text(r?.search_type),
                    shortDate(r?.searched_at),
                  ]),
                },
              ],
            };
          }),
        );

      case "policy-scheme-usage":
        return forkJoin({
          policies: this.analytics.getPolicyAnalytics().pipe(catchError(() => of(null))),
          schemes: this.analytics.getSchemeAnalytics().pipe(catchError(() => of(null))),
          usage: this.analytics.getUsageStatistics().pipe(catchError(() => of(null))),
        }).pipe(
          map(({ policies: p, schemes: s, usage: u }: any): AnalyticsViewModel => ({
            note: null,
            kpis: [
              this.kpi("Total Policies", num(p?.total), "All policies", "description", "blue"),
              this.kpi("Total Schemes", num(s?.total), "All schemes", "account_balance", "green"),
              this.kpi("Platform Users", num(u?.users), "Accounts in scope", "group", "orange"),
              this.kpi("Active Users", num(u?.active_users), "Currently active", "check_circle", "purple"),
            ],
            tables: [
              this.pairTable("Policies By Category", p?.by_category, "category", "Category"),
              this.pairTable("Schemes By Category", s?.by_category, "category", "Category"),
              {
                title: "Approvals",
                headers: ["Metric", "Count"],
                rows: [
                  ["Approved Policies", num(p?.approved)],
                  ["Approved Schemes", num(s?.approved ?? s?.active)],
                ],
              },
            ],
          })),
        );

      case "overview":
      default:
        return this.analytics.getDashboardAnalytics().pipe(
          map((d: any): AnalyticsViewModel => {
            const p = d?.policies ?? {};
            const s = d?.schemes ?? {};
            const u = d?.users ?? {};
            return {
              note: null,
              kpis: [
                this.kpi("Total Policies", num(p?.total ?? d?.total_policies), "Platform policies", "description", "blue"),
                this.kpi("Total Schemes", num(s?.total ?? d?.total_schemes), "Platform schemes", "account_balance", "green"),
                this.kpi("Total Users", num(u?.total ?? d?.total_users), "Registered accounts", "group", "orange"),
                this.kpi("Active Users", num(u?.active ?? d?.active_users), "Currently active", "check_circle", "purple"),
              ],
              tables: [
                {
                  title: "Policy Status",
                  headers: ["Status", "Count"],
                  rows: [
                    ["Approved", num(p?.approved)],
                    ["Pending", num(p?.pending)],
                    ["Rejected", num(p?.rejected)],
                    ["Archived", num(p?.archived)],
                  ],
                },
                {
                  title: "Scheme Status",
                  headers: ["Status", "Count"],
                  rows: [
                    ["Approved", num(s?.approved)],
                    ["Pending", num(s?.pending)],
                    ["Rejected", num(s?.rejected)],
                    ["Archived", num(s?.archived)],
                  ],
                },
              ],
            };
          }),
        );
    }
  }

  // =========================================================
  // BUILDERS
  // =========================================================

  private kpi(
    label: string,
    value: number | string,
    sub: string,
    icon: string,
    tone: AnalyticsKpi["tone"],
  ): AnalyticsKpi {
    return { label, value, sub, icon, tone };
  }

  private pairTable(
    title: string,
    items: unknown,
    key: string,
    header: string,
    prettify = false,
  ): AnalyticsTable {
    const rows = (Array.isArray(items) ? items : []).map((item: any) => [
      prettify ? prettyLabel(item?.[key]) : text(item?.[key]),
      num(item?.count),
    ]);
    return { title, headers: [header, "Count"], rows };
  }

  get isEmpty(): boolean {
    return (
      this.kpis.length === 0 &&
      this.note === null &&
      this.tables.every((t) => t.rows.length === 0)
    );
  }
}
