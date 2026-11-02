import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { NotificationService } from './notification.service';
import {
  NotificationItem,
  NotificationListResponse,
  NotificationSummary,
  NotificationPreferences,
} from '../models/notification.model';

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:8000/notifications';

  const mockNotification: NotificationItem = {
    notification_id: 1,
    user_id: 10,
    notification_type: 'SCHEME_UPDATE',
    title: 'New Scheme Launched',
    message: 'A new scheme has been published.',
    channel: 'IN_APP',
    priority: 'HIGH',
    is_read: false,
    entity_type: 'SCHEME',
    entity_id: 42,
    source_name: 'Ministry of Agriculture',
    action_url: '/schemes/42',
    related_policy_id: null,
    related_scheme_id: 42,
    created_at: '2026-09-24T12:00:00Z',
  };

  const mockSummary: NotificationSummary = {
    total: 12,
    unread: 3,
    read: 9,
    this_week: 2,
  };

  const mockListResponse: NotificationListResponse = {
    total: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
    unread_count: 1,
    summary: mockSummary,
    items: [mockNotification],
  };

  const mockPreferences: NotificationPreferences = {
    preference_id: 1,
    user_id: 10,
    email_enabled: true,
    sms_enabled: false,
    in_app_enabled: true,
    policy_alerts: true,
    scheme_updates: true,
    deadline_reminders: true,
    application_updates: true,
    government_announcements: false,
    regulatory_updates: true,
    research_reports: false,
    system_alerts: true,
    frequency: 'INSTANT',
    updated_at: '2026-09-24T10:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('1. should be created', () => {
    expect(service).toBeTruthy();
  });

  it('2. should fetch notifications list with query params', () => {
    service.getNotifications({ page: 1, page_size: 20, is_read: false, category: 'SCHEME' }).subscribe((res) => {
      expect(res.total).toBe(1);
      expect(res.items.length).toBe(1);
      expect(res.items[0].title).toBe('New Scheme Launched');
    });

    const req = httpMock.expectOne((r) => r.url === baseUrl && r.params.get('category') === 'SCHEME');
    expect(req.request.method).toBe('GET');
    req.flush(mockListResponse);
  });

  it('3. should fetch unread count and update unreadCount$ subject', () => {
    let observedCount = 0;
    service.unreadCount$.subscribe((count) => {
      observedCount = count;
    });

    service.getUnreadCount().subscribe((res) => {
      expect(res.unread_count).toBe(5);
    });

    const req = httpMock.expectOne(`${baseUrl}/unread-count`);
    expect(req.request.method).toBe('GET');
    req.flush({ unread_count: 5 });

    expect(observedCount).toBe(5);
  });

  it('4. should fetch notification summary stats', () => {
    service.getSummary().subscribe((summary) => {
      expect(summary.total).toBe(12);
      expect(summary.unread).toBe(3);
    });

    const req = httpMock.expectOne(`${baseUrl}/summary`);
    expect(req.request.method).toBe('GET');
    req.flush(mockSummary);
  });

  it('5. should fetch single notification by id', () => {
    service.getNotificationById(1).subscribe((item) => {
      expect(item.notification_id).toBe(1);
      expect(item.entity_type).toBe('SCHEME');
    });

    const req = httpMock.expectOne(`${baseUrl}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(mockNotification);
  });

  it('6. should mark notification as read', () => {
    service.markAsRead(1).subscribe((res) => {
      expect(res.is_read).toBe(true);
    });

    const req = httpMock.expectOne(`${baseUrl}/1/read`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ ...mockNotification, is_read: true });
  });

  it('7. should mark notification as unread', () => {
    service.markAsUnread(1).subscribe((res) => {
      expect(res.is_read).toBe(false);
    });

    const req = httpMock.expectOne(`${baseUrl}/1/unread`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ ...mockNotification, is_read: false });
  });

  it('8. should mark all notifications as read', () => {
    service.markAllAsRead().subscribe((res) => {
      expect(res.updated_count).toBe(3);
    });

    const req = httpMock.expectOne(`${baseUrl}/read-all`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ message: 'All notifications marked as read', updated_count: 3 });
  });

  it('9. should delete a notification', () => {
    service.deleteNotification(1).subscribe((res) => {
      expect(res.notification_id).toBe(1);
    });

    const req = httpMock.expectOne(`${baseUrl}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Notification deleted successfully', notification_id: 1 });

    const countReq = httpMock.expectOne(`${baseUrl}/unread-count`);
    countReq.flush({ unread_count: 0 });
  });

  it('10. should get user preferences', () => {
    service.getPreferences().subscribe((prefs) => {
      expect(prefs.policy_alerts).toBe(true);
      expect(prefs.frequency).toBe('INSTANT');
    });

    const req = httpMock.expectOne('http://localhost:8000/notification-preferences/me');
    expect(req.request.method).toBe('GET');
    req.flush(mockPreferences);
  });

  it('11. should update user preferences', () => {
    const updated = { ...mockPreferences, sms_enabled: true };
    service.updatePreferences(updated).subscribe((res) => {
      expect(res.sms_enabled).toBe(true);
    });

    const req = httpMock.expectOne('http://localhost:8000/notification-preferences/me');
    expect(req.request.method).toBe('PUT');
    req.flush(updated);
  });

  it('12. should reset user preferences', () => {
    service.resetPreferences().subscribe((res) => {
      expect(res.frequency).toBe('INSTANT');
    });

    const req = httpMock.expectOne('http://localhost:8000/notification-preferences/reset');
    expect(req.request.method).toBe('POST');
    req.flush(mockPreferences);
  });
});
