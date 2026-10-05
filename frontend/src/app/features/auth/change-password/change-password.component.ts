import { ChangeDetectorRef, Component } from "@angular/core";

import { CommonModule } from "@angular/common";

import { FormsModule } from "@angular/forms";

import { HttpClient, HttpErrorResponse } from "@angular/common/http";

import { Router } from "@angular/router";

import { Auth } from "../../../core/services/auth";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";
import { environment } from '../../../../environments/environment';

@Component({
  selector: "app-change-password",

  standalone: true,

  imports: [CommonModule, FormsModule, BreadcrumbComponent],

  templateUrl: "./change-password.component.html",

  styleUrl: "./change-password.component.scss",
})
export class ChangePasswordComponent {
  // =========================================================
  // API
  // =========================================================

  private readonly apiUrl = `${environment.apiUrl}/auth`;

  // =========================================================
  // FORM VALUES
  // =========================================================

  currentPassword: string = "";

  newPassword: string = "";

  confirmPassword: string = "";

  // =========================================================
  // PASSWORD VISIBILITY
  // =========================================================

  showCurrentPassword: boolean = false;

  showNewPassword: boolean = false;

  showConfirmPassword: boolean = false;

  // =========================================================
  // STATE
  // =========================================================

  changingPassword: boolean = false;

  successMessage: string = "";

  errorMessage: string = "";

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private http: HttpClient,

    private authService: Auth,

    private router: Router,

    private cdr: ChangeDetectorRef,
  ) {}

  // =========================================================
  // TOGGLE CURRENT PASSWORD
  // =========================================================

  toggleCurrentPassword(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  // =========================================================
  // TOGGLE NEW PASSWORD
  // =========================================================

  toggleNewPassword(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  // =========================================================
  // TOGGLE CONFIRM PASSWORD
  // =========================================================

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  // =========================================================
  // PASSWORD STRENGTH
  // =========================================================

  private isStrongPassword(password: string): boolean {
    if (password.length < 8 || password.length > 72) {
      return false;
    }

    const hasLowercase = /[a-z]/.test(password);

    const hasUppercase = /[A-Z]/.test(password);

    const hasNumber = /[0-9]/.test(password);

    const hasSpecial = /[^a-zA-Z0-9]/.test(password);

    const count = [hasLowercase, hasUppercase, hasNumber, hasSpecial].filter(
      Boolean,
    ).length;

    return count >= 3;
  }

  // =========================================================
  // CHANGE PASSWORD
  // =========================================================

  onChangePassword(): void {
    // -------------------------------------------------------
    // CLEAR OLD MESSAGES
    // -------------------------------------------------------

    this.errorMessage = "";

    this.successMessage = "";

    // -------------------------------------------------------
    // CURRENT PASSWORD
    // -------------------------------------------------------

    if (!this.currentPassword) {
      this.errorMessage = "Current password is required.";

      this.cdr.markForCheck();

      return;
    }

    // -------------------------------------------------------
    // NEW PASSWORD
    // -------------------------------------------------------

    if (!this.newPassword) {
      this.errorMessage = "New password is required.";

      this.cdr.markForCheck();

      return;
    }

    // -------------------------------------------------------
    // CONFIRM PASSWORD
    // -------------------------------------------------------

    if (!this.confirmPassword) {
      this.errorMessage = "Confirm password is required.";

      this.cdr.markForCheck();

      return;
    }

    // -------------------------------------------------------
    // PASSWORD LENGTH
    // -------------------------------------------------------

    if (this.newPassword.length < 8) {
      this.errorMessage = "Password must be at least 8 characters long.";

      this.cdr.markForCheck();

      return;
    }

    if (this.newPassword.length > 72) {
      this.errorMessage = "Password must not exceed 72 characters.";

      this.cdr.markForCheck();

      return;
    }

    // -------------------------------------------------------
    // PASSWORD STRENGTH
    // -------------------------------------------------------

    if (!this.isStrongPassword(this.newPassword)) {
      this.errorMessage =
        "Password must contain at least 3 of: uppercase, lowercase, number, or special character.";

      this.cdr.markForCheck();

      return;
    }

    // -------------------------------------------------------
    // PASSWORD MATCH
    // -------------------------------------------------------

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = "Passwords do not match.";

      this.cdr.markForCheck();

      return;
    }

    // -------------------------------------------------------
    // NEW PASSWORD MUST BE DIFFERENT
    // -------------------------------------------------------

    if (this.currentPassword === this.newPassword) {
      this.errorMessage =
        "New password must be different from current password.";

      this.cdr.markForCheck();

      return;
    }

    // -------------------------------------------------------
    // PREVENT DOUBLE SUBMISSION
    // -------------------------------------------------------

    if (this.changingPassword) {
      return;
    }

    this.changingPassword = true;

    // =======================================================
    // VERY IMPORTANT
    //
    // These names MUST exactly match FastAPI:
    //
    // current_password
    // new_password
    // confirm_password
    //
    // =======================================================

    const payload = {
      current_password: this.currentPassword,

      new_password: this.newPassword,

      confirm_password: this.confirmPassword,
    };

    // -------------------------------------------------------
    // DEBUG
    // -------------------------------------------------------

    console.log("CHANGE PASSWORD PAYLOAD:", payload);

    // =======================================================
    // API
    // =======================================================

    this.http
      .post<{
        message: string;
      }>(`${this.apiUrl}/change-password`, payload)
      .subscribe({
        // ===================================================
        // SUCCESS
        // ===================================================

        next: (response) => {
          console.log("CHANGE PASSWORD SUCCESS:", response);

          this.changingPassword = false;

          this.successMessage =
            response?.message ||
            "Password changed successfully. Please login again.";

          this.errorMessage = "";

          // -------------------------------------------------
          // CLEAR FORM
          // -------------------------------------------------

          this.currentPassword = "";

          this.newPassword = "";

          this.confirmPassword = "";

          this.showCurrentPassword = false;

          this.showNewPassword = false;

          this.showConfirmPassword = false;

          this.cdr.markForCheck();

          // -------------------------------------------------
          // BACKEND INVALIDATES OLD TOKEN
          // -------------------------------------------------

          setTimeout(() => {
            this.authService.logout();

            this.router.navigate(["/auth/login"], {
              replaceUrl: true,
            });
          }, 1500);
        },

        // ===================================================
        // ERROR
        // ===================================================

        error: (error: HttpErrorResponse) => {
          console.error("CHANGE PASSWORD FAILED:", error);

          console.error("BACKEND RESPONSE:", error.error);

          this.changingPassword = false;

          // -------------------------------------------------
          // 422
          // -------------------------------------------------

          if (error.status === 422) {
            const detail = error.error?.detail;

            // FastAPI validation array

            if (Array.isArray(detail)) {
              const messages = detail
                .map((item: any) => item?.msg)
                .filter(Boolean);

              this.errorMessage = messages.length
                ? messages.join(". ")
                : "Please check all password fields.";
            }

            // Normal FastAPI message
            else if (typeof detail === "string") {
              this.errorMessage = detail;
            } else {
              this.errorMessage = "Please check all password fields.";
            }

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // 401
          // -------------------------------------------------

          if (error.status === 401) {
            this.errorMessage =
              error.error?.detail || "Current password is incorrect.";

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // 400
          // -------------------------------------------------

          if (error.status === 400) {
            this.errorMessage =
              error.error?.detail || "Unable to change password.";

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // 403
          // -------------------------------------------------

          if (error.status === 403) {
            this.errorMessage =
              error.error?.detail ||
              "You are not authorized to change the password.";

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // 0 = BACKEND NOT REACHABLE
          // -------------------------------------------------

          if (error.status === 0) {
            this.errorMessage =
              "Cannot connect to the backend. Make sure FastAPI is running.";

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // 500+
          // -------------------------------------------------

          if (error.status >= 500) {
            this.errorMessage = "Server error. Please try again.";

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // FALLBACK
          // -------------------------------------------------

          this.errorMessage =
            error.error?.detail || "Unable to change password.";

          this.cdr.markForCheck();
        },
      });
  }

  // =========================================================
  // BREADCRUMB (Home > Profile > Change Password)
  // =========================================================

  get breadcrumbItems(): BreadcrumbItem[] {
    const prefix = this.dashboardPrefix();
    if (!prefix) {
      return [];
    }
    return [
      { label: "Home", route: ["/dashboard", prefix] },
      { label: "Profile", route: ["/dashboard", prefix, "profile"] },
      { label: "Change Password" },
    ];
  }

  private dashboardPrefix(): string | null {
    const url = this.router.url || "";
    if (url.startsWith("/dashboard/admin")) return "admin";
    if (url.startsWith("/dashboard/citizen")) return "citizen";
    if (url.startsWith("/dashboard/government")) return "government";
    if (url.startsWith("/dashboard/researcher")) return "researcher";
    if (url.startsWith("/dashboard/organization")) return "organization";
    return null;
  }

  // =========================================================
  // BACK
  // =========================================================

  goBack(): void {
    const currentUrl = this.router.url;

    // -------------------------------------------------------
    // ADMIN
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/admin")) {
      this.router.navigate(["/dashboard/admin/profile"]);

      return;
    }

    // -------------------------------------------------------
    // CITIZEN
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/citizen")) {
      this.router.navigate(["/dashboard/citizen/profile"]);

      return;
    }

    // -------------------------------------------------------
    // GOVERNMENT
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/government")) {
      this.router.navigate(["/dashboard/government/profile"]);

      return;
    }

    // -------------------------------------------------------
    // RESEARCHER / ORGANIZATION
    // -------------------------------------------------------

    this.router.navigate(["/dashboard/user-dashboard/profile"]);
  }
}
