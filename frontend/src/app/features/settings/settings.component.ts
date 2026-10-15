import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { Auth, AuthUser } from "../../core/services/auth";
import { NavigationContextService } from "../../core/services/navigation-context.service";
import { AvatarService } from "../../core/services/avatar.service";
import { NotificationPreferencesService } from "../../core/services/notification-preferences.service";
import { NotificationPreferences } from "../../core/models/notification.model";
import { SavedItemsService } from "../../core/services/saved-items.service";
import { SearchHistoryService } from "../../core/services/search-history.service";
import { ToastService } from "../../core/services/toast.service";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../shared/components/breadcrumb/breadcrumb.component";
import { ConfirmModalComponent } from "../../shared/components/confirm-modal/confirm-modal.component";
import { LoadingIndicatorComponent } from "../../shared/components/loading-indicator/loading-indicator.component";

export type SettingsRole =
  | "admin"
  | "government"
  | "citizen"
  | "researcher"
  | "organization";

export interface SettingsSection {
  id: string;
  label: string;
  icon: string;
}

/**
 * Role-based Settings module (UI shell + existing integrations).
 *
 * - One shared component mounted under every authenticated role dashboard.
 * - Account data comes from Auth (stored user + a refreshed /auth/me that is
 *   deduplicated with the layout's own call by AuthService).
 * - Notification summary reads the existing notification-preferences API.
 * - Saved-item counts read the existing saved-items API (citizen, researcher
 *   and organization only — the only roles with saved-items routes).
 * - Dark Mode is a UI-only "Coming Soon" entry: no theme code, no
 *   switching, and no persistence of any kind. Light remains the only
 *   active theme.
 * - Hindi is a UI-only "Coming Soon" control: no i18n and no persistence
 *   of any kind.
 * - Everything else navigates to existing pages (profile, preferences,
 *   saved items, history, audit logs, user management).
 */
@Component({
  selector: "app-settings",
  standalone: true,
  imports: [CommonModule, BreadcrumbComponent, ConfirmModalComponent, LoadingIndicatorComponent],
  templateUrl: "./settings.component.html",
  styleUrl: "./settings.component.scss",
})
export class SettingsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly avatarService = inject(AvatarService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly preferenceService = inject(NotificationPreferencesService);
  private readonly savedItemsService = inject(SavedItemsService);
  private readonly searchHistoryService = inject(SearchHistoryService);
  private readonly navContext = inject(NavigationContextService);
  private readonly destroyRef = inject(DestroyRef);

  role: SettingsRole = "citizen";
  roleLabel = "Citizen";

  activeSection = "account";

  user: AuthUser | null = null;
  backendConnected = false;

  /** Object URL of the authenticated user's photo; null = default icon. */
  avatarSrc: string | null = null;

  prefs: NotificationPreferences | null = null;
  prefsLoading = true;

  savedPolicyCount: number | null = null;
  savedSchemeCount: number | null = null;
  savedLoading = false;

  clearingHistory = false;
  clearHistoryOpen = false;

  readonly sections: SettingsSection[] = [
    { id: "account", label: "Account", icon: "person" },
    { id: "appearance", label: "Appearance", icon: "palette" },
    { id: "language", label: "Language & Region", icon: "language" },
    { id: "notifications", label: "Notifications", icon: "notifications" },
    { id: "security", label: "Security", icon: "lock" },
    { id: "privacy", label: "Privacy", icon: "privacy_tip" },
    { id: "accessibility", label: "Accessibility", icon: "accessibility_new" },
    { id: "session", label: "Session & Devices", icon: "devices" },
    { id: "role", label: "Role Preferences", icon: "tune" },
    { id: "about", label: "About PolicyGPT", icon: "info" },
  ];

  ngOnInit(): void {
    this.resolveRole();
    // Shared current-user state FIRST (instant paint incl. photo
    // version from login/app-init), so Settings shows the same saved
    // photo as Topbar/Profile without opening Profile first. Later
    // shared updates (photo change in Edit) reflect here live.
    this.auth.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (user) {
          this.user = user;
          this.backendConnected = true;
          this.refreshAvatar(user);
          this.cdr.markForCheck();
        }
      });
    // Instant paint from the shared snapshot; background refresh below
    // (deduplicated with the layout's own /auth/me call by AuthService)
    // reconciles with the backend and emits via the shared subject.
    this.user =
      this.auth.getCurrentUserSnapshot?.() ?? this.auth.getStoredUser();
    this.refreshAvatar(this.user);
    this.auth.getCurrentUser().subscribe({
      next: (user) => {
        this.user = user;
        this.backendConnected = true;
        this.refreshAvatar(user);
        this.cdr.markForCheck();
      },
      error: () => {
        this.backendConnected = false;
        this.cdr.markForCheck();
      },
    });
    this.loadPreferences();
    if (this.hasSavedItems) {
      this.loadSavedCounts();
    }
  }

  // =========================================================
  // AVATAR (same shared source as topbar/profile)
  // =========================================================

  private refreshAvatar(user: AuthUser | null): void {
    if (!user) {
      this.avatarSrc = null;
      return;
    }
    this.avatarService.photoSrcFor(user).subscribe({
      next: (src) => {
        this.avatarSrc = src;
        this.cdr.markForCheck();
      },
      error: () => {
        this.avatarSrc = null;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================
  // ROLE
  // =========================================================

  private resolveRole(): void {
    const role = (this.auth.getUserRole() || "").toUpperCase().trim();
    switch (role) {
      case "ADMIN":
      case "ADMINISTRATOR":
        this.role = "admin";
        this.roleLabel = "Admin";
        break;
      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT_OFFICER":
      case "GOVERNMENT":
      case "GOVT":
        this.role = "government";
        this.roleLabel = "Government Official";
        break;
      case "RESEARCHER":
        this.role = "researcher";
        this.roleLabel = "Researcher";
        break;
      case "ORGANIZATION":
      case "ORGANISATION":
        this.role = "organization";
        this.roleLabel = "Organization";
        break;
      case "CITIZEN":
      default:
        this.role = "citizen";
        this.roleLabel = "Citizen";
        break;
    }
  }

  /** Roles with saved-items and search-history routes. */
  get hasSavedItems(): boolean {
    return (
      this.role === "citizen" ||
      this.role === "researcher" ||
      this.role === "organization"
    );
  }

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: "Home", route: ["/dashboard", this.role] },
      { label: "Settings" },
    ];
  }

  // =========================================================
  // DATA (existing APIs only)
  // =========================================================

  private loadPreferences(): void {
    this.prefsLoading = true;
    this.preferenceService
      .getPreferences()
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (prefs) => {
          this.prefs = prefs;
          this.prefsLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.prefs = null;
          this.prefsLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private loadSavedCounts(): void {
    this.savedLoading = true;
    forkJoin({
      policies: this.savedItemsService
        .getSavedPolicies()
        .pipe(catchError(() => of([]))),
      schemes: this.savedItemsService
        .getSavedSchemes()
        .pipe(catchError(() => of([]))),
    }).subscribe({
      next: (res) => {
        this.savedPolicyCount = res.policies?.length ?? 0;
        this.savedSchemeCount = res.schemes?.length ?? 0;
        this.savedLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.savedPolicyCount = null;
        this.savedSchemeCount = null;
        this.savedLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get totalSaved(): number | null {
    if (this.savedPolicyCount === null || this.savedSchemeCount === null) {
      return null;
    }
    return this.savedPolicyCount + this.savedSchemeCount;
  }

  // =========================================================
  // NAVIGATION (existing pages only)
  // =========================================================

  selectSection(id: string): void {
    this.activeSection = id;
  }

  goEditProfile(): void {
    void this.router.navigate(["/dashboard", this.role, "profile", "edit"]);
  }

  goManageNotifications(): void {
    void this.router.navigate([
      "/dashboard",
      this.role,
      "notifications",
      "preferences",
    ]);
  }

  goChangePassword(): void {
    this.navContext.markActionSource();
    void this.router.navigate(["/dashboard", this.role, "change-password"]);
  }

  goSavedItems(): void {
    void this.router.navigate(["/dashboard", this.role, "saved"]);
  }

  goSearchHistory(): void {
    void this.router.navigate(["/dashboard", this.role, "history"]);
  }

  goAuditLogs(): void {
    void this.router.navigate(["/dashboard", this.role, "audit-logs"]);
  }

  goManageUsers(): void {
    void this.router.navigate(["/dashboard", this.role, "users"]);
  }

  goManagePolicies(): void {
    void this.router.navigate(["/dashboard", this.role, "policies", "manage"]);
  }

  goManageSchemes(): void {
    void this.router.navigate(["/dashboard", this.role, "schemes", "manage"]);
  }

  // =========================================================
  // COMING-SOON CONTROLS (UI only — no theme/i18n/persistence)
  // =========================================================

  showDarkModeSoon(): void {
    this.toast.info(
      "Coming Soon",
      "Dark Mode is under development and will be available in a future update.",
    );
  }

  showHindiSoon(): void {
    this.toast.info("Coming Soon", "Hindi language support is coming soon.");
  }

  showTwoFactorSoon(): void {
    this.toast.info(
      "Coming Soon",
      "Two-factor authentication is coming soon.",
    );
  }

  showOtherSessionsSoon(): void {
    this.toast.info(
      "Coming Soon",
      "Managing other sessions is coming soon.",
    );
  }

  // =========================================================
  // SEARCH HISTORY (existing backend delete)
  // =========================================================

  askClearHistory(): void {
    this.clearHistoryOpen = true;
  }

  cancelClearHistory(): void {
    this.clearHistoryOpen = false;
  }

  confirmClearHistory(): void {
    if (this.clearingHistory) {
      return;
    }
    const user = this.auth.getStoredUser();
    if (!user) {
      this.clearHistoryOpen = false;
      return;
    }
    this.clearingHistory = true;
    this.searchHistoryService.deleteUserSearchHistory(user.user_id).subscribe({
      next: () => {
        this.clearingHistory = false;
        this.clearHistoryOpen = false;
        this.toast.success("Deleted", "Search history cleared.");
        this.cdr.markForCheck();
      },
      error: () => {
        this.clearingHistory = false;
        this.toast.error("Delete failed", "Could not clear search history.");
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================
  // SESSION (existing logout mechanism)
  // =========================================================

  signOut(): void {
    this.auth.logout();
    void this.router.navigate(["/auth/login"]);
  }

  /** Best-effort device description from the browser. No tracking involved. */
  get deviceLabel(): string {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const browser = ua.includes("Edg/")
      ? "Edge"
      : ua.includes("Chrome/")
        ? "Chrome"
        : ua.includes("Safari/") && ua.includes("Version/")
          ? "Safari"
          : ua.includes("Firefox/")
            ? "Firefox"
            : "Browser";
    const os = /Windows/.test(ua)
      ? "Windows"
      : /Macintosh/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Device";
    return `${browser} · ${os}`;
  }

  get isDevelopment(): boolean {
    if (typeof window === "undefined" || !window.location) {
      return false;
    }
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }

  // =========================================================
  // DISPLAY HELPERS
  // =========================================================

  prefState(value: boolean | null | undefined): string {
    if (value === null || value === undefined) {
      return "—";
    }
    return value ? "Enabled" : "Disabled";
  }

  formatRole(role: string | null | undefined): string {
    if (!role) {
      return "—";
    }
    const normalized = role.trim().toUpperCase();
    if (normalized === "GOVERNMENT_OFFICIAL") {
      return "Government Official";
    }
    if (normalized === "ORGANIZATION" || normalized === "ORGANISATION") {
      return "Organization";
    }
    return (
      normalized.charAt(0) + normalized.slice(1).toLowerCase()
    ).replace(/_/g, " ");
  }

  displayValue(value: string | null | undefined): string {
    const trimmed = (value || "").trim();
    return trimmed ? trimmed : "—";
  }
}
