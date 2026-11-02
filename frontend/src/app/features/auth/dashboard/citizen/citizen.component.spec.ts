import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { CitizenComponent } from "./citizen.component";
import { categoryIconFields } from "../../../../core/utils/category-icon.util";
import { Auth } from "../../../../core/services/auth";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { NotificationService } from "../../../../core/services/notification.service";
import { SearchHistoryService } from "../../../../core/services/search-history.service";
import { SavedItemsService } from "../../../../core/services/saved-items.service";

describe("CitizenComponent", () => {
  let component: CitizenComponent;
  let fixture: ComponentFixture<CitizenComponent>;
  let mockAuth: any;
  let mockPolicyService: any;
  let mockSchemeService: any;
  let mockNotificationService: any;
  let mockSearchHistoryService: any;
  let mockSavedItemsService: any;

  const mockCitizen = {
    user_id: 10,
    full_name: "Aarav Sharma",
    role: "CITIZEN",
    email: "aarav@example.com",
    phone: "9876543210",
    state: "Maharashtra",
    district: "Pune",
    occupation: "Student",
  };

  const mockPolicies = {
    policies: [
      {
        policy_id: 50,
        title: "National Education Policy",
        ministry: "Ministry of Education",
        created_at: "2025-01-15T08:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
    limit: 4,
  };

  const mockSchemes = {
    schemes: [
      {
        scheme_id: 60,
        name: "PM Scholarship Scheme",
        ministry: "Ministry of Education",
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
    limit: 4,
  };

  const mockNotificationStats = {
    total: 4,
    read: 3,
    unread: 1,
  };

  const mockSearchHistory = [
    {
      history_id: 2,
      user_id: 10,
      search_query: "Scholarship",
      search_type: "schemes",
      searched_at: "2025-02-18T10:00:00Z",
    },
  ];

  const mockSavedPolicies = [
    {
      saved_id: 1,
      policy_id: 50,
      title: "National Education Policy",
      category: "Education",
      ministry: "Ministry of Education",
      department: null,
      state: null,
      status: "APPROVED",
      saved_at: "2025-01-15T08:00:00Z",
    },
  ];

  const mockSavedSchemes = [
    {
      saved_id: 2,
      scheme_id: 60,
      name: "PM Scholarship Scheme",
      category: "Education",
      ministry: "Ministry of Education",
      department: null,
      state: null,
      status: "APPROVED",
      saved_at: "2025-01-15T08:00:00Z",
    },
    {
      saved_id: 3,
      scheme_id: 61,
      name: "Health Cover Scheme",
      category: "Health",
      ministry: "Ministry of Health",
      department: null,
      state: null,
      status: "APPROVED",
      saved_at: "2025-01-16T08:00:00Z",
    },
  ];

  beforeEach(async () => {
    mockAuth = {
      getStoredUser: vi.fn().mockReturnValue(mockCitizen),
      getToken: vi.fn().mockReturnValue("citizen-token"),
      getCurrentUser: vi.fn().mockReturnValue(of(mockCitizen)),
      logout: vi.fn(),
    };

    mockPolicyService = {
      getPolicies: vi.fn().mockReturnValue(of(mockPolicies)),
    };

    mockSchemeService = {
      getSchemes: vi.fn().mockReturnValue(of(mockSchemes)),
    };

    mockNotificationService = {
      getNotificationStats: vi.fn().mockReturnValue(of(mockNotificationStats)),
    };

    mockSearchHistoryService = {
      getUserSearchHistory: vi.fn().mockReturnValue(of(mockSearchHistory)),
    };

    mockSavedItemsService = {
      getSavedPolicies: vi.fn().mockReturnValue(of(mockSavedPolicies)),
      getSavedSchemes: vi.fn().mockReturnValue(of(mockSavedSchemes)),
    };

    await TestBed.configureTestingModule({
      imports: [CitizenComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: mockAuth },
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: SearchHistoryService, useValue: mockSearchHistoryService },
        { provide: SavedItemsService, useValue: mockSavedItemsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CitizenComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.removeItem("policy_bookmarks");
    localStorage.removeItem("scheme_bookmarks");
    localStorage.removeItem("saved_policies");
    localStorage.removeItem("bookmarked_schemes");
  });

  it("should create CitizenComponent and populate user profile fields", () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(component.userName).toBe("Aarav Sharma");
    expect(component.userEmail).toBe("aarav@example.com");
    expect(component.userState).toBe("Maharashtra");
  });

  it("should load public approved policies and schemes", () => {
    fixture.detectChanges();
    expect(mockPolicyService.getPolicies).toHaveBeenCalledWith({ status: "APPROVED", limit: 4 });
    expect(mockSchemeService.getSchemes).toHaveBeenCalledWith({ status: "APPROVED", limit: 4 });

    expect(component.statCards[0].value).toBe(1); // Available policies
    expect(component.statCards[1].value).toBe(1); // Available schemes
    expect(component.statCards[2].value).toBe(3); // Saved items (1 policy + 2 schemes)
    expect(component.statCards[3].value).toBe(1); // Unread notifications
  });

  it("should populate eligible schemes and saved policies lists", () => {
    fixture.detectChanges();
    expect(component.eligibleSchemes.length).toBe(1);
    expect(component.eligibleSchemes[0].name).toBe("PM Scholarship Scheme");
    expect(component.savedPolicies.length).toBe(1);
    expect(component.savedPolicies[0].name).toBe("National Education Policy");
  });

  it("should populate search history from backend", () => {
    fixture.detectChanges();
    expect(mockSearchHistoryService.getUserSearchHistory).toHaveBeenCalledWith(10);
    expect(component.searchHistory.length).toBe(1);
    expect(component.searchHistory[0].name).toBe("Scholarship");
  });

  it("should handle error gracefully when API fails", () => {
    mockPolicyService.getPolicies.mockReturnValue(throwError(() => new Error("Policy err")));
    mockSchemeService.getSchemes.mockReturnValue(throwError(() => new Error("Scheme err")));
    fixture.detectChanges();

    expect(component.loadingStats).toBe(false);
  });

  it("should show zero saved items for a citizen with no saved records", () => {
    mockSavedItemsService.getSavedPolicies.mockReturnValue(of([]));
    mockSavedItemsService.getSavedSchemes.mockReturnValue(of([]));
    fixture.detectChanges();

    expect(mockSavedItemsService.getSavedPolicies).toHaveBeenCalled();
    expect(mockSavedItemsService.getSavedSchemes).toHaveBeenCalled();
    expect(component.statCards[2].value).toBe(0);
    expect(component.statCards[2].sub).toBe("0 policies, 0 schemes");
  });

  it("should ignore stale localStorage bookmarks from another citizen", () => {
    localStorage.setItem("policy_bookmarks", JSON.stringify([1, 2, 3, 4, 5]));
    localStorage.setItem("scheme_bookmarks", JSON.stringify([9, 8, 7]));
    fixture.detectChanges();

    // Counts come from the authenticated user's API records (1 + 2),
    // not the stale global bookmark cache (5 + 3).
    expect(component.statCards[2].value).toBe(3);
  });

  it("should hide empty sections only after loading finishes", () => {
    // Loading in progress: panels stay visible (loader), never treated as empty.
    component.loadingHistory = true;
    component.searchHistory = [];
    component.loadingSavedItems = true;
    component.savedItemsPreview = [];
    expect(component.showHistoryPanel).toBe(true);
    expect(component.showSavedItemsPanel).toBe(true);

    // Loaded with items: visible.
    component.loadingHistory = false;
    component.searchHistory = [{ name: "Scholarship", filters: "schemes" }];
    component.loadingSavedItems = false;
    component.savedItemsPreview = [
      {
        kind: "policy",
        id: 50,
        name: "National Education Policy",
        ministry: "Ministry of Education",
        ...categoryIconFields("Education"),
      },
    ];
    expect(component.showHistoryPanel).toBe(true);
    expect(component.showSavedItemsPanel).toBe(true);

    // Loaded and empty: hidden completely.
    component.searchHistory = [];
    component.savedItemsPreview = [];
    expect(component.showHistoryPanel).toBe(false);
    expect(component.showSavedItemsPanel).toBe(false);

    // Mixed: history visible, saved items hidden.
    component.searchHistory = [{ name: "Scholarship", filters: "schemes" }];
    expect(component.showHistoryPanel).toBe(true);
    expect(component.showSavedItemsPanel).toBe(false);
  });

  it("should hide empty scheme and policy panels only after loading", () => {
    component.loadingSchemes = true;
    component.eligibleSchemes = [];
    component.loadingPolicies = true;
    component.savedPolicies = [];
    expect(component.showSchemesPanel).toBe(true);
    expect(component.showPoliciesPanel).toBe(true);

    component.loadingSchemes = false;
    component.loadingPolicies = false;
    expect(component.showSchemesPanel).toBe(false);
    expect(component.showPoliciesPanel).toBe(false);
  });

  it("should build the saved-items preview from real API records", () => {
    // Fixture-shaped data: 1 saved policy + 2 saved schemes.
    const preview = CitizenComponent.buildSavedItemsPreview(
      mockSavedPolicies,
      mockSavedSchemes,
    );
    expect(preview.length).toBe(3);
    expect(preview[0]).toMatchObject({
      kind: "policy",
      id: 50,
      name: "National Education Policy",
    });
    expect(preview[1]).toMatchObject({
      kind: "scheme",
      id: 60,
      name: "PM Scholarship Scheme",
    });
    expect(preview[2]).toMatchObject({ kind: "scheme", id: 61 });
  });

  it("should cap the saved-items preview at 4", () => {
    const manyPolicies = [1, 2, 3].map((n) => ({
      saved_id: n,
      policy_id: 50 + n,
      title: `Policy ${n}`,
      category: null,
      ministry: "Ministry",
      department: null,
      state: null,
      status: "APPROVED",
      saved_at: "2025-01-15T08:00:00Z",
    }));
    const manySchemes = [1, 2, 3].map((n) => ({
      saved_id: 10 + n,
      scheme_id: 60 + n,
      name: `Scheme ${n}`,
      category: null,
      ministry: "Ministry",
      department: null,
      state: null,
      status: "APPROVED",
      saved_at: "2025-01-16T08:00:00Z",
    }));

    // 6 records → preview capped at 4 (policies first).
    const preview = CitizenComponent.buildSavedItemsPreview(
      manyPolicies,
      manySchemes,
    );
    expect(preview.length).toBe(4);
    expect(preview.map((item) => item.kind)).toEqual([
      "policy",
      "policy",
      "policy",
      "scheme",
    ]);
  });

  it("should return an empty preview when the user saved nothing", () => {
    expect(CitizenComponent.buildSavedItemsPreview([], [])).toEqual([]);
    expect(
      CitizenComponent.buildSavedItemsPreview(null, undefined),
    ).toEqual([]);
  });
});
