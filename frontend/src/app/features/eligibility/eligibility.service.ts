import { Injectable } from "@angular/core";
import {
  HttpClient,
  HttpErrorResponse,
} from "@angular/common/http";
import { Observable, timeout } from "rxjs";
import { environment } from '../../../environments/environment';

export type EntityType = "policy" | "scheme";


export interface EligibilityProfile {
  age: number;
  gender: string;
  annual_income?: number | null;
  occupation?: string | null;
  education?: string | null;
  state?: string | null;
  social_category?: string | null;
  disability_status?: boolean | null;
}


export interface EligibilityCheckRequest
  extends EligibilityProfile {
  entity_type: EntityType;
  entity_id: number;
}


export interface EligibilityCheckResponse {
  entity_type: EntityType;
  entity_id: number;
  entity_name: string;
  eligible: boolean;
  message: string;
  matched_rules: string[];
  failed_rules: string[];
}


export interface MatchedEntity {
  entity_id: number;
  entity_name: string;
  eligible: boolean;
  message: string;
}


export interface EligibilityMatchResponse {
  entity_type: EntityType;
  total_checked: number;
  eligible_entities: MatchedEntity[];
  ineligible_entities: MatchedEntity[];
}


export interface SavedEligibilityResult {
  /** Server primary key. Rows are owned by the authenticated user. */
  saved_id: number;
  entity_id: number;
  entity_name: string;
  entity_type: EntityType;
  eligible: boolean;
  message: string;
  /** Input snapshot the server evaluated, for display/reproducibility. */
  profile_data?: Record<string, unknown> | null;
  saved_at: string; // ISO date timestamp
}


@Injectable({
  providedIn: "root",
})
export class EligibilityService {
  private readonly apiUrl =
    `${environment.apiUrl}/eligibility`;

  /** Upper bound for eligibility HTTP calls (DB-only, no external I/O). */
  private static readonly REQUEST_TIMEOUT_MS = 30000;


  constructor(
    private http: HttpClient
  ) {}


  checkEligibility(
    request: EligibilityCheckRequest
  ): Observable<EligibilityCheckResponse> {

    return this.http.post<EligibilityCheckResponse>(
      `${this.apiUrl}/check`,
      request
    ).pipe(timeout(EligibilityService.REQUEST_TIMEOUT_MS));
  }


  findEligible(
    profile: EligibilityProfile,
    entityType: EntityType
  ): Observable<EligibilityMatchResponse> {

    const request = {
      age: Number(profile.age),
      gender: profile.gender,
      
      annual_income:
  profile.annual_income === null ||
  profile.annual_income === undefined
    ? null
    : Number(profile.annual_income),

      occupation:
        profile.occupation || null,

      education:
        profile.education || null,

      state:
        profile.state || null,

      social_category:
        profile.social_category || null,

      disability_status:
        profile.disability_status ?? null,

      entity_type: entityType,
    };

    console.log(
      `Checking eligibility for ${entityType}:`,
      request
    );

    return this.http.post<EligibilityMatchResponse>(
      `${this.apiUrl}/match`,
      request
    ).pipe(timeout(EligibilityService.REQUEST_TIMEOUT_MS));
  }


  getRules(
    entityType: EntityType,
    entityId: number
  ): Observable<any[]> {

    return this.http.get<any[]>(
      `${this.apiUrl}/${entityType}/${entityId}`
    ).pipe(timeout(EligibilityService.REQUEST_TIMEOUT_MS));
  }

  // ============================================================
  // SAVED ELIGIBILITY RESULTS (server-persisted, per-user)
  // ============================================================
  // The backend derives the owner from the JWT on every call, so one
  // user can never read or mutate another user's rows. The server —
  // never localStorage — is the source of truth, which also keeps
  // saved results user-isolated across logins on a shared browser.

  /**
   * List the current user's saved eligibility results.
   * Mirrors GET /eligibility/saved.
   */
  getSavedResults(): Observable<SavedEligibilityResult[]> {
    return this.http.get<SavedEligibilityResult[]>(
      `${this.apiUrl}/saved`
    ).pipe(timeout(EligibilityService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Fetch one saved result owned by the current user.
   * Mirrors GET /eligibility/saved/{saved_id}.
   */
  getSavedResult(savedId: number): Observable<SavedEligibilityResult> {
    return this.http.get<SavedEligibilityResult>(
      `${this.apiUrl}/saved/${savedId}`
    ).pipe(timeout(EligibilityService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Bookmark an eligibility outcome for the current user. The backend
   * re-evaluates the outcome with the real matching engine and stores
   * the input profile snapshot alongside it. Idempotent: saving the
   * same entity twice returns the existing row.
   * Mirrors POST /eligibility/saved.
   */
  saveResult(
    entityType: EntityType,
    entityId: number,
    profile: EligibilityProfile
  ): Observable<SavedEligibilityResult> {
    return this.http.post<SavedEligibilityResult>(
      `${this.apiUrl}/saved`,
      {
        entity_type: entityType,
        entity_id: entityId,
        profile: {
          age: Number(profile.age),
          gender: profile.gender,
          annual_income:
            profile.annual_income === null ||
              profile.annual_income === undefined
              ? null
              : Number(profile.annual_income),
          occupation: profile.occupation || null,
          education: profile.education || null,
          state: profile.state || null,
          social_category: profile.social_category || null,
          disability_status: profile.disability_status ?? null,
        },
      }
    ).pipe(timeout(EligibilityService.REQUEST_TIMEOUT_MS));
  }

  /**
   * Remove one of the current user's saved results.
   * Mirrors DELETE /eligibility/saved/{saved_id}.
   */
  removeSavedResult(savedId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.apiUrl}/saved/${savedId}`
    ).pipe(timeout(EligibilityService.REQUEST_TIMEOUT_MS));
  }
}
