import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { Auth } from "./auth";
import { environment } from "../../../environments/environment";

describe("Auth password-reset API integration", () => {
  let service: Auth;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/auth`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [Auth, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(Auth);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("sends email-channel forgot-password with phone null (schema-valid)", () => {
    service
      .requestPasswordReset("User@Example.com", null, "email")
      .subscribe();
    const req = httpMock.expectOne(`${baseUrl}/forgot-password`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({
      email: "user@example.com",
      phone: null,
      channel: "email",
    });
    req.flush({ message: "ok" });
  });

  it("sends sms-channel forgot-password with email null (no 422)", () => {
    service
      .requestPasswordReset("", "+911234567890", "sms")
      .subscribe();
    const req = httpMock.expectOne(`${baseUrl}/forgot-password`);
    expect(req.request.body).toEqual({
      email: null,
      phone: "+911234567890",
      channel: "sms",
    });
    req.flush({ message: "ok" });
  });

  it("sends sms-channel verify-otp with phone field (not phone-in-email)", () => {
    service.verifyOtp(null, "123456", "sms", "+911234567890").subscribe();
    const req = httpMock.expectOne(`${baseUrl}/verify-otp`);
    expect(req.request.body).toEqual({
      email: null,
      phone: "+911234567890",
      otp: "123456",
      channel: "sms",
    });
    req.flush({ message: "ok", verified: true, reset_token: "t" });
  });

  it("sends email-channel verify-otp with phone null", () => {
    service.verifyOtp("user@example.com", "123456", "email").subscribe();
    const req = httpMock.expectOne(`${baseUrl}/verify-otp`);
    expect(req.request.body.email).toBe("user@example.com");
    expect(req.request.body.phone).toBeNull();
    req.flush({ message: "ok", verified: true, reset_token: "t" });
  });

  it("uses environment-based URLs for reset link and token status", () => {
    service.requestPasswordResetLink("user@example.com").subscribe();
    const post = httpMock.expectOne(`${baseUrl}/forgot-password-link`);
    expect(post.request.method).toBe("POST");
    post.flush({ message: "ok" });

    service.validateResetToken("tok").subscribe();
    const get = httpMock.expectOne(
      `${baseUrl}/reset-token-status?token=tok`,
    );
    expect(get.request.method).toBe("GET");
    get.flush({ valid: true, message: "ok" });
  });
});
