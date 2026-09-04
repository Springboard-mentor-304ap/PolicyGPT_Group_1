import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

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

@Injectable({
  providedIn: "root",
})
export class AdminUsersService {
  private readonly apiUrl = "http://localhost:8000/admin/users";

  constructor(private http: HttpClient) {}

  getUsers(): Observable<AdminUserApi[]> {
    return this.http.get<AdminUserApi[]>(this.apiUrl);
  }
}
