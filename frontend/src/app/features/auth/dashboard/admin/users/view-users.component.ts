import { ChangeDetectorRef, Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { HttpErrorResponse } from "@angular/common/http";

import {
  AdminUsersService,
  AdminUserApi,
} from "../../../../../core/services/admin-user.service";
import { visiblePageWindow } from "../../../../../core/utils/pagination.util";
import { SearchableSelectComponent } from "../../../../../shared/components/searchable-select/searchable-select.component";
import { NavigationContextService } from "../../../../../core/services/navigation-context.service";
import { BreadcrumbComponent, BreadcrumbItem } from "../../../../../shared/components/breadcrumb/breadcrumb.component";

/* =======================================================
   ALLOWED USER ROLES
   ======================================================= */

export type UserRole =
  | "CITIZEN"
  | "RESEARCHER"
  | "ORGANIZATION"
  | "GOVERNMENT_OFFICIAL"
  | "ADMINISTRATOR";

/* =======================================================
   ADMIN USER MODEL
   ======================================================= */

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

/* =======================================================
   VIEW USERS COMPONENT
   ======================================================= */

@Component({
  selector: "app-view-users",
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent, BreadcrumbComponent],
  templateUrl: "./view-users.component.html",
  styleUrls: ["./view-users.component.scss"],
})
export class ViewUsersComponent implements OnInit {
  /* =======================================================
     SEARCH / FILTERS
     ======================================================= */

  searchText = "";
  selectedRole = "ALL";
  selectedStatus = "ALL";

  readonly roleFilterOptions = [
    { value: "ALL", label: "All Roles" },
    { value: "ADMINISTRATOR", label: "Administrator" },
    { value: "GOVERNMENT_OFFICIAL", label: "Government Official" },
    { value: "CITIZEN", label: "Citizen" },
    { value: "RESEARCHER", label: "Researcher" },
    { value: "ORGANIZATION", label: "Organization" },
  ];

  readonly statusFilterOptions = [
    { value: "ALL", label: "All Status" },
    { value: "Active", label: "Active" },
    { value: "Inactive", label: "Inactive" },
  ];

  /* =======================================================
     PAGINATION
     ======================================================= */

  currentPage = 1;
  pageSize = 5;

  /* =======================================================
     USERS
     ======================================================= */

  users: AdminUser[] = [];

  /*
   * Total number of users loaded from the backend.
   *
   * This is intentionally separate from filteredUsers.length.
   *
   * Example:
   * Backend has 7 users.
   * Search/filter shows only 3.
   *
   * Total Users will still show 7.
   */
  totalUsers = 0;

  /* =======================================================
     LOADING / ERROR
     ======================================================= */

  isLoading = true;
  loadError = "";

  /* =======================================================
     CONSTRUCTOR
     ======================================================= */

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly adminUsersService = inject(AdminUsersService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly navContext = inject(NavigationContextService);

  constructor() {}

  /* =======================================================
     INITIALIZATION
     ======================================================= */

  ngOnInit(): void {
    /*
     * If the user opened the remove section,
     * redirect to the remove-user page.
     */
    if (this.route.snapshot.queryParams["section"] === "remove") {
      this.router.navigate(["/dashboard/admin/users/remove"]);

      return;
    }

    this.loadUsers();
  }

  /* =======================================================
     LOAD USERS FROM BACKEND
     ======================================================= */

  loadUsers(): void {
    this.isLoading = true;
    this.loadError = "";

    this.adminUsersService.getUsers().subscribe({
      next: (backendUsers: AdminUserApi[]) => {
        console.log("PolicyGPT users received from backend:", backendUsers);

        /*
         * Convert backend users into our AdminUser model.
         *
         * Users with roles outside the five allowed roles
         * are ignored by mapBackendUser().
         */
        this.users = Array.isArray(backendUsers)
          ? backendUsers
              .map((user: AdminUserApi) => this.mapBackendUser(user))
              .filter((user): user is AdminUser => user !== null)
          : [];

        /*
         * TOTAL USERS
         *
         * This is the number of valid users loaded from
         * the backend.
         *
         * It does NOT change when search/filter is applied.
         */
        this.totalUsers = this.users.length;

        /*
         * Reset pagination after loading users.
         */
        this.currentPage = 1;

        this.isLoading = false;
        this.loadError = "";

        /*
         * Ensure UI updates immediately after HTTP response.
         */
        this.cdr.detectChanges();
      },

      error: (error: HttpErrorResponse) => {
        console.error("Unable to load users:", error);

        /*
         * Reset users and total count when loading fails.
         */
        this.users = [];
        this.totalUsers = 0;
        this.isLoading = false;

        if (error?.status === 401) {
          this.loadError = "Your session has expired. Please login again.";

          this.cdr.detectChanges();

          return;
        }

        if (error?.status === 403) {
          this.loadError = "Only an administrator can view users.";

          this.cdr.detectChanges();

          return;
        }

        this.loadError =
          error?.error?.detail || "Unable to load users from the server.";

        this.cdr.detectChanges();
      },
    });
  }

  /* =======================================================
     MAP BACKEND USER TO TABLE USER
     ======================================================= */

  private mapBackendUser(user: AdminUserApi): AdminUser | null {
    const role = this.normalizeRole(user.role);

    /*
     * Only these five roles are accepted:
     *
     * ADMINISTRATOR
     * GOVERNMENT_OFFICIAL
     * CITIZEN
     * RESEARCHER
     * ORGANIZATION
     *
     * Any other backend role is ignored.
     */
    if (!role) {
      return null;
    }

    return {
      id: user.user_id,
      fullName: user.full_name || "Unknown User",
      email: user.email || "-",
      phone: user.phone || "-",

      role,

      state: user.state || "-",
      district: user.district || "-",
      occupation: user.occupation || "-",
      organization: user.organization || "-",

      status: user.is_active ? "Active" : "Inactive",

      joinedDate: this.formatDate(user.created_at),
    };
  }

  /* =======================================================
     NORMALIZE ROLE
     ======================================================= */

  private normalizeRole(role: string): UserRole | null {
    const normalized = (role || "").trim().toUpperCase();

    switch (normalized) {
      /* CITIZEN */

      case "CITIZEN":
        return "CITIZEN";

      /* RESEARCHER */

      case "RESEARCHER":
        return "RESEARCHER";

      /* ORGANIZATION */

      case "ORGANIZATION":
      case "ORGANISATION":
        return "ORGANIZATION";

      /* GOVERNMENT OFFICIAL */

      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT OFFICER":
        return "GOVERNMENT_OFFICIAL";

      /* ADMINISTRATOR */

      case "ADMINISTRATOR":
      case "ADMIN":
        return "ADMINISTRATOR";

      /*
       * Any role not listed above is ignored.
       */
      default:
        return null;
    }
  }

  /* =======================================================
     FORMAT DATE
     ======================================================= */

  private formatDate(value: string): string {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  /* =======================================================
     FILTERED USERS
     ======================================================= */

  get filteredUsers(): AdminUser[] {
    const query = this.searchText.trim().toLowerCase();

    return this.users.filter((user) => {
      const matchesSearch =
        !query ||
        user.fullName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.phone.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query) ||
        this.getRoleLabel(user.role).toLowerCase().includes(query) ||
        user.state.toLowerCase().includes(query) ||
        user.district.toLowerCase().includes(query) ||
        user.organization.toLowerCase().includes(query) ||
        user.occupation.toLowerCase().includes(query);

      const matchesRole =
        this.selectedRole === "ALL" || user.role === this.selectedRole;

      const matchesStatus =
        this.selectedStatus === "ALL" || user.status === this.selectedStatus;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }

  /* =======================================================
     PAGINATED USERS
     ======================================================= */

  get paginatedUsers(): AdminUser[] {
    const start = (this.currentPage - 1) * this.pageSize;

    const end = start + this.pageSize;

    return this.filteredUsers.slice(start, end);
  }

  /* =======================================================
     TOTAL PAGES
     ======================================================= */

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  /* =======================================================
     DISPLAY END
     ======================================================= */

  get displayEnd(): number {
    return Math.min(
      this.currentPage * this.pageSize,
      this.filteredUsers.length,
    );
  }

  /* =======================================================
     PAGE NUMBERS
     ======================================================= */

  get pageNumbers(): number[] {
    return visiblePageWindow(this.currentPage, this.totalPages);
  }

  /* =======================================================
     USER COUNTS
     ======================================================= */

  get activeUsers(): number {
    return this.users.filter((user) => user.status === "Active").length;
  }

  get inactiveUsers(): number {
    return this.users.filter((user) => user.status === "Inactive").length;
  }

  /* =======================================================
     CITIZEN COUNT
     ======================================================= */

  get citizenUsers(): number {
    return this.users.filter((user) => user.role === "CITIZEN").length;
  }

  /* =======================================================
     RESEARCHER COUNT
     ======================================================= */

  get researcherUsers(): number {
    return this.users.filter((user) => user.role === "RESEARCHER").length;
  }

  /* =======================================================
     ORGANIZATION COUNT
     ======================================================= */

  get organizationUsers(): number {
    return this.users.filter((user) => user.role === "ORGANIZATION").length;
  }

  /* =======================================================
     GOVERNMENT OFFICIAL COUNT
     ======================================================= */

  get governmentUsers(): number {
    return this.users.filter((user) => user.role === "GOVERNMENT_OFFICIAL")
      .length;
  }

  /* =======================================================
     ADMINISTRATOR COUNT
     ======================================================= */

  get administratorUsers(): number {
    return this.users.filter((user) => user.role === "ADMINISTRATOR").length;
  }

  /* =======================================================
     SEARCH / FILTER CHANGE
     ======================================================= */

  applyFilters(): void {
    /*
     * Filtering should only affect the table.
     *
     * totalUsers remains unchanged.
     */
    this.currentPage = 1;
  }

  /* =======================================================
     CLEAR FILTERS
     ======================================================= */

  clearFilters(): void {
    this.searchText = "";
    this.selectedRole = "ALL";
    this.selectedStatus = "ALL";

    this.currentPage = 1;
  }

  /* =======================================================
     PAGE NAVIGATION
     ======================================================= */

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) {
      return;
    }

    this.currentPage = page;
  }

  /* =======================================================
     PREVIOUS PAGE
     ======================================================= */

  previousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  /* =======================================================
     NEXT PAGE
     ======================================================= */

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  /* =======================================================
     ROLE LABEL
     ======================================================= */

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

  /* =======================================================
     ROLE ICON
     ======================================================= */

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

  /* =======================================================
     ROLE CSS CLASS
     ======================================================= */

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

  /* =======================================================
     VIEW USER
     ======================================================= */

  viewUser(user: AdminUser): void {
    if (user?.id) {
      this.navContext.markActionSource();
      this.router.navigate(["/dashboard/admin/users", user.id]);
    }
  }

  /* =======================================================
     BREADCRUMB
     ======================================================= */

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: "Home", route: ["/dashboard/admin"] },
      { label: "View Users" },
    ];
  }

  /* =======================================================
     ADMIN DASHBOARD
     ======================================================= */

  goToDashboard(): void {
    this.router.navigate(["/dashboard/admin"]);
  }
}
