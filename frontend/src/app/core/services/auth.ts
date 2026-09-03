import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, tap } from "rxjs";

export interface AuthUser {
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

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

@Injectable({
  providedIn: "root",
})
export class Auth {
  private readonly apiUrl = "http://localhost:8000/auth";
  private readonly tokenKey = "policygpt_token";

  constructor(private http: HttpClient) {}

  // =========================================================
  // LOGIN
  // =========================================================

  login(identifier: string, password: string): Observable<AuthResponse> {
    const loginData = {
      identifier: identifier.trim(),
      password: password,
    };

    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, loginData).pipe(
      tap((response: AuthResponse) => {
        if (response?.access_token) {
          this.setToken(response.access_token);
        }
      }),
    );
  }

  // =========================================================
  // REGISTER
  // =========================================================

  register(payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
    dob: string;
    state: string;
    district: string;
    occupation: string;
    organization: string;
    role: string;
  }): Observable<AuthResponse> {
    const registerData = {
      full_name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone.trim(),
      password: payload.password,
      confirm_password: payload.confirmPassword,
      date_of_birth: payload.dob,
      state: payload.state,
      district: payload.district,
      occupation: payload.occupation || null,
      organization: payload.organization || null,
      role: payload.role,
    };

    return this.http
      .post<AuthResponse>(`${this.apiUrl}/register`, registerData)
      .pipe(
        tap((response: AuthResponse) => {
          if (response?.access_token) {
            this.setToken(response.access_token);
          }
        }),
      );
  }

  // =========================================================
  // GET LOGGED-IN USER
  // =========================================================

  getCurrentUser(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.apiUrl}/me`);
  }

  // =========================================================
  // FORGOT PASSWORD
  // =========================================================

  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/forgot-password`,
      {
        email: email.trim().toLowerCase(),
      },
    );
  }

  // =========================================================
  // TOKEN
  // =========================================================

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  // =========================================================
  // LOGIN STATUS
  // =========================================================

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  logout(): void {
    localStorage.removeItem(this.tokenKey);
  }
}
