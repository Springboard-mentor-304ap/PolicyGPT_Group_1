import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable, of, throwError, timeout } from "rxjs";
import { catchError, finalize, shareReplay, tap } from "rxjs/operators";
import { Auth } from "./auth";

import {
  SchemeResponse,
  SchemeListResponse,
  SchemeFilters,
  SchemeCreate,
  SchemeUpdate,
  SchemeAnalyticsResponse,
} from "../models/scheme.model";
import { environment } from '../../../environments/environment';

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
  providedIn: "root",
})
export class SchemeService {
  private readonly apiUrl = `${environment.apiUrl}/schemes`;
  private readonly eligibilityApiUrl = `${environment.apiUrl}/eligibility`;
  private readonly analyticsUrl = `${environment.apiUrl}/analytics/schemes`;

  private cache = new Map<string, { data: any; timestamp: number }>();
  private inflight = new Map<string, Observable<any>>();
  private readonly CACHE_TTL = 30000; // 30 seconds
  private static readonly MAX_ENTRIES = 100;

  private http = inject(HttpClient);
  private auth = inject(Auth);

  constructor() {
    // Never serve one user's list data to another user in the same tab.
    // Optional-chained: specs may provide a partial Auth double.
    this.auth?.onLoggedOut?.(() => this.clearCache());
  }

  private getCacheKey(method: string, params?: HttpParams): string {
    const uid = this.auth.getStoredUser()?.user_id ?? "anon";
    return `${uid}|${method}:${params?.toString() || ""}`;
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
        if (this.cache.size >= SchemeService.MAX_ENTRIES) {
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
      // unsubscribe so one hung request can never poison this key for
      // every later caller (e.g. a permanently spinning dropdown).
      finalize(() => {
        this.inflight.delete(key);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.inflight.set(key, req);
    return req;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  // ============================================================
  // GET ALL / SEARCH / MANAGE SCHEMES
  // GET /schemes
  // ============================================================

  getSchemes(filters?: SchemeFilters): Observable<SchemeListResponse> {
    let params = new HttpParams();

    if (filters?.keyword && filters.keyword.trim()) {
      params = params.set("keyword", filters.keyword.trim());
    }
    if (filters?.category && filters.category.trim()) {
      params = params.set("category", filters.category.trim());
    }
    if (filters?.ministry && filters.ministry.trim()) {
      params = params.set("ministry", filters.ministry.trim());
    }
    if (filters?.department && filters.department.trim()) {
      params = params.set("department", filters.department.trim());
    }
    if (filters?.state && filters.state.trim()) {
      params = params.set("state", filters.state.trim());
    }
    if (filters?.sector && filters.sector.trim()) {
      params = params.set("sector", filters.sector.trim());
    }
    if (filters?.publication_date && filters.publication_date.trim()) {
      params = params.set("publication_date", filters.publication_date.trim());
    }
    if (filters?.status && filters.status.trim()) {
      params = params.set("status", filters.status.trim());
    }
    if (filters?.manage !== undefined) {
      params = params.set("manage", filters.manage.toString());
    }
    if (filters?.created_by !== undefined) {
      params = params.set("created_by", filters.created_by.toString());
    }

    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 10;
    params = params.set("page", page.toString());
    params = params.set("limit", limit.toString());

    const key = this.getCacheKey("getSchemes", params);
    return this.getCached(
      key,
      () => this.http.get<SchemeListResponse>(this.apiUrl, { params }),
    );
  }

  // ============================================================
  // GET SINGLE SCHEME
  // GET /schemes/{id}
  // ============================================================

  getScheme(id: number): Observable<SchemeResponse> {
    if (!id || id <= 0) {
      throw new Error("A valid scheme ID is required.");
    }
    const key = this.getCacheKey(`getScheme:${id}`);
    return this.getCached(
      key,
      () => this.http.get<SchemeResponse>(`${this.apiUrl}/${id}`),
    );
  }

  // ============================================================
  // GET ELIGIBILITY RULES FOR A SCHEME
  // GET /eligibility/scheme/{scheme_id}
  // ============================================================

  getEligibilityRules(schemeId: number): Observable<any[]> {
    if (!schemeId || schemeId <= 0) {
      throw new Error("A valid scheme ID is required.");
    }
    const key = this.getCacheKey(`getEligibilityRules:${schemeId}`);
    return this.getCached(
      key,
      () => this.http.get<any[]>(`${this.eligibilityApiUrl}/scheme/${schemeId}`),
    );
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

  updateScheme(
    id: number,
    data: SchemeUpdate | any,
  ): Observable<SchemeResponse> {
    if (!id || id <= 0) {
      throw new Error("A valid scheme ID is required.");
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
      throw new Error("A valid scheme ID is required.");
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
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/reject`, {
      reason,
    });
  }

  archiveScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/archive`, {});
  }

  requestArchiveScheme(id: number, reason: string): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(
      `${this.apiUrl}/${id}/request-archive`,
      { reason },
    );
  }

  approveArchiveScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(
      `${this.apiUrl}/${id}/approve-archive`,
      {},
    );
  }

  rejectArchiveScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(
      `${this.apiUrl}/${id}/reject-archive`,
      {},
    );
  }

  restoreScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(`${this.apiUrl}/${id}/restore`, {});
  }

  requestDeleteScheme(id: number, reason: string): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(
      `${this.apiUrl}/${id}/request-delete`,
      { reason },
    );
  }

  approveDeleteScheme(id: number): Observable<{ message: string }> {
    this.clearCache();
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/${id}/approve-delete`,
      {},
    );
  }

  rejectDeleteScheme(id: number): Observable<SchemeResponse> {
    this.clearCache();
    return this.http.post<SchemeResponse>(
      `${this.apiUrl}/${id}/reject-delete`,
      {},
    );
  }

  getPendingSchemes(): Observable<SchemeResponse[]> {
    const key = this.getCacheKey("getPendingSchemes");
    return this.getCached(
      key,
      () => this.http.get<SchemeResponse[]>(`${this.apiUrl}/pending-approval`)
    );
  }

  getArchiveRequests(): Observable<SchemeResponse[]> {
    const key = this.getCacheKey("getArchiveRequests");
    return this.getCached(
      key,
      () => this.http.get<SchemeResponse[]>(`${this.apiUrl}/archive-requests`)
    );
  }

  getDeleteRequests(): Observable<SchemeResponse[]> {
    const key = this.getCacheKey("getDeleteRequests");
    return this.getCached(
      key,
      () => this.http.get<SchemeResponse[]>(`${this.apiUrl}/delete-requests`)
    );
  }

  // ============================================================
  // SCHEME ANALYTICS / STATISTICS
  // GET /analytics/schemes
  // ============================================================

  getSchemeStatistics(): Observable<SchemeAnalyticsResponse> {
    const key = this.getCacheKey("getSchemeStatistics");
    return this.getCached(
      key,
      () => this.http.get<SchemeAnalyticsResponse>(this.analyticsUrl)
    );
  }

  getSchemeAnalytics(): Observable<SchemeAnalyticsResponse> {
    return this.getSchemeStatistics();
  }
}
