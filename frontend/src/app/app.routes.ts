import { Routes } from "@angular/router";

import { authGuard } from "./core/guards/auth.guard";

export const routes: Routes = [
  // =========================================================
  // DEFAULT ROUTE
  // =========================================================

  {
    path: "",
    redirectTo: "auth/login",
    pathMatch: "full",
  },

  // =========================================================
  // AUTH ROUTES
  // =========================================================

  {
    path: "auth",

    loadChildren: () =>
      import("./features/auth/auth.routes").then((m) => m.AUTH_ROUTES),
  },

  // =========================================================
  // PROTECTED DASHBOARD ROUTES
  // =========================================================

  {
    path: "dashboard",

    canActivate: [authGuard],

    loadChildren: () =>
      import("./features/auth/dashboard/dashboard.routes").then(
        (m) => m.DASHBOARD_ROUTES,
      ),
  },

  // =========================================================
  // FALLBACK
  // =========================================================

  {
    path: "**",
    redirectTo: "auth/login",
  },
];
