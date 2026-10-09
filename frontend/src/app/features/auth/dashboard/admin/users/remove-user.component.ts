import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { HttpErrorResponse } from "@angular/common/http";
import {
  AdminUsersService,
  AdminUserApi,
} from "../../../../../core/services/admin-user.service";
import { Auth, AuthUser } from "../../../../../core/services/auth";
import { ToastService } from "../../../../../core/services/toast.service";
import { SearchableSelectComponent } from "../../../../../shared/components/searchable-select/searchable-select.component";

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
  imports: [CommonModule, FormsModule, SearchableSelectComponent],
  templateUrl: "./remove-user.component.html",
  styleUrls: ["./remove-user.component.scss"],
})
export class RemoveUserComponent implements OnInit {
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
  deleteError = "";

  constructor(
    private router: Router,
    private adminUsersService: AdminUsersService,
    private authService: Auth,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getStoredUser();
    this.loadUsers();
  }

  // =======================================================
  // LOAD USERS
  // =======================================================

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
  // MODAL ACTIONS
  // =======================================================

  openRemoveModal(user: AdminUser): void {
    if (this.isSelf(user)) {
      this.toastService.warning(
        "Action Restricted",
        "You cannot remove your own administrator account."
      );
      return;
    }

    this.selectedUser = user;
    this.deleteError = "";
    this.isDeleting = false;
    this.isModalOpen = true;
  }

  closeModal(): void {
    if (this.isDeleting) {
      return;
    }
    this.isModalOpen = false;
    this.selectedUser = null;
    this.deleteError = "";
  }

  confirmRemoval(): void {
    if (!this.selectedUser || this.isDeleting) {
      return;
    }

    const userToRemove = this.selectedUser;
    this.isDeleting = true;
    this.deleteError = "";

    this.adminUsersService.deleteUser(userToRemove.email).subscribe({
      next: (response) => {
        this.isDeleting = false;
        this.isModalOpen = false;
        this.selectedUser = null;
        this.deleteError = "";

        this.toastService.success(
          "User Removed",
          response?.message || `User ${userToRemove.fullName} has been permanently removed.`
        );

        this.loadUsers();
      },
      error: (error: HttpErrorResponse) => {
        console.error("User removal error:", error);
        this.isDeleting = false;

        const errorMsg =
          error?.error?.detail ||
          error?.message ||
          "Failed to remove user. The account may have associated records in the system.";

        this.deleteError = errorMsg;
        this.toastService.error("Removal Failed", errorMsg);
        this.cdr.detectChanges();
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

  goToDashboard(): void {
    this.router.navigate(["/dashboard/admin"]);
  }

  goToViewUsers(): void {
    this.router.navigate(["/dashboard/admin/users"]);
  }
}
