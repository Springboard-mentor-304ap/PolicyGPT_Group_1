import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { DeletedPoliciesModalComponent } from "./deleted-policies-modal.component";

function makeMocks() {
  const policyService = {
    clearCache: vi.fn(),
    getDeletedPolicies: vi.fn(),
    restore: vi.fn(),
    permanentDeletePolicy: vi.fn(),
  };
  const cdr = { detectChanges: vi.fn() };
  const toastService = { success: vi.fn(), error: vi.fn() };
  return { policyService, cdr, toastService };
}

function makeComponent(mocks: ReturnType<typeof makeMocks>) {
  const c = new DeletedPoliciesModalComponent(
    mocks.policyService as any,
    mocks.cdr as any,
    mocks.toastService as any,
  );
  c.open = true;
  return c;
}

const row = (over: Record<string, any> = {}) => ({
  policy_id: 30,
  title: "Draft water policy",
  description: "Needs review",
  category: "Water",
  ministry: "MoJS",
  department: "Dept",
  sector: "Sector",
  status: "APPROVED",
  created_by: 2,
  created_by_name: "Gov Official",
  deleted_by: 1,
  deleted_by_name: "Admin User",
  deleted_at: "2026-10-10T13:21:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  ...over,
});

const listResponse = (policies: any[]) => ({
  total: policies.length,
  page: 1,
  limit: 100,
  pages: 1,
  policies,
});

describe("DeletedPoliciesModalComponent (trash)", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([])),
    );
  });

  it("1. loads trash rows from the trash API, not audit events", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row(), row({ policy_id: 31 })])),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(mocks.policyService.getDeletedPolicies).toHaveBeenCalledWith(
      1,
      100,
    );
    expect(c.records.length).toBe(2);
    expect(c.loading).toBe(false);
    expect(c.errorMessage).toBe("");
  });

  it("2. shows real titles and falls back to Title unavailable", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row(), row({ policy_id: 32, title: "" })])),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.displayTitle(c.records[0])).toBe("Draft water policy");
    expect(c.displayTitle(c.records[1])).toBe("Title unavailable");
  });

  it("3. details show real data with graceful fallbacks", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row()])),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.viewRecord(c.records[0]);
    expect(c.infoOpen).toBe(true);
    expect(c.infoTitle).toBe("Deleted Policy Details");
    const rows = Object.fromEntries(
      c.infoDetails.map((row) => [row.label, row.value]),
    );
    expect(rows["Policy"]).toBe("Draft water policy");
    expect(rows["Description"]).toBe("Needs review");
    expect(rows["Status"]).toContain("Approved");
    expect(rows["Created By"]).toBe("Gov Official");
    expect(rows["Deleted By"]).toBe("Admin User");
    expect(rows["Deleted At"]).toBe("10 Oct 2026, 06:51 PM");
    expect(c.infoDetails.some((r) => r.label === "Policy ID")).toBe(false);
    c.onEscapeKey();
    expect(c.infoOpen).toBe(false);
  });

  it("4. restore removes the row, refreshes the parent and toasts once", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row()])),
    );
    mocks.policyService.restore.mockReturnValue(
      of(row({ status: "APPROVED" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const changed: string[] = [];
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openRestoreModal(c.records[0]);
    expect(c.confirmModalOpen).toBe(true);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.restore).toHaveBeenCalledTimes(1);
    expect(mocks.policyService.restore).toHaveBeenCalledWith(30);
    expect(c.records.length).toBe(0);
    expect(changed).toEqual(["changed"]);
    expect(mocks.toastService.success).toHaveBeenCalledTimes(1);
    expect(mocks.toastService.success.mock.calls[0][0]).toContain(
      "Draft water policy",
    );
  });

  it("5. restore failure keeps the row and surfaces the backend error", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row()])),
    );
    mocks.policyService.restore.mockReturnValue(
      throwError(() => ({ status: 404, error: { detail: "Policy not found." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openRestoreModal(c.records[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmErrorMessage).toBe("Policy not found.");
    expect(c.records.length).toBe(1);
    expect(mocks.toastService.success).not.toHaveBeenCalled();
  });

  it("6. permanent delete confirms irreversibility then removes the row", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row()])),
    );
    mocks.policyService.permanentDeletePolicy.mockReturnValue(
      of({ message: "gone" }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const changed: string[] = [];
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openPermanentDeleteModal(c.records[0]);
    expect(c.confirmVariant).toBe("danger");
    expect(c.confirmMessage).toMatch(/irreversible/i);
    expect(c.confirmMessage).toContain("Draft water policy");
    c.onConfirmModalConfirmed();
    expect(
      mocks.policyService.permanentDeletePolicy,
    ).toHaveBeenCalledTimes(1);
    expect(mocks.policyService.permanentDeletePolicy).toHaveBeenCalledWith(
      30,
    );
    expect(c.records.length).toBe(0);
    expect(changed).toEqual(["changed"]);
    expect(mocks.toastService.success).toHaveBeenCalledTimes(1);
  });

  it("7. permanent delete failure retains the record with the real error", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row()])),
    );
    mocks.policyService.permanentDeletePolicy.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: "Referenced." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openPermanentDeleteModal(c.records[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmErrorMessage).toBe("Referenced.");
    expect(c.records.length).toBe(1);
    expect(mocks.toastService.success).not.toHaveBeenCalled();
  });

  it("8. duplicate confirm clicks do not fire duplicate requests", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row()])),
    );
    mocks.policyService.restore.mockReturnValue(of(row()));
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openPermanentDeleteModal(c.records[0]);
    c.confirmLoading = true;
    c.onConfirmModalConfirmed();
    expect(
      mocks.policyService.permanentDeletePolicy,
    ).not.toHaveBeenCalled();
  });

  it("9. search filters by title, status and person; count follows", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(
        listResponse([
          row(),
          row({
            policy_id: 31,
            title: "Solar Mission",
            created_by: 9,
            created_by_name: "Other Person",
          }),
        ]),
      ),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.searchText = "solar";
    expect(c.filteredRecords.length).toBe(1);
    expect(c.filteredRecords[0].policy_id).toBe(31);
    c.searchText = "gov official";
    expect(c.filteredRecords.length).toBe(1);
    c.searchText = "zzz";
    expect(c.filteredRecords.length).toBe(0);
  });

  it("10. load failure shows the banner, keeps an empty list and toasts once", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      throwError(() => ({ status: 0, message: "down" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.records.length).toBe(0);
    expect(c.errorMessage).toBeTruthy();
    expect(c.loading).toBe(false);
    expect(mocks.toastService.error).toHaveBeenCalledTimes(1);
    expect(mocks.toastService.success).not.toHaveBeenCalled();
  });
});
