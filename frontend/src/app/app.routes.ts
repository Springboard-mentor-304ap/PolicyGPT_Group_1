import { Routes } from "@angular/router";

import { authGuard } from "./core/guards/auth.guard";
import { roleGuard } from "./core/guards/role.guard";
import { notificationRedirectGuard } from "./core/guards/notification-redirect.guard";
import { supportRedirectGuard } from "./core/guards/support.guard";

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

  // =========================================================
  // SAVED ITEMS ROUTES
  // =========================================================

  {
    path: "saved-items",
    canActivate: [authGuard, roleGuard],
    data: {
      roles: ["CITIZEN", "RESEARCHER", "ORGANIZATION"],
    },
    loadComponent: () =>
      import("./features/saved-items/saved-items.component").then(
        (m) => m.SavedItemsComponent,
      ),
  },

  // =========================================================
  // SEARCH HISTORY ROUTE (top-level, role-guarded)
  // =========================================================

  {
    path: "search-history",
    canActivate: [authGuard, roleGuard],
    data: {
      roles: ["CITIZEN", "RESEARCHER", "ORGANIZATION"],
    },
    loadComponent: () =>
      import("./features/search-history/search-history.component").then(
        (m) => m.SearchHistoryComponent,
      ),
  },

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
  // NOTIFICATIONS ROUTES (Redirects to role-based dashboard layout)
  // =========================================================
  {
    path: "notifications/preferences",
    canActivate: [notificationRedirectGuard],
    loadComponent: () =>
      import("./features/notifications/notification-preferences/notification-preferences.component").then(
        (m) => m.NotificationPreferencesComponent,
      ),
  },
  {
    path: "notifications/:id",
    canActivate: [notificationRedirectGuard],
    loadComponent: () =>
      import("./features/notifications/notification-list/notification-list.component").then(
        (m) => m.NotificationListComponent,
      ),
  },
  {
    path: "notifications",
    canActivate: [notificationRedirectGuard],
    loadComponent: () =>
      import("./features/notifications/notification-list/notification-list.component").then(
        (m) => m.NotificationListComponent,
      ),
  },
  {
    path: "admin/notifications",
    redirectTo: "dashboard/admin/notifications",
    pathMatch: "full",
  },
  {
    path: "admin/notifications/preferences",
    redirectTo: "dashboard/admin/notifications/preferences",
    pathMatch: "full",
  },
  {
    path: "citizen/notifications",
    redirectTo: "dashboard/citizen/notifications",
    pathMatch: "full",
  },
  {
    path: "citizen/notifications/preferences",
    redirectTo: "dashboard/citizen/notifications/preferences",
    pathMatch: "full",
  },
  {
    path: "government/notifications",
    redirectTo: "dashboard/government/notifications",
    pathMatch: "full",
  },
  {
    path: "government/notifications/preferences",
    redirectTo: "dashboard/government/notifications/preferences",
    pathMatch: "full",
  },
  {
    path: "researcher/notifications",
    redirectTo: "dashboard/researcher/notifications",
    pathMatch: "full",
  },
  {
    path: "researcher/notifications/preferences",
    redirectTo: "dashboard/researcher/notifications/preferences",
    pathMatch: "full",
  },
  {
    path: "organization/notifications",
    redirectTo: "dashboard/organization/notifications",
    pathMatch: "full",
  },
  {
    path: "organization/notifications/preferences",
    redirectTo: "dashboard/organization/notifications/preferences",
    pathMatch: "full",
  },

  // =========================================================
  // SUPPORT & FAQS TOP-LEVEL ROUTES
  // =========================================================
  {
    path: "support",
    canActivate: [supportRedirectGuard],
    loadComponent: () =>
      import("./features/support/support.component").then(
        (m) => m.SupportComponent,
      ),
  },
  {
    path: "faqs",
    canActivate: [supportRedirectGuard],
    loadComponent: () =>
      import("./features/support/support.component").then(
        (m) => m.SupportComponent,
      ),
  },
  {
    path: "admin/support",
    redirectTo: "dashboard/admin/faqs",
    pathMatch: "full",
  },
  {
    path: "citizen/support",
    redirectTo: "dashboard/citizen/support",
    pathMatch: "full",
  },
  {
    path: "government/support",
    redirectTo: "dashboard/government/support",
    pathMatch: "full",
  },
  {
    path: "researcher/support",
    redirectTo: "dashboard/researcher/support",
    pathMatch: "full",
  },
  {
    path: "organization/support",
    redirectTo: "dashboard/organization/support",
    pathMatch: "full",
  },
  {
    path: "feedback",
    loadComponent: () =>
      import("./features/feedback/feedback-form/feedback-form.component").then(
        (m) => m.FeedbackFormComponent,
      ),
  },
  {
    path: "admin/feedback",
    redirectTo: "dashboard/admin/feedback",
    pathMatch: "full",
  },
  {
    path: "citizen/feedback",
    redirectTo: "dashboard/citizen/feedback",
    pathMatch: "full",
  },
  {
    path: "government/feedback",
    redirectTo: "dashboard/government/feedback",
    pathMatch: "full",
  },
  {
    path: "researcher/feedback",
    redirectTo: "dashboard/researcher/feedback",
    pathMatch: "full",
  },
  {
    path: "organization/feedback",
    redirectTo: "dashboard/organization/feedback",
    pathMatch: "full",
  },

  // =========================================================
  // REPORTS ORPHAN REDIRECTS (role layout integration)
  // =========================================================
  //
  // Legacy /admin/reports and /government/reports links now resolve
  // inside the role layout instead of falling through to login.
  //
  // =========================================================
  {
    path: "admin/reports",
    redirectTo: "dashboard/admin/reports",
    pathMatch: "full",
  },
  {
    path: "government/reports",
    redirectTo: "dashboard/government/reports",
    pathMatch: "full",
  },
  {
    path: "citizen/reports",
    redirectTo: "dashboard/citizen/reports",
    pathMatch: "full",
  },
  {
    path: "researcher/reports",
    redirectTo: "dashboard/researcher/reports",
    pathMatch: "full",
  },
  {
    path: "organization/reports",
    redirectTo: "dashboard/organization/reports",
    pathMatch: "full",
  },
  {
    path: "admin/audit-logs",
    redirectTo: "dashboard/admin/audit-logs",
    pathMatch: "full",
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
