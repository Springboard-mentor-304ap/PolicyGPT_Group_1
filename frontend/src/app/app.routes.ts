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
  // USER / PROFILE LAYOUT
  // =========================================================
  //
  // All layouts use:
  // /user/profile
  //
  // This route loads CitizenLayoutComponent.
  // The ProfileComponent is displayed inside its router-outlet.
  //

  {
    path: "user",
    canActivate: [authGuard],

    loadComponent: () =>
      import("./shared/layouts/citizen-layout/citizen-layout.component").then(
        (m) => m.CitizenLayoutComponent,
      ),

    children: [
      // =====================================================
      // PROFILE
      // =====================================================

      {
        path: "profile",

        loadComponent: () =>
          import("./features/profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // =====================================================
      // EDIT PROFILE
      // =====================================================

      {
        path: "profile/edit",

        loadComponent: () =>
          import("./features/profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // =====================================================
      // DEFAULT USER ROUTE
      // =====================================================

      {
        path: "",
        redirectTo: "profile",
        pathMatch: "full",
      },
    ],
  },

  // =========================================================
  // ADMIN USERS ROUTE
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
  // =========================================================

  {
    path: "**",
    redirectTo: "auth/login",
  },
];
