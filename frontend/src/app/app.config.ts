import { APP_INITIALIZER, ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { catchError, firstValueFrom, of } from "rxjs";

import { routes } from "./app.routes";
import { authInterceptor } from "./core/services/interceptors/auth.interceptor";
import { Auth } from "./core/services/auth";
import { AvatarService } from "./core/services/avatar.service";

/**
 * Restore the authenticated user before the app renders.
 *
 * On browser refresh the JWT survives in localStorage but the in-memory
 * /me cache does not. Without this initializer the first layout would
 * paint from the stored snapshot (which may predate the photo feature
 * and carry no `profile_photo_updated_at`) and show the default avatar
 * until some page happened to call /me — historically the Profile page,
 * which is exactly the reported bug. Fetching /me here guarantees the
 * shared current-user state (including the photo version) is fresh
 * before any topbar mounts, and warming the avatar blob cache lets the
 * topbar render the saved photo immediately after login AND refresh.
 */
function restoreAuthFactory(auth: Auth, avatars: AvatarService) {
  return () => {
    if (!auth.getToken()) {
      return Promise.resolve();
    }
    return firstValueFrom(
      auth.getCurrentUser().pipe(catchError(() => of(null))),
    )
      .then((user) => {
        if (user) {
          avatars.prefetchForUser(user);
        }
      })
      .catch(() => undefined);
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    // =======================================================
    // ROUTER
    // =======================================================
    provideRouter(routes),

    // =======================================================
    // HTTP CLIENT + AUTH INTERCEPTOR
    // =======================================================
    provideHttpClient(withInterceptors([authInterceptor])),

    // =======================================================
    // AUTH RESTORE (current user + photo version before render)
    // =======================================================
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [Auth, AvatarService],
      useFactory: restoreAuthFactory,
    },
  ],
};
