import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, tap } from 'rxjs';
import {
  AdminNotificationStats,
  NotificationDeliveryRecord,
  NotificationItem,
  NotificationListResponse,
  NotificationPriority,
  NotificationPreferences,
  NotificationPreferencesUpdatePayload,
  NotificationQueryParams,
  NotificationMatrixResponse,
  NotificationMatrixUpdatePayload,
  NotificationSummary,
  TestDeliveryResponse,
  UnreadCountResponse,
} from '../models/notification.model';
import {
  NotificationRealtimeEvent,
  NotificationRealtimeService,
} from './notification-realtime.service';

/** Payload of a live `notification` frame, mapped onto the REST item shape. */
type LiveNotificationPayload = Extract<NotificationRealtimeEvent, { type: 'notification' }>['data'];

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly baseUrl = 'http://localhost:8000/notifications';
  private readonly preferencesUrl = 'http://localhost:8000/notification-preferences';

  private readonly unreadCountSubject = new BehaviorSubject<number>(0);
  public readonly unreadCount$ = this.unreadCountSubject.asObservable();

  /**
   * Emits the payload of each live `notification` frame. The notification
   * centre, dashboard and bell all subscribe to this so one socket keeps every
   * view in sync without each of them polling.
   */
  private readonly liveNotificationSubject = new Subject<NotificationItem>();
  public readonly liveNotification$ = this.liveNotificationSubject.asObservable();

  /** True once a live frame arrives, so views can skip re-fetching the list. */
  private readonly hasRealtimeSubject = new BehaviorSubject<boolean>(false);
  public readonly hasRealtime$ = this.hasRealtimeSubject.asObservable();

  private readonly realtime = inject(NotificationRealtimeService);
  private realtimeWired = false;

  constructor(private readonly http: HttpClient) {
    this.wireRealtime();
  }

  /**
   * Bridge the socket into the badge subject and the live-notification stream.
   * Called once from the constructor; `realtimeWired` guards against re-entry.
   */
  private wireRealtime(): void {
    if (this.realtimeWired) {
      return;
    }
    this.realtimeWired = true;

    this.realtime.events$.subscribe((event: NotificationRealtimeEvent) => {
      switch (event.type) {
        case 'connected':
          this.unreadCountSubject.next(event.data.unread_count);
          break;

        case 'unread_count':
          this.unreadCountSubject.next(event.data.unread_count);
          break;

        case 'notification': {
          this.incrementUnreadCount();
          this.liveNotificationSubject.next(this.toItem(event.data));
          break;
        }

        default:
          break;
      }
    });

    // The realtime service cannot fetch, so the polling fallback delegates here.
    this.realtime.onPollTick = () => this.getUnreadCount().subscribe({ error: () => undefined });
  }

  /** Open the socket. Views call this from ngOnInit after the auth check. */
  startRealtime(): void {
    this.realtime.connect();
  }

  /** Close the socket. Views call this from ngOnDestroy / on logout. */
  stopRealtime(): void {
    this.realtime.disconnect();
  }

  /** Full snapshot of the current badge without an HTTP round trip. */
  get currentUnreadCount(): number {
    return this.unreadCountSubject.value;
  }

  /**
   * Map a live frame onto the REST item shape.
   *
   * The socket payload is deliberately smaller than the REST resource (no
   * enriched entity fields), so the fields the socket does not carry are filled
   * with neutral values. That is why `NotificationItem` fields are optional
   * here via a partial: a live row is a preview, and the notification centre
   * re-fetches the full record when it needs the detail.
   */
  private toItem(data: LiveNotificationPayload): NotificationItem {
    return {
      notification_id: data.notification_id,
      user_id: null,
      notification_type: data.notification_type,
      category: data.category,
      title: data.title,
      message: data.message,
      priority: (data.priority as NotificationPriority) ?? 'NORMAL',
      channel: 'IN_APP',
      action_url: null,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      source_name: null,
      related_policy_id: null,
      related_scheme_id: null,
      is_read: data.is_read,
      read_at: null,
      created_at: data.created_at,
    };
  }


  /**
   * Get paginated notifications with filters, search and sort.
   */
  getNotifications(params?: NotificationQueryParams): Observable<NotificationListResponse> {
    let httpParams = new HttpParams();

    if (params) {
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.category && params.category !== 'all') httpParams = httpParams.set('category', params.category);
      if (params.is_read !== undefined && params.is_read !== null) {
        httpParams = httpParams.set('is_read', params.is_read.toString());
      }
      if (params.priority && params.priority !== 'ALL') httpParams = httpParams.set('priority', params.priority);
      if (params.channel && params.channel !== 'ALL') httpParams = httpParams.set('channel', params.channel);
      if (params.date_range) httpParams = httpParams.set('date_range', params.date_range);
      if (params.sort_by) httpParams = httpParams.set('sort_by', params.sort_by);
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.page_size) httpParams = httpParams.set('page_size', params.page_size.toString());
    }

    return this.http.get<NotificationListResponse>(this.baseUrl, { params: httpParams }).pipe(
      tap((response) => {
        if (response?.unread_count !== undefined) {
          this.unreadCountSubject.next(response.unread_count);
        }
      })
    );
  }

  /**
   * Fast endpoint to get current unread count for the topbar bell badge.
   */
  getUnreadCount(): Observable<UnreadCountResponse> {
    return this.http.get<UnreadCountResponse>(`${this.baseUrl}/unread-count`).pipe(
      tap((res) => {
        this.unreadCountSubject.next(res.unread_count);
      })
    );
  }

  /**
   * Get 4-card notification summary statistics (Total, Unread, Read, This Week).
   */
  getSummary(): Observable<NotificationSummary> {
    return this.http.get<NotificationSummary>(`${this.baseUrl}/summary`).pipe(
      tap((summary) => {
        if (summary?.unread !== undefined) {
          this.unreadCountSubject.next(summary.unread);
        }
      })
    );
  }

  /**
   * Get single notification details.
   */
  getNotificationById(notificationId: number): Observable<NotificationItem> {
    return this.http.get<NotificationItem>(`${this.baseUrl}/${notificationId}`);
  }

  /**
   * Mark single notification as read.
   */
  markAsRead(notificationId: number): Observable<NotificationItem> {
    return this.http.patch<NotificationItem>(`${this.baseUrl}/${notificationId}/read`, {}).pipe(
      tap(() => {
        this.decrementUnreadCount();
      })
    );
  }

  /**
   * Mark single notification as unread.
   */
  markAsUnread(notificationId: number): Observable<NotificationItem> {
    return this.http.patch<NotificationItem>(`${this.baseUrl}/${notificationId}/unread`, {}).pipe(
      tap(() => {
        this.incrementUnreadCount();
      })
    );
  }

  /**
   * Mark all notifications as read.
   */
  markAllAsRead(): Observable<{ message: string; updated_count: number }> {
    return this.http.patch<{ message: string; updated_count: number }>(`${this.baseUrl}/read-all`, {}).pipe(
      tap(() => {
        this.unreadCountSubject.next(0);
      })
    );
  }

  /**
   * Delete a notification.
   */
  deleteNotification(notificationId: number): Observable<{ message: string; notification_id: number }> {
    return this.http.delete<{ message: string; notification_id: number }>(`${this.baseUrl}/${notificationId}`).pipe(
      tap(() => {
        this.getUnreadCount().subscribe();
      })
    );
  }

  // ============================================================
  // PREFERENCES
  // ============================================================

  getPreferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${this.preferencesUrl}/me`);
  }

  updatePreferences(payload: NotificationPreferencesUpdatePayload): Observable<NotificationPreferences> {
    return this.http.put<NotificationPreferences>(`${this.preferencesUrl}/me`, payload);
  }

  resetPreferences(): Observable<NotificationPreferences> {
    return this.http.post<NotificationPreferences>(`${this.preferencesUrl}/reset`, {});
  }

  // ============================================================
  // PER-TYPE CHANNEL MATRIX
  // ============================================================

  /**
   * The role-scoped per-type x channel matrix. The backend decides which groups
   * a role may see, so the component renders whatever arrives and never has to
   * duplicate the role rules in TypeScript.
   */
  getPreferenceMatrix(): Observable<NotificationMatrixResponse> {
    return this.http.get<NotificationMatrixResponse>(`${this.preferencesUrl}/me/matrix`);
  }

  savePreferenceMatrix(payload: NotificationMatrixUpdatePayload): Observable<NotificationMatrixResponse> {
    return this.http.put<NotificationMatrixResponse>(`${this.preferencesUrl}/me/matrix`, payload);
  }

  setTypeChannels(
    notificationType: string,
    channels: Partial<{ in_app_enabled: boolean; email_enabled: boolean; sms_enabled: boolean }>
  ): Observable<NotificationMatrixResponse> {
    return this.http.patch<NotificationMatrixResponse>(
      `${this.preferencesUrl}/me/types/${encodeURIComponent(notificationType)}`,
      { notification_type: notificationType, ...channels }
    );
  }

  /** Reset specific types to their role defaults; omit `types` to reset all. */
  resetTypeMatrix(types?: string[]): Observable<NotificationMatrixResponse> {
    let params = new HttpParams();
    (types ?? []).forEach((type) => {
      params = params.append('types', type);
    });
    return this.http.delete<NotificationMatrixResponse>(`${this.preferencesUrl}/me/types`, { params });
  }

  // ============================================================
  // UNREAD COUNT HELPERS
  // ============================================================

  setUnreadCount(count: number): void {
    this.unreadCountSubject.next(Math.max(0, count));
  }

  private decrementUnreadCount(): void {
    const current = this.unreadCountSubject.value;
    this.unreadCountSubject.next(Math.max(0, current - 1));
  }

  private incrementUnreadCount(): void {
    const current = this.unreadCountSubject.value;
    this.unreadCountSubject.next(current + 1);
  }

  // ============================================================
  // ADMIN DIAGNOSTICS & DELIVERY MONITORING
  // ============================================================

  getAdminStatistics(): Observable<AdminNotificationStats> {
    return this.http.get<AdminNotificationStats>('http://localhost:8000/admin/notifications/statistics');
  }

  getAdminDeliveries(limit: number = 50): Observable<{ items: NotificationDeliveryRecord[]; total: number }> {
    return this.http.get<{ items: NotificationDeliveryRecord[]; total: number }>('http://localhost:8000/admin/notifications/delivery-status', {
      params: new HttpParams().set('page_size', limit.toString()),
    });
  }

  testEmail(email: string): Observable<TestDeliveryResponse> {
    return this.http.post<TestDeliveryResponse>('http://localhost:8000/admin/notifications/test-email', { email });
  }

  testSms(phoneNumber: string): Observable<TestDeliveryResponse> {
    return this.http.post<TestDeliveryResponse>('http://localhost:8000/admin/notifications/test-sms', { phone_number: phoneNumber });
  }

  // ============================================================
  // BACKWARDS COMPATIBILITY METHODS
  // ============================================================

  getUserNotifications(userId: number): Observable<NotificationItem[]> {
    return this.http.get<NotificationItem[]>(`${this.baseUrl}/me/${userId}`);
  }

  getNotificationStats(userId: number): Observable<{ total: number; read: number; unread: number }> {
    return this.http.get<{ total: number; read: number; unread: number }>(`${this.baseUrl}/me/${userId}/stats`);
  }
}
