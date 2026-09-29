import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, OnDestroy } from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { Auth } from "../../../core/services/auth";

type IdentifierType = "email" | "phone";

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const cleaned = String(phone)
    .trim()
    .replace(/[\s\-().]/g, "");

  if (/^\+91\d{10}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  if (/^\+\d{7,15}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

function identifierValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const raw = String(control.value || "").trim();

  if (!raw) {
    return null;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (emailPattern.test(raw)) {
    return null;
  }

  if (normalizePhone(raw)) {
    return null;
  }

  return {
    invalidIdentifier: true,
  };
}

@Component({
  selector: "app-password-reset",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./password-reset.component.html",
  styleUrl: "./password-reset.component.scss",
})
export class PasswordResetComponent implements OnDestroy {
  currentStep = 1;

  loading = false;
  errorMessage = "";
  successMessage = "";

  identifierType: IdentifierType = "email";

  submittedIdentifier = "";
  submittedEmail = "";
  submittedPhone = "";

  get channel(): "email" | "sms" {
    return this.identifierType === "phone" ? "sms" : "email";
  }

  private resetToken = "";

  hideNewPassword = true;
  hideConfirmPassword = true;

  otp: string[] = ["", "", "", "", "", ""];

  resendDisabled = false;
  resendCountdown = 30;

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  identifierForm: FormGroup;
  passwordForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    this.identifierForm = this.fb.group({
      identifier: ["", [Validators.required, identifierValidator]],
    });

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

  ngOnDestroy(): void {
    this.clearCountdown();
  }

  private passwordMatchValidator(
    form: AbstractControl,
  ): ValidationErrors | null {
    const password = form.get("newPassword")?.value;
    const confirmPassword = form.get("confirmPassword")?.value;

    if (!password || !confirmPassword) {
      return null;
    }

    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  onIdentifierInput(): void {
    this.errorMessage = "";

    const value = String(
      this.identifierForm.get("identifier")?.value || "",
    ).trim();

    this.identifierType = this.detectIdentifierType(value);
    this.cdr.detectChanges();
  }

  private detectIdentifierType(value: string): IdentifierType {
    const trimmed = value.trim();

    if (trimmed.includes("@")) {
      return "email";
    }

    if (normalizePhone(trimmed)) {
      return "phone";
    }

    const digits = trimmed.replace(/\D/g, "");

    if (digits.length > 0 && !trimmed.includes("@")) {
      return "phone";
    }

    return "email";
  }

  // =========================================================
  // STEP 1 — SEND OTP
  // =========================================================

  submitIdentifier(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = "";
    this.successMessage = "";

    if (this.identifierForm.invalid) {
      this.identifierForm.markAllAsTouched();
      this.cdr.detectChanges();
      return;
    }

    const rawIdentifier = String(
      this.identifierForm.get("identifier")?.value || "",
    ).trim();

    if (!rawIdentifier) {
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmail = emailPattern.test(rawIdentifier);
    const normalizedPhone = normalizePhone(rawIdentifier);

    if (!isEmail && !normalizedPhone) {
      this.identifierForm
        .get("identifier")
        ?.setErrors({ invalidIdentifier: true });
      this.identifierForm.get("identifier")?.markAsTouched();
      return;
    }

    this.submittedIdentifier = rawIdentifier;

    if (isEmail) {
      this.identifierType = "email";
      this.submittedEmail = rawIdentifier.toLowerCase();
      this.submittedPhone = "";
    } else {
      this.identifierType = "phone";
      this.submittedEmail = "";
      this.submittedPhone = normalizedPhone as string;
    }

    this.loading = true;
    this.cdr.detectChanges();

    this.sendResetRequest();
  }

  private sendResetRequest(): void {
    const channel: "email" | "sms" =
      this.identifierType === "phone" ? "sms" : "email";

    const email = this.identifierType === "email" ? this.submittedEmail : "";

    const phone = this.identifierType === "phone" ? this.submittedPhone : null;

    this.auth.requestPasswordReset(email, phone, channel).subscribe({
      next: (response) => {
        this.loading = false;
        this.otp = ["", "", "", "", "", ""];
        this.resetToken = "";

        this.successMessage =
          response?.message ||
          `A verification code has been sent by ${
            channel === "sms" ? "SMS" : "email"
          }.`;

        this.currentStep = 2;
        this.startResendCountdown();
        this.cdr.detectChanges();

        setTimeout(() => {
          const firstInput = document.getElementById(
            "otp-0",
          ) as HTMLInputElement | null;

          firstInput?.focus();
        });
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMessage = this.extractErrorMessage(
          err,
          "Unable to send verification code. Please try again.",
        );
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================
  // STEP 2 — VERIFY OTP
  // =========================================================

  verifyOtp(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = "";

    const code = this.otp.join("");

    if (!/^\d{6}$/.test(code)) {
      this.errorMessage = "Enter the 6-digit verification code.";
      this.cdr.detectChanges();
      return;
    }

    if (!this.submittedIdentifier) {
      this.errorMessage = "Session expired. Please request a new code.";
      this.currentStep = 1;
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;

    const channel: "email" | "sms" =
      this.identifierType === "phone" ? "sms" : "email";

    const verificationIdentifier =
      this.identifierType === "phone"
        ? this.submittedPhone
        : this.submittedEmail;

    this.auth.verifyOtp(verificationIdentifier, code, channel).subscribe({
      next: (response) => {
        this.loading = false;
        this.resetToken = response?.reset_token || "";

        if (!this.resetToken) {
          this.errorMessage = "Verification failed. Please try again.";
          this.cdr.detectChanges();
          return;
        }

        this.successMessage = "";
        this.currentStep = 3;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMessage = this.extractErrorMessage(
          err,
          "Invalid OTP. Please try again.",
        );
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================
  // RESEND OTP
  // =========================================================

  resendOtp(): void {
    if (this.loading || this.resendDisabled) {
      return;
    }

    if (!this.submittedIdentifier) {
      this.currentStep = 1;
      return;
    }

    this.loading = true;
    this.errorMessage = "";

    this.sendResetRequest();
  }

  private startResendCountdown(): void {
    this.clearCountdown();

    this.resendCountdown = 30;
    this.resendDisabled = true;

    this.countdownTimer = setInterval(() => {
      this.resendCountdown -= 1;

      if (this.resendCountdown <= 0) {
        this.clearCountdown();
        this.resendDisabled = false;
        this.resendCountdown = 0;
      }

      this.cdr.detectChanges();
    }, 1000);
  }

  private clearCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  // =========================================================
  // OTP INPUT
  // =========================================================

  onOtpInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, "").slice(-1);

    this.otp[index] = digit;
    input.value = digit;
    this.errorMessage = "";

    if (digit && index < this.otp.length - 1) {
      const next = document.getElementById(
        `otp-${index + 1}`,
      ) as HTMLInputElement | null;

      next?.focus();
    }
  }

  onOtpKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === "Backspace" && !this.otp[index] && index > 0) {
      const previous = document.getElementById(
        `otp-${index - 1}`,
      ) as HTMLInputElement | null;

      previous?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      const previous = document.getElementById(
        `otp-${index - 1}`,
      ) as HTMLInputElement | null;

      previous?.focus();
    }

    if (event.key === "ArrowRight" && index < this.otp.length - 1) {
      const next = document.getElementById(
        `otp-${index + 1}`,
      ) as HTMLInputElement | null;

      next?.focus();
    }
  }

  onOtpPaste(event: ClipboardEvent): void {
    event.preventDefault();

    const pasted =
      event.clipboardData?.getData("text").replace(/\D/g, "").slice(0, 6) || "";

    if (!pasted) {
      return;
    }

    this.otp = ["", "", "", "", "", ""];

    pasted.split("").forEach((digit: string, index: number) => {
      this.otp[index] = digit;

      const input = document.getElementById(
        `otp-${index}`,
      ) as HTMLInputElement | null;

      if (input) {
        input.value = digit;
      }
    });

    const focusIndex = Math.min(pasted.length, 6) - 1;

    if (focusIndex >= 0) {
      const target = document.getElementById(
        `otp-${focusIndex}`,
      ) as HTMLInputElement | null;

      target?.focus();
    }
  }

  // =========================================================
  // STEP 3 — RESET PASSWORD
  // =========================================================

  resetPassword(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = "";

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.cdr.detectChanges();
      return;
    }

    if (!this.resetToken) {
      this.errorMessage = "Session expired. Please verify OTP again.";
      this.currentStep = 2;
      this.cdr.detectChanges();
      return;
    }

    const newPassword = String(
      this.passwordForm.get("newPassword")?.value || "",
    );

    const confirmPassword = String(
      this.passwordForm.get("confirmPassword")?.value || "",
    );

    this.loading = true;

    this.auth
      .resetPassword(this.resetToken, newPassword, confirmPassword)
      .subscribe({
        next: () => {
          this.loading = false;
          this.errorMessage = "";
          this.successMessage = "";
          this.currentStep = 4;
          this.clearCountdown();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.loading = false;
          this.errorMessage = this.extractErrorMessage(
            err,
            "Unable to reset password. Please try again.",
          );
          this.cdr.detectChanges();
        },
      });
  }

  // =========================================================
  // PASSWORD REQUIREMENTS
  // =========================================================

  private getPassword(): string {
    return String(this.passwordForm.get("newPassword")?.value || "");
  }

  hasMinLength(): boolean {
    return this.getPassword().length >= 8;
  }

  hasUppercase(): boolean {
    return /[A-Z]/.test(this.getPassword());
  }

  hasLowercase(): boolean {
    return /[a-z]/.test(this.getPassword());
  }

  hasNumber(): boolean {
    return /\d/.test(this.getPassword());
  }

  hasSpecialCharacter(): boolean {
    return /[@$!%*?&]/.test(this.getPassword());
  }

  // =========================================================
  // MASK IDENTIFIER
  // =========================================================

  getMaskedIdentifier(): string {
    return this.identifierType === "phone"
      ? this.getMaskedPhone()
      : this.getMaskedEmail();
  }

  getMaskedEmail(): string {
    const email = this.submittedEmail;

    if (!email || !email.includes("@")) {
      return email;
    }

    const [name, domain] = email.split("@");

    if (name.length <= 2) {
      return `${name[0] || ""}***@${domain}`;
    }

    return `${name.slice(0, 2)}***@${domain}`;
  }

  getMaskedPhone(): string {
    const digits = this.submittedPhone.replace(/\D/g, "");

    if (digits.length < 4) {
      return this.submittedPhone;
    }

    return `******${digits.slice(-4)}`;
  }

  // =========================================================
  // NAVIGATION
  // =========================================================

  goBack(): void {
    if (this.currentStep === 1) {
      this.goToLogin();
      return;
    }

    this.clearCountdown();
    this.currentStep = 1;
    this.errorMessage = "";
    this.successMessage = "";
    this.otp = ["", "", "", "", "", ""];
    this.resetToken = "";
    this.cdr.detectChanges();
  }

  goToLogin(): void {
    this.router.navigate(["/auth/login"]);
  }

  // =========================================================
  // ERROR HANDLER
  // =========================================================

  private extractErrorMessage(err: any, fallback: string): string {
    if (typeof err?.error === "string") {
      return err.error.trim() || fallback;
    }

    const message = err?.error?.detail ?? err?.error?.message ?? err?.message;

    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }

    return fallback;
  }
}
