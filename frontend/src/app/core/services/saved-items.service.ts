import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from '../../../environments/environment';

export interface SavedPolicyItem {
  saved_id: number;
  policy_id: number;
  title: string;
  category: string | null;
  ministry: string | null;
  department: string | null;
  state: string | null;
  status: string | null;
  saved_at: string;
}

export interface SavedSchemeItem {
  saved_id: number;
  scheme_id: number;
  name: string;
  category: string | null;
  ministry: string | null;
  department: string | null;
  state: string | null;
  status: string | null;
  saved_at: string;
}

export interface SavedRecordResponse {
  saved_id: number;
  user_id: number;
  policy_id?: number;
  scheme_id?: number;
  saved_at: string;
}

export interface SavedStatusResponse {
  saved: boolean;
}

export interface UnsaveResponse {
  message: string;
}

@Injectable({
  providedIn: "root",
})
export class SavedItemsService {
  private readonly baseUrl = `${environment.apiUrl}/saved-items`;

  private readonly http = inject(HttpClient);

  // ============================================================
  // SAVED POLICIES
  // ============================================================

  getSavedPolicies(): Observable<SavedPolicyItem[]> {
    return this.http.get<SavedPolicyItem[]>(`${this.baseUrl}/policies`);
  }

  savePolicy(policyId: number): Observable<SavedRecordResponse> {
    this.validateId(policyId, "policy");

    return this.http.post<SavedRecordResponse>(
      `${this.baseUrl}/policies/${policyId}`,
      {},
    );
  }

  unsavePolicy(policyId: number): Observable<UnsaveResponse> {
    this.validateId(policyId, "policy");

    return this.http.delete<UnsaveResponse>(
      `${this.baseUrl}/policies/${policyId}`,
    );
  }

  isPolicySaved(policyId: number): Observable<SavedStatusResponse> {
    this.validateId(policyId, "policy");

    return this.http.get<SavedStatusResponse>(
      `${this.baseUrl}/policies/${policyId}/saved`,
    );
  }

  // ============================================================
  // SAVED SCHEMES
  // ============================================================

  getSavedSchemes(): Observable<SavedSchemeItem[]> {
    return this.http.get<SavedSchemeItem[]>(`${this.baseUrl}/schemes`);
  }

  saveScheme(schemeId: number): Observable<SavedRecordResponse> {
    this.validateId(schemeId, "scheme");

    return this.http.post<SavedRecordResponse>(
      `${this.baseUrl}/schemes/${schemeId}`,
      {},
    );
  }

  unsaveScheme(schemeId: number): Observable<UnsaveResponse> {
    this.validateId(schemeId, "scheme");

    return this.http.delete<UnsaveResponse>(
      `${this.baseUrl}/schemes/${schemeId}`,
    );
  }

  isSchemeSaved(schemeId: number): Observable<SavedStatusResponse> {
    this.validateId(schemeId, "scheme");

    return this.http.get<SavedStatusResponse>(
      `${this.baseUrl}/schemes/${schemeId}/saved`,
    );
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private validateId(id: number, type: string): void {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`A valid ${type} ID is required.`);
    }
  }
}
