import { Injectable } from "@angular/core";
import {
  HttpClient,
  HttpErrorResponse,
} from "@angular/common/http";
import { Observable } from "rxjs";
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
  id: string; // e.g. "scheme_101" or "policy_201"
  entity_id: number;
  entity_name: string;
  entity_type: EntityType;
  eligible: boolean;
  message: string;
  category?: string | null;
  saved_at: string; // ISO date timestamp
}


@Injectable({
  providedIn: "root",
})
export class EligibilityService {
  private readonly SAVED_RESULTS_KEY = "policygpt_saved_eligibility_results";

  private readonly apiUrl =
    `${environment.apiUrl}/eligibility`;


  constructor(
    private http: HttpClient
  ) {}


  checkEligibility(
    request: EligibilityCheckRequest
  ): Observable<EligibilityCheckResponse> {

    return this.http.post<EligibilityCheckResponse>(
      `${this.apiUrl}/check`,
      request
    );
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
    );
  }


  getRules(
    entityType: EntityType,
    entityId: number
  ): Observable<any[]> {

    return this.http.get<any[]>(
      `${this.apiUrl}/${entityType}/${entityId}`
    );
  }

  /**
   * Fetch saved eligibility results from localStorage.
   */
  getSavedResults(): SavedEligibilityResult[] {
    try {
      const data = localStorage.getItem(this.SAVED_RESULTS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Error reading saved eligibility results:", e);
      return [];
    }
  }

  /**
   * Save an eligibility result to localStorage with duplicate protection.
   * Returns true if saved, false if already exists.
   */
  saveResult(result: SavedEligibilityResult): boolean {
    const list = this.getSavedResults();
    const exists = list.some(
      (item) =>
        item.id === result.id ||
        (item.entity_type === result.entity_type && item.entity_id === result.entity_id)
    );
    if (exists) {
      return false; // Prevent duplicates
    }
    list.unshift(result);
    try {
      localStorage.setItem(this.SAVED_RESULTS_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error("Error saving eligibility result:", e);
      return false;
    }
  }

  /**
   * Remove a saved eligibility result from localStorage by id.
   */
  removeSavedResult(id: string): boolean {
    const list = this.getSavedResults();
    const filtered = list.filter((item) => item.id !== id);
    try {
      localStorage.setItem(this.SAVED_RESULTS_KEY, JSON.stringify(filtered));
      return true;
    } catch (e) {
      console.error("Error removing saved eligibility result:", e);
      return false;
    }
  }

  /**
   * Check if an entity is already saved in localStorage.
   */
  isResultSaved(entityType: EntityType, entityId: number): boolean {
    const list = this.getSavedResults();
    return list.some(
      (item) => item.entity_type === entityType && item.entity_id === entityId
    );
  }
}
