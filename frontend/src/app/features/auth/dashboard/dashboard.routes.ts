import { Routes } from "@angular/router";

import { authGuard } from "../../../core/guards/auth.guard";
import { roleGuard } from "../../../core/guards/role.guard";
import { guestGuard } from "../../../core/guards/guest.guard";
import { supportRoleGuard } from "../../../core/guards/support.guard";
import { REPORTS_CHILD_ROUTES } from "../../reports/reports.routes";

export const DASHBOARD_ROUTES: Routes = [
  // =========================================================
  // ORGANIZATION DASHBOARD
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
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./organization/organization.component").then(
            (m) => m.OrganizationComponent,
          ),
      },

      // POLICIES
      // /dashboard/organization/policies
      {
        path: "policies",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICIES SEARCH (ALIAS)
      // /dashboard/organization/policies/search
      {
        path: "policies/search",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICY DETAILS
      // /dashboard/organization/policies/:id
      {
        path: "policies/:id",

        loadComponent: () =>
          import("../../policy/policy-details/policy-details.component").then(
            (m) => m.PolicyDetailsComponent,
          ),
      },

      // SCHEMES
      // /dashboard/organization/schemes
      {
        path: "schemes",

        loadComponent: () =>
          import("../../schemes/scheme-search/scheme-search.component").then(
            (m) => m.SchemeSearchComponent,
          ),
      },

      // SCHEME DETAILS
      // /dashboard/organization/schemes/:id
      {
        path: "schemes/:id",

        loadComponent: () =>
          import("../../schemes/scheme-details/scheme-details.component").then(
            (m) => m.SchemeDetailsComponent,
          ),
      },

      // COMPARE SELECTION
      // /dashboard/organization/compare
      {
        path: "compare",

        loadComponent: () =>
          import("../../compare/compare-selection/compare-selection.component").then(
            (m) => m.CompareSelectionComponent,
          ),
      },

      // COMPARE RESULTS
      // /dashboard/organization/compare/results
      {
        path: "compare/results",

        loadComponent: () =>
          import("../../compare/compare-results/compare-results.component").then(
            (m) => m.CompareResultsComponent,
          ),
      },

      // PROFILE
      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // EDIT PROFILE
      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // CHANGE PASSWORD
      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
          ),
      },

      // SETTINGS (shared role-based module)
      {
        path: "settings",

        loadComponent: () =>
          import("../../settings/settings.component").then(
            (m) => m.SettingsComponent,
          ),
      },

      // NOTIFICATIONS
      {
        path: "notifications",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },
      {
        path: "notifications/preferences",
        loadComponent: () =>
          import("../../notifications/notification-preferences/notification-preferences.component").then(
            (m) => m.NotificationPreferencesComponent,
          ),
      },
      {
        path: "notifications/:id",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },

      // FAQS & SUPPORT
      {
        path: "faqs",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },
      {
        path: "support",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },

      // FEEDBACK
      {
        path: "feedback",
        loadComponent: () =>
          import("../../feedback/feedback-form/feedback-form.component").then(
            (m) => m.FeedbackFormComponent,
          ),
      },

      // SAVED ITEMS
      // /dashboard/organization/saved
      {
        path: "saved",

        loadComponent: () =>
          import("../../saved-items/saved-items.component").then(
            (m) => m.SavedItemsComponent,
          ),
      },

      // SEARCH HISTORY
      // /dashboard/organization/history
      {
        path: "history",

        loadComponent: () =>
          import("../../search-history/search-history.component").then(
            (m) => m.SearchHistoryComponent,
          ),
      },

      // ORGANIZATION ANALYTICS
      {
        path: "analytics",

        data: {
          analyticsRole: "organization",
        },

        loadComponent: () =>
          import("../../analytics/role-analytics/role-analytics.component").then(
            (m) => m.RoleAnalyticsComponent,
          ),
      },

      {
        path: "analytics/policies",

        data: {
          variant: "policies",
          pageTitle: "Policy Analytics",
          pageDescription:
            "Policy portfolio status and distribution breakdowns.",
          crumbs: [
            { label: "Home", route: ["/dashboard/organization"] },
            {
              label: "Analytics",
              route: ["/dashboard/organization/analytics"],
            },
            { label: "Policy Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/schemes",

        data: {
          variant: "schemes",
          pageTitle: "Scheme Analytics",
          pageDescription:
            "Scheme portfolio status and distribution breakdowns.",
          crumbs: [
            { label: "Home", route: ["/dashboard/organization"] },
            {
              label: "Analytics",
              route: ["/dashboard/organization/analytics"],
            },
            { label: "Scheme Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/usage",

        data: {
          variant: "usage",
          pageTitle: "Eligibility / Usage Analytics",
          pageDescription:
            "Platform eligibility coverage and usage statistics.",
          crumbs: [
            { label: "Home", route: ["/dashboard/organization"] },
            {
              label: "Analytics",
              route: ["/dashboard/organization/analytics"],
            },
            { label: "Eligibility / Usage Analytics" },
          ],
          cta: [
            {
              label: "Browse Schemes",
              icon: "account_balance",
              route: ["/dashboard/organization/schemes"],
            },
            {
              label: "View Search History",
              icon: "history",
              route: ["/dashboard/organization/history"],
            },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
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
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./citizen/citizen.component").then((m) => m.CitizenComponent),
      },

      // POLICIES
      // /dashboard/citizen/policies
      {
        path: "policies",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICIES SEARCH (ALIAS)
      // /dashboard/citizen/policies/search
      {
        path: "policies/search",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICY DETAILS
      // /dashboard/citizen/policies/:id
      {
        path: "policies/:id",

        loadComponent: () =>
          import("../../policy/policy-details/policy-details.component").then(
            (m) => m.PolicyDetailsComponent,
          ),
      },

      // SCHEMES
      // /dashboard/citizen/schemes
      {
        path: "schemes",

        loadComponent: () =>
          import("../../schemes/scheme-search/scheme-search.component").then(
            (m) => m.SchemeSearchComponent,
          ),
      },

      // SCHEME DETAILS
      // /dashboard/citizen/schemes/:id
      {
        path: "schemes/:id",

        loadComponent: () =>
          import("../../schemes/scheme-details/scheme-details.component").then(
            (m) => m.SchemeDetailsComponent,
          ),
      },

      // =====================================================
      // ELIGIBILITY CHECKER
      // =====================================================

      // /dashboard/citizen/eligibility/check
      {
        path: "eligibility/check",

        loadComponent: () =>
          import("../../eligibility/eligibility-specific/eligibility-specific").then(
            (m) => m.EligibilitySpecific,
          ),
      },

      // /dashboard/citizen/eligibility
      {
        path: "eligibility",

        loadComponent: () =>
          import("../../eligibility/eligibility-checker/eligibility-checker").then(
            (m) => m.EligibilityChecker,
          ),
      },

      // COMPARE SELECTION
      // /dashboard/citizen/compare
      {
        path: "compare",

        loadComponent: () =>
          import("../../compare/compare-selection/compare-selection.component").then(
            (m) => m.CompareSelectionComponent,
          ),
      },

      // COMPARE RESULTS
      // /dashboard/citizen/compare/results
      {
        path: "compare/results",

        loadComponent: () =>
          import("../../compare/compare-results/compare-results.component").then(
            (m) => m.CompareResultsComponent,
          ),
      },

      // PROFILE
      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // EDIT PROFILE
      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // CHANGE PASSWORD
      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
          ),
      },

      // SETTINGS (shared role-based module)
      {
        path: "settings",

        loadComponent: () =>
          import("../../settings/settings.component").then(
            (m) => m.SettingsComponent,
          ),
      },

      // NOTIFICATIONS
      {
        path: "notifications",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },
      {
        path: "notifications/preferences",
        loadComponent: () =>
          import("../../notifications/notification-preferences/notification-preferences.component").then(
            (m) => m.NotificationPreferencesComponent,
          ),
      },
      {
        path: "notifications/:id",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },

      // FAQS & SUPPORT
      {
        path: "faqs",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },
      {
        path: "support",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },

      // FEEDBACK
      {
        path: "feedback",
        loadComponent: () =>
          import("../../feedback/feedback-form/feedback-form.component").then(
            (m) => m.FeedbackFormComponent,
          ),
      },

      // SAVED ITEMS
      // /dashboard/citizen/saved
      {
        path: "saved",

        loadComponent: () =>
          import("../../saved-items/saved-items.component").then(
            (m) => m.SavedItemsComponent,
          ),
      },

      // SEARCH HISTORY
      // /dashboard/citizen/history
      {
        path: "history",

        loadComponent: () =>
          import("../../search-history/search-history.component").then(
            (m) => m.SearchHistoryComponent,
          ),
      },

      // CITIZEN ANALYTICS
      {
        path: "analytics",

        data: {
          analyticsRole: "citizen",
        },

        loadComponent: () =>
          import("../../analytics/role-analytics/role-analytics.component").then(
            (m) => m.RoleAnalyticsComponent,
          ),
      },

      // CITIZEN ANALYTICS ALIAS (sidebar: Saved & Search Activity)
      {
        path: "analytics/activity",

        data: {
          analyticsRole: "citizen",
        },

        loadComponent: () =>
          import("../../analytics/role-analytics/role-analytics.component").then(
            (m) => m.RoleAnalyticsComponent,
          ),
      },

      {
        path: "analytics/saved-policies",

        data: {
          variant: "saved-policies",
          pageTitle: "Saved Policies",
          pageDescription: "Policies you saved for later, with counts.",
          crumbs: [
            { label: "Home", route: ["/dashboard/citizen"] },
            {
              label: "Analytics",
              route: ["/dashboard/citizen/analytics"],
            },
            { label: "Saved Policies" },
          ],
          cta: [
            {
              label: "View All Saved Items",
              icon: "bookmark",
              route: ["/dashboard/citizen/saved"],
            },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/eligible-schemes",

        data: {
          variant: "eligible-schemes",
          pageTitle: "Eligible Schemes",
          pageDescription: "Open schemes you may be eligible for, by category.",
          crumbs: [
            { label: "Home", route: ["/dashboard/citizen"] },
            {
              label: "Analytics",
              route: ["/dashboard/citizen/analytics"],
            },
            { label: "Eligible Schemes" },
          ],
          cta: [
            {
              label: "Check My Eligibility",
              icon: "fact_check",
              route: ["/dashboard/citizen/eligibility"],
            },
            {
              label: "Browse Schemes",
              icon: "account_balance",
              route: ["/dashboard/citizen/schemes"],
            },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/search-history",

        data: {
          variant: "search-history",
          pageTitle: "Search History",
          pageDescription: "Your policy and scheme search activity.",
          crumbs: [
            { label: "Home", route: ["/dashboard/citizen"] },
            {
              label: "Analytics",
              route: ["/dashboard/citizen/analytics"],
            },
            { label: "Search History" },
          ],
          cta: [
            {
              label: "View Full History",
              icon: "history",
              route: ["/dashboard/citizen/history"],
            },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/application-status",

        data: {
          variant: "application-status",
          pageTitle: "Application Status",
          pageDescription: "Track your scheme applications.",
          crumbs: [
            { label: "Home", route: ["/dashboard/citizen"] },
            {
              label: "Analytics",
              route: ["/dashboard/citizen/analytics"],
            },
            { label: "Application Status" },
          ],
          cta: [
            {
              label: "Browse Schemes",
              icon: "account_balance",
              route: ["/dashboard/citizen/schemes"],
            },
            {
              label: "Check Eligibility",
              icon: "fact_check",
              route: ["/dashboard/citizen/eligibility"],
            },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/notifications",

        data: {
          variant: "notifications",
          pageTitle: "Notification Activity",
          pageDescription: "Your notification delivery and read activity.",
          crumbs: [
            { label: "Home", route: ["/dashboard/citizen"] },
            {
              label: "Analytics",
              route: ["/dashboard/citizen/analytics"],
            },
            { label: "Notification Activity" },
          ],
          cta: [
            {
              label: "View All Notifications",
              icon: "notifications",
              route: ["/dashboard/citizen/notifications"],
            },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
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
      roles: ["GOVERNMENT_OFFICIAL", "GOVERNMENT_OFFICER", "GOVERNMENT"],
    },

    loadComponent: () =>
      import("../../../shared/layouts/government-layout/government-layout.component").then(
        (m) => m.GovernmentLayoutComponent,
      ),

    children: [
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./government/government.component").then(
            (m) => m.GovernmentComponent,
          ),
      },

      // POLICIES
      {
        path: "policies",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICIES SEARCH (ALIAS)
      {
        path: "policies/search",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // ADD POLICY
      {
        path: "policies/add",

        loadComponent: () =>
          import("../../policy/add-policy/add-policy.component").then(
            (m) => m.AddPolicyComponent,
          ),
      },

      // MANAGE POLICIES
      {
        path: "policies/manage",

        loadComponent: () =>
          import("../../policy/manage-policies/manage-policies.component").then(
            (m) => m.ManagePoliciesComponent,
          ),
      },

      // EDIT POLICY
      {
        path: "policies/edit/:id",

        loadComponent: () =>
          import("../../policy/add-policy/add-policy.component").then(
            (m) => m.AddPolicyComponent,
          ),
      },

      // POLICY DETAILS
      {
        path: "policies/:id",

        loadComponent: () =>
          import("../../policy/policy-details/policy-details.component").then(
            (m) => m.PolicyDetailsComponent,
          ),
      },

      // SCHEMES
      {
        path: "schemes",

        loadComponent: () =>
          import("../../schemes/scheme-search/scheme-search.component").then(
            (m) => m.SchemeSearchComponent,
          ),
      },

      // SCHEMES SEARCH (ALIAS)
      {
        path: "schemes/search",

        loadComponent: () =>
          import("../../schemes/scheme-search/scheme-search.component").then(
            (m) => m.SchemeSearchComponent,
          ),
      },

      // ADD SCHEME
      {
        path: "schemes/add",

        loadComponent: () =>
          import("../../schemes/add-scheme/add-scheme.component").then(
            (m) => m.AddSchemeComponent,
          ),
      },

      // MANAGE SCHEMES
      {
        path: "schemes/manage",

        loadComponent: () =>
          import("../../schemes/manage-schemes/manage-schemes.component").then(
            (m) => m.ManageSchemesComponent,
          ),
      },

      // EDIT SCHEME
      {
        path: "schemes/edit/:id",

        loadComponent: () =>
          import("../../schemes/edit-scheme/edit-scheme.component").then(
            (m) => m.EditSchemeComponent,
          ),
      },

      // SCHEME DETAILS
      {
        path: "schemes/:id",

        loadComponent: () =>
          import("../../schemes/scheme-details/scheme-details.component").then(
            (m) => m.SchemeDetailsComponent,
          ),
      },

      // COMPARE
      {
        path: "compare",

        loadComponent: () =>
          import("../../compare/compare-selection/compare-selection.component").then(
            (m) => m.CompareSelectionComponent,
          ),
      },

      // COMPARE RESULTS
      {
        path: "compare/results",

        loadComponent: () =>
          import("../../compare/compare-results/compare-results.component").then(
            (m) => m.CompareResultsComponent,
          ),
      },

      // PROFILE
      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // EDIT PROFILE
      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // CHANGE PASSWORD
      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
          ),
      },

      // SETTINGS (shared role-based module)
      {
        path: "settings",

        loadComponent: () =>
          import("../../settings/settings.component").then(
            (m) => m.SettingsComponent,
          ),
      },

      // NOTIFICATIONS
      {
        path: "notifications",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },
      {
        path: "notifications/preferences",
        loadComponent: () =>
          import("../../notifications/notification-preferences/notification-preferences.component").then(
            (m) => m.NotificationPreferencesComponent,
          ),
      },
      {
        path: "notifications/delivery",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },
      {
        path: "notifications/:id",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },

      // FAQS & SUPPORT
      {
        path: "faqs",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },
      {
        path: "support",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },

      // FEEDBACK
      {
        path: "feedback",
        loadComponent: () =>
          import("../../feedback/feedback-form/feedback-form.component").then(
            (m) => m.FeedbackFormComponent,
          ),
      },

      // GOVERNMENT ANALYTICS (dedicated pages, sidebar-linked)
      // /dashboard/government/analytics
      {
        path: "analytics",

        loadComponent: () =>
          import("../../analytics/government/govt-analytics-overview.component").then(
            (m) => m.GovtAnalyticsOverviewComponent,
          ),
      },

      {
        path: "analytics/policy-scheme",

        loadComponent: () =>
          import("../../analytics/government/govt-policy-scheme.component").then(
            (m) => m.GovtPolicySchemeComponent,
          ),
      },

      {
        path: "analytics/departments",

        loadComponent: () =>
          import("../../analytics/government/govt-departments.component").then(
            (m) => m.GovtDepartmentsComponent,
          ),
      },

      {
        path: "analytics/user-notifications",

        loadComponent: () =>
          import("../../analytics/government/govt-user-notifications.component").then(
            (m) => m.GovtUserNotificationsComponent,
          ),
      },

      // REPORTS (role layout children)
      // /dashboard/government/reports
      ...REPORTS_CHILD_ROUTES,
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
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./admin/admin.component").then((m) => m.AdminComponent),
      },

      // =====================================================
      // ADMIN ANALYTICS
      // /dashboard/admin/analytics
      // =====================================================

      {
        path: "analytics",

        loadComponent: () =>
          import("./admin/analytics/admin-analytics/admin-analytics.component").then(
            (m) => m.AdminAnalyticsComponent,
          ),
      },

      // ADMIN ANALYTICS CHILDREN (shared detail screens)
      {
        path: "analytics/policies",

        data: {
          variant: "policies",
          pageTitle: "Policy Analytics",
          pageDescription:
            "Policy portfolio status and distribution breakdowns.",
          crumbs: [
            { label: "Home", route: ["/dashboard/admin"] },
            { label: "Analytics", route: ["/dashboard/admin/analytics"] },
            { label: "Policy Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/schemes",

        data: {
          variant: "schemes",
          pageTitle: "Scheme Analytics",
          pageDescription:
            "Scheme portfolio status and distribution breakdowns.",
          crumbs: [
            { label: "Home", route: ["/dashboard/admin"] },
            { label: "Analytics", route: ["/dashboard/admin/analytics"] },
            { label: "Scheme Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/users",

        data: {
          variant: "users",
          pageTitle: "User Analytics",
          pageDescription:
            "Registered user base, activity and role distribution.",
          crumbs: [
            { label: "Home", route: ["/dashboard/admin"] },
            { label: "Analytics", route: ["/dashboard/admin/analytics"] },
            { label: "User Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/departments",

        data: {
          variant: "departments",
          pageTitle: "Department Analytics",
          pageDescription: "Ministry and department aggregations.",
          crumbs: [
            { label: "Home", route: ["/dashboard/admin"] },
            { label: "Analytics", route: ["/dashboard/admin/analytics"] },
            { label: "Department Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/usage",

        data: {
          variant: "usage",
          pageTitle: "Usage Statistics",
          pageDescription: "Platform usage and adoption statistics.",
          crumbs: [
            { label: "Home", route: ["/dashboard/admin"] },
            { label: "Analytics", route: ["/dashboard/admin/analytics"] },
            { label: "Usage Statistics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/notifications",

        data: {
          variant: "notifications",
          pageTitle: "Notification Analytics",
          pageDescription: "Notification delivery and read statistics.",
          crumbs: [
            { label: "Home", route: ["/dashboard/admin"] },
            { label: "Analytics", route: ["/dashboard/admin/analytics"] },
            { label: "Notification Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      // POLICIES (SEARCH/VIEW)
      // /dashboard/admin/policies
      {
        path: "policies",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICIES (SEARCH/VIEW ALIAS)
      // /dashboard/admin/policies/search
      {
        path: "policies/search",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // ADD POLICY
      {
        path: "policies/add",

        loadComponent: () =>
          import("../../policy/add-policy/add-policy.component").then(
            (m) => m.AddPolicyComponent,
          ),
      },

      // MANAGE POLICIES
      {
        path: "policies/manage",

        loadComponent: () =>
          import("../../policy/manage-policies/manage-policies.component").then(
            (m) => m.ManagePoliciesComponent,
          ),
      },

      // EDIT POLICY
      {
        path: "policies/edit/:id",

        loadComponent: () =>
          import("../../policy/add-policy/add-policy.component").then(
            (m) => m.AddPolicyComponent,
          ),
      },

      // POLICY DETAILS
      {
        path: "policies/:id",

        loadComponent: () =>
          import("../../policy/policy-details/policy-details.component").then(
            (m) => m.PolicyDetailsComponent,
          ),
      },

      // SCHEMES (SEARCH/VIEW)
      {
        path: "schemes",

        loadComponent: () =>
          import("../../schemes/scheme-search/scheme-search.component").then(
            (m) => m.SchemeSearchComponent,
          ),
      },

      // SCHEMES SEARCH (ALIAS)
      {
        path: "schemes/search",

        loadComponent: () =>
          import("../../schemes/scheme-search/scheme-search.component").then(
            (m) => m.SchemeSearchComponent,
          ),
      },

      // ADD SCHEME
      {
        path: "schemes/add",

        loadComponent: () =>
          import("../../schemes/add-scheme/add-scheme.component").then(
            (m) => m.AddSchemeComponent,
          ),
      },

      // MANAGE SCHEMES
      {
        path: "schemes/manage",

        loadComponent: () =>
          import("../../schemes/manage-schemes/manage-schemes.component").then(
            (m) => m.ManageSchemesComponent,
          ),
      },

      // EDIT SCHEME
      {
        path: "schemes/edit/:id",

        loadComponent: () =>
          import("../../schemes/edit-scheme/edit-scheme.component").then(
            (m) => m.EditSchemeComponent,
          ),
      },

      // SCHEME DETAILS
      {
        path: "schemes/:id",

        loadComponent: () =>
          import("../../schemes/scheme-details/scheme-details.component").then(
            (m) => m.SchemeDetailsComponent,
          ),
      },

      // COMPARE
      {
        path: "compare",

        loadComponent: () =>
          import("../../compare/compare-selection/compare-selection.component").then(
            (m) => m.CompareSelectionComponent,
          ),
      },

      // COMPARE RESULTS
      {
        path: "compare/results",

        loadComponent: () =>
          import("../../compare/compare-results/compare-results.component").then(
            (m) => m.CompareResultsComponent,
          ),
      },

      // PROFILE
      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // EDIT PROFILE
      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // CHANGE PASSWORD
      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
          ),
      },

      // SETTINGS (shared role-based module)
      {
        path: "settings",

        loadComponent: () =>
          import("../../settings/settings.component").then(
            (m) => m.SettingsComponent,
          ),
      },

      // USERS
      {
        path: "users",

        loadComponent: () =>
          import("./admin/users/view-users.component").then(
            (m) => m.ViewUsersComponent,
          ),
      },

      // ADD USER
      {
        path: "users/add",

        loadComponent: () =>
          import("./admin/users/add-user.component").then(
            (m) => m.AddUserComponent,
          ),
      },

      // REMOVE USER
      {
        path: "users/remove",

        loadComponent: () =>
          import("./admin/users/remove-user.component").then(
            (m) => m.RemoveUserComponent,
          ),
      },

      // USER DETAILS
      {
        path: "users/:id",

        loadComponent: () =>
          import("./admin/users/user-details.component").then(
            (m) => m.UserDetailsComponent,
          ),
      },

      // NOTIFICATIONS
      {
        path: "notifications",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },
      {
        path: "notifications/preferences",
        loadComponent: () =>
          import("../../notifications/notification-preferences/notification-preferences.component").then(
            (m) => m.NotificationPreferencesComponent,
          ),
      },
      {
        path: "notifications/delivery",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },
      {
        path: "notifications/:id",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },

      // FAQS (ADMIN MANAGEMENT)
      {
        path: "faqs",
        loadComponent: () =>
          import("../../faq/faq-list/faq-list.component").then(
            (m) => m.FaqListComponent,
          ),
      },

      // ADMIN CANNOT ACCESS USER SUPPORT PAGE - REDIRECT TO ADMIN FAQS
      {
        path: "support",
        canActivate: [supportRoleGuard],
        loadComponent: () =>
          import("../../faq/faq-list/faq-list.component").then(
            (m) => m.FaqListComponent,
          ),
      },

      // FEEDBACK (ADMIN MANAGEMENT)
      {
        path: "feedback",
        loadComponent: () =>
          import("../../feedback/admin-feedback/admin-feedback.component").then(
            (m) => m.AdminFeedbackComponent,
          ),
      },

      // SUPPORT REQUESTS (ADMIN MANAGEMENT)
      // /dashboard/admin/support-requests
      {
        path: "support-requests",
        loadComponent: () =>
          import("../../support/admin-support/admin-support.component").then(
            (m) => m.AdminSupportComponent,
          ),
      },

      // AUDIT LOGS (ADMIN ONLY)
      // /dashboard/admin/audit-logs
      {
        path: "audit-logs",
        loadComponent: () =>
          import("../../audit-log/audit-log.component").then(
            (m) => m.AuditLogComponent,
          ),
      },

      // REPORTS (role layout children)
      // /dashboard/admin/reports
      ...REPORTS_CHILD_ROUTES,
    ],
  },

  // =========================================================
  // RESEARCHER DASHBOARD
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
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./researcher/researcher.component").then(
            (m) => m.ResearcherComponent,
          ),
      },

      // POLICIES
      {
        path: "policies",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICIES SEARCH (ALIAS)
      {
        path: "policies/search",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICY DETAILS
      {
        path: "policies/:id",

        loadComponent: () =>
          import("../../policy/policy-details/policy-details.component").then(
            (m) => m.PolicyDetailsComponent,
          ),
      },

      // SCHEMES
      {
        path: "schemes",

        loadComponent: () =>
          import("../../schemes/scheme-search/scheme-search.component").then(
            (m) => m.SchemeSearchComponent,
          ),
      },

      // SCHEME DETAILS
      {
        path: "schemes/:id",

        loadComponent: () =>
          import("../../schemes/scheme-details/scheme-details.component").then(
            (m) => m.SchemeDetailsComponent,
          ),
      },

      // COMPARE
      {
        path: "compare",

        loadComponent: () =>
          import("../../compare/compare-selection/compare-selection.component").then(
            (m) => m.CompareSelectionComponent,
          ),
      },

      // COMPARE RESULTS
      {
        path: "compare/results",

        loadComponent: () =>
          import("../../compare/compare-results/compare-results.component").then(
            (m) => m.CompareResultsComponent,
          ),
      },

      // PROFILE
      {
        path: "profile",

        loadComponent: () =>
          import("../../profile/profile.component").then(
            (m) => m.ProfileComponent,
          ),
      },

      // EDIT PROFILE
      {
        path: "profile/edit",

        loadComponent: () =>
          import("../../profile/edit-profile/edit-profile.component").then(
            (m) => m.EditProfileComponent,
          ),
      },

      // CHANGE PASSWORD
      {
        path: "change-password",

        loadComponent: () =>
          import("../change-password/change-password.component").then(
            (m) => m.ChangePasswordComponent,
          ),
      },

      // SETTINGS (shared role-based module)
      {
        path: "settings",

        loadComponent: () =>
          import("../../settings/settings.component").then(
            (m) => m.SettingsComponent,
          ),
      },

      // NOTIFICATIONS
      {
        path: "notifications",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },
      {
        path: "notifications/preferences",
        loadComponent: () =>
          import("../../notifications/notification-preferences/notification-preferences.component").then(
            (m) => m.NotificationPreferencesComponent,
          ),
      },
      {
        path: "notifications/:id",
        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },

      // FAQS & SUPPORT
      {
        path: "faqs",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },
      {
        path: "support",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },

      // FEEDBACK
      {
        path: "feedback",
        loadComponent: () =>
          import("../../feedback/feedback-form/feedback-form.component").then(
            (m) => m.FeedbackFormComponent,
          ),
      },

      // SAVED ITEMS
      // /dashboard/researcher/saved
      {
        path: "saved",

        loadComponent: () =>
          import("../../saved-items/saved-items.component").then(
            (m) => m.SavedItemsComponent,
          ),
      },

      // SEARCH HISTORY
      // /dashboard/researcher/history
      {
        path: "history",

        loadComponent: () =>
          import("../../search-history/search-history.component").then(
            (m) => m.SearchHistoryComponent,
          ),
      },

      // RESEARCHER ANALYTICS
      {
        path: "analytics",

        data: {
          analyticsRole: "researcher",
        },

        loadComponent: () =>
          import("../../analytics/role-analytics/role-analytics.component").then(
            (m) => m.RoleAnalyticsComponent,
          ),
      },

      // RESEARCHER ANALYTICS ALIAS (sidebar: Policy & Scheme Trends)
      {
        path: "analytics/trends",

        data: {
          analyticsRole: "researcher",
        },

        loadComponent: () =>
          import("../../analytics/role-analytics/role-analytics.component").then(
            (m) => m.RoleAnalyticsComponent,
          ),
      },

      {
        path: "analytics/policies",

        data: {
          variant: "policies",
          pageTitle: "Policy Analytics",
          pageDescription:
            "Policy portfolio status and distribution breakdowns.",
          crumbs: [
            { label: "Home", route: ["/dashboard/researcher"] },
            {
              label: "Analytics",
              route: ["/dashboard/researcher/analytics"],
            },
            { label: "Policy Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/schemes",

        data: {
          variant: "schemes",
          pageTitle: "Scheme Analytics",
          pageDescription:
            "Scheme portfolio status and distribution breakdowns.",
          crumbs: [
            { label: "Home", route: ["/dashboard/researcher"] },
            {
              label: "Analytics",
              route: ["/dashboard/researcher/analytics"],
            },
            { label: "Scheme Analytics" },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },

      {
        path: "analytics/usage",

        data: {
          variant: "usage",
          pageTitle: "Search / Usage Analytics",
          pageDescription: "Platform search and usage statistics.",
          crumbs: [
            { label: "Home", route: ["/dashboard/researcher"] },
            {
              label: "Analytics",
              route: ["/dashboard/researcher/analytics"],
            },
            { label: "Search / Usage Analytics" },
          ],
          cta: [
            {
              label: "View Search History",
              icon: "history",
              route: ["/dashboard/researcher/history"],
            },
          ],
        },

        loadComponent: () =>
          import("../../analytics/analytics-detail/analytics-detail.component").then(
            (m) => m.AnalyticsDetailComponent,
          ),
      },
    ],
  },

  // =========================================================
  // GUEST DASHBOARD
  // =========================================================

  {
    path: "guest",

    canActivate: [guestGuard],

    loadComponent: () =>
      import("../../../shared/layouts/guest-user-layout/guest-user-layout.component").then(
        (m) => m.GuestUserLayoutComponent,
      ),

    children: [
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./guest/guest.component").then((m) => m.GuestComponent),
      },

      // POLICIES
      {
        path: "policies",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICIES SEARCH (ALIAS)
      {
        path: "policies/search",

        loadComponent: () =>
          import("../../policy/policy-search/policy-search.component").then(
            (m) => m.PolicySearchComponent,
          ),
      },

      // POLICY DETAILS
      {
        path: "policies/:id",

        loadComponent: () =>
          import("../../policy/policy-details/policy-details.component").then(
            (m) => m.PolicyDetailsComponent,
          ),
      },

      // SCHEMES
      {
        path: "schemes",

        loadComponent: () =>
          import("../../schemes/scheme-search/scheme-search.component").then(
            (m) => m.SchemeSearchComponent,
          ),
      },

      // SCHEME DETAILS
      {
        path: "schemes/:id",

        loadComponent: () =>
          import("../../schemes/scheme-details/scheme-details.component").then(
            (m) => m.SchemeDetailsComponent,
          ),
      },

      // COMPARE
      {
        path: "compare",

        loadComponent: () =>
          import("../../compare/compare-selection/compare-selection.component").then(
            (m) => m.CompareSelectionComponent,
          ),
      },

      // COMPARE RESULTS
      {
        path: "compare/results",

        loadComponent: () =>
          import("../../compare/compare-results/compare-results.component").then(
            (m) => m.CompareResultsComponent,
          ),
      },

      // ELIGIBILITY CHECKER
      {
        path: "eligibility",

        loadComponent: () =>
          import("../../eligibility/eligibility-checker/eligibility-checker").then(
            (m) => m.EligibilityChecker,
          ),
      },

      // ELIGIBILITY SPECIFIC
      {
        path: "eligibility/check",

        loadComponent: () =>
          import("../../eligibility/eligibility-specific/eligibility-specific").then(
            (m) => m.EligibilitySpecific,
          ),
      },

      // NOTIFICATIONS
      {
        path: "notifications",

        loadComponent: () =>
          import("../../notifications/notification-list/notification-list.component").then(
            (m) => m.NotificationListComponent,
          ),
      },
      {
        path: "notifications/preferences",

        loadComponent: () =>
          import("../../notifications/notification-preferences/notification-preferences.component").then(
            (m) => m.NotificationPreferencesComponent,
          ),
      },

      // FAQS & SUPPORT (GUEST VIEW)
      {
        path: "faqs",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },
      {
        path: "support",
        loadComponent: () =>
          import("../../support/support.component").then(
            (m) => m.SupportComponent,
          ),
      },
    ],
  },

  // =========================================================
  // DEFAULT DASHBOARD
  // =========================================================

  {
    path: "",

    redirectTo: "guest",

    pathMatch: "full",
  },
];
