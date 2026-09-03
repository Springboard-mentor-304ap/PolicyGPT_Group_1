import { Routes } from "@angular/router";

export const DASHBOARD_ROUTES: Routes = [
  // =========================================================
  // USER DASHBOARD
  // =========================================================

  {
    path: "user-dashboard",

    loadComponent: () =>
      import("./user-dashboard/user-dashboard.component").then(
        (m) => m.UserDashboardComponent,
      ),
  },

  // =========================================================
  // CITIZEN DASHBOARD
  // =========================================================

  {
    path: "citizen",

    loadComponent: () =>
      import("./citizen/citizen.component").then((m) => m.CitizenComponent),
  },

  // =========================================================
  // GOVERNMENT DASHBOARD
  // =========================================================

  {
    path: "government",

    loadComponent: () =>
      import("./government/government.component").then(
        (m) => m.GovernmentComponent,
      ),
  },

  // =========================================================
  // ADMIN DASHBOARD
  // =========================================================

  {
    path: "admin",

    loadComponent: () =>
      import("./admin/admin.component").then((m) => m.AdminComponent),
  },

  // =========================================================
  // DEFAULT DASHBOARD
  // =========================================================

  {
    path: "",
    redirectTo: "citizen",
    pathMatch: "full",
  },
];
