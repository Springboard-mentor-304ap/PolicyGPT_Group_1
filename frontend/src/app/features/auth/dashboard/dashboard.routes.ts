import { Routes } from "@angular/router";

import { authGuard } from "../../../core/guards/auth.guard";
import { roleGuard } from "../../../core/guards/role.guard";

export const DASHBOARD_ROUTES: Routes = [
  // =========================================================
  // ORGANIZATION DASHBOARD
  // =========================================================
  //
  // URL:
  // /dashboard/organization
  //
  // Roles:
  // ORGANIZATION
  // ORGANISATION
  //
  // Layout:
  // OrganizationLayoutComponent
  //
  // =========================================================

  {
    path: "organization",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: ["ORGANIZATION", "ORGANISATION"],
    },

    loadComponent: () =>
      import("../../../shared/layouts/organization-layout/organization-layout.component").then(
        (m) => m.OrganizationLayoutComponent,
      ),

    children: [
      // -------------------------------------------------------
      // ORGANIZATION HOME
      // /dashboard/organization
      // -------------------------------------------------------

      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./organization/organization.component").then(
            (m) => m.OrganizationComponent,
          ),
      },

      // -------------------------------------------------------
      // PROFILE
      // /dashboard/organization/profile
      // -------------------------------------------------------

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // EDIT PROFILE
      // /dashboard/organization/profile/edit
      // -------------------------------------------------------

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // CHANGE PASSWORD
      // /dashboard/organization/change-password
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
  //
  // URL:
  // /dashboard/citizen
  //
  // Role:
  // CITIZEN
  //
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
        pathMatch: "full",

        loadComponent: () =>
          import("./citizen/citizen.component").then((m) => m.CitizenComponent),
      },

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

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
  //
  // URL:
  // /dashboard/government
  //
  // Roles:
  // GOVERNMENT_OFFICIAL
  // GOVERNMENT_OFFICER
  // GOVERNMENT
  //
  // =========================================================

  {
    path: "government",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: ["GOVERNMENT_OFFICIAL", "GOVERNMENT_OFFICER", "GOVERNMENT"],
    },

    loadComponent: () =>
      import("../../../shared/layouts/government-layout/government-layout.component").then(
        (m) => m.GovernmentLayoutComponent,
      ),

    children: [
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./government/government.component").then(
            (m) => m.GovernmentComponent,
          ),
      },

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

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
  //
  // URL:
  // /dashboard/admin
  //
  // Role:
  // ADMINISTRATOR
  //
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
      // ADMIN HOME
      // -------------------------------------------------------

      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./admin/admin.component").then((m) => m.AdminComponent),
      },

      // -------------------------------------------------------
      // PROFILE
      // -------------------------------------------------------

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // EDIT PROFILE
      // -------------------------------------------------------

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // CHANGE PASSWORD
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
  // RESEARCHER DASHBOARD
  // =========================================================
  //
  // URL:
  // /dashboard/researcher
  //
  // Role:
  // RESEARCHER
  //
  // =========================================================

  {
    path: "researcher",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: ["RESEARCHER"],
    },

    loadComponent: () =>
      import("../../../shared/layouts/researcher-layout/researcher-layout.component").then(
        (m) => m.ResearcherLayoutComponent,
      ),

    children: [
      // -------------------------------------------------------
      // RESEARCHER HOME
      // -------------------------------------------------------

      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./researcher/researcher.component").then(
            (m) => m.ResearcherComponent,
          ),
      },

      // -------------------------------------------------------
      // PROFILE
      // -------------------------------------------------------

      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // EDIT PROFILE
      // -------------------------------------------------------

      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // -------------------------------------------------------
      // CHANGE PASSWORD
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
  // GUEST DASHBOARD
  // =========================================================
  //
  // URL:
  // /dashboard/guest
  //
  // IMPORTANT:
  //
  // NO authGuard
  // NO roleGuard
  //
  // =========================================================

  {
    path: "guest",

    loadComponent: () =>
      import("../../../shared/layouts/guest-user-layout/guest-user-layout.component").then(
        (m) => m.GuestUserLayoutComponent,
      ),

    children: [
      // -------------------------------------------------------
      // GUEST HOME
      // -------------------------------------------------------

      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./guest/guest.component").then((m) => m.GuestComponent),
      },
    ],
  },

  // =========================================================
  // DEFAULT DASHBOARD
  // =========================================================
  //
  // /dashboard
  // ↓
  // /dashboard/guest
  //
  // =========================================================

  {
    path: "",

    redirectTo: "guest",

    pathMatch: "full",
  },
];
