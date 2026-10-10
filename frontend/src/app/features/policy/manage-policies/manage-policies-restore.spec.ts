import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { ManagePoliciesComponent } from "./manage-policies.component";

function makeMocks() {
  const policyService = {
    clearCache: vi.fn(),
    getPolicies: vi.fn(),
    getPolicyStatistics: vi.fn(),
    restore: vi.fn(),
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

const archivedRow = (over: Record<string, any> = {}) => ({
  policy_id: 90,
  title: "Archived water policy",
  description: "Stored away",
  category: "Water",
  status: "ARCHIVED",
  created_by: 2,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  ...over,
});

describe("ManagePolicies restore action", () => {
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

  it("1. confirm fires one restore request with the real ID", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [archivedRow()] }),
    );
    mocks.policyService.restore.mockReturnValue(
      of(archivedRow({ status: "APPROVED" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openRestoreModal(c.policies[0]);
    expect(c.confirmModalOpen).toBe(true);
    expect(c.confirmTitle).toBe("Restore Policy");
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.restore).toHaveBeenCalledTimes(1);
    expect(mocks.policyService.restore).toHaveBeenCalledWith(90);
    expect(c.confirmModalOpen).toBe(false);
    expect(c.successToastMessage).toContain("APPROVED");
  });

  it("2. success patches the row to APPROVED and reloads statistics", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [archivedRow()] }),
    );
    mocks.policyService.restore.mockReturnValue(
      of(archivedRow({ status: "APPROVED" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const statsCalls = mocks.policyService.getPolicyStatistics.mock.calls.length;
    const listCalls = mocks.policyService.getPolicies.mock.calls.length;
    c.openRestoreModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(c.policies[0].status).toBe("APPROVED");
    // In-place patch: no full list refetch, statistics reloaded.
    expect(mocks.policyService.getPolicies.mock.calls.length).toBe(listCalls);
    expect(mocks.policyService.getPolicyStatistics.mock.calls.length).toBeGreaterThan(statsCalls);
  });

  it("3. failure keeps ARCHIVED with the backend error shown", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [archivedRow()] }),
    );
    mocks.policyService.restore.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: "Only ARCHIVED policies can be restored." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openRestoreModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmLoading).toBe(false);
    expect(c.confirmErrorMessage).toContain("Only ARCHIVED policies");
    expect(c.policies[0].status).toBe("ARCHIVED");
  });

  it("4. non-admins are blocked and cancel fires no request", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [archivedRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openRestoreModal(c.policies[0]);
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.policyService.restore).not.toHaveBeenCalled();
    expect(c.errorMessage).toMatch(/administrator/i);
  });

  it("5. cancelling and repeated clicks fire no duplicate requests", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [archivedRow()] }),
    );
    mocks.policyService.restore.mockReturnValue(of(archivedRow()));
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openRestoreModal(c.policies[0]);
    c.onConfirmModalCancelled();
    expect(mocks.policyService.restore).not.toHaveBeenCalled();
    c.openRestoreModal(c.policies[0]);
    c.confirmLoading = true;
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.restore).not.toHaveBeenCalled();
  });
});
