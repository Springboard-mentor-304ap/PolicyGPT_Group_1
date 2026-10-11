import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth, AuthUser } from '../../../core/services/auth';
import { SchemeService } from '../../../core/services/scheme.service';
import { ToastService } from '../../../core/services/toast.service';
import { SchemeResponse, SchemeUpdate } from '../../../core/models/scheme.model';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import {
  SCHEME_CATEGORIES,
  MINISTRIES,
  MINISTRY_DEPARTMENTS_MAP,
  ALL_DEPARTMENTS,
} from '../../../core/constants/government-data.constants';

@Component({
  selector: 'app-edit-scheme',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, SearchableSelectComponent],
  templateUrl: './edit-scheme.component.html',
  styleUrls: ['./edit-scheme.component.scss'],
})
export class EditSchemeComponent implements OnInit {
  // Stepper state
  currentStep = 1;
  totalSteps = 5;
  completedSteps = new Set<number>([1, 2, 3, 4]);

  // Scheme ID
  schemeId: number = 0;
  existingScheme: SchemeResponse | null = null;

  // Role
  isAdmin = false;
  rolePrefix = 'government';

  // Forms
  schemeForm!: FormGroup;

  // Validation / Submission states
  submitted = false;
  stepSubmitted: { [key: number]: boolean } = {};
  showSuccessModal = false;
  savedDraftToast = false;
  isSaving = false;
  isSubmitting = false;

  // Dropdown options
  categories: string[] = SCHEME_CATEGORIES;
  ministries: string[] = MINISTRIES;
  departmentOptions: string[] = [];
  departments: string[] = ALL_DEPARTMENTS;

  states: string[] = [
    'All India',
    'Andhra Pradesh',
    'Assam',
    'Bihar',
    'Delhi',
    'Gujarat',
    'Haryana',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Tamil Nadu',
    'Telangana',
    'Uttar Pradesh',
    'West Bengal',
  ];

  educationOptions: string[] = [
    'No Formal Education Required',
    'Primary (Class 5th)',
    'Middle (Class 8th)',
    'Secondary (Class 10th)',
    'Higher Secondary (Class 12th)',
    'Diploma / ITI',
    'Undergraduate or higher',
    'Postgraduate / Doctoral',
  ];

  occupationOptions: string[] = [
    'Student',
    'Farmer',
    'Self-Employed / Entrepreneur',
    'Unemployed Youth',
    'Artisan / Craftsman',
    'Daily Wage Worker',
    'Salaried Employee',
    'Senior Citizen',
    'All Occupations',
  ];

  socialCategoryOptions: string[] = [
    'General',
    'OBC (Other Backward Classes)',
    'SC (Scheduled Castes)',
    'ST (Scheduled Tribes)',
    'EWS (Economically Weaker Section)',
    'Minority Communities',
    'All Categories',
  ];

  // Dynamic additional eligibility criteria list
  additionalCriteriaList: string[] = [];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: Auth,
    private schemeService: SchemeService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.detectRole();
    const idParam = this.route.snapshot.paramMap.get('id');
    this.schemeId = idParam ? parseInt(idParam, 10) : 0;
    this.initForm();
    if (this.schemeId > 0) {
      this.loadSchemeData();
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
      ministry: [''],
      department: [''],
      state: ['All India'],
      description: ['', [Validators.required, Validators.maxLength(5000)]],
      benefits: this.fb.array([this.fb.control(''), this.fb.control('')]),

      // Step 2: Scheme Details
      targetBeneficiaries: ['', [Validators.maxLength(500)]],
      sourceUrl: ['', [Validators.maxLength(500), Validators.pattern(/^https?:\/\/.+/)]],
      keyHighlights: this.fb.array([this.fb.control(''), this.fb.control('')]),
      additionalInfo: ['', [Validators.maxLength(1000)]],
      importantNotes: ['', [Validators.maxLength(1000)]],
      mediaFileName: [''],

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
      declarationAgreed: [true, Validators.requiredTrue],
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
      if (clearIfInvalid && currentDept && !specificDepts.includes(currentDept)) {
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

  onMinistryChange(selectedMinistry: string): void {
    this.updateDepartmentOptions(selectedMinistry, true);
  }

  private loadSchemeData(): void {
    this.schemeService.getScheme(this.schemeId).subscribe({
      next: (scheme: SchemeResponse) => {
        this.existingScheme = scheme;

        // Set department options before patching form values, preserving existing department
        this.updateDepartmentOptions(scheme.ministry || '', false);

        // Set form fields
        this.schemeForm.patchValue({
          name: scheme.name || '',
          category: scheme.category || '',
          ministry: scheme.ministry || '',
          department: scheme.department || '',
          state: scheme.state || 'All India',
          description: scheme.description || '',
          sourceUrl: scheme.source_url || '',
          applicationUrl: scheme.application_url || '',
          applicationProcess: scheme.application_process || '',
          documentsRequired: scheme.documents_required || '',
        });

        // Set benefits FormArray
        if (Array.isArray(scheme.benefits) && scheme.benefits.length > 0) {
          const benefitsArray = this.fb.array(
            scheme.benefits.map((b) => this.fb.control(b))
          );
          this.schemeForm.setControl('benefits', benefitsArray);
        }

        // Fetch eligibility rules
        this.schemeService.getEligibilityRules(this.schemeId).subscribe({
          next: (rules) => {
            if (Array.isArray(rules)) {
              rules.forEach((rule: any) => {
                if (rule.rule_type === 'AGE_CRITERIA') {
                  if (rule.min_age !== null && rule.min_age !== undefined) {
                    this.schemeForm.patchValue({ minAge: rule.min_age });
                  }
                  if (rule.max_age !== null && rule.max_age !== undefined) {
                    this.schemeForm.patchValue({ maxAge: rule.max_age });
                  }
                } else if (rule.rule_type === 'GENDER' && rule.value) {
                  this.schemeForm.patchValue({ gender: rule.value });
                } else if (rule.rule_type === 'ANNUAL_INCOME_LIMIT' && rule.value !== undefined) {
                  this.schemeForm.patchValue({ annualIncome: rule.value });
                } else if (rule.rule_type === 'EDUCATION' && rule.value) {
                  this.schemeForm.patchValue({ education: rule.value });
                } else if (rule.rule_type === 'OCCUPATION' && rule.value) {
                  this.schemeForm.patchValue({ occupation: rule.value });
                } else if (rule.rule_type === 'SOCIAL_CATEGORY' && rule.value) {
                  this.schemeForm.patchValue({ socialCategory: rule.value });
                } else if (rule.rule_type === 'DISABILITY_STATUS') {
                  this.schemeForm.patchValue({
                    disabilityStatus: rule.value ? 'Applicable' : 'Not Applicable',
                  });
                } else if (rule.rule_type === 'TARGET_BENEFICIARIES' && rule.value) {
                  this.schemeForm.patchValue({ targetBeneficiaries: rule.value });
                } else if (rule.rule_type === 'CUSTOM_CONDITION' && rule.description) {
                  this.additionalCriteriaList.push(rule.description);
                }
              });
            }
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Failed to load eligibility rules:', err);
            this.cdr.detectChanges();
          },
        });

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load scheme:', err);
        this.toastService.error('Failed to load scheme details');
        this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
      },
    });
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
  goToStep(step: number): void {
    if (step < this.currentStep) {
      this.currentStep = step;
      this.cdr.detectChanges();
    } else if (this.isStepValid(this.currentStep)) {
      this.completedSteps.add(this.currentStep);
      this.currentStep = step;
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    this.cdr.detectChanges();
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
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
          !!this.schemeForm.get('description')?.valid
        );
      case 2:
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
      rules.push({ rule_type: 'DISABILITY_STATUS', value: formVal.disabilityStatus === 'Applicable' });
    }

    this.additionalCriteriaList
      .filter((c) => !!c.trim())
      .forEach((c) => {
        rules.push({ rule_type: 'CUSTOM_CONDITION', description: c.trim() });
      });

    return rules;
  }

  private buildSchemePayload(): SchemeUpdate {
    const formVal = this.schemeForm.value;
    const eligibilityRules = this.buildEligibilityRules();

    return {
      name: String(formVal.name ?? '').trim(),
      description: String(formVal.description ?? '').trim(),
      category: formVal.category,
      ministry: formVal.ministry || null,
      department: formVal.department || null,
      state: formVal.state || null,
      benefits: this.filteredBenefits.length > 0 ? this.filteredBenefits : null,
      source_url: formVal.sourceUrl || null,
      application_url: formVal.applicationUrl || null,
      application_process: formVal.applicationProcess || null,
      documents_required: formVal.documentsRequired || null,
      eligibility_rules: eligibilityRules.length > 0 ? eligibilityRules : null,
    };
  }

  // --- Save / Submit Handlers ---
  saveDraft(): void {
    if (this.isSaving) return;

    this.isSaving = true;
    const payload = this.buildSchemePayload();

    this.schemeService.updateScheme(this.schemeId, payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.savedDraftToast = true;
        this.toastService.success(this.schemeDraftToast(
          (n) => `Scheme "${n}" updated successfully.`,
          'Scheme changes saved as draft.',
        ));
        this.cdr.detectChanges();
        setTimeout(() => {
          this.savedDraftToast = false;
          this.cdr.detectChanges();
        }, 3500);
      },
      error: (err) => {
        this.isSaving = false;
        console.error('Failed to save draft:', err);
        this.toastService.error(this.getErrorMessage(err));
        this.cdr.detectChanges();
      },
    });
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

    this.isSubmitting = true;
    const payload = this.buildSchemePayload();

    this.schemeService.updateScheme(this.schemeId, payload).subscribe({
      next: () => {
        if (this.isAdmin) {
          // Admin approves
          this.schemeService.approveScheme(this.schemeId).subscribe({
            next: () => {
              this.isSubmitting = false;
              this.showSuccessModal = true;
              this.cdr.detectChanges();
            },
            error: (err) => {
              this.isSubmitting = false;
              console.error('Approval failed:', err);
              this.toastService.error(this.getErrorMessage(err));
              this.cdr.detectChanges();
            },
          });
        } else {
          // Government Official submits for approval
          this.schemeService.submitScheme(this.schemeId).subscribe({
            next: () => {
              this.isSubmitting = false;
              this.showSuccessModal = true;
              this.cdr.detectChanges();
            },
            error: (err) => {
              this.isSubmitting = false;
              console.error('Submit for approval failed:', err);
              this.toastService.error(this.getErrorMessage(err));
              this.cdr.detectChanges();
            },
          });
        }
      },
      error: (err) => {
        this.isSubmitting = false;
        console.error('Update failed:', err);
        this.toastService.error(this.getErrorMessage(err));
        this.cdr.detectChanges();
      },
    });
  }

  closeSuccessModal(): void {
    this.showSuccessModal = false;
    this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
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
