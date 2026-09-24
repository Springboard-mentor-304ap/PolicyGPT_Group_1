import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import {
  EligibilityCheckResponse,
  EligibilityProfile,
  EligibilityService,
  EntityType,
} from "../eligibility.service";
import { PolicyService } from "../../../core/services/policy.services";
import { SchemeService } from "../../../core/services/scheme.service";

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
  imports: [CommonModule, FormsModule],
  templateUrl: "./eligibility-specific.html",
  styleUrl: "./eligibility-specific.scss",
})
export class EligibilitySpecific {
  entityType: EntityType = "scheme";

  selectedEntityId: number | null = null;
  selectedEntity: SelectableEntity | null = null;

  entities: SelectableEntity[] = [];

  profile: EligibilityProfile = {
    age: 35,
    gender: "Male",
    annual_income: 120000,
    occupation: "Farmer",
    education: "10th Pass",
    state: "Uttar Pradesh",
    social_category: "OBC",
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

  loadingEntities = false;
  checking = false;
  errorMessage = "";

  activeTab: "find" | "specific" | "saved" = "specific";

  result: EligibilityCheckResponse | null = null;

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

  ngOnInit(): void {
    this.loadEntities();
  }

  loadEntities(): void {
    this.loadingEntities = true;
    this.errorMessage = "";
    this.selectedEntity = null;
    this.selectedEntityId = null;
    this.result = null;
    this.entities = [];

    this.cdr.detectChanges();

    if (this.entityType === "scheme") {
      this.schemeService.getSchemes().subscribe({
        next: (response: any) => {
          console.log("Schemes response:", response);

          const schemes = Array.isArray(response)
            ? response
            : response?.schemes || [];

          this.entities = schemes
            .map((scheme: any) => ({
              id: Number(scheme.scheme_id ?? scheme.id),
              name:
                scheme.name ??
                scheme.title ??
                "Unnamed Scheme",
              type: "scheme" as EntityType,
              description: scheme.description,
              ministry: scheme.ministry,
              category: scheme.category,
              status: scheme.status,
            }))
            .filter((entity: SelectableEntity) =>
              Number.isFinite(entity.id) && entity.id > 0
            );

          console.log("Available schemes:", this.entities);

          this.loadingEntities = false;
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error("Unable to load schemes:", error);

          this.errorMessage =
            error?.error?.detail ||
            "Unable to load schemes. Please try again.";

          this.loadingEntities = false;
          this.cdr.detectChanges();
        },
      });
    } else {
      this.policyService.getPolicies().subscribe({
        next: (response: any) => {
          console.log("Policies response:", response);

          const policies = response?.policies || [];

          this.entities = policies
            .map((policy: any) => ({
              id: Number(policy.policy_id ?? policy.id),
              name:
                policy.title ??
                policy.name ??
                "Unnamed Policy",
              type: "policy" as EntityType,
              description: policy.description,
              ministry: policy.ministry,
              category: policy.category,
              status: policy.status,
            }))
            .filter((entity: SelectableEntity) =>
              Number.isFinite(entity.id) && entity.id > 0
            );

          console.log("Available policies:", this.entities);

          this.loadingEntities = false;
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error("Unable to load policies:", error);

          this.errorMessage =
            error?.error?.detail ||
            "Unable to load policies. Please try again.";

          this.loadingEntities = false;
          this.cdr.detectChanges();
        },
      });
    }
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
      .subscribe({
        next: (response) => {
          console.log(
            "Eligibility check response:",
            response
          );

          this.result = response;
          this.checking = false;

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            "Eligibility check error:",
            error
          );

          this.errorMessage =
            error?.error?.detail ||
            "Unable to check eligibility. Please try again.";

          this.checking = false;

          this.cdr.detectChanges();
        },
      });
  }

  reset(): void {
    this.profile = {
      age: 35,
      gender: "Male",
      annual_income: 120000,
      occupation: "Farmer",
      education: "10th Pass",
      state: "Uttar Pradesh",
      social_category: "OBC",
      disability_status: false,
    };

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
    const age = Number(this.profile.age);

    return (
      Number.isFinite(age) &&
      age >= 0 &&
      age <= 120
    );
  }

  isResultSaved(): boolean {
    if (!this.result) return false;
    return this.eligibilityService.isResultSaved(
      this.result.entity_type,
      this.result.entity_id
    );
  }

  toggleSaveResult(): void {
    if (!this.result) return;
    const id = `${this.result.entity_type}_${this.result.entity_id}`;
    if (this.isResultSaved()) {
      this.eligibilityService.removeSavedResult(id);
      this.showToast(`Removed '${this.result.entity_name}' from Saved Results.`, "info");
    } else {
      const success = this.eligibilityService.saveResult({
        id: id,
        entity_id: this.result.entity_id,
        entity_name: this.result.entity_name,
        entity_type: this.result.entity_type,
        eligible: this.result.eligible,
        message: this.result.message,
        category: this.selectedEntity?.category,
        saved_at: new Date().toISOString(),
      });
      if (success) {
        this.showToast(`Saved '${this.result.entity_name}' to Saved Results.`, "success");
      }
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
