import { CommonModule } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { finalize, take } from "rxjs/operators";
import { SchemeService } from "../../../core/services/scheme.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { SchemeResponse } from "../../../core/models/scheme.model";

/**
 * Deleted Schemes modal: schemes in the trash (temporary deletion).
 *
 * Source of truth is GET /schemes/deleted — real rows with their
 * name, description, creator, status, and deletion actor/timestamp
 * intact — never reconstructed audit text. Every record listed here
 * is restorable; permanent deletion is an explicit, confirmed action.
 *
 * - View: read-only details from the row itself.
 * - Restore: POST /schemes/{id}/restore, then drop the row locally.
 * - Permanent Delete: DELETE /schemes/{id}/permanent, then drop it.
 * - 30-day auto-cleanup purges leftovers server-side; this modal never
 *   fakes those outcomes.
 */
@Component({
  selector: "app-deleted-schemes-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  templateUrl: "./deleted-schemes-modal.component.html",
  styleUrls: ["./deleted-schemes-modal.component.scss"],
})
export class DeletedSchemesModalComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  /**
   * Emitted after every successful restore / permanent deletion so the
   * parent register and statistics refresh when this modal closes.
   */
  @Output() dataChanged = new EventEmitter<void>();

  constructor(
    @Inject(SchemeService) private readonly schemeService: SchemeService,
    @Inject(ChangeDetectorRef) private readonly cdr: ChangeDetectorRef,
    @Inject(ToastService) private readonly toastService: ToastService,
  ) {}

  searchText = "";
  loading = false;
  errorMessage = "";

  // Three-dot row menu (fixed-position floating panel: the global
  // .cdk-overlay-container sits below this modal, and an in-flow panel
  // would be clipped by the scrolling list).
  menuOpenId: number | null = null;
  menuOpenRecord: SchemeResponse | null = null;
  menuStyle: { [key: string]: string } | null = null;

  // Nested confirmation dialog (above this modal).
  confirmModalOpen = false;
  confirmTitle = "";
  confirmMessage = "";
  confirmVariant: "primary" | "danger" | "warning" | "success" = "primary";
  confirmAction: (() => void) | null = null;
  confirmLoading = false;
  confirmErrorMessage: string | null = null;
  confirmText = "Confirm";

  // Retained-details read-only dialog (above this modal).
  infoOpen = false;
  infoTitle = "";
  infoMessage = "";
  infoDetails: Array<{ label: string; value: string }> = [];

  records: SchemeResponse[] = [];

  ngOnInit(): void {
    if (this.open) {
      this.onOpened();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["open"]) {
      if (this.open) {
        this.onOpened();
      } else {
        this.unlockBodyScroll();
      }
    }
  }

  ngOnDestroy(): void {
    this.unlockBodyScroll();
  }

  private onOpened(): void {
    this.searchText = "";
    this.errorMessage = "";
    this.closeMenu();
    this.confirmModalOpen = false;
    this.confirmAction = null;
    this.infoOpen = false;
    this.lockBodyScroll();
    this.loadDeleted();
  }

  private lockBodyScroll(): void {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
    }
  }

  private unlockBodyScroll(): void {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  }

  /**
   * Nested dialogs clear the body scroll lock when they close; re-assert
   * it while this modal is still open so the page behind never scrolls.
   */
  private relockBodyScroll(): void {
    if (!this.open) return;
    window.setTimeout(() => {
      if (this.open && typeof document !== "undefined") {
        document.body.style.overflow = "hidden";
      }
    }, 0);
  }

  @HostListener("document:keydown.escape")
  onEscapeKey(): void {
    if (!this.open) return;
    if (this.confirmModalOpen) return;
    if (this.infoOpen) {
      this.closeInfo();
      return;
    }
    if (this.menuOpenId !== null) {
      this.closeMenu();
      return;
    }
    this.requestClose();
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpenId === null) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.(".dp-float-menu, .dp-more-btn")) return;
    this.closeMenu();
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.confirmModalOpen || this.infoOpen) return;
    if ((event.target as HTMLElement).classList.contains("dp-overlay")) {
      this.requestClose();
    }
  }

  requestClose(): void {
    if (this.confirmModalOpen || this.infoOpen) return;
    this.closed.emit();
  }

  toggleMenu(record: SchemeResponse, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuOpenId === record.scheme_id) {
      this.closeMenu();
      return;
    }
    const button = event.currentTarget as HTMLElement | null;
    const rect = button?.getBoundingClientRect();
    const menuWidth = 240;
    const margin = 8;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1024;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 768;
    let left = (rect?.right ?? viewportWidth - margin) - menuWidth;
    left = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));
    const below = (rect?.bottom ?? 0) + 6;
    const estimatedMenuHeight = 220;
    let top: number;
    if (rect && below + estimatedMenuHeight > viewportHeight - margin) {
      top = Math.max(margin, rect.top - estimatedMenuHeight - 6);
    } else {
      top = below;
    }
    this.menuOpenId = record.scheme_id;
    this.menuOpenRecord = record;
    this.menuStyle = { top: `${top}px`, left: `${left}px` };
    this.cdr.detectChanges();
  }

  closeMenu(): void {
    if (this.menuOpenId === null && this.menuOpenRecord === null) return;
    this.menuOpenId = null;
    this.menuOpenRecord = null;
    this.menuStyle = null;
    this.cdr.detectChanges();
  }

  /**
   * Load the trash from the backend. The list endpoint is the single
   * source of truth: only temporarily deleted, restorable rows appear.
   */
  loadDeleted(): void {
    this.loading = true;
    this.errorMessage = "";
    this.cdr.detectChanges();
    this.schemeService.clearCache();
    this.schemeService.getDeletedSchemes(1, 100).subscribe({
      next: (response) => {
        this.records = Array.isArray(response?.schemes)
          ? response.schemes
          : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error("Failed to load deleted schemes:", error);
        this.records = [];
        this.errorMessage = this.getErrorMessage(error);
        this.loading = false;
        this.showLoadError();
        this.cdr.detectChanges();
      },
    });
  }

  private showLoadError(): void {
    try {
      this.toastService.error("Unable to complete action", this.errorMessage);
    } catch {
      // Inline banner still shows.
    }
  }

  get filteredRecords(): SchemeResponse[] {
    const search = this.searchText.toLowerCase().trim();
    if (!search) return this.records;
    return this.records.filter((record) => {
      const haystack = [
        record.name || "",
        String(record.scheme_id ?? ""),
        record.description || "",
        record.category || "",
        record.created_by_name || "",
        record.deleted_by_name || "",
        this.getStatusLabel(record.status),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  clearSearch(): void {
    this.searchText = "";
    this.cdr.detectChanges();
  }

  displayTitle(record: SchemeResponse): string {
    return (record.name || "").trim() || "Title unavailable";
  }

  /** View: full retained details in a read-only dialog (above modal). */
  viewRecord(record: SchemeResponse): void {
    this.closeMenu();
    const rows: Array<{ label: string; value: string }> = [
      { label: "Scheme", value: this.displayTitle(record) },
      {
        label: "Description",
        value: (record.description || "").trim() || "Not available",
      },
      {
        label: "Status",
        value: `${this.getStatusLabel(record.status)} (temporarily deleted)`,
      },
      {
        label: "Created By",
        value: (record.created_by_name || "").trim() || "Not available",
      },
      {
        label: "Deleted By",
        value: (record.deleted_by_name || "").trim() || "Not available",
      },
      { label: "Deleted At", value: this.formatDateTime(record.deleted_at) },
    ];
    if (record.delete_requested_by != null) {
      rows.push({
        label: "Requested By",
        value: (record.requested_by_name || "").trim() || "Not available",
      });
      if (record.delete_requested_at) {
        rows.push({
          label: "Requested At",
          value: this.formatDateTime(record.delete_requested_at),
        });
      }
    }
    this.infoTitle = "Deleted Scheme Details";
    this.infoDetails = rows;
    this.infoMessage = rows.map((row) => `${row.label}: ${row.value}`).join("\n");
    this.infoOpen = true;
    this.cdr.detectChanges();
  }

  closeInfo(): void {
    this.infoOpen = false;
    this.relockBodyScroll();
    this.cdr.detectChanges();
  }

  /** Restore a trashed row to the active set via the restore endpoint. */
  openRestoreModal(record: SchemeResponse): void {
    this.closeMenu();
    const schemeId = Number(record.scheme_id);
    this.confirmTitle = "Restore Scheme";
    this.confirmMessage =
      `Restore "${this.displayTitle(record)}" back to the active schemes? ` +
      `It will reappear with its original data.`;
    this.confirmVariant = "success";
    this.confirmText = "Restore";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      // Prevent duplicate submissions from repeated clicks.
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService
        .restoreScheme(schemeId)
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
            this.relockBodyScroll();
            const name = (updated?.name || record.name || "").trim();
            this.showSuccess(
              name
                ? `Scheme "${name}" restored successfully.`
                : "Scheme restored successfully.",
            );
            this.removeRecord(schemeId);
            this.dataChanged.emit();
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.confirmErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showFailure(errorMsg);
            this.cdr.detectChanges();
          },
        });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  /**
   * Permanently delete a trashed row. Live rows are rejected by the
   * backend; only trash rows reach this dialog.
   */
  openPermanentDeleteModal(record: SchemeResponse): void {
    this.closeMenu();
    const schemeId = Number(record.scheme_id);
    this.confirmTitle = "Permanently Delete Scheme";
    this.confirmMessage =
      `Permanently delete "${this.displayTitle(record)}"? This action is ` +
      `irreversible: the record and its history leave Deleted Schemes for good.`;
    this.confirmVariant = "danger";
    this.confirmText = "Delete Permanently";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService
        .permanentDeleteScheme(schemeId)
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
            this.relockBodyScroll();
            const name = (record.name || "").trim();
            this.showSuccess(
              name
                ? `Scheme "${name}" permanently deleted.`
                : "Scheme permanently deleted.",
            );
            this.removeRecord(schemeId);
            this.dataChanged.emit();
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.confirmErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showFailure(errorMsg);
            this.cdr.detectChanges();
          },
        });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  /** Drop a handled row locally without refetching the trash list. */
  private removeRecord(schemeId: number): void {
    this.records = this.records.filter((r) => Number(r.scheme_id) !== schemeId);
    if (this.menuOpenId === schemeId) {
      this.closeMenu();
    }
    this.cdr.detectChanges();
  }

  onConfirmModalConfirmed(): void {
    if (this.confirmLoading) return;
    if (this.confirmAction) {
      this.confirmAction();
    }
  }

  onConfirmModalCancelled(): void {
    if (this.confirmLoading) return;
    this.confirmModalOpen = false;
    this.confirmAction = null;
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmText = "Confirm";
    this.relockBodyScroll();
    this.cdr.detectChanges();
  }

  private showSuccess(message: string): void {
    try {
      this.toastService.success(message);
    } catch {
      // No inline banner in this modal; toast container is global.
    }
  }

  private showFailure(message: string): void {
    try {
      this.toastService.error("Unable to complete action", message);
    } catch {
      // Inline banner still shows.
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING_APPROVAL':
        return 'Pending Approval';
      case 'APPROVED':
        return 'Approved';
      case 'REJECTED':
        return 'Rejected';
      case 'DRAFT':
        return 'Draft';
      case 'ARCHIVED':
        return 'Archived';
      case 'ARCHIVE_REQUESTED':
        return 'Archive Requested';
      case 'DELETE_REQUESTED':
        return 'Delete Requested';
      default:
        return status ? status.replace(/_/g, ' ') : '';
    }
  }

  /** IST date + time for timestamps, or an em dash. */
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

  trackByRecord(_index: number, record: SchemeResponse): number {
    return Number(record.scheme_id);
  }

  private getErrorMessage(error: any): string {
    if (typeof error?.error?.detail === "string") return error.error.detail;
    if (error?.status === 401)
      return "Your session has expired. Please login again.";
    if (error?.status === 403)
      return "You do not have permission to perform this action.";
    if (error?.status === 404) return "Scheme not found.";
    if (error?.status === 0) return "Unable to connect to the backend server.";
    return error?.message || "Operation failed. Please try again.";
  }
}
