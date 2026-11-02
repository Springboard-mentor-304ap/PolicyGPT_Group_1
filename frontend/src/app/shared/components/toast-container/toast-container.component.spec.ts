import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastContainerComponent } from './toast-container.component';
import { ToastService } from '../../../core/services/toast.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Auth } from '../../../core/services/auth';
import { Subject } from 'rxjs';
import { NotificationItem } from '../../../core/models/notification.model';

describe('ToastContainerComponent', () => {
  let fixture: ComponentFixture<ToastContainerComponent>;
  let component: ToastContainerComponent;
  let toastService: ToastService;
  let liveNotification$: Subject<NotificationItem>;
  let mockAuth: { isLoggedIn: ReturnType<typeof vi.fn>; isGuest: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    liveNotification$ = new Subject<NotificationItem>();
    mockAuth = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      isGuest: vi.fn().mockReturnValue(false),
    };

    TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
      providers: [
        ToastService,
        {
          provide: NotificationService,
          useValue: {
            liveNotification$: liveNotification$.asObservable(),
          },
        },
        {
          provide: Auth,
          useValue: mockAuth,
        },
      ],
    });

    toastService = TestBed.inject(ToastService);
    toastService.clear();
    fixture = TestBed.createComponent(ToastContainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render the fixed toast container with proper accessibility attributes', () => {
    const stack = fixture.nativeElement.querySelector('.toast-stack');
    expect(stack).toBeTruthy();
    expect(stack.getAttribute('role')).toBe('region');
    expect(stack.getAttribute('aria-label')).toBe('Notifications');
    expect(stack.getAttribute('aria-live')).toBe('polite');
  });

  it('should render active toasts inside the container', () => {
    toastService.success('Policy Exported', 'Downloaded as PDF.');
    toastService.info('Sync in Progress', 'Updating remote items.');
    fixture.detectChanges();

    const toastElements = fixture.nativeElement.querySelectorAll('app-toast');
    expect(toastElements.length).toBe(2);

    const titles = fixture.nativeElement.querySelectorAll('.toast-title');
    expect(titles[0].textContent).toContain('Policy Exported');
    expect(titles[1].textContent).toContain('Sync in Progress');
  });

  it('should dismiss toast when close button is clicked', () => {
    toastService.success('Dismiss Me', 'Test message.');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-toast').length).toBe(1);

    const closeBtn = fixture.nativeElement.querySelector('.toast-close') as HTMLElement;
    closeBtn.click();
    fixture.detectChanges();

    expect(toastService.toasts().length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('app-toast').length).toBe(0);
  });

  it('should listen to live notifications and surface them as toasts', () => {
    const item: NotificationItem = {
      notification_id: 99,
      user_id: 1,
      title: 'Realtime Alert',
      message: 'New policy submitted for review.',
      notification_type: 'POLICY_APPROVAL_REQUEST',
      priority: 'HIGH',
      channel: 'IN_APP',
      action_url: null,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    liveNotification$.next(item);
    fixture.detectChanges();

    const toasts = fixture.nativeElement.querySelectorAll('app-toast');
    expect(toasts.length).toBe(1);
    expect(fixture.nativeElement.querySelector('.toast-title').textContent).toContain('Realtime Alert');
  });
});
