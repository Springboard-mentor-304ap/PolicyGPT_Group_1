import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  AdminSupportRequest,
  SupportAnalytics,
  SupportRequestRespond,
  SUPPORT_PRIORITIES,
} from '../../../core/models/support.model';
import {
  AdminUsersService,
  AdminUserApi,
} from '../../../core/services/admin-user.service';
import { TicketConversationComponent } from '../../../shared/components/ticket-conversation/ticket-conversation.component';
import { SupportService } from '../../../core/services/support.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import { BodyScrollLockService } from '../../../core/services/body-scroll-lock.service';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../shared/components/breadcrumb/breadcrumb.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-admin-support',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent, TicketConversationComponent, SearchableSelectComponent],
  templateUrl: './admin-support.component.html',
  styleUrls: [
    './admin-support.component.scss',
    '../../feedback/admin-feedback/admin-feedback.component.scss',
  ],
})
export class AdminSupportComponent implements OnInit, OnDestroy {
  requests = signal<AdminSupportRequest[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  private readonly destroy$ = new Subject<void>();

  // Real analytics aggregates (GET /support/admin/analytics). Loaded in
  // parallel with the ticket list; the stat cards prefer these server
  // aggregates and fall back to client-side counts while loading.
  analytics = signal<SupportAnalytics | null>(null);
  analyticsError = signal<string | null>(null);

  // Filters
  searchQuery = signal<string>('');
  statusFilter = signal<string>('ALL');
  categoryFilter = signal<string>('ALL');
  priorityFilter = signal<string>('ALL');
  assigneeFilter = signal<string>('ALL');
  sortOrder = signal<'updated_desc' | 'updated_asc' | 'priority'>('updated_desc');

  // Stats computed
  stats = computed(() => {
    const list = this.requests();
    const total = list.length;
    const open = list.filter((r) => r.status.toUpperCase() === 'OPEN').length;
    const inProgress = list.filter(
      (r) => r.status.toUpperCase() === 'IN_PROGRESS'
    ).length;
    const resolved = list.filter(
      (r) => r.status.toUpperCase() === 'RESOLVED'
    ).length;
    const closed = list.filter(
      (r) => r.status.toUpperCase() === 'CLOSED'
    ).length;
    const waiting = list.filter(
      (r) => r.status.toUpperCase() === 'WAITING_FOR_USER'
    ).length;
    return { total, open, inProgress, waiting, resolved, closed };
  });

  // Dashboard numbers: prefer real server analytics (by_status), fall back
  // to client-side counts so cards render instantly without blocking.
  dashboardStats = computed(() => {
    const a = this.analytics();
    if (a) {
      const by = a.by_status ?? {};
      const get = (k: string): number => by[k] ?? 0;
      return {
        total: a.total_tickets,
        open: get('OPEN'),
        inProgress: get('IN_PROGRESS'),
        waiting: get('WAITING_FOR_USER'),
        resolved: get('RESOLVED'),
        closed: get('CLOSED'),
      };
    }
    return this.stats();
  });

  // Dynamic categories derived from loaded requests
  categories = computed<string[]>(() => {
    const set = new Set<string>(['ALL']);
    for (const r of this.requests()) {
      if (r.category && r.category.trim()) {
        set.add(r.category.trim());
      }
    }
    return Array.from(set);
  });

  // Filtered List
  filteredRequests = computed<AdminSupportRequest[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.statusFilter();
    const category = this.categoryFilter();
    const priority = this.priorityFilter();

    return this.requests().filter((item) => {
      const matchStatus =
        status === 'ALL' || item.status.toUpperCase() === status;
      const matchCategory =
        category === 'ALL' ||
        (item.category && item.category.toLowerCase() === category.toLowerCase());
      const matchPriority =
        priority === 'ALL' || item.priority.toUpperCase() === priority;

      const matchQuery =
        !query ||
        item.subject.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.request_id.toLowerCase().includes(query) ||
        (item.response && item.response.toLowerCase().includes(query)) ||
        (item.user_name && item.user_name.toLowerCase().includes(query)) ||
        (item.user_email && item.user_email.toLowerCase().includes(query));

      const assignee = this.assigneeFilter();
      const matchAssignee =
        assignee === 'ALL' ||
        (assignee === 'UNASSIGNED' && (item as AdminSupportRequest).assigned_to == null) ||
        String((item as AdminSupportRequest).assigned_to ?? '') === assignee;

      return (
        matchStatus &&
        matchCategory &&
        matchPriority &&
        matchAssignee &&
        matchQuery
      );
    });
  });

  // Sorted view (client-side; server already supports status/category/search filters)
  sortedRequests = computed<AdminSupportRequest[]>(() => {
    const list = [...this.filteredRequests()];
    const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    switch (this.sortOrder()) {
      case 'updated_asc':
        return list.sort(
          (a, b) => +new Date(a.updated_at) - +new Date(b.updated_at),
        );
      case 'priority':
        return list.sort(
          (a, b) =>
            (rank[a.priority?.toUpperCase() ?? 'MEDIUM'] ?? 2) -
              (rank[b.priority?.toUpperCase() ?? 'MEDIUM'] ?? 2) ||
            +new Date(b.updated_at) - +new Date(a.updated_at),
        );
      case 'updated_desc':
      default:
        return list.sort(
          (a, b) => +new Date(b.updated_at) - +new Date(a.updated_at),
        );
    }
  });

  // Modal State: Review & Respond
  showRespondModal = signal<boolean>(false);
  selectedRequest = signal<AdminSupportRequest | null>(null);
  responseStatus = signal<string>('IN_PROGRESS');
  responseMessage = signal<string>('');
  responsePriority = signal<string>('MEDIUM');
  assigneeId = signal<number | null>(null);
  modalSubmitting = signal<boolean>(false);

  readonly priorityOptions = [...SUPPORT_PRIORITIES];

  readonly responseStatusOptions = [
    { value: 'OPEN', label: 'Open / Under Review' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'WAITING_FOR_USER', label: 'Waiting for User' },
    { value: 'RESOLVED', label: 'Resolved (Issue Addressed)' },
  ];

  get responsePriorityOptions(): { value: string; label: string }[] {
    return this.priorityOptions.map((p) => ({
      value: p,
      label: p.charAt(0) + p.slice(1).toLowerCase(),
    }));
  }

  adminUsers = signal<AdminUserApi[]>([]);

  constructor(
    private readonly supportService: SupportService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
    private readonly adminUsersService: AdminUsersService,
    private readonly scrollLock: BodyScrollLockService,
  ) {}

  ngOnInit(): void {
    const role = this.authService.getUserRole() || '';
    if (role !== 'ADMIN' && role !== 'ADMINISTRATOR') {
      this.toastService.error('Access Denied', 'Admin credentials required.');
      this.router.navigate(['/dashboard/citizen/support']);
      return;
    }

    this.loadAllRequests();
    this.loadAnalytics();
    this.loadAdminUsers();
  }

  private loadAdminUsers(): void {
    this.adminUsersService
      .getUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) =>
          this.adminUsers.set(
            (Array.isArray(users) ? users : []).filter(
              (u) =>
                u.is_active &&
                ['ADMIN', 'ADMINISTRATOR'].includes(
                  (u.role || '').toUpperCase().trim(),
                ),
            ),
          ),
        error: () => this.adminUsers.set([]),
      });
  }

  assigneeName(id: number | null | undefined): string | null {
    if (id === null || id === undefined) {
      return null;
    }
    return (
      this.adminUsers().find((u) => u.user_id === id)?.full_name ?? null
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.showRespondModal()) {
      this.scrollLock.unlock();
    }
  }

  loadAllRequests(): void {
    this.loading.set(true);
    this.error.set(null);

    this.supportService
      .getAllSupportRequests()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.requests.set(data || []);
        },
        error: (err) => {
          this.error.set(
            err?.name === 'TimeoutError'
              ? 'The request timed out. Please try again.'
              : 'Failed to load support requests from the server.',
          );
        },
      });
  }

  /** Load real server aggregates without blocking the ticket table. */
  loadAnalytics(): void {
    this.analyticsError.set(null);
    this.supportService
      .getSupportAnalytics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => this.analytics.set(data),
        error: () =>
          this.analyticsError.set('Analytics unavailable — showing live ticket counts.'),
      });
  }

  refreshAll(): void {
    this.loadAllRequests();
    this.loadAnalytics();
  }

  // =========================================================
  // RESPOND MODAL ACTIONS
  // =========================================================

  openRespondModal(item: AdminSupportRequest): void {
    this.selectedRequest.set(item);
    this.responseStatus.set(item.status.toUpperCase());
    this.responseMessage.set(item.response || '');
    this.responsePriority.set((item.priority || 'MEDIUM').toUpperCase());
    this.assigneeId.set(
      (item as AdminSupportRequest).assigned_to ?? null,
    );
    this.showRespondModal.set(true);
    this.scrollLock.lock();
  }

  closeRespondModal(): void {
    this.showRespondModal.set(false);
    this.selectedRequest.set(null);
    this.modalSubmitting.set(false);
    this.scrollLock.unlock();
  }

  /** Copy a ticket reference to the clipboard (overflow-menu action). */
  copyTicketId(item: AdminSupportRequest): void {
    const id = item.request_id;
    if (
      !id ||
      typeof navigator === 'undefined' ||
      !navigator.clipboard?.writeText
    ) {
      this.toastService.info('Ticket ID', id || 'Unknown');
      return;
    }
    void navigator.clipboard.writeText(id).then(
      () =>
        this.toastService.success(
          'Copied',
          `Ticket ${id} copied to clipboard.`,
        ),
      () => this.toastService.info('Ticket ID', id),
    );
  }

  saveResponse(): void {
    const item = this.selectedRequest();
    if (!item || this.modalSubmitting()) return;

    this.modalSubmitting.set(true);

    const priority = this.responsePriority().toUpperCase();
    if (!SUPPORT_PRIORITIES.includes(priority as never)) {
      this.toastService.error('Invalid Priority', 'Select a valid priority.');
      return;
    }
    const payload: SupportRequestRespond = {
      status: this.responseStatus(),
      response: this.responseMessage().trim() || null,
      assigned_to: this.assigneeId(),
      priority,
    };

    this.supportService
      .respondToSupportRequest(item.query_id, payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.modalSubmitting.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.toastService.success(
            'Response Saved',
            'Official response has been recorded and the user was notified.',
          );
          this.requests.update((list) =>
            list.map((r) => (r.query_id === updated.query_id ? updated : r)),
          );
          this.closeRespondModal();
        },
        error: (err) => {
          this.toastService.error(
            'Update Failed',
            err?.name === 'TimeoutError'
              ? 'The request timed out. Please check whether the response was saved before retrying.'
              : err.error?.detail || 'Could not save support response.',
          );
        },
      });
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('ALL');
    this.categoryFilter.set('ALL');
    this.priorityFilter.set('ALL');
    this.assigneeFilter.set('ALL');
    this.sortOrder.set('updated_desc');
  }

  hasActiveFilters(): boolean {
    return (
      !!this.searchQuery() ||
      this.statusFilter() !== 'ALL' ||
      this.categoryFilter() !== 'ALL' ||
      this.priorityFilter() !== 'ALL' ||
      this.assigneeFilter() !== 'ALL' ||
      this.sortOrder() !== 'updated_desc'
    );
  }

  getStatusClass(status: string): string {
    switch ((status || '').toUpperCase()) {
      case 'RESOLVED':
        return 'status-badge--resolved';
      case 'IN_PROGRESS':
        return 'status-badge--progress';
      case 'WAITING_FOR_USER':
        return 'status-badge--waiting';
      case 'CLOSED':
        return 'status-badge--closed';
      case 'OPEN':
      default:
        return 'status-badge--open';
    }
  }

  getStatusLabel(status: string): string {
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
        return 'Open / New';
    }
  }

  getRoleBadgeClass(role?: string | null): string {
    if (!role) return 'role-badge--citizen';
    switch (role.toUpperCase()) {
      case 'GOVERNMENT_OFFICIAL':
      case 'GOVERNMENT':
        return 'role-badge--gov';
      case 'RESEARCHER':
        return 'role-badge--researcher';
      case 'ORGANIZATION':
      case 'ORGANISATION':
        return 'role-badge--org';
      case 'ADMIN':
      case 'ADMINISTRATOR':
        return 'role-badge--admin';
      case 'CITIZEN':
      default:
        return 'role-badge--citizen';
    }
  }

  getPriorityClass(priority: string): string {
    switch ((priority || '').toUpperCase()) {
      case 'URGENT':
        return 'priority-badge--urgent';
      case 'HIGH':
        return 'priority-badge--high';
      case 'MEDIUM':
        return 'priority-badge--medium';
      case 'LOW':
      default:
        return 'priority-badge--low';
    }
  }

  /** Breadcrumb trail: Home > Support Requests (admin-only page). */
  get breadcrumbItems(): BreadcrumbItem[] {
    const url = this.router.url || '';
    if (url.includes('/dashboard/admin/query-resolution')) {
      return [
        { label: 'Home', route: ['/dashboard/admin'] },
        { label: 'Query Resolution' },
      ];
    }
    return [
      { label: 'Home', route: ['/dashboard/admin'] },
      { label: 'Support Requests' },
    ];
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/dashboard/admin']);
    }
  }
}
