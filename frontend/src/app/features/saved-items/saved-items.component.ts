import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { finalize } from "rxjs/operators";

import {
  SavedItemsService,
  SavedPolicyItem,
  SavedSchemeItem,
} from "../../core/services/saved-items.service";
import { Auth } from "../../core/services/auth";
import { PermissionService } from "../../core/services/permission.service";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../shared/components/breadcrumb/breadcrumb.component";
import {
  CategoryInput,
  getCategoryIconName,
  getCategoryIconStyle,
} from "../../core/utils/category-icon.util";

type SavedTab = "all" | "policies" | "schemes";

@Component({
  selector: "app-saved-items",
  standalone: true,
  imports: [CommonModule, BreadcrumbComponent],
  templateUrl: "./saved-items.component.html",
  styleUrl: "./saved-items.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavedItemsComponent implements OnInit {
  savedPolicies: SavedPolicyItem[] = [];
  savedSchemes: SavedSchemeItem[] = [];

  activeTab: SavedTab = "all";

  searchTerm = "";

  loading = true;
  removingId: number | null = null;
  removingType: "policy" | "scheme" | null = null;

  errorMessage = "";

  constructor(
    private readonly savedItemsService: SavedItemsService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly auth: Auth,
    private readonly permissions: PermissionService,
  ) {}

  ngOnInit(): void {
    this.loadSavedItems();
  }

  // ============================================================
  // LOAD
  // ============================================================

  loadSavedItems(): void {
    this.loading = true;
    this.errorMessage = "";

    let completed = 0;
    let policiesFailed = false;
    let schemesFailed = false;

    const completeRequest = (): void => {
      completed += 1;

      if (completed === 2) {
        if (policiesFailed && schemesFailed) {
          this.errorMessage = "Unable to load saved items.";
        } else if (policiesFailed) {
          this.errorMessage = "Unable to load saved policies.";
        } else if (schemesFailed) {
          this.errorMessage = "Unable to load saved schemes.";
        }

        this.loading = false;
        this.cdr.markForCheck();
      }
    };

    this.savedItemsService.getSavedPolicies().subscribe({
      next: (policies) => {
        this.savedPolicies = policies ?? [];
        completeRequest();
      },
      error: () => {
        policiesFailed = true;
        this.savedPolicies = [];
        completeRequest();
      },
    });

    this.savedItemsService.getSavedSchemes().subscribe({
      next: (schemes) => {
        this.savedSchemes = schemes ?? [];
        completeRequest();
      },
      error: () => {
        schemesFailed = true;
        this.savedSchemes = [];
        completeRequest();
      },
    });
  }

  // ============================================================
  // FILTERING
  // ============================================================

  setTab(tab: SavedTab): void {
    this.activeTab = tab;
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.searchTerm = input.value;
  }

  get filteredPolicies(): SavedPolicyItem[] {
    if (this.activeTab === "schemes") {
      return [];
    }

    const search = this.searchTerm.trim().toLowerCase();

    if (!search) {
      return this.savedPolicies;
    }

    return this.savedPolicies.filter(
      (policy) =>
        this.contains(policy.title, search) ||
        this.contains(policy.category, search) ||
        this.contains(policy.ministry, search) ||
        this.contains(policy.department, search) ||
        this.contains(policy.state, search),
    );
  }

  get filteredSchemes(): SavedSchemeItem[] {
    if (this.activeTab === "policies") {
      return [];
    }

    const search = this.searchTerm.trim().toLowerCase();

    if (!search) {
      return this.savedSchemes;
    }

    return this.savedSchemes.filter(
      (scheme) =>
        this.contains(scheme.name, search) ||
        this.contains(scheme.category, search) ||
        this.contains(scheme.ministry, search) ||
        this.contains(scheme.department, search) ||
        this.contains(scheme.state, search),
    );
  }

  private contains(value: string | null | undefined, search: string): boolean {
    return Boolean(value && value.toLowerCase().includes(search));
  }

  // ============================================================
  // COUNTS
  // ============================================================

  get totalCount(): number {
    return this.savedPolicies.length + this.savedSchemes.length;
  }

  get policyCount(): number {
    return this.savedPolicies.length;
  }

  get schemeCount(): number {
    return this.savedSchemes.length;
  }

  get visibleCount(): number {
    return this.filteredPolicies.length + this.filteredSchemes.length;
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  openPolicy(policyId: number): void {
    this.router.navigate(["/dashboard", this.rolePrefix, "policies", policyId]);
  }

  openScheme(schemeId: number): void {
    this.router.navigate(["/dashboard", this.rolePrefix, "schemes", schemeId]);
  }

  explorePolicies(): void {
    this.router.navigate(["/dashboard", this.rolePrefix, "policies"]);
  }

  private get rolePrefix(): string {
    const role = String(this.auth.getUserRole() || "")
      .trim()
      .toUpperCase();

    switch (role) {
      case "RESEARCHER":
        return "researcher";

      case "ORGANIZATION":
      case "ORGANISATION":
        return "organization";

      case "CITIZEN":
      default:
        return "citizen";
    }
  }

  /** Citizen portal uses the redesigned "My Saved Items" library UI. */
  get isCitizen(): boolean {
    return this.rolePrefix === "citizen";
  }

  /**
   * Public roles (Citizen, Researcher, Organization, Guest) never see
   * internal workflow statuses. Admin and Government Official retain
   * full visibility.
   */
  get isPublicRole(): boolean {
    return this.permissions.isPublicRole(this.auth.getUserRole() || "");
  }

  /**
   * Primary metadata line: Category • Ministry/Department • State.
   * Empty parts are omitted (state falls back to "All India").
   */
  metaLine(
    category: string | null | undefined,
    place: string | null | undefined,
    state: string | null | undefined,
  ): string {
    const parts = [category, place, state || "All India"].filter(
      (part) => part && part.trim().length > 0,
    );
    return parts.join(" • ");
  }

  /** Secondary line: Status • Saved date. */
  statusLine(status: string | null, savedAt: string | null | undefined): string {
    return `${this.formatStatus(status)} • Saved ${this.formatDate(savedAt ?? null)}`;
  }
  /** Role-aware breadcrumb trail: Home > Saved Items. */
  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: "Home", route: ["/dashboard", this.rolePrefix] },
      { label: "Saved Items" },
    ];
  }

  // ============================================================
  // REMOVE
  // ============================================================

  removePolicy(policy: SavedPolicyItem): void {
    if (this.removingId !== null) {
      return;
    }

    this.removingId = policy.policy_id;
    this.removingType = "policy";

    this.savedItemsService
      .unsavePolicy(policy.policy_id)
      .pipe(
        finalize(() => {
          this.removingId = null;
          this.removingType = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.savedPolicies = this.savedPolicies.filter(
            (item) => item.policy_id !== policy.policy_id,
          );

          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMessage = "Unable to remove the saved policy.";
          this.cdr.markForCheck();
        },
      });
  }

  removeScheme(scheme: SavedSchemeItem): void {
    if (this.removingId !== null) {
      return;
    }

    this.removingId = scheme.scheme_id;
    this.removingType = "scheme";

    this.savedItemsService
      .unsaveScheme(scheme.scheme_id)
      .pipe(
        finalize(() => {
          this.removingId = null;
          this.removingType = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.savedSchemes = this.savedSchemes.filter(
            (item) => item.scheme_id !== scheme.scheme_id,
          );

          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMessage = "Unable to remove the saved scheme.";
          this.cdr.markForCheck();
        },
      });
  }

  isRemoving(id: number, type: "policy" | "scheme"): boolean {
    return this.removingId === id && this.removingType === type;
  }

  // ============================================================
  // STATUS
  // ============================================================

  getStatusClass(status: string | null): string {
    switch (status?.toUpperCase()) {
      case "APPROVED":
        return "status-approved";

      case "PENDING_APPROVAL":
        return "status-pending";

      case "REJECTED":
        return "status-rejected";

      case "ARCHIVED":
        return "status-archived";

      case "DRAFT":
        return "status-draft";

      default:
        return "status-default";
    }
  }

  formatStatus(status: string | null): string {
    if (!status) {
      return "Unknown";
    }

    return status
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  // ============================================================
  // TRACKING
  // ============================================================

  trackPolicy(_: number, item: SavedPolicyItem): number {
    return item.saved_id;
  }

  trackScheme(_: number, item: SavedSchemeItem): number {
    return item.saved_id;
  }

  // ============================================================
  // CATEGORY ICON (centralized mapping — same icon/color for a
  // category on every page; bookmark state stays separate)
  // ============================================================

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
}
