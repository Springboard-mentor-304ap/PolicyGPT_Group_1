import { Component, HostListener, OnInit } from "@angular/core";

import { CommonModule } from "@angular/common";

import { FormsModule } from "@angular/forms";

import { Router, RouterLink, RouterLinkActive } from "@angular/router";

import { Auth, AuthUser } from "../../../../core/services/auth";

import { LogoutConfirmComponent } from "../../../../shared/components/logout-confirm/logout-confirm.component";

// =========================================================
// STAT CARD
// =========================================================

export interface StatCard {
  label: string;
  value: number;
  sublabel: string;
  icon: string;
  color: "blue" | "orange" | "green" | "purple";
}

// =========================================================
// NAV ITEM
// =========================================================

export interface NavItem {
  label: string;
  route: string;
  icon: string;
  hasSubmenu?: boolean;
}

// =========================================================
// LIST ITEM
// =========================================================

export interface ListItem {
  id: number;
  title: string;
  ministry: string;
  icon?: string;
  iconClass?: string;
}

// =========================================================
// ADMIN COMPONENT
// =========================================================

@Component({
  selector: "app-admin-dashboard",

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,

    // Logout confirmation popup
    LogoutConfirmComponent,
  ],

  templateUrl: "./admin.component.html",

  styleUrls: ["./admin.component.scss"],
})
export class AdminComponent implements OnInit {
  // =======================================================
  // LOGGED-IN USER
  // =======================================================

  userName = "User";

  userRole = "Admin";

  // =======================================================
  // SIDEBAR
  // =======================================================

  sidebarCollapsed = false;

  /*
   * Used for mobile sidebar.
   *
   * false = sidebar closed
   * true  = sidebar open
   */

  mobileMenuOpen = false;

  // =======================================================
  // SEARCH
  // =======================================================

  searchText = "";

  // =======================================================
  // LOGOUT MODAL
  // =======================================================

  showLogoutModal = false;

  // =======================================================
  // ADMIN NAVIGATION
  //
  // DO NOT CHANGE THESE OPTIONS
  // =======================================================

  navItems: NavItem[] = [
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
      label: "Users",
      route: "/admin/users",
      icon: "group",
    },

    {
      label: "Reports",
      route: "/admin/reports",
      icon: "assessment",
    },

    {
      label: "Audit Logs",
      route: "/admin/audit-logs",
      icon: "history",
    },
  ];

  // =======================================================
  // STAT CARDS
  // =======================================================

  statCards: StatCard[] = [
    {
      label: "Total Policies",
      value: 1242,
      sublabel: "+32 this week",
      icon: "policy",
      color: "blue",
    },

    {
      label: "Total Schemes",
      value: 897,
      sublabel: "+18 this week",
      icon: "article",
      color: "orange",
    },

    {
      label: "Total Users",
      value: 432,
      sublabel: "+2,154 this week",
      icon: "person_outline",
      color: "green",
    },

    {
      label: "Applications",
      value: 321,
      sublabel: "+61 this week",
      icon: "assignment",
      color: "purple",
    },
  ];

  // =======================================================
  // SCHEMES
  // =======================================================

  schemes: ListItem[] = [
    {
      id: 1,
      title: "PM Surya Ghar Muft Bijli Yojana",
      ministry: "Ministry of New & Renewable Energy",
      icon: "wb_sunny",
      iconClass: "sun",
    },

    {
      id: 2,
      title: "Pradhan Mantri Jan Arogya Yojana (PM-JAY)",
      ministry: "Ministry of Health & Family Welfare",
      icon: "health_and_safety",
      iconClass: "health",
    },

    {
      id: 3,
      title: "PM Vishwakarma Yojana",
      ministry: "Ministry of Micro, Small & Medium Enterprises",
      icon: "engineering",
      iconClass: "work",
    },

    {
      id: 4,
      title: "Post Matric Scholarship Scheme",
      ministry: "Ministry of Health & Family Welfare",
      icon: "school",
      iconClass: "edu",
    },
  ];

  // =======================================================
  // POLICIES
  // =======================================================

  policies: ListItem[] = [
    {
      id: 1,
      title: "National Education Policy 2020",
      ministry: "Ministry of Education",
    },

    {
      id: 2,
      title: "Ayushman Bharat Policy",
      ministry: "Ministry of Health & Family Welfare",
    },

    {
      id: 3,
      title: "Electricity Act, 2003",
      ministry: "Ministry of Power",
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
  }

  // =======================================================
  // LOAD LOGGED-IN USER
  // =======================================================

  private loadCurrentUser(): void {
    /*
     * STEP 1:
     * Load the cached user first.
     *
     * This allows the admin name and role
     * to appear immediately after refresh.
     */

    const storedUser = this.authService.getStoredUser();

    if (storedUser) {
      this.setUserDetails(storedUser);
    }

    /*
     * STEP 2:
     * Make sure a token exists.
     */

    if (!this.authService.isLoggedIn()) {
      this.router.navigate(["/auth/login"], {
        replaceUrl: true,
      });

      return;
    }

    /*
     * STEP 3:
     * Get the latest user information
     * from the backend.
     */

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        this.setUserDetails(user);
      },

      error: (error: unknown) => {
        console.error("Unable to load logged-in admin:", error);

        /*
         * If the JWT is invalid or expired,
         * remove authentication and return
         * to the login page.
         */

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

        /*
         * For other errors, keep the cached
         * user information and dashboard visible.
         */
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

    /*
     * Full name
     */

    if (typeof user.full_name === "string" && user.full_name.trim()) {
      this.userName = user.full_name.trim();
    }

    /*
     * Role
     */

    this.userRole = this.formatRole(user.role);
  }

  // =======================================================
  // FORMAT ROLE
  // =======================================================

  private formatRole(role: string | null | undefined): string {
    if (!role) {
      return "Admin";
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
  // SIDEBAR TOGGLE
  // =======================================================

  toggleSidebar(): void {
    /*
     * On mobile:
     * open/close the sidebar as an overlay.
     */

    if (window.innerWidth <= 767) {
      this.mobileMenuOpen = !this.mobileMenuOpen;

      return;
    }

    /*
     * On desktop:
     * collapse/expand sidebar.
     */

    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  // =======================================================
  // OPEN MOBILE MENU
  // =======================================================

  openMobileMenu(): void {
    this.mobileMenuOpen = true;
  }

  // =======================================================
  // CLOSE MOBILE MENU
  // =======================================================

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  // =======================================================
  // WINDOW RESIZE
  // =======================================================

  @HostListener("window:resize")
  onWindowResize(): void {
    /*
     * Close mobile overlay when
     * switching back to desktop.
     */

    if (window.innerWidth > 767) {
      this.mobileMenuOpen = false;
    }
  }

  // =======================================================
  // SEARCH
  // =======================================================

  performSearch(): void {
    const query = this.searchText.trim();

    /*
     * Don't navigate if search is empty.
     */

    if (!query) {
      return;
    }

    console.log("Admin searching for:", query);

    this.router.navigate(["/schemes"], {
      queryParams: {
        q: query,
      },
    });
  }

  // =======================================================
  // CLEAR SEARCH
  // =======================================================

  clearSearch(): void {
    this.searchText = "";
  }

  // =======================================================
  // LOGOUT
  // SHOW CONFIRMATION POPUP
  // =======================================================

  logout(): void {
    console.log("Logout confirmation opened");

    /*
     * Do NOT logout here.
     *
     * Just open the confirmation popup.
     */

    this.showLogoutModal = true;
  }

  // =======================================================
  // CONFIRM LOGOUT
  // YES BUTTON
  // =======================================================

  confirmLogout(): void {
    console.log("Admin confirmed logout");

    /*
     * Close popup
     */

    this.showLogoutModal = false;

    /*
     * Remove token + cached user
     */

    this.authService.logout();

    /*
     * Reset user information
     */

    this.userName = "User";

    this.userRole = "Admin";

    /*
     * Reset sidebar
     */

    this.sidebarCollapsed = false;

    this.mobileMenuOpen = false;

    /*
     * Go to login page
     */

    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  // =======================================================
  // CANCEL LOGOUT
  // NO BUTTON
  // =======================================================

  cancelLogout(): void {
    console.log("Admin cancelled logout");

    /*
     * Simply close the popup.
     *
     * User remains logged in.
     */

    this.showLogoutModal = false;
  }
}
