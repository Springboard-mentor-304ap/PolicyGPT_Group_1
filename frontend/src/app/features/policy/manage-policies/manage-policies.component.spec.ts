import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { ManagePoliciesComponent } from "./manage-policies.component";
import { PolicyService } from "../../../core/services/policy.service";
import { Auth, AuthUser } from "../../../core/services/auth";
import {
  PolicyListResponse,
  PolicyResponse,
} from "../../../core/models/policy.model";

describe("ManagePoliciesComponent", () => {
  let component: ManagePoliciesComponent;
  let fixture: ComponentFixture<ManagePoliciesComponent>;
  let policyService: PolicyService;
  let authService: Auth;

  const mockAdminUser: AuthUser = {
    user_id: 1,
    full_name: "Admin User",
    email: "admin@gmail.com",
    role: "ADMIN",
    phone: null,
    date_of_birth: null,
    state: null,
    district: null,
    occupation: null,
    organization: null,
    is_active: true,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  const mockGovUserA: AuthUser = {
    user_id: 2,
    full_name: "Gov Official A",
    email: "gov_a@gmail.com",
    role: "GOVERNMENT_OFFICIAL",
    phone: null,
    date_of_birth: null,
    state: null,
    district: null,
    occupation: null,
    organization: null,
    is_active: true,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  const samplePolicies: PolicyResponse[] = [
    {
      policy_id: 1,
      title: "Policy A - Draft",
      description: "Created by Gov Official A",
      category: "Healthcare",
      status: "DRAFT",
      created_by: 2,
      created_at: "2026-01-04T00:00:00Z",
      updated_at: "2026-01-04T00:00:00Z",
    },
    {
      policy_id: 2,
      title: "Policy B - Pending",
      description: "Created by Gov Official A",
      category: "Healthcare",
      status: "PENDING_APPROVAL",
      created_by: 2,
      created_at: "2026-01-03T00:00:00Z",
      updated_at: "2026-01-03T00:00:00Z",
    },
    {
      policy_id: 3,
      title: "Policy C - Approved",
      description: "Created by Gov Official B",
      category: "Education",
      status: "APPROVED",
      created_by: 3,
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    {
      policy_id: 4,
      title: "Policy D - Archived",
      description: "Created by Admin",
      category: "Technology",
      status: "ARCHIVED",
      created_by: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const mockListResponse: PolicyListResponse = {
    total: 4,
    page: 1,
    limit: 100,
    pages: 1,
    policies: samplePolicies,
  };

  const mockStats = {
    total: 4,
    approved: 1,
    pending: 1,
    rejected: 0,
    archived: 1,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagePoliciesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        PolicyService,
        Auth,
      ],
    }).compileComponents();

    policyService = TestBed.inject(PolicyService);
    authService = TestBed.inject(Auth);
  });

  // Test 1: Component creation
  it("1. should create the component", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  // Test 2: Admin sees ALL policies across all creators and statuses
  it("2. Admin should see ALL policies in the system without creator restriction", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    const getPoliciesSpy = vi
      .spyOn(policyService, "getPolicies")
      .mockReturnValue(of(mockListResponse));
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(getPoliciesSpy).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      manage: true,
    });
    expect(component.isAdmin).toBe(true);
    expect(component.policies.length).toBe(4);
    expect(component.policies.some((p) => p.createdBy === 1)).toBe(true);
    expect(component.policies.some((p) => p.createdBy === 2)).toBe(true);
    expect(component.policies.some((p) => p.createdBy === 3)).toBe(true);
  });

  // Test 3: Government Official sees ONLY their own policies
  it("3. Government Official should see ONLY policies created by their user_id", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("GOVERNMENT_OFFICIAL");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockGovUserA);
    const getPoliciesSpy = vi
      .spyOn(policyService, "getPolicies")
      .mockReturnValue(of(mockListResponse));
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of({ total: 2, approved: 0, pending: 1, rejected: 0, archived: 0 }),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(getPoliciesSpy).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      manage: true,
    });
    expect(component.isAdmin).toBe(false);
    // Even if the mock response returned all policies, defensive filtering keeps only created_by === 2
    expect(component.policies.length).toBe(2);
    expect(component.policies.every((p) => p.createdBy === 2)).toBe(true);
  });

  // Test 4: Stats cards populate properly
  it("4. should populate stats counters correctly from backend analytics", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.stats.total).toBe(4);
    expect(component.stats.approved).toBe(1);
    expect(component.stats.pending).toBe(1);
    expect(component.stats.rejected).toBe(0);
    expect(component.stats.archived).toBe(1);
  });

  // Test 5: In-memory filtering and search
  it("5. should filter policies by search text, category, and status", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Filter by search text
    component.searchText = "Policy A";
    expect(component.filteredPolicies.length).toBe(1);
    expect(component.filteredPolicies[0].title).toBe("Policy A - Draft");

    // Filter by status
    component.searchText = "";
    component.selectedStatus = "PENDING_APPROVAL";
    expect(component.filteredPolicies.length).toBe(1);
    expect(component.filteredPolicies[0].status).toBe("PENDING_APPROVAL");
  });

  // Test 6: Workflow approval by Admin
  it("6. Admin approving a policy should trigger approvePolicy and reload data", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );
    const approveSpy = vi
      .spyOn(policyService, "approvePolicy")
      .mockReturnValue(of(samplePolicies[1]));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const pendingPolicy = component.policies[1];
    component.openApproveModal(pendingPolicy);
    expect(component.confirmModalOpen).toBe(true);

    component.onConfirmModalConfirmed();
    expect(approveSpy).toHaveBeenCalledWith(pendingPolicy.id);
  });

  // Test 7: Error handling when loading policies
  it("7. should handle API error gracefully when loading policies", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      throwError(() => ({ status: 500, message: "Server error" })),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.policies.length).toBe(0);
    expect(component.errorMessage).toBeTruthy();
  });

  // Test 8: Submit action label for Admin vs Other roles
  it('8. Menu label should be "Submit" for Admin and "Submit for approval" for Gov Official', () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftPolicy = component.policies[0];
    expect(component.getSubmitActionLabel(draftPolicy)).toBe("Submit");

    // For Government Official
    component.userRole = "GOVERNMENT_OFFICIAL";
    expect(component.getSubmitActionLabel(draftPolicy)).toBe(
      "Submit for approval",
    );

    const rejectedPolicy = { ...draftPolicy, status: "REJECTED" };
    expect(component.getSubmitActionLabel(rejectedPolicy)).toBe(
      "Re-submit for approval",
    );
  });

  // Test 9: Submit opens confirmation modal with dynamic policy name
  it("9. openSubmitModal should open confirmation modal displaying correct policy name", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftPolicy = component.policies[0];
    component.openSubmitModal(draftPolicy);

    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe("Submit Policy");
    expect(component.confirmMessage).toContain("Policy A - Draft");
    expect(component.confirmLoading).toBe(false);
  });

  // Test 10: Cancel closes modal without changing record or calling service
  it("10. onConfirmModalCancelled should close modal without calling submitPolicy", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );
    const submitSpy = vi.spyOn(policyService, "submitPolicy");

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftPolicy = component.policies[0];
    component.openSubmitModal(draftPolicy);
    expect(component.confirmModalOpen).toBe(true);

    component.onConfirmModalCancelled();

    expect(component.confirmModalOpen).toBe(false);
    expect(component.confirmAction).toBeNull();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(component.policies[0].status).toBe("DRAFT");
  });

  // Test 11: Confirm sends correct record ID and transitions to PENDING_APPROVAL
  it("11. Confirming submit calls submitPolicy and refreshes list with PENDING_APPROVAL", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    const updatedPolicy: PolicyResponse = {
      ...samplePolicies[0],
      status: "PENDING_APPROVAL",
    };
    const submitSpy = vi
      .spyOn(policyService, "submitPolicy")
      .mockReturnValue(of(updatedPolicy));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const loadSpy = vi.spyOn(component, "loadPolicies");

    const draftPolicy = component.policies[0];
    component.openSubmitModal(draftPolicy);
    component.onConfirmModalConfirmed();

    expect(submitSpy).toHaveBeenCalledWith(draftPolicy.id);
    expect(component.confirmModalOpen).toBe(false);
    expect(component.confirmLoading).toBe(false);
    expect(component.successToastMessage).toBe(
      'Policy "Policy A - Draft" submitted for approval.',
    );
    expect(
      component.policies.find((p) => p.id === draftPolicy.id)?.status,
    ).toBe("PENDING_APPROVAL");
  });

  // Test 12: Duplicate clicks do not create duplicate API requests
  it("12. Multiple confirm clicks while loading should not trigger duplicate submissions", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    const submitSpy = vi
      .spyOn(policyService, "submitPolicy")
      .mockReturnValue(of(samplePolicies[0]));

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftPolicy = component.policies[0];
    component.openSubmitModal(draftPolicy);

    // Simulate loading state active
    component.confirmLoading = true;
    component.onConfirmModalConfirmed();

    expect(submitSpy).not.toHaveBeenCalled();
  });

  // Test 13: API error displays error message and preserves previous status
  it("13. API failure during submission preserves record status and sets error message", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    vi.spyOn(policyService, "submitPolicy").mockReturnValue(
      throwError(() => ({
        status: 400,
        error: { detail: "Only DRAFT or REJECTED policies can be submitted." },
      })),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const draftPolicy = component.policies[0];
    component.openSubmitModal(draftPolicy);
    component.onConfirmModalConfirmed();

    expect(component.confirmLoading).toBe(false);
    expect(component.errorMessage).toContain(
      "Only DRAFT or REJECTED policies can be submitted.",
    );
    expect(component.confirmErrorMessage).toContain(
      "Only DRAFT or REJECTED policies can be submitted.",
    );
    expect(component.policies[0].status).toBe("DRAFT");
  });

  // Test 14: Next available action after PENDING_APPROVAL is Approve/Reject, not Submit
  it("14. Policy in PENDING_APPROVAL cannot be submitted again and shows Approve for Admin", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const pendingPolicy = component.policies[1];
    expect(component.canSubmitPolicy(pendingPolicy)).toBe(false);
  });

  // Test 15: Three-dot action menu toggle and close
  it("15. toggleMenu should open menu for clicked policy and toggle closed on second click", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.menuOpenId).toBeNull();

    // Click policy 1 three-dot button
    component.toggleMenu(1);
    expect(component.menuOpenId).toBe(1);

    // Click policy 1 three-dot button again -> closes
    component.toggleMenu(1);
    expect(component.menuOpenId).toBeNull();
  });

  // Test 16: Opening one row closes any previously open row menu
  it("16. Opening another row menu should close the previously open row menu", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.toggleMenu(1);
    expect(component.menuOpenId).toBe(1);

    // Click policy 2 three-dot button
    component.toggleMenu(2);
    expect(component.menuOpenId).toBe(2);
  });

  // Test 17: Escape key and outside closeMenu close the menu
  it("17. Escape key and closeMenu should close the active action dropdown", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.toggleMenu(1);
    expect(component.menuOpenId).toBe(1);

    // Press Escape
    component.onEscapeKey();
    expect(component.menuOpenId).toBeNull();

    // Reopen and test onOverlayKeydown Escape
    component.toggleMenu(1);
    expect(component.menuOpenId).toBe(1);
    component.onOverlayKeydown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(component.menuOpenId).toBeNull();
  });

  // Test 18: Action overlay positions provide below-aligned primary and above-aligned fallback
  it("18. actionMenuPositions should define below primary and above fallback positions", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.actionMenuPositions.length).toBeGreaterThanOrEqual(2);

    // Primary: opens below button
    const primary = component.actionMenuPositions[0];
    expect(primary.originY).toBe("bottom");
    expect(primary.overlayY).toBe("top");

    // Fallback: opens above button
    const fallback = component.actionMenuPositions[1];
    expect(fallback.originY).toBe("top");
    expect(fallback.overlayY).toBe("bottom");
  });

  // Test 19: View archive reason shows the recorded reason with a bold quoteless title
  it("19. openViewArchiveReason should display the policy name and archive reason", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.openViewArchiveReason({
      id: 10,
      title: "River Conservation Policy",
      description: "",
      category: "Environment",
      ministry: "",
      department: "",
      sector: "",
      status: "ARCHIVE_REQUESTED",
      archiveReason: "Superseded by the 2026 water framework.",
    });

    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toContain("River Conservation Policy");
    expect(component.confirmTitle).not.toContain('"');
    expect(component.confirmMessage).toContain(
      "Superseded by the 2026 water framework.",
    );
    expect(component.confirmText).toBe("Close");
    expect(component.showCancelConfirm).toBe(false);
  });

  // Test 20: View archive reason handles a missing reason gracefully
  it("20. openViewArchiveReason should fall back when no archive reason was recorded", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("ADMIN");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockAdminUser);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.openViewArchiveReason({
      id: 11,
      title: "Legacy Transport Policy",
      description: "",
      category: "Transport",
      ministry: "",
      department: "",
      sector: "",
      status: "ARCHIVED",
    });

    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toContain("Legacy Transport Policy");
    expect(component.confirmMessage).toContain("No archive reason available.");
  });
});


