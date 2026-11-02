import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from "@angular/core";

import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";

import { Auth, AuthUser } from "../../core/services/auth";

// =========================================================
// USER PROFILE INTERFACE
// =========================================================

export interface UserProfile {
  fullName: string;
  email: string;
  role: string;
  dob: string;
  gender: string;
  state: string;
  district: string;
  occupation: string;
  phone: string;
  avatarUrl: string;
}

// =========================================================
// PROFILE COMPONENT
// =========================================================

@Component({
  selector: "app-profile",

  standalone: true,

  imports: [CommonModule, FormsModule],

  templateUrl: "./profile.component.html",

  styleUrls: ["./profile.component.scss"],

  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  // =========================================================
  // SERVICES
  // =========================================================

  private readonly router = inject(Router);

  private readonly authService = inject(Auth);

  private readonly cdr = inject(ChangeDetectorRef);

  private readonly http = inject(HttpClient);

  // =========================================================
  // API
  // =========================================================

  private readonly apiUrl = "http://localhost:8000/auth";

  // =========================================================
  // MODALS
  // =========================================================

  showDeleteModal = false;

  showPasswordModal = false;

  // =========================================================
  // DELETE PASSWORD
  // =========================================================

  confirmPasswordValue = "";

  showPasswordText = false;

  deletingAccount = false;

  // =========================================================
  // USER PROFILE
  // =========================================================

  userProfile: UserProfile = {
    fullName: "USER NAME",

    email: "user.mail@gmail.com",

    role: "CITIZEN",

    dob: "Not provided",

    gender: "Not provided",

    state: "Not provided",

    district: "Not provided",

    occupation: "Not provided",

    phone: "Not provided",

    avatarUrl: "",
  };

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    // -------------------------------------------------------
    // LOAD CACHED USER
    // -------------------------------------------------------

    const cachedUser = this.authService.getStoredUser();

    if (cachedUser) {
      this.setProfile(cachedUser);
    }

    // -------------------------------------------------------
    // LOAD CURRENT USER FROM BACKEND
    // -------------------------------------------------------

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (user) {
          this.setProfile(user);
        }
      },

      error: (error: unknown) => {
        console.error("Unable to load profile:", error);
      },
    });
  }

  // =========================================================
  // SET PROFILE
  // =========================================================

  private setProfile(user: AuthUser): void {
    this.userProfile = {
      fullName: user.full_name?.trim() || "USER NAME",

      email: user.email || "Not provided",

      role: this.formatRole(user.role),

      dob: user.date_of_birth ? String(user.date_of_birth) : "Not provided",

      gender: "Not provided",

      state: user.state || "Not provided",

      district: user.district || "Not provided",

      occupation: user.occupation || "Not provided",

      phone: user.phone || "Not provided",

      avatarUrl: "",
    };

    this.cdr.markForCheck();
  }

  // =========================================================
  // FORMAT ROLE
  // =========================================================

  private formatRole(role: string | null | undefined): string {
    if (!role) {
      return "Citizen";
    }

    return role
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (character: string) => character.toUpperCase());
  }

  // =========================================================
  // BACK TO ROLE DASHBOARD
  // =========================================================

  goBack(): void {
    const currentUrl = this.router.url;

    // -------------------------------------------------------
    // ADMIN
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/admin")) {
      this.router.navigate(["/dashboard/admin"]);

      return;
    }

    // -------------------------------------------------------
    // CITIZEN
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/citizen")) {
      this.router.navigate(["/dashboard/citizen"]);

      return;
    }

    // -------------------------------------------------------
    // GOVERNMENT
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/government")) {
      this.router.navigate(["/dashboard/government"]);

      return;
    }

    // -------------------------------------------------------
    // RESEARCHER / ORGANIZATION
    // -------------------------------------------------------

    this.router.navigate(["/dashboard/user-dashboard"]);
  }

  // =========================================================
  // EDIT PROFILE
  // =========================================================

  onEditProfile(): void {
    const currentUrl = this.router.url;

    // -------------------------------------------------------
    // ADMIN
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/admin")) {
      this.router.navigate(["/dashboard/admin/profile/edit"]);

      return;
    }

    // -------------------------------------------------------
    // CITIZEN
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/citizen")) {
      this.router.navigate(["/dashboard/citizen/profile/edit"]);

      return;
    }

    // -------------------------------------------------------
    // GOVERNMENT
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/government")) {
      this.router.navigate(["/dashboard/government/profile/edit"]);

      return;
    }

    // -------------------------------------------------------
    // RESEARCHER / ORGANIZATION
    // -------------------------------------------------------

    this.router.navigate(["/dashboard/user-dashboard/profile/edit"]);
  }

  // =========================================================
  // CHANGE PASSWORD
  // =========================================================

  onChangePassword(): void {
    const currentUrl = this.router.url;

    // -------------------------------------------------------
    // ADMIN
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/admin")) {
      this.router.navigate(["/dashboard/admin/change-password"]);

      return;
    }

    // -------------------------------------------------------
    // CITIZEN
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/citizen")) {
      this.router.navigate(["/dashboard/citizen/change-password"]);

      return;
    }

    // -------------------------------------------------------
    // GOVERNMENT
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/government")) {
      this.router.navigate(["/dashboard/government/change-password"]);

      return;
    }

    // -------------------------------------------------------
    // RESEARCHER / ORGANIZATION
    // -------------------------------------------------------

    this.router.navigate(["/dashboard/user-dashboard/change-password"]);
  }

  // =========================================================
  // DELETE ACCOUNT
  // =========================================================

  onDeleteAccount(): void {
    if (this.deletingAccount) {
      return;
    }

    this.showDeleteModal = true;

    this.showPasswordModal = false;

    this.confirmPasswordValue = "";

    this.showPasswordText = false;

    this.cdr.markForCheck();
  }

  // =========================================================
  // DELETE -> PASSWORD
  // =========================================================

  confirmDeleteAccount(): void {
    this.showDeleteModal = false;

    this.showPasswordModal = true;

    this.confirmPasswordValue = "";

    this.showPasswordText = false;

    this.cdr.markForCheck();
  }

  // =========================================================
  // CANCEL DELETE
  // =========================================================

  cancelDeleteAccount(): void {
    if (this.deletingAccount) {
      return;
    }

    this.showDeleteModal = false;

    this.showPasswordModal = false;

    this.confirmPasswordValue = "";

    this.showPasswordText = false;

    this.cdr.markForCheck();
  }

  // =========================================================
  // PASSWORD VISIBILITY
  // =========================================================

  togglePasswordVisibility(): void {
    if (this.deletingAccount) {
      return;
    }

    this.showPasswordText = !this.showPasswordText;

    this.cdr.markForCheck();
  }

  // =========================================================
  // FINAL DELETE CONFIRMATION
  // =========================================================

  submitPasswordConfirmation(): void {
    // -------------------------------------------------------
    // CHECK EMPTY PASSWORD
    // -------------------------------------------------------

    const password = this.confirmPasswordValue.trim();

    if (!password) {
      alert("Please enter your password to confirm.");

      return;
    }

    // -------------------------------------------------------
    // PREVENT DOUBLE CLICK
    // -------------------------------------------------------

    if (this.deletingAccount) {
      return;
    }

    // -------------------------------------------------------
    // START DELETE
    // -------------------------------------------------------

    this.deletingAccount = true;

    this.cdr.markForCheck();

    // -------------------------------------------------------
    // BACKEND REQUEST
    // -------------------------------------------------------

    this.http
      .delete<{
        message: string;
      }>(`${this.apiUrl}/account`, {
        body: {
          password: password,
        },
      })
      .subscribe({
        // ===================================================
        // SUCCESS
        // ===================================================

        next: (response) => {
          console.log("Account deleted:", response);

          // -------------------------------------------------
          // CLEAR LOGIN SESSION
          // -------------------------------------------------

          this.authService.logout();

          // -------------------------------------------------
          // CLOSE MODALS
          // -------------------------------------------------

          this.showDeleteModal = false;

          this.showPasswordModal = false;

          this.confirmPasswordValue = "";

          this.showPasswordText = false;

          this.deletingAccount = false;

          // -------------------------------------------------
          // GO TO LOGIN
          // -------------------------------------------------

          alert("Your account has been deleted successfully.");

          this.router.navigate(["/auth/login"], {
            replaceUrl: true,
          });
        },

        // ===================================================
        // ERROR
        // ===================================================

        error: (error) => {
          console.error("Account deletion failed:", error);

          this.deletingAccount = false;

          // -------------------------------------------------
          // WRONG PASSWORD
          // -------------------------------------------------

          if (error?.status === 401) {
            alert("Incorrect password. Please try again.");

            this.confirmPasswordValue = "";

            this.showPasswordText = false;

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // VALIDATION ERROR
          // -------------------------------------------------

          if (error?.status === 422) {
            alert("Please enter a valid password.");

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // SERVER ERROR
          // -------------------------------------------------

          if (error?.status === 500) {
            alert("Unable to delete your account right now. Please try again.");

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // OTHER ERROR
          // -------------------------------------------------

          alert("Account deletion failed. Please try again.");

          this.cdr.markForCheck();
        },
      });
  }
}
