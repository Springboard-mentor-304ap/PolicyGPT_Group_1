import { Routes } from "@angular/router";

import { authGuard } from "../../../core/guards/auth.guard";
import { roleGuard } from "../../../core/guards/role.guard";

export const DASHBOARD_ROUTES: Routes = [
  // =========================================================
  // USER / RESEARCHER / ORGANIZATION DASHBOARD
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
      // -------------------------------------------------------
      // DASHBOARD
      // /dashboard/user-dashboard
      // -------------------------------------------------------

      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./user-dashboard/user-dashboard.component").then(
            (m) => m.UserDashboardComponent,
          ),
      },

      // -------------------------------------------------------
      // EDIT PROFILE
      // /dashboard/user-dashboard/profile/edit
      // -------------------------------------------------------

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // PROFILE
      // /dashboard/user-dashboard/profile
      // -------------------------------------------------------

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // CHANGE PASSWORD
      // /dashboard/user-dashboard/change-password
      // -------------------------------------------------------

      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
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
      // -------------------------------------------------------
      // DASHBOARD
      // /dashboard/citizen
      // -------------------------------------------------------

      {
        path: "",
        pathMatch: "full",

        // IMPORTANT:
        // This must load CitizenComponent,
        // NOT CitizenLayoutComponent.

        loadComponent: () =>
          import("./citizen/citizen.component").then((m) => m.CitizenComponent),
      },

      // -------------------------------------------------------
      // EDIT PROFILE
      // /dashboard/citizen/profile/edit
      // -------------------------------------------------------

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // PROFILE
      // /dashboard/citizen/profile
      // -------------------------------------------------------

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // CHANGE PASSWORD
      // /dashboard/citizen/change-password
      // -------------------------------------------------------

      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
          ),
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
      // -------------------------------------------------------
      // DASHBOARD
      // /dashboard/government
      // -------------------------------------------------------

      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./government/government.component").then(
            (m) => m.GovernmentComponent,
          ),
      },

      // -------------------------------------------------------
      // EDIT PROFILE
      // /dashboard/government/profile/edit
      // -------------------------------------------------------

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // PROFILE
      // /dashboard/government/profile
      // -------------------------------------------------------

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // CHANGE PASSWORD
      // /dashboard/government/change-password
      // -------------------------------------------------------

      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
          ),
      },
    ],
  },

  // =========================================================
  // ADMIN DASHBOARD
  // =========================================================

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
      // -------------------------------------------------------
      // ADMIN DASHBOARD
      // /dashboard/admin
      // -------------------------------------------------------

      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./admin/admin.component").then((m) => m.AdminComponent),
      },

      // -------------------------------------------------------
      // ADMIN EDIT PROFILE
      // /dashboard/admin/profile/edit
      // -------------------------------------------------------

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // ADMIN PROFILE
      // /dashboard/admin/profile
      // -------------------------------------------------------

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // ADMIN CHANGE PASSWORD
      // /dashboard/admin/change-password
      // -------------------------------------------------------

      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
          ),
      },

      // -------------------------------------------------------
      // VIEW USERS
      // /dashboard/admin/users
      // -------------------------------------------------------

      {
        path: "users",

        loadComponent: () =>
          import("./admin/users/view-users.component").then(
            (m) => m.ViewUsersComponent,
          ),
      },

      // -------------------------------------------------------
      // ADD USER
      // /dashboard/admin/users/add
      // -------------------------------------------------------

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
  // DEFAULT DASHBOARD ROUTE
  // =========================================================

  {
    path: "",

    redirectTo: "user-dashboard",

    pathMatch: "full",
  },
];
