import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpClientTestingModule,
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { PolicyService } from './policy.service';
import { Auth } from './auth';
import { PolicyResponse, PolicyListResponse } from '../models/policy.model';

describe('PolicyService', () => {
  let service: PolicyService;
  let httpMock: HttpTestingController;

  const mockPolicy: PolicyResponse = {
    policy_id: 101,
    title: 'National Digital Policy',
    description: 'A test digital framework.',
    category: 'Technology',
    ministry: 'Ministry of Electronics & IT',
    department: 'Department of Electronics & IT',
    state: 'All India',
    sector: 'Central Government',
    status: 'APPROVED',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  };

  const mockPolicyList: PolicyListResponse = {
    total: 1,
    page: 1,
    limit: 10,
    pages: 1,
    policies: [mockPolicy],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PolicyService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(PolicyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // 1. Service creation
  it('1. should be created', () => {
    expect(service).toBeTruthy();
  });

  // 2. getPolicy()
  it('2. should fetch a single policy by ID (GET /policies/{id})', () => {
    service.getPolicy(101).subscribe((policy) => {
      expect(policy).toEqual(mockPolicy);
      expect(policy.policy_id).toBe(101);
    });

    const req = httpMock.expectOne('http://localhost:8000/policies/101');
    expect(req.request.method).toBe('GET');
    req.flush(mockPolicy);
  });

  // 3. getPolicies() with APPROVED status (Initial Discovery Test)
  it('3. should fetch policies with APPROVED status and pagination params', () => {
    service
      .getPolicies({
        status: 'APPROVED',
        page: 1,
        limit: 10,
      })
      .subscribe((response) => {
        expect(response).toEqual(mockPolicyList);
        expect(response.policies[0].status).toBe('APPROVED');
      });

    const req = httpMock.expectOne(
      (r) =>
        r.url === 'http://localhost:8000/policies' &&
        r.params.get('status') === 'APPROVED' &&
        r.params.get('page') === '1' &&
        r.params.get('limit') === '10'
    );

    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('APPROVED');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.has('search')).toBe(false);

    req.flush(mockPolicyList);
  });

  // 4. getPolicies() without search text
  it('4. should fetch policies without search text', () => {
    service
      .getPolicies({
        status: 'APPROVED',
        page: 1,
        limit: 10,
      })
      .subscribe((response) => {
        expect(response.policies.length).toBe(1);
      });

    const req = httpMock.expectOne(
      'http://localhost:8000/policies?status=APPROVED&page=1&limit=10'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('search')).toBe(false);

    req.flush(mockPolicyList);
  });

  // 5. getPolicies() with search text
  it('5. should fetch policies with search text and keep status=APPROVED', () => {
    service
      .getPolicies({
        search: 'digital',
        status: 'APPROVED',
        page: 1,
        limit: 10,
      })
      .subscribe((response) => {
        expect(response.policies.length).toBe(1);
      });

    const req = httpMock.expectOne(
      'http://localhost:8000/policies?search=digital&status=APPROVED&page=1&limit=10'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('search')).toBe('digital');
    expect(req.request.params.get('status')).toBe('APPROVED');

    req.flush(mockPolicyList);
  });

  // 6. getPolicies() with filters
  it('6. should fetch policies with category, ministry, state, sector, and keyword filters', () => {
    service
      .getPolicies({
        category: 'Technology',
        ministry: 'Ministry of Electronics & IT',
        department: 'Department of Electronics & IT',
        state: 'All India',
        sector: 'Central Government',
        keyword: 'framework',
        status: 'APPROVED',
        page: 1,
        limit: 10,
      })
      .subscribe((response) => {
        expect(response.policies.length).toBe(1);
      });

    const req = httpMock.expectOne((r) => {
      return (
        r.url === 'http://localhost:8000/policies' &&
        r.params.get('category') === 'Technology' &&
        r.params.get('ministry') === 'Ministry of Electronics & IT' &&
        r.params.get('department') === 'Department of Electronics & IT' &&
        r.params.get('state') === 'All India' &&
        r.params.get('sector') === 'Central Government' &&
        r.params.get('keyword') === 'framework' &&
        r.params.get('status') === 'APPROVED' &&
        r.params.get('page') === '1' &&
        r.params.get('limit') === '10'
      );
    });

    expect(req.request.method).toBe('GET');
    req.flush(mockPolicyList);
  });

  // 7. submitPolicy()
  it('7. should submit a policy for approval (POST /policies/{id}/submit)', () => {
    service.submitPolicy(101).subscribe((policy) => {
      expect(policy.status).toBe('PENDING_APPROVAL');
    });

    const req = httpMock.expectOne('http://localhost:8000/policies/101/submit');
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockPolicy, status: 'PENDING_APPROVAL' });
  });

  // 8. approvePolicy()
  it('8. should approve a policy (POST /policies/{id}/approve)', () => {
    service.approvePolicy(101).subscribe((policy) => {
      expect(policy.status).toBe('APPROVED');
      expect(policy.approved_by).toBe(1);
    });

    const req = httpMock.expectOne('http://localhost:8000/policies/101/approve');
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockPolicy, status: 'APPROVED', approved_by: 1 });
  });

  // 9. rejectPolicy()
  it('9. should reject a policy with a reason (POST /policies/{id}/reject)', () => {
    const reason = 'Needs further documentation.';
    service.rejectPolicy(101, reason).subscribe((policy) => {
      expect(policy.status).toBe('REJECTED');
      expect(policy.rejection_reason).toBe(reason);
    });

    const req = httpMock.expectOne('http://localhost:8000/policies/101/reject');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason });
    req.flush({ ...mockPolicy, status: 'REJECTED', rejection_reason: reason });
  });

  // 10. requestArchive()
  it('10. should request archiving with a reason (POST /policies/{id}/request-archive)', () => {
    const reason = 'Outdated program.';
    service.requestArchive(101, reason).subscribe((policy) => {
      expect(policy.status).toBe('ARCHIVE_REQUESTED');
    });

    const req = httpMock.expectOne(
      'http://localhost:8000/policies/101/request-archive'
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason });
    req.flush({ ...mockPolicy, status: 'ARCHIVE_REQUESTED', archive_reason: reason });
  });

  // 11. approveArchive()
  it('11. should approve archiving (POST /policies/{id}/approve-archive)', () => {
    service.approveArchive(101).subscribe((policy) => {
      expect(policy.status).toBe('ARCHIVED');
    });

    const req = httpMock.expectOne(
      'http://localhost:8000/policies/101/approve-archive'
    );
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockPolicy, status: 'ARCHIVED' });
  });

  // 12. rejectArchive()
  it('12. should reject archiving (POST /policies/{id}/reject-archive)', () => {
    service.rejectArchive(101).subscribe((policy) => {
      expect(policy.status).toBe('APPROVED');
    });

    const req = httpMock.expectOne(
      'http://localhost:8000/policies/101/reject-archive'
    );
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockPolicy, status: 'APPROVED' });
  });

  // 13. restore()
  it('13. should restore an archived policy (POST /policies/{id}/restore)', () => {
    service.restore(101).subscribe((policy) => {
      expect(policy.status).toBe('APPROVED');
    });

    const req = httpMock.expectOne('http://localhost:8000/policies/101/restore');
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockPolicy, status: 'APPROVED' });
  });

  // 14. requestDelete()
  it('14. should request deletion (POST /policies/{id}/request-delete)', () => {
    const reason = 'Redundant record.';
    service.requestDelete(101, reason).subscribe((policy) => {
      expect(policy.status).toBe('DELETE_REQUESTED');
    });

    const req = httpMock.expectOne(
      'http://localhost:8000/policies/101/request-delete'
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason });
    req.flush({ ...mockPolicy, status: 'DELETE_REQUESTED', delete_reason: reason });
  });

  // 15. approveDelete()
  it('15. should approve deletion (POST /policies/{id}/approve-delete)', () => {
    service.approveDelete(101).subscribe((res) => {
      expect(res.message).toBe('Policy deleted successfully');
    });

    const req = httpMock.expectOne(
      'http://localhost:8000/policies/101/approve-delete'
    );
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Policy deleted successfully' });
  });

  // 16. deletePolicy()
  it('16. should delete a policy directly (DELETE /policies/{id})', () => {
    service.deletePolicy(101).subscribe((res) => {
      expect(res.message).toBe('Policy deleted successfully');
    });

    const req = httpMock.expectOne('http://localhost:8000/policies/101');
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Policy deleted successfully' });
  });

  // 17. getPolicyStatistics()
  it('17. should fetch analytics statistics (GET /analytics/policies)', () => {
    const mockStats = {
      total: 10,
      approved: 6,
      pending: 2,
      rejected: 1,
      archived: 1,
    };

    service.getPolicyStatistics().subscribe((stats) => {
      expect(stats.total).toBe(10);
      expect(stats.approved).toBe(6);
    });

    const req = httpMock.expectOne('http://localhost:8000/analytics/policies');
    expect(req.request.method).toBe('GET');
    req.flush(mockStats);
  });

  // 18. getEligibilityRules()
  it('18. should fetch eligibility rules (GET /eligibility/policy/{id})', () => {
    const mockRules = [{ rule_id: 1, min_age: 18, max_age: 60 }];

    service.getEligibilityRules(101).subscribe((rules) => {
      expect(rules.length).toBe(1);
      expect(rules[0].min_age).toBe(18);
    });

    const req = httpMock.expectOne('http://localhost:8000/eligibility/policy/101');
    expect(req.request.method).toBe('GET');
    req.flush(mockRules);
  });
});

describe('PolicyService request caching', () => {
  let service: PolicyService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:8000/policies';
  const userKey = 'policygpt_user';

  const asUser = (userId: number) => {
    localStorage.setItem(
      userKey,
      JSON.stringify({ user_id: userId, email: `u${userId}@x.in` }),
    );
  };

  beforeEach(() => {
    localStorage.clear();
    asUser(1);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PolicyService, Auth],
    });
    service = TestBed.inject(PolicyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('dedupes identical concurrent requests into one HTTP call', () => {
    service.getPolicies({ status: 'APPROVED', limit: 10 }).subscribe();
    service.getPolicies({ status: 'APPROVED', limit: 10 }).subscribe();
    const reqs = httpMock.match(
      (r) => r.url === baseUrl && r.params.get('status') === 'APPROVED',
    );
    expect(reqs.length).toBe(1);
    reqs[0].flush({ policies: [], total: 0, page: 1, pages: 1, limit: 10 });
  });

  it('serves sequential identical requests from cache without HTTP', () => {
    service.getPolicies({ status: 'APPROVED', limit: 10 }).subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === baseUrl && r.params.get('status') === 'APPROVED',
    );
    req.flush({ policies: [], total: 0, page: 1, pages: 1, limit: 10 });

    service.getPolicies({ status: 'APPROVED', limit: 10 }).subscribe();
    httpMock.expectNone(
      (r) => r.url === baseUrl && r.params.get('status') === 'APPROVED',
    );
  });

  it('invalidates the cache after a mutation', () => {
    service.getPolicy(5).subscribe();
    httpMock.expectOne(`${baseUrl}/5`).flush({ policy_id: 5 });

    service
      .createPolicy({ title: 't', description: 'd', category: 'c' } as never)
      .subscribe();
    const post = httpMock.expectOne(baseUrl);
    expect(post.request.method).toBe('POST');
    post.flush({ policy_id: 6 });

    service.getPolicy(5).subscribe();
    httpMock.expectOne(`${baseUrl}/5`);
  });

  it('isolates cache entries per user', () => {
    service.getPolicy(5).subscribe();
    httpMock.expectOne(`${baseUrl}/5`).flush({ policy_id: 5 });

    asUser(2);
    service.getPolicy(5).subscribe();
    httpMock.expectOne(`${baseUrl}/5`).flush({ policy_id: 5 });
  });

  it('refetches after logout clears user data', () => {
    const auth = TestBed.inject(Auth);
    service.getPolicy(5).subscribe();
    httpMock.expectOne(`${baseUrl}/5`).flush({ policy_id: 5 });

    auth.logout();
    asUser(1);
    service.getPolicy(5).subscribe();
    httpMock.expectOne(`${baseUrl}/5`);
  });
});
