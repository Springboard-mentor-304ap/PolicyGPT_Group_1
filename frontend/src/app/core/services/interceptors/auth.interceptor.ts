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

  const isRegisterRequest = req.url.includes("/auth/register");

  const isForgotPasswordRequest = req.url.includes("/auth/forgot-password");

  // =========================================================
  // DO NOT ADD TOKEN TO PUBLIC REQUESTS
  // =========================================================

  if (
    !token ||
    isLoginRequest ||
    isRegisterRequest ||
    isForgotPasswordRequest
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
