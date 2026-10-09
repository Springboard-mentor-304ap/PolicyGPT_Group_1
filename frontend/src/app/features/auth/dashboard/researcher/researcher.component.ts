import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";

import {
  AnalyticsService,
  PolicyAnalyticsResponse,
  SchemeAnalyticsResponse,
  PolicyTrendItem,
} from "../../../../core/services/analytics.service";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { SavedItemsService } from "../../../../core/services/saved-items.service";
import { PolicyResponse } from "../../../../core/models/policy.model";
import { SchemeResponse } from "../../../../core/models/scheme.model";
import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

/* =========================================================
   TYPES
   ========================================================= */

export interface ResearchStat {
  icon: string;
  value: string | number;
  label: string;
  description: string;
  type: "blue" | "orange" | "green" | "purple";
}

export interface ResearchItem {
  id?: number;
  icon: string;
  title: string;
  description: string;
  date: string;
  type: "policy" | "scheme" | "compare" | "analytics";
}

export interface QuickAction {
  icon: string;
  title: string;
  description: string;
  route: string;
}

export interface TrendBar {
  monthName: string;
  count: number;
  heightPercent: number;
}

/* =========================================================
   COMPONENT
   ========================================================= */

@Component({
  selector: "app-researcher",
  standalone: true,
  imports: [CommonModule, CountUpDirective],
  templateUrl: "./researcher.component.html",
  styleUrls: ["./researcher.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearcherComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);
  private readonly savedItemsService = inject(SavedItemsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  loading = true;
  error = "";
  userName = "Researcher";

  /* =======================================================
     RESEARCH STATISTICS
     ======================================================= */

  researchStats: ResearchStat[] = [
    {
      icon: "policy",
      value: "—",
      label: "Policies Available",
      description: "Across government departments",
      type: "blue",
    },
    {
      icon: "account_balance",
      value: "—",
      label: "Schemes Explored",
      description: "Central and state programmes",
      type: "orange",
    },
    {
      icon: "category",
      value: "—",
      label: "Policy Sectors",
      description: "Unique focus areas",
      type: "green",
    },
    {
      icon: "bookmark",
      value: "—",
      label: "Saved Items",
      description: "Saved for later reference",
      type: "purple",
    },
  ];

  /* =======================================================
     RECENT RESEARCH
     ======================================================= */

  recentResearch: ResearchItem[] = [];

  /* =======================================================
     TREND BARS
     ======================================================= */

  trendBars: TrendBar[] = [];
  monthlyPoliciesCount = 0;

  /* =======================================================
     QUICK ACTIONS
     ======================================================= */

  readonly quickActions: QuickAction[] = [
    {
      icon: "search",
      title: "Search Policies",
      description: "Find government policies by keyword or category.",
      route: "/dashboard/researcher/policies",
    },
    {
      icon: "account_balance",
      title: "Explore Schemes",
      description: "Discover government schemes and their benefits.",
      route: "/dashboard/researcher/schemes",
    },
    {
      icon: "compare_arrows",
      title: "Compare Policies & Schemes",
      description: "Compare policies & schemes side by side.",
      route: "/dashboard/researcher/compare",
    },
    {
      icon: "analytics",
      title: "Research Analytics",
      description: "Review research activity, trends and saved insights.",
      route: "/dashboard/researcher/analytics",
    },
  ];

  ngOnInit(): void {
    try {
      const stored = localStorage.getItem("auth_user");
      if (stored) {
        const u = JSON.parse(stored);
        if (u?.full_name) {
          this.userName = u.full_name;
        }
      }
    } catch {}
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.loading = true;
    this.error = "";
    this.cdr.markForCheck();

    // Saved count from the authenticated user's backend records (same
    // source as the Saved Items page), never global localStorage caches.
    forkJoin({
      policyAnalytics: this.analyticsService.getPolicyAnalytics().pipe(
        catchError(() =>
          of({
            total: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
            archived: 0,
            by_category: [],
            by_state: [],
            by_ministry: [],
            monthly_trend: [],
          } as PolicyAnalyticsResponse),
        ),
      ),
      schemeAnalytics: this.analyticsService.getSchemeAnalytics().pipe(
        catchError(() =>
          of({
            total: 0,
            active: 0,
            pending: 0,
            rejected: 0,
            archived: 0,
            by_category: [],
            by_state: [],
            by_ministry: [],
            monthly_trend: [],
          } as SchemeAnalyticsResponse),
        ),
      ),
      trends: this.analyticsService
        .getPolicyTrends()
        .pipe(catchError(() => of([] as PolicyTrendItem[]))),
      policies: this.policyService
        .getPolicies({ status: "APPROVED", limit: 3 })
        .pipe(
          catchError(() =>
            of({ policies: [], total: 0, page: 1, pages: 1, limit: 3 }),
          ),
        ),
      schemes: this.schemeService
        .getSchemes({ status: "APPROVED", limit: 3 })
        .pipe(
          catchError(() =>
            of({ schemes: [], total: 0, page: 1, pages: 1, limit: 3 }),
          ),
        ),
      savedPolicies: this.savedItemsService
        .getSavedPolicies()
        .pipe(catchError(() => of([]))),
      savedSchemes: this.savedItemsService
        .getSavedSchemes()
        .pipe(catchError(() => of([]))),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({
        policyAnalytics,
        schemeAnalytics,
        trends,
        policies,
        schemes,
        savedPolicies,
        savedSchemes,
      }) => {
        const approvedPolicies =
          policyAnalytics.approved || policyAnalytics.total || 0;
        const activeSchemes =
          schemeAnalytics.active || schemeAnalytics.total || 0;
        const totalCategories =
          (policyAnalytics.by_category?.length || 0) +
          (schemeAnalytics.by_category?.length || 0);
        const savedCount =
          (Array.isArray(savedPolicies) ? savedPolicies.length : 0) +
          (Array.isArray(savedSchemes) ? savedSchemes.length : 0);

        this.researchStats = [
          {
            icon: "policy",
            value: approvedPolicies,
            label: "Policies Available",
            description: "Across government departments",
            type: "blue",
          },
          {
            icon: "account_balance",
            value: activeSchemes,
            label: "Schemes Explored",
            description: "Central and state programmes",
            type: "orange",
          },
          {
            icon: "category",
            value: totalCategories,
            label: "Policy Sectors",
            description: "Active development sectors",
            type: "green",
          },
          {
            icon: "bookmark",
            value: savedCount,
            label: "Saved Items",
            description: "Saved for later reference",
            type: "purple",
          },
        ];

        // Combine recent policies and schemes into recent research
        const items: ResearchItem[] = [];

        const policyList: PolicyResponse[] = Array.isArray(policies?.policies)
          ? policies.policies
          : [];
        policyList.forEach((p) => {
          items.push({
            id: p.policy_id,
            icon: "policy",
            title: p.title,
            description: p.ministry || p.department || "Government Policy",
            date: p.created_at
              ? new Date(p.created_at).toLocaleDateString()
              : "Recent",
            type: "policy",
          });
        });

        const schemeList: SchemeResponse[] = Array.isArray(schemes?.schemes)
          ? schemes.schemes
          : [];
        schemeList.forEach((s) => {
          items.push({
            id: s.scheme_id,
            icon: "account_balance",
            title: s.name || (s as any).title || "Government Scheme",
            description: s.ministry || s.department || "Public Scheme",
            date: s.created_at
              ? new Date(s.created_at).toLocaleDateString()
              : "Recent",
            type: "scheme",
          });
        });

        this.recentResearch = items.slice(0, 4);

        // Process Trends
        this.processTrends(trends);

        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error("[RESEARCHER DASHBOARD] Error loading data:", err);
        this.error = "Unable to load researcher data.";
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private processTrends(trends: PolicyTrendItem[]): void {
    const monthNames = [
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
    ];
    if (Array.isArray(trends) && trends.length > 0) {
      const recent = trends.slice(-6);
      const maxCount = Math.max(...recent.map((t) => t.count), 1);
      this.trendBars = recent.map((t) => ({
        monthName: monthNames[(t.month - 1) % 12] || `${t.month}`,
        count: t.count,
        heightPercent: Math.max(15, Math.round((t.count / maxCount) * 100)),
      }));
      this.monthlyPoliciesCount = recent[recent.length - 1]?.count || 0;
    } else {
      // Fallback 6 default monthly bars if trend table is empty
      const currentMonth = new Date().getMonth();
      this.trendBars = Array.from({ length: 6 }).map((_, i) => {
        const mIdx = (currentMonth - 5 + i + 12) % 12;
        return {
          monthName: monthNames[mIdx],
          count: 0,
          heightPercent: 20,
        };
      });
      this.monthlyPoliciesCount = 0;
    }
  }

  /* =======================================================
     NAVIGATION ACTIONS
     ======================================================= */

  searchPolicies(): void {
    this.navigateTo("/dashboard/researcher/policies");
  }

  searchSchemes(): void {
    this.navigateTo("/dashboard/researcher/schemes");
  }

  viewAllResearch(): void {
    this.navigateTo("/dashboard/researcher/policies");
  }

  viewAnalytics(): void {
    this.navigateTo("/dashboard/researcher/analytics");
  }

  viewSavedResearch(): void {
    this.navigateTo("/dashboard/researcher/saved");
  }

  openResearchItem(item: ResearchItem): void {
    if (item.type === "policy" && item.id) {
      this.navigateTo(`/dashboard/researcher/policies/${item.id}`);
    } else if (item.type === "scheme" && item.id) {
      this.navigateTo(`/dashboard/researcher/schemes/${item.id}`);
    } else {
      this.navigateTo("/dashboard/researcher/policies");
    }
  }

  navigateTo(route: string): void {
    if (!route || route === "#") {
      return;
    }

    this.router.navigateByUrl(route).catch((error: unknown) => {
      console.error(`Unable to navigate to ${route}:`, error);
    });
  }
}
