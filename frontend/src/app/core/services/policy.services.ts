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

  constructor(private http: HttpClient) {}

  getPolicies(filters?: {
    search?: string;
    category?: string;
    ministry?: string;
    state?: string;
    status?: string;
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

    return this.http.get<PolicyListResponse>(this.apiUrl, { params });
  }

  getPolicy(id: number): Observable<Policy> {
    return this.http.get<Policy>(`${this.apiUrl}/${id}`);
  }

  createPolicy(data: any): Observable<Policy> {
  return this.http.post<Policy>(this.apiUrl, data);
}

  deletePolicy(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  updatePolicy(id: number, data: Partial<Policy>): Observable<Policy> {
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
}