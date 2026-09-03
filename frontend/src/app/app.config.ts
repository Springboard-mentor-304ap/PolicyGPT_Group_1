import { ApplicationConfig } from "@angular/core";

import { provideRouter } from "@angular/router";

import { provideHttpClient, withInterceptors } from "@angular/common/http";

import { routes } from "./app.routes";

import { authInterceptor } from "./core/services/interceptors/auth.interceptor";

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
  ],
};
