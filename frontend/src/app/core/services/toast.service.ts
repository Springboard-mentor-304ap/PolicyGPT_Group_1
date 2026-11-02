import { Injectable, signal, computed } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSignal = signal<Toast[]>([]);
  private idCounter = 0;

  toasts = computed(() => this.toastsSignal());

  show(type: ToastType, title: string, message?: string, duration = 5000): void {
    const id = ++this.idCounter;
    const toast: Toast = { id, type, title, message, duration };
    
    this.toastsSignal.update(toasts => [...toasts, toast]);

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
  }

  success(title: string, message?: string, duration = 5000): void {
    this.show('success', title, message, duration);
  }

  error(title: string, message?: string, duration = 7000): void {
    this.show('error', title, message, duration);
  }

  warning(title: string, message?: string, duration = 6000): void {
    this.show('warning', title, message, duration);
  }

  info(title: string, message?: string, duration = 5000): void {
    this.show('info', title, message, duration);
  }

  remove(id: number): void {
    this.toastsSignal.update(toasts => toasts.filter(t => t.id !== id));
  }

  clear(): void {
    this.toastsSignal.set([]);
  }
}