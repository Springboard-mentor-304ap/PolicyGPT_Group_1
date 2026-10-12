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
import { SchemeService } from "../../../core/services/scheme.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { SchemeResponse } from "../../../core/models/scheme.model";

export type GovtDeletedSort = "newest" | "oldest" | "name-asc" | "name-desc";

/**
 * Government Official Deleted Schemes modal (read-only).
 *
 * Source of truth is GET /schemes/deleted. The backend scopes
 * non-admin callers to rows they created, so an official only ever
 * sees their own schemes that an administrator deleted. This view
 * offers search, sorting, and a View Details dialog only: restore
 * and permanent-delete actions are admin-only and are intentionally
 * absent here (the backend also rejects them with 403).
 */
@Component({
  selector: "app-govt-deleted-schemes-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  templateUrl: "./govt-deleted-schemes-modal.component.html",
  styleUrls: [
    "../deleted-schemes-modal/deleted-schemes-modal.component.scss",
  ],
  styles: [
    `
      .gdp-sort {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #64748b;
        white-space: nowrap;
      }
      .gdp-sort select {
        font-size: 12px;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 6px 8px;
        background: #fff;
      }
      .gdp-view-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 1px solid #e2e8f0;
        background: #fff;
        color: #475569;
        cursor: pointer;
      }
      .gdp-view-btn:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      .gdp-view-btn .material-icons {
        font-size: 18px;
      }
    `,
  ],
})
export class GovtDeletedSchemesModalComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  constructor(
    @Inject(SchemeService) private readonly schemeService: SchemeService,
    @Inject(ChangeDetectorRef) private readonly cdr: ChangeDetectorRef,
    @Inject(ToastService) private readonly toastService: ToastService,
  ) {}

  searchText = "";
  sortMode: GovtDeletedSort = "newest";
  loading = false;
  errorMessage = "";

  // Read-only details dialog (above this modal).
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
    this.sortMode = "newest";
    this.errorMessage = "";
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
    if (this.infoOpen) {
      this.closeInfo();
      return;
    }
    this.requestClose();
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.infoOpen) return;
    if ((event.target as HTMLElement).classList.contains("dp-overlay")) {
      this.requestClose();
    }
  }

  requestClose(): void {
    if (this.infoOpen) return;
    this.closed.emit();
  }

  /**
   * Load the official's own trash from the backend. The list endpoint
   * is the single source of truth: only the caller's own temporarily
   * deleted, restorable rows appear (backend-enforced).
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

  get filteredSortedRecords(): SchemeResponse[] {
    const search = this.searchText.toLowerCase().trim();
    const filtered = !search
      ? [...this.records]
      : this.records.filter((record) => {
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
    switch (this.sortMode) {
      case "oldest":
        filtered.sort(
          (a, b) => this.deletionTime(a) - this.deletionTime(b),
        );
        break;
      case "name-asc":
        filtered.sort((a, b) =>
          this.displayTitle(a).localeCompare(this.displayTitle(b), "en", {
            sensitivity: "base",
            numeric: true,
          }),
        );
        break;
      case "name-desc":
        filtered.sort((a, b) =>
          this.displayTitle(b).localeCompare(this.displayTitle(a), "en", {
            sensitivity: "base",
            numeric: true,
          }),
        );
        break;
      case "newest":
      default:
        filtered.sort(
          (a, b) => this.deletionTime(b) - this.deletionTime(a),
        );
        break;
    }
    return filtered;
  }

  private deletionTime(record: SchemeResponse): number {
    if (!record.deleted_at) return 0;
    const time = new Date(String(record.deleted_at)).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  clearSearch(): void {
    this.searchText = "";
    this.cdr.detectChanges();
  }

  setSort(mode: GovtDeletedSort): void {
    this.sortMode = mode;
    this.cdr.detectChanges();
  }

  displayTitle(record: SchemeResponse): string {
    return (record.name || "").trim() || "Title unavailable";
  }

  /** View: full retained details in a read-only dialog (above modal). */
  viewRecord(record: SchemeResponse): void {
    const rows: Array<{ label: string; value: string }> = [
      { label: "Scheme", value: this.displayTitle(record) },
      {
        label: "Description",
        value: (record.description || "").trim() || "Not available",
      },
      {
        label: "Status at deletion",
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
    if ((record.delete_reason || "").trim()) {
      rows.push({ label: "Deletion Reason", value: record.delete_reason!.trim() });
    }
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
