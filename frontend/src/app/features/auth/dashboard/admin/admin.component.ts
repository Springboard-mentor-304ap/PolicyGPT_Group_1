import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";

// =========================================================
// STAT CARD
// =========================================================

export interface StatCard {
  label: string;
  value: number;
  sublabel: string;
  icon: string;
  color: "blue" | "orange" | "green" | "purple";
}

// =========================================================
// LIST ITEM
// =========================================================

export interface ListItem {
  id: number;
  title: string;
  ministry: string;
  icon?: string;
  iconClass?: string;
}

// =========================================================
// ADMIN DASHBOARD
// =========================================================

@Component({
  selector: "app-admin-dashboard",

  standalone: true,

  imports: [CommonModule, RouterLink],

  templateUrl: "./admin.component.html",

  styleUrl: "./admin.component.scss",
})
export class AdminComponent {
  // =======================================================
  // LOGGED-IN USER
  // =======================================================

  userName = "Administrator";

  // =======================================================
  // STATISTICS
  // =======================================================

  statCards: StatCard[] = [
    {
      label: "Total Policies",
      value: 1242,
      sublabel: "+32 this week",
      icon: "policy",
      color: "blue",
    },

    {
      label: "Total Schemes",
      value: 897,
      sublabel: "+18 this week",
      icon: "article",
      color: "orange",
    },

    {
      label: "Total Users",
      value: 432,
      sublabel: "+2,154 this week",
      icon: "groups",
      color: "green",
    },

    {
      label: "Applications",
      value: 321,
      sublabel: "+61 this week",
      icon: "assignment",
      color: "purple",
    },
  ];

  // =======================================================
  // SCHEMES
  // =======================================================

  schemes: ListItem[] = [
    {
      id: 1,
      title: "PM Surya Ghar Muft Bijli Yojana",
      ministry: "Ministry of New & Renewable Energy",
      icon: "wb_sunny",
      iconClass: "sun",
    },

    {
      id: 2,
      title: "Pradhan Mantri Jan Arogya Yojana (PM-JAY)",
      ministry: "Ministry of Health & Family Welfare",
      icon: "health_and_safety",
      iconClass: "health",
    },

    {
      id: 3,
      title: "PM Vishwakarma Yojana",
      ministry: "Ministry of Micro, Small & Medium Enterprises",
      icon: "engineering",
      iconClass: "work",
    },

    {
      id: 4,
      title: "Post Matric Scholarship Scheme",
      ministry: "Ministry of Health & Family Welfare",
      icon: "school",
      iconClass: "edu",
    },
  ];

  // =======================================================
  // POLICIES
  // =======================================================

  policies: ListItem[] = [
    {
      id: 1,
      title: "National Education Policy 2020",
      ministry: "Ministry of Education",
    },

    {
      id: 2,
      title: "Ayushman Bharat Policy",
      ministry: "Ministry of Health & Family Welfare",
    },

    {
      id: 3,
      title: "Electricity Act, 2003",
      ministry: "Ministry of Power",
    },
  ];
}
