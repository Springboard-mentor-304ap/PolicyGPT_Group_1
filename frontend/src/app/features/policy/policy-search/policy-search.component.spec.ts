import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PolicySearchComponent } from './policy-search.component';
import { PolicyService } from '../../../core/services/policy.service';
import { Auth } from '../../../core/services/auth';
import { PolicyListResponse, PolicyResponse } from '../../../core/models/policy.model';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('PolicySearchComponent', () => {
  let component: PolicySearchComponent;
  let fixture: ComponentFixture<PolicySearchComponent>;
  let policyService: { getPolicies: ReturnType<typeof vi.fn> };
  let authService: any;

  const mockApprovedPolicy: PolicyResponse = {
    policy_id: 101,
    title: 'National Digital Education Framework',
    description: 'A national policy for standardizing digital education curricula.',
    category: 'Education',
    ministry: 'Ministry of Education',
    department: 'Department of Higher Education',
    state: 'Central',
    sector: 'Central Government',
    status: 'APPROVED',
    benefits: ['Free digital devices', 'High-speed internet access'],
    publication_date: '2025-01-01',
    effective_date: '2025-02-01',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  const mockApprovedPolicyList: PolicyListResponse = {
    policies: [mockApprovedPolicy],
    total: 1,
    page: 1,
    pages: 1,
    limit: 10,
  };

  beforeEach(async () => {
    window.scrollTo = vi.fn() as any;

    policyService = {
      getPolicies: vi.fn().mockReturnValue(of(mockApprovedPolicyList)),
    };

    authService = {
      getUserRole: vi.fn().mockReturnValue('ADMIN'),
      isLoggedIn: vi.fn().mockReturnValue(true),
      getStoredUser: vi.fn().mockReturnValue({ id: 1, role: 'ADMIN' }),
    };

    await TestBed.configureTestingModule({
      imports: [PolicySearchComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PolicyService, useValue: policyService },
        { provide: Auth, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PolicySearchComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. should create and initialize component', () => {
    expect(component).toBeTruthy();
    expect(component.policies.length).toBe(0);
    expect(component.loading).toBe(false);
  });

  it('2. ngOnInit() should immediately call loadPolicies()', () => {
    const loadSpy = vi.spyOn(component, 'loadPolicies');
    fixture.detectChanges(); // calls ngOnInit
    expect(loadSpy).toHaveBeenCalled();
  });

  it('3 & 4. Initial request should be made without search text and with status=APPROVED', () => {
    fixture.detectChanges(); // ngOnInit
    expect(policyService.getPolicies).toHaveBeenCalledWith({
      search: undefined,
      category: undefined,
      ministry: undefined,
      department: undefined,
      state: undefined,
      sector: undefined,
      status: 'APPROVED',
      page: 1,
      limit: 10,
    });
  });

  it('5. Returned approved policies should render in policies list', () => {
    fixture.detectChanges();
    expect(component.policies.length).toBe(1);
    expect(component.policies[0].title).toBe('National Digital Education Framework');
    expect(component.policies[0].status).toBe('APPROVED');
    expect(component.totalResults).toBe(1);
    expect(component.loading).toBe(false);
  });

  it('6. Search should maintain status=APPROVED and reset page to 1', () => {
    vi.useFakeTimers();
    fixture.detectChanges();
    policyService.getPolicies.mockClear();

    component.searchQuery = 'education';
    component.onSearchChange();
    vi.advanceTimersByTime(400); // debounce time is 350ms

    expect(policyService.getPolicies).toHaveBeenCalledWith({
      search: 'education',
      category: undefined,
      ministry: undefined,
      department: undefined,
      state: undefined,
      sector: undefined,
      status: 'APPROVED',
      page: 1,
      limit: 10,
    });
  });

  it('7. Clear filters should reset query and filters and reload with status=APPROVED', () => {
    fixture.detectChanges();
    component.searchQuery = 'health';
    component.selectedCategory = 'Health';
    component.selectedMinistry = 'Ministry of Health';
    component.currentPage = 2;

    policyService.getPolicies.mockClear();
    component.clearFilters();

    expect(component.searchQuery).toBe('');
    expect(component.selectedCategory).toBe('');
    expect(component.selectedMinistry).toBe('');
    expect(component.currentPage).toBe(1);

    expect(policyService.getPolicies).toHaveBeenCalledWith({
      search: undefined,
      category: undefined,
      ministry: undefined,
      department: undefined,
      state: undefined,
      sector: undefined,
      status: 'APPROVED',
      page: 1,
      limit: 10,
    });
  });

  it('8. Pagination should maintain status=APPROVED', () => {
    policyService.getPolicies.mockImplementation((params) =>
      of({
        policies: [mockApprovedPolicy],
        total: 25,
        page: params?.page ?? 1,
        pages: 3,
        limit: 10,
      })
    );
    fixture.detectChanges();

    policyService.getPolicies.mockClear();
    component.nextPage();

    expect(component.currentPage).toBe(2);
    expect(policyService.getPolicies).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'APPROVED',
        page: 2,
        limit: 10,
      })
    );
  });

  it('9. API error should display error state and stop loading', () => {
    policyService.getPolicies.mockReturnValue(
      throwError(() => ({ status: 500, message: 'Internal Server Error' }))
    );

    component.loadPolicies();

    expect(component.loading).toBe(false);
    expect(component.policies.length).toBe(0);
    expect(component.errorMessage).toBeTruthy();
  });

  it('10. Retry should reload policies', () => {
    fixture.detectChanges();
    policyService.getPolicies.mockClear();

    component.loadPolicies();
    expect(policyService.getPolicies).toHaveBeenCalledTimes(1);
  });

  it('11. View Policy should generate correct role-specific details routes', () => {
    // Admin role
    authService.getUserRole.mockReturnValue('ADMIN');
    expect(component.getPolicyDetailsRoute(101)).toEqual(['/dashboard', 'admin', 'policies', 101]);

    // Government role
    authService.getUserRole.mockReturnValue('GOVERNMENT_OFFICIAL');
    expect(component.getPolicyDetailsRoute(101)).toEqual(['/dashboard', 'government', 'policies', 101]);

    // Citizen role
    authService.getUserRole.mockReturnValue('CITIZEN');
    expect(component.getPolicyDetailsRoute(101)).toEqual(['/dashboard', 'citizen', 'policies', 101]);

    // Researcher role
    authService.getUserRole.mockReturnValue('RESEARCHER');
    expect(component.getPolicyDetailsRoute(101)).toEqual(['/dashboard', 'researcher', 'policies', 101]);

    // Organization role
    authService.getUserRole.mockReturnValue('ORGANIZATION');
    expect(component.getPolicyDetailsRoute(101)).toEqual(['/dashboard', 'organization', 'policies', 101]);

    // Guest role
    authService.getUserRole.mockReturnValue('GUEST');
    expect(component.getPolicyDetailsRoute(101)).toEqual(['/dashboard', 'guest', 'policies', 101]);

    // Invalid ID handling
    expect(component.getPolicyDetailsRoute(0)).toEqual(['/']);
    expect(component.getPolicyDetailsRoute(-5)).toEqual(['/']);
    expect(component.getPolicyDetailsRoute('abc')).toEqual(['/']);
  });

  it('12. Defensive filtering should exclude any non-APPROVED policies if returned by API', () => {
    const mixedResponse: PolicyListResponse = {
      policies: [
        mockApprovedPolicy,
        { ...mockApprovedPolicy, policy_id: 102, status: 'DRAFT', title: 'Draft Policy' },
        { ...mockApprovedPolicy, policy_id: 103, status: 'PENDING_APPROVAL', title: 'Pending Policy' },
        { ...mockApprovedPolicy, policy_id: 104, status: 'REJECTED', title: 'Rejected Policy' },
      ],
      total: 4,
      page: 1,
      pages: 1,
      limit: 10,
    };
    policyService.getPolicies.mockReturnValue(of(mixedResponse));

    component.loadPolicies();

    expect(component.policies.length).toBe(1);
    expect(component.policies[0].policy_id).toBe(101);
    expect(component.policies[0].status).toBe('APPROVED');
  });
});
