import { CommonModule } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Subject, catchError, finalize, forkJoin, of, takeUntil } from "rxjs";

import { Auth } from "../../../core/services/auth";
import { NavigationContextService } from "../../../core/services/navigation-context.service";
import { PolicyService } from "../../../core/services/policy.service";
import { SchemeService } from "../../../core/services/scheme.service";
import { CategoryIconComponent } from "../../../shared/components/category-icon/category-icon.component";
import {
  PolicyListResponse,
  PolicyResponse,
} from "../../../core/models/policy.model";
import {
  SchemeListResponse,
  SchemeResponse,
} from "../../../core/models/scheme.model";

/* =========================================================
   COMBINED SEARCH (all authenticated roles)
   Shared counterpart of the Guest combined search experience:
   query-driven combined policy + scheme results with All /
   Policies / Schemes tabs, result cards, counts, and clear.
   Rendered inside each role's own dashboard layout (route
   /dashboard/<role>/search); the Guest page itself is untouched.
   Visibility is enforced server-side by the existing list APIs,
   so every role only ever sees records it may access.
   Search-section styling is shared with the Guest stylesheet
   (single source of truth, scoped per component by Angular).
   ========================================================= */

@Component({
  selector: "app-combined-search",
  standalone: true,
  imports: [CommonModule, FormsModule, CategoryIconComponent],
  templateUrl: "./combined-search.component.html",
  styleUrls: [
    "./combined-search.component.scss",
    "../../auth/dashboard/guest/guest.component.scss",
  ],
})
export class CombinedSearchComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(Auth);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);
  private readonly navContext = inject(NavigationContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  searchQuery = "";
  activeSearchTerm = "";
  hasSearched = false;
  loading = false;
  errorMessage = "";

  policies: PolicyResponse[] = [];
  schemes: SchemeResponse[] = [];
  totalPolicies = 0;
  totalSchemes = 0;

  activeTab: "all" | "policies" | "schemes" = "all";

  /** dashboard/<prefix> segment for detail + list navigation. */
  rolePrefix = "citizen";

  ngOnInit(): void {
    this.rolePrefix = this.resolveRolePrefix();
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        const q = params["q"];
        if (typeof q === "string" && q.trim()) {
          this.searchQuery = q.trim();
          this.executeSearch(this.searchQuery);
        } else {
          this.searchQuery = "";
          this.activeSearchTerm = "";
          this.hasSearched = false;
          this.policies = [];
          this.schemes = [];
          this.totalPolicies = 0;
          this.totalSchemes = 0;
          this.errorMessage = "";
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private resolveRolePrefix(): string {
    const role = String(this.authService.getUserRole() || "")
      .trim()
      .toUpperCase();
    switch (role) {
      case "ADMIN":
      case "ADMINISTRATOR":
        return "admin";
      case "GOVERNMENT":
      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT_OFFICER":
        return "government";
      case "RESEARCHER":
        return "researcher";
      case "ORGANIZATION":
      case "ORGANISATION":
        return "organization";
      case "CITIZEN":
        return "citizen";
      default:
        break;
    }
    const url = this.router.url || "";
    if (url.includes("/dashboard/admin")) return "admin";
    if (url.includes("/dashboard/government")) return "government";
    if (url.includes("/dashboard/researcher")) return "researcher";
    if (url.includes("/dashboard/organization")) return "organization";
    return "citizen";
  }

  setActiveTab(tab: "all" | "policies" | "schemes"): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  onSearch(query: string): void {
    const search = (query || "").trim();
    if (!search) {
      return;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: search },
    });
  }

  clearSearch(): void {
    this.searchQuery = "";
    this.activeSearchTerm = "";
    this.hasSearched = false;
    this.policies = [];
    this.schemes = [];
    this.totalPolicies = 0;
    this.totalSchemes = 0;
    this.errorMessage = "";
    this.loading = false;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: null },
      queryParamsHandling: "merge",
    });
  }

  executeSearch(query: string): void {
    this.activeSearchTerm = query;
    this.hasSearched = true;
    this.loading = true;
    this.errorMessage = "";
    this.cdr.detectChanges();

    forkJoin({
      policies: this.policyService
        .getPolicies({ search: query, status: "APPROVED", limit: 6 })
        .pipe(
          catchError(() => {
            return of({
              policies: [],
              total: 0,
              page: 1,
              pages: 1,
              limit: 6,
            } as PolicyListResponse);
          }),
        ),
      schemes: this.schemeService
        .getSchemes({ keyword: query, status: "APPROVED", limit: 6 })
        .pipe(
          catchError(() => {
            return of({
              schemes: [],
              total: 0,
              page: 1,
              pages: 1,
              limit: 6,
            } as SchemeListResponse);
          }),
        ),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          const pList = Array.isArray(res.policies?.policies)
            ? res.policies.policies
            : [];
          this.policies = pList;
          this.totalPolicies =
            typeof res.policies?.total === "number"
              ? res.policies.total
              : this.policies.length;

          const sList = Array.isArray(res.schemes?.schemes)
            ? res.schemes.schemes
            : [];
          this.schemes = sList;
          this.totalSchemes =
            typeof res.schemes?.total === "number"
              ? res.schemes.total
              : this.schemes.length;

          this.cdr.detectChanges();
        },
        error: () => {
          this.errorMessage =
            "Unable to load search results. Please try again.";
          this.policies = [];
          this.schemes = [];
          this.totalPolicies = 0;
          this.totalSchemes = 0;
          this.cdr.detectChanges();
        },
      });
  }

  viewPolicy(id: number | string): void {
    this.router.navigate(["/dashboard", this.rolePrefix, "policies", id]);
  }

  viewScheme(id: number | string): void {
    this.router.navigate(["/dashboard", this.rolePrefix, "schemes", id]);
  }

  goToPolicies(): void {
    const q = (this.activeSearchTerm || this.searchQuery || "").trim();
    this.navContext.markActionSource();
    this.router.navigate(["/dashboard", this.rolePrefix, "policies/search"], {
      queryParams: q ? { q } : {},
    });
  }

  goToSchemes(): void {
    const q = (this.activeSearchTerm || this.searchQuery || "").trim();
    this.navContext.markActionSource();
    this.router.navigate(["/dashboard", this.rolePrefix, "schemes"], {
      queryParams: q ? { q } : {},
    });
  }
}
