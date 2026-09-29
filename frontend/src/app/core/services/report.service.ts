import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Report,
  ReportGenerateRequest,
  ReportGenerateResponse,
  ReportOptionsResponse,
  ReportType,
  ReportTypesResponse,
} from '../models/report.model';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private readonly baseUrl = 'http://localhost:8000/reports';

  constructor(private readonly http: HttpClient) {}

  /** Role-scoped allowed types/formats. Mirrors GET /reports/types. */
  getTypes(): Observable<ReportTypesResponse> {
    return this.http.get<ReportTypesResponse>(`${this.baseUrl}/types`);
  }

  /** Persist + generate a report. Mirrors POST /reports/generate. */
  generateReport(payload: ReportGenerateRequest): Observable<ReportGenerateResponse> {
    return this.http.post<ReportGenerateResponse>(`${this.baseUrl}/generate`, payload);
  }

  /** Own history (ADMIN sees all). Mirrors GET /reports/history. */
  getHistory(limit = 100, offset = 0): Observable<Report[]> {
    return this.http.get<Report[]>(`${this.baseUrl}/history`, {
      params: { limit: String(limit), offset: String(offset) },
    });
  }

  /** Detail with ownership enforcement (non-owner -> 404). */
  getReport(reportId: number): Observable<Report> {
    return this.http.get<Report>(`${this.baseUrl}/${reportId}`);
  }

  /** Distinct live filter values. Mirrors GET /reports/options. */
  getOptions(field: string, reportType: ReportType): Observable<ReportOptionsResponse> {
    return this.http.get<ReportOptionsResponse>(`${this.baseUrl}/options`, {
      params: { field, report_type: reportType },
    });
  }

  /** Download as Blob. Mirrors GET /reports/{report_id}/download. */
  downloadReport(reportId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${reportId}/download`, {
      responseType: 'blob',
    });
  }
}
