import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AddPolicyComponent } from './add-policy.component';
import { PolicyService } from '../../../core/services/policy.services';
import { Auth } from '../../../core/services/auth';
import { of, throwError } from 'rxjs';

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
    component.benefits.at(0).setValue('Digital access for all');
    expect(component.isStepValid(1)).toBe(true);
    component.nextStep();
    expect(component.currentStep).toBe(2);

    // Step 2: Next
    expect(component.isStepValid(2)).toBe(false);
    component.policyForm.patchValue({
      ministry: 'Ministry of Health and Family Welfare',
      department: 'Department of Health and Family Welfare',
      sector: 'Health',
    });
    expect(component.isStepValid(2)).toBe(true);
    component.nextStep();
    expect(component.currentStep).toBe(3);

    // Step 3: Target Beneficiaries
    component.setBeneficiaries(['Rural youth and students across all states']);
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

    // Trigger submit -> confirmation opens immediately, no API yet.
    component.onSubmit();

    expect(saveDraftSpy).not.toHaveBeenCalled();
    expect(submitPolicySpy).not.toHaveBeenCalled();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe('Submit Policy');

    // Confirm once -> exactly one draft + one submit request.
    component.onConfirmModalConfirmed();
    expect(saveDraftSpy).toHaveBeenCalledTimes(1);
    expect(submitPolicySpy).toHaveBeenCalledWith(42);
    expect(submitPolicySpy).toHaveBeenCalledTimes(1);
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
      declarationAgreed: true,
    });
    component.setBeneficiaries(['Rural youth and students across all states']);
    component.benefits.at(0).setValue('Digital access for all');

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
      declarationAgreed: true,
      ministry: 'Ministry of Health and Family Welfare',
      department: 'Department of Health and Family Welfare',
      sector: 'Health',
    });
    component.setBeneficiaries(['General public']);
    component.benefits.at(0).setValue('Better health outcomes');

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

    // Confirmation opens first with the admin publish message.
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmMessageAfter).toContain('published on the PolicyGPT platform');

    component.onConfirmModalConfirmed();

    // Admin first modal
    expect(component.modalType).toBe('submitted');
    expect(component.modalTitle).toBe('Policy Submitted for Review');

    // Click OK on Admin first modal -> advances to add-more popup
    component.onModalOk();
    expect(component.modalType).toBe('add-more');
    expect(component.modalTitle).toBe('Policy Submitted for Review');

    // Click NO -> navigates to admin policies
    const navigateSpy = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.onFinishAddingPolicies();
    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard', 'admin', 'policies']);
  });
});

describe('AddPolicyComponent Key-Value Conditions and Validation', () => {
  let component: AddPolicyComponent;
  let fixture: ComponentFixture<AddPolicyComponent>;
  let policyService: PolicyService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPolicyComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            getStoredUser: () => ({ id: 2, role: 'GOVERNMENT_OFFICIAL', name: 'Gov User' }),
            getToken: () => 'fake-gov-jwt-token',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddPolicyComponent);
    component = fixture.componentInstance;
    policyService = TestBed.inject(PolicyService);
    fixture.detectChanges();
  });

  it('adds, edits, and removes condition blocks and values', () => {
    expect(component.conditionBlocks.length).toBe(0);
    component.addEligibilityCondition();
    expect(component.conditionBlocks.length).toBe(1);
    expect(component.conditionBlocks[0]).toEqual({ keyword: '', values: [''] });
    component.conditionBlocks[0].keyword = 'Target Beneficiaries';
    component.addConditionValue(0);
    component.addConditionValue(0);
    expect(component.conditionBlocks[0].values.length).toBe(3);
    component.conditionBlocks[0].values[0] = 'Households';
    component.removeConditionValue(0, 1);
    expect(component.conditionBlocks[0].values.length).toBe(2);
    component.addEligibilityCondition();
    expect(component.conditionBlocks.length).toBe(2);
    component.removeEligibilityCondition(0);
    expect(component.conditionBlocks.length).toBe(1);
    expect(component.hasDuplicateConditionKeys()).toBe(false);
  });

  it('detects duplicate keywords case-insensitively', () => {
    component.conditionBlocks = [
      { keyword: 'Geographic Scope', values: ['All India'] },
      { keyword: '  geographic scope ', values: ['Karnataka'] },
    ];
    expect(component.hasDuplicateConditionKeys()).toBe(true);
    expect(component.isConditionKeyDuplicate(component.conditionBlocks[0])).toBe(true);
    expect(component.isStepValid(3)).toBe(false);
  });

  it('serializes blocks into CUSTOM_CONDITION rules without touching mandatory rules', () => {
    component.policyForm.patchValue({
      title: 'T',
      category: 'Health',
      description: 'D',
      minAge: '18',
      maxAge: '60',
      gender: 'Female Only',
      annualIncome: '250000',
      education: 'Graduate',
    });
    component.setBeneficiaries(['Farmers']);
    component.conditionBlocks = [
      { keyword: 'Target Beneficiaries', values: ['Households', 'Schools', ''] },
      { keyword: '', values: [] },
      { keyword: '', values: ['Must own land'] },
    ];
    (component as any).passthroughEligibilityRules = [{ rule_type: 'OCCUPATION', value: 'Farming' }];
    const payload = (component as any).buildPolicyPayload();
    const customs = payload.eligibility_rules.filter((r: any) => r.rule_type === 'CUSTOM_CONDITION');
    expect(customs).toContainEqual({
      rule_type: 'CUSTOM_CONDITION',
      key: 'Target Beneficiaries',
      values: ['Households', 'Schools'],
      description: 'Target Beneficiaries: Households, Schools',
    });
    expect(customs).toContainEqual({ rule_type: 'CUSTOM_CONDITION', description: 'Must own land' });
    // Empty block excluded, mandatory rules intact, passthrough preserved.
    expect(payload.eligibility_rules.length).toBe(5 + 2 + 1);
    expect(payload.eligibility_rules).toContainEqual({ rule_type: 'TARGET_BENEFICIARIES', value: ['Farmers'] });
    expect(payload.eligibility_rules).toContainEqual({ rule_type: 'OCCUPATION', value: 'Farming' });
  });

  it('treats whitespace-only mandatory fields as empty', () => {
    component.policyForm.patchValue({ title: '   ', category: 'Health', description: 'D' });
    expect(component.policyForm.get('title')?.invalid).toBe(true);
    expect(component.isStepValid(1)).toBe(false);
  });

  it('rejects min age above max age on step 3', () => {
    component.setBeneficiaries(['Farmers']);
    component.policyForm.patchValue({ minAge: '60', maxAge: '18' });
    expect(component.policyForm.hasError('ageRange')).toBe(true);
    expect(component.isStepValid(3)).toBe(false);
    component.policyForm.patchValue({ minAge: '18', maxAge: '60' });
    expect(component.policyForm.hasError('ageRange')).toBe(false);
  });

  it('rejects non-numeric age and negative income', () => {
    component.policyForm.patchValue({ minAge: 'abc', annualIncome: '-5' });
    expect(component.policyForm.get('minAge')?.invalid).toBe(true);
    expect(component.policyForm.get('annualIncome')?.invalid).toBe(true);
    expect(component.isStepValid(3)).toBe(false);
  });

  it('keeps entered values when navigating between steps', () => {
    component.policyForm.patchValue({ title: 'Keep Me', category: 'Health', description: 'Stay' });
    component.benefits.at(0).setValue('Stays healthy');
    component.conditionBlocks = [{ keyword: 'K', values: ['V1', 'V2'] }];
    component.nextStep();
    expect(component.currentStep).toBe(2);
    component.policyForm.patchValue({
      ministry: 'Custom Ministry',
      department: 'Custom Dept',
      sector: 'Custom Sector',
    });
    component.nextStep();
    component.prevStep();
    expect(component.currentStep).toBe(2);
    expect(component.policyForm.get('title')?.value).toBe('Keep Me');
    expect(component.policyForm.get('ministry')?.value).toBe('Custom Ministry');
    expect(component.conditionBlocks).toEqual([{ keyword: 'K', values: ['V1', 'V2'] }]);
  });

  it('requires at least one non-blank benefit on step 1', () => {
    component.policyForm.patchValue({ title: 'T', category: 'Health', description: 'D' });
    expect(component.hasAtLeastOneBenefit()).toBe(false);
    expect(component.isStepValid(1)).toBe(false);
    component.benefits.at(0).setValue('   ');
    expect(component.hasAtLeastOneBenefit()).toBe(false);
    expect(component.isStepValid(1)).toBe(false);
    component.benefits.at(0).setValue('Cleaner air');
    expect(component.hasAtLeastOneBenefit()).toBe(true);
    expect(component.isStepValid(1)).toBe(true);
  });

  it('starts with a single benefit input and adds exactly one per click', () => {
    expect(component.benefits.length).toBe(1);
    component.addBenefit();
    component.addBenefit();
    expect(component.benefits.length).toBe(3);
  });

  it('starts with a single objective input and keeps add/remove working', () => {
    expect(component.keyHighlights.length).toBe(1);
    component.addHighlight();
    expect(component.keyHighlights.length).toBe(2);
    component.removeHighlight(1);
    expect(component.keyHighlights.length).toBe(1);
    component.removeHighlight(0);
    expect(component.keyHighlights.length).toBe(1);
    expect(component.keyHighlights.at(0).value).toBe('');
  });

  it('preserves a custom department on ministry change but clears stale predefined ones', () => {
    component.policyForm.patchValue({ ministry: 'Ministry of Education' });
    component.onMinistryChange('Ministry of Education');
    component.policyForm.patchValue({ department: 'My Custom Dept' });
    component.policyForm.patchValue({ ministry: 'Ministry of Health and Family Welfare' });
    component.onMinistryChange('Ministry of Health and Family Welfare');
    expect(component.policyForm.get('department')?.value).toBe('My Custom Dept');

    component.policyForm.patchValue({ ministry: 'Ministry of Education' });
    component.onMinistryChange('Ministry of Education');
    component.policyForm.patchValue({ department: 'Department of Higher Education' });
    component.policyForm.patchValue({ ministry: 'Ministry of Health and Family Welfare' });
    component.onMinistryChange('Ministry of Health and Family Welfare');
    expect(component.policyForm.get('department')?.value).toBe('');
  });

  it('saves a draft with incomplete fields when the workflow permits', () => {
    const saveDraftSpy = vi.spyOn(policyService, 'saveDraft').mockReturnValue(
      of({ policy_id: 7, status: 'DRAFT' } as any),
    );
    vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.saveDraft();
    expect(saveDraftSpy).toHaveBeenCalled();
    const payload = saveDraftSpy.mock.calls[0][0];
    expect(payload.title).toBe('');
    expect(payload.eligibility_rules).toEqual([]);
  });

  it('requires ministry, department, state, and sector on step 2', () => {
    // State defaults to All India, which counts as valid.
    expect(component.policyForm.get('state')?.valid).toBe(true);
    expect(component.policyForm.get('ministry')?.invalid).toBe(true);
    expect(component.policyForm.get('department')?.invalid).toBe(true);
    expect(component.policyForm.get('sector')?.invalid).toBe(true);
    expect(component.isStepValid(2)).toBe(false);
    // Whitespace-only values stay invalid.
    component.policyForm.patchValue({ ministry: '   ', department: '  ', sector: ' ' });
    expect(component.isStepValid(2)).toBe(false);
    component.policyForm.patchValue({
      ministry: 'Ministry of Health and Family Welfare',
      department: 'Department of Health and Family Welfare',
      sector: 'Health',
    });
    expect(component.isStepValid(2)).toBe(true);
  });

  it('requires at least one beneficiary row on step 3', () => {
    expect(component.filteredBeneficiaries).toEqual([]);
    expect(component.policyForm.get('targetBeneficiaries')?.invalid).toBe(true);
    expect(component.isStepValid(3)).toBe(false);
    component.setBeneficiaries(['Farmers', '  ', 'Schools']);
    expect(component.filteredBeneficiaries).toEqual(['Farmers', 'Schools']);
    expect(component.policyForm.get('targetBeneficiaries')?.valid).toBe(true);
  });

  it('adds one beneficiary row per click and edits rows directly', () => {
    expect(component.beneficiaryControls.length).toBe(1);
    component.addBeneficiaryRow();
    expect(component.beneficiaryControls.length).toBe(2);
    component.beneficiaryControls.at(0).setValue('  Households  ');
    component.beneficiaryControls.at(1).setValue('');
    expect(component.filteredBeneficiaries).toEqual(['Households']);
  });

  it('removes rows directly and keeps a single blank row at minimum', () => {
    component.setBeneficiaries(['A', 'B']);
    component.removeBeneficiary(0);
    expect(component.filteredBeneficiaries).toEqual(['B']);
    component.removeBeneficiary(0);
    expect(component.beneficiaryControls.length).toBe(1);
    expect(component.filteredBeneficiaries).toEqual([]);
    expect(component.isStepValid(3)).toBe(false);
  });

  it('submits beneficiaries as an array and reloads legacy strings', () => {
    component.setBeneficiaries(['Households', 'Schools']);
    const payload = (component as any).buildPolicyPayload();
    const target = payload.eligibility_rules.find((r: any) => r.rule_type === 'TARGET_BENEFICIARIES');
    expect(target.value).toEqual(['Households', 'Schools']);
  });

  it('renders beneficiary rows like benefit rows with working add/remove', () => {
    component.policyForm.patchValue({
      title: 'T',
      category: 'Health',
      description: 'D',
      ministry: 'M',
      department: 'D',
      sector: 'S',
    });
    component.benefits.at(0).setValue('B1');
    component.nextStep();
    component.nextStep();
    expect(component.currentStep).toBe(3);
    const tick = () => TestBed.inject(ApplicationRef).tick();
    tick();

    const rows = () =>
      fixture.nativeElement.querySelectorAll('.criteria-row__inputs .dynamic-list .dynamic-row');
    // One blank row initially, mirroring Benefits.
    expect(rows().length).toBe(1);
    const addBtn = fixture.nativeElement.querySelector(
      '.criteria-row__inputs .btn-dashed-add',
    ) as HTMLElement;
    expect(addBtn.textContent).toContain('Add Beneficiary');
    addBtn.click();
    tick();
    expect(rows().length).toBe(2);
    (rows()[0].querySelector('input') as HTMLInputElement).value = 'Households';
    rows()[0].querySelector('input').dispatchEvent(new Event('input'));
    tick();
    expect(component.filteredBeneficiaries).toEqual(['Households']);
    (rows()[1].querySelector('.btn-icon-danger') as HTMLElement).click();
    tick();
    expect(rows().length).toBe(1);
    expect(component.filteredBeneficiaries).toEqual(['Households']);
  });

  it('shows condition blocks only after clicking Add Condition', () => {
    // Reach step 3 with valid earlier steps.
    component.policyForm.patchValue({
      title: 'T',
      category: 'Health',
      description: 'D',
      ministry: 'Ministry of Health and Family Welfare',
      department: 'Department of Health and Family Welfare',
      sector: 'Health',
    });
    component.setBeneficiaries(['Farmers']);
    component.benefits.at(0).setValue('B1');
    component.nextStep();
    component.nextStep();
    expect(component.currentStep).toBe(3);
    // Zoneless setup: ApplicationRef.tick() re-renders reliably,
    // fixture.detectChanges() does not propagate (see chatbot spec).
    const tick = () => TestBed.inject(ApplicationRef).tick();
    tick();

    const query = (sel: string) =>
      fixture.nativeElement.querySelectorAll(sel);
    const addButton = () =>
      fixture.nativeElement.querySelector(
        '.additional-criteria-box .btn-outline-criteria',
      ) as HTMLElement;
    // 1. Initial: no blocks or inputs, empty-state message visible.
    expect(query('.condition-block').length).toBe(0);
    expect(query('.condition-block input').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain(
      'No additional conditions added',
    );

    // 2. First click: exactly one block with keyword + one value.
    addButton().click();
    tick();
    expect(query('.condition-block').length).toBe(1);
    expect(query('.condition-block .kv-value').length).toBe(1);

    // 3. Add Value appends to the same block, preserving entries.
    const keywordInput = query('.condition-block input')[0] as HTMLInputElement;
    keywordInput.value = 'Target Beneficiaries';
    keywordInput.dispatchEvent(new Event('input'));
    (query('.condition-block .kv-value')[0] as HTMLInputElement).value = 'Households';
    query('.condition-block .kv-value')[0].dispatchEvent(new Event('input'));
    tick();
    const clicked = query('.condition-block .btn-dashed-add--small')[0] as HTMLElement;
    clicked.click();
    tick();
    expect(query('.condition-block').length).toBe(1);
    expect(query('.condition-block .kv-value').length).toBe(2);
    expect(component.conditionBlocks[0].keyword).toBe('Target Beneficiaries');
    expect(component.conditionBlocks[0].values[0]).toBe('Households');

    // 4. Second Add Condition: new block, first block intact.
    addButton().click();
    tick();
    expect(query('.condition-block').length).toBe(2);
    expect(component.conditionBlocks[0].values).toEqual(['Households', '']);

    // 5. Remove one value: block and other value stay.
    (query('.condition-block')[0].querySelectorAll('.kv-row .btn-icon-danger')[1] as HTMLElement).click();
    tick();
    expect(query('.condition-block').length).toBe(2);
    expect(query('.condition-block')[0].querySelectorAll('.kv-value').length).toBe(1);

    // 6. Remove one block: the other block stays.
    (query('.condition-block')[0].querySelector('.condition-block__row .btn-icon-danger') as HTMLElement).click();
    tick();
    expect(query('.condition-block').length).toBe(1);

    // 7. Remove the last block: empty state restored.
    (query('.condition-block')[0].querySelector('.condition-block__row .btn-icon-danger') as HTMLElement).click();
    tick();
    expect(query('.condition-block').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain(
      'No additional conditions added',
    );
  });

  it('tracks forward and backward step transitions without animating invalid moves', () => {
    expect(component.stepTransition).toBeNull();
    // Invalid step 1: no advance, no transition.
    component.nextStep();
    expect(component.currentStep).toBe(1);
    expect(component.stepTransition).toBeNull();

    component.policyForm.patchValue({ title: 'T', category: 'Health', description: 'D' });
    component.benefits.at(0).setValue('B1');
    component.nextStep();
    expect(component.currentStep).toBe(2);
    expect(component.stepTransition).toBe('forward');

    component.prevStep();
    expect(component.currentStep).toBe(1);
    expect(component.stepTransition).toBe('back');

    component.goToStep(2);
    expect(component.stepTransition).toBe('forward');
    component.goToStep(1);
    expect(component.stepTransition).toBe('back');
  });

  it('applies the forward animation class to the form on Next', () => {
    component.policyForm.patchValue({
      title: 'T',
      category: 'Health',
      description: 'D',
      ministry: 'M',
      department: 'D',
      sector: 'S',
    });
    component.benefits.at(0).setValue('B1');
    component.nextStep();
    component.nextStep();
    expect(component.currentStep).toBe(3);
    const tick = () => TestBed.inject(ApplicationRef).tick();
    tick();
    const form = fixture.nativeElement.querySelector('form');
    expect(form.classList.contains('step-anim-forward')).toBe(true);
    expect(form.classList.contains('step-anim-back')).toBe(false);
    // Values survive the animated navigation.
    expect(component.policyForm.get('title')?.value).toBe('T');
  });

  it('maps the progress fill width from the active step index', () => {
    for (const [step, width] of [[1, 0], [2, 20], [3, 40], [4, 60], [5, 80]]) {
      component.currentStep = step as number;
      expect(component.stepperProgress).toBe(width);
    }
  });

  it('grows and retracts the progress line through Next and Previous', () => {
    component.policyForm.patchValue({
      title: 'T',
      category: 'Health',
      description: 'D',
      ministry: 'M',
      department: 'D',
      sector: 'S',
    });
    component.benefits.at(0).setValue('B1');
    const tick = () => TestBed.inject(ApplicationRef).tick();
    tick();
    const width = () =>
      (fixture.nativeElement.querySelector('.policy-stepper__progress') as HTMLElement).style.width;
    expect(width()).toBe('0%');
    (fixture.nativeElement.querySelector('.policy-create__footer-right .btn-primary') as HTMLElement).click();
    tick();
    expect(component.currentStep).toBe(2);
    expect(width()).toBe('20%');
    (fixture.nativeElement.querySelector('.policy-create__footer-left .btn-outline') as HTMLElement).click();
    tick();
    expect(component.currentStep).toBe(1);
    expect(width()).toBe('0%');
  });

  it('opens the draft confirmation immediately without calling the API', () => {
    const saveDraftSpy = vi.spyOn(policyService, 'saveDraft');
    component.policyForm.patchValue({ title: 'Draft Title' });
    component.openSaveDraftConfirm();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe('Save Policy as Draft');
    expect(component.confirmHighlight).toBe('Draft Title');
    expect(component.confirmText).toBe('Save as Draft');
    expect(saveDraftSpy).not.toHaveBeenCalled();
  });

  it('cancelling the draft confirmation makes no request and changes nothing', () => {
    const saveDraftSpy = vi.spyOn(policyService, 'saveDraft');
    component.openSaveDraftConfirm();
    expect(component.confirmModalOpen).toBe(true);
    component.onConfirmModalCancelled();
    expect(component.confirmModalOpen).toBe(false);
    expect(saveDraftSpy).not.toHaveBeenCalled();
    expect(component.isEditMode).toBe(false);
  });

  it('confirming the draft triggers exactly one request and blocks repeats', () => {
    const saveDraftSpy = vi.spyOn(policyService, 'saveDraft').mockReturnValue(
      of({ policy_id: 7, status: 'DRAFT' } as any),
    );
    const navigateSpy = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.openSaveDraftConfirm();
    component.onConfirmModalConfirmed();
    expect(saveDraftSpy).toHaveBeenCalledTimes(1);
    expect(component.confirmModalOpen).toBe(false);
    expect(component.isEditMode).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith([
      '/dashboard',
      'government',
      'policies',
      'manage',
    ]);
  });

  it('navigates to the admin manage page after draft save for admins', () => {
    component.isAdmin = true;
    (component as any).rolePrefix = 'admin';
    vi.spyOn(policyService, 'saveDraft').mockReturnValue(
      of({ policy_id: 8, status: 'DRAFT' } as any),
    );
    const navigateSpy = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.openSaveDraftConfirm();
    component.onConfirmModalConfirmed();
    expect(navigateSpy).toHaveBeenCalledWith([
      '/dashboard',
      'admin',
      'policies',
      'manage',
    ]);
  });

  it('shows the backend error when draft save fails without success side effects', () => {
    vi.spyOn(policyService, 'saveDraft').mockReturnValue(
      throwError(() => ({ error: { detail: 'Draft quota exceeded.' } })),
    );
    const toastSpy = vi.spyOn((component as any).toastService, 'success');
    component.openSaveDraftConfirm();
    component.onConfirmModalConfirmed();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmErrorMessage).toBe('Draft quota exceeded.');
    expect(component.isEditMode).toBe(false);
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

