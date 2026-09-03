import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { Auth } from "../services/auth";

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(Auth);

  const router = inject(Router);

  // =======================================================
  // CHECK TOKEN
  // =======================================================

  const token = authService.getToken();

  // =======================================================
  // USER IS LOGGED IN
  // =======================================================

  if (token) {
    return true;
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
