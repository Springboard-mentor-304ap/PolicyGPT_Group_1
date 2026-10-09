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

// =========================================================
// NAVIGATION ITEM
// =========================================================

export interface GovernmentNavItem {
  icon: string;
  label: string;
  route: string;
}

// =========================================================
// GOVERNMENT LAYOUT
// =========================================================

@Component({
  selector: "app-government-layout",
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

  templateUrl: "./government-layout.component.html",
  styleUrl: "./government-layout.component.scss",
})
export class GovernmentLayoutComponent implements OnInit {
  // =======================================================
  // USER
  // =======================================================

  userName = signal("Government Official");
  userRole = signal("Government Official");

  /** Object URL of the authenticated user's photo; null = default icon. */
  avatarSrc = signal<string | null>(null);

  /**
   * True while the avatar image is being resolved (stored user known,
   * photo blob still loading). The template shows a subtle placeholder
   * — never the default avatar as if it were the user's actual photo.
   */
  avatarLoading = signal(false);

  // =======================================================
  // SIDEBAR
  // =======================================================

  sidebarCollapsed = false;
  mobileMenuOpen = false;

  // =======================================================
  // SUBMENUS
  // =======================================================

  policiesMenuOpen = false;
  schemesMenuOpen = false;
  analyticsMenuOpen = false;

  // =======================================================
  // SEARCH
  // =======================================================

  searchText = "";

  // =======================================================
  // LOGOUT MODAL
  // =======================================================

  showLogoutModal = false;

  // =======================================================
  // NAVIGATION
  // =======================================================

  navItems: GovernmentNavItem[] = [
    {
      icon: "home",
      label: "Dashboard",
      route: "/dashboard/government",
    },

    {
      icon: "description",
      label: "Policies Management",
      route: "/government/policies",
    },

    {
      icon: "account_balance",
      label: "Scheme Management",
      route: "/government/schemes",
    },

    {
      icon: "assignment",
      label: "Applications",
      route: "/government/applications",
    },

    {
      icon: "notifications_none",
      label: "Notifications",
      route: "/notifications",
    },

    {
      icon: "insert_chart_outlined",
      label: "Reports",
      route: "/dashboard/government/reports",
    },

    {
      icon: "support_agent",
      label: "Support",
      route: "/dashboard/government/faqs",
    },
  ];

  // =======================================================
  // CONSTRUCTOR
  // =======================================================

  constructor(
    private authService: Auth,
    private router: Router,
    private avatarService: AvatarService,
  ) {}

  private readonly destroyRef = inject(DestroyRef);

  // =======================================================
  // INITIALIZATION
  // =======================================================

  ngOnInit(): void {
    // Shared current-user state: refreshes name, role and avatar
    // immediately after login, profile edits and photo changes,
    // with no refresh, re-login or navigation required.
    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (!user) {
          this.userName.set("Government Official");
          this.userRole.set("Government Official");
          this.avatarSrc.set(null);
          this.avatarLoading.set(false);
          return;
        }
        this.setUserDetails(user);
        this.refreshAvatar(user);
      });

    this.loadCurrentUser();

    this.syncMenusWithRoute();

    // Keep expansion in sync with navigation (direct URL entry, in-app
    // navigation, back/forward): the group matching the new URL opens,
    // others close. Arrow clicks always work because submenu visibility
    // depends only on these flags.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.syncMenusWithRoute());
  }

  /**
   * Expand the submenu group matching the current URL and close the
   * rest (accordion). URLs matching no group leave all flags untouched.
   */
  private syncMenusWithRoute(): void {
    if (this.isPoliciesRouteActive()) {
      this.policiesMenuOpen = true;
      this.schemesMenuOpen = false;
      this.analyticsMenuOpen = false;
    } else if (this.isSchemesRouteActive()) {
      this.policiesMenuOpen = false;
      this.schemesMenuOpen = true;
      this.analyticsMenuOpen = false;
    } else if (this.isAnalyticsRouteActive()) {
      this.policiesMenuOpen = false;
      this.schemesMenuOpen = false;
      this.analyticsMenuOpen = true;
    }
  }

  // =======================================================
  // LOAD CURRENT USER
  // =======================================================

  private loadCurrentUser(): void {
    const snapshot =
      this.authService.getCurrentUserSnapshot?.() ??
      this.authService.getStoredUser();

    // -----------------------------------------------------
    // USE SNAPSHOT FIRST
    // -----------------------------------------------------

    if (snapshot) {
      this.setUserDetails(snapshot);
      if (!this.avatarSrc() && snapshot.profile_photo_updated_at) {
        this.avatarLoading.set(true);
      } else if (!snapshot.profile_photo_updated_at) {
        this.avatarLoading.set(false);
      }
    }

    // -----------------------------------------------------
    // CHECK TOKEN
    // -----------------------------------------------------

    const token = this.authService.getToken();

    if (!token) {
      this.router.navigate(["/auth/login"], {
        replaceUrl: true,
      });

      return;
    }

    // -----------------------------------------------------
    // GET CURRENT USER FROM BACKEND
    // -----------------------------------------------------

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          return;
        }

        this.setUserDetails(user);
        this.refreshAvatar(user);
      },

      error: (error: unknown) => {
        console.error("Unable to load current user:", error);

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

  // =======================================================
  // SET USER DETAILS
  // =======================================================

  private setUserDetails(user: AuthUser): void {
    if (!user) {
      return;
    }

    this.userName.set(user.full_name || "Government Official");

    this.userRole.set(this.formatRole(user.role || "GOVERNMENT_OFFICIAL"));
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

  // =======================================================
  // FORMAT ROLE
  // =======================================================

  private formatRole(role: string): string {
    return role
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char: string) => char.toUpperCase());
  }

  // =======================================================
  // SIDEBAR TOGGLE
  // =======================================================

  toggleSidebar(): void {
    if (window.innerWidth <= 767) {
      this.mobileMenuOpen = !this.mobileMenuOpen;

      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  // =======================================================
  // MOBILE MENU
  // =======================================================

  openMobileMenu(): void {
    this.mobileMenuOpen = true;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  // =======================================================
  // SUBMENU CONTROLS
  // =======================================================

  onPoliciesNavClick(event?: MouseEvent): void {
    const target = event?.target as HTMLElement | undefined;
    if (target?.closest('.dash-nav__chevron')) {
      event?.preventDefault();
      event?.stopPropagation();
      this.togglePoliciesMenu();
      return;
    }

    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }
    this.policiesMenuOpen = true;
    this.schemesMenuOpen = false;
    this.analyticsMenuOpen = false;
    this.closeMobileMenu();
    this.router.navigate(['/dashboard/government/policies/search']);
  }

  togglePoliciesMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.togglePoliciesMenu();
  }

  togglePoliciesMenu(): void {
    this.toggleGroup('policies');
  }

  /**
   * Single accordion toggle for every expandable parent: flips the
   * named group and closes the rest. Arrow clicks always take effect —
   * collapsing works even while a child route is active, because
   * submenu visibility depends only on these flags.
   */
  toggleGroup(group: 'policies' | 'schemes' | 'analytics'): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }

    const next =
      group === 'policies'
        ? !this.policiesMenuOpen
        : group === 'schemes'
          ? !this.schemesMenuOpen
          : !this.analyticsMenuOpen;
    this.policiesMenuOpen = group === 'policies' ? next : false;
    this.schemesMenuOpen = group === 'schemes' ? next : false;
    this.analyticsMenuOpen = group === 'analytics' ? next : false;
  }

  closePoliciesMenu(): void {
    this.policiesMenuOpen = false;
  }

  onSchemesNavClick(event?: MouseEvent): void {
    const target = event?.target as HTMLElement | undefined;
    if (target?.closest('.dash-nav__chevron')) {
      event?.preventDefault();
      event?.stopPropagation();
      this.toggleSchemesMenu();
      return;
    }

    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }
    this.schemesMenuOpen = true;
    this.policiesMenuOpen = false;
    this.analyticsMenuOpen = false;
    this.closeMobileMenu();
    this.router.navigate(['/dashboard/government/schemes']);
  }

  toggleSchemesMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleSchemesMenu();
  }

  toggleSchemesMenu(): void {
    this.toggleGroup('schemes');
  }

  closeSchemesMenu(): void {
    this.schemesMenuOpen = false;
  }

  onAnalyticsNavClick(event?: MouseEvent): void {
    const target = event?.target as HTMLElement | undefined;
    if (target?.closest('.dash-nav__chevron')) {
      event?.preventDefault();
      event?.stopPropagation();
      this.toggleAnalyticsMenu();
      return;
    }

    this.toggleAnalyticsMenu();
  }

  toggleAnalyticsMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleAnalyticsMenu();
  }

  toggleAnalyticsMenu(): void {
    this.toggleGroup('analytics');
  }

  closeAnalyticsMenu(): void {
    this.analyticsMenuOpen = false;
  }

  closeAllSubmenus(): void {
    this.policiesMenuOpen = false;
    this.schemesMenuOpen = false;
    this.analyticsMenuOpen = false;
  }

  // =======================================================
  // ROUTE ACTIVE CHECKS
  // =======================================================

  isDashboardRouteActive(): boolean {
    return (
      !this.policiesMenuOpen &&
      !this.schemesMenuOpen &&
      !this.analyticsMenuOpen &&
      this.router.url === "/dashboard/government"
    );
  }

  isPoliciesRouteActive(): boolean {
    return this.router.url.startsWith("/dashboard/government/policies");
  }

  isSchemesRouteActive(): boolean {
    return (
      this.router.url.startsWith("/dashboard/government/schemes") ||
      this.router.url.startsWith("/dashboard/government/compare")
    );
  }

  isAnalyticsRouteActive(): boolean {
    return this.router.url.startsWith("/dashboard/government/analytics");
  }

  // =======================================================
  // WINDOW RESIZE
  // =======================================================

  @HostListener("window:resize")
  onWindowResize(): void {
    if (window.innerWidth > 767) {
      this.mobileMenuOpen = false;
    }
  }

  // =======================================================
  // SEARCH
  // =======================================================

  performSearch(): void {
    const query = this.searchText.trim();

    if (!query) {
      return;
    }

    console.log("Government search:", query);

    this.router.navigate(["/schemes"], {
      queryParams: {
        q: query,
      },
    });

    this.closeMobileMenu();
  }

  // =======================================================
  // CLEAR SEARCH
  // =======================================================

  clearSearch(): void {
    this.searchText = "";
  }

  // =======================================================
  // OPEN LOGOUT MODAL
  // =======================================================

  logout(): void {
    this.showLogoutModal = true;
  }

  // =======================================================
  // CONFIRM LOGOUT - YES
  // =======================================================

  confirmLogout(): void {
    this.showLogoutModal = false;

    // Clear authentication
    this.authService.logout();

    // Reset layout
    this.userName.set("Government Official");
    this.userRole.set("Government Official");
    this.avatarSrc.set(null);
    this.avatarLoading.set(false);

    this.mobileMenuOpen = false;
    this.sidebarCollapsed = false;

    // Redirect to login
    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  // =======================================================
  // CANCEL LOGOUT - NO
  // =======================================================

  cancelLogout(): void {
    // IMPORTANT:
    // Do not logout here.
    // Only close the popup.

    this.showLogoutModal = false;
  }
}
