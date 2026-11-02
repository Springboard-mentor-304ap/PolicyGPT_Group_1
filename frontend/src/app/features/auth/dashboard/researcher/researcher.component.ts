import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";

/* =========================================================
   TYPES
   ========================================================= */

interface ResearchStat {
  icon: string;
  value: string;
  label: string;
  description: string;
  type: "blue" | "orange" | "green" | "purple";
}

interface ResearchItem {
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

/* =========================================================
   COMPONENT
   ========================================================= */

@Component({
  selector: "app-researcher",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./researcher.component.html",
  styleUrls: ["./researcher.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearcherComponent {
  /* =======================================================
     SERVICES
     ======================================================= */

  private readonly router = inject(Router);

  /* =======================================================
     RESEARCH STATISTICS
     ======================================================= */

  readonly researchStats: ResearchStat[] = [
    {
      icon: "policy",
      value: "128",
      label: "Policies Researched",
      description: "Across government departments",
      type: "blue",
    },
    {
      icon: "account_balance",
      value: "64",
      label: "Schemes Explored",
      description: "Central and state schemes",
      type: "orange",
    },
    {
      icon: "compare_arrows",
      value: "18",
      label: "Comparisons",
      description: "Policy comparisons completed",
      type: "green",
    },
    {
      icon: "bookmark",
      value: "32",
      label: "Saved Research",
      description: "Saved for later reference",
      type: "purple",
    },
  ];

  /* =======================================================
     RECENT RESEARCH
     ======================================================= */

  readonly recentResearch: ResearchItem[] = [
    {
      icon: "policy",
      title: "Digital India Policy Review",
      description:
        "Reviewed objectives, eligibility and implementation details.",
      date: "Today",
      type: "policy",
    },
    {
      icon: "account_balance",
      title: "PM-KISAN Scheme Analysis",
      description: "Explored eligibility, benefits and application process.",
      date: "Yesterday",
      type: "scheme",
    },
    {
      icon: "compare_arrows",
      title: "Education Policy Comparison",
      description: "Compared major provisions across selected policies.",
      date: "2 days ago",
      type: "compare",
    },
    {
      icon: "analytics",
      title: "Policy Trend Analysis",
      description: "Analyzed recent policy activity and sector trends.",
      date: "5 days ago",
      type: "analytics",
    },
  ];

  /* =======================================================
     QUICK ACTIONS
     ======================================================= */

  readonly quickActions: QuickAction[] = [
    {
      icon: "search",
      title: "Search Policies",
      description: "Find government policies by keyword or category.",
      route: "/policies",
    },
    {
      icon: "account_balance",
      title: "Explore Schemes",
      description: "Discover government schemes and their benefits.",
      route: "/schemes",
    },
    {
      icon: "compare_arrows",
      title: "Compare Policies",
      description: "Compare policies side by side.",
      route: "/compare",
    },
    {
      icon: "analytics",
      title: "View Analytics",
      description: "Explore policy trends and research insights.",
      route: "/analytics",
    },
  ];

  /* =======================================================
     SEARCH POLICIES
     ======================================================= */

  searchPolicies(): void {
    this.navigateTo("/policies");
  }

  /* =======================================================
     SEARCH SCHEMES
     ======================================================= */

  searchSchemes(): void {
    this.navigateTo("/schemes");
  }

  /* =======================================================
     VIEW ALL RESEARCH
     ======================================================= */

  viewAllResearch(): void {
    this.navigateTo("/research");
  }

  /* =======================================================
     VIEW ANALYTICS
     ======================================================= */

  viewAnalytics(): void {
    this.navigateTo("/analytics");
  }

  /* =======================================================
     VIEW SAVED RESEARCH
     ======================================================= */

  viewSavedResearch(): void {
    this.navigateTo("/research/saved");
  }

  /* =======================================================
     GENERIC NAVIGATION
     ======================================================= */

  navigateTo(route: string): void {
    if (!route || route === "#") {
      return;
    }

    this.router.navigateByUrl(route).catch((error: unknown) => {
      console.error(`Unable to navigate to ${route}:`, error);
    });
  }
}
