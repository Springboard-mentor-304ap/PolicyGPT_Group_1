import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { Component } from "@angular/core";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { of } from "rxjs";
import { PublicHomeComponent } from "./public-home.component";
import { Auth } from "../../../core/services/auth";
import { AvatarService } from "../../../core/services/avatar.service";
import { NotificationService } from "../../../core/services/notification.service";
import { PolicyService } from "../../../core/services/policy.service";
import { SchemeService } from "../../../core/services/scheme.service";
import { ChatbotOpenService } from "../../../core/services/chatbot-open.service";

@Component({ selector: "app-blank", standalone: true, template: "" })
class BlankComponent {}

function makeAuthStub() {
  return {
    login: vi.fn(() =>
      of({ access_token: "token", user: { role: "CITIZEN" } }),
    ),
    register: vi.fn(() =>
      of({ access_token: "token", user: { role: "CITIZEN" } }),
    ),
    requestPasswordReset: vi.fn(() => of({ message: "Code sent." })),
    verifyOtp: vi.fn(() =>
      of({ message: "OK", verified: true, reset_token: "rt" }),
    ),
    resetPassword: vi.fn(() => of({ message: "Done." })),
  };
}

const policyStub = {
  getPolicies: () =>
    of({
      policies: [
        {
          policy_id: 1,
          title: "Test Policy",
          description: "A test policy",
          category: "Health",
          status: "APPROVED",
        },
      ],
      total: 1,
      page: 1,
      pages: 1,
      limit: 6,
    }),
};

const schemeStub = {
  getSchemes: () =>
    of({
      schemes: [
        {
          scheme_id: 2,
          name: "Test Scheme",
          title: "Test Scheme",
          description: "A test scheme",
          category: "Education",
          status: "APPROVED",
        },
      ],
      total: 1,
      page: 1,
      pages: 1,
      limit: 6,
    }),
};

describe("PublicHomeComponent popups", () => {
  let fixture: ComponentFixture<PublicHomeComponent>;
  let component: PublicHomeComponent;
  let router: Router;
  let authStub: ReturnType<typeof makeAuthStub>;

  beforeEach(async () => {
    localStorage.clear();
    authStub = makeAuthStub();
    await TestBed.configureTestingModule({
      imports: [PublicHomeComponent],
      providers: [
        provideRouter([{ path: "**", component: BlankComponent }]),
        { provide: Auth, useValue: authStub },
        { provide: AvatarService, useValue: { prefetchForUser: () => {} } },
        {
          provide: NotificationService,
          useValue: { ensureInitialized: () => {} },
        },
        { provide: PolicyService, useValue: policyStub },
        { provide: SchemeService, useValue: schemeStub },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PublicHomeComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it("renders hero, search, highlights, beneficiaries, features and footer", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector(".landing-hero__title")?.textContent).toContain(
      "Government Policies",
    );
    expect(el.querySelector(".landing-search input")).toBeTruthy();
    expect(el.querySelectorAll(".landing-highlight").length).toBe(4);
    expect(el.querySelectorAll(".landing-beneficiary").length).toBe(5);
    expect(el.querySelectorAll(".landing-keyfeature").length).toBe(4);
    expect(el.querySelector(".landing-header__actions")).toBeTruthy();
    expect(el.querySelector(".landing-footer")).toBeTruthy();
  });

  it("navigates to the Login page from the topbar", () => {
    const navSpy = vi.spyOn(router, "navigate");
    const btn = fixture.nativeElement.querySelector(
      ".landing-header__actions .landing-btn--login",
    ) as HTMLElement;
    btn.click();
    fixture.detectChanges();
    expect(navSpy).toHaveBeenCalledWith(["/auth/login"]);
    expect(component.activeModal).toBeNull();
    expect(
      fixture.nativeElement.querySelector(".landing-modal-backdrop"),
    ).toBeNull();
  });

  it("navigates to the Register page from the hero", () => {
    const navSpy = vi.spyOn(router, "navigate");
    const btn = fixture.nativeElement.querySelector(
      ".landing-hero__actions .landing-hero__btn--secondary",
    ) as HTMLElement;
    btn.click();
    fixture.detectChanges();
    expect(navSpy).toHaveBeenCalledWith(["/auth/register"]);
    expect(component.activeModal).toBeNull();
    expect(
      fixture.nativeElement.querySelector(".landing-modal-backdrop"),
    ).toBeNull();
  });

  it("opens no popup when the inline input is focused", () => {
    const navSpy = vi.spyOn(router, "navigate");
    const input = fixture.nativeElement.querySelector(
      ".landing-search-panel .landing-search input",
    ) as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new Event("focus", { bubbles: true }));
    fixture.detectChanges();
    expect(component.activeModal).toBeNull();
    expect(
      fixture.nativeElement.querySelector(".landing-modal-backdrop"),
    ).toBeNull();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it("opens the access popup on Enter with a keyword", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.searchQuery = "health";
    component.onInlineSearch("health");
    fixture.detectChanges();
    expect(component.activeModal).toBe("choice");
    expect(component.choiceQuery).toBe("health");
    expect(component.searchQuery).toBe("health");
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector(".landing-modal__title")?.textContent).toContain(
      "Continue to Search",
    );
    expect(el.querySelector(".landing-modal__query")?.textContent).toContain(
      "health",
    );
    expect(
      el.querySelectorAll(".landing-modal__actions .landing-modal__btn").length,
    ).toBe(3);
    expect(navSpy).not.toHaveBeenCalled();
  });

  it("opens the same popup when the Search button is clicked", () => {
    const navSpy = vi.spyOn(router, "navigate");
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      ".landing-search-panel .landing-search input",
    ) as HTMLInputElement;
    input.value = "scholarship";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector(
      ".landing-search-panel .landing-search",
    ) as HTMLFormElement;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(component.activeModal).toBe("choice");
    expect(component.choiceQuery).toBe("scholarship");
    expect(navSpy).not.toHaveBeenCalled();
  });

  it("opens the same popup from the Search feature card", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.openFeature("search");
    fixture.detectChanges();
    expect(component.activeModal).toBe("panel");
    expect(component.panel.title).toBe("Search Policies & Schemes");
    expect(component.panel.intro).toBe(
      "Search government policies, schemes, benefits and programmes in one place.",
    );
    expect(component.panel.actions.map((a) => a.label)).toEqual([
      "Continue as Guest",
      "Login",
      "Sign Up",
    ]);
    expect(navSpy).not.toHaveBeenCalled();
  });

  it("opens the access popup for an empty search without navigating", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.onInlineSearch("   ");
    fixture.detectChanges();
    expect(component.activeModal).toBe("choice");
    expect(navSpy).not.toHaveBeenCalled();
  });

  it("continues as guest from the search popup with the keyword preserved", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.onInlineSearch("health");
    fixture.detectChanges();
    expect(component.activeModal).toBe("choice");
    component.continueAsGuest();
    expect(navSpy).toHaveBeenCalledWith(["/dashboard/guest"], {
      queryParams: { q: "health" },
    });
    expect(component.searchQuery).toBe("health");
  });

  it("navigates to the Login page from the search popup", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.onInlineSearch("health");
    component.goToLoginFromChoice();
    expect(navSpy).toHaveBeenCalledWith(["/auth/login"]);
  });

  it("navigates to the Register page from the search popup", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.onInlineSearch("health");
    component.goToSignupFromChoice();
    expect(navSpy).toHaveBeenCalledWith(["/auth/register"]);
  });

  it("closing the search popup does not navigate and keeps the keyword", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.onInlineSearch("health");
    fixture.detectChanges();
    expect(component.activeModal).toBe("choice");
    component.closeModal();
    expect(component.activeModal).toBeNull();
    expect(component.searchQuery).toBe("health");
    expect(navSpy).not.toHaveBeenCalled();
  });

  it("opens info content from a footer link and closes on Escape", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.openInfo("about");
    fixture.detectChanges();
    expect(component.activeModal).toBe("panel");
    expect(navSpy).not.toHaveBeenCalled();
    component.onEscape();
    expect(component.activeModal).toBeNull();
  });

  it("navigates to the Login page via openLogin", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.openLogin();
    expect(navSpy).toHaveBeenCalledWith(["/auth/login"]);
    expect(component.activeModal).toBeNull();
  });

  it("navigates to the Register page via openSignup", () => {
    const navSpy = vi.spyOn(router, "navigate");
    component.openSignup();
    expect(navSpy).toHaveBeenCalledWith(["/auth/register"]);
    expect(component.activeModal).toBeNull();
  });

  it("completes the forgot-password flow and returns to login", () => {
    component.openForgot();
    component.fpIdentifier = "user@example.com";
    component.submitForgotIdentifier();
    expect(component.fpStep).toBe(2);
    component.fpOtp = "123456";
    component.submitForgotOtp();
    expect(component.fpStep).toBe(3);
    component.fpNewPassword = "NewSecret123!";
    component.fpConfirmPassword = "NewSecret123!";
    component.submitForgotPassword();
    expect(component.fpStep).toBe(4);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(".landing-modal__title")?.textContent,
    ).toContain("Forgot Password");
  });

  it("opens the chatbot through the assistant action", () => {
    const opener = TestBed.inject(ChatbotOpenService);
    const spy = vi.spyOn(opener, "requestOpen");
    component.openFeature("insights");
    component.runPanelAction({
      label: "Open AI Assistant",
      icon: "smart_toy",
      kind: "assistant",
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(component.activeModal).toBeNull();
  });
});
