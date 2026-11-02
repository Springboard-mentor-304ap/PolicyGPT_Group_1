import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { Auth } from "../auth";

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(Auth);

  const token = authService.getToken();

  // =========================================================
  // PUBLIC AUTH REQUESTS
  // =========================================================

  const isLoginRequest = req.url.includes("/auth/login");

  const isGuestLoginRequest = req.url.includes("/auth/guest");

  const isRegisterRequest = req.url.includes("/auth/register");

  const isForgotPasswordRequest = req.url.includes("/auth/forgot-password");

  const isVerifyOtpRequest = req.url.includes("/auth/verify-otp");

  const isResetPasswordRequest = req.url.includes("/auth/reset-password");

  // =========================================================
  // DO NOT ADD TOKEN TO PUBLIC REQUESTS
  // =========================================================

  if (
    !token ||
    isLoginRequest ||
    isGuestLoginRequest ||
    isRegisterRequest ||
    isForgotPasswordRequest ||
    isVerifyOtpRequest ||
    isResetPasswordRequest
  ) {
    return next(req);
  }

  // =========================================================
  // ADD JWT TOKEN
  // =========================================================

  const authenticatedRequest = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });

  return next(authenticatedRequest);
};
