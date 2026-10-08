import { Injectable } from '@angular/core';

/**
 * Reference-counted body scroll lock for viewport-level modals.
 *
 * Opening a modal calls `lock()`; closing calls `unlock()`. Nested or
 * overlapping modals are safe: scrolling resumes only after the last
 * holder releases. Also guards against a component being destroyed
 * while its modal is open.
 */
@Injectable({
  providedIn: 'root',
})
export class BodyScrollLockService {
  private holders = 0;

  lock(): void {
    this.holders += 1;
    if (typeof document !== 'undefined') {
      document.body.classList.add('modal-open');
    }
  }

  unlock(): void {
    if (this.holders > 0) {
      this.holders -= 1;
    }
    if (this.holders === 0 && typeof document !== 'undefined') {
      document.body.classList.remove('modal-open');
    }
  }
}
