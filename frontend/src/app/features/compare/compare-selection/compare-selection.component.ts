import { Component, inject, OnInit } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { PolicyService, Policy, PolicyListResponse } from "../../../core/services/policy.services";
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
  selector: "app-compare-selection",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./compare-selection.component.html",
  styleUrls: ["./compare-selection.component.scss"],
})
export class CompareSelectionComponent implements OnInit {

  ngOnInit(): void {
  this.loadPolicies();
}

private loadPolicies(): void {
  this.policyService.getPolicies({
    status: "APPROVED"
  }).subscribe({
    next: (response: PolicyListResponse) => {
      this.allItems = response.policies.map((policy) => ({
        id: policy.policy_id,
        title: policy.title,
        type: "Policy",
        ministry: policy.ministry || "-",
        category: policy.category || "-",
        state: policy.state || "-",
        targetGroup: "-"
      }));
    },

    error: (error) => {
      console.error("Failed to load policies:", error);
    }
  });
}
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
private readonly policyService = inject(PolicyService);

  selectedItem1: CompareItem | null = null;
  selectedItem2: CompareItem | null = null;
  selectedItem3: CompareItem | null = null;

  searchItem1 = "";
  searchItem2 = "";
  searchItem3 = "";

  allItems: CompareItem[] = [
  ];

  get filteredItem1(): CompareItem[] {
    return this.filterItems(this.searchItem1);
  }

  get filteredItem2(): CompareItem[] {
    return this.filterItems(this.searchItem2);
  }

  get filteredItem3(): CompareItem[] {
    return this.filterItems(this.searchItem3);
  }

  private filterItems(search: string): CompareItem[] {
    const query = search.toLowerCase().trim();

    if (!query) {
      return this.allItems;
    }

    return this.allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.ministry.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query),
    );
  }

  selectItem1(item: CompareItem): void {
    this.selectedItem1 = item;
    this.searchItem1 = item.title;
  }

  selectItem2(item: CompareItem): void {
    this.selectedItem2 = item;
    this.searchItem2 = item.title;
  }

  selectItem3(item: CompareItem): void {
    this.selectedItem3 = item;
    this.searchItem3 = item.title;
  }

  clearItem1(): void {
    this.selectedItem1 = null;
    this.searchItem1 = "";
  }

  clearItem2(): void {
    this.selectedItem2 = null;
    this.searchItem2 = "";
  }

  clearItem3(): void {
    this.selectedItem3 = null;
    this.searchItem3 = "";
  }

  canCompare(): boolean {
    return !!this.selectedItem1 && !!this.selectedItem2;
  }

  compareNow(): void {
    if (!this.selectedItem1 || !this.selectedItem2) {
      return;
    }

    const items = [
      this.selectedItem1,
      this.selectedItem2,
      ...(this.selectedItem3 ? [this.selectedItem3] : []),
    ];

    // Navigate relative to:
    // /dashboard/{role}/compare
    //
    // Result:
    // /dashboard/{role}/compare/results
    this.router.navigate(["results"], {
      relativeTo: this.route,
      state: {
        items,
      },
    });
  }

  goBack(): void {
    this.location.back();
  }
}
