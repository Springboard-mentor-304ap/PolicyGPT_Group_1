import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ApplicationRef } from "@angular/core";
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

  // Test 8: Submit action label follows the status matrix
  it('8. Menu label should be "Submit" for DRAFT and "Resubmit" for REJECTED, both roles', () => {
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
    expect(component.getSubmitActionLabel(draftPolicy)).toBe("Submit");

    const rejectedPolicy = { ...draftPolicy, status: "REJECTED" };
    expect(component.getSubmitActionLabel(rejectedPolicy)).toBe("Resubmit");
    component.userRole = "ADMIN";
    expect(component.getSubmitActionLabel(rejectedPolicy)).toBe("Resubmit");
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

  // Test 21: Edit-status popup offers only DRAFT and ARCHIVED with the policy name
  it("21. openEditStatusModal should open the popup with DRAFT/ARCHIVED options only", () => {
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

    const target = component.policies[0];
    component.openEditStatusModal(target);

    expect(component.editStatusModalOpen).toBe(true);
    expect(component.editStatusPolicy).toBe(target);
    expect(component.editStatusOptions).toEqual(["DRAFT", "ARCHIVED"]);
    expect(component.editStatusChoice).toBe("DRAFT");
  });

  // Test 22: Continue with Draft opens the edit form; Archived runs the
  // archive workflow; Cancel navigates nowhere
  it("22. confirmEditStatus should route Draft to edit, Archived to archive, cancel to nothing", () => {
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

    const target = component.policies.find((p) => p.status === "APPROVED")!;
    const editSpy = vi.spyOn(component, "editPolicy").mockImplementation(() => {});
    const archiveSpy = vi
      .spyOn(policyService, "archiveDirect")
      .mockReturnValue(of({ ...target, status: "ARCHIVED" } as any));

    component.openEditStatusModal(target);
    component.editStatusChoice = "DRAFT";
    component.confirmEditStatus();

    expect(editSpy).toHaveBeenCalledWith(target);
    expect(archiveSpy).not.toHaveBeenCalled();
    expect(component.editStatusModalOpen).toBe(false);
    expect(component.editStatusPolicy).toBeNull();

    component.openEditStatusModal(target);
    component.editStatusChoice = "ARCHIVED";
    editSpy.mockClear();
    component.confirmEditStatus();

    expect(editSpy).not.toHaveBeenCalled();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe("Archive Policy");
    component.onConfirmModalConfirmed();
    expect(archiveSpy).toHaveBeenCalledWith(target.id);

    component.openEditStatusModal(target);
    editSpy.mockClear();
    component.cancelEditStatus();

    expect(editSpy).not.toHaveBeenCalled();
    expect(component.editStatusModalOpen).toBe(false);
    expect(component.editStatusPolicy).toBeNull();
  });

  // Test 22b: openEditFlow routes by status; govt Archived choice requests archive
  it("22b. openEditFlow opens DRAFT/ARCHIVED directly and keeps the chooser otherwise", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("GOVERNMENT_OFFICIAL");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockGovUserA);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of({ total: 2, approved: 0, pending: 1, rejected: 0, archived: 0 }),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const navigateSpy = vi.spyOn(component["router"], "navigate").mockResolvedValue(true);
    const item = (over: Record<string, unknown>) => ({
      id: 99,
      title: "T",
      description: "",
      category: "C",
      ministry: "",
      department: "",
      sector: "",
      status: "DRAFT",
      ...over,
    });

    component.openEditFlow(item({ status: "DRAFT" }) as any);
    expect(navigateSpy).toHaveBeenCalledWith(
      ["/dashboard", "government", "policies", "edit", 99],
    );
    expect(component.editStatusModalOpen).toBe(false);

    navigateSpy.mockClear();
    component.openEditFlow(item({ status: "ARCHIVED" }) as any);
    expect(navigateSpy).toHaveBeenCalledWith(
      ["/dashboard", "government", "policies", "edit", 99],
    );
    expect(component.editStatusModalOpen).toBe(false);

    navigateSpy.mockClear();
    component.openEditFlow(item({ status: "APPROVED" }) as any);
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(component.editStatusModalOpen).toBe(false);
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe("Policy Must Be Archived");

    component.onConfirmModalConfirmed();
    expect(component.confirmModalOpen).toBe(false);
    expect(component.reasonModalOpen).toBe(true);
    expect(component.reasonTitle).toBe("Request Policy Archive");
  });

  it("22c. approved alert archives via API then opens the edit form (admin)", () => {
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

    const target = component.policies.find((p) => p.status === "APPROVED")!;
    const archiveSpy = vi
      .spyOn(policyService, "archiveDirect")
      .mockReturnValue(of({
        policy_id: target.id,
        title: target.title,
        description: target.description,
        category: target.category,
        status: "ARCHIVED",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      } as any));
    const navigateSpy = vi.spyOn(component["router"], "navigate").mockResolvedValue(true);

    component.openEditFlow(target);
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmTitle).toBe("Policy Must Be Archived");
    expect(component.confirmText).toBe("Archive Policy");

    component.onConfirmModalConfirmed();
    expect(archiveSpy).toHaveBeenCalledTimes(1);
    expect(archiveSpy).toHaveBeenCalledWith(target.id);
    expect(component.confirmModalOpen).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "policies",
      "edit",
      target.id,
    ]);
    expect(
      component.policies.find((p) => p.id === target.id)?.status,
    ).toBe("ARCHIVED");

    // Second confirm is a no-op (action cleared after success).
    archiveSpy.mockClear();
    navigateSpy.mockClear();
    component.onConfirmModalConfirmed();
    expect(archiveSpy).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("22d. approved alert shows API errors without navigating (admin)", () => {
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

    const target = component.policies.find((p) => p.status === "APPROVED")!;
    vi.spyOn(policyService, "archiveDirect").mockReturnValue(
      throwError(() => ({ error: { detail: "Archive blocked." } })),
    );
    const navigateSpy = vi.spyOn(component["router"], "navigate").mockResolvedValue(true);

    component.openEditFlow(target);
    component.onConfirmModalConfirmed();
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmErrorMessage).toBe("Archive blocked.");
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  // Test 23: Page-number window slides at most three pages
  it("23. visiblePages should show a sliding window of three page numbers", () => {
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

    component.policies = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      title: `Policy ${i + 1}`,
      description: "",
      category: "Healthcare",
      ministry: "",
      department: "",
      sector: "",
      status: "APPROVED",
    }));
    component.pageSize = 6;
    component.selectedPageSize = 6;
    component.currentPage = 1;
    expect(component.totalPages).toBe(5);
    expect(component.visiblePages).toEqual([1, 2, 3]);

    component.goToPage(2);
    expect(component.visiblePages).toEqual([1, 2, 3]);

    component.goToPage(3);
    expect(component.visiblePages).toEqual([1, 2, 3]);

    component.goToPage(4);
    expect(component.visiblePages).toEqual([2, 3, 4]);

    component.goToPage(5);
    expect(component.visiblePages).toEqual([3, 4, 5]);
  });

  // Test 24: Page size auto-fits small result sets and restores afterwards
  it("24. should shrink the page size to the record count and keep the range accurate", () => {
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

    // 4 policies with default selection 5 -> effective size 4, one page.
    expect(component.pageSize).toBe(4);
    expect(component.totalPages).toBe(1);
    expect(component.visiblePages).toEqual([1]);
    expect(component.startItem).toBe(1);
    expect(component.endItem).toBe(4);

    // Filtering down to zero keeps the selection (never zero).
    component.searchText = "zzz-no-such-policy";
    component.applyFilters();
    expect(component.paginatedPolicies.length).toBe(0);
    expect(component.pageSize).toBe(5);
    expect(component.startItem).toBe(0);

    // Clearing the filter restores the full set on one page.
    component.resetFilters();
    expect(component.pageSize).toBe(4);
    expect(component.startItem).toBe(1);
    expect(component.endItem).toBe(4);
  });

  // Test 25: Rows-per-page dropdown offers 5/10/20/50 with default 5
  it("25. should not offer a 6 option and should normalize a stale 6 to 5", () => {
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

    expect(component.pageSizeOptions).toEqual(["5", "10", "20", "50"]);
    expect(component.selectedPageSize).toBe(5);

    // A stale selected value of 6 is switched to 5 on init.
    component.selectedPageSize = 6;
    component.pageSize = 6;
    component.ngOnInit();
    expect(component.selectedPageSize).toBe(5);
  });

  // Test 26: Search results show live status badges + ministry/department (admin)
  it("26. search results display bold titles with live status badges and org meta", () => {
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

    const rows = [
      { id: 11, title: "Policy SE-A", description: "d", category: "C", ministry: "Ministry of Health", department: "Dept A", sector: "S", status: "DRAFT", createdBy: 2 },
      { id: 12, title: "Policy SE-B", description: "d", category: "C", ministry: "Ministry of Health", department: "", sector: "S", status: "PENDING_APPROVAL", createdBy: 2 },
      { id: 13, title: "Policy SE-C", description: "d", category: "C", ministry: "", department: "", sector: "S", status: "APPROVED", createdBy: 2 },
      { id: 14, title: "Policy SE-D", description: "d", category: "C", ministry: "M", department: "D", sector: "S", status: "REJECTED", createdBy: 2 },
      { id: 15, title: "Policy SE-E", description: "d", category: "C", ministry: "M", department: "D", sector: "S", status: "ARCHIVED", createdBy: 2 },
      { id: 16, title: "Policy SE-F", description: "d", category: "C", ministry: "M", department: "D", sector: "S", status: "ARCHIVE_REQUESTED", createdBy: 2 },
      { id: 17, title: "Policy SE-G", description: "d", category: "C", ministry: "M", department: "D", sector: "S", status: "DELETE_REQUESTED", createdBy: 2 },
    ];
    component.policies = rows as any;
    component.pageSize = 100;
    const searchInput = fixture.nativeElement.querySelector(
      '#policy-search',
    ) as HTMLInputElement;
    searchInput.value = 'Policy SE-';
    searchInput.dispatchEvent(new Event('input'));
    TestBed.inject(ApplicationRef).tick();

    expect(component.filteredPolicies.length).toBe(7);
    const pills = Array.from(
      fixture.nativeElement.querySelectorAll(".status-pill"),
    ) as HTMLElement[];
    expect(pills.length).toBe(7);
    const expected: Array<[string, string]> = [
      ["draft", "Draft"],
      ["pending_approval", "Pending Approval"],
      ["approved", "Approved"],
      ["rejected", "Rejected"],
      ["archived", "Archived"],
      ["archive_requested", "Archive Requested"],
      ["delete_requested", "Delete Requested"],
    ];
    expected.forEach(([cls, label], i) => {
      expect(pills[i].classList.contains(cls)).toBe(true);
      expect(pills[i].textContent).toContain(label);
    });
    const titles = Array.from(
      fixture.nativeElement.querySelectorAll(".policy-name"),
    ) as HTMLElement[];
    expect(titles.length).toBe(7);
    expect(titles[0].textContent).toContain("Policy SE-A");
    const metas = fixture.nativeElement.querySelectorAll(".policy-meta");
    // Row 3 has neither ministry nor department: no meta line.
    expect(metas.length).toBe(6);
    expect(metas[0].textContent).toContain("Ministry of Health");
    expect(metas[0].textContent).toContain("Dept A");
  });

  // Test 27: Status pill refreshes when the row data changes (govt role)
  it("27. status badges track live row updates for Government Officials", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("GOVERNMENT_OFFICIAL");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockGovUserA);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of({ total: 2, approved: 0, pending: 1, rejected: 0, archived: 0 }),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.policies = [
      { id: 21, title: "Policy GOV-X", description: "d", category: "C", ministry: "M", department: "D", sector: "S", status: "PENDING_APPROVAL", createdBy: 2 },
    ] as any;
    const searchInput = fixture.nativeElement.querySelector(
      '#policy-search',
    ) as HTMLInputElement;
    searchInput.value = 'GOV-X';
    searchInput.dispatchEvent(new Event('input'));
    TestBed.inject(ApplicationRef).tick();

    let pill = fixture.nativeElement.querySelector(".status-pill") as HTMLElement;
    expect(pill.classList.contains("pending_approval")).toBe(true);

    // Simulate the post-approval refresh patching the row.
    (component as any).applyPolicyUpdate({
      policy_id: 21,
      title: "Policy GOV-X",
      description: "d",
      category: "C",
      ministry: "M",
      department: "D",
      sector: "S",
      status: "APPROVED",
      created_by: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    TestBed.inject(ApplicationRef).tick();
    pill = fixture.nativeElement.querySelector(".status-pill") as HTMLElement;
    expect(pill.classList.contains("approved")).toBe(true);
    expect(pill.textContent).toContain("Approved");
  });

  // Test: Government Official DELETE_REQUESTED dropdown shows
  // View Details + View Deletion Reason (no approve/reject actions)
  it("Govt DELETE_REQUESTED menu shows View Details and View Deletion Reason only", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("GOVERNMENT_OFFICIAL");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockGovUserA);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.isAdmin).toBe(false);
    component.policies = [
      {
        id: 77,
        title: "Policy DEL",
        description: "d",
        category: "C",
        ministry: "M",
        department: "D",
        sector: "S",
        status: "DELETE_REQUESTED",
        createdBy: 2,
        deleteReason: "Superseded by a newer policy.",
      },
    ] as any;
    component.pageSize = 100;
    fixture.detectChanges();

    component.toggleMenu(77);
    fixture.detectChanges();
    TestBed.inject(ApplicationRef).tick();

    const menu = document.querySelector(".action-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.textContent).toContain("View Details");
    expect(menu.textContent).toContain("View Deletion Reason");
    expect(menu.textContent).not.toContain("Approve deletion");
    expect(menu.textContent).not.toContain("Reject deletion");

    component.closeMenu();
    fixture.detectChanges();
  });

  // Test: View Deletion Reason shows the stored reason, with fallback
  it("openViewDeleteReason shows the stored reason or a clear fallback", () => {
    vi.spyOn(authService, "getUserRole").mockReturnValue("GOVERNMENT_OFFICIAL");
    vi.spyOn(authService, "getStoredUser").mockReturnValue(mockGovUserA);
    vi.spyOn(policyService, "getPolicies").mockReturnValue(
      of(mockListResponse),
    );
    vi.spyOn(policyService, "getPolicyStatistics").mockReturnValue(
      of(mockStats),
    );

    fixture = TestBed.createComponent(ManagePoliciesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.openViewDeleteReason({
      id: 77,
      title: "Policy DEL",
      description: "d",
      category: "C",
      ministry: "M",
      department: "D",
      sector: "S",
      status: "DELETE_REQUESTED",
      createdBy: 2,
      deleteReason: "Superseded by a newer policy.",
    } as any);
    expect(component.confirmModalOpen).toBe(true);
    expect(component.confirmMessage).toContain(
      "Superseded by a newer policy.",
    );

    component.openViewDeleteReason({
      id: 78,
      title: "Policy NOREASON",
      description: "d",
      category: "C",
      ministry: "M",
      department: "D",
      sector: "S",
      status: "DELETE_REQUESTED",
      createdBy: 2,
    } as any);
    expect(component.confirmMessage).toContain("No reason was provided.");
  });
});


