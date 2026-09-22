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
});
