import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  NotificationPreferences,
  NotificationPreferencesUpdatePayload,
  NotificationMatrixResponse,
  NotificationMatrixUpdatePayload,
} from '../models/notification.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class NotificationPreferencesService {
  private readonly baseUrl = `${environment.apiUrl}/notification-preferences`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch caller's global notification preferences.
   * GET /notification-preferences/me
   */
  getPreferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${this.baseUrl}/me`);
  }

  /**
   * Update caller's global notification preferences.
   * PUT /notification-preferences/me
   */
  updatePreferences(
    payload: NotificationPreferencesUpdatePayload
  ): Observable<NotificationPreferences> {
    return this.http.put<NotificationPreferences>(`${this.baseUrl}/me`, payload);
  }

  /**
   * Reset caller's preferences to defaults.
   * POST /notification-preferences/me/reset
   */
  resetPreferences(): Observable<NotificationPreferences> {
    return this.http.post<NotificationPreferences>(`${this.baseUrl}/me/reset`, {});
  }

  /**
   * Fetch the full role-scoped per-type x channel matrix for the caller.
   * GET /notification-preferences/me/matrix
   */
  getPreferenceMatrix(): Observable<NotificationMatrixResponse> {
    return this.http.get<NotificationMatrixResponse>(`${this.baseUrl}/me/matrix`);
  }

  /**
   * Atomically save master switches and/or per-type rules in one transaction.
   * PUT /notification-preferences/me/matrix
   */
  savePreferenceMatrix(
    payload: NotificationMatrixUpdatePayload
  ): Observable<NotificationMatrixResponse> {
    return this.http.put<NotificationMatrixResponse>(`${this.baseUrl}/me/matrix`, payload);
  }

  /**
   * Toggle a single notification type's channels.
   * PATCH /notification-preferences/me/types/{notification_type}
   */
  setTypeChannels(
    notificationType: string,
    channels: Partial<{
      in_app_enabled: boolean;
      email_enabled: boolean;
      sms_enabled: boolean;
    }>
  ): Observable<NotificationMatrixResponse> {
    return this.http.patch<NotificationMatrixResponse>(
      `${this.baseUrl}/me/types/${encodeURIComponent(notificationType)}`,
      { notification_type: notificationType, ...channels }
    );
  }

  /**
   * Reset specific types or all types to group/role defaults.
   * DELETE /notification-preferences/me/types
   */
  resetTypeMatrix(types?: string[]): Observable<NotificationMatrixResponse> {
    let params = new HttpParams();
    if (types && types.length > 0) {
      types.forEach((type) => {
        params = params.append('types', type);
      });
    }
    return this.http.delete<NotificationMatrixResponse>(`${this.baseUrl}/me/types`, {
      params,
    });
  }
}
