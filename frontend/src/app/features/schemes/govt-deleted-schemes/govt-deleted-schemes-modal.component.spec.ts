import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";
import { GovtDeletedSchemesModalComponent } from "./govt-deleted-schemes-modal.component";

function makeMocks() {
  const schemeService = {
    clearCache: vi.fn(),
    getDeletedSchemes: vi.fn(),
  };
  const cdr = { detectChanges: vi.fn() };
  const toastService = { success: vi.fn(), error: vi.fn() };
  return { schemeService, cdr, toastService };
}

function makeComponent(mocks: ReturnType<typeof makeMocks>) {
  const c = new GovtDeletedSchemesModalComponent(
    mocks.schemeService as any,
    mocks.cdr as any,
    mocks.toastService as any,
  );
  c.open = true;
  return c;
}

const row = (over: Record<string, any> = {}) => ({
  scheme_id: 30,
  name: "Draft water scheme",
  description: "Needs review",
  category: "Water",
  ministry: "MoJS",
  department: "Dept",
  state: "State",
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

const listResponse = (schemes: any[]) => ({
  total: schemes.length,
  page: 1,
  limit: 100,
  pages: 1,
  schemes,
});

describe("GovtDeletedSchemesModalComponent (read-only trash)", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.schemeService.getDeletedSchemes.mockReturnValue(
      of(listResponse([])),
    );
  });

  it("1. loads the official's trash from the trash API", () => {
    mocks.schemeService.getDeletedSchemes.mockReturnValue(
      of(listResponse([row(), row({ scheme_id: 31 })])),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(mocks.schemeService.getDeletedSchemes).toHaveBeenCalledWith(
      1,
      100,
    );
    expect(c.records.length).toBe(2);
    expect(c.loading).toBe(false);
    expect(c.errorMessage).toBe("");
  });

  it("2. shows real titles and falls back to Title unavailable", () => {
    mocks.schemeService.getDeletedSchemes.mockReturnValue(
      of(listResponse([row({ name: "  " })])),
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
    expect((c as any).permanentDeleteScheme).toBeUndefined();
    expect((c as any).restore).toBeUndefined();
  });

  it("4. filters by scheme name search", () => {
    mocks.schemeService.getDeletedSchemes.mockReturnValue(
      of(listResponse([row(), row({ scheme_id: 31, name: "Forest cover scheme" })])),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.searchText = "forest";
    expect(c.filteredSortedRecords.length).toBe(1);
    expect(c.filteredSortedRecords[0].scheme_id).toBe(31);
  });

  it("5. sorts by scheme name and deletion date", () => {
    mocks.schemeService.getDeletedSchemes.mockReturnValue(
      of(
        listResponse([
          row({ scheme_id: 1, name: "Beta scheme", deleted_at: "2026-10-09T10:00:00Z" }),
          row({ scheme_id: 2, name: "Alpha scheme", deleted_at: "2026-10-10T10:00:00Z" }),
        ]),
      ),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.sortMode = "newest";
    expect(c.filteredSortedRecords.map((r) => r.scheme_id)).toEqual([2, 1]);
    c.sortMode = "oldest";
    expect(c.filteredSortedRecords.map((r) => r.scheme_id)).toEqual([1, 2]);
    c.sortMode = "name-asc";
    expect(c.filteredSortedRecords.map((r) => r.scheme_id)).toEqual([2, 1]);
    c.sortMode = "name-desc";
    expect(c.filteredSortedRecords.map((r) => r.scheme_id)).toEqual([1, 2]);
  });

  it("6. view details shows creator, deleter, timestamp, and reason", () => {
    mocks.schemeService.getDeletedSchemes.mockReturnValue(
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
    expect(labels).toContain("Scheme");
    expect(labels).toContain("Status at deletion");
    expect(labels).toContain("Created By");
    expect(labels).toContain("Deleted By");
    expect(labels).toContain("Deleted At");
    expect(labels).toContain("Deletion Reason");
  });

  it("7. surfaces load failures without listing rows", () => {
    mocks.schemeService.getDeletedSchemes.mockReturnValue(
      throwError(() => ({ status: 0 })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.records).toEqual([]);
    expect(c.loading).toBe(false);
    expect(c.errorMessage).toBeTruthy();
  });
});
