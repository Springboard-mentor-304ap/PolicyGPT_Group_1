import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError, timeout } from 'rxjs';
import { catchError, finalize, shareReplay, tap } from 'rxjs/operators';
import { Auth } from './auth';

import {
  PolicyResponse,
  PolicyListResponse,
  PolicyFilters,
  PolicyCreate,
  PolicyUpdate,
  PolicyAnalyticsResponse,
  PolicyComparisonResponse,
} from '../models/policy.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PolicyService {
  private readonly apiUrl = `${environment.apiUrl}/policies`;
  private readonly analyticsUrl = `${environment.apiUrl}/analytics/policies`;

  private cache = new Map<string, { data: any; timestamp: number }>();
  private inflight = new Map<string, Observable<any>>();

  private readonly CACHE_TTL = 30_000;
  private static readonly MAX_ENTRIES = 100;

  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  constructor() {
    // Never serve one user's list data to another user in the same tab.
    // Optional-chained: specs may provide a partial Auth double.
    this.auth?.onLoggedOut?.(() => this.clearCache());
  }

  // ============================================================
  // CACHE HELPERS (TTL + in-flight dedup, user-scoped keys)
  // ============================================================

  private getCacheKey(method: string, params?: HttpParams): string {
    const uid = this.auth.getStoredUser()?.user_id ?? 'anon';
    return `${uid}|${method}:${params?.toString() || ''}`;
  }

  private getCached<T>(key: string, fetchFn: () => Observable<T>): Observable<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.timestamp < this.CACHE_TTL) {
      return of(hit.data as T);
    }
    if (hit) {
      this.cache.delete(key);
    }
    const ongoing = this.inflight.get(key);
    if (ongoing) {
      return ongoing as Observable<T>;
    }
    const req = fetchFn().pipe(
      timeout(30_000),
      tap((data) => {
        if (this.cache.size >= PolicyService.MAX_ENTRIES) {
          const oldest = this.cache.keys().next();
          if (!oldest.done) {
            this.cache.delete(oldest.value);
          }
        }
        this.cache.set(key, { data, timestamp: Date.now() });
      }),
      catchError((err) => {
        return throwError(() => err);
      }),
      // Release the in-flight slot on success, error, timeout, or
      // unsubscribe so a hung request never blocks that key forever.
      finalize(() => {
        this.inflight.delete(key);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.inflight.set(key, req);
    return req;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  // ============================================================
  // GET ALL / SEARCH POLICIES
  // GET /policies
  // ============================================================

  getPolicies(filters?: PolicyFilters): Observable<PolicyListResponse> {
    let params = new HttpParams();

    if (filters?.search && filters.search.trim()) {
      params = params.set('search', filters.search.trim());
    }
    if (filters?.keyword && filters.keyword.trim()) {
      params = params.set('keyword', filters.keyword.trim());
    }
    if (filters?.category && filters.category.trim()) {
      params = params.set('category', filters.category.trim());
    }
    if (filters?.ministry && filters.ministry.trim()) {
      params = params.set('ministry', filters.ministry.trim());
    }
    if (filters?.department && filters.department.trim()) {
      params = params.set('department', filters.department.trim());
    }
    if (filters?.state && filters.state.trim()) {
      params = params.set('state', filters.state.trim());
    }
    if (filters?.sector && filters.sector.trim()) {
      params = params.set('sector', filters.sector.trim());
    }
    if (filters?.publication_date && filters.publication_date.trim()) {
      params = params.set('publication_date', filters.publication_date.trim());
    }
    if (filters?.status && filters.status.trim()) {
      params = params.set('status', filters.status.trim());
    }
    if (filters?.manage) {
      params = params.set('manage', 'true');
    }
    if (filters?.created_by) {
      params = params.set('created_by', filters.created_by.toString());
    }

    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 10;
    params = params.set('page', page.toString());
    params = params.set('limit', limit.toString());

    const key = this.getCacheKey('getPolicies', params);
    return this.getCached(
      key,
      () => this.http.get<PolicyListResponse>(this.apiUrl, { params }),
    );
  }

  // ============================================================
  // GET SINGLE POLICY
  // GET /policies/{id}
  // ============================================================

  getPolicy(id: number): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }

    const key = this.getCacheKey(`getPolicy:${id}`);
    return this.getCached(
      key,
      () => this.http.get<PolicyResponse>(`${this.apiUrl}/${id}`),
    );
  }

  // ============================================================
  // CREATE POLICY
  // POST /policies
  // ============================================================

  createPolicy(data: PolicyCreate): Observable<PolicyResponse> {
    this.clearCache();
    return this.http.post<PolicyResponse>(this.apiUrl, data);
  }

  // ============================================================
  // SAVE POLICY AS DRAFT
  // POST /policies/draft
  // ============================================================

  saveDraft(payload: PolicyCreate): Observable<PolicyResponse> {
    this.clearCache();
    return this.http.post<PolicyResponse>(`${this.apiUrl}/draft`, payload);
  }

  // ============================================================
  // UPDATE POLICY
  // PUT /policies/{id}
  // ============================================================

  updatePolicy(id: number, data: PolicyUpdate): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.put<PolicyResponse>(`${this.apiUrl}/${id}`, data);
  }

  // ============================================================
  // SUBMIT POLICY
  // POST /policies/{id}/submit
  // ============================================================

  submitPolicy(id: number): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(`${this.apiUrl}/${id}/submit`, {});
  }

  // ============================================================
  // APPROVE POLICY (ADMIN)
  // POST /policies/{id}/approve
  // ============================================================

  approvePolicy(id: number): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(`${this.apiUrl}/${id}/approve`, {});
  }

  // ============================================================
  // REJECT POLICY (ADMIN)
  // POST /policies/{id}/reject
  // ============================================================

  rejectPolicy(id: number, reason: string): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(`${this.apiUrl}/${id}/reject`, {
      reason,
    });
  }

  // ============================================================
  // ARCHIVE WORKFLOW
  // ============================================================

  requestArchive(id: number, reason: string): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(
      `${this.apiUrl}/${id}/request-archive`,
      { reason }
    );
  }
  requestArchivePolicy(id: number, reason: string): Observable<PolicyResponse> {
    return this.requestArchive(id, reason);
  }
  archivePolicy(id: number, reason: string): Observable<PolicyResponse> {
    return this.requestArchive(id, reason);
  }

  approveArchive(id: number): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(
      `${this.apiUrl}/${id}/approve-archive`,
      {}
    );
  }
  approveArchivePolicy(id: number): Observable<PolicyResponse> {
    return this.approveArchive(id);
  }

  // ============================================================
  // DIRECT ARCHIVE (ADMIN)
  // POST /policies/{id}/archive — APPROVED -> ARCHIVED
  // Mirrors SchemeService.archiveScheme.
  // ============================================================

  archiveDirect(id: number): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(`${this.apiUrl}/${id}/archive`, {});
  }

  rejectArchive(id: number): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(
      `${this.apiUrl}/${id}/reject-archive`,
      {}
    );
  }
  rejectArchivePolicy(id: number): Observable<PolicyResponse> {
    return this.rejectArchive(id);
  }

  restore(id: number): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(`${this.apiUrl}/${id}/restore`, {});
  }
  restorePolicy(id: number): Observable<PolicyResponse> {
    return this.restore(id);
  }

  // ============================================================
  // DELETE WORKFLOW
  // ============================================================

  requestDelete(id: number, reason: string): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(
      `${this.apiUrl}/${id}/request-delete`,
      { reason }
    );
  }
  requestDeletePolicy(id: number, reason: string): Observable<PolicyResponse> {
    return this.requestDelete(id, reason);
  }

  approveDelete(id: number): Observable<{ message: string }> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/${id}/approve-delete`,
      {}
    );
  }
  approveDeletePolicy(id: number): Observable<{ message: string }> {
    return this.approveDelete(id);
  }

  rejectDelete(id: number): Observable<PolicyResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.post<PolicyResponse>(
      `${this.apiUrl}/${id}/reject-delete`,
      {}
    );
  }
  rejectDeletePolicy(id: number): Observable<PolicyResponse> {
    return this.rejectDelete(id);
  }

  deletePolicy(id: number): Observable<{ message: string }> {
    if (!id || id <= 0) {
      throw new Error('A valid policy ID is required.');
    }
    this.clearCache();
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  // ============================================================
  // FILTERED LIST QUERIES (ADMIN)
  // ============================================================

  getPendingPolicies(page = 1, limit = 10): Observable<PolicyListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    const key = this.getCacheKey('getPendingPolicies', params);
    return this.getCached(
      key,
      () =>
        this.http.get<PolicyListResponse>(`${this.apiUrl}/pending-approval`, {
          params,
        }),
    );
  }

  getArchiveRequests(page = 1, limit = 10): Observable<PolicyListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    const key = this.getCacheKey('getArchiveRequests', params);
    return this.getCached(
      key,
      () =>
        this.http.get<PolicyListResponse>(`${this.apiUrl}/archive-requests`, {
          params,
        }),
    );
  }

  getDeleteRequests(page = 1, limit = 10): Observable<PolicyListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    const key = this.getCacheKey('getDeleteRequests', params);
    return this.getCached(
      key,
      () =>
        this.http.get<PolicyListResponse>(`${this.apiUrl}/delete-requests`, {
          params,
        }),
    );
  }

  // ============================================================
  // REAL POLICY STATISTICS
  // GET /analytics/policies
  // ============================================================

  getPolicyStatistics(): Observable<PolicyAnalyticsResponse> {
    const key = this.getCacheKey('getPolicyStatistics');
    return this.getCached(
      key,
      () => this.http.get<PolicyAnalyticsResponse>(this.analyticsUrl),
    );
  }

  // ============================================================
  // COMPARE TWO POLICIES
  // GET /policies/compare
  // ============================================================

  comparePolicies(
    policyId1: number,
    policyId2: number
  ): Observable<PolicyComparisonResponse> {
    if (!policyId1 || policyId1 <= 0 || !policyId2 || policyId2 <= 0) {
      throw new Error('Two valid policy IDs are required.');
    }
    const params = new HttpParams()
      .set('policy_id_1', policyId1.toString())
      .set('policy_id_2', policyId2.toString());

    const key = this.getCacheKey('comparePolicies', params);
    return this.getCached(
      key,
      () =>
        this.http.get<PolicyComparisonResponse>(`${this.apiUrl}/compare`, {
          params,
        }),
    );
  }

  // ============================================================
  // ELIGIBILITY RULES FOR A POLICY
  // GET /eligibility/policy/{policy_id}
  // ============================================================

  getEligibilityRules(policyId: number): Observable<any[]> {
    const key = this.getCacheKey(`getEligibilityRules:${policyId}`);
    return this.getCached(
      key,
      () =>
        this.http.get<any[]>(
          `${environment.apiUrl}/eligibility/policy/${policyId}`
        ),
    );
  }
}

