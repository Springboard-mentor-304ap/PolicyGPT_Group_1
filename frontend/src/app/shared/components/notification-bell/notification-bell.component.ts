import { Component, OnInit, OnDestroy, HostListener, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subscription, finalize, take } from 'rxjs';

import { NotificationService } from '../../../core/services/notification.service';
import { Auth } from '../../../core/services/auth';
import { NotificationItem } from '../../../core/models/notification.model';
import { QuotedNamesComponent } from '../../../shared/components/quoted-names/quoted-names.component';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, RouterModule, QuotedNamesComponent],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.scss'],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  // Reactive state (signals): the app runs zoneless, so plain property
  // writes inside async subscriptions do NOT trigger change detection
  // (skeletons stayed until the next click). Signal writes schedule
  // rendering automatically — data appears as soon as the API returns.
  unreadCount = signal(0);
  isOpen = signal(false);
  loading = signal(false);
  hasError = signal(false);
  recentNotifications = signal<NotificationItem[]>([]);
  /** True once the first lightweight fetch completed; reopens reuse it. */
  private loaded = false;

  /**
   * Tracks the ids already rendered in the dropdown. A live frame for a row the
   * user is already looking at should update that row, not prepend a duplicate -
   * otherwise opening the dropdown and then receiving a new notification for an
   * item already listed would show it twice.
   */
  private seenIds = new Set<number>();

  private countSub?: Subscription;
  private liveSub?: Subscription;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly authService: Auth,
    private readonly router: Router,
    private readonly elementRef: ElementRef
  ) {}

  ngOnInit(): void {
    // Badge count for this user, fetched once per login session no
    // matter which page mounts the header first (login, refresh, or
    // deep navigation). Repeat mounts are no-ops via the service guard.
    this.notificationService.ensureInitialized();

    if (!this.authService.isLoggedIn() || this.authService.isGuest()) {
      return;
    }

    // Badge count, kept correct by the realtime bridge in NotificationService.
    this.countSub = this.notificationService.unreadCount$.subscribe((count) => {
      this.unreadCount.set(count);
    });

    // Prepend anything that arrives while the dropdown is already open.
    this.liveSub = this.notificationService.liveNotification$.subscribe((item) => {
      if (!this.isOpen() || this.seenIds.has(item.notification_id)) {
        return;
      }
      this.seenIds.add(item.notification_id);
      this.recentNotifications.update((list) => [item, ...list].slice(0, 5));
    });

    // One socket for the whole app; the service is a no-op if already open.
    this.notificationService.startRealtime();

    // Drop cached dropdown rows on logout so the next user never sees
    // the previous user's notifications.
    this.authService.onLoggedOut?.(() => {
      this.loaded = false;
      this.recentNotifications.set([]);
      this.seenIds.clear();
      this.unreadCount.set(0);
      this.isOpen.set(false);
    });
  }

  ngOnDestroy(): void {
    this.countSub?.unsubscribe();
    this.liveSub?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen.set(false);
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isOpen.update((v) => !v);

    if (this.isOpen()) {
      this.loadRecent();
    }
  }

  /**
   * Lightweight fetch: newest 5 only (never the full list). Skipped when
   * data is already loaded so reopening is instant; pass force=true to
   * refresh after an error retry. The dropdown opens before this
   * resolves — it never blocks opening.
   */
  loadRecent(force = false): void {
    if ((this.loaded || this.loading()) && !force) {
      return;
    }
    this.loading.set(true);
    this.hasError.set(false);
    this.notificationService
      .getNotifications({ page: 1, page_size: 5, sort_by: 'latest' })
      .pipe(
        finalize(() => {
          this.loading.set(false);
        }),
      )
      .subscribe({
        next: (res) => {
          const items = res.items || [];
          this.recentNotifications.set([...items]);
          this.seenIds = new Set(items.map((n) => n.notification_id));
          this.hasError.set(false);
          this.loaded = true;
        },
        error: () => {
          this.hasError.set(true);
        },
      });
  }

  getNotificationsRoute(): string {
    const role = (this.authService.getUserRole() || '').toUpperCase().trim();
    if (role === 'ADMIN' || role === 'ADMINISTRATOR' || role === 'ADMINISTRATOR_ROLE') {
      return '/dashboard/admin/notifications';
    }
    if (
      role === 'GOVERNMENT_OFFICIAL' ||
      role === 'GOVERNMENT_OFFICER' ||
      role === 'GOVERNMENT' ||
      role === 'GOVT'
    ) {
      return '/dashboard/government/notifications';
    }
    if (role === 'ORGANIZATION' || role === 'ORGANISATION') {
      return '/dashboard/organization/notifications';
    }
    if (role === 'RESEARCHER') {
      return '/dashboard/researcher/notifications';
    }
    if (role === 'CITIZEN') {
      return '/dashboard/citizen/notifications';
    }

    const currentUrl = this.router.url;
    if (currentUrl.includes('/admin')) return '/dashboard/admin/notifications';
    if (currentUrl.includes('/government')) return '/dashboard/government/notifications';
    if (currentUrl.includes('/organization')) return '/dashboard/organization/notifications';
    if (currentUrl.includes('/researcher')) return '/dashboard/researcher/notifications';
    if (currentUrl.includes('/citizen')) return '/dashboard/citizen/notifications';

    return '/dashboard/citizen/notifications';
  }

  openNotification(item: NotificationItem, event: Event): void {
    event.stopPropagation();
    this.isOpen.set(false);

    if (!item.is_read) {
      // Single-shot read; failures leave the badge untouched so the UI
      // never claims a read that the server rejected.
      this.notificationService.markAsRead(item.notification_id).pipe(take(1)).subscribe({
        error: () => undefined,
      });
    }

    this.router.navigate([this.getNotificationsRoute()], {
      queryParams: { id: item.notification_id },
    });
  }

  markAllAsRead(event: Event): void {
    event.stopPropagation();
    this.notificationService.markAllAsRead().pipe(take(1)).subscribe({
      next: () => {
        // New array reference (no in-place mutation) so the reactive
        // template picks up the read state on the same tick.
        this.recentNotifications.update((list) =>
          list.map((n) => ({ ...n, is_read: true })),
        );
        this.unreadCount.set(0);
        this.hasError.set(false);
      },
      error: () => {
        // Keep the current badge/list state and surface retry affordance
        // instead of silently zeroing the count on failure.
        this.hasError.set(true);
      },
    });
  }

  viewAll(event: Event): void {
    event.stopPropagation();
    this.isOpen.set(false);
    this.router.navigate([this.getNotificationsRoute()]);
  }

  openPreferences(event: Event): void {
    event.stopPropagation();
    this.isOpen.set(false);
    const base = this.getNotificationsRoute();
    this.router.navigate([`${base}/preferences`]);
  }

  formatRelativeTime(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1d ago';
    return `${diffDays}d ago`;
  }
}
