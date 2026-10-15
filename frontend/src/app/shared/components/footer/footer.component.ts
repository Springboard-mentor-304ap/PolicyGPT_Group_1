import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { Auth } from '../../../core/services/auth';
import { LoginPromptService } from '../../../core/services/login-prompt.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent implements OnInit, OnDestroy {
  currentYear = new Date().getFullYear();
  userRole = signal<string>('GUEST');

  /**
   * Reactive snapshot of the current URL path (query params and fragments
   * stripped, lowercased). Updated on init (covers direct URL entry and
   * page refresh) and on every completed NavigationEnd (covers footer /
   * header links, programmatic navigation, and browser Back/Forward).
   * Template active-state bindings read this signal so the yellow
   * highlight moves immediately without a reload.
   */
  readonly currentPath = signal<string>('');
  private routerEventsSub?: Subscription;

  constructor(
    private readonly authService: Auth,
    private readonly loginPrompt: LoginPromptService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const role = this.authService.getUserRole();
    if (role) {
      this.userRole.set(role.toUpperCase().trim());
    }
    this.updateCurrentPath(this.router.url);
    this.routerEventsSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateCurrentPath(event.urlAfterRedirects || event.url);
      });
  }

  ngOnDestroy(): void {
    this.routerEventsSub?.unsubscribe();
  }

  private updateCurrentPath(url: string): void {
    this.currentPath.set(
      (url || '').split('?')[0].split('#')[0].toLowerCase(),
    );
  }

  /**
   * Primary section of the current route, e.g. `policies` for both
   * `/dashboard/guest/policies/search` and `/dashboard/guest/policies/42`,
   * or `compare` for `/compare/results`. For `/dashboard/:role/...` URLs
   * the section is the segment after the role; for top-level URLs it is
   * the first segment. This keeps nested routes on their section link
   * while unrelated routes (e.g. analytics) highlight nothing.
   */
  private primarySection(): string {
    const segments = this.currentPath().split('/').filter(Boolean);
    if (segments.length === 0) {
      return '';
    }
    if (segments[0] === 'dashboard') {
      return segments[2] ?? '';
    }
    return segments[0] ?? '';
  }

  /**
   * Route-driven active state for footer links, read from the reactive
   * `currentPath` snapshot so it stays correct on initial load, refresh,
   * and every NavigationEnd. Exact section matching prevents similar or
   * overlapping paths from highlighting multiple links.
   */
  isFooterSectionActive(...sections: string[]): boolean {
    const active = this.primarySection();
    if (!active) {
      return false;
    }
    return sections.some((section) => section.toLowerCase() === active);
  }

  /** Logged-out visitors and GUEST-role users share the guest footer. */
  isGuestUser(): boolean {
    return !this.authService.isLoggedIn() || this.authService.isGuest();
  }

  /**
   * Opens the existing guest topbar login/signup modal (same instance
   * Compare Schemes uses) without navigating away.
   */
  promptLogin(feature: string): void {
    this.loginPrompt.requestLogin(feature);
  }

  getFeedbackRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/feedback';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/feedback';
    if (r === 'researcher') return '/dashboard/researcher/feedback';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/feedback';
    if (r === 'citizen') return '/dashboard/citizen/feedback';
    return '/feedback';
  }

  getFaqRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/faqs';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/faqs';
    if (r === 'researcher') return '/dashboard/researcher/faqs';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/faqs';
    if (r === 'citizen') return '/dashboard/citizen/faqs';
    return '/faqs';
  }

  getPoliciesRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/policies';
    if (r === 'government_official' || r === 'government') return '/government/policies';
    if (r === 'researcher') return '/dashboard/researcher/policies/search';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/policies';
    if (r === 'citizen') return '/dashboard/citizen/policies/search';
    return '/policies/search';
  }

  getSchemesRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/schemes';
    if (r === 'government_official' || r === 'government') return '/government/schemes';
    if (r === 'researcher') return '/dashboard/researcher/schemes';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/schemes';
    if (r === 'citizen') return '/dashboard/citizen/schemes';
    return '/schemes/search';
  }

  getEligibilityRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'citizen') return '/dashboard/citizen/eligibility';
    return '/eligibility';
  }

  getCompareRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/compare';
    if (r === 'researcher') return '/dashboard/researcher/compare';
    if (r === 'citizen') return '/dashboard/citizen/compare';
    return '/compare';
  }
}
