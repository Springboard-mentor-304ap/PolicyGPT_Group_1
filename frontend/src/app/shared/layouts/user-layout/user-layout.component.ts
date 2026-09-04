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

// =========================================================
// NAVIGATION ITEM
// =========================================================

export interface UserNavItem {
  icon: string;
  label: string;
  route: string;
}

// =========================================================
// USER LAYOUT
// =========================================================

@Component({
  selector: "app-user-layout",
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

  templateUrl: "./user-layout.component.html",
  styleUrl: "./user-layout.component.scss",
})
export class UserLayoutComponent implements OnInit {
  // =======================================================
  // USER
  // =======================================================

  user: AuthUser | null = null;

  userName = "User Name";
  userRole = "GUEST";

  // =======================================================
  // SIDEBAR
  // =======================================================

  sidebarCollapsed = false;
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
  // NAVIGATION
  // =======================================================

  navItems: UserNavItem[] = [
    {
      icon: "manage_search",
      label: "Search Policies",
      route: "/policies",
    },

    {
      icon: "account_balance",
      label: "Search Schemes",
      route: "/schemes",
    },

    {
      icon: "fact_check",
      label: "Eligibility Checker",
      route: "/eligibility",
    },

    {
      icon: "compare_arrows",
      label: "Compare",
      route: "/compare",
    },

    {
      icon: "bookmark_border",
      label: "Saved Items",
      route: "/saved",
    },

    {
      icon: "notifications_none",
      label: "Notifications",
      route: "/notifications",
    },

    {
      icon: "history",
      label: "Search History",
      route: "/history",
    },

    {
      icon: "insert_chart_outlined",
      label: "Application Status",
      route: "/status",
    },

    {
      icon: "support_agent",
      label: "Support",
      route: "/feedback",
    },
  ];

  // =======================================================
  // CONSTRUCTOR
  // =======================================================

  constructor(
    private readonly authService: Auth,
    private readonly router: Router,
  ) {}

  // =======================================================
  // INIT
  // =======================================================

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  // =======================================================
  // LOAD CURRENT USER
  // =======================================================

  private loadCurrentUser(): void {
    // -----------------------------------------------------
    // GET STORED USER
    // -----------------------------------------------------

    const storedUser: AuthUser | null = this.authService.getStoredUser();

    if (storedUser) {
      this.setUserDetails(storedUser);
    }

    // -----------------------------------------------------
    // CHECK TOKEN
    // -----------------------------------------------------

    const token = this.authService.getToken();

    if (!token) {
      this.authService.logout();

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
  // SET USER
  // =======================================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    this.userName = user.full_name?.trim() || "User Name";

    this.userRole = user.role?.trim().toUpperCase() || "GUEST";
  }

  // =======================================================
  // DISPLAY ROLE
  // =======================================================

  get displayRole(): string {
    switch ((this.userRole || "").toUpperCase().replace(/[\s-]+/g, "_")) {
      case "RESEARCHER":
        return "Researcher";

      case "ORGANIZATION":
      case "ORGANISATION":
        return "Organization";

      case "GUEST":
      case "GUEST_USER":
        return "Guest User";

      case "CITIZEN":
        return "Citizen";

      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT_OFFICER":
      case "GOVERNMENT":
        return "Government Official";

      case "ADMIN":
      case "ADMINISTRATOR":
        return "Administrator";

      default:
        return "Guest User";
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
    // Close modal
    this.showLogoutModal = false;

    // Remove authentication
    this.authService.logout();

    // Reset user information
    this.user = null;
    this.userName = "User Name";
    this.userRole = "GUEST";

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
    // Do NOT logout.
    // Simply close the confirmation popup.

    this.showLogoutModal = false;
  }
}
