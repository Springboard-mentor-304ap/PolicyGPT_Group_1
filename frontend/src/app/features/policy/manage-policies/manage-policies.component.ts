import { CommonModule } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  Inject,
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
import {
  fitPageSize,
  visiblePageWindow,
} from "../../../core/utils/pagination.util";

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
    @Inject(PolicyService) private readonly policyService: PolicyService,
    @Inject(Router) private readonly router: Router,
    @Inject(Auth) private readonly auth: Auth,
    @Inject(ChangeDetectorRef) private readonly cdr: ChangeDetectorRef,
    @Inject(ToastService) private readonly toastService: ToastService,
  ) {}

  searchText = "";
  selectedStatus = "";

  currentPage = 1;
  private _pageSize = 5;
  /**
   * Effective rows-per-page. Assigning a valid size also records it as
   * the user's selection; internal sync writes `_pageSize` directly so
   * shrinking to a small result set never loses the selection.
   */
  get pageSize(): number {
    return this._pageSize;
  }
  set pageSize(value: number) {
    this._pageSize = value;
    if (Number.isInteger(value) && value > 0) {
      this.selectedPageSize = value;
    }
  }
  /** User's chosen rows-per-page; `pageSize` may shrink below it for small result sets. */
  selectedPageSize = 5;
  menuOpenId: number | null = null;
  userRole: string | null = null;

  /** Rows-per-page options for the footer dropdown (string values for the shared select). */
  readonly pageSizeOptions = ["5", "10", "20", "50"];

  /**
   * String bridge between the numeric `pageSize` and the shared
   * dropdown, which works with string values. `pageSize` stays the
   * single source of truth, so filtering/sorting keep the selection.
   */
  get pageSizeOption(): string {
    return String(this.pageSize);
  }

  set pageSizeOption(value: string) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      this.pageSize = parsed;
    }
  }

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

  // Structured approval message parts (bold policy title, no quotes).
  // Set only by openApproveModal; cleared centrally in closeMenu() so no
  // other dialog can inherit them.
  confirmMessageBefore = "";
  confirmHighlight = "";
  confirmMessageAfter = "";
  // Whether the confirm dialog parses `"Name"` segments in its message.
  // Disabled for info dialogs carrying free-form user text.
  confirmParseQuotes = true;

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

  /**
   * Edit-status popup state. Only DRAFT and ARCHIVED may be offered.
   * The choice is a routing context only: the backend exposes no
   * endpoint to change a policy's status for editing, so Continue opens
   * the existing edit form (which loads the policy by ID and enforces
   * read-only + backend validation from its live status).
   */
  editStatusModalOpen = false;
  editStatusPolicy: PolicyTableItem | null = null;
  readonly editStatusOptions: Array<"DRAFT" | "ARCHIVED"> = [
    "DRAFT",
    "ARCHIVED",
  ];
  editStatusChoice: "DRAFT" | "ARCHIVED" = "DRAFT";

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

  /** Sort options for the register. Default preserves the established
   * newest-activity-first ordering. */
  selectedSort = "latest";

  get sortOptions(): { value: string; label: string }[] {
    return [
      { value: "ascending", label: "Ascending" },
      { value: "descending", label: "Descending" },
      { value: "latest", label: "Latest" },
      { value: "oldest", label: "Oldest" },
    ];
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

    // The "6" rows-per-page option was removed: normalize any stale
    // selection to the default of 5 before loading.
    if (this.selectedPageSize === 6) {
      this.selectedPageSize = 5;
    }
    if (this.pageSize === 6) {
      this.pageSize = 5;
    }

    this.loadPolicies();
  }

  showSuccessToast(message: string): void {
    // Single top-right notification per operation via the shared toast
    // service. successToastMessage is retained only for existing specs;
    // no inline toast is rendered, so only one toast appears.
    this.successToastMessage = message;
    this.cdr.detectChanges();
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

  /**
   * Builds a record-specific toast message, preferring the authoritative
   * name from the API response with the row's title as fallback.
   * Falls back to `generic` when no usable name exists.
   */
  private policyToastMessage(
    updated: PolicyResponse | null | undefined,
    fallbackTitle: string | null | undefined,
    withName: (name: string) => string,
    generic: string,
  ): string {
    const raw =
      typeof updated?.title === "string" && updated.title.trim()
        ? updated.title
        : (fallbackTitle ?? "");
    const name = String(raw).trim();
    return name ? withName(name) : generic;
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
          // Latest activity first (register-wide, so pagination follows).
          this.sortPoliciesByActivity();
          this.syncPageSizeToResults(this.policies.length);
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

  /**
   * Latest activity timestamp for register ordering: updated_at first,
   * falling back to created_at. Missing/invalid timestamps sort last.
   * Uses raw backend values (epoch ms), never display strings.
   */
  private activityTime(policy: PolicyTableItem): number {
    const parse = (value?: string | null): number => {
      if (value === null || value === undefined) return 0;
      const time = new Date(String(value).trim()).getTime();
      return Number.isNaN(time) ? 0 : time;
    };
    return parse(policy.updatedAt) || parse(policy.createdAt);
  }

  /** Newest activity first, across the whole register (all pages). */
  private sortPoliciesByActivity(): void {
    this.sortPolicies();
  }

  /**
   * Register ordering for the selected Sort By option (applied to the
   * full local dataset before pagination slicing, so ordering holds
   * across pages). Title sorts are locale-aware; timestamp sorts reuse
   * the updated_at → created_at activity basis; id breaks ties so the
   * order is deterministic. Missing timestamps sort last for Latest and
   * first for Oldest via the zero fallback in activityTime().
   */
  private sortPolicies(): void {
    this.policies.sort((a, b) => {
      switch (this.selectedSort) {
        case "ascending":
          return (
            a.title.localeCompare(b.title, "en", {
              sensitivity: "base",
              numeric: true,
            }) || a.id - b.id
          );
        case "descending":
          return (
            b.title.localeCompare(a.title, "en", {
              sensitivity: "base",
              numeric: true,
            }) || a.id - b.id
          );
        case "oldest":
          return this.activityTime(a) - this.activityTime(b) || a.id - b.id;
        case "latest":
        default:
          return this.activityTime(b) - this.activityTime(a) || a.id - b.id;
      }
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
  /** Sliding window of at most three consecutive page numbers. */
  get visiblePages(): number[] {
    return visiblePageWindow(this.currentPage, this.totalPages);
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
    this.sortPolicies();
    this.syncPageSizeToResults(this.filteredPolicies.length);
    this.currentPage = 1;
    this.closeMenu();
    this.cdr.detectChanges();
  }

  resetFilters(): void {
    this.searchText = "";
    this.selectedStatus = "";
    this.selectedSort = "latest";
    this.sortPolicies();
    this.syncPageSizeToResults(this.filteredPolicies.length);
    this.currentPage = 1;
    this.closeMenu();
    this.cdr.detectChanges();
  }

  changePageSize(): void {
    this.selectedPageSize = this.pageSize;
    this.syncPageSizeToResults(this.filteredPolicies.length);
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  /**
   * Effective rows-per-page for the current result set: the user's
   * selected size, shrunk to the record count when smaller (empty sets
   * keep the selection). Also reclamps the current page.
   */
  private syncPageSizeToResults(total: number): void {
    this._pageSize = fitPageSize(this.selectedPageSize, total);
    this.currentPage = Math.min(Math.max(1, this.currentPage), this.totalPages);
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
    this.confirmMessageBefore = "";
    this.confirmHighlight = "";
    this.confirmMessageAfter = "";
    this.confirmParseQuotes = true;
    this.closeExportMenu();
  }

  @HostListener("document:keydown.escape")
  onEscapeKey(): void {
    if (this.editStatusModalOpen) {
      this.cancelEditStatus();
    } else if (this.menuOpenId !== null) {
      this.closeMenu();
    } else {
      this.closeExportMenu();
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

  /** Open the edit-status popup for a policy row. */
  openEditStatusModal(policy: PolicyTableItem): void {
    this.closeMenu();
    this.editStatusPolicy = policy;
    this.editStatusChoice = "DRAFT";
    this.editStatusModalOpen = true;
    this.cdr.detectChanges();
  }

  /** Continue from the edit-status popup into the existing edit form. */
  confirmEditStatus(): void {
    const target = this.editStatusPolicy;
    this.editStatusModalOpen = false;
    this.editStatusPolicy = null;
    this.cdr.detectChanges();
    if (target) {
      this.editPolicy(target);
    }
  }

  /** Cancel the edit-status popup without navigating. */
  cancelEditStatus(): void {
    this.editStatusModalOpen = false;
    this.editStatusPolicy = null;
    this.cdr.detectChanges();
  }

  onEditStatusBackdrop(event: MouseEvent): void {
    if (
      (event.target as HTMLElement).classList.contains("edit-status-overlay")
    ) {
      this.cancelEditStatus();
    }
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

  /**
   * A modal child reports every successful mutation. Only flag it: the
   * close handler reloads the list (which already includes statistics),
   * so no second stats request fires while the modal is still open.
   */
  onChildDataChanged(): void {
    this.childDirty = true;
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
    if (policy.status === "REJECTED") {
      return "Resubmit";
    }
    return "Submit";
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
    // The update carries a fresh updated_at: re-sort newest-first.
    this.sortPoliciesByActivity();
    this.syncPageSizeToResults(this.policies.length);
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.cdr.detectChanges();
    this.loadStats();
  }

  /** Remove a permanently deleted row without refetching the table. */
  private removePolicyRow(id: number): void {
    this.policies = this.policies.filter((p) => p.id !== id);
    this.syncPageSizeToResults(this.policies.length);
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.cdr.detectChanges();
    this.loadStats();
  }

  private openInfoDialog(
    title: string,
    message: string,
    highlight?: { before: string; text: string; after: string },
    parseQuotes = true,
  ): void {
    this.closeMenu();
    this.confirmTitle = title;
    this.confirmMessage = message;
    this.confirmMessageBefore = highlight?.before ?? "";
    this.confirmHighlight = highlight?.text ?? "";
    this.confirmMessageAfter = highlight?.after ?? "";
    this.confirmParseQuotes = parseQuotes;
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
      undefined,
      false,
    );
  }

  openViewArchiveReason(policy: PolicyTableItem): void {
    const raw = (policy.archiveReason || "").trim();
    const reason = raw ? raw : "No archive reason available.";
    this.openInfoDialog(
      `${policy.title || "Untitled policy"}\n`,
      `Archive reason: ${reason}`,
      undefined,
      false,
    );
  }

  openViewSubmissionDetails(policy: PolicyTableItem): void {
    const title = policy.title || "Untitled policy";
    const lines = [`Status: ${this.getStatusLabel(policy.status)}.`];
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
    this.openInfoDialog("Submission review details", lines.join("\n"), {
      before: "",
      text: title,
      after: `\n${lines.join("\n")}`,
    });
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

      this.policyService
        .submitPolicy(policy.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            // Use the backend-returned status: an Admin submit lands
            // APPROVED directly, a Government Official submit PENDING_APPROVAL.
            const approved =
              String(updated?.status || "").toUpperCase() === "APPROVED";
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) =>
                  approved
                    ? `Policy "${n}" submitted and approved.`
                    : `Policy "${n}" submitted for approval.`,
                approved
                  ? "Policy submitted and approved."
                  : "Policy submitted for approval.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
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
    // Bold, quoteless title via the shared dialog's highlight inputs;
    // plain quoteless fallback kept in confirmMessage.
    this.confirmMessageBefore = "Are you sure you want to approve ";
    this.confirmHighlight = policyTitle;
    this.confirmMessageAfter = "?";
    this.confirmMessage = `Are you sure you want to approve ${policyTitle}?`;
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

      this.policyService
        .approvePolicy(policy.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) => `Policy "${n}" approved successfully.`,
                "Policy approved successfully.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
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
      this.policyService
        .rejectPolicy(policy.id, reason)
        .pipe(
          take(1),
          finalize(() => {
            this.reasonLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.reasonModalOpen = false;
            this.reasonAction = null;
            this.reasonErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) => `Policy "${n}" rejected successfully.`,
                "Policy rejected successfully.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.reasonErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showErrorToast(errorMsg);
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
      this.policyService
        .requestArchive(policy.id, reason)
        .pipe(
          take(1),
          finalize(() => {
            this.reasonLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.reasonModalOpen = false;
            this.reasonAction = null;
            this.reasonErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) => `Archive request for policy "${n}" submitted to Admin.`,
                "Archive request submitted to Admin.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.reasonErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showErrorToast(errorMsg);
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
      this.policyService
        .approveArchive(policy.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) => `Policy "${n}" archived successfully.`,
                "Policy archived successfully.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
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
      this.policyService
        .rejectArchive(policy.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) =>
                  `Archive request for policy "${n}" rejected successfully.`,
                "Archive request rejected successfully.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
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
      this.policyService
        .requestDelete(policy.id, reason)
        .pipe(
          take(1),
          finalize(() => {
            this.reasonLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.reasonModalOpen = false;
            this.reasonAction = null;
            this.reasonErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) =>
                  `Deletion request for policy "${n}" submitted successfully.`,
                "Deletion request submitted successfully.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.reasonErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showErrorToast(errorMsg);
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
    this.confirmMessageBefore = "Permanently delete ";
    this.confirmHighlight = policy.title || "Untitled policy";
    this.confirmMessageAfter = `? This cannot be undone.\nDeletion reason: ${this.getReasonOrFallback(policy.deleteReason)}`;
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
      // We remain on /dashboard/admin/policies/manage and update the table in-place.
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
            this.showSuccessToast(
              this.policyToastMessage(
                null,
                policy.title,
                (n) => `Policy "${n}" permanently deleted.`,
                "Policy permanently deleted.",
              ),
            );
            this.removePolicyRow(policy.id);
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
    this.confirmMessageBefore = "Reject delete request for ";
    this.confirmHighlight = policy.title || "Untitled policy";
    this.confirmMessageAfter = `? The policy will revert to its previous status.\nDeletion reason: ${this.getReasonOrFallback(policy.deleteReason)}`;
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
      // /dashboard/admin/policies/manage and update the row in-place.
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
          next: (updated) => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) =>
                  `Deletion request for policy "${n}" rejected successfully.`,
                "Deletion request rejected successfully.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
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
      this.policyService
        .archiveDirect(policy.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) => `Policy "${n}" archived successfully.`,
                "Policy archived successfully.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
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
      this.policyService
        .restore(policy.id)
        .pipe(
          take(1),
          finalize(() => {
            this.confirmLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (updated) => {
            this.confirmModalOpen = false;
            this.confirmAction = null;
            this.confirmErrorMessage = null;
            this.showSuccessToast(
              this.policyToastMessage(
                updated,
                policy.title,
                (n) => `Policy "${n}" restored to APPROVED.`,
                "Policy restored to APPROVED.",
              ),
            );
            if (updated) {
              this.applyPolicyUpdate(updated);
            } else {
              this.loadPolicies();
            }
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

  openDirectDeleteModal(policy: PolicyTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can delete policies.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Delete Policy";
    this.confirmMessage = `Are you sure you want to delete "${policy.title}"?`;
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
      this.policyService
        .deletePolicy(policy.id)
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
            this.showSuccessToast(
              this.policyToastMessage(
                null,
                policy.title,
                (n) => `Policy "${n}" permanently deleted.`,
                "Policy permanently deleted.",
              ),
            );
            this.removePolicyRow(policy.id);
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

  exportMenuOpen = false;
  exporting = false;

  toggleExportMenu(event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.exporting) return;
    this.exportMenuOpen = !this.exportMenuOpen;
    this.cdr.detectChanges();
  }

  closeExportMenu(): void {
    if (this.exportMenuOpen) {
      this.exportMenuOpen = false;
      this.cdr.detectChanges();
    }
  }

  /** Active filter summary for report headers. */
  private activeFilterSummary(): string {
    const parts: string[] = [];
    if (this.searchText.trim())
      parts.push(`Search: "${this.searchText.trim()}"`);
    if (this.selectedStatus)
      parts.push(`Status: ${this.getStatusLabel(this.selectedStatus)}`);
    return parts.length ? parts.join(" · ") : "None (all records)";
  }

  private exportFileStem(kind: "pdf" | "xlsx"): string {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    return (
      `policygpt-policies-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
      `${pad(d.getHours())}${pad(d.getMinutes())}.${kind}`
    );
  }

  /** All records matching the current filters (every page, not just visible). */
  private exportRows(): string[][] {
    return this.filteredPolicies.map((p) => [
      String(p.id),
      p.title,
      p.description || "—",
      p.ministry || "—",
      p.department || "—",
      this.getStatusLabel(p.status),
      this.formatDateTime(p.createdAt),
      this.formatDateTime(p.updatedAt),
    ]);
  }

  async exportPdf(): Promise<void> {
    if (this.exporting) return;
    this.exportMenuOpen = false;
    this.exporting = true;
    this.cdr.detectChanges();
    try {
      const { jsPDF } = await import("jspdf");
      const rows = this.exportRows();
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;
      const usable = pageW - margin * 2;
      const headers = [
        "ID",
        "Title",
        "Description",
        "Ministry",
        "Department",
        "Status",
        "Created (IST)",
        "Updated (IST)",
      ];
      const widths = [0.06, 0.2, 0.24, 0.11, 0.11, 0.09, 0.095, 0.095].map(
        (f) => Math.floor(f * usable),
      );
      let y = 48;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text("PolicyGPT", margin, y);
      y += 20;
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text("Government Policy Register", margin, y);
      y += 16;
      doc.setFontSize(9);
      doc.text(
        `Generated On: ${this.formatDateTime(new Date().toISOString())}`,
        margin,
        y,
      );
      y += 13;
      const filterLines = doc.splitTextToSize(
        `Applied Filters: ${this.activeFilterSummary()} · Records: ${rows.length}`,
        usable,
      );
      doc.text(filterLines, margin, y);
      y += filterLines.length * 12 + 10;

      const rowH = 20;
      const drawHeader = (): void => {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, usable, rowH, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        let x = margin;
        headers.forEach((h, i) => {
          doc.text(h, x + 6, y + 13, { maxWidth: widths[i] - 12 });
          x += widths[i];
        });
        y += rowH;
      };
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(23, 32, 51);
      for (const row of rows) {
        const wrapped = row.map((cell, i) =>
          doc.splitTextToSize(cell || "—", widths[i] - 12),
        );
        const h = Math.max(rowH, ...wrapped.map((w) => w.length * 12 + 8));
        if (y + h > pageH - 40) {
          doc.addPage();
          y = 40;
          drawHeader();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(23, 32, 51);
        }
        doc.setDrawColor(237, 241, 245);
        doc.line(margin, y + h, margin + usable, y + h);
        let x = margin;
        wrapped.forEach((lines, i) => {
          doc.text(lines, x + 6, y + 13);
          x += widths[i];
        });
        y += h;
      }
      if (rows.length === 0) {
        doc.text("No records match the current filters.", margin, y + 16);
      }
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 20, {
          align: "right",
        });
      }
      doc.save(this.exportFileStem("pdf"));
      this.showSuccessToast("Policies exported as PDF.");
    } catch (err) {
      console.error("Failed to export policies as PDF:", err);
      this.errorMessage = "Could not generate the PDF. Please try again.";
      this.showErrorToast(this.errorMessage);
      this.cdr.detectChanges();
    } finally {
      this.exporting = false;
      this.cdr.detectChanges();
    }
  }

  async exportExcel(): Promise<void> {
    if (this.exporting) return;
    this.exportMenuOpen = false;
    this.exporting = true;
    this.cdr.detectChanges();
    try {
      const XLSX = await import("xlsx");
      const header = [
        "ID",
        "Title",
        "Description",
        "Ministry",
        "Department",
        "Status",
        "Created (IST)",
        "Updated (IST)",
      ];
      const ws = XLSX.utils.aoa_to_sheet([header, ...this.exportRows()]);
      ws["!cols"] = [
        { wch: 8 },
        { wch: 36 },
        { wch: 48 },
        { wch: 24 },
        { wch: 24 },
        { wch: 18 },
        { wch: 22 },
        { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Policies");
      XLSX.writeFile(wb, this.exportFileStem("xlsx"));
      this.showSuccessToast("Policies exported as Excel.");
    } catch (err) {
      console.error("Failed to export policies as Excel:", err);
      this.errorMessage =
        "Could not generate the spreadsheet. Please try again.";
      this.showErrorToast(this.errorMessage);
      this.cdr.detectChanges();
    } finally {
      this.exporting = false;
      this.cdr.detectChanges();
    }
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
