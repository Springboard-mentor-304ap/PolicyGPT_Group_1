import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddSchemeComponent } from './add-scheme.component';
import { SchemeService } from '../../../core/services/scheme.service';
import { PolicyService } from '../../../core/services/policy.service';
import { ToastService } from '../../../core/services/toast.service';
import { Auth } from '../../../core/services/auth';

describe('AddSchemeComponent', () => {
  let component: AddSchemeComponent;
  let fixture: ComponentFixture<AddSchemeComponent>;
  let schemeService: SchemeService;
  let toastService: ToastService;
  let policyService: { getPolicies: any; getPolicy: any };
  let authService: any;

  const policyList = {
    total: 2,
    page: 1,
    limit: 100,
    pages: 1,
    policies: [
      { policy_id: 11, title: 'National Health Policy' },
      { policy_id: 12, title: 'Education Reform Policy' },
    ],
  };

  beforeEach(async () => {
    authService = {
      getStoredUser: () => ({ user_id: 2, role: 'GOVERNMENT_OFFICIAL', full_name: 'Gov User' }),
      getUserRole: () => 'GOVERNMENT_OFFICIAL',
      getToken: () => 'fake-gov-jwt-token',
    };

    policyService = {
      getPolicies: vi.fn().mockReturnValue(of(policyList)),
      getPolicy: vi.fn().mockReturnValue(of({ policy_id: 11, title: 'National Health Policy' })),
    };

    await TestBed.configureTestingModule({
      imports: [AddSchemeComponent],
      providers: [
        SchemeService,
        ToastService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth, useValue: authService },
        { provide: PolicyService, useValue: policyService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddSchemeComponent);
    component = fixture.componentInstance;
    schemeService = TestBed.inject(SchemeService);
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it('1. should initialize with step 1 and valid government role', () => {
    expect(component.currentStep).toBe(1);
    expect(component.totalSteps).toBe(5);
    expect(component.isAdmin).toBe(false);
    expect(component.rolePrefix).toBe('government');
  });

  it('2. should validate required fields in step 1', () => {
    expect(component.isStepValid(1)).toBe(false);

    component.schemeForm.patchValue({
      name: 'PM Rooftop Solar Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Clean energy generation initiative for households across the nation.',
      launchDate: '2026-01-15',
    });

    expect(component.isStepValid(1)).toBe(true);
  });

  it('3. should save draft when saveDraft() is clicked', () => {
    component.schemeForm.patchValue({
      name: 'PM Rooftop Solar Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Clean energy generation initiative for households across the nation.',
      launchDate: '2026-01-15',
    });

    const saveDraftSpy = vi.spyOn(schemeService, 'saveDraft').mockReturnValue(
      of({
        scheme_id: 55,
        name: 'PM Rooftop Solar Scheme',
        description: 'Clean energy generation initiative for households across the nation.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.saveDraft();
    expect(saveDraftSpy).toHaveBeenCalled();
    expect(component.editingSchemeId).toBe(55);
    expect(component.savedDraftToast).toBe(true);
  });

  it('3b. successful draft save redirects gov users to Manage Schemes', () => {
    component.schemeForm.patchValue({
      name: 'Redirect Draft',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Draft that redirects on save.',
      launchDate: '2026-01-15',
    });
    vi.spyOn(schemeService, 'saveDraft').mockReturnValue(
      of({
        scheme_id: 56,
        name: 'Redirect Draft',
        description: 'Draft that redirects on save.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.saveDraft();
    expect(navSpy).toHaveBeenCalledWith(['/dashboard/government/schemes/manage']);
  });

  it('3c. successful draft save redirects admins to Manage Schemes', () => {
    component.isAdmin = true;
    component.rolePrefix = 'admin';
    component.schemeForm.patchValue({
      name: 'Admin Redirect Draft',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Admin draft that redirects on save.',
      launchDate: '2026-01-15',
    });
    vi.spyOn(schemeService, 'saveDraft').mockReturnValue(
      of({
        scheme_id: 57,
        name: 'Admin Redirect Draft',
        description: 'Admin draft that redirects on save.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.saveDraft();
    expect(navSpy).toHaveBeenCalledWith(['/dashboard/admin/schemes/manage']);
  });

  it('3d. failed draft save stays put with form intact', () => {
    component.schemeForm.patchValue({
      name: 'Failing Draft',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Draft the backend rejects.',
      launchDate: '2026-01-15',
    });
    vi.spyOn(schemeService, 'saveDraft').mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'A scheme with the same name already exists.' } })),
    );
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toastService, 'error');

    component.saveDraft();
    expect(navSpy).not.toHaveBeenCalled();
    expect(component.editingSchemeId).toBeNull();
    expect(component.confirmErrorMessage).toContain('already exists');
    expect(
      toastSpy.mock.calls.some((args) => String(args[0]).includes('already exists')),
    ).toBe(true);
    // Form data retained for retry.
    expect(component.schemeForm.get('name')?.value).toBe('Failing Draft');
    expect(component.isSaving).toBe(false);
  });

  it('4. should test complete 5 step flow and submit for approval as Government Official', () => {
    // Step 1
    component.schemeForm.patchValue({
      name: 'PM Rooftop Solar Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Clean energy generation initiative for households across the nation.',
      launchDate: '2026-01-15',
    });
    component.nextStep();
    expect(component.currentStep).toBe(2);

    // Step 2
    component.nextStep();
    expect(component.currentStep).toBe(3);

    // Step 3
    component.nextStep();
    expect(component.currentStep).toBe(4);

    // Step 4
    component.nextStep();
    expect(component.currentStep).toBe(5);

    // Step 5
    component.schemeForm.patchValue({ declarationAgreed: true });
    expect(component.isStepValid(5)).toBe(true);

    const createSpy = vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 88,
        name: 'PM Rooftop Solar Scheme',
        description: 'Clean energy generation initiative for households across the nation.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    const submitSpy = vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 88,
        name: 'PM Rooftop Solar Scheme',
        description: 'Clean energy generation initiative for households across the nation.',
        category: 'Energy',
        status: 'PENDING_APPROVAL',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.onSubmit();
    // Validation passed: the shared submit confirmation opens first (no API yet).
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe('Submit Scheme');
    expect(createSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();

    component.onConfirmModalConfirmed();
    expect(createSpy).toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledWith(88);
    expect(component.confirmModalOpen).toBe(false);
    expect(component.showSuccessModal).toBe(true);
  });

  it('5. admin submit uses the backend-confirmed APPROVED status', () => {
    component.isAdmin = true;
    component.rolePrefix = 'admin';
    component.schemeForm.patchValue({
      name: 'Admin Direct Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Admin created scheme for direct approval.',
      launchDate: '2026-01-15',
    });
    component.schemeForm.patchValue({ declarationAgreed: true });

    vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 91,
        name: 'Admin Direct Scheme',
        description: 'Admin created scheme for direct approval.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 91,
        name: 'Admin Direct Scheme',
        description: 'Admin created scheme for direct approval.',
        category: 'Energy',
        status: 'APPROVED',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    const toastSpy = vi.spyOn(toastService, 'success');

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmText).toBe('Submit');
    component.onConfirmModalConfirmed();
    expect(component.submittedApproved).toBe(true);
    expect(component.showSuccessModal).toBe(true);
    expect(
      toastSpy.mock.calls.some((args) =>
        String(args[0]).includes('approved successfully'),
      ),
    ).toBe(true);
  });

  it('6. gov submit shows the pending message from the backend status', () => {
    component.schemeForm.patchValue({
      name: 'Gov Pending Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Gov created scheme for approval.',
      launchDate: '2026-01-15',
    });
    component.schemeForm.patchValue({ declarationAgreed: true });

    vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 92,
        name: 'Gov Pending Scheme',
        description: 'Gov created scheme for approval.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 92,
        name: 'Gov Pending Scheme',
        description: 'Gov created scheme for approval.',
        category: 'Energy',
        status: 'PENDING_APPROVAL',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    const toastSpy = vi.spyOn(toastService, 'success');

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmText).toBe('Submit for Approval');
    component.onConfirmModalConfirmed();
    expect(component.submittedApproved).toBe(false);
    expect(component.showSuccessModal).toBe(true);
    expect(component.modalType).toBe('add-more');
    expect(component.modalTitle).toBe('Scheme Submission Complete');
    expect(component.modalMessage).toBe('Do you want to add another scheme?');
    expect(
      toastSpy.mock.calls.some((args) =>
        String(args[0]).includes('submitted for approval'),
      ),
    ).toBe(true);
  });

  it('7. loads related-policy options from the backend on init', () => {
    expect(policyService.getPolicies).toHaveBeenCalledWith({
      status: 'APPROVED',
      page: 1,
      limit: 100,
    });
    expect(component.relatedPolicyOptions).toEqual([
      { value: '11', label: 'National Health Policy' },
      { value: '12', label: 'Education Reform Policy' },
    ]);
    expect(component.relatedPolicyLabel).toBe('None');
  });

  it('8. includes the related policy in create payload and review label', () => {
    component.schemeForm.patchValue({
      name: 'Linked Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Scheme linked to a policy.',
      relatedPolicyId: '11',
      declarationAgreed: true,
      launchDate: '2026-01-15',
    });
    expect(component.relatedPolicyLabel).toBe('National Health Policy');

    const createSpy = vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 93,
        name: 'Linked Scheme',
        description: 'Scheme linked to a policy.',
        category: 'Energy',
        status: 'DRAFT',
        related_policy_id: 11,
        related_policy_title: 'National Health Policy',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 93,
        name: 'Linked Scheme',
        description: 'Scheme linked to a policy.',
        category: 'Energy',
        status: 'PENDING_APPROVAL',
        related_policy_id: 11,
        related_policy_title: 'National Health Policy',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(true);
    component.onConfirmModalConfirmed();
    expect(createSpy).toHaveBeenCalled();
    expect(createSpy.mock.calls[0][0]).toMatchObject({ related_policy_id: 11 });
  });

  it('9. saveDraft persists the related-policy reference', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.schemeForm.patchValue({
      name: 'Draft Linked Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Draft with a policy link.',
      relatedPolicyId: '12',
      launchDate: '2026-01-15',
    });

    const saveDraftSpy = vi.spyOn(schemeService, 'saveDraft').mockReturnValue(
      of({
        scheme_id: 94,
        name: 'Draft Linked Scheme',
        description: 'Draft with a policy link.',
        category: 'Energy',
        status: 'DRAFT',
        related_policy_id: 12,
        related_policy_title: 'Education Reform Policy',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.saveDraft();
    expect(saveDraftSpy).toHaveBeenCalled();
    expect(saveDraftSpy.mock.calls[0][0]).toMatchObject({ related_policy_id: 12 });
    expect(component.editingSchemeId).toBe(94);
  });

  it('10. custom category text is carried into the submit payload', () => {
    component.schemeForm.patchValue({
      name: 'Custom Category Scheme',
      category: 'Renewable Energy / Electricity',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Scheme with a custom category.',
      declarationAgreed: true,
      launchDate: '2026-01-15',
    });

    const createSpy = vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 95,
        name: 'Custom Category Scheme',
        description: 'Scheme with a custom category.',
        category: 'Renewable Energy / Electricity',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 95,
        name: 'Custom Category Scheme',
        description: 'Scheme with a custom category.',
        category: 'Renewable Energy / Electricity',
        status: 'PENDING_APPROVAL',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(true);
    component.onConfirmModalConfirmed();
    expect(createSpy).toHaveBeenCalled();
    expect(createSpy.mock.calls[0][0]).toMatchObject({
      category: 'Renewable Energy / Electricity',
    });
  });

  it('11. custom department survives a ministry change to a mapped ministry', () => {
    component.schemeForm.patchValue({
      ministry: 'Ministry of Education',
      department: 'Custom Solar Cell',
    });
    component.onMinistryChange('Ministry of Education');
    // Custom-typed departments are never silently cleared.
    expect(component.schemeForm.get('department')?.value).toBe('Custom Solar Cell');
    // A stale predefined department is still reset.
    component.schemeForm.patchValue({ department: 'Department of Higher Education' });
    component.onMinistryChange('Ministry of Chemicals and Fertilizers');
    expect(component.schemeForm.get('department')?.value).toBe('');
  });

  it('12. related-policy selector stays strict (no custom option)', () => {
    component.schemeForm.patchValue({ relatedPolicyId: '11' });
    expect(component.relatedPolicyLabel).toBe('National Health Policy');
    component.schemeForm.patchValue({ relatedPolicyId: null });
    expect(component.relatedPolicyLabel).toBe('None');
  });

  it('13. Save as Draft opens the shared confirmation first (no API yet)', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.schemeForm.patchValue({
      name: 'Confirm Draft Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Draft gated by confirmation.',
      launchDate: '2026-01-15',
    });
    const saveDraftSpy = vi.spyOn(schemeService, 'saveDraft').mockReturnValue(
      of({
        scheme_id: 96,
        name: 'Confirm Draft Scheme',
        description: 'Draft gated by confirmation.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.openSaveDraftConfirm();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe('Save Scheme as Draft');
    expect(component.confirmText).toBe('Save as Draft');
    expect(saveDraftSpy).not.toHaveBeenCalled();

    component.onConfirmModalConfirmed();
    expect(saveDraftSpy).toHaveBeenCalled();
    expect(component.confirmModalOpen).toBe(false);
    expect(component.editingSchemeId).toBe(96);
  });

  it('14. cancelling the draft confirmation changes nothing', () => {
    component.schemeForm.patchValue({
      name: 'Cancelled Draft',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Draft that stays unsubmitted.',
      launchDate: '2026-01-15',
    });
    const saveDraftSpy = vi.spyOn(schemeService, 'saveDraft');

    component.openSaveDraftConfirm();
    component.onConfirmModalCancelled();
    expect(component.confirmModalOpen).toBe(false);
    expect(saveDraftSpy).not.toHaveBeenCalled();
    expect(component.editingSchemeId).toBeNull();
  });

  it('15. cancelling the submit confirmation fires no requests', () => {
    component.schemeForm.patchValue({
      name: 'Cancelled Submit',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Submit that never fires.',
      declarationAgreed: true,
      launchDate: '2026-01-15',
    });
    const createSpy = vi.spyOn(schemeService, 'createScheme');
    const submitSpy = vi.spyOn(schemeService, 'submitScheme');

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(true);
    component.onConfirmModalCancelled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(component.showSuccessModal).toBe(false);
  });

  it('16. submit failure surfaces in the confirmation without success', () => {
    component.schemeForm.patchValue({
      name: 'Failing Submit',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Submit that the backend rejects.',
      declarationAgreed: true,
      launchDate: '2026-01-15',
    });
    vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 97,
        name: 'Failing Submit',
        description: 'Submit that the backend rejects.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Only DRAFT or REJECTED schemes can be submitted.' } })),
    );
    const toastSpy = vi.spyOn(toastService, 'error');

    component.onSubmit();
    component.onConfirmModalConfirmed();
    expect(component.showSuccessModal).toBe(false);
    expect(component.confirmErrorMessage).toContain('Only DRAFT or REJECTED');
    expect(
      toastSpy.mock.calls.some((args) =>
        String(args[0]).includes('Only DRAFT or REJECTED'),
      ),
    ).toBe(true);
  });

  it('17. missing launch date blocks submit with a step-2 error', () => {
    component.schemeForm.patchValue({
      name: 'No Date Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Scheme without a launch date.',
      launchDate: '',
      declarationAgreed: true,
    });
    const createSpy = vi.spyOn(schemeService, 'createScheme');

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
    expect(component.isStepValid(2)).toBe(false);
    expect(component.schemeForm.get('launchDate')?.touched).toBe(true);
  });

  it('18. missing launch date blocks draft save', () => {
    component.schemeForm.patchValue({
      name: 'No Date Draft',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Draft without a launch date.',
      launchDate: '',
    });
    const saveDraftSpy = vi.spyOn(schemeService, 'saveDraft');
    const toastSpy = vi.spyOn(toastService, 'warning');

    component.openSaveDraftConfirm();
    expect(component.confirmModalOpen).toBe(false);
    expect(saveDraftSpy).not.toHaveBeenCalled();
    expect(
      toastSpy.mock.calls.some((args) =>
        String(args[0]).includes('Publication / Launch Date'),
      ),
    ).toBe(true);
  });

  it('19. launch date persists in the submit payload', () => {
    component.schemeForm.patchValue({
      name: 'Dated Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Scheme with a launch date.',
      launchDate: '2026-03-15',
      declarationAgreed: true,
    });
    const createSpy = vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 98,
        name: 'Dated Scheme',
        description: 'Scheme with a launch date.',
        category: 'Energy',
        status: 'DRAFT',
        launch_date: '2026-03-15',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 98,
        name: 'Dated Scheme',
        description: 'Scheme with a launch date.',
        category: 'Energy',
        status: 'PENDING_APPROVAL',
        launch_date: '2026-03-15',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.onSubmit();
    component.onConfirmModalConfirmed();
    expect(createSpy).toHaveBeenCalled();
    expect(createSpy.mock.calls[0][0]).toMatchObject({ launch_date: '2026-03-15' });
  });

  it('20. missing ministry blocks submit and draft save', () => {
    component.schemeForm.patchValue({
      name: 'No Ministry Scheme',
      category: 'Energy',
      ministry: '',
      department: 'Department of Higher Education',
      description: 'Scheme without ministry.',
      launchDate: '2026-03-15',
      declarationAgreed: true,
    });
    const createSpy = vi.spyOn(schemeService, 'createScheme');

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
    expect(component.schemeForm.get('ministry')?.touched).toBe(true);

    component.openSaveDraftConfirm();
    expect(component.confirmModalOpen).toBe(false);
  });

  it('21. detail fields persist in the submit payload', () => {
    component.schemeForm.patchValue({
      name: 'Detailed Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Scheme with details.',
      launchDate: '2026-04-01',
      additionalInfo: 'Pilot phase in two states.',
      importantNotes: 'Subject to budget allocation.',
      declarationAgreed: true,
    });
    component.keyHighlights.at(0).setValue('Financial assistance');
    const createSpy = vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 99,
        name: 'Detailed Scheme',
        description: 'Scheme with details.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 99,
        name: 'Detailed Scheme',
        description: 'Scheme with details.',
        category: 'Energy',
        status: 'PENDING_APPROVAL',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.onSubmit();
    component.onConfirmModalConfirmed();
    expect(createSpy).toHaveBeenCalled();
    expect(createSpy.mock.calls[0][0]).toMatchObject({
      key_highlights: ['Financial assistance'],
      additional_info: 'Pilot phase in two states.',
      important_notes: 'Subject to budget allocation.',
    });
  });

  it('22. eligibility state and second source URL persist in payload', () => {
    component.schemeForm.patchValue({
      name: 'Full Persistence Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Scheme exercising every persisted field.',
      launchDate: '2026-04-01',
      eligibilityState: 'Karnataka',
      applicationSourceUrl: 'https://www.example.gov.in/ref',
      disabilityStatus: 'Both',
      declarationAgreed: true,
    });
    const createSpy = vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 100,
        name: 'Full Persistence Scheme',
        description: 'Scheme exercising every persisted field.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      of({
        scheme_id: 100,
        name: 'Full Persistence Scheme',
        description: 'Scheme exercising every persisted field.',
        category: 'Energy',
        status: 'PENDING_APPROVAL',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );

    component.onSubmit();
    component.onConfirmModalConfirmed();
    expect(createSpy).toHaveBeenCalled();
    const payload = createSpy.mock.calls[0][0];
    expect(payload).toMatchObject({
      eligibility_state: 'Karnataka',
      application_source_url: 'https://www.example.gov.in/ref',
    });
    const disRule = (payload.eligibility_rules as any[]).find(
      (r) => r.rule_type === 'DISABILITY_STATUS',
    );
    // 'Both' roundtrips as null (never collapses to false).
    expect(disRule.value).toBeNull();
  });

  it('23. completion YES restarts with a fresh form', () => {
    component.schemeForm.patchValue({
      name: 'Old Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Old description.',
      launchDate: '2026-03-15',
      declarationAgreed: true,
    });
    component.editingSchemeId = 77;
    component.showSuccessModal = true;
    (component as any).modalType = 'add-more';

    component.onAddMoreScheme();

    expect(component.showSuccessModal).toBe(false);
    expect(component.editingSchemeId).toBeNull();
    expect(component.schemeForm.get('name')?.value).toBe('');
    expect(component.currentStep).toBe(1);
  });

  it('24. completion NO navigates to Manage Schemes', () => {
    component.showSuccessModal = true;
    (component as any).modalType = 'add-more';
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onFinishAddingSchemes();

    expect(component.showSuccessModal).toBe(false);
    expect(navSpy).toHaveBeenCalledWith(['/dashboard/government/schemes/manage']);
  });

  it('25. failed submit never shows the completion popup', () => {
    component.schemeForm.patchValue({
      name: 'Failing Scheme',
      category: 'Energy',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      description: 'Submit rejected by backend.',
      launchDate: '2026-03-15',
      declarationAgreed: true,
    });
    vi.spyOn(schemeService, 'createScheme').mockReturnValue(
      of({
        scheme_id: 101,
        name: 'Failing Scheme',
        description: 'Submit rejected by backend.',
        category: 'Energy',
        status: 'DRAFT',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      })
    );
    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Only DRAFT or REJECTED schemes can be submitted.' } })),
    );

    component.onSubmit();
    component.onConfirmModalConfirmed();
    expect(component.showSuccessModal).toBe(false);
    expect((component as any).modalType).toBeNull();
  });
});
