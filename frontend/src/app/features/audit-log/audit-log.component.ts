import { Component, HostListener, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuditLog } from '../../core/models/audit-log.model';
import { AuditLogService } from '../../core/services/audit-log.service';
import { Auth } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast.service';
import { formatAuditLabel } from '../../core/utils/audit-label.util';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../shared/components/breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
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

  // ---------- Pagination (client-side page over filtered records) ----------
  totalPages = computed<number>(() =>
    Math.max(1, Math.ceil(this.filteredLogs().length / this.pageSize)),
  );

  pagedLogs = computed<AuditLog[]>(() => {
    const page = Math.min(Math.max(1, this.currentPage()), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredLogs().slice(start, start + this.pageSize);
  });

  /** Compact page numbers with ellipsis: 1 … window … last. */
  pageNumbers = computed<Array<number | '…'>>(() => {
    const total = this.totalPages();
    const current = Math.min(Math.max(1, this.currentPage()), total);
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const window = new Set<number>([1, 2, current - 1, current, current + 1, total - 1, total]);
    const pages = Array.from(window)
      .filter((p) => p >= 1 && p <= total)
      .sort((a, b) => a - b);
    const out: Array<number | '…'> = [];
    let prev = 0;
    for (const p of pages) {
      if (p - prev > 1) out.push('…');
      out.push(p);
      prev = p;
    }
    return out;
  });

  pageRangeText(): string {
    const total = this.filteredLogs().length;
    if (total === 0) return 'Showing 0 of 0 records';
    const current = Math.min(Math.max(1, this.currentPage()), this.totalPages());
    const start = (current - 1) * this.pageSize + 1;
    const end = Math.min(current * this.pageSize, total);
    return `Showing ${start}–${end} of ${total.toLocaleString()} records`;
  }

  goToPage(page: number): void {
    this.currentPage.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  /** Display-only formatter: underscores become spaces, API value untouched. */
  formatAction(action: string | null | undefined): string {
    return formatAuditLabel(action);
  }

  /** Shared display formatter, exposed for templates (single helper). */
  readonly formatAuditLabel = formatAuditLabel;

  /** Human timestamp used by exports: "Oct 8, 2026, 8:51 AM". */
  formatTimestamp(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  }

  // Pagination (client-side over the loaded page; the backend exposes
  // limit-only listing, so no second pagination API is introduced)
  readonly pageSize = 10;
  currentPage = signal<number>(1);

  // Export menu + progress
  exportMenuOpen = signal<boolean>(false);
  exporting = signal<boolean>(false);

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
    // Keep existing rows visible during refresh instead of blanking the
    // page; the skeleton only shows on the very first load.
    if (this.logs().length === 0) {
      this.loading.set(true);
    }
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
          // Clamp the page so refresh preserves it when still valid.
          this.currentPage.set(Math.min(Math.max(1, this.currentPage()), this.totalPages()));
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
    this.currentPage.set(1);
    this.loadLogs();
  }

  /** Client-side filter changed: reset to page 1 (no extra API call). */
  onClientFilterChanged(): void {
    this.currentPage.set(1);
  }

  onSearchChanged(value: string): void {
    this.searchQuery.set(value);
    this.onClientFilterChanged();
  }

  onRoleChanged(value: string): void {
    this.roleFilter.set(value);
    this.onClientFilterChanged();
  }

  openDetails(item: AuditLog): void {
    this.selectedLog.set(item);
    this.showDetailsModal.set(true);
  }

  closeDetails(): void {
    this.showDetailsModal.set(false);
    this.selectedLog.set(null);
  }

  // ---------- Export (PDF / Excel of ALL filtered records) ----------

  toggleExportMenu(event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.exporting()) return;
    this.exportMenuOpen.update((v) => !v);
  }

  @HostListener('document:click')
  closeExportMenuOnOutsideClick(): void {
    if (this.exportMenuOpen()) {
      this.exportMenuOpen.set(false);
    }
  }

  /** Active filter summary for report headers. */
  private activeFilterSummary(): string {
    const parts: string[] = [];
    if (this.searchQuery().trim()) parts.push(`Search: "${this.searchQuery().trim()}"`);
    if (this.actionFilter() !== 'ALL') parts.push(`Action: ${this.formatAction(this.actionFilter())}`);
    if (this.entityFilter() !== 'ALL') parts.push(`Entity: ${formatAuditLabel(this.entityFilter())}`);
    if (this.roleFilter() !== 'ALL') parts.push(`Role: ${this.roleFilter()}`);
    if (this.fromDate()) parts.push(`From: ${this.fromDate()}`);
    if (this.toDate()) parts.push(`To: ${this.toDate()}`);
    return parts.length ? parts.join(' · ') : 'None (all records)';
  }

  private exportFileStem(kind: 'pdf' | 'xlsx'): string {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    return (
      `policygpt-audit-logs-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
      `${pad(d.getHours())}${pad(d.getMinutes())}.${kind}`
    );
  }

  private exportRows(): Array<[string, string, string, string, string, string]> {
    return this.filteredLogs().map((l) => [
      this.formatTimestamp(l.created_at),
      l.user_name || 'System',
      l.user_email || (l.user_id !== null ? `User #${l.user_id}` : '—'),
      (l.user_role || '—').toUpperCase(),
      formatAuditLabel(l.action),
      formatAuditLabel(l.entity_type) || '—',
    ]);
  }

  async exportPdf(): Promise<void> {
    if (this.exporting()) return;
    this.exportMenuOpen.set(false);
    this.exporting.set(true);
    try {
      const { jsPDF } = await import('jspdf');
      const rows = this.exportRows();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      const usable = pageW - margin * 2;
      const widths = [0.2, 0.2, 0.22, 0.1, 0.16, 0.1].map((f) => Math.floor(f * usable));
      const headers = ['Timestamp', 'User', 'Email', 'Role', 'Action', 'Entity'];
      let y = 48;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text('PolicyGPT', margin, y);
      y += 20;
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text('Audit Logs Report', margin, y);
      y += 16;
      doc.setFontSize(9);
      doc.text(`Generated On: ${this.formatTimestamp(new Date().toISOString())}`, margin, y);
      y += 13;
      const filterLines = doc.splitTextToSize(`Applied Filters: ${this.activeFilterSummary()}`, usable);
      doc.text(filterLines, margin, y);
      y += filterLines.length * 12 + 10;

      const rowH = 20;
      const drawHeader = (): void => {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, usable, rowH, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        let x = margin;
        headers.forEach((h, i) => {
          doc.text(h, x + 6, y + 13, { maxWidth: widths[i] - 12 });
          x += widths[i];
        });
        y += rowH;
      };
      const pageH = doc.internal.pageSize.getHeight();
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(23, 32, 51);
      for (const row of rows) {
        const wrapped = row.map((cell, i) => doc.splitTextToSize(cell || '—', widths[i] - 12));
        const h = Math.max(rowH, ...wrapped.map((w) => w.length * 12 + 8));
        if (y + h > pageH - 40) {
          doc.addPage();
          y = 40;
          drawHeader();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(23, 32, 51);
        }
        doc.setDrawColor(237, 241, 245);
        doc.line(margin, y + h, margin + usable, y + h);
        let x = margin;
        wrapped.forEach((lines, i) => {
          doc.text(lines, x + 6, y + 13);
          x += widths[i];
        });
        y += h;
      }
      if (rows.length === 0) {
        doc.text('No records match the current filters.', margin, y + 16);
      }
      doc.save(this.exportFileStem('pdf'));
      this.toastService.success('Export Complete', 'Audit logs exported as PDF.');
    } catch (err) {
      console.error('Failed to export audit logs as PDF:', err);
      this.toastService.error('Export Failed', 'Could not generate the PDF. Please try again.');
    } finally {
      this.exporting.set(false);
    }
  }

  async exportExcel(): Promise<void> {
    if (this.exporting()) return;
    this.exportMenuOpen.set(false);
    this.exporting.set(true);
    try {
      const XLSX = await import('xlsx');
      const header = ['Timestamp', 'User', 'Email', 'Role', 'Action', 'Entity'];
      const ws = XLSX.utils.aoa_to_sheet([header, ...this.exportRows()]);
      ws['!cols'] = [
        { wch: 22 },
        { wch: 24 },
        { wch: 30 },
        { wch: 18 },
        { wch: 32 },
        { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs');
      XLSX.writeFile(wb, this.exportFileStem('xlsx'));
      this.toastService.success('Export Complete', 'Audit logs exported as Excel.');
    } catch (err) {
      console.error('Failed to export audit logs as Excel:', err);
      this.toastService.error('Export Failed', 'Could not generate the spreadsheet. Please try again.');
    } finally {
      this.exporting.set(false);
    }
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.actionFilter.set('ALL');
    this.entityFilter.set('ALL');
    this.roleFilter.set('ALL');
    this.fromDate.set('');
    this.toDate.set('');
    this.currentPage.set(1);
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

  /** Breadcrumb trail: Home > Audit Logs (admin-only page). */
  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: 'Home', route: ['/dashboard/admin'] },
      { label: 'Audit Logs' },
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
