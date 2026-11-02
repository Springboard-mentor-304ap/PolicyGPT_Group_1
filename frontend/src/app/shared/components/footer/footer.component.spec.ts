import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FooterComponent } from './footer.component';
import { Auth } from '../../../core/services/auth';
import { LoginPromptService } from '../../../core/services/login-prompt.service';

function setup(role: string | null, loggedIn: boolean) {
  TestBed.resetTestingModule();
  const authStub = {
    getUserRole: () => role ?? 'GUEST',
    isLoggedIn: () => loggedIn,
    isGuest: () => !loggedIn || (role ?? 'GUEST').toUpperCase() === 'GUEST',
  };
  TestBed.configureTestingModule({
    imports: [FooterComponent],
    providers: [
      provideRouter([]),
      { provide: Auth, useValue: authStub },
      { provide: LoginPromptService, useValue: { requestLogin: vi.fn() } },
    ],
  });
  const fixture: ComponentFixture<FooterComponent> =
    TestBed.createComponent(FooterComponent);
  fixture.detectChanges();
  return fixture;
}

describe('FooterComponent role links', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the guest public options unchanged for logged-out visitors', () => {
    const fixture = setup(null, false);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.footer-brand__logo')).toBeTruthy();
    expect(el.textContent).toContain('Search Policies');
    expect(el.textContent).toContain('Eligibility Checker');
  });

  it('uses the same brand block for authenticated roles', () => {
    const fixture = setup('CITIZEN', true);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.footer-brand__logo')).toBeTruthy();
    expect(el.querySelector('.footer-emblem-wrap')).toBeFalsy();
  });

  it('citizen sees citizen-permitted options with working routes', () => {
    const fixture = setup('CITIZEN', true);
    const c = fixture.componentInstance;
    const routes = c.getServiceLinks().map((l) => l.route);
    expect(routes).toEqual([
      '/dashboard/citizen/policies/search',
      '/dashboard/citizen/schemes',
      '/dashboard/citizen/eligibility',
      '/dashboard/citizen/compare',
      '/dashboard/citizen/saved',
    ]);
    expect(c.getHelpLinks().map((l) => l.route)).toEqual([
      '/dashboard/citizen/notifications',
      '/dashboard/citizen/feedback',
      '/dashboard/citizen/faqs',
      '/dashboard/citizen/support',
    ]);
  });

  it('researcher gets research analytics and organization gets analytics', () => {
    expect(setup('RESEARCHER', true).componentInstance.getServiceLinks()[2].route).toBe(
      '/dashboard/researcher/analytics',
    );
    const org = setup('ORGANIZATION', true).componentInstance;
    expect(org.getServiceLinks()[2].route).toBe('/dashboard/organization/analytics');
    expect(org.getServiceLinks().map((l) => l.route)).toContain(
      '/dashboard/organization/saved',
    );
  });

  it('government gets dashboard, manage, analytics and reports routes', () => {
    const c = setup('GOVERNMENT_OFFICIAL', true).componentInstance;
    expect(c.getServiceLinks().map((l) => l.route)).toEqual([
      '/dashboard/government',
      '/dashboard/government/policies/manage',
      '/dashboard/government/schemes/manage',
      '/dashboard/government/analytics',
      '/dashboard/government/reports',
    ]);
    // Fixed: previously missing the /dashboard prefix (fell through to login).
    expect(c.getPoliciesRoute()).toBe('/dashboard/government/policies/search');
    expect(c.getSchemesRoute()).toBe('/dashboard/government/schemes');
  });

  it('admin gets management, reports and ticket-queue support routes', () => {
    const c = setup('ADMINISTRATOR', true).componentInstance;
    expect(c.getServiceLinks().map((l) => l.route)).toEqual([
      '/dashboard/admin',
      '/dashboard/admin/users',
      '/dashboard/admin/policies/manage',
      '/dashboard/admin/schemes/manage',
      '/dashboard/admin/analytics',
      '/dashboard/admin/reports',
    ]);
    expect(c.getHelpLinks()[3].route).toBe('/dashboard/admin/support-requests');
  });

  it('renders every service link without dead hrefs', () => {
    for (const role of ['CITIZEN', 'RESEARCHER', 'ORGANIZATION', 'GOVERNMENT_OFFICIAL', 'ADMINISTRATOR']) {
      const fixture = setup(role, true);
      const anchors = Array.from(
        fixture.nativeElement.querySelectorAll('.col-links a'),
      ) as HTMLAnchorElement[];
      expect(anchors.length).toBeGreaterThan(0);
      for (const a of anchors) {
        const href = a.getAttribute('href');
        expect(href).toBeTruthy();
        expect(href).not.toBe('/government/policies');
        expect(href).not.toBe('/government/schemes');
        expect(href!.startsWith('/dashboard/')).toBe(true);
      }
    }
  });
});
