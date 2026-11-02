import { CommonModule } from "@angular/common";
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
} from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { catchError, forkJoin, of, Subject, takeUntil } from "rxjs";

import { ChatbotOpenService } from "../../../core/services/chatbot-open.service";
import { BodyScrollLockService } from "../../../core/services/body-scroll-lock.service";
import { PolicyService } from "../../../core/services/policy.service";
import { SchemeService } from "../../../core/services/scheme.service";
import { Auth } from "../../../core/services/auth";
import {
  PolicyListResponse,
  PolicyResponse,
} from "../../../core/models/policy.model";
import {
  SchemeListResponse,
  SchemeResponse,
} from "../../../core/models/scheme.model";

/* =========================================================
   PUBLIC HOMEPAGE (unauthenticated landing)
   The inline search bar opens the access-choice popup (Continue as
   Guest / Login / Sign Up) with the keyword preserved. Login,
   signup, forgot-password, info panels and the access-choice dialog
   open centered modals instead of navigating directly. Authentication runs through the same
   Auth service endpoints with the same validation rules and
   error mapping as the standalone Login / Register /
   PasswordReset pages (email+phone login, Remember Me, forgot
   flow with OTP, role selection, state/district options).
   Search reuses the existing policy/scheme list APIs with the
   same APPROVED-only filtering as the Guest combined search.
   Guest destinations are reached only after an explicit
   "Continue as Guest" selection. Layout, topbar visuals, hero
   art, curve, tokens and responsive rules are unchanged.
   ========================================================= */

type HomeModal = "forgot" | "search" | "choice" | "panel" | "external";

type PanelActionKind =
  "search" | "login" | "signup" | "guest" | "assistant" | "close";

interface PanelAction {
  label: string;
  icon: string;
  kind: PanelActionKind;
  /** Guest destination used when kind === 'guest'. */
  guestRoute?: string[];
}

interface InfoPanel {
  icon: string;
  title: string;
  intro: string;
  lines?: string[];
  actions: PanelAction[];
}

interface LandingHighlight {
  icon: string;
  tint: string;
  title: string;
  text: string;
  feature: "search" | "understand" | "explore" | "insights";
}

interface Beneficiary {
  icon: string;
  tint: string;
  title: string;
  text: string;
}

interface KeyFeature {
  icon: string;
  title: string;
  text: string;
}

interface PlatformStat {
  icon: string;
  tint: string;
  value: number;
  suffix: string;
  label: string;
}

interface SearchHit {
  kind: "policy" | "scheme";
  id: number | string;
  title: string;
  category: string;
}

@Component({
  selector: "app-public-home",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: "./public-home.component.html",
  styleUrl: "./public-home.component.scss",
})
export class PublicHomeComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly chatbotOpen = inject(ChatbotOpenService);
  private readonly scrollLock = inject(BodyScrollLockService);
  private readonly policyService = inject(PolicyService);
  private readonly schemeService = inject(SchemeService);
  private readonly authService = inject(Auth);
  private readonly destroy$ = new Subject<void>();

  /** Inline (page) search field — Enter/Search navigates to guest results. */
  searchQuery = "";

  /** Single modal at a time; null means no modal is open. */
  activeModal: HomeModal | null = null;

  readonly currentYear = new Date().getFullYear();

  @ViewChild("searchInput")
  searchInput?: ElementRef<HTMLInputElement>;

  private lastFocusedElement: HTMLElement | null = null;
  private scrollLocked = false;

  /* ---------------- Generic info/feature panel ---------------- */
  panel: InfoPanel = { icon: "", title: "", intro: "", actions: [] };

  /* ---------------- Search modal state ---------------- */
  modalSearchQuery = "";
  searchStage: "input" | "results" = "input";
  searchValidation: string | null = null;
  searchLoading = false;
  searchError = "";
  searchHits: SearchHit[] = [];
  searchTotalPolicies = 0;
  searchTotalSchemes = 0;

  /* ---------------- Choice (access) modal state ---------------- */
  choiceQuery = "";
  choiceContext: string | null = null;
  choiceGuestRoute: string[] = ["/dashboard/guest"];
  choiceBackToSearch = false;

  /* ---------------- External-link confirm state ---------------- */
  externalUrl = "";
  externalLabel = "";

  /* ---------------- Forgot-password modal state ---------------- */
  fpStep = 1;
  fpIdentifier = "";
  fpType: "email" | "phone" = "email";
  fpSubmittedEmail = "";
  fpSubmittedPhone = "";
  fpSubmittedIdentifier = "";
  fpOtp = "";
  fpNewPassword = "";
  fpConfirmPassword = "";
  fpHidePassword = true;
  fpLoading = false;
  fpError = "";
  fpSuccess = "";
  private fpResetToken = "";

  readonly highlights: LandingHighlight[] = [
    {
      icon: "description",
      tint: "blue",
      title: "Search",
      text: "Policies & Schemes",
      feature: "search",
    },
    {
      icon: "layers",
      tint: "blue",
      title: "Understand",
      text: "Eligibility & Benefits",
      feature: "understand",
    },
    {
      icon: "bar_chart",
      tint: "blue",
      title: "Get Insights",
      text: "with AI Assistance",
      feature: "insights",
    },
    {
      icon: "location_on",
      tint: "blue",
      title: "Explore",
      text: "Policy & Scheme Info",
      feature: "explore",
    },
  ];

  readonly beneficiaries: Beneficiary[] = [
    {
      icon: "groups",
      tint: "blue",
      title: "Citizens",
      text: "Find schemes you're eligible for and access important information in simple language.",
    },
    {
      icon: "account_balance",
      tint: "orange",
      title: "Government Officials",
      text: "Manage policies, monitor implementation and gain insights.",
    },
    {
      icon: "school",
      tint: "green",
      title: "Researchers",
      text: "Access authentic data and analyze policy trends.",
    },
    {
      icon: "apartment",
      tint: "purple",
      title: "Organizations",
      text: "Explore relevant policies and schemes for your initiatives.",
    },
    {
      icon: "person",
      tint: "pink",
      title: "Guest Users",
      text: "Browse key information and learn about government initiatives.",
    },
  ];

  readonly keyFeaturesLeft: KeyFeature[] = [
    {
      icon: "description",
      title: "Comprehensive Information",
      text: "Access policies, schemes, eligibility criteria, benefits and more in one place.",
    },
    {
      icon: "public",
      title: "Location Based Access",
      text: "Explore schemes and policies relevant to your state or district.",
    },
  ];

  readonly keyFeaturesRight: KeyFeature[] = [
    {
      icon: "lightbulb",
      title: "AI Powered Assistance",
      text: "Get instant and easy-to-understand answers to your queries.",
    },
    {
      icon: "settings",
      title: "Simplified Access",
      text: "Complex government information made simple for everyone.",
    },
  ];

  readonly stats: PlatformStat[] = [
    {
      icon: "description",
      tint: "blue",
      value: 100,
      suffix: "+",
      label: "Policies",
    },
    { icon: "layers", tint: "red", value: 500, suffix: "+", label: "Schemes" },
    {
      icon: "domain",
      tint: "green",
      value: 50,
      suffix: "+",
      label: "Ministries",
    },
    {
      icon: "groups",
      tint: "purple",
      value: 30,
      suffix: "+",
      label: "Sectors",
    },
  ];

  /* =========================================================
     MODAL PLUMBING (one modal at a time)
     ========================================================= */

  get isModalOpen(): boolean {
    return this.activeModal !== null;
  }

  /** Accessible name for the dialog (auth dialogs use aria-label). */
  modalAriaLabel(): string {
    switch (this.activeModal) {
      case "forgot":
        return "Forgot password dialog";
      case "search":
        return "Search dialog";
      case "choice":
        return "Continue to search dialog";
      case "external":
        return "External link confirmation dialog";
      default:
        return "Dialog";
    }
  }

  private openModal(kind: HomeModal): void {
    const firstOpen = this.activeModal === null;
    if (firstOpen) {
      this.lastFocusedElement =
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      this.scrollLock.lock();
      this.scrollLocked = true;
    }
    this.activeModal = kind;
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        if (typeof document === "undefined") {
          return;
        }
        const el = document.querySelector(
          ".landing-modal__close",
        ) as HTMLElement | null;
        el?.focus();
      }, 0);
    }
  }

  closeModal(): void {
    if (this.activeModal === null) {
      return;
    }
    this.activeModal = null;
    this.searchLoading = false;
    this.fpLoading = false;
    if (this.scrollLocked) {
      this.scrollLock.unlock();
      this.scrollLocked = false;
    }
    // Return focus to the page after the modal closes.
    const fallback = this.lastFocusedElement;
    this.lastFocusedElement = null;
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const search = this.searchInput?.nativeElement;
        if (search && document.activeElement !== search) {
          search.focus();
        } else {
          fallback?.focus();
        }
      }, 0);
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (
      (event.target as HTMLElement | null)?.classList?.contains(
        "landing-modal-backdrop",
      )
    ) {
      this.closeModal();
    }
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.activeModal !== null) {
      this.closeModal();
    }
  }

  /** Keep Tab cycling inside the open modal. */
  onModalKeydown(event: KeyboardEvent): void {
    if (
      this.activeModal === null ||
      event.key !== "Tab" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const dialog = document.querySelector(".landing-modal");
    if (!dialog) {
      return;
    }
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* =========================================================
     AUTH PAGES (standalone Login / Register routes)
     ========================================================= */

  /** Topbar, hero and modal links route to the real Login page. */
  openLogin(): void {
    this.dismissModalForNavigation();
    void this.router.navigate(["/auth/login"]);
  }

  /** Topbar, hero and modal links route to the real Register page. */
  openSignup(): void {
    this.dismissModalForNavigation();
    void this.router.navigate(["/auth/register"]);
  }

  private passwordIsStrong(password: string): boolean {
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return (
      [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length >= 3
    );
  }

  /* =========================================================
     FORGOT-PASSWORD MODAL (same OTP flow as the standalone
     PasswordReset page: identifier -> code -> new password)
     ========================================================= */

  openForgot(): void {
    this.fpStep = 1;
    this.fpError = "";
    this.fpSuccess = "";
    this.openModal("forgot");
  }

  submitForgotIdentifier(): void {
    if (this.fpLoading) {
      return;
    }
    this.fpError = "";
    const raw = this.fpIdentifier.trim();
    const digits = raw.replace(/\D/g, "");
    if (
      /^[0-9]{10}$/.test(digits) &&
      raw.replace(/[\s+\-()]/g, "") === digits
    ) {
      this.fpType = "phone";
      this.fpSubmittedPhone = digits;
      this.fpSubmittedEmail = "";
      this.fpSubmittedIdentifier = digits;
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.toLowerCase())) {
      this.fpType = "email";
      this.fpSubmittedEmail = raw.toLowerCase();
      this.fpSubmittedPhone = "";
      this.fpSubmittedIdentifier = this.fpSubmittedEmail;
    } else {
      this.fpError = "Enter your registered email or 10-digit phone number.";
      return;
    }
    this.fpLoading = true;
    const channel = this.fpType === "phone" ? "sms" : "email";
    this.authService
      .requestPasswordReset(
        this.fpSubmittedEmail,
        this.fpSubmittedPhone || null,
        channel,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: { message?: string }) => {
          this.fpLoading = false;
          this.fpOtp = "";
          this.fpSuccess =
            response?.message ||
            `A verification code has been sent by ${channel === "sms" ? "SMS" : "email"}.`;
          this.fpError = "";
          this.fpStep = 2;
        },
        error: (err: {
          error?: { detail?: string; message?: string } | string;
        }) => {
          this.fpLoading = false;
          this.fpError = this.extractAuthError(
            err,
            "Unable to send verification code. Please try again.",
          );
        },
      });
  }

  submitForgotOtp(): void {
    if (this.fpLoading) {
      return;
    }
    this.fpError = "";
    const code = this.fpOtp.trim();
    if (!/^\d{6}$/.test(code)) {
      this.fpError = "Enter the 6-digit verification code.";
      return;
    }
    if (!this.fpSubmittedIdentifier) {
      this.fpError = "Session expired. Please request a new code.";
      this.fpStep = 1;
      return;
    }
    this.fpLoading = true;
    const channel = this.fpType === "phone" ? "sms" : "email";
    this.authService
      .verifyOtp(
        this.fpType === "phone" ? null : this.fpSubmittedEmail,
        code,
        channel,
        this.fpType === "phone" ? this.fpSubmittedPhone : null,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: { reset_token?: string }) => {
          this.fpLoading = false;
          const token = response?.reset_token || "";
          if (!token) {
            this.fpError = "Verification failed. Please try again.";
            return;
          }
          this.fpResetToken = token;
          this.fpSuccess = "";
          this.fpError = "";
          this.fpStep = 3;
        },
        error: (err: {
          error?: { detail?: string; message?: string } | string;
        }) => {
          this.fpLoading = false;
          this.fpError = this.extractAuthError(
            err,
            "Verification failed. Please try again.",
          );
        },
      });
  }

  submitForgotPassword(): void {
    if (this.fpLoading) {
      return;
    }
    this.fpError = "";
    if (!this.fpNewPassword || this.fpNewPassword.length < 8) {
      this.fpError = "Password must be at least 8 characters long.";
      return;
    }
    if (!this.passwordIsStrong(this.fpNewPassword)) {
      this.fpError =
        "Use at least 3 of: lowercase, uppercase, number, special character.";
      return;
    }
    if (this.fpNewPassword !== this.fpConfirmPassword) {
      this.fpError = "Passwords do not match.";
      return;
    }
    if (!this.fpResetToken) {
      this.fpError = "Session expired. Please verify OTP again.";
      this.fpStep = 2;
      return;
    }
    this.fpLoading = true;
    this.authService
      .resetPassword(
        this.fpResetToken,
        this.fpNewPassword,
        this.fpConfirmPassword,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.fpLoading = false;
          this.fpError = "";
          this.fpStep = 4;
        },
        error: (err: {
          error?: { detail?: string; message?: string } | string;
        }) => {
          this.fpLoading = false;
          this.fpError = this.extractAuthError(
            err,
            "Unable to reset password. Please try again.",
          );
        },
      });
  }

  private extractAuthError(
    err: { error?: { detail?: string; message?: string } | string },
    fallback: string,
  ): string {
    const raw = err?.error;
    if (typeof raw === "string") {
      return raw.trim() || fallback;
    }
    const detail = String(raw?.detail ?? raw?.message ?? "").trim();
    return detail || fallback;
  }

  /* =========================================================
     SEARCH (inline bar opens the access-choice popup; the search
     modal below remains for panel flows such as About > Try Search)
     ========================================================= */

  /** Inline form submitted (Enter or Search button — same handler):
      open the existing access-choice popup with the keyword preserved.
      No navigation or search API call happens before the visitor chooses. */
  onInlineSearch(query: string): void {
    if (this.activeModal !== null) {
      return;
    }
    const q = (query || "").trim();
    this.searchQuery = q;
    this.openChoice(q, null, ["/dashboard/guest"], false);
  }

  /** Search button inside the search popup. */
  onModalSearch(query: string): void {
    const q = (query || "").trim();
    if (!q) {
      this.searchStage = "input";
      this.searchValidation = "Enter a keyword to search policies and schemes.";
      return;
    }
    this.searchValidation = null;
    this.runModalSearch(q);
  }

  private runModalSearch(query: string): void {
    this.modalSearchQuery = query;
    this.searchStage = "results";
    this.searchLoading = true;
    this.searchError = "";
    this.searchHits = [];
    forkJoin({
      policies: this.policyService
        .getPolicies({ search: query, status: "APPROVED", limit: 6 })
        .pipe(
          catchError(() => {
            return of({
              policies: [],
              total: 0,
              page: 1,
              pages: 1,
              limit: 6,
            } as PolicyListResponse);
          }),
        ),
      schemes: this.schemeService
        .getSchemes({ keyword: query, status: "APPROVED", limit: 6 })
        .pipe(
          catchError(() => {
            return of({
              schemes: [],
              total: 0,
              page: 1,
              pages: 1,
              limit: 6,
            } as SchemeListResponse);
          }),
        ),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const policies: PolicyResponse[] = Array.isArray(
            res.policies?.policies,
          )
            ? res.policies.policies.filter(
                (p) =>
                  String(p?.status || "")
                    .trim()
                    .toUpperCase() === "APPROVED",
              )
            : [];
          const schemes: SchemeResponse[] = Array.isArray(res.schemes?.schemes)
            ? res.schemes.schemes.filter(
                (s) =>
                  String(s?.status || "")
                    .trim()
                    .toUpperCase() === "APPROVED",
              )
            : [];
          this.searchTotalPolicies =
            typeof res.policies?.total === "number"
              ? res.policies.total
              : policies.length;
          this.searchTotalSchemes =
            typeof res.schemes?.total === "number"
              ? res.schemes.total
              : schemes.length;
          const hits: SearchHit[] = [
            ...policies.map((p) => ({
              kind: "policy" as const,
              id: p.policy_id,
              title: String(p.title ?? ""),
              category: p.category || "Policy",
            })),
            ...schemes.map((s) => ({
              kind: "scheme" as const,
              id: s.scheme_id,
              title: String(s.name || s.title || ""),
              category: s.category || "Scheme",
            })),
          ];
          this.searchHits = hits;
          this.searchLoading = false;
        },
        error: () => {
          this.searchError = "Unable to load search results. Please try again.";
          this.searchHits = [];
          this.searchTotalPolicies = 0;
          this.searchTotalSchemes = 0;
          this.searchLoading = false;
        },
      });
  }

  backToSearchInput(): void {
    this.searchStage = "input";
    this.searchValidation = null;
    this.searchError = "";
  }

  /* =========================================================
     CHOICE (ACCESS) MODAL — guest only on explicit selection
     ========================================================= */

  openChoice(
    query: string,
    context: string | null,
    guestRoute: string[],
    backToSearch: boolean,
  ): void {
    this.choiceQuery = (query || "").trim();
    this.choiceContext = context;
    this.choiceGuestRoute = guestRoute;
    this.choiceBackToSearch = backToSearch;
    this.openModal("choice");
  }

  /** A search result was selected: ask how to continue. */
  selectSearchHit(hit: SearchHit): void {
    this.openChoice(
      this.modalSearchQuery,
      `${hit.kind === "policy" ? "Policy" : "Scheme"}: ${hit.title}`,
      ["/dashboard/guest"],
      true,
    );
  }

  backToResults(): void {
    this.searchStage = "results";
    this.openModal("search");
  }

  continueAsGuest(): void {
    const q = this.choiceQuery || this.modalSearchQuery.trim();
    const target =
      this.choiceGuestRoute.length > 0
        ? this.choiceGuestRoute
        : ["/dashboard/guest"];
    this.dismissModalForNavigation();
    // Keep the inline field in sync with the confirmed query.
    if (q) {
      this.searchQuery = q;
    }
    void this.router.navigate(target, {
      queryParams: q ? { q } : {},
    });
  }

  goToLoginFromChoice(): void {
    this.openLogin();
  }

  goToSignupFromChoice(): void {
    this.openSignup();
  }

  private dismissModalForNavigation(): void {
    this.activeModal = null;
    this.searchLoading = false;
    this.fpLoading = false;
    if (this.scrollLocked) {
      this.scrollLock.unlock();
      this.scrollLocked = false;
    }
    this.lastFocusedElement = null;
  }

  /* =========================================================
     FEATURE / AUDIENCE / INFO PANELS
     ========================================================= */

  /**
   * Search Policies & Schemes access popup.
   * Shared by the Search feature card: circular search icon, heading,
   * description and the Guest / Login / Sign Up actions in order.
   */
  openSearchAccess(): void {
    this.panel = {
      icon: "search",
      title: "Search Policies & Schemes",
      intro:
        "Search government policies, schemes, benefits and programmes in one place.",
      actions: [
        {
          label: "Continue as Guest",
          icon: "person_search",
          kind: "guest",
          guestRoute: ["/dashboard/guest"],
        },
        { label: "Login", icon: "login", kind: "login" },
        { label: "Sign Up", icon: "person_add", kind: "signup" },
      ],
    };
    this.openModal("panel");
  }

  openFeature(feature: LandingHighlight["feature"]): void {
    switch (feature) {
      case "search":
        // Same popup as an inline keyword search (screenshot design).
        this.openSearchAccess();
        break;
      case "understand":
        this.panel = {
          icon: "layers",
          title: "Understand Eligibility & Benefits",
          intro:
            "Eligibility criteria, benefits and application steps explained in simple language, so you know exactly what support you can access.",
          actions: [
            {
              label: "Continue as Guest",
              icon: "person_search",
              kind: "guest",
              guestRoute: ["/dashboard/guest/eligibility"],
            },
            { label: "Login", icon: "login", kind: "login" },
            { label: "Sign Up", icon: "person_add", kind: "signup" },
          ],
        };
        break;
      case "explore":
        this.panel = {
          icon: "location_on",
          title: "Explore Policy & Scheme Info",
          intro:
            "Filter policies and schemes by your state or district to find what is relevant where you live.",
          actions: [
            {
              label: "Continue as Guest",
              icon: "person_search",
              kind: "guest",
              guestRoute: ["/dashboard/guest/schemes"],
            },
            { label: "Login", icon: "login", kind: "login" },
            { label: "Sign Up", icon: "person_add", kind: "signup" },
          ],
        };
        break;
      case "insights":
      default:
        this.panel = {
          icon: "smart_toy",
          title: "Get Insights with AI Assistance",
          intro:
            "Ask questions in plain language and get instant, easy-to-understand answers about policies, schemes and eligibility.",
          actions: [
            {
              label: "Open AI Assistant",
              icon: "smart_toy",
              kind: "assistant",
            },
            { label: "Login", icon: "login", kind: "login" },
            { label: "Sign Up", icon: "person_add", kind: "signup" },
          ],
        };
        break;
    }
    this.openModal("panel");
  }

  openInfo(
    key: "about" | "contact" | "help" | "privacy" | "terms" | "feedback",
  ): void {
    switch (key) {
      case "about":
        this.panel = {
          icon: "info",
          title: "About PolicyGPT",
          intro:
            "PolicyGPT helps citizens, researchers, organizations and government officials easily access, search and understand government policies and public schemes — all in one place.",
          actions: [
            { label: "Try Search", icon: "search", kind: "search" },
            { label: "Login", icon: "login", kind: "login" },
            { label: "Sign Up", icon: "person_add", kind: "signup" },
          ],
        };
        break;
      case "contact":
        this.panel = {
          icon: "call",
          title: "Contact Us",
          intro:
            "Reach the PolicyGPT support desk through these official channels:",
          lines: [
            "Toll-Free National Helpline: 1800-11-7654",
            "Email: support@policygpt.gov.in",
            "Service Hours: Mon - Sat, 9:00 AM - 6:00 PM IST",
          ],
          actions: [
            {
              label: "Open AI Assistant",
              icon: "smart_toy",
              kind: "assistant",
            },
            { label: "Login", icon: "login", kind: "login" },
          ],
        };
        break;
      case "help":
        this.panel = {
          icon: "help_outline",
          title: "Help & Support",
          intro:
            "Find answers about searching policies, checking eligibility, comparing schemes and managing your account. The AI assistant can answer most questions instantly.",
          actions: [
            {
              label: "Open AI Assistant",
              icon: "smart_toy",
              kind: "assistant",
            },
            { label: "Login", icon: "login", kind: "login" },
          ],
        };
        break;
      case "privacy":
        this.panel = {
          icon: "privacy_tip",
          title: "Privacy Policy",
          intro: "How PolicyGPT handles your information:",
          lines: [
            "We collect only the account details you provide during signup and login.",
            "Your details are used to personalize results and keep your account secure.",
            "Guest browsing does not require an account.",
            "We never sell your personal information.",
          ],
          actions: [{ label: "Got It", icon: "check", kind: "close" }],
        };
        break;
      case "terms":
        this.panel = {
          icon: "verified_user",
          title: "Terms of Use",
          intro: "By using PolicyGPT you agree to:",
          lines: [
            "Use published policy and scheme information for lawful purposes.",
            "Provide accurate details when creating an account.",
            "Rely on official government portals for final application decisions.",
          ],
          actions: [{ label: "Got It", icon: "check", kind: "close" }],
        };
        break;
      case "feedback":
      default:
        this.panel = {
          icon: "rate_review",
          title: "Feedback & Grievances",
          intro:
            "Share feedback or raise a grievance about policies, schemes or your PolicyGPT experience. Sign in to submit and track your requests.",
          actions: [
            { label: "Login", icon: "login", kind: "login" },
            { label: "Sign Up", icon: "person_add", kind: "signup" },
          ],
        };
        break;
    }
    this.openModal("panel");
  }

  runPanelAction(action: PanelAction): void {
    switch (action.kind) {
      case "search":
        this.modalSearchQuery = "";
        this.searchStage = "input";
        this.searchValidation = null;
        this.searchError = "";
        this.openModal("search");
        break;
      case "login":
        this.openLogin();
        break;
      case "signup":
        this.openSignup();
        break;
      case "guest": {
        const target =
          action.guestRoute && action.guestRoute.length > 0
            ? action.guestRoute
            : ["/dashboard/guest"];
        const q = this.searchQuery.trim();
        this.dismissModalForNavigation();
        void this.router.navigate(target, {
          queryParams: q ? { q } : {},
        });
        break;
      }
      case "assistant":
        this.closeModal();
        this.chatbotOpen.requestOpen();
        break;
      case "close":
      default:
        this.closeModal();
        break;
    }
  }

  /* ---------------- External links (confirm first) ---------------- */

  openExternal(url: string, label: string): void {
    this.externalUrl = url;
    this.externalLabel = label || url;
    this.openModal("external");
  }

  confirmExternal(): void {
    const url = this.externalUrl;
    this.closeModal();
    if (url && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener");
    }
  }

  openAssistant(): void {
    this.chatbotOpen.requestOpen();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.scrollLocked) {
      this.scrollLock.unlock();
      this.scrollLocked = false;
    }
  }
}
