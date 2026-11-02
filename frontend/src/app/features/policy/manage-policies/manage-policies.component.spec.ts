import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ManagePoliciesComponent } from './manage-policies.component';
import { PolicyService } from '../../../core/services/policy.service';
import { Auth, AuthUser } from '../../../core/services/auth';
import { PolicyListResponse, PolicyResponse } from '../../../core/models/policy.model';

describe('ManagePoliciesComponent', () => {
  let component: ManagePoliciesComponent;
  let fixture: ComponentFixture<ManagePoliciesComponent>;
  let policyService: PolicyService;
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

  const samplePolicies: PolicyResponse[] = [
    {
      policy_id: 1,
      title: 'Policy A - Draft',
      description: 'Created by Gov Official A',
      category: 'Healthcare',
      status: 'DRAFT',
      created_by: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      policy_id: 2,
      title: 'Policy B - Pending',
      description: 'Created by Gov Official A',
      category: 'Healthcare',
      status: 'PENDING_APPROVAL',
      created_by: 2,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
    {
      policy_id: 3,
      title: 'Policy C - Approved',
      description: 'Created by Gov Official B',
      category: 'Education',
      status: 'APPROVED',
      created_by: 3,
      created_at: '2026-01-03T00:00:00Z',
      updated_at: '2026-01-03T00:00:00Z',
    },
    {
      policy_id: 4,
      title: 'Policy D - Archived',
      description: 'Created by Admin',
      category: 'Technology',
      status: 'ARCHIVED',
      created_by: 1,
      created_at: '2026-01-04T00:00:00Z',
      updated_at: '2026-01-04T00:00:00Z',
    },
  ];

  const mockListResponse: PolicyListResponse = {
    total: 4,
    page: 1,
    limit: 100,
    pages: 1,
    policies: samplePolicies,
  };

  const mockStats = {
    total: 4,
    approved: 1,
    pending: 1,
    rejected: 0,
    archived: 1,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagePoliciesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        PolicyService,
        Auth,
      ],
    }).compileComponents();

    policyService = TestBed.inject(PolicyService);
    authService = TestBed.inject(Auth);
  });

  // Test 1: Component creation
  it('1. should create the component', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, 'getPolicies').mockReturnValue(of(mockListResponse));
    vi.spyOn(policyService, 'getPolicyStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  // Test 2: Admin sees ALL policies across all creators and statuses
  it('2. Admin should see ALL policies in the system without creator restriction', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    const getPoliciesSpy = vi
      .spyOn(policyService, 'getPolicies')
      .mockReturnValue(of(mockListResponse));
    vi.spyOn(policyService, 'getPolicyStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(getPoliciesSpy).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      manage: true,
    });
    expect(component.isAdmin).toBe(true);
    expect(component.policies.length).toBe(4);
    expect(component.policies.some((p) => p.createdBy === 1)).toBe(true);
    expect(component.policies.some((p) => p.createdBy === 2)).toBe(true);
    expect(component.policies.some((p) => p.createdBy === 3)).toBe(true);
  });

  // Test 3: Government Official sees ONLY their own policies
  it('3. Government Official should see ONLY policies created by their user_id', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('GOVERNMENT_OFFICIAL');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockGovUserA);
    const getPoliciesSpy = vi
      .spyOn(policyService, 'getPolicies')
      .mockReturnValue(of(mockListResponse));
    vi.spyOn(policyService, 'getPolicyStatistics').mockReturnValue(
      of({ total: 2, approved: 0, pending: 1, rejected: 0, archived: 0 })
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(getPoliciesSpy).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      manage: true,
    });
    expect(component.isAdmin).toBe(false);
    // Even if the mock response returned all policies, defensive filtering keeps only created_by === 2
    expect(component.policies.length).toBe(2);
    expect(component.policies.every((p) => p.createdBy === 2)).toBe(true);
  });

  // Test 4: Stats cards populate properly
  it('4. should populate stats counters correctly from backend analytics', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, 'getPolicies').mockReturnValue(of(mockListResponse));
    vi.spyOn(policyService, 'getPolicyStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.stats.total).toBe(4);
    expect(component.stats.approved).toBe(1);
    expect(component.stats.pending).toBe(1);
    expect(component.stats.rejected).toBe(0);
    expect(component.stats.archived).toBe(1);
  });

  // Test 5: In-memory filtering and search
  it('5. should filter policies by search text, category, and status', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, 'getPolicies').mockReturnValue(of(mockListResponse));
    vi.spyOn(policyService, 'getPolicyStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Filter by search text
    component.searchText = 'Policy A';
    expect(component.filteredPolicies.length).toBe(1);
    expect(component.filteredPolicies[0].title).toBe('Policy A - Draft');

    // Filter by status
    component.searchText = '';
    component.selectedStatus = 'PENDING_APPROVAL';
    expect(component.filteredPolicies.length).toBe(1);
    expect(component.filteredPolicies[0].status).toBe('PENDING_APPROVAL');

    // Reset filters
    component.resetFilters();
    expect(component.filteredPolicies.length).toBe(4);
  });

  // Test 6: Workflow approval by Admin
  it('6. Admin approving a policy should trigger approvePolicy and reload data', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, 'getPolicies').mockReturnValue(of(mockListResponse));
    vi.spyOn(policyService, 'getPolicyStatistics').mockReturnValue(of(mockStats));
    const approveSpy = vi
      .spyOn(policyService, 'approvePolicy')
      .mockReturnValue(of(samplePolicies[1]));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const pendingPolicy = component.policies[1];
    component.openApproveModal(pendingPolicy);
    expect(component.confirmModalOpen).toBe(true);

    component.onConfirmModalConfirmed();
    expect(approveSpy).toHaveBeenCalledWith(pendingPolicy.id);
  });

  // Test 7: Error handling when loading policies
  it('7. should handle API error gracefully when loading policies', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, 'getPolicies').mockReturnValue(
      throwError(() => ({ status: 500, message: 'Server error' }))
    );
    vi.spyOn(policyService, 'getPolicyStatistics').mockReturnValue(of(mockStats));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.policies.length).toBe(0);
    expect(component.errorMessage).toBeTruthy();
  });
});
