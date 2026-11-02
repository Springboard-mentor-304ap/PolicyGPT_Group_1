import { Injectable, signal, computed } from '@angular/core';

import {
  QuotedTextSegment,
  splitQuotedSegments,
} from '../utils/quoted-text.util';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * Structured text for safe bold rendering of record names.
 * `segments` renders the full sentence with every `"Name"` shown
 * bold and quoteless; plain text yields a single non-bold segment.
 */
export interface ToastTextParts {
  segments: QuotedTextSegment[];
}

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  /** Structured title parts (record name extracted, quotes removed). */
  titleParts: ToastTextParts;
  /** Structured message parts, when a message exists. */
  messageParts?: ToastTextParts;
  duration?: number;
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 5000,
  error: 6000,
};

const MAX_VISIBLE_TOASTS = 3;
const DEDUP_WINDOW_MS = 1500;

/**
 * Splits the double-quoted record name(s) out of a toast text so the
 * shared component can render every name bold without quotation
 * marks. Plain strings without a quoted name pass through as a single
 * plain segment, so existing generic notifications keep working.
 * Only double quotes are treated as name delimiters — apostrophes in
 * normal prose are never affected.
 */
export function splitToastName(text: string): ToastTextParts {
  return { segments: splitQuotedSegments(text) };
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private visibleToastsSignal = signal<Toast[]>([]);
  private queue: Toast[] = [];
  private idCounter = 0;
  private recentToasts = new Map<string, number>();
  private timeouts = new Map<number, ReturnType<typeof setTimeout>>();

  toasts = computed(() => this.visibleToastsSignal());

  show(type: ToastType, title: string, message?: string, duration?: number): void {
    const normTitle = (title || '').trim();
    let normMessage = (message || '').trim();

    // If message is identical to title, don't duplicate text in the toast
    if (normTitle && normMessage && normTitle.toLowerCase() === normMessage.toLowerCase()) {
      normMessage = '';
    }

    const dedupKey = `${type}:${normTitle.toLowerCase()}:${normMessage.toLowerCase()}`;
    const now = Date.now();
    const lastShown = this.recentToasts.get(dedupKey);

    // Prevent duplicate notifications triggered in rapid succession (<1500ms)
    if (lastShown && now - lastShown < DEDUP_WINDOW_MS) {
      return;
    }

    // Also avoid adding if an identical notification is currently active or queued
    const isAlreadyActive =
      this.visibleToastsSignal().some(
        t =>
          t.type === type &&
          t.title.trim().toLowerCase() === normTitle.toLowerCase() &&
          (t.message || '').trim().toLowerCase() === normMessage.toLowerCase()
      ) ||
      this.queue.some(
        t =>
          t.type === type &&
          t.title.trim().toLowerCase() === normTitle.toLowerCase() &&
          (t.message || '').trim().toLowerCase() === normMessage.toLowerCase()
      );

    if (isAlreadyActive && (!lastShown || now - lastShown < 3000)) {
      return;
    }

    this.recentToasts.set(dedupKey, now);

    const effectiveDuration = duration !== undefined ? duration : DEFAULT_DURATIONS[type];
    const id = ++this.idCounter;
    const toast: Toast = {
      id,
      type,
      title: normTitle,
      message: normMessage || undefined,
      titleParts: splitToastName(normTitle),
      duration: effectiveDuration,
    };
    if (normMessage) {
      toast.messageParts = splitToastName(normMessage);
    }

    if (this.visibleToastsSignal().length < MAX_VISIBLE_TOASTS) {
      this.visibleToastsSignal.update(list => [...list, toast]);
      this.scheduleDismissal(toast);
    } else {
      this.queue.push(toast);
    }
  }

  success(title: string, message?: string, duration = 4000): void {
    this.show('success', title, message, duration);
  }

  error(title: string, message?: string, duration = 6000): void {
    this.show('error', title, message, duration);
  }

  warning(title: string, message?: string, duration = 5000): void {
    this.show('warning', title, message, duration);
  }

  info(title: string, message?: string, duration = 4000): void {
    this.show('info', title, message, duration);
  }

  remove(id: number): void {
    const timer = this.timeouts.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(id);
    }

    const wasVisible = this.visibleToastsSignal().some(t => t.id === id);
    if (wasVisible) {
      this.visibleToastsSignal.update(list => list.filter(t => t.id !== id));
      this.promoteFromQueue();
    } else {
      this.queue = this.queue.filter(t => t.id !== id);
    }
  }

  clear(): void {
    this.timeouts.forEach(t => clearTimeout(t));
    this.timeouts.clear();
    this.recentToasts.clear();
    this.queue = [];
    this.visibleToastsSignal.set([]);
  }

  private scheduleDismissal(toast: Toast): void {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        this.remove(toast.id);
      }, toast.duration);
      this.timeouts.set(toast.id, timer);
    }
  }

  private promoteFromQueue(): void {
    while (this.visibleToastsSignal().length < MAX_VISIBLE_TOASTS && this.queue.length > 0) {
      const nextToast = this.queue.shift()!;
      this.visibleToastsSignal.update(list => [...list, nextToast]);
      this.scheduleDismissal(nextToast);
    }
  }
}