import { inject } from "@angular/core";
import { CanActivateFn } from "@angular/router";
import { catchError, map, of } from "rxjs";
import { Auth } from "../services/auth";

export const guestGuard: CanActivateFn = (route, state) => {
  const authService = inject(Auth);

  // =======================================================
  // ALREADY AUTHENTICATED AS GUEST
  // =======================================================

  if (authService.getToken() && authService.getUserRole() === "GUEST") {
    return true;
  }

  // =======================================================
  // AUTHENTICATE GUEST USER WITH BACKEND
  // =======================================================

  return authService.loginAsGuest().pipe(
    map(() => true),
    catchError((error) => {
      console.warn("Guest authentication fallback:", error);
      return of(true);
    })
  );
};
