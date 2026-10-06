import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from "@angular/core";
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
import { SavedItemsService, SavedPolicyItem, SavedSchemeItem } from "../../../../core/services/saved-items.service";
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
// SAVED ITEMS PREVIEW
// =====================================================

export interface SavedItemPreview {
  kind: "policy" | "scheme";
  id?: number;
  name: string;
  ministry: string;
}

import { CountUpDirective } from "../../../../shared/directives/count-up.directive";

// =====================================================
// CITIZEN COMPONENT
// =====================================================

@Component({
  selector: "app-citizen",
  standalone: true,
  imports: [CommonModule, RouterLink, CountUpDirective],
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
  private readonly savedItemsService = inject(SavedItemsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

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
  loadingSavedItems = true;

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
  savedItemsPreview: SavedItemPreview[] = [];

  /** Dashboard preview cap (full list lives on the Saved Items page). */
  private static readonly SAVED_PREVIEW_LIMIT = 4;

  /**
   * Build the dashboard preview from real Saved Items API records.
   * Pure (no HTTP, no state): policies first, then schemes, capped.
   */
  static buildSavedItemsPreview(
    savedPolicies: SavedPolicyItem[] | null | undefined,
    savedSchemes: SavedSchemeItem[] | null | undefined,
    limit: number = CitizenComponent.SAVED_PREVIEW_LIMIT,
  ): SavedItemPreview[] {
    const policyPreviews: SavedItemPreview[] = (
      Array.isArray(savedPolicies) ? savedPolicies : []
    ).map((p) => ({
      kind: "policy" as const,
      id: p.policy_id,
      name: p.title || "Untitled Policy",
      ministry: p.ministry || p.department || "Government of India",
    }));
    const schemePreviews: SavedItemPreview[] = (
      Array.isArray(savedSchemes) ? savedSchemes : []
    ).map((s) => ({
      kind: "scheme" as const,
      id: s.scheme_id,
      name: s.name || "Untitled Scheme",
      ministry: s.ministry || s.department || "Government of India",
    }));
    return [...policyPreviews, ...schemePreviews].slice(0, Math.max(0, limit));
  }

  // =====================================================
  // SECTION VISIBILITY (empty sections are not rendered)
  // =====================================================
  // Each panel renders only while its API is still loading or
  // when it actually holds items. Loaded-but-empty (including
  // API-error fallbacks, which resolve to []) hides the card
  // completely — no empty icon, text, or blank container.

  get showSchemesPanel(): boolean {
    return this.loadingSchemes || this.eligibleSchemes.length > 0;
  }

  get showPoliciesPanel(): boolean {
    return this.loadingPolicies || this.savedPolicies.length > 0;
  }

  get showHistoryPanel(): boolean {
    return this.loadingHistory || this.searchHistory.length > 0;
  }

  get showSavedItemsPanel(): boolean {
    return this.loadingSavedItems || this.savedItemsPreview.length > 0;
  }

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

    this.authService.getCurrentUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

    // Saved-item counts come from the authenticated user's backend
    // records (single source of truth, same as the Saved Items page),
    // never from global localStorage bookmark caches which leak across
    // users and go stale. loadingStats stays true until all resolve so
    // a transient zero is never presented as final.
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
      savedPolicies: this.savedItemsService
        .getSavedPolicies()
        .pipe(catchError(() => of([]))),
      savedSchemes: this.savedItemsService
        .getSavedSchemes()
        .pipe(catchError(() => of([]))),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ policies, schemes, notificationStats, savedPolicies, savedSchemes }) => {
        const policyList: PolicyResponse[] = Array.isArray(policies?.policies) ? policies.policies : [];
        const schemeList: SchemeResponse[] = Array.isArray(schemes?.schemes) ? schemes.schemes : [];

        const totalPolicies = typeof policies?.total === "number" ? policies.total : policyList.length;
        const totalSchemes = typeof schemes?.total === "number" ? schemes.total : schemeList.length;

        const savedPoliciesCount = Array.isArray(savedPolicies) ? savedPolicies.length : 0;
        const savedSchemesCount = Array.isArray(savedSchemes) ? savedSchemes.length : 0;
        const totalSaved = savedPoliciesCount + savedSchemesCount;

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

        // Saved Items preview: real user records from the existing
        // Saved Items API (same responses as the counts above — no
        // extra request). Policies first, then schemes, capped.
        this.savedItemsPreview = CitizenComponent.buildSavedItemsPreview(
          savedPolicies,
          savedSchemes,
        );
        this.loadingSavedItems = false;

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("[CITIZEN DASHBOARD] Error loading data:", err);
        this.loadingStats = false;
        this.loadingSchemes = false;
        this.loadingPolicies = false;
        this.loadingSavedItems = false;
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

    // Saved Items preview resolves with the forkJoin above (same
    // Saved Items API responses — no separate request). Until then
    // the panel shows its loading state via showSavedItemsPanel.
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
