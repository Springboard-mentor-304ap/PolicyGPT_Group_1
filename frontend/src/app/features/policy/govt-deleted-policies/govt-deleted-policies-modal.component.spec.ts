import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { GovtDeletedPoliciesModalComponent } from "./govt-deleted-policies-modal.component";

function makeMocks() {
  const policyService = {
    clearCache: vi.fn(),
    getDeletedPolicies: vi.fn(),
  };
  const cdr = { detectChanges: vi.fn() };
  const toastService = { success: vi.fn(), error: vi.fn() };
  return { policyService, cdr, toastService };
}

function makeComponent(mocks: ReturnType<typeof makeMocks>) {
  const c = new GovtDeletedPoliciesModalComponent(
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

describe("GovtDeletedPoliciesModalComponent (read-only trash)", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([])),
    );
  });

  it("1. loads the official's trash from the trash API", () => {
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
      of(listResponse([row({ title: "  " })])),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.displayTitle(c.records[0])).toBe("Title unavailable");
    expect(c.filteredSortedRecords[0]).toBeTruthy();
  });

  it("3. exposes no restore or permanent-delete actions", () => {
    const c = makeComponent(mocks);
    expect((c as any).openRestoreModal).toBeUndefined();
    expect((c as any).openPermanentDeleteModal).toBeUndefined();
    expect((c as any).permanentDeletePolicy).toBeUndefined();
    expect((c as any).restore).toBeUndefined();
  });

  it("4. filters by policy name search", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(listResponse([row(), row({ policy_id: 31, title: "Forest cover policy" })])),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.searchText = "forest";
    expect(c.filteredSortedRecords.length).toBe(1);
    expect(c.filteredSortedRecords[0].policy_id).toBe(31);
  });

  it("5. sorts by policy name and deletion date", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(
        listResponse([
          row({ policy_id: 1, title: "Beta policy", deleted_at: "2026-10-09T10:00:00Z" }),
          row({ policy_id: 2, title: "Alpha policy", deleted_at: "2026-10-10T10:00:00Z" }),
        ]),
      ),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.sortMode = "newest";
    expect(c.filteredSortedRecords.map((r) => r.policy_id)).toEqual([2, 1]);
    c.sortMode = "oldest";
    expect(c.filteredSortedRecords.map((r) => r.policy_id)).toEqual([1, 2]);
    c.sortMode = "name-asc";
    expect(c.filteredSortedRecords.map((r) => r.policy_id)).toEqual([2, 1]);
    c.sortMode = "name-desc";
    expect(c.filteredSortedRecords.map((r) => r.policy_id)).toEqual([1, 2]);
  });

  it("6. view details shows creator, deleter, timestamp, and reason", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      of(
        listResponse([
          row({ delete_reason: "Duplicate entry", delete_requested_by: 2, requested_by_name: "Gov Official", delete_requested_at: "2026-10-09T09:00:00Z" }),
        ]),
      ),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.viewRecord(c.records[0]);
    expect(c.infoOpen).toBe(true);
    const labels = c.infoDetails.map((d) => d.label);
    expect(labels).toContain("Policy");
    expect(labels).toContain("Status at deletion");
    expect(labels).toContain("Created By");
    expect(labels).toContain("Deleted By");
    expect(labels).toContain("Deleted At");
    expect(labels).toContain("Deletion Reason");
  });

  it("7. surfaces load failures without listing rows", () => {
    mocks.policyService.getDeletedPolicies.mockReturnValue(
      throwError(() => ({ status: 0 })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.records).toEqual([]);
    expect(c.loading).toBe(false);
    expect(c.errorMessage).toBeTruthy();
  });
});
