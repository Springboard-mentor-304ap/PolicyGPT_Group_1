import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay" (click)="onBackdropClick($event)">
        <div class="modal-card" role="dialog" aria-modal="true">
          <div class="modal-icon" [ngClass]="'modal-icon--' + variant()">
            @if (variant() === 'danger') {
              <span class="material-icons">warning</span>
            } @else if (variant() === 'warning') {
              <span class="material-icons">help_outline</span>
            } @else if (variant() === 'success') {
              <span class="material-icons">check_circle</span>
            } @else {
              <span class="material-icons">info</span>
            }
          </div>

          <h3 class="modal-title">{{ title() }}</h3>
          <p class="modal-message">{{ message() }}</p>

          <div class="modal-actions">
            @if (showCancel()) {
              <button
                type="button"
                class="modal-btn modal-btn--cancel"
                (click)="onCancel()"
              >
                {{ cancelText() }}
              </button>
            }
            <button
              type="button"
              class="modal-btn"
              [ngClass]="'modal-btn--' + variant()"
              (click)="onConfirm()"
            >
              {{ confirmText() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      padding: 16px;
      box-sizing: border-box;
    }

    .modal-card {
      position: relative;
      width: min(440px, 100%);
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
      padding: 28px 24px 24px;
      text-align: center;
      animation: modalScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
    }

    .modal-icon {
      width: 52px;
      height: 52px;
      margin: 0 auto 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-icon .material-icons {
      font-size: 28px;
    }

    .modal-icon--danger {
      background: #fef2f2;
      border: 1px solid #fee2e2;
      color: #dc2626;
    }

    .modal-icon--warning {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      color: #d97706;
    }

    .modal-icon--success {
      background: #ecfdf5;
      border: 1px solid #d1fae5;
      color: #059669;
    }

    .modal-icon--primary {
      background: #eff6ff;
      border: 1px solid #dbeafe;
      color: #2563eb;
    }

    .modal-title {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.01em;
    }

    .modal-message {
      margin: 10px 0 24px;
      font-size: 14px;
      line-height: 1.55;
      color: #475569;
      white-space: pre-line;
    }

    .modal-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .modal-btn {
      flex: 1;
      min-width: 100px;
      height: 42px;
      padding: 0 18px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }

    .modal-btn--cancel {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #475569;
    }

    .modal-btn--cancel:hover {
      background: #f8fafc;
      border-color: #94a3b8;
      color: #1e293b;
    }

    .modal-btn--danger {
      background: #dc2626;
      border: 1px solid #dc2626;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
    }

    .modal-btn--danger:hover {
      background: #b91c1c;
      border-color: #b91c1c;
    }

    .modal-btn--warning {
      background: #d97706;
      border: 1px solid #d97706;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(217, 119, 6, 0.25);
    }

    .modal-btn--warning:hover {
      background: #b45309;
      border-color: #b45309;
    }

    .modal-btn--success {
      background: #059669;
      border: 1px solid #059669;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
    }

    .modal-btn--success:hover {
      background: #047857;
      border-color: #047857;
    }

    .modal-btn--primary {
      background: #2563eb;
      border: 1px solid #2563eb;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    }

    .modal-btn--primary:hover {
      background: #1d4ed8;
      border-color: #1d4ed8;
    }

    .modal-btn:active {
      transform: scale(0.98);
    }

    @keyframes modalScaleIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @media (max-width: 480px) {
      .modal-card {
        padding: 22px 18px 20px;
      }
      .modal-actions {
        flex-direction: column-reverse;
      }
      .modal-btn {
        width: 100%;
      }
    }
  `]
})
export class ConfirmModalComponent {
  isOpen = input.required<boolean>();
  title = input.required<string>();
  message = input.required<string>();
  confirmText = input<string>('Confirm');
  cancelText = input<string>('Cancel');
  variant = input<'primary' | 'danger' | 'warning' | 'success'>('danger');
  showCancel = input<boolean>(true);

  confirmed = output<void>();
  cancelled = output<void>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onCancel();
    }
  }

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
