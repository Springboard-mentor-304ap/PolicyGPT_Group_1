import { Injectable } from "@angular/core";
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

@Injectable({
  providedIn: "root",
})
export class AdminUsersService {
  private readonly apiUrl = `${environment.apiUrl}/admin/users`;
  private readonly authUsersUrl = `${environment.apiUrl}/auth/users`;
  private readonly auditLogsUrl = `${environment.apiUrl}/audit-logs`;

  constructor(private http: HttpClient) {}

  getUsers(): Observable<AdminUserApi[]> {
    return this.http.get<AdminUserApi[]>(this.apiUrl);
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

  deleteUser(email: string): Observable<{ message: string; email?: string }> {
    const trimmedEmail = (email || "").trim();
    return this.http.delete<{ message: string; email?: string }>(
      `${this.authUsersUrl}/email/${encodeURIComponent(trimmedEmail)}`
    );
  }

  getAuditLogsForUser(userId: number): Observable<UserAuditLogApi[]> {
    return this.http.get<UserAuditLogApi[]>(this.auditLogsUrl, {
      params: { user_id: userId.toString() },
    });
  }
}
