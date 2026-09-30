import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, of } from 'rxjs';
import { ReportService } from '../../../core/services/report.service';
import { Auth } from '../../../core/services/auth';
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from '../../../shared/components/breadcrumb/breadcrumb.component';
import {
  Report,
  ReportFormat,
  ReportType,
} from '../../../core/models/report.model';
import {
  REPORT_CATEGORIES,
  REPORT_TYPE_META,
  ReportCategory,
  detailLabel,
  FILTERS_BY_TYPE,
  FilterField,
} from '../report-catalog';



const ALL_FILTER_KEYS = [
  'date_from',
  'date_to',
  'state',
  'ministry',
  'department',
  'category',
  'sector',
  'status',
  'policy_id',
  'scheme_id',
  'user_id',
  'role',
  'district',
  'organization',
  'action',
  'entity_type',
];

@Component({
  selector: 'app-report-generate',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BreadcrumbComponent],
  styleUrl: '../reports-shared.scss',
  template: `
    <div class="reports-page">
      <app-breadcrumb [items]="breadcrumbItems"></app-breadcrumb>
      <header class="page-header">
        <div class="header-content">
          <div class="header-main">
            <h1>Generate Report</h1>
            <p>Choose a category, refine the detail and filters, then generate.</p>
          </div>
          <a class="back-button" routerLink="..">
            <span class="material-icons back-icon" aria-hidden="true">
              arrow_back
            </span>
            <span>Back</span>
          </a>
        </div>
      </header>

      @if (initializing()) {
        <section class="state-card">
          <div class="state-icon">
            <span class="material-icons" aria-hidden="true">hourglass_top</span>
          </div>
          <h2>Loading report options…</h2>
          <p>Fetching available report types and filters.</p>
        </section>
      } @else if (typesError) {
        <section class="state-card error-state">
          <div class="state-icon">
            <span class="material-icons" aria-hidden="true">error_outline</span>
          </div>
          <h2>Unable to Load Report Types</h2>
          <p>{{ typesError }}</p>
          <button type="button" class="retry-button" (click)="loadTypes()">
            Try Again
          </button>
        </section>
      } @else {
        <section class="filter-panel">
        <div class="filter-panel-header">
          <div class="filter-title-group">
            <span class="filter-icon-badge">
              <span class="material-icons" aria-hidden="true">
                description
              </span>
            </span>
            <div class="filter-title-text">
              <h3>Report configuration</h3>
              <p>Category, detail, format and filters.</p>
            </div>
          </div>
        </div>

        <form [formGroup]="form" (ngSubmit)="generate()">
          <div class="filters-grid">
            <div class="filter-field">
              <label for="report-category">
                <span>Category</span>
              </label>
              <select id="report-category" formControlName="report_category">
                @for (category of visibleCategories; track category.key) {
                  <option [value]="category.key">{{ category.title }}</option>
                }
              </select>
            </div>

            @if (visibleTypes.length > 1) {
              <div class="filter-field">
                <label for="report-type">
                  <span>Report type</span>
                </label>
                <select id="report-type" formControlName="report_type">
                  @for (type of visibleTypes; track type) {
                    <option [value]="type">{{ typeTitle(type) }}</option>
                  }
                </select>
              </div>
            }

            @if (availableDetails.length > 1) {
              <div class="filter-field">
                <label for="report-detail">
                  <span>Detail</span>
                </label>
                <select id="report-detail" formControlName="report_detail">
                  @for (detail of availableDetails; track detail) {
                    <option [value]="detail">{{ detailLabel(detail) }}</option>
                  }
                </select>
              </div>
            }

            <div class="filter-field">
              <label for="report-format">
                <span>Format</span>
              </label>
              <select id="report-format" formControlName="report_format">
                <option value="PDF">PDF</option>
                <option value="EXCEL">Excel</option>
              </select>
            </div>

            <div class="filter-field">
              <label for="report-title">
                <span>Title (optional)</span>
              </label>
              <input
                type="text"
                id="report-title"
                formControlName="title"
                maxlength="255"
                placeholder="Report title"
              />
            </div>

            @for (field of activeFilters; track field.key) {
              <div class="filter-field">
                <label [for]="'filter-' + field.key">
                  <span>{{ field.label }}</span>
                </label>
                @if (field.kind === 'select') {
                  <select [id]="'filter-' + field.key" [formControlName]="field.key">
                    <option value="">Any</option>
                    @for (option of field.staticOptions; track option) {
                      <option [value]="option">{{ option }}</option>
                    }
                  </select>
                } @else if (field.kind === 'date') {
                  <input
                    type="date"
                    [id]="'filter-' + field.key"
                    [formControlName]="field.key"
                  />
                } @else if (field.kind === 'number') {
                  <input
                    type="number"
                    min="1"
                    [id]="'filter-' + field.key"
                    [formControlName]="field.key"
                  />
                } @else if (
                  field.kind === 'remote' && remoteOptions[field.key]?.length
                ) {
                  <select [id]="'filter-' + field.key" [formControlName]="field.key">
                    <option value="">Any</option>
                    @for (option of remoteOptions[field.key]; track option) {
                      <option [value]="option">{{ option }}</option>
                    }
                  </select>
                } @else {
                  <input
                    type="text"
                    [id]="'filter-' + field.key"
                    [formControlName]="field.key"
                    [placeholder]="loadingOptions ? 'Loading options…' : 'Any'"
                  />
                }
              </div>
            }
          </div>

          @if (formError) {
            <p class="filter-error">{{ formError }}</p>
          }

          <div class="filter-actions">
            <button
              type="submit"
              class="btn-primary"
              [disabled]="form.invalid || generating() || initializing()"
            >
              {{ generating() ? 'Generating…' : 'Generate Report' }}
            </button>
          </div>
        </form>
      </section>
      }

      @if (result(); as r) {
        <section class="results-section">
          <article class="portal-card">
            <div class="card-icon" aria-hidden="true">
              <span class="material-icons">description</span>
            </div>
            <div class="card-content">
              <div class="card-title-row">
                <h3>{{ r.title || r.report_type }}</h3>
                <span
                  class="metadata-item status-badge status-status-{{
                    r.status.toLowerCase()
                  }}"
                >
                  {{ r.status }}
                </span>
              </div>
              <div class="metadata">
                <span class="metadata-item">ID {{ r.report_id }}</span>
                <span class="metadata-item">{{ r.report_type }}</span>
                <span class="metadata-item">{{ r.report_format }}</span>
                <span class="metadata-item">{{ r.generated_at }}</span>
                <span class="metadata-item">
                  {{ formatSize(r.file_size) }}
                </span>
              </div>
              @if (r.status !== 'COMPLETED' && r.status !== 'PENDING') {
                <p class="filter-error">
                  {{
                    r.error_message ||
                      'Report generation failed. Please retry.'
                  }}
                </p>
              }
              @if (downloadError) {
                <p class="filter-error">{{ downloadError }}</p>
              }
            </div>
            <div class="card-actions">
              @if (r.status === 'COMPLETED') {
                <a
                  class="btn-secondary"
                  [routerLink]="['..', r.report_id]"
                >
                  View
                </a>
                <button
                  type="button"
                  class="btn-primary"
                  (click)="download()"
                  [disabled]="downloading()"
                >
                  {{ downloading() ? 'Downloading…' : 'Download' }}
                </button>
              } @else if (r.status === 'PENDING') {
                <span class="metadata-item">Generating…</span>
              }
            </div>
          </article>
        </section>
      }
    </div>
  `,
})
export class ReportGenerateComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly reports = inject(ReportService);
  private readonly auth = inject(Auth);

  /** Breadcrumb trail: Home > Reports > Generate Report. */
  get breadcrumbItems(): BreadcrumbItem[] {
    const prefix = this.reportsPrefix();
    return [
      { label: 'Home', route: ['/dashboard', prefix] },
      { label: 'Reports', route: ['/dashboard', prefix, 'reports'] },
      { label: 'Generate Report' },
    ];
  }

  private reportsPrefix(): string {
    const role = (this.auth.getUserRole() || '').toUpperCase();
    return role === 'GOVERNMENT_OFFICIAL' || role === 'GOVERNMENT'
      ? 'government'
      : 'admin';
  }

  form!: FormGroup;
  visibleCategories: ReportCategory[] = [];
  visibleTypes: ReportType[] = [];
  availableDetails: string[] = [];
  activeFilters: FilterField[] = [];
  remoteOptions: Record<string, string[]> = {};
  loadingOptions = false;
  readonly initializing = signal(true);
  readonly generating = signal(false);
  formError: string | null = null;
  typesError: string | null = null;
  readonly result = signal<Report | null>(null);
  readonly downloading = signal(false);
  downloadError: string | null = null;

  private detailsByType: Partial<Record<ReportType, string[]>> = {};

  ngOnInit(): void {
    const controls: Record<string, unknown[]> = {
      report_category: ['', Validators.required],
      report_type: ['', Validators.required],
      report_detail: [''],
      report_format: ['PDF' as ReportFormat, Validators.required],
      title: [''],
    };
    for (const key of ALL_FILTER_KEYS) {
      controls[key] = [''];
    }
    this.form = this.fb.group(controls);
    this.form
      .get('report_category')
      ?.valueChanges.subscribe(() => this.onCategoryChange());
    this.form
      .get('report_type')
      ?.valueChanges.subscribe(() => this.onTypeChange());
    this.loadTypes();
  }

  typeTitle(type: ReportType): string {
    return REPORT_TYPE_META[type]?.title ?? type;
  }

  detailLabel(detail: string): string {
    return detailLabel(detail);
  }

  loadTypes(): void {
    this.typesError = null;
    this.initializing.set(true);
    this.reports
      .getTypes()
      .pipe(finalize(() => undefined))
      .subscribe({
        next: (res) => {
          const allowed = new Set(res?.report_types ?? []);
          this.detailsByType = res?.details ?? {};
          this.visibleCategories = REPORT_CATEGORIES.map((category) => ({
            ...category,
            types: category.types.filter((type) => allowed.has(type)),
          })).filter((category) => category.types.length > 0);
          const requestedType = this.route.snapshot.queryParamMap.get(
            'type',
          ) as ReportType | null;
          const requestedDetail =
            this.route.snapshot.queryParamMap.get('detail');
          let categoryKey = this.visibleCategories[0]?.key ?? '';
          let typeValue = this.visibleCategories[0]?.types[0];
          if (requestedType && allowed.has(requestedType)) {
            const owner = this.visibleCategories.find((category) =>
              category.types.includes(requestedType),
            );
            if (owner) {
              categoryKey = owner.key;
              typeValue = requestedType;
            }
          }
          // emitEvent:false — valueChanges subscriptions stay quiet during
          // init; refreshTypeState below runs exactly once.
          if (categoryKey) {
            this.form
              .get('report_category')
              ?.setValue(categoryKey, { emitEvent: false });
          }
          if (typeValue) {
            this.form
              .get('report_type')
              ?.setValue(typeValue, { emitEvent: false });
            // Render the complete form immediately; remote option lists
            // populate each dropdown independently as they arrive.
            this.refreshTypeState(requestedDetail);
            this.initializing.set(false);
          } else {
            this.initializing.set(false);
          }
        },
        error: (err) => {
          this.typesError = this.safeMessage(err, 'Could not load report types.');
          this.initializing.set(false);
        },
      });
  }

  onCategoryChange(): void {
    const category = this.visibleCategories.find(
      (entry) => entry.key === this.form.get('report_category')?.value,
    );
    this.visibleTypes = category?.types ?? [];
    const current = this.form.get('report_type')?.value as ReportType | '';
    if (!this.visibleTypes.includes(current as ReportType)) {
      // emitEvent:false — the subscription would otherwise refresh twice.
      this.form
        .get('report_type')
        ?.setValue(this.visibleTypes[0] ?? '', { emitEvent: false });
    }
    this.refreshTypeState();
  }

  onTypeChange(): void {
    this.refreshTypeState();
  }

  private refreshTypeState(
    preserveDetail?: string | null,
    onDone?: () => void,
  ): void {
    const type = this.form.get('report_type')?.value as ReportType | '';
    if (!type) {
      this.availableDetails = [];
      this.activeFilters = [];
      onDone?.();
      return;
    }
    this.availableDetails = this.detailsByType[type] ?? ['overview'];
    const wanted =
      preserveDetail && this.availableDetails.includes(preserveDetail)
        ? preserveDetail
        : this.availableDetails[0] ?? 'overview';
    this.form.get('report_detail')?.setValue(wanted, { emitEvent: false });
    this.activeFilters = FILTERS_BY_TYPE[type] ?? [];
    this.loadRemoteOptionsCombined(type, onDone);
  }

  private loadRemoteOptionsCombined(type: ReportType, onDone?: () => void): void {
    const remoteFields = this.activeFilters.filter(
      (field) => field.kind === 'remote',
    );
    this.remoteOptions = {};
    if (remoteFields.length === 0) {
      this.loadingOptions = false;
      onDone?.();
      return;
    }
    this.loadingOptions = true;
    // One batched forkJoin per refresh — a single completion point, no
    // per-field counter races. Per-field errors fall back to free text.
    forkJoin(
      Object.fromEntries(
        remoteFields.map((field) => [
          field.key,
          this.reports.getOptions(field.key, type).pipe(
            map((res) => res?.values ?? []),
            catchError(() => of([] as string[])),
          ),
        ]),
      ),
    )
      .pipe(finalize(() => (this.loadingOptions = false)))
      .subscribe({
        next: (values) => {
          this.remoteOptions = values as Record<string, string[]>;
          onDone?.();
        },
        error: () => {
          onDone?.();
        },
      });
  }

  generate(): void {
    this.formError = null;
    this.downloadError = null;
    if (this.form.invalid || this.generating() || this.initializing()) {
      return;
    }
    const raw = this.form.getRawValue();
    const dateFrom: string = raw.date_from || '';
    const dateTo: string = raw.date_to || '';
    if (dateFrom && dateTo && dateFrom > dateTo) {
      this.formError = 'The from date must be on or before the to date.';
      return;
    }
    const parameters: Record<string, unknown> = {};
    for (const field of this.activeFilters) {
      const value = raw[field.key];
      if (value === '' || value === null || value === undefined) {
        continue;
      }
      parameters[field.key] =
        field.kind === 'number' ? Number(value) : String(value).trim();
    }
    this.generating.set(true);
    this.reports
      .generateReport({
        report_type: raw.report_type,
        report_format: raw.report_format,
        title: raw.title?.trim() || null,
        detail: raw.report_detail || null,
        parameters,
      })
      // finalize is the authoritative cleanup point: the button always
      // returns to "Generate Report", on success, error, or termination.
      .pipe(finalize(() => this.generating.set(false)))
      .subscribe({
        next: (response) => {
          // The backend returns the file bytes, but generation must NOT
          // trigger a browser download. Only load the persisted metadata
          // so the result card offers explicit View / Download actions.
          const reportId = Number(response.headers.get('X-Report-Id'));
          if (Number.isFinite(reportId) && reportId > 0) {
            this.reports.getReport(reportId).subscribe({
              next: (report) => {
                this.result.set(report);
              },
              error: () => {
                this.result.set(null);
              },
            });
          } else {
            this.result.set(null);
          }
        },
        error: (err) => {
          this.decodeBlobError(err, 'Report generation failed.').then(
            (message) => {
              this.formError = message;
            },
          );
        },
      });
  }

  download(): void {
    if (!this.result() || this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.downloadError = null;
    this.reports.downloadReport(this.result()!.report_id).subscribe({
      next: (blob) => {
        this.saveBlob(
          blob,
          `report_${this.result()!.report_id}.${
            this.result()!.report_format === 'EXCEL' ? 'xlsx' : 'pdf'
          }`,
        );
        this.downloading.set(false);
      },
      error: (err) => {
        this.downloadError = this.safeMessage(err, 'Download failed.');
        this.downloading.set(false);
      },
    });
  }

  formatSize(size: number | null): string {
    if (size === null || size === undefined) {
      return '—';
    }
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Error bodies arrive as Blobs (responseType: 'blob') on failure.
   * Decode JSON error details safely; never surface raw bytes.
   */
  private async decodeBlobError(err: unknown, fallback: string): Promise<string> {
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

  private safeMessage(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detail === 'string' && detail && detail.length < 300) {
      return detail;
    }
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      return 'Your session has expired. Please log in again.';
    }
    if (status === 403) {
      return 'Your role is not allowed to generate this report type.';
    }
    if (status === 404) {
      return 'The requested report was not found.';
    }
    if (status === 409) {
      return 'The report is not ready for download yet.';
    }
    if (status === 422) {
      return 'Some filters are invalid. Please review them and retry.';
    }
    return fallback;
  }
}
