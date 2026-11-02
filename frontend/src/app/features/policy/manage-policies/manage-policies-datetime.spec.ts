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

// 13:21 UTC == 18:51 IST (Asia/Kolkata, UTC+5:30, no DST).
const created = "2026-10-10T13:21:00Z";
// 13:25 UTC == 18:55 IST.
const updated = "2026-10-10T13:25:00Z";

const row = (over: Record<string, any> = {}) => ({
  policy_id: 1,
  title: "Policy A",
  description: "Desc",
  category: "Health",
  status: "APPROVED",
  created_by: 1,
  created_at: created,
  updated_at: updated,
  ...over,
});

describe("ManagePolicies Date & Time column", () => {
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

  it("1. formats backend UTC timestamps in Asia/Kolkata (IST)", () => {
    const c = makeComponent(mocks);
    expect(c.formatDateTime(created)).toBe("10 Oct 2026, 06:51 PM");
    expect(c.formatDateTime(updated)).toBe("10 Oct 2026, 06:55 PM");
  });

  it("2. shows em dash for missing or invalid timestamps", () => {
    const c = makeComponent(mocks);
    expect(c.formatDateTime(null)).toBe("—");
    expect(c.formatDateTime(undefined)).toBe("—");
    expect(c.formatDateTime("")).toBe("—");
    expect(c.formatDateTime("   ")).toBe("—");
    expect(c.formatDateTime("not-a-date")).toBe("—");
  });

  it("3. shows Updated only when it differs from Created", () => {
    const c = makeComponent(mocks);
    expect(
      c.hasDistinctUpdate({ id: 1, createdAt: created, updatedAt: updated } as any),
    ).toBe(true);
    // Identical timestamps -> Created line only.
    expect(
      c.hasDistinctUpdate({ id: 1, createdAt: created, updatedAt: created } as any),
    ).toBe(false);
    // Missing / invalid timestamps -> no Updated line.
    expect(c.hasDistinctUpdate({ id: 1, createdAt: created } as any)).toBe(false);
    expect(c.hasDistinctUpdate({ id: 1, updatedAt: updated } as any)).toBe(false);
    expect(
      c.hasDistinctUpdate({ id: 1, createdAt: "bad", updatedAt: updated } as any),
    ).toBe(false);
    expect(
      c.hasDistinctUpdate({ id: 1, createdAt: created, updatedAt: "bad" } as any),
    ).toBe(false);
  });

  it("4. maps created_at/updated_at from the backend onto table rows", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [
          row({ policy_id: 1 }),
          row({ policy_id: 2, created_at: null, updated_at: null }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.policies[0].createdAt).toBe(created);
    expect(c.policies[0].updatedAt).toBe(updated);
    expect(c.formatDateTime(c.policies[0].createdAt)).toBe(
      "10 Oct 2026, 06:51 PM",
    );
    // Missing backend timestamps stay null and render as em dash.
    expect(c.policies[1].createdAt).toBeNull();
    expect(c.formatDateTime(c.policies[1].createdAt)).toBe("—");
    expect(c.hasDistinctUpdate(c.policies[1])).toBe(false);
  });

  it("5. paginated rows keep their timestamps", () => {
    const policies = Array.from({ length: 7 }, (_, i) =>
      row({ policy_id: i + 1, title: `Policy ${i + 1}` }),
    );
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 7, page: 1, limit: 100, pages: 1, policies }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.pageSize = 6;
    expect(c.paginatedPolicies.length).toBe(6);
    expect(
      c.paginatedPolicies.every((p) => p.createdAt === created),
    ).toBe(true);
    c.goToPage(2);
    expect(c.paginatedPolicies.length).toBe(1);
    expect(c.paginatedPolicies[0].createdAt).toBe(created);
    expect(c.formatDateTime(c.paginatedPolicies[0].updatedAt)).toBe(
      "10 Oct 2026, 06:55 PM",
    );
  });
});
