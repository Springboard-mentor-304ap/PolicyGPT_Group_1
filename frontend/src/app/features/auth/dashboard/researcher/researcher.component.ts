import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { Router } from "@angular/router";

interface ResearchStat {
  icon: string;
  value: string;
  label: string;
  description: string;
  type: "blue" | "orange" | "green" | "purple";
}

interface ResearchActivity {
  icon: string;
  title: string;
  description: string;
  date: string;
  type: "policy" | "scheme" | "compare" | "analytics";
}

interface QuickAction {
  icon: string;
  title: string;
  description: string;
  route: string;
}

@Component({
  selector: "app-researcher",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./researcher.component.html",
  styleUrl: "./researcher.component.scss",
})
export class ResearcherComponent {
  // =========================================================
  // RESEARCH STATISTICS
  // =========================================================

  researchStats: ResearchStat[] = [
    {
      icon: "policy",
      value: "248",
      label: "Policies Researched",
      description: "Across different sectors",
      type: "blue",
    },
    {
      icon: "account_balance",
      value: "126",
      label: "Schemes Analyzed",
      description: "Government schemes",
      type: "orange",
    },
    {
      icon: "bookmark",
      value: "18",
      label: "Saved Research",
      description: "Your saved items",
      type: "green",
    },
    {
      icon: "compare_arrows",
      value: "32",
      label: "Comparisons",
      description: "Policy comparisons",
      type: "purple",
    },
  ];

  // =========================================================
  // RECENT RESEARCH
  // =========================================================

  recentResearch: ResearchActivity[] = [
    {
      icon: "policy",
      title: "National Education Policy 2020",
      description: "Ministry of Education",
      date: "Today, 10:30 AM",
      type: "policy",
    },
    {
      icon: "account_balance",
      title: "PM Kisan Samman Nidhi",
      description: "Ministry of Agriculture & Farmers Welfare",
      date: "Yesterday, 4:15 PM",
      type: "scheme",
    },
    {
      icon: "compare_arrows",
      title: "Education Policy Comparison",
      description: "Compared 3 policies",
      date: "Sep 4, 2026",
      type: "compare",
    },
    {
      icon: "analytics",
      title: "Healthcare Policy Analysis",
      description: "Sector-wise research",
      date: "Sep 3, 2026",
      type: "analytics",
    },
  ];

  // =========================================================
  // QUICK ACTIONS
  // =========================================================

  quickActions: QuickAction[] = [
    {
      icon: "search",
      title: "Search Policies",
      description: "Find government policies",
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
      description: "Compare multiple policies",
      route: "/compare",
    },
    {
      icon: "analytics",
      title: "View Analytics",
      description: "Explore policy insights",
      route: "/analytics",
    },
  ];

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(private readonly router: Router) {}

  // =========================================================
  // NAVIGATION
  // =========================================================

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  // =========================================================
  // SEARCH
  // =========================================================

  searchPolicies(): void {
    this.router.navigate(["/policies"]);
  }

  searchSchemes(): void {
    this.router.navigate(["/schemes"]);
  }

  // =========================================================
  // VIEW ALL RESEARCH
  // =========================================================

  viewAllResearch(): void {
    this.router.navigate(["/history"]);
  }

  // =========================================================
  // VIEW SAVED RESEARCH
  // =========================================================

  viewSavedResearch(): void {
    this.router.navigate(["/saved"]);
  }

  // =========================================================
  // VIEW ANALYTICS
  // =========================================================

  viewAnalytics(): void {
    this.router.navigate(["/analytics"]);
  }
}
