import { Component, ElementRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { filter, of, Subject } from 'rxjs';
import { TopbarComponent } from './topbar.component';
import { Auth } from '../../../core/services/auth';
import { AvatarService } from '../../../core/services/avatar.service';

@Component({ selector: 'app-blank', standalone: true, template: '' })
class BlankComponent {}

describe('TopbarComponent (shared global topbar)', () => {
  let authStub: Record<string, unknown>;
  let role = 'ADMINISTRATOR';

  function setup(inputs: { guest?: boolean } = {}): {
    fixture: ComponentFixture<TopbarComponent>;
    router: Router;
  } {
    authStub = {
      currentUser$: of(null),
      getStoredUser: () => null,
      getToken: () => 'token',
      getUserRole: () => role,
      getCurrentUserSnapshot: () => null,
      getCurrentUser: () => of(null),
      logout: vi.fn(),
      isLoggedIn: () => true,
      isGuest: () => role === 'GUEST',
      onLoggedOut: () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        provideRouter([{ path: '**', component: BlankComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: authStub },
        { provide: AvatarService, useValue: { photoSrcFor: () => of(null) } },
        {
          provide: ElementRef,
          useValue: new ElementRef(document.createElement('div')),
        },
      ],
    });
    const fixture = TestBed.createComponent(TopbarComponent);
    const component = fixture.componentInstance;
    component.guest = inputs.guest ?? false;
    fixture.detectChanges();
    return { fixture, router: TestBed.inject(Router) };
  }

  beforeEach(() => {
    role = 'ADMINISTRATOR';
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('creates with three regions (left, center, right)', () => {
    const { fixture } = setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.topbar__left')).toBeTruthy();
    expect(el.querySelector('.topbar__center')).toBeTruthy();
    expect(el.querySelector('.topbar__right')).toBeTruthy();
    expect(el.querySelector('.topbar-search input')).toBeTruthy();
  });

  it('shows single-line tagline for all roles', () => {
    const { fixture } = setup();
    const tagline = fixture.nativeElement.querySelector('.topbar__tagline');
    expect(tagline?.textContent?.trim()).toBe('Government Information Simplified.');
  });

  it('shows bell + profile for authenticated users', () => {
    const { fixture } = setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-notification-bell')).toBeTruthy();
    expect(el.querySelector('.topbar__profile')).toBeTruthy();
  });

  it('guest mode hides the topbar search bar (body search is separate)', () => {
    const { fixture } = setup({ guest: true });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.topbar__guest-actions')).toBeTruthy();
    expect(el.querySelector('app-notification-bell')).toBeNull();
    expect(el.querySelector('.topbar__profile')).toBeNull();
    expect(el.querySelector('.topbar__guest-nav')).toBeTruthy();
    // No search icon, input, clear button, or suggestions in guest topbar.
    expect(el.querySelector('.topbar__center')).toBeTruthy();
    expect(el.querySelector('.topbar-search')).toBeNull();
    expect(el.querySelector('.topbar__bar--no-search')).toBeNull();
    expect(el.querySelector('.topbar--guest')).toBeNull();
    // Single-row guest header: nav lives inline in the center column.
    const links = el.querySelectorAll('.topbar__center .topbar__guest-nav .topbar__nav-link');
    expect(links.length).toBe(6);
  });

  it('authenticated roles keep the topbar search bar', () => {
    const { fixture } = setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.topbar__center')).toBeTruthy();
    expect(el.querySelector('.topbar-search input')).toBeTruthy();
    expect(el.querySelector('.topbar__bar--no-search')).toBeNull();
    expect(el.querySelector('.topbar__guest-nav')).toBeNull();
  });

  it('makes the whole brand area (logo, name, tagline) one link', () => {
    const { fixture } = setup();
    const link = fixture.nativeElement.querySelector('.topbar__logo-link');
    expect(link?.getAttribute('aria-label')).toBe('PolicyGPT home');
    expect(link?.querySelector('.topbar__logo')).toBeTruthy();
    expect(link?.querySelector('.topbar__title')?.textContent).toContain('Policy');
    expect(link?.querySelector('.topbar__tagline')?.textContent?.trim()).toBe(
      'Government Information Simplified.',
    );
  });

  it('resolves the dashboard home per role', () => {
    const admin = setup();
    expect(admin.fixture.componentInstance.homeRoute).toEqual(['/dashboard', 'admin']);
    TestBed.resetTestingModule();
    role = 'GOVERNMENT_OFFICIAL';
    const govt = setup();
    expect(govt.fixture.componentInstance.homeRoute).toEqual(['/dashboard', 'government']);
    TestBed.resetTestingModule();
    role = 'GUEST';
    const guest = setup({ guest: true });
    expect(guest.fixture.componentInstance.homeRoute).toEqual(['/dashboard', 'guest']);
  });

  it('emits menuToggle and logoClick outputs', () => {
    const { fixture } = setup();
    const component = fixture.componentInstance;
    const menuSpy = vi.fn();
    const logoSpy = vi.fn();
    component.menuToggle.subscribe(menuSpy);
    component.logoClick.subscribe(logoSpy);
    (fixture.debugElement.query(By.css('.topbar__toggle'))?.nativeElement as HTMLButtonElement)?.click();
    (fixture.debugElement.query(By.css('.topbar__logo-link'))?.nativeElement as HTMLAnchorElement)?.click();
    expect(menuSpy).toHaveBeenCalledOnce();
    expect(logoSpy).toHaveBeenCalledOnce();
  });

  it('viewAll navigates inside the role layout with ?q=', async () => {
    const { fixture, router } = setup();
    const component = fixture.componentInstance;
    expect(component.rolePrefix).toBe('admin');
    const navSpy = vi.spyOn(router, 'navigate');
    component.searchText = 'water';
    component.viewAllGlobalPolicies();
    expect(navSpy).toHaveBeenCalledWith(
      ['/dashboard', 'admin', 'policies/search'],
      { queryParams: { q: 'water' } },
    );
    component.viewAllGlobalSchemes();
    expect(navSpy).toHaveBeenCalledWith(['/dashboard', 'admin', 'schemes'], {
      queryParams: { q: 'water' },
    });
  });

  it('selecting a result navigates to the role detail route', () => {
    const { fixture, router } = setup();
    const component = fixture.componentInstance;
    const navSpy = vi.spyOn(router, 'navigate');
    component.selectGlobalPolicy({ policy_id: 7 } as never);
    expect(navSpy).toHaveBeenCalledWith(['/dashboard', 'admin', 'policies', 7]);
    component.selectGlobalScheme({ scheme_id: 9 } as never);
    expect(navSpy).toHaveBeenCalledWith(['/dashboard', 'admin', 'schemes', 9]);
  });

  it('guest search targets guest routes', () => {
    const { fixture, router } = setup({ guest: true });
    const component = fixture.componentInstance;
    expect(component.rolePrefix).toBe('guest');
    const navSpy = vi.spyOn(router, 'navigate');
    component.searchText = 'health';
    component.viewAllGlobalSchemes();
    expect(navSpy).toHaveBeenCalledWith(['/dashboard', 'guest', 'schemes'], {
      queryParams: { q: 'health' },
    });
  });

  it('closes the dropdown after navigation', async () => {
    const { fixture, router } = setup();
    const component = fixture.componentInstance;
    component.showGlobalDropdown = true;
    await router.navigateByUrl('/dashboard/admin');
    expect(component.showGlobalDropdown).toBe(false);
  });

  it('guest drawer opens the login modal for restricted links', () => {
    const { fixture } = setup({ guest: true });
    const component = fixture.componentInstance;
    component.requireLogin('Compare');
    expect(component.showLoginMessage).toBe(true);
    expect(component.loginMessage).toContain('Compare');
  });

  it('shows loading (not empty state) immediately on input, before debounce', () => {
    const { fixture } = setup();
    const component = fixture.componentInstance;
    component.searchText = 'p';
    component.onGlobalSearchInput();
    expect(component.showGlobalDropdown).toBe(true);
    expect(component.globalLoading).toBe(true);
    expect(component.globalError).toBeNull();
  });

  it('clears and closes the dropdown when input is emptied', () => {
    const { fixture } = setup();
    const component = fixture.componentInstance;
    component.searchText = 'p';
    component.onGlobalSearchInput();
    component.searchText = '';
    component.clearGlobalSearch();
    expect(component.searchText).toBe('');
    expect(component.showGlobalDropdown).toBe(false);
  });
});
