import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { environment } from '../../../environments/environment';

export interface AdminUserApi {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  phone: string | null;
  date_of_birth: string | null;
  state: string | null;
  district: string | null;
  occupation: string | null;
  organization: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserAuditLogApi {
  audit_id: number;
  user_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface UserStatsApi {
  past_users: number;
  past_users_count?: number;
  total_users?: number;
  active_users?: number;
  inactive_users?: number;
  administrators?: number;
}

export interface UserRemovalBlocker {
  entity_type: "POLICY" | "SCHEME";
  entity_id: number;
  title: string;
  status: string;
  relationship: string;
  can_reassign: boolean;
  action_needed?: string;
}

export interface EligibleOfficial {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
}

export interface UserRemovalCheckResponse {
  can_remove: boolean;
  self_removal: boolean;
  message?: string | null;
  target_user: {
    user_id: number;
    full_name: string;
    email: string;
    role: string;
  };
  blockers: UserRemovalBlocker[];
  reassignable_count: number;
  unreassignable_count: number;
  eligible_officials: EligibleOfficial[];
}

export interface ReassignOwnershipPayload {
  source_user_email: string;
  target_user_id: number;
  confirm: boolean;
}

export interface ReassignOwnershipResponse {
  message: string;
  reassigned_policies: number;
  reassigned_schemes: number;
  target_user: {
    user_id: number;
    full_name: string;
    email: string;
  };
}

@Injectable({
  providedIn: "root",
})
export class AdminUsersService {
  private readonly apiUrl = `${environment.apiUrl}/admin/users`;
  private readonly authUsersUrl = `${environment.apiUrl}/auth/users`;
  private readonly auditLogsUrl = `${environment.apiUrl}/audit-logs`;

  private readonly http = inject(HttpClient);

  getUsers(): Observable<AdminUserApi[]> {
    return this.http.get<AdminUserApi[]>(this.apiUrl);
  }

  updateUserStatus(
    id: number,
    isActive: boolean,
  ): Observable<{ user_id: number; is_active: boolean }> {
    return this.http.patch<{ user_id: number; is_active: boolean }>(
      `${this.apiUrl}/${id}/status`,
      { is_active: isActive },
    );
  }

  getUserStats(): Observable<UserStatsApi> {
    return this.http.get<UserStatsApi>(`${this.apiUrl}/stats`);
  }

  getPastUsersCount(): Observable<{ past_users: number }> {
    return this.getUserStats().pipe(
      map((res) => ({
        past_users: res.past_users ?? res.past_users_count ?? 0,
      }))
    );
  }

  getUserById(id: number): Observable<AdminUserApi | null> {
    return this.getUsers().pipe(
      map((users: AdminUserApi[]) => {
        if (!Array.isArray(users)) {
          return null;
        }
        return users.find((u) => u.user_id === id) || null;
      })
    );
  }

  checkUserRemoval(email: string): Observable<UserRemovalCheckResponse> {
    const trimmedEmail = (email || "").trim();
    return this.http.get<UserRemovalCheckResponse>(
      `${this.apiUrl}/removal-check/${encodeURIComponent(trimmedEmail)}`
    );
  }

  reassignOwnership(payload: ReassignOwnershipPayload): Observable<ReassignOwnershipResponse> {
    return this.http.post<ReassignOwnershipResponse>(
      `${this.apiUrl}/reassign-ownership`,
      payload
    );
  }

  deleteUser(
    email: string,
    reassignToUserId?: number
  ): Observable<{ message: string; email?: string }> {
    const trimmedEmail = (email || "").trim();
    let url = `${this.authUsersUrl}/email/${encodeURIComponent(trimmedEmail)}`;
    if (reassignToUserId !== undefined && reassignToUserId !== null) {
      url += `?reassign_to_user_id=${reassignToUserId}`;
    }
    return this.http.delete<{ message: string; email?: string }>(url);
  }

  getAuditLogsForUser(userId: number): Observable<UserAuditLogApi[]> {
    return this.http.get<UserAuditLogApi[]>(this.auditLogsUrl, {
      params: { user_id: userId.toString() },
    });
  }
}
