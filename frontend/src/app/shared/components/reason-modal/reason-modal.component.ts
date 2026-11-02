import { Component, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuotedNamesComponent } from '../quoted-names/quoted-names.component';

@Component({
  selector: 'app-reason-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, QuotedNamesComponent],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay" (click)="onBackdropClick($event)">
        <div class="modal-card" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div class="modal-icon" [ngClass]="'modal-icon--' + variant()">
              @if (variant() === 'danger') {
                <span class="material-icons">report_problem</span>
              } @else if (variant() === 'warning') {
                <span class="material-icons">archive</span>
              } @else {
                <span class="material-icons">rate_review</span>
              }
            </div>
            <div class="modal-header-text">
              <h3 class="modal-title">{{ title() }}</h3>
              <p class="modal-message"><app-quoted-names [text]="message()"></app-quoted-names></p>
            </div>
          </div>

          <div class="modal-body">
            <label class="modal-label">
              {{ reasonLabel() }}
              @if (required()) {
                <span class="required-star">*</span>
              }
            </label>
            <textarea
              class="modal-textarea"
              [ngModel]="reasonValue()"
              (ngModelChange)="reasonValue.set($event)"
              [placeholder]="placeholder()"
              [maxlength]="maxLength()"
              [disabled]="isLoading()"
              rows="4"
              (keydown.enter)="onEnter($any($event))"
            ></textarea>
            <div class="modal-body-footer">
              @if (showValidationError) {
                <span class="error-text">{{ requiredMessage() }}</span>
              } @else {
                <span></span>
              }
              <span class="char-count">
                {{ reasonValue().length }}/{{ maxLength() }}
              </span>
            </div>
            @if (errorMessage()) {
              <div class="modal-error">
                <span class="material-icons">error_outline</span>
                <span>{{ errorMessage() }}</span>
              </div>
            }
          </div>

          <div class="modal-actions">
            <button
              type="button"
              class="modal-btn modal-btn--cancel"
              [disabled]="isLoading()"
              (click)="onCancel()"
            >
              {{ cancelText() }}
            </button>
            <button
              type="button"
              class="modal-btn"
              [ngClass]="'modal-btn--' + variant()"
              [disabled]="(required() && !reasonValue().trim()) || isLoading()"
              (click)="onConfirm()"
            >
              @if (isLoading()) {
                <span class="modal-spinner"></span>
              }
              <span>{{ confirmText() }}</span>
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
      width: min(480px, 100%);
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
      padding: 24px;
      animation: modalScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
    }

    .modal-header {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 16px;
    }

    .modal-icon {
      width: 44px;
      height: 44px;
      min-width: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-icon .material-icons {
      font-size: 24px;
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

    .modal-icon--primary {
      background: #eff6ff;
      border: 1px solid #dbeafe;
      color: #2563eb;
    }

    .modal-header-text {
      flex: 1;
    }

    .modal-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.01em;
    }

    .modal-message {
      margin: 6px 0 0;
      font-size: 13.5px;
      line-height: 1.5;
      color: #64748b;
    }

    .modal-body {
      margin: 16px 0;
    }

    .modal-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 8px;
    }

    .required-star {
      color: #ef4444;
      margin-left: 2px;
    }

    .modal-textarea {
      width: 100%;
      padding: 10px 12px;
      font-family: inherit;
      font-size: 13.5px;
      line-height: 1.5;
      color: #1e293b;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      outline: none;
      resize: vertical;
      box-sizing: border-box;
      transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
    }

    .modal-textarea:focus {
      background: #ffffff;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .modal-body-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
      font-size: 12px;
    }

    .error-text {
      color: #ef4444;
      font-weight: 500;
    }

    .char-count {
      color: #94a3b8;
      margin-left: auto;
    }

    .modal-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 20px;
    }

    .modal-btn {
      height: 40px;
      padding: 0 18px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }

    .modal-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }

    .modal-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: modalSpin 0.7s linear infinite;
      margin-right: 8px;
      display: inline-block;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .modal-error {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #fef2f2;
      border: 1px solid #fee2e2;
      color: #b91c1c;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.4;
      text-align: left;
      margin: 10px 0 0;
      word-break: break-word;
    }

    .modal-error .material-icons {
      font-size: 18px;
      color: #dc2626;
      flex-shrink: 0;
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
    }

    .modal-btn--warning {
      background: #d97706;
      border: 1px solid #d97706;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(217, 119, 6, 0.25);
    }

    .modal-btn--warning:hover {
      background: #b45309;
    }

    .modal-btn--primary {
      background: #2563eb;
      border: 1px solid #2563eb;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    }

    .modal-btn--primary:hover {
      background: #1d4ed8;
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

    @keyframes modalSpin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (max-width: 480px) {
      .modal-card {
        padding: 20px 16px;
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
export class ReasonModalComponent {
  isOpen = input<boolean>(false);
  title = input<string>('');
  message = input<string>('');
  reasonLabel = input<string>('Reason');
  placeholder = input<string>('Enter reason...');
  required = input<boolean>(true);
  maxLength = input<number>(2000);
  confirmText = input<string>('Submit');
  cancelText = input<string>('Cancel');
  requiredMessage = input<string>('Reason is required');
  variant = input<'primary' | 'danger' | 'warning'>('danger');
  isLoading = input<boolean>(false);
  errorMessage = input<string | null>(null);

  confirmed = output<string>();
  cancelled = output<void>();

  reasonValue = signal('');
  touched = signal(false);

  constructor() {
    // Clear the draft reason whenever the dialog closes so the next
    // opening starts empty, while preserving typed text across a
    // failed submission that keeps the dialog open.
    effect(() => {
      if (!this.isOpen()) {
        this.reasonValue.set('');
        this.touched.set(false);
      }
    });
  }

  get showValidationError(): boolean {
    return this.required() && this.touched() && !this.reasonValue().trim();
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.isLoading()) {
      return;
    }
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onCancel();
    }
  }

  onEnter(event: KeyboardEvent): void {
    if (this.isLoading()) {
      return;
    }
    if (!event.shiftKey && this.reasonValue().trim()) {
      event.preventDefault();
      this.onConfirm();
    }
  }

  onConfirm(): void {
    if (this.isLoading()) {
      return;
    }
    this.touched.set(true);
    const reason = this.reasonValue().trim();
    if (this.required() && !reason) return;
    this.confirmed.emit(reason);
  }

  onCancel(): void {
    if (this.isLoading()) {
      return;
    }
    this.reasonValue.set('');
    this.touched.set(false);
    this.cancelled.emit();
  }
}
