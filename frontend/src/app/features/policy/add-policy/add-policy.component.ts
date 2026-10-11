import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";

import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  AbstractControl,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
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
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { splitListText } from "../policy-details/policy-eligibility.util";
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
  value?: string | number | string[];
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

/**
 * One Additional Conditions block: a keyword with one or more values.
 * Serializes to a single `{ rule_type: "CUSTOM_CONDITION", key,
 * values, description }` JSONB entry (see buildPolicyPayload).
 */
export interface EligibilityConditionBlock {
  keyword: string;
  values: string[];
}

/**
 * Rejects whitespace-only strings (Angular's `required` accepts them).
 * Keeps the `required` error key so existing error markup keeps working.
 */
export function nonBlankValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined) return { required: true };
  return String(value).trim().length > 0 ? null : { required: true };
}

/** Optional non-negative integer (age bounds); blank stays valid. */
export function optionalIntValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = control.value;
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 ? null : { pattern: true };
}

/** Optional non-negative number (income ceiling); blank stays valid. */
export function optionalNumberValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = control.value;
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? null : { pattern: true };
}

/**
 * FormArray-level check: at least one entry must contain non-blank
 * text. Keeps the `required` error key so existing error markup and
 * step gating keep working.
 */
export function atLeastOneNonBlankEntry(
  control: AbstractControl,
): ValidationErrors | null {
  const controls =
    (control as unknown as { controls?: AbstractControl[] })?.controls ?? [];
  const ok = controls.some(
    (c) => String(c?.value ?? "").trim().length > 0,
  );
  return ok ? null : { required: true };
}

/** Minimum age must not exceed maximum age (when both are provided). */
export const ageRangeValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const minRaw = group.get("minAge")?.value;
  const maxRaw = group.get("maxAge")?.value;
  const hasMin = minRaw !== "" && minRaw !== null && minRaw !== undefined;
  const hasMax = maxRaw !== "" && maxRaw !== null && maxRaw !== undefined;
  if (!hasMin || !hasMax) return null;
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null;
  return min <= max ? null : { ageRange: true };
};

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
    ConfirmModalComponent,
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

  /**
   * Blue progress-fill width (%) across the four step connections,
   * derived from the active step index: 0/20/40/60/80. Bound to the
   * progress layer, whose 400ms width transition animates growth and
   * retraction. Navigation (and its validation) is untouched.
   */
  get stepperProgress(): number {
    return (this.currentStep - 1) * 20;
  }

  /**
   * Slide direction of the last successful step change. Drives the
   * CSS step-transition (step-anim-forward/back on the form); stays
   * null until the first navigation so initial/edit loads never
   * animate. Set only on validated navigation — failed validation
   * returns early and leaves it untouched.
   */
  stepTransition: "forward" | "back" | null = null;

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
     PRE-ACTION CONFIRM MODAL (shared ConfirmModalComponent)
     ============================================================ */

  confirmModalOpen = false;
  confirmTitle = "";
  confirmMessage = "";
  confirmMessageBefore = "";
  confirmHighlight = "";
  confirmMessageAfter = "";
  confirmParseQuotes = true;
  confirmVariant: "primary" | "danger" | "warning" | "success" = "primary";
  confirmAction: (() => void) | null = null;
  confirmLoading = false;
  confirmErrorMessage: string | null = null;
  confirmText = "Confirm";

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

  /**
   * Key-Value Conditions Editor blocks (Step 3). Replaces the former
   * free-text condition list: each block serializes to one
   * `{ rule_type: "CUSTOM_CONDITION", key/keyword, values,
   * description }` entry in the backend JSONB `eligibility_rules`
   * array (see buildPolicyPayload for the exact contract).
   */
  conditionBlocks: EligibilityConditionBlock[] = [];

  /**
   * Saved rules the form cannot represent (unedited rule types such as
   * OCCUPATION / SOCIAL_CATEGORY / DISABILITY_STATUS, plus unknown
   * legacy shapes). Carried verbatim into the submission payload so
   * editing never silently discards stored data.
   */
  private passthroughEligibilityRules: Record<string, unknown>[] = [];

  /** Lower-cased keywords occurring more than once (whitespace ignored). */
  get duplicateConditionKeys(): string[] {
    const seen = new Map<string, number>();
    for (const block of this.conditionBlocks) {
      const keyword = block.keyword.trim().toLowerCase();
      if (!keyword) continue;
      seen.set(keyword, (seen.get(keyword) ?? 0) + 1);
    }
    return [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([keyword]) => keyword);
  }

  hasDuplicateConditionKeys(): boolean {
    return this.duplicateConditionKeys.length > 0;
  }

  isConditionKeyDuplicate(block: EligibilityConditionBlock): boolean {
    const keyword = block.keyword.trim().toLowerCase();
    if (!keyword) return false;
    return (
      this.conditionBlocks.filter(
        (b) => b.keyword.trim().toLowerCase() === keyword,
      ).length > 1
    );
  }

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

      title: ["", [nonBlankValidator, Validators.maxLength(300)]],

      category: ["", nonBlankValidator],

      description: ["", [nonBlankValidator, Validators.maxLength(1000)]],

      benefits: this.fb.array([this.fb.control("")]),

      /* --------------------------------------------------------
         STEP 2
         -------------------------------------------------------- */

      ministry: ["", nonBlankValidator],

      department: ["", nonBlankValidator],

      state: ["All India", nonBlankValidator],

      sector: ["", nonBlankValidator],

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
      keyHighlights: this.fb.array([this.fb.control("")]),

      additionalInfo: ["", Validators.maxLength(1000)],

      importantNotes: ["", Validators.maxLength(1000)],

      /* --------------------------------------------------------
         STEP 3
         -------------------------------------------------------- */

      targetBeneficiaries: this.fb.array([this.fb.control("")], {
        validators: atLeastOneNonBlankEntry,
      }),

      minAge: ["", optionalIntValidator],

      maxAge: ["", optionalIntValidator],

      gender: ["All"],

      annualIncome: ["", optionalNumberValidator],

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
    }, { validators: ageRangeValidator });
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
      if (
        clearIfInvalid &&
        currentDept &&
        !specificDepts.includes(currentDept) &&
        this.isKnownDepartment(currentDept)
      ) {
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

  /*
   * Ministry changes reset a stale *predefined* department, but a
   * custom-typed department (not present in any known list) is kept:
   * clearing it would silently destroy user input.
   */
  private isKnownDepartment(value: unknown): boolean {
    if (typeof value !== "string" || !value) return false;
    if (ALL_DEPARTMENTS.includes(value)) return true;
    return Object.values(MINISTRY_DEPARTMENTS_MAP).some((list) =>
      list.includes(value),
    );
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
     CUSTOM ELIGIBILITY (KEY-VALUE BLOCKS)
     ============================================================ */

  /** Append exactly one blank condition block (keyword + one value). */
  addEligibilityCondition(): void {
    this.conditionBlocks.push({ keyword: "", values: [""] });
  }

  removeEligibilityCondition(index: number): void {
    if (index >= 0 && index < this.conditionBlocks.length) {
      this.conditionBlocks.splice(index, 1);
    }
  }

  /** Append exactly one blank value input to the given block. */
  addConditionValue(blockIndex: number): void {
    const block = this.conditionBlocks[blockIndex];
    if (block) block.values.push("");
  }

  removeConditionValue(blockIndex: number, valueIndex: number): void {
    const block = this.conditionBlocks[blockIndex];
    if (block && valueIndex >= 0 && valueIndex < block.values.length) {
      block.values.splice(valueIndex, 1);
    }
  }

  trackConditionRow(index: number): number {
    return index;
  }

  /** Trimmed, non-empty values of a condition block. */
  conditionBlockValues(block: EligibilityConditionBlock): string[] {
    return (block?.values ?? [])
      .map((v) => String(v ?? "").trim())
      .filter((v) => v.length > 0);
  }

  /** A block counts as filled when its keyword or any value is set. */
  blockHasContent(block: EligibilityConditionBlock): boolean {
    return (
      !!block?.keyword?.trim() || this.conditionBlockValues(block).length > 0
    );
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
      this.stepTransition = "back";
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
    this.stepTransition = "forward";
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
      this.stepTransition = "forward";

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.stepTransition = "back";

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
          !!this.policyForm.get("description")?.valid &&
          this.hasAtLeastOneBenefit()
        );

      case 2:
        return (
          (!this.policyForm.get("additionalInfo") || this.policyForm.get("additionalInfo")!.valid) &&
          (!this.policyForm.get("importantNotes") || this.policyForm.get("importantNotes")!.valid) &&
          !!this.policyForm.get("ministry")?.valid &&
          !!this.policyForm.get("department")?.valid &&
          !!this.policyForm.get("state")?.valid &&
          !!this.policyForm.get("sector")?.valid
        );

      case 3:
        return (
          !!this.policyForm.get("targetBeneficiaries")?.valid &&
          !!this.policyForm.get("minAge")?.valid &&
          !!this.policyForm.get("maxAge")?.valid &&
          !!this.policyForm.get("annualIncome")?.valid &&
          !this.policyForm.hasError("ageRange") &&
          !this.hasDuplicateConditionKeys()
        );

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
        this.benefits.controls.forEach((control) => control.markAsTouched());
        break;

      case 2:
        this.policyForm.get("additionalInfo")?.markAsTouched();
        this.policyForm.get("importantNotes")?.markAsTouched();
        this.policyForm.get("ministry")?.markAsTouched();
        this.policyForm.get("department")?.markAsTouched();
        this.policyForm.get("state")?.markAsTouched();
        this.policyForm.get("sector")?.markAsTouched();
        break;

      case 3:
        this.policyForm.get("targetBeneficiaries")?.markAsTouched();
        this.policyForm.get("minAge")?.markAsTouched();
        this.policyForm.get("maxAge")?.markAsTouched();
        this.policyForm.get("annualIncome")?.markAsTouched();
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

  /** Target-beneficiary rows (FormArray mirrors the Benefits pattern). */
  get beneficiaryControls(): FormArray {
    return this.policyForm.get("targetBeneficiaries") as FormArray;
  }

  /** Trimmed, non-empty beneficiaries in row order. */
  get filteredBeneficiaries(): string[] {
    if (!this.policyForm) return [];
    return this.beneficiaryControls.controls
      .map((control) => String(control.value ?? "").trim())
      .filter((value) => value.length > 0);
  }

  /** Rebuild rows from saved data (arrays and legacy strings). */
  setBeneficiaries(values: string[]): void {
    const clean = (values ?? [])
      .map((v) => String(v ?? "").trim())
      .filter((v) => v.length > 0);
    const seen = new Set<string>();
    const unique = clean.filter((v) => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const arr = this.beneficiaryControls;
    arr.clear();
    if (unique.length === 0) {
      arr.push(this.fb.control(""));
    } else {
      unique.forEach((v) => arr.push(this.fb.control(v)));
    }
  }

  /** Append exactly one blank beneficiary row. */
  addBeneficiaryRow(): void {
    this.beneficiaryControls.push(this.fb.control(""));
  }

  removeBeneficiary(index: number): void {
    if (index < 0 || index >= this.beneficiaryControls.length) return;
    if (this.beneficiaryControls.length > 1) {
      this.beneficiaryControls.removeAt(index);
    } else {
      this.beneficiaryControls.at(0).setValue("");
    }
  }

  /** Step 1 requires at least one non-blank benefit. */
  hasAtLeastOneBenefit(): boolean {
    return this.filteredBenefits.length > 0;
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

          additionalInfo: policy.additional_info ?? "",

          importantNotes: policy.important_notes ?? "",

          documentsRequired: policy.documents_required ?? "",

          implementationProcess: policy.implementation_process ?? "",
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

        const savedHighlights = Array.isArray(policy.key_objectives)
          ? policy.key_objectives
              .map((h: unknown) => String(h ?? "").trim())
              .filter((h: string) => h.length > 0)
          : [];

        if (savedHighlights.length > 0) {
          savedHighlights.forEach((h: string) => {
            this.keyHighlights.push(this.fb.control(h));
          });
        } else {
          this.keyHighlights.push(this.fb.control(""));
        }

        /* ------------------------------------------------------
             ELIGIBILITY RULES
             ------------------------------------------------------ */

        const rules = Array.isArray(policy.eligibility_rules)
          ? (policy.eligibility_rules as EligibilityRule[])
          : [];

        this.conditionBlocks = [];

        this.passthroughEligibilityRules = [];

        for (const rule of rules) {
          if (!rule || typeof rule !== "object") continue;

          switch (rule.rule_type) {
            case "TARGET_BENEFICIARIES": {
              // Saved as an array by the chip editor; legacy records
              // hold a comma-separated string — both load as chips.
              this.setBeneficiaries(splitListText(rule.value));

              break;
            }

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

            case "CUSTOM_CONDITION": {
              // New blocks carry keyword + values[]; interim rows carry
              // scalar key/value; legacy rows carry a bare description
              // ("key: value" or plain text). All convert to blocks.
              const rawKey: unknown = rule["key"];
              const rawValues: unknown = rule["values"];
              const rawValue: unknown = rule["value"];
              const keyword =
                typeof rawKey === "string" ? rawKey.trim() : "";
              const collected: string[] = [];
              if (Array.isArray(rawValues)) {
                for (const v of rawValues) {
                  const text = String(v ?? "").trim();
                  if (text) collected.push(text);
                }
              } else if (
                typeof rawValue === "string" ||
                typeof rawValue === "number"
              ) {
                const text = String(rawValue).trim();
                if (text) collected.push(text);
              }
              if (keyword || collected.length > 0) {
                this.conditionBlocks.push({
                  keyword,
                  values: collected.length > 0 ? collected : [""],
                });
                break;
              }
              const description =
                typeof rule.description === "string"
                  ? rule.description.trim()
                  : "";
              if (!description) break;
              const separator = description.indexOf(":");
              if (separator > 0) {
                const key = description.slice(0, separator).trim();
                const value = description.slice(separator + 1).trim();
                this.conditionBlocks.push({
                  keyword: key,
                  values: value ? [value] : [""],
                });
              } else {
                this.conditionBlocks.push({
                  keyword: "",
                  values: [description],
                });
              }

              break;
            }

            default:
              // Rule types the form cannot represent (OCCUPATION,
              // SOCIAL_CATEGORY, DISABILITY_STATUS, legacy shapes):
              // carried verbatim so editing never discards them.
              this.passthroughEligibilityRules.push({ ...(rule as object) });

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

    /* TARGET BENEFICIARIES (chip array; backend stores the list verbatim) */

    const beneficiaries = this.filteredBeneficiaries;

    if (beneficiaries.length > 0) {
      eligibilityRules.push({
        rule_type: "TARGET_BENEFICIARIES",

        value: beneficiaries,
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

    /* ----------------------------------------------------------
       CUSTOM CONDITIONS (KEY-VALUE BLOCKS)
       ----------------------------------------------------------
       Backend contract (`eligibility_rules` JSONB, validated by
       `_clean_eligibility_rules`): each block serializes to ONE entry
         { rule_type: "CUSTOM_CONDITION",
           key: "<trimmed keyword>",
           values: ["<trimmed value>", ...],
           description: "<key>: <v1>, <v2>" }
       `rule_type` must be a known type (CUSTOM_CONDITION is); extra
       keys are stored verbatim. Keyword-less blocks with values fall
       back to the legacy shape ({ rule_type, description }) so plain
       conditions keep working. Fully empty blocks are excluded.
       Mandatory fields above are never touched here; passthrough
       rules (unedited types / legacy shapes) are appended unchanged.
       ---------------------------------------------------------- */

    for (const block of this.conditionBlocks) {
      const keyword = String(block.keyword ?? "").trim();
      const values = this.conditionBlockValues(block);

      if (!keyword && values.length === 0) continue;

      if (keyword) {
        eligibilityRules.push({
          rule_type: "CUSTOM_CONDITION",
          key: keyword,
          values,
          description:
            values.length > 0 ? `${keyword}: ${values.join(", ")}` : keyword,
        });
      } else {
        eligibilityRules.push({
          rule_type: "CUSTOM_CONDITION",
          description: values.join(", "),
        });
      }
    }

    for (const passthrough of this.passthroughEligibilityRules) {
      eligibilityRules.push({ ...passthrough });
    }

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

      key_objectives: this.filteredHighlights,

      additional_info:
        String(formValue.additionalInfo ?? "").trim() || null,

      important_notes:
        String(formValue.importantNotes ?? "").trim() || null,

      documents_required:
        String(formValue.documentsRequired ?? "").trim() || null,

      implementation_process:
        String(formValue.implementationProcess ?? "").trim() || null,
    };

    return payload;
  }

  /* ============================================================
     SAVE AS DRAFT
     ============================================================ */

  /**
   * Open the Save-as-Draft confirmation immediately (no API call yet).
   * The request fires only after the user confirms in the modal.
   */
  openSaveDraftConfirm(): void {
    if (
      this.isReadOnly ||
      this.isSaving ||
      this.isSubmitting ||
      this.isApproving ||
      this.modalType !== null ||
      this.confirmModalOpen
    ) {
      return;
    }

    if (
      this.isEditMode &&
      this.editingPolicyId !== null &&
      !this.isCurrentPolicyEditable()
    ) {
      this.errorMessage =
        `This policy is currently ${this.currentPolicyStatus}. ` +
        `It cannot be edited in its current workflow state.`;
      this.cdr.detectChanges();

      return;
    }

    const title = this.getPolicyTitleForModal();
    this.confirmTitle = "Save Policy as Draft";
    this.confirmMessage = `You are about to save ${title} as a draft. You can continue editing it later.`;
    this.confirmMessageBefore = "You are about to save ";
    this.confirmHighlight = title;
    this.confirmMessageAfter = " as a draft. You can continue editing it later.";
    this.confirmParseQuotes = true;
    this.confirmVariant = "primary";
    this.confirmText = "Save as Draft";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => this.saveDraft();
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

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
    this.confirmLoading = true;
    this.confirmErrorMessage = null;
    this.errorMessage = null;

    const payload = this.buildPolicyPayload();

    /* ----------------------------------------------------------
       EXISTING POLICY
       ---------------------------------------------------------- */

    if (this.isEditMode && this.editingPolicyId !== null) {
      this.policyService.updatePolicy(this.editingPolicyId, payload).subscribe({
        next: (response) => {
          try {
            this.setPolicyStatus(
              response?.status,
              this.currentPolicyStatus ?? "DRAFT",
            );
            this.closeConfirmModal();
            this.showDraftToast();
            this.router.navigate([
              "/dashboard",
              this.rolePrefix,
              "policies",
              "manage",
            ]);
          } finally {
            this.isSaving = false;
            this.closeConfirmModal();
            this.cdr.detectChanges();
          }
        },

        error: (error) => {
          console.error("Failed to update policy draft:", error);

          this.isSaving = false;
          this.confirmLoading = false;

          const message = this.getErrorMessage(
            error,
            "Failed to save policy draft.",
          );
          this.errorMessage = message;
          this.confirmErrorMessage = message;
          this.cdr.detectChanges();
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
          this.confirmLoading = false;

          this.errorMessage =
            "Draft was created, but the server did not return a valid policy ID.";
          this.confirmErrorMessage = this.errorMessage;
          window.scrollTo({ top: 0, behavior: "smooth" });
          this.cdr.detectChanges();

          return;
        }

        try {
          this.editingPolicyId = policyId;

          this.isEditMode = true;

          this.setPolicyStatus(response?.status, "DRAFT");

          this.closeConfirmModal();
          this.showDraftToast();
          this.router.navigate([
            "/dashboard",
            this.rolePrefix,
            "policies",
            "manage",
          ]);
        } finally {
          this.isSaving = false;
          this.closeConfirmModal();
          this.cdr.detectChanges();
        }
      },

      error: (error) => {
        console.error("Failed to create draft:", error);

        this.isSaving = false;
        this.confirmLoading = false;

        const message = this.getErrorMessage(
          error,
          "Failed to save policy draft.",
        );
        this.errorMessage = message;
        this.confirmErrorMessage = message;
        window.scrollTo({ top: 0, behavior: "smooth" });
        this.cdr.detectChanges();
      },
    });
  }

  /** Dismiss the pre-action confirmation and reset its state. */
  private closeConfirmModal(): void {
    this.confirmModalOpen = false;
    this.confirmAction = null;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmText = "Confirm";
  }

  onConfirmModalConfirmed(): void {
    if (this.confirmLoading) return;
    if (this.confirmAction) {
      this.confirmAction();
    }
  }

  onConfirmModalCancelled(): void {
    if (this.confirmLoading) return;
    this.closeConfirmModal();
    this.cdr.detectChanges();
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

    /*
     * Key-value conditions live outside the FormGroup: reject duplicate
     * keywords explicitly before any submission payload is built.
     */
    if (this.hasDuplicateConditionKeys()) {
      this.stepSubmitted[3] = true;
      this.currentStep = 3;
      this.errorMessage =
        "Each condition keyword must be unique. Remove or rename the duplicate keywords before submitting.";
      window.scrollTo({ top: 0, behavior: "smooth" });
      this.cdr.detectChanges();

      return;
    }

    /* ----------------------------------------------------------
       OPEN SUBMIT CONFIRMATION (no API call yet)
       ---------------------------------------------------------- */

    this.openSubmitConfirm();
  }

  /**
   * Open the Submit confirmation immediately after validation passes.
   * The draft-then-submit requests fire only after the user confirms.
   */
  private openSubmitConfirm(): void {
    if (this.confirmModalOpen) return;

    const title = this.getPolicyTitleForModal();
    this.confirmTitle = "Submit Policy";
    this.confirmMessage = this.isAdmin
      ? `You are about to submit ${title}. It will be published on the PolicyGPT platform.`
      : `You are about to submit ${title}. It will be submitted to the Admin for review and approval, and published only after approval.`;
    this.confirmMessageBefore = "You are about to submit ";
    this.confirmHighlight = title;
    this.confirmMessageAfter = this.isAdmin
      ? ". It will be published on the PolicyGPT platform."
      : ". It will be submitted to the Admin for review and approval, and published only after approval.";
    this.confirmParseQuotes = true;
    this.confirmVariant = "primary";
    this.confirmText = this.isAdmin ? "Submit" : "Submit for Approval";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => this.executeSubmit();
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  /** Run the validated draft-then-submit sequence after confirmation. */
  private executeSubmit(): void {
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

    this.confirmLoading = true;
    this.confirmErrorMessage = null;
    this.cdr.detectChanges();

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
          this.confirmLoading = false;

          this.errorMessage =
            "Policy draft was created, but the server did not return a valid policy ID.";
          this.confirmErrorMessage = this.errorMessage;
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
        this.confirmLoading = false;

        const message = this.getErrorMessage(
          error,
          "Failed to create policy draft.",
        );
        this.errorMessage = message;
        this.confirmErrorMessage = message;
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
        this.confirmLoading = false;

        const message = this.getErrorMessage(
          error,
          "Failed to update policy before submission.",
        );
        this.errorMessage = message;
        this.confirmErrorMessage = message;
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
        try {
          this.setPolicyStatus(response?.status, "PENDING_APPROVAL");
          this.closeConfirmModal();

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
        } finally {
          this.isSubmitting = false;
          this.closeConfirmModal();
          this.cdr.detectChanges();
        }
      },

      error: (error) => {
        console.error("[ADD POLICY] submit API ERROR:", error);

        this.isSubmitting = false;
        this.confirmLoading = false;

        const message = this.getErrorMessage(
          error,
          "Failed to submit policy for approval.",
        );
        this.errorMessage = message;
        this.confirmErrorMessage = message;
        this.toastService.error(message);
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

    this.stepTransition = null;

    this.completedSteps = new Set<number>();

    this.stepSubmitted = {};

    this.conditionBlocks = [];

    this.passthroughEligibilityRules = [];

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
    this.toastService.success("Policy saved as draft successfully.");
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
