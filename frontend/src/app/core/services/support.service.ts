import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  FAQ,
  SupportRequest,
  SupportRequestCreate,
  AdminSupportRequest,
  SupportRequestRespond,
} from '../models/support.model';

@Injectable({
  providedIn: 'root',
})
export class SupportService {
  private readonly baseUrl = 'http://localhost:8000/support';

  constructor(private readonly http: HttpClient) {}

  /**
   * Retrieve all published FAQs, optionally filtering by search keyword and category.
   * GET /support/faqs
   */
  getFaqs(search?: string, category?: string): Observable<FAQ[]> {
    let params = new HttpParams();
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }
    if (category && category.trim() && category.trim().toLowerCase() !== 'all') {
      params = params.set('category', category.trim());
    }
    return this.http.get<FAQ[]>(`${this.baseUrl}/faqs`, { params });
  }

  /**
   * Retrieve distinct categories of published FAQs from the backend.
   * GET /support/faqs/categories
   */
  getFaqCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/faqs/categories`);
  }

  /**
   * Retrieve a single published FAQ by ID.
   * GET /support/faqs/{id}
   */
  getFaq(id: number): Observable<FAQ> {
    return this.http.get<FAQ>(`${this.baseUrl}/faqs/${id}`);
  }

  /**
   * Submit a new support request.
   * POST /support/requests
   */
  submitSupportRequest(data: SupportRequestCreate): Observable<SupportRequest> {
    return this.http.post<SupportRequest>(`${this.baseUrl}/requests`, data);
  }

  /**
   * Retrieve all support requests submitted by the logged-in user.
   * GET /support/requests
   */
  getMySupportRequests(): Observable<SupportRequest[]> {
    return this.http.get<SupportRequest[]>(`${this.baseUrl}/requests`);
  }

  /**
   * Retrieve a single support request by query ID with ownership verification.
   * GET /support/requests/{id}
   */
  getSupportRequest(id: number): Observable<SupportRequest> {
    return this.http.get<SupportRequest>(`${this.baseUrl}/requests/${id}`);
  }

  /**
   * Retrieve every support request with user details (Admin only).
   * GET /support/admin/requests
   */
  getAllSupportRequests(filters?: {
    status?: string;
    category?: string;
    search?: string;
  }): Observable<AdminSupportRequest[]> {
    let params = new HttpParams();
    if (filters?.status && filters.status !== 'ALL') {
      params = params.set('status', filters.status);
    }
    if (filters?.category && filters.category !== 'ALL') {
      params = params.set('category', filters.category);
    }
    if (filters?.search && filters.search.trim()) {
      params = params.set('search', filters.search.trim());
    }
    return this.http.get<AdminSupportRequest[]>(
      `${this.baseUrl}/admin/requests`,
      { params },
    );
  }

  /**
   * Retrieve a single support request with user details (Admin only).
   * GET /support/admin/requests/{id}
   */
  getSupportRequestAdmin(id: number): Observable<AdminSupportRequest> {
    return this.http.get<AdminSupportRequest>(
      `${this.baseUrl}/admin/requests/${id}`,
    );
  }

  /**
   * Record an admin response and/or status change (Admin only).
   * PATCH /support/admin/requests/{id}
   */
  respondToSupportRequest(
    id: number,
    payload: SupportRequestRespond,
  ): Observable<AdminSupportRequest> {
    return this.http.patch<AdminSupportRequest>(
      `${this.baseUrl}/admin/requests/${id}`,
      payload,
    );
  }
}
