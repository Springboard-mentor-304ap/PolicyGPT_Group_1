import { Routes } from "@angular/router";

import { authGuard } from "../../../core/guards/auth.guard";
import { roleGuard } from "../../../core/guards/role.guard";

export const DASHBOARD_ROUTES: Routes = [
  // =========================================================
  // USER DASHBOARD
  // Researcher / Organization / Guest User
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
  // CitizenLayout is the PARENT
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
      // Citizen Dashboard
      {
        path: "",

        loadComponent: () =>
          import("./citizen/citizen.component").then((m) => m.CitizenComponent),
      },
    ],
  },

  // =========================================================
  // GOVERNMENT DASHBOARD
  // GovernmentLayout is the PARENT
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
      // Government Dashboard
      {
        path: "",

        loadComponent: () =>
          import("./government/government.component").then(
            (m) => m.GovernmentComponent,
          ),
      },
    ],
  },

  // =========================================================
  // ADMIN DASHBOARD
  // AdminLayout is the PARENT
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
      // Admin Dashboard
      {
        path: "",

        loadComponent: () =>
          import("./admin/admin.component").then((m) => m.AdminComponent),
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
