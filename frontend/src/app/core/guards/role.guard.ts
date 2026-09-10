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
  // NORMALIZE USER ROLE
  // =======================================================

  let normalizedUserRole = userRole;

  // ADMIN aliases
  if (userRole === "ADMINISTRATOR" || userRole === "ADMINISTRATOR_ROLE") {
    normalizedUserRole = "ADMIN";
  }

  // GOVERNMENT aliases
  else if (
    userRole === "GOVERNMENT" ||
    userRole === "GOVT" ||
    userRole === "GOVERNMENT_OFFICER"
  ) {
    normalizedUserRole = "GOVERNMENT_OFFICIAL";
  }

  // ORGANIZATION aliases
  else if (userRole === "ORGANISATION") {
    normalizedUserRole = "ORGANIZATION";
  }

  // =======================================================
  // NORMALIZE ALLOWED ROLES
  // =======================================================

  const normalizedRoles = allowedRoles.map((role) => {
    const normalizedRole = role.toUpperCase().trim();

    if (
      normalizedRole === "ADMINISTRATOR" ||
      normalizedRole === "ADMINISTRATOR_ROLE"
    ) {
      return "ADMIN";
    }

    if (
      normalizedRole === "GOVERNMENT" ||
      normalizedRole === "GOVT" ||
      normalizedRole === "GOVERNMENT_OFFICER"
    ) {
      return "GOVERNMENT_OFFICIAL";
    }

    if (normalizedRole === "ORGANISATION") {
      return "ORGANIZATION";
    }

    return normalizedRole;
  });

  // =======================================================
  // ADMIN = SUPERUSER
  // =======================================================
  // ADMIN can access every protected dashboard.
  // =======================================================

  if (normalizedUserRole === "ADMIN") {
    console.log("ADMIN ACCESS GRANTED");

    return true;
  }

  // =======================================================
  // CHECK ROLE
  // =======================================================

  if (normalizedRoles.includes(normalizedUserRole)) {
    return true;
  }

  // =======================================================
  // WRONG DASHBOARD
  //
  // USER MANUALLY CHANGED URL
  // =======================================================

  console.warn(
    `Unauthorized dashboard access.

     User role: ${normalizedUserRole}

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
