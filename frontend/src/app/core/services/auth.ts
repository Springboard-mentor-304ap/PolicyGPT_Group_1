import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, Subject, of, shareReplay, tap } from "rxjs";
import { finalize } from "rxjs/operators";
import { environment } from '../../../environments/environment';

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
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  private readonly tokenKey = "policygpt_token";

  private readonly userKey = "policygpt_user";

  /** Emits on logout so live connections (notification WebSocket) can close. */
  private readonly loggedOutSubject = new Subject<void>();

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

        if (response?.user) {
          this.setUser(response.user);
          this.cachedMe = response.user;
          this.lastMeAt = Date.now();
        }
      }),
    );
  }

  // =========================================================
  // GUEST LOGIN
  // =========================================================

  loginAsGuest(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/guest-login`, {}).pipe(
      tap((response: AuthResponse) => {
        if (response?.access_token) {
          this.setToken(response.access_token);
        }

        if (response?.user) {
          this.setUser(response.user);
          this.cachedMe = response.user;
          this.lastMeAt = Date.now();
        }
      }),
    );
  }

  // =========================================================
  // REGISTER
  // =========================================================

  register(
    payload: {
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
    },
    storeSession = true,
  ): Observable<AuthResponse> {
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
          // ------------------------------------------------
          // PUBLIC REGISTRATION
          // ------------------------------------------------
          // Normal registration stores the new user's
          // token and user.
          //
          // ADMIN ADD USER
          // ------------------------------------------------
          // AddUserComponent calls:
          //
          // register(payload, false)
          //
          // Therefore the administrator's existing
          // session remains untouched.
          // ------------------------------------------------

          if (!storeSession) {
            return;
          }

          if (response?.access_token) {
            this.setToken(response.access_token);
          }

          if (response?.user) {
            this.setUser(response.user);
            this.cachedMe = response.user;
            this.lastMeAt = Date.now();
          }
        }),
      );
  }

  // =========================================================
  // GET CURRENT LOGGED-IN USER
  // =========================================================

  /**
   * In-flight deduplication + short TTL: concurrent callers (e.g. role layout
   * plus page component on cold navigation) share a single GET /auth/me, and
   * sequential mounts within 30s reuse it instead of re-requesting.
   * Login/register/logout always invalidate.
   */
  private currentUserRequest$: Observable<AuthUser> | null = null;
  private cachedMe: AuthUser | null = null;
  private lastMeAt = 0;
  private static readonly ME_TTL_MS = 30_000;

  getCurrentUser(forceRefresh = false): Observable<AuthUser> {
    const fresh =
      this.cachedMe &&
      Date.now() - this.lastMeAt < Auth.ME_TTL_MS;
    if (!forceRefresh && fresh && this.cachedMe) {
      return of(this.cachedMe);
    }
    if (!this.currentUserRequest$) {
      this.currentUserRequest$ = this.http
        .get<AuthUser>(`${this.apiUrl}/me`)
        .pipe(
          tap((user: AuthUser) => {
            if (user) {
              this.setUser(user);
              this.cachedMe = user;
              this.lastMeAt = Date.now();
            }
          }),
          finalize(() => {
            this.currentUserRequest$ = null;
          }),
          shareReplay(1),
        );
    }
    return this.currentUserRequest$;
  }

  /** Drop the cached /auth/me snapshot (login, register, logout). */
  invalidateMe(): void {
    this.cachedMe = null;
    this.lastMeAt = 0;
    this.currentUserRequest$ = null;
  }

  // =========================================================
  // GET STORED USER
  // =========================================================

  getStoredUser(): AuthUser | null {
    const storedUser = localStorage.getItem(this.userKey);

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch (error) {
      console.error("Unable to read stored user:", error);

      localStorage.removeItem(this.userKey);

      return null;
    }
  }

  // =========================================================
  // GET STORED ROLE
  // =========================================================

  getUserRole(): string | null {
    const user = this.getStoredUser();

    if (!user?.role) {
      return null;
    }

    return user.role.toUpperCase().trim();
  }

  isGuest(): boolean {
    return this.getUserRole() === "GUEST";
  }

  // =========================================================
  // STORE USER
  // =========================================================

  private setUser(user: AuthUser): void {
    if (!user) {
      return;
    }

    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  // =========================================================
  // FORGOT PASSWORD
  // =========================================================

  requestPasswordReset(
    email: string,
    phone: string | null = null,
    channel: string = "email",
  ): Observable<{ message: string }> {
    // Send null (not "") for the unused channel field: the backend
    // Pydantic schema rejects "" as an email and would 422 SMS requests.
    const isEmail = channel === "email";
    return this.http.post<{
      message: string;
    }>(`${this.apiUrl}/forgot-password`, {
      email: isEmail ? email.trim().toLowerCase() : null,
      phone: isEmail ? null : phone,
      channel,
    });
  }

  // =========================================================
  // SEND OTP (EMAIL + SMS)
  // =========================================================

  sendOtp(
    email: string,
    phone: string | null = null,
    channel: string = "email",
  ): Observable<{ message: string; channel: string }> {
    const isEmail = channel === "email";
    return this.http.post<{
      message: string;
      channel: string;
    }>(`${this.apiUrl}/send-otp`, {
      email: isEmail ? email.trim().toLowerCase() : null,
      phone: isEmail ? null : phone,
      channel,
    });
  }

  // =========================================================
  // FORGOT PASSWORD (RESET LINK)
  // =========================================================

  requestPasswordResetLink(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/forgot-password-link`,
      { email: email.trim().toLowerCase() },
    );
  }

  // =========================================================
  // VALIDATE RESET LINK (without consuming it)
  // =========================================================

  validateResetToken(token: string): Observable<{ valid: boolean; message: string }> {
    const params = { token: token.trim() };
    return this.http.get<{ valid: boolean; message: string }>(
      `${this.apiUrl}/reset-token-status`,
      { params },
    );
  }

  // =========================================================
  // VERIFY OTP
  // =========================================================

  verifyOtp(
    email: string | null,
    otp: string,
    channel: string = "email",
    phone: string | null = null,
  ): Observable<{
    message: string;
    verified: boolean;
    reset_token: string;
  }> {
    // SMS must send the phone field (not a phone number stuffed into the
    // email field, which the backend EmailStr schema rejects with 422).
    const isEmail = channel === "email";
    return this.http.post<{
      message: string;
      verified: boolean;
      reset_token: string;
    }>(`${this.apiUrl}/verify-otp`, {
      email: isEmail ? (email ?? "").trim().toLowerCase() : null,
      phone: isEmail ? null : phone,
      otp: otp.trim(),
      channel,
    });
  }

  // =========================================================
  // RESET PASSWORD
  // =========================================================

  resetPassword(
    token: string,
    newPassword: string,
    confirmPassword: string,
  ): Observable<{ message: string }> {
    return this.http.post<{
      message: string;
    }>(`${this.apiUrl}/reset-password`, {
      token,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
  }

  // =========================================================
  // GET TOKEN
  // =========================================================

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  // =========================================================
  // SET TOKEN
  // =========================================================

  private setToken(token: string): void {
    if (!token) {
      return;
    }

    localStorage.setItem(this.tokenKey, token);
  }

  // =========================================================
  // CHECK LOGIN
  // =========================================================

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  /**
   * Clear the session. The notification socket is authenticated with the token
   * we are about to delete, so subscribers (notably the notification realtime
   * service) are told to close it - otherwise the live connection would keep
   * pushing frames for a user who is no longer signed in.
   */
  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.invalidateMe();
    this.loggedOutSubject.next();
  }

  /** Fires on every logout so live connections can be torn down. */
  onLoggedOut(callback: () => void): void {
    this.loggedOutSubject.subscribe(callback);
  }
}
