import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ToastService, Toast } from "../../../core/services/toast.service";

@Component({
  selector: "app-toast",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-card" [ngClass]="'toast--' + toast.type" role="alert">
      <div class="toast-icon" [innerHTML]="icon"></div>
      <div class="toast-content">
        <p class="toast-title">{{ toast.title }}</p>
        @if (toast.message) {
          <p class="toast-message">{{ toast.message }}</p>
        }
      </div>
      <button
        class="toast-close"
        (click)="onDismiss()"
        aria-label="Dismiss notification"
      >
        <svg
          width="18"
          height="18"
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
        padding: 14px 16px;
        border-radius: 10px;
        box-shadow:
          0 10px 25px -5px rgba(0, 0, 0, 0.15),
          0 0 0 1px rgba(0, 0, 0, 0.05);
        border: 1px solid;
        background: #ffffff;
        animation: slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
        font-family: inherit;
      }
      .toast-icon {
        flex-shrink: 0;
        margin-top: 1px;
      }
      .toast-content {
        flex: 1;
        min-width: 0;
      }
      .toast-title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
      }
      .toast-message {
        margin: 4px 0 0;
        font-size: 13px;
        line-height: 1.45;
      }
      .toast-close {
        flex-shrink: 0;
        background: transparent;
        border: 0;
        padding: 2px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: inherit;
        opacity: 0.7;
        transition: opacity 0.15s ease;
      }
      .toast-close:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.05);
      }
      .toast--success {
        background: #f0fdf4;
        border-color: #bbf7d0;
        color: #166534;
      }
      .toast--error {
        background: #fef2f2;
        border-color: #fecaca;
        color: #991b1b;
      }
      .toast--warning {
        background: #fffbeb;
        border-color: #fde68a;
        color: #92400e;
      }
      .toast--info {
        background: #eff6ff;
        border-color: #bfdbfe;
        color: #1e40af;
      }
      @keyframes slide-in {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `,
  ],
})
export class ToastComponent {
  @Input({ required: true }) toast!: Toast;
  @Output() dismiss = new EventEmitter<number>();

  get toastClass(): string {
    switch (this.toast.type) {
      case "success":
        return "bg-green-50 border-green-200";
      case "error":
        return "bg-red-50 border-red-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      case "info":
        return "bg-blue-50 border-blue-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  }

  get textClass(): string {
    switch (this.toast.type) {
      case "success":
        return "text-green-800";
      case "error":
        return "text-red-800";
      case "warning":
        return "text-yellow-800";
      case "info":
        return "text-blue-800";
      default:
        return "text-gray-800";
    }
  }

  get messageClass(): string {
    switch (this.toast.type) {
      case "success":
        return "text-green-700";
      case "error":
        return "text-red-700";
      case "warning":
        return "text-yellow-700";
      case "info":
        return "text-blue-700";
      default:
        return "text-gray-700";
    }
  }

  get closeClass(): string {
    switch (this.toast.type) {
      case "success":
        return "text-green-600 hover:text-green-800";
      case "error":
        return "text-red-600 hover:text-red-800";
      case "warning":
        return "text-yellow-600 hover:text-yellow-800";
      case "info":
        return "text-blue-600 hover:text-blue-800";
      default:
        return "text-gray-600 hover:text-gray-800";
    }
  }

  get icon(): string {
    switch (this.toast.type) {
      case "success":
        return `<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>`;
      case "error":
        return `<svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>`;
      case "warning":
        return `<svg class="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`;
      case "info":
        return `<svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>`;
      default:
        return `<svg class="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>`;
    }
  }

  onDismiss(): void {
    this.dismiss.emit(this.toast.id);
  }
}
