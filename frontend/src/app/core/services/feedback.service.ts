import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Feedback,
  FeedbackCreate,
  FeedbackUpdate,
} from '../models/feedback.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FeedbackService {
  private readonly baseUrl = `${environment.apiUrl}/feedback`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Submit new feedback.
   */
  createFeedback(data: FeedbackCreate): Observable<Feedback> {
    return this.http.post<Feedback>(this.baseUrl, data);
  }

  /**
   * Retrieve feedback.
   * If caller is Admin, returns all feedback across all users.
   * If caller is a regular user, returns their own feedback.
   */
  getAllFeedback(): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(this.baseUrl);
  }

  /**
   * Retrieve feedback for a specific user (User themselves or Admin).
   */
  getUserFeedback(userId: number): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(`${this.baseUrl}/me/${userId}`);
  }

  /**
   * Retrieve a single feedback entry.
   */
  getFeedback(id: number): Observable<Feedback> {
    return this.http.get<Feedback>(`${this.baseUrl}/${id}`);
  }

  /**
   * Admin only: Update status and/or admin response on feedback.
   */
  updateFeedback(id: number, data: FeedbackUpdate): Observable<Feedback> {
    return this.http.patch<Feedback>(`${this.baseUrl}/${id}`, data);
  }

  /**
   * Admin only: Delete a feedback record.
   */
  deleteFeedback(id: number): Observable<{ message: string; feedback_id: number }> {
    return this.http.delete<{ message: string; feedback_id: number }>(`${this.baseUrl}/${id}`);
  }
}
