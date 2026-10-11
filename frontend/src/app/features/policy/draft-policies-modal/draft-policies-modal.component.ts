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
import { Router } from "@angular/router";
import { finalize, take } from "rxjs";
import { PolicyService } from "../../../core/services/policy.service";
import { Auth } from "../../../core/services/auth";
import { ToastService } from "../../../core/services/toast.service";
import {
  PolicyListResponse,
  PolicyResponse,
} from "../../../core/models/policy.model";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { ReasonModalComponent } from "../../../shared/components/reason-modal/reason-modal.component";

export interface DraftPolicyItem {
  id: number;
  title: string;
  description: string;
  category: string;
  ministry: string;
  department: string;
  sector: string;
  status: string;
  createdBy?: number | null;
  updatedAt?: string | null;
}

/**
 * Draft Policies modal, opened centered over Manage Policies.
 *
 * - View/Edit reuses the existing details page and edit form so the
 *   selected policy opens with its existing data.
 * - Submit reuses POST /policies/{id}/submit (DRAFT -> PENDING_APPROVAL).
 * - Delete reuses the existing direct-deletion workflow
 *   (DELETE /policies/{id}, admin only). No new deletion status is
 *   invented. Government officials cannot delete via any existing
 *   backend API (DELETE is ADMIN-only; request-delete only allows
 *   APPROVED/ARCHIVED), so non-admin delete attempts surface the
 *   permission error instead of simulating success.
 *
 * Overlay styling matches the existing Delete Policy confirmation dialog.
 * Nested confirmations reuse ConfirmModalComponent (higher z-index).
 */
@Component({
  selector: "app-draft-policies-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent, ReasonModalComponent],
  templateUrl: "./draft-policies-modal.component.html",
  styleUrls: ["./draft-policies-modal.component.scss"],
})
export class DraftPoliciesModalComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() dataChanged = new EventEmitter<void>();

  constructor(
    @Inject(PolicyService) private readonly policyService: PolicyService,
    @Inject(Router) private readonly router: Router,
    @Inject(Auth) private readonly auth: Auth,
    @Inject(ChangeDetectorRef) private readonly cdr: ChangeDetectorRef,
    @Inject(ToastService) private readonly toastService: ToastService,
  ) {}

  searchText = "";
  userRole: string | null = null;
  loading = false;
  errorMessage = "";
  successMessage: string | null = null;
  private successTimer: ReturnType<typeof window.setTimeout> | null = null;

  // Latest list request only: older in-flight responses are ignored so a
  // slow stale response can never overwrite newer results or state set
  // after the modal closed. Set once the component is torn down.
  private loadSeq = 0;
  private destroyed = false;
  // ngOnInit and ngOnChanges both fire on first open; load exactly once
  // per open session (reset when the modal closes).
  private openLoadStarted = false;

  // Three-dot row menu state. The menu is rendered as a fixed-position
  // floating panel (NOT a CDK overlay: the global .cdk-overlay-container
  // sits below this modal, and an in-flow panel would be clipped by the
  // scrolling list), positioned from the trigger button's rect.
  menuOpenId: number | null = null;
  menuOpenPolicy: DraftPolicyItem | null = null;
  menuStyle: { [key: string]: string } | null = null;

  confirmModalOpen = false;
  confirmTitle = "";
  confirmMessage = "";
  confirmVariant: "primary" | "danger" | "warning" | "success" = "primary";
  confirmAction: (() => void) | null = null;
  confirmLoading = false;
  confirmErrorMessage: string | null = null;
  confirmText = "Confirm";
  // Structured submit-confirmation message parts (bold policy title).
  confirmMessageBefore = "";
  confirmHighlight = "";
  confirmMessageAfter = "";

  // Government Official deletion-request dialog (existing request-delete
  // workflow: reason + POST /policies/{id}/request-delete).
  reasonModalOpen = false;
  reasonTitle = "";
  reasonMessage = "";
  reasonLabel = "Reason";
  reasonVariant: "primary" | "danger" | "warning" = "danger";
  reasonAction: ((reason: string) => void) | null = null;
  reasonLoading = false;
  reasonErrorMessage: string | null = null;

  policies: DraftPolicyItem[] = [];

  get isAdmin(): boolean {
    return this.userRole === "ADMIN";
  }

  get rolePrefix(): string {
    return this.isAdmin ? "admin" : "government";
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
        this.openLoadStarted = false;
        this.unlockBodyScroll();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unlockBodyScroll();
    if (this.successTimer !== null) {
      window.clearTimeout(this.successTimer);
      this.successTimer = null;
    }
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
  }

  private onOpened(): void {
    // ngOnInit and ngOnChanges both fire on first open; never start a
    // second fetch for the same open session.
    if (this.openLoadStarted) return;
    this.openLoadStarted = true;
    this.searchText = "";
    this.errorMessage = "";
    this.successMessage = null;
    this.confirmModalOpen = false;
    this.confirmAction = null;
    this.clearHighlight();
    this.reasonModalOpen = false;
    this.reasonAction = null;
    this.closeMenu();
    // Drop the previous session's rows so stale cards never render as
    // though the new request already completed.
    this.policies = [];
    this.lockBodyScroll();
    this.loadPolicies();
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
   * The nested confirmation dialog clears the body scroll lock when it
   * closes; re-assert it while this modal is still open so the page
   * behind never scrolls.
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
    if (this.menuOpenId !== null) {
      this.closeMenu();
      return;
    }
    if (this.confirmModalOpen) return;
    if (this.reasonModalOpen) {
      this.onReasonModalCancelled();
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

  toggleMenu(policy: DraftPolicyItem, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuOpenId === policy.id) {
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
    this.menuOpenId = policy.id;
    this.menuOpenPolicy = policy;
    this.menuStyle = { top: `${top}px`, left: `${left}px` };
    this.cdr.detectChanges();
  }

  closeMenu(): void {
    if (this.menuOpenId === null && this.menuOpenPolicy === null) return;
    this.menuOpenId = null;
    this.menuOpenPolicy = null;
    this.menuStyle = null;
    this.cdr.detectChanges();
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.confirmModalOpen || this.reasonModalOpen) return;
    if ((event.target as HTMLElement).classList.contains("dp-overlay")) {
      this.requestClose();
    }
  }

  requestClose(): void {
    if (this.confirmModalOpen || this.reasonModalOpen) return;
    this.closed.emit();
  }

  showSuccess(message: string): void {
    // Single user-facing notification per operation via the shared
    // toast service (top-right). successMessage is retained only for
    // existing specs; it is no longer rendered inline to avoid a
    // duplicate banner + toast for the same operation. Each caller
    // passes a distinct, record-specific sentence — never a generic
    // shared title — so different actions never show identical text.
    this.successMessage = message;
    try {
      this.toastService.success(message);
    } catch {
      // Inline banner still shows when the global container is unavailable.
    }
    if (this.successTimer !== null) {
      window.clearTimeout(this.successTimer);
    }
    this.successTimer = window.setTimeout(() => {
      this.successMessage = null;
      this.successTimer = null;
      this.cdr.detectChanges();
    }, 3500);
    this.cdr.detectChanges();
  }

  private showError(message: string): void {
    try {
      this.toastService.error("Unable to complete action", message);
    } catch {
      // Ignore when toast container is unavailable.
    }
  }

  /**
   * Record name for toast messages, preferring the authoritative name
   * from the API response with the row's title as fallback. Returns
   * null when no usable name exists.
   */
  private draftToastName(
    updated?: { title?: string | null } | null,
    fallback?: string | null,
  ): string | null {
    const raw =
      typeof updated?.title === "string" && updated.title.trim()
        ? updated.title
        : (fallback ?? "");
    const name = String(raw).trim();
    return name ? name : null;
  }

  loadPolicies(): void {
    const seq = ++this.loadSeq;
    this.loading = true;
    this.errorMessage = "";
    this.cdr.detectChanges();
    this.policyService.clearCache();
    // Fetch per logged-in permissions (manage=true honours the backend
    // role rule) and keep only DRAFT rows. No mock data.
    this.policyService
      .getPolicies({ page: 1, limit: 100, manage: true })
      .subscribe({
        next: (response: PolicyListResponse) => {
          // Ignore stale responses and late arrivals after teardown.
          if (this.destroyed || seq !== this.loadSeq) return;
          const currentUserId = this.auth.getStoredUser()?.user_id;
          let source = Array.isArray(response?.policies)
            ? response.policies
            : [];
          if (!this.isAdmin && currentUserId) {
            source = source.filter(
              (p: PolicyResponse) => p.created_by === currentUserId,
            );
          }
          this.policies = source
            .filter(
              (p: PolicyResponse) =>
                String(p.status || "").toUpperCase() === "DRAFT",
            )
            .map((p: PolicyResponse) => this.toItem(p));
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          if (this.destroyed || seq !== this.loadSeq) return;
          console.error("Failed to load draft policies:", error);
          this.policies = [];
          this.errorMessage = this.getErrorMessage(error);
          this.loading = false;
          this.cdr.detectChanges();
        },
      });
  }

  private toItem(policy: PolicyResponse): DraftPolicyItem {
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
      updatedAt: policy.updated_at || null,
    };
  }

  get filteredPolicies(): DraftPolicyItem[] {
    const search = this.searchText.toLowerCase().trim();
    if (!search) return this.policies;
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
      return haystack.includes(search);
    });
  }

  clearSearch(): void {
    this.searchText = "";
    this.cdr.detectChanges();
  }

  /** View: existing policy details page with the selected policy's data. */
  viewPolicy(policy: DraftPolicyItem): void {
    this.closeMenu();
    const target = ["/dashboard", this.rolePrefix, "policies", policy.id];
    this.closed.emit();
    this.router.navigate(target);
  }

  /** Edit: existing edit form with the selected policy's existing data. */
  editPolicy(policy: DraftPolicyItem): void {
    this.closeMenu();
    const target = [
      "/dashboard",
      this.rolePrefix,
      "policies",
      "edit",
      policy.id,
    ];
    this.closed.emit();
    this.router.navigate(target);
  }

  canSubmitPolicy(policy: DraftPolicyItem): boolean {
    if (policy.status !== "DRAFT") return false;
    if (this.isAdmin) return true;
    const currentUserId = this.auth.getStoredUser()?.user_id;
    return Boolean(currentUserId && policy.createdBy === currentUserId);
  }

  /** Submit a DRAFT into the approval workflow (DRAFT -> PENDING_APPROVAL). */
  openSubmitModal(policy: DraftPolicyItem): void {
    this.closeMenu();
    if (!this.canSubmitPolicy(policy)) {
      this.errorMessage =
        "You are not authorized to submit this policy. Only the user who created it can submit it for approval.";
      this.showError(this.errorMessage);
      this.cdr.detectChanges();
      return;
    }
    this.confirmTitle = "Submit Policy";
    // Role-specific confirmation copy. The title renders as a separate
    // bold element with no quotation marks; the confirm button names the
    // action each role actually performs. API behavior is unchanged.
    const policyName = policy.title || "Untitled Policy";
    if (this.isAdmin) {
      this.confirmMessageBefore = "You are about to publish ";
      this.confirmHighlight = policyName;
      this.confirmMessageAfter =
        ". Upon confirmation, it will be published on the PolicyGPT platform.";
      this.confirmText = "Publish Policy";
    } else {
      this.confirmMessageBefore = "You are about to submit ";
      this.confirmHighlight = policyName;
      this.confirmMessageAfter =
        " to the Admin for review and approval. The policy will be " +
        "published only after approval.";
      this.confirmText = "Submit Policy";
    }
    this.confirmMessage =
      `${this.confirmMessageBefore}${policyName}${this.confirmMessageAfter}`;
    this.confirmVariant = "primary";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
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
            this.clearHighlight();
            // Backend-returned status drives messaging: an Admin submit
            // lands APPROVED directly, a Government Official submit
            // PENDING_APPROVAL. The single submitPolicy call above already
            // persisted it — no modal reload, no follow-up popup. Toast
            // globally, let the parent refresh, close, and navigate now.
            const approved =
              String(updated?.status || "").toUpperCase() === "APPROVED";
            const draftName = this.draftToastName(updated, policy.title);
            if (approved) {
              this.showSuccess(
                draftName
                  ? this.isAdmin
                    ? `Policy "${draftName}" published successfully.`
                    : `Policy "${draftName}" submitted and approved.`
                  : this.isAdmin
                    ? "Policy published successfully."
                    : "Policy submitted and approved.",
              );
            } else {
              this.showSuccess(
                draftName
                  ? this.isAdmin
                    ? `Policy "${draftName}" submitted successfully.`
                    : `Policy "${draftName}" submitted for approval.`
                  : this.isAdmin
                    ? "Policy submitted successfully."
                    : "Policy submitted for approval.",
              );
            }
            this.dataChanged.emit();
            this.closed.emit();
            this.router.navigate([
              "/dashboard",
              this.rolePrefix,
              "policies",
              "manage",
            ]);
          },
          error: (err) => {
            // Stay in the modal with the real backend error; the user can
            // retry (the backend re-validates eligibility, so no blind
            // duplicate is possible) or cancel with context intact.
            const errorMsg = this.getErrorMessage(err);
            this.confirmErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showError(errorMsg);
            this.cdr.detectChanges();
          },
        });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  /**
   * Delete a DRAFT using the existing deletion workflow
   * (DELETE /policies/{id}, admin only). No new status is introduced
   * and approval rules are not bypassed: the row is permanently removed.
   */
  /**
   * Delete Policy from the dropdown (both roles).
   * - Admin: existing direct-deletion workflow (DELETE /policies/{id}).
   * - Government Official: existing deletion-request workflow (reason +
   *   POST /policies/{id}/request-delete). The backend only permits
   *   requests for APPROVED/ARCHIVED policies, so a draft request
   *   surfaces the real backend error — never a simulated success, and
   *   no admin-only permanent delete is granted.
   */
  openDeleteModal(policy: DraftPolicyItem): void {
    this.closeMenu();
    this.clearHighlight();
    if (!this.isAdmin) {
      this.openDeleteRequestModal(policy);
      return;
    }
    this.confirmTitle = "Delete Draft Policy";
    this.confirmMessage =
      `Move draft "${policy.title}" to Deleted Policies? It will be ` +
      `hidden from active views and can be restored within 30 days.`;
    this.confirmVariant = "danger";
    this.confirmText = "Delete";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
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
            this.clearHighlight();
            this.relockBodyScroll();
            const deletedName = this.draftToastName(null, policy.title);
            this.showSuccess(
              deletedName
                ? `Policy "${deletedName}" moved to Deleted Policies.`
                : "Draft policy moved to Deleted Policies.",
            );
            this.loadPolicies();
            this.dataChanged.emit();
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.confirmErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showError(errorMsg);
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
    this.clearHighlight();
    this.relockBodyScroll();
    this.cdr.detectChanges();
  }

  /** Structured message parts belong to the submit dialog only. */
  private clearHighlight(): void {
    this.confirmMessageBefore = "";
    this.confirmHighlight = "";
    this.confirmMessageAfter = "";
  }

  /**
   * Government Official deletion-request workflow for a draft: reason
   * dialog + POST /policies/{id}/request-delete. On backend confirmation
   * the policy becomes DELETE_REQUESTED (admin approval pending), leaves
   * this draft list on reload, and statistics refresh. Backend refusals
   * (e.g. drafts are ineligible for deletion requests) surface verbatim.
   */
  private openDeleteRequestModal(policy: DraftPolicyItem): void {
    this.reasonTitle = "Request Policy Deletion";
    this.reasonMessage =
      `Enter the reason for requesting deletion of draft "${policy.title}". ` +
      `An administrator must approve the request before anything is deleted.`;
    this.reasonLabel = "Deletion Reason";
    this.reasonVariant = "danger";
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.reasonAction = (reason: string) => {
      if (this.reasonLoading) return;
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
          next: () => {
            this.reasonModalOpen = false;
            this.reasonAction = null;
            this.reasonErrorMessage = null;
            this.relockBodyScroll();
            const requestName = this.draftToastName(null, policy.title);
            this.showSuccess(
              requestName
                ? `Deletion request for policy "${requestName}" submitted successfully.`
                : "Delete request submitted to Admin.",
            );
            this.loadPolicies();
            this.dataChanged.emit();
          },
          error: (err) => {
            const errorMsg = this.getErrorMessage(err);
            this.reasonErrorMessage = errorMsg;
            this.errorMessage = errorMsg;
            this.showError(errorMsg);
            this.cdr.detectChanges();
          },
        });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  onReasonModalConfirmed(reason: string): void {
    if (this.reasonLoading) return;
    if (this.reasonAction) {
      this.reasonAction(reason);
    }
  }

  onReasonModalCancelled(): void {
    if (this.reasonLoading) return;
    this.reasonModalOpen = false;
    this.reasonAction = null;
    this.reasonLoading = false;
    this.reasonErrorMessage = null;
    this.relockBodyScroll();
    this.cdr.detectChanges();
  }

  formatDate(value?: string | null): string {
    if (!value) return "Not available";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Not available";
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  trackByPolicy(_index: number, policy: DraftPolicyItem): number {
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
