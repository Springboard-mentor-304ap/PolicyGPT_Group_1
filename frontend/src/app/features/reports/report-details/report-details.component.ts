import { Component, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { finalize } from "rxjs";
import { ReportService } from "../../../core/services/report.service";
import { Report, ReportDataset } from "../../../core/models/report.model";
import { Auth } from "../../../core/services/auth";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";
import { LoadingIndicatorComponent } from "../../../shared/components/loading-indicator/loading-indicator.component";

@Component({
  selector: "app-report-details",
  standalone: true,
  imports: [CommonModule, RouterLink, BreadcrumbComponent, LoadingIndicatorComponent],
  styleUrl: "../reports-shared.scss",
  template: `
    <div class="reports-page">
      <app-breadcrumb [items]="breadcrumbItems"></app-breadcrumb>
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

      @if (loading()) {
        <app-loading-indicator message="Loading report details..."></app-loading-indicator>
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
      } @else if (report(); as r) {
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
              <dl class="detail-list">
                <div class="detail-row">
                  <dt class="detail-term">Filters</dt>
                  <dd class="detail-value">
                    @if (filterEntries.length > 0) {
                      @for (entry of filterEntries; track entry[0]) {
                        {{ entry[0] }}: {{ entry[1] }}
                        @if (!$last) {
                          <span> · </span>
                        }
                      }
                    } @else {
                      Full scoped dataset (no filters).
                    }
                  </dd>
                </div>
              </dl>
              @if (r.status !== "COMPLETED" && r.status !== "PENDING") {
                <p class="filter-error">
                  {{
                    r.error_message ||
                      "Report generation failed. Please regenerate."
                  }}
                </p>
              }
              @if (downloadError) {
                <p class="filter-error">{{ downloadError }}</p>
              }
            </div>
            <div class="card-actions">
              @if (r.status === "COMPLETED") {
                <button
                  type="button"
                  class="btn-primary"
                  (click)="download()"
                  [disabled]="downloading()"
                >
                  {{ downloading() ? "Downloading…" : "Download" }}
                </button>
              } @else if (r.status === "PENDING") {
                <span class="metadata-item">Generating…</span>
              }
            </div>
          </article>
        </section>

        @if (r.status === "COMPLETED") {
          <section class="results-section">
            <div class="results-header">
              <div>
                <h2>Report Content</h2>
                <p>Actual data from the generated report.</p>
              </div>
            </div>

            @if (dataLoading()) {
              <app-loading-indicator message="Loading report content..."></app-loading-indicator>
            } @else if (dataError) {
              <section class="state-card error-state">
                <div class="state-icon">
                  <span class="material-icons" aria-hidden="true">
                    error_outline
                  </span>
                </div>
                <h2>Unable to Load Report Content</h2>
                <p>{{ dataError }}</p>
                <button type="button" class="retry-button" (click)="loadData()">
                  Retry
                </button>
              </section>
            } @else if (dataset(); as data) {
              @if (data.summary.length > 0) {
                <div class="stats-grid">
                  @for (item of data.summary; track item[0]) {
                    <article class="stat-card">
                      <div>
                        <p class="stat-value">{{ item[1] }}</p>
                        <p class="stat-label">{{ item[0] }}</p>
                      </div>
                    </article>
                  }
                </div>
              }
              @for (section of data.sections; track section.heading) {
                <section class="category-panel">
                  <h2>{{ section.heading }}</h2>
                  @if (section.rows.length === 0) {
                    <p>No detailed records available for this section.</p>
                  } @else {
                    <div class="report-table-container">
                      <table class="report-table">
                        <thead>
                          <tr>
                            @for (head of section.headers; track head) {
                              <th scope="col">{{ headerLabel(head) }}</th>
                            }
                          </tr>
                        </thead>
                        <tbody>
                          @for (row of section.rows; track $index) {
                            <tr>
                              @for (
                                cell of row;
                                track $index;
                                let ci = $index
                              ) {
                                <td>
                                  @if (isStatusColumn(section.headers[ci])) {
                                    <span
                                      class="metadata-item status-badge status-status-{{
                                        statusClass(cell)
                                      }}"
                                    >
                                      {{ formatCell(cell) }}
                                    </span>
                                  } @else {
                                    {{ formatCell(cell) }}
                                  }
                                </td>
                              }
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </section>
              }
              @if (
                data.empty ||
                (data.sections.length === 0 && data.summary.length === 0)
              ) {
                <section class="empty-state">
                  <div class="empty-icon">
                    <span class="material-icons" aria-hidden="true">
                      inbox
                    </span>
                  </div>
                  <h2>No Detailed Records</h2>
                  <p>
                    {{
                      data.empty_message ||
                        "No detailed records available for this report."
                    }}
                  </p>
                </section>
              }
            }
          </section>
        }
      }
    </div>
  `,
})
export class ReportDetailsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly reports = inject(ReportService);
  private readonly auth = inject(Auth);

  /** Breadcrumb trail: Home > Reports > Report Details. */
  get breadcrumbItems(): BreadcrumbItem[] {
    const role = (this.auth.getUserRole() || "").toUpperCase();
    const prefix =
      role === "GOVERNMENT_OFFICIAL" || role === "GOVERNMENT"
        ? "government"
        : "admin";
    return [
      { label: "Home", route: ["/dashboard", prefix] },
      { label: "Reports", route: ["/dashboard", prefix, "reports"] },
      { label: "Report Details" },
    ];
  }

  readonly report = signal<Report | null>(null);
  readonly loading = signal(true);
  error: string | null = null;
  readonly downloading = signal(false);
  downloadError: string | null = null;

  readonly dataset = signal<ReportDataset | null>(null);
  readonly dataLoading = signal(false);
  dataError: string | null = null;

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    // No object URLs are created by this page (no inline preview).
  }

  get filterEntries(): Array<[string, unknown]> {
    return Object.entries(this.report()?.parameters ?? {});
  }

  reload(): void {
    const id = Number(this.route.snapshot.paramMap.get("reportId"));
    if (!Number.isFinite(id)) {
      this.error = "The requested report was not found.";
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error = null;
    this.report.set(null);
    this.dataset.set(null);
    this.dataError = null;
    this.reports
      .getReport(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.report.set(res);
          this.loadData();
        },
        error: (err) => {
          const status = (err as { status?: number })?.status;
          this.error =
            status === 404
              ? "The requested report was not found."
              : "Could not load the report. Please retry.";
        },
      });
  }

  /** Fetch the structured dataset once metadata is available. */
  loadData(): void {
    const current = this.report();
    this.dataset.set(null);
    this.dataError = null;
    if (!current || current.status !== "COMPLETED") {
      return;
    }
    this.dataLoading.set(true);
    this.reports
      .getReportData(current.report_id)
      .pipe(finalize(() => this.dataLoading.set(false)))
      .subscribe({
        next: (data) => {
          this.dataset.set(data);
        },
        error: (err) => {
          const status = (err as { status?: number })?.status;
          this.dataError =
            status === 404
              ? "Report content was not found."
              : "Unable to load report content. Download remains available.";
        },
      });
  }

  download(): void {
    if (!this.report() || this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.downloadError = null;
    this.reports.downloadReport(this.report()!.report_id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `report_${this.report()!.report_id}.${
          this.report()!.report_format === "EXCEL" ? "xlsx" : "pdf"
        }`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.downloading.set(false);
      },
      error: () => {
        this.downloadError = "Download failed. Please retry.";
        this.downloading.set(false);
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

  /** Display-only header prettifier: full_name -> Full Name. */
  headerLabel(header: string): string {
    return (header ?? "")
      .toString()
      .split("_")
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
      .replace(/\bId\b/g, "ID");
  }

  /** True for status-like columns, rendered with existing badges. */
  isStatusColumn(header: string): boolean {
    return header.trim().toLowerCase() === "status";
  }

  statusClass(value: unknown): string {
    const text = String(value ?? "")
      .trim()
      .toLowerCase();
    return /^[a-z_]+$/.test(text) ? text : "pending";
  }

  formatCell(value: unknown): string {
    if (value === null || value === undefined) {
      return "—";
    }
    return String(value);
  }
}
