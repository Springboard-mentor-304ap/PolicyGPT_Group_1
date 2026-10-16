import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, AuthUser } from '../../../core/services/auth';
import { SchemeService } from '../../../core/services/scheme.service';
import { PolicyService } from '../../../core/services/policy.service';
import { ToastService } from '../../../core/services/toast.service';
import { SchemeCreate } from '../../../core/models/scheme.model';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import {
  SCHEME_CATEGORIES,
  MINISTRIES,
  MINISTRY_DEPARTMENTS_MAP,
  ALL_DEPARTMENTS,
} from '../../../core/constants/government-data.constants';

@Component({
  selector: 'app-add-scheme',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, BreadcrumbComponent, SearchableSelectComponent, ConfirmModalComponent],
  templateUrl: './add-scheme.component.html',
  styleUrls: ['./add-scheme.component.scss'],
})
export class AddSchemeComponent implements OnInit {
  // Stepper state (5 steps: Basic Info, Scheme Details, Eligibility, Documents & Application, Review & Submit)
  currentStep = 1;
  totalSteps = 5;
  completedSteps = new Set<number>();

  // Role
  isAdmin = false;
  rolePrefix = 'government';

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: 'Home', route: ['/dashboard', this.rolePrefix] },
      { label: 'Schemes', route: ['/dashboard', this.rolePrefix, 'schemes'] },
      { label: 'Add Scheme' },
    ];
  }

  // Forms
  schemeForm!: FormGroup;

  // Validation / Submission states
  submitted = false;
  stepSubmitted: { [key: number]: boolean } = {};
  showSuccessModal = false;

  /** Backend-confirmed outcome of the last submission (modal messaging). */
  submittedApproved = false;
  savedDraftToast = false;
  isSaving = false;
  isSubmitting = false;

  /* ============================================================
     POST-SUBMIT WORKFLOW MODAL (mirrors Add Policy: result -> add-more)
     ============================================================ */

  modalType: "submitted" | "pending" | "add-more" | null = null;
  modalTitle = "";
  modalMessage = "";

  /* ============================================================
     PRE-ACTION CONFIRM MODAL (shared ConfirmModalComponent)
     Same component and configuration as Add Policy.
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

  // Track existing draft ID
  editingSchemeId: number | null = null;

  // Related Policy options (loaded from the real backend; optional).
  relatedPolicyOptions: { value: string; label: string }[] = [];
  relatedPoliciesLoading = false;
  relatedPoliciesError: string | null = null;

  // Dropdown options
  categories: string[] = SCHEME_CATEGORIES;
  ministries: string[] = MINISTRIES;
  departmentOptions: string[] = [];
  departments: string[] = ALL_DEPARTMENTS;

  states: string[] = [
    'All India', 'Central', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
  ];

  educationOptions: string[] = [
    'No Formal Education Required', 'Primary (Class 5th)', 'Middle (Class 8th)',
    'Secondary (Class 10th)', 'Higher Secondary (Class 12th)', 'Diploma / ITI',
    'Undergraduate or higher', 'Postgraduate / Doctoral'
  ];

  occupationOptions: string[] = [
    'Student', 'Farmer', 'Self-Employed / Entrepreneur', 'Unemployed Youth',
    'Artisan / Craftsman', 'Daily Wage Worker', 'Salaried Employee',
    'Senior Citizen', 'All Occupations'
  ];

  socialCategoryOptions: string[] = [
    'General', 'OBC (Other Backward Classes)', 'SC (Scheduled Castes)',
    'ST (Scheduled Tribes)', 'EWS (Economically Weaker Section)',
    'Minority Communities', 'All Categories'
  ];

  // Dynamic additional eligibility criteria list
  additionalCriteriaList: string[] = [];

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(Auth);
  private schemeService = inject(SchemeService);
  private policyService = inject(PolicyService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.detectRole();
    this.initForm();
    this.loadRelatedPolicies();
  }

  /**
   * Load referenceable policies once for the Related Policy selector.
   * APPROVED policies are visible to every role; the backend still
   * validates the final reference authoritatively on save/submit.
   */
  loadRelatedPolicies(): void {
    if (this.relatedPoliciesLoading) return;
    this.relatedPoliciesLoading = true;
    this.relatedPoliciesError = null;
    this.policyService.getPolicies({ status: 'APPROVED', page: 1, limit: 100 }).subscribe({
      next: (res) => {
        const list = Array.isArray(res?.policies) ? res.policies : [];
        this.relatedPolicyOptions = list.map((p) => ({
          value: String(p.policy_id),
          label: p.title,
        }));
        this.ensureSelectedPolicyOption();
        this.relatedPoliciesLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.relatedPoliciesLoading = false;
        this.relatedPoliciesError = this.getErrorMessage(err);
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Keep a previously saved selection visible even when it is absent
   * from the APPROVED list (e.g. own non-approved policy): resolve it
   * by ID so step navigation, review, and reopening never lose it.
   */
  private ensureSelectedPolicyOption(): void {
    const raw = this.schemeForm?.get('relatedPolicyId')?.value;
    const id = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (id === null || !Number.isInteger(id) || id <= 0) return;
    if (this.relatedPolicyOptions.some((o) => o.value === String(id))) return;
    this.policyService.getPolicy(id).subscribe({
      next: (p) => {
        if (p && (p as any).policy_id) {
          this.relatedPolicyOptions = [
            { value: String((p as any).policy_id), label: (p as any).title },
            ...this.relatedPolicyOptions,
          ];
          this.cdr.detectChanges();
        }
      },
      error: () => {},
    });
  }

  /** Display label of the selected related policy for the review screen. */
  get relatedPolicyLabel(): string {
    const raw = this.schemeForm?.get('relatedPolicyId')?.value;
    if (raw === null || raw === undefined || raw === '') return 'None';
    const found = this.relatedPolicyOptions.find((o) => o.value === String(raw));
    return found ? found.label : `Policy #${raw}`;
  }

  /**
   * Record a backend-confirmed policy reference (draft save / create)
   * so its display label survives without an extra fetch.
   */
  private trackSavedPolicyReference(res: any): void {
    const id = res?.related_policy_id;
    if (id === null || id === undefined || id === '') return;
    if (this.relatedPolicyOptions.some((o) => o.value === String(id))) {
      this.ensureSelectedPolicyOption();
      return;
    }
    const title = typeof res?.related_policy_title === 'string' && res.related_policy_title.trim()
      ? res.related_policy_title.trim()
      : null;
    if (title) {
      this.relatedPolicyOptions = [
        { value: String(id), label: title },
        ...this.relatedPolicyOptions,
      ];
    } else {
      this.ensureSelectedPolicyOption();
    }
  }

  private detectRole(): void {
    const rawRole = String(this.authService.getUserRole() || '').trim().toUpperCase();
    if (rawRole === 'ADMIN' || rawRole === 'ADMINISTRATOR' || this.router.url.includes('/admin')) {
      this.isAdmin = true;
      this.rolePrefix = 'admin';
    } else {
      this.isAdmin = false;
      this.rolePrefix = 'government';
    }
  }

  private initForm(): void {
    this.schemeForm = this.fb.group({
      // Step 1: Basic Information
      name: ['', [Validators.required, Validators.maxLength(300)]],
      category: ['', Validators.required],
      ministry: ['', Validators.required],
      department: ['', Validators.required],
      state: ['All India'],
      description: ['', [Validators.required, Validators.maxLength(5000)]],
      benefits: this.fb.array([this.fb.control(''), this.fb.control('')]),

      // Step 2: Scheme Details
      targetBeneficiaries: ['', [Validators.maxLength(500)]],
      sourceUrl: ['', [Validators.maxLength(500), Validators.pattern(/^https?:\/\/.+/)]] ,
      keyHighlights: this.fb.array([this.fb.control(''), this.fb.control('')]),
      additionalInfo: ['', [Validators.maxLength(1000)]],
      importantNotes: ['', [Validators.maxLength(1000)]],

      // Step 3: Eligibility Criteria
      minAge: ['', [Validators.min(0), Validators.max(120)]],
      maxAge: ['', [Validators.min(0), Validators.max(120)]],
      gender: ['All'],
      annualIncome: [''],
      education: [''],
      occupation: [''],
      socialCategory: [''],
      eligibilityState: ['All India'],
      disabilityStatus: ['Not Applicable'],

      // Step 4: Documents & Application
      documentsRequired: ['', [Validators.maxLength(2000)]],
      applicationProcess: ['', [Validators.maxLength(2000)]],
      applicationUrl: ['', [Validators.maxLength(500), Validators.pattern(/^https?:\/\/.+/)]],
      applicationSourceUrl: ['', [Validators.maxLength(500), Validators.pattern(/^https?:\/\/.+/)]],

      // Step 5: Declaration
      declarationAgreed: [false, Validators.requiredTrue],

      // Related Policy (optional reference to a real policy record).
      relatedPolicyId: [null],

      // Publication / Launch Date (required).
      launchDate: ['', Validators.required],
    });
  }

  updateDepartmentOptions(selectedMinistry: string, clearIfInvalid: boolean = true): void {
    if (!selectedMinistry) {
      this.departmentOptions = [];
      if (clearIfInvalid) {
        this.schemeForm.get('department')?.setValue('');
      }
      return;
    }

    const specificDepts = MINISTRY_DEPARTMENTS_MAP[selectedMinistry];
    if (specificDepts && specificDepts.length > 0) {
      this.departmentOptions = [...specificDepts];
      const currentDept = this.schemeForm.get('department')?.value;
      if (clearIfInvalid && currentDept && !specificDepts.includes(currentDept) &&
        this.isKnownDepartment(currentDept)) {
        this.schemeForm.get('department')?.setValue('');
      }
    } else {
      this.departmentOptions = [...ALL_DEPARTMENTS];
      const currentDept = this.schemeForm.get('department')?.value;
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
    if (typeof value !== 'string' || !value) return false;
    if (ALL_DEPARTMENTS.includes(value)) return true;
    return Object.values(MINISTRY_DEPARTMENTS_MAP).some((list) =>
      list.includes(value),
    );
  }

  onMinistryChange(selectedMinistry: string): void {
    this.updateDepartmentOptions(selectedMinistry, true);
  }

  // --- Form Array Getters ---
  get benefits(): FormArray {
    return this.schemeForm.get('benefits') as FormArray;
  }

  get keyHighlights(): FormArray {
    return this.schemeForm.get('keyHighlights') as FormArray;
  }

  // --- Dynamic Array Controls ---
  addBenefit(): void {
    this.benefits.push(this.fb.control(''));
  }

  removeBenefit(index: number): void {
    if (this.benefits.length > 1) {
      this.benefits.removeAt(index);
    } else {
      this.benefits.at(0).setValue('');
    }
  }

  addHighlight(): void {
    this.keyHighlights.push(this.fb.control(''));
  }

  removeHighlight(index: number): void {
    if (this.keyHighlights.length > 1) {
      this.keyHighlights.removeAt(index);
    } else {
      this.keyHighlights.at(0).setValue('');
    }
  }

  addAdditionalCriteria(): void {
    this.additionalCriteriaList.push('');
  }

  removeAdditionalCriteria(index: number): void {
    this.additionalCriteriaList.splice(index, 1);
  }

  // --- Stepper Navigation ---
  /**
   * Blue progress-fill width (%) across the four step connections,
   * derived from the active step index: 0/20/40/60/80.
   */
  get stepperProgress(): number {
    return (this.currentStep - 1) * 20;
  }

  /**
   * Slide direction of the last successful step change. Drives the
   * CSS step-transition; stays null until the first navigation so
   * initial loads never animate.
   */
  stepTransition: "forward" | "back" | null = null;

  goToStep(step: number): void {
    if (step < this.currentStep) {
      this.currentStep = step;
      this.stepTransition = "back";
      this.cdr.detectChanges();
    } else if (this.isStepValid(this.currentStep)) {
      this.completedSteps.add(this.currentStep);
      this.currentStep = step;
      this.stepTransition = "forward";
      this.cdr.detectChanges();
    } else {
      this.stepSubmitted[this.currentStep] = true;
      this.markStepFieldsAsTouched(this.currentStep);
      this.cdr.detectChanges();
    }
  }

  nextStep(): void {
    this.stepSubmitted[this.currentStep] = true;

    if (!this.isStepValid(this.currentStep)) {
      this.markStepFieldsAsTouched(this.currentStep);
      this.cdr.detectChanges();
      return;
    }

    this.completedSteps.add(this.currentStep);
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.stepTransition = "forward";
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    this.cdr.detectChanges();
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.stepTransition = "back";
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.cdr.detectChanges();
    }
  }

  isStepValid(step: number): boolean {
    switch (step) {
      case 1:
        return (
          !!this.schemeForm.get('name')?.valid &&
          !!this.schemeForm.get('category')?.valid &&
          !!this.schemeForm.get('ministry')?.valid &&
          !!this.schemeForm.get('department')?.valid &&
          !!this.schemeForm.get('description')?.valid
        );
      case 2:
        return !!this.schemeForm.get('launchDate')?.valid;
      case 3:
      case 4:
        return true;
      case 5:
        return !!this.schemeForm.get('declarationAgreed')?.valid;
      default:
        return true;
    }
  }

  private markStepFieldsAsTouched(step: number): void {
    switch (step) {
      case 1:
        this.schemeForm.get('name')?.markAsTouched();
        this.schemeForm.get('category')?.markAsTouched();
        this.schemeForm.get('description')?.markAsTouched();
        this.schemeForm.get('ministry')?.markAsTouched();
        this.schemeForm.get('department')?.markAsTouched();
        break;
      case 2:
        this.schemeForm.get('launchDate')?.markAsTouched();
        break;
      case 5:
        this.schemeForm.get('declarationAgreed')?.markAsTouched();
        break;
    }
  }

  // --- Values for Step 5 Review ---
  get filteredBenefits(): string[] {
    return this.benefits.controls
      .map((c) => String(c.value ?? '').trim())
      .filter((v) => !!v);
  }

  get filteredHighlights(): string[] {
    return this.keyHighlights.controls
      .map((c) => String(c.value ?? '').trim())
      .filter((v) => !!v);
  }

  get formattedAge(): string {
    const min = this.schemeForm.get('minAge')?.value;
    const max = this.schemeForm.get('maxAge')?.value;
    if (min && max) return `${min} - ${max} years`;
    if (min) return `Minimum ${min} years`;
    if (max) return `Up to ${max} years`;
    return 'Not Specified';
  }

  get formattedIncome(): string {
    const income = this.schemeForm.get('annualIncome')?.value;
    if (!income) return 'No limit specified';
    return `₹ ${Number(income).toLocaleString('en-IN')} or less`;
  }

  // --- Build Eligibility Rules Payload ---
  private buildEligibilityRules(): Record<string, any>[] {
    const rules: Record<string, any>[] = [];
    const formVal = this.schemeForm.value;

    const targetBeneficiaries = String(formVal.targetBeneficiaries ?? '').trim();
    if (targetBeneficiaries) {
      rules.push({
        rule_type: 'TARGET_BENEFICIARIES',
        value: targetBeneficiaries,
      });
    }

    if (formVal.minAge || formVal.maxAge) {
      rules.push({
        rule_type: 'AGE_CRITERIA',
        min_age: formVal.minAge ? Number(formVal.minAge) : null,
        max_age: formVal.maxAge ? Number(formVal.maxAge) : null,
      });
    }

    if (formVal.gender && formVal.gender !== 'All') {
      rules.push({ rule_type: 'GENDER', value: formVal.gender });
    }

    if (formVal.annualIncome) {
      rules.push({ rule_type: 'ANNUAL_INCOME_LIMIT', value: Number(formVal.annualIncome) });
    }

    if (formVal.education) {
      rules.push({ rule_type: 'EDUCATION', value: formVal.education });
    }

    if (formVal.occupation) {
      rules.push({ rule_type: 'OCCUPATION', value: formVal.occupation });
    }

    if (formVal.socialCategory) {
      rules.push({ rule_type: 'SOCIAL_CATEGORY', value: formVal.socialCategory });
    }

    if (formVal.disabilityStatus && formVal.disabilityStatus !== 'Not Applicable') {
      rules.push({
        rule_type: 'DISABILITY_STATUS',
        // 'Both' persists as null so reopening restores 'Both'
        // instead of collapsing to 'Not Applicable'.
        value: formVal.disabilityStatus === 'Applicable' ? true : formVal.disabilityStatus === 'Both' ? null : false,
      });
    }

    this.additionalCriteriaList
      .filter((c) => !!c.trim())
      .forEach((c) => {
        rules.push({ rule_type: 'CUSTOM_CONDITION', description: c.trim() });
      });

    return rules;
  }

  private buildSchemePayload(): SchemeCreate {
    const formVal = this.schemeForm.value;
    const eligibilityRules = this.buildEligibilityRules();

    const relRaw = formVal.relatedPolicyId;
    const relId = relRaw === null || relRaw === undefined || relRaw === ''
      ? null
      : Number(relRaw);
    const relatedPolicyId =
      relId !== null && Number.isInteger(relId) && relId > 0 ? relId : null;

    return {
      name: String(formVal.name ?? '').trim(),
      description: String(formVal.description ?? '').trim(),
      category: formVal.category,
      ministry: formVal.ministry || null,
      department: formVal.department || null,
      state: formVal.state || null,
      eligibility_state: formVal.eligibilityState || null,
      benefits: this.filteredBenefits.length > 0 ? this.filteredBenefits : null,
      key_highlights: this.filteredHighlights.length > 0 ? this.filteredHighlights : null,
      additional_info: String(formVal.additionalInfo ?? '').trim() || null,
      important_notes: String(formVal.importantNotes ?? '').trim() || null,
      source_url: formVal.sourceUrl || null,
      application_url: formVal.applicationUrl || null,
      application_source_url: formVal.applicationSourceUrl || null,
      application_process: formVal.applicationProcess || null,
      documents_required: formVal.documentsRequired || null,
      eligibility_rules: eligibilityRules.length > 0 ? eligibilityRules : null,
      launch_date: formVal.launchDate || null,
      related_policy_id: relatedPolicyId,
    };
  }

  // --- Save / Submit Handlers ---
  private getSchemeTitleForModal(): string {
    const raw = String(this.schemeForm.get('name')?.value ?? '').trim();
    return raw || 'Scheme';
  }

  /**
   * Open the Save-as-Draft confirmation immediately (no API call yet).
   * The request fires only after the user confirms in the modal.
   */
  openSaveDraftConfirm(): void {
    if (this.isSaving || this.isSubmitting || this.confirmModalOpen) {
      return;
    }

    const name = this.schemeForm.get('name')?.value;
    const category = this.schemeForm.get('category')?.value;
    const description = this.schemeForm.get('description')?.value;
    const ministry = this.schemeForm.get('ministry')?.value;
    const department = this.schemeForm.get('department')?.value;

    if (!name || !category || !description || !ministry || !department || !this.schemeForm.get('launchDate')?.value) {
      this.schemeForm.get('name')?.markAsTouched();
      this.schemeForm.get('category')?.markAsTouched();
      this.schemeForm.get('description')?.markAsTouched();
      this.schemeForm.get('ministry')?.markAsTouched();
      this.schemeForm.get('department')?.markAsTouched();
      this.schemeForm.get('launchDate')?.markAsTouched();
      this.toastService.warning('Please enter Scheme Name, Category, Ministry, Department, Description, and Publication / Launch Date to save a draft.');
      this.cdr.detectChanges();
      return;
    }

    const title = this.getSchemeTitleForModal();
    this.confirmTitle = 'Save Scheme as Draft';
    this.confirmMessage = `You are about to save ${title} as a draft. You can continue editing it later.`;
    this.confirmMessageBefore = 'You are about to save ';
    this.confirmHighlight = title;
    this.confirmMessageAfter = ' as a draft. You can continue editing it later.';
    this.confirmParseQuotes = true;
    this.confirmVariant = 'primary';
    this.confirmText = 'Save as Draft';
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => this.saveDraft();
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  saveDraft(): void {
    if (this.isSaving) return;

    const name = this.schemeForm.get('name')?.value;
    const category = this.schemeForm.get('category')?.value;
    const description = this.schemeForm.get('description')?.value;
    const ministry = this.schemeForm.get('ministry')?.value;
    const department = this.schemeForm.get('department')?.value;

    if (!name || !category || !description || !ministry || !department || !this.schemeForm.get('launchDate')?.value) {
      this.schemeForm.get('name')?.markAsTouched();
      this.schemeForm.get('category')?.markAsTouched();
      this.schemeForm.get('description')?.markAsTouched();
      this.schemeForm.get('ministry')?.markAsTouched();
      this.schemeForm.get('department')?.markAsTouched();
      this.schemeForm.get('launchDate')?.markAsTouched();
      this.toastService.warning('Please enter Scheme Name, Category, Ministry, Department, Description, and Publication / Launch Date to save a draft.');
      this.cdr.detectChanges();
      return;
    }

    this.isSaving = true;
    this.confirmLoading = true;
    this.confirmErrorMessage = null;
    const payload = this.buildSchemePayload();

    if (this.editingSchemeId) {
      this.schemeService.updateScheme(this.editingSchemeId, payload).subscribe({
        next: (res) => {
          this.isSaving = false;
          this.trackSavedPolicyReference(res);
          this.savedDraftToast = true;
          this.toastService.success(this.schemeDraftToast(
            (n) => `Scheme "${n}" updated successfully.`,
            'Draft updated successfully.',
          ));
          this.closeConfirmModal();
          this.cdr.detectChanges();
          this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
        },
        error: (err) => {
          this.isSaving = false;
          this.confirmLoading = false;
          console.error('Failed to update draft:', err);
          const message = this.getErrorMessage(err);
          this.confirmErrorMessage = message;
          this.toastService.error(message);
          this.cdr.detectChanges();
        },
      });
    } else {
      this.schemeService.saveDraft(payload).subscribe({
        next: (res) => {
          this.editingSchemeId = res.scheme_id;
          this.isSaving = false;
          this.trackSavedPolicyReference(res);
          this.savedDraftToast = true;
          this.toastService.success(this.schemeDraftToast(
            (n) => `Scheme "${n}" draft saved successfully.`,
            'Draft saved successfully.',
          ));
          this.closeConfirmModal();
          this.cdr.detectChanges();
          this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
        },
        error: (err) => {
          this.isSaving = false;
          this.confirmLoading = false;
          console.error('Failed to save draft:', err);
          const message = this.getErrorMessage(err);
          this.confirmErrorMessage = message;
          this.toastService.error(message);
          this.cdr.detectChanges();
        },
      });
    }
  }

  /** Dismiss the pre-action confirmation and reset its state. */
  private closeConfirmModal(): void {
    this.confirmModalOpen = false;
    this.confirmAction = null;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmText = 'Confirm';
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

  onSubmit(): void {
    this.submitted = true;
    this.stepSubmitted[5] = true;

    if (this.schemeForm.invalid) {
      this.schemeForm.markAllAsTouched();
      this.toastService.warning('Please complete all required fields and accept the declaration.');
      this.cdr.detectChanges();
      return;
    }

    // Validation passed: confirm before any API call.
    this.openSubmitConfirm();
  }

  /**
   * Open the Submit confirmation immediately after validation passes.
   * The create/update-then-submit requests fire only after the user
   * confirms in the modal.
   */
  private openSubmitConfirm(): void {
    if (this.confirmModalOpen) return;

    const title = this.getSchemeTitleForModal();
    this.confirmTitle = 'Submit Scheme';
    this.confirmMessage = this.isAdmin
      ? `You are about to submit ${title}. It will be published on the SchemeGPT platform.`
      : `You are about to submit ${title}. It will be submitted to the Admin for review and approval, and published only after approval.`;
    this.confirmMessageBefore = 'You are about to submit ';
    this.confirmHighlight = title;
    this.confirmMessageAfter = this.isAdmin
      ? '. It will be published on the SchemeGPT platform.'
      : '. It will be submitted to the Admin for review and approval, and published only after approval.';
    this.confirmParseQuotes = true;
    this.confirmVariant = 'primary';
    this.confirmText = this.isAdmin ? 'Submit' : 'Submit for Approval';
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => this.executeSubmit();
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  /** Run the validated create/update-then-submit sequence after confirmation. */
  private executeSubmit(): void {
    if (this.isSubmitting || this.isSaving || this.showSuccessModal || this.modalType !== null) {
      return;
    }

    this.confirmLoading = true;
    this.confirmErrorMessage = null;
    this.cdr.detectChanges();

    this.isSubmitting = true;
    const payload = this.buildSchemePayload();

    const proceedWorkflow = (schemeId: number) => {
      // The backend determines the resulting status from the
      // authenticated role: admin direct-approves drafts (APPROVED),
      // government officials go to PENDING_APPROVAL. The success modal
      // below renders whatever the server confirms — never assumed.
      this.schemeService.submitScheme(schemeId).subscribe({
        next: (res) => {
          this.isSubmitting = false;
          this.submittedApproved =
            String(res?.status || '').toUpperCase() === 'APPROVED';
          const schemeName = String(this.schemeForm.get('name')?.value ?? '').trim();
          if (this.submittedApproved) {
            this.toastService.success(
              schemeName
                ? `Scheme "${schemeName}" approved successfully.`
                : 'Scheme approved successfully.',
            );
          } else {
            this.toastService.success(
              schemeName
                ? `Scheme "${schemeName}" submitted for approval.`
                : 'Scheme submitted for approval.',
            );
          }
          // Completion stage (mirrors Policy's add-more popup): YES
          // restarts with a fresh form, NO goes to Manage Schemes.
          this.modalType = 'add-more';
          this.modalTitle = 'Scheme Submission Complete';
          this.modalMessage = 'Do you want to add another scheme?';
          this.closeConfirmModal();
          this.showSuccessModal = true;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.confirmLoading = false;
          console.error('Submission failed:', err);
          const message = this.getErrorMessage(err);
          this.confirmErrorMessage = message;
          this.toastService.error(message);
          this.cdr.detectChanges();
        },
      });
    };

    if (this.editingSchemeId) {
      this.schemeService.updateScheme(this.editingSchemeId, payload).subscribe({
        next: () => {
          proceedWorkflow(this.editingSchemeId!);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.confirmLoading = false;
          console.error('Update failed:', err);
          const message = this.getErrorMessage(err);
          this.confirmErrorMessage = message;
          this.toastService.error(message);
          this.cdr.detectChanges();
        },
      });
    } else {
      this.schemeService.createScheme(payload).subscribe({
        next: (res) => {
          this.editingSchemeId = res.scheme_id;
          proceedWorkflow(res.scheme_id);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.confirmLoading = false;
          console.error('Creation failed:', err);
          const message = this.getErrorMessage(err);
          this.confirmErrorMessage = message;
          this.toastService.error(message);
          this.cdr.detectChanges();
        },
      });
    }
  }

  closeSuccessModal(): void {
    this.showSuccessModal = false;
    this.modalType = null;
    this.cdr.detectChanges();
    this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
  }

  /**
   * Completion popup OK (result stages): advance to the add-more
   * prompt, mirroring Add Policy's onModalOk.
   */
  onModalOk(): void {
    if (this.isSubmitting || this.isSaving) {
      return;
    }
    if (this.modalType === 'submitted' || this.modalType === 'pending') {
      this.modalType = 'add-more';
      this.modalTitle = 'Scheme Submission Complete';
      this.modalMessage = 'Do you want to add another scheme?';
      this.cdr.detectChanges();
      return;
    }
    this.modalType = null;
    this.cdr.detectChanges();
  }

  /** Completion popup YES: restart with a fresh Add form. */
  onAddMoreScheme(): void {
    if (this.isSubmitting || this.isSaving) {
      return;
    }
    this.resetToFreshForm();
  }

  /** Completion popup NO: go to Manage Schemes. */
  onFinishAddingSchemes(): void {
    if (this.isSubmitting || this.isSaving) {
      return;
    }
    this.showSuccessModal = false;
    this.modalType = null;
    this.cdr.detectChanges();
    this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
  }

  /** Clear every trace of the submitted scheme for a fresh start. */
  private resetToFreshForm(): void {
    this.showSuccessModal = false;
    this.modalType = null;
    this.modalTitle = '';
    this.modalMessage = '';
    this.editingSchemeId = null;
    this.submittedApproved = false;
    this.savedDraftToast = false;
    this.isSaving = false;
    this.isSubmitting = false;
    this.submitted = false;
    this.currentStep = 1;
    this.stepTransition = null;
    this.completedSteps = new Set<number>();
    this.stepSubmitted = {};
    this.additionalCriteriaList = [];
    this.closeConfirmModal();
    this.initForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.detectChanges();
  }

  cancel(): void {
    this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
  }

  /**
   * Draft toast message naming the scheme from the form when available.
   * Falls back to `generic` when the name is empty.
   */
  private schemeDraftToast(withName: (name: string) => string, generic: string): string {
    const raw = String(this.schemeForm.get('name')?.value ?? '').trim();
    return raw ? withName(raw) : generic;
  }

  private getErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error?.error?.detail) {
      if (typeof error.error.detail === 'string') return error.error.detail;
      if (Array.isArray(error.error.detail)) {
        return error.error.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
      }
    }
    return error?.message || 'An unexpected error occurred.';
  }
}