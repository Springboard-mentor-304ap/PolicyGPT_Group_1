import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, BehaviorSubject, Subject } from 'rxjs';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationService } from '../../../core/services/notification.service';
import { Auth } from '../../../core/services/auth';
import { NotificationItem } from '../../../core/models/notification.model';

describe('NotificationBellComponent', () => {
  let component: NotificationBellComponent;
  let fixture: ComponentFixture<NotificationBellComponent>;
  let notificationServiceMock: any;
  let authServiceMock: any;
  let routerMock: any;
  let unreadSubject: BehaviorSubject<number>;
  let liveSubject: Subject<any>;

  const mockItem: NotificationItem = {
    notification_id: 10,
    user_id: 1,
    notification_type: 'POLICY_UPDATE',
    title: 'Policy Amendment',
    message: 'Important amendments published.',
    channel: 'IN_APP',
    priority: 'MEDIUM',
    is_read: false,
    entity_type: 'POLICY',
    entity_id: 5,
    source_name: 'Ministry of Education',
    action_url: '/policies/5',
    related_policy_id: 5,
    related_scheme_id: null,
    created_at: '2026-09-24T10:00:00Z',
  };

  beforeEach(async () => {
    unreadSubject = new BehaviorSubject<number>(3);
    liveSubject = new Subject<any>();

    notificationServiceMock = {
      unreadCount$: unreadSubject.asObservable(),
      getUnreadCount: vi.fn().mockReturnValue(of({ unread_count: 3 })),
      getNotifications: vi.fn().mockReturnValue(of({
        total: 1,
        page: 1,
        page_size: 5,
        total_pages: 1,
        unread_count: 1,
        items: [mockItem],
      })),
      markAsRead: vi.fn().mockReturnValue(of({ ...mockItem, is_read: true })),
      markAllAsRead: vi.fn().mockReturnValue(of({ message: 'All read', updated_count: 3 })),
      liveNotification$: liveSubject.asObservable(),
      ensureInitialized: vi.fn(),
      startRealtime: vi.fn(),
      stopRealtime: vi.fn(),
    };

    authServiceMock = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      isGuest: vi.fn().mockReturnValue(false),
      getUserRole: vi.fn().mockReturnValue('CITIZEN'),
    };

    routerMock = {
      navigate: vi.fn(),
      navigateByUrl: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: Auth, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationBellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('2. should subscribe to unreadCount$ on init for logged-in user', () => {
    expect(component.unreadCount()).toBe(3);
    unreadSubject.next(5);
    expect(component.unreadCount()).toBe(5);
  });

  it('3. should toggle dropdown and load recent notifications', () => {
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as Event;
    expect(component.isOpen()).toBe(false);

    component.toggleDropdown(fakeEvent);
    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    expect(component.isOpen()).toBe(true);
    expect(notificationServiceMock.getNotifications).toHaveBeenCalled();
    expect(component.recentNotifications().length).toBe(1);
  });

  it('4. should mark all as read and update recent list', () => {
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as Event;
    component.recentNotifications.set([{ ...mockItem }]);
    component.markAllAsRead(fakeEvent);
    expect(notificationServiceMock.markAllAsRead).toHaveBeenCalled();
    expect(component.recentNotifications()[0].is_read).toBe(true);
    expect(component.unreadCount()).toBe(0);
  });

  it('5. should navigate to notifications list when viewAll is called', () => {
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as Event;
    component.isOpen.set(true);
    component.viewAll(fakeEvent);
    expect(component.isOpen()).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/dashboard/citizen/notifications']);
  });

  it('6. should open notification, mark read, and navigate to notifications with id param', () => {
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as Event;
    component.isOpen.set(true);
    component.openNotification(mockItem, fakeEvent);
    expect(component.isOpen()).toBe(false);
    expect(notificationServiceMock.markAsRead).toHaveBeenCalledWith(10);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/dashboard/citizen/notifications'], {
      queryParams: { id: 10 },
    });
  });
});
