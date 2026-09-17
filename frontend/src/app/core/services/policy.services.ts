import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Policy {
  policy_id: number;
  title: string;
  description: string;
  category: string;
  ministry: string | null;
  department?: string | null;
  state: string | null;
  sector?: string | null;
  status: string;
  publication_date?: string | null;
  effective_date?: string | null;
  document_url?: string | null;
  source_url?: string | null;
  benefits?: string[] | null;
  eligibility_rules?: any[] | null;
}
export interface PolicyComparison {
  policy_1: Policy;
  policy_2: Policy;
}

export interface PolicyListResponse {
  total: number;
  page: number;
  limit: number;
  pages: number;
  policies: Policy[];
}

@Injectable({
  providedIn: 'root'
})
export class PolicyService {

  private readonly apiUrl = 'http://localhost:8000/policies';

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

  getPolicies(filters?: {
    search?: string;
    category?: string;
    ministry?: string;
    state?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Observable<PolicyListResponse> {

    let params = new HttpParams();

    if (filters?.search) {
      params = params.set('search', filters.search);
    }

    if (filters?.category) {
      params = params.set('category', filters.category);
    }

    if (filters?.ministry) {
      params = params.set('ministry', filters.ministry);
    }

    if (filters?.state) {
      params = params.set('state', filters.state);
    }

    if (filters?.status) {
      params = params.set('status', filters.status);
    }

    params = params.set('page', (filters?.page || 1).toString());
    params = params.set('limit', (filters?.limit || 10).toString());

    const cacheKey = this.getCacheKey('getPolicies', params);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return new Observable(observer => {
        observer.next(cached);
        observer.complete();
      });
    }

    return new Observable(observer => {
      this.http.get<PolicyListResponse>(this.apiUrl, { params }).subscribe({
        next: (response) => {
          this.setCache(cacheKey, response);
          observer.next(response);
          observer.complete();
        },
        error: (error) => observer.error(error)
      });
    });
  }

  getPolicy(id: number): Observable<Policy> {
    const cacheKey = this.getCacheKey(`getPolicy:${id}`);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return new Observable(observer => {
        observer.next(cached);
        observer.complete();
      });
    }

    return new Observable(observer => {
      this.http.get<Policy>(`${this.apiUrl}/${id}`).subscribe({
        next: (response) => {
          this.setCache(cacheKey, response);
          observer.next(response);
          observer.complete();
        },
        error: (error) => observer.error(error)
      });
    });
  }

  createPolicy(data: any): Observable<Policy> {
    this.clearCache();
    return this.http.post<Policy>(this.apiUrl, data);
  }

  deletePolicy(id: number): Observable<any> {
    this.clearCache();
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  updatePolicy(id: number, data: Partial<Policy>): Observable<Policy> {
    this.clearCache();
    return this.http.put<Policy>(`${this.apiUrl}/${id}`, data);
  }

  comparePolicies(
  policyId1: number,
  policyId2: number
): Observable<PolicyComparison> {

  let params = new HttpParams()
    .set('policy_id_1', policyId1)
    .set('policy_id_2', policyId2);

  return this.http.get<PolicyComparison>(
    `${this.apiUrl}/compare`,
    { params }
  );
}

  clearCache(): void {
    this.cache.clear();
  }
}