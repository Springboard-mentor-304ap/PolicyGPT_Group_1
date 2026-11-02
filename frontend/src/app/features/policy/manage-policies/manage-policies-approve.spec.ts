import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { ManagePoliciesComponent } from "./manage-policies.component";

function makeMocks() {
  const policyService = {
    clearCache: vi.fn(),
    getPolicies: vi.fn(),
    getPolicyStatistics: vi.fn(),
    approvePolicy: vi.fn(),
    deletePolicy: vi.fn(),
  };
  const router = { navigate: vi.fn() };
  const auth = {
    getUserRole: vi.fn().mockReturnValue("ADMIN"),
    getStoredUser: vi.fn().mockReturnValue({ user_id: 1, role: "ADMIN" }),
  };
  const cdr = { detectChanges: vi.fn() };
  const toastService = { success: vi.fn(), error: vi.fn() };
  return { policyService, router, auth, cdr, toastService };
}

function makeComponent(mocks: ReturnType<typeof makeMocks>) {
  return new ManagePoliciesComponent(
    mocks.policyService as any,
    mocks.router as any,
    mocks.auth as any,
    mocks.cdr as any,
    mocks.toastService as any,
  );
}

const pendingRow = (over: Record<string, any> = {}) => ({
  policy_id: 80,
  title: "National Coastal Community Resilience and Mangrove Restoration Policy",
  description: "Awaiting review",
  category: "Environment",
  status: "PENDING_APPROVAL",
  created_by: 2,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  ...over,
});

describe("ManagePolicies approve action", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 0, page: 1, limit: 100, pages: 0, policies: [] }),
    );
    mocks.policyService.getPolicyStatistics.mockReturnValue(
      of({ total: 0, approved: 0, pending: 0, rejected: 0, archived: 0 }),
    );
  });

  it("1. shows the bold quoteless title in the approve dialog", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [pendingRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openApproveModal(c.policies[0]);
    expect(c.confirmModalOpen).toBe(true);
    expect(c.confirmTitle).toBe("Approve Policy");
    expect(c.confirmVariant).toBe("success");
    expect(c.confirmMessageBefore).toBe("Are you sure you want to approve ");
    expect(c.confirmHighlight).toBe(
      "National Coastal Community Resilience and Mangrove Restoration Policy",
    );
    expect(c.confirmHighlight).not.toContain('"');
    expect(c.confirmMessageAfter).toBe("?");
    expect(
      c.confirmMessageBefore + c.confirmHighlight + c.confirmMessageAfter,
    ).toBe(
      "Are you sure you want to approve National Coastal Community " +
        "Resilience and Mangrove Restoration Policy?",
    );
  });

  it("2. highlight never leaks into other dialogs", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [pendingRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openApproveModal(c.policies[0]);
    expect(c.confirmHighlight).toBeTruthy();
    c.onConfirmModalCancelled();
    c.openDirectDeleteModal(c.policies[0]);
    expect(c.confirmHighlight).toBe("");
    expect(c.confirmMessageBefore).toBe("");
    expect(c.confirmMessageAfter).toBe("");
  });

  it("3. confirm fires one request and applies the approval in place", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [pendingRow()] }),
    );
    mocks.policyService.approvePolicy.mockReturnValue(
      of(pendingRow({ status: "APPROVED" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const listCalls = mocks.policyService.getPolicies.mock.calls.length;
    c.openApproveModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.approvePolicy).toHaveBeenCalledTimes(1);
    expect(mocks.policyService.approvePolicy).toHaveBeenCalledWith(80);
    expect(c.confirmModalOpen).toBe(false);
    expect(c.successToastMessage).toContain("approved");
    // Patched in place: no full list reload for the mutation itself.
    expect(c.policies[0].status).toBe("APPROVED");
    expect(mocks.policyService.getPolicies.mock.calls.length).toBe(listCalls);
  });

  it("4. failure keeps PENDING_APPROVAL with the backend error shown", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [pendingRow()] }),
    );
    mocks.policyService.approvePolicy.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: "Only policies pending approval can be approved." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openApproveModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmLoading).toBe(false);
    expect(c.confirmErrorMessage).toContain("pending approval");
    expect(c.errorMessage).toContain("pending approval");
    expect(c.policies[0].status).toBe("PENDING_APPROVAL");
  });

  it("5. self-approval stays blocked before any API call", () => {
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "ADMIN" });
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [pendingRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openApproveModal(c.policies[0]);
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.policyService.approvePolicy).not.toHaveBeenCalled();
    expect(c.errorMessage).toMatch(/own policy/);
  });
});
