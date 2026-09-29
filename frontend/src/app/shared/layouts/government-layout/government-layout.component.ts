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

  userName = "Government Official";
  userRole = "Government Official";

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
      route: "/government/reports",
    },

    {
      icon: "fact_check",
      label: "Audit Logs",
      route: "/government/audit-logs",
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

  // =======================================================
  // INITIALIZATION
  // =======================================================

  ngOnInit(): void {
    this.loadCurrentUser();

    if (this.isPoliciesRouteActive()) {
      this.policiesMenuOpen = true;
    } else if (this.isSchemesRouteActive()) {
      this.schemesMenuOpen = true;
    }
  }

  // =======================================================
  // LOAD CURRENT USER
  // =======================================================

  private loadCurrentUser(): void {
    const storedUser: AuthUser | null = this.authService.getStoredUser();

    // -----------------------------------------------------
    // USE STORED USER FIRST
    // -----------------------------------------------------

    if (storedUser) {
      this.setUserDetails(storedUser);
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

    this.userName = user.full_name || "Government Official";

    this.userRole = this.formatRole(user.role || "GOVERNMENT_OFFICIAL");
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
    this.closeMobileMenu();
    this.router.navigate(['/dashboard/government/policies/search']);
  }

  togglePoliciesMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.togglePoliciesMenu();
  }

  togglePoliciesMenu(): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }

    this.policiesMenuOpen = !this.policiesMenuOpen;
    if (this.policiesMenuOpen) {
      this.schemesMenuOpen = false;
    }
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
    this.closeMobileMenu();
    this.router.navigate(['/dashboard/government/schemes']);
  }

  toggleSchemesMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleSchemesMenu();
  }

  toggleSchemesMenu(): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }

    this.schemesMenuOpen = !this.schemesMenuOpen;
    if (this.schemesMenuOpen) {
      this.policiesMenuOpen = false;
    }
  }

  closeSchemesMenu(): void {
    this.schemesMenuOpen = false;
  }

  closeAllSubmenus(): void {
    this.policiesMenuOpen = false;
    this.schemesMenuOpen = false;
  }

  // =======================================================
  // ROUTE ACTIVE CHECKS
  // =======================================================

  isDashboardRouteActive(): boolean {
    return (
      !this.policiesMenuOpen &&
      !this.schemesMenuOpen &&
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
    this.userName = "Government Official";
    this.userRole = "Government Official";

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
