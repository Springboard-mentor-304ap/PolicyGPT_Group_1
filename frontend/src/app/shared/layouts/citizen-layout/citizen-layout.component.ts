import {
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  inject,
  signal,
} from "@angular/core";

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

import { FooterComponent } from "../../components/footer/footer.component";
import { LogoutConfirmComponent } from "../../components/logout-confirm/logout-confirm.component";
import { NotificationBellComponent } from "../../components/notification-bell/notification-bell.component";

/* =========================================================
   CITIZEN NAVIGATION ITEM (optional expandable children)
   ========================================================= */

export interface CitizenNavChild {
  label: string;
  icon: string;
  route: string;
}

export interface CitizenNavItem {
  label: string;
  icon: string;
  route: string;
  children?: CitizenNavChild[];
}

@Component({
  selector: "app-citizen-layout",

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
  ],

  templateUrl: "./citizen-layout.component.html",
  styleUrl: "./citizen-layout.component.scss",
})
export class CitizenLayoutComponent implements OnInit {
  // =========================================================
  // USER
  // =========================================================

  user: AuthUser | null = null;

  userName = signal("User Name");
  userRole = signal("Citizen");

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
  // IMPORTANT:
  // All citizen pages MUST remain under
  // /dashboard/citizen
  // so that CitizenLayoutComponent stays active.
  // =========================================================

  navItems: CitizenNavItem[] = [
    {
      label: "Dashboard",
      icon: "dashboard",
      route: "/dashboard/citizen",
    },

    {
      label: "Search Policies",
      icon: "policy",
      route: "/dashboard/citizen/policies/search",
    },

    {
      label: "Search Schemes",
      icon: "account_balance",
      route: "/dashboard/citizen/schemes",
    },

    {
      label: "Eligibility Checker",
      icon: "fact_check",
      route: "/dashboard/citizen/eligibility",
    },

    {
      label: "Compare",
      icon: "compare_arrows",
      route: "/dashboard/citizen/compare",
    },

    {
      label: "Analytics",
      icon: "analytics",
      route: "/dashboard/citizen/analytics",
    },

    {
      label: "Saved Items",
      icon: "bookmark",
      route: "/dashboard/citizen/saved",
    },

    {
      label: "Notifications",
      icon: "notifications_none",
      route: "/dashboard/citizen/notifications",
    },

    {
      label: "Search History",
      icon: "history",
      route: "/dashboard/citizen/history",
    },

    {
      label: "Help & Support",
      icon: "support_agent",
      route: "/dashboard/citizen/support",
    },

    {
      label: "Feedback",
      icon: "rate_review",
      route: "/dashboard/citizen/feedback",
    },
  ];

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private readonly router: Router,
    private readonly authService: Auth,
    private readonly avatarService: AvatarService,
  ) {}

  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    // Shared current-user state FIRST: the BehaviorSubject replays the
    // stored/login user synchronously, so name/role/photo-version are
    // available before the background /me refresh below resolves. This
    // is what lets the topbar show the saved photo immediately after
    // login instead of waiting for Profile to trigger the first fetch.
    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (!user) {
          this.user = null;
          this.userName.set("User Name");
          this.userRole.set("Citizen");
          this.avatarSrc.set(null);
          this.avatarLoading.set(false);
          this.loadingUser = false;
          return;
        }
        this.setUserDetails(user);
        this.refreshAvatar(user);
      });

    this.loadCurrentUser();

    if (this.isAnalyticsRouteActive()) {
      this.analyticsMenuOpen = true;
    }

    // Keep expansion in sync with navigation (direct URL entry, in-app
    // navigation, back/forward): a matching route re-expands its group.
    // Arrow clicks always work because submenu visibility depends only
    // on the flag — a collapsed group stays collapsed until explicitly
    // reopened or a relevant route change occurs.
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.isAnalyticsRouteActive()) {
          this.analyticsMenuOpen = true;
        }
      });
  }

  onAnalyticsNavClick(event?: MouseEvent): void {
    const target = event?.target as HTMLElement | undefined;
    if (target?.closest(".dash-nav__chevron")) {
      event?.preventDefault();
      event?.stopPropagation();
    }
    this.toggleAnalyticsMenu();
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
    return this.router.url.startsWith("/dashboard/citizen/analytics");
  }

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

  private loadCurrentUser(): void {
    this.loadingUser = true;

    // -------------------------------------------------------
    // INSTANT PAINT FROM SHARED STATE (login/app-init user)
    // -------------------------------------------------------
    // The currentUser$ subscription above already painted name/role
    // and kicked off the avatar blob fetch. Only fall back to storage
    // here when the shared state has not emitted yet (defensive).

    const snapshot =
      this.authService.getCurrentUserSnapshot?.() ??
      this.authService.getStoredUser();

    if (snapshot) {
      this.setUserDetails(snapshot);
      // Avatar itself resolves via the currentUser$ subscription, so
      // the topbar never shows the default as final while loading.
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
    // BACKGROUND REFRESH (deduplicated + TTL by AuthService)
    // -------------------------------------------------------
    // Reconciles the stored snapshot with the backend (photo version
    // included). The shared subject emission — not this callback —
    // drives the avatar update, so Topbar/Profile/Settings stay in
    // sync with ONE fetch even when layout + page mount together.

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          this.loadingUser = false;
          return;
        }

        // currentUser$ already applied this via setUser emission, but
        // apply directly too for the TTL fast path (of(cachedMe)),
        // which emits no new subject value yet carries the fresh
        // photo version needed for the immediate avatar fetch.
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

    this.userName.set(user.full_name?.trim() || "User Name");

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
      return "Citizen";
    }

    return role
      .trim()
      .replace(/_/g, " ")
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

    // IMPORTANT:
    // Keep search inside the citizen layout.
    this.router.navigate(["/dashboard/citizen/schemes"], {
      queryParams: {
        q: query,
      },
    });
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
    this.showLogoutModal = false;

    this.authService.logout();

    this.user = null;

    this.userName.set("User Name");
    this.userRole.set("Citizen");
    this.avatarSrc.set(null);
    this.avatarLoading.set(false);

    this.mobileMenuOpen = false;
    this.sidebarCollapsed = false;

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
