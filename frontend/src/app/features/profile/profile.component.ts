import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  inject,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { timeout } from "rxjs";

import { Auth, AuthUser } from "../../core/services/auth";
import { AvatarService } from "../../core/services/avatar.service";
import { ToastService } from "../../core/services/toast.service";
import { UserAvatarComponent } from "../../shared/components/user-avatar/user-avatar.component";
import { ConfirmModalComponent } from "../../shared/components/confirm-modal/confirm-modal.component";
import { ChangePasswordModalComponent } from "../../shared/components/change-password-modal/change-password-modal.component";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../shared/components/breadcrumb/breadcrumb.component";
import { environment } from '../../../environments/environment';

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
}

// =========================================================
// PROFILE COMPONENT
// =========================================================

@Component({
  selector: "app-profile",

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    BreadcrumbComponent,
    UserAvatarComponent,
    ConfirmModalComponent,
    ChangePasswordModalComponent,
  ],

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

  private readonly avatarService = inject(AvatarService);

  private readonly cdr = inject(ChangeDetectorRef);

  private readonly http = inject(HttpClient);

  private readonly toast = inject(ToastService);

  private readonly destroyRef = inject(DestroyRef);

  /** Trigger refs so focus returns to the invoking button on close. */
  private readonly changePasswordBtn =
    viewChild<ElementRef<HTMLButtonElement>>("changePasswordBtn");
  private readonly deleteAccountBtn =
    viewChild<ElementRef<HTMLButtonElement>>("deleteAccountBtn");

  /**
   * Role-aware breadcrumb trail (Home > Profile) derived from the current
   * dashboard URL, mirroring the goBack() prefix mapping below.
   */
  get breadcrumbItems(): BreadcrumbItem[] {
    const prefix = this.dashboardPrefix();
    if (!prefix) {
      return [];
    }
    return [
      { label: "Home", route: ["/dashboard", prefix] },
      { label: "Profile" },
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
  // API
  // =========================================================

  private readonly apiUrl = `${environment.apiUrl}/auth`;

  // =========================================================
  // MODALS
  // =========================================================

  showDeleteModal = false;

  showPasswordModal = false;

  /** Change-password dialog (rendered over this page, no navigation). */
  showChangePasswordModal = false;

  /** Inline error for the delete-account modals (no alert dialogs). */
  deleteError = "";

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
  };

  /** Object URL of the authenticated user's photo; null = default SVG. */
  avatarSrc: string | null = null;

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    // -------------------------------------------------------
    // SHARED STATE FIRST (instant paint incl. photo version)
    // -------------------------------------------------------
    // Subscribing before the background refresh guarantees the
    // saved photo version from login/app-init is used immediately,
    // and any later shared updates (photo change in Edit) reflect
    // here without reopening the page.

    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (user) {
          this.setProfile(user);
        }
      });

    // -------------------------------------------------------
    // LOAD CACHED USER (synchronous instant paint fallback)
    // -------------------------------------------------------

    const cachedUser =
      this.authService.getCurrentUserSnapshot?.() ??
      this.authService.getStoredUser();

    if (cachedUser) {
      this.setProfile(cachedUser);
    }

    // -------------------------------------------------------
    // BACKGROUND REFRESH (deduplicated + TTL by AuthService)
    // -------------------------------------------------------
    // Refreshes the SHARED state (setUser emission) rather than a
    // local copy, so Topbar/Settings update together with ONE fetch.

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

      gender: user.gender?.trim() || "Not provided",

      state: user.state || "Not provided",

      district: user.district || "Not provided",

      occupation: user.occupation || "Not provided",

      phone: user.phone || "Not provided",
    };

    this.refreshAvatar(user);

    this.cdr.markForCheck();
  }

  /**
   * Resolve the avatar through the same shared AvatarService the
   * topbars use, so Profile and topbar can never disagree.
   */
  private refreshAvatar(user: AuthUser): void {
    this.avatarService.photoSrcFor(user).subscribe({
      next: (src) => {
        this.avatarSrc = src;
        this.cdr.markForCheck();
      },
      error: () => {
        this.avatarSrc = null;
        this.cdr.markForCheck();
      },
    });
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
    // RESEARCHER
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/researcher")) {
      this.router.navigate(["/dashboard/researcher"]);

      return;
    }

    // -------------------------------------------------------
    // ORGANIZATION
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/organization")) {
      this.router.navigate(["/dashboard/organization"]);

      return;
    }

    // -------------------------------------------------------
    // FALLBACK
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
    // RESEARCHER
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/researcher")) {
      this.router.navigate(["/dashboard/researcher/profile/edit"]);

      return;
    }

    // -------------------------------------------------------
    // ORGANIZATION
    // -------------------------------------------------------

    if (currentUrl.startsWith("/dashboard/organization")) {
      this.router.navigate(["/dashboard/organization/profile/edit"]);

      return;
    }

    // -------------------------------------------------------
    // FALLBACK
    // -------------------------------------------------------

    this.router.navigate(["/dashboard/user-dashboard/profile/edit"]);
  }

  // =========================================================
  // CHANGE PASSWORD (modal over this page — no navigation)
  // =========================================================

  onChangePassword(): void {
    this.showChangePasswordModal = true;

    this.cdr.markForCheck();
  }

  closeChangePasswordModal(): void {
    this.showChangePasswordModal = false;

    this.cdr.markForCheck();

    this.changePasswordBtn()?.nativeElement.focus();
  }

  onPasswordChanged(): void {
    // Success toast is shown by the modal itself; the shared user
    // needs no update (password is not part of the profile state).
    this.cdr.markForCheck();
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

    this.deleteError = "";

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

    this.deleteError = "";

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

    this.deleteError = "";

    this.cdr.markForCheck();

    this.deleteAccountBtn()?.nativeElement.focus();
  }

  /** ESC closes the delete password step (ConfirmModal handles its own). */
  @HostListener("document:keydown.escape")
  onEscapeKey(): void {
    if (this.showPasswordModal && !this.deletingAccount) {
      this.cancelDeleteAccount();
    }
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
      this.deleteError = "Please enter your password to confirm.";

      this.cdr.markForCheck();

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

    this.deleteError = "";

    this.cdr.markForCheck();

    // -------------------------------------------------------
    // BACKEND REQUEST (existing delete-account endpoint)
    // -------------------------------------------------------

    this.http
      .delete<{
        message: string;
      }>(`${this.apiUrl}/account`, {
        body: {
          password: password,
        },
      })
      .pipe(timeout(30_000))
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

          this.deleteError = "";

          this.deletingAccount = false;

          this.cdr.markForCheck();

          // -------------------------------------------------
          // GO TO LOGIN
          // -------------------------------------------------

          this.router.navigate(["/auth/login"], {
            replaceUrl: true,
          });
        },

        // ===================================================
        // ERROR (modal stays open, values preserved, retryable)
        // ===================================================

        error: (error: { status?: number; name?: string }) => {
          console.error("Account deletion failed:", error);

          this.deletingAccount = false;

          // -------------------------------------------------
          // WRONG PASSWORD
          // -------------------------------------------------

          if (error?.status === 401) {
            this.deleteError = "Incorrect password. Please try again.";

            this.confirmPasswordValue = "";

            this.showPasswordText = false;

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // VALIDATION ERROR
          // -------------------------------------------------

          if (error?.status === 422) {
            this.deleteError = "Please enter a valid password.";

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // TIMEOUT / UNREACHABLE
          // -------------------------------------------------

          if (error?.name === "TimeoutError" || error?.status === 0) {
            this.deleteError =
              "Cannot reach the server. Please check your connection and try again.";

            this.cdr.markForCheck();

            return;
          }

          // -------------------------------------------------
          // SERVER / OTHER ERROR
          // -------------------------------------------------

          if (error?.status !== undefined && error.status >= 500) {
            this.deleteError =
              "Unable to delete your account right now. Please try again.";

            this.cdr.markForCheck();

            return;
          }

          this.deleteError = "Account deletion failed. Please try again.";

          this.cdr.markForCheck();
        },
      });
  }
}
