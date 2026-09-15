import { Component, inject } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";

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
export class CompareSelectionComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  selectedItem1: CompareItem | null = null;
  selectedItem2: CompareItem | null = null;
  selectedItem3: CompareItem | null = null;

  searchItem1 = "";
  searchItem2 = "";
  searchItem3 = "";

  allItems: CompareItem[] = [
    // =======================================================
    // POLICIES
    // =======================================================

    {
      id: 1,
      title: "National Education Policy 2020",
      type: "Policy",
      ministry: "Ministry of Education",
      category: "Education",
      state: "Central",
      targetGroup: "Students",
    },

    {
      id: 2,
      title: "National Health Policy 2017",
      type: "Policy",
      ministry: "Ministry of Health & Family Welfare",
      category: "Health",
      state: "Central",
      targetGroup: "Citizens",
    },

    {
      id: 3,
      title: "National Policy on Skill Development and Entrepreneurship 2015",
      type: "Policy",
      ministry: "Ministry of Skill Development & Entrepreneurship",
      category: "Skill Development",
      state: "Central",
      targetGroup: "Youth & Entrepreneurs",
    },

    {
      id: 4,
      title: "National Agriculture Policy",
      type: "Policy",
      ministry: "Ministry of Agriculture & Farmers Welfare",
      category: "Agriculture",
      state: "Central",
      targetGroup: "Farmers",
    },

    // =======================================================
    // SCHEMES
    // =======================================================

    {
      id: 101,
      title: "PM Kisan Samman Nidhi",
      type: "Scheme",
      ministry: "Ministry of Agriculture & Farmers Welfare",
      category: "Agriculture",
      state: "Central",
      targetGroup: "Farmers",
    },

    {
      id: 102,
      title: "PM Surya Ghar Muft Bijli Yojana",
      type: "Scheme",
      ministry: "Ministry of New & Renewable Energy",
      category: "Energy",
      state: "Central",
      targetGroup: "Citizens",
    },

    {
      id: 103,
      title: "Post Matric Scholarship Scheme",
      type: "Scheme",
      ministry: "Ministry of Health & Family Welfare",
      category: "Education",
      state: "Central",
      targetGroup: "Students",
    },

    {
      id: 104,
      title: "PM Vishwakarma Yojana",
      type: "Scheme",
      ministry: "Ministry of Micro, Small & Medium Enterprises",
      category: "Skill Development",
      state: "Central",
      targetGroup: "Youth & Entrepreneurs",
    },

    {
      id: 105,
      title: "Pradhan Mantri Jan Arogya Yojana (PM-JAY)",
      type: "Scheme",
      ministry: "Ministry of Health & Family Welfare",
      category: "Health",
      state: "Central",
      targetGroup: "Citizens",
    },

    {
      id: 106,
      title: "Pradhan Mantri Jan Dhan Yojana",
      type: "Scheme",
      ministry: "Ministry of Finance",
      category: "Financial Services",
      state: "Central",
      targetGroup: "Citizens",
    },

    {
      id: 107,
      title: "Pradhan Mantri Awas Yojana",
      type: "Scheme",
      ministry: "Ministry of Housing and Urban Affairs",
      category: "Housing",
      state: "Central",
      targetGroup: "Citizens",
    },
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
