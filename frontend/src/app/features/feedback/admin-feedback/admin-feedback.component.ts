import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Feedback, FeedbackStatus, FeedbackUpdate } from '../../../core/models/feedback.model';
import { FeedbackService } from '../../../core/services/feedback.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../shared/components/breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-admin-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
  templateUrl: './admin-feedback.component.html',
  styleUrl: './admin-feedback.component.scss',
})
export class AdminFeedbackComponent implements OnInit {
  feedbacks = signal<Feedback[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Filters
  searchQuery = signal<string>('');
  statusFilter = signal<string>('ALL');
  roleFilter = signal<string>('ALL');
  typeFilter = signal<string>('ALL');

  // Stats computed
  stats = computed(() => {
    const list = this.feedbacks();
    const total = list.length;
    const open = list.filter((f) => f.status.toUpperCase() === 'OPEN').length;
    const inProgress = list.filter((f) => f.status.toUpperCase() === 'IN_PROGRESS').length;
    const resolved = list.filter((f) => f.status.toUpperCase() === 'RESOLVED').length;
    const closed = list.filter((f) => f.status.toUpperCase() === 'CLOSED').length;
    return { total, open, inProgress, resolved, closed };
  });

  // Filtered List
  filteredFeedbacks = computed<Feedback[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.statusFilter();
    const role = this.roleFilter();
    const type = this.typeFilter();

    return this.feedbacks().filter((item) => {
      const matchStatus = status === 'ALL' || item.status.toUpperCase() === status;
      const matchRole =
        role === 'ALL' ||
        (item.user_role && item.user_role.toUpperCase() === role);
      const matchType =
        type === 'ALL' ||
        item.feedback_type.toUpperCase() === type;

      const matchQuery =
        !query ||
        (item.subject && item.subject.toLowerCase().includes(query)) ||
        item.message.toLowerCase().includes(query) ||
        (item.user_name && item.user_name.toLowerCase().includes(query)) ||
        (item.user_email && item.user_email.toLowerCase().includes(query)) ||
        (item.admin_response && item.admin_response.toLowerCase().includes(query));

      return matchStatus && matchRole && matchType && matchQuery;
    });
  });

  // Modal State: Review & Respond
  showRespondModal = signal<boolean>(false);
  selectedFeedback = signal<Feedback | null>(null);
  responseStatus = signal<string>('IN_PROGRESS');
  responseMessage = signal<string>('');
  modalSubmitting = signal<boolean>(false);

  // Modal State: Delete
  showDeleteModal = signal<boolean>(false);
  feedbackToDelete = signal<Feedback | null>(null);
  deleteSubmitting = signal<boolean>(false);

  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const role = this.authService.getUserRole() || '';
    if (role !== 'ADMIN' && role !== 'ADMINISTRATOR') {
      this.toastService.error('Access Denied', 'Admin credentials required.');
      this.router.navigate(['/dashboard/citizen/feedback']);
      return;
    }

    this.loadAllFeedback();
  }

  loadAllFeedback(): void {
    this.loading.set(true);
    this.error.set(null);

    this.feedbackService.getAllFeedback().subscribe({
      next: (data) => {
        this.feedbacks.set(data || []);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load admin feedbacks:', err);
        this.error.set('Failed to load feedback records from the server.');
        this.loading.set(false);
      },
    });
  }

  // =========================================================
  // RESPOND MODAL ACTIONS
  // =========================================================

  openRespondModal(item: Feedback): void {
    this.selectedFeedback.set(item);
    this.responseStatus.set(item.status.toUpperCase());
    this.responseMessage.set(item.admin_response || '');
    this.showRespondModal.set(true);
  }

  closeRespondModal(): void {
    this.showRespondModal.set(false);
    this.selectedFeedback.set(null);
    this.modalSubmitting.set(false);
  }

  saveResponse(): void {
    const item = this.selectedFeedback();
    if (!item) return;

    this.modalSubmitting.set(true);

    const payload: FeedbackUpdate = {
      status: this.responseStatus(),
      admin_response: this.responseMessage().trim() || undefined,
    };

    this.feedbackService.updateFeedback(item.feedback_id, payload).subscribe({
      next: (updated) => {
        this.toastService.success(
          'Feedback Updated',
          'Official response has been recorded and user notification was dispatched.'
        );
        this.feedbacks.update((list) =>
          list.map((f) => (f.feedback_id === updated.feedback_id ? updated : f))
        );
        this.modalSubmitting.set(false);
        this.closeRespondModal();
      },
      error: (err) => {
        console.error('Error updating feedback response:', err);
        this.toastService.error(
          'Update Failed',
          err.error?.detail || 'Could not save feedback response.'
        );
        this.modalSubmitting.set(false);
      },
    });
  }

  // =========================================================
  // DELETE ACTIONS
  // =========================================================

  confirmDelete(item: Feedback, event: Event): void {
    event.stopPropagation();
    this.feedbackToDelete.set(item);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.feedbackToDelete.set(null);
    this.deleteSubmitting.set(false);
  }

  executeDelete(): void {
    const item = this.feedbackToDelete();
    if (!item) return;

    this.deleteSubmitting.set(true);

    this.feedbackService.deleteFeedback(item.feedback_id).subscribe({
      next: () => {
        this.toastService.success('Feedback Deleted', 'Record has been removed successfully.');
        this.feedbacks.update((list) => list.filter((f) => f.feedback_id !== item.feedback_id));
        this.deleteSubmitting.set(false);
        this.closeDeleteModal();
      },
      error: (err) => {
        console.error('Error deleting feedback:', err);
        this.toastService.error('Delete Failed', err.error?.detail || 'Could not delete feedback.');
        this.deleteSubmitting.set(false);
      },
    });
  }

  getStatusClass(status: string): string {
    switch (status.toUpperCase()) {
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

  /** Breadcrumb trail: Home > Feedback (admin-only page). */
  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: 'Home', route: ['/dashboard/admin'] },
      { label: 'Feedback' },
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
