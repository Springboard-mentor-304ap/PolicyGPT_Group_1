import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PolicyResponse } from '../models/policy.model';
import type { SchemeResponse } from '../models/scheme.model';

export interface GlobalSearchResponse {
  query: string;
  total_policies: number;
  total_schemes: number;
  policies: PolicyResponse[];
  schemes: SchemeResponse[];
}

export const EMPTY_GLOBAL_SEARCH: GlobalSearchResponse = {
  query: '',
  total_policies: 0,
  total_schemes: 0,
  policies: [],
  schemes: [],
};

/** Normalize user input: trim + collapse internal whitespace. */
export function normalizeGlobalQuery(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

@Injectable({
  providedIn: 'root',
})
export class GlobalSearchService {
  private readonly apiUrl = `${environment.apiUrl}/search/global`;
  private readonly http = inject(HttpClient);

  /** Single debounced (by caller) request for the dropdown. */
  search(query: string, limit = 5): Observable<GlobalSearchResponse> {
    const q = normalizeGlobalQuery(query);
    if (!q) {
      return of({ ...EMPTY_GLOBAL_SEARCH });
    }
    const safeLimit = Math.max(1, Math.min(limit || 5, 20));
    const params = new HttpParams()
      .set('q', q)
      .set('limit', safeLimit.toString());
    return this.http
      .get<GlobalSearchResponse>(this.apiUrl, { params })
      .pipe(timeout(10_000));
  }
}
