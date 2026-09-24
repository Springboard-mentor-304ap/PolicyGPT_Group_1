import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { CitizenComponent } from "./citizen.component";
import { Auth } from "../../../../core/services/auth";
import { PolicyService } from "../../../../core/services/policy.service";
import { SchemeService } from "../../../../core/services/scheme.service";
import { NotificationService } from "../../../../core/services/notification.service";
import { SearchHistoryService } from "../../../../core/services/search-history.service";

describe("CitizenComponent", () => {
  let component: CitizenComponent;
  let fixture: ComponentFixture<CitizenComponent>;
  let mockAuth: any;
  let mockPolicyService: any;
  let mockSchemeService: any;
  let mockNotificationService: any;
  let mockSearchHistoryService: any;

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

  beforeEach(async () => {
    localStorage.setItem("policy_bookmarks", JSON.stringify([50]));
    localStorage.setItem("scheme_bookmarks", JSON.stringify([60, 61]));

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

    await TestBed.configureTestingModule({
      imports: [CitizenComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: mockAuth },
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: SearchHistoryService, useValue: mockSearchHistoryService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CitizenComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.removeItem("policy_bookmarks");
    localStorage.removeItem("scheme_bookmarks");
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
});
