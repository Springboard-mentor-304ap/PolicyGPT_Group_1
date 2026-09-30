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

      // REPORTS (role layout children)
      // /dashboard/organization/reports
      ...REPORTS_CHILD_ROUTES,
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

      // REPORTS (role layout children)
      // /dashboard/citizen/reports
      ...REPORTS_CHILD_ROUTES,
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

      // REPORTS (role layout children)
      // /dashboard/researcher/reports
      ...REPORTS_CHILD_ROUTES,
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
