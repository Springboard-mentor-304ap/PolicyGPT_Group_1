import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuditLog, AuditLogFilters, EntityAuditTimeline } from '../models/audit-log.model';
import { environment } from '../../../environments/environment';

export type { AuditLog, AuditLogFilters, EntityAuditTimeline };

@Injectable({
  providedIn: 'root',
})
export class AuditLogService {
  private readonly baseUrl = `${environment.apiUrl}/audit-logs`;
  private readonly http = inject(HttpClient);

  constructor() {}

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

  /**
   * Chronological workflow timeline for one policy/scheme (staff-only on
   * the backend; actor names/roles are inlined, no per-event lookups).
   * GET /audit-logs/entity/{entityType}/{entityId}?page=&limit=
   */
  getEntityTimeline(
    entityType: 'POLICY' | 'SCHEME',
    entityId: number,
    page = 1,
    limit = 50,
  ): Observable<EntityAuditTimeline> {
    if (!entityId || entityId <= 0) {
      throw new Error('A valid entity ID is required.');
    }
    const params = new HttpParams()
      .set('page', Math.max(1, page).toString())
      .set('limit', Math.max(1, Math.min(limit, 200)).toString());
    return this.http.get<EntityAuditTimeline>(
      `${this.baseUrl}/entity/${entityType}/${entityId}`,
      { params },
    );
  }
}
