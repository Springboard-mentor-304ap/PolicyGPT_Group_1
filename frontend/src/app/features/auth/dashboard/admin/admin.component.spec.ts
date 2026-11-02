import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { By } from "@angular/platform-browser";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { AdminComponent } from "./admin.component";
import { Auth } from "../../../../core/services/auth";
import { AnalyticsService } from "../../../../core/services/analytics.service";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";

describe("AdminComponent", () => {
  let component: AdminComponent;
  let fixture: ComponentFixture<AdminComponent>;
  let mockAuth: any;
  let mockAnalyticsService: any;
  let mockPolicyService: any;
  let mockSchemeService: any;

  const mockDashboardAnalytics = {
    total_policies: 120,
    total_schemes: 45,
    approved_policies: 95,
    pending_policies: 15,
    rejected_policies: 5,
    archived_policies: 5,
    active_schemes: 40,
    total_users: 250,
    total_notifications: 10,
    total_feedback: 30,
  };

  const mockSchemesResponse = {
    schemes: [
      {
        scheme_id: 1,
        name: "Ayushman Bharat",
        category: "Healthcare",
        ministry: "Ministry of Health",
      },
      {
        scheme_id: 2,
        name: "PM Surya Ghar",
        category: "Energy",
        ministry: "Ministry of New & Renewable Energy",
      },
    ],
    total: 2,
    page: 1,
    pages: 1,
    limit: 4,
  };

  const mockPoliciesResponse = {
    policies: [
      {
        policy_id: 101,
        title: "National Digital Health Mission",
        category: "Healthcare",
        ministry: "Ministry of Health",
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
    limit: 4,
  };

  beforeEach(async () => {
    mockAuth = {
      getStoredUser: vi.fn().mockReturnValue({ full_name: "Super Admin", role: "ADMIN" }),
      getCurrentUser: vi.fn().mockReturnValue(of({ full_name: "Super Admin", role: "ADMIN" })),
    };

    mockAnalyticsService = {
      getDashboardAnalytics: vi.fn().mockReturnValue(of(mockDashboardAnalytics)),
    };

    mockPolicyService = {
      getPolicies: vi.fn().mockReturnValue(of(mockPoliciesResponse)),
    };

    mockSchemeService = {
      getSchemes: vi.fn().mockReturnValue(of(mockSchemesResponse)),
    };

    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: mockAuth },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
  });

  it("should create the AdminComponent and initialize user name", () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(component.userName).toBe("Super Admin");
  });

  it("should fetch dashboard analytics and populate statCards correctly", () => {
    fixture.detectChanges();
    expect(mockAnalyticsService.getDashboardAnalytics).toHaveBeenCalled();
    expect(component.loadingStats).toBe(false);
    expect(component.statCards[0].value).toBe(120);
    expect(component.statCards[1].value).toBe(45);
    expect(component.statCards[2].value).toBe(250);
    expect(component.statCards[3].value).toBe(15);
  });

  it("should fetch recent schemes and policies with manage: true", () => {
    fixture.detectChanges();
    expect(mockSchemeService.getSchemes).toHaveBeenCalledWith({ limit: 4, manage: true });
    expect(mockPolicyService.getPolicies).toHaveBeenCalledWith({ limit: 4, manage: true });
    expect(component.schemes.length).toBe(2);
    expect(component.policies.length).toBe(1);
    expect(component.schemes[0].title).toBe("Ayushman Bharat");
    expect(component.policies[0].title).toBe("National Digital Health Mission");
  });

  it("should handle error gracefully when dashboard analytics fails", () => {
    mockAnalyticsService.getDashboardAnalytics.mockReturnValue(
      throwError(() => new Error("Analytics error"))
    );
    fixture.detectChanges();
    expect(component.loadingStats).toBe(false);
    expect(component.statsError).toBe("Unable to load dashboard statistics");
  });

  it("should handle error gracefully when recent schemes or policies fail", () => {
    mockSchemeService.getSchemes.mockReturnValue(throwError(() => new Error("Schemes error")));
    mockPolicyService.getPolicies.mockReturnValue(throwError(() => new Error("Policies error")));
    fixture.detectChanges();
    expect(component.loadingSchemes).toBe(false);
    expect(component.schemesError).toBe("Unable to load schemes");
    expect(component.loadingPolicies).toBe(false);
    expect(component.policiesError).toBe("Unable to load policies");
  });
});
