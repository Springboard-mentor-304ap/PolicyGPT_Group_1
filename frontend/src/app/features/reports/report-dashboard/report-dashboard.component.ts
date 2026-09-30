import { Component, OnInit, ChangeDetectorRef, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, forkJoin, map, of } from 'rxjs';
import { ReportService } from '../../../core/services/report.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../shared/components/breadcrumb/breadcrumb.component';
import {
  ReportDataset,
  ReportFormat,
  ReportType,
} from '../../../core/models/report.model';
import { NotificationItem } from '../../../core/models/notification.model';
import {
  REPORT_CATEGORIES,
  REPORT_TYPE_META,
  FilterField,
  FILTERS_BY_TYPE,
} from '../report-catalog';

interface WorkspaceTab {
  key: string;
  title: string;
  description: string;
  icon: string;
  kind: 'report' | 'notifications';
  types: ReportType[];
}

interface ReportTabState {
  type: ReportType | '';
  detail: string;
  /** Filters actually applied to the table (server request). */
  appliedValues: Record<string, string>;
  /** Temporary modal edits; table updates only on Apply. */
  draftValues: Record<string, string>;
  remoteOptions: Record<string, string[]>;
  loadingOptions: boolean;
  search: string;
  hiddenCols: string[];
  sortCol: number | null;
  sortDir: 1 | -1;
  page: number;
  pageSize: number;
  dataset: ReportDataset | null;
  /** Per-format export state so only the clicked option shows loading. */
  exportingFormat: ReportFormat | null;
  exportOpen: boolean;
  columnsOpen: boolean;
  filterOpen: boolean;
  error: string | null;
  drawerError: string | null;
  previewLoading: boolean;
  previewError: string | null;
  previewLoaded: boolean;
}

interface NotificationsTabState {
  search: string;
  category: string;
  readFilter: string;
  items: NotificationItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unread: number;
  read: number;
  thisWeek: number;
  loading: boolean;
  error: string | null;
}

function newReportTabState(): ReportTabState {
  return {
    type: '',
    detail: 'overview',
    appliedValues: {},
    draftValues: {},
    remoteOptions: {},
    loadingOptions: false,
    search: '',
    hiddenCols: [],
    sortCol: null,
    sortDir: 1,
    page: 1,
    pageSize: 10,
    dataset: null,
    exportingFormat: null,
    exportOpen: false,
    columnsOpen: false,
    filterOpen: false,
    error: null,
    drawerError: null,
    previewLoading: false,
    previewError: null,
    previewLoaded: false,
  };
}

function newNotificationsTabState(): NotificationsTabState {
  return {
    search: '',
    category: '',
    readFilter: 'ALL',
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
    unread: 0,
    read: 0,
    thisWeek: 0,
    loading: false,
    error: null,
  };
}

@Component({
  selector: 'app-report-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, BreadcrumbComponent],
  styleUrl: '../reports-shared.scss',
  templateUrl: './report-dashboard.component.html',
})
export class ReportDashboardComponent implements OnInit {
  private readonly reports = inject(ReportService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(Auth);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly initializing = signal(true);
  typesError: string | null = null;

  /** Breadcrumb trail: Home > Reports (role-aware for admin/government). */
  get breadcrumbItems(): BreadcrumbItem[] {
    const role = (this.auth.getUserRole() || '').toUpperCase();
    const prefix =
      role === 'GOVERNMENT_OFFICIAL' || role === 'GOVERNMENT'
        ? 'government'
        : 'admin';
    return [
      { label: 'Home', route: ['/dashboard', prefix] },
      { label: 'Reports' },
    ];
  }

  tabs: WorkspaceTab[] = [];
  activeTabKey = '';
  private readonly tabState = new Map<string, ReportTabState>();
  private detailsByType: Partial<Record<ReportType, string[]>> = {};
  private allowedTypes = new Set<ReportType>();
  private previewSeq = new Map<string, number>();

  notifState: NotificationsTabState = newNotificationsTabState();

  // ============================================================
  // INIT — shell renders immediately, types refine in background
  // ============================================================

  ngOnInit(): void {
    // Render the shell instantly from the static catalog so the page
    // never shows a full-page "Loading reports workspace..." card.
    // The authorized types arrive in the background and narrow this.
    this.tabs = REPORT_CATEGORIES.map((c) => ({
      key: c.key,
      title: c.title,
      description: c.description,
      icon: c.icon,
      kind: 'report' as const,
      types: [...c.types],
    }));
    if (this.tabs.length > 0 && !this.activeTabKey) {
      this.selectTab(this.tabs[0].key);
    }
    this.loadTypes();
  }

  loadTypes(): void {
    this.typesError = null;
    this.initializing.set(true);
    this.reports.getTypes().subscribe({
      next: (res) => {
        this.allowedTypes = new Set(res?.report_types ?? []);
        this.detailsByType = res?.details ?? {};
        const refined = REPORT_CATEGORIES.map((c) => ({
          key: c.key,
          title: c.title,
          description: c.description,
          icon: c.icon,
          kind: 'report' as const,
          types: c.types.filter((t) => this.allowedTypes.has(t)),
        })).filter((t) => t.types.length > 0);
        if (refined.length > 0) {
          this.tabs = refined;
          const role = (this.auth.getUserRole() || '').toUpperCase();
          if (role === 'GOVERNMENT_OFFICIAL' || role === 'GOVERNMENT') {
            this.tabs.push({
              key: 'notifications',
              title: 'Notification Reports',
              description: 'Notification delivery and read statistics.',
              icon: 'notifications',
              kind: 'notifications' as const,
              types: [],
            });
          }
          if (!this.tabs.some((t) => t.key === this.activeTabKey)) {
            this.selectTab(this.tabs[0].key);
          } else {
            // Reconcile the active tab's type against the authorized set.
            const tab = this.activeTab;
            const st = tab ? this.stateOf(tab.key) : null;
            if (tab && tab.kind === 'report' && st && !tab.types.includes(st.type as ReportType)) {
              st.type = tab.types[0] ?? '';
              st.previewLoaded = false;
              this.refreshTabType(tab.key);
            }
          }
        } else if (this.tabs.length === 0) {
          this.tabs = [];
        }
        this.initializing.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.typesError =
          (err as { error?: { detail?: string } })?.error?.detail ||
          'Could not load report types.';
        this.initializing.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // ============================================================
  // TABS (lazy: only the active tab loads)
  // ============================================================

  get activeTab(): WorkspaceTab | undefined {
    return this.tabs.find((t) => t.key === this.activeTabKey);
  }

  selectTab(key: string): void {
    // A modal belongs to its tab; never leave one open over
    // another tab's table.
    for (const st of this.tabState.values()) {
      st.filterOpen = false;
      st.exportOpen = false;
      st.columnsOpen = false;
    }
    this.activeTabKey = key;
    const tab = this.activeTab;
    if (!tab) return;
    if (tab.kind === 'notifications') {
      if (this.notifState.items.length === 0 && !this.notifState.loading) {
        this.loadNotifications();
      }
      return;
    }
    let st = this.tabState.get(key);
    if (!st) {
      st = newReportTabState();
      st.type = tab.types[0] ?? '';
      this.tabState.set(key, st);
      this.refreshTabType(key);
      return;
    }
    // Only load the active tab. If it already has data for its current
    // type, keep it; otherwise fetch the live preview once.
    if (!st.previewLoaded && !st.previewLoading && st.type) {
      this.loadPreview(key);
    }
  }

  stateOf(key: string): ReportTabState {
    let st = this.tabState.get(key);
    if (!st) {
      st = newReportTabState();
      this.tabState.set(key, st);
    }
    return st;
  }

  typeTitle(type: ReportType): string {
    return REPORT_TYPE_META[type]?.title ?? type;
  }

  // ============================================================
  // FILTER MODAL (draft vs applied)
  // ============================================================

  filtersFor(tab: WorkspaceTab, st: ReportTabState): FilterField[] {
    if (!st.type) return [];
    return FILTERS_BY_TYPE[st.type] ?? [];
  }

  drawerDateFields(tab: WorkspaceTab, st: ReportTabState): FilterField[] {
    return this.filtersFor(tab, st).filter((f) => f.kind === 'date');
  }

  drawerDataFields(tab: WorkspaceTab, st: ReportTabState): FilterField[] {
    return this.filtersFor(tab, st).filter((f) => f.kind !== 'date');
  }

  openFilter(key: string): void {
    const st = this.stateOf(key);
    // Draft starts from the last applied values; un-applied edits from
    // a previously closed modal are intentionally discarded.
    st.draftValues = { ...st.appliedValues };
    st.drawerError = null;
    st.filterOpen = true;
    st.exportOpen = false;
    st.columnsOpen = false;
    this.cdr.markForCheck();
  }

  closeFilter(key: string): void {
    const st = this.stateOf(key);
    // Closing without Apply discards the draft; the table keeps
    // showing the last applied filters.
    st.filterOpen = false;
    st.drawerError = null;
    this.cdr.markForCheck();
  }

  /** Backdrop click: close only when the overlay itself is clicked. */
  onOverlayClick(key: string, event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeFilter(key);
    }
  }

  applyDrawerFilters(key: string): void {
    const tab = this.tabs.find((t) => t.key === key);
    const st = this.stateOf(key);
    if (!tab || tab.kind !== 'report' || st.previewLoading) return;
    const dateFrom = st.draftValues['date_from'] || '';
    const dateTo = st.draftValues['date_to'] || '';
    if (dateFrom && dateTo && dateFrom > dateTo) {
      st.drawerError = 'The from date must be on or before the to date.';
      return;
    }
    st.drawerError = null;
    st.error = null;
    st.appliedValues = { ...st.draftValues };
    st.page = 1;
    st.filterOpen = false;
    this.loadPreview(key);
  }

  resetDrawerFilters(key: string): void {
    const st = this.stateOf(key);
    // Reset clears the draft controls only; the table keeps showing the
    // last applied filters until the user clicks Apply Filters.
    st.draftValues = {};
    st.drawerError = null;
    this.cdr.markForCheck();
  }

  clearAllFilters(key: string): void {
    const st = this.stateOf(key);
    st.draftValues = {};
    st.appliedValues = {};
    st.search = '';
    st.drawerError = null;
    st.error = null;
    st.page = 1;
    st.filterOpen = false;
    this.loadPreview(key);
  }

  activeFilterCount(st: ReportTabState): number {
    return Object.values(st.appliedValues).filter(
      (v) => v !== '' && v !== null && v !== undefined,
    ).length;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    for (const [key, st] of this.tabState) {
      if (st.filterOpen) {
        this.closeFilter(key);
        return;
      }
      if (st.exportOpen || st.columnsOpen) {
        st.exportOpen = false;
        st.columnsOpen = false;
        this.cdr.markForCheck();
        return;
      }
    }
  }

  /** Close Columns / Export popovers on outside click or Escape. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target || !(target instanceof HTMLElement)) return;
    if (target.closest('.columns-wrapper') || target.closest('.export-menu')) {
      return;
    }
    let changed = false;
    for (const st of this.tabState.values()) {
      if (st.columnsOpen || st.exportOpen) {
        st.columnsOpen = false;
        st.exportOpen = false;
        changed = true;
      }
    }
    if (changed) this.cdr.markForCheck();
  }

  /** Keep the filter modal open when clicking inside it. */
  stopPropagation(event: MouseEvent): void {
    event.stopPropagation();
  }

  toggleColumns(st: ReportTabState, event: MouseEvent): void {
    event.stopPropagation();
    st.columnsOpen = !st.columnsOpen;
    st.exportOpen = false;
    this.cdr.markForCheck();
  }

  toggleExport(st: ReportTabState, event: MouseEvent): void {
    event.stopPropagation();
    if (st.exportingFormat) return;
    st.exportOpen = !st.exportOpen;
    st.columnsOpen = false;
    this.cdr.markForCheck();
  }

  // ============================================================
  // REPORT TYPE (multi-type tabs, e.g. Government Reports)
  // ============================================================

  onReportTypeChange(key: string): void {
    const st = this.stateOf(key);
    const type = st.type as ReportType | '';
    if (!type) return;
    // A different report type has different filters; start clean.
    st.detail = this.defaultDetailFor(type);
    st.appliedValues = {};
    st.draftValues = {};
    st.page = 1;
    st.sortCol = null;
    st.hiddenCols = [];
    st.error = null;
    st.previewLoaded = false;
    this.loadRemoteOptions(key, type);
    this.loadPreview(key);
  }

  private defaultDetailFor(type: ReportType): string {
    const details = this.detailsByType[type] ?? ['overview'];
    return details[0] ?? 'overview';
  }

  private refreshTabType(key: string): void {
    const st = this.stateOf(key);
    const type = st.type as ReportType | '';
    if (!type) return;
    st.detail = this.defaultDetailFor(type);
    this.loadRemoteOptions(key, type);
    // Live table appears without Generate: fetch preview immediately
    // in parallel with filter-option loading (independent states).
    this.loadPreview(key);
  }

  private loadRemoteOptions(key: string, type: ReportType): void {
    const st = this.stateOf(key);
    const fields = (FILTERS_BY_TYPE[type] ?? []).filter(
      (f) => f.kind === 'remote',
    );
    st.remoteOptions = {};
    if (fields.length === 0) {
      st.loadingOptions = false;
      return;
    }
    st.loadingOptions = true;
    forkJoin(
      Object.fromEntries(
        fields.map((field) => [
          field.key,
          this.reports.getOptions(field.key, type).pipe(
            map((res) => res?.values ?? []),
            catchError(() => of([] as string[])),
          ),
        ]),
      ),
    )
      .pipe(finalize(() => {
        st.loadingOptions = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (values) => {
          st.remoteOptions = values as Record<string, string[]>;
          this.cdr.markForCheck();
        },
        error: () => undefined,
      });
  }

  // ============================================================
  // LIVE PREVIEW (stateless table, no Generate required)
  // ============================================================

  private buildParameters(tab: WorkspaceTab, st: ReportTabState): {
    parameters: Record<string, unknown>;
    error: string | null;
  } {
    const fields = this.filtersFor(tab, st);
    const dateFrom = st.appliedValues['date_from'] || '';
    const dateTo = st.appliedValues['date_to'] || '';
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return {
        parameters: {},
        error: 'The from date must be on or before the to date.',
      };
    }
    const parameters: Record<string, unknown> = {};
    for (const field of fields) {
      const value = st.appliedValues[field.key];
      if (value === '' || value === null || value === undefined) continue;
      parameters[field.key] =
        field.kind === 'number' ? Number(value) : String(value).trim();
    }
    return { parameters, error: null };
  }

  loadPreview(key: string): void {
    const tab = this.tabs.find((t) => t.key === key);
    const st = this.stateOf(key);
    if (!tab || tab.kind !== 'report' || !st.type) return;
    const built = this.buildParameters(tab, st);
    if (built.error) {
      st.previewError = built.error;
      st.previewLoading = false;
      return;
    }
    const seq = (this.previewSeq.get(key) ?? 0) + 1;
    this.previewSeq.set(key, seq);
    st.previewLoading = true;
    st.previewError = null;
    this.cdr.markForCheck();
    this.reports
      .getPreview(st.type, st.detail || null, built.parameters)
      .pipe(
        finalize(() => {
          if (this.previewSeq.get(key) === seq) {
            st.previewLoading = false;
            this.cdr.markForCheck();
          }
        }),
      )
      .subscribe({
        next: (dataset) => {
          if (this.previewSeq.get(key) !== seq) return;
          st.dataset = dataset;
          st.previewLoaded = true;
          st.previewError = null;
          st.page = 1;
          st.sortCol = null;
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (this.previewSeq.get(key) !== seq) return;
          st.previewError = this.safeMessage(err, 'Unable to load report data.');
          this.cdr.markForCheck();
        },
      });
  }

  retryPreview(key: string): void {
    this.loadPreview(key);
  }

  // ============================================================
  // EXPORT (official PDF/Excel output via existing generation API)
  // ============================================================

  exportReport(key: string, format: ReportFormat): void {
    const tab = this.tabs.find((t) => t.key === key);
    const st = this.stateOf(key);
    if (!tab || tab.kind !== 'report' || !st.type || st.exportingFormat) return;
    const built = this.buildParameters(tab, st);
    if (built.error) {
      st.error = built.error;
      st.exportOpen = false;
      this.toast.error('Export failed', built.error);
      return;
    }
    st.error = null;
    st.exportingFormat = format;
    st.exportOpen = false;
    this.cdr.markForCheck();
    this.reports
      .generateReport({
        report_type: st.type,
        report_format: format,
        title: null,
        detail: st.detail || null,
        parameters: built.parameters,
      })
      .pipe(
        finalize(() => {
          st.exportingFormat = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => {
          const body = response.body;
          const fallback = `report_export.${format === 'EXCEL' ? 'xlsx' : 'pdf'}`;
          const filename = this.reports.filenameFromDisposition(
            response.headers.get('Content-Disposition'),
            fallback,
          );
          if (body) {
            this.saveBlob(body, filename);
            if (format === 'PDF') {
              this.toast.success('Success', 'PDF downloaded successfully.');
            } else {
              this.toast.success('Success', 'Excel downloaded successfully.');
            }
          } else if (format === 'PDF') {
            this.toast.error('Export failed', 'PDF export failed. Please try again.');
          } else {
            this.toast.error('Export failed', 'Excel export failed. Please try again.');
          }
          // The live table stays as-is: exporting never injects a
          // generated-report card into the page.
        },
        error: (err) => {
          this.decodeBlobError(err, 'Export failed.').then((message) => {
            st.error = message;
            if (format === 'PDF') {
              this.toast.error('Export failed', 'PDF export failed. Please try again.');
            } else {
              this.toast.error('Export failed', 'Excel export failed. Please try again.');
            }
            this.cdr.markForCheck();
          });
        },
      });
  }

  isExporting(st: ReportTabState): boolean {
    return st.exportingFormat !== null;
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ============================================================
  // REPORT TAB: TABLE (columns, search, sort, pagination)
  // ============================================================

  visibleHeaders(st: ReportTabState): string[] {
    const headers = st.dataset?.sections?.[0]?.headers ?? [];
    return headers.filter((h) => !st.hiddenCols.includes(h));
  }

  allHeaders(st: ReportTabState): string[] {
    return st.dataset?.sections?.[0]?.headers ?? [];
  }

  toggleColumn(st: ReportTabState, header: string): void {
    st.hiddenCols = st.hiddenCols.includes(header)
      ? st.hiddenCols.filter((h) => h !== header)
      : [...st.hiddenCols, header];
    st.page = 1;
  }

  resetColumns(st: ReportTabState): void {
    st.hiddenCols = [];
    st.page = 1;
  }

  onSearchInput(st: ReportTabState): void {
    // Client-side search over the loaded dataset: no request per
    // keystroke, just reset to the first page.
    st.page = 1;
  }

  filteredRows(st: ReportTabState): unknown[][] {
    const rows = st.dataset?.sections?.[0]?.rows ?? [];
    const q = st.search.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = rows.filter((row) =>
        row.some((cell) => String(cell ?? '').toLowerCase().includes(q)),
      );
    }
    if (st.sortCol !== null) {
      const col = st.sortCol;
      const dir = st.sortDir;
      out = [...out].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        const an = Number(av);
        const bn = Number(bv);
        if (av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn)) {
          return (an - bn) * dir;
        }
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      });
    }
    return out;
  }

  pagedRows(st: ReportTabState): unknown[][] {
    const rows = this.filteredRows(st);
    const start = (st.page - 1) * st.pageSize;
    return rows.slice(start, start + st.pageSize);
  }

  totalPages(st: ReportTabState): number {
    return Math.max(1, Math.ceil(this.filteredRows(st).length / st.pageSize));
  }

  pageNumbers(st: ReportTabState): number[] {
    const total = this.totalPages(st);
    const current = Math.min(Math.max(1, st.page), total);
    let start = Math.max(1, Math.min(current - 2, total - 4));
    const end = Math.min(total, start + 4);
    start = Math.max(1, end - 4);
    const pages: number[] = [];
    for (let p = start; p <= end; p += 1) {
      pages.push(p);
    }
    return pages;
  }

  goToPage(st: ReportTabState, page: number): void {
    const total = this.totalPages(st);
    st.page = Math.min(Math.max(1, page), total);
  }

  pageRangeText(st: ReportTabState): string {
    const total = this.filteredRows(st).length;
    if (total === 0) return '0 records';
    const start = (st.page - 1) * st.pageSize + 1;
    const end = Math.min(total, st.page * st.pageSize);
    const label = st.type === 'USER_REPORT' ? 'users' : 'records';
    return `Showing ${start} to ${end} of ${total} ${label}`;
  }

  sortBy(st: ReportTabState, col: number): void {
    if (st.sortCol === col) {
      st.sortDir = st.sortDir === 1 ? -1 : 1;
    } else {
      st.sortCol = col;
      st.sortDir = 1;
    }
    st.page = 1;
  }

  statusBadgeClass(value: unknown): string {
    const slug = String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug ? `status-badge status-status-${slug}` : '';
  }

  isStatusColumn(header: string): boolean {
    return header.trim().toLowerCase() === 'status';
  }

  headerLabel(header: string): string {
    return header
      .replace(/_/g, ' ')
      .replace(/\bid\b/gi, 'ID')
      .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  }

  summaryCards(st: ReportTabState): [string, number][] {
    return (st.dataset?.summary ?? []).slice(0, 4);
  }

  kpiIcon(index: number, tabKey: string): string {
    if (tabKey === 'user') {
      return ['group', 'check_circle', 'cancel', 'person_add'][index] ?? 'insights';
    }
    return ['insights', 'check_circle', 'pending', 'bar_chart'][index] ?? 'insights';
  }

  kpiIconClass(index: number): string {
    return ['stat-icon--blue', 'stat-icon--green', 'stat-icon--orange', 'stat-icon--purple'][index] ?? 'stat-icon--blue';
  }

  kpiSub(index: number, tabKey: string): string {
    if (tabKey === 'user') {
      return ['All registered users', 'Currently active', 'Currently inactive', 'Current period'][index] ?? '';
    }
    return ['Overview metric', 'Detail metric', 'Detail metric', 'Detail metric'][index] ?? '';
  }

  searchPlaceholder(tab: WorkspaceTab): string {
    switch (tab.key) {
      case 'user':
        return 'Search users by name, email, or organization...';
      case 'policy':
        return 'Search policies by title, ministry, or state...';
      case 'scheme':
        return 'Search schemes by name, ministry, or state...';
      case 'government':
        return 'Search ministries or departments...';
      case 'state':
        return 'Search states...';
      case 'activity':
        return 'Search activity by action or entity...';
      case 'analytics':
        return 'Search metrics...';
      case 'audit':
        return 'Search audit events by action or entity...';
      default:
        return `Search ${tab.title.toLowerCase()}...`;
    }
  }

  tableTitle(tab: WorkspaceTab, st: ReportTabState): string {
    if (st.type && this.typeTitle(st.type as ReportType) !== st.type) {
      return this.typeTitle(st.type as ReportType);
    }
    return tab.title;
  }

  tableDescription(tab: WorkspaceTab): string {
    switch (tab.key) {
      case 'user':
        return 'View and export user-related reports with detailed information.';
      case 'policy':
        return 'View and export policy portfolio with status and distribution.';
      case 'scheme':
        return 'View and export scheme portfolio with status and timelines.';
      case 'government':
        return 'Ministry and department aggregations within your scope.';
      case 'state':
        return 'State-wise policy and scheme distribution within your scope.';
      case 'activity':
        return 'Audit and search activity within your scope.';
      case 'analytics':
        return 'Platform analytics snapshot within your scope.';
      case 'audit':
        return 'System audit trail for administrators.';
      default:
        return tab.description;
    }
  }

  // ============================================================
  // NOTIFICATIONS TAB (government operational scope)
  // ============================================================

  loadNotifications(): void {
    const st = this.notifState;
    st.loading = true;
    st.error = null;
    this.notifications
      .getNotifications({
        search: st.search.trim() || undefined,
        category: st.category.trim() || undefined,
        is_read:
          st.readFilter === 'ALL'
            ? undefined
            : st.readFilter === 'READ'
              ? true
              : false,
        page: st.page,
        page_size: st.pageSize,
        sort_by: 'latest',
      })
      .pipe(
        finalize(() => {
          st.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          st.items = res?.items ?? [];
          st.total = res?.total ?? 0;
          st.page = res?.page ?? 1;
          st.totalPages = res?.total_pages ?? 1;
          st.unread = res?.summary?.unread ?? res?.unread_count ?? 0;
          st.read = res?.summary?.read ?? 0;
          st.thisWeek = res?.summary?.this_week ?? 0;
          this.cdr.markForCheck();
        },
        error: (err) => {
          st.error = this.safeMessage(err, 'Could not load notifications.');
          this.cdr.markForCheck();
        },
      });
  }

  notifSearch(): void {
    this.notifState.page = 1;
    this.loadNotifications();
  }

  notifReset(): void {
    this.notifState = newNotificationsTabState();
    this.loadNotifications();
  }

  notifPrev(): void {
    if (this.notifState.page > 1 && !this.notifState.loading) {
      this.notifState.page -= 1;
      this.loadNotifications();
    }
  }

  notifNext(): void {
    if (
      this.notifState.page < this.notifState.totalPages &&
      !this.notifState.loading
    ) {
      this.notifState.page += 1;
      this.loadNotifications();
    }
  }

  // ============================================================
  // ERRORS
  // ============================================================

  private safeMessage(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detail === 'string' && detail && detail.length < 300) {
      return detail;
    }
    const status = (err as { status?: number })?.status;
    if (status === 401) return 'Your session has expired. Please log in again.';
    if (status === 403)
      return 'Your role is not allowed to generate this report type.';
    if (status === 404) return 'The requested report was not found.';
    if (status === 409) return 'The report is not ready yet.';
    if (status === 422)
      return 'Some filters are invalid. Please review them and retry.';
    return fallback;
  }

  private async decodeBlobError(
    err: unknown,
    fallback: string,
  ): Promise<string> {
    const raw = (err as { error?: unknown })?.error;
    if (raw instanceof Blob) {
      try {
        const parsed = JSON.parse(await raw.text()) as { detail?: unknown };
        if (
          typeof parsed.detail === 'string' &&
          parsed.detail &&
          parsed.detail.length < 300
        ) {
          return parsed.detail;
        }
      } catch {
        // fall through to status mapping below
      }
    }
    return this.safeMessage(err, fallback);
  }
}
