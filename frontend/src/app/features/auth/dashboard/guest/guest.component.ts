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

import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { CategoryIconComponent } from "../../../../shared/components/category-icon/category-icon.component";
import {
  PolicyListResponse,
  PolicyResponse,
} from "../../../../core/models/policy.model";
import {
  SchemeListResponse,
  SchemeResponse,
} from "../../../../core/models/scheme.model";

@Component({
  selector: "app-guest",
  standalone: true,
  imports: [CommonModule, FormsModule, CategoryIconComponent],
  templateUrl: "./guest.component.html",
  styleUrl: "./guest.component.scss",
})
export class GuestComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  // =========================================================
  // SEARCH STATE
  // =========================================================

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

  setActiveTab(tab: "all" | "policies" | "schemes"): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  // =========================================================
  // LIFECYCLE
  // =========================================================

  ngOnInit(): void {
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

  // =========================================================
  // SEARCH ACTIONS
  // =========================================================

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
          catchError((err) => {
            console.error("[GUEST] Policy search error:", err);
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
          catchError((err) => {
            console.error("[GUEST] Scheme search error:", err);
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
          this.policies = pList.filter(
            (p) =>
              String(p?.status || "")
                .trim()
                .toUpperCase() === "APPROVED",
          );
          this.totalPolicies =
            typeof res.policies?.total === "number"
              ? res.policies.total
              : this.policies.length;

          const sList = Array.isArray(res.schemes?.schemes)
            ? res.schemes.schemes
            : [];
          this.schemes = sList.filter(
            (s) =>
              String(s?.status || "")
                .trim()
                .toUpperCase() === "APPROVED",
          );
          this.totalSchemes =
            typeof res.schemes?.total === "number"
              ? res.schemes.total
              : this.schemes.length;

          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error("[GUEST] Combined search error:", err);
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

  // =========================================================
  // CARD DETAILS NAVIGATION
  // =========================================================

  viewPolicy(id: number | string): void {
    this.router.navigate(["/dashboard/guest/policies", id]);
  }

  viewScheme(id: number | string): void {
    this.router.navigate(["/dashboard/guest/schemes", id]);
  }

  // =========================================================
  // GUEST NAVIGATION (PRESERVE GUEST LAYOUT)
  // =========================================================

  goToPolicies(): void {
    const q = (this.activeSearchTerm || this.searchQuery || "").trim();
    if (q) {
      this.router.navigate(["/dashboard/guest/policies/search"], {
        queryParams: { q },
      });
    } else {
      this.router.navigate(["/dashboard/guest/policies/search"]);
    }
  }

  goToSchemes(): void {
    const q = (this.activeSearchTerm || this.searchQuery || "").trim();
    if (q) {
      this.router.navigate(["/dashboard/guest/schemes"], {
        queryParams: { q },
      });
    } else {
      this.router.navigate(["/dashboard/guest/schemes"]);
    }
  }

  goToLogin(): void {
    this.router.navigate(["/auth/login"]);
  }

  goToSignup(): void {
    this.router.navigate(["/auth/register"]);
  }
}
