import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize, take } from 'rxjs';
import { SchemeService } from '../../../core/services/scheme.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import {
  SchemeResponse,
  SchemeListResponse,
  SchemeStatus,
} from '../../../core/models/scheme.model';
import {
  SCHEME_CATEGORIES,
  MINISTRIES,
  MINISTRY_DEPARTMENTS_MAP,
  ALL_DEPARTMENTS,
  STATES,
} from '../../../core/constants/government-data.constants';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { ReasonModalComponent } from '../../../shared/components/reason-modal/reason-modal.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import {
  CategoryInput,
  getCategoryIconName,
  getCategoryIconStyle,
} from '../../../core/utils/category-icon.util';

export interface SchemeTableItem {
  id: number;
  name: string;
  title: string;
  description: string;
  category: string;
  ministry: string;
  department: string;
  state: string;
  status: string;
  publicationDate: string;
  createdBy?: number | null;
  rejectionReason?: string;
  archiveReason?: string;
  deleteReason?: string;
  deleteRequestedFromStatus?: string;
}

@Component({
  selector: 'app-manage-schemes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    OverlayModule,
    ConfirmModalComponent,
    ReasonModalComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './manage-schemes.component.html',
  styleUrls: ['./manage-schemes.component.scss'],
})
export class ManageSchemesComponent implements OnInit, OnDestroy {
  constructor(
    @Inject(SchemeService) private readonly schemeService: SchemeService,
    @Inject(Router) private readonly router: Router,
    @Inject(Auth) private readonly auth: Auth,
    @Inject(ChangeDetectorRef) private readonly cdr: ChangeDetectorRef,
    @Inject(ToastService) private readonly toastService: ToastService,
  ) {}

  searchText = '';
  selectedCategory = '';
  selectedMinistry = '';
  selectedDepartment = '';
  selectedState = '';
  selectedStatus = '';
  fromDate = '';
  toDate = '';

  currentPage = 1;
  pageSize = 6;
  menuOpenId: number | null = null;
  userRole: string | null = null;
  loading = false;
  errorMessage = '';
  successToastMessage: string | null = null;

  readonly actionMenuPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -6,
    },
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -6,
    },
  ];

  // Real backend analytics statistics
  stats = {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    archived: 0,
  };

  // Modals state
  confirmModalOpen = false;
  confirmTitle = '';
  confirmMessage = '';
  confirmVariant: 'primary' | 'danger' | 'warning' | 'success' = 'primary';
  confirmAction: (() => void) | null = null;
  confirmLoading = false;
  confirmErrorMessage: string | null = null;
  confirmText = 'Confirm';
  showCancelConfirm = true;

  reasonModalOpen = false;
  reasonTitle = '';
  reasonMessage = '';
  reasonLabel = 'Reason';
  reasonVariant: 'primary' | 'danger' | 'warning' = 'danger';
  reasonAction: ((reason: string) => void) | null = null;
  reasonLoading = false;
  reasonErrorMessage: string | null = null;

  categories = SCHEME_CATEGORIES;
  ministries = MINISTRIES;
  states = STATES;

  get departments(): string[] {
    if (!this.selectedMinistry) {
      return ALL_DEPARTMENTS;
    }
    const specific = MINISTRY_DEPARTMENTS_MAP[this.selectedMinistry];
    return specific && specific.length > 0 ? specific : ALL_DEPARTMENTS;
  }

  onMinistryChange(): void {
    if (this.selectedMinistry && this.selectedDepartment) {
      const specific = MINISTRY_DEPARTMENTS_MAP[this.selectedMinistry];
      if (specific && specific.length > 0 && !specific.includes(this.selectedDepartment)) {
        this.selectedDepartment = '';
      }
    }
    this.applyFilters();
  }

  statuses = [
    'APPROVED',
    'PENDING_APPROVAL',
    'DRAFT',
    'REJECTED',
    'ARCHIVED',
    'ARCHIVE_REQUESTED',
    'DELETE_REQUESTED',
  ];

  /** PolicyGPT dropdown options with human-readable status labels. */
  get statusFilterOptions(): { value: string; label: string }[] {
    return this.statuses.map((s) => ({ value: s, label: this.getStatusLabel(s) }));
  }

  schemes: SchemeTableItem[] = [];

  get isAdmin(): boolean {
    return this.userRole === 'ADMIN';
  }

  get rolePrefix(): string {
    return this.isAdmin ? 'admin' : 'government';
  }

  ngOnInit(): void {
    const rawRole = String(this.auth.getUserRole() || '')
      .trim()
      .toUpperCase();

    this.userRole =
      rawRole === 'ADMINISTRATOR' || rawRole === 'ADMIN'
        ? 'ADMIN'
        : rawRole === 'GOVERNMENT_OFFICIAL' ||
            rawRole === 'GOVERNMENT OFFICIAL' ||
            rawRole === 'GOVERNMENT'
          ? 'GOVERNMENT_OFFICIAL'
          : rawRole || null;

    this.loadSchemes();
  }

  showSuccessToast(message: string): void {
    // Single top-right notification per operation via the shared toast
    // service. successToastMessage is retained only for existing specs;
    // no inline toast is rendered, so only one toast appears.
    this.successToastMessage = message;
    this.cdr.detectChanges();
    try {
      this.toastService.success(message);
    } catch {
      // Toast container is optional in isolated specs; inline toast still shows.
    }
    window.setTimeout(() => {
      this.successToastMessage = null;
      this.cdr.detectChanges();
    }, 3500);
  }

  private showErrorToast(message: string): void {
    try {
      this.toastService.error(message);
    } catch {
      // Ignore when toast container is unavailable (e.g. isolated specs).
    }
  }

  /**
   * Builds a record-specific toast message, preferring the authoritative
   * name from the API response with the row's title as fallback.
   * Falls back to `generic` when no usable name exists.
   */
  private schemeToastMessage(
    updated: SchemeResponse | null | undefined,
    fallbackTitle: string | null | undefined,
    withName: (name: string) => string,
    generic: string,
  ): string {
    const raw =
      typeof updated?.name === 'string' && updated.name.trim()
        ? updated.name
        : (fallbackTitle ?? '');
    const name = String(raw).trim();
    return name ? withName(name) : generic;
  }

  loadSchemes(): void {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.schemeService.clearCache();

    this.schemeService.getSchemes({ page: 1, limit: 100, manage: true }).subscribe({
      next: (response: SchemeListResponse) => {
        const currentUser = this.auth.getStoredUser();
        const currentUserId = currentUser?.user_id;

        let source = Array.isArray(response?.schemes) ? response.schemes : [];

        // Role-based creator filtering rule:
        // Admin: sees ALL schemes across all creators.
        // Government Official: sees ONLY schemes created by the authenticated Government Official.
        if (!this.isAdmin && currentUserId) {
          source = source.filter((scheme: SchemeResponse) => scheme.created_by === currentUserId);
        }

        this.schemes = source.map((scheme: SchemeResponse) => ({
          id: Number(scheme.scheme_id),
          name: scheme.name || 'Untitled scheme',
          title: scheme.name || 'Untitled scheme',
          description: scheme.description || '',
          category: scheme.category || '',
          ministry: scheme.ministry || '',
          department: scheme.department || '',
          state: scheme.state || '',
          status: String(scheme.status || 'DRAFT').toUpperCase(),
          publicationDate: scheme.created_at
            ? this.formatDate(scheme.created_at)
            : '-',
          createdBy: scheme.created_by,
          rejectionReason: scheme.rejection_reason || undefined,
          archiveReason: scheme.archive_reason || undefined,
          deleteReason: scheme.delete_reason || undefined,
          deleteRequestedFromStatus:
            scheme.delete_requested_from_status || undefined,
        }));
        this.currentPage = Math.min(this.currentPage, this.totalPages);
        this.loading = false;
        if (!this.isAdmin) {
          const counts = { total: 0, approved: 0, pending: 0, rejected: 0, archived: 0 };
          for (const s of this.schemes) {
            counts.total += 1;
            if (s.status === "APPROVED") counts.approved += 1;
            else if (s.status === "PENDING_APPROVAL") counts.pending += 1;
            else if (s.status === "REJECTED") counts.rejected += 1;
            else if (s.status === "ARCHIVED") counts.archived += 1;
          }
          this.stats = counts;
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Failed to load schemes:', error);
        this.schemes = [];
        this.errorMessage = this.getErrorMessage(error);
        this.loading = false;
        this.cdr.detectChanges();
      },
    });

    this.loadStats();
  }

  loadStats(): void {
    // Government Officials see own-record counts (platform analytics are
    // global). Admins keep platform-wide totals.
    if (!this.isAdmin) {
      const counts = { total: 0, approved: 0, pending: 0, rejected: 0, archived: 0 };
      for (const s of this.schemes) {
        counts.total += 1;
        if (s.status === "APPROVED") counts.approved += 1;
        else if (s.status === "PENDING_APPROVAL") counts.pending += 1;
        else if (s.status === "REJECTED") counts.rejected += 1;
        else if (s.status === "ARCHIVED") counts.archived += 1;
      }
      this.stats = counts;
      this.cdr.detectChanges();
      return;
    }
    this.schemeService.getSchemeStatistics().subscribe({
      next: (res) => {
        this.stats = {
          total: res.total ?? 0,
          approved: res.approved ?? res.active ?? 0,
          pending: res.pending ?? 0,
          rejected: res.rejected ?? 0,
          archived: res.archived ?? 0,
        };
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to fetch scheme statistics:', err);
      },
    });
  }

  formatDate(date: string): string {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  get filteredSchemes(): SchemeTableItem[] {
    const search = this.searchText.toLowerCase().trim();
    return this.schemes.filter((scheme) => {
      const haystack = [
        scheme.title,
        scheme.description,
        scheme.category,
        scheme.ministry,
        scheme.department,
        scheme.state,
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesCategory =
        !this.selectedCategory || scheme.category === this.selectedCategory;
      const matchesMinistry =
        !this.selectedMinistry || scheme.ministry === this.selectedMinistry;
      const matchesDepartment =
        !this.selectedDepartment ||
        scheme.department === this.selectedDepartment;
      const matchesState =
        !this.selectedState || scheme.state === this.selectedState;
      const matchesStatus =
        !this.selectedStatus || scheme.status === this.selectedStatus;
      const schemeDate = this.toDateOnly(scheme.publicationDate);
      const matchesFrom =
        !this.fromDate || (schemeDate !== null && schemeDate >= this.fromDate);
      const matchesTo =
        !this.toDate || (schemeDate !== null && schemeDate <= this.toDate);
      return (
        matchesSearch &&
        matchesCategory &&
        matchesMinistry &&
        matchesDepartment &&
        matchesState &&
        matchesStatus &&
        matchesFrom &&
        matchesTo
      );
    });
  }

  private toDateOnly(value: string): string | null {
    if (!value || value === '-') return null;
    const parts = value.split('/');
    if (parts.length !== 3) return null;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredSchemes.length / this.pageSize));
  }

  get paginatedSchemes(): SchemeTableItem[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredSchemes.slice(start, start + this.pageSize);
  }

  get startItem(): number {
    return this.filteredSchemes.length
      ? (this.currentPage - 1) * this.pageSize + 1
      : 0;
  }

  get endItem(): number {
    return Math.min(
      this.currentPage * this.pageSize,
      this.filteredSchemes.length,
    );
  }

  /* ============================================================
     STATISTICS CARDS ACCESSORS
  ============================================================ */
  get totalSchemes(): number {
    return this.stats.total;
  }

  get approvedCount(): number {
    return this.stats.approved;
  }

  get pendingCount(): number {
    return this.stats.pending;
  }

  get rejectedCount(): number {
    return this.stats.rejected;
  }

  get archivedCount(): number {
    return this.stats.archived;
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cdr.detectChanges();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cdr.detectChanges();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.cdr.detectChanges();
    }
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.closeMenu();
    this.cdr.detectChanges();
  }

  resetFilters(): void {
    this.searchText =
      this.selectedCategory =
      this.selectedMinistry =
      this.selectedDepartment =
        '';
    this.selectedState = this.selectedStatus = '';
    this.fromDate = this.toDate = '';
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  changePageSize(): void {
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  toggleMenu(id: number): void {
    this.menuOpenId = this.menuOpenId === id ? null : id;
    this.cdr.detectChanges();
  }

  closeMenu(): void {
    if (this.menuOpenId !== null) {
      this.menuOpenId = null;
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.menuOpenId !== null) {
      this.closeMenu();
    }
  }

  onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeMenu();
    }
  }

  ngOnDestroy(): void {
    this.closeMenu();
  }

  viewScheme(scheme: SchemeTableItem): void {
    this.router.navigate([
      '/dashboard',
      this.rolePrefix,
      'schemes',
      scheme.id,
    ]);
  }

  editScheme(scheme: SchemeTableItem): void {
    this.closeMenu();
    this.router.navigate([
      '/dashboard',
      this.rolePrefix,
      'schemes',
      'edit',
      scheme.id,
    ]);
  }

  addNewScheme(): void {
    this.router.navigate(['/dashboard', this.rolePrefix, 'schemes', 'add']);
  }

  canSubmitScheme(scheme: SchemeTableItem): boolean {
    if (!['DRAFT', 'REJECTED'].includes(scheme.status)) return false;
    if (this.isAdmin) return true;
    const currentUserId = this.auth.getStoredUser()?.user_id;
    return Boolean(currentUserId && scheme.createdBy === currentUserId);
  }

  getSubmitActionLabel(scheme: SchemeTableItem): string {
    if (this.isAdmin) {
      return 'Submit';
    }
    return scheme.status === 'REJECTED'
      ? 'Re-submit for approval'
      : 'Submit for approval';
  }

  // ----------------------------------------------------------
  // Admin review helpers: status-driven details from real backend
  // values (never inferred from badge text).
  // ----------------------------------------------------------

  private getReasonOrFallback(reason?: string): string {
    const text = (reason || '').trim();
    return text ? text : 'No reason was provided.';
  }

  private toSchemeTableItem(scheme: SchemeResponse): SchemeTableItem {
    return {
      id: Number(scheme.scheme_id),
      name: scheme.name || 'Untitled scheme',
      title: scheme.name || 'Untitled scheme',
      description: scheme.description || '',
      category: scheme.category || '',
      ministry: scheme.ministry || '',
      department: scheme.department || '',
      state: scheme.state || '',
      status: String(scheme.status || 'DRAFT').toUpperCase(),
      publicationDate: scheme.created_at
        ? this.formatDate(scheme.created_at)
        : '-',
      createdBy: scheme.created_by,
      rejectionReason: scheme.rejection_reason || undefined,
      archiveReason: scheme.archive_reason || undefined,
      deleteReason: scheme.delete_reason || undefined,
      deleteRequestedFromStatus:
        scheme.delete_requested_from_status || undefined,
    };
  }

  /** Patch the affected row from the backend response (no full reload). */
  private applySchemeUpdate(updated: SchemeResponse): void {
    const item = this.toSchemeTableItem(updated);
    const index = this.schemes.findIndex((s) => s.id === item.id);
    if (index >= 0) {
      this.schemes[index] = item;
    } else {
      this.schemes = [...this.schemes, item];
    }
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.cdr.detectChanges();
    this.loadStats();
  }

  /** Remove a permanently deleted row without refetching the table. */
  private removeSchemeRow(id: number): void {
    this.schemes = this.schemes.filter((s) => s.id !== id);
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.cdr.detectChanges();
    this.loadStats();
  }

  private openInfoDialog(title: string, message: string): void {
    this.closeMenu();
    this.confirmTitle = title;
    this.confirmMessage = message;
    this.confirmVariant = 'primary';
    this.confirmText = 'Close';
    this.showCancelConfirm = false;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      this.confirmModalOpen = false;
      this.confirmAction = null;
      this.confirmText = 'Confirm';
      this.showCancelConfirm = true;
      this.cdr.detectChanges();
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openViewDeleteReason(scheme: SchemeTableItem): void {
    const reason = this.getReasonOrFallback(scheme.deleteReason);
    const previous = scheme.deleteRequestedFromStatus
      ? `Requested from status: ${this.getStatusLabel(scheme.deleteRequestedFromStatus)}.\n`
      : '';
    this.openInfoDialog(
      'Deletion request reason',
      `"${scheme.title || 'Untitled scheme'}"\n${previous}Deletion reason: ${reason}`,
    );
  }

  openViewSubmissionDetails(scheme: SchemeTableItem): void {
    const lines = [
      `"${scheme.title || 'Untitled scheme'}"`,
      `Status: ${this.getStatusLabel(scheme.status)}.`,
    ];
    const context = [scheme.category, scheme.ministry || scheme.department].filter(
      (part) => (part || '').trim(),
    );
    if (context.length) {
      lines.push(context.join(' • '));
    }
    if ((scheme.description || '').trim()) {
      lines.push(`Description: ${scheme.description.trim()}`);
    }
    lines.push(
      `Submission note: ${this.getReasonOrFallback(scheme.rejectionReason)}`,
    );
    this.openInfoDialog('Submission review details', lines.join('\n'));
  }

  openSubmitModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.canSubmitScheme(scheme)) {
      this.errorMessage =
        'You are not authorized to submit this scheme. Only schemes in DRAFT or REJECTED status can be submitted.';
      this.cdr.detectChanges();
      return;
    }
    const schemeName = scheme.name || scheme.title || 'Untitled Scheme';
    this.confirmTitle = 'Submit Scheme';
    this.confirmMessage = `Submit "${schemeName}" for approval?`;
    this.confirmVariant = 'primary';
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();

      this.schemeService.submitScheme(scheme.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Scheme "${n}" submitted for approval.`,
              'Scheme submitted for approval.',
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          }
          this.loadSchemes();
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can approve schemes.";
      this.cdr.detectChanges();
      return;
    }
    const currentUserId = this.auth.getStoredUser()?.user_id;
    if (currentUserId != null && scheme.createdBy === currentUserId) {
      this.errorMessage =
        "You cannot approve your own scheme. A different administrator must review it.";
      this.cdr.detectChanges();
      return;
    }
    const schemeName = scheme.name || scheme.title || 'Untitled Scheme';
    this.confirmTitle = 'Approve Scheme';
    this.confirmMessage = `Are you sure you want to approve "${schemeName}"?`;
    this.confirmVariant = 'success';
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();

      this.schemeService.approveScheme(scheme.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Scheme "${n}" approved successfully.`,
              'Scheme approved successfully.',
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          } else {
            this.loadSchemes();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = 'Only an administrator can reject schemes.';
      this.cdr.detectChanges();
      return;
    }
    this.reasonTitle = 'Reject Scheme';
    this.reasonMessage = `Please enter a rejection reason for "${scheme.title}".`;
    this.reasonLabel = 'Rejection Reason';
    this.reasonVariant = 'danger';
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.reasonAction = (reason: string) => {
      if (this.reasonLoading) {
        return;
      }
      this.reasonLoading = true;
      this.reasonErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.rejectScheme(scheme.id, reason).subscribe({
        next: (updated) => {
          this.reasonLoading = false;
          this.reasonModalOpen = false;
          this.reasonAction = null;
          this.reasonErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Scheme "${n}" rejected successfully.`,
              'Scheme rejected successfully.',
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          } else {
            this.loadSchemes();
          }
        },
        error: (err) => {
          this.reasonLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.reasonErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openRequestArchiveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    this.reasonTitle = 'Request Scheme Archive';
    this.reasonMessage = `Enter the reason for requesting archival of "${scheme.title}".`;
    this.reasonLabel = 'Archive Reason';
    this.reasonVariant = 'warning';
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.reasonAction = (reason: string) => {
      if (this.reasonLoading) {
        return;
      }
      this.reasonLoading = true;
      this.reasonErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.requestArchiveScheme(scheme.id, reason).subscribe({
        next: (updated) => {
          this.reasonLoading = false;
          this.reasonModalOpen = false;
          this.reasonAction = null;
          this.reasonErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Archive request for scheme "${n}" submitted to Admin.`,
              'Archive request submitted to Admin.',
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          } else {
            this.loadSchemes();
          }
        },
        error: (err) => {
          this.reasonLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.reasonErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveArchiveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = 'Only an administrator can approve archive requests.';
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = 'Approve Archive Request';
    this.confirmMessage = `Approve archival of "${scheme.title}"? Status will become ARCHIVED.`;
    this.confirmVariant = 'warning';
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.approveArchiveScheme(scheme.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Scheme "${n}" archived successfully.`,
              'Scheme archived successfully.',
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          } else {
            this.loadSchemes();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectArchiveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = 'Only an administrator can reject archive requests.';
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = 'Reject Archive Request';
    this.confirmMessage = `Reject archive request for "${scheme.title}"? The scheme will remain APPROVED.`;
    this.confirmVariant = 'primary';
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.rejectArchiveScheme(scheme.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Archive request for scheme "${n}" rejected successfully.`,
              'Archive request rejected successfully.',
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          } else {
            this.loadSchemes();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRequestDeleteModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    this.reasonTitle = 'Request Scheme Deletion';
    this.reasonMessage = `Enter the reason for requesting deletion of "${scheme.title}".`;
    this.reasonLabel = 'Deletion Reason';
    this.reasonVariant = 'danger';
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.reasonAction = (reason: string) => {
      if (this.reasonLoading) {
        return;
      }
      this.reasonLoading = true;
      this.reasonErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.requestDeleteScheme(scheme.id, reason).subscribe({
        next: (updated) => {
          this.reasonLoading = false;
          this.reasonModalOpen = false;
          this.reasonAction = null;
          this.reasonErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Deletion request for scheme "${n}" submitted successfully.`,
              'Deletion request submitted successfully.',
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          } else {
            this.loadSchemes();
          }
        },
        error: (err) => {
          this.reasonLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.reasonErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveDeleteModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = 'Only an administrator can approve deletion.';
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = 'Approve Permanent Deletion';
    this.confirmMessage = `Permanently delete "${scheme.title}"? This cannot be undone.\nDeletion reason: ${this.getReasonOrFallback(scheme.deleteReason)}`;
    this.confirmVariant = 'danger';
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      // Prevent duplicate submissions from repeated clicks.
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      // Single request; finalize guarantees the loading state clears on both
      // success and failure. Dialog closes only after backend confirms success.
      // We remain on /dashboard/admin/schemes/manage and refresh the list
      // from the backend so the deleted record disappears.
      this.schemeService
        .approveDeleteScheme(scheme.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: () => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast(
              this.schemeToastMessage(
                null,
                scheme.title,
                (n) => `Scheme "${n}" permanently deleted.`,
                'Scheme permanently deleted.',
              ),
            );
            this.loadSchemes();
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.confirmErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showErrorToast(errorMsg);
            this.cdr.detectChanges();
          },
        });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectDeleteModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = 'Only an administrator can reject deletion.';
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = 'Reject Delete Request';
    this.confirmMessage = `Reject delete request for "${scheme.title}"? The scheme will revert to its previous status.\nDeletion reason: ${this.getReasonOrFallback(scheme.deleteReason)}`;
    this.confirmVariant = 'primary';
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      // Prevent duplicate submissions from repeated clicks.
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      // Single request; finalize guarantees the loading state clears on both
      // success and failure. Rejecting never deletes the record — the backend
      // restores its previous status. We remain on
      // /dashboard/admin/schemes/manage and refresh the list from backend.
      this.schemeService
        .rejectDeleteScheme(scheme.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: () => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast(
              this.schemeToastMessage(
                null,
                scheme.title,
                (n) => `Deletion request for scheme "${n}" rejected successfully.`,
                'Deletion request rejected successfully.',
              ),
            );
            this.loadSchemes();
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.confirmErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showErrorToast(errorMsg);
            this.cdr.detectChanges();
          },
        });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRestoreModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = 'Only an administrator can restore schemes.';
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = 'Restore Scheme';
    this.confirmMessage = `Restore "${scheme.title}" back to APPROVED state?`;
    this.confirmVariant = 'success';
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.restoreScheme(scheme.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Scheme "${n}" restored to APPROVED.`,
              'Scheme restored to APPROVED.',
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          } else {
            this.loadSchemes();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openDirectDeleteModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = 'Only an administrator can delete schemes.';
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = 'Delete Scheme';
    this.confirmMessage = `Are you sure you want to permanently delete "${scheme.title}"?`;
    this.confirmVariant = 'danger';
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.deleteScheme(scheme.id).subscribe({
        next: () => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast(
            this.schemeToastMessage(
              null,
              scheme.title,
              (n) => `Scheme "${n}" permanently deleted.`,
              'Scheme permanently deleted.',
            ),
          );
          this.removeSchemeRow(scheme.id);
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  onConfirmModalConfirmed(): void {
    if (this.confirmLoading) {
      return;
    }
    if (this.confirmAction) {
      this.confirmAction();
    }
  }

  onConfirmModalCancelled(): void {
    if (this.confirmLoading) {
      return;
    }
    this.confirmModalOpen = false;
    this.confirmAction = null;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmText = 'Confirm';
    this.showCancelConfirm = true;
    this.cdr.detectChanges();
  }

  onReasonModalConfirmed(reason: string): void {
    if (this.reasonLoading) {
      return;
    }
    if (this.reasonAction) {
      this.reasonAction(reason);
    }
  }

  onReasonModalCancelled(): void {
    if (this.reasonLoading) {
      return;
    }
    this.reasonModalOpen = false;
    this.reasonAction = null;
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.cdr.detectChanges();
  }

  exportSchemes(): void {
    const data = this.filteredSchemes;
    const csv = [
      ['ID', 'Title', 'Category', 'Ministry', 'Department', 'Status'],
      ...data.map((scheme) => [
        scheme.id,
        `"${scheme.title.replace(/"/g, '""')}"`,
        `"${scheme.category}"`,
        `"${scheme.ministry}"`,
        `"${scheme.department}"`,
        scheme.status,
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schemes.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING_APPROVAL':
        return 'Pending Approval';
      case 'APPROVED':
        return 'Approved';
      case 'REJECTED':
        return 'Rejected';
      case 'DRAFT':
        return 'Draft';
      case 'ARCHIVED':
        return 'Archived';
      case 'ARCHIVE_REQUESTED':
        return 'Archive Requested';
      case 'DELETE_REQUESTED':
        return 'Delete Requested';
      default:
        return status ? status.replace(/_/g, ' ') : '';
    }
  }

  getCategoryClass(category: string): string {
    return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  categoryIcon(category: CategoryInput): string {
    return getCategoryIconName(category);
  }

  categoryIconStyle(category: CategoryInput): {
    'background-color': string;
    color: string;
    'border-color': string;
  } {
    return getCategoryIconStyle(category);
  }

  trackByScheme(index: number, scheme: SchemeTableItem): number {
    return scheme.id;
  }

  private getErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error?.error?.detail) {
      if (typeof error.error.detail === 'string') return error.error.detail;
      if (Array.isArray(error.error.detail)) {
        return error.error.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
      }
    }
    return error?.message || 'An unexpected error occurred.';
  }
}
