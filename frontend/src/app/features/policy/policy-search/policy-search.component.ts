import { Component, OnInit, inject, OnDestroy } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { PolicyService, Policy, PolicyListResponse } from "../../../core/services/policy.services";

@Component({
  selector: "app-policy-search",
  standalone: true,

  imports: [CommonModule, FormsModule, RouterLink],

  templateUrl: "./policy-search.component.html",

  styleUrls: ["./policy-search.component.scss"],
})
export class PolicySearchComponent implements OnInit, OnDestroy {
  // =======================================================
  // SERVICES
  // =======================================================

  private readonly policyService = inject(PolicyService);
  private readonly location = inject(Location);

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

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

  sectors: string[] = [
    "Central Government",
    "State Government",
    "Public Sector",
    "Private Sector",
    "NGO",
    "International"
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
    this.setupDebouncedSearch();
    this.loadPolicies();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupDebouncedSearch(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.currentPage = 1;
      this.loadPolicies();
    });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  // =======================================================
  // LOAD POLICIES
  // =======================================================

  loadPolicies(): void {
    this.loading = true;
    this.errorMessage = "";

    this.policyService.getPolicies({
      search: this.searchQuery.trim() || undefined,
      category: this.selectedCategory || undefined,
      ministry: this.selectedMinistry || undefined,
      state: this.selectedState || undefined,
      status: this.selectedStatus || undefined,
      page: this.currentPage,
      limit: this.pageSize
    }).subscribe({
      next: (response: PolicyListResponse) => {
        this.policies = Array.isArray(response?.policies) ? response.policies : [];
        this.totalResults = Number(response?.total) || 0;
        this.currentPage = Number(response?.page) || 1;
        this.totalPages = Number(response?.pages) > 0 ? Number(response.pages) : 1;
        this.loading = false;
      },
      error: (error) => {
        console.error("Policy API Error:", error);
        this.errorMessage = this.getErrorMessage(error);
        this.policies = [];
        this.totalResults = 0;
        this.totalPages = 1;
        this.loading = false;
      }
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
    if (this.currentPage >= this.totalPages) return;
    this.currentPage++;
    this.loadPolicies();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  previousPage(): void {
    if (this.currentPage <= 1) return;
    this.currentPage--;
    this.loadPolicies();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.loadPolicies();
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      if (!stored) return [];
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
    if (!status) return "";
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