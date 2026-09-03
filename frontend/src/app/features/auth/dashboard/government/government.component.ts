import { Component, OnInit, ChangeDetectorRef, inject } from "@angular/core";

import { CommonModule } from "@angular/common";

import { FormsModule } from "@angular/forms";

import { Router, RouterLink, RouterLinkActive } from "@angular/router";

import { Auth } from "../../../../core/services/auth";

import { LogoutConfirmComponent } from "../../../../shared/components/logout-confirm/logout-confirm.component";

// =========================================================
// NAVIGATION ITEM
// =========================================================

export interface NavItem {
  icon: string;
  label: string;
  route?: string;
  children?: NavItem[];
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
// GOVERNMENT COMPONENT
// =========================================================

@Component({
  selector: "app-government",

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    LogoutConfirmComponent,
  ],

  templateUrl: "./government.component.html",

  styleUrl: "./government.component.scss",
})
export class GovernmentComponent implements OnInit {
  // =======================================================
  // SERVICES
  // =======================================================

  private cdr = inject(ChangeDetectorRef);

  private router = inject(Router);

  private authService = inject(Auth);

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
  // LOADING STATES
  // =======================================================

  loadingStats = true;

  loadingUpcoming = true;

  loadingUploaded = true;

  loadingHistory = true;

  loadingApplications = true;

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
  // STATISTICS
  // =======================================================

  statCards: StatCard[] = [
    {
      icon: "description",
      color: "blue",
      value: null,
      label: "Total Policies",
    },

    {
      icon: "account_balance",
      color: "orange",
      value: null,
      label: "Total Schemes",
    },

    {
      icon: "group",
      color: "green",
      value: null,
      label: "Total Users",
    },

    {
      icon: "assignment",
      color: "purple",
      value: null,
      label: "Applications",
    },
  ];

  // =======================================================
  // DASHBOARD DATA
  // =======================================================

  upcomingSchemes: SchemeItem[] = [];

  uploadedPolicies: PolicyItem[] = [];

  searchHistory: HistoryItem[] = [];

  applications: ApplicationItem[] = [];

  // =======================================================
  // INITIALIZATION
  // =======================================================

  ngOnInit(): void {
    // =====================================================
    // LOAD USER
    // =====================================================

    this.loadUser();

    // =====================================================
    // STATISTICS
    // =====================================================

    setTimeout(() => {
      this.statCards = [
        {
          icon: "description",
          color: "blue",
          value: 245,
          label: "Total Policies",
          sub: "+12 this month",
        },

        {
          icon: "account_balance",
          color: "orange",
          value: 987,
          label: "Total Schemes",
          sub: "+34 this month",
        },

        {
          icon: "group",
          color: "green",
          value: 15234,
          label: "Total Users",
          sub: "+820 this month",
        },

        {
          icon: "assignment",
          color: "purple",
          value: 58,
          label: "Applications",
          sub: "Pending review",
        },
      ];

      this.loadingStats = false;

      this.cdr.detectChanges();
    }, 700);

    // =====================================================
    // UPCOMING SCHEMES
    // =====================================================

    setTimeout(() => {
      this.upcomingSchemes = [
        {
          name: "Electric Vehicle Rebate 2026",
          ministry: "Ministry of New & Renewable Energy",
        },

        {
          name: "PM Vishwakarma Yojana (Phase-JAY 2)",
          ministry: "Ministry of Micro, Small & Medium Enterprises",
        },

        {
          name: "Post Matric Scholarship Scheme",
          ministry: "Ministry of Health & Family Welfare",
        },
      ];

      this.loadingUpcoming = false;

      this.cdr.detectChanges();
    }, 900);

    // =====================================================
    // UPLOADED POLICIES
    // =====================================================

    setTimeout(() => {
      this.uploadedPolicies = [
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

      this.loadingUploaded = false;

      this.cdr.detectChanges();
    }, 900);

    // =====================================================
    // SEARCH HISTORY
    // =====================================================

    setTimeout(() => {
      this.searchHistory = [
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
      ];

      this.loadingHistory = false;

      this.cdr.detectChanges();
    }, 1100);

    // =====================================================
    // APPLICATIONS
    // =====================================================

    setTimeout(() => {
      this.applications = [
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

      this.loadingApplications = false;

      this.cdr.detectChanges();
    }, 1100);
  }

  // =======================================================
  // LOAD USER
  // =======================================================

  private loadUser(): void {
    const storedUser = this.authService.getStoredUser();

    // =====================================================
    // USE STORED USER
    // =====================================================

    if (storedUser) {
      this.userName = storedUser.full_name || "Government Official";

      this.userRole = storedUser.role || "GOVERNMENT OFFICIAL";
    }

    // =====================================================
    // CHECK TOKEN
    // =====================================================

    const token = this.authService.getToken();

    if (!token) {
      this.router.navigate(["/auth/login"], {
        replaceUrl: true,
      });

      return;
    }

    // =====================================================
    // GET CURRENT USER FROM BACKEND
    // =====================================================

    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        if (!user) {
          return;
        }

        this.userName = user.full_name || "Government Official";

        this.userRole = user.role || "GOVERNMENT OFFICIAL";

        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error("Unable to load current user:", error);

        // -----------------------------------------------
        // INVALID / EXPIRED TOKEN
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
  // CLOSE MOBILE MENU
  // =======================================================

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  // =======================================================
  // SEARCH
  // =======================================================

  performSearch(): void {
    const query = this.searchText.trim();

    if (!query) {
      return;
    }

    console.log("Government dashboard search:", query);

    this.router.navigate(["/schemes"], {
      queryParams: {
        q: query,
      },
    });
  }

  // =======================================================
  // LOGOUT
  // =======================================================

  logout(): void {
    // -----------------------------------------------
    // OPEN CONFIRMATION POPUP
    // -----------------------------------------------

    this.showLogoutModal = true;

    this.cdr.detectChanges();
  }

  // =======================================================
  // CONFIRM LOGOUT
  // YES BUTTON
  // =======================================================

  confirmLogout(): void {
    console.log("Government user confirmed logout");

    // -----------------------------------------------
    // CLOSE POPUP
    // -----------------------------------------------

    this.showLogoutModal = false;

    // -----------------------------------------------
    // LOGOUT USING AUTH SERVICE
    // -----------------------------------------------

    this.authService.logout();

    // -----------------------------------------------
    // RESET SIDEBAR
    // -----------------------------------------------

    this.mobileMenuOpen = false;

    this.sidebarCollapsed = false;

    // -----------------------------------------------
    // REDIRECT TO LOGIN
    // -----------------------------------------------

    this.router.navigate(["/auth/login"], {
      replaceUrl: true,
    });
  }

  // =======================================================
  // CANCEL LOGOUT
  // NO BUTTON
  // =======================================================

  cancelLogout(): void {
    console.log("Government user cancelled logout");

    // -----------------------------------------------
    // CLOSE POPUP
    // -----------------------------------------------

    this.showLogoutModal = false;

    this.cdr.detectChanges();
  }
}
