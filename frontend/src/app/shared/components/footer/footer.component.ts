import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
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

  private readonly authService = inject(Auth);
  private readonly loginPrompt = inject(LoginPromptService);
  private readonly router = inject(Router);

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
    if (r === 'government_official' || r === 'government') return '/dashboard/government/policies/search';
    if (r === 'researcher') return '/dashboard/researcher/policies/search';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/policies';
    if (r === 'citizen') return '/dashboard/citizen/policies/search';
    return '/policies/search';
  }

  getSchemesRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/schemes';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/schemes';
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

  /** Support desk per role (verified routes; admin manages tickets). */
  getSupportRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/support-requests';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/support';
    if (r === 'researcher') return '/dashboard/researcher/support';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/support';
    if (r === 'citizen') return '/dashboard/citizen/support';
    return '/dashboard/guest/support';
  }

  getCompareRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/compare';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/compare';
    if (r === 'researcher') return '/dashboard/researcher/compare';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/compare';
    if (r === 'citizen') return '/dashboard/citizen/compare';
    return '/compare';
  }

  /** Dashboard home for the current role (verified dashboard routes). */
  getDashboardRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin';
    if (r === 'government_official' || r === 'government') return '/dashboard/government';
    if (r === 'researcher') return '/dashboard/researcher';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization';
    if (r === 'citizen') return '/dashboard/citizen';
    return '/dashboard/guest';
  }

  /** Saved items (Citizen / Researcher / Organization dashboards only). */
  getSavedRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'researcher') return '/dashboard/researcher/saved';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/saved';
    return '/dashboard/citizen/saved';
  }

  /** Role analytics overview (verified per-role analytics routes). */
  getAnalyticsRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/analytics';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/analytics';
    if (r === 'researcher') return '/dashboard/researcher/analytics';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/analytics';
    return '/dashboard/citizen/analytics';
  }

  /** Reports (Government and Admin dashboards only). */
  getReportsRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/reports';
    return '/dashboard/government/reports';
  }

  getUsersRoute(): string {
    return '/dashboard/admin/users';
  }

  getManagePoliciesRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/policies/manage';
    return '/dashboard/government/policies/manage';
  }

  getManageSchemesRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/schemes/manage';
    return '/dashboard/government/schemes/manage';
  }

  getNotificationsRoute(): string {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') return '/dashboard/admin/notifications';
    if (r === 'government_official' || r === 'government') return '/dashboard/government/notifications';
    if (r === 'researcher') return '/dashboard/researcher/notifications';
    if (r === 'organization' || r === 'organisation') return '/dashboard/organization/notifications';
    return '/dashboard/citizen/notifications';
  }

  /**
   * Role-specific "Portal Services" column. Every route below was verified
   * against the dashboard route definitions; roles only see options their
   * dashboards actually serve.
   */
  getServiceLinks(): FooterLink[] {
    const r = this.userRole().toLowerCase();
    if (r === 'admin' || r === 'administrator') {
      return [
        { label: 'Admin Dashboard', icon: 'dashboard', route: this.getDashboardRoute(), sections: [] },
        { label: 'User Management', icon: 'group', route: this.getUsersRoute(), sections: ['users'] },
        { label: 'Manage Policies', icon: 'description', route: this.getManagePoliciesRoute(), sections: ['policies'] },
        { label: 'Manage Schemes', icon: 'account_balance', route: this.getManageSchemesRoute(), sections: ['schemes'] },
        { label: 'Analytics', icon: 'analytics', route: this.getAnalyticsRoute(), sections: ['analytics'] },
        { label: 'Reports', icon: 'assessment', route: this.getReportsRoute(), sections: ['reports'] },
      ];
    }
    if (r === 'government_official' || r === 'government' || r === 'govt') {
      return [
        { label: 'Government Dashboard', icon: 'account_balance', route: this.getDashboardRoute(), sections: [] },
        { label: 'Manage Policies', icon: 'description', route: this.getManagePoliciesRoute(), sections: ['policies'] },
        { label: 'Manage Schemes', icon: 'account_balance', route: this.getManageSchemesRoute(), sections: ['schemes'] },
        { label: 'Analytics', icon: 'analytics', route: this.getAnalyticsRoute(), sections: ['analytics'] },
        { label: 'Reports', icon: 'assessment', route: this.getReportsRoute(), sections: ['reports'] },
      ];
    }
    if (r === 'researcher') {
      return [
        { label: 'Search Policies', icon: 'chevron_right', route: this.getPoliciesRoute(), sections: ['policies'] },
        { label: 'Search Public Schemes', icon: 'chevron_right', route: this.getSchemesRoute(), sections: ['schemes'] },
        { label: 'Research Analytics', icon: 'analytics', route: this.getAnalyticsRoute(), sections: ['analytics'] },
        { label: 'Compare Policies & Schemes', icon: 'chevron_right', route: this.getCompareRoute(), sections: ['compare'] },
        { label: 'Saved Items', icon: 'chevron_right', route: this.getSavedRoute(), sections: ['saved'] },
      ];
    }
    if (r === 'organization' || r === 'organisation') {
      return [
        { label: 'Search Policies', icon: 'chevron_right', route: this.getPoliciesRoute(), sections: ['policies'] },
        { label: 'Search Public Schemes', icon: 'chevron_right', route: this.getSchemesRoute(), sections: ['schemes'] },
        { label: 'Analytics', icon: 'analytics', route: this.getAnalyticsRoute(), sections: ['analytics'] },
        { label: 'Compare Policies & Schemes', icon: 'chevron_right', route: this.getCompareRoute(), sections: ['compare'] },
        { label: 'Saved Items', icon: 'chevron_right', route: this.getSavedRoute(), sections: ['saved'] },
      ];
    }
    return [
      { label: 'Search Policies', icon: 'chevron_right', route: this.getPoliciesRoute(), sections: ['policies'] },
      { label: 'Search Public Schemes', icon: 'chevron_right', route: this.getSchemesRoute(), sections: ['schemes'] },
      { label: 'Eligibility Checker', icon: 'chevron_right', route: this.getEligibilityRoute(), sections: ['eligibility'] },
      { label: 'Compare Policies & Schemes', icon: 'chevron_right', route: this.getCompareRoute(), sections: ['compare'] },
      { label: 'Saved Items', icon: 'chevron_right', route: this.getSavedRoute(), sections: ['saved'] },
    ];
  }

  /** Role-specific "Help & Grievances" column (verified routes only). */
  getHelpLinks(): FooterLink[] {
    const r = this.userRole().toLowerCase();
    const isAdmin = r === 'admin' || r === 'administrator';
    const supportLabel = isAdmin ? 'Support Requests' : 'Citizen Support Desk';
    return [
      { label: 'Notifications', icon: 'notifications_none', route: this.getNotificationsRoute(), sections: ['notifications'] },
      { label: 'Feedback & Grievances', icon: 'rate_review', route: this.getFeedbackRoute(), sections: ['feedback'] },
      { label: 'Frequently Asked Questions', icon: 'help_outline', route: this.getFaqRoute(), sections: ['faqs'] },
      { label: supportLabel, icon: 'support_agent', route: this.getSupportRoute(), sections: ['support'] },
    ];
  }
}

/** Single footer navigation entry rendered in a link column. */
export interface FooterLink {
  label: string;
  icon: string;
  route: string;
  sections: string[];
}
