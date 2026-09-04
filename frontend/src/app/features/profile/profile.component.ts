import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from "@angular/core";

import { CommonModule, Location } from "@angular/common";

import { FormsModule } from "@angular/forms";

import { Router } from "@angular/router";

import { Auth, AuthUser } from "../../core/services/auth";

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

@Component({
  selector: "app-profile",

  standalone: true,

  imports: [CommonModule, FormsModule],

  templateUrl: "./profile.component.html",

  styleUrls: ["./profile.component.scss"],

  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly location = inject(Location);

  private readonly router = inject(Router);

  private readonly authService = inject(Auth);

  private readonly cdr = inject(ChangeDetectorRef);

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
    const cachedUser = this.authService.getStoredUser();

    if (cachedUser) {
      this.setProfile(cachedUser);
    }

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
  // BACK
  // =========================================================

  goBack(): void {
    this.location.back();
  }

  // =========================================================
  // EDIT PROFILE
  // =========================================================

  onEditProfile(): void {
    this.router.navigate(["/user/profile/edit"]);
  }

  // =========================================================
  // CHANGE PASSWORD
  // =========================================================

  onChangePassword(): void {
    this.router.navigate(["/auth/change-password"]);
  }

  // =========================================================
  // DELETE ACCOUNT
  // =========================================================

  onDeleteAccount(): void {
    this.showDeleteModal = true;

    this.showPasswordModal = false;

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
    this.showDeleteModal = false;

    this.showPasswordModal = false;

    this.confirmPasswordValue = "";

    this.cdr.markForCheck();
  }

  // =========================================================
  // PASSWORD VISIBILITY
  // =========================================================

  togglePasswordVisibility(): void {
    this.showPasswordText = !this.showPasswordText;

    this.cdr.markForCheck();
  }

  // =========================================================
  // FINAL DELETE CONFIRMATION
  // =========================================================

  submitPasswordConfirmation(): void {
    if (!this.confirmPasswordValue.trim()) {
      alert("Please enter your password to confirm.");

      return;
    }

    /*
     * IMPORTANT:
     * Connect your delete-account API here.
     */

    console.log("Account deletion requested");

    this.showPasswordModal = false;

    this.confirmPasswordValue = "";

    this.cdr.markForCheck();
  }
}
