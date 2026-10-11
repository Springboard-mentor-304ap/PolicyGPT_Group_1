import { ChangeDetectorRef, Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { of } from "rxjs";
import { catchError } from "rxjs/operators";
import {
  AdminUsersService,
  AdminUserApi,
  UserAuditLogApi,
} from "../../../../../core/services/admin-user.service";
import { PolicyService } from "../../../../../core/services/policy.service";
import { SchemeService } from "../../../../../core/services/scheme.service";
import {
  SearchHistoryService,
  SearchHistoryItem,
} from "../../../../../core/services/search-history.service";
import { PolicyResponse } from "../../../../../core/models/policy.model";
import { SchemeResponse } from "../../../../../core/models/scheme.model";

export type UserRole =
  | "CITIZEN"
  | "RESEARCHER"
  | "ORGANIZATION"
  | "GOVERNMENT_OFFICIAL"
  | "ADMINISTRATOR";

export interface UserProfileView {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  state: string;
  district: string;
  occupation: string;
  organization: string;
  status: "Active" | "Inactive";
  joinedDate: string;
  updatedDate: string;
}

export interface UserActivityItem {
  id: string;
  type: "policy" | "scheme" | "audit" | "search";
  action: string;
  title: string;
  subtitle?: string;
  timestamp: string;
  icon: string;
  iconClass: string;
}

@Component({
  selector: "app-user-details",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./user-details.component.html",
  styleUrls: ["./user-details.component.scss"],
})
export class UserDetailsComponent implements OnInit {
  userId = 0;
  user: UserProfileView | null = null;

  activeTab: "overview" | "policies" | "schemes" | "activity" | "searches" = "overview";

  isLoadingUser = true;
  isLoadingPolicies = false;
  isLoadingSchemes = false;
  isLoadingActivity = true;
  isLoadingSearches = true;

  userError = "";
  policiesError = "";
  schemesError = "";
  activityError = "";
  searchesError = "";

  userPolicies: PolicyResponse[] = [];
  userSchemes: SchemeResponse[] = [];
  userSearches: SearchHistoryItem[] = [];
  userActivities: UserActivityItem[] = [];

  private rawAuditLogs: UserAuditLogApi[] = [];

  constructor(
    @Inject(ActivatedRoute) private route: ActivatedRoute,
    @Inject(Router) private router: Router,
    @Inject(AdminUsersService) private adminUsersService: AdminUsersService,
    @Inject(PolicyService) private policyService: PolicyService,
    @Inject(SchemeService) private schemeService: SchemeService,
    @Inject(SearchHistoryService) private searchHistoryService: SearchHistoryService,
    @Inject(ChangeDetectorRef) private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get("id");
      const id = idParam ? parseInt(idParam, 10) : 0;

      if (!id || isNaN(id)) {
        this.userError = "Invalid user identifier provided.";
        this.isLoadingUser = false;
        return;
      }

      this.userId = id;
      this.loadUserData(id);
    });
  }

  // =======================================================
  // ROLE HELPERS
  // =======================================================

  isCreatorRole(role?: UserRole): boolean {
    return role === "GOVERNMENT_OFFICIAL" || role === "ADMINISTRATOR";
  }

  // =======================================================
  // LOAD USER DATA & ASSOCIATED RECORDS
  // =======================================================

  loadUserData(id: number): void {
    this.user = null;
    this.isLoadingUser = true;
    this.isLoadingPolicies = false;
    this.isLoadingSchemes = false;
    this.isLoadingActivity = true;
    this.isLoadingSearches = true;

    this.userError = "";
    this.policiesError = "";
    this.schemesError = "";
    this.activityError = "";
    this.searchesError = "";

    this.userPolicies = [];
    this.userSchemes = [];
    this.userSearches = [];
    this.userActivities = [];
    this.rawAuditLogs = [];

    // 1. Fetch User Profile
    this.adminUsersService.getUserById(id).subscribe({
      next: (userData: AdminUserApi | null) => {
        this.isLoadingUser = false;

        if (!userData) {
          this.userError = "The requested user account does not exist or has been removed.";
          this.isLoadingActivity = false;
          this.isLoadingSearches = false;
          this.cdr.detectChanges();
          return;
        }

        this.user = this.mapUserProfile(userData);

        // Adjust active tab if user is non-creator
        if (!this.isCreatorRole(this.user.role) && (this.activeTab === "policies" || this.activeTab === "schemes")) {
          this.activeTab = "activity";
        }

        this.cdr.detectChanges();

        // 2. Fetch appropriate records based on role
        this.fetchAssociatedRecords(id, this.user.role);
      },
      error: (err) => {
        console.error("Error loading user:", err);
        this.isLoadingUser = false;
        this.userError =
          err?.error?.detail ||
          err?.message ||
          "Unable to load user profile. Please check your network connection.";
        this.isLoadingActivity = false;
        this.isLoadingSearches = false;
        this.cdr.detectChanges();
      },
    });
  }

  private fetchAssociatedRecords(userId: number, role: UserRole): void {
    // 1. Always fetch Search History & Viewed Activity (applies to all users, especially Citizen/Researcher/Org)
    this.searchHistoryService
      .getUserSearchHistory(userId)
      .pipe(catchError((err) => {
        console.warn("Unable to fetch search history for user:", err);
        return of([]);
      }))
      .subscribe((searches: SearchHistoryItem[]) => {
        this.isLoadingSearches = false;
        this.userSearches = Array.isArray(searches) ? searches : [];
        this.rebuildActivityTimeline();
        this.cdr.detectChanges();
      });

    // 2. Always fetch Audit Logs (logins, page views, details viewed)
    this.adminUsersService
      .getAuditLogsForUser(userId)
      .pipe(catchError(() => of([])))
      .subscribe((logs: UserAuditLogApi[]) => {
        this.isLoadingActivity = false;
        this.rawAuditLogs = Array.isArray(logs) ? logs : [];
        this.rebuildActivityTimeline();
        this.cdr.detectChanges();
      });

    // 3. ONLY fetch Policies & Schemes Created if the user has a Government or Admin creator role
    if (this.isCreatorRole(role)) {
      this.isLoadingPolicies = true;
      this.isLoadingSchemes = true;

      this.policyService
        .getPolicies({ manage: true, limit: 100 })
        .pipe(catchError((err) => {
          console.error("Error fetching policies:", err);
          this.policiesError = "Unable to load policies created by this user.";
          return of({ total: 0, page: 1, limit: 100, pages: 1, policies: [] });
        }))
        .subscribe((res) => {
          this.isLoadingPolicies = false;
          if (Array.isArray(res?.policies)) {
            this.userPolicies = res.policies.filter((p) => p.created_by === userId);
          } else {
            this.userPolicies = [];
          }
          this.rebuildActivityTimeline();
          this.cdr.detectChanges();
        });

      this.schemeService
        .getSchemes({ manage: true, limit: 100 })
        .pipe(catchError((err) => {
          console.error("Error fetching schemes:", err);
          this.schemesError = "Unable to load schemes created by this user.";
          return of({ total: 0, page: 1, limit: 100, pages: 1, schemes: [] });
        }))
        .subscribe((res) => {
          this.isLoadingSchemes = false;
          if (Array.isArray(res?.schemes)) {
            this.userSchemes = res.schemes.filter((s) => s.created_by === userId);
          } else {
            this.userSchemes = [];
          }
          this.rebuildActivityTimeline();
          this.cdr.detectChanges();
        });
    } else {
      this.isLoadingPolicies = false;
      this.isLoadingSchemes = false;
    }
  }

  // =======================================================
  // REBUILD TIMELINE FROM VERIFIED DATA (SEARCHES, VIEWS, CREATIONS)
  // =======================================================

  private rebuildActivityTimeline(): void {
    const activities: UserActivityItem[] = [];

    // A. Searches & Viewed Queries (Citizen, Researcher, Organization, and Government/Admin)
    for (const s of this.userSearches) {
      const searchType = (s.search_type || "PLATFORM").toUpperCase();
      let actionLabel = "Searched Platform";
      let icon = "search";
      let iconClass = "activity-icon--search";

      if (searchType === "POLICY") {
        actionLabel = "Explored Policies";
        icon = "travel_explore";
      } else if (searchType === "SCHEME") {
        actionLabel = "Explored Schemes";
        icon = "travel_explore";
      }

      let subtitle = `Query: "${s.search_query}"`;
      if (s.filters && Object.keys(s.filters).length > 0) {
        const filterStr = Object.entries(s.filters)
          .filter(([_, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => `${k}: ${v}`)
          .join(" | ");
        if (filterStr) {
          subtitle += ` (${filterStr})`;
        }
      }

      activities.push({
        id: `search-${s.history_id}`,
        type: "search",
        action: actionLabel,
        title: s.search_query ? `Searched for "${s.search_query}"` : "Explored search catalog",
        subtitle,
        timestamp: s.searched_at,
        icon,
        iconClass,
      });
    }

    // B. Audit Logs (Logins, Content Views, User Activity)
    for (const log of this.rawAuditLogs) {
      let icon = "history";
      let iconClass = "activity-icon--audit";
      let action = log.action || "User Action";

      if (action.includes("VIEW") || action.includes("READ")) {
        icon = "visibility";
        iconClass = "activity-icon--view";
        action = "Viewed Details";
      } else if (action.includes("LOGIN") || action.includes("AUTH")) {
        icon = "login";
        iconClass = "activity-icon--audit";
        action = "Account Session";
      }

      activities.push({
        id: `audit-${log.audit_id}`,
        type: "audit",
        action,
        title: log.description || log.action || "Platform action logged",
        subtitle: log.entity_type
          ? `${log.entity_type} #${log.entity_id || ""} ${log.ip_address ? "• IP: " + log.ip_address : ""}`
          : log.ip_address
          ? `IP: ${log.ip_address}`
          : undefined,
        timestamp: log.created_at,
        icon,
        iconClass,
      });
    }

    // C. Creator Events (Government and Admin only)
    if (this.user && this.isCreatorRole(this.user.role)) {
      for (const p of this.userPolicies) {
        if (p.created_at) {
          activities.push({
            id: `policy-create-${p.policy_id}`,
            type: "policy",
            action: "Created Policy",
            title: p.title,
            subtitle: p.category ? `Category: ${p.category} | Status: ${p.status}` : `Status: ${p.status}`,
            timestamp: p.created_at,
            icon: "post_add",
            iconClass: "activity-icon--create",
          });
        }

        if (p.approved_by === this.userId && p.updated_at) {
          activities.push({
            id: `policy-approve-${p.policy_id}`,
            type: "policy",
            action: "Approved Policy",
            title: p.title,
            subtitle: "Policy verified and approved",
            timestamp: p.updated_at,
            icon: "verified",
            iconClass: "activity-icon--approve",
          });
        }

        if (p.archive_requested_by === this.userId && p.archive_requested_at) {
          activities.push({
            id: `policy-archive-${p.policy_id}`,
            type: "policy",
            action: "Requested Policy Archive",
            title: p.title,
            subtitle: p.archive_reason ? `Reason: ${p.archive_reason}` : "Archive requested",
            timestamp: p.archive_requested_at,
            icon: "inventory_2",
            iconClass: "activity-icon--archive",
          });
        }

        if (p.delete_requested_by === this.userId && p.delete_requested_at) {
          activities.push({
            id: `policy-delete-${p.policy_id}`,
            type: "policy",
            action: "Requested Policy Deletion",
            title: p.title,
            subtitle: p.delete_reason ? `Reason: ${p.delete_reason}` : "Deletion requested",
            timestamp: p.delete_requested_at,
            icon: "delete_outline",
            iconClass: "activity-icon--delete",
          });
        }
      }

      for (const s of this.userSchemes) {
        if (s.created_at) {
          activities.push({
            id: `scheme-create-${s.scheme_id}`,
            type: "scheme",
            action: "Created Scheme",
            title: s.name,
            subtitle: s.category ? `Category: ${s.category} | Status: ${s.status}` : `Status: ${s.status}`,
            timestamp: s.created_at,
            icon: "article",
            iconClass: "activity-icon--create",
          });
        }

        if (s.approved_by === this.userId && s.updated_at) {
          activities.push({
            id: `scheme-approve-${s.scheme_id}`,
            type: "scheme",
            action: "Approved Scheme",
            title: s.name,
            subtitle: "Scheme verified and approved",
            timestamp: s.updated_at,
            icon: "verified",
            iconClass: "activity-icon--approve",
          });
        }

        if (s.archive_requested_by === this.userId && s.archive_requested_at) {
          activities.push({
            id: `scheme-archive-${s.scheme_id}`,
            type: "scheme",
            action: "Requested Scheme Archive",
            title: s.name,
            subtitle: s.archive_reason ? `Reason: ${s.archive_reason}` : "Archive requested",
            timestamp: s.archive_requested_at,
            icon: "inventory_2",
            iconClass: "activity-icon--archive",
          });
        }

        if (s.delete_requested_by === this.userId && s.delete_requested_at) {
          activities.push({
            id: `scheme-delete-${s.scheme_id}`,
            type: "scheme",
            action: "Requested Scheme Deletion",
            title: s.name,
            subtitle: s.delete_reason ? `Reason: ${s.delete_reason}` : "Deletion requested",
            timestamp: s.delete_requested_at,
            icon: "delete_outline",
            iconClass: "activity-icon--delete",
          });
        }
      }
    }

    // Sort by timestamp descending
    activities.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });

    this.userActivities = activities;
  }

  // =======================================================
  // MAPPER
  // =======================================================

  private mapUserProfile(apiUser: AdminUserApi): UserProfileView {
    return {
      id: apiUser.user_id,
      fullName: apiUser.full_name || "Unknown User",
      email: apiUser.email || "No email",
      phone: apiUser.phone || "Not available",
      role: this.normalizeRole(apiUser.role),
      state: apiUser.state || "Not available",
      district: apiUser.district || "Not available",
      occupation: apiUser.occupation || "Not available",
      organization: apiUser.organization || "Not available",
      status: apiUser.is_active ? "Active" : "Inactive",
      joinedDate: this.formatDate(apiUser.created_at),
      updatedDate: this.formatDate(apiUser.updated_at),
    };
  }

  private normalizeRole(role: string): UserRole {
    const cleaned = (role || "").trim().toUpperCase();
    if (cleaned === "ADMIN" || cleaned === "ADMINISTRATOR") {
      return "ADMINISTRATOR";
    }
    if (cleaned === "GOVERNMENT" || cleaned === "GOVERNMENT_OFFICIAL") {
      return "GOVERNMENT_OFFICIAL";
    }
    if (cleaned === "ORGANIZATION" || cleaned === "ORGANISATION") {
      return "ORGANIZATION";
    }
    if (cleaned === "RESEARCHER") {
      return "RESEARCHER";
    }
    return "CITIZEN";
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) {
      return "Not available";
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return dateString;
    }
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }

  formatDateTime(dateString: string | null | undefined): string {
    if (!dateString) {
      return "-";
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return dateString;
    }
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // =======================================================
  // STATS (DERIVED FROM REAL DATA ONLY)
  // =======================================================

  get approvedCount(): number {
    const approvedPolicies = this.userPolicies.filter((p) => p.status === "APPROVED").length;
    const approvedSchemes = this.userSchemes.filter((s) => s.status === "APPROVED").length;
    return approvedPolicies + approvedSchemes;
  }

  get pendingCount(): number {
    const pendingPolicies = this.userPolicies.filter((p) => p.status === "PENDING_APPROVAL").length;
    const pendingSchemes = this.userSchemes.filter((s) => s.status === "PENDING_APPROVAL").length;
    return pendingPolicies + pendingSchemes;
  }

  get policySearchesCount(): number {
    return this.userSearches.filter((s) => (s.search_type || "").toUpperCase() === "POLICY").length;
  }

  get schemeSearchesCount(): number {
    return this.userSearches.filter((s) => (s.search_type || "").toUpperCase() === "SCHEME").length;
  }

  // =======================================================
  // NAVIGATION & TABS
  // =======================================================

  goToDashboard(): void {
    this.router.navigate(["/dashboard/admin"]);
  }

  goToViewUsers(): void {
    this.router.navigate(["/dashboard/admin/users"]);
  }

  viewPolicyDetails(policyId: number): void {
    this.router.navigate(["/dashboard/admin/policies", policyId]);
  }

  viewSchemeDetails(schemeId: number): void {
    this.router.navigate(["/dashboard/admin/schemes", schemeId]);
  }

  setTab(tab: "overview" | "policies" | "schemes" | "activity" | "searches"): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  // =======================================================
  // STYLING HELPERS
  // =======================================================

  getRoleLabel(role: UserRole): string {
    switch (role) {
      case "CITIZEN":
        return "Citizen";
      case "RESEARCHER":
        return "Researcher";
      case "ORGANIZATION":
        return "Organization";
      case "GOVERNMENT_OFFICIAL":
        return "Government Official";
      case "ADMINISTRATOR":
        return "Administrator";
      default:
        return role;
    }
  }

  getRoleIcon(role: UserRole): string {
    switch (role) {
      case "CITIZEN":
        return "person";
      case "RESEARCHER":
        return "science";
      case "ORGANIZATION":
        return "business";
      case "GOVERNMENT_OFFICIAL":
        return "account_balance";
      case "ADMINISTRATOR":
        return "admin_panel_settings";
      default:
        return "person";
    }
  }

  getRoleClass(role: UserRole): string {
    switch (role) {
      case "CITIZEN":
        return "user-role--citizen";
      case "RESEARCHER":
        return "user-role--researcher";
      case "ORGANIZATION":
        return "user-role--organization";
      case "GOVERNMENT_OFFICIAL":
        return "user-role--government";
      case "ADMINISTRATOR":
        return "user-role--administrator";
      default:
        return "";
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case "APPROVED":
        return "item-status--approved";
      case "PENDING_APPROVAL":
        return "item-status--pending";
      case "DRAFT":
        return "item-status--draft";
      case "REJECTED":
        return "item-status--rejected";
      case "ARCHIVED":
      case "ARCHIVE_REQUESTED":
        return "item-status--archived";
      case "DELETE_REQUESTED":
        return "item-status--deleted";
      default:
        return "";
    }
  }

  formatStatusLabel(status: string): string {
    return status ? status.replace(/_/g, " ") : "-";
  }

  formatSearchFilters(filters: Record<string, any> | null): string {
    if (!filters || Object.keys(filters).length === 0) {
      return "None";
    }
    return Object.entries(filters)
      .filter(([_, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ") || "None";
  }
}
