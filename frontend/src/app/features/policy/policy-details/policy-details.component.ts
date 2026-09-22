import { CommonModule, Location } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
  inject,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { catchError, finalize, of } from "rxjs";

import { PolicyService } from "../../../core/services/policy.service";
import { Auth } from "../../../core/services/auth";
import {
  PolicyResponse,
  PolicyStatus,
} from "../../../core/models/policy.model";
import { ConfirmModalComponent } from "../../../shared/components/confirm-modal/confirm-modal.component";
import { ReasonModalComponent } from "../../../shared/components/reason-modal/reason-modal.component";

interface EligibilityRule {
  rule_id: number;
  policy_id?: number | null;
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
  selector: "app-policy-details",
  standalone: true,
  imports: [
    CommonModule,
    ConfirmModalComponent,
    ReasonModalComponent,
  ],
  templateUrl: "./policy-details.component.html",
  styleUrls: ["./policy-details.component.scss"],
})
export class PolicyDetailsComponent implements OnInit {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly policyService = inject(PolicyService);
  private readonly auth = inject(Auth);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly bookmarkStorageKey = "policy_bookmarks";

  activeTab: "overview" | "eligibility" | "benefits" | "documents" = "overview";
  policy: PolicyResponse | null = null;
  eligibilityRules: EligibilityRule[] = [];
  eligibilityLoading = false;
  eligibilityError = "";
  loading = false;
  errorMessage = "";

  // Toast notification
  toastMessage: string | null = null;
  toastType: "success" | "error" | "info" = "success";
  private toastTimeout: any = null;

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

  workflowMenuOpen = false;

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

  get rolePrefix(): string {
    if (this.isAdmin) return "admin";
    if (this.isGov) return "government";
    const r = this.userRole;
    if (r === "RESEARCHER") return "researcher";
    if (r === "ORGANIZATION" || r === "ORGANISATION") return "organization";
    if (r === "GUEST") return "guest";
    return "citizen";
  }

  get isOwner(): boolean {
    if (!this.policy) return false;
    const user = this.auth.getStoredUser();
    return user?.user_id != null && this.policy.created_by === user.user_id;
  }

  // Permission-based capabilities
  get canEdit(): boolean {
    if (!this.policy) return false;
    if (this.isAdmin) {
      return ["DRAFT", "REJECTED", "ARCHIVED", "APPROVED"].includes(
        this.policy.status,
      );
    }
    if (this.isGov) {
      return ["DRAFT", "REJECTED", "ARCHIVED"].includes(this.policy.status);
    }
    return false;
  }

  get canSubmit(): boolean {
    if (!this.policy) return false;
    return (
      (this.isAdmin || this.isGov) &&
      ["DRAFT", "REJECTED"].includes(this.policy.status)
    );
  }

  get canApprove(): boolean {
    return this.isAdmin && this.policy?.status === "PENDING_APPROVAL";
  }

  get canReject(): boolean {
    return this.isAdmin && this.policy?.status === "PENDING_APPROVAL";
  }

  get canArchive(): boolean {
    return this.isAdmin && this.policy?.status === "APPROVED";
  }

  get canRequestArchive(): boolean {
    return this.isGov && this.policy?.status === "APPROVED";
  }

  get canApproveArchive(): boolean {
    return this.isAdmin && this.policy?.status === "ARCHIVE_REQUESTED";
  }

  get canRejectArchive(): boolean {
    return this.isAdmin && this.policy?.status === "ARCHIVE_REQUESTED";
  }

  get canRestore(): boolean {
    return this.isAdmin && this.policy?.status === "ARCHIVED";
  }

  get canRequestDelete(): boolean {
    return (
      this.isGov &&
      (this.policy?.status === "APPROVED" || this.policy?.status === "ARCHIVED")
    );
  }

  get canApproveDelete(): boolean {
    return this.isAdmin && this.policy?.status === "DELETE_REQUESTED";
  }

  get canRejectDelete(): boolean {
    return this.isAdmin && this.policy?.status === "DELETE_REQUESTED";
  }

  get canDirectDelete(): boolean {
    return (
      this.isAdmin &&
      ["DRAFT", "REJECTED", "APPROVED", "ARCHIVED"].includes(
        this.policy?.status || "",
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
    const id = this.route.snapshot.paramMap.get("id");
    if (!id) {
      this.errorMessage = "Policy ID is missing.";
      this.cdr.detectChanges();
      return;
    }
    const policyId = Number(id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      this.errorMessage = "Invalid policy ID.";
      this.cdr.detectChanges();
      return;
    }
    this.loadPolicy(policyId);
  }

  toggleWorkflowMenu(event: Event): void {
    event.stopPropagation();
    this.workflowMenuOpen = !this.workflowMenuOpen;
  }

  @HostListener("document:click")
  closeWorkflowMenu(): void {
    this.workflowMenuOpen = false;
  }

  @HostListener("document:keydown.escape")
  closeWorkflowMenuOnEscape(): void {
    this.closeWorkflowMenu();
  }

  loadPolicy(policyId: number): void {
    this.loading = true;
    this.errorMessage = "";
    this.policy = null;
    this.cdr.detectChanges();

    this.policyService
      .getPolicy(policyId)
      .pipe(
        catchError((error) => {
          console.error("Policy details API error:", error);
          this.errorMessage = this.getErrorMessage(error);
          this.cdr.detectChanges();
          return of(null);
        }),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe((policy) => {
        if (!policy) return;
        this.policy = policy;
        this.cdr.detectChanges();
        this.loadEligibilityRules(policy.policy_id);
      });
  }

  loadEligibilityRules(policyId: number): void {
    this.eligibilityLoading = true;
    this.eligibilityError = "";
    this.cdr.detectChanges();

    this.policyService
      .getEligibilityRules(policyId)
      .pipe(
        catchError((error) => {
          console.error("Eligibility API error:", error);
          this.eligibilityError = this.getErrorMessage(error);
          this.cdr.detectChanges();
          return of([] as EligibilityRule[]);
        }),
        finalize(() => {
          this.eligibilityLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe((rules) => {
        this.eligibilityRules = Array.isArray(rules) ? rules : [];
        this.cdr.detectChanges();
      });
  }

  setActiveTab(
    tab: "overview" | "eligibility" | "benefits" | "documents",
  ): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  isBookmarked(): boolean {
    return !!this.policy && this.getBookmarks().includes(this.policy.policy_id);
  }

  toggleBookmark(): void {
    if (!this.policy) return;
    const bookmarks = this.getBookmarks();
    const id = this.policy.policy_id;
    const index = bookmarks.indexOf(id);
    if (index === -1) {
      bookmarks.push(id);
      this.showToast("Policy added to bookmarks.", "info");
    } else {
      bookmarks.splice(index, 1);
      this.showToast("Policy removed from bookmarks.", "info");
    }
    localStorage.setItem(this.bookmarkStorageKey, JSON.stringify(bookmarks));
    this.cdr.detectChanges();
  }

  private getBookmarks(): number[] {
    try {
      const stored = localStorage.getItem(this.bookmarkStorageKey);
      if (!stored) return [];
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed)
        ? parsed.map(Number).filter(Number.isFinite)
        : [];
    } catch {
      return [];
    }
  }

  sharePolicy(): void {
    if (!this.policy) return;
    const shareData = {
      title: this.policy.title,
      text: this.policy.description,
      url: window.location.href,
    };
    if (typeof navigator.share === "function") {
      navigator.share(shareData).catch(() => undefined);
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(window.location.href)
        .then(() => {
          this.showToast("Policy link copied to clipboard!", "success");
        })
        .catch(() => {
          this.showToast("Unable to copy policy link.", "error");
        });
      return;
    }
    this.showToast("Sharing is not supported on this browser.", "info");
  }

  showToast(message: string, type: "success" | "error" | "info" = "success"): void {
    this.toastMessage = message;
    this.toastType = type;
    this.cdr.detectChanges();
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = null;
      this.cdr.detectChanges();
    }, 3500);
  }

  getStatusLabel(status: string): string {
    return (status || "")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return "Not specified";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  formatIncome(income: number | null): string {
    if (income === null || income === undefined) return "";
    return `₹${income.toLocaleString("en-IN")}`;
  }

  getRuleDescriptions(rule: EligibilityRule): string[] {
    const descriptions: string[] = [];
    if (rule.min_age != null)
      descriptions.push(`Minimum age: ${rule.min_age} years`);
    if (rule.max_age != null)
      descriptions.push(`Maximum age: ${rule.max_age} years`);
    if (rule.gender && !this.isNoRestriction(rule.gender))
      descriptions.push(`Gender: ${rule.gender}`);
    if (rule.max_income != null)
      descriptions.push(
        `Maximum annual income: ${this.formatIncome(rule.max_income)}`,
      );
    if (rule.occupation && !this.isNoRestriction(rule.occupation))
      descriptions.push(`Occupation: ${rule.occupation}`);
    if (rule.education && !this.isNoRestriction(rule.education))
      descriptions.push(`Education: ${rule.education}`);
    if (rule.state && !this.isNoRestriction(rule.state))
      descriptions.push(`State / Region: ${rule.state}`);
    if (rule.social_category && !this.isNoRestriction(rule.social_category))
      descriptions.push(`Social category: ${rule.social_category}`);
    if (rule.disability_status != null)
      descriptions.push(
        rule.disability_status
          ? "Applicable to persons with disabilities"
          : "Applicable to non-disabled applicants",
      );
    return descriptions;
  }

  isNoRestriction(value: string | null): boolean {
    if (!value) return true;
    return ["any", "all", "all india", "not applicable", "n/a"].includes(
      value.trim().toLowerCase(),
    );
  }

  get benefits(): string[] {
    return this.policy?.benefits || [];
  }

  get hasDocument(): boolean {
    return !!this.policy?.document_url;
  }

  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else if (this.auth.isLoggedIn()) {
      const target = this.isAdmin
        ? ["/dashboard", "admin", "policies", "search"]
        : this.isGov
          ? ["/dashboard", "government", "policies", "search"]
          : ["/dashboard", this.rolePrefix, "policies"];
      this.router.navigate(target);
    } else {
      this.router.navigate(["/"]);
    }
  }

  // ============================================================
  // WORKFLOW ACTION HANDLERS
  // ============================================================

  editPolicy(): void {
    if (!this.policy) return;
    this.router.navigate([
      "/dashboard",
      this.rolePrefix,
      "policies",
      "edit",
      this.policy.policy_id,
    ]);
  }

  openSubmitModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.confirmTitle = "Submit Policy";
    this.confirmMessage = `Submit "${this.policy.title}" for approval?`;
    this.confirmVariant = "primary";
    this.confirmAction = () => {
      this.policyService.submitPolicy(policyId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showToast("Policy submitted for approval.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.confirmTitle = "Approve Policy";
    this.confirmMessage = `Are you sure you want to approve "${this.policy.title}"?`;
    this.confirmVariant = "success";
    this.confirmAction = () => {
      this.policyService.approvePolicy(policyId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showToast("Policy successfully approved.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.reasonTitle = "Reject Policy";
    this.reasonMessage = `Please provide a reason for rejecting "${this.policy.title}". This feedback will be visible to the policy creator.`;
    this.reasonLabel = "Rejection Reason";
    this.reasonVariant = "danger";
    this.reasonAction = (reason: string) => {
      this.policyService.rejectPolicy(policyId, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.showToast("Policy rejected.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openDirectArchiveModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.reasonTitle = "Archive Policy";
    this.reasonMessage = `Enter an archive reason for "${this.policy.title}".`;
    this.reasonLabel = "Archive Reason";
    this.reasonVariant = "warning";
    this.reasonAction = (reason: string) => {
      this.policyService.archivePolicy(policyId, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.showToast("Policy successfully archived.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openRequestArchiveModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.reasonTitle = "Request Policy Archive";
    this.reasonMessage = `Enter the reason for requesting archiving of "${this.policy.title}".`;
    this.reasonLabel = "Archive Reason";
    this.reasonVariant = "warning";
    this.reasonAction = (reason: string) => {
      this.policyService.requestArchive(policyId, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.showToast("Archive request submitted to Admin.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveArchiveModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.confirmTitle = "Approve Archive Request";
    this.confirmMessage = `Approve archiving of "${this.policy.title}"? The policy will be moved to ARCHIVED.`;
    this.confirmVariant = "warning";
    this.confirmAction = () => {
      this.policyService.approveArchive(policyId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showToast("Policy archived successfully.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectArchiveModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.confirmTitle = "Reject Archive Request";
    this.confirmMessage = `Reject archive request for "${this.policy.title}"? The policy will remain APPROVED.`;
    this.confirmVariant = "primary";
    this.confirmAction = () => {
      this.policyService.rejectArchive(policyId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showToast("Archive request rejected. Policy reverted to APPROVED.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRestoreModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.confirmTitle = "Restore Policy";
    this.confirmMessage = `Restore "${this.policy.title}" back to DRAFT state?`;
    this.confirmVariant = "success";
    this.confirmAction = () => {
      this.policyService.restore(policyId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showToast("Policy restored to DRAFT.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRequestDeleteModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.reasonTitle = "Request Policy Deletion";
    this.reasonMessage = `Enter the reason for requesting deletion of "${this.policy.title}".`;
    this.reasonLabel = "Deletion Reason";
    this.reasonVariant = "danger";
    this.reasonAction = (reason: string) => {
      this.policyService.requestDelete(policyId, reason).subscribe({
        next: () => {
          this.reasonModalOpen = false;
          this.showToast("Delete request submitted to Admin.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.reasonModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.reasonModalOpen = true;
    this.cdr.detectChanges();
  }

  openApproveDeleteModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.confirmTitle = "Approve Permanent Deletion";
    this.confirmMessage = `Permanently delete "${this.policy.title}"? This cannot be undone.`;
    this.confirmVariant = "danger";
    this.confirmAction = () => {
      this.policyService.approveDelete(policyId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showToast("Policy permanently deleted.", "success");
          this.cdr.detectChanges();
          setTimeout(() => this.goBack(), 1200);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openRejectDeleteModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.confirmTitle = "Reject Delete Request";
    this.confirmMessage = `Reject delete request for "${this.policy.title}"? The policy will revert to its previous status.`;
    this.confirmVariant = "primary";
    this.confirmAction = () => {
      this.policyService.rejectDelete(policyId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showToast("Delete request rejected.", "success");
          this.loadPolicy(policyId);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  openDirectDeleteModal(): void {
    if (!this.policy) return;
    const policyId = this.policy.policy_id;
    this.confirmTitle = "Delete Policy";
    this.confirmMessage = `Permanently delete "${this.policy.title}"? This cannot be undone.`;
    this.confirmVariant = "danger";
    this.confirmAction = () => {
      this.policyService.deletePolicy(policyId).subscribe({
        next: () => {
          this.confirmModalOpen = false;
          this.showToast("Policy deleted permanently.", "success");
          this.cdr.detectChanges();
          setTimeout(() => this.goBack(), 1200);
        },
        error: (err) => {
          this.confirmModalOpen = false;
          this.showToast(this.getErrorMessage(err), "error");
          this.cdr.detectChanges();
        },
      });
    };
    this.confirmModalOpen = true;
    this.cdr.detectChanges();
  }

  private getErrorMessage(error: any): string {
    if (typeof error?.error?.detail === "string") return error.error.detail;
    if (error?.status === 401)
      return "Your session has expired. Please login again.";
    if (error?.status === 403)
      return "You do not have permission to view or manage this policy.";
    if (error?.status === 404) return "Policy not found.";
    if (error?.status === 0) return "Unable to connect to the backend server.";
    if (typeof error?.message === "string") return error.message;
    return "Unable to process your request. Please try again.";
  }
}
