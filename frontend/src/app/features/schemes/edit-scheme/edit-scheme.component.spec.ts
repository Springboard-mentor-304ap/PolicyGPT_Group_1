import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { EditSchemeComponent } from './edit-scheme.component';

function makeComponent(role: string): {
  component: EditSchemeComponent;
  schemeService: any;
  policyService: any;
  toastService: any;
  router: any;
} {
  const schemeService = {
    getScheme: vi.fn().mockReturnValue(
      of({
        scheme_id: 7,
        name: 'Edited Scheme',
        description: 'd',
        category: 'Agriculture',
        ministry: '',
        department: '',
        state: 'All India',
        status: 'DRAFT',
        created_by: 4,
      }),
    ),
    getEligibilityRules: vi.fn().mockReturnValue(of([])),
    updateScheme: vi.fn().mockReturnValue(of({})),
    submitScheme: vi.fn(),
    approveScheme: vi.fn(),
    saveDraft: vi.fn(),
  };
  const policyService = {
    getPolicies: vi.fn().mockReturnValue(of({ total: 0, policies: [] })),
    getPolicy: vi.fn().mockReturnValue(of({ policy_id: 11, title: 'National Health Policy' })),
  };
  const toastService = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  const prefix = role === 'ADMIN' ? 'admin' : 'government';
  const route: any = { snapshot: { paramMap: { get: () => '7' } }, url: `/dashboard/${prefix}/schemes/edit/7` };
  const router: any = { navigate: vi.fn(), url: `/dashboard/${prefix}/schemes/edit/7` };
  const auth: any = {
    getUserRole: () => role,
    getStoredUser: () => ({ user_id: role === 'ADMIN' ? 1 : 4, role }),
  };
  const cdr: any = { detectChanges: vi.fn() };
  const component = new EditSchemeComponent(
    new FormBuilder(),
    route,
    router,
    auth,
    schemeService as never,
    policyService as never,
    toastService as never,
    cdr,
  );
  component.ngOnInit();
  return { component, schemeService, policyService, toastService, router };
}

function fillValidForm(component: EditSchemeComponent): void {
  component.schemeForm.patchValue({
    name: 'Edited Scheme',
    category: 'Agriculture',
    ministry: 'Ministry of Education',
    department: 'Department of Higher Education',
    description: 'Updated description for the scheme.',
    launchDate: '2026-01-15',
    declarationAgreed: true,
  });
}

describe('EditSchemeComponent submit workflow', () => {
  it('1. admin submit goes through submitScheme (never approveScheme)', () => {
    const { component, schemeService } = makeComponent('ADMIN');
    expect(component.isAdmin).toBe(true);
    fillValidForm(component);
    schemeService.submitScheme.mockReturnValue(
      of({ scheme_id: 7, name: 'Edited Scheme', status: 'APPROVED' }),
    );

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe('Submit Scheme');
    expect(schemeService.updateScheme).not.toHaveBeenCalled();

    component.onConfirmModalConfirmed();

    expect(schemeService.updateScheme).toHaveBeenCalled();
    expect(schemeService.submitScheme).toHaveBeenCalledWith(7);
    expect(schemeService.approveScheme).not.toHaveBeenCalled();
    expect(component.submittedApproved).toBe(true);
    expect(component.confirmModalOpen).toBe(false);
    expect(component.showSuccessModal).toBe(true);
  });

  it('2. gov submit goes to PENDING_APPROVAL with pending messaging', () => {
    const { component, schemeService, toastService } = makeComponent('GOVERNMENT_OFFICIAL');
    expect(component.isAdmin).toBe(false);
    fillValidForm(component);
    schemeService.submitScheme.mockReturnValue(
      of({ scheme_id: 7, name: 'Edited Scheme', status: 'PENDING_APPROVAL' }),
    );

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmText).toBe('Submit for Approval');

    component.onConfirmModalConfirmed();

    expect(schemeService.submitScheme).toHaveBeenCalledWith(7);
    expect(component.submittedApproved).toBe(false);
    expect(component.showSuccessModal).toBe(true);
    expect(component.modalType).toBe('add-more');
    expect(component.modalTitle).toBe('Scheme Submission Complete');
    expect(
      toastService.success.mock.calls.some((args: unknown[]) =>
        String(args[0]).includes('submitted for approval'),
      ),
    ).toBe(true);
  });

  it('3. backend submit errors surface without a success modal', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);
    schemeService.submitScheme.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Only DRAFT or REJECTED schemes can be submitted.' } })),
    );

    component.onSubmit();
    component.onConfirmModalConfirmed();

    expect(component.showSuccessModal).toBe(false);
    expect(component.isSubmitting).toBe(false);
    expect(String(component.confirmErrorMessage ?? '')).toContain('Only DRAFT or REJECTED');
  });

  it('3b. cancelling the submit confirmation fires no requests', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(true);
    component.onConfirmModalCancelled();

    expect(schemeService.updateScheme).not.toHaveBeenCalled();
    expect(schemeService.submitScheme).not.toHaveBeenCalled();
    expect(component.showSuccessModal).toBe(false);
  });

  it('3c. Save as Draft opens the shared confirmation first', () => {
    const { component, schemeService } = makeComponent('ADMIN');
    fillValidForm(component);

    component.openSaveDraftConfirm();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe('Save Scheme as Draft');
    expect(component.confirmText).toBe('Save as Draft');
    expect(schemeService.updateScheme).not.toHaveBeenCalled();

    component.onConfirmModalConfirmed();
    expect(schemeService.updateScheme).toHaveBeenCalled();
    expect(component.confirmModalOpen).toBe(false);
  });

  it('4. saveDraft stays on the draft path and never approves', () => {
    const { component, schemeService, router } = makeComponent('ADMIN');
    fillValidForm(component);
    schemeService.updateScheme.mockReturnValue(of({ scheme_id: 7 }));

    component.saveDraft();

    expect(schemeService.updateScheme).toHaveBeenCalled();
    expect(schemeService.submitScheme).not.toHaveBeenCalled();
    expect(schemeService.approveScheme).not.toHaveBeenCalled();
    // Successful draft save redirects to the role-based Manage page.
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/admin/schemes/manage']);
  });

  it('4b. gov draft save redirects to the government Manage page', () => {
    const { component, schemeService, router } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);
    schemeService.updateScheme.mockReturnValue(of({ scheme_id: 7 }));

    component.saveDraft();

    expect(schemeService.updateScheme).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ related_policy_id: null }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/government/schemes/manage']);
  });

  it('4c. failed draft save stays put without navigation', () => {
    const { component, schemeService, router } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);
    schemeService.updateScheme.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Update rejected by backend.' } })),
    );

    component.saveDraft();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.confirmErrorMessage).toContain('Update rejected by backend');
    // Form data retained for retry; flags released.
    expect(component.schemeForm.get('name')?.value).toBe('Edited Scheme');
    expect(component.isSaving).toBe(false);
  });

  it('5. restores the saved related-policy selection when reopening', () => {
    const { component, schemeService, policyService } = makeComponent('GOVERNMENT_OFFICIAL');
    schemeService.getScheme.mockReturnValue(
      of({
        scheme_id: 7,
        name: 'Linked Scheme',
        description: 'd',
        category: 'Agriculture',
        ministry: '',
        department: '',
        state: 'All India',
        status: 'DRAFT',
        created_by: 4,
        related_policy_id: 11,
        related_policy_title: 'National Health Policy',
      }),
    );
    policyService.getPolicies.mockReturnValue(of({ total: 0, policies: [] }));

    component.loadSchemeData();

    expect(component.schemeForm.get('relatedPolicyId')?.value).toBe('11');
    expect(component.relatedPolicyLabel).toBe('National Health Policy');
    expect(component.relatedPolicyOptions).toEqual([
      { value: '11', label: 'National Health Policy' },
    ]);
  });

  it('6. update payload carries the related-policy reference', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);
    component.schemeForm.patchValue({ relatedPolicyId: '11' });
    schemeService.submitScheme.mockReturnValue(
      of({ scheme_id: 7, name: 'Edited Scheme', status: 'PENDING_APPROVAL' }),
    );

    component.onSubmit();
    component.onConfirmModalConfirmed();

    expect(schemeService.updateScheme).toHaveBeenCalled();
    expect(schemeService.updateScheme.mock.calls[0][1]).toMatchObject({
      related_policy_id: 11,
    });
  });

  it('7. custom dropdown text is preserved into the update payload', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);
    component.schemeForm.patchValue({
      category: 'Renewable Energy / Electricity',
      ministry: 'Ministry of Education',
      department: 'Department of Higher Education',
      education: 'Custom Diploma Program',
    });
    schemeService.submitScheme.mockReturnValue(
      of({ scheme_id: 7, name: 'Edited Scheme', status: 'PENDING_APPROVAL' }),
    );

    component.onSubmit();
    component.onConfirmModalConfirmed();

    expect(schemeService.updateScheme).toHaveBeenCalled();
    expect(schemeService.updateScheme.mock.calls[0][1]).toMatchObject({
      category: 'Renewable Energy / Electricity',
    });
  });

  it('8. restores the saved launch date when reopening', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    schemeService.getScheme.mockReturnValue(
      of({
        scheme_id: 7,
        name: 'Dated Scheme',
        description: 'd',
        category: 'Agriculture',
        ministry: '',
        department: '',
        state: 'All India',
        status: 'DRAFT',
        created_by: 4,
        launch_date: '2026-02-20',
      }),
    );

    component.loadSchemeData();

    expect(component.schemeForm.get('launchDate')?.value).toBe('2026-02-20');
  });

  it('9. missing launch date blocks submit and draft save', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);
    component.schemeForm.patchValue({ launchDate: '' });

    component.onSubmit();
    expect(component.confirmModalOpen).toBe(false);
    expect(schemeService.updateScheme).not.toHaveBeenCalled();

    component.openSaveDraftConfirm();
    expect(component.confirmModalOpen).toBe(false);
    expect(schemeService.updateScheme).not.toHaveBeenCalled();
  });

  it('9b. restores saved detail fields when reopening', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    schemeService.getScheme.mockReturnValue(
      of({
        scheme_id: 7,
        name: 'Detailed Scheme',
        description: 'd',
        category: 'Agriculture',
        ministry: 'Ministry of Education',
        department: 'Department of Higher Education',
        state: 'All India',
        status: 'DRAFT',
        created_by: 4,
        key_highlights: ['Easy online application'],
        additional_info: 'Pilot phase details.',
        important_notes: 'Budget note.',
      }),
    );

    component.loadSchemeData();

    expect(component.schemeForm.get('additionalInfo')?.value).toBe('Pilot phase details.');
    expect(component.schemeForm.get('importantNotes')?.value).toBe('Budget note.');
    expect(component.filteredHighlights).toEqual(['Easy online application']);
  });

  it('9c. restores eligibility state, second URL, and Both disability', () => {
    const { component, schemeService, policyService } = makeComponent('GOVERNMENT_OFFICIAL');
    void policyService;
    schemeService.getScheme.mockReturnValue(
      of({
        scheme_id: 7,
        name: 'Full Scheme',
        description: 'd',
        category: 'Agriculture',
        ministry: 'Ministry of Education',
        department: 'Department of Higher Education',
        state: 'All India',
        status: 'DRAFT',
        created_by: 4,
        eligibility_state: 'Karnataka',
        application_source_url: 'https://www.example.gov.in/ref',
      }),
    );
    schemeService.getEligibilityRules.mockReturnValue(
      of([{ rule_type: 'DISABILITY_STATUS', value: null }]),
    );

    component.loadSchemeData();

    expect(component.schemeForm.get('eligibilityState')?.value).toBe('Karnataka');
    expect(component.schemeForm.get('applicationSourceUrl')?.value).toBe('https://www.example.gov.in/ref');
    expect(component.schemeForm.get('disabilityStatus')?.value).toBe('Both');
  });

  it('10. restores custom category/ministry/department with matching options', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    schemeService.getScheme.mockReturnValue(
      of({
        scheme_id: 373,
        name: 'PM Surya Ghar: Muft Bijli Yojana',
        description: 'Rooftop solar for households.',
        category: 'Renewable Energy / Electricity',
        ministry: 'Ministry of New and Renewable Energy',
        department: 'Ministry of New and Renewable Energy — Rooftop Solar Programme',
        state: 'All India',
        status: 'DRAFT',
        created_by: 4,
        launch_date: '2026-02-01',
      }),
    );

    component.loadSchemeData();

    // Saved values land in the controls immediately.
    expect(component.schemeForm.get('category')?.value).toBe('Renewable Energy / Electricity');
    expect(component.schemeForm.get('ministry')?.value).toBe('Ministry of New and Renewable Energy');
    expect(component.schemeForm.get('department')?.value).toBe(
      'Ministry of New and Renewable Energy — Rooftop Solar Programme',
    );
    expect(component.schemeForm.get('launchDate')?.value).toBe('2026-02-01');
    // And each has a matching selectable option (display names resolve).
    expect(component.categories).toContain('Renewable Energy / Electricity');
    expect(component.ministries).toContain('Ministry of New and Renewable Energy');
    expect(component.departmentOptions).toContain(
      'Ministry of New and Renewable Energy — Rooftop Solar Programme',
    );
    expect(component.isLoadingRecord).toBe(false);
    expect(component.loadError).toBeNull();
  });

  it('11. loads record and rules concurrently with one call each', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    expect(schemeService.getScheme).toHaveBeenCalledTimes(1);
    expect(schemeService.getScheme).toHaveBeenCalledWith(7);
    expect(schemeService.getEligibilityRules).toHaveBeenCalledTimes(1);
    expect(schemeService.getEligibilityRules).toHaveBeenCalledWith(7);
    expect(component.isLoadingRecord).toBe(false);
  });

  it('12. load failure shows retryable error and blocks saving', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    schemeService.getScheme.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: 'Database unavailable.' } })),
    );

    component.loadSchemeData();

    expect(component.isLoadingRecord).toBe(false);
    expect(String(component.loadError ?? '')).toContain('Database unavailable');
    // Saving while a load is in flight is blocked even with a valid form.
    fillValidForm(component);
    component.isLoadingRecord = true;
    component.saveDraft();
    expect(schemeService.updateScheme).not.toHaveBeenCalled();
    component.isLoadingRecord = false;
    // Submit also waits for confirmation only after validation; with a
    // load in flight the confirm path stays shut.
    component.isLoadingRecord = true;
    component.onSubmit();
    expect(component.confirmModalOpen).toBe(false);
    component.isLoadingRecord = false;

    // Retry re-fires the record load.
    schemeService.getScheme.mockReturnValue(
      of({
        scheme_id: 7,
        name: 'Recovered Scheme',
        description: 'd',
        category: 'Agriculture',
        ministry: '',
        department: '',
        state: 'All India',
        status: 'DRAFT',
        created_by: 4,
      }),
    );
    const calls = schemeService.getScheme.mock.calls.length;
    component.retryLoad();
    expect(schemeService.getScheme.mock.calls.length).toBe(calls + 1);
    expect(component.loadError).toBeNull();
    expect(component.schemeForm.get('name')?.value).toBe('Recovered Scheme');
  });

  it('13. reloading never duplicates dynamic criteria rows', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    schemeService.getScheme.mockReturnValue(
      of({
        scheme_id: 7,
        name: 'Criteria Scheme',
        description: 'd',
        category: 'Agriculture',
        ministry: '',
        department: '',
        state: 'All India',
        status: 'DRAFT',
        created_by: 4,
      }),
    );
    schemeService.getEligibilityRules.mockReturnValue(
      of([{ rule_type: 'CUSTOM_CONDITION', description: 'residency proof' }]),
    );

    component.loadSchemeData();
    component.loadSchemeData();

    expect(component.additionalCriteriaList).toEqual(['residency proof']);
  });

  it('14. completion YES goes to a fresh Add form, NO to Manage', () => {
    const { component, schemeService, router } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);
    schemeService.submitScheme.mockReturnValue(
      of({ scheme_id: 7, name: 'Edited Scheme', status: 'PENDING_APPROVAL' }),
    );
    component.onSubmit();
    component.onConfirmModalConfirmed();
    expect(component.modalType).toBe('add-more');

    component.onAddMoreScheme();
    expect(component.showSuccessModal).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/government/schemes/add']);

    // Reopen the completion state and choose NO.
    (component as any).showSuccessModal = true;
    (component as any).modalType = 'add-more';
    router.navigate.mockClear();
    component.onFinishAddingSchemes();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/government/schemes/manage']);
  });

  it('15. failed edit submit never shows the completion popup', () => {
    const { component, schemeService } = makeComponent('GOVERNMENT_OFFICIAL');
    fillValidForm(component);
    schemeService.submitScheme.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Only DRAFT or REJECTED schemes can be submitted.' } })),
    );
    component.onSubmit();
    component.onConfirmModalConfirmed();
    expect(component.showSuccessModal).toBe(false);
    expect(component.modalType).toBeNull();
  });
});
