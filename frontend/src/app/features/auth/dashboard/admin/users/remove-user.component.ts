import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { HttpErrorResponse } from "@angular/common/http";
import { finalize, timeout } from "rxjs";
import {
  AdminUsersService,
  AdminUserApi,
  UserRemovalBlocker,
  EligibleOfficial,
  UserRemovalCheckResponse,
  ReassignOwnershipPayload,
} from "../../../../../core/services/admin-user.service";
import { Auth, AuthUser } from "../../../../../core/services/auth";
import { ToastService } from "../../../../../core/services/toast.service";
import { SearchableSelectComponent } from "../../../../../shared/components/searchable-select/searchable-select.component";
import { BreadcrumbComponent, BreadcrumbItem } from "../../../../../shared/components/breadcrumb/breadcrumb.component";

export type UserRole =
  | "CITIZEN"
  | "RESEARCHER"
  | "ORGANIZATION"
  | "GOVERNMENT_OFFICIAL"
  | "ADMINISTRATOR";

export interface AdminUser {
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
}

@Component({
  selector: "app-remove-user",
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent, BreadcrumbComponent],
  templateUrl: "./remove-user.component.html",
  styleUrls: ["./remove-user.component.scss"],
})
export class RemoveUserComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly adminUsersService = inject(AdminUsersService);
  private readonly authService = inject(Auth);
  private readonly toastService = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  searchText = "";
  selectedRole = "ALL";
  selectedStatus = "ALL";

  readonly roleFilterOptions = [
    { value: "ALL", label: "All Roles" },
    { value: "CITIZEN", label: "Citizen" },
    { value: "RESEARCHER", label: "Researcher" },
    { value: "ORGANIZATION", label: "Organization" },
    { value: "GOVERNMENT_OFFICIAL", label: "Government Official" },
    { value: "ADMINISTRATOR", label: "Administrator" },
  ];

  readonly statusFilterOptions = [
    { value: "ALL", label: "All Status" },
    { value: "Active", label: "Active" },
    { value: "Inactive", label: "Inactive" },
  ];

  currentPage = 1;
  pageSize = 6;

  users: AdminUser[] = [];
  currentUser: AuthUser | null = null;

  isLoading = true;
  loadError = "";

  // Deletion modal state
  isModalOpen = false;
  selectedUser: AdminUser | null = null;
  isDeleting = false;
  isRemoving = false;
  deleteError = "";

  // Ownership resolution and blockers state
  isCheckingDependencies = false;
  blockers: UserRemovalBlocker[] = [];
  eligibleOfficials: EligibleOfficial[] = [];
  selectedTargetOfficialId: number | null = null;
  reassignConfirmed = false;
  isReassigning = false;
  reassignSuccessMessage = "";
  canRemoveDirectly = true;

  // Statistics
  pastUsersCount = 0;

  constructor() {}

  ngOnInit(): void {
    this.currentUser = this.authService.getStoredUser();
    this.loadUsers();
    this.loadPastUsersCount();
  }

  // =======================================================
  // LOAD USERS & PAST USERS STATS
  // =======================================================

  loadPastUsersCount(): void {
    if (typeof this.adminUsersService?.getPastUsersCount !== "function") {
      return;
    }
    this.adminUsersService.getPastUsersCount().subscribe({
      next: (stats) => {
        this.pastUsersCount = stats?.past_users ?? 0;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        console.warn("Unable to load past users count:", error);
      },
    });
  }

  loadUsers(): void {
    this.isLoading = true;
    this.loadError = "";

    this.adminUsersService.getUsers().subscribe({
      next: (backendUsers: AdminUserApi[]) => {
        this.users = Array.isArray(backendUsers)
          ? backendUsers.map((user: AdminUserApi) => this.mapBackendUser(user))
          : [];

        this.currentPage = 1;
        this.isLoading = false;
        this.loadError = "";
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        console.error("Unable to load users:", error);
        this.users = [];
        this.isLoading = false;

        if (error?.status === 401) {
          this.loadError = "Your session has expired. Please login again.";
          return;
        }

        if (error?.status === 403) {
          this.loadError = "Only an administrator can access this page.";
          return;
        }

        this.loadError =
          error?.error?.detail ||
          error?.message ||
          "Unable to load users from the server. Please check your backend connection.";
        this.cdr.detectChanges();
      },
    });
  }

  // =======================================================
  // MAP BACKEND USER TO FRONTEND MODEL
  // =======================================================

  private mapBackendUser(backendUser: AdminUserApi): AdminUser {
    return {
      id: backendUser.user_id,
      fullName: backendUser.full_name || "Unknown User",
      email: backendUser.email || "No email",
      phone: backendUser.phone || "Not available",
      role: this.normalizeRole(backendUser.role),
      state: backendUser.state || "Not available",
      district: backendUser.district || "Not available",
      occupation: backendUser.occupation || "Not available",
      organization: backendUser.organization || "Not available",
      status: backendUser.is_active ? "Active" : "Inactive",
      joinedDate: this.formatDate(backendUser.created_at),
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

  private formatDate(dateString: string | null): string {
    if (!dateString) {
      return "Not available";
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }

  // =======================================================
  // FILTERING & PAGINATION
  // =======================================================

  get filteredUsers(): AdminUser[] {
    const query = this.searchText.trim().toLowerCase();

    return this.users.filter((user) => {
      const matchesSearch =
        !query ||
        user.fullName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.phone.toLowerCase().includes(query) ||
        user.state.toLowerCase().includes(query) ||
        user.district.toLowerCase().includes(query);

      const matchesRole =
        this.selectedRole === "ALL" || user.role === this.selectedRole;

      const matchesStatus =
        this.selectedStatus === "ALL" || user.status === this.selectedStatus;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get paginatedUsers(): AdminUser[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.filteredUsers.slice(startIndex, startIndex + this.pageSize);
  }

  get activeUsers(): number {
    return this.users.filter((u) => u.status === "Active").length;
  }

  get inactiveUsers(): number {
    return this.users.filter((u) => u.status === "Inactive").length;
  }

  get administratorUsers(): number {
    return this.users.filter((u) => u.role === "ADMINISTRATOR").length;
  }

  applyFilters(): void {
    this.currentPage = 1;
  }

  clearFilters(): void {
    this.searchText = "";
    this.selectedRole = "ALL";
    this.selectedStatus = "ALL";
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  previousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  // =======================================================
  // REMOVE SAFETY CHECKS
  // =======================================================

  isSelf(user: AdminUser): boolean {
    if (!this.currentUser) {
      return false;
    }
    const currentEmail = (this.currentUser.email || "").trim().toLowerCase();
    const userEmail = (user.email || "").trim().toLowerCase();
    const currentId = this.currentUser.user_id || (this.currentUser as any).id;
    return (currentEmail && currentEmail === userEmail) || (currentId && currentId === user.id);
  }

  // =======================================================
  // MODAL ACTIONS & OWNERSHIP RESOLUTION
  // =======================================================

  get reassignableBlockersCount(): number {
    return this.blockers.filter((b) => b.can_reassign).length;
  }

  get unreassignableBlockersCount(): number {
    return this.blockers.filter((b) => !b.can_reassign).length;
  }

  openRemoveModal(user: AdminUser): void {
    if (!user || !user.email) {
      this.toastService.error(
        "Invalid User",
        "Selected user does not have valid account details."
      );
      return;
    }

    if (this.isSelf(user)) {
      this.toastService.warning(
        "Action Restricted",
        "You cannot remove your own administrator account."
      );
      return;
    }

    this.selectedUser = user;
    this.deleteError = "";
    this.reassignSuccessMessage = "";
    this.blockers = [];
    this.eligibleOfficials = [];
    this.selectedTargetOfficialId = null;
    this.reassignConfirmed = false;
    this.isDeleting = false;
    this.isRemoving = false;
    this.isReassigning = false;
    this.canRemoveDirectly = true;
    this.isModalOpen = true;

    this.fetchRemovalCheck(user.email);
  }

  fetchRemovalCheck(email: string): void {
    if (this.isCheckingDependencies) {
      return;
    }
    this.isCheckingDependencies = true;
    this.adminUsersService
      .checkUserRemoval(email)
      .pipe(
        timeout(15000),
        finalize(() => {
          this.isCheckingDependencies = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res: UserRemovalCheckResponse) => {
          this.blockers = Array.isArray(res.blockers) ? res.blockers : [];
          this.eligibleOfficials = Array.isArray(res.eligible_officials)
            ? res.eligible_officials
            : [];
          this.canRemoveDirectly = Boolean(res.can_remove);

          if (this.eligibleOfficials.length > 0 && !this.selectedTargetOfficialId) {
            this.selectedTargetOfficialId = this.eligibleOfficials[0].user_id;
          }

          if (res.self_removal) {
            this.deleteError =
              res.message || "You cannot remove your own administrator account.";
            this.canRemoveDirectly = false;
          }
          this.cdr.detectChanges();
        },
        error: (error: HttpErrorResponse | any) => {
          console.warn("Unable to check user removal dependencies:", error);
          if (error?.name === "TimeoutError") {
            this.deleteError = "Dependency check timed out. Please retry.";
          }
          this.cdr.detectChanges();
        },
      });
  }

  reassignOwnershipAction(): void {
    if (
      !this.selectedUser ||
      !this.selectedTargetOfficialId ||
      !this.reassignConfirmed ||
      this.isReassigning ||
      this.isDeleting ||
      this.isRemoving
    ) {
      return;
    }

    this.isReassigning = true;
    this.deleteError = "";
    this.reassignSuccessMessage = "";

    const payload: ReassignOwnershipPayload = {
      source_user_email: this.selectedUser.email,
      target_user_id: Number(this.selectedTargetOfficialId),
      confirm: true,
    };

    this.adminUsersService
      .reassignOwnership(payload)
      .pipe(
        timeout(15000),
        finalize(() => {
          this.isReassigning = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res) => {
          this.reassignSuccessMessage =
            res?.message ||
            "Ownership successfully reassigned to the selected Government Official.";
          this.deleteError = "";
          this.reassignConfirmed = false;
          this.cdr.detectChanges();
          // Step 5: System rechecks the database before allowing removal
          if (this.selectedUser?.email) {
            this.fetchRemovalCheck(this.selectedUser.email);
          }
        },
        error: (error: HttpErrorResponse | any) => {
          console.error("Reassignment error:", error);
          if (error?.name === "TimeoutError") {
            this.deleteError =
              "Operation timed out. Reconciling ownership status from database...";
            if (this.selectedUser?.email) {
              this.fetchRemovalCheck(this.selectedUser.email);
            }
          } else {
            this.deleteError =
              error?.error?.detail ||
              error?.message ||
              "Failed to reassign ownership. Please check permissions and try again.";
          }
          this.cdr.detectChanges();
        },
      });
  }

  closeModal(): void {
    if (this.isDeleting || this.isRemoving || this.isReassigning) {
      return;
    }
    this.isModalOpen = false;
    this.selectedUser = null;
    this.deleteError = "";
    this.reassignSuccessMessage = "";
    this.blockers = [];
    this.eligibleOfficials = [];
    this.selectedTargetOfficialId = null;
    this.reassignConfirmed = false;
    this.isCheckingDependencies = false;
    this.isDeleting = false;
    this.isRemoving = false;
  }

  confirmRemoval(): void {
    if (
      !this.selectedUser ||
      !this.selectedUser.email ||
      this.isDeleting ||
      this.isRemoving ||
      this.isReassigning ||
      this.isCheckingDependencies
    ) {
      return;
    }

    const userToRemove = this.selectedUser;
    this.isDeleting = true;
    this.isRemoving = true;
    this.deleteError = "";

    this.adminUsersService
      .deleteUser(userToRemove.email)
      .pipe(
        timeout(15000),
        finalize(() => {
          this.isDeleting = false;
          this.isRemoving = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (_response) => {
          // Immediately close the Remove User dialog and clear loading state
          this.isModalOpen = false;
          this.selectedUser = null;
          this.isDeleting = false;
          this.isRemoving = false;
          this.deleteError = "";
          this.reassignSuccessMessage = "";
          this.cdr.detectChanges();

          // Show exactly one success toast: "User removed successfully."
          this.toastService.success("User removed successfully.");

          // Optimistically update list and past users count so stats cards update immediately
          this.users = this.users.filter(
            (u) =>
              (u.email || "").toLowerCase() !==
              (userToRemove.email || "").toLowerCase()
          );
          this.pastUsersCount = (this.pastUsersCount || 0) + 1;
          this.cdr.detectChanges();

          // Background sync to ensure data consistency without full-page reload or blocking
          this.syncUsersInBackground();
          this.loadPastUsersCount();
        },
        error: (error: HttpErrorResponse | any) => {
          console.error("User removal error:", error);
          this.isDeleting = false;
          this.isRemoving = false;

          let errorMsg =
            "Failed to remove user. The account may have associated records in the system.";

          if (error?.name === "TimeoutError") {
            errorMsg = "User removal timed out. Reconciling user list...";
            this.syncUsersInBackground();
            this.loadPastUsersCount();
          } else if (error?.status === 0) {
            errorMsg =
              "Unable to connect to the server. Please check your backend connection.";
          } else if (error?.status === 401) {
            errorMsg = "Your session has expired. Please login again.";
          } else if (error?.status === 403) {
            errorMsg = "Only an administrator can perform user removal.";
          } else if (error?.status === 404) {
            errorMsg =
              error?.error?.detail ||
              "User not found. The account may have already been removed.";
          } else if (error?.error?.detail && typeof error.error.detail === "string") {
            errorMsg = error.error.detail;
          } else if (typeof error?.error === "string" && error.error.trim()) {
            errorMsg = error.error;
          }

          this.deleteError = errorMsg;
          this.cdr.detectChanges();
        },
      });
  }

  syncUsersInBackground(): void {
    this.adminUsersService.getUsers().subscribe({
      next: (backendUsers: AdminUserApi[]) => {
        this.users = Array.isArray(backendUsers)
          ? backendUsers.map((user: AdminUserApi) => this.mapBackendUser(user))
          : [];
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        console.warn("Background users sync failed:", error);
      },
    });
  }

  // =======================================================
  // STYLING HELPERS
  // =======================================================

  getRoleLabel(role: AdminUser["role"]): string {
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

  getRoleIcon(role: AdminUser["role"]): string {
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

  getRoleClass(role: AdminUser["role"]): string {
    switch (role) {
      case "CITIZEN":
        return "users-role--citizen";
      case "RESEARCHER":
        return "users-role--researcher";
      case "ORGANIZATION":
        return "users-role--organization";
      case "GOVERNMENT_OFFICIAL":
        return "users-role--government";
      case "ADMINISTRATOR":
        return "users-role--administrator";
      default:
        return "";
    }
  }

  // =======================================================
  // BREADCRUMB
  // =======================================================

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: "Home", route: ["/dashboard/admin"] },
      { label: "Users", route: ["/dashboard/admin/users"] },
      { label: "Remove User" },
    ];
  }

  goToDashboard(): void {
    this.router.navigate(["/dashboard/admin"]);
  }

  goToViewUsers(): void {
    this.router.navigate(["/dashboard/admin/users"]);
  }
}
