import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import {
  Observable,
  Subject,
  Subscription,
  debounceTime,
  distinctUntilChanged,
  finalize,
  switchMap,
  catchError,
  of,
  takeUntil,
} from 'rxjs';
import { timeout } from 'rxjs/operators';

import { SupportService } from '../../core/services/support.service';
import { Auth, AuthUser } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast.service';
import { BodyScrollLockService } from '../../core/services/body-scroll-lock.service';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { TicketConversationComponent } from '../../shared/components/ticket-conversation/ticket-conversation.component';
import {
  FAQ,
  SupportRequest,
  SupportRequestCreate,
} from '../../core/models/support.model';

export type SupportTab = 'faqs' | 'my-requests';

/** Safety bound so a hung ticket fetch can never strand the modal spinner. */
const TicketDetailsTimeoutMs = 10_000;

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TicketConversationComponent, SearchableSelectComponent],
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.scss'],
})
export class SupportComponent implements OnInit, OnDestroy {
  // Current user & role
  currentUser: AuthUser | null = null;
  userRole = 'CITIZEN';
  isGuest = false;

  /** Small contextual line under the FAQ heading, tailored per workspace. */
  get faqSubtitle(): string {
    const role = (this.userRole || '').toUpperCase().trim();
    switch (role) {
      case 'RESEARCHER':
        return 'Answers tailored to your Researcher workspace.';
      case 'CITIZEN':
        return 'Answers to common questions about policies, schemes, eligibility, and portal services.';
      case 'ORGANIZATION':
      case 'ORGANISATION':
        return 'Answers tailored to your Organization workspace.';
      case 'GOVERNMENT_OFFICIAL':
      case 'GOVERNMENT':
      case 'GOVT':
        return 'Guidance for managing policies, schemes, approvals, and department activities.';
      default:
        return 'Answers to common questions about using PolicyGPT.';
    }
  }

  // Active view tab
  activeTab: SupportTab = 'faqs';

  // FAQs State
  faqs: FAQ[] = [];
  categories: string[] = ['All'];
  selectedCategory = 'All';
  searchQuery = '';
  expandedFaqIds = new Set<number>();
  totalFaqCount = 0;

  // Search debounce stream
  private readonly searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;
  /** Cancels in-flight requests when the component is destroyed. */
  private readonly destroy$ = new Subject<void>();
  /** One idempotency key per modal opening; retries of the same form
   * carry the same key so a timeout retry cannot create a duplicate. */
  private submitIdempotencyKey: string | null = null;

  // Loading, error, empty states
  loadingFaqs = true;
  faqError: string | null = null;

  // Support Requests State
  myRequests: SupportRequest[] = [];
  loadingRequests = false;
  requestsError: string | null = null;

  // Submit Modal State
  showSubmitModal = false;  submittingRequest = false;
  submitError: string | null = null;
  submittedSuccessRequest: SupportRequest | null = null;

  // Ticket Details Modal State (View opens here, page never navigates)
  showTicketModal = false;
  selectedTicket: SupportRequest | null = null;
  ticketLoading = false;
  ticketError: string | null = null;
  modalTicketId: number | null = null;

  // Form Fields
  formCategory = 'General Inquiry';
  formSubject = '';
  formDescription = '';
  formPriority = 'MEDIUM';

  readonly requestCategories: string[] = [
    'General Inquiry',
    'Policy Clarification',
    'Scheme Application',
    'Eligibility Issue',
    'Technical Problem',
    'Account & Security',
    'Feedback & Grievance',
  ];

  /** PolicyGPT dropdown options (values/enums unchanged). */
  get faqCategoryOptions(): { value: string; label: string }[] {
    return this.categories.map((c) => ({
      value: c,
      label: c === 'All' ? 'All Categories' : c,
    }));
  }

  readonly requestStatusOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'WAITING_FOR_USER', label: 'Waiting for User' },
    { value: 'RESOLVED', label: 'Resolved' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  get requestCategoryFilterOptions(): { value: string; label: string }[] {
    return this.requestCategoryOptions.map((c) => ({
      value: c,
      label: c === 'ALL' ? 'All Categories' : c,
    }));
  }

  readonly requestPriorityOptions = [
    { value: 'ALL', label: 'All Priorities' },
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'URGENT', label: 'Urgent' },
  ];

  readonly formPriorityOptions = [
    { value: 'LOW', label: 'Low (General Query)' },
    { value: 'MEDIUM', label: 'Medium (Standard Issue)' },
    { value: 'HIGH', label: 'High (Application Blocked)' },
    { value: 'URGENT', label: 'Urgent (System Critical)' },
  ];

  constructor(
    private readonly supportService: SupportService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly scrollLock: BodyScrollLockService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getStoredUser();
    let role = (this.authService.getUserRole() || '').toUpperCase().trim();
    if (!role) {
      const url = this.router.url;
      if (url.includes('/government')) role = 'GOVERNMENT_OFFICIAL';
      else if (url.includes('/researcher')) role = 'RESEARCHER';
      else if (url.includes('/organization')) role = 'ORGANIZATION';
      else if (url.includes('/citizen')) role = 'CITIZEN';
    }
    this.userRole = role || 'CITIZEN';
    this.isGuest =
      this.authService.isGuest() ||
      (!this.authService.isLoggedIn() && !this.authService.getToken());

    // Setup debounced search (200ms) with stale-request cancellation.
    // Server-side search is required: GET /support/faqs supports
    // ?search=&category=. switchMap cancels the in-flight request when
    // the user keeps typing, avoiding out-of-order results.
    this.searchSubscription = this.searchSubject
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((query) => {
          this.loadingFaqs = true;
          this.faqError = null;
          return this.supportService.getFaqs(query, this.selectedCategory).pipe(
            catchError((err) => {
              this.handleFaqError(err);
              return of([]);
            }),
            finalize(() => {
              this.loadingFaqs = false;
              if (!this.destroy$.closed) {
                this.cdr.detectChanges();
              }
            }),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((data) => {
        this.applyFaqResult(data || [], this.searchQuery, this.selectedCategory);
      });

    // Initial data fetch from backend
    this.loadCategories();
    this.fetchFaqs('', this.selectedCategory);

    if (!this.isGuest) {
      this.loadMyRequests();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchSubscription?.unsubscribe();
    // Release one scroll lock per open modal (service is ref-counted).
    if (this.showSubmitModal) {
      this.scrollLock.unlock();
    }
    if (this.showTicketModal) {
      this.scrollLock.unlock();
    }
  }

  // =========================================================
  // FAQS DATA FETCHING & FILTERING
  // =========================================================

  loadCategories(): void {
    this.supportService
      .getFaqCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
      next: (backendCats) => {
        const unique = new Set<string>();
        unique.add('All');
        (backendCats || []).forEach((c) => {
          if (c && c.trim()) unique.add(c.trim());
        });
        this.categories = Array.from(unique);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.warn('Failed to load categories from backend:', err);
      },
    });
  }

  fetchFaqs(search?: string, category?: string): void {
    this.loadingFaqs = true;
    this.faqError = null;

    this.supportService
      .getFaqs(search, category)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          // Guaranteed cleanup: success, error, timeout, or teardown.
          this.loadingFaqs = false;
          if (!this.destroy$.closed) {
            this.cdr.detectChanges();
          }
        }),
      )
      .subscribe({
        next: (data) => {
          this.applyFaqResult(data || [], search, category);
        },
        error: (err) => {
          this.handleFaqError(err);
        },
      });
  }

  private applyFaqResult(data: FAQ[], search?: string, category?: string): void {
    this.faqs = data;
    const isInitialLoad =
      (!search || !search.trim()) &&
      (!category || category === 'All');
    if (isInitialLoad) {
      this.totalFaqCount = this.faqs.length;
    } else if (this.totalFaqCount === 0) {
      this.totalFaqCount = this.faqs.length;
    }
    // All FAQs start collapsed. Details are revealed via hover preview
    // (desktop) or click-to-expand (touch / keyboard / full answer).
  }

  private handleFaqError(err: unknown): void {
    const e = err as { name?: string; status?: number };
    if (e?.name === 'TimeoutError') {
      this.faqError =
        'The request timed out. Please check your connection and try again.';
    } else if (e?.status === 403) {
      this.faqError =
        'Access denied: Administrators use the Admin FAQ Management portal.';
    } else {
      this.faqError =
        'Unable to load FAQs. Please check your network or try again.';
    }
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.fetchFaqs('', this.selectedCategory);
  }

  selectCategory(category: string): void {
    if (this.selectedCategory === category) return;
    this.selectedCategory = category;
    this.fetchFaqs(this.searchQuery, category);
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'All';
    this.fetchFaqs('', 'All');
  }

  // =========================================================
  // FAQ ACCORDION CONTROLS
  // =========================================================

  toggleFaq(faqId: number): void {
    if (this.expandedFaqIds.has(faqId)) {
      this.expandedFaqIds.delete(faqId);
    } else {
      this.expandedFaqIds.add(faqId);
    }
  }

  isExpanded(faqId: number): boolean {
    return this.expandedFaqIds.has(faqId);
  }

  /** Single hover-preview target: only one preview visible at a time. */
  hoveredFaqId: number | null = null;

  setHover(faqId: number): void {
    this.hoveredFaqId = faqId;
  }

  clearHover(): void {
    this.hoveredFaqId = null;
  }

  isHovered(faqId: number): boolean {
    return this.hoveredFaqId === faqId;
  }

  expandAll(): void {
    this.faqs.forEach((f) => this.expandedFaqIds.add(f.faq_id));
  }

  collapseAll(): void {
    this.expandedFaqIds.clear();
  }

  // =========================================================
  // MY SUPPORT REQUESTS
  // =========================================================

  loadMyRequests(): void {
    if (this.isGuest) return;
    this.loadingRequests = true;
    this.requestsError = null;

    this.supportService
      .getMySupportRequests()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingRequests = false;
          if (!this.destroy$.closed) {
            this.cdr.detectChanges();
          }
        }),
      )
      .subscribe({
        next: (requests) => {
          this.myRequests = requests || [];
        },
        error: (err) => {
          this.requestsError =
            err?.name === 'TimeoutError'
              ? 'The request timed out. Please try again.'
              : 'Unable to retrieve your support requests.';
        },
      });
  }

  setActiveTab(tab: SupportTab): void {
    this.activeTab = tab;
    if (tab === 'my-requests' && !this.isGuest && this.myRequests.length === 0) {
      this.loadMyRequests();
    }
  }

  // =========================================================
  // SUBMIT SUPPORT REQUEST MODAL
  // =========================================================

  openSubmitModal(): void {
    if (this.isGuest) {
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    this.showSubmitModal = true;
    this.submitError = null;
    this.submittedSuccessRequest = null;
    this.scrollLock.lock();
    this.formCategory = 'General Inquiry';
    this.formSubject = '';
    this.formDescription = '';
    this.formPriority = 'MEDIUM';
    // Fresh key per opening so retries of this form dedupe server-side.
    this.submitIdempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  closeSubmitModal(): void {
    this.showSubmitModal = false;
    this.submitError = null;
    this.submittedSuccessRequest = null;
    this.scrollLock.unlock();
  }

  submitRequest(): void {
    // Guard against double-clicks while a submission is in flight.
    if (this.submittingRequest) {
      return;
    }
    const subject = this.formSubject.trim();
    const description = this.formDescription.trim();

    if (!subject) {
      this.submitError = 'Please provide a subject for your request.';
      return;
    }
    if (subject.length < 3) {
      this.submitError = 'Subject must be at least 3 characters long.';
      return;
    }
    if (!description) {
      this.submitError = 'Please provide a description of your issue or question.';
      return;
    }
    if (description.length < 5) {
      this.submitError = 'Description must be at least 5 characters long.';
      return;
    }

    this.submittingRequest = true;
    this.submitError = null;

    const payload: SupportRequestCreate = {
      category: this.formCategory,
      subject: subject,
      description: description,
      priority: this.formPriority,
    };

    this.supportService
      .submitSupportRequest(payload, this.submitIdempotencyKey ?? undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          // Always re-enable the button: success, error, timeout, or
          // navigation away. Form data is retained on failure.
          this.submittingRequest = false;
          if (!this.destroy$.closed) {
            this.cdr.detectChanges();
          }
        }),
      )
      .subscribe({
        next: (created) => {
          this.submittedSuccessRequest = created;
          this.toastService.success(
            'Support Request Submitted',
            `Your request has been registered as ${created.request_id}.`,
          );

          // Prepend the confirmed server object for an instant update
          // (single POST, no extra GET round-trip). Dedupe by query_id
          // in case the same ticket is already listed.
          this.myRequests = [
            created,
            ...this.myRequests.filter(
              (r) => r.query_id !== created.query_id,
            ),
          ];
          this.formSubject = '';
          this.formDescription = '';
          this.closeSubmitModal();
        },
        error: (err) => {
          if (err?.name === 'TimeoutError') {
            this.submitError =
              'The request timed out. Your ticket may still have been created — ' +
              'please check My Requests before retrying (retrying is safe).';
          } else {
            this.submitError =
              err?.error?.detail ||
              'Unable to submit your support request right now. Please try again.';
          }
        },
      });
  }

  // =========================================================
  // NAVIGATION & HELPERS
  // =========================================================

  getRolePrefix(): string {
    const role = (this.userRole || '').toUpperCase().trim();
    if (role === 'GOVERNMENT_OFFICIAL' || role === 'GOVERNMENT' || role === 'GOVT') return 'government';
    if (role === 'RESEARCHER') return 'researcher';
    if (role === 'ORGANIZATION' || role === 'ORGANISATION') return 'organization';
    if (this.isGuest) return 'guest';
    return 'citizen';
  }

  navigateToHome(): void {
    const prefix = this.getRolePrefix();
    this.router.navigate([`/dashboard/${prefix}`]);
  }

  openTicket(ticket: SupportRequest): void {
    // Ticket details open in a modal on this page (no navigation away).
    // Guests never reach this (View is hidden), but guard regardless.
    if (this.isGuest) {
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    // Render instantly from the already-loaded list row, then refresh
    // silently in the background (single API call, no spinner delay).
    this.selectedTicket = ticket;
    this.ticketLoading = false;
    this.ticketError = null;
    this.modalTicketId = null;
    this.showTicketModal = true;
    this.scrollLock.lock();

    // Real backend id first (query_id), with fallbacks for safety.
    const source = ticket as SupportRequest & Record<string, unknown>;
    const raw = source.query_id ?? source['id'] ?? source['ticket_id'] ?? source['support_request_id'];
    const ticketId = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      this.ticketError = 'Invalid support ticket ID.';
      return;
    }
    this.loadTicketDetails(ticketId, { silent: true });
  }

  /**
   * Fetch complete ticket data for the modal (existing API, single call).
   * Silent mode refreshes already-visible content without a spinner;
   * failures surface as a toast so the visible ticket is never lost.
   */
  loadTicketDetails(ticketId: number, opts?: { silent?: boolean }): void {
    const silent = opts?.silent === true && this.selectedTicket !== null;
    this.modalTicketId = ticketId;
    this.ticketLoading = !silent;
    this.ticketError = silent ? null : this.ticketError;
    if (!silent) {
      this.ticketError = null;
    }
    let request$: Observable<SupportRequest>;
    try {
      console.log('[Support Ticket] Loading ticket:', ticketId);
      request$ = this.supportService.getSupportRequest(ticketId);
    } catch {
      this.ticketLoading = false;
      this.ticketError = 'Unable to load this support request.';
      return;
    }
    request$
      .pipe(
        timeout(TicketDetailsTimeoutMs),
        takeUntil(this.destroy$),
        finalize(() => {
          this.ticketLoading = false;
          if (!this.destroy$.closed) {
            this.cdr.detectChanges();
          }
        }),
      )
      .subscribe({
        next: (response) => {
          console.log('[Support Ticket] API response:', response);
          const found =
            (response as { data?: SupportRequest } | null)?.data ??
            (response as { ticket?: SupportRequest } | null)?.ticket ??
            response ??
            null;
          if (!found) {
            if (silent) {
              return;
            }
            this.ticketError = 'Support ticket data was not returned.';
            return;
          }
          this.selectedTicket = found;
        },
        error: (err) => {
          console.error('[Support Ticket] API error:', err);
          const message =
            err?.status === 404
              ? 'Support request not found.'
              : err?.status === 403
                ? 'You do not have permission to view this ticket.'
                : err?.name === 'TimeoutError'
                  ? 'The support request is taking too long to load. Please try again.'
                  : 'Unable to load this support request.';
          if (silent && this.selectedTicket) {
            this.toastService.error('Refresh Failed', message);
            return;
          }
          this.ticketError = message;
        },
      });
  }

  /** Retry uses the same loader — never a full page reload. */
  retryTicketModal(): void {
    if (this.modalTicketId !== null) {
      this.loadTicketDetails(this.modalTicketId);
    }
  }

  closeTicketModal(): void {
    this.showTicketModal = false;
    this.selectedTicket = null;
    this.ticketLoading = false;
    this.ticketError = null;
    this.modalTicketId = null;
    this.scrollLock.unlock();
  }

  /** Refresh modal details after a reply (status may have changed). */
  onModalReplied(): void {
    if (this.modalTicketId !== null) {
      this.loadTicketDetails(this.modalTicketId);
    }
    this.loadMyRequests();
  }

  faqDetailsLink(faqId: number): string[] {
    return ['/dashboard', this.getRolePrefix(), 'faqs', String(faqId)];
  }

  /** Feedback page for the current role (Submit Feedback action). */
  feedbackLink(): string[] {
    return ['/dashboard', this.getRolePrefix(), 'feedback'];
  }

  /**
   * Feedback has its own sidebar entry (not a Support-page card) for
   * Citizen and Government Official. Every other role keeps the card.
   */
  isFeedbackInSidebar(): boolean {
    const role = (this.userRole || '').toUpperCase().trim();
    return (
      role === 'CITIZEN' ||
      role === 'GOVERNMENT_OFFICIAL' ||
      role === 'GOVERNMENT' ||
      role === 'GOVT'
    );
  }

  /** Help-topic shortcut: searches FAQs by topic keyword. */
  searchTopic(keyword: string): void {
    this.setActiveTab('faqs');
    this.selectedCategory = 'All';
    this.searchQuery = keyword;
    this.onSearchChange(keyword);
  }

  /** Quick Help: focus the FAQ search without extra navigation. */
  focusFaqSearch(): void {
    this.setActiveTab('faqs');
    if (typeof document !== 'undefined') {
      const el = document.getElementById('faq-search');
      el?.focus();
    }
  }

  /** Category dropdown change handler. */
  onCategorySelect(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? 'All';
    this.selectCategory(value);
  }

  /** Expanded inline detail rows in the My Requests table. */
  private readonly expandedRequestIds = new Set<number>();

  /** Client-side filters for the My Requests table (server data reused). */
  requestSearch = '';
  requestStatus = 'ALL';
  requestCategory = 'ALL';
  requestPriority = 'ALL';

  /** Distinct categories derived from the user's own tickets (real data). */
  get requestCategoryOptions(): string[] {
    const set = new Set<string>(['ALL']);
    for (const req of this.myRequests) {
      if (req.category && req.category.trim()) {
        set.add(req.category.trim());
      }
    }
    return Array.from(set);
  }

  get filteredRequests(): SupportRequest[] {
    const query = this.requestSearch.trim().toLowerCase();
    return this.myRequests.filter((req) => {
      const matchStatus =
        this.requestStatus === 'ALL' || req.status === this.requestStatus;
      const matchCategory =
        this.requestCategory === 'ALL' ||
        (req.category || '').toLowerCase() ===
          this.requestCategory.toLowerCase();
      const matchPriority =
        this.requestPriority === 'ALL' ||
        (req.priority || '').toUpperCase() ===
          this.requestPriority.toUpperCase();
      const matchQuery =
        !query ||
        req.subject.toLowerCase().includes(query) ||
        req.description.toLowerCase().includes(query) ||
        req.request_id.toLowerCase().includes(query) ||
        (req.category || '').toLowerCase().includes(query);
      return matchStatus && matchCategory && matchPriority && matchQuery;
    });
  }

  clearRequestFilters(): void {
    this.requestSearch = '';
    this.requestStatus = 'ALL';
    this.requestCategory = 'ALL';
    this.requestPriority = 'ALL';
  }

  isRequestExpanded(queryId: number): boolean {
    return this.expandedRequestIds.has(queryId);
  }

  toggleRequest(queryId: number): void {
    if (this.expandedRequestIds.has(queryId)) {
      this.expandedRequestIds.delete(queryId);
    } else {
      this.expandedRequestIds.add(queryId);
    }
  }

  trackByFaqId(_index: number, item: FAQ): number {
    return item.faq_id;
  }

  trackByRequestId(_index: number, item: SupportRequest): number {
    return item.query_id;
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
}
