import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";

import { Auth, AuthUser } from "../../../../core/services/auth";

export interface StatCard {
  icon: string;
  color: "blue" | "orange" | "green" | "purple";
  value: number;
  label: string;
  sub?: string;
}

export interface SchemeItem {
  name: string;
  ministry: string;
}

export interface PolicyItem {
  name: string;
  ministry: string;
  savedOn: string;
}

export interface HistoryItem {
  name: string;
  filters: string;
}

export interface ApplicationItem {
  name: string;
  appId: string;
}

@Component({
  selector: "app-user-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: "./user-dashboard.component.html",
  styleUrl: "./user-dashboard.component.scss",
})
export class UserDashboardComponent implements OnInit {
  // =========================================================
  // USER
  // =========================================================

  user: AuthUser | null = null;

  userName = "User Name";
  userRole = "GUEST";

  loadingUser = true;

  // =========================================================
  // LOADING STATES
  // =========================================================

  loadingStats = false;
  loadingSchemes = false;
  loadingPolicies = false;
  loadingHistory = false;
  loadingApplications = false;

  // =========================================================
  // STATISTICS
  // =========================================================

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

  // =========================================================
  // ELIGIBLE SCHEMES
  // =========================================================

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

  // =========================================================
  // SAVED POLICIES
  // =========================================================

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

  // =========================================================
  // SEARCH HISTORY
  // =========================================================

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

  // =========================================================
  // APPLICATIONS
  // =========================================================

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

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(private authService: Auth) {}

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  // =========================================================
  // DASHBOARD TITLE
  // =========================================================

  get dashboardTitle(): string {
    const role = (this.userRole || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    switch (role) {
      case "RESEARCHER":
        return "RESEARCHER DASHBOARD";

      case "ORGANIZATION":
      case "ORGANISATION":
        return "ORGANIZATION DASHBOARD";

      case "GUEST":
      case "GUEST_USER":
      case "GUESTUSER":
        return "GUEST USER";

      case "CITIZEN":
        return "CITIZEN DASHBOARD";

      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT_OFFICER":
      case "GOVERNMENT":
        return "GOVERNMENT DASHBOARD";

      case "ADMIN":
      case "ADMINISTRATOR":
        return "ADMIN DASHBOARD";

      default:
        return "USER DASHBOARD";
    }
  }

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

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
      },

      error: (error) => {
        this.loadingUser = false;

        console.error("GET CURRENT USER ERROR:", error);

        if (error?.status === 401 || error?.status === 403) {
          this.authService.logout();
        }
      },
    });
  }

  // =========================================================
  // SET USER DETAILS
  // =========================================================

  private setUserDetails(user: AuthUser): void {
    this.user = user;

    this.userName = user.full_name?.trim() || "User Name";

    this.userRole = user.role?.trim().toUpperCase() || "GUEST";
  }
}
