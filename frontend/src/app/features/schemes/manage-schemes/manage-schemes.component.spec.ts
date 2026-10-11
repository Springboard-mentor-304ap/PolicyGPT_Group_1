import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
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

  // Test 5: In-memory filtering and search
  it('5. should filter schemes by search text, category, and status', () => {
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
    expect(component.filteredSchemes[0].name).toBe('Scheme A - Draft');

    // Filter by status
    component.searchText = '';
    component.selectedStatus = 'PENDING_APPROVAL';
    expect(component.filteredSchemes.length).toBe(1);
    expect(component.filteredSchemes[0].status).toBe('PENDING_APPROVAL');

    // Reset filters
    component.resetFilters();
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

  // Test 8: Submit action label for Admin vs Other roles
  it('8. Menu label should be "Submit" for Admin and "Submit for approval" for Gov Official', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockListResponse));
    vi.spyOn(schemeService, 'getSchemeStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManageSchemesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftScheme = component.schemes[0];
    expect(component.getSubmitActionLabel(draftScheme)).toBe('Submit');

    // For Government Official
    component.userRole = 'GOVERNMENT_OFFICIAL';
    expect(component.getSubmitActionLabel(draftScheme)).toBe('Submit for approval');

    const rejectedScheme = { ...draftScheme, status: 'REJECTED' };
    expect(component.getSubmitActionLabel(rejectedScheme)).toBe('Re-submit for approval');
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

    const draftScheme = component.schemes[0];
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

    const draftScheme = component.schemes[0];
    component.openSubmitModal(draftScheme);
    expect(component.confirmModalOpen).toBe(true);

    component.onConfirmModalCancelled();

    expect(component.confirmModalOpen).toBe(false);
    expect(component.confirmAction).toBeNull();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(component.schemes[0].status).toBe('DRAFT');
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

    const loadSpy = vi.spyOn(component, 'loadSchemes');

    const draftScheme = component.schemes[0];
    component.openSubmitModal(draftScheme);
    component.onConfirmModalConfirmed();

    expect(submitSpy).toHaveBeenCalledWith(draftScheme.id);
    expect(component.confirmModalOpen).toBe(false);
    expect(component.confirmLoading).toBe(false);
    expect(component.successToastMessage).toBe('Scheme "Scheme A - Draft" submitted for approval.');
    expect(loadSpy).toHaveBeenCalled();
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

    const draftScheme = component.schemes[0];
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

    const draftScheme = component.schemes[0];
    component.openSubmitModal(draftScheme);
    component.onConfirmModalConfirmed();

    expect(component.confirmLoading).toBe(false);
    expect(component.errorMessage).toContain('Only DRAFT or REJECTED schemes can be submitted.');
    expect(component.confirmErrorMessage).toContain('Only DRAFT or REJECTED schemes can be submitted.');
    expect(component.schemes[0].status).toBe('DRAFT');
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
});

