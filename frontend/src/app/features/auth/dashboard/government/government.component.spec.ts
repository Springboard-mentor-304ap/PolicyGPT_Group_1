import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { GovernmentComponent } from "./government.component";
import { Auth } from "../../../../core/services/auth";
import { AnalyticsService } from "../../../../core/services/analytics.service";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { NotificationService } from "../../../../core/services/notification.service";
import { SearchHistoryService } from "../../../../core/services/search-history.service";

describe("GovernmentComponent", () => {
  let component: GovernmentComponent;
  let fixture: ComponentFixture<GovernmentComponent>;
  let mockAuth: any;
  let mockAnalyticsService: any;
  let mockPolicyService: any;
  let mockSchemeService: any;
  let mockNotificationService: any;
  let mockSearchHistoryService: any;

  const mockGovUser = {
    user_id: 42,
    full_name: "Officer Ramesh",
    role: "GOVERNMENT_OFFICIAL",
  };

  const mockPolicies = {
    policies: [
      {
        policy_id: 11,
        title: "Clean River Initiative",
        ministry: "Ministry of Jal Shakti",
        status: "PENDING_APPROVAL",
        created_at: "2025-02-10T10:00:00Z",
      },
      {
        policy_id: 12,
        title: "Groundwater Conservation",
        ministry: "Ministry of Jal Shakti",
        status: "DRAFT",
        created_at: "2025-02-12T10:00:00Z",
      },
    ],
    total: 2,
    page: 1,
    pages: 1,
    limit: 100,
  };

  const mockSchemes = {
    schemes: [
      {
        scheme_id: 21,
        name: "Jal Jeevan Mission",
        ministry: "Ministry of Jal Shakti",
        status: "APPROVED",
      },
    ],
    total: 1,
    page: 1,
    pages: 1,
    limit: 100,
  };

  const mockNotificationStats = {
    total: 8,
    read: 5,
    unread: 3,
  };

  const mockNotifications = {
    items: [
      {
        notification_id: 101,
        title: "Policy approved",
        message: "Your policy was approved.",
        notification_type: "POLICY",
        category: "Policy",
        entity_type: null,
        is_read: false,
        created_at: "2025-02-16T10:00:00Z",
      },
      {
        notification_id: 102,
        title: "Scheme submitted",
        message: "A scheme was submitted.",
        notification_type: "SCHEME",
        category: "Scheme",
        entity_type: null,
        is_read: true,
        created_at: "2025-02-14T10:00:00Z",
      },
    ],
    total: 2,
    page: 1,
    page_size: 4,
    total_pages: 1,
    unread_count: 1,
    summary: { total: 2, unread: 1, read: 1, this_week: 2 },
  };

  const mockSearchHistory = [
    {
      history_id: 1,
      user_id: 42,
      search_query: "Water conservation",
      search_type: "policies",
      searched_at: "2025-02-15T12:00:00Z",
    },
  ];

  beforeEach(async () => {
    mockAuth = {
      getStoredUser: vi.fn().mockReturnValue(mockGovUser),
      getToken: vi.fn().mockReturnValue("valid-token"),
      getCurrentUser: vi.fn().mockReturnValue(of(mockGovUser)),
      logout: vi.fn(),
    };

    mockPolicyService = {
      getPolicies: vi.fn().mockReturnValue(of(mockPolicies)),
    };

    // Analytics aggregates unavailable here: the component falls back to
    // the manage=true page totals. Mocked (not real HTTP) so dashboard
    // assertions stay synchronous and deterministic.
    mockAnalyticsService = {
      getGovernmentPolicies: vi.fn().mockReturnValue(of(null)),
      getGovernmentSchemes: vi.fn().mockReturnValue(of(null)),
    };

    mockSchemeService = {
      getSchemes: vi.fn().mockReturnValue(of(mockSchemes)),
    };

    mockNotificationService = {
      getNotificationStats: vi.fn().mockReturnValue(of(mockNotificationStats)),
      getNotifications: vi.fn().mockReturnValue(of(mockNotifications)),
    };

    mockSearchHistoryService = {
      getUserSearchHistory: vi.fn().mockReturnValue(of(mockSearchHistory)),
    };

    await TestBed.configureTestingModule({
      imports: [GovernmentComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: mockAuth },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: SearchHistoryService, useValue: mockSearchHistoryService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GovernmentComponent);
    component = fixture.componentInstance;
  });

  it("should create GovernmentComponent and load user info", () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(component.userName).toBe("Officer Ramesh");
  });

  it("should fetch user-scoped policies and schemes with manage: true", () => {
    fixture.detectChanges();
    // Dashboard preview fetches: small manage=true pages for display;
    // totals come from the analytics aggregates (mocked null here).
    expect(mockPolicyService.getPolicies).toHaveBeenCalledWith({ manage: true, limit: 4 });
    expect(mockSchemeService.getSchemes).toHaveBeenCalledWith({ manage: true, limit: 4 });
    expect(mockNotificationService.getNotificationStats).toHaveBeenCalledWith(42);

    expect(component.statCards[0].value).toBe(2); // Total policies
    expect(component.statCards[1].value).toBe(1); // Total schemes
    expect(component.statCards[2].value).toBe(1); // Pending approval (1 policy pending)
    expect(component.statCards[3].value).toBe(3); // Unread notifications
  });

  it("should populate upcoming schemes, uploaded policies, and search history", () => {
    fixture.detectChanges();
    expect(component.upcomingSchemes.length).toBe(1);
    expect(component.upcomingSchemes[0].name).toBe("Jal Jeevan Mission");
    expect(component.uploadedPolicies.length).toBe(2);
    expect(component.uploadedPolicies[0].name).toBe("Clean River Initiative");
    expect(component.searchHistory.length).toBe(1);
    expect(component.searchHistory[0].name).toBe("Water conservation");
  });

  it("should load recent notifications on the homepage panel", () => {
    fixture.detectChanges();
    expect(mockNotificationService.getNotifications).toHaveBeenCalledWith({
      page: 1,
      page_size: 4,
    });
    expect(component.loadingNotifications).toBe(false);
    expect(component.notifications.length).toBe(2);
    expect(component.notifications[0].title).toBe("Policy approved");
    expect(component.unreadNotifications).toBe(1);
  });

  it("should handle error gracefully when policies or schemes API fails", () => {
    mockPolicyService.getPolicies.mockReturnValue(throwError(() => new Error("Policy error")));
    mockSchemeService.getSchemes.mockReturnValue(throwError(() => new Error("Scheme error")));
    fixture.detectChanges();

    expect(component.loadingStats).toBe(false);
  });
});
