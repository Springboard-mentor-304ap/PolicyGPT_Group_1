import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { ToastService } from '../../../core/services/toast.service';
import { ToastComponent } from '../toast/toast.component';
import { NotificationService } from '../../../core/services/notification.service';
import { Auth } from '../../../core/services/auth';
import { NotificationItem } from '../../../core/models/notification.model';

/** How long a live-notification toast stays on screen. */
const LIVE_TOAST_MS = 6000;

/**
 * Renders the app-wide toast stack.
 *
 * This was previously dead code: `ToastService` was called from a dozen
 * components but no template ever mounted a `ToastComponent`, so none of those
 * messages were visible. Mounting the container makes every existing call site
 * work and gives live notifications a surface at the same time.
 *
 * Accessibility: the stack is an `aria-live` region so a screen reader announces
 * each toast without focus being stolen, and every toast has a keyboard-
 * reachable dismiss button.
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, ToastComponent],
  template: `
    <div class="toast-stack" role="region" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
      @for (toast of toastService.toasts(); track toast.id) {
        <app-toast
          [toast]="toast"
          (dismiss)="toastService.remove($event)"
        ></app-toast>
      }
    </div>
  `,
  styles: [
    `
      .toast-stack {
        position: fixed;
        top: 92px;
        right: 24px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 380px;
        max-width: calc(100vw - 32px);
        pointer-events: none;
      }

      .toast-stack app-toast {
        pointer-events: auto;
        display: block;
      }

      @media (max-width: 640px) {
        .toast-stack {
          top: 76px;
          left: 16px;
          right: 16px;
          width: auto;
          max-width: none;
        }
      }
    `,
  ],
})
export class ToastContainerComponent implements OnInit, OnDestroy {
  readonly toastService = inject(ToastService);
  private readonly notificationService = inject(NotificationService);
  private readonly auth = inject(Auth);

  private sub?: Subscription;

  ngOnInit(): void {
    if (!this.auth.isLoggedIn() || this.auth.isGuest()) {
      return;
    }
    // A live frame is surfaced as a toast as well as in the bell/centre, so a
    // user on another tab of the dashboard still learns about it immediately.
    this.sub = this.notificationService.liveNotification$.subscribe((item) => {
      this.announce(item);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private announce(item: NotificationItem): void {
    // `HIGH`/`URGENT` map to `warning` so they stand out from routine info.
    // The backend's canonical priorities are LOW/NORMAL/HIGH/URGENT.
    const type = item.priority === 'URGENT' || item.priority === 'HIGH' ? 'warning' : 'info';

    this.toastService.show(type, item.title, item.message, LIVE_TOAST_MS);
  }
}
