import { describe, it, expect, vi, beforeEach } from "vitest";
import { of } from "rxjs";
import { ManagePoliciesComponent } from "./manage-policies.component";

function makeMocks() {
  const policyService = {
    clearCache: vi.fn(),
    getPolicies: vi.fn(),
    getPolicyStatistics: vi.fn(),
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

const row = (over: Record<string, any> = {}) => ({
  policy_id: 1,
  title: "Policy",
  description: "Desc",
  category: "Health",
  ministry: "MoH",
  department: "Dept",
  sector: "Sector",
  status: "APPROVED",
  created_by: 2,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("ManagePolicies sort + export", () => {
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

  it("1. sorts by updated_at descending across all pages on load", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 3,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [
          row({ policy_id: 1, updated_at: "2026-01-01T00:00:00Z" }),
          row({ policy_id: 2, updated_at: "2026-03-01T00:00:00Z" }),
          row({ policy_id: 3, updated_at: "2026-02-01T00:00:00Z" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.policies.map((p) => p.id)).toEqual([2, 3, 1]);
    // Pagination follows the global order, not per-page order.
    c.pageSize = 2;
    expect(c.paginatedPolicies.map((p) => p.id)).toEqual([2, 3]);
    c.goToPage(2);
    expect(c.paginatedPolicies.map((p) => p.id)).toEqual([1]);
  });

  it("2. falls back to created_at and parks bad timestamps last", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 3,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [
          row({ policy_id: 1, updated_at: null, created_at: null }),
          row({ policy_id: 2, updated_at: null, created_at: "2026-05-01T00:00:00Z" }),
          row({ policy_id: 3, updated_at: "not-a-date", created_at: "2026-04-01T00:00:00Z" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    // created_at fallback decides; unparseable updated_at falls back too.
    expect(c.policies.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it("3. workflow updates re-sort newest-first", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [
          row({ policy_id: 1, updated_at: "2026-06-01T00:00:00Z" }),
          row({ policy_id: 2, updated_at: "2026-01-01T00:00:00Z" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.policies[0].id).toBe(1);
    (c as any).applyPolicyUpdate(row({ policy_id: 2, updated_at: "2026-07-01T00:00:00Z" }));
    expect(c.policies.map((p) => p.id)).toEqual([2, 1]);
    expect(c.policies[0].status).toBe("APPROVED");
  });

  it("4. export menu toggles, closes on select/Escape, blocks while busy", () => {
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.exportMenuOpen).toBe(false);
    c.toggleExportMenu(new MouseEvent("click"));
    expect(c.exportMenuOpen).toBe(true);
    c.toggleExportMenu(new MouseEvent("click"));
    expect(c.exportMenuOpen).toBe(false);
    c.toggleExportMenu(new MouseEvent("click"));
    c.onEscapeKey();
    expect(c.exportMenuOpen).toBe(false);
    c.exporting = true;
    c.toggleExportMenu(new MouseEvent("click"));
    expect(c.exportMenuOpen).toBe(false);
    c.exporting = false;
  });

  it("5. export rows cover every filtered record with labels + IST dates", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 3,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [
          row({ policy_id: 1, title: "Alpha", status: "APPROVED", updated_at: "2026-10-10T13:21:00Z" }),
          row({ policy_id: 2, title: "Beta", status: "DRAFT", ministry: "", department: "" }),
          row({ policy_id: 3, title: "Gamma", status: "PENDING_APPROVAL" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.pageSize = 1; // only one row visible per page…
    const rows: string[][] = (c as any).exportRows();
    // …yet the export spans all matching records.
    expect(rows.length).toBe(3);
    expect(rows[0][0]).toBe("1");
    expect(rows[0][1]).toBe("Alpha");
    expect(rows[0][5]).toBe("Approved");
    expect(rows[0][6]).toBe("01 Jan 2026, 05:30 AM");
    expect(rows[0][7]).toBe("10 Oct 2026, 06:51 PM");
    expect(rows[1][3]).toBe("—");
    expect(rows[2][5]).toBe("Pending Approval");
  });

  it("6. pdf/excel exports settle without blocking and close the menu", async () => {    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [row()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.toggleExportMenu(new MouseEvent("click"));
    await c.exportPdf();
    expect(c.exporting).toBe(false);
    expect(c.exportMenuOpen).toBe(false);
    c.toggleExportMenu(new MouseEvent("click"));
    await c.exportExcel();
    expect(c.exporting).toBe(false);
    expect(c.exportMenuOpen).toBe(false);
    // Exactly one feedback toast per export (success or error, never both paths hanging).
    expect(mocks.toastService.success.mock.calls.length + mocks.toastService.error.mock.calls.length).toBe(2);
  });
});

describe("ManagePolicies Sort By filter", () => {
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

  function loadTitles(titles: string[], stamps: Record<string, { c: string; u: string | null }>) {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: titles.length,
        page: 1,
        limit: 100,
        pages: 1,
        policies: titles.map((title, i) =>
          row({
            policy_id: i + 1,
            title,
            created_at: stamps[title].c,
            updated_at: stamps[title].u,
          }),
        ),
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    return c;
  }

  const stamps = {
    Alpha: { c: "2026-01-10T00:00:00Z", u: "2026-02-10T00:00:00Z" },
    beta: { c: "2026-03-10T00:00:00Z", u: null },
    Gamma: { c: "2026-04-10T00:00:00Z", u: "2026-01-20T00:00:00Z" },
  };

  it("7. defaults to Latest using updated_at with created_at fallback", () => {
    const c = loadTitles(["Alpha", "beta", "Gamma"], stamps);
    expect(c.selectedSort).toBe("latest");
    // beta (Mar created) > Alpha (Feb updated) > Gamma (Jan updated).
    expect(c.policies.map((p) => p.title)).toEqual(["beta", "Alpha", "Gamma"]);
  });

  it("8. Ascending and Descending sort titles A-Z / Z-A", () => {
    const c = loadTitles(["Gamma", "Alpha", "beta"], stamps);
    c.selectedSort = "ascending";
    c.applyFilters();
    expect(c.policies.map((p) => p.title)).toEqual(["Alpha", "beta", "Gamma"]);
    c.selectedSort = "descending";
    c.applyFilters();
    expect(c.policies.map((p) => p.title)).toEqual(["Gamma", "beta", "Alpha"]);
  });

  it("9. Oldest is the mirror of Latest with deterministic ties", () => {
    const c = loadTitles(["Alpha", "beta", "Gamma"], stamps);
    c.selectedSort = "oldest";
    c.applyFilters();
    expect(c.policies.map((p) => p.title)).toEqual(["Gamma", "Alpha", "beta"]);

    // Identical timestamps fall back to id order in both directions.
    const tied = loadTitles(["Zulu", "Mike"], {
      Zulu: { c: "2026-01-01T00:00:00Z", u: "2026-05-01T00:00:00Z" },
      Mike: { c: "2026-01-01T00:00:00Z", u: "2026-05-01T00:00:00Z" },
    });
    expect(tied.policies.map((p) => p.id)).toEqual([1, 2]);
    tied.selectedSort = "oldest";
    tied.applyFilters();
    expect(tied.policies.map((p) => p.id)).toEqual([1, 2]);
  });

  it("10. sort composes with search, status filter and pagination", () => {
    const c = loadTitles(["Alpha", "beta", "Gamma"], stamps);
    c.selectedSort = "ascending";
    c.searchText = "a";
    c.applyFilters();
    expect(c.filteredPolicies.map((p) => p.title)).toEqual(["Alpha", "beta", "Gamma"]);
    c.pageSize = 2;
    expect(c.paginatedPolicies.map((p) => p.title)).toEqual(["Alpha", "beta"]);
    // Sort selection resets to page 1 and persists across pages.
    c.goToPage(2);
    c.selectedSort = "descending";
    c.applyFilters();
    expect(c.currentPage).toBe(1);
    expect(c.paginatedPolicies.map((p) => p.title)).toEqual(["Gamma", "beta"]);
    c.goToPage(2);
    expect(c.paginatedPolicies.map((p) => p.title)).toEqual(["Alpha"]);
  });

  it("11. reset restores Latest and missing timestamps never break the table", () => {
    const c = loadTitles(["Alpha", "beta"], stamps);
    c.selectedSort = "ascending";
    c.searchText = "x";
    c.resetFilters();
    expect(c.selectedSort).toBe("latest");
    expect(c.searchText).toBe("");
    expect(c.policies.map((p) => p.title)).toEqual(["beta", "Alpha"]);
  });
});
