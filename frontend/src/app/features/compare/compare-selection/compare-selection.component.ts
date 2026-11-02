import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import {
  Subject,
  takeUntil,
  forkJoin,
  debounceTime,
  distinctUntilChanged,
  of,
  catchError,
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

export interface CompareItem {
  id: number;
  title: string;
  type: "Policy" | "Scheme";
  ministry: string;
  category: string;
  state: string;
  targetGroup: string;
}

export interface FilterOptions {
  selectedCategory: string;
  selectedMinistry: string;
  selectedState: string;
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
  private readonly cdr = inject(ChangeDetectorRef);

  selectedItem1: CompareItem | null = null;
  selectedItem2: CompareItem | null = null;
  selectedItem3: CompareItem | null = null;

  searchItem1 = "";
  searchItem2 = "";
  searchItem3 = "";

  activeInput: 1 | 2 | 3 | null = null;

  filterItem1: FilterOptions = {
    selectedCategory: "",
    selectedMinistry: "",
    selectedState: "",
  };

  filterItem2: FilterOptions = {
    selectedCategory: "",
    selectedMinistry: "",
    selectedState: "",
  };

  filterItem3: FilterOptions = {
    selectedCategory: "",
    selectedMinistry: "",
    selectedState: "",
  };

  allItems: CompareItem[] = [];

  loading = false;
  errorMessage = "";

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
    "All India",
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

  private readonly searchSubject1 = new Subject<string>();
  private readonly searchSubject2 = new Subject<string>();
  private readonly searchSubject3 = new Subject<string>();

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
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters(1);
      });

    this.searchSubject2
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters(2);
      });

    this.searchSubject3
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters(3);
      });
  }

  onSearchChange(itemNum: number): void {
    if (itemNum === 1) {
      this.searchSubject1.next(this.searchItem1);
    } else if (itemNum === 2) {
      this.searchSubject2.next(this.searchItem2);
    } else {
      this.searchSubject3.next(this.searchItem3);
    }
  }

  onFocus(itemNum: 1 | 2 | 3): void {
    this.activeInput = itemNum;
    this.cdr.detectChanges();
  }

  onBlur(itemNum: 1 | 2 | 3): void {
    setTimeout(() => {
      if (this.activeInput === itemNum) {
        this.activeInput = null;
        this.cdr.detectChanges();
      }
    }, 250);
  }

  hasActiveFilters(itemNum: number): boolean {
    const filter =
      itemNum === 1
        ? this.filterItem1
        : itemNum === 2
          ? this.filterItem2
          : this.filterItem3;

    return !!(
      filter.selectedCategory ||
      filter.selectedMinistry ||
      filter.selectedState
    );
  }

  showSuggestions(itemNum: 1 | 2 | 3): boolean {
    if (itemNum === 1) {
      return (
        !this.selectedItem1 &&
        (this.activeInput === 1 ||
          !!this.searchItem1.trim() ||
          this.hasActiveFilters(1))
      );
    }

    if (itemNum === 2) {
      return (
        !this.selectedItem2 &&
        (this.activeInput === 2 ||
          !!this.searchItem2.trim() ||
          this.hasActiveFilters(2))
      );
    }

    return (
      !this.selectedItem3 &&
      (this.activeInput === 3 ||
        !!this.searchItem3.trim() ||
        this.hasActiveFilters(3))
    );
  }

  /**
   * Loads ONLY APPROVED policies and schemes.
   *
   * No other status is loaded into Compare.
   */
  loadAllItems(): void {
    this.loading = true;
    this.errorMessage = "";

    this.cdr.detectChanges();

    let policiesFailed = false;
    let schemesFailed = false;

    forkJoin({
      policies: this.policyService
        .getPolicies({
          status: "APPROVED",
          limit: 100,
        })
        .pipe(
          catchError((error) => {
            console.error("Failed to load policies for comparison:", error);

            policiesFailed = true;

            return of({
              total: 0,
              page: 1,
              limit: 100,
              pages: 1,
              policies: [],
            } as PolicyListResponse);
          }),
        ),

      schemes: this.schemeService
        .getSchemes({
          status: "APPROVED",
          limit: 100,
        })
        .pipe(
          catchError((error) => {
            console.error("Failed to load schemes for comparison:", error);

            schemesFailed = true;

            return of({
              total: 0,
              page: 1,
              limit: 100,
              pages: 1,
              schemes: [],
            } as SchemeListResponse);
          }),
        ),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ policies, schemes }) => {
          if (policiesFailed && schemesFailed) {
            this.allItems = [];

            this.errorMessage =
              "Failed to load items for comparison. Please try again.";

            this.loading = false;

            this.cdr.detectChanges();

            return;
          }

          const policyItems: CompareItem[] = (policies?.policies || [])
            .filter(
              (policy: PolicyResponse) =>
                String(policy.status).toUpperCase() === "APPROVED",
            )
            .map((policy: PolicyResponse) => ({
              id: policy.policy_id,
              title: policy.title,
              type: "Policy" as const,
              ministry: policy.ministry || "-",
              category: policy.category || "-",
              state: policy.state || "-",
              targetGroup: "-",
            }));

          const schemeItems: CompareItem[] = (schemes?.schemes || [])
            .filter(
              (scheme: SchemeResponse) =>
                String(scheme.status).toUpperCase() === "APPROVED",
            )
            .map((scheme: SchemeResponse) => ({
              id: scheme.scheme_id,
              title:
                scheme.name || scheme.title || `Scheme #${scheme.scheme_id}`,
              type: "Scheme" as const,
              ministry: scheme.ministry || "-",
              category: scheme.category || "-",
              state: scheme.state || "-",
              targetGroup: "-",
            }));

          this.allItems = [...policyItems, ...schemeItems];

          this.loading = false;

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error("Failed to load items for comparison:", error);

          this.errorMessage =
            "Failed to load items for comparison. Please try again.";

          this.loading = false;

          this.cdr.detectChanges();
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

    if (filters.selectedCategory) {
      items = items.filter(
        (item) => item.category === filters.selectedCategory,
      );
    }

    if (filters.selectedMinistry) {
      items = items.filter(
        (item) => item.ministry === filters.selectedMinistry,
      );
    }

    if (filters.selectedState) {
      items = items.filter((item) => item.state === filters.selectedState);
    }

    return items;
  }

  applyFilters(itemNum: number): void {
    void itemNum;

    this.cdr.detectChanges();
  }

  clearFilters(itemNum: number): void {
    if (itemNum === 1) {
      this.filterItem1 = {
        selectedCategory: "",
        selectedMinistry: "",
        selectedState: "",
      };
    } else if (itemNum === 2) {
      this.filterItem2 = {
        selectedCategory: "",
        selectedMinistry: "",
        selectedState: "",
      };
    } else {
      this.filterItem3 = {
        selectedCategory: "",
        selectedMinistry: "",
        selectedState: "",
      };
    }

    this.cdr.detectChanges();
  }

  selectItem1(item: CompareItem): void {
    if (!this.isApprovedItem(item)) {
      return;
    }

    this.selectedItem1 = item;
    this.searchItem1 = item.title;
    this.activeInput = null;

    this.cdr.detectChanges();
  }

  selectItem2(item: CompareItem): void {
    if (!this.isApprovedItem(item)) {
      return;
    }

    this.selectedItem2 = item;
    this.searchItem2 = item.title;
    this.activeInput = null;

    this.cdr.detectChanges();
  }

  selectItem3(item: CompareItem): void {
    if (!this.isApprovedItem(item)) {
      return;
    }

    this.selectedItem3 = item;
    this.searchItem3 = item.title;
    this.activeInput = null;

    this.cdr.detectChanges();
  }

  private isApprovedItem(item: CompareItem): boolean {
    return (
      !!item &&
      Number.isFinite(item.id) &&
      (item.type === "Policy" || item.type === "Scheme")
    );
  }

  clearItem1(): void {
    this.selectedItem1 = null;
    this.searchItem1 = "";

    this.filterItem1 = {
      selectedCategory: "",
      selectedMinistry: "",
      selectedState: "",
    };

    this.cdr.detectChanges();
  }

  clearItem2(): void {
    this.selectedItem2 = null;
    this.searchItem2 = "";

    this.filterItem2 = {
      selectedCategory: "",
      selectedMinistry: "",
      selectedState: "",
    };

    this.cdr.detectChanges();
  }

  clearItem3(): void {
    this.selectedItem3 = null;
    this.searchItem3 = "";

    this.filterItem3 = {
      selectedCategory: "",
      selectedMinistry: "",
      selectedState: "",
    };

    this.cdr.detectChanges();
  }

  canCompare(): boolean {
    return !!this.selectedItem1 && !!this.selectedItem2;
  }

  compareNow(): void {
    if (!this.canCompare()) {
      return;
    }

    const items: CompareItem[] = [this.selectedItem1!, this.selectedItem2!];

    if (this.selectedItem3) {
      items.push(this.selectedItem3);
    }

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
