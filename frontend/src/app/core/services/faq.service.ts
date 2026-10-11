import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FAQ, FAQCreate, FAQUpdate } from '../models/faq.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FaqService {
  private readonly baseUrl = `${environment.apiUrl}/faqs`;

  private readonly http = inject(HttpClient);

  /**
   * Retrieve all FAQs.
   */
  getFaqs(): Observable<FAQ[]> {
    return this.http.get<FAQ[]>(this.baseUrl);
  }

  /**
   * Retrieve single FAQ by ID.
   */
  getFaq(id: number): Observable<FAQ> {
    return this.http.get<FAQ>(`${this.baseUrl}/${id}`);
  }

  /**
   * Admin only: Create a new FAQ.
   */
  createFaq(faq: FAQCreate): Observable<FAQ> {
    return this.http.post<FAQ>(this.baseUrl, faq);
  }

  /**
   * Admin only: Update an existing FAQ.
   */
  updateFaq(id: number, faq: FAQUpdate): Observable<FAQ> {
    return this.http.patch<FAQ>(`${this.baseUrl}/${id}`, faq);
  }

  /**
   * Admin only: Delete an FAQ.
   */
  deleteFaq(id: number): Observable<{ message: string; faq_id: number }> {
    return this.http.delete<{ message: string; faq_id: number }>(`${this.baseUrl}/${id}`);
  }
}
