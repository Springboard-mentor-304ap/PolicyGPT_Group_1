import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { PasswordResetComponent } from "./password-reset.component";
import { Auth } from "../../../core/services/auth";

function makeAuthMock() {
  return {
    requestPasswordReset: vi.fn(),
    verifyOtp: vi.fn(),
    resetPassword: vi.fn(),
    validateResetToken: vi.fn().mockReturnValue(
      of({ valid: true, message: "ok" }),
    ),
  };
}

function setup(tokenParam: string | null = null) {
  const authMock = makeAuthMock();
  TestBed.configureTestingModule({
    imports: [PasswordResetComponent],
    providers: [
      { provide: Auth, useValue: authMock },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: { get: (_k: string) => tokenParam },
          },
        },
      },
    ],
  });
  const fixture: ComponentFixture<PasswordResetComponent> =
    TestBed.createComponent(PasswordResetComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, authMock };
}

describe("PasswordResetComponent", () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("creates with OTP flow by default (no token link)", () => {
    const { component } = setup(null);
    expect(component).toBeTruthy();
    expect(component.currentStep).toBe(1);
    expect(component.linkMode).toBe(false);
  });

  it("rejects invalid identifiers via form validation", () => {
    const { component } = setup(null);
    const ctrl = component.identifierForm.get("identifier");
    ctrl?.setValue("not-an-email-or-phone@@@");
    ctrl?.markAsTouched();
    expect(component.identifierForm.invalid).toBe(true);
  });

  it("accepts valid email identifiers", () => {
    const { component } = setup(null);
    const ctrl = component.identifierForm.get("identifier");
    ctrl?.setValue("user@example.com");
    expect(ctrl?.valid).toBe(true);
  });

  it("sends OTP request and advances to step 2 with loading states", () => {
    const { component, authMock } = setup(null);
    authMock.requestPasswordReset.mockReturnValue(
      of({ message: "If an account exists with this email, a code was sent." }),
    );
    component.identifierForm.get("identifier")?.setValue("user@example.com");
    component.submitIdentifier();
    expect(authMock.requestPasswordReset).toHaveBeenCalled();
    const args = authMock.requestPasswordReset.mock.calls[0];
    expect(args[0]).toBe("user@example.com");
    expect(args[2]).toBe("email");
    expect(component.currentStep).toBe(2);
    expect(component.loading).toBe(false);
  });

  it("shows server error when OTP request fails", () => {
    const { component, authMock } = setup(null);
    authMock.requestPasswordReset.mockReturnValue(
      throwError(() => ({ error: { detail: "Email delivery failed" } })),
    );
    component.identifierForm.get("identifier")?.setValue("user@example.com");
    component.submitIdentifier();
    expect(component.errorMessage).toContain("Email delivery failed");
    expect(component.currentStep).toBe(1);
  });

  it("handles reset link (?token=) by validating and jumping to step 3", () => {
    const { component, authMock } = setup("tok123");
    expect(authMock.validateResetToken).toHaveBeenCalledWith("tok123");
    // Validation is async via of(); default mock returns undefined so
    // component stays in validating state. Provide success path:
    TestBed.resetTestingModule();
    const auth2 = makeAuthMock();
    auth2.validateResetToken.mockReturnValue(of({ valid: true, message: "ok" }));
    TestBed.configureTestingModule({
      imports: [PasswordResetComponent],
      providers: [
        { provide: Auth, useValue: auth2 },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: () => "tok123" } },
          },
        },
      ],
    });
    const fx = TestBed.createComponent(PasswordResetComponent);
    fx.detectChanges();
    expect(fx.componentInstance.linkMode).toBe(true);
    expect(fx.componentInstance.currentStep).toBe(3);
    expect(fx.componentInstance.linkValidating).toBe(false);
  });

  it("shows expired/invalid link errors without breaking", () => {
    const authMock = makeAuthMock();
    authMock.validateResetToken.mockReturnValue(
      throwError(() => ({ error: { detail: "This reset link has expired" } })),
    );
    TestBed.configureTestingModule({
      imports: [PasswordResetComponent],
      providers: [
        { provide: Auth, useValue: authMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => "bad" } } },
        },
      ],
    });
    const fx = TestBed.createComponent(PasswordResetComponent);
    fx.detectChanges();
    expect(fx.componentInstance.errorMessage).toContain("expired");
  });

  it("requires matching strong passwords and shows success on reset", () => {
    const { component, authMock } = setup("tok123");
    authMock.validateResetToken.mockReturnValue(of({ valid: true }));
    // Simulate validated link state
    component.linkValidating = false;
    component.passwordForm.get("newPassword")?.setValue("Str0ng@Pass1");
    component.passwordForm.get("confirmPassword")?.setValue("Str0ng@Pass1");
    expect(component.passwordForm.valid).toBe(true);
    authMock.resetPassword.mockReturnValue(of({ message: "ok" }));
    // Bypass private resetToken via link token
    (component as unknown as { resetToken: string }).resetToken = "tok123";
    component.resetPassword();
    expect(authMock.resetPassword).toHaveBeenCalled();
    expect(component.currentStep).toBe(4);
  });

  it("surfaces already-used token errors from the backend", () => {
    const { component, authMock } = setup("tok123");
    component.linkValidating = false;
    component.passwordForm.get("newPassword")?.setValue("Str0ng@Pass1");
    component.passwordForm.get("confirmPassword")?.setValue("Str0ng@Pass1");
    (component as unknown as { resetToken: string }).resetToken = "tok123";
    authMock.resetPassword.mockReturnValue(
      throwError(() => ({
        error: { detail: "Invalid or already used reset token" },
      })),
    );
    component.resetPassword();
    expect(component.errorMessage).toContain("already used");
  });
});
