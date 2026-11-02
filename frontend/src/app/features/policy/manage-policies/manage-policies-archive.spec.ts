import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { ManagePoliciesComponent } from "./manage-policies.component";

function makeMocks() {
  const policyService = {
    clearCache: vi.fn(),
    getPolicies: vi.fn(),
    getPolicyStatistics: vi.fn(),
    archiveDirect: vi.fn(),
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

const approvedRow = (over: Record<string, any> = {}) => ({
  policy_id: 70,
  title: "Approved water policy",
  description: "Live record",
  category: "Water",
  status: "APPROVED",
  created_by: 2,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  ...over,
});

describe("ManagePolicies archive action", () => {
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

  it("1. opens a confirmation showing the actual policy title", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [approvedRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openArchiveModal(c.policies[0]);
    expect(c.confirmModalOpen).toBe(true);
    expect(c.confirmTitle).toBe("Archive Policy");
    expect(c.confirmMessage).toContain("Approved water policy");
    expect(c.confirmVariant).toBe("warning");
    expect(mocks.policyService.archiveDirect).not.toHaveBeenCalled();
  });

  it("2. confirm archives via the existing API and updates status + stats", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [approvedRow()] }),
    );
    mocks.policyService.archiveDirect.mockReturnValue(
      of(approvedRow({ status: "ARCHIVED" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const statsCalls = mocks.policyService.getPolicyStatistics.mock.calls.length;
    c.openArchiveModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.archiveDirect).toHaveBeenCalledTimes(1);
    expect(mocks.policyService.archiveDirect).toHaveBeenCalledWith(70);
    expect(c.confirmModalOpen).toBe(false);
    expect(c.successToastMessage).toContain("archived");
    // Row patched in place; statistics reloaded from the backend.
    expect(c.policies[0].status).toBe("ARCHIVED");
    expect(mocks.policyService.getPolicyStatistics.mock.calls.length).toBeGreaterThan(statsCalls);
  });

  it("3. ineligible statuses are blocked without an API call", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 1,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [approvedRow({ policy_id: 71, status: "DRAFT" })],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openArchiveModal(c.policies[0]);
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.policyService.archiveDirect).not.toHaveBeenCalled();
    expect(c.errorMessage).toMatch(/APPROVED/);
    expect(c.policies[0].status).toBe("DRAFT");
  });

  it("4. non-admins are blocked without an API call", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [approvedRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openArchiveModal(c.policies[0]);
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.policyService.archiveDirect).not.toHaveBeenCalled();
    expect(c.errorMessage).toMatch(/administrator/i);
  });

  it("5. API failure keeps the policy APPROVED and shows the backend error", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [approvedRow()] }),
    );
    mocks.policyService.archiveDirect.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: "Only APPROVED policies can be archived directly." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openArchiveModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmLoading).toBe(false);
    expect(c.confirmErrorMessage).toContain("Only APPROVED policies");
    expect(c.errorMessage).toContain("Only APPROVED policies");
    expect(c.policies[0].status).toBe("APPROVED");
  });

  it("6. cancelling and repeated clicks fire no duplicate requests", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [approvedRow()] }),
    );
    mocks.policyService.archiveDirect.mockReturnValue(of(approvedRow()));
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openArchiveModal(c.policies[0]);
    c.onConfirmModalCancelled();
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.policyService.archiveDirect).not.toHaveBeenCalled();
    c.openArchiveModal(c.policies[0]);
    c.confirmLoading = true;
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.archiveDirect).not.toHaveBeenCalled();
  });
});
