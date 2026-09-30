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
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { ReasonModalComponent } from "../../../shared/components/reason-modal/reason-modal.component";

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
  private readonly cdr = inject(ChangeDetectorRef);

  activeTab: "overview" | "eligibility" | "benefits" | "documents" = "overview";

  schemeId: string | null = null;
  schemeIdNum: number | null = null;
  scheme: Scheme | null = null;
  eligibilityRules: EligibilityRule[] = [];

  bookmarked = false;
  bookmarkLoading = false;

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

  reasonModalOpen = false;
  reasonTitle = "";
  reasonMessage = "";
  reasonLabel = "Reason";
  reasonVariant: "primary" | "danger" | "warning" = "danger";
  reasonAction: ((reason: string) => void) | null = null;

  get userRole(): string {
    return String(this.auth.getUserRole() || "").trim().toUpperCase();
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

  get rolePrefix(): string {
    if (this.isAdmin) return "admin";
    if (this.isGov) return "government";
    const r = this.userRole;
    if (r === "RESEARCHER") return "researcher";
    if (r === "ORGANIZATION" || r === "ORGANISATION") return "organization";
    if (r === "GUEST") return "guest";
    return "citizen";
  }

  getCreatorDisplayName(userId: number | null | undefined): string {
    if (!userId) return "Official Author";
    const current = this.auth.getStoredUser();
    if (current && current.user_id === userId && current.full_name) {
      return current.full_name;
    }
    return "Government Official";
  }

  getApproverDisplayName(userId: number | null | undefined): string {
    if (!userId) return "Authorized Administrator";
    const current = this.auth.getStoredUser();
    if (current && current.user_id === userId && current.full_name) {
      return current.full_name;
    }
    return "Authorized Administrator";
  }

  getRequesterDisplayName(userId: number | null | undefined): string {
    if (!userId) return "Government Official";
    const current = this.auth.getStoredUser();
    if (current && current.user_id === userId && current.full_name) {
      return current.full_name;
    }
    return "Government Official";
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
    return this.isAdmin && this.scheme?.status === "PENDING_APPROVAL";
  }

  get canReject(): boolean {
    return this.isAdmin && this.scheme?.status === "PENDING_APPROVAL";
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
        this.cdr.detectChanges();
        this.loadBookmarkState(scheme.scheme_id);
        this.loadEligibilityRules(scheme.scheme_id);
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
   */
  openSubmitModal(): void {
    if (!this.scheme) return;
    if (!this.canSubmit) {
      this.toastService.error(
        "You are not authorized to submit this scheme. Only the user who created it can submit it for approval.",
      );
      return;
    }
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Submit Scheme";
    this.confirmMessage = `Submit "${this.scheme.name}" for administrator approval?`;
    this.confirmVariant = "primary";
    this.confirmAction = () => {
      this.schemeService.submitScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.success("Scheme submitted for approval.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveModal(): void {
    if (!this.scheme) return;
    const schemeId = this.scheme.scheme_id;
    this.confirmTitle = "Approve Scheme";
    this.confirmMessage = `Are you sure you want to approve "${this.scheme.name}"?`;
    this.confirmVariant = "success";
    this.confirmAction = () => {
      this.schemeService.approveScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.success("Scheme successfully approved.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
      this.schemeService.rejectScheme(schemeId, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.toastService.success("Scheme rejected.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
    this.confirmAction = () => {
      this.schemeService.archiveScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.success("Scheme successfully archived.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
      this.schemeService.requestArchiveScheme(schemeId, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.toastService.success("Archive request submitted for review.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
    this.confirmAction = () => {
      this.schemeService.approveArchiveScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.success("Scheme archived.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
    this.confirmAction = () => {
      this.schemeService.rejectArchiveScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.info("Archival request rejected.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
    this.confirmAction = () => {
      this.schemeService.restoreScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.success("Scheme restored to draft.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
      this.schemeService.requestDeleteScheme(schemeId, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.toastService.success("Deletion request submitted.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
    this.confirmMessage = `Permanently delete "${this.scheme.name}"? This action cannot be undone.`;
    this.confirmVariant = "danger";
    this.confirmAction = () => {
      this.schemeService.approveDeleteScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.success("Scheme permanently deleted.");
          this.goBack();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
    this.confirmAction = () => {
      this.schemeService.rejectDeleteScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.info("Deletion request rejected.");
          this.loadScheme(schemeId);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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
    this.confirmMessage = `Are you sure you want to permanently delete "${this.scheme.name}"?`;
    this.confirmVariant = "danger";
    this.confirmAction = () => {
      this.schemeService.deleteScheme(schemeId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.toastService.success("Scheme deleted.");
          this.goBack();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.toastService.error(this.getErrorMessage(err));
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

    const id = this.scheme.scheme_id;
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
    this.savedItemsService.isSchemeSaved(schemeId).subscribe({
      next: (res) => {
        this.bookmarked = !!res?.saved;
        this.cdr.detectChanges();
      },
      error: () => {
        this.bookmarked = false;
        this.cdr.detectChanges();
      },
    });
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
