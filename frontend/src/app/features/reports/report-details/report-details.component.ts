import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ReportService } from '../../../core/services/report.service';
import { Report } from '../../../core/models/report.model';

@Component({
  selector: 'app-report-details',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrl: '../reports-shared.scss',
  template: `
    <div class="reports-page">
      <header class="page-header">
        <div class="header-content">
          <div class="header-main">
            <h1>Report Details</h1>
            <p>Metadata, filters and download for a single generated report.</p>
          </div>
          <a class="back-button" routerLink="..">
            <span class="material-icons back-icon" aria-hidden="true">
              arrow_back
            </span>
            <span>Back</span>
          </a>
        </div>
      </header>

      @if (loading) {
        <div class="skeleton-list" aria-label="Loading report details">
          <div class="skeleton-card" aria-hidden="true">
            <div class="skeleton skeleton-icon"></div>
            <div class="skeleton-body">
              <div class="skeleton skeleton-title"></div>
              <div class="skeleton skeleton-line"></div>
            </div>
          </div>
        </div>
      } @else if (error) {
        <section class="state-card error-state">
          <div class="state-icon">
            <span class="material-icons" aria-hidden="true">error_outline</span>
          </div>
          <h2>Unable to Load Report</h2>
          <p>{{ error }}</p>
          <button type="button" class="retry-button" (click)="reload()">
            Try Again
          </button>
        </section>
      } @else if (report) {
        <section class="results-section">
          <article class="portal-card">
            <div class="card-icon" aria-hidden="true">
              <span class="material-icons">description</span>
            </div>
            <div class="card-content">
              <div class="card-title-row">
                <h3>{{ report.title || report.report_type }}</h3>
                <span
                  class="metadata-item status-badge status-status-{{
                    report.status.toLowerCase()
                  }}"
                >
                  {{ report.status }}
                </span>
              </div>
              <div class="metadata">
                <span class="metadata-item">ID {{ report.report_id }}</span>
                <span class="metadata-item">{{ report.report_type }}</span>
                <span class="metadata-item">{{ report.report_format }}</span>
                <span class="metadata-item">{{ report.generated_at }}</span>
                <span class="metadata-item">
                  {{ formatSize(report.file_size) }}
                </span>
              </div>
              <dl class="detail-list">
                <div class="detail-row">
                  <dt class="detail-term">Filters</dt>
                  <dd class="detail-value">
                    @if (filterEntries.length > 0) {
                      @for (entry of filterEntries; track entry[0]) {
                        {{ entry[0] }}: {{ entry[1] }}@if (!$last) {
                          <span> · </span>
                        }
                      }
                    } @else {
                      Full scoped dataset (no filters).
                    }
                  </dd>
                </div>
              </dl>
              @if (report.status !== 'COMPLETED' && report.status !== 'PENDING') {
                <p class="filter-error">
                  {{
                    report.error_message ||
                      'Report generation failed. Please regenerate.'
                  }}
                </p>
              }
              @if (downloadError) {
                <p class="filter-error">{{ downloadError }}</p>
              }
            </div>
            <div class="card-actions">
              @if (report.status === 'COMPLETED') {
                <button
                  type="button"
                  class="btn-primary"
                  (click)="download()"
                  [disabled]="downloading"
                >
                  {{ downloading ? 'Downloading…' : 'Download' }}
                </button>
              } @else if (report.status === 'PENDING') {
                <span class="metadata-item">Generating…</span>
              }
            </div>
          </article>
        </section>
      }
    </div>
  `,
})
export class ReportDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reports = inject(ReportService);

  report: Report | null = null;
  loading = true;
  error: string | null = null;
  downloading = false;
  downloadError: string | null = null;

  ngOnInit(): void {
    this.reload();
  }

  get filterEntries(): Array<[string, unknown]> {
    return Object.entries(this.report?.parameters ?? {});
  }

  reload(): void {
    const id = Number(this.route.snapshot.paramMap.get('reportId'));
    if (!Number.isFinite(id)) {
      this.error = 'The requested report was not found.';
      this.loading = false;
      return;
    }
    this.loading = true;
    this.error = null;
    this.reports
      .getReport(id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          this.report = res;
        },
        error: (err) => {
          const status = (err as { status?: number })?.status;
          this.error =
            status === 404
              ? 'The requested report was not found.'
              : 'Could not load the report. Please retry.';
        },
      });
  }

  download(): void {
    if (!this.report || this.downloading) {
      return;
    }
    this.downloading = true;
    this.downloadError = null;
    this.reports.downloadReport(this.report.report_id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `report_${this.report!.report_id}.${
          this.report!.report_format === 'EXCEL' ? 'xlsx' : 'pdf'
        }`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.downloading = false;
      },
      error: () => {
        this.downloadError = 'Download failed. Please retry.';
        this.downloading = false;
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
}
