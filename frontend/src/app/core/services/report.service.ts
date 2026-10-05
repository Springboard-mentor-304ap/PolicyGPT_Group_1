import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, shareReplay, throwError, timeout } from 'rxjs';
import {
  Report,
  ReportDataset,
  ReportGenerateRequest,
  ReportOptionsResponse,
  ReportType,
  ReportTypesResponse,
} from '../models/report.model';
import { Auth } from './auth';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private readonly baseUrl = `${environment.apiUrl}/reports`;

  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  /** Session cache for static filter options, keyed by role+type+field. */
  private readonly optionsCache = new Map<string, Observable<ReportOptionsResponse>>();

  constructor() {
    // Role-keyed options must not survive logout/user-switch in a
    // shared tab.
    this.auth.onLoggedOut?.(() => {
      this.optionsCache.clear();
      this.previewInflight.clear();
    });
  }

  /** In-flight preview dedup, keyed by serialized params. */
  private readonly previewInflight = new Map<string, Observable<ReportDataset>>();

  /** Role-scoped allowed types/formats. Mirrors GET /reports/types. */
  getTypes(): Observable<ReportTypesResponse> {
    return this.http
      .get<ReportTypesResponse>(`${this.baseUrl}/types`)
      .pipe(timeout(30000));
  }

  /**
   * Generate a report. Mirrors POST /reports/generate.
   *
   * The backend renders the file in memory and returns the binary
   * directly: the full HttpResponse is exposed so callers can read
   * the Content-Disposition filename and the X-Report-Id header.
   */
  generateReport(
    payload: ReportGenerateRequest,
  ): Observable<HttpResponse<Blob>> {
    return this.http
      .post(`${this.baseUrl}/generate`, payload, {
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(timeout(120000));
  }

  /**
   * Live preview dataset for the Reports landing page.
   * Mirrors GET /reports/preview — same builders, scope and filters
   * as generation, but stateless: no Report row, no audit, no notify.
   */
  getPreview(
    reportType: ReportType,
    detail?: string | null,
    parameters?: Record<string, unknown> | null,
    title?: string | null,
  ): Observable<ReportDataset> {
    const params: Record<string, string> = {
      report_type: reportType,
    };
    if (detail) {
      params['detail'] = detail;
    }
    if (title?.trim()) {
      params['title'] = title.trim();
    }
    for (const [key, value] of Object.entries(parameters ?? {})) {
      if (value === '' || value === null || value === undefined) {
        continue;
      }
      params[key] = String(value);
    }
    // Dedupe concurrent identical previews (rapid parameter tweaks can
    // otherwise fire overlapping full-dataset builds server-side).
    const previewKey = JSON.stringify(params);
    const ongoing = this.previewInflight.get(previewKey);
    if (ongoing) {
      return ongoing;
    }
    const request = this.http
      .get<ReportDataset>(`${this.baseUrl}/preview`, { params })
      .pipe(
        timeout(60000),
        finalize(() => {
          this.previewInflight.delete(previewKey);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.previewInflight.set(previewKey, request);
    return request;
  }

  /** Own history (ADMIN sees all). Mirrors GET /reports/history. */
  getHistory(limit = 100, offset = 0): Observable<Report[]> {
    return this.http
      .get<Report[]>(`${this.baseUrl}/history`, {
        params: { limit: String(limit), offset: String(offset) },
      })
      .pipe(timeout(30000));
  }

  /** Detail with ownership enforcement (non-owner -> 404). */
  getReport(reportId: number): Observable<Report> {
    return this.http
      .get<Report>(`${this.baseUrl}/${reportId}`)
      .pipe(timeout(30000));
  }

  /**
   * Structured dataset for the native View page.
   * Mirrors GET /reports/{report_id}/data — same builders, scope and
   * ownership as generation and download, so View, PDF and Excel
   * always represent the same report data.
   */
  getReportData(reportId: number): Observable<ReportDataset> {
    return this.http
      .get<ReportDataset>(`${this.baseUrl}/${reportId}/data`)
      .pipe(timeout(60000));
  }

  /**
   * Distinct live filter values. Mirrors GET /reports/options.
   * Cached per session (role + type + field) so repeated category
   * switches do not re-request identical option lists.
   */
  getOptions(field: string, reportType: ReportType): Observable<ReportOptionsResponse> {
    const role = this.auth.getUserRole() ?? 'UNKNOWN';
    const key = `${role}|${reportType}|${field}`;
    const cached = this.optionsCache.get(key);
    if (cached) {
      return cached;
    }
    const request = this.http
      .get<ReportOptionsResponse>(`${this.baseUrl}/options`, {
        params: { field, report_type: reportType },
      })
      .pipe(
        timeout(30000),
        // Failed lookups must not poison the cache; the caller falls
        // back to a free-text input for that field.
        catchError((err: unknown) => {
          this.optionsCache.delete(key);
          return throwError(() => err);
        }),
        shareReplay(1),
      );
    this.optionsCache.set(key, request);
    return request;
  }

  /** Download as Blob. Mirrors GET /reports/{report_id}/download. */
  downloadReport(reportId: number): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl}/${reportId}/download`, {
        responseType: 'blob',
      })
      .pipe(timeout(120000));
  }

  /** Filename from a Content-Disposition header, without any path. */
  filenameFromDisposition(header: string | null, fallback: string): string {
    if (header) {
      const match = /filename="([^"]+)"/.exec(header);
      if (match) {
        return match[1].split('/').pop()?.split('\\').pop() || fallback;
      }
    }
    return fallback;
  }
}
