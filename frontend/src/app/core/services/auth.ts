import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, tap } from "rxjs";

/* =========================================================
   USER INTERFACE
========================================================= */

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

/* =========================================================
   AUTH RESPONSE
========================================================= */

export interface AuthResponse {
  access_token: string;

  token_type: string;

  user: AuthUser;
}

/* =========================================================
   AUTH SERVICE
========================================================= */

@Injectable({
  providedIn: "root",
})
export class Auth {
  /* =======================================================
     API CONFIGURATION
  ======================================================= */

  private apiUrl = "http://localhost:8000/auth";

  private tokenKey = "policygpt_token";

  /* =======================================================
     CONSTRUCTOR
  ======================================================= */

  constructor(private http: HttpClient) {}

  /* =======================================================
     LOGIN
  ======================================================= */

  login(identifier: string, password: string): Observable<AuthResponse> {
    const loginData = {
      identifier: identifier.trim(),
      password: password,
    };

    console.log("Sending login request:", {
      identifier: loginData.identifier,
    });

    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, loginData).pipe(
      tap((response: AuthResponse) => {
        console.log("Login response received:", response);

        /* ---------------------------------------------
             SAVE ACCESS TOKEN
          --------------------------------------------- */

        if (response?.access_token) {
          this.setToken(response.access_token);
        }
      }),
    );
  }

  /* =======================================================
     REGISTER
  ======================================================= */

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

      email: payload.email.trim(),

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

    console.log("Sending registration request:", registerData);

    return this.http

      .post<AuthResponse>(`${this.apiUrl}/register`, registerData)

      .pipe(
        tap((response: AuthResponse) => {
          console.log("Registration response:", response);

          /* ---------------------------------------------
             SAVE ACCESS TOKEN
          --------------------------------------------- */

          if (response?.access_token) {
            this.setToken(response.access_token);
          }
        }),
      );
  }

  /* =======================================================
     GET CURRENT USER
  ======================================================= */

  getCurrentUser(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.apiUrl}/me`);
  }

  /* =======================================================
     FORGOT PASSWORD
  ======================================================= */

  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{
      message: string;
    }>(`${this.apiUrl}/forgot-password`, {
      email: email.trim(),
    });
  }

  /* =======================================================
     LOGOUT
  ======================================================= */

  logout(): void {
    localStorage.removeItem(this.tokenKey);
  }

  /* =======================================================
     GET TOKEN
  ======================================================= */

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /* =======================================================
     CHECK LOGIN
  ======================================================= */

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  /* =======================================================
     SAVE TOKEN
  ======================================================= */

  private setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }
}
