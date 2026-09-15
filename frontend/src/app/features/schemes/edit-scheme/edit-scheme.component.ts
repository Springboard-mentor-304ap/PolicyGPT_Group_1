import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-edit-scheme',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './edit-scheme.component.html',
  styleUrls: ['./edit-scheme.component.scss'],
})
export class EditSchemeComponent implements OnInit {
  // Stepper state
  currentStep = 1;
  totalSteps = 5;
  completedSteps = new Set<number>([1, 2, 3, 4]);

  // Scheme ID
  schemeId: string | number = 1;

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

  // Dropdown options
  categories: string[] = [
    'Education',
    'Agriculture',
    'Health & Wellness',
    'Skill Development',
    'Housing & Shelter',
    'Social Welfare',
    'Financial Services',
    'Women & Child Development',
    'Employment',
    'Energy & Power',
    'Environment & Forests',
    'Science & Technology',
  ];

  ministries: string[] = [
    'Ministry of Education',
    'Ministry of Agriculture & Farmers Welfare',
    'Ministry of Health & Family Welfare',
    'Ministry of Skill Development & Entrepreneurship',
    'Ministry of Housing & Urban Affairs',
    'Ministry of Finance',
    'Ministry of Rural Development',
    'Ministry of Social Justice & Empowerment',
    'Ministry of Women & Child Development',
    'Ministry of Labour & Employment',
    'Ministry of New & Renewable Energy',
  ];

  departments: string[] = [
    'Department of Higher Education',
    'Department of School Education & Literacy',
    'Department of Agriculture & Farmers Welfare',
    'Department of Health & Family Welfare',
    'Department of Rural Development',
    'Department of Financial Services',
    'Department of Social Justice & Empowerment',
    'Department of Economic Affairs',
  ];

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
  additionalCriteriaList: string[] = [
    'Must possess a valid Aadhaar and Bank Account',
    'Applicant must be a permanent resident of India',
  ];

  // Sample data repository to pre-fill scheme based on ID
  private sampleSchemes: Record<string, any> = {
    '1': {
      name: 'PM Kisan Samman Nidhi',
      category: 'Agriculture',
      ministry: 'Ministry of Agriculture & Farmers Welfare',
      department: 'Department of Agriculture & Farmers Welfare',
      state: 'All India',
      description: 'A central sector scheme that provides income support of Rs. 6000 per year in three equal installments to all landholding farmer families across India.',
      benefits: [
        'Direct financial assistance of ₹6,000 per year',
        'Direct Benefit Transfer (DBT) directly into bank account',
        'Helps meet agricultural input costs',
      ],
      targetBeneficiaries: 'Small, marginal and all landholding farmer families across India',
      sourceUrl: 'https://pmkisan.gov.in',
      keyHighlights: [
        'Direct income transfer in 3 equal installments of ₹2,000',
        '100% centrally funded scheme by Government of India',
        'Aadhaar-seeded direct payment verification',
      ],
      additionalInfo: 'Operational guidelines require state governments to verify land records.',
      importantNotes: 'Institutional landholders and income tax paying individuals are excluded.',
      minAge: '18',
      maxAge: '75',
      gender: 'All',
      annualIncome: '',
      education: 'No Formal Education Required',
      occupation: 'Farmer',
      socialCategory: 'All Categories',
      eligibilityState: 'All India',
      disabilityStatus: 'Both',
      documentsRequired: 'Aadhaar Card, Land ownership papers (Khatauni/Khasra), Active Bank Account Details, Mobile Number',
      applicationProcess: '1. Visit official portal (pmkisan.gov.in)\n2. Click on New Farmer Registration\n3. Enter Aadhaar number and captcha\n4. Fill land details and bank account\n5. Submit and check status online',
      applicationUrl: 'https://pmkisan.gov.in/RegistrationFormNew.aspx',
      applicationSourceUrl: 'https://pmkisan.gov.in',
      mediaFileName: 'pm_kisan_guide.mp4',
    },
    '2': {
      name: 'PM Surya Ghar Muft Bijli Yojana',
      category: 'Energy & Power',
      ministry: 'Ministry of New & Renewable Energy',
      department: 'Department of Energy',
      state: 'All India',
      description: 'Rooftop solar scheme providing up to 300 units of free electricity every month to 1 crore households across the nation.',
      benefits: [
        'Up to 300 units of free clean electricity per month',
        'Subsidy up to ₹78,000 for rooftop solar systems',
        'Substantial reduction in monthly electricity bills',
      ],
      targetBeneficiaries: 'Residential households with suitable rooftop space',
      sourceUrl: 'https://pmsuryaghar.gov.in',
      keyHighlights: [
        'Generous capital subsidy credited directly to bank account',
        'National portal for single-window vendor selection and net metering',
      ],
      additionalInfo: 'DISCOM approval integrated directly through the National Portal.',
      importantNotes: 'Applicant household must have an active residential electricity connection.',
      minAge: '18',
      maxAge: '',
      gender: 'All',
      annualIncome: '',
      education: 'No Formal Education Required',
      occupation: 'All Occupations',
      socialCategory: 'All Categories',
      eligibilityState: 'All India',
      disabilityStatus: 'Both',
      documentsRequired: 'Electricity Bill, Proof of House Ownership, Aadhaar Card, Bank Passbook',
      applicationProcess: '1. Register on pmsuryaghar.gov.in with Consumer Number\n2. Apply for Rooftop Solar installation\n3. Get technical feasibility approval from DISCOM\n4. Install system through registered vendor\n5. Receive inspection, net meter and subsidy',
      applicationUrl: 'https://pmsuryaghar.gov.in/apply',
      applicationSourceUrl: 'https://pmsuryaghar.gov.in',
      mediaFileName: 'surya_ghar_demo.mp4',
    },
  };

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: Auth
  ) {}

  ngOnInit(): void {
    this.detectRole();
    this.schemeId = this.route.snapshot.paramMap.get('id') || '1';
    this.initForm();
    this.loadSchemeData();
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
    this.schemeForm = this.fb.group({
      // Step 1: Basic Information
      name: ['', [Validators.required, Validators.maxLength(300)]],
      category: ['', Validators.required],
      ministry: [''],
      department: [''],
      state: ['All India'],
      description: ['', [Validators.required, Validators.maxLength(1000)]],
      benefits: this.fb.array([]),

      // Step 2: Scheme Details
      targetBeneficiaries: ['', [Validators.required, Validators.maxLength(500)]],
      sourceUrl: ['', [Validators.maxLength(500)]],
      keyHighlights: this.fb.array([]),
      additionalInfo: ['', [Validators.maxLength(1000)]],
      importantNotes: ['', [Validators.maxLength(1000)]],

      // Step 3: Eligibility Criteria
      minAge: [''],
      maxAge: [''],
      gender: ['All'],
      annualIncome: [''],
      education: [''],
      occupation: [''],
      socialCategory: [''],
      eligibilityState: ['All India'],
      disabilityStatus: ['Not Applicable'],

      // Step 4: Documents & Application
      documentsRequired: ['', [Validators.required, Validators.maxLength(2000)]],
      applicationProcess: ['', [Validators.required, Validators.maxLength(2000)]],
      applicationUrl: ['', [Validators.maxLength(500)]],
      applicationSourceUrl: ['', [Validators.maxLength(500)]],

      // Step 5: Media & Declaration
      mediaFileName: ['intro_video.mp4'],
      declarationAgreed: [true, Validators.requiredTrue],
    });
  }

  private loadSchemeData(): void {
    const data = this.sampleSchemes[String(this.schemeId)] || this.sampleSchemes['1'];

    // Patch basic values
    this.schemeForm.patchValue({
      name: data.name,
      category: data.category,
      ministry: data.ministry,
      department: data.department,
      state: data.state,
      description: data.description,
      targetBeneficiaries: data.targetBeneficiaries,
      sourceUrl: data.sourceUrl,
      additionalInfo: data.additionalInfo,
      importantNotes: data.importantNotes,
      minAge: data.minAge,
      maxAge: data.maxAge,
      gender: data.gender,
      annualIncome: data.annualIncome,
      education: data.education,
      occupation: data.occupation,
      socialCategory: data.socialCategory,
      eligibilityState: data.eligibilityState,
      disabilityStatus: data.disabilityStatus,
      documentsRequired: data.documentsRequired,
      applicationProcess: data.applicationProcess,
      applicationUrl: data.applicationUrl,
      applicationSourceUrl: data.applicationSourceUrl,
      mediaFileName: data.mediaFileName,
      declarationAgreed: true,
    });

    // Populate Benefits FormArray
    const benefitsArray = this.benefits;
    benefitsArray.clear();
    if (data.benefits && data.benefits.length > 0) {
      data.benefits.forEach((b: string) => benefitsArray.push(this.fb.control(b)));
    } else {
      benefitsArray.push(this.fb.control(''));
    }

    // Populate Highlights FormArray
    const highlightsArray = this.keyHighlights;
    highlightsArray.clear();
    if (data.keyHighlights && data.keyHighlights.length > 0) {
      data.keyHighlights.forEach((h: string) => highlightsArray.push(this.fb.control(h)));
    } else {
      highlightsArray.push(this.fb.control(''));
    }
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
          !!this.schemeForm.get('name')?.valid &&
          !!this.schemeForm.get('category')?.valid &&
          !!this.schemeForm.get('description')?.valid
        );
      case 2:
        return !!this.schemeForm.get('targetBeneficiaries')?.valid;
      case 3:
        return true;
      case 4:
        return (
          !!this.schemeForm.get('documentsRequired')?.valid &&
          !!this.schemeForm.get('applicationProcess')?.valid
        );
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
      case 2:
        this.schemeForm.get('targetBeneficiaries')?.markAsTouched();
        break;
      case 4:
        this.schemeForm.get('documentsRequired')?.markAsTouched();
        this.schemeForm.get('applicationProcess')?.markAsTouched();
        break;
      case 5:
        this.schemeForm.get('declarationAgreed')?.markAsTouched();
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

    if (this.schemeForm.invalid) {
      this.schemeForm.markAllAsTouched();
      return;
    }

    const payload = {
      id: this.schemeId,
      ...this.schemeForm.value,
      additionalCriteria: this.additionalCriteriaList.filter((c) => !!c.trim()),
      status: this.isAdmin ? 'APPROVED' : 'PENDING_APPROVAL',
      updatedAt: new Date().toISOString(),
      updatedRole: this.isAdmin ? 'ADMINISTRATOR' : 'GOVERNMENT_OFFICIAL',
    };

    console.log('Updated Scheme Payload:', payload);
    this.showSuccessModal = true;
  }

  closeSuccessModal(): void {
    this.showSuccessModal = false;
    this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
  }

  cancel(): void {
    this.router.navigate([`/dashboard/${this.rolePrefix}/schemes/manage`]);
  }
}
