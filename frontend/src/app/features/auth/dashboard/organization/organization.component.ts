import { Component, DestroyRef, OnInit, ChangeDetectorRef, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";

import { Auth, AuthUser } from "../../../../core/services/auth";
import {
  AnalyticsService,
  PolicyAnalyticsResponse,
  SchemeAnalyticsResponse,
} from "../../../../core/services/analytics.service";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { SavedItemsService } from "../../../../core/services/saved-items.service";
import { PolicyResponse } from "../../../../core/models/policy.model";
import { SchemeResponse } from "../../../../core/models/scheme.model";

/* =========================================================
   STAT CARD
   ========================================================= */

export interface OrganizationStat {
  icon: string;
  color: "blue" | "orange" | "green" | "purple";
  value: number;
  label: string;
  sub?: string;
}

/* =========================================================
   RECENT ACTIVITY
   ========================================================= */

export interface OrganizationActivity {
  id?: number;
  icon: string;
  type: "policy" | "scheme" | "comparison" | "insight";
  title: string;
  description: string;
  date: string;
}

/* =========================================================
   QUICK ACTION
   ========================================================= */

export interface OrganizationQuickAction {
  icon: string;
  title: string;
  description: string;
  route: string;
}

/* =========================================================
   SECTOR INSIGHT
   ========================================================= */

export interface SectorInsight {
  name: string;
  percentage: number;
  icon: string;
}

/* =========================================================
   SAVED ITEM
   ========================================================= */

export interface SavedOrganizationItem {
  id?: number;
  type: "policy" | "scheme";
  name: string;
  ministry: string;
  savedOn: string;
}

import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

/* =========================================================
   ORGANIZATION DASHBOARD
   ========================================================= */

@Component({
  selector: "app-organization",
  standalone: true,
  imports: [CommonModule, CountUpDirective],
  templateUrl: "./organization.component.html",
  styleUrl: "./organization.component.scss",
})
export class OrganizationComponent implements OnInit {
  private readonly authService = inject(Auth);
  private readonly router = inject(Router);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);
  private readonly savedItemsService = inject(SavedItemsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  /* =======================================================
     USER
     ======================================================= */

  user: AuthUser | null = null;
  userName = "Organization";
  userRole = "ORGANIZATION";
  loadingUser = true;

  /* =======================================================
     LOADING STATES
     ======================================================= */

  loadingStats = true;
  loadingActivity = true;
  loadingInsights = true;
  loadingSavedItems = false;

  /* =======================================================
     ORGANIZATION STATISTICS
     ======================================================= */

  organizationStats: OrganizationStat[] = [
    {
      icon: "policy",
      color: "blue",
      value: 0,
      label: "Policies Available",
      sub: "Active public policies",
    },
    {
      icon: "account_balance",
      color: "orange",
      value: 0,
      label: "Schemes Explored",
      sub: "Active public schemes",
    },
    {
      icon: "bookmark",
      color: "green",
      value: 0,
      label: "Saved Items",
      sub: "Policies & schemes",
    },
    {
      icon: "category",
      color: "purple",
      value: 0,
      label: "Sectors Covered",
      sub: "Across development areas",
    },
  ];

  /* =======================================================
     RECENT ORGANIZATION ACTIVITY
     ======================================================= */

  recentActivity: OrganizationActivity[] = [];

  /* =======================================================
     QUICK RESEARCH / ORGANIZATION ACTIONS
     ======================================================= */

  quickActions: OrganizationQuickAction[] = [
    {
      icon: "manage_search",
      title: "Search Policies",
      description: "Find relevant government policies",
      route: "/dashboard/organization/policies",
    },
    {
      icon: "account_balance",
      title: "Search Schemes",
      description: "Explore government schemes",
      route: "/dashboard/organization/schemes",
    },
    {
      icon: "compare_arrows",
      title: "Compare Policies",
      description: "Compare policies and schemes",
      route: "/dashboard/organization/compare",
    },
    {
      icon: "insights",
      title: "Organization Insights",
      description: "Explore policy repository & trends",
      route: "/dashboard/organization/policies",
    },
  ];

  /* =======================================================
     SECTOR INSIGHTS
     ======================================================= */

  sectorInsights: SectorInsight[] = [];

  /* =======================================================
     SAVED ORGANIZATION ITEMS
     ======================================================= */

  savedItems: SavedOrganizationItem[] = [];

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  get dashboardTitle(): string {
    return "ORGANIZATION DASHBOARD";
  }

  get displayRole(): string {
    return "Organization";
  }

  private loadCurrentUser(): void {
    this.loadingUser = true;

    const cachedUser = this.authService.getStoredUser();
    if (cachedUser) {
      this.setUserDetails(cachedUser);
      this.loadingUser = false;
    }

    const token = this.authService.getToken();
    if (!token) {
      this.loadingUser = false;
      this.authService.logout();
      this.router.navigate(["/auth/login"], { replaceUrl: true });
      return;
    }

    this.authService.getCurrentUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (user: AuthUser) => {
        if (user) {
          this.setUserDetails(user);
        }
        this.loadingUser = false;
        this.loadDashboardData();
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingUser = false;
        this.loadDashboardData();
        this.cdr.detectChanges();
      },
    });
  }

  private loadDashboardData(): void {
    // Saved-item counts and list come from the authenticated user's
    // backend records (same source as the Saved Items page), never
    // global localStorage bookmark caches which leak across users.
    forkJoin({
      policyAnalytics: this.analyticsService
        .getPolicyAnalytics()
        .pipe(catchError(() => of({ total: 0, approved: 0, pending: 0, rejected: 0, archived: 0, by_category: [], by_state: [], by_ministry: [], monthly_trend: [] } as PolicyAnalyticsResponse))),
      schemeAnalytics: this.analyticsService
        .getSchemeAnalytics()
        .pipe(catchError(() => of({ total: 0, active: 0, pending: 0, rejected: 0, archived: 0, by_category: [], by_state: [], by_ministry: [], monthly_trend: [] } as SchemeAnalyticsResponse))),
      policies: this.policyService
        .getPolicies({ status: "APPROVED", limit: 3 })
        .pipe(catchError(() => of({ policies: [], total: 0, page: 1, pages: 1, limit: 3 }))),
      schemes: this.schemeService
        .getSchemes({ status: "APPROVED", limit: 3 })
        .pipe(catchError(() => of({ schemes: [], total: 0, page: 1, pages: 1, limit: 3 }))),
      savedPolicies: this.savedItemsService
        .getSavedPolicies()
        .pipe(catchError(() => of([]))),
      savedSchemes: this.savedItemsService
        .getSavedSchemes()
        .pipe(catchError(() => of([]))),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ policyAnalytics, schemeAnalytics, policies, schemes, savedPolicies, savedSchemes }) => {
        const approvedPolicies = policyAnalytics.approved || policyAnalytics.total || 0;
        const activeSchemes = schemeAnalytics.active || schemeAnalytics.total || 0;
        const totalCategories = (policyAnalytics.by_category?.length || 0) + (schemeAnalytics.by_category?.length || 0);
        const savedPoliciesCount = Array.isArray(savedPolicies) ? savedPolicies.length : 0;
        const savedSchemesCount = Array.isArray(savedSchemes) ? savedSchemes.length : 0;
        const savedCount = savedPoliciesCount + savedSchemesCount;

        this.organizationStats = [
          {
            icon: "policy",
            color: "blue",
            value: approvedPolicies,
            label: "Policies Available",
            sub: "Active public policies",
          },
          {
            icon: "account_balance",
            color: "orange",
            value: activeSchemes,
            label: "Schemes Explored",
            sub: "Active public schemes",
          },
          {
            icon: "bookmark",
            color: "green",
            value: savedCount,
            label: "Saved Items",
            sub: "Policies & schemes",
          },
          {
            icon: "category",
            color: "purple",
            value: totalCategories,
            label: "Sectors Covered",
            sub: "Development areas",
          },
        ];
        this.loadingStats = false;

        // Process Sector Insights dynamically
        this.computeSectorInsights(policyAnalytics.by_category || []);
        this.loadingInsights = false;

        // Populate recent activity
        const activityList: OrganizationActivity[] = [];

        const policyList: PolicyResponse[] = Array.isArray(policies?.policies) ? policies.policies : [];
        policyList.forEach((p) => {
          activityList.push({
            id: p.policy_id,
            icon: "policy",
            type: "policy",
            title: p.title,
            description: p.ministry || p.department || "Government Policy",
            date: p.created_at ? new Date(p.created_at).toLocaleDateString() : "Recent",
          });
        });

        const schemeList: SchemeResponse[] = Array.isArray(schemes?.schemes) ? schemes.schemes : [];
        schemeList.forEach((s) => {
          activityList.push({
            id: s.scheme_id,
            icon: "account_balance",
            type: "scheme",
            title: s.name || (s as any).title || "Government Scheme",
            description: s.ministry || s.department || "Public Scheme",
            date: s.created_at ? new Date(s.created_at).toLocaleDateString() : "Recent",
          });
        });

        this.recentActivity = activityList.slice(0, 4);
        this.loadingActivity = false;

        // Saved list from the same backend records as the counts above.
        this.savedItems = [
          ...(Array.isArray(savedPolicies) ? savedPolicies : [])
            .slice(0, 2)
            .map((item: any) => ({
              id: item.policy_id,
              type: "policy" as const,
              name: item.title || "Saved Policy",
              ministry: item.ministry || "Policy Repository",
              savedOn: "Bookmarked",
            })),
          ...(Array.isArray(savedSchemes) ? savedSchemes : [])
            .slice(0, 2)
            .map((item: any) => ({
              id: item.scheme_id,
              type: "scheme" as const,
              name: item.name || "Saved Scheme",
              ministry: item.ministry || "Scheme Repository",
              savedOn: "Bookmarked",
            })),
        ];

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("[ORGANIZATION DASHBOARD] Error loading data:", err);
        this.loadingStats = false;
        this.loadingInsights = false;
        this.loadingActivity = false;
        this.cdr.detectChanges();
      },
    });
  }

  private computeSectorInsights(categories: { category: string; count: number }[]): void {
    if (!categories.length) {
      this.sectorInsights = [];
      return;
    }

    const totalCount = categories.reduce((sum, c) => sum + (c.count || 0), 0) || 1;
    const sorted = [...categories].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 4);

    this.sectorInsights = sorted.map((item) => {
      const percentage = Math.round(((item.count || 0) / totalCount) * 100);
      return {
        name: item.category || "General",
        percentage: Math.max(percentage, 5),
        icon: this.getCategoryIcon(item.category),
      };
    });
  }

  private getCategoryIcon(category?: string | null): string {
    const cat = (category || "").toLowerCase();
    if (cat.includes("education") || cat.includes("school")) return "school";
    if (cat.includes("health") || cat.includes("medical")) return "local_hospital";
    if (cat.includes("agri") || cat.includes("farmer")) return "agriculture";
    if (cat.includes("tech") || cat.includes("digital")) return "computer";
    if (cat.includes("finance") || cat.includes("bank")) return "account_balance";
    return "business";
  }

  private setUserDetails(user: AuthUser): void {
    this.user = user;
    this.userName = user.full_name?.trim() || "Organization";
    this.userRole = user.role?.trim().toUpperCase() || "ORGANIZATION";
  }

  navigateTo(route: string): void {
    if (!route) return;
    this.router.navigate([route]);
  }

  searchPolicies(): void {
    this.router.navigate(["/dashboard/organization/policies"]);
  }

  searchSchemes(): void {
    this.router.navigate(["/dashboard/organization/schemes"]);
  }

  comparePolicies(): void {
    this.router.navigate(["/dashboard/organization/compare"]);
  }

  viewInsights(): void {
    this.router.navigate(["/dashboard/organization/policies"]);
  }

  viewSavedItems(): void {
    this.router.navigate(["/dashboard/organization/policies"]);
  }

  viewHistory(): void {
    this.router.navigate(["/dashboard/organization/schemes"]);
  }

  viewNotifications(): void {
    this.router.navigate(["/dashboard/organization"]);
  }

  viewPolicy(policyTarget?: number | string): void {
    if (typeof policyTarget === "number") {
      this.router.navigate(["/dashboard/organization/policies", policyTarget]);
    } else if (typeof policyTarget === "string" && policyTarget.trim()) {
      this.router.navigate(["/dashboard/organization/policies"], {
        queryParams: { search: policyTarget.trim() },
      });
    } else {
      this.router.navigate(["/dashboard/organization/policies"]);
    }
  }

  viewScheme(schemeTarget?: number | string): void {
    if (typeof schemeTarget === "number") {
      this.router.navigate(["/dashboard/organization/schemes", schemeTarget]);
    } else if (typeof schemeTarget === "string" && schemeTarget.trim()) {
      this.router.navigate(["/dashboard/organization/schemes"], {
        queryParams: { keyword: schemeTarget.trim() },
      });
    } else {
      this.router.navigate(["/dashboard/organization/schemes"]);
    }
  }

  viewActivity(activity: OrganizationActivity): void {
    if (activity.type === "policy" && activity.id) {
      this.viewPolicy(activity.id);
      return;
    }
    if (activity.type === "scheme" && activity.id) {
      this.viewScheme(activity.id);
      return;
    }
    if (activity.type === "comparison") {
      this.comparePolicies();
      return;
    }
    this.viewInsights();
  }

  getSectorWidth(percentage: number): string {
    return `${percentage}%`;
  }

  getSavedItemIcon(type: "policy" | "scheme"): string {
    return type === "policy" ? "policy" : "account_balance";
  }

  getSavedItemRoute(type: "policy" | "scheme"): string {
    return type === "policy" ? "/dashboard/organization/policies" : "/dashboard/organization/schemes";
  }
}
