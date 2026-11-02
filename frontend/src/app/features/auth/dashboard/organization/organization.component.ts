import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";

import { Auth, AuthUser } from "../../../../core/services/auth";

/* =========================================================
   STAT CARD
   ========================================================= */

export interface OrganizationStat {
  icon: string;

  color: "blue" | "orange" | "green" | "purple";

  value: number;

  label: string;

  sub?: string;
}

/* =========================================================
   RECENT ACTIVITY
   ========================================================= */

export interface OrganizationActivity {
  icon: string;

  type: "policy" | "scheme" | "comparison" | "insight";

  title: string;

  description: string;

  date: string;
}

/* =========================================================
   QUICK ACTION
   ========================================================= */

export interface OrganizationQuickAction {
  icon: string;

  title: string;

  description: string;

  route: string;
}

/* =========================================================
   SECTOR INSIGHT
   ========================================================= */

export interface SectorInsight {
  name: string;

  percentage: number;

  icon: string;
}

/* =========================================================
   SAVED ITEM
   ========================================================= */

export interface SavedOrganizationItem {
  type: "policy" | "scheme";

  name: string;

  ministry: string;

  savedOn: string;
}

/* =========================================================
   ORGANIZATION DASHBOARD
   ========================================================= */

@Component({
  selector: "app-organization",

  standalone: true,

  imports: [CommonModule],

  templateUrl: "./organization.component.html",

  styleUrl: "./organization.component.scss",
})
export class OrganizationComponent implements OnInit {
  /* =======================================================
     USER
     ======================================================= */

  user: AuthUser | null = null;

  userName = "Organization";

  userRole = "ORGANIZATION";

  loadingUser = true;

  /* =======================================================
     LOADING STATES
     ======================================================= */

  loadingStats = false;

  loadingActivity = false;

  loadingInsights = false;

  loadingSavedItems = false;

  /* =======================================================
     ORGANIZATION STATISTICS
     ======================================================= */

  organizationStats: OrganizationStat[] = [
    {
      icon: "policy",

      color: "blue",

      value: 248,

      label: "Policies Viewed",

      sub: "This month",
    },

    {
      icon: "account_balance",

      color: "orange",

      value: 126,

      label: "Schemes Explored",

      sub: "This month",
    },

    {
      icon: "bookmark",

      color: "green",

      value: 18,

      label: "Saved Items",

      sub: "Policies & schemes",
    },

    {
      icon: "compare_arrows",

      color: "purple",

      value: 32,

      label: "Comparisons",

      sub: "Completed",
    },
  ];

  /* =======================================================
     RECENT ORGANIZATION ACTIVITY
     ======================================================= */

  recentActivity: OrganizationActivity[] = [
    {
      icon: "policy",

      type: "policy",

      title: "National Education Policy 2020",

      description: "Ministry of Education",

      date: "Today, 10:30 AM",
    },

    {
      icon: "account_balance",

      type: "scheme",

      title: "PM Kisan Samman Nidhi",

      description: "Ministry of Agriculture & Farmers Welfare",

      date: "Yesterday, 4:15 PM",
    },

    {
      icon: "compare_arrows",

      type: "comparison",

      title: "Education Policy Comparison",

      description: "Compared 3 government policies",

      date: "Sep 4, 2026",
    },

    {
      icon: "analytics",

      type: "insight",

      title: "Healthcare Policy Analysis",

      description: "Sector-wise policy analysis",

      date: "Sep 3, 2026",
    },
  ];

  /* =======================================================
     QUICK RESEARCH / ORGANIZATION ACTIONS
     ======================================================= */

  quickActions: OrganizationQuickAction[] = [
    {
      icon: "manage_search",

      title: "Search Policies",

      description: "Find relevant government policies",

      route: "/policies",
    },

    {
      icon: "account_balance",

      title: "Search Schemes",

      description: "Explore government schemes",

      route: "/schemes",
    },

    {
      icon: "compare_arrows",

      title: "Compare Policies",

      description: "Compare policies and schemes",

      route: "/compare",
    },

    {
      icon: "analytics",

      title: "Organization Insights",

      description: "View policy and sector insights",

      route: "/analytics",
    },
  ];

  /* =======================================================
     SECTOR INSIGHTS
     ======================================================= */

  sectorInsights: SectorInsight[] = [
    {
      name: "Education",

      percentage: 42,

      icon: "school",
    },

    {
      name: "Healthcare",

      percentage: 27,

      icon: "local_hospital",
    },

    {
      name: "Agriculture",

      percentage: 18,

      icon: "agriculture",
    },

    {
      name: "Technology",

      percentage: 13,

      icon: "computer",
    },
  ];

  /* =======================================================
     SAVED ORGANIZATION ITEMS
     ======================================================= */

  savedItems: SavedOrganizationItem[] = [
    {
      type: "policy",

      name: "National Education Policy 2020",

      ministry: "Ministry of Education",

      savedOn: "Sep 4, 2026",
    },

    {
      type: "policy",

      name: "National Health Policy",

      ministry: "Ministry of Health & Family Welfare",

      savedOn: "Sep 3, 2026",
    },

    {
      type: "scheme",

      name: "PM Kisan Samman Nidhi",

      ministry: "Ministry of Agriculture & Farmers Welfare",

      savedOn: "Sep 2, 2026",
    },
  ];

  /* =======================================================
     CONSTRUCTOR
     ======================================================= */

  constructor(
    private readonly authService: Auth,

    private readonly router: Router,
  ) {}

  /* =======================================================
     INIT
     ======================================================= */

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  /* =======================================================
     DASHBOARD TITLE
     ======================================================= */

  get dashboardTitle(): string {
    return "ORGANIZATION DASHBOARD";
  }

  /* =======================================================
     DISPLAY ROLE
     ======================================================= */

  get displayRole(): string {
    return "Organization";
  }

  /* =======================================================
     LOAD CURRENT USER
     ======================================================= */

  private loadCurrentUser(): void {
    this.loadingUser = true;

    /* -----------------------------------------------------
       GET CACHED USER
       ----------------------------------------------------- */

    const cachedUser = this.authService.getStoredUser();

    if (cachedUser) {
      this.setUserDetails(cachedUser);

      this.loadingUser = false;
    }

    /* -----------------------------------------------------
       CHECK TOKEN
       ----------------------------------------------------- */

    const token = this.authService.getToken();

    if (!token) {
      this.loadingUser = false;

      this.authService.logout();

      this.router.navigate(["/auth/login"], {
        replaceUrl: true,
      });

      return;
    }

    /* -----------------------------------------------------
       GET CURRENT USER
       ----------------------------------------------------- */

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          this.loadingUser = false;

          return;
        }

        this.setUserDetails(user);

        this.loadingUser = false;
      },

      error: (error: unknown) => {
        this.loadingUser = false;

        console.error("GET CURRENT ORGANIZATION USER ERROR:", error);

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

  /* =======================================================
     SET USER DETAILS
     ======================================================= */

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    this.userName = user.full_name?.trim() || "Organization";

    this.userRole = user.role?.trim().toUpperCase() || "ORGANIZATION";
  }

  /* =======================================================
     NAVIGATION
     ======================================================= */

  navigateTo(route: string): void {
    if (!route) {
      return;
    }

    this.router.navigate([route]);
  }

  /* =======================================================
     SEARCH POLICIES
     ======================================================= */

  searchPolicies(): void {
    this.router.navigate(["/policies"]);
  }

  /* =======================================================
     SEARCH SCHEMES
     ======================================================= */

  searchSchemes(): void {
    this.router.navigate(["/schemes"]);
  }

  /* =======================================================
     COMPARE POLICIES
     ======================================================= */

  comparePolicies(): void {
    this.router.navigate(["/compare"]);
  }

  /* =======================================================
     ORGANIZATION INSIGHTS
     ======================================================= */

  viewInsights(): void {
    this.router.navigate(["/analytics"]);
  }

  /* =======================================================
     VIEW SAVED ITEMS
     ======================================================= */

  viewSavedItems(): void {
    this.router.navigate(["/saved"]);
  }

  /* =======================================================
     VIEW HISTORY
     ======================================================= */

  viewHistory(): void {
    this.router.navigate(["/history"]);
  }

  /* =======================================================
     VIEW NOTIFICATIONS
     ======================================================= */

  viewNotifications(): void {
    this.router.navigate(["/notifications"]);
  }

  /* =======================================================
     VIEW POLICY
     ======================================================= */

  viewPolicy(policyName: string): void {
    if (!policyName.trim()) {
      return;
    }

    this.router.navigate(["/policies"], {
      queryParams: {
        q: policyName,
      },
    });
  }

  /* =======================================================
     VIEW SCHEME
     ======================================================= */

  viewScheme(schemeName: string): void {
    if (!schemeName.trim()) {
      return;
    }

    this.router.navigate(["/schemes"], {
      queryParams: {
        q: schemeName,
      },
    });
  }

  /* =======================================================
     VIEW ACTIVITY
     ======================================================= */

  viewActivity(activity: OrganizationActivity): void {
    if (activity.type === "policy") {
      this.viewPolicy(activity.title);

      return;
    }

    if (activity.type === "scheme") {
      this.viewScheme(activity.title);

      return;
    }

    if (activity.type === "comparison") {
      this.comparePolicies();

      return;
    }

    if (activity.type === "insight") {
      this.viewInsights();
    }
  }

  /* =======================================================
     GET SECTOR BAR WIDTH
     ======================================================= */

  getSectorWidth(percentage: number): string {
    return `${percentage}%`;
  }

  /* =======================================================
     GET SAVED ITEM ICON
     ======================================================= */

  getSavedItemIcon(type: "policy" | "scheme"): string {
    return type === "policy" ? "policy" : "account_balance";
  }

  /* =======================================================
     GET SAVED ITEM ROUTE
     ======================================================= */

  getSavedItemRoute(type: "policy" | "scheme"): string {
    return type === "policy" ? "/policies" : "/schemes";
  }
}
