import { Component, HostListener, OnInit } from "@angular/core";

import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";

import { Auth, AuthUser } from "../../../core/services/auth";
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

  userName = "Researcher";
  userRole = "Researcher";

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
      label: "Analytics",
      icon: "analytics",
      route: "/dashboard/researcher/analytics",
    },

    {
      label: "Saved Research",
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
      label: "Support",
      icon: "support_agent",
      route: "/dashboard/researcher/faqs",
    },
  ];

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private readonly router: Router,
    private readonly authService: Auth,
  ) {}

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.loadCurrentUser();

    if (this.isAnalyticsRouteActive()) {
      this.analyticsMenuOpen = true;
    }
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
    return this.router.url.startsWith("/dashboard/researcher/analytics");
  }

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

  private loadCurrentUser(): void {
    this.loadingUser = true;

    // -------------------------------------------------------
    // STORED USER
    // -------------------------------------------------------

    const cachedUser = this.authService.getStoredUser();

    if (cachedUser) {
      this.setUserDetails(cachedUser);
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

    this.userName = user.full_name?.trim() || "Researcher";

    this.userRole = this.formatRole(user.role);
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

    // Keep search inside Researcher Layout.

    this.router.navigate(["/dashboard/researcher/schemes"], {
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

    this.userName = "Researcher";
    this.userRole = "Researcher";

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
