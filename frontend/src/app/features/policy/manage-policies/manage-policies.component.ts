import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { PolicyService } from "../../../core/services/policy.service";
import { Auth } from "../../../core/services/auth";
import {
  PolicyResponse,
  PolicyListResponse,
  PolicyStatus,
} from "../../../core/models/policy.model";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { ReasonModalComponent } from "../../../shared/components/reason-modal/reason-modal.component";

export interface PolicyTableItem {
  id: number;
  title: string;
  description: string;
  category: string;
  ministry: string;
  department: string;
  state: string;
  sector: string;
  status: string;
  publicationDate: string;
  createdBy?: number | null;
  rejectionReason?: string;
  archiveReason?: string;
  deleteReason?: string;
}

@Component({
  selector: "app-manage-policies",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ConfirmModalComponent,
    ReasonModalComponent,
  ],
  templateUrl: "./manage-policies.component.html",
  styleUrls: ["./manage-policies.component.scss"],
})
export class ManagePoliciesComponent implements OnInit {
  constructor(
    private readonly policyService: PolicyService,
    private readonly router: Router,
    private readonly auth: Auth,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  searchText = "";
  selectedCategory = "";
  selectedMinistry = "";
  selectedDepartment = "";
  selectedState = "";
  selectedSector = "";
  selectedStatus = "";
  fromDate = "";
  toDate = "";

  currentPage = 1;
  pageSize = 6;
  menuOpenId: number | null = null;
  userRole: string | null = null;
  loading = false;
  errorMessage = "";
  successToastMessage: string | null = null;

  // Real backend analytics statistics
  stats = {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    archived: 0,
  };

  // Modals state
  confirmModalOpen = false;
  confirmTitle = "";
  confirmMessage = "";
  confirmVariant: "primary" | "danger" | "warning" | "success" = "primary";
  confirmAction: (() => void) | null = null;

  reasonModalOpen = false;
  reasonTitle = "";
  reasonMessage = "";
  reasonLabel = "Reason";
  reasonVariant: "primary" | "danger" | "warning" = "danger";
  reasonAction: ((reason: string) => void) | null = null;

  categories = [
    "Education",
    "Technology",
    "Health",
    "Environment",
    "Agriculture",
    "Urban Development",
    "Employment",
    "Finance",
    "Infrastructure",
    "Social Welfare",
  ];
  ministries = [
    "Ministry of Education",
    "Ministry of Electronics & IT",
    "Ministry of Health & Family Welfare",
    "Ministry of New & Renewable Energy",
    "Ministry of Agriculture",
    "Ministry of Housing & Urban Affairs",
    "Ministry of Labour & Employment",
    "Ministry of Finance",
  ];
  departments = [
    "Department of School Education",
    "Department of Higher Education",
    "Department of Health",
    "Department of Electronics & IT",
    "Department of Agriculture",
    "Department of Renewable Energy",
    "Department of Urban Development",
    "Department of Economic Affairs",
  ];
  states = [
    "All India",
    "Andhra Pradesh",
    "Assam",
    "Bihar",
    "Delhi",
    "Gujarat",
    "Haryana",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
    "Uttar Pradesh",
    "West Bengal",
  ];
  sectors = [
    "Agriculture",
    "Education",
    "Healthcare",
    "Information Technology",
    "Infrastructure",
    "Finance",
    "Employment",
    "Social Welfare",
    "Environment",
  ];
  statuses = [
    "APPROVED",
    "PENDING_APPROVAL",
    "DRAFT",
    "REJECTED",
    "ARCHIVED",
    "ARCHIVE_REQUESTED",
    "DELETE_REQUESTED",
  ];

  policies: PolicyTableItem[] = [];

  get isAdmin(): boolean {
    return this.userRole === "ADMIN";
  }
  get rolePrefix(): string {
    return this.isAdmin ? "admin" : "government";
  }

  ngOnInit(): void {
    const rawRole = String(this.auth.getUserRole() || "")
      .trim()
      .toUpperCase();

    this.userRole =
      rawRole === "ADMINISTRATOR" || rawRole === "ADMIN"
        ? "ADMIN"
        : rawRole === "GOVERNMENT_OFFICIAL" || rawRole === "GOVERNMENT OFFICIAL" || rawRole === "GOVERNMENT"
          ? "GOVERNMENT_OFFICIAL"
          : rawRole || null;

    this.loadPolicies();
  }

  showSuccessToast(message: string): void {
    this.successToastMessage = message;
    this.cdr.detectChanges();
    window.setTimeout(() => {
      this.successToastMessage = null;
      this.cdr.detectChanges();
    }, 3500);
  }

  loadPolicies(): void {
    this.loading = true;
    this.errorMessage = "";
    this.cdr.detectChanges();

    this.policyService.clearCache();

    this.policyService.getPolicies({ page: 1, limit: 100, manage: true }).subscribe({
      next: (response: PolicyListResponse) => {
        const currentUser = this.auth.getStoredUser();
        const currentUserId = currentUser?.user_id;

        let source = Array.isArray(response?.policies)
          ? response.policies
          : [];

        // Role-based creator filtering rule:
        // Admin: sees ALL policies.
        // Government Official: sees ONLY policies created by the authenticated Government Official.
        if (!this.isAdmin && currentUserId) {
          source = source.filter((policy: PolicyResponse) => policy.created_by === currentUserId);
        }

        this.policies = source.map((policy: PolicyResponse) => ({
          id: Number(policy.policy_id),
          title: policy.title || "Untitled policy",
          description: policy.description || "",
          category: policy.category || "",
          ministry: policy.ministry || "",
          department: policy.department || "",
          state: policy.state || "",
          sector: policy.sector || "",
          status: String(policy.status || "DRAFT").toUpperCase(),
          publicationDate: policy.publication_date
            ? this.formatDate(policy.publication_date)
            : "-",
          createdBy: policy.created_by,
          rejectionReason: policy.rejection_reason || undefined,
          archiveReason: policy.archive_reason || undefined,
          deleteReason: policy.delete_reason || undefined,
        }));
        this.currentPage = Math.min(this.currentPage, this.totalPages);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error("Failed to load policies:", error);
        this.policies = [];
        this.errorMessage = this.getErrorMessage(error);
        this.loading = false;
        this.cdr.detectChanges();
      },
    });

    this.loadStats();
  }

  loadStats(): void {
    this.policyService.getPolicyStatistics().subscribe({
      next: (res) => {
        this.stats = {
          total: res.total ?? res.total_policies ?? 0,
          approved: res.approved ?? res.by_status?.["APPROVED"] ?? 0,
          pending: res.pending ?? res.by_status?.["PENDING_APPROVAL"] ?? 0,
          rejected: res.rejected ?? res.by_status?.["REJECTED"] ?? 0,
          archived: res.archived ?? res.by_status?.["ARCHIVED"] ?? 0,
        };
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("Failed to fetch policy statistics:", err);
      },
    });
  }

  formatDate(date: string): string {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  get filteredPolicies(): PolicyTableItem[] {
    const search = this.searchText.toLowerCase().trim();
    return this.policies.filter((policy) => {
      const haystack = [
        policy.title,
        policy.description,
        policy.category,
        policy.ministry,
        policy.department,
        policy.state,
        policy.sector,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesCategory =
        !this.selectedCategory || policy.category === this.selectedCategory;
      const matchesMinistry =
        !this.selectedMinistry || policy.ministry === this.selectedMinistry;
      const matchesDepartment =
        !this.selectedDepartment ||
        policy.department === this.selectedDepartment;
      const matchesState =
        !this.selectedState || policy.state === this.selectedState;
      const matchesSector =
        !this.selectedSector || policy.sector === this.selectedSector;
      const matchesStatus =
        !this.selectedStatus || policy.status === this.selectedStatus;
      const policyDate = this.toDateOnly(policy.publicationDate);
      const matchesFrom =
        !this.fromDate || (policyDate !== null && policyDate >= this.fromDate);
      const matchesTo =
        !this.toDate || (policyDate !== null && policyDate <= this.toDate);
      return (
        matchesSearch &&
        matchesCategory &&
        matchesMinistry &&
        matchesDepartment &&
        matchesState &&
        matchesSector &&
        matchesStatus &&
        matchesFrom &&
        matchesTo
      );
    });
  }

  private toDateOnly(value: string): string | null {
    if (!value || value === "-") return null;
    const parts = value.split("/");
    if (parts.length !== 3) return null;
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPolicies.length / this.pageSize));
  }
  get paginatedPolicies(): PolicyTableItem[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredPolicies.slice(start, start + this.pageSize);
  }
  get startItem(): number {
    return this.filteredPolicies.length
      ? (this.currentPage - 1) * this.pageSize + 1
      : 0;
  }
  get endItem(): number {
    return Math.min(
      this.currentPage * this.pageSize,
      this.filteredPolicies.length,
    );
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cdr.detectChanges();
    }
  }
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cdr.detectChanges();
    }
  }
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.cdr.detectChanges();
    }
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.closeMenu();
    this.cdr.detectChanges();
  }

  resetFilters(): void {
    this.searchText =
      this.selectedCategory =
      this.selectedMinistry =
      this.selectedDepartment =
        "";
    this.selectedState = this.selectedSector = this.selectedStatus = "";
    this.fromDate = this.toDate = "";
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  changePageSize(): void {
    this.currentPage = 1;
    this.cdr.detectChanges();
  }
  toggleMenu(id: number): void {
    this.menuOpenId = this.menuOpenId === id ? null : id;
    this.cdr.detectChanges();
  }
  closeMenu(): void {
    this.menuOpenId = null;
    this.cdr.detectChanges();
  }

  viewPolicy(policy: PolicyTableItem): void {
    this.router.navigate([
      "/dashboard",
      this.rolePrefix,
      "policies",
      policy.id,
    ]);
  }

  editPolicy(policy: PolicyTableItem): void {
    this.closeMenu();
    this.router.navigate([
      "/dashboard",
      this.rolePrefix,
      "policies",
      "edit",
      policy.id,
    ]);
  }

  addNewPolicy(): void {
    this.router.navigate(["/dashboard", this.rolePrefix, "policies", "add"]);
  }

  // ============================================================
  // WORKFLOW ACTION MODALS
  // ============================================================

  openSubmitModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Submit Policy";
    this.confirmMessage = `Submit "${policy.title}" for approval?`;
    this.confirmVariant = "primary";
    this.confirmAction = () => {
      this.policyService.submitPolicy(policy.id).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showSuccessToast("Policy submitted for approval.");
          this.loadPolicies();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Approve Policy";
    this.confirmMessage = `Are you sure you want to approve "${policy.title}"?`;
    this.confirmVariant = "success";
    this.confirmAction = () => {
      this.policyService.approvePolicy(policy.id).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showSuccessToast("Policy approved successfully.");
          this.loadPolicies();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.reasonTitle = "Reject Policy";
    this.reasonMessage = `Please enter a rejection reason for "${policy.title}".`;
    this.reasonLabel = "Rejection Reason";
    this.reasonVariant = "danger";
    this.reasonAction = (reason: string) => {
      this.policyService.rejectPolicy(policy.id, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.showSuccessToast("Policy rejected.");
          this.loadPolicies();
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openRequestArchiveModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.reasonTitle = "Request Policy Archive";
    this.reasonMessage = `Enter the reason for requesting archival of "${policy.title}".`;
    this.reasonLabel = "Archive Reason";
    this.reasonVariant = "warning";
    this.reasonAction = (reason: string) => {
      this.policyService.requestArchive(policy.id, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.showSuccessToast("Archive request submitted to Admin.");
          this.loadPolicies();
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveArchiveModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Approve Archive Request";
    this.confirmMessage = `Approve archival of "${policy.title}"? Status will become ARCHIVED.`;
    this.confirmVariant = "warning";
    this.confirmAction = () => {
      this.policyService.approveArchive(policy.id).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showSuccessToast("Policy archived successfully.");
          this.loadPolicies();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectArchiveModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Reject Archive Request";
    this.confirmMessage = `Reject archive request for "${policy.title}"? The policy will remain APPROVED.`;
    this.confirmVariant = "primary";
    this.confirmAction = () => {
      this.policyService.rejectArchive(policy.id).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showSuccessToast("Archive request rejected. Policy reverted to APPROVED.");
          this.loadPolicies();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRequestDeleteModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.reasonTitle = "Request Policy Deletion";
    this.reasonMessage = `Enter the reason for requesting deletion of "${policy.title}".`;
    this.reasonLabel = "Deletion Reason";
    this.reasonVariant = "danger";
    this.reasonAction = (reason: string) => {
      this.policyService.requestDelete(policy.id, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.showSuccessToast("Delete request submitted to Admin.");
          this.loadPolicies();
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveDeleteModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Approve Permanent Deletion";
    this.confirmMessage = `Permanently delete "${policy.title}"? This cannot be undone.`;
    this.confirmVariant = "danger";
    this.confirmAction = () => {
      this.policyService.approveDelete(policy.id).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showSuccessToast("Policy permanently deleted.");
          this.loadPolicies();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectDeleteModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Reject Delete Request";
    this.confirmMessage = `Reject delete request for "${policy.title}"? The policy will revert to its previous status.`;
    this.confirmVariant = "primary";
    this.confirmAction = () => {
      this.policyService.rejectDelete(policy.id).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showSuccessToast("Delete request rejected.");
          this.loadPolicies();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRestoreModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Restore Policy";
    this.confirmMessage = `Restore "${policy.title}" back to APPROVED state?`;
    this.confirmVariant = "success";
    this.confirmAction = () => {
      this.policyService.restore(policy.id).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showSuccessToast("Policy restored to APPROVED.");
          this.loadPolicies();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openDirectDeleteModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Delete Policy";
    this.confirmMessage = `Are you sure you want to permanently delete "${policy.title}"?`;
    this.confirmVariant = "danger";
    this.confirmAction = () => {
      this.policyService.deletePolicy(policy.id).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showSuccessToast("Policy permanently deleted.");
          this.loadPolicies();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.errorMessage = this.getErrorMessage(err);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  onConfirmModalConfirmed(): void {
    if (this.confirmAction) {
      this.confirmAction();
    }
  }

  onConfirmModalCancelled(): void {
    this.confirmModalOpen = false;
    this.confirmAction = null;
    this.cdr.detectChanges();
  }

  onReasonModalConfirmed(reason: string): void {
    if (this.reasonAction) {
      this.reasonAction(reason);
    }
  }

  onReasonModalCancelled(): void {
    this.reasonModalOpen = false;
    this.reasonAction = null;
    this.cdr.detectChanges();
  }

  exportPolicies(): void {
    const escapeCsv = (value: unknown): string =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      [
        "ID",
        "Title",
        "Category",
        "Ministry",
        "Department",
        "State",
        "Sector",
        "Status",
        "Publication Date",
      ],
      ...this.filteredPolicies.map((p) => [
        p.id,
        p.title,
        p.category,
        p.ministry,
        p.department,
        p.state,
        p.sector,
        p.status,
        p.publicationDate,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "policies.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case "PENDING_APPROVAL":
        return "Pending Approval";
      case "APPROVED":
        return "Approved";
      case "REJECTED":
        return "Rejected";
      case "DRAFT":
        return "Draft";
      case "ARCHIVED":
        return "Archived";
      case "ARCHIVE_REQUESTED":
        return "Archive Requested";
      case "DELETE_REQUESTED":
        return "Delete Requested";
      default:
        return status ? status.replace(/_/g, " ") : "";
    }
  }

  getCategoryClass(category: string): string {
    return (category || "").toLowerCase().replace(/\s+/g, "-");
  }

  trackByPolicy(_index: number, policy: PolicyTableItem): number {
    return policy.id;
  }

  private getErrorMessage(error: any): string {
    if (typeof error?.error?.detail === "string") return error.error.detail;
    if (error?.status === 401)
      return "Your session has expired. Please login again.";
    if (error?.status === 403)
      return "You do not have permission to perform this action.";
    if (error?.status === 0) return "Unable to connect to the backend server.";
    return error?.message || "Operation failed. Please try again.";
  }
}
