import { Component, DestroyRef, HostListener, OnInit, inject, signal } from "@angular/core";

import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { filter } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { Auth, AuthUser } from "../../../core/services/auth";
import { AvatarService } from "../../../core/services/avatar.service";
import { SearchHistoryService } from "../../../core/services/search-history.service";
import { FooterComponent } from "../../components/footer/footer.component";
import { LogoutConfirmComponent } from "../../components/logout-confirm/logout-confirm.component";
import { NotificationBellComponent } from "../../components/notification-bell/notification-bell.component";
import { ToastContainerComponent } from "../../components/toast-container/toast-container.component";

/* =========================================================
   RESEARCHER NAVIGATION ITEM
   ========================================================= */

export interface ResearcherNavChild {
  label: string;
  icon: string;
  route: string;
}

export interface ResearcherNavItem {
  label: string;
  icon: string;
  route: string;
  children?: ResearcherNavChild[];
}

/* =========================================================
   RESEARCHER LAYOUT
   ========================================================= */

@Component({
  selector: "app-researcher-layout",

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FooterComponent,
    LogoutConfirmComponent,
    NotificationBellComponent,
    ToastContainerComponent,
  ],

  templateUrl: "./researcher-layout.component.html",
  styleUrl: "./researcher-layout.component.scss",
})
export class ResearcherLayoutComponent implements OnInit {
  // =========================================================
  // USER
  // =========================================================

  user: AuthUser | null = null;

  userName = signal("Researcher");
  userRole = signal("Researcher");

  /** Object URL of the authenticated user's photo; null = default icon. */
  avatarSrc = signal<string | null>(null);

  /**
   * True while the avatar image is being resolved (stored user known,
   * photo blob still loading). The template shows a subtle placeholder
   * — never the default avatar as if it were the user's actual photo.
   */
  avatarLoading = signal(false);

  loadingUser = true;

  // =========================================================
  // SIDEBAR
  // =========================================================

  sidebarCollapsed = false;
  mobileMenuOpen = false;
  analyticsMenuOpen = false;

  // =========================================================
  // SEARCH
  // =========================================================

  searchText = "";

  // =========================================================
  // LOGOUT
  // =========================================================

  showLogoutModal = false;

  // =========================================================
  // NAVIGATION
  //
  // IMPORTANT:
  // Keep researcher pages under /dashboard/researcher
  // so this layout stays mounted.
  // =========================================================

  navItems: ResearcherNavItem[] = [
    {
      label: "Dashboard",
      icon: "dashboard",
      route: "/dashboard/researcher",
    },

    {
      label: "Search Policies",
      icon: "policy",
      route: "/dashboard/researcher/policies/search",
    },

    {
      label: "Search Schemes",
      icon: "account_balance",
      route: "/dashboard/researcher/schemes",
    },

    {
      label: "Compare",
      icon: "compare_arrows",
      route: "/dashboard/researcher/compare",
    },

    {
      label: "Research Analytics",
      icon: "analytics",
      route: "/dashboard/researcher/analytics",
      children: [
        {
          label: "Research Overview",
          icon: "insights",
          route: "/dashboard/researcher/analytics",
        },
        {
          label: "Policy & Scheme Trends",
          icon: "trending_up",
          route: "/dashboard/researcher/analytics/trends",
        },
      ],
    },

    {
      label: "Saved Items",
      icon: "bookmark",
      route: "/dashboard/researcher/saved",
    },

    {
      label: "Search History",
      icon: "history",
      route: "/dashboard/researcher/history",
    },

    {
      label: "Notifications",
      icon: "notifications_none",
      route: "/dashboard/researcher/notifications",
    },

    {
      label: "Help & Support",
      icon: "support_agent",
      route: "/dashboard/researcher/support",
    },

    {
      label: "Feedback",
      icon: "feedback",
      route: "/dashboard/researcher/feedback",
    },
  ];

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private readonly router: Router,
    private readonly authService: Auth,
    private readonly avatarService: AvatarService,
    private readonly searchHistory: SearchHistoryService,
  ) {}

  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    // Shared current-user state: refreshes name, role and avatar
    // immediately after login, profile edits and photo changes,
    // with no refresh, re-login or navigation required.
    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (!user) {
          this.userName.set("Researcher");
          this.userRole.set("Researcher");
          this.avatarSrc.set(null);
          this.avatarLoading.set(false);
          return;
        }
        this.setUserDetails(user);
        this.refreshAvatar(user);
      });

    this.loadCurrentUser();

    this.syncAnalyticsMenuWithRoute();

    // Keep expansion in sync with navigation (sidebar links, in-app
    // navigation, back/forward, direct URL entry): entering the
    // analytics section re-expands, leaving it always collapses, so the
    // visible submenu reflects the current route instead of stale state.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.syncAnalyticsMenuWithRoute();
      });
  }

  onAnalyticsNavClick(event?: MouseEvent): void {
    void event;
    if (this.isResearchAnalyticsRoute()) {
      // Already inside Research Analytics: plain expand/collapse toggle.
      this.toggleAnalyticsMenu();
      return;
    }
    // Outside Research Analytics: always land on Research Overview.
    // Expansion + first-child active state follow from the route change.
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }
    this.closeMobileMenu();
    void this.router.navigate(["/dashboard/researcher/analytics"]);
  }

  toggleAnalyticsMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleAnalyticsMenu();
  }

  toggleAnalyticsMenu(): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }
    this.analyticsMenuOpen = !this.analyticsMenuOpen;
  }

  isAnalyticsRouteActive(): boolean {
    return this.isResearchAnalyticsRoute();
  }

  /**
   * Route-aware check: true only inside the Research Analytics section
   * (/dashboard/researcher/analytics and children such as
   * /analytics/trends). Query params and fragments are ignored so the
   * state also follows programmatic navigation.
   */
  isResearchAnalyticsRoute(): boolean {
    const clean = (this.router.url || "").split("?")[0].split("#")[0];
    return (
      clean === "/dashboard/researcher/analytics" ||
      clean.startsWith("/dashboard/researcher/analytics/")
    );
  }

  /**
   * Single source of truth for submenu visibility: expanded only while
   * the current route is inside Research Analytics AND the section is
   * not manually collapsed. Outside the section this is always false,
   * so no stale expanded state can survive navigation (sidebar links,
   * browser Back/Forward, refresh, direct URL, programmatic).
   */
  get isAnalyticsExpanded(): boolean {
    return this.isResearchAnalyticsRoute() && this.analyticsMenuOpen;
  }

  private syncAnalyticsMenuWithRoute(): void {
    this.analyticsMenuOpen = this.isResearchAnalyticsRoute();
  }

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

  private loadCurrentUser(): void {
    this.loadingUser = true;

    // -------------------------------------------------------
    // STORED USER
    // -------------------------------------------------------

    const snapshot =
      this.authService.getCurrentUserSnapshot?.() ??
      this.authService.getStoredUser();

    if (snapshot) {
      this.setUserDetails(snapshot);
      if (!this.avatarSrc() && snapshot.profile_photo_updated_at) {
        this.avatarLoading.set(true);
      } else if (!snapshot.profile_photo_updated_at) {
        this.avatarLoading.set(false);
      }
      this.loadingUser = false;
    }

    // -------------------------------------------------------
    // TOKEN
    // -------------------------------------------------------

    const token = this.authService.getToken();

    if (!token) {
      this.authService.logout();

      this.router.navigate(["/auth/login"], {
        replaceUrl: true,
      });

      return;
    }

    // -------------------------------------------------------
    // BACKEND USER
    // -------------------------------------------------------

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          this.loadingUser = false;
          return;
        }

        this.setUserDetails(user);
        this.refreshAvatar(user);

        this.loadingUser = false;
      },

      error: (error: unknown) => {
        console.error("Unable to load current user:", error);

        this.loadingUser = false;

        const status = (
          error as {
            status?: number;
          }
        )?.status;

        if (status === 401 || status === 403) {
          this.authService.logout();

          this.router.navigate(["/auth/login"], {
            replaceUrl: true,
          });
        }
      },
    });
  }

  // =========================================================
  // SET USER
  // =========================================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    this.userName.set(user.full_name?.trim() || "Researcher");

    this.userRole.set(this.formatRole(user.role));
  }

  /**
   * Resolve the avatar image for the given user through the shared
   * AvatarService (per-version cached blob URL, default icon when the
   * user has no photo). While a photo blob is loading, `avatarLoading`
   * stays true so the template shows a placeholder instead of
   * presenting the default avatar as the user's actual photo.
   */
  private refreshAvatar(user: AuthUser): void {
    if (!user?.profile_photo_updated_at) {
      this.avatarSrc.set(null);
      this.avatarLoading.set(false);
      return;
    }
    // Photo exists on the backend: show placeholder until bytes arrive.
    if (!this.avatarSrc()) {
      this.avatarLoading.set(true);
    }
    this.avatarService.photoSrcFor(user).subscribe({
      next: (src) => {
        this.avatarSrc.set(src);
        this.avatarLoading.set(false);
      },
      error: () => {
        this.avatarSrc.set(null);
        this.avatarLoading.set(false);
      },
    });
  }

  // =========================================================
  // FORMAT ROLE
  // =========================================================

  private formatRole(role: string | null | undefined): string {
    if (!role) {
      return "Researcher";
    }

    return role
      .trim()
      .replace(/\_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (character: string) => character.toUpperCase());
  }

  // =========================================================
  // SIDEBAR TOGGLE
  // =========================================================

  toggleSidebar(): void {
    if (window.innerWidth <= 767) {
      this.mobileMenuOpen = !this.mobileMenuOpen;

      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  // =========================================================
  // MOBILE MENU
  // =========================================================

  openMobileMenu(): void {
    this.mobileMenuOpen = true;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  // =========================================================
  // WINDOW RESIZE
  // =========================================================

  @HostListener("window:resize")
  onWindowResize(): void {
    if (window.innerWidth > 767) {
      this.mobileMenuOpen = false;
    }
  }

  // =========================================================
  // SEARCH
  // =========================================================

  performSearch(): void {
    const query = this.searchText.trim();

    if (!query) {
      return;
    }

    // Keep search inside Researcher Layout and record it once so the
    // topbar search appears in Search History like policy/scheme
    // searches do (fire-and-forget; navigation never blocks on it).
    this.searchHistory
      .recordSearch({ search_query: query, search_type: "POLICY", filters: {} })
      .subscribe({ next: () => undefined, error: () => undefined });

    this.router.navigate(["/dashboard/researcher/policies/search"], {
      queryParams: {
        q: query,
      },
    });

    this.closeMobileMenu();
  }

  // =========================================================
  // LOGOUT - OPEN MODAL
  // =========================================================

  logout(): void {
    this.showLogoutModal = true;
  }

  // =========================================================
  // LOGOUT - YES
  // =========================================================

  confirmLogout(): void {
    // -------------------------------------------------------
    // CLOSE MODAL
    // -------------------------------------------------------

    this.showLogoutModal = false;

    // -------------------------------------------------------
    // REMOVE AUTHENTICATION
    // -------------------------------------------------------

    this.authService.logout();

    // -------------------------------------------------------
    // RESET USER
    // -------------------------------------------------------

    this.user = null;

    this.userName.set("Researcher");
    this.userRole.set("Researcher");
    this.avatarSrc.set(null);
    this.avatarLoading.set(false);

    // -------------------------------------------------------
    // RESET LAYOUT
    // -------------------------------------------------------

    this.mobileMenuOpen = false;
    this.sidebarCollapsed = false;

    // -------------------------------------------------------
    // REDIRECT TO LOGIN
    // -------------------------------------------------------

    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  // =========================================================
  // LOGOUT - NO
  // =========================================================

  cancelLogout(): void {
    this.showLogoutModal = false;
  }
}
