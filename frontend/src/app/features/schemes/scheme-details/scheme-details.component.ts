import { Component, OnInit, inject } from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { ActivatedRoute } from "@angular/router";
import { catchError, finalize, of, forkJoin } from "rxjs";

import { SchemeService, Scheme } from "../../../core/services/scheme.service";

interface EligibilityRule {
  rule_id: number;
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

@Component({
  selector: "app-scheme-details",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./scheme-details.component.html",
  styleUrls: ["./scheme-details.component.scss"],
})
export class SchemeDetailsComponent implements OnInit {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly schemeService = inject(SchemeService);

  activeTab: "overview" | "eligibility" | "benefits" | "documents" = "overview";
  schemeId: string | null = null;
  schemeIdNum: number | null = null;

  scheme: Scheme | null = null;
  eligibilityRules: EligibilityRule[] = [];

  loading = false;
  eligibilityLoading = false;
  errorMessage = "";
  eligibilityError = "";

  ngOnInit(): void {
    this.schemeId = this.route.snapshot.paramMap.get("id");

    if (!this.schemeId) {
      this.errorMessage = "Scheme ID is missing.";
      return;
    }

    const id = Number(this.schemeId);
    this.schemeIdNum = id;

    if (isNaN(id) || id <= 0) {
      this.errorMessage = "Invalid scheme ID.";
      return;
    }

    this.loadScheme(id);
  }

  loadScheme(schemeId: number): void {
    this.loading = true;
    this.errorMessage = "";

    this.schemeService
      .getScheme(schemeId)
      .pipe(
        catchError((error) => {
          console.error("Scheme details API error:", error);
          this.errorMessage = this.getErrorMessage(error);
          return of(null);
        }),
        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe((scheme) => {
        if (!scheme) return;
        this.scheme = scheme;
        this.loadEligibilityRules(scheme.scheme_id);
      });
  }

  loadEligibilityRules(schemeId: number): void {
    this.eligibilityLoading = true;
    this.eligibilityError = "";

    this.schemeService
      .getEligibilityRules(schemeId)
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

  setActiveTab(
    tab: "overview" | "eligibility" | "benefits" | "documents",
  ): void {
    this.activeTab = tab;
  }

  toggleBookmark(): void {
    if (!this.scheme) return;

    const bookmarks = this.getBookmarks();
    const id = this.scheme.scheme_id;
    const index = bookmarks.indexOf(id);

    if (index === -1) {
      bookmarks.push(id);
    } else {
      bookmarks.splice(index, 1);
    }

    localStorage.setItem("scheme_bookmarks", JSON.stringify(bookmarks));
  }

  isBookmarked(): boolean {
    if (!this.scheme) return false;
    return this.getBookmarks().includes(this.scheme.scheme_id);
  }

  private getBookmarks(): number[] {
    try {
      const stored = localStorage.getItem("scheme_bookmarks");
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }

  applyNow(): void {
    if (this.scheme?.application_url) {
      window.open(this.scheme.application_url, "_blank");
    }
  }

  shareScheme(): void {
    if (!this.scheme) return;

    const shareData = {
      title: this.scheme.name || this.scheme.title,
      text: this.scheme.description,
      url: window.location.href,
    };

    if (typeof navigator.share === "function") {
      navigator.share(shareData).catch(() => {});
      return;
    }

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(window.location.href)
        .then(() => alert("Scheme URL copied to clipboard!"))
        .catch(() => alert("Unable to copy scheme URL."));
      return;
    }

    alert("Sharing is not supported by this browser.");
  }

  getStatusLabel(status: string): string {
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return "Not specified";
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  formatIncome(income: number | null): string {
    if (income === null || income === undefined) return "";
    return `₹${income.toLocaleString("en-IN")}`;
  }

  get benefits(): string[] {
    return this.scheme?.benefits || [];
  }

  get hasApplicationUrl(): boolean {
    return !!this.scheme?.application_url;
  }

  get hasDocument(): boolean {
    return !!this.scheme?.source_url || !!this.scheme?.application_url;
  }

  get hasEligibilityRules(): boolean {
    return this.eligibilityRules.length > 0;
  }

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

  isNoRestriction(value: string | null): boolean {
    if (!value) return true;
    return ["", "any", "all", "all india", "not applicable", "n/a"].includes(
      value.trim().toLowerCase(),
    );
  }

  goBack(): void {
    this.location.back();
  }

  private getErrorMessage(error: any): string {
    if (error?.error?.detail) {
      return error.error.detail;
    }
    if (error?.message) {
      return error.message;
    }
    return "Unable to load the scheme. Please try again.";
  }
}
