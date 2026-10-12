import {
  AfterViewChecked,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { AuditLogService } from '../../../core/services/audit-log.service';
import type { AuditLog } from '../../../core/models/audit-log.model';

/* =========================================================
   WORKFLOW TIMELINE
   Shared chronological audit trail for policy/scheme details.
   Fetches real backend events (actor names/roles inlined),
   with loading / empty / error+retry states and basic paging.
   Emits loaded events so host pages can derive identity
   metadata (Last Modified By, requester names) without
   extra lookups.
   ========================================================= */

@Component({
  selector: 'app-workflow-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workflow-timeline.component.html',
  styleUrls: ['./workflow-timeline.component.scss'],
})
export class WorkflowTimelineComponent implements OnInit, OnChanges, AfterViewChecked, OnDestroy {
  @Input() entityType: 'POLICY' | 'SCHEME' = 'POLICY';
  @Input() entityId: number | null = null;
  /** Bump to reload page 1 (hosts bump after workflow actions). */
  @Input() refreshToken: number | null = null;

  @Output() timelineLoaded = new EventEmitter<AuditLog[]>();

  private readonly auditLogService = inject(AuditLogService);
  private readonly host = inject(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);

  events: AuditLog[] = [];
  total = 0;
  page = 1;
  pages = 0;
  readonly pageSize = 20;

  loading = false;
  errorMessage = '';

  private loadSub: Subscription | null = null;

  /* =========================================================
     SCROLL-TRIGGERED REVEAL
     Monotonic count of visible events (never decreases, so
     scrolling back up never hides or replays anything).
     ========================================================= */

  revealed = 0;

  private observer: IntersectionObserver | null = null;
  private needsObserve = false;

  /** 0-100 progress for the foreground connecting line. */
  get progressPct(): number {
    if (!this.events.length) return 0;
    return Math.min(100, (this.revealed / this.events.length) * 100);
  }

  private prefersReducedMotion(): boolean {
    try {
      return (
        typeof matchMedia !== 'undefined' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch {
      return false;
    }
  }

  private supportsObserver(): boolean {
    return typeof IntersectionObserver !== 'undefined';
  }

  ngAfterViewChecked(): void {
    // Runs after every render; the flag keeps it to one observation
    // pass per data change (no timers, no per-frame work).
    if (!this.needsObserve) return;
    this.needsObserve = false;
    this.observeItems();
  }

  private observeItems(): void {
    this.disconnectObserver();

    const items: NodeListOf<HTMLElement> =
      this.host.nativeElement.querySelectorAll('.tl-list .tl-item');

    // No observer (old browsers, SSR, jsdom specs) or reduced motion:
    // everything is visible immediately, no animation.
    if (!this.supportsObserver() || this.prefersReducedMotion() || !items.length) {
      if (this.revealed !== this.events.length) {
        this.revealed = this.events.length;
        this.cdr.detectChanges();
      }
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => this.onIntersect(entries),
      { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.15 },
    );
    items.forEach((item) => this.observer?.observe(item));
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    let high = this.revealed;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const index = Number(
        (entry.target as HTMLElement).dataset['index'],
      );
      if (Number.isFinite(index)) high = Math.max(high, index + 1);
    }
    high = Math.min(high, this.events.length);
    if (high !== this.revealed) {
      this.revealed = high;
      this.cdr.detectChanges();
    }
  }

  private disconnectObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Reset reveal state for fresh data and re-observe after render. */
  private resetReveal(): void {
    this.disconnectObserver();
    this.revealed = 0;
    this.needsObserve = true;
  }

  ngOnInit(): void {
    this.load(1);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const refresh = changes['refreshToken'];
    if (refresh && !refresh.isFirstChange()) {
      this.load(1);
      return;
    }
    const idChange = changes['entityId'];
    const typeChange = changes['entityType'];
    if (
      (idChange && !idChange.isFirstChange()) ||
      (typeChange && !typeChange.isFirstChange())
    ) {
      this.load(1);
    }
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.disconnectObserver();
  }

  load(page: number): void {
    if (!this.entityId || this.entityId <= 0) {
      this.events = [];
      this.total = 0;
      this.pages = 0;
      this.resetReveal();
      return;
    }
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.errorMessage = '';
    this.loadSub = this.auditLogService
      .getEntityTimeline(this.entityType, this.entityId, page, this.pageSize)
      .subscribe({
        next: (res) => {
          this.events = Array.isArray(res?.events) ? res.events : [];
          this.total = Number(res?.total) || 0;
          this.page = Math.max(1, Number(res?.page) || page);
          this.pages = Math.max(0, Number(res?.pages) || 0);
          this.loading = false;
          this.resetReveal();
          if (!this.supportsObserver() || this.prefersReducedMotion()) {
            // No scroll animation possible: show everything now so
            // the list is never stuck invisible.
            this.revealed = this.events.length;
          }
          this.timelineLoaded.emit(this.events);
        },
        error: (err) => {
          this.loading = false;
          this.events = [];
          this.total = 0;
          this.pages = 0;
          this.resetReveal();
          this.errorMessage = this.describeError(err);
        },
      });
  }

  retry(): void {
    this.load(this.page);
  }

  previousPage(): void {
    if (this.page > 1) this.load(this.page - 1);
  }

  nextPage(): void {
    if (this.page < this.pages) this.load(this.page + 1);
  }

  actorName(event: AuditLog): string {
    const name = String(event?.user_name ?? '').trim();
    return name || 'Unknown User';
  }

  actorRole(event: AuditLog): string {
    const role = String(event?.user_role ?? '').trim();
    if (!role) return '';
    return role
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  eventTitle(event: AuditLog): string {
    return String(event?.action_label || event?.action || 'Event').trim();
  }

  iconFor(action: string | null | undefined): string {
    const a = String(action || '').toUpperCase();
    if (a.includes('PERMANENTLY_DELETED') || a.includes('DELETE_APPROVED'))
      return 'delete_forever';
    if (a.includes('DELETE_REQUESTED') || a.includes('DELETED'))
      return 'delete_outline';
    if (a.includes('ARCHIVE_REQUESTED') || a.includes('ARCHIVED'))
      return 'archive';
    if (a.includes('ARCHIVE_APPROVED') || a.includes('APPROVED') || a === 'APPROVAL_EVENT')
      return 'check_circle';
    if (a.includes('ARCHIVE_REJECTED') || a.includes('REJECTED') || a === 'REJECTION_EVENT')
      return 'cancel';
    if (a.includes('RESTORED')) return 'restore';
    if (a.includes('SUBMITTED')) return 'send';
    if (a.includes('DRAFT_SAVED')) return 'save';
    if (a.includes('CREATED')) return 'add_circle';
    if (a.includes('UPDATED')) return 'edit';
    if (a.includes('DOCUMENT')) return 'upload_file';
    return 'notifications';
  }

  statusLabel(status: string | null | undefined): string {
    return String(status || '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  statusClass(status: string | null | undefined): string {
    const s = String(status || '').trim().toLowerCase();
    return s ? `status-${s}` : '';
  }

  /** Readable local date + time; full ISO on hover via title attr. */
  formatDateTime(value: string | null | undefined): string {
    if (!value) return 'Not specified';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  trackByAuditId(_index: number, event: AuditLog): number {
    return Number(event?.audit_id);
  }

  private describeError(error: unknown): string {
    const err = error as { status?: number; error?: { detail?: string } };
    if (typeof err?.error?.detail === 'string') return err.error.detail;
    if (err?.status === 401) return 'Your session has expired. Please sign in again.';
    if (err?.status === 403)
      return 'You do not have permission to view this timeline.';
    if (err?.status === 404) return 'Record not found.';
    if (err?.status === 0)
      return 'Unable to reach the server. Check your connection and retry.';
    return 'Unable to load the workflow timeline. Please retry.';
  }
}
