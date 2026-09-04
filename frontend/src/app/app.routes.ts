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
  //
  // Includes:
  // /auth/login
  // /auth/register
  // /auth/password-reset
  // /auth/change-password
  //
  // These routes are defined inside auth.routes.ts
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
  //
  // Examples:
  //
  // /dashboard/citizen
  // /dashboard/citizen/profile
  // /dashboard/citizen/profile/edit
  //
  // /dashboard/government
  // /dashboard/government/profile
  // /dashboard/government/profile/edit
  //
  // /dashboard/admin
  // /dashboard/admin/profile
  // /dashboard/admin/profile/edit
  //
  // /dashboard/user-dashboard
  // /dashboard/user-dashboard/profile
  // /dashboard/user-dashboard/profile/edit
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
  // URL:
  // /admin/users
  //
  // This route is kept separately because it already exists
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
  // FALLBACK ROUTE
  //
  // If the user enters an invalid URL,
  // redirect them to Login.
  // =========================================================

  {
    path: "**",
    redirectTo: "auth/login",
  },
];
