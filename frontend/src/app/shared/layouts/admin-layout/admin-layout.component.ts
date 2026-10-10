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

// =========================================================
// NAV ITEM
// =========================================================

export interface AdminNavItem {
  label: string;
  route: string;
  icon: string;
  hasSubmenu?: boolean;
}

/** Expandable sidebar groups sharing one accordion toggle. */
export type AdminMenuGroup =
  | 'users'
  | 'policies'
  | 'schemes'
  | 'analytics'
  | 'support';

// =========================================================
// COMPONENT
// =========================================================

@Component({
  selector: "app-admin-layout",
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

  templateUrl: "./admin-layout.component.html",
  styleUrl: "./admin-layout.component.scss",
})
export class AdminLayoutComponent implements OnInit {
  // =======================================================
  // USER
  // =======================================================

  userName = signal("Admin User");
  userRole = signal("Administrator");

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

  usersMenuOpen = false;
  policiesMenuOpen = false;
  schemesMenuOpen = false;
  analyticsMenuOpen = false;
  supportMenuOpen = false;

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

  navItems: AdminNavItem[] = [
    {
      label: "Dashboard",
      route: "/dashboard/admin",
      icon: "home",
    },

    {
      label: "Policies",
      route: "/admin/policies",
      icon: "policy",
      hasSubmenu: true,
    },

    {
      label: "Scheme",
      route: "/admin/schemes",
      icon: "article",
      hasSubmenu: true,
    },

    {
      label: "Notifications",
      route: "/admin/notifications",
      icon: "notifications_none",
    },

    {
  label: "Analytics",
  route: "/dashboard/admin/analytics",
  icon: "analytics",
    },

    {
      label: "Reports",
      route: "/dashboard/admin/reports",
      icon: "query_stats",
    },

    {
      label: "Audit Logs",
      route: "/dashboard/admin/audit-logs",
      icon: "history",
    },
  ];

  // =======================================================
  // EXPANDABLE GROUP FIRST-CHILD ROUTES
  // =======================================================

  /**
   * Landing route opened when a closed expandable parent is clicked.
   * Must match the first child link rendered for each group so the
   * URL, the highlighted child, and the expanded parent always agree.
   */
  private static readonly GROUP_FIRST_CHILD: Record<'analytics' | 'support', string> = {
    analytics: '/dashboard/admin/analytics',
    support: '/dashboard/admin/feedback',
  };

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
  // INIT
  // =======================================================

  ngOnInit(): void {
    // Shared current-user state FIRST: the BehaviorSubject replays the
    // stored/login user synchronously, so name/role/photo-version are
    // available before the background /me refresh below resolves.
    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (!user) {
          this.userName.set("Admin User");
          this.userRole.set("Administrator");
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
    // others close. Arrow clicks always work because visibility depends
    // only on these flags — collapsing a group whose child is active
    // persists until a relevant route change re-expands it.
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
    if (this.isUsersRouteActive()) {
      this.usersMenuOpen = true;
      this.policiesMenuOpen = false;
      this.schemesMenuOpen = false;
      this.analyticsMenuOpen = false;
      this.supportMenuOpen = false;
    } else if (this.isPoliciesRouteActive()) {
      this.usersMenuOpen = false;
      this.policiesMenuOpen = true;
      this.schemesMenuOpen = false;
      this.analyticsMenuOpen = false;
      this.supportMenuOpen = false;
    } else if (this.isSchemesRouteActive()) {
      this.usersMenuOpen = false;
      this.policiesMenuOpen = false;
      this.schemesMenuOpen = true;
      this.analyticsMenuOpen = false;
      this.supportMenuOpen = false;
    } else if (this.isAnalyticsRouteActive()) {
      this.usersMenuOpen = false;
      this.policiesMenuOpen = false;
      this.schemesMenuOpen = false;
      this.analyticsMenuOpen = true;
      this.supportMenuOpen = false;
    } else if (this.isSupportRouteActive()) {
      this.usersMenuOpen = false;
      this.policiesMenuOpen = false;
      this.schemesMenuOpen = false;
      this.analyticsMenuOpen = false;
      this.supportMenuOpen = true;
    }
  }

  // =======================================================
  // LOAD CURRENT USER
  // =======================================================

  private loadCurrentUser(): void {
    const snapshot =
      (this.authService as unknown as { getCurrentUserSnapshot?: () => AuthUser | null }).getCurrentUserSnapshot?.() ??
      this.authService.getStoredUser();

    if (snapshot) {
      this.setUserDetails(snapshot);
      if (!this.avatarSrc() && snapshot.profile_photo_updated_at) {
        this.avatarLoading.set(true);
      } else if (!snapshot.profile_photo_updated_at) {
        this.avatarLoading.set(false);
      }
    }

    if (!this.authService.isLoggedIn()) {
      this.router.navigate(["/auth/login"], {
        replaceUrl: true,
      });

      return;
    }

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          return;
        }

        this.setUserDetails(user);
        this.refreshAvatar(user);
      },

      error: (error: unknown) => {
        console.error("Unable to load logged-in admin:", error);

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

    if (typeof user.full_name === "string" && user.full_name.trim()) {
      this.userName.set(user.full_name.trim());
    }

    this.userRole.set(this.formatRole(user.role));
  }

  /**
   * Resolve the avatar image for the given user through the shared
   * AvatarService (per-version cached blob URL, default icon on
   * error or when the user has no photo).
   */
  private refreshAvatar(user: AuthUser): void {
    if (!user?.profile_photo_updated_at) {
      this.avatarSrc.set(null);
      this.avatarLoading.set(false);
      return;
    }
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

  private formatRole(role: string | null | undefined): string {
    if (!role) {
      return "Administrator";
    }

    const normalizedRole = role.trim().toUpperCase();

    switch (normalizedRole) {
      case "ADMIN":
        return "Admin";

      case "ADMINISTRATOR":
        return "Administrator";

      case "GOVERNMENT_OFFICIAL":
        return "Government Official";

      case "CITIZEN":
        return "Citizen";

      case "RESEARCHER":
        return "Researcher";

      case "ORGANIZATION":
      case "ORGANISATION":
        return "Organization";

      default:
        return role
          .trim()
          .toLowerCase()
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char: string) => char.toUpperCase());
    }
  }

  // =======================================================
  // SIDEBAR
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
  // WINDOW RESIZE
  // =======================================================

  @HostListener("window:resize")
  onWindowResize(): void {
    if (window.innerWidth > 767) {
      this.mobileMenuOpen = false;
    }
  }

  // =======================================================
  // SUBMENU CONTROLS
  // =======================================================

  /**
   * Single accordion toggle for every expandable parent: flips the
   * named group and closes the rest. Arrow clicks always take effect —
   * collapsing works even while a child route is active, because
   * submenu visibility depends only on these flags.
   */
  toggleGroup(group: AdminMenuGroup): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }

    const next =
      group === 'users'
        ? !this.usersMenuOpen
        : group === 'policies'
          ? !this.policiesMenuOpen
          : group === 'schemes'
            ? !this.schemesMenuOpen
            : group === 'analytics'
              ? !this.analyticsMenuOpen
              : !this.supportMenuOpen;
    this.usersMenuOpen = group === 'users' ? next : false;
    this.policiesMenuOpen = group === 'policies' ? next : false;
    this.schemesMenuOpen = group === 'schemes' ? next : false;
    this.analyticsMenuOpen = group === 'analytics' ? next : false;
    this.supportMenuOpen = group === 'support' ? next : false;
  }

  onUsersNavClick(event?: MouseEvent): void {
    const target = event?.target as HTMLElement | undefined;
    if (target?.closest(".dash-nav__chevron")) {
      event?.preventDefault();
      event?.stopPropagation();
      this.toggleUsersMenu();
      return;
    }

    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }
    this.usersMenuOpen = true;
    this.policiesMenuOpen = false;
    this.schemesMenuOpen = false;
    this.analyticsMenuOpen = false;
    this.supportMenuOpen = false;
    this.closeMobileMenu();
    this.router.navigate(["/dashboard/admin/users"]);
  }

  toggleUsersMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleUsersMenu();
  }

  toggleUsersMenu(): void {
    this.toggleGroup('users');
  }

  closeUsersMenu(): void {
    this.closeAllSubmenus();
  }

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
    this.usersMenuOpen = false;
    this.schemesMenuOpen = false;
    this.analyticsMenuOpen = false;
    this.supportMenuOpen = false;
    this.closeMobileMenu();
    this.router.navigate(['/dashboard/admin/policies/search']);
  }

  togglePoliciesMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.togglePoliciesMenu();
  }

  togglePoliciesMenu(): void {
    this.toggleGroup('policies');
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
    this.usersMenuOpen = false;
    this.policiesMenuOpen = false;
    this.analyticsMenuOpen = false;
    this.supportMenuOpen = false;
    this.closeMobileMenu();
    this.router.navigate(['/dashboard/admin/schemes']);
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

    this.openGroup('analytics');
  };

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

  onSupportNavClick(event?: MouseEvent): void {
    const target = event?.target as HTMLElement | undefined;
    if (target?.closest(".dash-nav__chevron")) {
      event?.preventDefault();
      event?.stopPropagation();
      this.toggleSupportMenu();
      return;
    }

    // Parent toggles/expands via openGroup — it never navigates elsewhere.
    this.openGroup('support');
  }

  /**
   * Shared expandable-group behavior for Analytics and Support & Feedback.
   *
   * First click on a closed parent: expand it, close every other group,
   * and navigate exactly once to the group's first child. Clicking an
   * already-expanded parent collapses it without navigating (when a
   * child route is active the route itself keeps the group expanded).
   * Chevron clicks keep the existing toggle-only handlers, and child
   * links navigate normally without touching these flags.
   */
  private openGroup(group: 'analytics' | 'support'): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }

    const expanded =
      group === 'analytics'
        ? this.analyticsMenuOpen || this.isAnalyticsRouteActive()
        : this.supportMenuOpen || this.isSupportRouteActive();
    this.closeAllSubmenus();
    if (expanded) {
      this.closeMobileMenu();
      return;
    }

    if (group === 'analytics') {
      this.analyticsMenuOpen = true;
    } else {
      this.supportMenuOpen = true;
    }
    this.closeMobileMenu();
    void this.router.navigate([AdminLayoutComponent.GROUP_FIRST_CHILD[group]]);
  }

  toggleSupportMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleSupportMenu();
  }

  toggleSupportMenu(): void {
    this.toggleGroup('support');
  }

  closeSupportMenu(): void {
    this.supportMenuOpen = false;
  }

  closeAllSubmenus(): void {
    this.usersMenuOpen = false;
    this.policiesMenuOpen = false;
    this.schemesMenuOpen = false;
    this.analyticsMenuOpen = false;
    this.supportMenuOpen = false;
  }

  // =======================================================
  // ROUTE ACTIVE CHECKS
  // =======================================================

  isDashboardRouteActive(): boolean {
    return (
      !this.usersMenuOpen &&
      !this.policiesMenuOpen &&
      !this.schemesMenuOpen &&
      !this.analyticsMenuOpen &&
      !this.supportMenuOpen &&
      this.router.url === "/dashboard/admin"
    );
  }

  isUsersRouteActive(): boolean {
    return this.router.url.startsWith("/dashboard/admin/users");
  }

  isPoliciesRouteActive(): boolean {
    return this.router.url.startsWith("/dashboard/admin/policies");
  }

  isSchemesRouteActive(): boolean {
    return (
      this.router.url.startsWith("/dashboard/admin/schemes") ||
      this.router.url.startsWith("/dashboard/admin/compare")
    );
  }

  isAnalyticsRouteActive(): boolean {
    return (
      this.router.url.startsWith("/dashboard/admin/analytics") ||
      this.router.url.startsWith("/dashboard/admin/support-analytics")
    );
  }

  isSupportRouteActive(): boolean {
    const url = this.router.url;
    return (
      url.startsWith("/dashboard/admin/feedback") ||
      url.startsWith("/dashboard/admin/support-requests") ||
      url.startsWith("/dashboard/admin/faqs") ||
      url.startsWith("/dashboard/admin/query-resolution")
    );
  }

  // =======================================================
  // SEARCH
  // =======================================================

  performSearch(): void {
    const query = this.searchText.trim();

    if (!query) {
      return;
    }

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
    console.log("Opening logout modal");

    this.showLogoutModal = true;
  }

  // =======================================================
  // CONFIRM LOGOUT - YES
  // =======================================================

  confirmLogout(): void {
    console.log("Admin logout confirmed");

    this.showLogoutModal = false;

    // Clear authentication
    this.authService.logout();

    // Reset UI
    this.userName.set("Admin User");
    this.userRole.set("Administrator");
    this.avatarSrc.set(null);
    this.avatarLoading.set(false);

    this.mobileMenuOpen = false;
    this.sidebarCollapsed = false;
    this.usersMenuOpen = false;

    // Go to login
    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  // =======================================================
  // CANCEL LOGOUT - NO
  // =======================================================

  cancelLogout(): void {
    console.log("Admin logout cancelled");

    // Do NOT logout.
    // Only close the modal.
    this.showLogoutModal = false;
  }
}
