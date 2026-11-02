import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { UserDetailsComponent } from "./user-details.component";
import { AdminUsersService, AdminUserApi, UserAuditLogApi } from "../../../../../core/services/admin-user.service";
import { PolicyService } from "../../../../../core/services/policy.service";
import { SchemeService } from "../../../../../core/services/scheme.service";
import { SearchHistoryService, SearchHistoryItem } from "../../../../../core/services/search-history.service";

describe("UserDetailsComponent", () => {
  let component: UserDetailsComponent;
  let fixture: ComponentFixture<UserDetailsComponent>;
  let mockAdminUsersService: any;
  let mockPolicyService: any;
  let mockSchemeService: any;
  let mockSearchHistoryService: any;
  let mockRouter: any;
  let mockActivatedRoute: any;

  const mockGovUser: AdminUserApi = {
    user_id: 2,
    full_name: "Rahul Sharma",
    email: "rahul@test.gov.in",
    role: "GOVERNMENT_OFFICIAL",
    phone: "+91 9876500001",
    date_of_birth: "1990-08-20",
    state: "Maharashtra",
    district: "Mumbai",
    occupation: "Policy Officer",
    organization: "Ministry of Agriculture",
    is_active: true,
    created_at: "2026-02-15T10:00:00Z",
    updated_at: "2026-02-16T10:00:00Z",
  };

  const mockCitizenUser: AdminUserApi = {
    user_id: 3,
    full_name: "Priya Patel",
    email: "priya@citizen.in",
    role: "CITIZEN",
    phone: "+91 9876500003",
    date_of_birth: "1998-05-14",
    state: "Gujarat",
    district: "Ahmedabad",
    occupation: "Researcher",
    organization: "Independent",
    is_active: true,
    created_at: "2026-02-10T10:00:00Z",
    updated_at: "2026-02-11T10:00:00Z",
  };

  const mockPolicies = [
    {
      policy_id: 101,
      title: "PM Kisan Samman Nidhi",
      category: "Agriculture",
      ministry: "Ministry of Agriculture",
      status: "APPROVED",
      created_by: 2,
      approved_by: 1,
      created_at: "2026-02-16T12:00:00Z",
      updated_at: "2026-02-18T12:00:00Z",
    },
    {
      policy_id: 102,
      title: "Krishi Sinchayee Yojana",
      category: "Agriculture",
      ministry: "Ministry of Agriculture",
      status: "PENDING_APPROVAL",
      created_by: 2,
      approved_by: null,
      created_at: "2026-02-20T12:00:00Z",
      updated_at: "2026-02-20T12:00:00Z",
    },
    {
      policy_id: 103,
      title: "National Health Mission",
      category: "Healthcare",
      ministry: "Ministry of Health",
      status: "APPROVED",
      created_by: 99, // Another user
      approved_by: 1,
      created_at: "2026-02-01T12:00:00Z",
      updated_at: "2026-02-05T12:00:00Z",
    },
  ];

  const mockSchemes = [
    {
      scheme_id: 201,
      name: "Soil Health Card Scheme",
      category: "Farmer Welfare",
      ministry: "Ministry of Agriculture",
      status: "APPROVED",
      created_by: 2,
      approved_by: 1,
      created_at: "2026-02-17T12:00:00Z",
      updated_at: "2026-02-19T12:00:00Z",
    },
    {
      scheme_id: 202,
      name: "Ayushman Bharat",
      category: "Healthcare",
      ministry: "Ministry of Health",
      status: "APPROVED",
      created_by: 99, // Another user
      approved_by: 1,
      created_at: "2026-02-02T12:00:00Z",
      updated_at: "2026-02-06T12:00:00Z",
    },
  ];

  const mockAuditLogs: UserAuditLogApi[] = [
    {
      audit_id: 501,
      user_id: 2,
      action: "VIEW_POLICY",
      entity_type: "POLICY",
      entity_id: 101,
      description: "Viewed details of policy #101",
      ip_address: "192.168.1.1",
      created_at: "2026-02-22T08:30:00Z",
    },
  ];

  const mockSearches: SearchHistoryItem[] = [
    {
      history_id: 601,
      user_id: 3,
      search_query: "Solar panel subsidy",
      search_type: "SCHEME",
      filters: { State: "Gujarat" },
      searched_at: "2026-02-21T09:00:00Z",
    },
    {
      history_id: 602,
      user_id: 3,
      search_query: "National Education Policy",
      search_type: "POLICY",
      filters: null,
      searched_at: "2026-02-21T10:00:00Z",
    },
  ];

  beforeEach(async () => {
    mockAdminUsersService = {
      getUserById: vi.fn().mockReturnValue(of(mockGovUser)),
      getAuditLogsForUser: vi.fn().mockReturnValue(of(mockAuditLogs)),
    };

    mockPolicyService = {
      getPolicies: vi.fn().mockReturnValue(of({ policies: mockPolicies, total: 3, page: 1, pages: 1, limit: 100 })),
    };

    mockSchemeService = {
      getSchemes: vi.fn().mockReturnValue(of({ schemes: mockSchemes, total: 2, page: 1, pages: 1, limit: 100 })),
    };

    mockSearchHistoryService = {
      getUserSearchHistory: vi.fn().mockReturnValue(of([])),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockActivatedRoute = {
      paramMap: of(new Map([["id", "2"]])),
    };

    await TestBed.configureTestingModule({
      imports: [UserDetailsComponent],
      providers: [
        { provide: AdminUsersService, useValue: mockAdminUsersService },
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
        { provide: SearchHistoryService, useValue: mockSearchHistoryService },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create UserDetailsComponent and load government official profile", () => {
    expect(component).toBeTruthy();
    expect(mockAdminUsersService.getUserById).toHaveBeenCalledWith(2);
    expect(component.user).toBeTruthy();
    expect(component.user?.fullName).toBe("Rahul Sharma");
    expect(component.user?.email).toBe("rahul@test.gov.in");
    expect(component.user?.role).toBe("GOVERNMENT_OFFICIAL");
    expect(component.user?.status).toBe("Active");
  });

  it("should filter policies to only those created by the selected user for creator role", () => {
    expect(mockPolicyService.getPolicies).toHaveBeenCalledWith({ manage: true, limit: 100 });
    // User 2 created policies 101 and 102, but not 103
    expect(component.userPolicies.length).toBe(2);
    expect(component.userPolicies.map((p) => p.policy_id)).toEqual([101, 102]);
  });

  it("should filter schemes to only those created by the selected user for creator role", () => {
    expect(mockSchemeService.getSchemes).toHaveBeenCalledWith({ manage: true, limit: 100 });
    // User 2 created scheme 201, but not 202
    expect(component.userSchemes.length).toBe(1);
    expect(component.userSchemes[0].scheme_id).toBe(201);
  });

  it("should correctly compute approval and pending metrics for government creator role", () => {
    expect(component.approvedCount).toBe(2);
    expect(component.pendingCount).toBe(1);
  });

  it("should identify creator roles vs consumer roles accurately", () => {
    expect(component.isCreatorRole("ADMINISTRATOR")).toBe(true);
    expect(component.isCreatorRole("GOVERNMENT_OFFICIAL")).toBe(true);
    expect(component.isCreatorRole("CITIZEN")).toBe(false);
    expect(component.isCreatorRole("RESEARCHER")).toBe(false);
    expect(component.isCreatorRole("ORGANIZATION")).toBe(false);
  });

  it("should NOT fetch policies/schemes created or show approval metrics for CITIZEN, RESEARCHER, and ORGANIZATION roles", () => {
    // Reset spies
    mockPolicyService.getPolicies.mockClear();
    mockSchemeService.getSchemes.mockClear();
    mockAdminUsersService.getUserById.mockReturnValue(of(mockCitizenUser));
    mockSearchHistoryService.getUserSearchHistory.mockReturnValue(of(mockSearches));

    // Load citizen user
    component.loadUserData(3);
    fixture.detectChanges();

    expect(component.user?.role).toBe("CITIZEN");
    expect(component.isCreatorRole("CITIZEN")).toBe(false);

    // Should NOT call policyService or schemeService for creator queries
    expect(mockPolicyService.getPolicies).not.toHaveBeenCalled();
    expect(mockSchemeService.getSchemes).not.toHaveBeenCalled();

    // User policies and schemes created must remain empty
    expect(component.userPolicies.length).toBe(0);
    expect(component.userSchemes.length).toBe(0);

    // Search and viewed history should be loaded
    expect(component.userSearches.length).toBe(2);
    expect(component.policySearchesCount).toBe(1);
    expect(component.schemeSearchesCount).toBe(1);

    // Verify DOM does not contain approval metrics or created policies tabs
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain("Approved Content");
    expect(compiled.textContent).not.toContain("Pending Review");
    expect(compiled.textContent).toContain("Searches Conducted");
    expect(compiled.textContent).toContain("Policies Explored");
    expect(compiled.textContent).toContain("Schemes Explored");
  });

  it("should display search and exploration history when tab is clicked for consumer role", () => {
    mockAdminUsersService.getUserById.mockReturnValue(of(mockCitizenUser));
    mockSearchHistoryService.getUserSearchHistory.mockReturnValue(of(mockSearches));

    component.loadUserData(3);
    fixture.detectChanges();

    component.setTab("searches");
    fixture.detectChanges();

    expect(component.activeTab).toBe("searches");
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain("Solar panel subsidy");
    expect(compiled.textContent).toContain("National Education Policy");
  });

  it("should navigate to existing policy details route when clicked", () => {
    component.viewPolicyDetails(101);
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/admin/policies", 101]);
  });

  it("should navigate to existing scheme details route when clicked", () => {
    component.viewSchemeDetails(201);
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/admin/schemes", 201]);
  });

  it("should navigate back to View Users when requested", () => {
    component.goToViewUsers();
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/admin/users"]);
  });

  it("should display error state when user cannot be found", () => {
    mockAdminUsersService.getUserById.mockReturnValue(of(null));
    component.loadUserData(999);
    fixture.detectChanges();

    expect(component.user).toBeNull();
    expect(component.userError).toContain("does not exist");
  });
});
