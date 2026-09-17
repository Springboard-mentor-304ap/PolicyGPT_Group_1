import { Injectable } from "@angular/core";
import {
  HttpClient,
  HttpErrorResponse,
} from "@angular/common/http";
import { Observable } from "rxjs";

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


@Injectable({
  providedIn: "root",
})
export class EligibilityService {

  private readonly apiUrl =
    "http://localhost:8000/eligibility";


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
}
