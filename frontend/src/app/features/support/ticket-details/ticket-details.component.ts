import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Observable,
  Subject,
  distinctUntilChanged,
  finalize,
  map,
  takeUntil,
} from 'rxjs';
import { timeout } from 'rxjs/operators';

import { SupportService } from '../../../core/services/support.service';
import { SupportRequest } from '../../../core/models/support.model';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../shared/components/breadcrumb/breadcrumb.component';
import { TicketConversationComponent } from '../../../shared/components/ticket-conversation/ticket-conversation.component';

/**
 * Authenticated user's ticket details page.
 *
 * Shared across citizen / government / researcher / organization (role is
 * derived from the URL, mirroring ProfileComponent). The ticket is loaded
 * by its numeric query id from the `:ticketId` route parameter using the
 * existing support API; ownership is enforced server-side. Replying to a
 * RESOLVED/CLOSED ticket reopens it (backend rule).
 */
@Component({
  selector: 'app-ticket-details',
  standalone: true,
  imports: [CommonModule, RouterLink, BreadcrumbComponent, TicketConversationComponent],
  template: `
    <div class="ticket-page">
      <app-breadcrumb *ngIf="breadcrumbItems.length > 0" [items]="breadcrumbItems"></app-breadcrumb>

      <header class="ticket-header">
        <div>
          <p class="ticket-eyebrow">Support Ticket</p>
          <h1>Ticket Details</h1>
          <p class="ticket-sub">View and track the details of your support request.</p>
        </div>
        <button type="button" class="back-btn" (click)="goBack()">
          <span class="material-icons" aria-hidden="true">arrow_back</span>
          <span>Back</span>
        </button>
      </header>

      @if (loading) {
        <div class="ticket-state" aria-busy="true">
          <span class="ticket-spinner" aria-hidden="true"></span>
          <span>Loading ticket...</span>
        </div>
      } @else if (notFound) {
        <div class="ticket-state ticket-state--empty" role="alert">
          <span class="material-icons" aria-hidden="true">search_off</span>
          <div class="ticket-state-text">
            <strong>Support Request Not Found</strong>
            <span>The support request could not be found or may have been removed.</span>
          </div>
          <button type="button" class="ticket-retry" (click)="goBack()">Back to My Support Requests</button>
        </div>
      } @else if (errorMessage) {
        <div class="ticket-state ticket-state--error" role="alert">
          <span class="material-icons" aria-hidden="true">error_outline</span>
          <div class="ticket-state-text">
            <strong>Unable to load this support request.</strong>
            <span>{{ errorMessage }}</span>
          </div>
          <div class="ticket-state-actions">
            <button type="button" class="ticket-retry" (click)="load()">Retry</button>
            <button type="button" class="ticket-back" (click)="goBack()">Back</button>
          </div>
        </div>
      } @else if (ticket) {
        <section class="ticket-card" aria-label="Ticket information">
          <h2>Ticket Information</h2>
          <dl class="ticket-grid">
            <div>
              <dt>Ticket ID</dt>
              <dd>{{ ticket.request_id }}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{{ ticket.subject }}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span class="badge-status" [attr.data-status]="ticket.status">
                  {{ statusLabel(ticket.status) }}
                </span>
              </dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{{ ticket.category || 'General' }}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>
                <span class="badge-priority" [attr.data-priority]="ticket.priority">
                  {{ ticket.priority || 'MEDIUM' }}
                </span>
              </dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{{ ticket.created_at | date: 'mediumDate' }}</dd>
            </div>
          </dl>
        </section>

        <section class="ticket-card" aria-label="Description">
          <h2>Description</h2>
          <p class="ticket-desc">{{ ticket.description }}</p>
        </section>

        <section class="ticket-card" aria-label="Official response">
          <h2>Official Response</h2>
          @if (ticket.response) {
            <p class="ticket-desc">{{ ticket.response }}</p>
          } @else {
            <p class="ticket-empty-note">Your support response appears here once our team replies.</p>
          }
        </section>

        <section class="ticket-card" aria-label="Timeline">
          <h2>Timeline</h2>
          <dl class="ticket-timeline">
            <div>
              <dt>Submitted</dt>
              <dd>{{ ticket.created_at | date: 'medium' }}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{{ ticket.updated_at | date: 'medium' }}</dd>
            </div>
            <div>
              <dt>Resolved</dt>
              <dd>{{ ticket.resolved_at ? (ticket.resolved_at | date: 'medium') : '—' }}</dd>
            </div>
          </dl>
        </section>

        <section class="ticket-card" aria-label="Conversation">
          <h2>Conversation</h2>
          @if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
            <p class="ticket-reopen-hint">
              Replying below will reopen this ticket.
            </p>
          }
          <app-ticket-conversation
            [ticketId]="ticketId"
            mode="user"
            [canReply]="ticket.status !== 'CLOSED'"
            (replied)="onReplied()"
          ></app-ticket-conversation>
        </section>
      }
    </div>
  `,
  styles: [`
    .ticket-page {
      display: flex; flex-direction: column; gap: 16px;
      min-width: 0; width: 100%; box-sizing: border-box;
      min-height: 60vh;
    }
    .ticket-page > app-breadcrumb { display: block; margin-bottom: 18px; }
    .ticket-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 14px; flex-wrap: wrap;
    }
    .ticket-eyebrow {
      margin: 0 0 4px; font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em; color: #2457d6;
    }
    .ticket-header h1 {
      margin: 0; font-size: 22px; font-weight: 700; color: #111827;
      letter-spacing: -0.01em; overflow-wrap: anywhere;
    }
    .ticket-sub { margin: 4px 0 0; font-size: 13.5px; color: #64748b; }
    .back-btn {
      display: inline-flex; align-items: center; gap: 6px;
      border: 1px solid #dbe2eb; background: #fff; border-radius: 8px;
      padding: 0 14px; height: 38px; font: inherit; font-size: 13px; font-weight: 600;
      color: #334155; cursor: pointer; flex-shrink: 0;
    }
    .back-btn:hover { background: #f8fafc; }
    .back-btn .material-icons { font-size: 18px; }
    .back-btn:focus-visible, .ticket-retry:focus-visible, .ticket-back:focus-visible {
      outline: 2px solid #2457d6; outline-offset: 2px;
    }
    .ticket-card {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
      padding: 24px; min-width: 0; width: 100%; box-sizing: border-box;
    }
    .ticket-card h2 { margin: 0 0 14px; font-size: 16px; font-weight: 700; color: #111827; }
    .ticket-grid {
      margin: 0; display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px 24px;
    }
    .ticket-grid > div, .ticket-timeline > div { min-width: 0; }
    .ticket-grid dt, .ticket-timeline dt {
      font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 4px;
    }
    .ticket-grid dd, .ticket-timeline dd {
      margin: 0; font-size: 13.5px; font-weight: 600; color: #172033;
      overflow-wrap: anywhere;
    }
    .ticket-timeline {
      margin: 0; display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px 24px;
    }
    .badge-category, .badge-priority, .badge-status {
      font-size: 11.5px; font-weight: 700; border-radius: 6px; padding: 3px 9px;
      white-space: nowrap;
    }
    .badge-priority[data-priority='URGENT'] { background: #fee2e2; color: #b91c1c; }
    .badge-priority[data-priority='HIGH'] { background: #ffedd5; color: #c2410c; }
    .badge-priority[data-priority='MEDIUM'] { background: #e0f2fe; color: #075985; }
    .badge-priority[data-priority='LOW'] { background: #f1f5f9; color: #64748b; }
    .badge-status[data-status='OPEN'] { background: #dbeafe; color: #1d4ed8; }
    .badge-status[data-status='IN_PROGRESS'] { background: #fef3c7; color: #92400e; }
    .badge-status[data-status='WAITING_FOR_USER'] { background: #f3e8ff; color: #7e22ce; }
    .badge-status[data-status='RESOLVED'] { background: #dcfce7; color: #15803d; }
    .badge-status[data-status='CLOSED'] { background: #f1f5f9; color: #64748b; }
    .ticket-desc {
      margin: 0; font-size: 14px; line-height: 1.6; color: #1e293b;
      white-space: pre-line; overflow-wrap: anywhere;
    }
    .ticket-empty-note { margin: 0; font-size: 13.5px; color: #94a3b8; }
    .ticket-reopen-hint {
      margin: 0 0 12px;
      font-size: 12.5px;
      color: #7e22ce;
      font-weight: 600;
    }
    .ticket-state {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      flex: 1; padding: 48px 18px; background: #fff; border: 1px solid #e2e8f0;
      border-radius: 12px; color: #64748b; font-size: 14px; text-align: center;
      flex-wrap: wrap;
    }
    .ticket-state .material-icons { font-size: 22px; }
    .ticket-state--error { color: #b91c1c; }
    .ticket-state-text { display: flex; flex-direction: column; gap: 4px; }
    .ticket-state-text strong { color: #111827; }
    .ticket-state--error .ticket-state-text strong { color: #b91c1c; }
    .ticket-state-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .ticket-retry {
      border: 1px solid #2457d6; background: #2457d6; color: #fff;
      border-radius: 8px; padding: 8px 16px; font: inherit; font-size: 13px;
      font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .ticket-back {
      border: 1px solid #dbe2eb; background: #fff; color: #334155;
      border-radius: 8px; padding: 8px 16px; font: inherit; font-size: 13px;
      font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .ticket-back:hover { background: #f8fafc; }
    .ticket-spinner {
      width: 20px; height: 20px; border-radius: 50%;
      border: 2px solid rgba(36, 87, 214, 0.25); border-top-color: #2457d6;
      animation: ticket-spin 0.7s linear infinite;
      flex-shrink: 0;
    }
    @keyframes ticket-spin { to { transform: rotate(360deg); } }
    @media (max-width: 900px) {
      .ticket-grid, .ticket-timeline { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 640px) {
      .ticket-header h1 { font-size: 20px; }
      .ticket-card { padding: 16px; }
      .ticket-grid, .ticket-timeline { grid-template-columns: minmax(0, 1fr); }
    }
  `],
})
export class TicketDetailsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supportService = inject(SupportService);

  ticketId = 0;
  ticket: SupportRequest | null = null;
  loading = true;
  errorMessage: string | null = null;
  notFound = false;

  /** Safety bound so a hung request can never strand the spinner. */
  private static readonly LOAD_TIMEOUT_MS = 10_000;

  ngOnInit(): void {
    // Single controlled flow: one load per distinct route id.
    this.route.paramMap
      .pipe(
        map((params) => params.get('ticketId') ?? params.get('id')),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
      )
      .subscribe((raw) => {
        if (raw === null) {
          this.loading = false;
          this.notFound = true;
          return;
        }
        this.loadTicket(raw);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get breadcrumbItems(): BreadcrumbItem[] {
    const prefix = this.dashboardPrefix();
    const trail: BreadcrumbItem[] = [{ label: 'Home', route: ['/dashboard', prefix ?? 'citizen'] }];
    if (prefix) {
      trail.push({ label: 'Support', route: ['/dashboard', prefix, 'support'] });
    }
    trail.push({ label: this.ticket?.request_id ?? 'Ticket Details' });
    return trail;
  }

  private dashboardPrefix(): string | null {
    const url = this.router.url || '';
    if (url.startsWith('/dashboard/admin')) return 'admin';
    if (url.startsWith('/dashboard/citizen')) return 'citizen';
    if (url.startsWith('/dashboard/government')) return 'government';
    if (url.startsWith('/dashboard/researcher')) return 'researcher';
    if (url.startsWith('/dashboard/organization')) return 'organization';
    return null;
  }

  load(): void {
    this.loadTicket(this.ticketId);
  }

  /**
   * Load one ticket by route id using the existing support service
   * (same HttpClient / interceptor / JWT / base URL as the working
   * support-request list — no separate client, no invented endpoint).
   */
  loadTicket(rawId: string | number): void {
    const id = typeof rawId === 'number' ? rawId : Number(rawId);
    console.log('[Support Ticket] route id:', rawId);
    if (!Number.isFinite(id) || id <= 0) {
      this.loading = false;
      this.ticket = null;
      this.errorMessage = null;
      this.notFound = true;
      return;
    }
    this.ticketId = id;
    this.loading = true;
    this.errorMessage = null;
    this.notFound = false;
    this.ticket = null;

    let request$: Observable<SupportRequest>;
    try {
      console.log('[Support Ticket] Loading ticket:', id);
      // Existing service method — GET /support/requests/{id}, ticket
      // returned directly (verified against the backend contract).
      request$ = this.supportService.getSupportRequest(id);
    } catch {
      // A synchronous failure must never leave a stuck spinner.
      this.loading = false;
      this.errorMessage = 'Unable to load this support request.';
      return;
    }
    request$
      .pipe(
        timeout(TicketDetailsComponent.LOAD_TIMEOUT_MS),
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (response) => {
          console.log('[Support Ticket] API response:', response);
          // Shape-safe assignment: direct ticket preferred (current
          // backend contract), wrapped shapes tolerated.
          const ticket =
            (response as { data?: SupportRequest } | null)?.data ??
            (response as { ticket?: SupportRequest } | null)?.ticket ??
            response ??
            null;
          if (!ticket) {
            this.notFound = true;
            return;
          }
          this.ticket = ticket;
        },
        error: (err) => {
          console.error('[Support Ticket] API error:', err);
          if (err?.status === 404) {
            this.notFound = true;
            return;
          }
          this.errorMessage =
            err?.status === 403
              ? 'You do not have permission to view this ticket.'
              : err?.name === 'TimeoutError'
                ? 'The support request is taking too long to load. Please try again.'
                : 'Unable to load this support request.';
        },
      });
  }

  onReplied(): void {
    // Refresh header state (a reply may have reopened the ticket).
    this.load();
  }

  statusLabel(status: string | null | undefined): string {
    switch ((status || '').toUpperCase()) {
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'WAITING_FOR_USER':
        return 'Waiting for User';
      case 'RESOLVED':
        return 'Resolved';
      case 'CLOSED':
        return 'Closed';
      case 'OPEN':
      default:
        return 'Open';
    }
  }

  goBack(): void {
    const prefix = this.dashboardPrefix() ?? 'citizen';
    void this.router.navigate(['/dashboard', prefix, 'support']);
  }
}
