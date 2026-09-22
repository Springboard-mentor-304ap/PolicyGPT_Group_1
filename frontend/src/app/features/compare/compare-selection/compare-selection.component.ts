import { Component, inject, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import {
  Subject,
  takeUntil,
  forkJoin,
  debounceTime,
  distinctUntilChanged,
} from "rxjs";

import { PolicyService } from "../../../core/services/policy.services";
import { SchemeService } from "../../../core/services/scheme.service";
import {
  PolicyResponse,
  PolicyListResponse,
} from "../../../core/models/policy.model";
import {
  SchemeResponse,
  SchemeListResponse,
} from "../../../core/models/scheme.model";

interface CompareItem {
  id: number;
  title: string;
  type: "Policy" | "Scheme";
  ministry: string;
  category: string;
  state: string;
  targetGroup: string;
}

interface FilterOptions {
  selectedCategory: string;
  selectedMinistry: string;
  selectedState: string;
  selectedStatus: string;
}

@Component({
  selector: "app-compare-selection",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./compare-selection.component.html",
  styleUrls: ["./compare-selection.component.scss"],
})
export class CompareSelectionComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);

  selectedItem1: CompareItem | null = null;
  selectedItem2: CompareItem | null = null;
  selectedItem3: CompareItem | null = null;

  searchItem1 = "";
  searchItem2 = "";
  searchItem3 = "";

  // Filter options - same as search components
  filterItem1: FilterOptions = {
    selectedCategory: "",
    selectedMinistry: "",
    selectedState: "",
    selectedStatus: "",
  };
  filterItem2: FilterOptions = {
    selectedCategory: "",
    selectedMinistry: "",
    selectedState: "",
    selectedStatus: "",
  };
  filterItem3: FilterOptions = {
    selectedCategory: "",
    selectedMinistry: "",
    selectedState: "",
    selectedStatus: "",
  };

  allItems: CompareItem[] = [];
  filteredItemsCache: CompareItem[] = [];
  loading = false;
  errorMessage = "";

  // Filter option arrays (matching search components)
  categories: string[] = [
    "Agriculture",
    "Education",
    "Energy",
    "Financial Services",
    "Health",
    "Healthcare",
    "Housing",
    "Infrastructure",
    "Rural Development",
    "Urban Development",
    "Social Welfare",
    "Women & Child Welfare",
    "Employment",
    "Skill Development",
    "Environment",
    "Digital Governance",
  ];

  ministries: string[] = [
    "Ministry of Agriculture & Farmers Welfare",
    "Ministry of Health & Family Welfare",
    "Ministry of Education",
    "Ministry of Finance",
    "Ministry of Housing and Urban Affairs",
    "Ministry of New & Renewable Energy",
    "Ministry of Micro, Small & Medium Enterprises",
    "Ministry of Rural Development",
    "Ministry of Skill Development & Entrepreneurship",
    "Ministry of Women and Child Development",
    "Ministry of Social Justice and Empowerment",
    "Ministry of Labour and Employment",
    "Ministry of Environment, Forest and Climate Change",
    "Ministry of Electronics and Information Technology",
  ];

  states: string[] = [
    "Central",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
  ];

  statuses: string[] = [
    "APPROVED",
    "DRAFT",
    "PENDING_APPROVAL",
    "REJECTED",
    "ARCHIVED",
    "ARCHIVE_REQUESTED",
    "DELETE_REQUESTED",
  ];

  private searchSubject1 = new Subject<string>();
  private searchSubject2 = new Subject<string>();
  private searchSubject3 = new Subject<string>();

  ngOnInit(): void {
    this.setupDebouncedSearch();
    this.loadAllItems();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupDebouncedSearch(): void {
    this.searchSubject1
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.applyFilters(1));

    this.searchSubject2
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.applyFilters(2));

    this.searchSubject3
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.applyFilters(3));
  }

  onSearchChange(itemNum: number): void {
    if (itemNum === 1) this.searchSubject1.next(this.searchItem1);
    else if (itemNum === 2) this.searchSubject2.next(this.searchItem2);
    else this.searchSubject3.next(this.searchItem3);
  }

  loadAllItems(): void {
    this.loading = true;
    this.errorMessage = "";

    forkJoin({
      policies: this.policyService.getPolicies({
        status: "APPROVED",
        limit: 100,
      }),
      schemes: this.schemeService.getSchemes({
        status: "APPROVED",
        limit: 100,
      }),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ policies, schemes }) => {
          const policyItems: CompareItem[] = (policies.policies || []).map(
            (policy: PolicyResponse) => ({
              id: policy.policy_id,
              title: policy.title,
              type: "Policy" as const,
              ministry: policy.ministry || "-",
              category: policy.category || "-",
              state: policy.state || "-",
              targetGroup: "-",
            }),
          );

          const schemeItems: CompareItem[] = (schemes.schemes || []).map(
            (scheme: SchemeResponse) => ({
              id: scheme.scheme_id,
              title: scheme.name,
              type: "Scheme" as const,
              ministry: scheme.ministry || "-",
              category: scheme.category || "-",
              state: scheme.state || "-",
              targetGroup: "-",
            }),
          );

          this.allItems = [...policyItems, ...schemeItems];
          this.filteredItemsCache = [...this.allItems];
          this.loading = false;
        },
        error: (error) => {
          console.error("Failed to load items for comparison:", error);
          this.errorMessage =
            "Failed to load items for comparison. Please try again.";
          this.loading = false;
        },
      });
  }

  get filteredItem1(): CompareItem[] {
    return this.getFilteredItems(this.searchItem1, this.filterItem1);
  }

  get filteredItem2(): CompareItem[] {
    return this.getFilteredItems(this.searchItem2, this.filterItem2);
  }

  get filteredItem3(): CompareItem[] {
    return this.getFilteredItems(this.searchItem3, this.filterItem3);
  }

  private getFilteredItems(
    search: string,
    filters: FilterOptions,
  ): CompareItem[] {
    let items = [...this.allItems];
    const query = search.toLowerCase().trim();

    // Text search
    if (query) {
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.type.toLowerCase().includes(query) ||
          item.ministry.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          item.state.toLowerCase().includes(query),
      );
    }

    // Category filter
    if (filters.selectedCategory) {
      items = items.filter(
        (item) => item.category === filters.selectedCategory,
      );
    }

    // Ministry filter
    if (filters.selectedMinistry) {
      items = items.filter(
        (item) => item.ministry === filters.selectedMinistry,
      );
    }

    // State filter
    if (filters.selectedState) {
      items = items.filter((item) => item.state === filters.selectedState);
    }

    // Status filter - we only load APPROVED items, but keeping for consistency
    if (filters.selectedStatus && filters.selectedStatus !== "APPROVED") {
      items = []; // No items will match since we only loaded APPROVED
    }

    return items;
  }

  applyFilters(itemNum: number): void {
    // Triggered by filter dropdown changes
    // The getters will automatically apply filters
  }

  clearFilters(itemNum: number): void {
    if (itemNum === 1) {
      this.filterItem1 = {
        selectedCategory: "",
        selectedMinistry: "",
        selectedState: "",
        selectedStatus: "",
      };
    } else if (itemNum === 2) {
      this.filterItem2 = {
        selectedCategory: "",
        selectedMinistry: "",
        selectedState: "",
        selectedStatus: "",
      };
    } else {
      this.filterItem3 = {
        selectedCategory: "",
        selectedMinistry: "",
        selectedState: "",
        selectedStatus: "",
      };
    }
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
    this.filterItem1 = {
      selectedCategory: "",
      selectedMinistry: "",
      selectedState: "",
      selectedStatus: "",
    };
  }

  clearItem2(): void {
    this.selectedItem2 = null;
    this.searchItem2 = "";
    this.filterItem2 = {
      selectedCategory: "",
      selectedMinistry: "",
      selectedState: "",
      selectedStatus: "",
    };
  }

  clearItem3(): void {
    this.selectedItem3 = null;
    this.searchItem3 = "";
    this.filterItem3 = {
      selectedCategory: "",
      selectedMinistry: "",
      selectedState: "",
      selectedStatus: "",
    };
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

  getStatusLabel(status: string): string {
    if (!status) return "";
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
