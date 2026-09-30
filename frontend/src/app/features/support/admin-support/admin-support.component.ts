import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AdminSupportRequest,
  SupportRequestRespond,
} from '../../../core/models/support.model';
import { SupportService } from '../../../core/services/support.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../shared/components/breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-admin-support',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
  templateUrl: './admin-support.component.html',
  styleUrls: [
    './admin-support.component.scss',
    '../../feedback/admin-feedback/admin-feedback.component.scss',
  ],
})
export class AdminSupportComponent implements OnInit {
  requests = signal<AdminSupportRequest[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Filters
  searchQuery = signal<string>('');
  statusFilter = signal<string>('ALL');
  categoryFilter = signal<string>('ALL');
  priorityFilter = signal<string>('ALL');

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
    return { total, open, inProgress, resolved, closed };
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

      return matchStatus && matchCategory && matchPriority && matchQuery;
    });
  });

  // Modal State: Review & Respond
  showRespondModal = signal<boolean>(false);
  selectedRequest = signal<AdminSupportRequest | null>(null);
  responseStatus = signal<string>('IN_PROGRESS');
  responseMessage = signal<string>('');
  modalSubmitting = signal<boolean>(false);

  constructor(
    private readonly supportService: SupportService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const role = this.authService.getUserRole() || '';
    if (role !== 'ADMIN' && role !== 'ADMINISTRATOR') {
      this.toastService.error('Access Denied', 'Admin credentials required.');
      this.router.navigate(['/dashboard/citizen/support']);
      return;
    }

    this.loadAllRequests();
  }

  loadAllRequests(): void {
    this.loading.set(true);
    this.error.set(null);

    this.supportService.getAllSupportRequests().subscribe({
      next: (data) => {
        this.requests.set(data || []);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load support requests:', err);
        this.error.set('Failed to load support requests from the server.');
        this.loading.set(false);
      },
    });
  }

  // =========================================================
  // RESPOND MODAL ACTIONS
  // =========================================================

  openRespondModal(item: AdminSupportRequest): void {
    this.selectedRequest.set(item);
    this.responseStatus.set(item.status.toUpperCase());
    this.responseMessage.set(item.response || '');
    this.showRespondModal.set(true);
  }

  closeRespondModal(): void {
    this.showRespondModal.set(false);
    this.selectedRequest.set(null);
    this.modalSubmitting.set(false);
  }

  saveResponse(): void {
    const item = this.selectedRequest();
    if (!item) return;

    this.modalSubmitting.set(true);

    const payload: SupportRequestRespond = {
      status: this.responseStatus(),
      response: this.responseMessage().trim() || null,
    };

    this.supportService.respondToSupportRequest(item.query_id, payload).subscribe({
      next: (updated) => {
        this.toastService.success(
          'Response Saved',
          'Official response has been recorded and the user was notified.'
        );
        this.requests.update((list) =>
          list.map((r) => (r.query_id === updated.query_id ? updated : r))
        );
        this.modalSubmitting.set(false);
        this.closeRespondModal();
      },
      error: (err) => {
        console.error('Error saving support response:', err);
        this.toastService.error(
          'Update Failed',
          err.error?.detail || 'Could not save support response.'
        );
        this.modalSubmitting.set(false);
      },
    });
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('ALL');
    this.categoryFilter.set('ALL');
    this.priorityFilter.set('ALL');
  }

  hasActiveFilters(): boolean {
    return (
      !!this.searchQuery() ||
      this.statusFilter() !== 'ALL' ||
      this.categoryFilter() !== 'ALL' ||
      this.priorityFilter() !== 'ALL'
    );
  }

  getStatusClass(status: string): string {
    switch ((status || '').toUpperCase()) {
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
    switch ((status || '').toUpperCase()) {
      case 'IN_PROGRESS':
        return 'In Progress';
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
