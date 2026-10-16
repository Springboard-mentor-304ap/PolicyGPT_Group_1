import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ManageSchemesComponent } from './manage-schemes.component';
import { SchemeService } from '../../../core/services/scheme.service';
import { Auth, AuthUser } from '../../../core/services/auth';
import { SchemeListResponse, SchemeResponse } from '../../../core/models/scheme.model';

describe('ManageSchemesComponent', () => {
  let component: ManageSchemesComponent;
  let fixture: ComponentFixture<ManageSchemesComponent>;
  let schemeService: SchemeService;
  let authService: Auth;

  const mockAdminUser: AuthUser = {
    user_id: 1,
    full_name: 'Admin User',
    email: 'admin@gmail.com',
    role: 'ADMIN',
    phone: null,
    date_of_birth: null,
    state: null,
    district: null,
    occupation: null,
    organization: null,
    is_active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const mockGovUserA: AuthUser = {
    user_id: 2,
    full_name: 'Gov Official A',
    email: 'gov_a@gmail.com',
    role: 'GOVERNMENT_OFFICIAL',
    phone: null,
    date_of_birth: null,
    state: null,
    district: null,
    occupation: null,
    organization: null,
    is_active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const sampleSchemes: SchemeResponse[] = [
    {
      scheme_id: 1,
      name: 'Scheme A - Draft',
      description: 'Created by Gov Official A',
      category: 'Healthcare',
      status: 'DRAFT',
      created_by: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      scheme_id: 2,
      name: 'Scheme B - Pending',
      description: 'Created by Gov Official A',
      category: 'Healthcare',
      status: 'PENDING_APPROVAL',
      created_by: 2,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
    {
      scheme_id: 3,
      name: 'Scheme C - Approved',
      description: 'Created by Gov Official B',
      category: 'Education',
      status: 'APPROVED',
      created_by: 3,
      created_at: '2026-01-03T00:00:00Z',
      updated_at: '2026-01-03T00:00:00Z',
    },
    {
      scheme_id: 4,
      name: 'Scheme D - Archived',
      description: 'Created by Admin',
      category: 'Energy',
      status: 'ARCHIVED',
      created_by: 1,
      created_at: '2026-01-04T00:00:00Z',
      updated_at: '2026-01-04T00:00:00Z',
    },
  ];

  const mockListResponse: SchemeListResponse = {
    total: 4,
    page: 1,
    limit: 100,
    pages: 1,
    schemes: sampleSchemes,
  };

  const mockStats = {
    total: 4,
    active: 1,
    approved: 1,
    pending: 1,
    draft: 1,
    rejected: 0,
    archived: 1,
    archive_requested: 0,
    delete_requested: 0,
    by_category: {},
    by_state: {},
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageSchemesComponent],
      providers: [
        SchemeService,
        Auth,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    schemeService = TestBed.inject(SchemeService);
    authService = TestBed.inject(Auth);
  });

  // Test 1: Component creation
  it('1. should create the ManageSchemesComponent', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  // Test 2: Admin sees ALL schemes across all creators and statuses
  it('2. Admin should see ALL schemes in the system without creator restriction', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    const getSchemesSpy = vi
      .spyOn(schemeService, 'getSchemes')
      .mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(getSchemesSpy).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      manage: true,
    });
    expect(component.isAdmin).toBe(true);
    expect(component.schemes.length).toBe(4);
    expect(component.schemes.some((s) => s.createdBy === 1)).toBe(true);
    expect(component.schemes.some((s) => s.createdBy === 2)).toBe(true);
    expect(component.schemes.some((s) => s.createdBy === 3)).toBe(true);
  });

  // Test 3: Government Official sees ONLY their own schemes
  it('3. Government Official should see ONLY schemes created by their user_id', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('GOVERNMENT_OFFICIAL');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockGovUserA);
    const getSchemesSpy = vi
      .spyOn(schemeService, 'getSchemes')
      .mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(
      of({
        total: 2,
        active: 0,
        approved: 0,
        pending: 1,
        draft: 1,
        rejected: 0,
        archived: 0,
        archive_requested: 0,
        delete_requested: 0,
        by_category: {},
        by_state: {},
      })
    );

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(getSchemesSpy).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      manage: true,
    });
    expect(component.isAdmin).toBe(false);
    expect(component.schemes.length).toBe(2);
    expect(component.schemes.every((s) => s.createdBy === 2)).toBe(true);
  });

  // Test 4: Stats counters populate properly
  it('4. should populate stats counters correctly from backend analytics', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.stats.total).toBe(4);
    expect(component.stats.approved).toBe(1);
    expect(component.stats.pending).toBe(1);
    expect(component.stats.rejected).toBe(0);
    expect(component.stats.archived).toBe(1);
  });

  // Test 5: In-memory filtering, search, and sort
  it('5. should filter schemes by search text and status, and sort', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Filter by search text
    component.searchText = 'Scheme A';
    expect(component.filteredSchemes.length).toBe(1);
    expect(component.filteredSchemes[0].title).toBe('Scheme A - Draft');

    // Filter by status
    component.searchText = '';
    component.selectedStatus = 'PENDING_APPROVAL';
    expect(component.filteredSchemes.length).toBe(1);
    expect(component.filteredSchemes[0].status).toBe('PENDING_APPROVAL');

    // Sort ascending by name
    component.searchText = '';
    component.selectedStatus = '';
    component.selectedSort = 'ascending';
    component.applyFilters();
    expect(component.filteredSchemes[0].title).toBe('Scheme A - Draft');

    // Reset filters
    component.resetFilters();
    expect(component.selectedSort).toBe('latest');
    expect(component.filteredSchemes.length).toBe(4);
  });

  // Test 6: Workflow approval by Admin
  it('6. Admin approving a scheme should trigger approveScheme and reload data', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));
    const approveSpy = vi
      .spyOn(schemeService, 'approveScheme')
      .mockReturnValue(of(sampleSchemes[1]));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const pendingScheme = component.schemes[1];
    component.openApproveModal(pendingScheme);
    expect(component.confirmModalOpen).toBe(true);

    component.onConfirmModalConfirmed();
    expect(approveSpy).toHaveBeenCalledWith(pendingScheme.id);
  });

  // Test 7: Error handling when loading schemes
  it('7. should handle API error gracefully when loading schemes', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(
      throwError(() => ({ status: 500, message: 'Server error' }))
    );
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.schemes.length).toBe(0);
    expect(component.errorMessage).toBeTruthy();
  });

  // Test 8: Submit action label follows the register convention
  it('8. Menu label should be "Resubmit" for REJECTED and "Submit" otherwise', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftScheme = component.schemes[0];
    expect(component.getSubmitActionLabel(draftScheme)).toBe('Submit');

    const rejectedScheme = { ...draftScheme, status: 'REJECTED' };
    expect(component.getSubmitActionLabel(rejectedScheme)).toBe('Resubmit');
  });

  // Test 9: Submit opens confirmation modal with dynamic scheme name
  it('9. openSubmitModal should open confirmation modal displaying correct scheme name', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftScheme = component.schemes.find((s) => s.status === 'DRAFT')!;
    component.openSubmitModal(draftScheme);

    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe('Submit Scheme');
    expect(component.confirmMessage).toContain('Scheme A - Draft');
    expect(component.confirmLoading).toBe(false);
  });

  // Test 10: Cancel closes modal without changing record or calling service
  it('10. onConfirmModalCancelled should close modal without calling submitScheme', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));
    const submitSpy = vi.spyOn(schemeService, 'submitScheme');

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftScheme = component.schemes.find((s) => s.status === 'DRAFT')!;
    component.openSubmitModal(draftScheme);
    expect(component.confirmModalOpen).toBe(true);

    component.onConfirmModalCancelled();

    expect(component.confirmModalOpen).toBe(false);
    expect(component.confirmAction).toBeNull();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(
      component.schemes.find((s) => s.id === draftScheme.id)?.status,
    ).toBe('DRAFT');
  });

  // Test 11: Confirm sends correct record ID and transitions to PENDING_APPROVAL
  it('11. Confirming submit calls submitScheme and refreshes list with PENDING_APPROVAL', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    const updatedScheme: SchemeResponse = {
      ...sampleSchemes[0],
      status: 'PENDING_APPROVAL',
    };
    const submitSpy = vi
      .spyOn(schemeService, 'submitScheme')
      .mockReturnValue(of(updatedScheme));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftScheme = component.schemes.find((s) => s.status === 'DRAFT')!;
    component.openSubmitModal(draftScheme);
    component.onConfirmModalConfirmed();

    expect(submitSpy).toHaveBeenCalledWith(draftScheme.id);
    expect(component.confirmModalOpen).toBe(false);
    expect(component.confirmLoading).toBe(false);
    expect(component.successToastMessage).toBe('Scheme "Scheme A - Draft" submitted for approval.');
    expect(
      component.schemes.find((s) => s.id === draftScheme.id)?.status,
    ).toBe('PENDING_APPROVAL');
  });

  // Test 12: Duplicate clicks do not create duplicate API requests
  it('12. Multiple confirm clicks while loading should not trigger duplicate submissions', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    // Subject that doesn't emit immediately to keep loading state active
    const submitSpy = vi
      .spyOn(schemeService, 'submitScheme')
      .mockReturnValue(of(sampleSchemes[0]));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftScheme = component.schemes.find((s) => s.status === 'DRAFT')!;
    component.openSubmitModal(draftScheme);

    // Simulate loading state active
    component.confirmLoading = true;
    component.onConfirmModalConfirmed();

    expect(submitSpy).not.toHaveBeenCalled();
  });

  // Test 13: API error displays error message and preserves previous status
  it('13. API failure during submission preserves record status and sets error message', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    vi.spyOn(schemeService, 'submitScheme').mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: 'Only DRAFT or REJECTED schemes can be submitted.' } }))
    );

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftScheme = component.schemes.find((s) => s.status === 'DRAFT')!;
    component.openSubmitModal(draftScheme);
    component.onConfirmModalConfirmed();

    expect(component.confirmLoading).toBe(false);
    expect(component.errorMessage).toContain('DRAFT or REJECTED');
    expect(component.confirmErrorMessage).toContain('DRAFT or REJECTED');
    expect(
      component.schemes.find((s) => s.id === draftScheme.id)?.status,
    ).toBe('DRAFT');
  });

  // Test 14: Next available action after PENDING_APPROVAL is Approve/Reject, not Submit
  it('14. Scheme in PENDING_APPROVAL cannot be submitted again and shows Approve for Admin', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const pendingScheme = component.schemes[1];
    expect(component.canSubmitScheme(pendingScheme)).toBe(false);
  });

  // Test 15: Three-dot action menu toggle and close
  it('15. toggleMenu should open menu for clicked scheme and toggle closed on second click', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.menuOpenId).toBeNull();

    // Click scheme 1 three-dot button
    component.toggleMenu(1);
    expect(component.menuOpenId).toBe(1);

    // Click scheme 1 three-dot button again -> closes
    component.toggleMenu(1);
    expect(component.menuOpenId).toBeNull();
  });

  // Test 16: Opening one row closes any previously open row menu
  it('16. Opening another row menu should close the previously open row menu', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.toggleMenu(1);
    expect(component.menuOpenId).toBe(1);

    // Click scheme 2 three-dot button
    component.toggleMenu(2);
    expect(component.menuOpenId).toBe(2);
  });

  // Test 17: Escape key and outside closeMenu close the menu
  it('17. Escape key and closeMenu should close the active action dropdown', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.toggleMenu(1);
    expect(component.menuOpenId).toBe(1);

    // Press Escape
    component.onEscapeKey();
    expect(component.menuOpenId).toBeNull();

    // Reopen and test onOverlayKeydown Escape
    component.toggleMenu(1);
    expect(component.menuOpenId).toBe(1);
    component.onOverlayKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.menuOpenId).toBeNull();
  });

  // Test 18: Action overlay positions provide below-aligned primary and above-aligned fallback
  it('18. actionMenuPositions should define below primary and above fallback positions', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.actionMenuPositions.length).toBeGreaterThanOrEqual(2);

    // Primary: opens below button
    const primary = component.actionMenuPositions[0];
    expect(primary.originY).toBe('bottom');
    expect(primary.overlayY).toBe('top');

    // Fallback: opens above button
    const fallback = component.actionMenuPositions[1];
    expect(fallback.originY).toBe('top');
    expect(fallback.overlayY).toBe('bottom');
  });

  // Test 19: Page-number window slides at most three pages
  it('19. visiblePages should show a sliding window of three page numbers', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.schemes = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: `Scheme ${i + 1}`,
      title: `Scheme ${i + 1}`,
      description: '',
      category: 'Healthcare',
      ministry: '',
      department: '',
      state: '',
      status: 'APPROVED',
      publicationDate: '-',
    }));
    component.pageSize = 6;
    component.selectedPageSize = 6;
    component.currentPage = 1;
    expect(component.totalPages).toBe(5);
    expect(component.visiblePages).toEqual([1, 2, 3]);

    component.goToPage(2);
    expect(component.visiblePages).toEqual([1, 2, 3]);

    component.goToPage(4);
    expect(component.visiblePages).toEqual([2, 3, 4]);

    component.goToPage(5);
    expect(component.visiblePages).toEqual([3, 4, 5]);
  });

  // Test 20: Page size auto-fits small result sets and restores afterwards
  it('20. should shrink the page size to the record count and keep the range accurate', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // 4 schemes with default selection 5 -> effective size 4, one page.
    expect(component.pageSize).toBe(4);
    expect(component.totalPages).toBe(1);
    expect(component.visiblePages).toEqual([1]);
    expect(component.startItem).toBe(1);
    expect(component.endItem).toBe(4);

    // Filtering down to zero keeps the selection (never zero).
    component.searchText = 'zzz-no-such-scheme';
    component.applyFilters();
    expect(component.paginatedSchemes.length).toBe(0);
    expect(component.pageSize).toBe(5);
    expect(component.startItem).toBe(0);

    // Clearing the filter restores the full set on one page.
    component.resetFilters();
    expect(component.pageSize).toBe(4);
    expect(component.startItem).toBe(1);
    expect(component.endItem).toBe(4);
  });

  // Test 21: Rows-per-page dropdown offers 5/10/20/50 with default 5
  it('21. should not offer a 6 option and should normalize a stale 6 to 5', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.pageSizeOptions).toEqual(['5', '10', '20', '50']);
    expect(component.selectedPageSize).toBe(5);

    // A stale selected value of 6 is switched to 5 on init.
    component.selectedPageSize = 6;
    component.pageSize = 6;
    component.ngOnInit();
    expect(component.selectedPageSize).toBe(5);
  });

  // Test 22: Export menu and rows respect filters
  it('22. export menu toggles and exportRows covers all filtered records', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.exportMenuOpen).toBe(false);
    component.toggleExportMenu(new MouseEvent('click'));
    expect(component.exportMenuOpen).toBe(true);
    component.closeExportMenu();
    expect(component.exportMenuOpen).toBe(false);

    component.searchText = 'Scheme';
    const rows = (component as unknown as { exportRows: () => string[][] }).exportRows();
    expect(rows.length).toBe(4);
    expect(rows[0].length).toBe(9);
  });

  // Test 23: Drafts and deleted modals open
  it('23. header actions open drafts and deleted modals', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.openDraftsModal();
    expect(component.draftsModalOpen).toBe(true);
    component.onDraftsModalClosed();
    expect(component.draftsModalOpen).toBe(false);

    component.openDeletedModal();
    expect(component.deletedModalOpen).toBe(true);
    component.onDeletedModalClosed();
    expect(component.deletedModalOpen).toBe(false);

    component.userRole = 'GOVERNMENT_OFFICIAL';
    component.openGovtDeletedModal();
    expect(component.govtDeletedModalOpen).toBe(true);
    component.onGovtDeletedModalClosed();
    expect(component.govtDeletedModalOpen).toBe(false);
  });

  // Test 24: Admin direct archive from APPROVED
  it('24. openArchiveModal archives an APPROVED scheme via archiveScheme', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));
    const archiveSpy = vi
      .spyOn(schemeService, 'archiveScheme')
      .mockReturnValue(of({ ...sampleSchemes[2], status: 'ARCHIVED' }));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const approved = component.schemes.find((s) => s.status === 'APPROVED')!;
    component.openArchiveModal(approved);
    expect(component.confirmModalOpen).toBe(true);
    component.onConfirmModalConfirmed();
    expect(archiveSpy).toHaveBeenCalledWith(approved.id);
    expect(component.schemes.find((s) => s.id === approved.id)?.status).toBe('ARCHIVED');
  });

  // Test 25: Edit flow and details navigation
  it('25. openEditFlow routes by status and history opens details', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');

    const draft = component.schemes.find((s) => s.status === 'DRAFT')!;
    component.openEditFlow(draft);
    expect(navSpy).toHaveBeenCalledWith(['/dashboard', 'admin', 'schemes', 'edit', draft.id]);

    const approved = component.schemes.find((s) => s.status === 'APPROVED')!;
    component.openEditFlow(approved);
    expect(component.confirmTitle).toBe('Scheme Must Be Archived');

    component.viewScheme(approved);
    expect(navSpy).toHaveBeenCalledWith(['/dashboard', 'admin', 'schemes', approved.id]);
  });

  // Test 27: Gov direct draft delete (own DRAFT only)
  it('27. gov can directly delete own DRAFT; others and non-drafts blocked', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('GOVERNMENT_OFFICIAL');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockGovUserA);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));
    const deleteSpy = vi
      .spyOn(schemeService, 'deleteScheme')
      .mockReturnValue(of({ message: 'Scheme moved to Deleted Schemes.' }));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Own DRAFT opens the existing confirm dialog and deletes on confirm.
    const draft = component.schemes.find((s) => s.status === 'DRAFT')!;
    component.openDirectDeleteModal(draft);
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe('Delete Scheme');
    component.onConfirmModalConfirmed();
    expect(deleteSpy).toHaveBeenCalledWith(draft.id);
    expect(component.schemes.find((s) => s.id === draft.id)).toBeUndefined();

    // Another user's draft is protected.
    deleteSpy.mockClear();
    component.openDirectDeleteModal({
      ...draft,
      id: 99,
      title: 'Foreign draft',
      createdBy: 99,
    });
    expect(component.confirmModalOpen).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();

    // Non-draft keeps the existing workflow for gov.
    component.openDirectDeleteModal({
      ...draft,
      id: 100,
      title: 'Pending one',
      status: 'PENDING_APPROVAL',
      createdBy: 2,
    });
    expect(component.confirmModalOpen).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();

    // Cancellation leaves the scheme unchanged (dialog cancelled pre-confirm).
    const draft2 = { ...draft, id: 101, title: 'Cancel draft', createdBy: 2 };
    component.openDirectDeleteModal(draft2);
    expect(component.confirmModalOpen).toBe(true);
    component.onConfirmModalCancelled();
    expect(deleteSpy).not.toHaveBeenCalledWith(101);
  });

  // Test 26: Datetime column helpers
  it('26. formatDateTime renders IST timestamps and detects distinct updates', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.formatDateTime('2026-01-01T00:00:00Z')).toContain('2026');
    expect(component.formatDateTime(null)).toBe('—');
    expect(
      component.hasDistinctUpdate({
        ...component.schemes[0],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      }),
    ).toBe(true);
    expect(component.hasDistinctUpdate(component.schemes[0])).toBe(false);
  });

  it('Govt DELETE_REQUESTED menu shows View Details and View Deletion Reason only', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('GOVERNMENT_OFFICIAL');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockGovUserA);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.isAdmin).toBe(false);
    component.schemes = [
      {
        id: 77,
        title: 'Scheme DEL',
        description: 'd',
        category: 'C',
        ministry: 'M',
        department: 'D',
        sector: 'S',
        status: 'DELETE_REQUESTED',
        createdBy: 2,
        deleteReason: 'Superseded by a newer scheme.',
      },
    ] as any;
    component.pageSize = 100;
    fixture.detectChanges();

    component.toggleMenu(77);
    fixture.detectChanges();

    const menu = document.querySelector('.action-menu') as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.textContent).toContain('View Details');
    expect(menu.textContent).toContain('View Deletion Reason');
    expect(menu.textContent).not.toContain('Approve deletion');
    expect(menu.textContent).not.toContain('Reject deletion');

    component.closeMenu();
    fixture.detectChanges();
  });

  it('openViewDeleteReason shows the stored reason or a clear fallback', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('GOVERNMENT_OFFICIAL');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockGovUserA);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.openViewDeleteReason({
      id: 77,
      title: 'Scheme DEL',
      description: 'd',
      category: 'C',
      ministry: 'M',
      department: 'D',
      sector: 'S',
      status: 'DELETE_REQUESTED',
      createdBy: 2,
      deleteReason: 'Superseded by a newer scheme.',
    } as any);
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmMessage).toContain(
      'Superseded by a newer scheme.',
    );

    component.openViewDeleteReason({
      id: 78,
      title: 'Scheme NOREASON',
      description: 'd',
      category: 'C',
      ministry: 'M',
      department: 'D',
      sector: 'S',
      status: 'DELETE_REQUESTED',
      createdBy: 2,
    } as any);
    expect(component.confirmMessage).toContain('No reason was provided.');
  });
});

