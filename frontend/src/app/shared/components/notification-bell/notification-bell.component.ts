import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { NotificationService } from '../../../core/services/notification.service';
import { Auth } from '../../../core/services/auth';
import { NotificationItem } from '../../../core/models/notification.model';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.scss'],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  unreadCount = 0;
  isOpen = false;
  loading = false;
  hasError = false;
  recentNotifications: NotificationItem[] = [];

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
    if (!this.authService.isLoggedIn() || this.authService.isGuest()) {
      return;
    }

    // Badge count, kept correct by the realtime bridge in NotificationService.
    this.countSub = this.notificationService.unreadCount$.subscribe((count) => {
      this.unreadCount = count;
    });

    // Prepend anything that arrives while the dropdown is already open.
    this.liveSub = this.notificationService.liveNotification$.subscribe((item) => {
      if (!this.isOpen || this.seenIds.has(item.notification_id)) {
        return;
      }
      this.seenIds.add(item.notification_id);
      this.recentNotifications = [item, ...this.recentNotifications].slice(0, 5);
    });

    // One socket for the whole app; the service is a no-op if already open.
    this.notificationService.startRealtime();
  }

  ngOnDestroy(): void {
    this.countSub?.unsubscribe();
    this.liveSub?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      this.loadRecent();
    }
  }

  loadRecent(): void {
    this.loading = true;
    this.hasError = false;
    this.notificationService
      .getNotifications({ page: 1, page_size: 5, sort_by: 'unread_first' })
      .subscribe({
        next: (res) => {
          this.recentNotifications = res.items || [];
          this.seenIds = new Set(this.recentNotifications.map((n) => n.notification_id));
          this.loading = false;
          this.hasError = false;
        },
        error: () => {
          this.loading = false;
          this.hasError = true;
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
    this.isOpen = false;

    if (!item.is_read) {
      this.notificationService.markAsRead(item.notification_id).subscribe();
    }

    this.router.navigate([this.getNotificationsRoute()], {
      queryParams: { id: item.notification_id },
    });
  }

  markAllAsRead(event: Event): void {
    event.stopPropagation();
    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        this.recentNotifications.forEach((n) => (n.is_read = true));
        this.unreadCount = 0;
      },
    });
  }

  viewAll(event: Event): void {
    event.stopPropagation();
    this.isOpen = false;
    this.router.navigate([this.getNotificationsRoute()]);
  }

  openPreferences(event: Event): void {
    event.stopPropagation();
    this.isOpen = false;
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
