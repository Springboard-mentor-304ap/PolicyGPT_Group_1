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
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FooterComponent,
    LogoutConfirmComponent,
    TopbarComponent,
  ],

  templateUrl: "./researcher-layout.component.html",
  styleUrl: "./researcher-layout.component.scss",
})
export class ResearcherLayoutComponent implements OnInit {
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
