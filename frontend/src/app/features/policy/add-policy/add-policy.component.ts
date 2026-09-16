import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { PolicyService } from '../../../core/services/policy.services';

import {
  FormBuilder,
  FormGroup,
  FormArray,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth, AuthUser } from '../../../core/services/auth';

@Component({
  selector: 'app-add-policy',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './add-policy.component.html',
  styleUrls: ['./add-policy.component.scss'],
})
export class AddPolicyComponent implements OnInit {
  // Stepper state
  currentStep = 1;
  totalSteps = 5;
  completedSteps = new Set<number>();

  // Role detection
  isAdmin = false;
  rolePrefix = 'government';

  // Forms
  policyForm!: FormGroup;

  // Validation / Submission states
  submitted = false;
  stepSubmitted: { [key: number]: boolean } = {};
  showSuccessModal = false;
  savedDraftToast = false;

  // Dropdown options matching Policy Schema
  categories: string[] = [
    'Education',
    'Health',
    'Agriculture',
    'Employment',
    'Housing',
    'Finance',
    'Social Welfare',
    'Environment',
    'Technology',
    'Infrastructure',
    'Rural Development',
    'Urban Development',
  ];

  ministries: string[] = [
    'Ministry of Education',
    'Ministry of Health & Family Welfare',
    'Ministry of Agriculture & Farmers Welfare',
    'Ministry of Rural Development',
    'Ministry of Housing & Urban Affairs',
    'Ministry of Finance',
    'Ministry of Labour & Employment',
    'Ministry of Environment, Forest & Climate Change',
    'Ministry of Electronics & Information Technology',
    'Ministry of Skill Development & Entrepreneurship',
    'Ministry of Social Justice & Empowerment',
  ];

  departments: string[] = [
    'Department of School Education',
    'Department of Higher Education',
    'Department of Health & Family Welfare',
    'Department of Agriculture & Cooperation',
    'Department of Rural Development',
    'Department of Social Welfare',
    'Department of Economic Affairs',
    'Department of Information Technology',
    'Department of Financial Services',
  ];

  states: string[] = [
    'All India',
    'Andhra Pradesh',
    'Assam',
    'Bihar',
    'Delhi',
    'Gujarat',
    'Haryana',
    'Jharkhand',
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

  sectors: string[] = [
    'Education',
    'Healthcare',
    'Agriculture',
    'Information Technology',
    'Infrastructure',
    'Finance & Banking',
    'Employment & Labour',
    'Social Welfare',
    'Environment & Climate',
    'Energy & Power',
  ];

  educationOptions: string[] = [
    'No Minimum Qualification',
    'Primary Education (Class 5th)',
    'Secondary (Class 10th)',
    'Higher Secondary (Class 12th)',
    'Undergraduate / Graduate',
    'Postgraduate / Research',
    'All Educational Institutions',
  ];

  // Dynamic eligibility conditions list (for JSONB eligibility_rules)
  additionalEligibilityConditions: string[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: Auth,
    private policyService: PolicyService
  ) {}

  ngOnInit(): void {
    this.detectRole();
    this.initForm();
  }

  private detectRole(): void {
    const url = this.router.url;
    if (url.includes('/admin')) {
      this.isAdmin = true;
      this.rolePrefix = 'admin';
    } else {
      const storedUser: AuthUser | null = this.authService.getStoredUser();
      if (storedUser && storedUser.role === 'ADMINISTRATOR') {
        this.isAdmin = true;
        this.rolePrefix = 'admin';
      } else {
        this.isAdmin = false;
        this.rolePrefix = 'government';
      }
    }
  }

  private initForm(): void {
    this.policyForm = this.fb.group({
      // Step 1: Basic Information
      title: ['', [Validators.required, Validators.maxLength(300)]],
      category: ['', Validators.required],
      description: ['', [Validators.required, Validators.maxLength(1000)]],
      benefits: this.fb.array([
        this.fb.control(''),
        this.fb.control(''),
      ]),

      // Step 2: Classification & Timeline
      ministry: [''],
      department: [''],
      state: ['All India'],
      sector: [''],
      publicationDate: [''],
      effectiveDate: [''],
      keyHighlights: this.fb.array([
        this.fb.control(''),
        this.fb.control(''),
      ]),
      additionalInfo: ['', [Validators.maxLength(1000)]],
      importantNotes: ['', [Validators.maxLength(1000)]],

      // Step 3: Eligibility & Scope (Mapped to eligibility_rules)
      targetBeneficiaries: ['', [Validators.required, Validators.maxLength(500)]],
      minAge: [''],
      maxAge: [''],
      gender: ['All'],
      annualIncome: [''],
      education: [''],
      eligibilityState: ['All India'],

      // Step 4: Documents & Links
      documentUrl: ['', [Validators.maxLength(500)]],
      sourceUrl: ['', [Validators.maxLength(500)]],
      documentsRequired: ['', [Validators.maxLength(2000)]],
      implementationProcess: ['', [Validators.maxLength(2000)]],

      // Step 5: Declaration
      declarationAgreed: [false, Validators.requiredTrue],
    });
  }

  // --- Form Array Getters ---
  get benefits(): FormArray {
    return this.policyForm.get('benefits') as FormArray;
  }

  get keyHighlights(): FormArray {
    return this.policyForm.get('keyHighlights') as FormArray;
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

  addEligibilityCondition(): void {
    this.additionalEligibilityConditions.push('');
  }

  removeEligibilityCondition(index: number): void {
    this.additionalEligibilityConditions.splice(index, 1);
  }

  // --- Stepper Navigation ---
  goToStep(step: number): void {
    if (step < this.currentStep) {
      this.currentStep = step;
    } else if (this.isStepValid(this.currentStep)) {
      this.completedSteps.add(this.currentStep);
      this.currentStep = step;
    } else {
      this.stepSubmitted[this.currentStep] = true;
    }
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  isStepValid(step: number): boolean {
    switch (step) {
      case 1:
        return (
          !!this.policyForm.get('title')?.valid &&
          !!this.policyForm.get('category')?.valid &&
          !!this.policyForm.get('description')?.valid
        );
      case 2:
        return true;
      case 3:
        return !!this.policyForm.get('targetBeneficiaries')?.valid;
      case 4:
        return true;
      case 5:
        return !!this.policyForm.get('declarationAgreed')?.valid;
      default:
        return true;
    }
  }

  private markStepFieldsAsTouched(step: number): void {
    switch (step) {
      case 1:
        this.policyForm.get('title')?.markAsTouched();
        this.policyForm.get('category')?.markAsTouched();
        this.policyForm.get('description')?.markAsTouched();
        break;
      case 3:
        this.policyForm.get('targetBeneficiaries')?.markAsTouched();
        break;
      case 5:
        this.policyForm.get('declarationAgreed')?.markAsTouched();
        break;
    }
  }

  // --- Values for Step 5 Review ---
  get filteredBenefits(): string[] {
    return this.benefits.controls
      .map((c) => c.value?.trim())
      .filter((v) => !!v);
  }

  get filteredHighlights(): string[] {
    return this.keyHighlights.controls
      .map((c) => c.value?.trim())
      .filter((v) => !!v);
  }

  get formattedAge(): string {
    const min = this.policyForm.get('minAge')?.value;
    const max = this.policyForm.get('maxAge')?.value;
    if (min && max) return `${min} - ${max} years`;
    if (min) return `Minimum ${min} years`;
    if (max) return `Up to ${max} years`;
    return 'All Ages / Not Restricted';
  }

  get formattedIncome(): string {
    const income = this.policyForm.get('annualIncome')?.value;
    if (!income) return 'No income restriction specified';
    return `₹ ${Number(income).toLocaleString('en-IN')} or less`;
  }

  // --- Save / Submit Handlers ---
  saveDraft(): void {
    this.savedDraftToast = true;
    setTimeout(() => {
      this.savedDraftToast = false;
    }, 3500);
  }

  onSubmit(): void {
    this.submitted = true;
    this.stepSubmitted[5] = true;

    if (this.policyForm.invalid) {
      this.policyForm.markAllAsTouched();
      return;
    }

    // Build backend PolicyCreate compatible payload
    const formVal = this.policyForm.value;

    const eligibilityRulesPayload: Array<Record<string, any>> = [];
    if (formVal.targetBeneficiaries) {
      eligibilityRulesPayload.push({ rule_type: 'TARGET_BENEFICIARIES', value: formVal.targetBeneficiaries });
    }
    if (formVal.minAge || formVal.maxAge) {
      eligibilityRulesPayload.push({ rule_type: 'AGE_CRITERIA', min_age: formVal.minAge, max_age: formVal.maxAge });
    }
    if (formVal.gender && formVal.gender !== 'All') {
      eligibilityRulesPayload.push({ rule_type: 'GENDER', value: formVal.gender });
    }
    if (formVal.annualIncome) {
      eligibilityRulesPayload.push({ rule_type: 'ANNUAL_INCOME_LIMIT', value: formVal.annualIncome });
    }
    if (formVal.education) {
      eligibilityRulesPayload.push({ rule_type: 'EDUCATION', value: formVal.education });
    }
    this.additionalEligibilityConditions
      .filter((cond) => !!cond.trim())
      .forEach((cond) => {
        eligibilityRulesPayload.push({ rule_type: 'CUSTOM_CONDITION', description: cond.trim() });
      });

    const payload = {
      title: formVal.title,
      description: formVal.description,
      category: formVal.category,
      ministry: formVal.ministry || null,
      department: formVal.department || null,
      state: formVal.state || null,
      sector: formVal.sector || null,
      publication_date: formVal.publicationDate || null,
      effective_date: formVal.effectiveDate || null,
      document_url: formVal.documentUrl || null,
      source_url: formVal.sourceUrl || null,
      benefits: this.filteredBenefits,
      eligibility_rules: eligibilityRulesPayload,
      status: this.isAdmin ? 'APPROVED' : 'PENDING_APPROVAL',
      submitted_role: this.isAdmin ? 'ADMINISTRATOR' : 'GOVERNMENT_OFFICIAL',
    };

    this.policyService.createPolicy(payload).subscribe({
  next: (response) => {
    console.log('Policy created successfully:', response);
    this.showSuccessModal = true;
  },
  error: (error) => {
    console.error('Policy creation failed:', error);
    alert(error.error?.detail || 'Failed to create policy');
  }
});
  }

  closeSuccessModal(): void {
    this.showSuccessModal = false;
    this.router.navigate([`/dashboard/${this.rolePrefix}/policies`]);
  }

  cancel(): void {
    this.router.navigate([`/dashboard/${this.rolePrefix}/policies`]);
  }
}
