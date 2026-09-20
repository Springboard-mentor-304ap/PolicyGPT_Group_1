import { Routes } from "@angular/router";

import { authGuard } from "../../../core/guards/auth.guard";
import { roleGuard } from "../../../core/guards/role.guard";

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
      import(
        "../../../shared/layouts/organization-layout/organization-layout.component"
      ).then((m) => m.OrganizationLayoutComponent),

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
          import(
            "../../compare/compare-selection/compare-selection.component"
          ).then((m) => m.CompareSelectionComponent),
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
      import(
        "../../../shared/layouts/citizen-layout/citizen-layout.component"
      ).then((m) => m.CitizenLayoutComponent),

    children: [
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./citizen/citizen.component").then(
            (m) => m.CitizenComponent,
          ),
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
          import(
            "../../eligibility/eligibility-specific/eligibility-specific"
          ).then((m) => m.EligibilitySpecific),
      },

      // /dashboard/citizen/eligibility
      {
        path: "eligibility",

        loadComponent: () =>
          import(
            "../../eligibility/eligibility-checker/eligibility-checker"
          ).then((m) => m.EligibilityChecker),
      },

      // COMPARE SELECTION
      // /dashboard/citizen/compare
      {
        path: "compare",

        loadComponent: () =>
          import(
            "../../compare/compare-selection/compare-selection.component"
          ).then((m) => m.CompareSelectionComponent),
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
    ],
  },

  // =========================================================
  // GOVERNMENT DASHBOARD
  // =========================================================

  {
    path: "government",

    canActivate: [authGuard, roleGuard],

    data: {
      roles: [
        "GOVERNMENT_OFFICIAL",
        "GOVERNMENT_OFFICER",
        "GOVERNMENT",
      ],
    },

    loadComponent: () =>
      import(
        "../../../shared/layouts/government-layout/government-layout.component"
      ).then((m) => m.GovernmentLayoutComponent),

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
          import(
            "../../compare/compare-selection/compare-selection.component"
          ).then((m) => m.CompareSelectionComponent),
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
      import(
        "../../../shared/layouts/admin-layout/admin-layout.component"
      ).then((m) => m.AdminLayoutComponent),

    children: [
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./admin/admin.component").then(
            (m) => m.AdminComponent,
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
          import(
            "../../compare/compare-selection/compare-selection.component"
          ).then((m) => m.CompareSelectionComponent),
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
      import(
        "../../../shared/layouts/researcher-layout/researcher-layout.component"
      ).then((m) => m.ResearcherLayoutComponent),

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
          import(
            "../../compare/compare-selection/compare-selection.component"
          ).then((m) => m.CompareSelectionComponent),
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
    ],
  },

  // =========================================================
  // GUEST DASHBOARD
  // =========================================================

  {
    path: "guest",

    loadComponent: () =>
      import(
        "../../../shared/layouts/guest-user-layout/guest-user-layout.component"
      ).then((m) => m.GuestUserLayoutComponent),

    children: [
      // HOME
      {
        path: "",
        pathMatch: "full",

        loadComponent: () =>
          import("./guest/guest.component").then(
            (m) => m.GuestComponent,
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
          import(
            "../../compare/compare-selection/compare-selection.component"
          ).then((m) => m.CompareSelectionComponent),
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
          import(
            "../../eligibility/eligibility-checker/eligibility-checker"
          ).then((m) => m.EligibilityChecker),
      },

      // ELIGIBILITY SPECIFIC
      {
        path: "eligibility/check",

        loadComponent: () =>
          import(
            "../../eligibility/eligibility-specific/eligibility-specific"
          ).then((m) => m.EligibilitySpecific),
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
