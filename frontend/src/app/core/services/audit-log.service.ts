import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuditLog, AuditLogFilters } from '../models/audit-log.model';
import { environment } from '../../../environments/environment';

export type { AuditLog, AuditLogFilters };

@Injectable({
  providedIn: 'root',
})
export class AuditLogService {
  private readonly baseUrl = `${environment.apiUrl}/audit-logs`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Retrieve audit logs (Admin sees all roles; others see only their own).
   * GET /audit-logs
   */
  getAuditLogs(filters?: AuditLogFilters): Observable<AuditLog[]> {
    let params = new HttpParams();
    if (filters?.action && filters.action !== 'ALL') {
      params = params.set('action', filters.action);
    }
    if (filters?.entity_type && filters.entity_type !== 'ALL') {
      params = params.set('entity_type', filters.entity_type);
    }
    if (filters?.from_date) {
      params = params.set('from_date', filters.from_date);
    }
    if (filters?.to_date) {
      params = params.set('to_date', filters.to_date);
    }
    params = params.set('limit', String(filters?.limit ?? 1000));
    return this.http.get<AuditLog[]>(this.baseUrl, { params });
  }

  /**
   * Retrieve a single audit log by ID (ownership-scoped on the backend).
   * GET /audit-logs/{id}
   */
  getAuditLog(id: number): Observable<AuditLog> {
    return this.http.get<AuditLog>(`${this.baseUrl}/${id}`);
  }
}
