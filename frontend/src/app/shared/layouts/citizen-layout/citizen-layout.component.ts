import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
} from "@angular/core";

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

@Component({
  selector: "app-citizen-layout",

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,

    RouterLink,
    RouterLinkActive,
    RouterOutlet,

    // =========================================
    // SHARED COMPONENTS
    // =========================================

    FooterComponent,
    LogoutConfirmComponent,
  ],

  templateUrl: "./citizen-layout.component.html",

  styleUrl: "./citizen-layout.component.scss",
})
export class CitizenLayoutComponent implements OnInit {
  // =========================================
  // USER
  // =========================================

  user: AuthUser | null = null;

  userName = "User Name";

  userRole = "Citizen";

  loadingUser = true;

  // =========================================
  // SIDEBAR
  // =========================================

  sidebarCollapsed = false;

  mobileMenuOpen = false;

  // =========================================
  // SEARCH
  // =========================================

  searchText = "";

  // =========================================
  // LOGOUT
  // =========================================

  showLogoutModal = false;

  // =========================================
  // NAVIGATION
  // =========================================

  navItems = [
    {
      label: "Dashboard",
      icon: "dashboard",
      route: "/dashboard/citizen",
    },

    {
      label: "Search Policies",
      icon: "policy",
      route: "/policies",
    },

    {
      label: "Search Schemes",
      icon: "account_balance",
      route: "/schemes",
    },

    {
      label: "Eligibility Checker",
      icon: "fact_check",
      route: "/eligibility",
    },

    {
      label: "Compare",
      icon: "compare_arrows",
      route: "/compare",
    },

    {
      label: "Saved Items",
      icon: "bookmark",
      route: "/saved",
    },

    {
      label: "Notifications",
      icon: "notifications_none",
      route: "/notifications",
    },

    {
      label: "Search History",
      icon: "history",
      route: "/history",
    },

    {
      label: "Application Status",
      icon: "assignment",
      route: "/status",
    },

    {
      label: "Support",
      icon: "support_agent",
      route: "/feedback",
    },
  ];

  constructor(
    private readonly router: Router,

    private readonly authService: Auth,

    private readonly cdr: ChangeDetectorRef,
  ) {}

  // =========================================
  // INIT
  // =========================================

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  // =========================================
  // LOAD USER
  // =========================================

  private loadCurrentUser(): void {
    this.loadingUser = true;

    const cachedUser = this.authService.getStoredUser();

    if (cachedUser) {
      this.setUserDetails(cachedUser);

      this.loadingUser = false;
    }

    const token = this.authService.getToken();

    if (!token) {
      this.authService.logout();

      this.router.navigate(["/auth/login"], {
        replaceUrl: true,
      });

      return;
    }

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          this.loadingUser = false;

          return;
        }

        this.setUserDetails(user);

        this.loadingUser = false;

        this.cdr.detectChanges();
      },

      error: (error: any) => {
        console.error("Unable to load current user:", error);

        this.loadingUser = false;

        if (error?.status === 401 || error?.status === 403) {
          this.authService.logout();

          this.router.navigate(["/auth/login"], {
            replaceUrl: true,
          });
        }
      },
    });
  }

  // =========================================
  // SET USER
  // =========================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    this.userName = user.full_name?.trim() || "User Name";

    this.userRole = this.formatRole(user.role);
  }

  // =========================================
  // FORMAT ROLE
  // =========================================

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

  // =========================================
  // SIDEBAR TOGGLE
  // =========================================

  toggleSidebar(): void {
    if (window.innerWidth <= 767) {
      this.mobileMenuOpen = !this.mobileMenuOpen;

      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  // =========================================
  // MOBILE MENU
  // =========================================

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  // =========================================
  // WINDOW RESIZE
  // =========================================

  @HostListener("window:resize")
  onWindowResize(): void {
    if (window.innerWidth > 767) {
      this.mobileMenuOpen = false;
    }
  }

  // =========================================
  // SEARCH
  // =========================================

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
  }

  // =========================================
  // LOGOUT
  // =========================================

  logout(): void {
    this.showLogoutModal = true;
  }

  // =========================================
  // CONFIRM LOGOUT
  // =========================================

  confirmLogout(): void {
    this.showLogoutModal = false;

    this.authService.logout();

    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  // =========================================
  // CANCEL LOGOUT
  // =========================================

  cancelLogout(): void {
    this.showLogoutModal = false;
  }
}
