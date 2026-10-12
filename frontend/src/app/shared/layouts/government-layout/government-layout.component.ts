import { Component, DestroyRef, HostListener, OnInit, inject } from "@angular/core";

import { CommonModule } from "@angular/common";

import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { filter } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { Auth } from "../../../core/services/auth";

import { FooterComponent } from "../../components/footer/footer.component";

import { LogoutConfirmComponent } from "../../components/logout-confirm/logout-confirm.component";
import { TopbarComponent } from "../../components/topbar/topbar.component";

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
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FooterComponent,
    LogoutConfirmComponent,
    TopbarComponent,
  ],

  templateUrl: "./government-layout.component.html",
  styleUrl: "./government-layout.component.scss",
})
export class GovernmentLayoutComponent implements OnInit {
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

  /**
   * First child destination for the Analytics group, which navigates on
   * parent-label click (mirrors the admin layout's GROUP_FIRST_CHILD
   * convention: expand once + navigate once, collapse when expanded).
   */
  private static readonly GROUP_FIRST_CHILD: Record<'analytics', string> = {
    analytics: '/dashboard/government/analytics',
  };

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
  ) {}

  private readonly destroyRef = inject(DestroyRef);

  // =======================================================
  // INITIALIZATION
  // =======================================================

  ngOnInit(): void {
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

    // Parent label follows the shared expandable-group convention:
    // expand once + navigate once to the first child; collapse when
    // already expanded.
    this.openGroup('analytics');
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

  /**
   * Shared expandable-group behavior for Analytics (mirrors the admin
   * layout convention).
   *
   * First click on a closed parent: expand it, close every other group,
   * and navigate exactly once to the group's first child. Clicking an
   * already-expanded parent collapses it without navigating (when a
   * child route is active the route itself keeps the group expanded).
   * Chevron clicks keep the existing toggle-only handlers, and child
   * links navigate normally without touching these flags.
   */
  private openGroup(group: 'analytics'): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }

    const expanded =
      this.analyticsMenuOpen || this.isAnalyticsRouteActive();
    this.closeAllSubmenus();
    if (expanded) {
      this.closeMobileMenu();
      return;
    }

    this.analyticsMenuOpen = true;
    this.closeMobileMenu();
    void this.router.navigate([GovernmentLayoutComponent.GROUP_FIRST_CHILD[group]]);
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
