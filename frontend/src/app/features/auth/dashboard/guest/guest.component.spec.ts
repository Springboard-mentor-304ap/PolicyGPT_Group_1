import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { By } from "@angular/platform-browser";
import { BehaviorSubject } from "rxjs";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { GuestComponent } from "./guest.component";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { PolicyListResponse, PolicyResponse } from "../../../../core/models/policy.model";
import { SchemeListResponse, SchemeResponse } from "../../../../core/models/scheme.model";

describe("GuestComponent", () => {
  let component: GuestComponent;
  let fixture: ComponentFixture<GuestComponent>;
  let mockRouter: any;
  let mockPolicyService: any;
  let mockSchemeService: any;
  let queryParamsSubject: BehaviorSubject<any>;

  const mockPolicies: PolicyResponse[] = [
    {
      policy_id: 1,
      title: "National Health Policy",
      description: "Comprehensive public healthcare infrastructure.",
      category: "Healthcare",
      ministry: "Ministry of Health",
      department: "Health & Family Welfare",
      state: "Central",
      status: "APPROVED",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      policy_id: 2,
      title: "Digital India Policy",
      description: "Empowering citizens with digital services.",
      category: "Technology",
      ministry: "Ministry of Electronics and IT",
      department: "Electronics & IT",
      state: "Central",
      status: "APPROVED",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ];

  const mockSchemes: SchemeResponse[] = [
    {
      scheme_id: 10,
      name: "Ayushman Bharat",
      title: "Ayushman Bharat PM-JAY",
      description: "Universal healthcare coverage for vulnerable families.",
      category: "Healthcare",
      ministry: "Ministry of Health",
      department: "Health & Family Welfare",
      state: "Central",
      status: "APPROVED",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ];

  const mockPolicyResponse: PolicyListResponse = {
    policies: mockPolicies,
    total: 2,
    page: 1,
    pages: 1,
    limit: 6,
  };

  const mockSchemeResponse: SchemeListResponse = {
    schemes: mockSchemes,
    total: 1,
    page: 1,
    pages: 1,
    limit: 6,
  };

  beforeEach(async () => {
    queryParamsSubject = new BehaviorSubject<any>({});

    mockRouter = {
      navigate: vi.fn(),
    };

    mockPolicyService = {
      getPolicies: vi.fn().mockReturnValue(of(mockPolicyResponse)),
    };

    mockSchemeService = {
      getSchemes: vi.fn().mockReturnValue(of(mockSchemeResponse)),
    };

    await TestBed.configureTestingModule({
      imports: [GuestComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParamsSubject.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GuestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("1. should create the GuestComponent", () => {
    expect(component).toBeTruthy();
    expect(component.hasSearched).toBe(false);
    expect(component.searchQuery).toBe("");
  });

  it("2. should display exact Part 1 & 12 UI text in the search section", () => {
    const heading = fixture.debugElement.query(By.css(".guest-section-heading h2"));
    expect(heading.nativeElement.textContent.trim()).toBe("Find Government Policies & Schemes");

    const subtitle = fixture.debugElement.query(By.css(".guest-section-heading p"));
    expect(subtitle.nativeElement.textContent.trim()).toBe(
      "Search for government policies, schemes, benefits and programmes."
    );

    const input = fixture.debugElement.query(By.css("input[type='search']"));
    expect(input.nativeElement.getAttribute("placeholder")).toBe(
      "Search policies, schemes, benefits, education, healthcare..."
    );

    const button = fixture.debugElement.query(By.css(".guest-search__button"));
    expect(button.nativeElement.textContent.trim()).toBe("Search");
  });

  it("3. should not search when query is empty or only whitespace", () => {
    component.onSearch("");
    expect(mockRouter.navigate).not.toHaveBeenCalled();

    component.onSearch("   ");
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it("4. should navigate with query param on search", () => {
    component.onSearch("health");
    expect(mockRouter.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { q: "health" },
    });
  });

  it("5. should execute dual search for policies and schemes when query param is present", () => {
    queryParamsSubject.next({ q: "health" });
    fixture.detectChanges();

    expect(component.hasSearched).toBe(true);
    expect(component.activeSearchTerm).toBe("health");
    expect(mockPolicyService.getPolicies).toHaveBeenCalledWith({
      search: "health",
      status: "APPROVED",
      limit: 6,
    });
    expect(mockSchemeService.getSchemes).toHaveBeenCalledWith({
      keyword: "health",
      status: "APPROVED",
      limit: 6,
    });
    expect(component.policies.length).toBe(2);
    expect(component.schemes.length).toBe(1);
    expect(component.totalPolicies).toBe(2);
    expect(component.totalSchemes).toBe(1);
  });

  it("6. should render search results inside Guest Dashboard when search has completed", () => {
    queryParamsSubject.next({ q: "health" });
    fixture.detectChanges();

    const resultsSection = fixture.debugElement.query(By.css(".guest-results-section"));
    expect(resultsSection).toBeTruthy();

    const resultsMeta = fixture.debugElement.query(By.css(".guest-results-meta h3"));
    expect(resultsMeta.nativeElement.textContent.trim()).toContain('Results for "health"');

    // Both groups should be rendered
    const policyCards = fixture.debugElement.queryAll(By.css(".guest-result-card"));
    expect(policyCards.length).toBe(3); // 2 policies + 1 scheme
  });

  it("7. should filter by tabs (policies only, schemes only, all)", () => {
    queryParamsSubject.next({ q: "health" });
    fixture.detectChanges();

    // Default: 'all'
    expect(component.activeTab).toBe("all");

    // Switch to 'policies'
    component.setActiveTab("policies");
    fixture.detectChanges();
    let groups = fixture.debugElement.queryAll(By.css(".guest-results-group"));
    expect(groups.length).toBe(1);
    expect(groups[0].nativeElement.textContent).toContain("Government Policies");

    // Switch to 'schemes'
    component.setActiveTab("schemes");
    fixture.detectChanges();
    groups = fixture.debugElement.queryAll(By.css(".guest-results-group"));
    expect(groups.length).toBe(1);
    expect(groups[0].nativeElement.textContent).toContain("Government Schemes");
  });

  it("8. should clear search and restore default dashboard when clearSearch is called", () => {
    queryParamsSubject.next({ q: "health" });
    fixture.detectChanges();

    expect(component.hasSearched).toBe(true);

    component.clearSearch();
    expect(mockRouter.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { q: null },
      queryParamsHandling: "merge",
    });

    queryParamsSubject.next({});
    fixture.detectChanges();

    expect(component.hasSearched).toBe(false);
    expect(component.policies.length).toBe(0);
    expect(component.schemes.length).toBe(0);

    // Welcome section should reappear
    const welcome = fixture.debugElement.query(By.css(".guest-welcome"));
    expect(welcome).toBeTruthy();
  });

  it("9. should preserve guest layout routes for policies and schemes navigation", () => {
    component.goToPolicies();
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/guest/policies/search"]);

    component.goToSchemes();
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/guest/schemes"]);
  });

  it("10. should navigate to guest details routes when viewPolicy and viewScheme are called", () => {
    component.viewPolicy(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/guest/policies", 1]);

    component.viewScheme(10);
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/guest/schemes", 10]);
  });

  it("11. should display empty state when 0 results are returned", () => {
    mockPolicyService.getPolicies.mockReturnValue(of({ policies: [], total: 0, page: 1, pages: 1, limit: 6 }));
    mockSchemeService.getSchemes.mockReturnValue(of({ schemes: [], total: 0, page: 1, pages: 1, limit: 6 }));

    queryParamsSubject.next({ q: "nonexistentterm" });
    fixture.detectChanges();

    expect(component.totalPolicies).toBe(0);
    expect(component.totalSchemes).toBe(0);

    const emptyState = fixture.debugElement.query(By.css(".guest-search-empty"));
    expect(emptyState).toBeTruthy();
    expect(emptyState.nativeElement.textContent).toContain("No Results Found");
  });

  it("12. should handle API errors gracefully", () => {
    mockPolicyService.getPolicies.mockReturnValue(throwError(() => new Error("API Failure")));
    mockSchemeService.getSchemes.mockReturnValue(throwError(() => new Error("API Failure")));

    queryParamsSubject.next({ q: "failquery" });
    fixture.detectChanges();

    // forkJoin catchErrors fallback to empty arrays without breaking
    expect(component.policies.length).toBe(0);
    expect(component.schemes.length).toBe(0);
    expect(component.loading).toBe(false);
  });
});
