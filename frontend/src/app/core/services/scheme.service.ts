import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Scheme {
  scheme_id: number;
  name: string;
  title?: string;
  description: string;
  category: string;
  ministry: string | null;
  department?: string | null;
  state: string | null;
  benefits: string[] | null;
  documents_required?: string | null;
  application_process?: string | null;
  application_url?: string | null;
  source_url?: string | null;
  status: string;
  eligibility_rules?: any[] | null;
  created_by?: number | null;
  approved_by?: number | null;
  rejection_reason?: string | null;
  archive_reason?: string | null;
  archive_requested_by?: number | null;
  archive_requested_at?: string | null;
  delete_reason?: string | null;
  delete_requested_by?: number | null;
  delete_requested_at?: string | null;
  delete_requested_from_status?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchemeListResponse {
  total: number;
  page: number;
  limit: number;
  pages: number;
  schemes: Scheme[];
}

@Injectable({
  providedIn: 'root'
})
export class SchemeService {

  private readonly apiUrl = 'http://localhost:8000/schemes';
  private readonly eligibilityApiUrl = 'http://localhost:8000/eligibility';

  // Simple in-memory cache for repeated requests
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

  getSchemes(filters?: {
    keyword?: string;
    category?: string;
    ministry?: string;
    department?: string;
    state?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Observable<SchemeListResponse> {

    let params = new HttpParams();

    if (filters?.keyword) {
      params = params.set('keyword', filters.keyword);
    }

    if (filters?.category) {
      params = params.set('category', filters.category);
    }

    if (filters?.ministry) {
      params = params.set('ministry', filters.ministry);
    }

    if (filters?.department) {
      params = params.set('department', filters.department);
    }

    if (filters?.state) {
      params = params.set('state', filters.state);
    }

    if (filters?.status) {
      params = params.set('status', filters.status);
    }

    params = params.set('page', (filters?.page || 1).toString());
    params = params.set('limit', (filters?.limit || 10).toString());

    const cacheKey = this.getCacheKey('getSchemes', params);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return new Observable(observer => {
        observer.next(cached);
        observer.complete();
      });
    }

    return new Observable(observer => {
      this.http.get<SchemeListResponse>(this.apiUrl, { params }).subscribe({
        next: (response) => {
          this.setCache(cacheKey, response);
          observer.next(response);
          observer.complete();
        },
        error: (error) => observer.error(error)
      });
    });
  }

  getScheme(id: number): Observable<Scheme> {
    const cacheKey = this.getCacheKey(`getScheme:${id}`);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return new Observable(observer => {
        observer.next(cached);
        observer.complete();
      });
    }

    return new Observable(observer => {
      this.http.get<Scheme>(`${this.apiUrl}/${id}`).subscribe({
        next: (response) => {
          this.setCache(cacheKey, response);
          observer.next(response);
          observer.complete();
        },
        error: (error) => observer.error(error)
      });
    });
  }

  getEligibilityRules(schemeId: number): Observable<any[]> {
    const cacheKey = this.getCacheKey(`getEligibilityRules:scheme:${schemeId}`);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return new Observable(observer => {
        observer.next(cached);
        observer.complete();
      });
    }

    return new Observable(observer => {
      this.http.get<any[]>(`${this.eligibilityApiUrl}/scheme/${schemeId}`).subscribe({
        next: (response) => {
          this.setCache(cacheKey, response);
          observer.next(response);
          observer.complete();
        },
        error: (error) => observer.error(error)
      });
    });
  }

  createScheme(data: any): Observable<any> {
    this.clearCache();
    return this.http.post<any>(this.apiUrl, data);
  }

  updateScheme(id: number, data: any): Observable<any> {
    this.clearCache();
    return this.http.put<any>(`${this.apiUrl}/${id}`, data);
  }

  deleteScheme(id: number): Observable<any> {
    this.clearCache();
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  clearCache(): void {
    this.cache.clear();
  }
}