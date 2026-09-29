import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  FAQ,
  SupportRequest,
  SupportRequestCreate,
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
}
