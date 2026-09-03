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
  value: number;
  label: string;
  sub?: string;
}

// =========================================================
// SCHEME
// =========================================================

export interface SchemeItem {
  name: string;
  ministry: string;
}

// =========================================================
// POLICY
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
// USER DASHBOARD COMPONENT
// =========================================================

@Component({
  selector: "app-user-dashboard",

  standalone: true,

  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],

  templateUrl: "./user-dashboard.component.html",

  styleUrl: "./user-dashboard.component.scss",
})
export class UserDashboardComponent implements OnInit {
  // =======================================================
  // USER INFORMATION
  // =======================================================

  user: AuthUser | null = null;

  userName = "User Name";

  /*
   * IMPORTANT:
   * Keep the ORIGINAL backend role here.
   *
   * Example:
   * RESEARCHER
   * ORGANIZATION
   * GUEST
   * CITIZEN
   */
  userRole = "GUEST";

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
  // NAVIGATION
  // =======================================================

  navItems: NavItem[] = [
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
  // DASHBOARD TITLE
  // =======================================================

  get dashboardTitle(): string {
    const role = (this.userRole || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    switch (role) {
      // -----------------------------------------------
      // RESEARCHER
      // -----------------------------------------------

      case "RESEARCHER":
        return "RESEARCHER DASHBOARD";

      // -----------------------------------------------
      // ORGANIZATION
      // -----------------------------------------------

      case "ORGANIZATION":
      case "ORGANISATION":
        return "ORGANIZATION DASHBOARD";

      // -----------------------------------------------
      // GUEST
      // -----------------------------------------------

      case "GUEST":
      case "GUEST_USER":
      case "GUESTUSER":
        return "GUEST USER";

      // -----------------------------------------------
      // CITIZEN
      // -----------------------------------------------

      case "CITIZEN":
        return "CITIZEN DASHBOARD";

      // -----------------------------------------------
      // GOVERNMENT
      // -----------------------------------------------

      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT_OFFICER":
      case "GOVERNMENT":
        return "GOVERNMENT DASHBOARD";

      // -----------------------------------------------
      // ADMIN
      // -----------------------------------------------

      case "ADMIN":
      case "ADMINISTRATOR":
        return "ADMIN DASHBOARD";

      // -----------------------------------------------
      // DEFAULT
      // -----------------------------------------------

      default:
        return "USER DASHBOARD";
    }
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
    // GET FRESH USER FROM BACKEND
    // =====================================================

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          this.loadingUser = false;

          return;
        }

        // Save complete user
        this.user = user;

        // Update UI
        this.setUserDetails(user);

        this.loadingUser = false;

        this.cdr.detectChanges();

        console.log("CURRENT LOGGED-IN USER:", user);

        console.log("CURRENT USER ROLE:", this.userRole);

        console.log("DASHBOARD TITLE:", this.dashboardTitle);
      },

      error: (error: any) => {
        this.loadingUser = false;

        console.error("GET CURRENT USER ERROR:", error);

        // =================================================
        // TOKEN INVALID / EXPIRED
        // =================================================

        if (error?.status === 401 || error?.status === 403) {
          this.authService.logout();

          this.router.navigate(["/auth/login"], {
            replaceUrl: true,
          });

          return;
        }

        // =================================================
        // TEMPORARY SERVER ERROR
        // =================================================

        this.cdr.detectChanges();
      },
    });
  }

  // =======================================================
  // SET USER DETAILS
  // =======================================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    // User name
    this.userName = user.full_name?.trim() || "User Name";

    /*
     * VERY IMPORTANT
     *
     * Do NOT use formatRole() here.
     *
     * We need the original role:
     *
     * RESEARCHER
     * ORGANIZATION
     * GUEST
     * CITIZEN
     */
    this.userRole = user.role?.trim().toUpperCase() || "GUEST";

    this.userEmail = user.email || "";

    this.userPhone = user.phone || "";

    this.userState = user.state || "";

    this.userDistrict = user.district || "";

    this.userOccupation = user.occupation || "";

    this.userOrganization = user.organization || "";
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
  // RESIZE
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
  // =======================================================

  logout(): void {
    console.log("LOGGING OUT:", this.userName);

    this.authService.logout();

    this.user = null;

    this.userName = "User Name";

    this.userRole = "GUEST";

    this.userEmail = "";

    this.userPhone = "";

    this.userState = "";

    this.userDistrict = "";

    this.userOccupation = "";

    this.userOrganization = "";

    this.sidebarCollapsed = false;

    this.mobileMenuOpen = false;

    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }
}
