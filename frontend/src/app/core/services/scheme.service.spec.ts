import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SchemeService } from './scheme.service';
import { SchemeResponse, SchemeListResponse, SchemeAnalyticsResponse } from '../models/scheme.model';

describe('SchemeService', () => {
  let service: SchemeService;
  let httpMock: HttpTestingController;

  const mockScheme: SchemeResponse = {
    scheme_id: 201,
    name: 'PM Solar Scheme',
    description: 'Rooftop solar program.',
    category: 'Energy',
    ministry: 'Ministry of New & Renewable Energy',
    department: 'Department of Renewable Energy',
    state: 'All India',
    status: 'APPROVED',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  };

  const mockSchemeList: SchemeListResponse = {
    total: 1,
    page: 1,
    limit: 10,
    pages: 1,
    schemes: [mockScheme],
  };

  const mockAnalytics: SchemeAnalyticsResponse = {
    total: 10,
    active: 7,
    approved: 7,
    pending: 2,
    draft: 1,
    rejected: 0,
    archived: 0,
    archive_requested: 0,
    delete_requested: 0,
    by_category: { Energy: 5 },
    by_state: { 'All India': 10 },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SchemeService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(SchemeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('1. should be created', () => {
    expect(service).toBeTruthy();
  });

  it('2. should fetch a single scheme by ID (GET /schemes/{id})', () => {
    service.getScheme(201).subscribe((scheme) => {
      expect(scheme).toEqual(mockScheme);
      expect(scheme.scheme_id).toBe(201);
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201');
    expect(req.request.method).toBe('GET');
    req.flush(mockScheme);
  });

  it('3. should fetch schemes with APPROVED status and pagination params', () => {
    service
      .getSchemes({
        status: 'APPROVED',
        page: 1,
        limit: 10,
      })
      .subscribe((response) => {
        expect(response).toEqual(mockSchemeList);
        expect(response.schemes[0].status).toBe('APPROVED');
      });

    const req = httpMock.expectOne(
      (r) =>
        r.url === 'http://localhost:8000/schemes' &&
        r.params.get('status') === 'APPROVED' &&
        r.params.get('page') === '1' &&
        r.params.get('limit') === '10'
    );

    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('APPROVED');
    req.flush(mockSchemeList);
  });

  it('4. should fetch schemes for manage mode (GET /schemes?manage=true)', () => {
    service
      .getSchemes({
        manage: true,
        page: 1,
        limit: 100,
      })
      .subscribe((response) => {
        expect(response).toEqual(mockSchemeList);
      });

    const req = httpMock.expectOne(
      (r) =>
        r.url === 'http://localhost:8000/schemes' &&
        r.params.get('manage') === 'true' &&
        r.params.get('page') === '1' &&
        r.params.get('limit') === '100'
    );

    expect(req.request.method).toBe('GET');
    req.flush(mockSchemeList);
  });

  it('5. should save draft (POST /schemes/draft)', () => {
    const payload = {
      name: 'New Draft Scheme',
      description: 'Draft description',
      category: 'Agriculture',
    };

    service.saveDraft(payload).subscribe((res) => {
      expect(res.scheme_id).toBe(201);
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/draft');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(mockScheme);
  });

  it('6. should update scheme (PUT /schemes/{id})', () => {
    const updatePayload = {
      name: 'Updated Solar Scheme',
    };

    service.updateScheme(201, updatePayload).subscribe((res) => {
      expect(res).toEqual(mockScheme);
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(updatePayload);
    req.flush(mockScheme);
  });

  it('7. should submit scheme for approval (POST /schemes/{id}/submit)', () => {
    service.submitScheme(201).subscribe((res) => {
      expect(res.scheme_id).toBe(201);
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201/submit');
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockScheme, status: 'PENDING_APPROVAL' });
  });

  it('8. should approve scheme (POST /schemes/{id}/approve)', () => {
    service.approveScheme(201).subscribe((res) => {
      expect(res.status).toBe('APPROVED');
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201/approve');
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockScheme, status: 'APPROVED' });
  });

  it('9. should reject scheme (POST /schemes/{id}/reject)', () => {
    service.rejectScheme(201, 'Incomplete documents').subscribe((res) => {
      expect(res.status).toBe('REJECTED');
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201/reject');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Incomplete documents' });
    req.flush({ ...mockScheme, status: 'REJECTED' });
  });

  it('10. should request archive scheme (POST /schemes/{id}/request-archive)', () => {
    service.requestArchiveScheme(201, 'Scheme expired').subscribe((res) => {
      expect(res.status).toBe('ARCHIVE_REQUESTED');
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201/request-archive');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Scheme expired' });
    req.flush({ ...mockScheme, status: 'ARCHIVE_REQUESTED' });
  });

  it('11. should approve archive scheme (POST /schemes/{id}/approve-archive)', () => {
    service.approveArchiveScheme(201).subscribe((res) => {
      expect(res.status).toBe('ARCHIVED');
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201/approve-archive');
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockScheme, status: 'ARCHIVED' });
  });

  it('12. should restore archived scheme (POST /schemes/{id}/restore)', () => {
    service.restoreScheme(201).subscribe((res) => {
      expect(res.status).toBe('APPROVED');
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201/restore');
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockScheme, status: 'APPROVED' });
  });

  it('13. should request delete scheme (POST /schemes/{id}/request-delete)', () => {
    service.requestDeleteScheme(201, 'Duplicate').subscribe((res) => {
      expect(res.status).toBe('DELETE_REQUESTED');
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201/request-delete');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Duplicate' });
    req.flush({ ...mockScheme, status: 'DELETE_REQUESTED' });
  });

  it('14. should approve delete scheme (POST /schemes/{id}/approve-delete)', () => {
    service.approveDeleteScheme(201).subscribe((res) => {
      expect(res.message).toBe('Scheme permanently deleted');
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201/approve-delete');
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Scheme permanently deleted' });
  });

  it('15. should delete scheme directly (DELETE /schemes/{id})', () => {
    service.deleteScheme(201).subscribe((res) => {
      expect(res.message).toBe('Deleted');
    });

    const req = httpMock.expectOne('http://localhost:8000/schemes/201');
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Deleted' });
  });

  it('16. should fetch scheme statistics (GET /analytics/schemes)', () => {
    service.getSchemeStatistics().subscribe((stats) => {
      expect(stats).toEqual(mockAnalytics);
      expect(stats.total).toBe(10);
      expect(stats.approved).toBe(7);
    });

    const req = httpMock.expectOne('http://localhost:8000/analytics/schemes');
    expect(req.request.method).toBe('GET');
    req.flush(mockAnalytics);
  });

  it('17. should fetch eligibility rules for a scheme (GET /eligibility/scheme/{id})', () => {
    const mockRules = [{ rule_id: 1, rule_type: 'AGE_CRITERIA', min_age: 18 }];
    service.getEligibilityRules(201).subscribe((rules) => {
      expect(rules).toEqual(mockRules);
    });

    const req = httpMock.expectOne('http://localhost:8000/eligibility/scheme/201');
    expect(req.request.method).toBe('GET');
    req.flush(mockRules);
  });
});
