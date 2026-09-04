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
  ],

  templateUrl: "./government-layout.component.html",

  styleUrl: "./government-layout.component.scss",
})
export class GovernmentLayoutComponent implements OnInit {
  // =======================================================
  // USER
  // =======================================================

  userName = "Government Official";

  userRole = "GOVERNMENT OFFICIAL";

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
  // LOGOUT
  // =======================================================

  showLogoutModal = false;

  // =======================================================
  // SERVICES
  // =======================================================

  constructor(
    private authService: Auth,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

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
  ];

  // =======================================================
  // INITIALIZATION
  // =======================================================

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  // =======================================================
  // LOAD CURRENT USER
  // =======================================================

  private loadCurrentUser(): void {
    const storedUser: AuthUser | null = this.authService.getStoredUser();

    // -----------------------------------------------------
    // USE STORED USER
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
    // GET USER FROM BACKEND
    // -----------------------------------------------------

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          return;
        }

        this.setUserDetails(user);

        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error("Unable to load current user:", error);

        // -----------------------------------------------
        // INVALID TOKEN
        // -----------------------------------------------

        if (error?.status === 401 || error?.status === 403) {
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
      .replace(/\b\w/g, (char) => char.toUpperCase());
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
  // LOGOUT
  // =======================================================

  logout(): void {
    this.showLogoutModal = true;

    this.cdr.detectChanges();
  }

  // =======================================================
  // CONFIRM LOGOUT
  // =======================================================

  confirmLogout(): void {
    this.showLogoutModal = false;

    this.authService.logout();

    this.mobileMenuOpen = false;

    this.sidebarCollapsed = false;

    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  // =======================================================
  // CANCEL LOGOUT
  // =======================================================

  cancelLogout(): void {
    this.showLogoutModal = false;

    this.cdr.detectChanges();
  }
}
