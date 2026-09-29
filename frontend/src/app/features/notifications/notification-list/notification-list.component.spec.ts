import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, ActivatedRoute } from "@angular/router";
import { of, Subject } from "rxjs";
import { NotificationListComponent } from "./notification-list.component";
import { NotificationService } from "../../../core/services/notification.service";
import { Auth } from "../../../core/services/auth";
import { ToastService } from "../../../core/services/toast.service";
import {
  NotificationItem,
  NotificationSummary,
} from "../../../core/models/notification.model";

describe("NotificationListComponent", () => {
  let component: NotificationListComponent;
  let fixture: ComponentFixture<NotificationListComponent>;
  let notificationServiceMock: any;
  let authServiceMock: any;
  let toastServiceMock: any;
  let routerMock: any;

  const mockNotification: NotificationItem = {
    notification_id: 1,
    user_id: 1,
    notification_type: "SCHEME_UPDATE",
    title: "New Agriculture Scheme Launched",
    message:
      "The Ministry of Agriculture has launched a new scheme for farmers.",
    channel: "IN_APP",
    priority: "HIGH",
    is_read: false,
    entity_type: "SCHEME",
    entity_id: 15,
    source_name: "Ministry of Agriculture",
    action_url: "/schemes/15",
    related_policy_id: null,
    related_scheme_id: 15,
    created_at: "2026-09-24T12:00:00Z",
  };

  const mockSummary: NotificationSummary = {
    total: 12,
    unread: 3,
    read: 9,
    this_week: 2,
  };

  beforeEach(async () => {
    notificationServiceMock = {
      getNotifications: vi.fn().mockReturnValue(
        of({
          total: 1,
          page: 1,
          page_size: 20,
          total_pages: 1,
          unread_count: 1,
          summary: mockSummary,
          items: [mockNotification],
        }),
      ),
      getSummary: vi.fn().mockReturnValue(of(mockSummary)),
      getNotificationById: vi.fn().mockReturnValue(of(mockNotification)),
      getUnreadCount: vi.fn().mockReturnValue(of({ unread_count: 3 })),
      markAsRead: vi
        .fn()
        .mockReturnValue(of({ ...mockNotification, is_read: true })),
      markAsUnread: vi
        .fn()
        .mockReturnValue(of({ ...mockNotification, is_read: false })),
      markAllAsRead: vi
        .fn()
        .mockReturnValue(of({ message: "All marked read", updated_count: 3 })),
      deleteNotification: vi
        .fn()
        .mockReturnValue(of({ message: "Deleted", notification_id: 1 })),
      liveNotification$: new Subject<any>().asObservable(),
      startRealtime: vi.fn(),
      stopRealtime: vi.fn(),
    };

    authServiceMock = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      isGuest: vi.fn().mockReturnValue(false),
      getStoredUser: vi
        .fn()
        .mockReturnValue({
          user_id: 1,
          email: "citizen@gmail.com",
          role: "CITIZEN",
        }),
      getUserRole: vi.fn().mockReturnValue("CITIZEN"),
    };

    toastServiceMock = {
      success: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    };

    routerMock = {
      navigate: vi.fn(),
      navigateByUrl: vi.fn(),
    };

    const activatedRouteMock = {
      snapshot: {
        paramMap: {
          get: () => null,
        },
        queryParams: {},
        params: {},
      },
      queryParams: of({}),
      params: of({}),
    };

    await TestBed.configureTestingModule({
      imports: [NotificationListComponent],
      providers: [
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: Auth, useValue: authServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: ActivatedRoute, useValue: activatedRouteMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("1. should create the component", () => {
    expect(component).toBeTruthy();
  });

  it("2. should initialize role-based tabs for CITIZEN", () => {
    expect(component.tabs.length).toBeGreaterThan(0);
    const tabLabels = component.tabs.map((t) => t.label);
    expect(tabLabels).toContain("All");
    expect(tabLabels).toContain("Policies");
    expect(tabLabels).toContain("Schemes");
    expect(tabLabels).not.toContain("User Alerts"); // Admin only
  });

  it("3. should load notifications and summary stats", () => {
    expect(notificationServiceMock.getNotifications).toHaveBeenCalled();
    expect(component.notifications.length).toBe(1);
    expect(component.summary.total).toBe(12);
    expect(component.summary.unread).toBe(3);
  });

  it("4. should select a notification and mark it as read", () => {
    component.selectNotification(mockNotification);
    expect(component.selectedNotification).toEqual(mockNotification);
    expect(notificationServiceMock.markAsRead).toHaveBeenCalledWith(1);
    expect(component.notifications[0].is_read).toBe(true);
  });

  it("5. should mark all as read", () => {
    component.markAllAsRead();
    expect(notificationServiceMock.markAllAsRead).toHaveBeenCalled();
    expect(toastServiceMock.success).toHaveBeenCalled();
    expect(component.summary.unread).toBe(0);
  });

  it("6. should delete a notification", () => {
    component.deleteItem(mockNotification);
    expect(notificationServiceMock.deleteNotification).toHaveBeenCalledWith(1);
    expect(component.notifications.length).toBe(0);
    expect(toastServiceMock.info).toHaveBeenCalled();
  });

  it("7. should switch tabs and reload notifications", () => {
    component.selectTab("SCHEME");
    expect(component.activeTab).toBe("SCHEME");
    expect(notificationServiceMock.getNotifications).toHaveBeenCalledTimes(2);
  });
});
