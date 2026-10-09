import { CommonModule, Location } from "@angular/common";
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectorRef,
} from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Subject, takeUntil, forkJoin, Observable } from "rxjs";

import { PolicyService } from "../../../core/services/policy.services";
import { SchemeService } from "../../../core/services/scheme.service";

import { PolicyResponse } from "../../../core/models/policy.model";
import { SchemeResponse } from "../../../core/models/scheme.model";

import { CompareItem, MAX_COMPARE_ITEMS } from "../compare-selection/compare-selection.component";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";

export type CompareEntity = PolicyResponse | SchemeResponse;

@Component({
  selector: "app-compare-results",
  standalone: true,
  imports: [CommonModule, BreadcrumbComponent],
  templateUrl: "./compare-results.component.html",
  styleUrls: ["./compare-results.component.scss"],
})
export class CompareResultsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);

  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Role-aware breadcrumb trail derived from the current dashboard URL:
   * Home > Compare > Compare Results. Hidden on the public guest view.
   */
  get breadcrumbItems(): BreadcrumbItem[] {
    const prefix = this.dashboardPrefix();
    if (!prefix) {
      return [];
    }
    return [
      { label: "Home", route: ["/dashboard", prefix] },
      { label: "Compare", route: ["/dashboard", prefix, "compare"] },
      { label: "Compare Results" },
    ];
  }

  private dashboardPrefix(): string | null {
    const match = /\/dashboard\/([^/]+)/.exec(this.router.url || "");
    if (!match) {
      return null;
    }
    const prefix = match[1].toLowerCase();
    if (prefix === "guest") {
      return null;
    }
    if (
      prefix === "admin" ||
      prefix === "government" ||
      prefix === "citizen" ||
      prefix === "researcher" ||
      prefix === "organization"
    ) {
      return prefix;
    }
    return null;
  }

  items: CompareItem[] = [];

  item1: CompareItem | null = null;
  item2: CompareItem | null = null;
  item3: CompareItem | null = null;

  data1: CompareEntity | null = null;
  data2: CompareEntity | null = null;
  data3: CompareEntity | null = null;

  loading = false;
  errorMessage = "";

  ngOnInit(): void {
    const navigation = window.history.state;

    if (
      !navigation?.items ||
      !Array.isArray(navigation.items) ||
      navigation.items.length < 2
    ) {
      this.errorMessage =
        "Please select at least two schemes or policies to compare.";

      this.loading = false;

      this.cdr.detectChanges();

      return;
    }

    /*
     * Only up to MAX_COMPARE_ITEMS records are supported.
     */
    if (navigation.items.length > MAX_COMPARE_ITEMS) {
      this.errorMessage = `You can compare a maximum of ${MAX_COMPARE_ITEMS} schemes or policies.`;

      this.loading = false;

      this.cdr.detectChanges();

      return;
    }

    /*
     * Validate the navigation state before making API requests.
     */
    const validItems = navigation.items.every(
      (item: CompareItem) =>
        item &&
        Number.isFinite(item.id) &&
        (item.type === "Policy" || item.type === "Scheme"),
    );

    if (!validItems) {
      this.errorMessage = "The selected comparison items are invalid.";

      this.loading = false;

      this.cdr.detectChanges();

      return;
    }

    this.items = navigation.items;

    this.item1 = this.items[0];
    this.item2 = this.items[1];

    this.item3 = this.items.length >= 3 ? this.items[2] : null;

    this.loadComparison();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadItem(item: CompareItem): Observable<CompareEntity> {
    if (item.type === "Policy") {
      return this.policyService.getPolicy(item.id);
    }

    return this.schemeService.getScheme(item.id);
  }

  loadComparison(): void {
    if (!this.item1 || !this.item2) {
      return;
    }

    this.loading = true;
    this.errorMessage = "";

    this.data1 = null;
    this.data2 = null;
    this.data3 = null;

    this.cdr.detectChanges();

    const requests: Observable<CompareEntity>[] = [
      this.loadItem(this.item1),
      this.loadItem(this.item2),
    ];

    if (this.item3) {
      requests.push(this.loadItem(this.item3));
    }

    forkJoin(requests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          const result1 = results[0];
          const result2 = results[1];
          const result3 = results.length >= 3 ? results[2] : null;

          /*
           * Compare must contain approved items only.
           * This also protects the Results page if someone
           * manually modifies browser history state.
           */
          if (
            !this.isApprovedEntity(result1) ||
            !this.isApprovedEntity(result2) ||
            (result3 !== null && !this.isApprovedEntity(result3))
          ) {
            this.data1 = null;
            this.data2 = null;
            this.data3 = null;

            this.errorMessage =
              "Only approved schemes and policies can be compared.";

            this.loading = false;

            this.cdr.detectChanges();

            return;
          }

          this.data1 = result1;
          this.data2 = result2;
          this.data3 = result3;

          this.loading = false;

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error("Failed to load comparison data:", error);

          const detail =
            error?.error?.detail ||
            error?.message ||
            "Failed to load details for the selected items.";

          this.errorMessage = detail;

          this.loading = false;

          this.cdr.detectChanges();
        },
      });
  }

  private isApprovedEntity(data: CompareEntity | null): data is CompareEntity {
    return !!data && String(data.status).toUpperCase() === "APPROVED";
  }

  isPolicy(data: CompareEntity | null): data is PolicyResponse {
    return !!data && "policy_id" in data;
  }

  isScheme(data: CompareEntity | null): data is SchemeResponse {
    return !!data && "scheme_id" in data;
  }

  getItemTitle(data: CompareEntity | null, item: CompareItem | null): string {
    if (this.isPolicy(data)) {
      return data.title || item?.title || "-";
    }

    if (this.isScheme(data)) {
      return data.name || data.title || item?.title || "-";
    }

    return item?.title || "-";
  }

  getItemMinistry(
    data: CompareEntity | null,
    item: CompareItem | null,
  ): string {
    return data?.ministry || item?.ministry || "-";
  }

  getIconType(
    item: CompareItem | null,
    data: CompareEntity | null,
  ): "education" | "health" | "agriculture" | "scheme" | "policy" {
    const textToMatch =
      `${item?.title || ""} ` +
      `${item?.category || ""} ` +
      `${data?.category || ""}`.toLowerCase();

    if (textToMatch.includes("education")) {
      return "education";
    }

    if (textToMatch.includes("health")) {
      return "health";
    }

    if (textToMatch.includes("agriculture")) {
      return "agriculture";
    }

    if (item?.type === "Scheme" || this.isScheme(data)) {
      return "scheme";
    }

    return "policy";
  }

  getIconSymbol(item: CompareItem | null, data: CompareEntity | null): string {
    const type = this.getIconType(item, data);

    switch (type) {
      case "education":
        return "school";

      case "health":
        return "medical_services";

      case "agriculture":
        return "eco";

      case "scheme":
        return "assignment";

      case "policy":
      default:
        return "account_balance";
    }
  }

  getValue(data: CompareEntity | null, field: string): string {
    if (!data) {
      return "-";
    }

    switch (field) {
      case "id":
        return this.isPolicy(data)
          ? String(data.policy_id)
          : String(data.scheme_id);

      case "title":
        return this.getItemTitle(data, null);

      case "type":
        return this.isPolicy(data) ? "Policy" : "Scheme";

      case "description":
        return data.description?.trim() || "-";

      case "ministry":
        return data.ministry?.trim() || "-";

      case "department":
        return data.department?.trim() || "-";

      case "category":
        return data.category?.trim() || "-";

      case "state":
        return data.state?.trim() || "-";

      case "sector":
        return this.isPolicy(data) && data.sector ? data.sector.trim() : "-";

      case "documents_required":
        return this.isScheme(data) && data.documents_required
          ? data.documents_required.trim()
          : "-";

      case "application_process":
        return this.isScheme(data) && data.application_process
          ? data.application_process.trim()
          : "-";

      case "publication_date":
        return this.isPolicy(data)
          ? this.formatDate(data.publication_date)
          : "-";

      case "effective_date":
        return this.isPolicy(data) ? this.formatDate(data.effective_date) : "-";

      default:
        return "-";
    }
  }

  getBenefits(data: CompareEntity | null): string[] {
    if (!data?.benefits) {
      return [];
    }

    if (Array.isArray(data.benefits)) {
      return data.benefits.filter(
        (benefit) => typeof benefit === "string" && benefit.trim().length > 0,
      );
    }

    return [];
  }

  getEligibilityRules(data: CompareEntity | null): string[] {
    if (!data?.eligibility_rules) {
      return [];
    }

    const rules = data.eligibility_rules;

    if (!Array.isArray(rules) || rules.length === 0) {
      return [];
    }

    const result: string[] = [];

    for (const rule of rules) {
      if (!rule) {
        continue;
      }

      if (typeof rule === "string") {
        result.push(rule);
        continue;
      }

      if (typeof rule !== "object") {
        continue;
      }

      const ruleType = rule["rule_type"];

      if (ruleType) {
        const typeLabel = String(ruleType).replace(/_/g, " ");

        if (ruleType === "AGE_CRITERIA") {
          const min =
            rule["min_age"] !== undefined && rule["min_age"] !== null
              ? rule["min_age"]
              : 0;

          const max =
            rule["max_age"] !== undefined && rule["max_age"] !== null
              ? ` - ${rule["max_age"]} years`
              : "+ years";

          result.push(`Age: ${min}${max}`);
        } else if (ruleType === "ANNUAL_INCOME_LIMIT") {
          const value = rule["value"];

          const formattedValue =
            typeof value === "number"
              ? `₹${value.toLocaleString("en-IN")}`
              : String(value ?? "-");

          result.push(`Income Limit: ${formattedValue}`);
        } else if (ruleType === "TARGET_BENEFICIARIES") {
          result.push(`Target Beneficiaries: ${String(rule["value"] ?? "-")}`);
        } else {
          const value =
            rule["value"] !== undefined ? `: ${String(rule["value"])}` : "";

          result.push(`${typeLabel}${value}`);
        }

        continue;
      }

      const parts: string[] = [];

      const minAge = rule["min_age"];
      const maxAge = rule["max_age"];

      if (minAge !== undefined || maxAge !== undefined) {
        const min = minAge !== undefined && minAge !== null ? minAge : 0;

        const max =
          maxAge !== undefined && maxAge !== null
            ? ` - ${maxAge} years`
            : "+ years";

        parts.push(`Age: ${min}${max}`);
      }

      const maxIncome = rule["max_income"];

      if (maxIncome !== undefined && maxIncome !== null) {
        const formattedIncome =
          typeof maxIncome === "number"
            ? `₹${maxIncome.toLocaleString("en-IN")}`
            : String(maxIncome);

        parts.push(`Max Income: ${formattedIncome}`);
      }

      const education = rule["education"];

      if (education && education !== "Any") {
        parts.push(`Education: ${education}`);
      }

      const gender = rule["gender"];

      if (gender && gender !== "Any") {
        parts.push(`Gender: ${gender}`);
      }

      const socialCategory = rule["social_category"];

      if (socialCategory && socialCategory !== "Any") {
        parts.push(`Category: ${socialCategory}`);
      }

      const occupation = rule["occupation"];

      if (occupation && occupation !== "Any") {
        parts.push(`Occupation: ${occupation}`);
      }

      const state = rule["state"];

      if (state && state !== "All India" && state !== "Central") {
        parts.push(`State: ${state}`);
      }

      if (parts.length > 0) {
        result.push(...parts);
      } else {
        const genericParts = Object.entries(rule)
          .filter(
            ([, value]) =>
              value !== null &&
              value !== undefined &&
              value !== "" &&
              value !== "Any",
          )
          .map(
            ([key, value]) =>
              `${key.replace(/_/g, " ")}: ${this.formatObjectValue(value)}`,
          );

        if (genericParts.length > 0) {
          result.push(genericParts.join(", "));
        }
      }
    }

    return result;
  }

  private formatObjectValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "-";
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.formatObjectValue(item)).join(", ");
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "-";
      }
    }

    return String(value);
  }

  /**
   * Whether a comparison cell holds displayable content. Empty means:
   * null, undefined, empty/whitespace-only strings, and the "-" / "—"
   * placeholders the getters emit for missing values. Numbers
   * (including 0), booleans, non-empty strings, valid dates and
   * non-empty arrays are meaningful.
   */
  hasMeaningfulValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    if (typeof value === "boolean") {
      return true;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed !== "" && trimmed !== "-" && trimmed !== "—";
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return true;
  }

  /**
   * Show a comparison row when at least one compared column carries a
   * meaningful value; hide it only when every column is empty.
   */
  showRow(...values: unknown[]): boolean {
    return values.some((value) => this.hasMeaningfulValue(value));
  }

  getDocumentUrl(data: CompareEntity | null): string | null {
    if (this.isPolicy(data) && data.document_url && data.document_url.trim()) {
      return data.document_url.trim();
    }

    return null;
  }

  getSourceUrl(data: CompareEntity | null): string | null {
    if (data?.source_url && data.source_url.trim()) {
      return data.source_url.trim();
    }

    return null;
  }

  getApplicationUrl(data: CompareEntity | null): string | null {
    if (
      this.isScheme(data) &&
      data.application_url &&
      data.application_url.trim()
    ) {
      return data.application_url.trim();
    }

    return null;
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr?.trim()) {
      return "-";
    }

    const date = new Date(dateStr);

    if (Number.isNaN(date.getTime())) {
      return dateStr;
    }

    return date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Open the existing Policy/Scheme details page for a compared item.
   * Reuses the role-based details routes (same as the Saved Items page):
   * /dashboard/:role/policies/:id or /dashboard/:role/schemes/:id.
   */
  viewDetails(item: CompareItem | null): void {
    if (
      !item ||
      !Number.isFinite(item.id) ||
      (item.type !== "Policy" && item.type !== "Scheme")
    ) {
      return;
    }

    const prefix = this.dashboardPrefix() ?? "guest";
    const section = item.type === "Policy" ? "policies" : "schemes";

    void this.router.navigate(["/dashboard", prefix, section, item.id]);
  }

  goBack(): void {
    this.location.back();
  }

  goToSelection(): void {
    this.router.navigate(["../"], {
      relativeTo: this.route,
    });
  }
}
