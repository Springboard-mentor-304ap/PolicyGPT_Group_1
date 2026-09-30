import { Component, OnInit, ChangeDetectorRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, of } from 'rxjs';
import { ReportService } from '../../../core/services/report.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Auth } from '../../../core/services/auth';
import {
  Report,
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
  detailLabel,
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
  details: string[];
  detail: string;
  format: ReportFormat;
  title: string;
  values: Record<string, string>;
  remoteOptions: Record<string, string[]>;
  loadingOptions: boolean;
  search: string;
  hiddenCols: string[];
  sortCol: number | null;
  sortDir: 1 | -1;
  page: number;
  pageSize: number;
  dataset: ReportDataset | null;
  report: Report | null;
  generating: boolean;
  exporting: boolean;
  exportOpen: boolean;
  columnsOpen: boolean;
  error: string | null;
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
    details: [],
    detail: 'overview',
    format: 'PDF',
    title: '',
    values: {},
    remoteOptions: {},
    loadingOptions: false,
    search: '',
    hiddenCols: [],
    sortCol: null,
    sortDir: 1,
    page: 1,
    pageSize: 10,
    dataset: null,
    report: null,
    generating: false,
    exporting: false,
    exportOpen: false,
    columnsOpen: false,
    error: null,
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
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrl: '../reports-shared.scss',
  templateUrl: './report-dashboard.component.html',
})
export class ReportDashboardComponent implements OnInit {
  private readonly reports = inject(ReportService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(Auth);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly initializing = signal(true);
  typesError: string | null = null;
  roleLabel = 'Dashboard';

  tabs: WorkspaceTab[] = [];
  activeTabKey = '';
  private readonly tabState = new Map<string, ReportTabState>();
  private detailsByType: Partial<Record<ReportType, string[]>> = {};
  private allowedTypes = new Set<ReportType>();

  notifState: NotificationsTabState = newNotificationsTabState();

  // ============================================================
  // INIT
  // ============================================================

  ngOnInit(): void {
    const role = (this.auth.getUserRole() || '').toUpperCase();
    this.roleLabel =
      role === 'ADMIN' || role === 'ADMINISTRATOR'
        ? 'Admin Dashboard'
        : role === 'GOVERNMENT_OFFICIAL' || role === 'GOVERNMENT'
          ? 'Government Dashboard'
          : role === 'RESEARCHER'
            ? 'Researcher Dashboard'
            : role === 'ORGANIZATION' || role === 'ORGANISATION'
              ? 'Organization Dashboard'
              : 'Dashboard';
    this.loadTypes();
  }

  loadTypes(): void {
    this.typesError = null;
    this.initializing.set(true);
    this.reports.getTypes().subscribe({
      next: (res) => {
        this.allowedTypes = new Set(res?.report_types ?? []);
        this.detailsByType = res?.details ?? {};
        this.tabs = REPORT_CATEGORIES.map((c) => ({
          key: c.key,
          title: c.title,
          description: c.description,
          icon: c.icon,
          kind: 'report' as const,
          types: c.types.filter((t) => this.allowedTypes.has(t)),
        })).filter((t) => t.types.length > 0);
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
        if (this.tabs.length > 0) {
          this.selectTab(this.tabs[0].key);
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
  // TABS
  // ============================================================

  get activeTab(): WorkspaceTab | undefined {
    return this.tabs.find((t) => t.key === this.activeTabKey);
  }

  selectTab(key: string): void {
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
  // REPORT TAB: FILTERS + OPTIONS
  // ============================================================

  filtersFor(tab: WorkspaceTab, st: ReportTabState): FilterField[] {
    if (!st.type) return [];
    return FILTERS_BY_TYPE[st.type] ?? [];
  }

  onTabTypeChange(key: string): void {
    const st = this.stateOf(key);
    st.detail = 'overview';
    st.values = {};
    st.page = 1;
    this.refreshTabType(key);
  }

  private refreshTabType(key: string): void {
    const st = this.stateOf(key);
    const type = st.type as ReportType | '';
    if (!type) return;
    st.details = this.detailsByType[type] ?? ['overview'];
    if (!st.details.includes(st.detail)) {
      st.detail = st.details[0] ?? 'overview';
    }
    this.loadRemoteOptions(key, type);
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
      .pipe(finalize(() => (st.loadingOptions = false)))
      .subscribe({
        next: (values) => {
          st.remoteOptions = values as Record<string, string[]>;
          this.cdr.markForCheck();
        },
        error: () => undefined,
      });
  }

  resetTabFilters(key: string): void {
    const st = this.stateOf(key);
    st.values = {};
    st.search = '';
    st.hiddenCols = [];
    st.sortCol = null;
    st.page = 1;
    st.error = null;
  }

  // ============================================================
  // REPORT TAB: GENERATE + EXPORT
  // ============================================================

  private buildParameters(tab: WorkspaceTab, st: ReportTabState): {
    parameters: Record<string, unknown>;
    error: string | null;
  } {
    const fields = this.filtersFor(tab, st);
    const dateFrom = st.values['date_from'] || '';
    const dateTo = st.values['date_to'] || '';
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return {
        parameters: {},
        error: 'The from date must be on or before the to date.',
      };
    }
    const parameters: Record<string, unknown> = {};
    for (const field of fields) {
      const value = st.values[field.key];
      if (value === '' || value === null || value === undefined) continue;
      parameters[field.key] =
        field.kind === 'number' ? Number(value) : String(value).trim();
    }
    return { parameters, error: null };
  }

  generate(key: string): void {
    const tab = this.tabs.find((t) => t.key === key);
    const st = this.stateOf(key);
    if (!tab || tab.kind !== 'report' || !st.type || st.generating) return;
    const built = this.buildParameters(tab, st);
    if (built.error) {
      st.error = built.error;
      return;
    }
    st.error = null;
    st.generating = true;
    this.reports
      .generateReport({
        report_type: st.type,
        report_format: 'PDF',
        title: st.title?.trim() || null,
        detail: st.detail || null,
        parameters: built.parameters,
      })
      .pipe(
        finalize(() => {
          st.generating = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => {
          const reportId = Number(response.headers.get('X-Report-Id'));
          if (Number.isFinite(reportId) && reportId > 0) {
            this.reports.getReportData(reportId).subscribe({
              next: (dataset) => {
                st.dataset = dataset;
                st.report = null;
                st.page = 1;
                st.sortCol = null;
                this.cdr.markForCheck();
                this.reports.getReport(reportId).subscribe({
                  next: (report) => {
                    st.report = report;
                    this.cdr.markForCheck();
                  },
                  error: () => undefined,
                });
              },
              error: () => {
                st.error = 'Report generated but the dataset could not be loaded. See Report History.';
                this.cdr.markForCheck();
              },
            });
          } else {
            st.error = 'Report generation did not return a report ID.';
            this.cdr.markForCheck();
          }
        },
        error: (err) => {
          st.error = this.safeMessage(err, 'Report generation failed.');
          this.cdr.markForCheck();
        },
      });
  }

  exportReport(key: string, format: ReportFormat): void {
    const tab = this.tabs.find((t) => t.key === key);
    const st = this.stateOf(key);
    if (!tab || tab.kind !== 'report' || !st.type || st.exporting) return;
    const built = this.buildParameters(tab, st);
    if (built.error) {
      st.error = built.error;
      st.exportOpen = false;
      return;
    }
    st.error = null;
    st.exporting = true;
    st.exportOpen = false;
    this.cdr.markForCheck();
    this.reports
      .generateReport({
        report_type: st.type,
        report_format: format,
        title: st.title?.trim() || null,
        detail: st.detail || null,
        parameters: built.parameters,
      })
      .pipe(
        finalize(() => {
          st.exporting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => {
          const reportId = Number(response.headers.get('X-Report-Id'));
          if (Number.isFinite(reportId) && reportId > 0) {
            this.reports.downloadReport(reportId).subscribe({
              next: (blob) => {
                this.saveBlob(
                  blob,
                  `report_${reportId}.${format === 'EXCEL' ? 'xlsx' : 'pdf'}`,
                );
              },
              error: (err) => {
                st.error = this.safeMessage(err, 'Export download failed.');
                this.cdr.markForCheck();
              },
            });
          } else {
            st.error = 'Export did not return a report ID.';
            this.cdr.markForCheck();
          }
        },
        error: (err) => {
          this.decodeBlobError(err, 'Export failed.').then((message) => {
            st.error = message;
            this.cdr.markForCheck();
          });
        },
      });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // REPORT TAB: TABLE (columns, search, sort, pagination)
  // ============================================================

  visibleHeaders(st: ReportTabState): string[] {
    const headers = st.dataset?.sections?.[0]?.headers ?? [];
    return headers.filter((h) => !st.hiddenCols.includes(h));
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

  pageRangeText(st: ReportTabState): string {
    const total = this.filteredRows(st).length;
    if (total === 0) return '0 records';
    const start = (st.page - 1) * st.pageSize + 1;
    const end = Math.min(total, st.page * st.pageSize);
    return `${start}–${end} of ${total}`;
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

  detailLabel(detail: string): string {
    return detailLabel(detail);
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
