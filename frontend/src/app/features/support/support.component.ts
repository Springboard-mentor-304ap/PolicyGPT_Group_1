import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import {
  Subject,
  Subscription,
  debounceTime,
  distinctUntilChanged,
  finalize,
  takeUntil,
} from 'rxjs';

import { SupportService } from '../../core/services/support.service';
import { Auth, AuthUser } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast.service';
import {
  FAQ,
  SupportRequest,
  SupportRequestCreate,
} from '../../core/models/support.model';

export type SupportTab = 'faqs' | 'my-requests';

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.scss'],
})
export class SupportComponent implements OnInit, OnDestroy {
  // Current user & role
  currentUser: AuthUser | null = null;
  userRole = 'CITIZEN';
  isGuest = false;

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
  showSubmitModal = false;
  submittingRequest = false;
  submitError: string | null = null;
  submittedSuccessRequest: SupportRequest | null = null;

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

  constructor(
    private readonly supportService: SupportService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
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

    // Setup debounced search (300ms)
    this.searchSubscription = this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((query) => {
        this.fetchFaqs(query, this.selectedCategory);
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
          this.faqs = data || [];
          if (category === 'All' && !search) {
            this.totalFaqCount = this.faqs.length;
          } else if (this.totalFaqCount === 0) {
            this.totalFaqCount = this.faqs.length;
          }

          // Expand first FAQ by default if it's the initial full load
          if (this.faqs.length > 0 && this.expandedFaqIds.size === 0 && !search && category === 'All') {
            this.expandedFaqIds.add(this.faqs[0].faq_id);
          }
        },
        error: (err) => {
          if (err?.name === 'TimeoutError') {
            this.faqError =
              'The request timed out. Please check your connection and try again.';
          } else if (err.status === 403) {
            this.faqError = 'Access denied: Administrators use the Admin FAQ Management portal.';
          } else {
            this.faqError = 'Unable to load FAQs. Please check your network or try again.';
          }
        },
      });
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

          // Refresh from the confirmed server state (avoids stale lists
          // and duplicate rows), then reset + close only on success.
          this.loadMyRequests();
          this.formSubject = '';
          this.formDescription = '';
          this.showSubmitModal = false;
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

  trackByFaqId(_index: number, item: FAQ): number {
    return item.faq_id;
  }

  trackByRequestId(_index: number, item: SupportRequest): number {
    return item.query_id;
  }
}
