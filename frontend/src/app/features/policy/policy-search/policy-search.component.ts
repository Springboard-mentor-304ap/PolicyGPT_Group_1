import { CommonModule, Location } from "@angular/common";
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  finalize,
  takeUntil,
} from "rxjs";

import { PolicyService } from "../../../core/services/policy.service";
import { Auth } from "../../../core/services/auth";

import {
  PolicyFilters,
  PolicyListResponse,
  PolicyResponse,
} from "../../../core/models/policy.model";

@Component({
  selector: "app-policy-search",
  standalone: true,

  imports: [CommonModule, FormsModule, RouterLink],

  templateUrl: "./policy-search.component.html",

  styleUrls: ["./policy-search.component.scss"],
})
export class PolicySearchComponent implements OnInit, OnDestroy {
  // ============================================================
  // SERVICES
  // ============================================================

  private readonly policyService = inject(PolicyService);

  private readonly location = inject(Location);

  private readonly auth = inject(Auth);

  private readonly cdr = inject(ChangeDetectorRef);

  // ============================================================
  // RXJS
  // ============================================================

  private readonly destroy$ = new Subject<void>();

  private readonly searchSubject = new Subject<string>();

  // ============================================================
  // SEARCH
  // ============================================================

  searchQuery = "";

  // ============================================================
  // FILTERS
  // ============================================================

  selectedCategory = "";

  selectedMinistry = "";

  selectedDepartment = "";

  selectedState = "";

  selectedSector = "";

  // ============================================================
  // POLICY DATA
  // ============================================================

  policies: PolicyResponse[] = [];

  totalResults = 0;

  currentPage = 1;

  totalPages = 1;

  readonly pageSize = 10;

  // ============================================================
  // UI
  // ============================================================

  loading = false;

  errorMessage = "";

  // ============================================================
  // BOOKMARKS
  // ============================================================

  private readonly bookmarkStorageKey = "policy_bookmarks";

  // ============================================================
  // FILTER OPTIONS
  // ============================================================

  categories = [
    "Education",
    "Healthcare",
    "Agriculture",
    "Employment",
    "Finance",
    "Women & Child Welfare",
    "Housing",
    "Environment",
    "Digital Governance",
    "Infrastructure",
  ];

  ministries = [
    "Ministry of Education",
    "Ministry of Health & Family Welfare",
    "Ministry of Agriculture & Farmers Welfare",
    "Ministry of Skill Development & Entrepreneurship",
    "Ministry of Finance",
    "Ministry of Housing and Urban Affairs",
  ];

  departments = [
    "Department of School Education",
    "Department of Higher Education",
    "Department of Health",
    "Department of Electronics & IT",
    "Department of Agriculture",
    "Department of Renewable Energy",
    "Department of Urban Development",
    "Department of Economic Affairs",
  ];

  states = [
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
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
  ];

  sectors = [
    "Central Government",
    "State Government",
    "Public Sector",
    "Private Sector",
    "NGO",
    "International",
  ];

  // ============================================================
  // ROLE
  // ============================================================

  get userRole(): string {
    return String(this.auth.getUserRole() || "")
      .trim()
      .toUpperCase();
  }

  get rolePrefix(): string {
    switch (this.userRole) {
      case "ADMIN":
      case "ADMINISTRATOR":
        return "admin";

      case "GOVERNMENT":
      case "GOVERNMENT_OFFICIAL":
        return "government";

      case "RESEARCHER":
        return "researcher";

      case "ORGANIZATION":
      case "ORGANISATION":
        return "organization";

      case "GUEST":
        return "guest";

      case "CITIZEN":
      default:
        return "citizen";
    }
  }

  // ============================================================
  // INIT
  // ============================================================

  ngOnInit(): void {
    console.log("================================================");

    console.log("[POLICY SEARCH] COMPONENT INITIALIZED");

    console.log("[POLICY SEARCH] User role:", this.userRole);

    console.log("[POLICY SEARCH] Loading approved policies...");

    console.log("================================================");

    this.setupSearch();

    /*
     * CRITICAL:
     *
     * Load policies immediately.
     *
     * No search text is required.
     */
    this.loadPolicies();
  }

  // ============================================================
  // DESTROY
  // ============================================================

  ngOnDestroy(): void {
    this.destroy$.next();

    this.destroy$.complete();
  }

  // ============================================================
  // SEARCH
  // ============================================================

  private setupSearch(): void {
    this.searchSubject
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;

        this.loadPolicies();
      });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  // ============================================================
  // LOAD POLICIES
  // ============================================================

  loadPolicies(): void {
    this.loading = true;
    this.errorMessage = "";
    this.cdr.detectChanges();

    const searchValue = this.searchQuery.trim();

    /*
     * Empty search is completely valid.
     *
     * This must return ALL approved policies.
     */
    const search = searchValue.length > 0 ? searchValue : undefined;

    /*
     * ==========================================================
     * NEVER CHANGE THIS
     * ==========================================================
     *
     * Search Policies = APPROVED ONLY.
     *
     * This applies to:
     *
     * ADMIN
     * GOVERNMENT
     * CITIZEN
     * RESEARCHER
     * ORGANIZATION
     * GUEST
     */
    const status = "APPROVED";

    const params: PolicyFilters = {
      search,
      category: this.selectedCategory || undefined,
      ministry: this.selectedMinistry || undefined,
      department: this.selectedDepartment || undefined,
      state: this.selectedState || undefined,
      sector: this.selectedSector || undefined,
      status,
      page: this.currentPage,
      limit: this.pageSize,
    };

    console.log("================================================");
    console.log("[POLICY SEARCH] API REQUEST");
    console.log("[POLICY SEARCH] Params:", params);
    console.log("[POLICY SEARCH] Status:", status);
    console.log("================================================");

    this.policyService
      .getPolicies(params)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          console.log("[POLICY SEARCH] Request finished");
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (response: PolicyListResponse) => {
          console.log("================================================");
          console.log("[POLICY SEARCH] API RESPONSE");
          console.log(response);
          console.log("================================================");

          const responsePolicies = Array.isArray(response?.policies)
            ? response.policies
            : [];

          /*
           * Safety filter.
           *
           * Even if backend accidentally returns
           * another status, don't display it here.
           */
          this.policies = responsePolicies.filter(
            (policy) =>
              String(policy?.status || "")
                .trim()
                .toUpperCase() === "APPROVED",
          );

          this.totalResults = Number(response?.total) || 0;
          this.currentPage = Math.max(
            1,
            Number(response?.page) || this.currentPage,
          );
          this.totalPages = Math.max(1, Number(response?.pages) || 1);
          this.errorMessage = "";

          console.log(
            "[POLICY SEARCH] Policies returned:",
            responsePolicies.length,
          );
          console.log(
            "[POLICY SEARCH] Approved policies displayed:",
            this.policies.length,
          );
          console.log("[POLICY SEARCH] Total:", this.totalResults);

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error("================================================");
          console.error("[POLICY SEARCH] API ERROR");
          console.error(error);
          console.error("================================================");

          this.policies = [];
          this.totalResults = 0;
          this.totalPages = 1;
          this.errorMessage = this.getErrorMessage(error);
          this.cdr.detectChanges();
        },
      });
  }

  // ============================================================
  // FILTERS
  // ============================================================

  applyFilters(): void {
    this.currentPage = 1;
    this.loadPolicies();
    this.cdr.detectChanges();
  }

  clearFilters(): void {
    this.searchQuery = "";
    this.selectedCategory = "";
    this.selectedMinistry = "";
    this.selectedDepartment = "";
    this.selectedState = "";
    this.selectedSector = "";
    this.currentPage = 1;

    this.loadPolicies();
    this.cdr.detectChanges();
  }

  // ============================================================
  // PAGINATION
  // ============================================================

  nextPage(): void {
    if (this.loading || this.currentPage >= this.totalPages) {
      return;
    }

    this.currentPage++;
    this.loadPolicies();
    this.scrollTop();
    this.cdr.detectChanges();
  }

  previousPage(): void {
    if (this.loading || this.currentPage <= 1) {
      return;
    }

    this.currentPage--;
    this.loadPolicies();
    this.scrollTop();
    this.cdr.detectChanges();
  }

  goToPage(page: number): void {
    if (
      this.loading ||
      page < 1 ||
      page > this.totalPages ||
      page === this.currentPage
    ) {
      return;
    }

    this.currentPage = page;
    this.loadPolicies();
    this.scrollTop();
    this.cdr.detectChanges();
  }

  private scrollTop(): void {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];

    const start = Math.max(1, this.currentPage - 2);

    const end = Math.min(this.totalPages, this.currentPage + 2);

    for (let page = start; page <= end; page++) {
      pages.push(page);
    }

    return pages;
  }

  // ============================================================
  // POLICY DETAILS
  // ============================================================

  getPolicyDetailsRoute(policyId: number | string): any[] {
    const id = Number(policyId);

    if (!Number.isFinite(id) || id <= 0) {
      return ["/"];
    }

    return ["/dashboard", this.rolePrefix, "policies", id];
  }

  // ============================================================
  // TRACK BY
  // ============================================================

  trackByPolicyId(index: number, policy: PolicyResponse): number {
    return Number(policy.policy_id);
  }

  // ============================================================
  // BOOKMARKS
  // ============================================================

  isBookmarked(policyId: number | string): boolean {
    return this.getBookmarks().includes(Number(policyId));
  }

  toggleBookmark(policy: PolicyResponse): void {
    const id = Number(policy.policy_id);

    if (!Number.isFinite(id) || id <= 0) {
      return;
    }

    const bookmarks = this.getBookmarks();

    const index = bookmarks.indexOf(id);

    if (index === -1) {
      bookmarks.push(id);
    } else {
      bookmarks.splice(index, 1);
    }

    localStorage.setItem(this.bookmarkStorageKey, JSON.stringify(bookmarks));
  }

  private getBookmarks(): number[] {
    try {
      const stored = localStorage.getItem(this.bookmarkStorageKey);

      if (!stored) {
        return [];
      }

      const parsed: unknown = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map(Number).filter((id) => Number.isFinite(id));
    } catch {
      return [];
    }
  }

  // ============================================================
  // STATUS
  // ============================================================

  getStatusLabel(status: string): string {
    if (!status) {
      return "";
    }

    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  // ============================================================
  // BACK
  // ============================================================

  goBack(): void {
    this.location.back();
  }

  // ============================================================
  // ERROR
  // ============================================================

  private getErrorMessage(error: any): string {
    if (typeof error?.error?.detail === "string") {
      return error.error.detail;
    }

    if (error?.status === 401) {
      return "Your session has expired. Please login again.";
    }

    if (error?.status === 403) {
      return "You do not have permission to view these policies.";
    }

    if (error?.status === 404) {
      return "Policy API endpoint was not found.";
    }

    if (error?.status === 422) {
      return "Invalid search parameters.";
    }

    if (error?.status === 0) {
      return "Unable to connect to the backend server. Make sure FastAPI is running on port 8000.";
    }

    if (typeof error?.message === "string") {
      return error.message;
    }

    return "Unable to load policies. Please try again.";
  }
}
