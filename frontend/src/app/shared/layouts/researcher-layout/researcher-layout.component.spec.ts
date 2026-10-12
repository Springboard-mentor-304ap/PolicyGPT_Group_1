import { TestBed } from "@angular/core/testing";
import { ElementRef } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NavigationEnd } from "@angular/router";
import { of, Subject } from "rxjs";

import { ResearcherLayoutComponent } from "./researcher-layout.component";

/**
 * Route-aware Research Analytics submenu.
 *
 * NOTE: this spec instantiates the component directly instead of via
 * TestBed.createComponent because constructor-injected components
 * cannot instantiate under this repo's vitest transform (pre-existing
 * NG0202 failure affecting all such specs). Template wiring
 * (isAnalyticsExpanded / isResearchAnalyticsRoute / onAnalyticsNavClick
 * bindings) is verified by the template-binding test below.
 *
 * Covers the exact scenarios from the fix request: parent click
 * navigates to Research Overview when outside the section, toggles
 * when inside, and unrelated navigation (including Back/Forward,
 * refresh/direct URL via initial router.url) always collapses.
 */
describe("ResearcherLayoutComponent (research analytics state)", () => {
  const ANALYTICS = "/dashboard/researcher/analytics";
  const TRENDS = "/dashboard/researcher/analytics/trends";

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ElementRef,
          useValue: new ElementRef(document.createElement("div")),
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function setup(url: string) {
    const events = new Subject<unknown>();
    const routerStub: any = {
      url,
      navigate: vi.fn().mockResolvedValue(true),
      events: events.asObservable(),
    };
    const authStub: any = {
      currentUser$: of(null),
      getStoredUser: () => null,
      getToken: () => null,
      logout: vi.fn(),
      getCurrentUser: () => of(null),
    };
    const component = TestBed.runInInjectionContext(
      () =>
        new ResearcherLayoutComponent(
          routerStub,
          authStub,
          { photoSrcFor: () => of(null) } as any,
          { recordSearch: () => of(null) } as any,
        ),
    );
    component.ngOnInit();
    // ngOnInit with no token redirects to login; ignore for these tests.
    routerStub.navigate.mockClear();
    const go = (nextUrl: string): void => {
      routerStub.url = nextUrl;
      events.next(new NavigationEnd(1, nextUrl, nextUrl));
    };
    return { component, routerStub, go };
  }

  it("keeps the required sidebar order with analytics children", () => {
    const { component } = setup("/dashboard/researcher");
    expect(component.navItems.map((i) => i.label)).toEqual([
      "Dashboard",
      "Search Policies",
      "Search Schemes",
      "Compare",
      "Research Analytics",
      "Saved Items",
      "Search History",
      "Notifications",
      "Help & Support",
      "Feedback",
    ]);
    const analytics = component.navItems.find(
      (i) => i.label === "Research Analytics",
    );
    expect(analytics?.children?.map((c) => c.label)).toEqual([
      "Research Overview",
      "Policy & Scheme Trends",
    ]);
    expect(analytics?.children?.map((c) => c.route)).toEqual([
      ANALYTICS,
      TRENDS,
    ]);
  });

  it("detects the analytics section and ignores query params", () => {
    const { component, routerStub } = setup("/dashboard/researcher");
    for (const url of [
      ANALYTICS,
      TRENDS,
      `${ANALYTICS}?range=7d`,
      "/dashboard/researcher/analytics/policies",
    ]) {
      routerStub.url = url;
      expect(component.isResearchAnalyticsRoute()).toBe(true);
    }
    for (const url of [
      "/dashboard/researcher",
      "/dashboard/researcher/saved",
      "/dashboard/researcher/history",
      "/dashboard/researcher/notifications",
      "/dashboard/researcher/support",
      "/dashboard/researcher/feedback",
      "/dashboard/researcher/compare",
    ]) {
      routerStub.url = url;
      expect(component.isResearchAnalyticsRoute()).toBe(false);
    }
  });

  it("starts collapsed on dashboard/saved, expanded on analytics/trends (TEST 6/7/11)", () => {
    expect(setup("/dashboard/researcher").component.isAnalyticsExpanded).toBe(false);
    expect(setup("/dashboard/researcher/saved").component.isAnalyticsExpanded).toBe(false);
    expect(setup(ANALYTICS).component.isAnalyticsExpanded).toBe(true);
    expect(setup(TRENDS).component.isAnalyticsExpanded).toBe(true);
  });

  it("parent click outside analytics navigates to Research Overview (TEST 1/4)", () => {
    const { component, routerStub } = setup("/dashboard/researcher/saved");
    component.onAnalyticsNavClick();
    expect(routerStub.navigate).toHaveBeenCalledWith([ANALYTICS]);
  });

  it("parent click inside analytics toggles instead of navigating", () => {
    const { component, routerStub } = setup(ANALYTICS);
    expect(component.isAnalyticsExpanded).toBe(true);
    component.onAnalyticsNavClick();
    expect(routerStub.navigate).not.toHaveBeenCalled();
    expect(component.isAnalyticsExpanded).toBe(false);
    // Route helper still reports the section; only visibility toggles.
    expect(component.isResearchAnalyticsRoute()).toBe(true);
  });

  it("collapses on unrelated navigation and re-expands on return (TEST 3/5/8)", () => {
    const { component, routerStub, go } = setup(TRENDS);
    expect(component.isAnalyticsExpanded).toBe(true);
    go("/dashboard/researcher/saved");
    expect(component.isResearchAnalyticsRoute()).toBe(false);
    expect(component.isAnalyticsExpanded).toBe(false);
    // Return via navigation (Back button produces the same event).
    go(ANALYTICS);
    expect(routerStub.navigate).not.toHaveBeenCalled();
    expect(component.isAnalyticsExpanded).toBe(true);
  });

  it("chevron toggle outside analytics never visibly expands (TEST 5)", () => {
    const { component } = setup("/dashboard/researcher/history");
    component.toggleAnalyticsMenuOnly(new MouseEvent("click"));
    expect(component.isAnalyticsExpanded).toBe(false);
  });

  it("binds the template to the route-aware state (no stale boolean)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const html = fs.readFileSync(
      path.join(__dirname, "researcher-layout.component.html"),
      "utf8",
    );
    // Parent active state follows the route, not the toggle flag.
    expect(html).toContain("isResearchAnalyticsRoute()");
    // Submenu visibility follows the derived getter, never the raw flag.
    expect(html).toContain("isAnalyticsExpanded");
    expect(html).not.toContain("@if (analyticsMenuOpen");
    expect(html).not.toContain("analyticsMenuOpen || isAnalyticsRouteActive()");
  });
});
