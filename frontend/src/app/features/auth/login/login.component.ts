import { ChangeDetectorRef, Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterLink } from "@angular/router";

import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";

import { Auth } from "../../../core/services/auth";
import { AvatarService } from "../../../core/services/avatar.service";
import { NotificationService } from "../../../core/services/notification.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./login.component.html",
  styleUrl: "./login.component.scss",
})
export class LoginComponent {
  // =========================================================
  // VARIABLES
  // =========================================================

  form: FormGroup;

  loading = false;

  errorMessage = "";

  hidePassword = true;

  loginMode: "email" | "phone" = "email";

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private fb: FormBuilder,
    private authService: Auth,
    private avatarService: AvatarService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    // =======================================================
    // LOGIN FORM
    // =======================================================

    this.form = this.fb.group({
      email: ["", [Validators.email]],

      phone: ["", [Validators.pattern(/^[0-9]{10}$/)]],

      password: ["", [Validators.required]],

      rememberMe: [false],
    });

    // =======================================================
    // INITIAL VALIDATORS
    // =======================================================

    this.setLoginValidators();
  }

  // =========================================================
  // TOGGLE EMAIL / PHONE LOGIN
  // =========================================================

  toggleLoginMode(): void {
    // -------------------------------------------------------
    // Prevent mode change while logging in
    // -------------------------------------------------------

    if (this.loading) {
      return;
    }

    // -------------------------------------------------------
    // Change login mode
    // -------------------------------------------------------

    this.loginMode = this.loginMode === "email" ? "phone" : "email";

    // -------------------------------------------------------
    // Clear previous error
    // -------------------------------------------------------

    this.errorMessage = "";

    // -------------------------------------------------------
    // Clear fields
    // -------------------------------------------------------

    this.form.get("email")?.reset("");

    this.form.get("phone")?.reset("");

    this.form.get("password")?.reset("");

    // -------------------------------------------------------
    // Reset validation state
    // -------------------------------------------------------

    this.form.get("email")?.markAsUntouched();

    this.form.get("email")?.markAsPristine();

    this.form.get("phone")?.markAsUntouched();

    this.form.get("phone")?.markAsPristine();

    this.form.get("password")?.markAsUntouched();

    this.form.get("password")?.markAsPristine();

    // -------------------------------------------------------
    // Update validators
    // -------------------------------------------------------

    this.setLoginValidators();

    // -------------------------------------------------------
    // Update UI
    // -------------------------------------------------------

    this.cdr.detectChanges();
  }

  // =========================================================
  // LOGIN VALIDATORS
  // =========================================================

  private setLoginValidators(): void {
    const emailControl = this.form.get("email");

    const phoneControl = this.form.get("phone");

    // =======================================================
    // EMAIL LOGIN
    // =======================================================

    if (this.loginMode === "email") {
      emailControl?.setValidators([Validators.required, Validators.email]);

      phoneControl?.clearValidators();

      phoneControl?.setValue("", {
        emitEvent: false,
      });
    }

    // =======================================================
    // PHONE LOGIN
    // =======================================================
    else {
      phoneControl?.setValidators([
        Validators.required,
        Validators.pattern(/^[0-9]{10}$/),
      ]);

      emailControl?.clearValidators();

      emailControl?.setValue("", {
        emitEvent: false,
      });
    }

    // =======================================================
    // UPDATE VALIDITY
    // =======================================================

    emailControl?.updateValueAndValidity({
      emitEvent: false,
    });

    phoneControl?.updateValueAndValidity({
      emitEvent: false,
    });
  }

  // =========================================================
  // SUBMIT LOGIN
  // =========================================================

  submit(): void {
    // =======================================================
    // PREVENT DOUBLE SUBMISSION
    // =======================================================

    if (this.loading) {
      return;
    }

    // =======================================================
    // CLEAR OLD ERROR
    // =======================================================

    this.errorMessage = "";

    // =======================================================
    // UPDATE VALIDATORS
    // =======================================================

    this.setLoginValidators();

    // =======================================================
    // FRONTEND VALIDATION
    // =======================================================

    if (this.form.invalid) {
      this.form.markAllAsTouched();

      this.cdr.detectChanges();

      return;
    }

    // =======================================================
    // GET EMAIL / PHONE
    // =======================================================

    let identifier = "";

    if (this.loginMode === "email") {
      identifier = String(this.form.get("email")?.value || "")
        .trim()
        .toLowerCase();
    } else {
      identifier = String(this.form.get("phone")?.value || "")
        .replace(/\D/g, "")
        .trim();
    }

    // =======================================================
    // GET PASSWORD
    // =======================================================

    const password = String(this.form.get("password")?.value || "");

    // =======================================================
    // EXTRA VALIDATION
    // =======================================================

    if (!identifier || !password) {
      this.form.markAllAsTouched();

      this.cdr.detectChanges();

      return;
    }

    // =======================================================
    // START LOADING
    // =======================================================

    this.loading = true;

    this.errorMessage = "";

    this.cdr.detectChanges();

    // =======================================================
    // DEBUG
    // =======================================================

    console.log("=================================");
    console.log("LOGIN STARTED");
    console.log("Login mode:", this.loginMode);
    console.log("Identifier:", identifier);
    console.log("=================================");

    // =======================================================
    // CALL BACKEND
    // =======================================================

    this.authService.login(identifier, password).subscribe({
      // =====================================================
      // SUCCESS
      // =====================================================

      next: (response: any) => {
        console.log("LOGIN SUCCESS:", response);

        // ---------------------------------------------------
        // STOP LOADING
        // ---------------------------------------------------

        this.loading = false;

        // ---------------------------------------------------
        // UPDATE UI
        // ---------------------------------------------------

        this.cdr.detectChanges();

        // ---------------------------------------------------
        // CHECK RESPONSE
        // ---------------------------------------------------

        if (!response) {
          this.errorMessage = "Invalid response from server.";

          this.cdr.detectChanges();

          return;
        }

        // ---------------------------------------------------
        // CHECK ACCESS TOKEN
        // ---------------------------------------------------

        if (!response.access_token) {
          this.errorMessage = "Login failed. Access token not received.";

          this.cdr.detectChanges();

          return;
        }

        // ---------------------------------------------------
        // GET USER
        // ---------------------------------------------------

        const user = response.user;

        if (!user) {
          this.errorMessage = "User information not received.";

          this.cdr.detectChanges();

          return;
        }

        // ---------------------------------------------------
        // GET ROLE
        // ---------------------------------------------------

        const role = user.role;

        if (!role) {
          this.errorMessage =
            "User role not found. Please contact administrator.";

          this.cdr.detectChanges();

          return;
        }

        // ---------------------------------------------------
        // DEBUG
        // ---------------------------------------------------

        console.log("USER:", user);

        console.log("RAW ROLE:", role);

        // ---------------------------------------------------
        // WARM AVATAR CACHE (photo available before dashboard)
        // ---------------------------------------------------
        // The login response already carries the persisted
        // `profile_photo_updated_at` version signal. Prefetching the
        // blob here (fire-and-forget, shared via AvatarService's
        // per-version cache) means the topbar's first photoSrcFor —
        // mounted a moment later — hits the in-flight request or the
        // cached object URL instead of starting cold after render.
        // No second /me call: we reuse response.user directly.

        try {
          this.avatarService.prefetchForUser(user);
        } catch {
          /* prefetch is best-effort only */
        }

        // ---------------------------------------------------
        // PRIME NOTIFICATION BADGE (fire-and-forget, guarded)
        // ---------------------------------------------------
        // Token and user are stored by now, so the unread count can
        // load in the background while the dashboard renders — the
        // header badge appears on its own without ever opening the
        // Notifications page. Repeat logins for the same user reuse
        // the guarded single fetch, never a duplicate request.
        try {
          this.notificationService.ensureInitialized();
        } catch {
          /* badge priming is best-effort only */
        }

        // ---------------------------------------------------
        // REDIRECT
        // ---------------------------------------------------

        this.redirectByRole(role);
      },

      // =====================================================
      // ERROR
      // =====================================================

      error: (err: any) => {
        console.error("LOGIN ERROR:", err);

        // ---------------------------------------------------
        // STOP LOADING
        // ---------------------------------------------------

        this.loading = false;

        // ---------------------------------------------------
        // HTTP STATUS
        // ---------------------------------------------------

        const status = err?.status;

        // ---------------------------------------------------
        // BACKEND ERROR MESSAGE
        // ---------------------------------------------------

        let backendMessage = "";

        if (typeof err?.error === "string") {
          backendMessage = err.error.trim();
        } else {
          backendMessage = String(
            err?.error?.detail ?? err?.error?.message ?? "",
          ).trim();
        }

        const message = backendMessage.toLowerCase();

        console.log("HTTP STATUS:", status);

        console.log("BACKEND MESSAGE:", backendMessage);

        // =================================================
        // INVALID PASSWORD
        // =================================================

        if (
          message === "invalid_password" ||
          message.includes("invalid_password") ||
          message === "wrong password" ||
          message.includes("wrong password") ||
          message === "incorrect password" ||
          message.includes("incorrect password")
        ) {
          this.errorMessage = "Invalid password.";
        }

        // =================================================
        // INVALID CREDENTIAL
        // =================================================
        else if (
          message === "invalid_credential" ||
          message.includes("invalid_credential") ||
          message === "invalid credential" ||
          message.includes("invalid credential") ||
          message.includes("invalid email or phone") ||
          message.includes("invalid email or phone number")
        ) {
          this.errorMessage = "Invalid credential.";
        }

        // =================================================
        // ANY 401
        // =================================================
        else if (status === 401) {
          this.errorMessage = "Invalid credential.";
        }

        // =================================================
        // 403
        // =================================================
        else if (status === 403) {
          this.errorMessage =
            "Your account is inactive. Please contact administrator.";
        }

        // =================================================
        // VALIDATION ERROR
        // =================================================
        else if (status === 422) {
          this.errorMessage = "Please enter valid login details.";
        }

        // =================================================
        // SERVER ERROR
        // =================================================
        else if (status !== undefined && status >= 500) {
          this.errorMessage = "Server error. Please try again later.";
        }

        // =================================================
        // CONNECTION ERROR
        // =================================================
        else if (status === 0) {
          this.errorMessage = "Unable to connect to the server.";
        }

        // =================================================
        // OTHER ERROR
        // =================================================
        else {
          this.errorMessage =
            backendMessage || "Login failed. Please check your credentials.";
        }

        // ---------------------------------------------------
        // FORCE UI UPDATE
        // ---------------------------------------------------

        this.cdr.detectChanges();

        console.log("LOGIN FINISHED");

        console.log("LOADING:", this.loading);

        console.log("ERROR MESSAGE:", this.errorMessage);
      },
    });
  }

  // =========================================================
  // NORMALIZE ROLE
  // =========================================================

  private normalizeRole(role: string): string {
    const normalized = String(role || "")
      .trim()
      .toUpperCase();

    // =======================================================
    // ADMIN
    // =======================================================

    if (normalized === "ADMIN" || normalized === "ADMINISTRATOR") {
      return "ADMIN";
    }

    // =======================================================
    // GOVERNMENT
    // =======================================================

    if (
      normalized === "GOVERNMENT" ||
      normalized === "GOVT" ||
      normalized === "GOVERNMENT_OFFICIAL" ||
      normalized === "GOVERNMENT_OFFICER" ||
      normalized === "GOVERNMENT OFFICIAL"
    ) {
      return "GOVERNMENT_OFFICIAL";
    }

    // =======================================================
    // CITIZEN
    // =======================================================

    if (normalized === "CITIZEN") {
      return "CITIZEN";
    }

    // =======================================================
    // RESEARCHER
    // =======================================================

    if (normalized === "RESEARCHER") {
      return "RESEARCHER";
    }

    // =======================================================
    // ORGANIZATION
    // =======================================================

    if (
      normalized === "ORGANIZATION" ||
      normalized === "ORGANISATION" ||
      normalized === "ORG"
    ) {
      return "ORGANIZATION";
    }

    // =======================================================
    // GUEST
    // =======================================================

    if (normalized === "GUEST" || normalized === "GUEST_USER") {
      return "GUEST";
    }

    // =======================================================
    // UNKNOWN
    // =======================================================

    return normalized;
  }

  // =========================================================
  // REDIRECT BASED ON ROLE
  // =========================================================

  private redirectByRole(role: string): void {
    // -------------------------------------------------------
    // NORMALIZE ROLE
    // -------------------------------------------------------

    const normalizedRole = this.normalizeRole(role);

    console.log("RAW ROLE:", role);

    console.log("NORMALIZED ROLE:", normalizedRole);

    // =======================================================
    // ROLE ROUTING
    // =======================================================

    switch (normalizedRole) {
      // =====================================================
      // ADMIN
      // =====================================================

      case "ADMIN":
        console.log("→ Admin Dashboard");

        console.log("REDIRECTING: ADMIN");

        this.router
          .navigate(["/dashboard/admin"])
          .then((success) => {
            console.log("Admin navigation:", success);
          })
          .catch((error) => {
            console.error("Admin navigation error:", error);
          });

        break;

      // =====================================================
      // GOVERNMENT OFFICIAL
      // =====================================================

      case "GOVERNMENT_OFFICIAL":
        console.log("→ Government Dashboard");

        console.log("REDIRECTING: GOVERNMENT");

        this.router
          .navigate(["/dashboard/government"])
          .then((success) => {
            console.log("Government navigation:", success);
          })
          .catch((error) => {
            console.error("Government navigation error:", error);
          });

        break;

      // =====================================================
      // CITIZEN
      // =====================================================

      case "CITIZEN":
        console.log("→ Citizen Dashboard");

        console.log("REDIRECTING: CITIZEN");

        this.router
          .navigate(["/dashboard/citizen"])
          .then((success) => {
            console.log("Citizen navigation:", success);
          })
          .catch((error) => {
            console.error("Citizen navigation error:", error);
          });

        break;

      // =====================================================
      // RESEARCHER
      // =====================================================

      case "RESEARCHER":
        console.log("→ Researcher Dashboard");

        console.log("REDIRECTING: RESEARCHER");

        this.router
          .navigate(["/dashboard/researcher"])
          .then((success) => {
            console.log("Researcher navigation:", success);
          })
          .catch((error) => {
            console.error("Researcher navigation error:", error);
          });

        break;

      // =====================================================
      // ORGANIZATION
      // =====================================================

      case "ORGANIZATION":
        console.log("→ Organization Dashboard");

        console.log("REDIRECTING: ORGANIZATION");

        this.router
          .navigate(["/dashboard/organization"])
          .then((success) => {
            console.log("Organization navigation:", success);
          })
          .catch((error) => {
            console.error("Organization navigation error:", error);
          });

        break;

      // =====================================================
      // GUEST
      // =====================================================

      case "GUEST":
        console.log("→ Guest Dashboard");

        console.log("REDIRECTING: GUEST");

        this.router
          .navigate(["/dashboard/guest"])
          .then((success) => {
            console.log("Guest navigation:", success);
          })
          .catch((error) => {
            console.error("Guest navigation error:", error);
          });

        break;

      // =====================================================
      // UNKNOWN ROLE
      // =====================================================

      default:
        console.error("Unknown user role:", normalizedRole);

        this.errorMessage = `Unknown user role: ${role}. Please contact administrator.`;

        this.cdr.detectChanges();

        break;
    }
  }

  // =========================================================
  // GUEST USER
  // =========================================================

  loginAsGuest(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = "";
    this.loading = true;

    this.authService.loginAsGuest().subscribe({
      next: (response) => {
        this.loading = false;
        console.log("Guest login success:", response);
        try {
          if (response?.user) {
            this.avatarService.prefetchForUser(response.user);
          }
        } catch {
          /* prefetch is best-effort only */
        }
        this.router.navigate(["/dashboard/guest"]);
      },
      error: (error) => {
        this.loading = false;
        console.warn("Backend guest login unavailable, proceeding in client guest mode:", error);
        this.router.navigate(["/dashboard/guest"]);
      },
    });
  }

  // =========================================================
  // FORGOT PASSWORD
  // =========================================================

  goToPasswordReset(): void {
    console.log("Opening password reset page...");

    this.router
      .navigate(["/auth/password-reset"])
      .then((success) => {
        console.log("Password reset navigation:", success);
      })
      .catch((error) => {
        console.error("Password reset navigation error:", error);
      });
  }
}
