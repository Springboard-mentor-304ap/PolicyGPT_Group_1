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
// NAV ITEM
// =========================================================

export interface AdminNavItem {
  label: string;
  route: string;
  icon: string;
  hasSubmenu?: boolean;
}

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
    ToastContainerComponent,
  ],

  templateUrl: "./admin-layout.component.html",
  styleUrl: "./admin-layout.component.scss",
})
export class AdminLayoutComponent implements OnInit {
  // =======================================================
  // USER
  // =======================================================

  userName = "Admin User";
  userRole = "Administrator";

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
      route: "/admin/audit-logs",
      icon: "history",
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
  // INIT
  // =======================================================

  ngOnInit(): void {
    this.loadCurrentUser();

    if (this.isUsersRouteActive()) {
      this.usersMenuOpen = true;
    } else if (this.isPoliciesRouteActive()) {
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

    if (storedUser) {
      this.setUserDetails(storedUser);
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
      this.userName = user.full_name.trim();
    }

    this.userRole = this.formatRole(user.role);
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
    this.closeMobileMenu();
    this.router.navigate(["/dashboard/admin/users"]);
  }

  toggleUsersMenuOnly(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleUsersMenu();
  }

  toggleUsersMenu(): void {
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }

    this.usersMenuOpen = !this.usersMenuOpen;
    if (this.usersMenuOpen) {
      this.policiesMenuOpen = false;
      this.schemesMenuOpen = false;
    }
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
    this.closeMobileMenu();
    this.router.navigate(['/dashboard/admin/policies/search']);
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
      this.usersMenuOpen = false;
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
    this.usersMenuOpen = false;
    this.policiesMenuOpen = false;
    this.closeMobileMenu();
    this.router.navigate(['/dashboard/admin/schemes']);
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
      this.usersMenuOpen = false;
      this.policiesMenuOpen = false;
    }
  }

  closeSchemesMenu(): void {
    this.schemesMenuOpen = false;
  }

  closeAllSubmenus(): void {
    this.usersMenuOpen = false;
    this.policiesMenuOpen = false;
    this.schemesMenuOpen = false;
  }

  // =======================================================
  // ROUTE ACTIVE CHECKS
  // =======================================================

  isDashboardRouteActive(): boolean {
    return (
      !this.usersMenuOpen &&
      !this.policiesMenuOpen &&
      !this.schemesMenuOpen &&
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
    this.userName = "Admin User";
    this.userRole = "Administrator";

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
