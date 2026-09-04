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

@Component({
  selector: "app-login",

  standalone: true,

  imports: [CommonModule, ReactiveFormsModule, RouterLink],

  templateUrl: "./login.component.html",

  styleUrl: "./login.component.scss",
})
export class LoginComponent {
  /* =========================================================
     VARIABLES
     ========================================================= */

  form: FormGroup;

  loading = false;

  errorMessage = "";

  hidePassword = true;

  loginMode: "email" | "phone" = "email";

  /* =========================================================
     CONSTRUCTOR
     ========================================================= */

  constructor(
    private fb: FormBuilder,

    private authService: Auth,

    private router: Router,

    private cdr: ChangeDetectorRef,
  ) {
    /* =======================================================
       LOGIN FORM
       ======================================================= */

    this.form = this.fb.group({
      email: ["", [Validators.email]],

      phone: ["", [Validators.pattern(/^[0-9]{10}$/)]],

      password: ["", [Validators.required]],

      rememberMe: [false],
    });

    /* =======================================================
       INITIAL VALIDATORS
       ======================================================= */

    this.setLoginValidators();
  }

  /* =========================================================
     TOGGLE EMAIL / PHONE LOGIN
     ========================================================= */

  toggleLoginMode(): void {
    /* -------------------------------------------------------
       Don't change mode while logging in
       ------------------------------------------------------- */

    if (this.loading) {
      return;
    }

    /* -------------------------------------------------------
       Change mode
       ------------------------------------------------------- */

    this.loginMode = this.loginMode === "email" ? "phone" : "email";

    /* -------------------------------------------------------
       Clear error
       ------------------------------------------------------- */

    this.errorMessage = "";

    /* -------------------------------------------------------
       Clear fields
       ------------------------------------------------------- */

    this.form.get("email")?.reset("");

    this.form.get("phone")?.reset("");

    this.form.get("password")?.reset("");

    /* -------------------------------------------------------
       Reset validation state
       ------------------------------------------------------- */

    this.form.get("email")?.markAsUntouched();

    this.form.get("email")?.markAsPristine();

    this.form.get("phone")?.markAsUntouched();

    this.form.get("phone")?.markAsPristine();

    this.form.get("password")?.markAsUntouched();

    this.form.get("password")?.markAsPristine();

    /* -------------------------------------------------------
       Update validators
       ------------------------------------------------------- */

    this.setLoginValidators();

    /* -------------------------------------------------------
       Update UI
       ------------------------------------------------------- */

    this.cdr.detectChanges();
  }

  /* =========================================================
     LOGIN VALIDATORS
     ========================================================= */

  private setLoginValidators(): void {
    const emailControl = this.form.get("email");

    const phoneControl = this.form.get("phone");

    /* =======================================================
       EMAIL LOGIN
       ======================================================= */

    if (this.loginMode === "email") {
      emailControl?.setValidators([Validators.required, Validators.email]);

      phoneControl?.clearValidators();

      phoneControl?.setValue("", {
        emitEvent: false,
      });
    }

    /* =======================================================
       PHONE LOGIN
       ======================================================= */
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

    /* =======================================================
       UPDATE VALIDITY
       ======================================================= */

    emailControl?.updateValueAndValidity({
      emitEvent: false,
    });

    phoneControl?.updateValueAndValidity({
      emitEvent: false,
    });
  }

  /* =========================================================
     SUBMIT LOGIN
     ========================================================= */

  submit(): void {
    /* =======================================================
       PREVENT DOUBLE SUBMISSION
       ======================================================= */

    if (this.loading) {
      return;
    }

    /* =======================================================
       CLEAR OLD ERROR
       ======================================================= */

    this.errorMessage = "";

    /* =======================================================
       UPDATE VALIDATORS
       ======================================================= */

    this.setLoginValidators();

    /* =======================================================
       FRONTEND VALIDATION
       ======================================================= */

    if (this.form.invalid) {
      this.form.markAllAsTouched();

      this.cdr.detectChanges();

      return;
    }

    /* =======================================================
       GET EMAIL / PHONE
       ======================================================= */

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

    /* =======================================================
       GET PASSWORD
       ======================================================= */

    const password = String(this.form.get("password")?.value || "");

    /* =======================================================
       EXTRA VALIDATION
       ======================================================= */

    if (!identifier || !password) {
      this.form.markAllAsTouched();

      this.cdr.detectChanges();

      return;
    }

    /* =======================================================
       START LOADING
       ======================================================= */

    this.loading = true;

    this.errorMessage = "";

    /*
     * Immediately update the button.
     */
    this.cdr.detectChanges();

    console.log("=================================");

    console.log("LOGIN STARTED");

    console.log("Login mode:", this.loginMode);

    console.log("Identifier:", identifier);

    console.log("=================================");

    /* =======================================================
       CALL BACKEND
       ======================================================= */

    this.authService.login(identifier, password).subscribe({
      /* ===================================================
           SUCCESS
           =================================================== */

      next: (response) => {
        console.log("LOGIN SUCCESS:", response);

        /* -------------------------------------------------
             STOP LOADING IMMEDIATELY
             ------------------------------------------------- */

        this.loading = false;

        /* -------------------------------------------------
             UPDATE UI
             ------------------------------------------------- */

        this.cdr.detectChanges();

        /* -------------------------------------------------
             CHECK RESPONSE
             ------------------------------------------------- */

        if (!response) {
          this.errorMessage = "Invalid response from server.";

          this.cdr.detectChanges();

          return;
        }

        /* -------------------------------------------------
             CHECK TOKEN
             ------------------------------------------------- */

        if (!response.access_token) {
          this.errorMessage = "Login failed. Access token not received.";

          this.cdr.detectChanges();

          return;
        }

        /* -------------------------------------------------
             GET USER
             ------------------------------------------------- */

        const user = response.user;

        if (!user) {
          this.errorMessage = "User information not received.";

          this.cdr.detectChanges();

          return;
        }

        /* -------------------------------------------------
             GET ROLE
             ------------------------------------------------- */

        const role = user.role;

        if (!role) {
          this.errorMessage =
            "User role not found. Please contact administrator.";

          this.cdr.detectChanges();

          return;
        }

        console.log("USER:", user);

        console.log("ROLE:", role);

        /* -------------------------------------------------
             REDIRECT
             ------------------------------------------------- */

        this.redirectByRole(role);
      },

      /* ===================================================
           ERROR
           =================================================== */

      error: (err: any) => {
        console.error("LOGIN ERROR:", err);

        /* =================================================
             STOP LOADING IMMEDIATELY
             ================================================= */

        this.loading = false;

        /* =================================================
             READ HTTP STATUS
             ================================================= */

        const status = err?.status;

        /* =================================================
             READ BACKEND ERROR
             ================================================= */

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

        /* =================================================
             INVALID PASSWORD
             =================================================
             
             Backend:
             INVALID_PASSWORD
             
             Screen:
             Invalid password.
             ================================================= */

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

        /* =================================================
             INVALID CREDENTIAL
             ================================================= */
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

        /* =================================================
             ANY 401
             ================================================= */
        else if (status === 401) {
          this.errorMessage = "Invalid credential.";
        }

        /* =================================================
             ACCOUNT INACTIVE
             ================================================= */
        else if (status === 403) {
          this.errorMessage =
            "Your account is inactive. Please contact administrator.";
        }

        /* =================================================
             VALIDATION ERROR
             ================================================= */
        else if (status === 422) {
          this.errorMessage = "Please enter valid login details.";
        }

        /* =================================================
             SERVER ERROR
             ================================================= */
        else if (status !== undefined && status >= 500) {
          this.errorMessage = "Server error. Please try again later.";
        }

        /* =================================================
             CONNECTION ERROR
             ================================================= */
        else if (status === 0) {
          this.errorMessage = "Unable to connect to the server.";
        }

        /* =================================================
             OTHER ERROR
             ================================================= */
        else {
          this.errorMessage =
            backendMessage || "Login failed. Please check your credentials.";
        }

        /* =================================================
             FORCE IMMEDIATE UI UPDATE
             ================================================= */

        this.cdr.detectChanges();

        console.log("LOGIN FINISHED");

        console.log("LOADING:", this.loading);

        console.log("ERROR MESSAGE:", this.errorMessage);
      },
    });
  }

  /* =========================================================
     REDIRECT BASED ON ROLE
     ========================================================= */

  private redirectByRole(role: string): void {
    const normalizedRole = String(role).trim().toUpperCase();

    console.log("REDIRECTING:", normalizedRole);

    switch (normalizedRole) {
      /* =====================================================
         ADMINISTRATOR
         ===================================================== */

      case "ADMINISTRATOR":
        this.router.navigate(["/dashboard/admin"]);

        break;

      /* =====================================================
         CITIZEN
         ===================================================== */

      case "CITIZEN":
        this.router.navigate(["/dashboard/citizen"]);

        break;

      /* =====================================================
         GOVERNMENT OFFICIAL
         ===================================================== */

      case "GOVERNMENT_OFFICIAL":
        this.router.navigate(["/dashboard/government"]);

        break;

      /* =====================================================
         RESEARCHER
         ===================================================== */

      case "RESEARCHER":
        this.router.navigate(["/dashboard/user-dashboard"]);

        break;

      /* =====================================================
         ORGANIZATION
         ===================================================== */

      case "ORGANIZATION":
        this.router.navigate(["/dashboard/user-dashboard"]);

        break;

      /* =====================================================
         GUEST
         ===================================================== */

      case "GUEST":
        this.router.navigate(["/dashboard/user-dashboard"]);

        break;

      /* =====================================================
         UNKNOWN ROLE
         ===================================================== */

      default:
        this.errorMessage = "Unknown user role. Please contact administrator.";

        this.cdr.detectChanges();

        break;
    }
  }

  /* =========================================================
     GOOGLE LOGIN
     ========================================================= */

  loginWithGoogle(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = "Google login is not available yet.";

    this.cdr.detectChanges();
  }

  /* =========================================================
     FORGOT PASSWORD
     ========================================================= */

  goToPasswordReset(): void {
    console.log("Opening password reset page...");

    this.router.navigate(["/auth/password-reset"]).then((success) => {
      console.log("Password reset navigation:", success);
    });
  }
}
