import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NotificationResponse {
  notification_id: number;
  user_id: number | null;
  title: string;
  message: string;
  notification_type: string;
  related_policy_id: number | null;
  related_scheme_id: number | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationStatsResponse {
  total: number;
  read: number;
  unread: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly baseUrl = 'http://localhost:8000/notifications';

  constructor(private readonly http: HttpClient) {}

  getUserNotifications(userId: number): Observable<NotificationResponse[]> {
    return this.http.get<NotificationResponse[]>(`${this.baseUrl}/me/${userId}`);
  }

  getNotificationStats(userId: number): Observable<NotificationStatsResponse> {
    return this.http.get<NotificationStatsResponse>(`${this.baseUrl}/me/${userId}/stats`);
  }

  markAsRead(notificationId: number): Observable<NotificationResponse> {
    return this.http.patch<NotificationResponse>(`${this.baseUrl}/${notificationId}/read`, {});
  }

  markAllAsRead(userId: number): Observable<{ message: string; updated_count: number }> {
    return this.http.patch<{ message: string; updated_count: number }>(
      `${this.baseUrl}/me/${userId}/read-all`,
      {}
    );
  }

  deleteNotification(notificationId: number): Observable<{ message: string; notification_id: number }> {
    return this.http.delete<{ message: string; notification_id: number }>(
      `${this.baseUrl}/${notificationId}`
    );
  }
}
