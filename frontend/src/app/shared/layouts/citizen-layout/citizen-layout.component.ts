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
    ToastContainerComponent,
  ],

  templateUrl: "./citizen-layout.component.html",
  styleUrl: "./citizen-layout.component.scss",
})
export class CitizenLayoutComponent implements OnInit {
  // =========================================================
  // USER
  // =========================================================

  user: AuthUser | null = null;

  userName = "User Name";
  userRole = "Citizen";

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
      children: [
        {
          label: "Personal Analytics",
          icon: "dashboard",
          route: "/dashboard/citizen/analytics",
        },
        {
          label: "Saved & Search Activity",
          icon: "insights",
          route: "/dashboard/citizen/analytics/activity",
        },
      ],
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
      label: "Support",
      icon: "support_agent",
      route: "/dashboard/citizen/faqs",
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
    return this.router.url.startsWith("/dashboard/citizen/analytics");
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

    this.userName = user.full_name?.trim() || "User Name";

    this.userRole = this.formatRole(user.role);
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

    this.userName = "User Name";
    this.userRole = "Citizen";

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
