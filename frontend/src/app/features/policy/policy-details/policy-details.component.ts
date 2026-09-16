import { Component, OnInit, inject } from "@angular/core";

import { CommonModule, Location } from "@angular/common";

import { ActivatedRoute } from "@angular/router";

import { HttpClient } from "@angular/common/http";

import { catchError, finalize, of, forkJoin } from "rxjs";

// =========================================================
// POLICY
// =========================================================

interface Policy {
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
// ELIGIBILITY RULE
// Matches your eligibility rule model
// =========================================================

interface EligibilityRule {
  rule_id: number;

  policy_id?: number | null;

  scheme_id?: number | null;

  min_age: number | null;

  max_age: number | null;

  gender: string | null;

  max_income: number | null;

  occupation: string | null;

  education: string | null;

  state: string | null;

  social_category: string | null;

  disability_status: boolean | null;

  is_active?: boolean;

  created_at?: string;

  updated_at?: string;
}

// =========================================================
// COMPONENT
// =========================================================

@Component({
  selector: "app-policy-details",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./policy-details.component.html",
  styleUrls: ["./policy-details.component.scss"],
})
export class PolicyDetailsComponent implements OnInit {
  // =======================================================
  // SERVICES
  // =======================================================

  private readonly location = inject(Location);

  private readonly route = inject(ActivatedRoute);

  private readonly http = inject(HttpClient);

  // =======================================================
  // API
  // =======================================================

  private readonly policyApi = "http://localhost:8000/policies";

  private readonly eligibilityApi = "http://localhost:8000/eligibility";

  // =======================================================
  // TAB
  // =======================================================

  activeTab: "overview" | "eligibility" | "benefits" | "documents" = "overview";

  // =======================================================
  // POLICY
  // =======================================================

  policy: Policy | null = null;

  // =======================================================
  // ELIGIBILITY
  // =======================================================

  eligibilityRules: EligibilityRule[] = [];

  eligibilityLoading = false;

  eligibilityError = "";

  // =======================================================
  // PAGE STATE
  // =======================================================

  loading = false;

  errorMessage = "";

  // =======================================================
  // BOOKMARK
  // =======================================================

  private readonly bookmarkStorageKey = "policy_bookmarks";

  // =======================================================
  // INIT
  // =======================================================

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get("id");

    if (!id) {
      this.errorMessage = "Policy ID is missing.";

      return;
    }

    const policyId = Number(id);

    if (Number.isNaN(policyId) || policyId <= 0) {
      this.errorMessage = "Invalid policy ID.";

      return;
    }

    this.loadPolicy(policyId);
  }

  // =======================================================
  // LOAD POLICY
  // GET /policies/{policy_id}
  // =======================================================

  loadPolicy(policyId: number): void {
    this.loading = true;

    this.errorMessage = "";

    this.http
      .get<Policy>(`${this.policyApi}/${policyId}`)
      .pipe(
        catchError((error) => {
          console.error("Policy details API error:", error);

          this.errorMessage = this.getErrorMessage(error);

          return of(null);
        }),

        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe((policy) => {
        if (!policy) {
          return;
        }

        this.policy = policy;

        // Load eligibility rules
        this.loadEligibilityRules(policy.policy_id);
      });
  }

  // =======================================================
  // LOAD ELIGIBILITY RULES
  // GET /eligibility/policy/{policy_id}
  // =======================================================

  loadEligibilityRules(policyId: number): void {
    this.eligibilityLoading = true;

    this.eligibilityError = "";

    this.http
      .get<EligibilityRule[]>(`${this.eligibilityApi}/policy/${policyId}`)
      .pipe(
        catchError((error) => {
          console.error("Eligibility API error:", error);

          this.eligibilityError = this.getErrorMessage(error);

          return of([]);
        }),

        finalize(() => {
          this.eligibilityLoading = false;
        }),
      )
      .subscribe((rules) => {
        this.eligibilityRules = rules || [];
      });
  }

  // =======================================================
  // TAB
  // =======================================================

  setActiveTab(
    tab: "overview" | "eligibility" | "benefits" | "documents",
  ): void {
    this.activeTab = tab;
  }

  // =======================================================
  // BOOKMARK
  // =======================================================

  isBookmarked(): boolean {
    if (!this.policy) {
      return false;
    }

    return this.getBookmarks().includes(this.policy.policy_id);
  }

  toggleBookmark(): void {
    if (!this.policy) {
      return;
    }

    const bookmarks = this.getBookmarks();

    const policyId = this.policy.policy_id;

    const index = bookmarks.indexOf(policyId);

    if (index === -1) {
      bookmarks.push(policyId);
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
  // SHARE
  // =======================================================

  sharePolicy(): void {
    if (!this.policy) {
      return;
    }

    const shareData = {
      title: this.policy.title,
      text: this.policy.description,
      url: window.location.href,
    };

    if (typeof navigator.share === "function") {
      navigator.share(shareData).catch(() => {});

      return;
    }

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(window.location.href)
        .then(() => {
          alert("Policy URL copied to clipboard!");
        })
        .catch(() => {
          alert("Unable to copy policy URL.");
        });

      return;
    }

    alert("Sharing is not supported by this browser.");
  }

  // =======================================================
  // FORMAT STATUS
  // =======================================================

  getStatusLabel(status: string): string {
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  // =======================================================
  // FORMAT DATE
  // =======================================================

  formatDate(date: string | null | undefined): string {
    if (!date) {
      return "Not specified";
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // =======================================================
  // FORMAT INCOME
  // =======================================================

  formatIncome(income: number | null): string {
    if (income === null || income === undefined) {
      return "";
    }

    return `₹${income.toLocaleString("en-IN")}`;
  }

  // =======================================================
  // RULE DISPLAY
  // =======================================================

  getRuleDescriptions(rule: EligibilityRule): string[] {
    const descriptions: string[] = [];

    if (rule.min_age !== null && rule.min_age !== undefined) {
      descriptions.push(`Minimum age: ${rule.min_age} years`);
    }

    if (rule.max_age !== null && rule.max_age !== undefined) {
      descriptions.push(`Maximum age: ${rule.max_age} years`);
    }

    if (rule.gender && !this.isNoRestriction(rule.gender)) {
      descriptions.push(`Gender: ${rule.gender}`);
    }

    if (rule.max_income !== null && rule.max_income !== undefined) {
      descriptions.push(
        `Maximum annual income: ${this.formatIncome(rule.max_income)}`,
      );
    }

    if (rule.occupation && !this.isNoRestriction(rule.occupation)) {
      descriptions.push(`Occupation: ${rule.occupation}`);
    }

    if (rule.education && !this.isNoRestriction(rule.education)) {
      descriptions.push(`Education: ${rule.education}`);
    }

    if (rule.state && !this.isNoRestriction(rule.state)) {
      descriptions.push(`State / Region: ${rule.state}`);
    }

    if (rule.social_category && !this.isNoRestriction(rule.social_category)) {
      descriptions.push(`Social category: ${rule.social_category}`);
    }

    if (
      rule.disability_status !== null &&
      rule.disability_status !== undefined
    ) {
      descriptions.push(
        rule.disability_status
          ? "Applicable to persons with disabilities"
          : "Applicable to non-disabled applicants",
      );
    }

    return descriptions;
  }

  // =======================================================
  // NO RESTRICTION
  // =======================================================

  isNoRestriction(value: string | null): boolean {
    if (!value) {
      return true;
    }

    return ["", "any", "all", "all india", "not applicable", "n/a"].includes(
      value.trim().toLowerCase(),
    );
  }

  // =======================================================
  // BENEFITS
  // =======================================================

  get benefits(): string[] {
    return this.policy?.benefits || [];
  }

  // =======================================================
  // DOCUMENT AVAILABLE
  // =======================================================

  get hasDocument(): boolean {
    return !!this.policy?.document_url;
  }

  // =======================================================
  // BACK
  // =======================================================

  goBack(): void {
    this.location.back();
  }

  // =======================================================
  // ERROR
  // =======================================================

  private getErrorMessage(error: any): string {
    if (error?.error?.detail) {
      return error.error.detail;
    }

    if (error?.message) {
      return error.message;
    }

    return "Unable to load the policy. Please try again.";
  }
}
