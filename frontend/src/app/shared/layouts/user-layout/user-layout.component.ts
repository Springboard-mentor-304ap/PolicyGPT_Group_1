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

export interface UserNavItem {
  icon: string;
  label: string;
  route: string;
}

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
  userName = "User Name";
  userRole = "GUEST";

  sidebarCollapsed = false;
  mobileMenuOpen = false;

  searchText = "";

  showLogoutModal = false;

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

  constructor(
    private authService: Auth,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  private loadCurrentUser(): void {
    const storedUser: AuthUser | null = this.authService.getStoredUser();

    if (storedUser) {
      this.setUserDetails(storedUser);
    }

    const token = this.authService.getToken();

    if (!token) {
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

        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error("Unable to load current user:", error);

        if (error?.status === 401 || error?.status === 403) {
          this.authService.logout();

          this.router.navigate(["/auth/login"], {
            replaceUrl: true,
          });
        }
      },
    });
  }

  private setUserDetails(user: AuthUser): void {
    this.userName = user.full_name?.trim() || "User Name";

    this.userRole = user.role?.trim().toUpperCase() || "GUEST";
  }

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

  toggleSidebar(): void {
    if (window.innerWidth <= 767) {
      this.mobileMenuOpen = !this.mobileMenuOpen;
      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  openMobileMenu(): void {
    this.mobileMenuOpen = true;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  @HostListener("window:resize")
  onWindowResize(): void {
    if (window.innerWidth > 767) {
      this.mobileMenuOpen = false;
    }
  }

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

  clearSearch(): void {
    this.searchText = "";
  }

  logout(): void {
    this.showLogoutModal = true;
    this.cdr.detectChanges();
  }

  confirmLogout(): void {
    this.showLogoutModal = false;

    this.authService.logout();

    this.mobileMenuOpen = false;
    this.sidebarCollapsed = false;

    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  cancelLogout(): void {
    this.showLogoutModal = false;
    this.cdr.detectChanges();
  }
}
