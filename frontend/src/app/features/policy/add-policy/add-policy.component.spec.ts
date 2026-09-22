import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AddPolicyComponent } from './add-policy.component';
import { PolicyService } from '../../../core/services/policy.services';
import { Auth } from '../../../core/services/auth';
import { of } from 'rxjs';

describe('AddPolicyComponent Submission Flow', () => {
  let component: AddPolicyComponent;
  let fixture: ComponentFixture<AddPolicyComponent>;
  let policyService: PolicyService;
  let authService: any;

  beforeEach(async () => {
    authService = {
      getStoredUser: () => ({ id: 2, role: 'GOVERNMENT_OFFICIAL', name: 'Gov User' }),
      getToken: () => 'fake-gov-jwt-token',
    };

    await TestBed.configureTestingModule({
      imports: [AddPolicyComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddPolicyComponent);
    component = fixture.componentInstance;
    policyService = TestBed.inject(PolicyService);
    fixture.detectChanges();
  });

  it('should initialize with step 1 and valid government role', () => {
    expect(component.currentStep).toBe(1);
    expect(component.isAdmin).toBe(false);
    expect(component.rolePrefix).toBe('government');
  });

  it('should test complete 5 step flow and submit for approval', () => {
    // Step 1: Fill required fields
    component.policyForm.patchValue({
      title: 'National Digital Literacy Mission',
      category: 'Education',
      description: 'Comprehensive nationwide digital education framework.',
    });
    expect(component.isStepValid(1)).toBe(true);
    component.nextStep();
    expect(component.currentStep).toBe(2);

    // Step 2: Next
    expect(component.isStepValid(2)).toBe(true);
    component.nextStep();
    expect(component.currentStep).toBe(3);

    // Step 3: Target Beneficiaries
    component.policyForm.patchValue({
      targetBeneficiaries: 'Rural youth and students across all states',
    });
    expect(component.isStepValid(3)).toBe(true);
    component.nextStep();
    expect(component.currentStep).toBe(4);

    // Step 4: Next
    expect(component.isStepValid(4)).toBe(true);
    component.nextStep();
    expect(component.currentStep).toBe(5);

    // Step 5: Check declaration
    component.policyForm.patchValue({
      declarationAgreed: true,
    });
    expect(component.isStepValid(5)).toBe(true);
    expect(component.policyForm.valid).toBe(true);

    // Spy on policyService methods
    const saveDraftSpy = vi.spyOn(policyService, 'saveDraft').mockReturnValue(
      of({
        policy_id: 42,
        title: 'National Digital Literacy Mission',
        description: 'Comprehensive nationwide digital education framework.',
        category: 'Education',
        status: 'DRAFT',
      } as any)
    );

    const submitPolicySpy = vi.spyOn(policyService, 'submitPolicy').mockReturnValue(
      of({
        policy_id: 42,
        title: 'National Digital Literacy Mission',
        description: 'Comprehensive nationwide digital education framework.',
        category: 'Education',
        status: 'PENDING_APPROVAL',
      } as any)
    );

    // Trigger submit
    component.onSubmit();

    expect(saveDraftSpy).toHaveBeenCalled();
    expect(submitPolicySpy).toHaveBeenCalledWith(42);
    expect(component.modalType).toBe('pending');
    expect(component.modalTitle).toBe('Policy Submitted for Approval');

    // Test first modal OK -> opens second modal
    component.onModalOk();
    expect(component.modalType).toBe('add-more');
    expect(component.modalTitle).toBe('Policy Submission Complete');

    // Test second modal YES -> resets form
    component.onAddMorePolicy();
    expect(component.modalType).toBe(null);
    expect(component.currentStep).toBe(1);
    expect(component.policyForm.get('title')?.value).toBe('');
  });

  it('should navigate to /dashboard/government/policies/manage when clicking NO on second popup', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    component.modalType = 'add-more';
    component.onFinishAddingPolicies();

    expect(component.modalType).toBe(null);
    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard', 'government', 'policies', 'manage']);
  });

  it('should trigger onSubmit when clicking the DOM submit button on step 5', () => {
    // Fill step 1
    component.policyForm.patchValue({
      title: 'National Digital Literacy Mission',
      category: 'Education',
      description: 'Comprehensive nationwide digital education framework.',
      targetBeneficiaries: 'Rural youth and students across all states',
      declarationAgreed: true,
    });

    component.currentStep = 5;
    fixture.detectChanges();

    const onSubmitSpy = vi.spyOn(component, 'onSubmit');

    const submitBtn = fixture.nativeElement.querySelector('.btn-submit-action');
    console.log('Found submitBtn in DOM:', !!submitBtn, submitBtn?.textContent?.trim());
    expect(submitBtn).toBeTruthy();

    submitBtn.click();
    fixture.detectChanges();

    console.log('onSubmitSpy called count:', onSubmitSpy.mock.calls.length);
    expect(onSubmitSpy).toHaveBeenCalled();
  });

  it('should handle Admin flow: submit -> popup -> OK -> approvePolicy -> add-more popup', () => {
    // Set as admin
    authService.getStoredUser = () => ({ id: 1, role: 'ADMIN', name: 'Admin User' });
    component.isAdmin = true;

    component.policyForm.patchValue({
      title: 'Admin National Plan',
      category: 'Healthcare',
      description: 'Admin healthcare description.',
      targetBeneficiaries: 'General public',
      declarationAgreed: true,
    });

    vi.spyOn(policyService, 'saveDraft').mockReturnValue(
      of({
        policy_id: 99,
        title: 'Admin National Plan',
        status: 'DRAFT',
      } as any)
    );

    vi.spyOn(policyService, 'submitPolicy').mockReturnValue(
      of({
        policy_id: 99,
        title: 'Admin National Plan',
        status: 'PENDING_APPROVAL',
      } as any)
    );

    const approveSpy = vi.spyOn(policyService, 'approvePolicy').mockReturnValue(
      of({
        policy_id: 99,
        title: 'Admin National Plan',
        status: 'APPROVED',
      } as any)
    );

    component.onSubmit();

    // Admin first modal
    expect(component.modalType).toBe('submitted');
    expect(component.modalTitle).toBe('Policy Added Successfully');

    // Click OK on Admin first modal -> silently calls approvePolicy
    component.onModalOk();
    expect(approveSpy).toHaveBeenCalledWith(99);
    expect(component.modalType).toBe('add-more');
    expect(component.modalTitle).toBe('Policy Approved Successfully');

    // Click NO -> navigates to admin policies
    const navigateSpy = vi.spyOn(component['router'], 'navigate');
    component.onFinishAddingPolicies();
    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard', 'admin', 'policies']);
  });
});

