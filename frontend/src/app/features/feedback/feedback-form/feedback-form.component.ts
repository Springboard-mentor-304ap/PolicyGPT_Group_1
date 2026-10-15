import { Component, Inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Feedback, FeedbackCreate, FeedbackType } from '../../../core/models/feedback.model';
import { FeedbackService } from '../../../core/services/feedback.service';
import { PolicyService } from '../../../core/services/policy.service';
import { SchemeService } from '../../../core/services/scheme.service';
import { Auth, AuthUser } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../shared/components/breadcrumb/breadcrumb.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { LoadingIndicatorComponent } from '../../../shared/components/loading-indicator/loading-indicator.component';

@Component({
  selector: 'app-feedback-form',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent, SearchableSelectComponent, LoadingIndicatorComponent],
  templateUrl: './feedback-form.component.html',
  styleUrl: './feedback-form.component.scss',
})
export class FeedbackFormComponent implements OnInit {
  // Navigation / Tabs
  activeTab = signal<'submit' | 'history'>('submit');

  // User details
  currentUser = signal<AuthUser | null>(null);
  userRole = signal<string>('CITIZEN');

  // Form State
  feedbackType: FeedbackType = 'GENERAL';
  subject = '';
  message = '';
  policyId: number | null = null;
  schemeId: number | null = null;
  submitting = signal<boolean>(false);

  // Related-policy/scheme dropdown options (names loaded once from the
  // existing list APIs; the submitted payload still carries numeric IDs).
  policyOptions: { value: string; label: string }[] = [];
  schemeOptions: { value: string; label: string }[] = [];
  policiesLoading = false;
  schemesLoading = false;
  policiesError: string | null = null;
  schemesError: string | null = null;

  // History State
  userFeedbacks = signal<Feedback[]>([]);
  loadingHistory = signal<boolean>(false);
  historyError = signal<string | null>(null);
  historySearch = signal<string>('');
  historyStatusFilter = signal<string>('ALL');
  historyCategoryFilter = signal<string>('ALL');

  // Deep link to one record (e.g. from a notification's Review Feedback).
  highlightedFeedbackId = signal<number | null>(null);
  private linkNotified = false;

  // Predefined Feedback Types with friendly metadata
  feedbackTypes: { value: FeedbackType; label: string; icon: string; description: string }[] = [
    {
      value: 'GENERAL',
      label: 'General Feedback',
      icon: 'chat',
      description: 'Share your general experience and portal impressions.',
    },
    {
      value: 'BUG_ISSUE',
      label: 'Bug / Issue',
      icon: 'bug_report',
      description: 'Report technical errors, broken links, or display glitches.',
    },
    {
      value: 'POLICY_INQUIRY',
      label: 'Policy Inquiry',
      icon: 'policy',
      description: 'Inquire about policy clauses, documents, or clarifications.',
    },
    {
      value: 'SCHEME_QUESTION',
      label: 'Scheme Question',
      icon: 'account_balance',
      description: 'Ask questions regarding government schemes and assistance.',
    },
    {
      value: 'SUGGESTION',
      label: 'Feature Suggestion',
      icon: 'lightbulb',
      description: 'Propose ideas or improvements for future portal enhancements.',
    },
    {
      value: 'GRIEVANCE',
      label: 'Grievance / Complaint',
      icon: 'report_problem',
      description: 'File an official grievance regarding scheme delays or issues.',
    },
  ];

  // Filtered History
  filteredHistory = computed<Feedback[]>(() => {
    const list = this.userFeedbacks();
    const query = this.historySearch().toLowerCase().trim();
    const status = this.historyStatusFilter();
    const category = this.historyCategoryFilter();

    return list.filter((item) => {
      const matchStatus = status === 'ALL' || item.status.toUpperCase() === status;
      const matchCategory =
        category === 'ALL' ||
        (item.feedback_type || '').toUpperCase() === category.toUpperCase();
      const matchQuery =
        !query ||
        (item.subject && item.subject.toLowerCase().includes(query)) ||
        item.message.toLowerCase().includes(query) ||
        item.feedback_type.toLowerCase().includes(query) ||
        (item.admin_response && item.admin_response.toLowerCase().includes(query));

      return matchStatus && matchCategory && matchQuery;
    });
  });

  /** Distinct feedback categories derived from the user's own history (real data). */
  historyTypeOptions = computed<string[]>(() => {
    const set = new Set<string>(['ALL']);
    for (const item of this.userFeedbacks()) {
      if (item.feedback_type && item.feedback_type.trim()) {
        set.add(item.feedback_type.trim().toUpperCase());
      }
    }
    return Array.from(set);
  });

  readonly historyStatusOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'OPEN', label: 'Under Review' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'RESOLVED', label: 'Resolved' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  /** Category filter options with readable labels (values unchanged). */
  historyCategoryOptions = computed<{ value: string; label: string }[]>(() =>
    this.historyTypeOptions().map((t) => ({
      value: t,
      label: t === 'ALL' ? 'All Categories' : this.formatFeedbackType(t),
    })),
  );

  /** Summary counts derived from the user's own history (real data). */
  historySummary = computed(() => {
    const list = this.userFeedbacks();
    const closed = (s: string): boolean => {
      const u = (s || '').toUpperCase();
      return u === 'RESOLVED' || u === 'CLOSED';
    };
    const reviewed = list.filter((i) => closed(i.status)).length;
    return {
      total: list.length,
      reviewed,
      pending: list.length - reviewed,
    };
  });

  constructor(
    @Inject(FeedbackService) private readonly feedbackService: FeedbackService,
    @Inject(Auth) private readonly authService: Auth,
    @Inject(ToastService) private readonly toastService: ToastService,
    @Inject(Router) private readonly router: Router,
    @Inject(ActivatedRoute) private readonly route: ActivatedRoute,
    @Inject(PolicyService) private readonly policyService: PolicyService,
    @Inject(SchemeService) private readonly schemeService: SchemeService,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getStoredUser();
    this.currentUser.set(user);
    const role = this.authService.getUserRole() || 'CITIZEN';
    this.userRole.set(role);

    // If Admin accidentally visits here, redirect to Admin Feedback console
    if (role === 'ADMIN' || role === 'ADMINISTRATOR') {
      this.router.navigate(['/dashboard/admin/feedback']);
      return;
    }

    // Deep link (?id=) from notifications: open the actual record.
    this.route.queryParams.subscribe((params) => {
      const linked = Number(params?.['id']);
      if (Number.isFinite(linked) && linked > 0) {
        this.applyFeedbackLink(linked);
      }
    });

    this.loadHistory();
    this.loadReferenceOptions();
  }

  /**
   * Load selectable policies/schemes once for the optional Related
   * dropdowns. APPROVED records are visible to every role; list APIs are
   * response-cached by the services, so no duplicate requests occur.
   */
  loadReferenceOptions(): void {
    if (!this.policiesLoading && this.policyOptions.length === 0 && !this.policiesError) {
      this.policiesLoading = true;
      this.policyService.getPolicies({ status: 'APPROVED', page: 1, limit: 100 }).subscribe({
        next: (res) => {
          const list = Array.isArray(res?.policies) ? res.policies : [];
          this.policyOptions = list.map((p) => ({
            value: String(p.policy_id),
            label: p.title,
          }));
          this.policiesLoading = false;
        },
        error: () => {
          this.policiesLoading = false;
          this.policiesError = 'Could not load policies.';
        },
      });
    }
    if (!this.schemesLoading && this.schemeOptions.length === 0 && !this.schemesError) {
      this.schemesLoading = true;
      this.schemeService.getSchemes({ status: 'APPROVED', page: 1, limit: 100 }).subscribe({
        next: (res) => {
          const list = Array.isArray(res?.schemes) ? res.schemes : [];
          this.schemeOptions = list.map((s) => ({
            value: String(s.scheme_id),
            label: s.name,
          }));
          this.schemesLoading = false;
        },
        error: () => {
          this.schemesLoading = false;
          this.schemesError = 'Could not load schemes.';
        },
      });
    }
  }

  /** String-bound dropdown value for the numeric related-policy ID. */
  get policyIdValue(): string | null {
    return this.policyId === null ? null : String(this.policyId);
  }

  /** String-bound dropdown value for the numeric related-scheme ID. */
  get schemeIdValue(): string | null {
    return this.schemeId === null ? null : String(this.schemeId);
  }

  /** Store the selected policy ID (or clear the optional reference). */
  onPolicySelect(value: string): void {
    this.policyId = value ? Number(value) : null;
  }

  /** Store the selected scheme ID (or clear the optional reference). */
  onSchemeSelect(value: string): void {
    this.schemeId = value ? Number(value) : null;
  }

  /** Jump to one feedback record: history tab, filters cleared, highlight. */
  private applyFeedbackLink(feedbackId: number): void {
    this.linkNotified = false;
    this.highlightedFeedbackId.set(feedbackId);
    this.historySearch.set('');
    this.historyStatusFilter.set('ALL');
    this.historyCategoryFilter.set('ALL');
    this.activeTab.set('history');
    this.loadHistory();
  }

  setTab(tab: 'submit' | 'history'): void {
    this.activeTab.set(tab);
    if (tab === 'history') {
      this.loadHistory();
    }
  }

  selectFeedbackType(type: FeedbackType): void {
    this.feedbackType = type;
  }

  submitFeedback(): void {
    if (!this.message.trim()) {
      this.toastService.warning('Required Field', 'Please enter your feedback message.');
      return;
    }

    const user = this.currentUser();
    const payload: FeedbackCreate = {
      user_id: user?.user_id,
      feedback_type: this.feedbackType,
      subject: this.subject.trim() || undefined,
      message: this.message.trim(),
      policy_id: this.policyId || undefined,
      scheme_id: this.schemeId || undefined,
    };

    this.submitting.set(true);

    this.feedbackService.createFeedback(payload).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.toastService.success(
          'Feedback Submitted',
          'Thank you! Your feedback has been received and routed to the administrative team.'
        );
        // Reset form
        this.subject = '';
        this.message = '';
        this.policyId = null;
        this.schemeId = null;
        this.feedbackType = 'GENERAL';

        // Add to history and switch tab
        this.userFeedbacks.update((list) => [created, ...list]);
        this.activeTab.set('history');
      },
      error: (err) => {
        console.error('Error submitting feedback:', err);
        this.submitting.set(false);
        this.toastService.error(
          'Submission Failed',
          err.error?.detail || 'Failed to submit feedback. Please try again.'
        );
      },
    });
  }

  loadHistory(): void {
    this.loadingHistory.set(true);
    this.historyError.set(null);

    this.feedbackService.getAllFeedback().subscribe({
      next: (data) => {
        this.userFeedbacks.set(data || []);
        this.loadingHistory.set(false);
        this.revealLinkedFeedback();
      },
      error: (err) => {
        console.error('Error loading feedback history:', err);
        this.historyError.set('Could not load your feedback history.');
        this.loadingHistory.set(false);
      },
    });
  }

  /** Scroll to a deep-linked record after the list renders, or explain. */
  private revealLinkedFeedback(): void {
    const id = this.highlightedFeedbackId();
    if (id === null || typeof window === 'undefined') {
      return;
    }
    setTimeout(() => {
      const el = document.getElementById(`feedback-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (!this.linkNotified) {
        this.linkNotified = true;
        this.toastService.warning(
          'Not Found',
          'The linked feedback record was not found.',
        );
      }
    }, 80);
  }

  /** Display label for a feedback type value (real backend value). */
  formatFeedbackType(type: string | null | undefined): string {
    if (!type || !type.trim()) {
      return 'General';
    }
    if (type.trim().toUpperCase() === 'ALL') {
      return 'All Categories';
    }
    return type
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }

  getStatusClass(status: string): string {    switch (status.toUpperCase()) {
      case 'RESOLVED':
        return 'status-badge--resolved';
      case 'IN_PROGRESS':
        return 'status-badge--progress';
      case 'CLOSED':
        return 'status-badge--closed';
      case 'OPEN':
      default:
        return 'status-badge--open';
    }
  }

  getStatusLabel(status: string): string {
    switch (status.toUpperCase()) {
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'RESOLVED':
        return 'Resolved';
      case 'CLOSED':
        return 'Closed';
      case 'OPEN':
      default:
        return 'Under Review';
    }
  }

  getHomeRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'government_official' || r === 'government') return '/dashboard/government';
    if (r === 'researcher') return '/dashboard/researcher';
    if (r === 'organization') return '/dashboard/organization';
    return '/dashboard/citizen';
  }

  /** Breadcrumb trail: Home > Feedback (role-aware). */
  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: 'Home', route: [this.getHomeRoute()] },
      { label: 'Feedback' },
    ];
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate([this.getHomeRoute()]);
    }
  }
}
