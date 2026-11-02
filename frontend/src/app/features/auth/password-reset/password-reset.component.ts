import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, OnDestroy } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { Auth } from "../../../core/services/auth";

@Component({
  selector: "app-password-reset",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./password-reset.component.html",
  styleUrl: "./password-reset.component.scss",
})
export class PasswordResetComponent implements OnDestroy {
  /* =========================================================
     CURRENT STEP

     1 = EMAIL
     2 = OTP
     3 = NEW PASSWORD
     4 = SUCCESS

     ========================================================= */

  currentStep = 1;

  /* =========================================================
     STATE
     ========================================================= */

  loading = false;
  errorMessage = "";
  successMessage = "";

  emailSubmitted = false;

  /* =========================================================
     RESET TOKEN

     This token is kept only in component memory.

     We do NOT store it in localStorage.

     ========================================================= */

  private resetToken = "";

  /* =========================================================
     PASSWORD VISIBILITY
     ========================================================= */

  hideNewPassword = true;
  hideConfirmPassword = true;

  /* =========================================================
     OTP
     ========================================================= */

  otp: string[] = ["", "", "", "", "", ""];

  resendDisabled = false;
  resendCountdown = 30;

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  /* =========================================================
     FORMS
     ========================================================= */

  emailForm: FormGroup;
  passwordForm: FormGroup;

  /* =========================================================
     CONSTRUCTOR
     ========================================================= */

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    /* =======================================================
       EMAIL FORM
       ======================================================= */

    this.emailForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
    });

    /* =======================================================
       PASSWORD FORM
       ======================================================= */

    this.passwordForm = this.fb.group(
      {
        newPassword: [
          "",
          [
            Validators.required,
            Validators.minLength(8),
            Validators.maxLength(72),
            Validators.pattern(
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/,
            ),
          ],
        ],

        confirmPassword: [
          "",
          [
            Validators.required,
            Validators.minLength(8),
            Validators.maxLength(72),
          ],
        ],
      },

      {
        validators: this.passwordMatchValidator,
      },
    );
  }

  /* =========================================================
     PASSWORD MATCH VALIDATOR
     ========================================================= */

  private passwordMatchValidator(form: FormGroup) {
    const password = form.get("newPassword")?.value;
    const confirmPassword = form.get("confirmPassword")?.value;

    if (!password || !confirmPassword) {
      return null;
    }

    return password === confirmPassword
      ? null
      : {
          passwordMismatch: true,
        };
  }

  /* =========================================================
     STEP 1
     SEND OTP
     ========================================================= */

  submitEmail(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = "";
    this.successMessage = "";

    /* -------------------------------------------------------
       VALIDATE EMAIL
       ------------------------------------------------------- */

    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    const email = String(this.emailForm.get("email")?.value || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return;
    }

    /* -------------------------------------------------------
       START LOADING
       ------------------------------------------------------- */

    this.loading = true;

    /* -------------------------------------------------------
       REQUEST PASSWORD RESET
       ------------------------------------------------------- */

    this.auth.requestPasswordReset(email).subscribe({
      next: (response) => {
        this.loading = false;

        this.emailSubmitted = true;

        this.currentStep = 2;

        this.otp = ["", "", "", "", "", ""];

        this.resetToken = "";

        this.successMessage =
          response?.message ||
          "A verification code has been sent to your email.";

        this.startResendCountdown();

        this.cdr.detectChanges();

        /* ---------------------------------------------------
           FOCUS FIRST OTP INPUT
           --------------------------------------------------- */

        setTimeout(() => {
          const firstOtpInput = document.getElementById(
            "otp-0",
          ) as HTMLInputElement | null;

          firstOtpInput?.focus();
        });
      },

      error: (err: any) => {
        this.loading = false;

        const backendMessage =
          typeof err?.error === "string"
            ? err.error
            : err?.error?.detail || err?.error?.message || "";

        this.errorMessage =
          backendMessage ||
          "Unable to send verification code. Please try again.";

        this.cdr.detectChanges();
      },
    });
  }

  /* =========================================================
     OTP INPUT
     ========================================================= */

  onOtpInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;

    let value = input.value.replace(/\D/g, "");

    if (value.length > 1) {
      value = value.charAt(value.length - 1);
    }

    this.otp[index] = value;

    input.value = value;

    /* -------------------------------------------------------
       MOVE TO NEXT INPUT
       ------------------------------------------------------- */

    if (value && index < 5) {
      const nextInput = document.getElementById(
        `otp-${index + 1}`,
      ) as HTMLInputElement | null;

      nextInput?.focus();
    }

    this.errorMessage = "";
  }

  /* =========================================================
     OTP KEYBOARD CONTROL
     ========================================================= */

  onOtpKeydown(event: KeyboardEvent, index: number): void {
    const input = event.target as HTMLInputElement;

    /* -------------------------------------------------------
       BACKSPACE
       ------------------------------------------------------- */

    if (event.key === "Backspace" && !input.value && index > 0) {
      const previousInput = document.getElementById(
        `otp-${index - 1}`,
      ) as HTMLInputElement | null;

      previousInput?.focus();
    }

    /* -------------------------------------------------------
       ARROW LEFT
       ------------------------------------------------------- */

    if (event.key === "ArrowLeft" && index > 0) {
      const previousInput = document.getElementById(
        `otp-${index - 1}`,
      ) as HTMLInputElement | null;

      previousInput?.focus();
    }

    /* -------------------------------------------------------
       ARROW RIGHT
       ------------------------------------------------------- */

    if (event.key === "ArrowRight" && index < 5) {
      const nextInput = document.getElementById(
        `otp-${index + 1}`,
      ) as HTMLInputElement | null;

      nextInput?.focus();
    }
  }

  /* =========================================================
     OTP PASTE
     ========================================================= */

  onOtpPaste(event: ClipboardEvent): void {
    event.preventDefault();

    const pastedText = event.clipboardData
      ?.getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!pastedText) {
      return;
    }

    for (let i = 0; i < 6; i++) {
      this.otp[i] = pastedText[i] || "";
    }

    setTimeout(() => {
      const nextEmptyIndex = this.otp.findIndex((value) => !value);

      const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;

      const input = document.getElementById(
        `otp-${focusIndex}`,
      ) as HTMLInputElement | null;

      input?.focus();
    });
  }

  /* =========================================================
     STEP 2
     VERIFY OTP
     ========================================================= */

  verifyOtp(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = "";
    this.successMessage = "";

    /* -------------------------------------------------------
       VALIDATE OTP
       ------------------------------------------------------- */

    const enteredOtp = this.otp.join("");

    if (enteredOtp.length !== 6) {
      this.errorMessage = "Please enter the complete 6-digit OTP.";

      return;
    }

    /* -------------------------------------------------------
       GET EMAIL
       ------------------------------------------------------- */

    const email = String(this.emailForm.get("email")?.value || "")
      .trim()
      .toLowerCase();

    if (!email) {
      this.errorMessage = "Email address is required.";
      return;
    }

    /* -------------------------------------------------------
       START LOADING
       ------------------------------------------------------- */

    this.loading = true;

    /* -------------------------------------------------------
       VERIFY OTP WITH BACKEND
       ------------------------------------------------------- */

    this.auth.verifyOtp(email, enteredOtp).subscribe({
      next: (response) => {
        this.loading = false;

        /* -------------------------------------------------
           STORE RESET TOKEN IN MEMORY
           ------------------------------------------------- */

        this.resetToken = response.reset_token;

        if (!this.resetToken) {
          this.errorMessage =
            "Reset session could not be created. Please try again.";

          return;
        }

        /* -------------------------------------------------
           MOVE TO PASSWORD SCREEN
           ------------------------------------------------- */

        this.successMessage = response.message || "OTP verified successfully.";

        this.currentStep = 3;

        this.cdr.detectChanges();
      },

      error: (err: any) => {
        this.loading = false;

        const backendMessage =
          typeof err?.error === "string"
            ? err.error
            : err?.error?.detail || err?.error?.message || "";

        this.errorMessage = backendMessage || "Invalid OTP. Please try again.";

        this.cdr.detectChanges();
      },
    });
  }

  /* =========================================================
     RESEND OTP
     ========================================================= */

  resendOtp(): void {
    if (this.resendDisabled || this.loading || !this.emailSubmitted) {
      return;
    }

    const email = String(this.emailForm.get("email")?.value || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return;
    }

    this.loading = true;

    this.errorMessage = "";
    this.successMessage = "";

    /* -------------------------------------------------------
       REQUEST NEW OTP
       ------------------------------------------------------- */

    this.auth.requestPasswordReset(email).subscribe({
      next: (response) => {
        this.loading = false;

        this.otp = ["", "", "", "", "", ""];

        this.resetToken = "";

        this.successMessage =
          response?.message || "A new verification code has been sent.";

        this.startResendCountdown();

        this.cdr.detectChanges();

        /* ---------------------------------------------------
           FOCUS FIRST OTP INPUT
           --------------------------------------------------- */

        setTimeout(() => {
          const firstOtpInput = document.getElementById(
            "otp-0",
          ) as HTMLInputElement | null;

          firstOtpInput?.focus();
        });
      },

      error: (err: any) => {
        this.loading = false;

        const backendMessage =
          typeof err?.error === "string"
            ? err.error
            : err?.error?.detail || err?.error?.message || "";

        this.errorMessage =
          backendMessage || "Unable to resend OTP. Please try again.";

        this.cdr.detectChanges();
      },
    });
  }

  /* =========================================================
     RESEND COUNTDOWN
     ========================================================= */

  private startResendCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }

    this.resendDisabled = true;
    this.resendCountdown = 30;

    this.countdownTimer = setInterval(() => {
      this.resendCountdown--;

      if (this.resendCountdown <= 0) {
        this.resendDisabled = false;

        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
      }

      this.cdr.detectChanges();
    }, 1000);
  }

  /* =========================================================
     STEP 3
     RESET PASSWORD
     ========================================================= */

  resetPassword(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = "";
    this.successMessage = "";

    /* -------------------------------------------------------
       CHECK RESET TOKEN
       ------------------------------------------------------- */

    if (!this.resetToken) {
      this.errorMessage =
        "Your password reset session has expired. Please start again.";

      this.currentStep = 1;

      return;
    }

    /* -------------------------------------------------------
       VALIDATE PASSWORD FORM
       ------------------------------------------------------- */

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const newPassword = String(
      this.passwordForm.get("newPassword")?.value || "",
    );

    const confirmPassword = String(
      this.passwordForm.get("confirmPassword")?.value || "",
    );

    /* -------------------------------------------------------
       PASSWORD MATCH
       ------------------------------------------------------- */

    if (newPassword !== confirmPassword) {
      this.errorMessage = "Passwords do not match.";
      return;
    }

    /* -------------------------------------------------------
       START LOADING
       ------------------------------------------------------- */

    this.loading = true;

    /* -------------------------------------------------------
       CALL BACKEND
       ------------------------------------------------------- */

    this.auth
      .resetPassword(this.resetToken, newPassword, confirmPassword)
      .subscribe({
        next: (response) => {
          this.loading = false;

          this.successMessage =
            response?.message || "Password reset successfully.";

          /* -----------------------------------------------
             REMOVE RESET TOKEN FROM MEMORY
             ----------------------------------------------- */

          this.resetToken = "";

          /* -----------------------------------------------
             MOVE TO SUCCESS
             ----------------------------------------------- */

          this.currentStep = 4;

          this.cdr.detectChanges();
        },

        error: (err: any) => {
          this.loading = false;

          const backendMessage =
            typeof err?.error === "string"
              ? err.error
              : err?.error?.detail || err?.error?.message || "";

          this.errorMessage =
            backendMessage || "Unable to reset password. Please try again.";

          this.cdr.detectChanges();
        },
      });
  }

  /* =========================================================
     PASSWORD STRENGTH
     ========================================================= */

  hasMinLength(): boolean {
    const password = this.passwordForm.get("newPassword")?.value || "";

    return password.length >= 8;
  }

  hasUppercase(): boolean {
    const password = this.passwordForm.get("newPassword")?.value || "";

    return /[A-Z]/.test(password);
  }

  hasLowercase(): boolean {
    const password = this.passwordForm.get("newPassword")?.value || "";

    return /[a-z]/.test(password);
  }

  hasNumber(): boolean {
    const password = this.passwordForm.get("newPassword")?.value || "";

    return /\d/.test(password);
  }

  hasSpecialCharacter(): boolean {
    const password = this.passwordForm.get("newPassword")?.value || "";

    return /[@$!%*?&]/.test(password);
  }

  /* =========================================================
     GO BACK
     ========================================================= */

  goBack(): void {
    this.errorMessage = "";
    this.successMessage = "";

    /* -------------------------------------------------------
       STEP 2 → STEP 1
       ------------------------------------------------------- */

    if (this.currentStep === 2) {
      this.currentStep = 1;

      this.otp = ["", "", "", "", "", ""];

      this.resetToken = "";

      this.stopCountdown();

      return;
    }

    /* -------------------------------------------------------
       STEP 3 → STEP 2
       ------------------------------------------------------- */

    if (this.currentStep === 3) {
      this.currentStep = 2;

      this.resetToken = "";

      this.passwordForm.reset();

      return;
    }

    /* -------------------------------------------------------
       STEP 4 → LOGIN
       ------------------------------------------------------- */

    this.router.navigate(["/auth/login"]);
  }

  /* =========================================================
     MASK EMAIL
     ========================================================= */

  getMaskedEmail(): string {
    const email = String(this.emailForm.get("email")?.value || "").trim();

    const parts = email.split("@");

    if (parts.length !== 2) {
      return email;
    }

    const username = parts[0];
    const domain = parts[1];

    if (username.length <= 2) {
      return `${username.charAt(0)}***@${domain}`;
    }

    return `${username.charAt(0)}${"*".repeat(
      Math.max(username.length - 2, 2),
    )}${username.charAt(username.length - 1)}@${domain}`;
  }

  /* =========================================================
     STOP COUNTDOWN
     ========================================================= */

  private stopCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.resendDisabled = false;
  }

  /* =========================================================
     DESTROY
     ========================================================= */

  ngOnDestroy(): void {
    this.stopCountdown();

    this.resetToken = "";
  }
}
