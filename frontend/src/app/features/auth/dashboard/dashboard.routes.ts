import { Routes } from "@angular/router";

import { authGuard } from "../../../core/guards/auth.guard";
import { roleGuard } from "../../../core/guards/role.guard";

export const DASHBOARD_ROUTES: Routes = [
  // =========================================================
  // USER DASHBOARD
  // =========================================================

  {
    path: "user-dashboard",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: [
        "RESEARCHER",
        "ORGANIZATION",
        "ORGANISATION",
        "GUEST",
        "GUEST_USER",
      ],
    },

    loadComponent: () =>
      import("../../../shared/layouts/user-layout/user-layout.component").then(
        (m) => m.UserLayoutComponent,
      ),

    children: [
      {
        path: "",

        loadComponent: () =>
          import("./user-dashboard/user-dashboard.component").then(
            (m) => m.UserDashboardComponent,
          ),
      },
    ],
  },

  // =========================================================
  // CITIZEN DASHBOARD
  // =========================================================

  {
    path: "citizen",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: ["CITIZEN"],
    },

    loadComponent: () =>
      import("../../../shared/layouts/citizen-layout/citizen-layout.component").then(
        (m) => m.CitizenLayoutComponent,
      ),

    children: [
      {
        path: "",

        loadComponent: () =>
          import("./citizen/citizen.component").then((m) => m.CitizenComponent),
      },
    ],
  },

  // =========================================================
  // GOVERNMENT DASHBOARD
  // =========================================================

  {
    path: "government",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: ["GOVERNMENT_OFFICIAL"],
    },

    loadComponent: () =>
      import("../../../shared/layouts/government-layout/government-layout.component").then(
        (m) => m.GovernmentLayoutComponent,
      ),

    children: [
      {
        path: "",

        loadComponent: () =>
          import("./government/government.component").then(
            (m) => m.GovernmentComponent,
          ),
      },
    ],
  },

  {
    path: "admin",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: ["ADMINISTRATOR"],
    },

    loadComponent: () =>
      import("../../../shared/layouts/admin-layout/admin-layout.component").then(
        (m) => m.AdminLayoutComponent,
      ),

    children: [
      // =====================================================
      // ADMIN DASHBOARD
      // /dashboard/admin
      // =====================================================

      {
        path: "",

        loadComponent: () =>
          import("./admin/admin.component").then((m) => m.AdminComponent),
      },

      // =====================================================
      // VIEW USERS
      // /dashboard/admin/users
      // =====================================================

      {
        path: "users",

        loadComponent: () =>
          import("./admin/users/view-users.component").then(
            (m) => m.ViewUsersComponent,
          ),
      },

      // =====================================================
      // ADD USER
      // /dashboard/admin/users/add
      // =====================================================

      {
        path: "users/add",

        loadComponent: () =>
          import("./admin/users/add-user.component").then(
            (m) => m.AddUserComponent,
          ),
      },
    ],
  },

  // =========================================================
  // DEFAULT
  // =========================================================

  {
    path: "",

    redirectTo: "user-dashboard",

    pathMatch: "full",
  },
];
