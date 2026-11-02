import { Injectable, inject } from "@angular/core";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationExtras,
  Router,
} from "@angular/router";
import { filter } from "rxjs";

import { Auth } from "./auth";

/* =========================================================
   NAVIGATION CONTEXT (context-aware Back button)
   Tracks whether the current page was opened from the sidebar
   (plain routerLink, no Back button) or from an in-page button,
   link, or card action (Back button shown in the page header).

   In-page navigations go through navigateFromAction(), which
   records the return URL before navigating. Any other completed
   navigation (sidebar links, direct URL entry, refresh, browser
   back/forward) clears the context, as do cancelled/failed
   navigations. Same-path query updates (filters, pagination)
   preserve the context. No backend, schema, or auth changes.
   ========================================================= */

@Injectable({ providedIn: "root" })
export class NavigationContextService {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);

  /** URL (with query string) Back should return to, if any. */
  private returnUrl: string | null = null;

  /** True between navigateFromAction() and its NavigationEnd. */
  private pendingAction = false;

  /** Last completed path, to tell page changes from query updates. */
  private lastPath = "";

  constructor() {
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd | NavigationCancel | NavigationError =>
            event instanceof NavigationEnd ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError,
        ),
      )
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          const path = event.urlAfterRedirects.split(/[?#]/)[0];
          if (this.pendingAction) {
            this.pendingAction = false;
          } else if (path !== this.lastPath) {
            this.returnUrl = null;
          }
          this.lastPath = path;
        } else {
          this.pendingAction = false;
          this.returnUrl = null;
        }
      });
  }

  /**
   * Record an in-page button/link/card navigation that the caller performs
   * with its own router call. The destination's Back button will return
   * here. Call it immediately before navigating.
   */
  markActionSource(): void {
    this.returnUrl = this.router.url;
    this.pendingAction = true;
  }

  /**
   * Navigate as an in-page button/link/card action (convenience wrapper
   * around markActionSource + router.navigate).
   */
  navigateFromAction(
    commands: unknown[],
    extras?: NavigationExtras,
  ): Promise<boolean> {
    this.markActionSource();
    return this.router.navigate(commands as [], extras);
  }

  /** Whether the current page may offer a Back button. */
  shouldShowBack(): boolean {
    return this.returnUrl !== null;
  }

  /** Return to the recorded page, or the role dashboard as fallback. */
  goBack(): Promise<boolean> {
    const target = this.returnUrl;
    if (target) {
      return this.router.navigateByUrl(target);
    }
    return this.router.navigate([this.homeRoute()]);
  }

  private homeRoute(): string {
    const role = String(this.auth.getUserRole() || "")
      .trim()
      .toUpperCase();
    switch (role) {
      case "ADMIN":
      case "ADMINISTRATOR":
        return "/dashboard/admin";
      case "GOVERNMENT":
      case "GOVERNMENT_OFFICIAL":
      case "GOVERNMENT_OFFICER":
        return "/dashboard/government";
      case "RESEARCHER":
        return "/dashboard/researcher";
      case "ORGANIZATION":
      case "ORGANISATION":
        return "/dashboard/organization";
      case "GUEST":
        return "/dashboard/guest";
      case "CITIZEN":
      default:
        return "/dashboard/citizen";
    }
  }
}
