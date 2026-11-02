import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  afterRenderEffect,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { timeout } from "rxjs";

import { ToastService } from "../../../core/services/toast.service";
import { environment } from "../../../../environments/environment";

/**
 * Change-password dialog rendered over the current page.
 *
 * Shares the application modal overlay system with ConfirmModalComponent
 * (fixed full-viewport dark + blur backdrop, card above topbar/sidebar/
 * chatbot, body scroll lock). Reuses the existing POST
 * /auth/change-password endpoint, validation rules and error mapping
 * from ChangePasswordComponent — no backend changes.
 */
@Component({
  selector: "app-change-password-modal",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen()) {
      <div class="cp-overlay" (click)="onBackdropClick($event)">
        <div
          class="cp-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cp-title"
          (click)="$event.stopPropagation()"
        >
          <button
            type="button"
            class="cp-close"
            aria-label="Close change password dialog"
            [disabled]="changing()"
            (click)="onClose()"
          >
            <span class="material-icons" aria-hidden="true">close</span>
          </button>

          <div class="cp-icon" aria-hidden="true">
            <span class="material-icons">lock</span>
          </div>

          <h2 class="cp-title" id="cp-title">Change your password</h2>
          <p class="cp-subtitle">
            Enter your current password and choose a new password.
          </p>

          @if (errorMessage()) {
            <div class="cp-error" role="alert">
              <span class="material-icons" aria-hidden="true"
                >error_outline</span
              >
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <form (ngSubmit)="onSubmit()" autocomplete="off">
            <div class="cp-field">
              <label for="cp-current">Current Password</label>
              <div class="cp-input">
                <span class="material-icons cp-input-icon" aria-hidden="true"
                  >lock</span
                >
                <input
                  #currentInput
                  id="cp-current"
                  [type]="showCurrent() ? 'text' : 'password'"
                  placeholder="Enter current password"
                  [(ngModel)]="currentPassword"
                  name="currentPassword"
                  autocomplete="current-password"
                />
                <button
                  type="button"
                  class="cp-eye"
                  [attr.aria-label]="
                    showCurrent() ? 'Hide password' : 'Show password'
                  "
                  (click)="showCurrent.set(!showCurrent())"
                >
                  <span class="material-icons" aria-hidden="true">{{
                    showCurrent() ? "visibility_off" : "visibility"
                  }}</span>
                </button>
              </div>
            </div>

            <div class="cp-field">
              <label for="cp-new">New Password</label>
              <div class="cp-input">
                <span class="material-icons cp-input-icon" aria-hidden="true"
                  >lock</span
                >
                <input
                  id="cp-new"
                  [type]="showNew() ? 'text' : 'password'"
                  placeholder="Enter new password"
                  [(ngModel)]="newPassword"
                  name="newPassword"
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="cp-eye"
                  [attr.aria-label]="
                    showNew() ? 'Hide password' : 'Show password'
                  "
                  (click)="showNew.set(!showNew())"
                >
                  <span class="material-icons" aria-hidden="true">{{
                    showNew() ? "visibility_off" : "visibility"
                  }}</span>
                </button>
              </div>
              <p class="cp-hint">
                Password must contain at least 8 characters.
              </p>
            </div>

            <div class="cp-field">
              <label for="cp-confirm">Confirm New Password</label>
              <div class="cp-input">
                <span class="material-icons cp-input-icon" aria-hidden="true"
                  >lock</span
                >
                <input
                  id="cp-confirm"
                  [type]="showConfirm() ? 'text' : 'password'"
                  placeholder="Confirm new password"
                  [(ngModel)]="confirmPassword"
                  name="confirmPassword"
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="cp-eye"
                  [attr.aria-label]="
                    showConfirm() ? 'Hide password' : 'Show password'
                  "
                  (click)="showConfirm.set(!showConfirm())"
                >
                  <span class="material-icons" aria-hidden="true">{{
                    showConfirm() ? "visibility_off" : "visibility"
                  }}</span>
                </button>
              </div>
            </div>

            <div class="cp-actions">
              <button
                type="button"
                class="cp-btn cp-btn--cancel"
                [disabled]="changing()"
                (click)="onClose()"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="cp-btn cp-btn--primary"
                [disabled]="changing()"
              >
                @if (changing()) {
                  <span class="cp-spinner" aria-hidden="true"></span>
                  <span>Changing Password...</span>
                } @else {
                  <span>Change Password</span>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .cp-overlay {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(5, 15, 35, 0.65);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 16px;
        box-sizing: border-box;
      }

      .cp-card {
        position: relative;
        width: min(560px, 100%);
        max-height: calc(100vh - 32px);
        overflow-y: auto;
        background: #ffffff;
        border-radius: 18px;
        box-shadow:
          0 24px 48px -12px rgba(0, 0, 0, 0.35),
          0 0 0 1px rgba(0, 0, 0, 0.05);
        padding: 30px 30px 26px;
        text-align: center;
        box-sizing: border-box;
        animation: cpScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .cp-close {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 50%;
        background: #f1f5f9;
        color: #64748b;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .cp-close:hover:not(:disabled) {
        background: #e2e8f0;
        color: #0f172a;
      }

      .cp-close:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      .cp-close .material-icons {
        font-size: 20px;
      }

      .cp-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 14px;
        border-radius: 50%;
        background: #eff6ff;
        border: 1px solid #dbeafe;
        color: #2563eb;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .cp-icon .material-icons {
        font-size: 28px;
      }

      .cp-title {
        margin: 0;
        font-size: 21px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.01em;
      }

      .cp-subtitle {
        margin: 8px 0 18px;
        font-size: 13px;
        line-height: 1.55;
        color: #475569;
      }

      .cp-error {
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
        margin: 0 0 16px;
        word-break: break-word;
      }

      .cp-error .material-icons {
        font-size: 18px;
        color: #dc2626;
        flex-shrink: 0;
      }

      .cp-field {
        text-align: left;
        margin-bottom: 14px;
      }

      .cp-field label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 6px;
      }

      .cp-input {
        position: relative;
        display: flex;
        align-items: center;
      }

      .cp-input-icon {
        position: absolute;
        left: 12px;
        color: #94a3b8;
        font-size: 20px;
        pointer-events: none;
      }

      .cp-input input {
        width: 100%;
        height: 44px;
        padding: 0 44px 0 40px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        font-family: inherit;
        font-size: 13px;
        color: #0f172a;
        box-sizing: border-box;
      }

      .cp-input input:focus {
        outline: 2px solid #2563eb;
        outline-offset: 0;
        border-color: #2563eb;
      }

      .cp-eye {
        position: absolute;
        right: 6px;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .cp-eye:hover {
        background: #f1f5f9;
        color: #0f172a;
      }

      .cp-eye .material-icons {
        font-size: 20px;
      }

      .cp-hint {
        margin: 6px 0 0;
        font-size: 12px;
        color: #64748b;
      }

      .cp-actions {
        display: flex;
        gap: 12px;
        margin-top: 20px;
      }

      .cp-btn {
        flex: 1;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 10px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background 0.15s ease;
        box-sizing: border-box;
      }

      .cp-btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }

      .cp-btn:focus-visible,
      .cp-close:focus-visible,
      .cp-eye:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }

      .cp-btn--cancel {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #475569;
      }

      .cp-btn--cancel:hover:not(:disabled) {
        background: #f8fafc;
        color: #1e293b;
      }

      .cp-btn--primary {
        background: #2563eb;
        border: 1px solid #2563eb;
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
      }

      .cp-btn--primary:hover:not(:disabled) {
        background: #1d4ed8;
        border-color: #1d4ed8;
      }

      .cp-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: cpSpin 0.7s linear infinite;
        flex-shrink: 0;
      }

      @keyframes cpScaleIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes cpSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 480px) {
        .cp-card {
          width: calc(100% - 32px);
          padding: 24px 18px 20px;
        }
        .cp-actions {
          flex-direction: column-reverse;
        }
        .cp-btn {
          width: 100%;
        }
      }
    `,
  ],
})
export class ChangePasswordModalComponent implements OnDestroy {
  isOpen = input.required<boolean>();

  closed = output<void>();
  passwordChanged = output<string>();

  private readonly http: HttpClient;
  private readonly toast: ToastService;
  private readonly currentInput =
    viewChild<ElementRef<HTMLInputElement>>("currentInput");

  private readonly apiUrl = `${environment.apiUrl}/auth`;

  currentPassword = "";
  newPassword = "";
  confirmPassword = "";

  showCurrent = signal(false);
  showNew = signal(false);
  showConfirm = signal(false);
  changing = signal(false);
  errorMessage = signal<string | null>(null);

  constructor() {
    this.http = inject(HttpClient);
    this.toast = inject(ToastService);

    effect(() => {
      if (typeof document === "undefined") {
        return;
      }
      document.body.style.overflow = this.isOpen() ? "hidden" : "";
    });

    // Move focus into the dialog after it renders (no timers: the
    // render effect runs post-render by design).
    afterRenderEffect(() => {
      if (
        this.isOpen() &&
        typeof document !== "undefined" &&
        document.activeElement === document.body
      ) {
        this.currentInput()?.nativeElement.focus();
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.isOpen() && !this.changing()) {
      this.onClose();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.changing()) {
      return;
    }
    if ((event.target as HTMLElement).classList.contains("cp-overlay")) {
      this.onClose();
    }
  }

  onClose(): void {
    if (this.changing()) {
      return;
    }
    this.resetForm();
    this.closed.emit();
  }

  onSubmit(): void {
    this.errorMessage.set(null);

    if (!this.currentPassword) {
      this.errorMessage.set("Current password is required.");
      return;
    }
    if (!this.newPassword) {
      this.errorMessage.set("New password is required.");
      return;
    }
    if (!this.confirmPassword) {
      this.errorMessage.set("Confirm password is required.");
      return;
    }
    if (this.newPassword.length < 8) {
      this.errorMessage.set("Password must be at least 8 characters long.");
      return;
    }
    if (this.newPassword.length > 72) {
      this.errorMessage.set("Password must not exceed 72 characters.");
      return;
    }
    if (!this.isStrongPassword(this.newPassword)) {
      this.errorMessage.set(
        "Password must contain at least 3 of: uppercase, lowercase, number, or special character.",
      );
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage.set("Passwords do not match.");
      return;
    }
    if (this.currentPassword === this.newPassword) {
      this.errorMessage.set(
        "New password must be different from current password.",
      );
      return;
    }
    if (this.changing()) {
      return;
    }

    this.changing.set(true);

    this.http
      .post<{ message: string }>(`${this.apiUrl}/change-password`, {
        current_password: this.currentPassword,
        new_password: this.newPassword,
        confirm_password: this.confirmPassword,
      })
      .pipe(timeout(30_000))
      .subscribe({
        next: (response) => {
          const message = response?.message || "Password changed successfully.";
          this.changing.set(false);
          this.toast.success("Password changed", message);
          this.resetForm();
          this.passwordChanged.emit(message);
          this.closed.emit();
        },
        error: (error: HttpErrorResponse) => {
          this.changing.set(false);
          this.errorMessage.set(this.toErrorMessage(error));
        },
      });
  }

  private resetForm(): void {
    this.currentPassword = "";
    this.newPassword = "";
    this.confirmPassword = "";
    this.showCurrent.set(false);
    this.showNew.set(false);
    this.showConfirm.set(false);
    this.errorMessage.set(null);
  }

  private isStrongPassword(password: string): boolean {
    if (password.length < 8 || password.length > 72) {
      return false;
    }
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    return (
      [hasLowercase, hasUppercase, hasNumber, hasSpecial].filter(Boolean)
        .length >= 3
    );
  }

  private toErrorMessage(error: HttpErrorResponse): string {
    const errorName = (error as unknown as { name?: string })?.name;
    if (errorName === "TimeoutError" || error?.status === 0) {
      return "Cannot reach the server. Please check your connection and try again.";
    }
    const detail = error?.error?.detail;
    if (error?.status === 422) {
      if (Array.isArray(detail)) {
        const messages = detail
          .map((item: { msg?: string }) => item?.msg)
          .filter(Boolean);
        return messages.length
          ? messages.join(". ")
          : "Please check all password fields.";
      }
      if (typeof detail === "string") {
        return detail;
      }
      return "Please check all password fields.";
    }
    if (typeof detail === "string" && detail) {
      return detail;
    }
    switch (error?.status) {
      case 400:
        return "Unable to change password.";
      case 401:
        return "Current password is incorrect.";
      case 403:
        return "You are not authorized to change the password.";
      default:
        return error?.status !== undefined && error.status >= 500
          ? "Server error. Please try again."
          : "Unable to change password.";
    }
  }
}
