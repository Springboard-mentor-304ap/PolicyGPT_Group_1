import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";

import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";

import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { Auth, AuthUser } from "../../../core/services/auth";
import { PolicyService } from "../../../core/services/policy.services";
import { ToastService } from "../../../core/services/toast.service";

import {
  PolicyCreate,
  PolicyResponse,
} from "../../../core/models/policy.model";
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import {
  POLICY_CATEGORIES,
  MINISTRIES,
  MINISTRY_DEPARTMENTS_MAP,
  ALL_DEPARTMENTS,
  POLICY_SECTORS,
} from "../../../core/constants/government-data.constants";

/* ============================================================
   TYPES
   ============================================================ */

interface EligibilityRule {
  rule_type?: string;
  value?: string | number;
  min_age?: number;
  max_age?: number;
  description?: string;
  [key: string]: unknown;
}

type PolicyWorkflowStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVE_REQUESTED"
  | "ARCHIVED"
  | "DELETE_REQUESTED";

/* ============================================================
   COMPONENT
   ============================================================ */

@Component({
  selector: "app-add-policy",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    SearchableSelectComponent,
  ],
  templateUrl: "./add-policy.component.html",
  styleUrls: ["./add-policy.component.scss"],
})
export class AddPolicyComponent implements OnInit {
  /* ============================================================
     STEPPER
     ============================================================ */

  currentStep = 1;
  readonly totalSteps = 5;

  completedSteps = new Set<number>();

  /* ============================================================
     EDIT MODE
     ============================================================ */

  isEditMode = false;
  editingPolicyId: number | null = null;

  /* ============================================================
     ROLE
     ============================================================ */

  isAdmin = false;
  rolePrefix: "admin" | "government" = "government";

  /* ============================================================
     FORM
     ============================================================ */

  policyForm!: FormGroup;

  /* ============================================================
     UI / VALIDATION STATE
     ============================================================ */

  submitted = false;

  stepSubmitted: Record<number, boolean> = {};

  savedDraftToast = false;

  isReadOnly = false;

  rejectionReason: string | null = null;

  errorMessage: string | null = null;

  /* ============================================================
     WORKFLOW STATE
     ============================================================ */

  currentPolicyStatus: PolicyWorkflowStatus | null = null;

  /*
   * Backend allows editing only:
   *
   * DRAFT
   * REJECTED
   * ARCHIVED
   *
   * ARCHIVED is converted back to DRAFT by backend update logic.
   */
  private readonly editablePolicyStatuses = new Set<PolicyWorkflowStatus>([
    "DRAFT",
    "REJECTED",
    "ARCHIVED",
  ]);

  /* ============================================================
     MODAL
     ============================================================ */

  modalType: "submitted" | "pending" | "add-more" | null = null;

  modalTitle = "";
  modalMessage = "";

  /* ============================================================
     REQUEST STATE
     ============================================================ */

  isSaving = false;
  isSubmitting = false;
  isApproving = false;

  /* ============================================================
     DROPDOWN OPTIONS
     ============================================================ */

  categories: string[] = POLICY_CATEGORIES;
  ministries: string[] = MINISTRIES;
  departmentOptions: string[] = [];
  sectors: string[] = POLICY_SECTORS;

  states: string[] = [
    "All India",
    "Andhra Pradesh",
    "Assam",
    "Bihar",
    "Delhi",
    "Gujarat",
    "Haryana",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
    "Uttar Pradesh",
    "West Bengal",
  ];

  educationOptions: string[] = [
    "No Minimum Qualification",
    "Primary Education (Class 5th)",
    "Secondary (Class 10th)",
    "Higher Secondary (Class 12th)",
    "Undergraduate / Graduate",
    "Postgraduate / Research",
    "All Educational Institutions",
  ];

  /* ============================================================
     ELIGIBILITY
     ============================================================ */

  additionalEligibilityConditions: string[] = [];

  /* ============================================================
     DEPENDENCIES
     ============================================================ */

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(Auth);
  private readonly policyService = inject(PolicyService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toastService = inject(ToastService);

  /* ============================================================
     INIT
     ============================================================ */

  ngOnInit(): void {
    this.detectRole();

    this.initForm();

    const policyId = this.route.snapshot.paramMap.get("id");

    if (policyId) {
      const parsedId = Number(policyId);

      if (Number.isInteger(parsedId) && parsedId > 0) {
        this.isEditMode = true;
        this.editingPolicyId = parsedId;

        this.loadPolicyForEdit(parsedId);
      }
    }
  }

  /* ============================================================
     ROLE DETECTION
     ============================================================ */

  private detectRole(): void {
    const storedUser: AuthUser | null = this.authService.getStoredUser();

    const url = this.router.url.toLowerCase();

    const storedRole = String(storedUser?.role ?? "")
      .trim()
      .toUpperCase();

    /*
     * Support both frontend/backend naming.
     *
     * Backend:
     * ADMIN
     * GOVERNMENT_OFFICIAL
     *
     * Some frontend auth implementations may use:
     * ADMINISTRATOR
     */

    if (
      url.includes("/admin") ||
      storedRole === "ADMIN" ||
      storedRole === "ADMINISTRATOR"
    ) {
      this.isAdmin = true;
      this.rolePrefix = "admin";
      return;
    }

    this.isAdmin = false;
    this.rolePrefix = "government";
  }

  /* ============================================================
     FORM INITIALIZATION
     ============================================================ */

  private initForm(): void {
    this.policyForm = this.fb.group({
      /* --------------------------------------------------------
         STEP 1
         -------------------------------------------------------- */

      title: ["", [Validators.required, Validators.maxLength(300)]],

      category: ["", Validators.required],

      description: ["", [Validators.required, Validators.maxLength(1000)]],

      benefits: this.fb.array([this.fb.control(""), this.fb.control("")]),

      /* --------------------------------------------------------
         STEP 2
         -------------------------------------------------------- */

      ministry: [""],

      department: [""],

      state: ["All India"],

      sector: [""],

      publicationDate: [""],

      effectiveDate: [""],

      /*
       * These are UI-only fields.
       *
       * They are intentionally NOT sent to backend because
       * the PolicyCreate payload currently supports:
       *
       * title
       * description
       * category
       * ministry
       * department
       * state
       * sector
       * publication_date
       * effective_date
       * document_url
       * source_url
       * benefits
       * eligibility_rules
       */
      keyHighlights: this.fb.array([this.fb.control(""), this.fb.control("")]),

      additionalInfo: ["", Validators.maxLength(1000)],

      importantNotes: ["", Validators.maxLength(1000)],

      /* --------------------------------------------------------
         STEP 3
         -------------------------------------------------------- */

      targetBeneficiaries: [
        "",
        [Validators.required, Validators.maxLength(500)],
      ],

      minAge: [""],

      maxAge: [""],

      gender: ["All"],

      annualIncome: [""],

      education: [""],

      eligibilityState: ["All India"],

      /* --------------------------------------------------------
         STEP 4
         -------------------------------------------------------- */

      documentUrl: ["", [Validators.maxLength(500), Validators.pattern(/^https?:\/\/.+/)]] ,

      sourceUrl: ["", [Validators.maxLength(500), Validators.pattern(/^https?:\/\/.+/)]] ,

      documentsRequired: ["", Validators.maxLength(2000)],

      implementationProcess: ["", Validators.maxLength(2000)],

      /* --------------------------------------------------------
         STEP 5
         -------------------------------------------------------- */

      declarationAgreed: [false, Validators.requiredTrue],
    });
  }

  updateDepartmentOptions(
    selectedMinistry: string,
    clearIfInvalid: boolean = true,
  ): void {
    if (!selectedMinistry) {
      this.departmentOptions = [];
      if (clearIfInvalid) {
        this.policyForm.get("department")?.setValue("");
      }
      return;
    }

    const specificDepts = MINISTRY_DEPARTMENTS_MAP[selectedMinistry];
    if (specificDepts && specificDepts.length > 0) {
      this.departmentOptions = [...specificDepts];
      const currentDept = this.policyForm.get("department")?.value;
      if (clearIfInvalid && currentDept && !specificDepts.includes(currentDept)) {
        this.policyForm.get("department")?.setValue("");
      }
    } else {
      this.departmentOptions = [...ALL_DEPARTMENTS];
      const currentDept = this.policyForm.get("department")?.value;
      if (currentDept && !this.departmentOptions.includes(currentDept)) {
        this.departmentOptions = [currentDept, ...this.departmentOptions];
      }
    }
  }

  onMinistryChange(selectedMinistry: string): void {
    this.updateDepartmentOptions(selectedMinistry, true);
  }

  /* ============================================================
     FORM ARRAY GETTERS
     ============================================================ */

  get benefits(): FormArray {
    return this.policyForm.get("benefits") as FormArray;
  }

  get keyHighlights(): FormArray {
    return this.policyForm.get("keyHighlights") as FormArray;
  }

  /* ============================================================
     BENEFITS
     ============================================================ */

  addBenefit(): void {
    this.benefits.push(this.fb.control(""));
  }

  removeBenefit(index: number): void {
    if (this.benefits.length > 1) {
      this.benefits.removeAt(index);
    } else {
      this.benefits.at(0).setValue("");
    }
  }

  /* ============================================================
     KEY HIGHLIGHTS
     ============================================================ */

  addHighlight(): void {
    this.keyHighlights.push(this.fb.control(""));
  }

  removeHighlight(index: number): void {
    if (this.keyHighlights.length > 1) {
      this.keyHighlights.removeAt(index);
    } else {
      this.keyHighlights.at(0).setValue("");
    }
  }

  /* ============================================================
     CUSTOM ELIGIBILITY
     ============================================================ */

  addEligibilityCondition(): void {
    this.additionalEligibilityConditions.push("");
  }

  removeEligibilityCondition(index: number): void {
    if (index >= 0 && index < this.additionalEligibilityConditions.length) {
      this.additionalEligibilityConditions.splice(index, 1);
    }
  }

  /* ============================================================
     STEPPER
     ============================================================ */

  goToStep(step: number): void {
    if (step < 1 || step > this.totalSteps) {
      return;
    }

    /*
     * Going backwards is always allowed.
     */
    if (step < this.currentStep) {
      this.currentStep = step;
      return;
    }

    /*
     * Do not allow skipping invalid steps.
     */
    if (step > this.currentStep && !this.isStepValid(this.currentStep)) {
      this.stepSubmitted[this.currentStep] = true;

      this.markStepFieldsAsTouched(this.currentStep);

      return;
    }

    this.completedSteps.add(this.currentStep);

    this.currentStep = step;
  }

  nextStep(): void {
    this.stepSubmitted[this.currentStep] = true;

    if (!this.isStepValid(this.currentStep)) {
      this.markStepFieldsAsTouched(this.currentStep);

      return;
    }

    this.completedSteps.add(this.currentStep);

    if (this.currentStep < this.totalSteps) {
      this.currentStep++;

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  /* ============================================================
     STEP VALIDATION
     ============================================================ */

  isStepValid(step: number): boolean {
    switch (step) {
      case 1:
        return (
          !!this.policyForm.get("title")?.valid &&
          !!this.policyForm.get("category")?.valid &&
          !!this.policyForm.get("description")?.valid
        );

      case 2:
        return (
          (!this.policyForm.get("additionalInfo") || this.policyForm.get("additionalInfo")!.valid) &&
          (!this.policyForm.get("importantNotes") || this.policyForm.get("importantNotes")!.valid)
        );

      case 3:
        return !!this.policyForm.get("targetBeneficiaries")?.valid;

      case 4:
        return (
          (!this.policyForm.get("documentUrl") || this.policyForm.get("documentUrl")!.valid) &&
          (!this.policyForm.get("sourceUrl") || this.policyForm.get("sourceUrl")!.valid) &&
          (!this.policyForm.get("documentsRequired") || this.policyForm.get("documentsRequired")!.valid) &&
          (!this.policyForm.get("implementationProcess") || this.policyForm.get("implementationProcess")!.valid)
        );

      case 5:
        return !!this.policyForm.get("declarationAgreed")?.valid;

      default:
        return false;
    }
  }

  private markStepFieldsAsTouched(step: number): void {
    switch (step) {
      case 1:
        this.policyForm.get("title")?.markAsTouched();
        this.policyForm.get("category")?.markAsTouched();
        this.policyForm.get("description")?.markAsTouched();
        break;

      case 2:
        this.policyForm.get("additionalInfo")?.markAsTouched();
        this.policyForm.get("importantNotes")?.markAsTouched();
        break;

      case 3:
        this.policyForm.get("targetBeneficiaries")?.markAsTouched();
        break;

      case 4:
        this.policyForm.get("documentUrl")?.markAsTouched();
        this.policyForm.get("sourceUrl")?.markAsTouched();
        this.policyForm.get("documentsRequired")?.markAsTouched();
        this.policyForm.get("implementationProcess")?.markAsTouched();
        break;

      case 5:
        this.policyForm.get("declarationAgreed")?.markAsTouched();
        break;
    }
  }

  /* ============================================================
     DISPLAY HELPERS
     ============================================================ */

  get filteredBenefits(): string[] {
    return this.benefits.controls
      .map((control) => String(control.value ?? "").trim())
      .filter((value) => value.length > 0);
  }

  get filteredHighlights(): string[] {
    return this.keyHighlights.controls
      .map((control) => String(control.value ?? "").trim())
      .filter((value) => value.length > 0);
  }

  get formattedAge(): string {
    const min = this.policyForm.get("minAge")?.value;

    const max = this.policyForm.get("maxAge")?.value;

    if (min && max) {
      return `${min} - ${max} years`;
    }

    if (min) {
      return `Minimum ${min} years`;
    }

    if (max) {
      return `Up to ${max} years`;
    }

    return "All Ages / Not Restricted";
  }

  get formattedIncome(): string {
    const income = this.policyForm.get("annualIncome")?.value;

    if (income === "" || income === null || income === undefined) {
      return "No income restriction specified";
    }

    const numericIncome = Number(income);

    if (Number.isNaN(numericIncome)) {
      return "No income restriction specified";
    }

    return `₹ ${numericIncome.toLocaleString("en-IN")} or less`;
  }

  /* ============================================================
     WORKFLOW HELPERS
     ============================================================ */

  private isCurrentPolicyEditable(): boolean {
    /*
     * New policy.
     */
    if (this.currentPolicyStatus === null) {
      return true;
    }

    return this.editablePolicyStatuses.has(this.currentPolicyStatus);
  }

  private setPolicyStatus(
    status: unknown,
    fallback: PolicyWorkflowStatus | null = null,
  ): void {
    const normalized = status ? String(status).trim().toUpperCase() : fallback;

    this.currentPolicyStatus = normalized as PolicyWorkflowStatus | null;
  }

  /* ============================================================
     LOAD EXISTING POLICY
     ============================================================ */

  private loadPolicyForEdit(id: number): void {
    this.policyService.getPolicy(id).subscribe({
      next: (policy: PolicyResponse) => {
        this.currentPolicyStatus = policy?.status
          ? (String(policy.status).trim().toUpperCase() as PolicyWorkflowStatus)
          : null;

        this.rejectionReason = policy?.rejection_reason ?? null;

        /* ------------------------------------------------------
             READ ONLY
             ------------------------------------------------------ */

        if (!this.isCurrentPolicyEditable()) {
          this.isReadOnly = true;

          this.policyForm.disable();
        } else {
          this.isReadOnly = false;

          this.policyForm.enable();
        }

        /* ------------------------------------------------------
             BASIC / CLASSIFICATION
             ------------------------------------------------------ */

        this.updateDepartmentOptions(policy.ministry ?? "", false);
        if (
          policy.department &&
          !this.departmentOptions.includes(policy.department)
        ) {
          this.departmentOptions = [
            policy.department,
            ...this.departmentOptions,
          ];
        }

        this.policyForm.patchValue({
          title: policy.title ?? "",

          category: policy.category ?? "",

          description: policy.description ?? "",

          ministry: policy.ministry ?? "",

          department: policy.department ?? "",

          state: policy.state ?? "All India",

          sector: policy.sector ?? "",

          publicationDate: policy.publication_date ?? "",

          effectiveDate: policy.effective_date ?? "",

          documentUrl: policy.document_url ?? "",

          sourceUrl: policy.source_url ?? "",
        });
        this.cdr.detectChanges();

        /* ------------------------------------------------------
             BENEFITS
             ------------------------------------------------------ */

        this.benefits.clear();

        if (Array.isArray(policy.benefits) && policy.benefits.length > 0) {
          policy.benefits.forEach((benefit: string) => {
            this.benefits.push(this.fb.control(benefit ?? ""));
          });
        } else {
          this.benefits.push(this.fb.control(""));
        }

        /* ------------------------------------------------------
             KEY HIGHLIGHTS
             ------------------------------------------------------ */

        this.keyHighlights.clear();

        this.keyHighlights.push(this.fb.control(""));

        /* ------------------------------------------------------
             ELIGIBILITY RULES
             ------------------------------------------------------ */

        const rules = Array.isArray(policy.eligibility_rules)
          ? (policy.eligibility_rules as EligibilityRule[])
          : [];

        this.additionalEligibilityConditions = [];

        for (const rule of rules) {
          switch (rule.rule_type) {
            case "TARGET_BENEFICIARIES":
              this.policyForm.patchValue({
                targetBeneficiaries: rule.value ?? "",
              });

              break;

            case "AGE_CRITERIA":
              this.policyForm.patchValue({
                minAge: rule.min_age ?? "",

                maxAge: rule.max_age ?? "",
              });

              break;

            case "GENDER":
              this.policyForm.patchValue({
                gender: rule.value ?? "All",
              });

              break;

            case "ANNUAL_INCOME_LIMIT":
              this.policyForm.patchValue({
                annualIncome: rule.value ?? "",
              });

              break;

            case "EDUCATION":
              this.policyForm.patchValue({
                education: rule.value ?? "",
              });

              break;

            case "CUSTOM_CONDITION":
              if (
                typeof rule.description === "string" &&
                rule.description.trim()
              ) {
                this.additionalEligibilityConditions.push(
                  rule.description.trim(),
                );
              }

              break;
          }
        }

        this.currentStep = 1;
        this.completedSteps = new Set<number>();
      },

      error: (error) => {
        console.error("Failed to load policy:", error);

        this.errorMessage = this.getErrorMessage(
          error,
          "Unable to load policy.",
        );
      },
    });
  }

  /* ============================================================
     BUILD BACKEND PAYLOAD
     ============================================================ */

  private buildPolicyPayload(): PolicyCreate {
    /*
     * getRawValue() is safer than value because it also works
     * if the form has been disabled during editing.
     */
    const formValue = this.policyForm.getRawValue();

    /* ----------------------------------------------------------
       ELIGIBILITY RULES
       ---------------------------------------------------------- */

    const eligibilityRules: Array<Record<string, unknown>> = [];

    /* TARGET BENEFICIARIES */

    const targetBeneficiaries = String(
      formValue.targetBeneficiaries ?? "",
    ).trim();

    if (targetBeneficiaries) {
      eligibilityRules.push({
        rule_type: "TARGET_BENEFICIARIES",

        value: targetBeneficiaries,
      });
    }

    /* AGE */

    const hasMinAge =
      formValue.minAge !== "" &&
      formValue.minAge !== null &&
      formValue.minAge !== undefined;

    const hasMaxAge =
      formValue.maxAge !== "" &&
      formValue.maxAge !== null &&
      formValue.maxAge !== undefined;

    if (hasMinAge || hasMaxAge) {
      const ageRule: Record<string, unknown> = {
        rule_type: "AGE_CRITERIA",
      };

      if (hasMinAge) {
        const minAge = Number(formValue.minAge);

        if (Number.isInteger(minAge) && minAge >= 0) {
          ageRule["min_age"] = minAge;
        }
      }

      if (hasMaxAge) {
        const maxAge = Number(formValue.maxAge);

        if (Number.isInteger(maxAge) && maxAge >= 0) {
          ageRule["max_age"] = maxAge;
        }
      }

      /*
       * Only add the age rule if at least one valid
       * age value was actually supplied.
       */
      if (
        ageRule["min_age"] !== undefined ||
        ageRule["max_age"] !== undefined
      ) {
        eligibilityRules.push(ageRule);
      }
    }

    /* GENDER */

    const gender = String(formValue.gender ?? "").trim();

    if (gender && gender.toLowerCase() !== "all") {
      eligibilityRules.push({
        rule_type: "GENDER",
        value: gender,
      });
    }

    /* ANNUAL INCOME */

    if (
      formValue.annualIncome !== "" &&
      formValue.annualIncome !== null &&
      formValue.annualIncome !== undefined
    ) {
      const income = Number(formValue.annualIncome);

      if (Number.isFinite(income) && income >= 0) {
        eligibilityRules.push({
          rule_type: "ANNUAL_INCOME_LIMIT",

          value: income,
        });
      }
    }

    /* EDUCATION */

    const education = String(formValue.education ?? "").trim();

    if (education) {
      eligibilityRules.push({
        rule_type: "EDUCATION",
        value: education,
      });
    }

    /* CUSTOM CONDITIONS */

    this.additionalEligibilityConditions
      .map((condition) => String(condition ?? "").trim())
      .filter((condition) => condition.length > 0)
      .forEach((condition) => {
        eligibilityRules.push({
          rule_type: "CUSTOM_CONDITION",

          description: condition,
        });
      });

    /* ----------------------------------------------------------
       FINAL POLICY CREATE PAYLOAD
       ---------------------------------------------------------- */

    const payload: PolicyCreate = {
      title: String(formValue.title ?? "").trim(),

      description: String(formValue.description ?? "").trim(),

      category: formValue.category,

      ministry: formValue.ministry || null,

      department: formValue.department || null,

      state: formValue.state || null,

      sector: formValue.sector || null,

      publication_date: formValue.publicationDate || null,

      effective_date: formValue.effectiveDate || null,

      document_url: formValue.documentUrl || null,

      source_url: formValue.sourceUrl || null,

      benefits: this.filteredBenefits,

      eligibility_rules: eligibilityRules,
    };

    return payload;
  }

  /* ============================================================
     SAVE AS DRAFT
     ============================================================ */

  saveDraft(): void {
    if (
      this.isReadOnly ||
      this.isSaving ||
      this.isSubmitting ||
      this.isApproving ||
      this.modalType !== null
    ) {
      return;
    }

    /*
     * Existing policy must be in an editable workflow state.
     */
    if (
      this.isEditMode &&
      this.editingPolicyId !== null &&
      !this.isCurrentPolicyEditable()
    ) {
      this.errorMessage =
        `This policy is currently ${this.currentPolicyStatus}. ` +
        `It cannot be edited in its current workflow state.`;

      return;
    }

    this.isSaving = true;
    this.errorMessage = null;

    const payload = this.buildPolicyPayload();

    /* ----------------------------------------------------------
       EXISTING POLICY
       ---------------------------------------------------------- */

    if (this.isEditMode && this.editingPolicyId !== null) {
      this.policyService.updatePolicy(this.editingPolicyId, payload).subscribe({
        next: (response) => {
          this.setPolicyStatus(
            response?.status,
            this.currentPolicyStatus ?? "DRAFT",
          );

          this.isSaving = false;

          this.showDraftToast();
        },

        error: (error) => {
          console.error("Failed to update policy draft:", error);

          this.isSaving = false;

          this.errorMessage = this.getErrorMessage(
            error,
            "Failed to save policy draft.",
          );
        },
      });

      return;
    }

    /* ----------------------------------------------------------
       NEW POLICY
       ---------------------------------------------------------- */

    this.policyService.saveDraft(payload).subscribe({
      next: (response) => {
        const policyId = Number(
          response?.policy_id ??
            (response as any)?.id ??
            (response as any)?.data?.policy_id,
        );

        if (!Number.isInteger(policyId) || policyId <= 0) {
          this.isSaving = false;

          this.errorMessage =
            "Draft was created, but the server did not return a valid policy ID.";
          window.scrollTo({ top: 0, behavior: "smooth" });
          this.cdr.detectChanges();

          return;
        }

        this.editingPolicyId = policyId;

        this.isEditMode = true;

        this.setPolicyStatus(response?.status, "DRAFT");

        this.isSaving = false;

        this.showDraftToast();
        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error("Failed to create draft:", error);

        this.isSaving = false;

        this.errorMessage = this.getErrorMessage(
          error,
          "Failed to save policy draft.",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.cdr.detectChanges();
      },
    });
  }

  /* ============================================================
     FINAL SUBMIT
     ============================================================ */

  onSubmit(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    console.log("[ADD POLICY] onSubmit fired");

    if (this.isReadOnly) {
      console.log("[ADD POLICY] isReadOnly is true, returning early");
      return;
    }

    this.submitted = true;

    this.stepSubmitted[5] = true;

    this.errorMessage = null;

    /* ----------------------------------------------------------
       VALIDATE ENTIRE FORM
       ---------------------------------------------------------- */

    console.log("[ADD POLICY] form valid:", this.policyForm.valid);
    console.log("[ADD POLICY] form value:", this.policyForm.getRawValue());

    if (this.policyForm.invalid) {
      console.warn("[ADD POLICY] Form is INVALID! Control states:");
      Object.keys(this.policyForm.controls).forEach((key) => {
        const control = this.policyForm.get(key);
        console.log(
          "[ADD POLICY] CONTROL",
          key,
          "valid:",
          control?.valid,
          "value:",
          control?.value,
          "errors:",
          control?.errors,
        );
      });

      this.policyForm.markAllAsTouched();

      /*
       * Find the first invalid business step.
       */
      if (!this.isStepValid(1)) {
        this.currentStep = 1;
      } else if (!this.isStepValid(2)) {
        this.currentStep = 2;
      } else if (!this.isStepValid(3)) {
        this.currentStep = 3;
      } else if (!this.isStepValid(4)) {
        this.currentStep = 4;
      } else if (!this.isStepValid(5)) {
        this.currentStep = 5;
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
      this.cdr.detectChanges();

      return;
    }

    /* ----------------------------------------------------------
       PREVENT DUPLICATE REQUESTS
       ---------------------------------------------------------- */

    if (
      this.isSubmitting ||
      this.isApproving ||
      this.isSaving ||
      this.modalType !== null
    ) {
      console.log("[ADD POLICY] Blocked by duplicate request guard:", {
        isSubmitting: this.isSubmitting,
        isApproving: this.isApproving,
        isSaving: this.isSaving,
        modalType: this.modalType,
      });
      return;
    }

    /* ----------------------------------------------------------
       EXISTING POLICY
       ---------------------------------------------------------- */

    if (this.isEditMode && this.editingPolicyId !== null) {
      if (!this.isCurrentPolicyEditable()) {
        this.errorMessage =
          `This policy is currently ${this.currentPolicyStatus}. ` +
          `It cannot be submitted from the Add Policy form.`;
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.cdr.detectChanges();

        return;
      }

      const payload = this.buildPolicyPayload();

      console.log("[ADD POLICY] updating existing policy then submit:", this.editingPolicyId);
      this.updateThenSubmit(this.editingPolicyId, payload);

      return;
    }

    /* ----------------------------------------------------------
       NEW POLICY
       ---------------------------------------------------------- */

    this.isSubmitting = true;

    const payload = this.buildPolicyPayload();

    /*
     * STEP 1:
     *
     * Create DRAFT.
     *
     * POST /policies/draft
     */
    console.log("[ADD POLICY] creating draft");
    this.policyService.saveDraft(payload).subscribe({
      next: (response) => {
        console.log("[ADD POLICY] draft response:", response);
        const policyId = Number(
          response?.policy_id ??
            (response as any)?.id ??
            (response as any)?.data?.policy_id,
        );
        console.log("[ADD POLICY] policy ID:", policyId);

        if (!Number.isInteger(policyId) || policyId <= 0) {
          this.isSubmitting = false;

          this.errorMessage =
            "Policy draft was created, but the server did not return a valid policy ID.";
          window.scrollTo({ top: 0, behavior: "smooth" });
          this.cdr.detectChanges();

          return;
        }

        this.editingPolicyId = policyId;

        this.isEditMode = true;

        this.setPolicyStatus(response?.status, "DRAFT");

        /*
         * STEP 2:
         *
         * Submit DRAFT -> PENDING_APPROVAL
         */
        console.log("[ADD POLICY] calling submit API:", policyId);
        this.callSubmitApi(policyId);
      },

      error: (error) => {
        console.error("[ADD POLICY] saveDraft ERROR:", error);

        this.isSubmitting = false;

        this.errorMessage = this.getErrorMessage(
          error,
          "Failed to create policy draft.",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.cdr.detectChanges();
      },
    });
  }

  /* ============================================================
     UPDATE THEN SUBMIT
     ============================================================ */

  private updateThenSubmit(policyId: number, payload: PolicyCreate): void {
    if (!this.isCurrentPolicyEditable()) {
      this.isSubmitting = false;

      this.errorMessage = `This policy is currently ${this.currentPolicyStatus}.`;
      window.scrollTo({ top: 0, behavior: "smooth" });
      this.cdr.detectChanges();

      return;
    }

    this.isSubmitting = true;

    /*
     * First update the editable policy.
     *
     * PUT /policies/{id}
     */
    this.policyService.updatePolicy(policyId, payload).subscribe({
      next: (response) => {
        this.setPolicyStatus(
          response?.status,
          this.currentPolicyStatus ?? "DRAFT",
        );

        /*
         * Then:
         *
         * POST /policies/{id}/submit
         */
        this.callSubmitApi(policyId);
      },

      error: (error) => {
        console.error("[ADD POLICY] Failed to update policy before submission:", error);

        this.isSubmitting = false;

        this.errorMessage = this.getErrorMessage(
          error,
          "Failed to update policy before submission.",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.cdr.detectChanges();
      },
    });
  }

  /* ============================================================
     SUBMIT POLICY
     ============================================================ */

  private callSubmitApi(policyId: number): void {
    console.log("[ADD POLICY] submitPolicy called:", policyId);
    this.policyService.submitPolicy(policyId).subscribe({
      next: (response) => {
        console.log("[ADD POLICY] submit API SUCCESS:", response);
        this.setPolicyStatus(response?.status, "PENDING_APPROVAL");
        this.isSubmitting = false;

        /*
         * ADMIN FLOW
         *
         * The submit request is completed first. Self-approval is
         * forbidden, so the policy stays PENDING_APPROVAL for a
         * different administrator to review. The popup confirms
         * submission (not publication).
         *
         * GOVERNMENT OFFICIAL FLOW
         *
         * The policy remains PENDING_APPROVAL and the OK button only
         * advances the frontend flow to the Add Another Policy popup.
         */
        if (this.isAdmin) {
          console.log("[ADD POLICY] setting Admin modal");
          this.modalType = "submitted";
          this.modalTitle = "Policy Submitted for Review";
          this.modalMessage = `Policy '${this.getPolicyTitleForModal()}' has been submitted. A different administrator must approve it before publication.`;
          this.toastService.success(`Policy "${this.getPolicyTitleForModal()}" submitted for review.`);
        } else {
          console.log("[ADD POLICY] setting Government modal");
          this.modalType = "pending";
          this.modalTitle = "Policy Submitted for Approval";
          this.modalMessage = `Policy '${this.getPolicyTitleForModal()}' has been submitted to the admin for approval.`;
          this.toastService.success(`Policy "${this.getPolicyTitleForModal()}" submitted for approval.`);
        }
        console.log("[ADD POLICY] modalType is now:", this.modalType);
        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error("[ADD POLICY] submit API ERROR:", error);

        this.isSubmitting = false;

        this.errorMessage = this.getErrorMessage(
          error,
          "Failed to submit policy for approval.",
        );
        this.toastService.error(this.errorMessage);
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.cdr.detectChanges();
      },
    });
  }

  private getPolicyTitleForModal(): string {
    const title = String(this.policyForm.get("title")?.value ?? "").trim();
    return title || "Policy";
  }

  /* ============================================================
     MODAL OK
     ============================================================ */

  onModalOk(): void {
    if (this.isApproving || this.isSubmitting || this.isSaving) {
      return;
    }

    /*
     * ADMIN:
     *
     * Self-approval is forbidden by the backend (403 when creator ==
     * approver), so the create form no longer auto-approves. The policy
     * stays PENDING_APPROVAL and a different administrator must review
     * it. OK only advances to the frontend-only "add another" popup.
     */
    if (this.modalType === "submitted" && this.isAdmin) {
      this.modalType = "add-more";
      this.modalTitle = "Policy Submitted for Review";
      this.modalMessage =
        "Your policy has been submitted. A different administrator must approve it before publication.";
      this.cdr.detectChanges();
      return;
    }

    /*
     * GOVERNMENT OFFICIAL:
     *
     * No approval request is made from this form. The policy stays
     * PENDING_APPROVAL. OK only moves to the frontend-only
     * "add another policy" popup.
     */
    if (this.modalType === "pending" && !this.isAdmin) {
      this.modalType = "add-more";
      this.modalTitle = "Policy Submission Complete";
      this.modalMessage = "Do you want to add another policy?";
      this.cdr.detectChanges();
      return;
    }

    this.modalType = null;
    this.cdr.detectChanges();
  }

  /* ============================================================
     RESET FORM
     ============================================================ */

  private resetToFreshForm(): void {
    this.modalType = null;

    this.modalTitle = "";

    this.modalMessage = "";

    this.isEditMode = false;

    this.editingPolicyId = null;

    this.currentPolicyStatus = null;

    this.isReadOnly = false;

    this.rejectionReason = null;

    this.errorMessage = null;

    this.isSaving = false;

    this.isSubmitting = false;

    this.isApproving = false;

    this.submitted = false;

    this.savedDraftToast = false;

    this.currentStep = 1;

    this.completedSteps = new Set<number>();

    this.stepSubmitted = {};

    this.additionalEligibilityConditions = [];

    this.initForm();

    this.policyForm.enable();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    this.cdr.detectChanges();
  }

  /* ============================================================
     ADMIN ADD MORE
     ============================================================ */

  onAddMorePolicy(): void {
    if (this.isApproving || this.isSubmitting || this.isSaving) {
      return;
    }

    this.resetToFreshForm();
  }

  /* ============================================================
     FINISH / CANCEL
     ============================================================ */

  onFinishAddingPolicies(): void {
    if (this.isApproving || this.isSubmitting || this.isSaving) {
      return;
    }

    this.modalType = null;
    this.cdr.detectChanges();

    this.navigateToPolicyManagement();
  }

  closeSuccessModal(): void {
    this.modalType = null;
    this.cdr.detectChanges();

    this.navigateToPolicyManagement();
  }

  cancel(): void {
    if (this.isSaving || this.isSubmitting || this.isApproving) {
      return;
    }

    this.navigateToPolicyManagement();
  }

  private navigateToPolicyManagement(): void {
    if (this.isAdmin) {
      this.router.navigate(["/dashboard", "admin", "policies"]);

      return;
    }

    this.router.navigate(["/dashboard", "government", "policies", "manage"]);
  }

  /* ============================================================
     DRAFT TOAST
     ============================================================ */

  private showDraftToast(): void {
    const rawTitle = String(this.policyForm.get("title")?.value ?? "").trim();
    if (rawTitle) {
      this.toastService.success(
        `Policy "${rawTitle}" updated successfully. You can resume anytime.`,
      );
      return;
    }
    this.toastService.success("Policy draft saved successfully! You can resume anytime.");
  }

  /* ============================================================
     ERROR HANDLING
     ============================================================ */

  private getErrorMessage(error: unknown, fallback: string): string {
    const apiError = error as {
      error?: {
        detail?: unknown;
      };
    };

    const detail = apiError?.error?.detail;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            return String(
              (item as { msg?: unknown }).msg ?? "Validation error",
            );
          }

          return "Validation error";
        })
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join(", ");
      }
    }

    return fallback;
  }
}
