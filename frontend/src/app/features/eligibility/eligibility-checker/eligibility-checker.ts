import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { forkJoin, timeout, finalize } from "rxjs";

import {
  EligibilityMatchResponse,
  EligibilityProfile,
  EligibilityService,
  EntityType,
  MatchedEntity,
  SavedEligibilityResult,
} from "../eligibility.service";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";

@Component({
  selector: "app-eligibility-checker",
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent, BreadcrumbComponent],
  templateUrl: "./eligibility-checker.html",
  styleUrl: "./eligibility-checker.scss",
})
export class EligibilityChecker implements OnInit {
  activeTab: "find" | "specific" | "saved" = "find";

  profile: EligibilityProfile = {
    age: 22,
    gender: "Female",
    annual_income: 250000,
    occupation: "Student",
    education: "Graduate",
    state: "West Bengal",
    social_category: "General",
    disability_status: false,
  };

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
  deleteModalOpen = false;
  itemToDelete: SavedEligibilityResult | null = null;

  toastMessage: string | null = null;
  toastType: "success" | "info" | "error" = "success";
  private toastTimeout: any = null;

  private readonly route = inject(ActivatedRoute, { optional: true });

  constructor(
    private eligibilityService: EligibilityService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

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
      this.loadSavedResults();
    } else if (tab === "specific") {
      this.openSpecificChecker();
    }
  }

  /**
   * Load saved eligibility results from localStorage.
   */
  loadSavedResults(): void {
    this.savedResults = this.eligibilityService.getSavedResults();
    this.cdr.detectChanges();
  }

  /**
   * Check whether an entity is saved in localStorage.
   */
  isSaved(type: EntityType, id: number): boolean {
    return this.eligibilityService.isResultSaved(type, id);
  }

  /**
   * Toggle or save an eligibility result.
   */
  toggleSave(type: EntityType, entity: MatchedEntity, category?: string): void {
    const isAlreadySaved = this.isSaved(type, entity.entity_id);
    if (isAlreadySaved) {
      this.openDeleteModal({
        id: `${type}_${entity.entity_id}`,
        entity_id: entity.entity_id,
        entity_name: entity.entity_name,
        entity_type: type,
        eligible: entity.eligible,
        message: entity.message,
        category: category,
        saved_at: new Date().toISOString(),
      });
    } else {
      const success = this.eligibilityService.saveResult({
        id: `${type}_${entity.entity_id}`,
        entity_id: entity.entity_id,
        entity_name: entity.entity_name,
        entity_type: type,
        eligible: entity.eligible,
        message: entity.message,
        category: category,
        saved_at: new Date().toISOString(),
      });
      if (success) {
        this.loadSavedResults();
        this.showToast(`Saved '${entity.entity_name}' to Saved Results.`, "success");
      }
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
    if (this.itemToDelete) {
      this.eligibilityService.removeSavedResult(this.itemToDelete.id);
      this.loadSavedResults();
      this.showToast(`Removed '${this.itemToDelete.entity_name}' from Saved Results.`, "info");
    }
    this.deleteModalOpen = false;
    this.itemToDelete = null;
    this.cdr.detectChanges();
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
   * Track by saved item id.
   */
  trackBySaved(index: number, item: SavedEligibilityResult): string {
    return item.id;
  }

  /**
   * Display temporary toast alert.
   */
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
   */
  private isProfileValid(): boolean {
    const age = Number(this.profile.age);

    return (
      Number.isFinite(age) &&
      age >= 0 &&
      age <= 120
    );
  }
}
