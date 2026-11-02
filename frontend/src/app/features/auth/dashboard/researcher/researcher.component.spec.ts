import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { ResearcherComponent } from "./researcher.component";
import { categoryIconFields } from "../../../../core/utils/category-icon.util";
import { AnalyticsService } from "../../../../core/services/analytics.service";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { SavedItemsService } from "../../../../core/services/saved-items.service";

describe("ResearcherComponent", () => {
  let component: ResearcherComponent;
  let fixture: ComponentFixture<ResearcherComponent>;
  let mockRouter: any;
  let mockAnalyticsService: any;
  let mockPolicyService: any;
  let mockSchemeService: any;
  let mockSavedItemsService: any;

  const mockPolicyAnalytics = {
    total: 50,
    approved: 40,
    pending: 5,
    rejected: 3,
    archived: 2,
    by_category: [{ category: "Economy", count: 20 }, { category: "Health", count: 20 }],
    by_state: [],
    by_ministry: [],
    monthly_trend: [],
  };

  const mockSchemeAnalytics = {
    total: 30,
    active: 25,
    pending: 3,
    rejected: 1,
    archived: 1,
    by_category: [{ category: "Education", count: 15 }],
    by_state: [],
    by_ministry: [],
    monthly_trend: [],
  };

  const mockTrends = [
    { year: 2025, month: 1, count: 5 },
    { year: 2025, month: 2, count: 12 },
  ];

  const mockPolicies = {
    policies: [
      {
        policy_id: 1,
        title: "Clean Energy Roadmap",
        ministry: "Ministry of Power",
        created_at: "2025-01-20T00:00:00Z",
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
        scheme_id: 2,
        name: "Solar Rooftop Subsidy",
        ministry: "MNRE",
        created_at: "2025-02-01T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
    limit: 3,
  };

  beforeEach(async () => {
    mockSavedItemsService = {
      getSavedPolicies: vi.fn().mockReturnValue(of([{ policy_id: 1 }])),
      getSavedSchemes: vi.fn().mockReturnValue(of([])),
    };

    mockRouter = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    mockAnalyticsService = {
      getPolicyAnalytics: vi.fn().mockReturnValue(of(mockPolicyAnalytics)),
      getSchemeAnalytics: vi.fn().mockReturnValue(of(mockSchemeAnalytics)),
      getPolicyTrends: vi.fn().mockReturnValue(of(mockTrends)),
    };

    mockPolicyService = {
      getPolicies: vi.fn().mockReturnValue(of(mockPolicies)),
    };

    mockSchemeService = {
      getSchemes: vi.fn().mockReturnValue(of(mockSchemes)),
    };

    await TestBed.configureTestingModule({
      imports: [ResearcherComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
        { provide: SavedItemsService, useValue: mockSavedItemsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ResearcherComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.removeItem("policy_bookmarks");
    localStorage.removeItem("scheme_bookmarks");
    localStorage.removeItem("saved_policies");
    localStorage.removeItem("bookmarked_schemes");
  });

  it("should create ResearcherComponent and populate researchStats from analytics", () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(mockAnalyticsService.getPolicyAnalytics).toHaveBeenCalled();
    expect(mockAnalyticsService.getSchemeAnalytics).toHaveBeenCalled();
    expect(mockAnalyticsService.getPolicyTrends).toHaveBeenCalled();

    expect(component.researchStats[0].value).toBe(40); // Approved policies
    expect(component.researchStats[1].value).toBe(25); // Active schemes
    expect(component.researchStats[2].value).toBe(3);  // 2 policy categories + 1 scheme category
    expect(component.researchStats[3].value).toBe(1);  // 1 bookmarked item
  });

  it("should calculate trend bars from policy trends", () => {
    fixture.detectChanges();
    expect(component.trendBars.length).toBe(2);
    expect(component.trendBars[0].count).toBe(5);
    expect(component.trendBars[1].count).toBe(12);
    expect(component.monthlyPoliciesCount).toBe(12);
  });

  it("should populate recentResearch items from policies and schemes", () => {
    fixture.detectChanges();
    expect(component.recentResearch.length).toBe(2);
    expect(component.recentResearch[0].title).toBe("Clean Energy Roadmap");
    expect(component.recentResearch[1].title).toBe("Solar Rooftop Subsidy");
  });

  it("should navigate to researcher details routes", () => {
    component.openResearchItem({
      id: 1,
      title: "Clean Energy Roadmap",
      description: "MNRE",
      date: "Recent",
      type: "policy",
      icon: "policy",
      ...categoryIconFields("Energy"),
    });
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith("/dashboard/researcher/policies/1");

    component.openResearchItem({
      id: 2,
      title: "Solar Subsidy",
      description: "MNRE",
      date: "Recent",
      type: "scheme",
      icon: "account_balance",
      ...categoryIconFields("Energy"),
    });
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith("/dashboard/researcher/schemes/2");
  });
});
