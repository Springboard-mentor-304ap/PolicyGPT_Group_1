import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { OrganizationComponent } from "./organization.component";
import { Auth } from "../../../../core/services/auth";
import { AnalyticsService } from "../../../../core/services/analytics.service";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";

describe("OrganizationComponent", () => {
  let component: OrganizationComponent;
  let fixture: ComponentFixture<OrganizationComponent>;
  let mockRouter: any;
  let mockAuth: any;
  let mockAnalyticsService: any;
  let mockPolicyService: any;
  let mockSchemeService: any;

  const mockOrgUser = {
    user_id: 88,
    full_name: "Tech Corp India",
    role: "ORGANIZATION",
  };

  const mockPolicyAnalytics = {
    total: 80,
    approved: 70,
    pending: 5,
    rejected: 3,
    archived: 2,
    by_category: [
      { category: "Technology", count: 40 },
      { category: "Healthcare", count: 20 },
      { category: "Finance", count: 20 },
    ],
    by_state: [],
    by_ministry: [],
    monthly_trend: [],
  };

  const mockSchemeAnalytics = {
    total: 40,
    active: 35,
    pending: 3,
    rejected: 1,
    archived: 1,
    by_category: [{ category: "MSME Support", count: 25 }],
    by_state: [],
    by_ministry: [],
    monthly_trend: [],
  };

  const mockPolicies = {
    policies: [
      {
        policy_id: 10,
        title: "National AI Strategy",
        ministry: "MeitY",
        created_at: "2025-02-01T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
    limit: 3,
  };

  const mockSchemes = {
    schemes: [
      {
        scheme_id: 20,
        name: "Startup Seed Fund",
        ministry: "DPIIT",
        created_at: "2025-02-05T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
    limit: 3,
  };

  beforeEach(async () => {
    localStorage.setItem(
      "policy_bookmarks",
      JSON.stringify([{ policy_id: 10, title: "National AI Strategy", ministry: "MeitY" }])
    );

    mockRouter = {
      navigate: vi.fn(),
    };

    mockAuth = {
      getStoredUser: vi.fn().mockReturnValue(mockOrgUser),
      getToken: vi.fn().mockReturnValue("org-token"),
      getCurrentUser: vi.fn().mockReturnValue(of(mockOrgUser)),
      logout: vi.fn(),
    };

    mockAnalyticsService = {
      getPolicyAnalytics: vi.fn().mockReturnValue(of(mockPolicyAnalytics)),
      getSchemeAnalytics: vi.fn().mockReturnValue(of(mockSchemeAnalytics)),
    };

    mockPolicyService = {
      getPolicies: vi.fn().mockReturnValue(of(mockPolicies)),
    };

    mockSchemeService = {
      getSchemes: vi.fn().mockReturnValue(of(mockSchemes)),
    };

    await TestBed.configureTestingModule({
      imports: [OrganizationComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: Auth, useValue: mockAuth },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.removeItem("policy_bookmarks");
  });

  it("should create OrganizationComponent and populate stats from analytics", () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(component.userName).toBe("Tech Corp India");

    expect(component.organizationStats[0].value).toBe(70); // Policies available
    expect(component.organizationStats[1].value).toBe(35); // Schemes explored
    expect(component.organizationStats[2].value).toBe(1);  // Saved items
    expect(component.organizationStats[3].value).toBe(4);  // 3 policy categories + 1 scheme category
  });

  it("should compute dynamic sector insights percentages and icons", () => {
    fixture.detectChanges();
    expect(component.sectorInsights.length).toBe(3);
    expect(component.sectorInsights[0].name).toBe("Technology");
    expect(component.sectorInsights[0].percentage).toBe(50); // 40 / 80 = 50%
    expect(component.sectorInsights[0].icon).toBe("computer");
  });

  it("should populate recent activity list from policies and schemes", () => {
    fixture.detectChanges();
    expect(component.recentActivity.length).toBe(2);
    expect(component.recentActivity[0].title).toBe("National AI Strategy");
    expect(component.recentActivity[1].title).toBe("Startup Seed Fund");
  });

  it("should navigate correctly for numeric and string policy targets", () => {
    component.viewPolicy(10);
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/organization/policies", 10]);

    component.viewPolicy("Cybersecurity");
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/organization/policies"], {
      queryParams: { search: "Cybersecurity" },
    });
  });

  it("should navigate correctly for numeric and string scheme targets", () => {
    component.viewScheme(20);
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/organization/schemes", 20]);

    component.viewScheme("Subsidies");
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/organization/schemes"], {
      queryParams: { keyword: "Subsidies" },
    });
  });
});
