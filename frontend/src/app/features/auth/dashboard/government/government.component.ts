import { Component, DestroyRef, OnInit, ChangeDetectorRef, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";

import { Auth, AuthUser } from "../../../../core/services/auth";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { NotificationService } from "../../../../core/services/notification.service";
import { SearchHistoryService, SearchHistoryItem } from "../../../../core/services/search-history.service";
import { PolicyResponse } from "../../../../core/models/policy.model";
import { SchemeResponse } from "../../../../core/models/scheme.model";

// =========================================================
// STAT CARD
// =========================================================

export interface StatCard {
  icon: string;
  color: "blue" | "orange" | "green" | "purple";
  value: number | null;
  label: string;
  sub?: string;
  route?: string;
}

// =========================================================
// SCHEME ITEM
// =========================================================

export interface SchemeItem {
  id?: number;
  name: string;
  ministry: string;
  status?: string;
}

// =========================================================
// POLICY ITEM
// =========================================================

export interface PolicyItem {
  id?: number;
  name: string;
  ministry: string;
  savedOn: string;
  status?: string;
}

// =========================================================
// SEARCH HISTORY
// =========================================================

export interface HistoryItem {
  name: string;
  filters: string;
}

// =========================================================
// APPLICATION
// =========================================================

export interface ApplicationItem {
  name: string;
  appId: string;
}

import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

// =========================================================
// GOVERNMENT COMPONENT
// =========================================================

@Component({
  selector: "app-government",
  standalone: true,
  imports: [CommonModule, RouterLink, CountUpDirective],
  templateUrl: "./government.component.html",
  styleUrl: "./government.component.scss",
})
export class GovernmentComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly authService = inject(Auth);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);
  private readonly notificationService = inject(NotificationService);
  private readonly searchHistoryService = inject(SearchHistoryService);
  private readonly destroyRef = inject(DestroyRef);

  // =======================================================
  // USER
  // =======================================================

  userName = "Government Official";
  userRole = "GOVERNMENT OFFICIAL";
  currentUser: AuthUser | null = null;

  // =======================================================
  // LOADING & ERROR STATES
  // =======================================================

  loadingStats = true;
  loadingUpcoming = true;
  loadingUploaded = true;
  loadingHistory = true;
  loadingApplications = false;

  statsError = "";
  upcomingError = "";
  uploadedError = "";

  // =======================================================
  // STATISTICS
  // =======================================================

  statCards: StatCard[] = [
    {
      icon: "description",
      color: "blue",
      value: null,
      label: "My Policies",
      sub: "Loading...",
      route: "/dashboard/government/policies/search",
    },
    {
      icon: "account_balance",
      color: "orange",
      value: null,
      label: "My Schemes",
      sub: "Loading...",
      route: "/dashboard/government/schemes",
    },
    {
      icon: "pending_actions",
      color: "green",
      value: null,
      label: "Pending Approval",
      sub: "Loading...",
      route: "/dashboard/government/schemes/manage",
    },
    {
      icon: "notifications",
      color: "purple",
      value: null,
      label: "Notifications",
      sub: "Loading...",
      route: "/notifications",
    },
  ];

  // =======================================================
  // DASHBOARD DATA
  // =======================================================

  upcomingSchemes: SchemeItem[] = [];
  uploadedPolicies: PolicyItem[] = [];
  searchHistory: HistoryItem[] = [];
  applications: ApplicationItem[] = [];

  ngOnInit(): void {
    this.loadUserAndData();
  }

  // =======================================================
  // LOAD USER AND DATA
  // =======================================================

  private loadUserAndData(): void {
    const storedUser = this.authService.getStoredUser();
    if (storedUser) {
      this.currentUser = storedUser;
      this.userName = storedUser.full_name || "Government Official";
      this.userRole = storedUser.role || "GOVERNMENT OFFICIAL";
    }

    const token = this.authService.getToken();
    if (!token) {
      this.router.navigate(["/auth/login"], { replaceUrl: true });
      return;
    }

    this.authService.getCurrentUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (user) => {
        if (user) {
          this.currentUser = user;
          this.userName = user.full_name || "Government Official";
          this.userRole = user.role || "GOVERNMENT OFFICIAL";
          this.cdr.detectChanges();
        }
        this.fetchDashboardData();
      },
      error: (error) => {
        console.error("Unable to load current user:", error);
        if (error?.status === 401 || error?.status === 403) {
          this.authService.logout();
          this.router.navigate(["/auth/login"], { replaceUrl: true });
          return;
        }
        // If user call fails but stored user exists, proceed
        this.fetchDashboardData();
      },
    });
  }

  private fetchDashboardData(): void {
    const userId = this.currentUser?.user_id;

    // Load statistics from user's managed policies, managed schemes, and notifications
    forkJoin({
      policies: this.policyService
        .getPolicies({ manage: true, limit: 100 })
        .pipe(catchError(() => of({ policies: [], total: 0, page: 1, pages: 1, limit: 100 }))),
      schemes: this.schemeService
        .getSchemes({ manage: true, limit: 100 })
        .pipe(catchError(() => of({ schemes: [], total: 0, page: 1, pages: 1, limit: 100 }))),
      notificationStats: userId
        ? this.notificationService
            .getNotificationStats(userId)
            .pipe(catchError(() => of({ total: 0, read: 0, unread: 0 })))
        : of({ total: 0, read: 0, unread: 0 }),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ policies, schemes, notificationStats }) => {
        const policyList: PolicyResponse[] = Array.isArray(policies?.policies) ? policies.policies : [];
        const schemeList: SchemeResponse[] = Array.isArray(schemes?.schemes) ? schemes.schemes : [];

        const totalPolicies = typeof policies?.total === "number" ? policies.total : policyList.length;
        const totalSchemes = typeof schemes?.total === "number" ? schemes.total : schemeList.length;

        const pendingPolicies = policyList.filter((p) => p.status === "PENDING_APPROVAL").length;
        const pendingSchemes = schemeList.filter((s) => s.status === "PENDING_APPROVAL").length;
        const totalPending = pendingPolicies + pendingSchemes;

        const draftPolicies = policyList.filter((p) => p.status === "DRAFT").length;
        const draftSchemes = schemeList.filter((s) => s.status === "DRAFT").length;

        this.statCards = [
          {
            icon: "description",
            color: "blue",
            value: totalPolicies,
            label: "My Policies",
            sub: `${draftPolicies} draft, ${pendingPolicies} pending`,
          },
          {
            icon: "account_balance",
            color: "orange",
            value: totalSchemes,
            label: "My Schemes",
            sub: `${draftSchemes} draft, ${pendingSchemes} pending`,
          },
          {
            icon: "pending_actions",
            color: "green",
            value: totalPending,
            label: "Pending Approval",
            sub: `${pendingPolicies} policies, ${pendingSchemes} schemes`,
          },
          {
            icon: "notifications",
            color: "purple",
            value: notificationStats.unread,
            label: "Unread Notifications",
            sub: `${notificationStats.total} total notifications`,
          },
        ];
        this.loadingStats = false;

        // Populate Schemes List (up to 4)
        this.upcomingSchemes = schemeList.slice(0, 4).map((s) => ({
          id: s.scheme_id,
          name: s.name || (s as any).title || "Untitled Scheme",
          ministry: s.ministry || s.department || "Government of India",
          status: s.status,
        }));
        this.loadingUpcoming = false;

        // Populate Policies List (up to 4)
        this.uploadedPolicies = policyList.slice(0, 4).map((p) => ({
          id: p.policy_id,
          name: p.title || "Untitled Policy",
          ministry: p.ministry || p.department || "Government of India",
          savedOn: p.created_at ? new Date(p.created_at).toLocaleDateString() : "Recent",
          status: p.status,
        }));
        this.loadingUploaded = false;

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("[GOVERNMENT DASHBOARD] Error loading dashboard data:", err);
        this.loadingStats = false;
        this.loadingUpcoming = false;
        this.loadingUploaded = false;
        this.statsError = "Unable to load dashboard data";
        this.cdr.detectChanges();
      },
    });

    // Load Search History
    if (userId) {
      this.searchHistoryService
        .getUserSearchHistory(userId)
        .pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (history: SearchHistoryItem[]) => {
            this.searchHistory = Array.isArray(history)
              ? history.slice(0, 4).map((h) => ({
                  name: h.search_query,
                  filters: h.search_type || "General",
                }))
              : [];
            this.loadingHistory = false;
            this.cdr.detectChanges();
          },
          error: () => {
            this.searchHistory = [];
            this.loadingHistory = false;
            this.cdr.detectChanges();
          },
        });
    } else {
      this.searchHistory = [];
      this.loadingHistory = false;
      this.cdr.detectChanges();
    }

    // Application Status: backend does not have an applications submission API.
    // Display clean empty state as required by instructions.
    this.applications = [];
    this.loadingApplications = false;
  }
}
