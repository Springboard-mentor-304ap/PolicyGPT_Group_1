import { Component, OnInit, inject } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { HttpClient, HttpParams } from "@angular/common/http";
import { catchError, finalize, of } from "rxjs";

// =========================================================
// POLICY INTERFACE
// =========================================================

export interface Policy {
  policy_id: number;

  title: string;
  description: string;
  category: string;

  ministry: string | null;
  department: string | null;
  state: string | null;
  sector: string | null;

  publication_date: string | null;
  effective_date: string | null;

  status:
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "ARCHIVED"
    | "ARCHIVE_REQUESTED"
    | "DELETE_REQUESTED";

  document_url: string | null;
  source_url: string | null;

  benefits: string[] | null;
  eligibility_rules: unknown[] | null;

  created_by: number | null;
  approved_by: number | null;

  rejection_reason: string | null;

  archive_reason: string | null;
  archive_requested_by: number | null;
  archive_requested_at: string | null;

  delete_reason: string | null;
  delete_requested_by: number | null;
  delete_requested_at: string | null;

  delete_requested_from_status: string | null;

  created_at: string;
  updated_at: string;
}

// =========================================================
// API RESPONSE
// =========================================================

interface PolicyListResponse {
  total: number;
  page: number;
  limit: number;
  pages: number;
  policies: Policy[];
}

// =========================================================
// COMPONENT
// =========================================================

@Component({
  selector: "app-policy-search",
  standalone: true,

  imports: [CommonModule, FormsModule, RouterLink],

  templateUrl: "./policy-search.component.html",

  styleUrls: ["./policy-search.component.scss"],
})
export class PolicySearchComponent implements OnInit {
  // =======================================================
  // SERVICES
  // =======================================================

  private readonly http = inject(HttpClient);

  private readonly location = inject(Location);

  // =======================================================
  // API
  // =======================================================

  private readonly apiUrl = "http://localhost:8000/policies";

  // =======================================================
  // SEARCH
  // =======================================================

  searchQuery = "";

  // =======================================================
  // FILTERS
  // =======================================================

  selectedCategory = "";

  selectedMinistry = "";

  selectedDepartment = "";

  selectedState = "";

  selectedSector = "";

  selectedStatus = "";

  // =======================================================
  // POLICY DATA
  // =======================================================

  policies: Policy[] = [];

  totalResults = 0;

  currentPage = 1;

  totalPages = 1;

  readonly pageSize = 10;

  // =======================================================
  // UI STATE
  // =======================================================

  loading = false;

  errorMessage = "";

  // =======================================================
  // BOOKMARKS
  // =======================================================

  private readonly bookmarkStorageKey = "policy_bookmarks";

  // =======================================================
  // FILTER OPTIONS
  // =======================================================

  categories: string[] = [
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

  ministries: string[] = [
    "Ministry of Education",
    "Ministry of Health & Family Welfare",
    "Ministry of Agriculture & Farmers Welfare",
    "Ministry of Skill Development & Entrepreneurship",
    "Ministry of Finance",
    "Ministry of Housing and Urban Affairs",
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
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
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

  // =======================================================
  // LIFECYCLE
  // =======================================================

  ngOnInit(): void {
    this.loadPolicies();
  }

  // =======================================================
  // LOAD POLICIES
  // =======================================================

  loadPolicies(): void {
    this.loading = true;

    this.errorMessage = "";

    let params = new HttpParams()
      .set("page", this.currentPage.toString())
      .set("limit", this.pageSize.toString());

    // =====================================================
    // SEARCH
    // =====================================================

    if (this.searchQuery.trim()) {
      params = params.set("search", this.searchQuery.trim());
    }

    // =====================================================
    // CATEGORY
    // =====================================================

    if (this.selectedCategory.trim()) {
      params = params.set("category", this.selectedCategory.trim());
    }

    // =====================================================
    // MINISTRY
    // =====================================================

    if (this.selectedMinistry.trim()) {
      params = params.set("ministry", this.selectedMinistry.trim());
    }

    // =====================================================
    // DEPARTMENT
    // =====================================================

    if (this.selectedDepartment.trim()) {
      params = params.set("department", this.selectedDepartment.trim());
    }

    // =====================================================
    // STATE
    // =====================================================

    if (this.selectedState.trim()) {
      params = params.set("state", this.selectedState.trim());
    }

    // =====================================================
    // SECTOR
    // =====================================================

    if (this.selectedSector.trim()) {
      params = params.set("sector", this.selectedSector.trim());
    }

    // =====================================================
    // STATUS
    // =====================================================

    if (this.selectedStatus.trim()) {
      params = params.set("status", this.selectedStatus.trim());
    }

    // =====================================================
    // DEBUG
    // =====================================================

    console.log("====================================");

    console.log("POLICY API REQUEST");

    console.log("URL:", this.apiUrl);

    console.log("PARAMS:", params.toString());

    console.log("====================================");

    // =====================================================
    // API REQUEST
    // =====================================================

    this.http
      .get<PolicyListResponse>(this.apiUrl, {
        params,
      })

      .pipe(
        catchError((error) => {
          console.error("Policy API Error:", error);

          this.errorMessage = this.getErrorMessage(error);

          return of<PolicyListResponse>({
            total: 0,
            page: 1,
            limit: this.pageSize,
            pages: 1,
            policies: [],
          });
        }),

        finalize(() => {
          this.loading = false;
        }),
      )

      // ===================================================
      // RESPONSE
      // ===================================================

      .subscribe((response) => {
        console.log("====================================");

        console.log("POLICY API RESPONSE:", response);

        // -----------------------------------------------
        // POLICIES
        // -----------------------------------------------

        this.policies = Array.isArray(response?.policies)
          ? response.policies
          : [];

        // -----------------------------------------------
        // TOTAL
        // -----------------------------------------------

        this.totalResults = Number(response?.total) || 0;

        // -----------------------------------------------
        // CURRENT PAGE
        // -----------------------------------------------

        this.currentPage = Number(response?.page) || 1;

        // -----------------------------------------------
        // TOTAL PAGES
        // -----------------------------------------------

        this.totalPages =
          Number(response?.pages) > 0 ? Number(response.pages) : 1;

        // -----------------------------------------------
        // DEBUG
        // -----------------------------------------------

        console.log("POLICIES:", this.policies);

        console.log("TOTAL RESULTS:", this.totalResults);

        console.log("CURRENT PAGE:", this.currentPage);

        console.log("TOTAL PAGES:", this.totalPages);

        console.log("POLICY COUNT:", this.policies.length);

        console.log("====================================");
      });
  }

  // =======================================================
  // APPLY FILTERS
  // =======================================================

  applyFilters(): void {
    this.currentPage = 1;

    this.loadPolicies();
  }

  // =======================================================
  // CLEAR FILTERS
  // =======================================================

  clearFilters(): void {
    this.searchQuery = "";

    this.selectedCategory = "";

    this.selectedMinistry = "";

    this.selectedDepartment = "";

    this.selectedState = "";

    this.selectedSector = "";

    this.selectedStatus = "";

    this.currentPage = 1;

    this.loadPolicies();
  }

  // =======================================================
  // PAGINATION
  // =======================================================

  nextPage(): void {
    if (this.currentPage >= this.totalPages) {
      return;
    }

    this.currentPage++;

    this.loadPolicies();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  previousPage(): void {
    if (this.currentPage <= 1) {
      return;
    }

    this.currentPage--;

    this.loadPolicies();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }

    this.currentPage = page;

    this.loadPolicies();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // =======================================================
  // PAGE NUMBERS
  // =======================================================

  get pageNumbers(): number[] {
    const pages: number[] = [];

    const start = Math.max(1, this.currentPage - 2);

    const end = Math.min(this.totalPages, this.currentPage + 2);

    for (let page = start; page <= end; page++) {
      pages.push(page);
    }

    return pages;
  }

  // =======================================================
  // BOOKMARK
  // =======================================================

  isBookmarked(policyId: number): boolean {
    return this.getBookmarks().includes(policyId);
  }

  toggleBookmark(policy: Policy): void {
    const bookmarks = this.getBookmarks();

    const index = bookmarks.indexOf(policy.policy_id);

    if (index === -1) {
      bookmarks.push(policy.policy_id);
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

      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }

  // =======================================================
  // STATUS LABEL
  // =======================================================

  getStatusLabel(status: string): string {
    if (!status) {
      return "";
    }

    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  // =======================================================
  // BACK
  // =======================================================

  goBack(): void {
    this.location.back();
  }

  // =======================================================
  // ERROR MESSAGE
  // =======================================================

  private getErrorMessage(error: any): string {
    if (error?.error?.detail) {
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

    if (error?.status === 0) {
      return "Unable to connect to the backend server.";
    }

    if (error?.message) {
      return error.message;
    }

    return "Unable to load policies. Please try again.";
  }
}
