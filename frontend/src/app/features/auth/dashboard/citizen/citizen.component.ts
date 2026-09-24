import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";
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

// =====================================================
// STAT CARD
// =====================================================

export interface StatCard {
  icon: string;
  color: "blue" | "orange" | "green" | "purple";
  value: number | null;
  label: string;
  sub?: string;
}

// =====================================================
// SCHEME ITEM
// =====================================================

export interface SchemeItem {
  id?: number;
  name: string;
  ministry: string;
}

// =====================================================
// POLICY ITEM
// =====================================================

export interface PolicyItem {
  id?: number;
  name: string;
  ministry: string;
  savedOn: string;
}

// =====================================================
// SEARCH HISTORY
// =====================================================

export interface HistoryItem {
  name: string;
  filters: string;
}

// =====================================================
// APPLICATION
// =====================================================

export interface ApplicationItem {
  name: string;
  appId: string;
}

// =====================================================
// CITIZEN COMPONENT
// =====================================================

@Component({
  selector: "app-citizen",
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: "./citizen.component.html",
  styleUrl: "./citizen.component.scss",
})
export class CitizenComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(Auth);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);
  private readonly notificationService = inject(NotificationService);
  private readonly searchHistoryService = inject(SearchHistoryService);
  private readonly cdr = inject(ChangeDetectorRef);

  // =====================================================
  // USER
  // =====================================================

  user: AuthUser | null = null;
  userName = "Citizen";
  userRole = "Citizen";
  userEmail = "";
  userPhone = "";
  userState = "";
  userDistrict = "";
  userOccupation = "";
  userOrganization = "";
  loadingUser = true;

  // =====================================================
  // LOADING STATES
  // =====================================================

  loadingStats = true;
  loadingSchemes = true;
  loadingPolicies = true;
  loadingHistory = true;
  loadingApplications = false;

  // =====================================================
  // STATISTICS
  // =====================================================

  statCards: StatCard[] = [
    {
      icon: "policy",
      color: "blue",
      value: null,
      label: "Available Policies",
      sub: "Loading...",
    },
    {
      icon: "account_balance",
      color: "orange",
      value: null,
      label: "Available Schemes",
      sub: "Loading...",
    },
    {
      icon: "bookmark",
      color: "green",
      value: null,
      label: "Saved Items",
      sub: "Loading...",
    },
    {
      icon: "notifications",
      color: "purple",
      value: null,
      label: "Notifications",
      sub: "Loading...",
    },
  ];

  // =====================================================
  // DATA LISTS
  // =====================================================

  eligibleSchemes: SchemeItem[] = [];
  savedPolicies: PolicyItem[] = [];
  searchHistory: HistoryItem[] = [];
  applications: ApplicationItem[] = [];

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  // =====================================================
  // LOAD CURRENT USER & DATA
  // =====================================================

  private loadCurrentUser(): void {
    this.loadingUser = true;

    const cachedUser = this.authService.getStoredUser();
    if (cachedUser) {
      this.setUserDetails(cachedUser);
      this.loadingUser = false;
    }

    const token = this.authService.getToken();
    if (!token) {
      this.authService.logout();
      this.router.navigate(["/auth/login"], { replaceUrl: true });
      return;
    }

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (user) {
          this.setUserDetails(user);
        }
        this.loadingUser = false;
        this.fetchCitizenData();
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.error("GET CURRENT USER ERROR:", error);
        this.loadingUser = false;
        if (error?.status === 401 || error?.status === 403) {
          this.authService.logout();
          this.router.navigate(["/auth/login"], { replaceUrl: true });
          return;
        }
        this.fetchCitizenData();
        this.cdr.detectChanges();
      },
    });
  }

  private fetchCitizenData(): void {
    const userId = this.user?.user_id;

    // Read saved items count from localStorage
    const savedPoliciesCount = this.getSavedPoliciesCount();
    const savedSchemesCount = this.getSavedSchemesCount();
    const totalSaved = savedPoliciesCount + savedSchemesCount;

    forkJoin({
      policies: this.policyService
        .getPolicies({ status: "APPROVED", limit: 4 })
        .pipe(catchError(() => of({ policies: [], total: 0, page: 1, pages: 1, limit: 4 }))),
      schemes: this.schemeService
        .getSchemes({ status: "APPROVED", limit: 4 })
        .pipe(catchError(() => of({ schemes: [], total: 0, page: 1, pages: 1, limit: 4 }))),
      notificationStats: userId
        ? this.notificationService
            .getNotificationStats(userId)
            .pipe(catchError(() => of({ total: 0, read: 0, unread: 0 })))
        : of({ total: 0, read: 0, unread: 0 }),
    }).subscribe({
      next: ({ policies, schemes, notificationStats }) => {
        const policyList: PolicyResponse[] = Array.isArray(policies?.policies) ? policies.policies : [];
        const schemeList: SchemeResponse[] = Array.isArray(schemes?.schemes) ? schemes.schemes : [];

        const totalPolicies = typeof policies?.total === "number" ? policies.total : policyList.length;
        const totalSchemes = typeof schemes?.total === "number" ? schemes.total : schemeList.length;

        this.statCards = [
          {
            icon: "policy",
            color: "blue",
            value: totalPolicies,
            label: "Available Policies",
            sub: "Active public policies",
          },
          {
            icon: "account_balance",
            color: "orange",
            value: totalSchemes,
            label: "Available Schemes",
            sub: "Active benefit programmes",
          },
          {
            icon: "bookmark",
            color: "green",
            value: totalSaved,
            label: "Saved Items",
            sub: `${savedPoliciesCount} policies, ${savedSchemesCount} schemes`,
          },
          {
            icon: "notifications",
            color: "purple",
            value: notificationStats.unread,
            label: "Notifications",
            sub: `${notificationStats.total} total updates`,
          },
        ];
        this.loadingStats = false;

        // Populate Schemes List
        this.eligibleSchemes = schemeList.map((s) => ({
          id: s.scheme_id,
          name: s.name || (s as any).title || "Untitled Scheme",
          ministry: s.ministry || s.department || "Government of India",
        }));
        this.loadingSchemes = false;

        // Populate Policies List
        this.savedPolicies = policyList.map((p) => ({
          id: p.policy_id,
          name: p.title || "Untitled Policy",
          ministry: p.ministry || p.department || "Government of India",
          savedOn: p.created_at ? new Date(p.created_at).toLocaleDateString() : "Recent",
        }));
        this.loadingPolicies = false;

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("[CITIZEN DASHBOARD] Error loading data:", err);
        this.loadingStats = false;
        this.loadingSchemes = false;
        this.loadingPolicies = false;
        this.cdr.detectChanges();
      },
    });

    // Load Search History
    if (userId) {
      this.searchHistoryService
        .getUserSearchHistory(userId)
        .pipe(catchError(() => of([])))
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
    this.applications = [];
    this.loadingApplications = false;
  }

  private getSavedPoliciesCount(): number {
    try {
      const stored = localStorage.getItem("policy_bookmarks") || localStorage.getItem("saved_policies");
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.length : 0;
      }
    } catch {
      // Fallback
    }
    return 0;
  }

  private getSavedSchemesCount(): number {
    try {
      const stored = localStorage.getItem("scheme_bookmarks") || localStorage.getItem("bookmarked_schemes");
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.length : 0;
      }
    } catch {
      // Fallback
    }
    return 0;
  }

  // =====================================================
  // SET USER DETAILS
  // =====================================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;
    this.userName = user.full_name?.trim() || "Citizen";
    this.userRole = this.formatRole(user.role);
    this.userEmail = user.email || "";
    this.userPhone = user.phone || "";
    this.userState = user.state || "";
    this.userDistrict = user.district || "";
    this.userOccupation = user.occupation || "";
    this.userOrganization = user.organization || "";
  }

  // =====================================================
  // FORMAT ROLE
  // =====================================================

  private formatRole(role: string | null | undefined): string {
    if (!role) {
      return "Citizen";
    }

    return role
      .trim()
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (character: string) => character.toUpperCase());
  }
}
