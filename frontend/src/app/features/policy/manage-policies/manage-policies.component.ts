import { CommonModule } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { finalize, take } from "rxjs";
import { PolicyService } from "../../../core/services/policy.service";
import { Auth } from "../../../core/services/auth";
import { ToastService } from "../../../core/services/toast.service";
import {
  PolicyResponse,
  PolicyListResponse,
  PolicyStatus,
} from "../../../core/models/policy.model";
import { OverlayModule, ConnectedPosition } from "@angular/cdk/overlay";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { ReasonModalComponent } from "../../../shared/components/reason-modal/reason-modal.component";
import { DeletedPoliciesModalComponent } from "../deleted-policies-modal/deleted-policies-modal.component";
import { DraftPoliciesModalComponent } from "../draft-policies-modal/draft-policies-modal.component";
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import {
  CategoryInput,
  getCategoryIconName,
  getCategoryIconStyle,
} from "../../../core/utils/category-icon.util";

export interface PolicyTableItem {
  id: number;
  title: string;
  description: string;
  category: string;
  ministry: string;
  department: string;
  sector: string;
  status: string;
  createdBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  rejectionReason?: string;
  archiveReason?: string;
  deleteReason?: string;
  deleteRequestedFromStatus?: string;
}

@Component({
  selector: "app-manage-policies",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    OverlayModule,
    ConfirmModalComponent,
    ReasonModalComponent,
    SearchableSelectComponent,
    DeletedPoliciesModalComponent,
    DraftPoliciesModalComponent,
  ],
  templateUrl: "./manage-policies.component.html",
  styleUrls: ["./manage-policies.component.scss"],
})
export class ManagePoliciesComponent implements OnInit, OnDestroy {
  constructor(
    private readonly policyService: PolicyService,
    private readonly router: Router,
    private readonly auth: Auth,
    private readonly cdr: ChangeDetectorRef,
    private readonly toastService: ToastService,
  ) {}

  searchText = "";
  selectedStatus = "";

  currentPage = 1;
  pageSize = 6;
  menuOpenId: number | null = null;
  userRole: string | null = null;
  loading = false;
  errorMessage = "";
  successToastMessage: string | null = null;

  readonly actionMenuPositions: ConnectedPosition[] = [
    {
      originX: "end",
      originY: "bottom",
      overlayX: "end",
      overlayY: "top",
      offsetY: 6,
    },
    {
      originX: "end",
      originY: "top",
      overlayX: "end",
      overlayY: "bottom",
      offsetY: -6,
    },
    {
      originX: "start",
      originY: "bottom",
      overlayX: "start",
      overlayY: "top",
      offsetY: 6,
    },
    {
      originX: "start",
      originY: "top",
      overlayX: "start",
      overlayY: "bottom",
      offsetY: -6,
    },
  ];

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
  confirmLoading = false;
  confirmErrorMessage: string | null = null;
  confirmText = "Confirm";
  showCancelConfirm = true;

  reasonModalOpen = false;
  reasonTitle = "";
  reasonMessage = "";
  reasonLabel = "Reason";
  reasonVariant: "primary" | "danger" | "warning" = "danger";
  reasonAction: ((reason: string) => void) | null = null;
  reasonLoading = false;
  reasonErrorMessage: string | null = null;

  // Deleted / Draft modal state. The modals open centered over this page;
  // childDirty tracks whether a mutation happened inside a modal so the
  // register and statistics refresh when the modal closes.
  deletedModalOpen = false;
  draftsModalOpen = false;
  private childDirty = false;

  statuses = [
    "APPROVED",
    "PENDING_APPROVAL",
    "DRAFT",
    "REJECTED",
    "ARCHIVED",
    "ARCHIVE_REQUESTED",
    "DELETE_REQUESTED",
  ];

  /** PolicyGPT dropdown options with human-readable status labels. */
  get statusFilterOptions(): { value: string; label: string }[] {
    return this.statuses.map((s) => ({
      value: s,
      label: this.getStatusLabel(s),
    }));
  }

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
        : rawRole === "GOVERNMENT_OFFICIAL" ||
            rawRole === "GOVERNMENT OFFICIAL" ||
            rawRole === "GOVERNMENT"
          ? "GOVERNMENT_OFFICIAL"
          : rawRole || null;

    this.loadPolicies();
  }

  showSuccessToast(message: string): void {
    this.successToastMessage = message;
    this.cdr.detectChanges();
    // Use the shared PolicyGPT toast system (auto-dismiss, success styling)
    // in addition to the inline confirmation so notifications stay consistent.
    try {
      this.toastService.success(message);
    } catch {
      // Toast container is optional in isolated specs; inline toast still shows.
    }
    window.setTimeout(() => {
      this.successToastMessage = null;
      this.cdr.detectChanges();
    }, 3500);
  }

  private showErrorToast(message: string): void {
    try {
      this.toastService.error(message);
    } catch {
      // Ignore when toast container is unavailable (e.g. isolated specs).
    }
  }

  loadPolicies(): void {
    this.loading = true;
    this.errorMessage = "";
    this.cdr.detectChanges();

    this.policyService.clearCache();

    this.policyService
      .getPolicies({ page: 1, limit: 100, manage: true })
      .subscribe({
        next: (response: PolicyListResponse) => {
          const currentUser = this.auth.getStoredUser();
          const currentUserId = currentUser?.user_id;

          let source = Array.isArray(response?.policies)
            ? response.policies
            : [];

          // Role-based creator filtering rule:
          // Admin: sees ALL policies except DRAFTs created by others.
          // Government Official: sees ONLY policies created by the authenticated Government Official.
          if (!this.isAdmin && currentUserId) {
            source = source.filter(
              (policy: PolicyResponse) => policy.created_by === currentUserId,
            );
          }

          this.policies = source.map((policy: PolicyResponse) => ({
            id: Number(policy.policy_id),
            title: policy.title || "Untitled policy",
            description: policy.description || "",
            category: policy.category || "",
            ministry: policy.ministry || "",
            department: policy.department || "",
            sector: policy.sector || "",
            status: String(policy.status || "DRAFT").toUpperCase(),
            createdBy: policy.created_by,
            createdAt: policy.created_at || null,
            updatedAt: policy.updated_at || null,
            rejectionReason: policy.rejection_reason || undefined,
            archiveReason: policy.archive_reason || undefined,
            deleteReason: policy.delete_reason || undefined,
            deleteRequestedFromStatus:
              policy.delete_requested_from_status || undefined,
          }));
          this.currentPage = Math.min(this.currentPage, this.totalPages);
          this.loading = false;
          // Keep own-record stats in sync for non-admins (see loadStats).
          if (!this.isAdmin) {
            const counts = {
              total: 0,
              approved: 0,
              pending: 0,
              rejected: 0,
              archived: 0,
            };
            for (const p of this.policies) {
              counts.total += 1;
              if (p.status === "APPROVED") counts.approved += 1;
              else if (p.status === "PENDING_APPROVAL") counts.pending += 1;
              else if (p.status === "REJECTED") counts.rejected += 1;
              else if (p.status === "ARCHIVED") counts.archived += 1;
            }
            this.stats = counts;
          }
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
    // Government Officials see own-record counts derived from their loaded
    // list (platform analytics are global and would mislead). Admins keep
    // the platform-wide analytics totals.
    if (!this.isAdmin) {
      const counts = {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        archived: 0,
      };
      for (const p of this.policies) {
        counts.total += 1;
        if (p.status === "APPROVED") counts.approved += 1;
        else if (p.status === "PENDING_APPROVAL") counts.pending += 1;
        else if (p.status === "REJECTED") counts.rejected += 1;
        else if (p.status === "ARCHIVED") counts.archived += 1;
      }
      this.stats = counts;
      this.cdr.detectChanges();
      return;
    }
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

  get filteredPolicies(): PolicyTableItem[] {
    const search = this.searchText.toLowerCase().trim();
    return this.policies.filter((policy) => {
      const haystack = [
        policy.title,
        policy.description,
        policy.category,
        policy.ministry,
        policy.department,
        policy.sector,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesStatus =
        !this.selectedStatus || policy.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
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
    this.searchText = "";
    this.selectedStatus = "";
    this.currentPage = 1;
    this.closeMenu();
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
    if (this.menuOpenId !== null) {
      this.menuOpenId = null;
      this.cdr.detectChanges();
    }
  }

  @HostListener("document:keydown.escape")
  onEscapeKey(): void {
    if (this.menuOpenId !== null) {
      this.closeMenu();
    }
  }

  onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.closeMenu();
    }
  }

  ngOnDestroy(): void {
    this.closeMenu();
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

  viewDeletedPolicies(): void {
    this.openDeletedModal();
  }

  viewDraftPolicies(): void {
    this.openDraftsModal();
  }

  openDeletedModal(): void {
    this.closeMenu();
    this.deletedModalOpen = true;
    this.cdr.detectChanges();
  }

  onDeletedModalClosed(): void {
    this.deletedModalOpen = false;
    this.refreshAfterChildModal();
  }

  openDraftsModal(): void {
    this.closeMenu();
    this.draftsModalOpen = true;
    this.cdr.detectChanges();
  }

  onDraftsModalClosed(): void {
    this.draftsModalOpen = false;
    this.refreshAfterChildModal();
  }

  /** A modal child reports every successful mutation; keep statistics live. */
  onChildDataChanged(): void {
    this.childDirty = true;
    this.loadStats();
  }

  private refreshAfterChildModal(): void {
    this.cdr.detectChanges();
    if (this.childDirty) {
      this.childDirty = false;
      this.loadPolicies();
    }
  }

  canSubmitPolicy(policy: PolicyTableItem): boolean {
    if (!["DRAFT", "REJECTED"].includes(policy.status)) return false;
    if (this.isAdmin) return true;
    const currentUserId = this.auth.getStoredUser()?.user_id;
    return Boolean(currentUserId && policy.createdBy === currentUserId);
  }

  getSubmitActionLabel(policy: PolicyTableItem): string {
    if (this.isAdmin) {
      return "Submit";
    }
    return policy.status === "REJECTED"
      ? "Re-submit for approval"
      : "Submit for approval";
  }

  // ----------------------------------------------------------
  // Admin review helpers: status-driven details from real backend
  // values (never inferred from badge text).
  // ----------------------------------------------------------

  private getReasonOrFallback(reason?: string): string {
    const text = (reason || "").trim();
    return text ? text : "No reason was provided.";
  }

  private toPolicyTableItem(policy: PolicyResponse): PolicyTableItem {
    return {
      id: Number(policy.policy_id),
      title: policy.title || "Untitled policy",
      description: policy.description || "",
      category: policy.category || "",
      ministry: policy.ministry || "",
      department: policy.department || "",
      sector: policy.sector || "",
      status: String(policy.status || "DRAFT").toUpperCase(),
      createdBy: policy.created_by,
      createdAt: policy.created_at || null,
      updatedAt: policy.updated_at || null,
      rejectionReason: policy.rejection_reason || undefined,
      archiveReason: policy.archive_reason || undefined,
      deleteReason: policy.delete_reason || undefined,
      deleteRequestedFromStatus:
        policy.delete_requested_from_status || undefined,
    };
  }

  /** Patch the affected row from the backend response (no full reload). */
  private applyPolicyUpdate(updated: PolicyResponse): void {
    const item = this.toPolicyTableItem(updated);
    const index = this.policies.findIndex((p) => p.id === item.id);
    if (index >= 0) {
      this.policies[index] = item;
    } else {
      this.policies = [...this.policies, item];
    }
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.cdr.detectChanges();
    this.loadStats();
  }

  /** Remove a permanently deleted row without refetching the table. */
  private removePolicyRow(id: number): void {
    this.policies = this.policies.filter((p) => p.id !== id);
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.cdr.detectChanges();
    this.loadStats();
  }

  private openInfoDialog(title: string, message: string): void {
    this.closeMenu();
    this.confirmTitle = title;
    this.confirmMessage = message;
    this.confirmVariant = "primary";
    this.confirmText = "Close";
    this.showCancelConfirm = false;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      this.confirmModalOpen = false;
      this.confirmAction = null;
      this.confirmText = "Confirm";
      this.showCancelConfirm = true;
      this.cdr.detectChanges();
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openViewDeleteReason(policy: PolicyTableItem): void {
    const reason = this.getReasonOrFallback(policy.deleteReason);
    this.openInfoDialog(
      `${policy.title || "Untitled policy"}\n`,
      `Deletion reason: ${reason}`,
    );
  }

  openViewSubmissionDetails(policy: PolicyTableItem): void {
    const lines = [
      `"${policy.title || "Untitled policy"}"`,
      `Status: ${this.getStatusLabel(policy.status)}.`,
    ];
    const context = [
      policy.category,
      policy.ministry || policy.department,
    ].filter((part) => (part || "").trim());
    if (context.length) {
      lines.push(context.join(" • "));
    }
    if ((policy.description || "").trim()) {
      lines.push(`Description: ${policy.description.trim()}`);
    }
    lines.push(
      `Submission note: ${this.getReasonOrFallback(policy.rejectionReason)}`,
    );
    this.openInfoDialog("Submission review details", lines.join("\n"));
  }

  openSubmitModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.canSubmitPolicy(policy)) {
      this.errorMessage =
        "You are not authorized to submit this policy. Only policies in DRAFT or REJECTED status can be submitted.";
      this.cdr.detectChanges();
      return;
    }
    const policyTitle = policy.title || "Untitled Policy";
    this.confirmTitle = "Submit Policy";
    this.confirmMessage = `Submit "${policyTitle}" for approval?`;
    this.confirmVariant = "primary";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();

      this.policyService.submitPolicy(policy.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast("Policy submitted for approval.");
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can approve policies.";
      this.cdr.detectChanges();
      return;
    }
    const currentUserId = this.auth.getStoredUser()?.user_id;
    if (currentUserId != null && policy.createdBy === currentUserId) {
      this.errorMessage =
        "You cannot approve your own policy. A different administrator must review it.";
      this.cdr.detectChanges();
      return;
    }
    const policyTitle = policy.title || "Untitled Policy";
    this.confirmTitle = "Approve Policy";
    this.confirmMessage = `Are you sure you want to approve "${policyTitle}"?`;
    this.confirmVariant = "success";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();

      this.policyService.approvePolicy(policy.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast("Policy approved successfully.");
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can reject policies.";
      this.cdr.detectChanges();
      return;
    }
    this.reasonTitle = "Reject Policy";
    this.reasonMessage = `Please enter a rejection reason for "${policy.title}".`;
    this.reasonLabel = "Rejection Reason";
    this.reasonVariant = "danger";
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.reasonAction = (reason: string) => {
      if (this.reasonLoading) {
        return;
      }
      this.reasonLoading = true;
      this.reasonErrorMessage = null;
      this.cdr.detectChanges();
      this.policyService.rejectPolicy(policy.id, reason).subscribe({
        next: (updated) => {
          this.reasonLoading = false;
          this.reasonModalOpen = false;
          this.reasonAction = null;
          this.reasonErrorMessage = null;
          this.showSuccessToast("Policy rejected.");
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.reasonLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.reasonErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
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
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.reasonAction = (reason: string) => {
      if (this.reasonLoading) {
        return;
      }
      this.reasonLoading = true;
      this.reasonErrorMessage = null;
      this.cdr.detectChanges();
      this.policyService.requestArchive(policy.id, reason).subscribe({
        next: (updated) => {
          this.reasonLoading = false;
          this.reasonModalOpen = false;
          this.reasonAction = null;
          this.reasonErrorMessage = null;
          this.showSuccessToast("Archive request submitted to Admin.");
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.reasonLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.reasonErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveArchiveModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can approve archive requests.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Approve Archive Request";
    this.confirmMessage = `Approve archival of "${policy.title}"? Status will become ARCHIVED.`;
    this.confirmVariant = "warning";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.policyService.approveArchive(policy.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast("Policy archived successfully.");
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectArchiveModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can reject archive requests.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Reject Archive Request";
    this.confirmMessage = `Reject archive request for "${policy.title}"? The policy will remain APPROVED.`;
    this.confirmVariant = "primary";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.policyService.rejectArchive(policy.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast(
            "Archive request rejected. Policy reverted to APPROVED.",
          );
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
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
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.reasonAction = (reason: string) => {
      if (this.reasonLoading) {
        return;
      }
      this.reasonLoading = true;
      this.reasonErrorMessage = null;
      this.cdr.detectChanges();
      this.policyService.requestDelete(policy.id, reason).subscribe({
        next: (updated) => {
          this.reasonLoading = false;
          this.reasonModalOpen = false;
          this.reasonAction = null;
          this.reasonErrorMessage = null;
          this.showSuccessToast("Delete request submitted to Admin.");
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.reasonLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.reasonErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveDeleteModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can approve deletion.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Approve Permanent Deletion";
    this.confirmMessage = `Permanently delete "${policy.title}"? This cannot be undone.\nDeletion reason: ${this.getReasonOrFallback(policy.deleteReason)}`;
    this.confirmVariant = "danger";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      // Prevent duplicate submissions from repeated clicks.
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      // Single request; finalize guarantees the loading state clears on both
      // success and failure. Dialog closes only after backend confirms success.
      // We remain on /dashboard/admin/policies/manage and refresh the list
      // from the backend so the deleted record disappears.
      this.policyService
        .approveDelete(policy.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: () => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast("Policy deleted successfully.");
            this.loadPolicies();
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.confirmErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showErrorToast(errorMsg);
            this.cdr.detectChanges();
          },
        });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectDeleteModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can reject deletion.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Reject Delete Request";
    this.confirmMessage = `Reject delete request for "${policy.title}"? The policy will revert to its previous status.\nDeletion reason: ${this.getReasonOrFallback(policy.deleteReason)}`;
    this.confirmVariant = "primary";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      // Prevent duplicate submissions from repeated clicks.
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      // Single request; finalize guarantees the loading state clears on both
      // success and failure. Rejecting never deletes the record — the backend
      // restores its previous status. We remain on
      // /dashboard/admin/policies/manage and refresh the list from backend.
      this.policyService
        .rejectDelete(policy.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: () => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast("Deletion request rejected successfully.");
            this.loadPolicies();
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.confirmErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showErrorToast(errorMsg);
            this.cdr.detectChanges();
          },
        });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  /**
   * Direct admin archive (POST /policies/{id}/archive, APPROVED -> ARCHIVED).
   * Reuses the same existing endpoint as the policy details page; the
   * government-official request/approval flow is untouched.
   */
  openArchiveModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can archive policies.";
      this.cdr.detectChanges();
      return;
    }
    if (policy.status !== "APPROVED") {
      this.errorMessage = "Only APPROVED policies can be archived.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Archive Policy";
    this.confirmMessage = `Are you sure you want to archive "${policy.title}"? It will move to ARCHIVED and can be restored later.`;
    this.confirmVariant = "warning";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.policyService.archiveDirect(policy.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast("Policy archived successfully.");
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRestoreModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can restore policies.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Restore Policy";
    this.confirmMessage = `Restore "${policy.title}" back to APPROVED state?`;
    this.confirmVariant = "success";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.policyService.restore(policy.id).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast("Policy restored to APPROVED.");
          if (updated) {
            this.applyPolicyUpdate(updated);
          } else {
            this.loadPolicies();
          }
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openDirectDeleteModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can delete policies.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Delete Policy";
    this.confirmMessage = `Are you sure you want to permanently delete "${policy.title}"?`;
    this.confirmVariant = "danger";
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.policyService.deletePolicy(policy.id).subscribe({
        next: () => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.showSuccessToast("Policy permanently deleted.");
          this.removePolicyRow(policy.id);
        },
        error: (err) => {
          this.confirmLoading = false;
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  onConfirmModalConfirmed(): void {
    if (this.confirmLoading) {
      return;
    }
    if (this.confirmAction) {
      this.confirmAction();
    }
  }

  onConfirmModalCancelled(): void {
    if (this.confirmLoading) {
      return;
    }
    this.confirmModalOpen = false;
    this.confirmAction = null;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmText = "Confirm";
    this.showCancelConfirm = true;
    this.cdr.detectChanges();
  }

  onReasonModalConfirmed(reason: string): void {
    if (this.reasonLoading) {
      return;
    }
    if (this.reasonAction) {
      this.reasonAction(reason);
    }
  }

  onReasonModalCancelled(): void {
    if (this.reasonLoading) {
      return;
    }
    this.reasonModalOpen = false;
    this.reasonAction = null;
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.cdr.detectChanges();
  }

  exportPolicies(): void {
    const escapeCsv = (value: unknown): string =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["ID", "Title", "Category", "Ministry", "Department", "Sector", "Status", "Created At", "Updated At"],
      ...this.filteredPolicies.map((p) => [
        p.id,
        p.title,
        p.category,
        p.ministry,
        p.department,
        p.sector,
        p.status,
        p.createdAt || "",
        p.updatedAt || "",
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

  /**
   * Format a backend timestamp for the Date & Time column in Asia/Kolkata
   * (IST), e.g. "10 Oct 2026, 06:51 PM". Uses the actual backend value;
   * missing or invalid timestamps render as "—".
   */
  formatDateTime(value?: string | null): string {
    if (value === null || value === undefined) return "—";
    const text = String(value).trim();
    if (!text) return "—";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).formatToParts(date);
      const get = (type: string): string =>
        parts.find((part) => part.type === type)?.value ?? "";
      const dayPeriod = get("dayPeriod").toUpperCase();
      const formatted =
        `${get("day")} ${get("month")} ${get("year")}, ` +
        `${get("hour")}:${get("minute")}${dayPeriod ? ` ${dayPeriod}` : ""}`;
      return formatted.trim() || "—";
    } catch {
      return "—";
    }
  }

  /**
   * Whether the Updated line should be shown underneath Created: only when
   * updated_at is present, valid, and different from the creation timestamp.
   */
  hasDistinctUpdate(policy: PolicyTableItem): boolean {
    const created = policy.createdAt ? new Date(policy.createdAt) : null;
    const updated = policy.updatedAt ? new Date(policy.updatedAt) : null;
    if (!created || Number.isNaN(created.getTime())) return false;
    if (!updated || Number.isNaN(updated.getTime())) return false;
    return updated.getTime() !== created.getTime();
  }

  getStatusLabel(status: string): string {    switch (status) {
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

  categoryIcon(category: CategoryInput): string {
    return getCategoryIconName(category);
  }

  categoryIconStyle(category: CategoryInput): {
    "background-color": string;
    color: string;
    "border-color": string;
  } {
    return getCategoryIconStyle(category);
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
