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
  // /auth/login
  // /auth/register
  // /auth/password-reset
  // /auth/change-password
  //
  // Defined inside auth.routes.ts
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
  // No authGuard here.
  //
  // Guest dashboard is public.
  //
  // Individual dashboards handle:
  //
  // authGuard + roleGuard
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
  // ADMIN USERS
  // =========================================================
  //
  // /admin/users
  //
  // Protected separately.
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
  
  // POLICY ROUTES
  // =========================================================
  {
    path: "policies/search",
    loadComponent: () =>
      import("./features/policy/policy-search/policy-search.component").then(
        (m) => m.PolicySearchComponent,
      ),
  },
  {
    path: "policies",
    loadComponent: () =>
      import("./features/policy/policy-search/policy-search.component").then(
        (m) => m.PolicySearchComponent,
      ),
  },
  {
    path: "policies/:id",
    loadComponent: () =>
      import("./features/policy/policy-details/policy-details.component").then(
        (m) => m.PolicyDetailsComponent,
      ),
  },

  // =========================================================
  // SCHEMES ROUTES
  // =========================================================
  {
    path: "schemes/search",
    loadComponent: () =>
      import("./features/schemes/scheme-search/scheme-search.component").then(
        (m) => m.SchemeSearchComponent,
      ),
  },
  {
    path: "schemes",
    loadComponent: () =>
      import("./features/schemes/scheme-search/scheme-search.component").then(
        (m) => m.SchemeSearchComponent,
      ),
  },
  {
    path: "schemes/:id",
    loadComponent: () =>
      import("./features/schemes/scheme-details/scheme-details.component").then(
        (m) => m.SchemeDetailsComponent,
      ),
  },

  // 
  
  
       // =========================================================
  // COMPARE ROUTES
  // =========================================================
  //
  // /compare
  // /compare/results
  //
  // =========================================================

  {
    path: "compare",
    loadComponent: () =>
      import("./features/compare/compare-selection/compare-selection.component").then(
        (m) => m.CompareSelectionComponent,
      ),
  },

  {
    path: "compare/results",
    loadComponent: () =>
      import("./features/compare/compare-results/compare-results.component").then(
        (m) => m.CompareResultsComponent,
      ),
  },

  // =========================================================
  // ELIGIBILITY ROUTE
  // =========================================================
  {
    path: "eligibility",
    loadComponent: () =>
      import("./features/eligibility/eligibility-checker/eligibility-checker").then(
        (m) => m.EligibilityChecker,
      ),
  },

  // =========================================================
  // FALLBACK
  // =========================================================
  //
  // Any invalid URL:
  //
  // /something
  // ↓
  // /auth/login
  //
  // =========================================================

  {
    path: "**",
    redirectTo: "auth/login",
  },
];
