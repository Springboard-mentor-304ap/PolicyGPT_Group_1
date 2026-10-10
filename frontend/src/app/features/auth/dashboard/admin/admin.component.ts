import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";

import { Auth } from "../../../../core/services/auth";
import {
  AnalyticsService,
  DashboardAnalyticsResponse,
} from "../../../../core/services/analytics.service";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { PolicyResponse } from "../../../../core/models/policy.model";
import { SchemeResponse } from "../../../../core/models/scheme.model";

import { CountUpDirective } from "../../../../shared/directives/count-up.directive";
import {
  CategoryIconFields,
  categoryIconFields,
  getCategoryIconClass,
  getCategoryIconName,
} from "../../../../core/utils/category-icon.util";

// =========================================================
// STAT CARD
// =========================================================

export interface StatCard {
  label: string;
  value: number | null;
  sublabel: string;
  icon: string;
  color: "blue" | "orange" | "green" | "purple";
  route?: string;
}

// =========================================================
// LIST ITEM
// =========================================================

export interface ListItem extends CategoryIconFields {
  id: number;
  title: string;
  ministry: string;
  icon?: string;
  iconClass?: string;
  category?: string | null;
}

// =========================================================
// ADMIN DASHBOARD
// =========================================================

@Component({
  selector: "app-admin-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink, CountUpDirective],
  templateUrl: "./admin.component.html",
  styleUrl: "./admin.component.scss",
})
export class AdminComponent implements OnInit {
  private readonly auth = inject(Auth);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);
  private readonly cdr = inject(ChangeDetectorRef);

  // =======================================================
  // LOGGED-IN USER
  // =======================================================

  userName = "Administrator";

  // =======================================================
  // LOADING & ERROR STATES
  // =======================================================

  loadingStats = true;
  loadingSchemes = true;
  loadingPolicies = true;

  statsError = "";
  schemesError = "";
  policiesError = "";

  // =======================================================
  // STATISTICS
  // =======================================================

  statCards: StatCard[] = [
    {
      label: "Total Policies",
      value: null,
      sublabel: "Loading...",
      icon: "policy",
      color: "blue",
      route: "/dashboard/admin/policies/search",
    },
    {
      label: "Total Schemes",
      value: null,
      sublabel: "Loading...",
      icon: "article",
      color: "orange",
      route: "/dashboard/admin/schemes",
    },
    {
      label: "Total Users",
      value: null,
      sublabel: "Loading...",
      icon: "groups",
      color: "green",
      route: "/dashboard/admin/users",
    },
    {
      label: "Pending Approvals",
      value: null,
      sublabel: "Loading...",
      icon: "pending_actions",
      color: "purple",
      route: "/dashboard/admin/schemes/manage",
    },
  ];

  // =======================================================
  // SCHEMES & POLICIES LISTS
  // =======================================================

  schemes: ListItem[] = [];
  policies: ListItem[] = [];

  ngOnInit(): void {
    this.loadUserData();
    this.loadDashboardStats();
    this.loadRecentSchemes();
    this.loadRecentPolicies();
  }

  private loadUserData(): void {
    const storedUser = this.auth.getStoredUser();
    if (storedUser?.full_name) {
      this.userName = storedUser.full_name;
    }

    this.auth.getCurrentUser().subscribe({
      next: (user) => {
        if (user?.full_name) {
          this.userName = user.full_name;
          this.cdr.detectChanges();
        }
      },
      error: () => {},
    });
  }

  loadDashboardStats(): void {
    this.loadingStats = true;
    this.statsError = "";
    this.cdr.detectChanges();

    this.analyticsService.getDashboardAnalytics().subscribe({
      next: (data: any) => {
        const totalPolicies = data?.total_policies ?? data?.policies?.total ?? 0;
        const approvedPolicies = data?.approved_policies ?? data?.policies?.approved ?? 0;
        const pendingPolicies = data?.pending_policies ?? data?.policies?.pending ?? 0;
        const totalSchemes = data?.total_schemes ?? data?.schemes?.total ?? 0;
        const activeSchemes = data?.active_schemes ?? data?.approved_schemes ?? data?.schemes?.approved ?? 0;
        const pendingSchemes = data?.pending_schemes ?? data?.schemes?.pending ?? 0;
        const totalUsers = data?.total_users ?? data?.users?.total ?? 0;
        const pendingAll = pendingPolicies + pendingSchemes;

        this.statCards = [
          {
            label: "Total Policies",
            value: totalPolicies,
            sublabel: `${approvedPolicies} approved, ${pendingPolicies} pending`,
            icon: "policy",
            color: "blue",
            route: "/dashboard/admin/policies/search",
          },
          {
            label: "Total Schemes",
            value: totalSchemes,
            sublabel: `${activeSchemes} active approved schemes`,
            icon: "article",
            color: "orange",
            route: "/dashboard/admin/schemes",
          },
          {
            label: "Total Users",
            value: totalUsers,
            sublabel: "Registered platform users",
            icon: "groups",
            color: "green",
            route: "/dashboard/admin/users",
          },
          {
            label: "Pending Approvals",
            value: pendingAll,
            sublabel: `${pendingPolicies} policies, ${pendingSchemes} schemes awaiting review`,
            icon: "pending_actions",
            color: "purple",
            route: "/dashboard/admin/schemes/manage",
          },
        ];
        this.loadingStats = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("[ADMIN DASHBOARD] Error loading analytics:", err);
        this.statsError = "Unable to load dashboard statistics";
        this.loadingStats = false;
        this.cdr.detectChanges();
      },
    });
  }

  loadRecentSchemes(): void {
    this.loadingSchemes = true;
    this.schemesError = "";
    this.cdr.detectChanges();

    this.schemeService.getSchemes({ limit: 4, manage: true }).subscribe({
      next: (res) => {
        const rawSchemes: SchemeResponse[] = Array.isArray(res?.schemes)
          ? res.schemes
          : [];
        this.schemes = rawSchemes.map((s) => ({
          id: s.scheme_id,
          title: s.name || (s as any).title || "Untitled Scheme",
          ministry: s.ministry || s.department || "Government of India",
          icon: this.getSchemeIcon(s.category),
          iconClass: this.getSchemeIconClass(s.category),
          category: s.category ?? null,
          ...categoryIconFields(s.category),
        }));
        this.loadingSchemes = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("[ADMIN DASHBOARD] Error loading schemes:", err);
        this.schemesError = "Unable to load schemes";
        this.loadingSchemes = false;
        this.cdr.detectChanges();
      },
    });
  }

  loadRecentPolicies(): void {
    this.loadingPolicies = true;
    this.policiesError = "";
    this.cdr.detectChanges();

    this.policyService.getPolicies({ limit: 4, manage: true }).subscribe({
      next: (res) => {
        const rawPolicies: PolicyResponse[] = Array.isArray(res?.policies)
          ? res.policies
          : [];
        this.policies = rawPolicies.map((p) => ({
          id: p.policy_id,
          title: p.title || "Untitled Policy",
          ministry: p.ministry || p.department || "Government of India",
          category: p.category ?? null,
          ...categoryIconFields(p.category),
        }));
        this.loadingPolicies = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("[ADMIN DASHBOARD] Error loading policies:", err);
        this.policiesError = "Unable to load policies";
        this.loadingPolicies = false;
        this.cdr.detectChanges();
      },
    });
  }

  private getSchemeIcon(category?: string | null): string {
    return getCategoryIconName(category);
  }

  private getSchemeIconClass(category?: string | null): string {
    return getCategoryIconClass(category);
  }
}
