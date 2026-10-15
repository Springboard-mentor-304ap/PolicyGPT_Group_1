import { inject } from "@angular/core";
import { CanActivateFn } from "@angular/router";
import { catchError, map, of, retry } from "rxjs";
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

  // Navigation waits for guest authentication, so protected APIs called
  // by the guest pages always carry a token. One retry covers transient
  // failures (e.g. Render cold starts); if login still fails the page
  // loads without a token and its API calls surface their own errors.

  return authService.loginAsGuest().pipe(
    retry(1),
    map(() => true),
    catchError((error) => {
      console.warn("Guest authentication fallback:", error);
      return of(true);
    })
  );
};
