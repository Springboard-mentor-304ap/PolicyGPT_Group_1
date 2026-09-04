import { Routes } from "@angular/router";

import { authGuard } from "./core/guards/auth.guard";
import { roleGuard } from "./core/guards/role.guard";

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
  //
  // All role-based dashboards are handled inside
  // dashboard.routes.ts
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
  // ADMIN USERS ROUTE
  //
  // /admin/users
  //
  // Kept separately because this route already exists
  // in your project.
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
  // FALLBACK
  //
  // If an invalid URL is entered, send the user to Login.
  // =========================================================

  {
    path: "**",
    redirectTo: "auth/login",
  },
];
