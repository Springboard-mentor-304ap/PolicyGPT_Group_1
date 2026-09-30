import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SearchHistoryItem {
  history_id: number;
  user_id: number;
  search_query: string;
  search_type: string;
  filters: Record<string, any> | null;
  searched_at: string;
}

export interface SearchHistoryCreate {
  search_query: string;
  search_type: string;
  filters?: Record<string, any> | null;
}

export interface SearchHistoryStatsResponse {
  total_searches: number;
  policy_searches: number;
  scheme_searches: number;
}

@Injectable({
  providedIn: 'root',
})
export class SearchHistoryService {
  private readonly baseUrl = 'http://localhost:8000/search-history';

  constructor(private readonly http: HttpClient) {}

  getUserSearchHistory(userId: number): Observable<SearchHistoryItem[]> {
    return this.http.get<SearchHistoryItem[]>(`${this.baseUrl}/me/${userId}`);
  }

  recordSearch(data: SearchHistoryCreate): Observable<SearchHistoryItem> {
    return this.http.post<SearchHistoryItem>(this.baseUrl, data);
  }

  deleteSearchHistoryItem(
    historyId: number,
  ): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/${historyId}`,
    );
  }

  deleteUserSearchHistory(userId: number): Observable<{ message: string; deleted_count: number }> {
    return this.http.delete<{ message: string; deleted_count: number }>(`${this.baseUrl}/me/${userId}`);
  }

  getSearchHistoryStatistics(): Observable<SearchHistoryStatsResponse> {
    return this.http.get<SearchHistoryStatsResponse>(`${this.baseUrl}/statistics`);
  }
}
