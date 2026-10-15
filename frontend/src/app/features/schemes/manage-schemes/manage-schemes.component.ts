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
import { SchemeService } from "../../../core/services/scheme.service";
import { Auth } from "../../../core/services/auth";
import { ToastService } from "../../../core/services/toast.service";
import { downloadBlob, XLSX_MIME_TYPE } from "../../../core/utils/file-download.util";
import {
  SchemeResponse,
  SchemeListResponse,
  SchemeStatus,
} from "../../../core/models/scheme.model";
import { OverlayModule, ConnectedPosition } from "@angular/cdk/overlay";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { ReasonModalComponent } from "../../../shared/components/reason-modal/reason-modal.component";
import { DeletedSchemesModalComponent } from "../deleted-schemes-modal/deleted-schemes-modal.component";
import { GovtDeletedSchemesModalComponent } from "../govt-deleted-schemes/govt-deleted-schemes-modal.component";
import { DraftSchemesModalComponent } from "../draft-schemes-modal/draft-schemes-modal.component";
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

export interface SchemeTableItem {
  id: number;
  title: string;
  description: string;
  category: string;
  ministry: string;
  department: string;
  state: string;
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
  selector: "app-manage-schemes",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    OverlayModule,
    ConfirmModalComponent,
    ReasonModalComponent,
    SearchableSelectComponent,
    DeletedSchemesModalComponent,
    GovtDeletedSchemesModalComponent,
    DraftSchemesModalComponent,
  ],
  templateUrl: "./manage-schemes.component.html",
  styleUrls: ["./manage-schemes.component.scss"],
})
export class ManageSchemesComponent implements OnInit, OnDestroy {
  constructor(
    @Inject(SchemeService) private readonly schemeService: SchemeService,
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

  // Structured approval message parts (bold scheme title, no quotes).
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
   * Read-only Deleted Schemes view for Government Officials. The admin
   * trash modal is unchanged; officials get a dedicated dialog without
   * restore or permanent-delete actions.
   */
  govtDeletedModalOpen = false;

  /**
   * Edit-status popup state. Only DRAFT and ARCHIVED may be offered.
   * The choice is a routing context only: the backend exposes no
   * endpoint to change a scheme's status for editing, so Continue opens
   * the existing edit form (which loads the scheme by ID and enforces
   * read-only + backend validation from its live status).
   */
  editStatusModalOpen = false;
  editStatusScheme: SchemeTableItem | null = null;
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

  /** SchemeGPT dropdown options with human-readable status labels. */
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

  schemes: SchemeTableItem[] = [];

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

    this.loadSchemes();
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
  private schemeToastMessage(
    updated: SchemeResponse | null | undefined,
    fallbackTitle: string | null | undefined,
    withName: (name: string) => string,
    generic: string,
  ): string {
    const raw =
      typeof updated?.name === "string" && updated.name.trim()
        ? updated.name
        : (fallbackTitle ?? "");
    const name = String(raw).trim();
    return name ? withName(name) : generic;
  }

  loadSchemes(): void {
    this.loading = true;
    this.errorMessage = "";
    this.cdr.detectChanges();

    this.schemeService.clearCache();

    this.schemeService
      .getSchemes({ page: 1, limit: 100, manage: true })
      .subscribe({
        next: (response: SchemeListResponse) => {
          const currentUser = this.auth.getStoredUser();
          const currentUserId = currentUser?.user_id;

          let source = Array.isArray(response?.schemes)
            ? response.schemes
            : [];

          // Role-based creator filtering rule:
          // Admin: sees ALL schemes except DRAFTs created by others.
          // Government Official: sees ONLY schemes created by the authenticated Government Official.
          if (!this.isAdmin && currentUserId) {
            source = source.filter(
              (scheme: SchemeResponse) => scheme.created_by === currentUserId,
            );
          }

          this.schemes = source.map((scheme: SchemeResponse) => ({
            id: Number(scheme.scheme_id),
            title: scheme.name || "Untitled scheme",
            description: scheme.description || "",
            category: scheme.category || "",
            ministry: scheme.ministry || "",
            department: scheme.department || "",
            state: scheme.state || "",
            status: String(scheme.status || "DRAFT").toUpperCase(),
            createdBy: scheme.created_by,
            createdAt: scheme.created_at || null,
            updatedAt: scheme.updated_at || null,
            rejectionReason: scheme.rejection_reason || undefined,
            archiveReason: scheme.archive_reason || undefined,
            deleteReason: scheme.delete_reason || undefined,
            deleteRequestedFromStatus:
              scheme.delete_requested_from_status || undefined,
          }));
          // Latest activity first (register-wide, so pagination follows).
          this.sortSchemesByActivity();
          this.syncPageSizeToResults(this.schemes.length);
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
            for (const p of this.schemes) {
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
          console.error("Failed to load schemes:", error);
          this.schemes = [];
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
      for (const p of this.schemes) {
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
    this.schemeService.getSchemeStatistics().subscribe({
      next: (res) => {
        this.stats = {
          total: res.total ?? 0,
          approved: res.approved ?? res.active ?? 0,
          pending: res.pending ?? 0,
          rejected: res.rejected ?? 0,
          archived: res.archived ?? 0,
        };
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("Failed to fetch scheme statistics:", err);
      },
    });
  }

  /**
   * Latest activity timestamp for register ordering: updated_at first,
   * falling back to created_at. Missing/invalid timestamps sort last.
   * Uses raw backend values (epoch ms), never display strings.
   */
  private activityTime(scheme: SchemeTableItem): number {
    const parse = (value?: string | null): number => {
      if (value === null || value === undefined) return 0;
      const time = new Date(String(value).trim()).getTime();
      return Number.isNaN(time) ? 0 : time;
    };
    return parse(scheme.updatedAt) || parse(scheme.createdAt);
  }

  /** Newest activity first, across the whole register (all pages). */
  private sortSchemesByActivity(): void {
    this.sortSchemes();
  }

  /**
   * Register ordering for the selected Sort By option (applied to the
   * full local dataset before pagination slicing, so ordering holds
   * across pages). Title sorts are locale-aware; timestamp sorts reuse
   * the updated_at → created_at activity basis; id breaks ties so the
   * order is deterministic. Missing timestamps sort last for Latest and
   * first for Oldest via the zero fallback in activityTime().
   */
  private sortSchemes(): void {
    this.schemes.sort((a, b) => {
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

  get filteredSchemes(): SchemeTableItem[] {
    const search = this.searchText.toLowerCase().trim();
    return this.schemes.filter((scheme) => {
      const haystack = [
        scheme.title,
        scheme.description,
        scheme.category,
        scheme.ministry,
        scheme.department,
        scheme.state,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      const matchesStatus =
        !this.selectedStatus || scheme.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredSchemes.length / this.pageSize));
  }
  /** Sliding window of at most three consecutive page numbers. */
  get visiblePages(): number[] {
    return visiblePageWindow(this.currentPage, this.totalPages);
  }
  get paginatedSchemes(): SchemeTableItem[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredSchemes.slice(start, start + this.pageSize);
  }
  get startItem(): number {
    return this.filteredSchemes.length
      ? (this.currentPage - 1) * this.pageSize + 1
      : 0;
  }
  get endItem(): number {
    return Math.min(
      this.currentPage * this.pageSize,
      this.filteredSchemes.length,
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
    this.sortSchemes();
    this.syncPageSizeToResults(this.filteredSchemes.length);
    this.currentPage = 1;
    this.closeMenu();
    this.cdr.detectChanges();
  }

  resetFilters(): void {
    this.searchText = "";
    this.selectedStatus = "";
    this.selectedSort = "latest";
    this.sortSchemes();
    this.syncPageSizeToResults(this.filteredSchemes.length);
    this.currentPage = 1;
    this.closeMenu();
    this.cdr.detectChanges();
  }

  changePageSize(): void {
    this.selectedPageSize = this.pageSize;
    this.syncPageSizeToResults(this.filteredSchemes.length);
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

  viewScheme(scheme: SchemeTableItem): void {
    this.router.navigate([
      "/dashboard",
      this.rolePrefix,
      "schemes",
      scheme.id,
    ]);
  }

  editScheme(scheme: SchemeTableItem): void {
    this.closeMenu();
    this.router.navigate([
      "/dashboard",
      this.rolePrefix,
      "schemes",
      "edit",
      scheme.id,
    ]);
  }

  /**
   * Status-based edit entry from the row action menu.
   *
   * DRAFT and ARCHIVED open the edit form directly; APPROVED shows the
   * archive-required alert; every other status keeps the Draft /
   * Archived chooser (approval, rejection, archive, and delete-request
   * flows are untouched).
   */
  openEditFlow(scheme: SchemeTableItem): void {
    if (scheme.status === "DRAFT" || scheme.status === "ARCHIVED") {
      this.editScheme(scheme);
      return;
    }
    if (scheme.status === "APPROVED") {
      this.openArchiveRequiredModal(scheme);
      return;
    }
    this.openEditStatusModal(scheme);
  }

  /**
   * Alert shown when editing an APPROVED scheme: it must be archived
   * first. Archive executes the existing role-appropriate workflow
   * (direct archive for admins, archive request for officials) with
   * loading, error, and toast handling; nothing navigates until the
   * API confirms success.
   */
  openArchiveRequiredModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    this.confirmTitle = "Scheme Must Be Archived";
    this.confirmMessage =
      "This scheme is currently approved and cannot be edited directly. " +
      "To make changes, you must first archive the scheme. Once archived, " +
      "you can open it in the edit form and update its details.";
    this.confirmMessageBefore = "";
    this.confirmHighlight = scheme.title || "Untitled scheme";
    this.confirmMessageAfter =
      " is currently approved and cannot be edited directly. To make " +
      "changes, you must first archive the scheme. Once archived, you " +
      "can open it in the edit form and update its details.";
    this.confirmParseQuotes = true;
    this.confirmVariant = "warning";
    this.confirmText = "Archive Scheme";
    this.showCancelConfirm = true;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) {
        return;
      }
      if (this.isAdmin) {
        this.executeArchiveForEdit(scheme);
      } else {
        this.confirmModalOpen = false;
        this.confirmAction = null;
        this.confirmErrorMessage = null;
        this.cdr.detectChanges();
        this.openRequestArchiveModal(scheme);
      }
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  /**
   * Direct archive from the archive-required alert (admin only).
   * Mirrors openArchiveModal's request handling: single-flight,
   * success toast only after confirmation, row refresh, then the
   * edit form for the freshly archived scheme.
   */
  private executeArchiveForEdit(scheme: SchemeTableItem): void {
    if (this.confirmLoading) {
      return;
    }
    this.confirmLoading = true;
    this.confirmErrorMessage = null;
    this.cdr.detectChanges();
    this.schemeService
      .archiveScheme(scheme.id)
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
            this.schemeToastMessage(
              updated,
              scheme.title,
              (n) => `Scheme "${n}" archived successfully.`,
              "Scheme archived successfully.",
            ),
          );
          if (updated) {
            this.applySchemeUpdate(updated);
          } else {
            this.loadSchemes();
          }
          this.editScheme(scheme);
        },
        error: (err) => {
          const errorMsg = this.getErrorMessage(err);
          this.confirmErrorMessage = errorMsg;
          this.errorMessage = errorMsg;
          this.showErrorToast(errorMsg);
          this.cdr.detectChanges();
        },
      });
  }

  /** Open the edit-status popup for a scheme row. */
  openEditStatusModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    this.editStatusScheme = scheme;
    this.editStatusChoice = "DRAFT";
    this.editStatusModalOpen = true;
    this.cdr.detectChanges();
  }

  /** Continue from the edit-status popup into the existing edit form. */
  confirmEditStatus(): void {
    const target = this.editStatusScheme;
    const choice = this.editStatusChoice;
    this.editStatusModalOpen = false;
    this.editStatusScheme = null;
    this.cdr.detectChanges();
    if (!target) {
      return;
    }
    // Archived choice executes the existing archive workflow (with its
    // own confirmation): direct archive for admins, archive request
    // for Government Officials. Draft continues to the edit form.
    if (choice === "ARCHIVED") {
      if (this.isAdmin) {
        this.openArchiveModal(target);
      } else {
        this.openRequestArchiveModal(target);
      }
      return;
    }
    this.editScheme(target);
  }

  /** Cancel the edit-status popup without navigating. */
  cancelEditStatus(): void {
    this.editStatusModalOpen = false;
    this.editStatusScheme = null;
    this.cdr.detectChanges();
  }

  onEditStatusBackdrop(event: MouseEvent): void {
    if (
      (event.target as HTMLElement).classList.contains("edit-status-overlay")
    ) {
      this.cancelEditStatus();
    }
  }

  addNewScheme(): void {
    this.router.navigate(["/dashboard", this.rolePrefix, "schemes", "add"]);
  }

  viewDeletedSchemes(): void {
    this.openDeletedModal();
  }

  viewDraftSchemes(): void {
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

  openGovtDeletedModal(): void {
    this.closeMenu();
    this.govtDeletedModalOpen = true;
    this.cdr.detectChanges();
  }

  onGovtDeletedModalClosed(): void {
    this.govtDeletedModalOpen = false;
    this.cdr.detectChanges();
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
      this.loadSchemes();
    }
  }

  canSubmitScheme(scheme: SchemeTableItem): boolean {
    if (!["DRAFT", "REJECTED"].includes(scheme.status)) return false;
    if (this.isAdmin) return true;
    const currentUserId = this.auth.getStoredUser()?.user_id;
    return Boolean(currentUserId && scheme.createdBy === currentUserId);
  }

  getSubmitActionLabel(scheme: SchemeTableItem): string {
    if (scheme.status === "REJECTED") {
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

  private toSchemeTableItem(scheme: SchemeResponse): SchemeTableItem {
    return {
      id: Number(scheme.scheme_id),
      title: scheme.name || "Untitled scheme",
      description: scheme.description || "",
      category: scheme.category || "",
      ministry: scheme.ministry || "",
      department: scheme.department || "",
      state: scheme.state || "",
      status: String(scheme.status || "DRAFT").toUpperCase(),
      createdBy: scheme.created_by,
      createdAt: scheme.created_at || null,
      updatedAt: scheme.updated_at || null,
      rejectionReason: scheme.rejection_reason || undefined,
      archiveReason: scheme.archive_reason || undefined,
      deleteReason: scheme.delete_reason || undefined,
      deleteRequestedFromStatus:
        scheme.delete_requested_from_status || undefined,
    };
  }

  /** Patch the affected row from the backend response (no full reload). */
  private applySchemeUpdate(updated: SchemeResponse): void {
    const item = this.toSchemeTableItem(updated);
    const index = this.schemes.findIndex((p) => p.id === item.id);
    if (index >= 0) {
      this.schemes[index] = item;
    } else {
      this.schemes = [...this.schemes, item];
    }
    // The update carries a fresh updated_at: re-sort newest-first.
    this.sortSchemesByActivity();
    this.syncPageSizeToResults(this.schemes.length);
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.cdr.detectChanges();
    this.loadStats();
  }

  /** Remove a deleted row without refetching the table. */
  private removeSchemeRow(id: number): void {
    this.schemes = this.schemes.filter((p) => p.id !== id);
    this.syncPageSizeToResults(this.schemes.length);
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

  openViewDeleteReason(scheme: SchemeTableItem): void {
    const reason = this.getReasonOrFallback(scheme.deleteReason);
    this.openInfoDialog(
      `${scheme.title || "Untitled scheme"}\n`,
      `Deletion reason: ${reason}`,
      undefined,
      false,
    );
  }

  openViewArchiveReason(scheme: SchemeTableItem): void {
    const raw = (scheme.archiveReason || "").trim();
    const reason = raw ? raw : "No archive reason available.";
    this.openInfoDialog(
      `${scheme.title || "Untitled scheme"}\n`,
      `Archive reason: ${reason}`,
      undefined,
      false,
    );
  }

  openViewSubmissionDetails(scheme: SchemeTableItem): void {
    const title = scheme.title || "Untitled scheme";
    const lines = [`Status: ${this.getStatusLabel(scheme.status)}.`];
    const context = [
      scheme.category,
      scheme.ministry || scheme.department,
    ].filter((part) => (part || "").trim());
    if (context.length) {
      lines.push(context.join(" • "));
    }
    if ((scheme.description || "").trim()) {
      lines.push(`Description: ${scheme.description.trim()}`);
    }
    lines.push(
      `Submission note: ${this.getReasonOrFallback(scheme.rejectionReason)}`,
    );
    this.openInfoDialog("Submission review details", lines.join("\n"), {
      before: "",
      text: title,
      after: `\n${lines.join("\n")}`,
    });
  }

  openSubmitModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.canSubmitScheme(scheme)) {
      this.errorMessage =
        "You are not authorized to submit this scheme. Only schemes in DRAFT or REJECTED status can be submitted.";
      this.cdr.detectChanges();
      return;
    }
    const schemeTitle = scheme.title || "Untitled Scheme";
    this.confirmTitle = "Submit Scheme";
    this.confirmMessage = `Submit "${schemeTitle}" for approval?`;
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

      this.schemeService
        .submitScheme(scheme.id)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) =>
                  approved
                    ? `Scheme "${n}" approved successfully.`
                    : `Scheme "${n}" submitted for approval.`,
                approved
                  ? "Scheme approved successfully."
                  : "Scheme submitted for approval.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openApproveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can approve schemes.";
      this.cdr.detectChanges();
      return;
    }
    const currentUserId = this.auth.getStoredUser()?.user_id;
    if (currentUserId != null && scheme.createdBy === currentUserId) {
      this.errorMessage =
        "You cannot approve your own scheme. A different administrator must review it.";
      this.cdr.detectChanges();
      return;
    }
    const schemeTitle = scheme.title || "Untitled Scheme";
    this.confirmTitle = "Approve Scheme";
    // Bold, quoteless title via the shared dialog's highlight inputs;
    // plain quoteless fallback kept in confirmMessage.
    this.confirmMessageBefore = "Are you sure you want to approve ";
    this.confirmHighlight = schemeTitle;
    this.confirmMessageAfter = "?";
    this.confirmMessage = `Are you sure you want to approve ${schemeTitle}?`;
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

      this.schemeService
        .approveScheme(scheme.id)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) => `Scheme "${n}" approved successfully.`,
                "Scheme approved successfully.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openRejectModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can reject schemes.";
      this.cdr.detectChanges();
      return;
    }
    this.reasonTitle = "Reject Scheme";
    this.reasonMessage = `Please enter a rejection reason for "${scheme.title}".`;
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
      this.schemeService
        .rejectScheme(scheme.id, reason)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) => `Scheme "${n}" rejected successfully.`,
                "Scheme rejected successfully.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openRequestArchiveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    this.reasonTitle = "Request Scheme Archive";
    this.reasonMessage = `Enter the reason for requesting archival of "${scheme.title}".`;
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
      this.schemeService
        .requestArchiveScheme(scheme.id, reason)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) => `Archive request for scheme "${n}" submitted to Admin.`,
                "Archive request submitted to Admin.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openApproveArchiveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can approve archive requests.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Approve Archive Request";
    this.confirmMessage = `Approve archival of "${scheme.title}"? Status will become ARCHIVED.`;
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
      this.schemeService
        .approveArchiveScheme(scheme.id)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) => `Scheme "${n}" archived successfully.`,
                "Scheme archived successfully.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openRejectArchiveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can reject archive requests.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Reject Archive Request";
    this.confirmMessage = `Reject archive request for "${scheme.title}"? The scheme will remain APPROVED.`;
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
      this.schemeService
        .rejectArchiveScheme(scheme.id)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) =>
                  `Archive request for scheme "${n}" rejected successfully.`,
                "Archive request rejected successfully.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openRequestDeleteModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    this.reasonTitle = "Request Scheme Deletion";
    this.reasonMessage = `Enter the reason for requesting deletion of "${scheme.title}".`;
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
      this.schemeService
        .requestDeleteScheme(scheme.id, reason)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) =>
                  `Deletion request for scheme "${n}" submitted successfully.`,
                "Deletion request submitted successfully.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openApproveDeleteModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can approve deletion.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Approve Deletion";
    this.confirmMessage = `Approve deletion of "${scheme.title}"? It will move to Deleted Schemes and can be restored within 30 days.\nDeletion reason: ${this.getReasonOrFallback(scheme.deleteReason)}`;
    this.confirmMessageBefore = "Approve deletion of ";
    this.confirmHighlight = scheme.title || "Untitled scheme";
    this.confirmMessageAfter = `? It will move to Deleted Schemes and can be restored within 30 days.\nDeletion reason: ${this.getReasonOrFallback(scheme.deleteReason)}`;
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
      // We remain on /dashboard/admin/schemes/manage and update the table in-place.
      this.schemeService
        .approveDeleteScheme(scheme.id)
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
              this.schemeToastMessage(
                null,
                scheme.title,
                (n) => `Deletion approved. Scheme "${n}" moved to Deleted Schemes.`,
                "Deletion approved. Scheme moved to Deleted Schemes.",
              ),
            );
            this.removeSchemeRow(scheme.id);
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

  openRejectDeleteModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can reject deletion.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Reject Delete Request";
    this.confirmMessage = `Reject delete request for "${scheme.title}"? The scheme will revert to its previous status.\nDeletion reason: ${this.getReasonOrFallback(scheme.deleteReason)}`;
    this.confirmMessageBefore = "Reject delete request for ";
    this.confirmHighlight = scheme.title || "Untitled scheme";
    this.confirmMessageAfter = `? The scheme will revert to its previous status.\nDeletion reason: ${this.getReasonOrFallback(scheme.deleteReason)}`;
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
      // /dashboard/admin/schemes/manage and update the row in-place.
      this.schemeService
        .rejectDeleteScheme(scheme.id)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) =>
                  `Deletion request for scheme "${n}" rejected successfully.`,
                "Deletion request rejected successfully.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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
   * Direct admin archive (POST /schemes/{id}/archive, APPROVED -> ARCHIVED).
   * Reuses the same existing endpoint as the scheme details page; the
   * government-official request/approval flow is untouched.
   */
  openArchiveModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can archive schemes.";
      this.cdr.detectChanges();
      return;
    }
    if (scheme.status !== "APPROVED") {
      this.errorMessage = "Only APPROVED schemes can be archived.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Archive Scheme";
    this.confirmMessage = `Are you sure you want to archive "${scheme.title}"? It will move to ARCHIVED and can be restored later.`;
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
      this.schemeService
        .archiveScheme(scheme.id)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) => `Scheme "${n}" archived successfully.`,
                "Scheme archived successfully.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openRestoreModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    if (!this.isAdmin) {
      this.errorMessage = "Only an administrator can restore schemes.";
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Restore Scheme";
    this.confirmMessage = `Restore "${scheme.title}" back to APPROVED state?`;
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
      this.schemeService
        .restoreScheme(scheme.id)
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
              this.schemeToastMessage(
                updated,
                scheme.title,
                (n) => `Scheme "${n}" restored to APPROVED.`,
                "Scheme restored to APPROVED.",
              ),
            );
            if (updated) {
              this.applySchemeUpdate(updated);
            } else {
              this.loadSchemes();
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

  openDirectDeleteModal(scheme: SchemeTableItem): void {
    this.closeMenu();
    // Direct deletion: Admins may delete from the existing set of
    // statuses; Government Officials may directly delete only DRAFT
    // schemes they created (other statuses keep the request workflow).
    // The backend enforces this authoritatively.
    if (!this.isAdmin) {
      const currentUserId = this.auth.getStoredUser()?.user_id;
      const ownsDraft =
        scheme.status === "DRAFT" &&
        currentUserId != null &&
        scheme.createdBy === currentUserId;
      if (!ownsDraft) {
        this.errorMessage =
          scheme.status === "DRAFT"
            ? "You can only delete draft schemes created by yourself."
            : "Only an administrator can delete schemes.";
        this.cdr.detectChanges();
        return;
      }
    }
    this.confirmTitle = "Delete Scheme";
    this.confirmMessage = `Delete "${scheme.title}"? It will move to Deleted Schemes and can be restored within 30 days.`;
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
      this.schemeService
        .deleteScheme(scheme.id)
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
              this.schemeToastMessage(
                null,
                scheme.title,
                (n) => `Scheme "${n}" moved to Deleted Schemes.`,
                "Scheme moved to Deleted Schemes.",
              ),
            );
            this.removeSchemeRow(scheme.id);
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
      `schemegpt-schemes-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
      `${pad(d.getHours())}${pad(d.getMinutes())}.${kind}`
    );
  }

  /** All records matching the current filters (every page, not just visible). */
  private exportRows(): string[][] {
    return this.filteredSchemes.map((p) => [
      String(p.id),
      p.title,
      p.description || "—",
      p.category || "—",
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
        "Name",
        "Description",
        "Category",
        "Ministry",
        "Department",
        "Status",
        "Created (IST)",
        "Updated (IST)",
      ];
      const widths = [0.05, 0.16, 0.2, 0.09, 0.1, 0.1, 0.08, 0.09, 0.1].map(
        (f) => Math.floor(f * usable),
      );
      let y = 48;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text("SchemeGPT", margin, y);
      y += 20;
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text("Government Scheme Register", margin, y);
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
      // Browser-managed download (never `doc.save()`: outside a real
      // browser it falls back to writing the file beside the project).
      downloadBlob(doc.output("blob"), this.exportFileStem("pdf"));
      this.showSuccessToast("Schemes exported as PDF.");
    } catch (err) {
      console.error("Failed to export schemes as PDF:", err);
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
        "Name",
        "Description",
        "Category",
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
        { wch: 20 },
        { wch: 24 },
        { wch: 24 },
        { wch: 18 },
        { wch: 22 },
        { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Schemes");
      // In-memory bytes + browser download (never `XLSX.writeFile()`,
      // which writes to disk when it detects Node instead of a browser).
      const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      downloadBlob(
        new Blob([bytes], { type: XLSX_MIME_TYPE }),
        this.exportFileStem("xlsx"),
      );
      this.showSuccessToast("Schemes exported as Excel.");
    } catch (err) {
      console.error("Failed to export schemes as Excel:", err);
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
  hasDistinctUpdate(scheme: SchemeTableItem): boolean {
    const created = scheme.createdAt ? new Date(scheme.createdAt) : null;
    const updated = scheme.updatedAt ? new Date(scheme.updatedAt) : null;
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

  trackByScheme(_index: number, scheme: SchemeTableItem): number {
    return scheme.id;
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
