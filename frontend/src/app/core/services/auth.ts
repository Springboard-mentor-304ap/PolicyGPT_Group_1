import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private apiUrl = 'http://localhost:8000/auth';
  private tokenKey = 'policygpt_token';

  constructor(private http: HttpClient) {}

  login(identifier: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/login`, { identifier, password })
      .pipe(tap((res) => this.setToken(res.access_token)));
  }
//changed
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
full_name: payload.name,
email: payload.email,
phone: payload.phone,
password: payload.password,
confirm_password: payload.confirmPassword,
date_of_birth: payload.dob,
state: payload.state,
district: payload.district,
occupation: payload.occupation,
organization: payload.organization,
role: payload.role
};

return this.http
.post<AuthResponse>(`${this.apiUrl}/register`, registerData)
.pipe(tap((res) => this.setToken(res.access_token)));
}

  // register(payload: {
  //   name: string;
  //   email: string;
  //   phone: string;
  //   password: string;
  // }): Observable<AuthResponse> {
  //   return this.http
  //     .post<AuthResponse>(`${this.apiUrl}/register`, payload)
  //     .pipe(tap((res) => this.setToken(res.access_token)));
  // }

  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/password-reset`, { email });
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  private setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }
}
