import {
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  inject,
} from "@angular/core";

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
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FooterComponent,
    LogoutConfirmComponent,
    TopbarComponent,
  ],

  templateUrl: "./organization-layout.component.html",
  styleUrl: "./organization-layout.component.scss",
})
export class OrganizationLayoutComponent implements OnInit {
  // =========================================================
  // SIDEBAR
  // =========================================================

  sidebarCollapsed = false;
  mobileMenuOpen = false;
  analyticsMenuOpen = false;

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
      label: "Search Policies",
      icon: "policy",
      route: "/dashboard/organization/policies/search",
    },

    {
      label: "Search Schemes",
      icon: "account_balance",
      route: "/dashboard/organization/schemes",
    },

    {
      label: "Compare",
      icon: "compare_arrows",
      route: "/dashboard/organization/compare",
    },

    {
      label: "Analytics",
      icon: "analytics",
      route: "/dashboard/organization/analytics",
    },

    {
      label: "Saved Items",
      icon: "bookmark",
      route: "/dashboard/organization/saved",
    },

    {
      label: "Search History",
      icon: "history",
      route: "/dashboard/organization/history",
    },

    {
      label: "Notifications",
      icon: "notifications_none",
      route: "/dashboard/organization/notifications",
    },

    {
      label: "Help & Support",
      icon: "support_agent",
      route: "/dashboard/organization/support",
    },

    {
      label: "Feedback",
      icon: "rate_review",
      route: "/dashboard/organization/feedback",
    },
  ];

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private readonly authService: Auth,
    private readonly router: Router,
  ) {}

  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
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
