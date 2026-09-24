import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  SchemeResponse,
  SchemeListResponse,
  SchemeFilters,
  SchemeCreate,
  SchemeUpdate,
  SchemeAnalyticsResponse,
} from '../models/scheme.model';

export type Scheme = SchemeResponse;
export type {
  SchemeResponse,
  SchemeListResponse,
  SchemeFilters,
  SchemeCreate,
  SchemeUpdate,
  SchemeAnalyticsResponse,
};

@Injectable({
  providedIn: 'root',
})
export class SchemeService {
  private readonly apiUrl = 'http://localhost:8000/schemes';
  private readonly eligibilityApiUrl = 'http://localhost:8000/eligibility';
  private readonly analyticsUrl = 'http://localhost:8000/analytics/schemes';

  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(private http: HttpClient) {}

  private getCacheKey(method: string, params?: HttpParams): string {
    return `${method}:${params?.toString() || ''}`;
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================
  // GET ALL / SEARCH / MANAGE SCHEMES
  // GET /schemes
  // ============================================================

  getSchemes(filters?: SchemeFilters): Observable<SchemeListResponse> {
    let params = new HttpParams();

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
    if (filters?.manage !== undefined) {
      params = params.set('manage', filters.manage.toString());
    }
    if (filters?.created_by !== undefined) {
      params = params.set('created_by', filters.created_by.toString());
    }

    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 10;
    params = params.set('page', page.toString());
    params = params.set('limit', limit.toString());

    return this.http.get<SchemeListResponse>(this.apiUrl, { params });
  }

  // ============================================================
  // GET SINGLE SCHEME
  // GET /schemes/{id}
  // ============================================================

  getScheme(id: number): Observable<SchemeResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid scheme ID is required.');
    }
    return this.http.get<SchemeResponse>(`${this.apiUrl}/${id}`);
  }

  // ============================================================
  // GET ELIGIBILITY RULES FOR A SCHEME
  // GET /eligibility/scheme/{scheme_id}
  // ============================================================

  getEligibilityRules(schemeId: number): Observable<any[]> {
    if (!schemeId || schemeId <= 0) {
      throw new Error('A valid scheme ID is required.');
    }
    return this.http.get<any[]>(`${this.eligibilityApiUrl}/scheme/${schemeId}`);
  }

  // ============================================================
  // CREATE SCHEME
  // POST /schemes
  // ============================================================

  createScheme(data: SchemeCreate | any): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(this.apiUrl, data);
  }

  // ============================================================
  // SAVE DRAFT
  // POST /schemes/draft
  // ============================================================

  saveDraft(data: SchemeCreate | any): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/draft`, data);
  }

  // ============================================================
  // UPDATE SCHEME
  // PUT /schemes/{id}
  // ============================================================

  updateScheme(id: number, data: SchemeUpdate | any): Observable<SchemeResponse> {
    if (!id || id <= 0) {
      throw new Error('A valid scheme ID is required.');
    }
    this.clearCache();
    return this.http.put<SchemeResponse>(`${this.apiUrl}/${id}`, data);
  }

  // ============================================================
  // DELETE SCHEME (Admin direct delete)
  // DELETE /schemes/{id}
  // ============================================================

  deleteScheme(id: number): Observable<any> {
    if (!id || id <= 0) {
      throw new Error('A valid scheme ID is required.');
    }
    this.clearCache();
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  // ============================================================
  // WORKFLOW METHODS
  // ============================================================

  submitScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/submit`, {});
  }

  approveScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/approve`, {});
  }

  rejectScheme(id: number, reason: string): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/reject`, { reason });
  }

  archiveScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/archive`, {});
  }

  requestArchiveScheme(id: number, reason: string): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/request-archive`, { reason });
  }

  approveArchiveScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/approve-archive`, {});
  }

  rejectArchiveScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/reject-archive`, {});
  }

  restoreScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/restore`, {});
  }

  requestDeleteScheme(id: number, reason: string): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/request-delete`, { reason });
  }

  approveDeleteScheme(id: number): Observable<{ message: string }> {
    this.clearCache();
    return this.http.post<{ message: string }>(`${this.apiUrl}/${id}/approve-delete`, {});
  }

  rejectDeleteScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/reject-delete`, {});
  }

  getPendingSchemes(): Observable<SchemeResponse[]> {
    return this.http.get<SchemeResponse[]>(`${this.apiUrl}/pending-approval`);
  }

  getArchiveRequests(): Observable<SchemeResponse[]> {
    return this.http.get<SchemeResponse[]>(`${this.apiUrl}/archive-requests`);
  }

  getDeleteRequests(): Observable<SchemeResponse[]> {
    return this.http.get<SchemeResponse[]>(`${this.apiUrl}/delete-requests`);
  }

  // ============================================================
  // SCHEME ANALYTICS / STATISTICS
  // GET /analytics/schemes
  // ============================================================

  getSchemeStatistics(): Observable<SchemeAnalyticsResponse> {
    return this.http.get<SchemeAnalyticsResponse>(this.analyticsUrl);
  }

  getSchemeAnalytics(): Observable<SchemeAnalyticsResponse> {
    return this.getSchemeStatistics();
  }
}