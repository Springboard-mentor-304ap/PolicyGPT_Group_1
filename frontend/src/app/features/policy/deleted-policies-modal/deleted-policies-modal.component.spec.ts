import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { DeletedPoliciesModalComponent } from "./deleted-policies-modal.component";

function makeMocks() {
  const auditLogService = { getAuditLogs: vi.fn() };
  const policyService = {
    rejectDelete: vi.fn(),
    restore: vi.fn(),
    approveDelete: vi.fn(),
    deletePolicy: vi.fn(),
  };
  const auth = {
    getUserRole: vi.fn().mockReturnValue("ADMIN"),
    getStoredUser: vi.fn().mockReturnValue({ user_id: 1, role: "ADMIN" }),
  };
  const cdr = { detectChanges: vi.fn() };
  const toastService = { success: vi.fn(), error: vi.fn() };
  return { auditLogService, policyService, auth, cdr, toastService };
}

function makeComponent(mocks: ReturnType<typeof makeMocks>) {
  const c = new DeletedPoliciesModalComponent(
    mocks.auditLogService as any,
    mocks.policyService as any,
    mocks.auth as any,
    mocks.cdr as any,
    mocks.toastService as any,
  );
  c.open = true;
  return c;
}

const entry = (over: Record<string, any> = {}) => ({
  audit_id: 100,
  user_id: 1,
  user_name: "Admin User",
  user_email: "admin@gmail.com",
  user_role: "ADMIN",
  action: "POLICY_DELETE_APPROVED",
  entity_type: "POLICY",
  entity_id: 111,
  description: "Delete approved; policy #111 permanently deleted.",
  created_at: "2026-10-10T13:21:00Z",
  ...over,
});

const requestEntry = (over: Record<string, any> = {}) =>
  entry({
    audit_id: 90,
    user_id: 5,
    user_name: "Gov Official",
    action: "POLICY_DELETE_REQUESTED",
    description: "Delete requested for policy 'River Recovery Mission'.",
    created_at: "2026-10-09T10:00:00Z",
    ...over,
  });

function feedFor(mocks: ReturnType<typeof makeMocks>, rows: any[]) {
  mocks.auditLogService.getAuditLogs.mockImplementation((f: any) =>
    of(rows.filter((r) => r.action === f?.action)),
  );
}

describe("DeletedPoliciesModalComponent (audit-sourced)", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.auditLogService.getAuditLogs.mockReturnValue(of([]));
  });

  it("1. queries deletion + context actions and scopes to the logged-in admin", () => {
    feedFor(mocks, [
      entry({ audit_id: 1 }),
      entry({ audit_id: 2, user_id: 9, user_name: "Other Admin" }),
    ]);
    const c = makeComponent(mocks);
    c.ngOnInit();
    const actions = mocks.auditLogService.getAuditLogs.mock.calls.map(
      (call) => (call[0] as any)?.action,
    );
    expect(actions).toContain("POLICY_DELETE_APPROVED");
    expect(actions).toContain("POLICY_DELETED");
    expect(actions).toContain("POLICY_DELETE_REQUESTED");
    expect(c.records.length).toBe(1);
    expect(c.records[0].auditId).toBe(1);
    expect(c.loading).toBe(false);
  });

  it("2. approved government request shows recovered title, type and requester", () => {
    feedFor(mocks, [entry({ audit_id: 1 }), requestEntry()]);
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.records.length).toBe(1);
    const record = c.records[0];
    expect(record.kind).toBe("REQUEST_APPROVED");
    expect(record.title).toBe("River Recovery Mission");
    expect(c.displayTitle(record)).toBe("River Recovery Mission");
    expect(record.typeLabel).toBe("Government Deletion Request");
    expect(record.requestedByName).toBe("Gov Official");
    expect(record.adminName).toBe("Admin User");
    // 13:21 UTC == 18:51 IST.
    expect(c.formatDateTime(record.deletedAt)).toBe("10 Oct 2026, 06:51 PM");
  });

  it("3. pending DELETE_REQUESTED entries are never listed as deletions", () => {
    // The modal never reads /policies; request events are context only.
    feedFor(mocks, [requestEntry()]);
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.records.length).toBe(0);
  });

  it("4. direct admin deletion recovers title from lifecycle history", () => {
    feedFor(mocks, [
      entry({
        audit_id: 7,
        action: "POLICY_DELETED",
        description: "Policy #111 permanently deleted by administrator.",
      }),
      entry({
        audit_id: 3,
        action: "POLICY_UPDATED",
        description: "Policy 'Solar Rooftop Yojana' updated.",
        created_at: "2026-09-01T00:00:00Z",
      }),
    ]);
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.records.length).toBe(1);
    const record = c.records[0];
    expect(record.kind).toBe("DIRECT");
    expect(record.title).toBe("Solar Rooftop Yojana");
    expect(record.typeLabel).toBe("Direct Admin Deletion");
  });

  it("5. falls back to Policy #ID when no retained title exists", () => {
    feedFor(mocks, [entry({ audit_id: 1 })]);
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.records[0].title).toBeNull();
    expect(c.displayTitle(c.records[0])).toBe("Policy #111");
    expect(c.formatDateTime(null)).toBe("—");
    expect(c.formatDateTime("bad")).toBe("—");
  });

  it("6. three-dot menu opens per row, switches rows, closes on Escape/outside", () => {
    feedFor(mocks, [
      entry({ audit_id: 1, entity_id: 111 }),
      entry({ audit_id: 2, entity_id: 112 }),
    ]);
    const c = makeComponent(mocks);
    c.ngOnInit();
    const stop = vi.fn();
    c.toggleMenu(c.records[0], { stopPropagation: stop } as any);
    expect(c.menuOpenId).toBe(1);
    expect(c.menuOpenRecord?.policyId).toBe(111);
    expect(c.menuStyle).not.toBeNull();
    c.toggleMenu(c.records[0], { stopPropagation: stop } as any);
    expect(c.menuOpenId).toBeNull();
    c.toggleMenu(c.records[0], { stopPropagation: stop } as any);
    c.toggleMenu(c.records[1], { stopPropagation: stop } as any);
    expect(c.menuOpenId).toBe(2);
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.onEscapeKey();
    expect(c.menuOpenId).toBeNull();
    expect(emitted).toEqual([]);
    c.toggleMenu(c.records[0], { stopPropagation: stop } as any);
    c.onDocumentClick({ target: document.createElement("div") } as any);
    expect(c.menuOpenId).toBeNull();
  });

  it("7. View Policy shows retained details read-only, closes cleanly", () => {
    feedFor(mocks, [entry({ audit_id: 1 }), requestEntry()]);
    const c = makeComponent(mocks);
    c.ngOnInit();
    const record = c.records[0];
    c.toggleMenu(record, { stopPropagation: vi.fn() } as any);
    c.viewRecord(record);
    expect(c.menuOpenId).toBeNull();
    expect(c.infoOpen).toBe(true);
    expect(c.infoMessage).toContain("River Recovery Mission");
    expect(c.infoMessage).toContain("111");
    expect(c.infoMessage).toContain("Admin User");
    expect(c.infoMessage).toContain("Government Deletion Request");
    c.onEscapeKey();
    expect(c.infoOpen).toBe(false);
    expect(c.open).toBe(true);
  });

  it("8. Restore calls the real workflow endpoint and surfaces the backend error", () => {
    feedFor(mocks, [entry({ audit_id: 1 }), requestEntry()]);
    mocks.policyService.rejectDelete.mockReturnValue(
      throwError(() => ({ status: 404, error: { detail: "Policy not found." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openRestoreModal(c.records[0]);
    expect(c.confirmModalOpen).toBe(true);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.rejectDelete).toHaveBeenCalledWith(111);
    expect(mocks.policyService.restore).not.toHaveBeenCalled();
    expect(c.confirmErrorMessage).toBe("Policy not found.");
    expect(c.errorMessage).toBe("Policy not found.");
    expect(c.records.length).toBe(1);
    c.onConfirmModalCancelled();
    expect(c.confirmModalOpen).toBe(false);
  });

  it("9. Direct-deletion restore uses the restore endpoint; delete uses direct delete", () => {
    feedFor(mocks, [
      entry({ audit_id: 7, action: "POLICY_DELETED" }),
    ]);
    mocks.policyService.restore.mockReturnValue(
      throwError(() => ({ status: 404, error: { detail: "Policy not found." } })),
    );
    mocks.policyService.deletePolicy.mockReturnValue(
      throwError(() => ({ status: 404, error: { detail: "Policy not found." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openRestoreModal(c.records[0]);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.restore).toHaveBeenCalledWith(111);
    expect(c.confirmErrorMessage).toBe("Policy not found.");
    c.onConfirmModalCancelled();
    c.openPermanentDeleteModal(c.records[0]);
    expect(c.confirmVariant).toBe("danger");
    expect(c.confirmMessage).toMatch(/irreversible/i);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.deletePolicy).toHaveBeenCalledWith(111);
    expect(mocks.policyService.approveDelete).not.toHaveBeenCalled();
    expect(c.confirmErrorMessage).toBe("Policy not found.");
  });

  it("10. approved-flow permanent delete uses approve-delete; success refreshes", () => {
    feedFor(mocks, [entry({ audit_id: 1 }), requestEntry()]);
    mocks.policyService.approveDelete.mockReturnValue(of({ message: "gone" }));
    const c = makeComponent(mocks);
    c.ngOnInit();
    const changed: string[] = [];
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openPermanentDeleteModal(c.records[0]);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.approveDelete).toHaveBeenCalledWith(111);
    expect(mocks.policyService.deletePolicy).not.toHaveBeenCalled();
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.toastService.success).toHaveBeenCalled();
    expect(changed).toEqual(["changed"]);
    // One reload per mutation success (2 actions × 6 feeds).
    expect(mocks.auditLogService.getAuditLogs.mock.calls.length).toBeGreaterThan(6);
  });

  it("11. duplicate confirm clicks do not fire duplicate requests", () => {
    feedFor(mocks, [entry({ audit_id: 1 })]);
    mocks.policyService.rejectDelete.mockReturnValue(of({}));
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openRestoreModal(c.records[0]);
    c.confirmLoading = true;
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.rejectDelete).not.toHaveBeenCalled();
  });

  it("12. search finds records by title, ID, admin or description", () => {
    feedFor(mocks, [
      entry({ audit_id: 1, entity_id: 111 }),
      entry({ audit_id: 2, entity_id: 222 }),
      requestEntry({ audit_id: 3, entity_id: 111 }),
    ]);
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.searchText = "river";
    expect(c.filteredRecords.length).toBe(1);
    c.searchText = "222";
    expect(c.filteredRecords.length).toBe(1);
    expect(c.filteredRecords[0].policyId).toBe(222);
    c.searchText = "admin user";
    expect(c.filteredRecords.length).toBe(2);
  });
});
