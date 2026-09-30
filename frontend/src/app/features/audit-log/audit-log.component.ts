import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuditLog } from '../../core/models/audit-log.model';
import { AuditLogService } from '../../core/services/audit-log.service';
import { Auth } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-log.component.html',
  styleUrls: [
    './audit-log.component.scss',
    '../feedback/admin-feedback/admin-feedback.component.scss',
  ],
})
export class AuditLogComponent implements OnInit {
  logs = signal<AuditLog[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Filters (action/entity/date are applied server-side)
  searchQuery = signal<string>('');
  actionFilter = signal<string>('ALL');
  entityFilter = signal<string>('ALL');
  roleFilter = signal<string>('ALL');
  fromDate = signal<string>('');
  toDate = signal<string>('');

  // Stats computed
  stats = computed(() => {
    const list = this.logs();
    const total = list.length;
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = list.filter(
      (l) => (l.created_at || '').slice(0, 10) === today
    ).length;
    const adminActions = list.filter((l) =>
      ['ADMIN', 'ADMINISTRATOR'].includes((l.user_role || '').toUpperCase())
    ).length;
    const userActions = total - adminActions;
    return { total, todayCount, adminActions, userActions };
  });

  // Distinct actions/entities present in the loaded page
  availableActions = computed<string[]>(() => {
    const set = new Set<string>();
    for (const l of this.logs()) {
      if (l.action) set.add(l.action);
    }
    return ['ALL', ...Array.from(set).sort()];
  });

  availableEntities = computed<string[]>(() => {
    const set = new Set<string>();
    for (const l of this.logs()) {
      if (l.entity_type) set.add(l.entity_type);
    }
    return ['ALL', ...Array.from(set).sort()];
  });

  // Client-side search/role narrowing over the server-filtered page
  filteredLogs = computed<AuditLog[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const role = this.roleFilter();

    return this.logs().filter((item) => {
      const matchRole =
        role === 'ALL' ||
        (item.user_role && item.user_role.toUpperCase() === role);

      const matchQuery =
        !query ||
        item.action.toLowerCase().includes(query) ||
        (item.entity_type && item.entity_type.toLowerCase().includes(query)) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        (item.user_name && item.user_name.toLowerCase().includes(query)) ||
        (item.user_email && item.user_email.toLowerCase().includes(query)) ||
        String(item.entity_id || '').includes(query) ||
        String(item.audit_id) === query;

      return matchRole && matchQuery;
    });
  });

  // Details modal
  showDetailsModal = signal<boolean>(false);
  selectedLog = signal<AuditLog | null>(null);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly authService: Auth,
    private readonly toastService: ToastService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const role = this.authService.getUserRole() || '';
    if (role !== 'ADMIN' && role !== 'ADMINISTRATOR') {
      this.toastService.error('Access Denied', 'Admin credentials required.');
      this.router.navigate(['/auth/login']);
      return;
    }

    this.loadLogs();
  }

  loadLogs(): void {
    this.loading.set(true);
    this.error.set(null);

    this.auditLogService
      .getAuditLogs({
        action: this.actionFilter(),
        entity_type: this.entityFilter(),
        from_date: this.fromDate() || undefined,
        to_date: this.toDate() || undefined,
      })
      .subscribe({
        next: (data) => {
          this.logs.set(data || []);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to load audit logs:', err);
          this.error.set('Failed to load audit logs from the server.');
          this.loading.set(false);
        },
      });
  }

  applyServerFilters(): void {
    this.loadLogs();
  }

  openDetails(item: AuditLog): void {
    this.selectedLog.set(item);
    this.showDetailsModal.set(true);
  }

  closeDetails(): void {
    this.showDetailsModal.set(false);
    this.selectedLog.set(null);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.actionFilter.set('ALL');
    this.entityFilter.set('ALL');
    this.roleFilter.set('ALL');
    this.fromDate.set('');
    this.toDate.set('');
    this.loadLogs();
  }

  hasActiveFilters(): boolean {
    return (
      !!this.searchQuery() ||
      this.actionFilter() !== 'ALL' ||
      this.entityFilter() !== 'ALL' ||
      this.roleFilter() !== 'ALL' ||
      !!this.fromDate() ||
      !!this.toDate()
    );
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

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/dashboard/admin']);
    }
  }
}
