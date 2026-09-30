import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { finalize } from "rxjs";
import { ReportService } from "../../../core/services/report.service";
import { Report } from "../../../core/models/report.model";
import { Auth } from "../../../core/services/auth";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";

const PAGE_SIZE = 20;

@Component({
  selector: "app-report-history",
  standalone: true,
  imports: [CommonModule, RouterLink, BreadcrumbComponent],
  styleUrl: "../reports-shared.scss",
  template: `
    <div class="reports-page">
      <app-breadcrumb [items]="breadcrumbItems"></app-breadcrumb>
      <header class="page-header">
        <div class="header-content">
          <div class="header-main">
            <h1>Report History</h1>
            <p>Your generated reports. Administrators can see all reports.</p>
          </div>
          <a class="back-button" routerLink="..">
            <span class="material-icons back-icon" aria-hidden="true">
              arrow_back
            </span>
            <span>Back</span>
          </a>
        </div>
      </header>

      @if (loading()) {
        <div class="skeleton-list" aria-label="Loading report history">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-card" aria-hidden="true">
              <div class="skeleton skeleton-icon"></div>
              <div class="skeleton-body">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-line"></div>
              </div>
            </div>
          }
        </div>
      } @else if (error) {
        <section class="state-card error-state">
          <div class="state-icon">
            <span class="material-icons" aria-hidden="true">error_outline</span>
          </div>
          <h2>Unable to Load History</h2>
          <p>{{ error }}</p>
          <button type="button" class="retry-button" (click)="reload()">
            Try Again
          </button>
        </section>
      } @else if (history().length === 0) {
        <section class="empty-state">
          <div class="empty-icon">
            <span class="material-icons" aria-hidden="true">inbox</span>
          </div>
          <h2>No Reports Yet</h2>
          <p>Generate your first report to see it here.</p>
          <a class="btn-primary" routerLink="../generate">Generate Report</a>
        </section>
      } @else {
        <section class="results-section">
          <div class="card-list">
            @for (item of history(); track item.report_id) {
              <article class="portal-card">
                <div class="card-icon" aria-hidden="true">
                  <span class="material-icons">description</span>
                </div>
                <div class="card-content">
                  <div class="card-title-row">
                    <h3>{{ item.title || item.report_type }}</h3>
                    <span
                      class="metadata-item status-badge status-status-{{
                        item.status.toLowerCase()
                      }}"
                    >
                      {{ item.status }}
                    </span>
                  </div>
                  <div class="metadata">
                    <span class="metadata-item">{{ item.report_type }}</span>
                    <span class="metadata-item">{{ item.report_format }}</span>
                    <span class="metadata-item">{{ item.generated_at }}</span>
                    <span class="metadata-item">
                      {{ formatSize(item.file_size) }}
                    </span>
                  </div>
                </div>
                <div class="card-actions">
                  <a
                    class="btn-secondary"
                    [routerLink]="['..', item.report_id]"
                  >
                    View
                  </a>
                  @if (item.status === "COMPLETED") {
                    <button
                      type="button"
                      class="btn-primary"
                      (click)="download(item)"
                      [disabled]="downloadingId() === item.report_id"
                    >
                      {{
                        downloadingId() === item.report_id
                          ? "Downloading…"
                          : "Download"
                      }}
                    </button>
                  }
                </div>
              </article>
            }
          </div>
          <div class="pagination">
            <button
              type="button"
              class="pagination-control"
              (click)="previous()"
              [disabled]="offset === 0 || loading()"
            >
              <span class="material-icons pagination-arrow" aria-hidden="true">
                chevron_left
              </span>
              <span>Previous</span>
            </button>
            <button
              type="button"
              class="pagination-control"
              (click)="next()"
              [disabled]="!hasMore || loading()"
            >
              <span>Next</span>
              <span class="material-icons pagination-arrow" aria-hidden="true">
                chevron_right
              </span>
            </button>
          </div>
          @if (downloadError) {
            <section class="state-card error-state">
              <div class="state-icon">
                <span class="material-icons" aria-hidden="true">
                  error_outline
                </span>
              </div>
              <h2>Download Failed</h2>
              <p>{{ downloadError }}</p>
            </section>
          }
        </section>
      }
    </div>
  `,
})
export class ReportHistoryComponent implements OnInit {
  private readonly reports = inject(ReportService);
  private readonly auth = inject(Auth);

  /** Breadcrumb trail: Home > Reports > Report History. */
  get breadcrumbItems(): BreadcrumbItem[] {
    const prefix = this.reportsPrefix();
    return [
      { label: "Home", route: ["/dashboard", prefix] },
      { label: "Reports", route: ["/dashboard", prefix, "reports"] },
      { label: "Report History" },
    ];
  }

  private reportsPrefix(): string {
    const role = (this.auth.getUserRole() || "").toUpperCase();
    return role === "GOVERNMENT_OFFICIAL" || role === "GOVERNMENT"
      ? "government"
      : "admin";
  }

  readonly history = signal<Report[]>([]);
  readonly loading = signal(true);
  error: string | null = null;
  readonly downloadingId = signal<number | null>(null);
  downloadError: string | null = null;
  hasMore = false;
  offset = 0;
  readonly pageSize = PAGE_SIZE;

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error = null;
    this.reports
      .getHistory(this.pageSize + 1, this.offset)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          const rows = res ?? [];
          this.hasMore = rows.length > this.pageSize;
          this.history.set(rows.slice(0, this.pageSize));
        },
        error: () => {
          this.error = "Could not load report history. Please retry.";
        },
      });
  }

  previous(): void {
    if (this.offset === 0) {
      return;
    }
    this.offset = Math.max(0, this.offset - this.pageSize);
    this.reload();
  }

  next(): void {
    this.offset += this.pageSize;
    this.reload();
  }

  download(item: Report): void {
    if (this.downloadingId() !== null) {
      return;
    }
    this.downloadingId.set(item.report_id);
    this.downloadError = null;
    this.reports.downloadReport(item.report_id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `report_${item.report_id}.${
          item.report_format === "EXCEL" ? "xlsx" : "pdf"
        }`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.downloadingId.set(null);
      },
      error: () => {
        this.downloadError = "Download failed. Please retry.";
        this.downloadingId.set(null);
      },
    });
  }

  formatSize(size: number | null): string {
    if (size === null || size === undefined) {
      return "—";
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
