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

/* =========================================================
   ORGANIZATION NAVIGATION ITEM
   ========================================================= */

export interface OrganizationNavItem {
  icon: string;
  label: string;
  route: string;
}

/* =========================================================
   ORGANIZATION LAYOUT
   ========================================================= */

@Component({
  selector: "app-organization-layout",

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FooterComponent,
    LogoutConfirmComponent,
  ],

  templateUrl: "./organization-layout.component.html",
  styleUrl: "./organization-layout.component.scss",
})
export class OrganizationLayoutComponent implements OnInit {
  // =========================================================
  // USER
  // =========================================================

  user: AuthUser | null = null;

  userName = "Organization";
  userRole = "ORGANIZATION";

  // =========================================================
  // SIDEBAR
  // =========================================================

  sidebarCollapsed = false;
  mobileMenuOpen = false;

  // =========================================================
  // SEARCH
  // =========================================================

  searchText = "";

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
      icon: "manage_search",
      label: "Policy Search",
      route: "/dashboard/organization/policies/search",
    },

    {
      icon: "account_balance",
      label: "Scheme Search",
      route: "/dashboard/organization/schemes",
    },

    {
      icon: "compare_arrows",
      label: "Policy Comparison",
      route: "/dashboard/organization/compare",
    },

    {
      icon: "analytics",
      label: "Organization Insights",
      route: "/dashboard/organization/analytics",
    },

    {
      icon: "bookmark_border",
      label: "Saved Policies",
      route: "/dashboard/organization/saved",
    },

    {
      icon: "history",
      label: "Research History",
      route: "/dashboard/organization/history",
    },

    {
      icon: "notifications_none",
      label: "Notifications",
      route: "/dashboard/organization/notifications",
    },

    {
      icon: "support_agent",
      label: "Support",
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

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

  private loadCurrentUser(): void {
    // -------------------------------------------------------
    // GET STORED USER
    // -------------------------------------------------------

    const storedUser: AuthUser | null = this.authService.getStoredUser();

    if (storedUser) {
      this.setUserDetails(storedUser);
    }

    // -------------------------------------------------------
    // CHECK TOKEN
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
    // GET CURRENT USER FROM BACKEND
    // -------------------------------------------------------

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          return;
        }

        this.setUserDetails(user);
      },

      error: (error: unknown) => {
        console.error("Unable to load organization user:", error);

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
  // SET USER DETAILS
  // =========================================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    this.userName = user.full_name?.trim() || "Organization";

    this.userRole = user.role?.trim().toUpperCase() || "ORGANIZATION";
  }

  // =========================================================
  // DISPLAY ROLE
  // =========================================================

  get displayRole(): string {
    switch ((this.userRole || "").toUpperCase().replace(/[\s-]+/g, "_")) {
      case "ORGANIZATION":
      case "ORGANISATION":
        return "Organization";

      default:
        return "Organization";
    }
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
  // SEARCH
  // =========================================================

  performSearch(): void {
    const query = this.searchText.trim();

    if (!query) {
      return;
    }

    // Keep search inside Organization Layout

    this.router.navigate(["/dashboard/organization/schemes"], {
      queryParams: {
        q: query,
      },
    });

    this.closeMobileMenu();
  }

  // =========================================================
  // CLEAR SEARCH
  // =========================================================

  clearSearch(): void {
    this.searchText = "";
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
    // RESET USER
    // -------------------------------------------------------

    this.user = null;

    this.userName = "Organization";
    this.userRole = "ORGANIZATION";

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
