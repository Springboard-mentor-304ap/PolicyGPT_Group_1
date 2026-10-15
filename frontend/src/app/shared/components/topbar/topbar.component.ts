import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from "@angular/core";

import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from "@angular/router";
import {
  Subject,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  of,
  switchMap,
} from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { Auth, AuthUser } from "../../../core/services/auth";
import { AvatarService } from "../../../core/services/avatar.service";
import { LoginPromptService } from "../../../core/services/login-prompt.service";
import {
  GlobalSearchService,
  normalizeGlobalQuery,
} from "../../../core/services/global-search.service";
import type { PolicyResponse } from "../../../core/models/policy.model";
import type { SchemeResponse } from "../../../core/models/scheme.model";

import { NotificationBellComponent } from "../notification-bell/notification-bell.component";
import { GlobalSearchDropdownComponent } from "../global-search-dropdown/global-search-dropdown.component";

/* =========================================================
   SHARED TOPBAR
   Single topbar for every role (Administrator, Government
   Official, Citizen, Researcher, Organization, Guest).

   Three-region grid: left (menu + brand) | center (search) |
   right (notifications + profile, or guest actions). The two
   1fr side columns keep the center column truly centered
   regardless of side widths, zoom, or long user names.
   ========================================================= */

export interface GuestNavItem {
  icon: string;
  label: string;
  route: string;
  exact?: boolean;
  requiresLogin?: boolean;
}

@Component({
  selector: "app-topbar",

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    NotificationBellComponent,
    GlobalSearchDropdownComponent,
  ],

  templateUrl: "./topbar.component.html",
  styleUrl: "./topbar.component.scss",
})
export class TopbarComponent implements OnInit, OnDestroy {
  /** True for the public guest layout (guest actions + nav). */
  @Input() guest = false;

  /** False when the layout has no sidebar (guest). */
  @Input() showMenuToggle = true;

  /** Current sidebar state, for the toggle's aria-expanded. */
  @Input() sidebarCollapsed = false;

  /** Layout toggles its sidebar. */
  @Output() menuToggle = new EventEmitter<void>();

  /** Layout closes mobile menus on logo navigation. */
  @Output() logoClick = new EventEmitter<void>();

  // =========================================================
  // USER (authenticated roles)
  // =========================================================

  user: AuthUser | null = null;

  userName = signal("User Name");
  userRoleLabel = signal("");

  /** Object URL of the authenticated user's photo; null = icon. */
  avatarSrc = signal<string | null>(null);
  avatarLoading = signal(false);

  loadingUser = true;

  /** dashboard/<prefix> for search + detail + home navigation. */
  rolePrefix = "citizen";

  // =========================================================
  // GLOBAL SEARCH (all roles, including guest)
  // =========================================================

  searchText = "";

  globalPolicies: PolicyResponse[] = [];
  globalSchemes: SchemeResponse[] = [];
  globalTotalPolicies = 0;
  globalTotalSchemes = 0;
  globalLoading = false;
  globalError: string | null = null;
  showGlobalDropdown = false;
  globalActiveIndex = -1;

  private readonly globalSearchSubject = new Subject<string>();
  private globalSearchSub: Subscription | null = null;
  private lastGlobalQuery = "";

  // =========================================================
  // MOBILE SEARCH (collapsed behind icon on narrow screens)
  // =========================================================

  /** True while the mobile search input is expanded as an overlay. */
  mobileSearchOpen = false;

  @ViewChild("globalSearchInput")
  globalSearchInput?: ElementRef<HTMLInputElement>;

  // =========================================================
  // GUEST NAVIGATION + LOGIN MODAL
  // =========================================================

  guestNavItems: GuestNavItem[] = [
    { icon: "home", label: "Home", route: "/dashboard/guest", exact: true },
    {
      icon: "policy",
      label: "Policy",
      route: "/dashboard/guest/policies/search",
      exact: false,
    },
    {
      icon: "account_balance",
      label: "Scheme",
      route: "/dashboard/guest/schemes",
      exact: false,
    },
    {
      icon: "fact_check",
      label: "Eligibility Checker",
      route: "/dashboard/guest/eligibility",
      exact: false,
      requiresLogin: true,
    },
    {
      icon: "compare_arrows",
      label: "Compare",
      route: "/dashboard/guest/compare",
      exact: false,
      requiresLogin: true,
    },
    {
      icon: "support_agent",
      label: "Support",
      route: "/dashboard/guest/support",
      exact: false,
    },
  ];

  guestDrawerOpen = false;
  showLoginMessage = false;
  loginMessage = "";

  // =========================================================
  // SERVICES
  // =========================================================

  constructor(
    @Inject(Router) private readonly router: Router,
    @Inject(Auth) private readonly authService: Auth,
    @Inject(AvatarService) private readonly avatarService: AvatarService,
  ) {}

  private readonly destroyRef = inject(DestroyRef);
  private readonly globalSearchService = inject(GlobalSearchService);
  private readonly hostElement = inject(ElementRef);
  private readonly loginPrompt = inject(LoginPromptService);

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.rolePrefix = this.resolveRolePrefix();

    // Footer login-gated actions reuse this same guest modal instance.
    this.loginPrompt.prompt$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((feature) => {
        this.requireLogin(feature || "This feature");
      });

    if (this.guest) {
      this.loadingUser = false;
      this.setupGlobalSearch();
      return;
    }

    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (!user) {
          this.user = null;
          this.userName.set("User Name");
          this.userRoleLabel.set("");
          this.avatarSrc.set(null);
          this.avatarLoading.set(false);
          this.loadingUser = false;
          return;
        }
        this.setUserDetails(user);
        this.refreshAvatar(user);
      });

    this.loadCurrentUser();
    this.setupGlobalSearch();

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.closeGlobalDropdown();
        this.closeMobileSearch();
      });
  }

  ngOnDestroy(): void {
    this.globalSearchSub?.unsubscribe();
  }

  // =========================================================
  // ROLE
  // =========================================================

  private resolveRolePrefix(): string {
    if (this.guest) return "guest";
    const role = String(this.authService.getUserRole() || "")
      .trim()
      .toUpperCase();
    switch (role) {
      case "ADMIN":
      case "ADMINISTRATOR":
      case "ADMINISTRATOR_ROLE":
        return "admin";
      case "GOVERNMENT":
      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT_OFFICER":
      case "GOVT":
        return "government";
      case "RESEARCHER":
        return "researcher";
      case "ORGANIZATION":
      case "ORGANISATION":
        return "organization";
      case "GUEST":
        return "guest";
      case "CITIZEN":
        return "citizen";
      default:
        break;
    }
    const url = this.router.url || "";
    if (url.includes("/dashboard/admin")) return "admin";
    if (url.includes("/dashboard/government")) return "government";
    if (url.includes("/dashboard/researcher")) return "researcher";
    if (url.includes("/dashboard/organization")) return "organization";
    if (url.includes("/dashboard/guest")) return "guest";
    if (url.includes("/dashboard/citizen")) return "citizen";
    return "citizen";
  }

  get homeRoute(): string[] {
    return ["/dashboard", this.rolePrefix];
  }

  get profileRoute(): string[] {
    return ["/dashboard", this.rolePrefix, "profile"];
  }

  // =========================================================
  // USER
  // =========================================================

  private loadCurrentUser(): void {
    this.loadingUser = true;

    const snapshot =
      this.authService.getCurrentUserSnapshot?.() ??
      this.authService.getStoredUser();

    if (snapshot) {
      this.setUserDetails(snapshot);
      if (!this.avatarSrc() && snapshot.profile_photo_updated_at) {
        this.avatarLoading.set(true);
      } else if (!snapshot.profile_photo_updated_at) {
        this.avatarLoading.set(false);
      }
      this.loadingUser = false;
    }

    const token = this.authService.getToken();

    if (!token) {
      this.authService.logout();
      this.router.navigate(["/auth/login"], { replaceUrl: true });
      return;
    }

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (!user) {
          this.loadingUser = false;
          return;
        }
        this.setUserDetails(user);
        this.refreshAvatar(user);
        this.loadingUser = false;
      },

      error: (error: unknown) => {
        this.loadingUser = false;
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) {
          this.authService.logout();
          this.router.navigate(["/auth/login"], { replaceUrl: true });
        }
      },
    });
  }

  private setUserDetails(user: AuthUser): void {
    this.user = user;
    this.userName.set(user.full_name?.trim() || "User Name");
    this.userRoleLabel.set(this.formatRole(user.role));
  }

  private refreshAvatar(user: AuthUser): void {
    if (!user?.profile_photo_updated_at) {
      this.avatarSrc.set(null);
      this.avatarLoading.set(false);
      return;
    }
    if (!this.avatarSrc()) {
      this.avatarLoading.set(true);
    }
    this.avatarService.photoSrcFor(user).subscribe({
      next: (src) => {
        this.avatarSrc.set(src);
        this.avatarLoading.set(false);
      },
      error: () => {
        this.avatarSrc.set(null);
        this.avatarLoading.set(false);
      },
    });
  }

  private formatRole(role: string | null | undefined): string {
    if (!role) return "";
    return role
      .trim()
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  // =========================================================
  // GLOBAL SEARCH
  // =========================================================

  private setupGlobalSearch(): void {
    this.globalSearchSub?.unsubscribe();
    this.globalSearchSub = this.globalSearchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((raw) => {
          const q = normalizeGlobalQuery(raw);
          if (!q) {
            return of({
              query: "",
              total_policies: 0,
              total_schemes: 0,
              policies: [],
              schemes: [],
            });
          }
          this.globalLoading = true;
          this.globalError = null;
          this.lastGlobalQuery = q;
          const requestQuery = q;
          return this.globalSearchService.search(q, 5).pipe(
            catchError(() => {
              if (this.lastGlobalQuery !== requestQuery) {
                return of(null);
              }
              this.globalLoading = false;
              this.globalError =
                "Search is unavailable right now. Please try again.";
              this.globalPolicies = [];
              this.globalSchemes = [];
              this.globalTotalPolicies = 0;
              this.globalTotalSchemes = 0;
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res === null) return;
        if (
          normalizeGlobalQuery(this.searchText) !==
            normalizeGlobalQuery(res.query) &&
          res.query !== ""
        ) {
          return;
        }
        this.globalLoading = false;
        this.globalError = null;
        this.globalPolicies = Array.isArray(res.policies) ? res.policies : [];
        this.globalSchemes = Array.isArray(res.schemes) ? res.schemes : [];
        this.globalTotalPolicies = Number(res.total_policies) || 0;
        this.globalTotalSchemes = Number(res.total_schemes) || 0;
        this.globalActiveIndex = -1;
      });
  }

  onGlobalSearchInput(): void {
    const q = normalizeGlobalQuery(this.searchText);
    if (!q) {
      this.closeGlobalDropdown();
      return;
    }
    this.showGlobalDropdown = true;
    this.globalActiveIndex = -1;
    // Show the loading state immediately (synchronously). The debounced
    // request resolves ~300ms later; without this the dropdown would
    // flash a false "no results" empty state on every keystroke.
    this.globalLoading = true;
    this.globalError = null;
    this.globalSearchSubject.next(this.searchText);
  }

  onGlobalSearchFocus(): void {
    if (normalizeGlobalQuery(this.searchText)) {
      this.showGlobalDropdown = true;
      this.globalLoading = true;
      this.globalError = null;
      this.globalSearchSubject.next(this.searchText);
    }
  }

  onGlobalSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.closeGlobalDropdown();
      this.closeMobileSearch();
      return;
    }
    const count =
      (this.globalPolicies?.length ?? 0) + (this.globalSchemes?.length ?? 0);
    if (
      !this.showGlobalDropdown ||
      this.globalLoading ||
      this.globalError ||
      count === 0
    ) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.globalActiveIndex =
        this.globalActiveIndex + 1 >= count ? 0 : this.globalActiveIndex + 1;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.globalActiveIndex =
        this.globalActiveIndex - 1 < 0 ? count - 1 : this.globalActiveIndex - 1;
    }
  }

  private flatGlobalItem(
    index: number,
  ): { kind: "policy" | "scheme"; item: PolicyResponse | SchemeResponse } | null {
    const pCount = this.globalPolicies?.length ?? 0;
    if (index < 0) return null;
    if (index < pCount) {
      return { kind: "policy", item: this.globalPolicies[index] };
    }
    const sIndex = index - pCount;
    if (sIndex < (this.globalSchemes?.length ?? 0)) {
      return { kind: "scheme", item: this.globalSchemes[sIndex] };
    }
    return null;
  }

  selectGlobalPolicy(policy: PolicyResponse): void {
    const id = Number(policy?.policy_id);
    if (!Number.isFinite(id) || id <= 0) return;
    this.closeGlobalDropdown();
    this.closeMobileSearch();
    this.router.navigate(["/dashboard", this.rolePrefix, "policies", id]);
  }

  selectGlobalScheme(scheme: SchemeResponse): void {
    const id = Number(scheme?.scheme_id);
    if (!Number.isFinite(id) || id <= 0) return;
    this.closeGlobalDropdown();
    this.closeMobileSearch();
    this.router.navigate(["/dashboard", this.rolePrefix, "schemes", id]);
  }

  viewAllGlobalPolicies(): void {
    const q = normalizeGlobalQuery(this.searchText);
    this.closeGlobalDropdown();
    this.closeMobileSearch();
    this.router.navigate(["/dashboard", this.rolePrefix, "policies/search"], {
      queryParams: q ? { q } : {},
    });
  }

  viewAllGlobalSchemes(): void {
    const q = normalizeGlobalQuery(this.searchText);
    this.closeGlobalDropdown();
    this.closeMobileSearch();
    this.router.navigate(["/dashboard", this.rolePrefix, "schemes"], {
      queryParams: q ? { q } : {},
    });
  }

  clearGlobalSearch(): void {
    this.searchText = "";
    this.closeGlobalDropdown();
  }

  closeGlobalDropdown(): void {
    this.showGlobalDropdown = false;
    this.globalActiveIndex = -1;
    this.globalLoading = false;
  }

  performSearch(): void {
    const active = this.flatGlobalItem(this.globalActiveIndex);
    if (this.showGlobalDropdown && active) {
      if (active.kind === "policy") {
        this.selectGlobalPolicy(active.item as PolicyResponse);
      } else {
        this.selectGlobalScheme(active.item as SchemeResponse);
      }
      return;
    }
    const query = normalizeGlobalQuery(this.searchText);
    if (!query) return;
    this.closeGlobalDropdown();
    this.closeMobileSearch();
    // Researcher topbar is policy-oriented; every other role keeps the
    // existing schemes listing target. All targets stay in-layout.
    const target =
      this.rolePrefix === "researcher" ? "policies/search" : "schemes";
    this.router.navigate(["/dashboard", this.rolePrefix, target], {
      queryParams: { q: query },
    });
  }

  // =========================================================
  // MOBILE SEARCH TOGGLE (narrow screens)
  // =========================================================

  toggleMobileSearch(): void {
    this.mobileSearchOpen = !this.mobileSearchOpen;
    if (this.mobileSearchOpen) {
      setTimeout(() => {
        this.globalSearchInput?.nativeElement?.focus();
      }, 0);
    } else {
      this.closeGlobalDropdown();
    }
  }

  closeMobileSearch(): void {
    this.mobileSearchOpen = false;
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    // Close the expanded mobile search when tapping outside it.
    if (this.mobileSearchOpen && target) {
      const hostContains =
        this.hostElement?.nativeElement?.contains(target) ?? false;
      if (!hostContains) {
        this.closeMobileSearch();
        this.closeGlobalDropdown();
        return;
      }
      const insideSearch = (target as HTMLElement).closest?.(
        ".topbar-search, .topbar__search-toggle",
      );
      if (!insideSearch) {
        this.closeMobileSearch();
      }
    }
    if (!this.showGlobalDropdown) return;
    if (target && this.hostElement?.nativeElement?.contains(target)) {
      const searchBox = (target as HTMLElement).closest?.(
        ".topbar-search, .topbar__search-toggle",
      );
      if (searchBox) return;
    }
    this.closeGlobalDropdown();
  }

  // =========================================================
  // GUEST NAVIGATION + LOGIN MODAL
  // =========================================================

  toggleGuestDrawer(): void {
    this.guestDrawerOpen = !this.guestDrawerOpen;
  }

  closeGuestDrawer(): void {
    this.guestDrawerOpen = false;
  }

  @HostListener("window:resize")
  onWindowResize(): void {
    if (window.innerWidth > 960) {
      this.guestDrawerOpen = false;
    }
    if (window.innerWidth > 767) {
      this.closeMobileSearch();
    }
  }

  requireLogin(feature: string): void {
    this.loginMessage = `${feature} requires you to login or sign up first.`;
    this.showLoginMessage = true;
    this.closeGuestDrawer();
  }

  closeLoginMessage(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
  }

  goToLogin(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
    this.closeGuestDrawer();
    this.router.navigate(["/auth/login"]);
  }

  goToSignup(): void {
    this.showLoginMessage = false;
    this.loginMessage = "";
    this.closeGuestDrawer();
    this.router.navigate(["/auth/register"]);
  }
}
