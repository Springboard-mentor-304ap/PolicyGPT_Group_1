import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { Auth } from "../services/auth";

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(Auth);
  const router = inject(Router);

  // =======================================================
  // GET CURRENT USER
  // =======================================================

  const user = authService.getStoredUser();

  // =======================================================
  // NO USER
  // =======================================================

  if (!user) {
    authService.logout();

    return router.createUrlTree(["/auth/login"]);
  }

  // =======================================================
  // GET USER ROLE
  // =======================================================

  const userRole = (user.role || "").toUpperCase().trim();

  // =======================================================
  // GET ALLOWED ROLES FROM ROUTE
  // =======================================================

  const allowedRoles = route.data?.["roles"] as string[] | undefined;

  // =======================================================
  // NO ROLES CONFIGURED
  // =======================================================

  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  // =======================================================
  // NORMALIZE ALLOWED ROLES
  // =======================================================

  const normalizedRoles = allowedRoles.map((role) => role.toUpperCase().trim());

  // =======================================================
  // CHECK ROLE
  // =======================================================

  if (normalizedRoles.includes(userRole)) {
    return true;
  }

  // =======================================================
  // WRONG DASHBOARD
  //
  // USER MANUALLY CHANGED URL
  // =======================================================

  console.warn(
    `Unauthorized dashboard access.
     User role: ${userRole}
     Allowed roles: ${normalizedRoles.join(", ")}`,
  );

  // =======================================================
  // LOGOUT USER
  // =======================================================

  authService.logout();

  // =======================================================
  // SEND USER TO LOGIN
  // =======================================================

  return router.createUrlTree(["/auth/login"]);
};
