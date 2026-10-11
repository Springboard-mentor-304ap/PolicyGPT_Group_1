import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Toast, ToastTextParts } from "../../../core/services/toast.service";

@Component({
  selector: "app-toast",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-card" [ngClass]="'toast--' + toast.type" role="alert">
      <div class="toast-content">
        <p class="toast-title">@for (seg of titleParts().segments; track $index) {@if (seg.bold) {<strong class="toast-name">{{ seg.text }}</strong>} @else {<span>{{ seg.text }}</span>}}</p>
        @if (messageParts()) {
          <p class="toast-message">@for (seg of messageParts()!.segments; track $index) {@if (seg.bold) {<strong class="toast-name">{{ seg.text }}</strong>} @else {<span>{{ seg.text }}</span>}}</p>
        }
      </div>
      <button
        class="toast-close"
        (click)="onDismiss()"
        aria-label="Dismiss notification"
      >
        <svg
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          ></path>
        </svg>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .toast-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        width: 100%;
        max-width: 100%;
        padding: 14px 16px;
        border-radius: 12px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-left: 4px solid;
        box-shadow:
          0 10px 25px -5px rgba(0, 0, 0, 0.1),
          0 4px 6px -2px rgba(0, 0, 0, 0.05);
        box-sizing: border-box;
        font-family: inherit;
        animation: toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      .toast-card--leaving {
        opacity: 0;
        transform: translateX(24px);
      }
      .toast-content {
        flex: 1;
        min-width: 0;
      }
      .toast-title {
        margin: 0;
        font-size: 13.5px;
        font-weight: 400;
        line-height: 1.4;
        color: #0f172a;
        word-break: break-word;
      }
      .toast-name {
        font-weight: 700;
        color: inherit;
      }
      .toast-message {
        margin: 3px 0 0;
        font-size: 13px;
        font-weight: 400;
        line-height: 1.45;
        color: #475569;
        word-break: break-word;
      }
      .toast-close {
        flex-shrink: 0;
        background: transparent;
        border: 0;
        padding: 3px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #94a3b8;
        transition: color 0.15s ease, background-color 0.15s ease;
        margin-top: 1px;
      }
      .toast-close:hover {
        color: #0f172a;
        background: #f1f5f9;
      }
      .toast-close:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 1px;
      }
      /* Single blue left accent for every notification type. */
      .toast--success,
      .toast--error,
      .toast--warning,
      .toast--info {
        border-left-color: #2563eb;
      }
      @keyframes toastSlideIn {
        from {
          opacity: 0;
          transform: translateX(24px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .toast-card {
          animation: none;
          transition: none;
        }
      }
    `,
  ],
})
export class ToastComponent {
  @Input({ required: true }) toast!: Toast;
  @Output() dismiss = new EventEmitter<number>();

  onDismiss(): void {
    this.dismiss.emit(this.toast.id);
  }

  /**
   * Structured title parts for safe bold-name rendering (text
   * interpolation only, never innerHTML). Falls back to the raw title
   * when parts are absent (e.g. hand-built toast objects in tests).
   */
  titleParts(): ToastTextParts {
    return (
      this.toast.titleParts ?? {
        segments: [{ text: this.toast.title, bold: false }],
      }
    );
  }

  /** Structured message parts, or null when there is no message. */
  messageParts(): ToastTextParts | null {
    if (!this.toast.message && !this.toast.messageParts) {
      return null;
    }
    return (
      this.toast.messageParts ?? {
        segments: [{ text: this.toast.message ?? "", bold: false }],
      }
    );
  }
}
