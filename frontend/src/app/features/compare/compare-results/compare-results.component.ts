import { CommonModule, Location } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import {
  PolicyService,
  Policy,
  PolicyComparison,
} from "../../../core/services/policy.services";

interface CompareItem {
  id: number;
  title: string;
  type: "Policy" | "Scheme";
  ministry: string;
  category: string;
  state: string;
  targetGroup: string;
}

@Component({
  selector: "app-compare-results",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./compare-results.component.html",
  styleUrl: "./compare-results.component.scss",
})
export class CompareResultsComponent implements OnInit {
  items: CompareItem[] = [];

  item1: CompareItem | null = null;
  item2: CompareItem | null = null;
  item3: CompareItem | null = null;

  policy1: Policy | null = null;
  policy2: Policy | null = null;

  loading = false;
  errorMessage = "";

  constructor(
    private location: Location,
    private router: Router,
    private route: ActivatedRoute,
    private policyService: PolicyService,
  ) {}

  ngOnInit(): void {
  console.log("COMPARE RESULTS INIT");

  const navigation = window.history.state;

  if (!navigation?.items || navigation.items.length < 2) {
    this.errorMessage = "Please select at least two policies to compare.";
    return;
  }

  this.items = navigation.items;
  this.item1 = navigation.items[0];
  this.item2 = navigation.items[1];

  if (navigation.items.length >= 3) {
    this.item3 = navigation.items[2];
  }

  console.log("Selected policies:", this.item1, this.item2);

  this.loadComparison();
}

  private loadComparison(): void {
    if (!this.item1 || !this.item2) {
      return;
    }

    this.loading = true;
    this.errorMessage = "";

    this.policyService
      .comparePolicies(this.item1.id, this.item2.id)
      .subscribe({
        next: (response: PolicyComparison) => {
          this.policy1 = response.policy_1;
          this.policy2 = response.policy_2;

          this.loading = false;
        },

        error: (error) => {
          console.error("Failed to compare policies:", error);

          this.errorMessage =
            error?.error?.detail ||
            "Failed to load policy comparison.";

          this.loading = false;
        },
      });
  }

  getPolicyValue(
    policy: Policy | null,
    property: keyof Policy,
  ): string {
    if (!policy) {
      return "-";
    }

    const value = policy[property];

    if (value === null || value === undefined || value === "") {
      return "-";
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "-";
      }

      return value.join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  getWebsite(policy: Policy | null): string {
    if (!policy) {
      return "";
    }

    return policy.source_url || policy.document_url || "";
  }

  getIconType(item: CompareItem | null): string {
    if (!item) {
      return "policy";
    }

    const title = item.title.toLowerCase();

    if (title.includes("education")) {
      return "education";
    }

    if (title.includes("health")) {
      return "health";
    }

    if (title.includes("agriculture")) {
      return "agriculture";
    }

    if (item.type === "Scheme") {
      return "scheme";
    }

    return "policy";
  }

  goBack(): void {
    this.location.back();
  }

  goToSelection(): void {
    this.router.navigate(["../"], {
      relativeTo: this.route,
    });
  }
}