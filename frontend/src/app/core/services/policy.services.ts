import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Policy {
  id: number;
  title: string;
  description: string;
  category: string;
  ministry: string;
  department?: string;
  state: string;
  sector?: string;
  status: string;
  publication_date?: string;
  effective_date?: string;
  document_url?: string;
  source_url?: string;
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
  }): Observable<Policy[]> {

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

    return this.http.get<Policy[]>(this.apiUrl, { params });
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
}