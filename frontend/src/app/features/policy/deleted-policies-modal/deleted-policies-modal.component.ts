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
import { forkJoin, of } from "rxjs";
import { catchError, finalize, map, take } from "rxjs/operators";
import { AuditLogService } from "../../../core/services/audit-log.service";
import { AuditLog } from "../../../core/models/audit-log.model";
import { PolicyService } from "../../../core/services/policy.service";
import { Auth } from "../../../core/services/auth";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";

export type DeletionKind = "REQUEST_APPROVED" | "DIRECT";

export interface DeletedRecordItem {
  auditId: number;
  /** Deleted policy's former ID. The row itself no longer exists. */
  policyId: number | null;
  kind: DeletionKind;
  /** Recovered original title, or null when no retained record holds it. */
  title: string | null;
  typeLabel: string;
  /** Human-readable explanation of the deletion source. */
  sourceText: string;
  /** Administrator who performed the deletion (approver / direct deleter). */
  adminName: string;
  /** Actual deletion timestamp (audit created_at). */
  deletedAt: string | null;
  deletedBy?: number | null;
  /** Government official who requested deletion (approved flow only). */
  requestedByName?: string | null;
  requestedAt?: string | null;
  /** Raw audit note for the completed deletion. */
  note: string;
}

/**
 * Deleted Policies modal: policies ACTUALLY deleted (permanent removal
 * completed), sourced from the existing audit trail — NOT from
 * DELETE_REQUESTED rows, which are only pending deletion requests that
 * still exist and stay in their approval workflow (Manage register and
 * policy details already provide approve/reject for those).
 *
 * Backend reality (verified in app/models, services/policy_service.py,
 * api/routes/policy.py — do not work around it):
 * - No DELETED status, soft-delete flag, or deletion-history snapshot
 *   table exists. Both permanent-delete paths
 *   (POST /policies/{id}/approve-delete and DELETE /policies/{id})
 *   physically remove the row.
 * - Completed deletions ARE recorded in audit_logs as
 *   POLICY_DELETE_APPROVED (request flow, user = approving admin) and
 *   POLICY_DELETED (direct admin delete), each with user_id, created_at
 *   and entity_id. This modal lists those events via the existing
 *   GET /audit-logs endpoint (server enforces auth; admins see all).
 * - Original title/description/ministry/department/category are NOT
 *   retained anywhere (no snapshot table; deletion audit descriptions
 *   carry only the policy ID). Titles are recovered only where a
 *   retained audit record states them (see buildRecords): the matching
 *   POLICY_DELETE_REQUESTED event ("Delete requested for policy
 *   'TITLE'.") for approved flows, else the latest titled lifecycle
 *   event (created / draft-saved / updated) for the same policy ID.
 *   delete_requested_by/_at describe the REQUEST, never deletion proof.
 * - A physically deleted row supports no View/Restore/Delete endpoint
 *   (all answer 404/400). The three-dot menu therefore calls the real
 *   workflow endpoints and surfaces the ACTUAL backend error instead of
 *   simulating success; nothing is restored from incomplete metadata.
 *
 * Personal scoping (records of the logged-in admin only) is applied to
 * the admin-visible feed. The backend has no admin-personal audit filter
 * (the user_id query param is deliberately ignored for scoping), so
 * without a backend change this scoping cannot be pushed server-side.
 * Minimal backend change if required: an explicit personal filter for
 * admins on GET /audit-logs.
 */
@Component({
  selector: "app-deleted-policies-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  templateUrl: "./deleted-policies-modal.component.html",
  styleUrls: ["./deleted-policies-modal.component.scss"],
})
export class DeletedPoliciesModalComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  /**
   Kept for parent compatibility. A completed-deletion record is
   * immutable through any existing endpoint, so this never emits.
   */
  @Output() dataChanged = new EventEmitter<void>();

  /** Audit actions that record a COMPLETED permanent policy deletion. */
  private static readonly DELETION_ACTIONS = [
    "POLICY_DELETE_APPROVED",
    "POLICY_DELETED",
  ];

  /** Retained audit actions used to correlate request history + titles. */
  private static readonly CONTEXT_ACTIONS = [
    "POLICY_DELETE_REQUESTED",
    "POLICY_CREATED",
    "POLICY_DRAFT_SAVED",
    "POLICY_UPDATED",
  ];

  constructor(
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
    @Inject(PolicyService) private readonly policyService: PolicyService,
    @Inject(Auth) private readonly auth: Auth,
    @Inject(ChangeDetectorRef) private readonly cdr: ChangeDetectorRef,
    @Inject(ToastService) private readonly toastService: ToastService,
  ) {}

  searchText = "";
  userRole: string | null = null;
  currentUserId: number | null = null;
  loading = false;
  errorMessage = "";

  // Three-dot row menu (fixed-position floating panel: the global
  // .cdk-overlay-container sits below this modal, and an in-flow panel
  // would be clipped by the scrolling list).
  menuOpenId: number | null = null;
  menuOpenRecord: DeletedRecordItem | null = null;
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

  records: DeletedRecordItem[] = [];

  get isAdmin(): boolean {
    return this.userRole === "ADMIN";
  }

  ngOnInit(): void {
    this.resolveRole();
    if (this.open) {
      this.onOpened();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["open"]) {
      if (this.open) {
        this.resolveRole();
        this.onOpened();
      } else {
        this.unlockBodyScroll();
      }
    }
  }

  ngOnDestroy(): void {
    this.unlockBodyScroll();
  }

  private resolveRole(): void {
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
    this.currentUserId = this.auth.getStoredUser()?.user_id ?? null;
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

  toggleMenu(record: DeletedRecordItem, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuOpenId === record.auditId) {
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
    this.menuOpenId = record.auditId;
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
   * Load completed deletions from the audit trail. Deletion events plus
   * request/title context events are queried server-filtered per action,
   * merged, correlated by policy ID, personal-scoped to the logged-in
   * administrator, and sorted newest-first.
   */
  loadDeleted(): void {
    this.loading = true;
    this.errorMessage = "";
    this.cdr.detectChanges();
    let failedFeeds = 0;
    let firstError: unknown = null;
    const actions = [
      ...DeletedPoliciesModalComponent.DELETION_ACTIONS,
      ...DeletedPoliciesModalComponent.CONTEXT_ACTIONS,
    ];
    const queries = actions.map((action) =>
      this.auditLogService
        .getAuditLogs({ action, entity_type: "POLICY", limit: 1000 })
        .pipe(
          catchError((err) => {
            // One feed failing must not hide the other records.
            failedFeeds++;
            firstError = firstError ?? err;
            return of([] as AuditLog[]);
          }),
        ),
    );
    forkJoin(queries)
      .pipe(map((pages) => this.buildRecords(pages.flat())))
      .subscribe({
        next: (records) => {
          if (records.length === 0 && failedFeeds === queries.length) {
            this.records = [];
            this.errorMessage = this.getErrorMessage(firstError);
            this.showLoadError();
          } else {
            this.records = records;
            this.errorMessage = "";
          }
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error("Failed to load deleted policies:", error);
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

  /**
   * Correlate deletion events with retained request/title history by
   * policy ID. Only the logged-in administrator's own deletion records
   * are kept. DELETE_REQUESTED entries are context only — never listed
   * as completed deletions.
   */
  private buildRecords(entries: AuditLog[]): DeletedRecordItem[] {
    const deletions = entries.filter((entry) =>
      DeletedPoliciesModalComponent.DELETION_ACTIONS.includes(
        String(entry.action || "").toUpperCase(),
      ),
    );
    const byPolicy = new Map<number, AuditLog[]>();
    for (const entry of entries) {
      if (entry.entity_id === null || entry.entity_id === undefined) continue;
      const id = Number(entry.entity_id);
      if (!byPolicy.has(id)) byPolicy.set(id, []);
      byPolicy.get(id)?.push(entry);
    }
    const records = deletions
      .filter((entry) =>
        this.currentUserId != null
          ? entry.user_id === this.currentUserId
          : true,
      )
      .map((entry) => this.toItem(entry, byPolicy));
    records.sort((a, b) =>
      String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")),
    );
    return records;
  }

  private toItem(
    entry: AuditLog,
    byPolicy: Map<number, AuditLog[]>,
  ): DeletedRecordItem {
    const action = String(entry.action || "").toUpperCase();
    const kind: DeletionKind =
      action === "POLICY_DELETE_APPROVED" ? "REQUEST_APPROVED" : "DIRECT";
    const policyId =
      entry.entity_id === null || entry.entity_id === undefined
        ? null
        : Number(entry.entity_id);
    const history =
      policyId !== null ? (byPolicy.get(policyId) ?? []) : [];
    const request = history
      .filter((e) => String(e.action || "").toUpperCase() === "POLICY_DELETE_REQUESTED")
      .sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      )[0];
    const requestedTitle = request
      ? this.parseRequestedTitle(request.description)
      : null;
    const title =
      requestedTitle ?? this.latestLifecycleTitle(history) ?? null;
    const requestedByName = request
      ? (request.user_name || "").trim() || "Government Official"
      : null;
    const requestedAt = request?.created_at || null;
    return {
      auditId: Number(entry.audit_id),
      policyId,
      kind,
      title,
      typeLabel:
        kind === "REQUEST_APPROVED"
          ? "Government Deletion Request"
          : "Direct Admin Deletion",
      sourceText:
        kind === "REQUEST_APPROVED"
          ? requestedByName
            ? `Deleted after a deletion request by ${requestedByName} was approved by an administrator.`
            : "Deleted after a government official's deletion request was approved by an administrator."
          : "Deleted directly by an administrator (request workflow bypassed).",
      adminName: (entry.user_name || "").trim() || "Administrator",
      deletedAt: entry.created_at || null,
      deletedBy: entry.user_id,
      requestedByName,
      requestedAt,
      note: (entry.description || "").trim(),
    };
  }

  /** "Delete requested for policy 'TITLE'." — exact retained title. */
  private parseRequestedTitle(description?: string | null): string | null {
    const text = (description || "").trim();
    if (!text) return null;
    const match = /^Delete requested for policy '(.*)'\.\s*$/.exec(text);
    const title = match?.[1]?.trim();
    return title ? title : null;
  }

  /**
   * Latest title from retained lifecycle events ("Policy 'T' created.",
   * "Policy draft 'T' saved.", "Policy 'T' updated."). Title changes only
   * flow through create/update, so the newest such record holds the final
   * title; null when nothing retained states one.
   */
  private latestLifecycleTitle(history: AuditLog[]): string | null {
    const candidates = history
      .filter((e) =>
        ["POLICY_CREATED", "POLICY_DRAFT_SAVED", "POLICY_UPDATED"].includes(
          String(e.action || "").toUpperCase(),
        ),
      )
      .sort((a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      );
    for (const candidate of candidates) {
      const title = this.parseLifecycleTitle(candidate.description);
      if (title) return title;
    }
    return null;
  }

  private parseLifecycleTitle(description?: string | null): string | null {
    const text = (description || "").trim();
    if (!text) return null;
    const match = /^(?:Policy draft|Policy) '(.*)' (?:created|saved|updated)\.\s*$/.exec(
      text,
    );
    const title = match?.[1]?.trim();
    return title ? title : null;
  }

  get filteredRecords(): DeletedRecordItem[] {
    const search = this.searchText.toLowerCase().trim();
    if (!search) return this.records;
    return this.records.filter((record) => {
      const haystack = [
        record.title || "",
        record.policyId !== null ? `policy #${record.policyId}` : "",
        String(record.policyId ?? ""),
        record.typeLabel,
        record.sourceText,
        record.note,
        record.adminName,
        record.requestedByName || "",
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

  displayTitle(record: DeletedRecordItem): string {
    return record.title || (record.policyId !== null ? `Policy #${record.policyId}` : "Deleted policy");
  }

  /** View: retained policy details in a read-only dialog (above modal). */
  viewRecord(record: DeletedRecordItem): void {
    this.closeMenu();
    const lines = [
      `Policy: ${this.displayTitle(record)}`,
      record.policyId !== null ? `Policy ID: ${record.policyId}` : null,
      `Deletion type: ${record.typeLabel}.`,
      record.sourceText,
      `Deleted: ${this.formatDateTime(record.deletedAt)} by ${record.adminName}.`,
      record.requestedByName
        ? `Requested by ${record.requestedByName} on ${this.formatDateTime(record.requestedAt)}.`
        : null,
      record.note ? `Record note: ${record.note}` : null,
      "Description, ministry, department and category were not retained by the backend for deleted policies.",
    ].filter((line): line is string => line !== null);
    this.infoTitle = "Deleted Policy Details";
    this.infoMessage = lines.join("\n");
    this.infoOpen = true;
    this.cdr.detectChanges();
  }

  closeInfo(): void {
    this.infoOpen = false;
    this.relockBodyScroll();
    this.cdr.detectChanges();
  }

  /**
   * Restore a completed deletion via the existing backend workflow. The
   * record no longer exists, so the real endpoint answers with its
   * actual error (surfaced, never simulated); on the impossible-but-
   * handled success path the list refreshes.
   */
  openRestoreModal(record: DeletedRecordItem): void {
    this.closeMenu();
    const usesRejectFlow = record.kind === "REQUEST_APPROVED";
    this.confirmTitle = "Restore Policy";
    this.confirmMessage =
      `"${this.displayTitle(record)}" was permanently deleted on ` +
      `${this.formatDateTime(record.deletedAt)} and no longer exists in the database. ` +
      `Restoring calls the existing ${usesRejectFlow ? "reject-delete" : "restore"} endpoint ` +
      `for policy #${record.policyId ?? "unknown"}. Continue to attempt it?`;
    this.confirmVariant = "success";
    this.confirmText = "Restore";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading || record.policyId === null) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      const call = usesRejectFlow
        ? this.policyService.rejectDelete(record.policyId)
        : this.policyService.restore(record.policyId);
      call
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
          this.showSuccess("Policy restored.");
          this.loadDeleted();
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
   * Permanent deletion of an already-deleted record via the existing
   * permanent-deletion API matching its deletion type. The backend
   * answers with its actual error (already gone); surfaced, not faked.
   */
  openPermanentDeleteModal(record: DeletedRecordItem): void {
    this.closeMenu();
    this.confirmTitle = "Permanently Delete Policy";
    this.confirmMessage =
      `Permanently delete "${this.displayTitle(record)}"? This action is irreversible. ` +
      `Note: this record was already permanently deleted on ` +
      `${this.formatDateTime(record.deletedAt)}; the existing permanent-deletion API ` +
      `will confirm whether anything remains to delete.`;
    this.confirmVariant = "danger";
    this.confirmText = "Delete Permanently";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading || record.policyId === null) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      const call =
        record.kind === "REQUEST_APPROVED"
          ? this.policyService.approveDelete(record.policyId)
          : this.policyService.deletePolicy(record.policyId);
      call
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
          this.showSuccess("Policy permanently deleted.");
          this.loadDeleted();
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
      this.toastService.success("Action completed", message);
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

  /** IST date + time for the actual deletion timestamp, or an em dash. */
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

  trackByRecord(_index: number, record: DeletedRecordItem): number {
    return record.auditId;
  }

  private getErrorMessage(error: any): string {
    if (typeof error?.error?.detail === "string") return error.error.detail;
    if (error?.status === 401)
      return "Your session has expired. Please login again.";
    if (error?.status === 403)
      return "You do not have permission to perform this action.";
    if (error?.status === 404) return "Policy not found.";
    if (error?.status === 0) return "Unable to connect to the backend server.";
    return error?.message || "Operation failed. Please try again.";
  }
}
