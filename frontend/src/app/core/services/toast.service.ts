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
  private recentToasts = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 1500;

  toasts = computed(() => this.toastsSignal());

  show(type: ToastType, title: string, message?: string, duration = 5000): void {
    const normTitle = (title || '').trim();
    const normMessage = (message || '').trim();
    const dedupKey = `${type}:${normTitle.toLowerCase()}:${normMessage.toLowerCase()}`;
    const now = Date.now();
    const lastShown = this.recentToasts.get(dedupKey);

    // Prevent duplicate notifications triggered in rapid succession
    if (lastShown && now - lastShown < this.DEDUP_WINDOW_MS) {
      return;
    }

    // Also avoid adding if an identical notification is currently active in the visible list
    const isAlreadyActive = this.toastsSignal().some(
      t =>
        t.type === type &&
        t.title.trim().toLowerCase() === normTitle.toLowerCase() &&
        (t.message || '').trim().toLowerCase() === normMessage.toLowerCase()
    );
    if (isAlreadyActive && (!lastShown || now - lastShown < 3000)) {
      return;
    }

    this.recentToasts.set(dedupKey, now);

    const id = ++this.idCounter;
    const toast: Toast = { id, type, title: normTitle, message: normMessage || undefined, duration };

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
    this.recentToasts.clear();
    this.toastsSignal.set([]);
  }
}