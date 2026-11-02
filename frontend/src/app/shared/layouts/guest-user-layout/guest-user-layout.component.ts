import { Component, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";

import { FooterComponent } from "../../components/footer/footer.component";

/* =========================================================
   NAVIGATION ITEM
   ========================================================= */

export interface GuestNavItem {
  icon: string;
  label: string;
  route: string;
  requiresLogin?: boolean;
}

/* =========================================================
   GUEST USER LAYOUT
   ========================================================= */

@Component({
  selector: "app-guest-user-layout",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FooterComponent,
  ],
  templateUrl: "./guest-user-layout.component.html",
  styleUrl: "./guest-user-layout.component.scss",
})
export class GuestUserLayoutComponent {
  /* =======================================================
     GUEST USER
     ======================================================= */

  userName = "Guest User";
  userRole = "GUEST";

  /* =======================================================
     SIDEBAR
     ======================================================= */

  sidebarCollapsed = false;
  mobileMenuOpen = false;

  /* =======================================================
     SEARCH
     ======================================================= */

  searchText = "";

  /* =======================================================
     LOGIN REQUIRED MESSAGE
     ======================================================= */

  showLoginMessage = false;
  loginMessage = "";

  /* =======================================================
     NAVIGATION
     ======================================================= */

  navItems: GuestNavItem[] = [
    {
      icon: "dashboard",
      label: "Dashboard",
      route: "/dashboard/guest",
      requiresLogin: false,
    },
    {
      icon: "policy",
      label: "Policy Search",
      route: "/policies",
      requiresLogin: false,
    },
    {
      icon: "account_balance",
      label: "Search Scheme",
      route: "/schemes",
      requiresLogin: false,
    },
    {
      icon: "fact_check",
      label: "Eligibility Checker",
      route: "/eligibility",
      requiresLogin: true,
    },
    {
      icon: "compare_arrows",
      label: "Compare",
      route: "/compare",
      requiresLogin: true,
    },
    {
      icon: "support_agent",
      label: "Support",
      route: "/feedback",
      requiresLogin: false,
    },
  ];

  /* =======================================================
     CONSTRUCTOR
     ======================================================= */

  constructor(private readonly router: Router) {}

  /* =======================================================
     INIT
     ======================================================= */

  ngOnInit(): void {
    /*
     * This is a dedicated Guest User Layout.
     *
     * Do NOT:
     * - check authentication
     * - load current user
     * - call AuthService
     * - require an access token
     */

    this.userName = "Guest User";
    this.userRole = "GUEST";
  }

  /* =======================================================
     DISPLAY ROLE
     ======================================================= */

  get displayRole(): string {
    return "Guest User";
  }

  /* =======================================================
     SIDEBAR TOGGLE
     ======================================================= */

  toggleSidebar(): void {
    if (window.innerWidth <= 767) {
      this.mobileMenuOpen = !this.mobileMenuOpen;
      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  /* =======================================================
     OPEN MOBILE MENU
     ======================================================= */

  openMobileMenu(): void {
    this.mobileMenuOpen = true;
  }

  /* =======================================================
     CLOSE MOBILE MENU
     ======================================================= */

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  /* =======================================================
     WINDOW RESIZE
     ======================================================= */

  @HostListener("window:resize")
  onWindowResize(): void {
    if (window.innerWidth > 767) {
      this.mobileMenuOpen = false;
    }
  }

  /* =======================================================
     NAVIGATION
     ======================================================= */

  navigateToItem(item: GuestNavItem): void {
    if (item.requiresLogin) {
      this.requireLogin(item.label);
      return;
    }

    this.router.navigate([item.route]);
    this.closeMobileMenu();
  }

  /* =======================================================
     REQUIRE LOGIN
     ======================================================= */

  requireLogin(feature: string): void {
    this.loginMessage = `${feature} requires you to login first.`;
    this.showLoginMessage = true;
    this.closeMobileMenu();
  }

  /* =======================================================
     CLOSE LOGIN MESSAGE
     ======================================================= */

  closeLoginMessage(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
  }

  /* =======================================================
     GO TO LOGIN
     ======================================================= */

  goToLogin(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
    this.closeMobileMenu();

    this.router.navigate(["/auth/login"]);
  }

  /* =======================================================
     GO TO SIGN UP
     ======================================================= */

  goToSignup(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
    this.closeMobileMenu();

    this.router.navigate(["/auth/signup"]);
  }

  /* =======================================================
     SEARCH
     ======================================================= */

  performSearch(): void {
    const query = this.searchText.trim();

    if (!query) {
      return;
    }

    /*
     * Guests can search schemes.
     */

    this.router.navigate(["/schemes"], {
      queryParams: {
        q: query,
      },
    });

    this.closeMobileMenu();
  }

  /* =======================================================
     CLEAR SEARCH
     ======================================================= */

  clearSearch(): void {
    this.searchText = "";
  }

  /* =======================================================
     GO TO GUEST DASHBOARD
     ======================================================= */

  goToDashboard(): void {
    /*
     * Guest dashboard is /dashboard/guest
     *
     * NOT /dashboard/citizen
     */

    this.router.navigate(["/dashboard/guest"]);
    this.closeMobileMenu();
  }
}
