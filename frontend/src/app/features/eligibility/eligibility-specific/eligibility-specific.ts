import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { Subject, Subscription, finalize, takeUntil, timeout } from "rxjs";
import type { Observable } from "rxjs";
import {
  EligibilityCheckResponse,
  EligibilityProfile,
  EligibilityService,
  EntityType,
  SavedEligibilityResult,
} from "../eligibility.service";
import { PolicyService } from "../../../core/services/policy.services";
import { SchemeService } from "../../../core/services/scheme.service";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";

interface SelectableEntity {
  id: number;
  name: string;
  type: EntityType;
  description?: string;
  ministry?: string | null;
  category?: string | null;
  status?: string | null;
}

@Component({
  selector: "app-eligibility-specific",
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
  templateUrl: "./eligibility-specific.html",
  styleUrl: "./eligibility-specific.scss",
})
export class EligibilitySpecific implements OnInit, OnDestroy {
  entityType: EntityType = "scheme";

  selectedEntityId: number | null = null;
  selectedEntity: SelectableEntity | null = null;

  entities: SelectableEntity[] = [];

  /**
   * Per-type dropdown cache (component instance only, never shared).
   * Schemes and policies are fetched once each; switching back to an
   * already-loaded type renders instantly with no second request.
   * Public APPROVED listings plus instance lifetime make cross-user
   * leakage impossible; cleared again on init for reused instances.
   */
  private readonly entityCache = new Map<EntityType, SelectableEntity[]>();
  /** Cancels in-flight entity/check requests on switch or destroy. */
  private readonly destroy$ = new Subject<void>();
  private entitiesSub?: Subscription;

  /**
   * Fresh blank profile factory — same contract as the main checker:
   * the form always opens empty, never restored from storage, cache,
   * route state, or another user's values. The only preserved default
   * is the entity-type selector ('scheme').
   */
  private static blankProfile(): EligibilityProfile {
    return {
      age: null as unknown as number,
      gender: "",
      annual_income: null,
      occupation: null,
      education: null,
      state: null,
      social_category: null,
      disability_status: null,
    };
  }

  profile: EligibilityProfile = EligibilitySpecific.blankProfile();

  occupations: string[] = [
    "Student",
    "Farmer",
    "Self Employed",
    "Government Employee",
    "Private Employee",
    "Business Owner",
    "Daily Wage Worker",
    "Homemaker",
    "Unemployed",
    "Other",
  ];

  states: string[] = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
  ];

  genders: string[] = [
    "Female",
    "Male",
    "Other",
  ];

  educationLevels: string[] = [
    "10th Pass",
    "12th Pass",
    "Diploma",
    "Graduate",
    "Post Graduate",
    "PhD",
    "Other",
  ];

  socialCategories: string[] = [
    "General",
    "OBC",
    "SC",
    "ST",
    "EWS",
  ];

  loadingEntities = false;
  checking = false;
  savingResult = false;
  errorMessage = "";

  activeTab: "find" | "specific" | "saved" = "specific";

  result: EligibilityCheckResponse | null = null;

  /** Current user's server saved list (source for the Save button state). */
  savedResults: SavedEligibilityResult[] = [];

  toastMessage: string | null = null;
  toastType: "success" | "info" | "error" = "success";
  private toastTimeout: any = null;

  setTab(tab: "find" | "specific" | "saved"): void {
    this.activeTab = tab;
    if (tab === "find") {
      this.router.navigate(["/dashboard/citizen/eligibility"]);
    } else if (tab === "saved") {
      this.router.navigate(["/dashboard/citizen/eligibility"], {
        queryParams: { tab: "saved" },
      });
    }
  }

  constructor(
    private eligibilityService: EligibilityService,
    private policyService: PolicyService,
    private schemeService: SchemeService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * Breadcrumb trail: Home > Eligibility Checker > Check Specific.
   * Hidden on the public guest view.
   */
  get breadcrumbItems(): BreadcrumbItem[] {
    if ((this.router.url || "").includes("/dashboard/guest")) {
      return [];
    }
    return [
      { label: "Home", route: ["/dashboard/citizen"] },
      {
        label: "Eligibility Checker",
        route: ["/dashboard/citizen/eligibility"],
      },
      { label: "Check Specific" },
    ];
  }

  ngOnInit(): void {
    // Always open with a blank form, even if Angular reuses this
    // component instance when navigating between the checker tabs.
    this.profile = EligibilitySpecific.blankProfile();
    this.entityCache.clear();
    this.selectedEntityId = null;
    this.selectedEntity = null;
    this.result = null;
    this.errorMessage = "";
    this.loadEntities();
    this.loadSavedResults();
  }

  ngOnDestroy(): void {
    this.entitiesSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
  }

  /**
   * Whether the checker is rendered inside the guest dashboard.
   * Guests may check eligibility but cannot persist Saved Results.
   */
  get isGuestView(): boolean {
    return (this.router.url || "").includes("/dashboard/guest");
  }

  /**
   * Load the current user's server saved list (drives the Save button
   * state). Skipped for guests, who cannot persist results.
   */
  loadSavedResults(): void {
    if (this.isGuestView) {
      this.savedResults = [];
      return;
    }
    this.eligibilityService.getSavedResults().pipe(
      timeout(15000),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (results) => {
        this.savedResults = Array.isArray(results) ? results : [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.savedResults = [];
      },
    });
  }

  loadEntities(): void {
    // Cancel any in-flight list request (e.g. rapid Schemes↔Policies
    // switching) so a stale response can never overwrite the current
    // type or leave its loading flag behind.
    this.entitiesSub?.unsubscribe();
    this.entitiesSub = undefined;

    this.errorMessage = "";
    this.selectedEntity = null;
    this.selectedEntityId = null;
    this.result = null;

    // Already loaded during this visit: render immediately, no request.
    const cached = this.entityCache.get(this.entityType);
    if (cached) {
      this.entities = [...cached];
      this.loadingEntities = false;
      this.cdr.detectChanges();
      return;
    }

    this.loadingEntities = true;
    this.entities = [];

    this.cdr.detectChanges();

    // Bounded full-page fetch for the dropdown (backend max is 100).
    const listParams = { limit: 100 };
    const entities$: Observable<any> = this.entityType === "scheme"
      ? this.schemeService.getSchemes(listParams)
      : this.policyService.getPolicies(listParams);

    this.entitiesSub = entities$.pipe(
      timeout(15000),
      takeUntil(this.destroy$),
      finalize(() => {
        this.loadingEntities = false;
        this.cdr.detectChanges();
      }),
    ).subscribe({
        next: (response: any) => {
          const isScheme = this.entityType === "scheme";
          console.log(
            isScheme ? "Schemes response:" : "Policies response:",
            response
          );

          const items = Array.isArray(response)
            ? response
            : isScheme
              ? response?.schemes || []
              : response?.policies || [];

          this.entities = items
            .map((item: any) => ({
              id: Number(item.scheme_id ?? item.policy_id ?? item.id),
              name:
                item.name ??
                item.title ??
                (isScheme ? "Unnamed Scheme" : "Unnamed Policy"),
              type: this.entityType,
              description: item.description,
              ministry: item.ministry,
              category: item.category,
              status: item.status,
            }))
            .filter((entity: SelectableEntity) =>
              Number.isFinite(entity.id) && entity.id > 0
            );

          // Remember this type for instant re-selection (Cases A/B/C).
          this.entityCache.set(this.entityType, [...this.entities]);

          console.log("Available entities:", this.entities);

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error("Unable to load entities:", error);

          this.errorMessage =
            error?.name === "TimeoutError"
              ? "Loading is taking too long. Please try again."
              : error?.error?.detail ||
                (this.entityType === "scheme"
                  ? "Unable to load schemes. Please try again."
                  : "Unable to load policies. Please try again.");

          this.cdr.detectChanges();
        },
      });
  }

  onEntityTypeChange(): void {
    this.loadEntities();
  }

  onEntitySelected(): void {
    const selectedId = Number(this.selectedEntityId);

    this.selectedEntity =
      this.entities.find(
        (entity) => entity.id === selectedId
      ) || null;

    this.result = null;
    this.errorMessage = "";

    this.cdr.detectChanges();

    console.log(
      "Selected entity:",
      this.selectedEntity
    );
  }

  checkEligibility(): void {
    this.errorMessage = "";
    this.result = null;

    if (!this.selectedEntityId) {
      this.errorMessage =
        "Please select a scheme or policy.";
      this.cdr.detectChanges();
      return;
    }

    if (!this.isProfileValid()) {
      this.errorMessage =
        "Please enter a valid age between 0 and 120.";
      this.cdr.detectChanges();
      return;
    }

    this.checking = true;
    this.cdr.detectChanges();

    const request = {
      age: Number(this.profile.age),
      gender: this.profile.gender,
      annual_income:
        this.profile.annual_income === null ||
        this.profile.annual_income === undefined
          ? null
          : Number(this.profile.annual_income),
      occupation: this.profile.occupation || null,
      education: this.profile.education || null,
      state: this.profile.state || null,
      social_category:
        this.profile.social_category || null,
      disability_status:
        this.profile.disability_status ?? null,
      entity_type: this.entityType,
      entity_id: Number(this.selectedEntityId),
    };

    console.log(
      "Checking specific eligibility:",
      request
    );

    this.eligibilityService
      .checkEligibility(request)
      .pipe(
        timeout(15000),
        takeUntil(this.destroy$),
        finalize(() => {
          this.checking = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (response) => {
          console.log(
            "Eligibility check response:",
            response
          );

          this.result = response;

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            "Eligibility check error:",
            error
          );

          this.errorMessage =
            error?.name === "TimeoutError"
              ? "The eligibility service is taking too long to respond. Please try again."
              : error?.error?.detail ||
                "Unable to check eligibility. Please try again.";

          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Reset the whole form to blank (never to stored/profile values).
   * Clears the selected scheme/policy, the result and any error.
   * The entity-type selector keeps its default ('scheme').
   */
  reset(): void {
    this.profile = EligibilitySpecific.blankProfile();

    this.selectedEntityId = null;
    this.selectedEntity = null;
    this.result = null;
    this.errorMessage = "";

    this.cdr.detectChanges();
  }

  goBackToChecker(): void {
    this.router.navigate([
      "/dashboard/citizen/eligibility",
    ]);
  }

  get isEligible(): boolean {
    return this.result?.eligible === true;
  }

  get hasResult(): boolean {
    return this.result !== null;
  }

  private isProfileValid(): boolean {
    if (
      this.profile.age === null ||
      this.profile.age === undefined ||
      (typeof this.profile.age === "string" &&
        (this.profile.age as unknown as string).trim() === "")
    ) {
      return false;
    }
    const age = Number(this.profile.age);

    return (
      Number.isFinite(age) &&
      age >= 0 &&
      age <= 120
    );
  }

  isResultSaved(): boolean {
    if (!this.result) return false;
    return this.savedResults.some(
      (item) =>
        item.entity_type === this.result?.entity_type &&
        item.entity_id === this.result?.entity_id
    );
  }

  toggleSaveResult(): void {
    if (!this.result || this.savingResult || this.isGuestView) return;
    const result = this.result;
    const existing = this.savedResults.find(
      (item) =>
        item.entity_type === result.entity_type &&
        item.entity_id === result.entity_id
    );
    this.savingResult = true;
    this.cdr.detectChanges();

    const done = () => {
      this.savingResult = false;
      this.cdr.detectChanges();
    };

    if (existing) {
      this.eligibilityService.removeSavedResult(existing.saved_id).pipe(
        finalize(done),
      ).subscribe({
        next: () => {
          this.savedResults = this.savedResults.filter(
            (item) => item.saved_id !== existing.saved_id
          );
          this.showToast(`Removed '${result.entity_name}' from Saved Results.`, "info");
        },
        error: (error) => {
          this.showToast(
            error?.error?.detail || "Unable to remove the saved result. Please try again.",
            "error",
          );
        },
      });
    } else {
      this.eligibilityService.saveResult(
        result.entity_type,
        result.entity_id,
        this.profile
      ).pipe(
        finalize(done),
      ).subscribe({
        next: (created) => {
          const index = this.savedResults.findIndex(
            (item) => item.saved_id === created.saved_id
          );
          if (index >= 0) {
            this.savedResults = this.savedResults.map((item, i) =>
              i === index ? created : item
            );
          } else {
            this.savedResults = [created, ...this.savedResults];
          }
          this.showToast(`Saved '${result.entity_name}' to Saved Results.`, "success");
        },
        error: (error) => {
          this.showToast(
            error?.error?.detail || "Unable to save the result. Please try again.",
            "error",
          );
        },
      });
    }
  }

  showToast(message: string, type: "success" | "info" | "error" = "success"): void {
    this.toastMessage = message;
    this.toastType = type;
    this.cdr.detectChanges();
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = null;
      this.cdr.detectChanges();
    }, 3500);
  }
}
