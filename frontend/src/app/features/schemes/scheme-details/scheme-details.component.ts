import {
  Component,
  OnInit,
  inject,
  ChangeDetectorRef,
  HostListener,
} from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { catchError, finalize, of } from "rxjs";

import { SchemeService, Scheme } from "../../../core/services/scheme.service";
import { SavedItemsService } from "../../../core/services/saved-items.service";
import { ToastService } from "../../../core/services/toast.service";
import { Auth } from "../../../core/services/auth";
import { PermissionService } from "../../../core/services/permission.service";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { ReasonModalComponent } from "../../../shared/components/reason-modal/reason-modal.component";
import { WorkflowTimelineComponent } from "../../../shared/components/workflow-timeline/workflow-timeline.component";
import type { AuditLog } from "../../../core/models/audit-log.model";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";
import {
  CategoryInput,
  getCategoryIconName,
  getCategoryIconStyle,
} from "../../../core/utils/category-icon.util";

interface EligibilityRule {
  rule_id: number;
  scheme_id?: number | null;
  min_age: number | null;
  max_age: number | null;
  gender: string | null;
  max_income: number | null;
  occupation: string | null;
  education: string | null;
  state: string | null;
  social_category: string | null;
  disability_status: boolean | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

@Component({
  selector: "app-scheme-details",
  standalone: true,
  imports: [
    CommonModule,
    ConfirmModalComponent,
    ReasonModalComponent,
    BreadcrumbComponent,
    WorkflowTimelineComponent,
  ],
  templateUrl: "./scheme-details.component.html",
  styleUrls: ["./scheme-details.component.scss"],
})
export class SchemeDetailsComponent implements OnInit {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly schemeService = inject(SchemeService);
  private readonly savedItemsService = inject(SavedItemsService);
  private readonly toastService = inject(ToastService);
  private readonly auth = inject(Auth);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  activeTab: "overview" | "eligibility" | "benefits" | "documents" = "overview";

  schemeId: string | null = null;
  schemeIdNum: number | null = null;
  scheme: Scheme | null = null;
  eligibilityRules: EligibilityRule[] = [];

  bookmarked = false;
  bookmarkLoading = true;

  /** Local mirror key shared with Scheme Search for staff roles. */
  private readonly bookmarkStorageKey = "bookmarked_schemes";

  loading = false;
  eligibilityLoading = false;
  errorMessage = "";
  eligibilityError = "";

  /*
   * Workflow three-dot menu
   */
  workflowMenuOpen = false;

  /*
   * Workflow confirmation and reason modals
   */
  confirmModalOpen = false;
  confirmTitle = "";
  confirmMessage = "";
  confirmVariant: "primary" | "danger" | "warning" | "success" = "primary";
  confirmAction: (() => void) | null = null;
  confirmLoading = false;
  confirmErrorMessage: string | null = null;

  reasonModalOpen = false;
  reasonTitle = "";
  reasonMessage = "";
  reasonLabel = "Reason";
  reasonVariant: "primary" | "danger" | "warning" = "danger";
  reasonAction: ((reason: string) => void) | null = null;

  get userRole(): string {
    return String(this.auth.getUserRole() || "")
      .trim()
      .toUpperCase();
  }

  get isAdmin(): boolean {
    return this.userRole === "ADMIN" || this.userRole === "ADMINISTRATOR";
  }

  get isGov(): boolean {
    return (
      this.userRole === "GOVERNMENT_OFFICIAL" ||
      this.userRole === "GOVERNMENT OFFICIAL" ||
      this.userRole === "GOVERNMENT"
    );
  }

  get canViewAudit(): boolean {
    return this.isAdmin || this.isGov;
  }

  /**
   * Roles with API-backed saved items (mirrors Scheme Search).
   * Admin/Government use the shared local mirror; guests keep the
   * existing API behavior.
   */
  private get canUseSavedItems(): boolean {
    return (
      this.userRole === "CITIZEN" ||
      this.userRole === "RESEARCHER" ||
      this.userRole === "ORGANIZATION" ||
      this.userRole === "ORGANISATION"
    );
  }

  /**
   * Public roles (Citizen, Researcher, Organization, Guest) never see
   * internal workflow statuses (badges/banners). Admin and Government
   * Official retain full visibility.
   */
  get isPublicRole(): boolean {
    return this.permissions.isPublicRole(this.userRole);
  }

  get rolePrefix(): string {
    if (this.isAdmin) return "admin";
    if (this.isGov) return "government";
    const r = this.userRole;
    if (r === "RESEARCHER") return "researcher";
    if (r === "ORGANIZATION" || r === "ORGANISATION") return "organization";
    if (r === "GUEST") return "guest";
    return "citizen";
  }

  /** Breadcrumb trail: Home > Schemes > Scheme Details (hidden on guest view). */
  get breadcrumbItems(): BreadcrumbItem[] {
    if (this.userRole === "GUEST") {
      return [];
    }
    const schemesRoute = this.isAdmin
      ? ["/dashboard", "admin", "schemes", "search"]
      : this.isGov
        ? ["/dashboard", "government", "schemes", "search"]
        : ["/dashboard", this.rolePrefix, "schemes"];
    return [
      { label: "Home", route: ["/dashboard", this.rolePrefix] },
      { label: "Schemes", route: schemesRoute },
      { label: "Scheme Details" },
    ];
  }

  getCreatorDisplayName(userId: number | null | undefined): string {
    const live = String(this.scheme?.created_by_name ?? "").trim();
    if (live) return live;
    if (!userId) return "Unknown User";
    const current = this.auth.getStoredUser();
    if (current && current.user_id === userId && current.full_name) {
      return current.full_name;
    }
    return "Unknown User";
  }

  getCreatorRole(): string {
    return this.formatRoleLabel(this.scheme?.created_by_role);
  }

  getApproverDisplayName(userId: number | null | undefined): string {
    const live = String(this.scheme?.approved_by_name ?? "").trim();
    if (live) return live;
    if (!userId) return "Pending Review";
    const current = this.auth.getStoredUser();
    if (current && current.user_id === userId && current.full_name) {
      return current.full_name;
    }
    return "Unknown User";
  }

  getApproverRole(): string {
    if (!this.scheme?.approved_by) return "";
    return this.formatRoleLabel(this.scheme?.approved_by_role);
  }

  getRequesterDisplayName(userId: number | null | undefined): string {
    const hit = this.latestRequestEvent();
    const live = String(hit?.user_name ?? "").trim();
    if (live) return live;
    if (!userId) return "Unknown User";
    const current = this.auth.getStoredUser();
    if (current && current.user_id === userId && current.full_name) {
      return current.full_name;
    }
    return "Unknown User";
  }

  getRequesterRole(): string {
    const hit = this.latestRequestEvent();
    return this.formatRoleLabel(hit?.user_role);
  }

  /** Latest archive/delete request event (timeline is chronological). */
  private latestRequestEvent(): AuditLog | null {
    for (let i = this.timelineEvents.length - 1; i >= 0; i--) {
      const action = String(this.timelineEvents[i]?.action || "").toUpperCase();
      if (action.includes("ARCHIVE_REQUESTED") || action.includes("DELETE_REQUESTED")) {
        return this.timelineEvents[i];
      }
    }
    return null;
  }

  /** Actor of the latest workflow event (timeline excludes views). */
  getLastModifierName(): string {
    if (!this.timelineLoaded) return "Loading…";
    const last = this.timelineEvents[this.timelineEvents.length - 1];
    const live = String(last?.user_name ?? "").trim();
    return live || "Unknown User";
  }

  getLastModifierRole(): string {
    if (!this.timelineLoaded) return "";
    const last = this.timelineEvents[this.timelineEvents.length - 1];
    return this.formatRoleLabel(last?.user_role);
  }

  private formatRoleLabel(role: string | null | undefined): string {
    const clean = String(role ?? "").trim();
    if (!clean) return "";
    return clean
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ============================================================
  // WORKFLOW TIMELINE
  // ============================================================

  timelineEvents: AuditLog[] = [];
  timelineLoaded = false;
  timelineRefresh = 0;
  private timelinePrimed = false;

  onTimelineLoaded(events: AuditLog[]): void {
    this.timelineEvents = Array.isArray(events) ? events : [];
    this.timelineLoaded = true;
    this.cdr.detectChanges();
  }

  get isOwner(): boolean {
    if (!this.scheme) return false;
    const user = this.auth.getStoredUser();
    return user?.user_id != null && this.scheme.created_by === user.user_id;
  }

  /*
   * Workflow permissions
   */
  get canEdit(): boolean {
    if (!this.scheme) return false;
    if (this.isAdmin) {
      return ["DRAFT", "REJECTED", "ARCHIVED", "APPROVED"].includes(
        this.scheme.status,
      );
    }
    if (this.isGov) {
      return ["DRAFT", "REJECTED", "ARCHIVED"].includes(this.scheme.status);
    }
    return false;
  }

  get canSubmit(): boolean {
    if (!this.scheme) return false;
    if (!["DRAFT", "REJECTED"].includes(this.scheme.status)) return false;
    if (this.isAdmin) return true;
    const currentUserId = this.auth.getStoredUser()?.user_id;
    return Boolean(
      this.isGov && currentUserId && this.scheme.created_by === currentUserId,
    );
  }

  get canApprove(): boolean {
    if (!this.isAdmin || this.scheme?.status !== "PENDING_APPROVAL")
      return false;
    return !this.isOwner;
  }

  get canReject(): boolean {
    if (!this.isAdmin || this.scheme?.status !== "PENDING_APPROVAL")
      return false;
    return !this.isOwner;
  }

  get canArchive(): boolean {
    return this.isAdmin && this.scheme?.status === "APPROVED";
  }

  get canRequestArchive(): boolean {
    return this.isGov && this.scheme?.status === "APPROVED";
  }

  get canApproveArchive(): boolean {
    return this.isAdmin && this.scheme?.status === "ARCHIVE_REQUESTED";
  }

  get canRejectArchive(): boolean {
    return this.isAdmin && this.scheme?.status === "ARCHIVE_REQUESTED";
  }

  get canRestore(): boolean {
    return this.isAdmin && this.scheme?.status === "ARCHIVED";
  }

  get canRequestDelete(): boolean {
    return (
      this.isGov &&
      (this.scheme?.status === "APPROVED" || this.scheme?.status === "ARCHIVED")
    );
  }

  get canApproveDelete(): boolean {
    return this.isAdmin && this.scheme?.status === "DELETE_REQUESTED";
  }

  get canRejectDelete(): boolean {
    return this.isAdmin && this.scheme?.status === "DELETE_REQUESTED";
  }

  get canDirectDelete(): boolean {
    return (
      this.isAdmin &&
      ["DRAFT", "REJECTED", "APPROVED", "ARCHIVED"].includes(
        this.scheme?.status || "",
      )
    );
  }

  get hasWorkflowActions(): boolean {
    return (
      this.canEdit ||
      this.canSubmit ||
      this.canApprove ||
      this.canReject ||
      this.canArchive ||
      this.canRequestArchive ||
      this.canApproveArchive ||
      this.canRejectArchive ||
      this.canRestore ||
      this.canRequestDelete ||
      this.canApproveDelete ||
      this.canRejectDelete ||
      this.canDirectDelete
    );
  }

  ngOnInit(): void {
    this.schemeId = this.route.snapshot.paramMap.get("id");

    if (!this.schemeId) {
      this.errorMessage = "Scheme ID is missing.";
      return;
    }

    const id = Number(this.schemeId);
    this.schemeIdNum = id;

    if (isNaN(id) || id <= 0) {
      this.errorMessage = "Invalid scheme ID.";
      return;
    }

    this.loadScheme(id);
  }

  loadScheme(schemeId: number): void {
    this.loading = true;
    this.errorMessage = "";

    // Bookmark state and eligibility rules need only the route schemeId,
    // not the scheme body: fetch in parallel instead of waiting.
    this.loadBookmarkState(schemeId);
    this.loadEligibilityRules(schemeId);

    this.schemeService
      .getScheme(schemeId)
      .pipe(
        catchError((error) => {
          console.error("Scheme details API error:", error);
          this.errorMessage = this.getErrorMessage(error);
          return of(null);
        }),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe((scheme) => {
        if (!scheme) {
          return;
        }

        this.scheme = scheme;
        // Refresh the timeline after every reload except the first:
        // all workflow handlers funnel through loadScheme on success.
        if (this.timelinePrimed) {
          this.timelineRefresh++;
        }
        this.timelinePrimed = true;
        this.cdr.detectChanges();
      });
  }

  loadEligibilityRules(schemeId: number): void {
    this.eligibilityLoading = true;
    this.eligibilityError = "";

    this.schemeService
      .getEligibilityRules(schemeId)
      .pipe(
        catchError((error) => {
          console.error("Eligibility API error:", error);
          this.eligibilityError = this.getErrorMessage(error);
          return of([]);
        }),
        finalize(() => {
          this.eligibilityLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe((rules) => {
        this.eligibilityRules = rules || [];
        this.cdr.detectChanges();
      });
  }

  setActiveTab(
    tab: "overview" | "eligibility" | "benefits" | "documents",
  ): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  /*
   * ============================================================
   * THREE-DOT WORKFLOW MENU
   * ============================================================
   */
  toggleWorkflowMenu(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.workflowMenuOpen = !this.workflowMenuOpen;
    this.cdr.detectChanges();
  }

  closeWorkflowMenu(): void {
    if (!this.workflowMenuOpen) {
      return;
    }
    this.workflowMenuOpen = false;
    this.cdr.detectChanges();
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    this.closeWorkflowMenu();
  }

  @HostListener("document:keydown.escape")
  onEscapeKey(): void {
    this.closeWorkflowMenu();
  }

  /*
   * Edit Scheme
   */
  editScheme(): void {
    if (!this.scheme) {
      return;
    }
    this.closeWorkflowMenu();
    if (this.isAdmin || this.isGov) {
      this.router.navigate([
        "/dashboard",
        this.rolePrefix,
        "schemes",
        "edit",
        this.scheme.scheme_id,
      ]);
    } else {
      this.router.navigate(["/schemes/edit", this.scheme.scheme_id]);
    }
  }

  /*
   * Workflow Action Handlers
   *
   * Toast helpers below prefer the authoritative record name from the
   * API response, falling back to the loaded scheme. A generic message
   * is used only when no usable name exists.
   */
  private schemeToastName(
    updated?: { name?: string | null } | null,
  ): string | null {
    const raw =
      typeof updated?.name === "string" && updated.name.trim()
        ? updated.name
        : (this.scheme?.name ?? "");
    const name = String(raw).trim();
    return name ? name : null;
  }

  private schemeSuccessToast(
    updated: { name?: string | null } | null | undefined,
    withName: (name: string) => string,
    generic: string,
  ): void {
    const name = this.schemeToastName(updated);
    this.toastService.success(name ? withName(name) : generic);
  }

  private schemeInfoToast(
    updated: { name?: string | null } | null | undefined,
    withName: (name: string) => string,
    generic: string,
  ): void {
    const name = this.schemeToastName(updated);
    this.toastService.info(name ? withName(name) : generic);
  }

  openSubmitModal(): void {
    if (!this.scheme) return;
    if (!this.canSubmit) {
      this.toastService.error(
        "You are not authorized to submit this scheme. Only the user who created it can submit it for approval.",
      );
      return;
    }
    const schemeId = this.scheme.scheme_id;
    const schemeName = this.scheme.name || "Untitled Scheme";
    this.confirmTitle = "Submit Scheme";
    this.confirmMessage = `Submit "${schemeName}" for approval?`;
    this.confirmVariant = "primary";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.submitScheme(schemeId).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.confirmAction = null;
          this.confirmErrorMessage = null;
          this.schemeSuccessToast(
            updated,
            (n) => `Scheme "${n}" submitted for approval.`,
            "Scheme submitted for approval.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          const msg = this.getErrorMessage(err);
          this.confirmErrorMessage = msg;
          this.toastService.error(msg);
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveModal(): void {
    if (!this.scheme) return;
    if (!this.canApprove) {
      this.toastService.error(
        this.isOwner
          ? "You cannot approve your own scheme. A different administrator must review it."
          : "Only an administrator can approve a scheme pending approval.",
      );
      return;
    }
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Approve Scheme";
    this.confirmMessage = `Are you sure you want to approve "${this.scheme.name}"?`;
    this.confirmVariant = "success";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.approveScheme(schemeId).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.schemeSuccessToast(
            updated,
            (n) => `Scheme "${n}" approved successfully.`,
            "Scheme approved successfully.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.reasonTitle = "Reject Scheme";
    this.reasonMessage = `Please provide a reason for rejecting "${this.scheme.name}". This feedback will be visible to the official who submitted the scheme.`;
    this.reasonLabel = "Rejection Reason";
    this.reasonVariant = "danger";
    this.reasonAction = (reason: string) => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.cdr.detectChanges();
      this.schemeService.rejectScheme(schemeId, reason).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.reasonModalOpen = false;
          this.schemeSuccessToast(
            updated,
            (n) => `Scheme "${n}" rejected successfully.`,
            "Scheme rejected successfully.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.reasonModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openDirectArchiveModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Archive Scheme";
    this.confirmMessage = `Are you sure you want to archive "${this.scheme.name}"?`;
    this.confirmVariant = "warning";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.archiveScheme(schemeId).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.schemeSuccessToast(
            updated,
            (n) => `Scheme "${n}" archived successfully.`,
            "Scheme archived successfully.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRequestArchiveModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.reasonTitle = "Request Scheme Archival";
    this.reasonMessage = `Enter the reason for requesting archival of "${this.scheme.name}".`;
    this.reasonLabel = "Archival Reason";
    this.reasonVariant = "warning";
    this.reasonAction = (reason: string) => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.cdr.detectChanges();
      this.schemeService.requestArchiveScheme(schemeId, reason).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.reasonModalOpen = false;
          this.schemeSuccessToast(
            updated,
            (n) => `Archive request for scheme "${n}" submitted to Admin.`,
            "Archive request submitted to Admin.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.reasonModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveArchiveModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Approve Archival";
    this.confirmMessage = `Approve archival request for "${this.scheme.name}"?`;
    this.confirmVariant = "warning";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.approveArchiveScheme(schemeId).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.schemeSuccessToast(
            updated,
            (n) => `Scheme "${n}" archived successfully.`,
            "Scheme archived successfully.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectArchiveModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Reject Archival Request";
    this.confirmMessage = `Reject archival request for "${this.scheme.name}" and keep scheme active?`;
    this.confirmVariant = "danger";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.rejectArchiveScheme(schemeId).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.schemeInfoToast(
            updated,
            (n) => `Archive request for scheme "${n}" rejected successfully.`,
            "Archive request rejected successfully.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRestoreModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Restore Scheme";
    this.confirmMessage = `Restore "${this.scheme.name}" to Draft status?`;
    this.confirmVariant = "primary";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.restoreScheme(schemeId).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.schemeSuccessToast(
            updated,
            (n) => `Scheme "${n}" restored to draft.`,
            "Scheme restored to draft.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRequestDeleteModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.reasonTitle = "Request Scheme Deletion";
    this.reasonMessage = `Enter the reason for requesting deletion of "${this.scheme.name}".`;
    this.reasonLabel = "Deletion Reason";
    this.reasonVariant = "danger";
    this.reasonAction = (reason: string) => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.cdr.detectChanges();
      this.schemeService.requestDeleteScheme(schemeId, reason).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.reasonModalOpen = false;
          this.schemeSuccessToast(
            updated,
            (n) => `Deletion request for scheme "${n}" submitted successfully.`,
            "Deletion request submitted successfully.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.reasonModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveDeleteModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Approve Deletion";
    this.confirmMessage = `Approve deletion of "${this.scheme.name}"? It will move to Deleted Schemes and can be restored within 30 days.`;
    this.confirmVariant = "danger";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.approveDeleteScheme(schemeId).subscribe({
        next: () => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.schemeSuccessToast(
            null,
            (n) => `Deletion approved. Scheme "${n}" moved to Deleted Schemes.`,
            "Deletion approved. Scheme moved to Deleted Schemes.",
          );
          this.goBack();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectDeleteModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Reject Deletion Request";
    this.confirmMessage = `Reject deletion request for "${this.scheme.name}"?`;
    this.confirmVariant = "warning";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.rejectDeleteScheme(schemeId).subscribe({
        next: (updated) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.schemeInfoToast(
            updated,
            (n) => `Deletion request for scheme "${n}" rejected successfully.`,
            "Deletion request rejected successfully.",
          );
          this.loadScheme(schemeId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openDirectDeleteModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Delete Scheme";
    this.confirmMessage = `Delete "${this.scheme.name}"? It will move to Deleted Schemes and can be restored within 30 days.`;
    this.confirmVariant = "danger";
    this.confirmLoading = false;
    this.confirmErrorMessage = null;
    this.confirmAction = () => {
      if (this.confirmLoading) return;
      this.confirmLoading = true;
      this.confirmErrorMessage = null;
      this.cdr.detectChanges();
      this.schemeService.deleteScheme(schemeId).subscribe({
        next: () => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.schemeSuccessToast(
            null,
            (n) => `Scheme "${n}" moved to Deleted Schemes.`,
            "Scheme moved to Deleted Schemes.",
          );
          this.goBack();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmLoading = false;
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  /*
   * Bookmark (server-backed saved items)
   */
  toggleBookmark(): void {
    if (!this.scheme || this.bookmarkLoading) {
      return;
    }

    const id = Number(this.scheme.scheme_id);
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }

    if (!this.canUseSavedItems && (this.isAdmin || this.isGov)) {
      this.toggleLocalBookmark(id);
      return;
    }

    this.bookmarkLoading = true;

    if (!this.bookmarked) {
      this.savedItemsService.saveScheme(id).subscribe({
        next: () => {
          this.bookmarked = true;
          this.bookmarkLoading = false;
          this.toastService.info("Scheme added to bookmarks.");
          this.cdr.detectChanges();
        },
        error: () => {
          this.bookmarkLoading = false;
          this.toastService.error("Could not save scheme. Please retry.");
          this.cdr.detectChanges();
        },
      });
    } else {
      this.savedItemsService.unsaveScheme(id).subscribe({
        next: () => {
          this.bookmarked = false;
          this.bookmarkLoading = false;
          this.toastService.info("Scheme removed from bookmarks.");
          this.cdr.detectChanges();
        },
        error: () => {
          this.bookmarkLoading = false;
          this.toastService.error("Could not remove scheme. Please retry.");
          this.cdr.detectChanges();
        },
      });
    }
  }

  isBookmarked(): boolean {
    return this.bookmarked;
  }

  private loadBookmarkState(schemeId: number): void {
    const id = Number(schemeId);
    if (!Number.isFinite(id) || id <= 0) {
      this.bookmarked = false;
      this.bookmarkLoading = false;
      this.cdr.detectChanges();
      return;
    }
    if (!this.canUseSavedItems && (this.isAdmin || this.isGov)) {
      this.bookmarked = this.getLocalBookmarks().includes(id);
      this.bookmarkLoading = false;
      this.cdr.detectChanges();
      return;
    }
    this.savedItemsService.isSchemeSaved(id).subscribe({
      next: (res) => {
        this.bookmarked = !!res?.saved;
        this.bookmarkLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.bookmarked = false;
        this.bookmarkLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  /** Staff-role local toggle mirroring Scheme Search (same storage key). */
  private toggleLocalBookmark(id: number): void {
    const bookmarks = this.getLocalBookmarks();
    const index = bookmarks.indexOf(id);
    if (index === -1) {
      bookmarks.push(id);
    } else {
      bookmarks.splice(index, 1);
    }
    try {
      localStorage.setItem(this.bookmarkStorageKey, JSON.stringify(bookmarks));
    } catch {
      // Ignore localStorage errors
    }
    this.bookmarked = index === -1;
    this.cdr.detectChanges();
  }

  private getLocalBookmarks(): number[] {
    try {
      const stored = localStorage.getItem(this.bookmarkStorageKey);
      if (!stored) {
        return [];
      }
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map(Number).filter((v) => Number.isFinite(v));
    } catch {
      return [];
    }
  }

  /*
   * Apply
   */
  applyNow(): void {
    if (this.scheme?.application_url) {
      window.open(this.scheme.application_url, "_blank", "noopener,noreferrer");
    }
  }

  /*
   * Share
   */
  shareScheme(): void {
    if (!this.scheme) {
      return;
    }

    const shareData = {
      title: this.scheme.name || undefined,
      text: this.scheme.description,
      url: window.location.href,
    };

    if (typeof navigator.share === "function") {
      navigator.share(shareData).catch(() => {});
      return;
    }

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(window.location.href)
        .then(() =>
          this.toastService.success("Scheme URL copied to clipboard!"),
        )
        .catch(() => this.toastService.error("Unable to copy scheme URL."));
      return;
    }

    this.toastService.info("Sharing is not supported by this browser.");
  }

  /*
   * Status
   */
  getStatusLabel(status: string): string {
    return (status || "")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  /*
   * Category icon (centralized mapping — same icon/color for a
   * category on every page; bookmark state stays separate).
   */
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

  /*
   * Date
   */
  formatDate(date: string | null | undefined): string {
    if (!date) {
      return "Not specified";
    }

    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  /** Date + exact local time for audit metadata (ISO on hover). */
  formatDateTime(date: string | null | undefined): string {
    if (!date) {
      return "Not specified";
    }

    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  /*
   * Income
   */
  formatIncome(income: number | null): string {
    if (income === null || income === undefined) {
      return "";
    }
    return `₹${income.toLocaleString("en-IN")}`;
  }

  /*
   * Benefits
   */
  get benefits(): string[] {
    return this.scheme?.benefits || [];
  }

  /*
   * Application URL
   */
  get hasApplicationUrl(): boolean {
    return !!this.scheme?.application_url;
  }

  /*
   * Documents
   */
  get hasDocument(): boolean {
    return !!this.scheme?.source_url || !!this.scheme?.application_url;
  }

  /*
   * Eligibility
   */
  get hasEligibilityRules(): boolean {
    return this.eligibilityRules.length > 0;
  }

  /*
   * Eligibility descriptions
   */
  getRuleDescriptions(rule: EligibilityRule): string[] {
    const descriptions: string[] = [];

    if (rule.min_age !== null && rule.min_age !== undefined) {
      descriptions.push(`Minimum age: ${rule.min_age} years`);
    }

    if (rule.max_age !== null && rule.max_age !== undefined) {
      descriptions.push(`Maximum age: ${rule.max_age} years`);
    }

    if (rule.gender && !this.isNoRestriction(rule.gender)) {
      descriptions.push(`Gender: ${rule.gender}`);
    }

    if (rule.max_income !== null && rule.max_income !== undefined) {
      descriptions.push(
        `Maximum annual income: ${this.formatIncome(rule.max_income)}`,
      );
    }

    if (rule.occupation && !this.isNoRestriction(rule.occupation)) {
      descriptions.push(`Occupation: ${rule.occupation}`);
    }

    if (rule.education && !this.isNoRestriction(rule.education)) {
      descriptions.push(`Education: ${rule.education}`);
    }

    if (rule.state && !this.isNoRestriction(rule.state)) {
      descriptions.push(`State / Region: ${rule.state}`);
    }

    if (rule.social_category && !this.isNoRestriction(rule.social_category)) {
      descriptions.push(`Social category: ${rule.social_category}`);
    }

    if (
      rule.disability_status !== null &&
      rule.disability_status !== undefined
    ) {
      descriptions.push(
        rule.disability_status
          ? "Applicable to persons with disabilities"
          : "Applicable to non-disabled applicants",
      );
    }

    return descriptions;
  }

  isNoRestriction(value: string | null): boolean {
    if (!value) {
      return true;
    }

    return ["", "any", "all", "all india", "not applicable", "n/a"].includes(
      value.trim().toLowerCase(),
    );
  }

  /*
   * Back
   */
  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else if (this.auth.isLoggedIn()) {
      const target = this.isAdmin
        ? ["/dashboard", "admin", "schemes", "search"]
        : this.isGov
          ? ["/dashboard", "government", "schemes", "search"]
          : ["/dashboard", this.rolePrefix, "schemes"];
      this.router.navigate(target);
    } else {
      this.router.navigate(["/schemes"]);
    }
  }

  /*
   * Error message
   */
  private getErrorMessage(error: any): string {
    if (error?.error?.detail) {
      return error.error.detail;
    }

    if (error?.message) {
      return error.message;
    }

    return "Unable to load the scheme. Please try again.";
  }
}
