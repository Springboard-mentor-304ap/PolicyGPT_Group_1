import { Routes } from "@angular/router";

import { authGuard } from "./core/guards/auth.guard";
import { roleGuard } from "./core/guards/role.guard";

export const routes: Routes = [
  // =========================================================
  // DEFAULT ROUTE
  // =========================================================
  //
  // /
  // ↓
  // /auth/login
  //
  // =========================================================

  {
    path: "",
    redirectTo: "auth/login",
    pathMatch: "full",
  },

  // =========================================================
  // AUTH ROUTES
  // =========================================================
  //
  // Includes:
  //
  // /auth/login
  // /auth/register
  // /auth/password-reset
  // /auth/change-password
  //
  // These routes are defined inside auth.routes.ts
  //
  // =========================================================

  {
    path: "auth",

    loadChildren: () =>
      import("./features/auth/auth.routes").then((m) => m.AUTH_ROUTES),
  },

  // =========================================================
  // DASHBOARD ROUTES
  // =========================================================
  //
  // IMPORTANT:
  //
  // DO NOT put authGuard here.
  //
  // /dashboard/guest is PUBLIC.
  //
  // Each authenticated dashboard handles:
  //
  // authGuard + roleGuard
  //
  // internally.
  //
  // Available dashboards:
  //
  // /dashboard/guest
  // /dashboard/citizen
  // /dashboard/researcher
  // /dashboard/government
  // /dashboard/admin
  //
  // =========================================================

  {
    path: "dashboard",

    loadChildren: () =>
      import("./features/auth/dashboard/dashboard.routes").then(
        (m) => m.DASHBOARD_ROUTES,
      ),
  },

  // =========================================================
  // ADMIN USERS ROUTE
  // =========================================================
  //
  // URL:
  //
  // /admin/users
  //
  // This route remains separately protected.
  //
  // =========================================================

  {
    path: "admin/users",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: ["ADMINISTRATOR"],
    },

    loadComponent: () =>
      import("./features/auth/dashboard/admin/users/view-users.component").then(
        (m) => m.ViewUsersComponent,
      ),
  },

  // =========================================================
  // FALLBACK ROUTE
  // =========================================================
  //
  // Invalid URLs redirect to Login.
  //
  // =========================================================

  {
    path: "**",
    redirectTo: "auth/login",
  },
];
