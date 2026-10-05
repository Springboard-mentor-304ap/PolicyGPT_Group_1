import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, of, tap, throwError } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { Auth } from './auth';
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
import { environment } from '../../../environments/environment';

/** Payload of a live `notification` frame, mapped onto the REST item shape. */
type LiveNotificationPayload = Extract<NotificationRealtimeEvent, { type: 'notification' }>['data'];

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly baseUrl = `${environment.apiUrl}/notifications`;
  private readonly preferencesUrl = `${environment.apiUrl}/notification-preferences`;

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
  private readonly auth = inject(Auth);
  private realtimeWired = false;

  /**
   * Short-TTL read cache + in-flight dedup for badge/list/summary GETs.
   * Concurrent identical calls (bell + list + poll tick) share one HTTP;
   * sequential calls within 20s reuse it. Mutations clear it; logout too.
   */
  private static readonly READ_TTL_MS = 20_000;
  private static readonly MAX_ENTRIES = 50;
  private readCache = new Map<string, { at: number; data: unknown }>();
  private readInflight = new Map<string, Observable<unknown>>();

  constructor(private readonly http: HttpClient) {
    this.wireRealtime();
    // Optional-chained: specs may provide a partial Auth double.
    this.auth.onLoggedOut?.(() => {
      this.readCache.clear();
      this.unreadCountSubject.next(0);
    });
  }

  private readKey(key: string): string {
    const uid = this.auth.getStoredUser()?.user_id ?? 'anon';
    return `${uid}|${key}`;
  }

  private cachedGet<T>(key: string, fetchFn: () => Observable<T>): Observable<T> {
    const skey = this.readKey(key);
    const hit = this.readCache.get(skey);
    if (hit && Date.now() - hit.at < NotificationService.READ_TTL_MS) {
      return of(hit.data as T);
    }
    if (hit) {
      this.readCache.delete(skey);
    }
    const ongoing = this.readInflight.get(skey);
    if (ongoing) {
      return ongoing as Observable<T>;
    }
    const req = fetchFn().pipe(
      tap((data) => {
        if (this.readCache.size >= NotificationService.MAX_ENTRIES) {
          const oldest = this.readCache.keys().next();
          if (!oldest.done) {
            this.readCache.delete(oldest.value);
          }
        }
        this.readCache.set(skey, { at: Date.now(), data });
        this.readInflight.delete(skey);
      }),
      catchError((err) => {
        this.readInflight.delete(skey);
        return throwError(() => err);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.readInflight.set(skey, req);
    return req;
  }

  /** Drop cached list/badge/summary reads after any read-state mutation. */
  private invalidateReads(): void {
    this.readCache.clear();
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

    return this.cachedGet(`list:${httpParams.toString()}`, () =>
      this.http.get<NotificationListResponse>(this.baseUrl, { params: httpParams }).pipe(
        tap((response) => {
          if (response?.unread_count !== undefined) {
            this.unreadCountSubject.next(response.unread_count);
          }
        }),
      ),
    );
  }

  /**
   * Fast endpoint to get current unread count for the topbar bell badge.
   */
  getUnreadCount(): Observable<UnreadCountResponse> {
    return this.cachedGet('unread-count', () =>
      this.http.get<UnreadCountResponse>(`${this.baseUrl}/unread-count`).pipe(
        tap((res) => {
          this.unreadCountSubject.next(res.unread_count);
        }),
      ),
    );
  }

  /**
   * Get 4-card notification summary statistics (Total, Unread, Read, This Week).
   */
  getSummary(): Observable<NotificationSummary> {
    return this.cachedGet('summary', () =>
      this.http.get<NotificationSummary>(`${this.baseUrl}/summary`).pipe(
        tap((summary) => {
          if (summary?.unread !== undefined) {
            this.unreadCountSubject.next(summary.unread);
          }
        }),
      ),
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
        this.invalidateReads();
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
        this.invalidateReads();
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
        this.invalidateReads();
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
        this.invalidateReads();
        this.getUnreadCount().subscribe({ error: () => undefined });
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
    return this.http.get<AdminNotificationStats>(`${environment.apiUrl}/admin/notifications/statistics`);
  }

  getAdminDeliveries(limit: number = 50): Observable<{ items: NotificationDeliveryRecord[]; total: number }> {
    return this.http.get<{ items: NotificationDeliveryRecord[]; total: number }>(`${environment.apiUrl}/admin/notifications/delivery-status`, {
      params: new HttpParams().set('page_size', limit.toString()),
    });
  }

  testEmail(email: string): Observable<TestDeliveryResponse> {
    return this.http.post<TestDeliveryResponse>(`${environment.apiUrl}/admin/notifications/test-email`, { email });
  }

  testSms(phoneNumber: string): Observable<TestDeliveryResponse> {
    return this.http.post<TestDeliveryResponse>(`${environment.apiUrl}/admin/notifications/test-sms`, { phone_number: phoneNumber });
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
