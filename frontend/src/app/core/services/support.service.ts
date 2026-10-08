import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import {
  FAQ,
  SupportRequest,
  SupportRequestCreate,
  AdminSupportRequest,
  SupportRequestRespond,
  TicketMessage,
  TicketMessageCreate,
  SupportAnalytics,
} from '../models/support.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupportService {
  private readonly baseUrl = `${environment.apiUrl}/support`;
  /** Fail-fast bound so a hung POST surfaces an actionable error instead
   * of a stuck spinner; the backend dedupes retries by content. */
  private static readonly REQUEST_TIMEOUT_MS = 30_000;

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
    return this.http
      .get<FAQ[]>(`${this.baseUrl}/faqs`, { params })
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Retrieve distinct categories of published FAQs from the backend.
   * GET /support/faqs/categories
   */
  getFaqCategories(): Observable<string[]> {
    return this.http
      .get<string[]>(`${this.baseUrl}/faqs/categories`)
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Retrieve a single published FAQ by ID.
   * GET /support/faqs/{id}
   */
  getFaq(id: number): Observable<FAQ> {
    return this.http
      .get<FAQ>(`${this.baseUrl}/faqs/${id}`)
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Submit a new support request.
   * POST /support/requests
   * An idempotency key may be supplied per form instance so a retried
   * POST (timeout, double-click) returns the original ticket instead of
   * a duplicate; the backend also dedupes by content as the authority.
   */
  submitSupportRequest(
    data: SupportRequestCreate,
    idempotencyKey?: string,
  ): Observable<SupportRequest> {
    let headers: HttpHeaders | undefined;
    if (idempotencyKey && idempotencyKey.trim()) {
      headers = new HttpHeaders({
        'Idempotency-Key': idempotencyKey.trim(),
      });
    }
    return this.http
      .post<SupportRequest>(`${this.baseUrl}/requests`, data, { headers })
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Retrieve all support requests submitted by the logged-in user.
   * GET /support/requests
   */
  getMySupportRequests(): Observable<SupportRequest[]> {
    return this.http
      .get<SupportRequest[]>(`${this.baseUrl}/requests`)
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Retrieve a single support request by query ID with ownership verification.
   * GET /support/requests/{id}
   */
  getSupportRequest(id: number): Observable<SupportRequest> {
    return this.http
      .get<SupportRequest>(`${this.baseUrl}/requests/${id}`)
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
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
    return this.http
      .get<AdminSupportRequest[]>(
        `${this.baseUrl}/admin/requests`,
        { params },
      )
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Retrieve a single support request with user details (Admin only).
   * GET /support/admin/requests/{id}
   */
  getSupportRequestAdmin(id: number): Observable<AdminSupportRequest> {
    return this.http
      .get<AdminSupportRequest>(
        `${this.baseUrl}/admin/requests/${id}`,
      )
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Record an admin response and/or status change (Admin only).
   * PATCH /support/admin/requests/{id}
   */
  respondToSupportRequest(
    id: number,
    payload: SupportRequestRespond,
  ): Observable<AdminSupportRequest> {
    return this.http
      .patch<AdminSupportRequest>(
        `${this.baseUrl}/admin/requests/${id}`,
        payload,
      )
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Conversation messages on the caller's own ticket.
   * GET /support/requests/{id}/messages
   */
  getTicketMessages(id: number): Observable<TicketMessage[]> {
    return this.http
      .get<TicketMessage[]>(`${this.baseUrl}/requests/${id}/messages`)
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Reply to the caller's own ticket (reopens RESOLVED/CLOSED server-side).
   * POST /support/requests/{id}/messages
   */
  postTicketMessage(
    id: number,
    payload: TicketMessageCreate,
  ): Observable<TicketMessage> {
    return this.http
      .post<TicketMessage>(
        `${this.baseUrl}/requests/${id}/messages`,
        payload,
      )
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Conversation messages on any ticket (Admin only).
   * GET /support/admin/requests/{id}/messages
   */
  getTicketMessagesAdmin(id: number): Observable<TicketMessage[]> {
    return this.http
      .get<TicketMessage[]>(`${this.baseUrl}/admin/requests/${id}/messages`)
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Admin reply without touching response/status fields (Admin only).
   * POST /support/admin/requests/{id}/messages
   */
  postTicketMessageAdmin(
    id: number,
    payload: TicketMessageCreate,
  ): Observable<TicketMessage> {
    return this.http
      .post<TicketMessage>(
        `${this.baseUrl}/admin/requests/${id}/messages`,
        payload,
      )
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Support aggregates for the admin dashboard (Admin only).
   * GET /support/admin/analytics
   */
  getSupportAnalytics(): Observable<SupportAnalytics> {
    return this.http
      .get<SupportAnalytics>(`${this.baseUrl}/admin/analytics`)
      .pipe(timeout(SupportService.REQUEST_TIMEOUT_MS));
  }
}
