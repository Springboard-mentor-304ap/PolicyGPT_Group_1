import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { Auth } from "../services/auth";

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(Auth);
  const router = inject(Router);

  // =======================================================
  // CHECK TOKEN (presence + client-side expiry)
  // =======================================================
  // An expired JWT must not pass the guard: without the exp check the
  // user reaches the page and only fails on the first API 401.

  const token = authService.getToken();

  if (token && !isTokenExpired(token)) {
    return true;
  }

  if (token) {
    authService.logout();
  }

  // =======================================================
  // USER IS NOT LOGGED IN
  // =======================================================

  return router.createUrlTree(["/auth/login"], {
    queryParams: {
      returnUrl: state.url,
    },
  });
};

/** Best-effort client-side exp check; the backend remains authoritative. */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp)) {
      return false;
    }
    return Date.now() / 1000 >= exp;
  } catch {
    return true;
  }
}
