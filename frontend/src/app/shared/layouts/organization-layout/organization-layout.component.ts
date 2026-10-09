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
import { FooterComponent } from "../../components/footer/footer.component";
import { LogoutConfirmComponent } from "../../components/logout-confirm/logout-confirm.component";
import { NotificationBellComponent } from "../../components/notification-bell/notification-bell.component";
import { ToastContainerComponent } from "../../components/toast-container/toast-container.component";

/* =========================================================
   ORGANIZATION NAVIGATION ITEM
   ========================================================= */

export interface OrganizationNavChild {
  icon: string;
  label: string;
  route: string;
}

export interface OrganizationNavItem {
  icon: string;
  label: string;
  route: string;
  children?: OrganizationNavChild[];
}

/* =========================================================
   ORGANIZATION LAYOUT
   ========================================================= */

@Component({
  selector: "app-organization-layout",

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

  templateUrl: "./organization-layout.component.html",
  styleUrl: "./organization-layout.component.scss",
})
export class OrganizationLayoutComponent implements OnInit {
  // =========================================================
  // USER
  // =========================================================

  user: AuthUser | null = null;

  userName = signal("Organization");
  userRole = signal("ORGANIZATION");

  /** Object URL of the authenticated user's photo; null = default icon. */
  avatarSrc = signal<string | null>(null);

  /**
   * True while the avatar image is being resolved (stored user known,
   * photo blob still loading). The template shows a subtle placeholder
   * — never the default avatar as if it were the user's actual photo.
   */
  avatarLoading = signal(false);

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
  // LOGOUT MODAL
  // =========================================================

  showLogoutModal = false;

  // =========================================================
  // ORGANIZATION NAVIGATION
  //
  // IMPORTANT:
  // All routes stay under /dashboard/organization
  // so OrganizationLayoutComponent remains active.
  // =========================================================

  navItems: OrganizationNavItem[] = [
    {
      icon: "manage_search",
      label: "Policy Search",
      route: "/dashboard/organization/policies/search",
    },

    {
      icon: "account_balance",
      label: "Scheme Search",
      route: "/dashboard/organization/schemes",
    },

    {
      icon: "compare_arrows",
      label: "Policy Comparison",
      route: "/dashboard/organization/compare",
    },

    {
      icon: "analytics",
      label: "Analytics",
      route: "/dashboard/organization/analytics",
    },

    {
      icon: "bookmark_border",
      label: "Saved Policies",
      route: "/dashboard/organization/saved",
    },

    {
      icon: "history",
      label: "Research History",
      route: "/dashboard/organization/history",
    },

    {
      icon: "notifications_none",
      label: "Notifications",
      route: "/dashboard/organization/notifications",
    },

    {
      icon: "support_agent",
      label: "Support",
      route: "/dashboard/organization/faqs",
    },
  ];

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private readonly authService: Auth,
    private readonly router: Router,
    private readonly avatarService: AvatarService,
  ) {}

  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    // Shared current-user state FIRST: the BehaviorSubject replays the
    // stored/login user synchronously, so name/role/photo-version are
    // available before the background /me refresh below resolves.
    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (!user) {
          this.userName.set("Organization");
          this.userRole.set("ORGANIZATION");
          this.avatarSrc.set(null);
          this.avatarLoading.set(false);
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
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
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
    return this.router.url.startsWith("/dashboard/organization/analytics");
  }

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

  private loadCurrentUser(): void {
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
    }

    // -------------------------------------------------------
    // CHECK TOKEN
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
    // GET CURRENT USER FROM BACKEND
    // -------------------------------------------------------

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          return;
        }

        this.setUserDetails(user);
        this.refreshAvatar(user);
      },

      error: (error: unknown) => {
        console.error("Unable to load organization user:", error);

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
  // SET USER DETAILS
  // =========================================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    this.userName.set(user.full_name?.trim() || "Organization");

    this.userRole.set(user.role?.trim().toUpperCase() || "ORGANIZATION");
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
  // DISPLAY ROLE
  // =========================================================

  get displayRole(): string {
    switch ((this.userRole() || "").toUpperCase().replace(/[\s-]+/g, "_")) {
      case "ORGANIZATION":
      case "ORGANISATION":
        return "Organization";

      default:
        return "Organization";
    }
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
  // OPEN MOBILE MENU
  // =========================================================

  openMobileMenu(): void {
    this.mobileMenuOpen = true;
  }

  // =========================================================
  // CLOSE MOBILE MENU
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

    // Keep search inside Organization Layout

    this.router.navigate(["/dashboard/organization/schemes"], {
      queryParams: {
        q: query,
      },
    });

    this.closeMobileMenu();
  }

  // =========================================================
  // CLEAR SEARCH
  // =========================================================

  clearSearch(): void {
    this.searchText = "";
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  logout(): void {
    this.showLogoutModal = true;
  }

  // =========================================================
  // CONFIRM LOGOUT
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

    this.userName.set("Organization");
    this.userRole.set("ORGANIZATION");

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
  // CANCEL LOGOUT
  // =========================================================

  cancelLogout(): void {
    this.showLogoutModal = false;
  }
}
