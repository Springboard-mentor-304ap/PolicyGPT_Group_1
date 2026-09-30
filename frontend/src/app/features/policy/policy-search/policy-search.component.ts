import { CommonModule, Location } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  finalize,
  takeUntil,
} from "rxjs";

import { PolicyService } from "../../../core/services/policy.service";
import { SavedItemsService } from "../../../core/services/saved-items.service";
import { SearchHistoryService } from "../../../core/services/search-history.service";
import { ToastService } from "../../../core/services/toast.service";
import { Auth } from "../../../core/services/auth";

import {
  PolicyFilters,
  PolicyListResponse,
  PolicyResponse,
} from "../../../core/models/policy.model";
import {
  POLICY_CATEGORIES,
  MINISTRIES,
  MINISTRY_DEPARTMENTS_MAP,
  ALL_DEPARTMENTS,
  POLICY_SECTORS,
  STATES,
} from "../../../core/constants/government-data.constants";

import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";

@Component({
  selector: "app-policy-search",
  standalone: true,

  imports: [CommonModule, FormsModule, RouterLink, SearchableSelectComponent, BreadcrumbComponent],

  templateUrl: "./policy-search.component.html",

  styleUrls: ["./policy-search.component.scss"],
})
export class PolicySearchComponent implements OnInit, OnDestroy {
  // ============================================================
  // SERVICES
  // ============================================================

  private readonly policyService = inject(PolicyService);
  private readonly route = inject(ActivatedRoute);
  private readonly savedItemsService = inject(SavedItemsService);
  private readonly searchHistoryService = inject(SearchHistoryService);
  private readonly toastService = inject(ToastService);

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
  // ============================================================
  // FILTERS (Policy Name, Department, State, Sector, Publication Date, Status)
  // ============================================================

  selectedCategory = "";

  selectedMinistry = "";

  selectedDepartment = "";

  selectedState = "";

  selectedSector = "";

  selectedPublicationDate = "";

  selectedStatus = "";

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
  // BOOKMARKS (server is source of truth)
  // ============================================================

  private readonly bookmarkStorageKey = "policy_bookmarks";

  private savedPolicyIds = new Set<number>();

  private savedPoliciesLoaded = false;

  private pendingBookmarkIds = new Set<number>();

  // ============================================================
  // FILTER OPTIONS
  // ============================================================

  categories = POLICY_CATEGORIES;
  ministries = MINISTRIES;
  states = STATES;
  sectors = POLICY_CATEGORIES;
  departments = ALL_DEPARTMENTS;

  statusOptions = [
    { label: "All Statuses", value: "" },
    { label: "Approved", value: "APPROVED" },
    { label: "Pending Approval", value: "PENDING_APPROVAL" },
    { label: "Draft", value: "DRAFT" },
    { label: "Rejected", value: "REJECTED" },
    { label: "Archived", value: "ARCHIVED" },
  ];

  readonly statusDisplayOptions: string[] = [
    "Approved",
    "Pending Approval",
    "Draft",
    "Rejected",
    "Archived",
  ];

  selectedStatusDisplay = "";

  onStatusDisplayChange(displayVal: string): void {
    const map: Record<string, string> = {
      Approved: "APPROVED",
      "Pending Approval": "PENDING_APPROVAL",
      Draft: "DRAFT",
      Rejected: "REJECTED",
      Archived: "ARCHIVED",
    };
    this.selectedStatus = map[displayVal] || "";
    this.applyFilters();
  }

  get activeFiltersCount(): number {
    let count = 0;
    if (this.selectedDepartment) count++;
    if (this.selectedState) count++;
    if (this.selectedSector) count++;
    if (this.selectedPublicationDate) count++;
    if (this.isAdminOrGov && this.selectedStatus) count++;
    return count;
  }

  get hasActiveFilters(): boolean {
    return this.activeFiltersCount > 0 || !!this.searchQuery.trim();
  }

  get hasActiveFilterChips(): boolean {
    return this.activeFiltersCount > 0;
  }

  clearPublicationDate(event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedPublicationDate = "";
    this.applyFilters();
  }

  onMinistryChange(): void {
    if (this.selectedMinistry && this.selectedDepartment) {
      const specific = MINISTRY_DEPARTMENTS_MAP[this.selectedMinistry];
      if (specific && specific.length > 0 && !specific.includes(this.selectedDepartment)) {
        this.selectedDepartment = "";
      }
    }
    this.applyFilters();
  }

  // ============================================================
  // ROLE
  // ============================================================

  get userRole(): string {
    return String(this.auth.getUserRole() || "")
      .trim()
      .toUpperCase();
  }

  get isAdminOrGov(): boolean {
    const role = this.userRole;
    return (
      role === "ADMIN" ||
      role === "ADMINISTRATOR" ||
      role === "GOVERNMENT" ||
      role === "GOVERNMENT_OFFICIAL"
    );
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

  /** Breadcrumb trail: Home > Policies (hidden on public guest view). */
  get breadcrumbItems(): BreadcrumbItem[] {
    if (this.userRole === "GUEST") {
      return [];
    }
    return [
      { label: "Home", route: ["/dashboard", this.rolePrefix] },
      { label: "Policies" },
    ];
  }

  ngOnInit(): void {
    console.log("================================================");

    console.log("[POLICY SEARCH] COMPONENT INITIALIZED");

    console.log("[POLICY SEARCH] User role:", this.userRole);

    console.log("[POLICY SEARCH] Loading approved policies...");

    console.log("================================================");

    this.setupSearch();

    /*
     * Restore a search from Search History ("Search Again") when the
     * navigation carries query parameters.
     */
    this.restoreSearchFromQueryParams();

    /*
     * CRITICAL:
     *
     * Load policies immediately.
     *
     * No search text is required.
     */
    this.loadPolicies();
    this.loadSavedPolicyState();
  }

  /**
   * Populate search fields from URL query parameters (Search Again).
   * Only known filter keys are honored; unknown keys are ignored.
   */
  private restoreSearchFromQueryParams(): void {
    const params = this.route.snapshot.queryParams;
    if (!params || typeof params !== "object") {
      return;
    }
    const text = (value: unknown): string =>
      typeof value === "string" ? value : "";
    if (text(params["q"])) {
      this.searchQuery = text(params["q"]);
    }
    if (text(params["category"])) {
      this.selectedCategory = text(params["category"]);
    }
    if (text(params["ministry"])) {
      this.selectedMinistry = text(params["ministry"]);
    }
    if (text(params["department"])) {
      this.selectedDepartment = text(params["department"]);
    }
    if (text(params["state"])) {
      this.selectedState = text(params["state"]);
    }
    if (text(params["sector"])) {
      this.selectedSector = text(params["sector"]);
    }
    if (text(params["publication_date"])) {
      this.selectedPublicationDate = text(params["publication_date"]);
    }
    if (text(params["status"])) {
      this.selectedStatus = text(params["status"]);
    }
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
    const status = this.isAdminOrGov
      ? (this.selectedStatus && this.selectedStatus.toUpperCase() !== "ALL" ? this.selectedStatus : undefined)
      : "APPROVED";

    const params: PolicyFilters = {
      search,
      department: this.selectedDepartment || undefined,
      state: this.selectedState || undefined,
      sector: this.selectedSector || undefined,
      publication_date: this.selectedPublicationDate || undefined,
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

          if (!this.isAdminOrGov) {
            this.policies = responsePolicies.filter(
              (policy) =>
                String(policy?.status || "")
                  .trim()
                  .toUpperCase() === "APPROVED",
            );
          } else if (this.selectedStatus && this.selectedStatus.toUpperCase() !== "ALL") {
            this.policies = responsePolicies.filter(
              (policy) =>
                String(policy?.status || "")
                  .trim()
                  .toUpperCase() === this.selectedStatus.toUpperCase(),
            );
          } else {
            this.policies = responsePolicies;
          }

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
            "[POLICY SEARCH] Filtered policies displayed:",
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

  /**
   * Explicit user search (Search button / Enter key). Runs the search
   * and records it to server-side search history exactly once per
   * distinct query+filter combination.
   */
  submitSearch(): void {
    this.applyFilters();
    this.recordSearch();
  }

  private lastRecordedSearchKey: string | null = null;

  private recordSearch(): void {
    const filters: Record<string, string> = {};
    if (this.selectedCategory) filters["category"] = this.selectedCategory;
    if (this.selectedMinistry) filters["ministry"] = this.selectedMinistry;
    if (this.selectedDepartment) filters["department"] = this.selectedDepartment;
    if (this.selectedState) filters["state"] = this.selectedState;
    if (this.selectedSector) filters["sector"] = this.selectedSector;
    if (this.selectedPublicationDate)
      filters["publication_date"] = this.selectedPublicationDate;
    if (this.selectedStatus) filters["status"] = this.selectedStatus;

    const key = JSON.stringify([
      this.searchQuery.trim(),
      filters,
    ]);
    if (key === this.lastRecordedSearchKey) {
      return;
    }
    this.lastRecordedSearchKey = key;
    this.searchHistoryService
      .recordSearch({
        search_query: this.searchQuery.trim() || "(all policies)",
        search_type: "POLICY",
        filters,
      })
      .subscribe({
        next: () => undefined,
        error: () => undefined,
      });
  }

  clearFilters(): void {
    this.searchQuery = "";
    this.selectedCategory = "";
    this.selectedMinistry = "";
    this.selectedDepartment = "";
    this.selectedState = "";
    this.selectedSector = "";
    this.selectedPublicationDate = "";
    this.selectedStatus = "";
    this.selectedStatusDisplay = "";
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
    const id = Number(policyId);

    if (!Number.isFinite(id)) {
      return false;
    }

    if (this.canUseSavedItems && this.savedPoliciesLoaded) {
      return this.savedPolicyIds.has(id);
    }

    return this.getBookmarks().includes(id);
  }

  isBookmarkPending(policyId: number | string): boolean {
    return this.pendingBookmarkIds.has(Number(policyId));
  }

  toggleBookmark(policy: PolicyResponse): void {
    const id = Number(policy.policy_id);

    if (!Number.isFinite(id) || id <= 0) {
      return;
    }

    if (!this.canUseSavedItems) {
      this.toggleLocalBookmark(id);
      return;
    }

    if (this.pendingBookmarkIds.has(id)) {
      return;
    }

    this.pendingBookmarkIds.add(id);

    if (this.savedPolicyIds.has(id)) {
      this.savedItemsService.unsavePolicy(id).subscribe({
        next: () => {
          this.savedPolicyIds.delete(id);
          this.syncLocalBookmarks();
          this.pendingBookmarkIds.delete(id);
          this.toastService.info("Policy removed from saved items.");
          this.cdr.detectChanges();
        },
        error: () => {
          this.pendingBookmarkIds.delete(id);
          this.toastService.error("Could not remove policy. Please retry.");
          this.cdr.detectChanges();
        },
      });
    } else {
      this.savedItemsService.savePolicy(id).subscribe({
        next: () => {
          this.savedPolicyIds.add(id);
          this.syncLocalBookmarks();
          this.pendingBookmarkIds.delete(id);
          this.toastService.success("Policy saved successfully.");
          this.cdr.detectChanges();
        },
        error: () => {
          this.pendingBookmarkIds.delete(id);
          this.toastService.error("Could not save policy. Please retry.");
          this.cdr.detectChanges();
        },
      });
    }
  }

  private get canUseSavedItems(): boolean {
    return (
      this.userRole === "CITIZEN" ||
      this.userRole === "RESEARCHER" ||
      this.userRole === "ORGANIZATION" ||
      this.userRole === "ORGANISATION"
    );
  }

  private loadSavedPolicyState(): void {
    if (!this.canUseSavedItems) {
      return;
    }

    this.savedItemsService.getSavedPolicies().subscribe({
      next: (items) => {
        this.savedPolicyIds = new Set(
          (items ?? []).map((item) => Number(item.policy_id)),
        );
        this.savedPoliciesLoaded = true;
        this.syncLocalBookmarks();
        this.cdr.detectChanges();
      },
      error: () => {
        this.savedPoliciesLoaded = false;
        this.cdr.detectChanges();
      },
    });
  }

  private toggleLocalBookmark(id: number): void {
    const bookmarks = this.getBookmarks();
    const index = bookmarks.indexOf(id);

    if (index === -1) {
      bookmarks.push(id);
    } else {
      bookmarks.splice(index, 1);
    }

    localStorage.setItem(this.bookmarkStorageKey, JSON.stringify(bookmarks));
  }

  private syncLocalBookmarks(): void {
    try {
      localStorage.setItem(
        this.bookmarkStorageKey,
        JSON.stringify(Array.from(this.savedPolicyIds)),
      );
    } catch {
      // Ignore localStorage errors
    }
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
