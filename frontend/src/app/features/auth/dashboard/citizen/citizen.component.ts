import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
} from "@angular/core";

import { CommonModule } from "@angular/common";

import { FormsModule } from "@angular/forms";

import { Router, RouterLink, RouterLinkActive } from "@angular/router";

import { Auth, AuthUser } from "../../../../core/services/auth";

import { LogoutConfirmComponent } from "../../../../shared/components/logout-confirm/logout-confirm.component";

// =========================================================
// NAVIGATION ITEM
// =========================================================

export interface NavItem {
  icon: string;
  label: string;
  route?: string;

  children?: {
    label: string;
    route: string;
  }[];

  expanded?: boolean;
}

// =========================================================
// STAT CARD
// =========================================================

export interface StatCard {
  icon: string;

  color: "blue" | "orange" | "green" | "purple";

  value: number | null;

  label: string;

  sub?: string;
}

// =========================================================
// SCHEME ITEM
// =========================================================

export interface SchemeItem {
  name: string;
  ministry: string;
}

// =========================================================
// POLICY ITEM
// =========================================================

export interface PolicyItem {
  name: string;
  ministry: string;
  savedOn: string;
}

// =========================================================
// SEARCH HISTORY
// =========================================================

export interface HistoryItem {
  name: string;
  filters: string;
}

// =========================================================
// APPLICATION
// =========================================================

export interface ApplicationItem {
  name: string;
  appId: string;
}

// =========================================================
// CITIZEN COMPONENT
// =========================================================

@Component({
  selector: "app-citizen",

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,

    // Logout confirmation popup
    LogoutConfirmComponent,
  ],

  templateUrl: "./citizen.component.html",

  styleUrl: "./citizen.component.scss",
})
export class CitizenComponent implements OnInit {
  // =======================================================
  // USER INFORMATION
  // =======================================================

  user: AuthUser | null = null;

  userName = "User Name";

  userRole = "Citizen";

  userEmail = "";

  userPhone = "";

  userState = "";

  userDistrict = "";

  userOccupation = "";

  userOrganization = "";

  loadingUser = true;

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
  // LOADING STATES
  // =======================================================

  loadingStats = false;

  loadingSchemes = false;

  loadingPolicies = false;

  loadingHistory = false;

  loadingApplications = false;

  // =======================================================
  // LOGOUT MODAL
  // =======================================================

  showLogoutModal = false;

  // =======================================================
  // NAVIGATION
  // =======================================================

  navItems: NavItem[] = [
    {
      icon: "home",
      label: "Dashboard",
      route: "/dashboard/citizen",
    },

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
  // STATISTICS
  // =======================================================

  statCards: StatCard[] = [
    {
      icon: "search",
      color: "blue",
      value: 12,
      label: "Searches This Month",
      sub: "+20% from last month",
    },

    {
      icon: "bookmark",
      color: "orange",
      value: 8,
      label: "Saved Items",
      sub: "Policies & Schemes",
    },

    {
      icon: "fact_check",
      color: "green",
      value: 10,
      label: "Eligible Schemes",
      sub: "Based on your profile",
    },

    {
      icon: "description",
      color: "purple",
      value: 3,
      label: "Applications",
      sub: "In progress",
    },
  ];

  // =======================================================
  // ELIGIBLE SCHEMES
  // =======================================================

  eligibleSchemes: SchemeItem[] = [
    {
      name: "PM Kisan Samman Nidhi",
      ministry: "Ministry of Agriculture & Farmers Welfare",
    },

    {
      name: "PM Surya Ghar Muft Bijli Yojana",
      ministry: "Ministry of New & Renewable Energy",
    },

    {
      name: "Post Matric Scholarship Scheme",
      ministry: "Ministry of Health & Family Welfare",
    },

    {
      name: "PM Vishwakarma Yojana",
      ministry: "Ministry of Micro, Small & Medium Enterprises",
    },
  ];

  // =======================================================
  // SAVED POLICIES
  // =======================================================

  savedPolicies: PolicyItem[] = [
    {
      name: "National Education Policy 2020",
      ministry: "Ministry of Education",
      savedOn: "20 May 2026",
    },

    {
      name: "Ayushman Bharat Policy",
      ministry: "Ministry of Health & Family Welfare",
      savedOn: "18 May 2026",
    },

    {
      name: "Electricity Act, 2003",
      ministry: "Ministry of Power",
      savedOn: "15 May 2025",
    },
  ];

  // =======================================================
  // SEARCH HISTORY
  // =======================================================

  searchHistory: HistoryItem[] = [
    {
      name: "Ayushman Bharat",
      filters: "Scheme • Health",
    },

    {
      name: "Scholarship for students",
      filters: "Scheme • Education • Central",
    },

    {
      name: "Solar energy scheme",
      filters: "Scheme • Renewable Energy",
    },

    {
      name: "Pension schemes for senior citizens",
      filters: "Scheme • Social Welfare",
    },
  ];

  // =======================================================
  // APPLICATIONS
  // =======================================================

  applications: ApplicationItem[] = [
    {
      name: "PM Kisan Samman Nidhi",
      appId: "APP1234567890",
    },

    {
      name: "Post Matric Scholarship Scheme",
      appId: "APP1234567889",
    },

    {
      name: "PM Awas Yojana (Gramin)",
      appId: "APP1234567888",
    },
  ];

  // =======================================================
  // CONSTRUCTOR
  // =======================================================

  constructor(
    private router: Router,

    private authService: Auth,

    private cdr: ChangeDetectorRef,
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
    this.loadingUser = true;

    // =====================================================
    // FIRST: LOAD CACHED USER
    // =====================================================

    const cachedUser = this.authService.getStoredUser();

    if (cachedUser) {
      this.setUserDetails(cachedUser);

      this.loadingUser = false;

      this.cdr.detectChanges();
    }

    // =====================================================
    // CHECK TOKEN
    // =====================================================

    const token = this.authService.getToken();

    if (!token) {
      this.authService.logout();

      this.router.navigate(["/auth/login"], {
        replaceUrl: true,
      });

      return;
    }

    // =====================================================
    // GET FRESH USER
    // =====================================================

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          this.loadingUser = false;

          return;
        }

        this.user = user;

        this.setUserDetails(user);

        this.loadingUser = false;

        this.cdr.detectChanges();

        console.log("CURRENT LOGGED-IN USER:", user);
      },

      error: (error: any) => {
        this.loadingUser = false;

        console.error("GET CURRENT USER ERROR:", error);

        // ===============================================
        // INVALID TOKEN
        // ===============================================

        if (error?.status === 401 || error?.status === 403) {
          this.authService.logout();

          this.router.navigate(["/auth/login"], {
            replaceUrl: true,
          });

          return;
        }

        this.cdr.detectChanges();
      },
    });
  }

  // =======================================================
  // SET USER DETAILS
  // =======================================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    this.userName = user.full_name?.trim() || "User Name";

    this.userRole = this.formatRole(user.role);

    this.userEmail = user.email || "";

    this.userPhone = user.phone || "";

    this.userState = user.state || "";

    this.userDistrict = user.district || "";

    this.userOccupation = user.occupation || "";

    this.userOrganization = user.organization || "";
  }

  // =======================================================
  // FORMAT ROLE
  // =======================================================

  private formatRole(role: string): string {
    if (!role) {
      return "Citizen";
    }

    return role
      .trim()
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (character: string) => character.toUpperCase());
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
  }

  // =======================================================
  // CLEAR SEARCH
  // =======================================================

  clearSearch(): void {
    this.searchText = "";
  }

  // =======================================================
  // LOGOUT
  // OPEN CONFIRMATION POPUP
  // =======================================================

  logout(): void {
    console.log("Logout confirmation opened");

    this.showLogoutModal = true;

    this.cdr.detectChanges();
  }

  // =======================================================
  // CONFIRM LOGOUT
  // YES BUTTON
  // =======================================================

  confirmLogout(): void {
    console.log("User confirmed logout");

    // -----------------------------------------------------
    // CLOSE POPUP
    // -----------------------------------------------------

    this.showLogoutModal = false;

    // -----------------------------------------------------
    // CLEAR AUTHENTICATION
    // -----------------------------------------------------

    this.authService.logout();

    // -----------------------------------------------------
    // CLEAR USER DATA
    // -----------------------------------------------------

    this.user = null;

    this.userName = "User Name";

    this.userRole = "Citizen";

    this.userEmail = "";

    this.userPhone = "";

    this.userState = "";

    this.userDistrict = "";

    this.userOccupation = "";

    this.userOrganization = "";

    // -----------------------------------------------------
    // RESET SIDEBAR
    // -----------------------------------------------------

    this.sidebarCollapsed = false;

    this.mobileMenuOpen = false;

    // -----------------------------------------------------
    // GO TO LOGIN
    // -----------------------------------------------------

    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  // =======================================================
  // CANCEL LOGOUT
  // NO BUTTON
  // =======================================================

  cancelLogout(): void {
    console.log("Logout cancelled");

    this.showLogoutModal = false;

    this.cdr.detectChanges();
  }
}
