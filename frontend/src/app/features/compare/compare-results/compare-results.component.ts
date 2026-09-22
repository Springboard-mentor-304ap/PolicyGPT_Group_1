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
import { CompareItem } from "../compare-selection/compare-selection.component";

export type CompareEntity = PolicyResponse | SchemeResponse;

@Component({
  selector: "app-compare-results",
  standalone: true,
  imports: [CommonModule],
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

    if (!navigation?.items || !Array.isArray(navigation.items) || navigation.items.length < 2) {
      this.errorMessage = "Please select at least two schemes or policies to compare.";
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    this.items = navigation.items;
    this.item1 = this.items[0];
    this.item2 = this.items[1];

    if (this.items.length >= 3) {
      this.item3 = this.items[2];
    }

    this.loadComparison();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadItem(item: CompareItem): Observable<CompareEntity> {
    if (item.type === "Policy") {
      return this.policyService.getPolicy(item.id);
    } else {
      return this.schemeService.getScheme(item.id);
    }
  }

  loadComparison(): void {
    if (!this.item1 || !this.item2) {
      return;
    }

    this.loading = true;
    this.errorMessage = "";
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
          this.data1 = results[0];
          this.data2 = results[1];
          if (results.length >= 3) {
            this.data3 = results[2];
          }
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

  getItemMinistry(data: CompareEntity | null, item: CompareItem | null): string {
    return data?.ministry || item?.ministry || "-";
  }

  getIconType(
    item: CompareItem | null,
    data: CompareEntity | null,
  ): "education" | "health" | "agriculture" | "scheme" | "policy" {
    const textToMatch = `${item?.title || ""} ${item?.category || ""} ${data?.category || ""}`.toLowerCase();

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

  getIconSymbol(
    item: CompareItem | null,
    data: CompareEntity | null,
  ): string {
    const type = this.getIconType(item, data);
    switch (type) {
      case "education":
        return "🎓";
      case "health":
        return "❤️";
      case "agriculture":
        return "🌱";
      case "scheme":
        return "📋";
      case "policy":
      default:
        return "🏛️";
    }
  }

  getValue(data: CompareEntity | null, field: string): string {
    if (!data) return "-";

    switch (field) {
      case "id":
        return this.isPolicy(data) ? String(data.policy_id) : String(data.scheme_id);

      case "title":
        return this.getItemTitle(data, null);

      case "type":
        return this.isPolicy(data) ? "Policy" : "Scheme";

      case "description":
        return data.description ? data.description.trim() : "-";

      case "ministry":
        return data.ministry ? data.ministry.trim() : "-";

      case "department":
        return data.department ? data.department.trim() : "-";

      case "category":
        return data.category ? data.category.trim() : "-";

      case "state":
        return data.state ? data.state.trim() : "-";

      case "sector":
        return this.isPolicy(data) && data.sector ? data.sector.trim() : "-";

      case "status":
        return this.formatStatus(data.status);

      case "documents_required":
        return this.isScheme(data) && data.documents_required
          ? data.documents_required.trim()
          : "-";

      case "application_process":
        return this.isScheme(data) && data.application_process
          ? data.application_process.trim()
          : "-";

      case "publication_date":
        return this.isPolicy(data) ? this.formatDate(data.publication_date) : "-";

      case "effective_date":
        return this.isPolicy(data) ? this.formatDate(data.effective_date) : "-";

      default:
        return "-";
    }
  }

  getBenefits(data: CompareEntity | null): string[] {
    if (!data || !data.benefits) return [];
    if (Array.isArray(data.benefits)) {
      return data.benefits.filter((b) => typeof b === "string" && b.trim().length > 0);
    }
    return [];
  }

  getEligibilityRules(data: CompareEntity | null): string[] {
    if (!data || !data.eligibility_rules) return [];
    const rules = data.eligibility_rules;
    if (!Array.isArray(rules) || rules.length === 0) return [];

    const result: string[] = [];

    for (const rule of rules) {
      if (!rule) continue;

      if (typeof rule === "string") {
        result.push(rule);
        continue;
      }

      if (typeof rule === "object") {
        const ruleType = rule['rule_type'];
        if (ruleType) {
          const typeLabel = String(ruleType).replace(/_/g, " ");

          if (ruleType === "AGE_CRITERIA") {
            const min = rule['min_age'] !== undefined && rule['min_age'] !== null ? rule['min_age'] : 0;
            const max = rule['max_age'] ? ` - ${rule['max_age']} years` : "+ years";
            result.push(`Age: ${min}${max}`);
          } else if (ruleType === "ANNUAL_INCOME_LIMIT") {
            const val =
              typeof rule['value'] === "number"
                ? `₹${Number(rule['value']).toLocaleString("en-IN")}`
                : rule['value'];
            result.push(`Income Limit: ${val}`);
          } else if (ruleType === "TARGET_BENEFICIARIES") {
            result.push(`Target Beneficiaries: ${rule['value']}`);
          } else {
            const val = rule['value'] !== undefined ? `: ${rule['value']}` : "";
            result.push(`${typeLabel}${val}`);
          }
        } else {
          // Schema style criteria
          const parts: string[] = [];

          const minAge = rule['min_age'];
          const maxAge = rule['max_age'];
          if (minAge !== undefined || maxAge !== undefined) {
            const min = minAge !== undefined && minAge !== null ? minAge : 0;
            const max = maxAge ? ` - ${maxAge} years` : "+ years";
            parts.push(`Age: ${min}${max}`);
          }

          const maxIncome = rule['max_income'];
          if (maxIncome !== undefined && maxIncome !== null) {
            const inc =
              typeof maxIncome === "number"
                ? `₹${Number(maxIncome).toLocaleString("en-IN")}`
                : maxIncome;
            parts.push(`Max Income: ${inc}`);
          }

          const education = rule['education'];
          if (education && education !== "Any") {
            parts.push(`Education: ${education}`);
          }

          const gender = rule['gender'];
          if (gender && gender !== "Any") {
            parts.push(`Gender: ${gender}`);
          }

          const socialCat = rule['social_category'];
          if (socialCat && socialCat !== "Any") {
            parts.push(`Category: ${socialCat}`);
          }

          const occ = rule['occupation'];
          if (occ && occ !== "Any") {
            parts.push(`Occupation: ${occ}`);
          }

          const st = rule['state'];
          if (st && st !== "All India" && st !== "Central") {
            parts.push(`State: ${st}`);
          }

          if (parts.length > 0) {
            result.push(...parts);
          } else {
            // Generic object fallback that avoids [object Object]
            const genericParts = Object.entries(rule)
              .filter(([_, v]) => v !== null && v !== undefined && v !== "" && v !== "Any")
              .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
            if (genericParts.length > 0) {
              result.push(genericParts.join(", "));
            }
          }
        }
      }
    }

    return result;
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
    if (this.isScheme(data) && data.application_url && data.application_url.trim()) {
      return data.application_url.trim();
    }
    return null;
  }

  formatStatus(status?: string | null): string {
    if (!status) return "-";
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr || !dateStr.trim()) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
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
