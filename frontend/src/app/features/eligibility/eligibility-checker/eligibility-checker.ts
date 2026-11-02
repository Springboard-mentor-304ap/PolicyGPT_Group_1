import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { forkJoin, timeout, finalize, Subscription } from "rxjs";

import {
  EligibilityMatchResponse,
  EligibilityProfile,
  EligibilityService,
  EntityType,
  MatchedEntity,
  SavedEligibilityResult,
} from "../eligibility.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";

@Component({
  selector: "app-eligibility-checker",
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent, BreadcrumbComponent, SearchableSelectComponent],
  templateUrl: "./eligibility-checker.html",
  styleUrl: "./eligibility-checker.scss",
})
export class EligibilityChecker implements OnInit {
  activeTab: "find" | "specific" | "saved" = "find";

  /**
   * Fresh blank profile factory. The checker must always open with an
   * empty form — never restored from a previous submission, storage,
   * cache, route state, or another user's values. The component holds
   * no profile state outside this object, so a new instance (created
   * on every navigation to this route) is inherently blank and
   * user-isolated; ngOnInit re-applies it for reused instances.
   */
  private static blankProfile(): EligibilityProfile {
    return {
      age: null as unknown as number,
      gender: "",
      annual_income: null,
      occupation: "",
      education: "",
      state: "",
      social_category: "",
      disability_status: null,
    };
  }

  profile: EligibilityProfile = EligibilityChecker.blankProfile();

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

  loading = false;
  errorMessage = "";
  hasChecked = false;

  schemeResults: MatchedEntity[] = [];
  policyResults: MatchedEntity[] = [];

  schemeResponse: EligibilityMatchResponse | null = null;
  policyResponse: EligibilityMatchResponse | null = null;

  savedResults: SavedEligibilityResult[] = [];
  loadingSaved = false;
  savedError = "";
  /** When the server list was last confirmed fresh (load or mutation). */
  private savedLoadedAt: number | null = null;
  /** Freshness window: tab switches inside it reuse the loaded list. */
  private static readonly SAVED_FRESH_MS = 60_000;
  /** Composite key (type_id) of the row currently being saved/removed. */
  savingKey: string | null = null;
  deleteModalOpen = false;
  itemToDelete: SavedEligibilityResult | null = null;

  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly eligibilityService = inject(EligibilityService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toastService = inject(ToastService);

  /**
   * Breadcrumb trail: Home > Eligibility Checker.
   * Hidden on the public guest view (guest pages must not show
   * authenticated-dashboard breadcrumbs).
   */
  get breadcrumbItems(): BreadcrumbItem[] {
    if ((this.router.url || "").includes("/dashboard/guest")) {
      return [];
    }
    return [
      { label: "Home", route: ["/dashboard/citizen"] },
      { label: "Eligibility Checker" },
    ];
  }

  ngOnInit(): void {
    // Always start from a blank form, even if Angular reuses this
    // component instance when navigating (e.g. sidebar re-entry).
    this.profile = EligibilityChecker.blankProfile();
    this.hasChecked = false;
    this.errorMessage = "";
    this.loadSavedResults();

    this.route?.queryParams.subscribe((params) => {
      if (params && params["tab"] === "saved") {
        this.activeTab = "saved";
        this.loadSavedResults();
        this.cdr.detectChanges();
      } else if (params && params["tab"] === "find") {
        this.activeTab = "find";
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Find schemes and policies matching the user's profile.
   */
  findEligible(): void {
    // Prevent duplicate submissions: ignore while a check is in flight.
    if (this.loading) {
      return;
    }
    console.log("=================================");
    console.log("Eligibility search started");
    console.log("Profile:", this.profile);
    console.log("=================================");

    this.errorMessage = "";

    if (!this.isProfileValid()) {
      this.errorMessage =
        "Please enter a valid age between 0 and 120.";

      this.cdr.detectChanges();
      return;
    }

    this.hasChecked = true;
    this.loading = true;

    // Clear previous results
    this.schemeResults = [];
    this.policyResults = [];
    this.schemeResponse = null;
    this.policyResponse = null;

    this.cdr.detectChanges();

    /*
     * Call both APIs at the same time:
     * 1. /eligibility/match for schemes
     * 2. /eligibility/match for policies
     */
    const schemeRequest =
      this.eligibilityService
        .findEligible(this.profile, "scheme")
        .pipe(timeout(15000));

    const policyRequest =
      this.eligibilityService
        .findEligible(this.profile, "policy")
        .pipe(timeout(15000));

    forkJoin({
      schemes: schemeRequest,
      policies: policyRequest,
    })
      .pipe(
        finalize(() => {
          console.log("Eligibility request finished.");

          this.loading = false;

          /*
           * Force Angular to update the UI.
           * This fixes the issue where the API succeeds
           * but the page keeps showing "Checking Eligibility..."
           */
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (response) => {
          console.log(
            "FULL ELIGIBILITY RESPONSE:",
            response
          );

          console.log(
            "SCHEME RESPONSE:",
            response?.schemes
          );

          console.log(
            "POLICY RESPONSE:",
            response?.policies
          );

          try {
            const schemes = response?.schemes;
            const policies = response?.policies;

            this.schemeResponse = schemes || null;
            this.policyResponse = policies || null;

            this.schemeResults =
              Array.isArray(
                schemes?.eligible_entities
              )
                ? schemes.eligible_entities
                : [];

            this.policyResults =
              Array.isArray(
                policies?.eligible_entities
              )
                ? policies.eligible_entities
                : [];

            console.log(
              "Eligible schemes:",
              this.schemeResults
            );

            console.log(
              "Eligible policies:",
              this.policyResults
            );

            /*
             * If there are no eligible results,
             * don't show an API error.
             * The HTML can display the "No results" state.
             */
            if (
              this.schemeResults.length === 0 &&
              this.policyResults.length === 0
            ) {
              this.errorMessage = "";
            }

            this.cdr.detectChanges();
          } catch (error) {
            console.error(
              "Error processing eligibility response:",
              error
            );

            this.errorMessage =
              "The eligibility response could not be displayed.";

            this.cdr.detectChanges();
          }
        },

        error: (error) => {
          console.error(
            "Eligibility API error:",
            error
          );

          if (error?.name === "TimeoutError") {
            this.errorMessage =
              "The eligibility service is taking too long to respond. Please try again.";
          } else if (error?.status === 401) {
            this.errorMessage =
              "Your session has expired. Please login again.";
          } else if (error?.status === 403) {
            this.errorMessage =
              "You are not authorized to use the eligibility checker.";
          } else if (error?.error?.detail) {
            this.errorMessage =
              error.error.detail;
          } else {
            this.errorMessage =
              "Unable to check eligibility. Please try again.";
          }

          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Open the Specific Scheme / Policy Eligibility Checker page.
   */
  openSpecificChecker(): void {
    this.router.navigate([
      "/dashboard/citizen/eligibility/check",
    ]);
  }

  /**
   * Change Eligibility Checker tab.
   */
  setTab(
    tab: "find" | "specific" | "saved"
  ): void {
    this.activeTab = tab;

    if (tab === "saved") {
      // Reuse the loaded list when fresh (ngOnInit already fetched it);
      // refresh only when stale, never fired, or previously failed.
      this.loadSavedResults();
    } else if (tab === "specific") {
      this.openSpecificChecker();
    }
  }

  /**
   * Whether the checker is rendered inside the guest dashboard.
   * Guests may check eligibility but cannot persist Saved Results
   * (server rejects their role, mirroring Saved Items).
   */
  get isGuestView(): boolean {
    return (this.router.url || "").includes("/dashboard/guest");
  }

  /**
   * Load the current user's saved eligibility results from the server.
   * The server list is the single source of truth — nothing is read
   * from shared browser storage, so results can never leak across users.
   * Skips when a load is already in flight or the list is still fresh,
   * so tab switches don't fire duplicate GETs; mutations always apply
   * their server response locally instead of refetching.
   */
  loadSavedResults(force = false): void {
    if (this.isGuestView) {
      this.savedResults = [];
      this.loadingSaved = false;
      this.savedError = "";
      return;
    }
    if (this.loadingSaved) {
      return;
    }
    if (
      !force &&
      !this.savedError &&
      this.savedLoadedAt !== null &&
      Date.now() - this.savedLoadedAt <
        EligibilityChecker.SAVED_FRESH_MS
    ) {
      return;
    }
    this.loadingSaved = true;
    this.savedError = "";

    this.eligibilityService.getSavedResults().pipe(
      timeout(15000),
      finalize(() => {
        this.loadingSaved = false;
        this.cdr.detectChanges();
      }),
    ).subscribe({
      next: (results) => {
        this.savedResults = Array.isArray(results) ? results : [];
        this.savedLoadedAt = Date.now();
      },
      error: (error) => {
        this.savedError =
          error?.name === "TimeoutError"
            ? "Saved Results took too long to load. Please try again."
            : error?.error?.detail ||
              "Unable to load Saved Results. Please try again.";
      },
    });
  }

  /**
   * Check whether an entity is in the current user's server saved list.
   */
  isSaved(type: EntityType, id: number): boolean {
    return this.savedResults.some(
      (item) => item.entity_type === type && item.entity_id === id
    );
  }

  /**
   * Save or remove an eligibility result on the server, sending the
   * current form profile so the backend stores the evaluated outcome
   * with its input snapshot. The server response updates the list
   * locally — no refetch chain — so badge and list stay consistent.
   */
  toggleSave(type: EntityType, entity: MatchedEntity): void {
    if (this.isGuestView || this.savingKey) {
      return;
    }
    const key = `${type}_${entity.entity_id}`;
    const existing = this.savedResults.find(
      (item) => item.entity_type === type && item.entity_id === entity.entity_id
    );
    this.savingKey = key;
    this.cdr.detectChanges();

    const done = () => {
      this.savingKey = null;
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
          this.savedLoadedAt = Date.now();
          this.showToast(`Removed '${entity.entity_name}' from Saved Results.`, "info");
        },
        error: (error) => {
          this.showToast(
            error?.error?.detail || "Unable to remove the saved result. Please try again.",
            "error",
          );
        },
      });
    } else {
      this.eligibilityService.saveResult(type, entity.entity_id, this.profile).pipe(
        finalize(done),
      ).subscribe({
        next: (created) => {
          this.upsertSavedRow(created);
          this.savedLoadedAt = Date.now();
          this.showToast(`Saved '${entity.entity_name}' to Saved Results.`, "success");
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

  /** Insert or replace one server-confirmed row (newest first). */
  private upsertSavedRow(row: SavedEligibilityResult): void {
    const index = this.savedResults.findIndex(
      (item) => item.saved_id === row.saved_id
    );
    if (index >= 0) {
      this.savedResults = this.savedResults.map((item, i) =>
        i === index ? row : item
      );
    } else {
      this.savedResults = [row, ...this.savedResults];
    }
  }

  /**
   * Open the confirmation modal to delete a saved result.
   */
  openDeleteModal(item: SavedEligibilityResult): void {
    this.itemToDelete = item;
    this.deleteModalOpen = true;
    this.cdr.detectChanges();
  }

  /**
   * Confirm deletion of the saved result.
   */
  confirmDelete(): void {
    if (!this.itemToDelete || this.savingKey) {
      return;
    }
    const name = this.itemToDelete.entity_name;
    const savedId = this.itemToDelete.saved_id;
    this.savingKey = `saved_${savedId}`;
    this.deleteModalOpen = false;
    this.cdr.detectChanges();

    this.eligibilityService.removeSavedResult(savedId).pipe(
      finalize(() => {
        this.savingKey = null;
        this.itemToDelete = null;
        this.cdr.detectChanges();
      }),
    ).subscribe({
      next: () => {
        this.savedResults = this.savedResults.filter(
          (item) => item.saved_id !== savedId
        );
        this.savedLoadedAt = Date.now();
        this.showToast(`Removed '${name}' from Saved Results.`, "info");
      },
      error: (error) => {
        this.showToast(
          error?.error?.detail || "Unable to remove the saved result. Please try again.",
          "error",
        );
      },
    });
  }

  /**
   * Cancel deletion modal.
   */
  cancelDelete(): void {
    this.deleteModalOpen = false;
    this.itemToDelete = null;
    this.cdr.detectChanges();
  }

  /**
   * Navigate to the details page for a scheme or policy.
   */
  viewEntity(type: EntityType, id: number): void {
    if (type === "scheme") {
      this.router.navigate(["/dashboard/citizen/schemes", id]);
    } else {
      this.router.navigate(["/dashboard/citizen/policies", id]);
    }
  }

  /**
   * Format saved date for display.
   */
  formatSavedDate(isoDate: string): string {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * Compact summary of the stored input snapshot, e.g.
   * "Age 30 · Female · West Bengal".
   */
  profileSummary(item: SavedEligibilityResult): string {
    const profile = item.profile_data as Record<string, unknown> | null;
    if (!profile) {
      return "";
    }
    const parts: string[] = [];
    if (profile["age"] !== null && profile["age"] !== undefined && profile["age"] !== "") {
      parts.push(`Age ${profile["age"]}`);
    }
    for (const key of ["gender", "state", "occupation"]) {
      const value = profile[key];
      if (typeof value === "string" && value.trim()) {
        parts.push(value.trim());
      }
    }
    return parts.join(" · ");
  }

  /**
   * Track by saved item id.
   */
  trackBySaved(index: number, item: SavedEligibilityResult): number {
    return item.saved_id;
  }

  /**
   * Display temporary toast alert.
   */
  showToast(message: string, type: "success" | "info" | "error" = "success"): void {
    if (type === "error") {
      this.toastService.error(message);
    } else if (type === "info") {
      this.toastService.info(message);
    } else {
      this.toastService.success(message);
    }
  }

  /**
   * Used by *ngFor for better rendering performance.
   */
  trackByEntity(
    index: number,
    item: MatchedEntity
  ): number {
    return item.entity_id;
  }

  /**
   * Total number of eligible schemes + policies.
   */
  get totalEligibleResults(): number {
    return (
      this.schemeResults.length +
      this.policyResults.length
    );
  }

  /**
   * Whether at least one eligible result exists.
   */
  get hasResults(): boolean {
    return this.totalEligibleResults > 0;
  }

  /**
   * Total number of entities checked.
   */
  get totalChecked(): number {
    return (
      (this.schemeResponse?.total_checked || 0) +
      (this.policyResponse?.total_checked || 0)
    );
  }

  /**
   * Validate the profile before calling the backend.
   * A blank (not-yet-entered) age is rejected with the same message;
   * the field is marked required in the template.
   */
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
}
