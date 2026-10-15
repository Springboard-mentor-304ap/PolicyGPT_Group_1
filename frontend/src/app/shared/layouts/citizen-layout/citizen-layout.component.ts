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
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FooterComponent,
    LogoutConfirmComponent,
    TopbarComponent,
  ],

  templateUrl: "./citizen-layout.component.html",
  styleUrl: "./citizen-layout.component.scss",
})
export class CitizenLayoutComponent implements OnInit {
  // =========================================================
  // SIDEBAR
  // =========================================================

  sidebarCollapsed = false;
  // Expanded by default on every screen size: on mobile this opens the
  // overlay drawer (closed on navigation, reopened via hamburger).
  mobileMenuOpen = true;
  analyticsMenuOpen = false;

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
  ) {}

  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    // Tablet default: icon-only rail (hamburger expands to the full
    // sidebar). Desktop loads expanded; mobile uses the overlay drawer.
    if (window.innerWidth >= 768 && window.innerWidth <= 1100) {
      this.sidebarCollapsed = true;
    }
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
