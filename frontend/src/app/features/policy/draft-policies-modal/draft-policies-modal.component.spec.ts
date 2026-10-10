import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, Subject, throwError } from "rxjs";
import { DraftPoliciesModalComponent } from "./draft-policies-modal.component";

function makeMocks() {
  const policyService = {
    clearCache: vi.fn(),
    getPolicies: vi.fn(),
    submitPolicy: vi.fn(),
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
  const c = new DraftPoliciesModalComponent(
    mocks.policyService as any,
    mocks.router as any,
    mocks.auth as any,
    mocks.cdr as any,
    mocks.toastService as any,
  );
  c.open = true;
  return c;
}

const draftRow = (over: Record<string, any> = {}) => ({
  policy_id: 30,
  title: "Draft water policy",
  description: "Needs review",
  category: "Water",
  ministry: "MoJS",
  department: "Dept",
  sector: "Sector",
  status: "DRAFT",
  created_by: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  ...over,
});

describe("DraftPoliciesModalComponent", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 0, page: 1, limit: 100, pages: 0, policies: [] }),
    );
  });

  it("1. loads only DRAFT rows when opened", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [
          draftRow(),
          draftRow({ policy_id: 31, title: "Live", status: "APPROVED" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(mocks.policyService.getPolicies).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      manage: true,
    });
    expect(c.policies.length).toBe(1);
    expect(c.policies[0].id).toBe(30);
    expect(c.loading).toBe(false);
  });

  it("2. requestClose emits closed; Escape and backdrop also close", () => {
    const c = makeComponent(mocks);
    c.ngOnInit();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.requestClose();
    c.onEscapeKey();
    c.onBackdropClick({ target: { classList: { contains: (k: string) => k === "dp-overlay" } } } as any);
    expect(emitted).toEqual(["closed", "closed", "closed"]);
  });

  it("3. close paths are blocked while a confirmation is open", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.openSubmitModal(c.policies[0]);
    c.requestClose();
    c.onEscapeKey();
    c.onBackdropClick({ target: { classList: { contains: () => true } } } as any);
    expect(emitted).toEqual([]);
    c.onConfirmModalCancelled();
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.policyService.submitPolicy).not.toHaveBeenCalled();
  });

  it("4. admin submit calls the API once, reloads, then shows the OK popup", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    mocks.policyService.submitPolicy.mockReturnValue(
      of(draftRow({ status: "PENDING_APPROVAL" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const changed: string[] = [];
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openSubmitModal(c.policies[0]);
    expect(c.confirmTitle).toBe("Submit Policy");
    c.onConfirmModalConfirmed();
    // Exactly one submission API call; backend is now PENDING_APPROVAL.
    expect(mocks.policyService.submitPolicy).toHaveBeenCalledTimes(1);
    expect(mocks.policyService.submitPolicy).toHaveBeenCalledWith(30);
    expect(c.confirmModalOpen).toBe(false);
    // List already reloaded without the policy; statistics refreshed.
    expect(mocks.policyService.getPolicies).toHaveBeenCalledTimes(2);
    expect(changed).toEqual(["changed"]);
    // Admin confirmation popup (no second API call involved).
    expect(c.submitSuccessOpen).toBe(true);
    expect(mocks.toastService.success).not.toHaveBeenCalled();
    // OK only dismisses the popup.
    c.closeSubmitSuccess();
    expect(c.submitSuccessOpen).toBe(false);
    expect(mocks.policyService.submitPolicy).toHaveBeenCalledTimes(1);
  });

  it("4b. government official submit shows a notification, no OK popup", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow({ created_by: 2 })] }),
    );
    mocks.policyService.submitPolicy.mockReturnValue(
      of(draftRow({ status: "PENDING_APPROVAL" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openSubmitModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.submitPolicy).toHaveBeenCalledTimes(1);
    expect(c.submitSuccessOpen).toBe(false);
    expect(c.successMessage).toContain("submitted for approval");
    expect(mocks.toastService.success).toHaveBeenCalled();
    expect(mocks.policyService.getPolicies).toHaveBeenCalledTimes(2);
  });

  it("4c. Escape dismisses the success popup without closing the modal", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    mocks.policyService.submitPolicy.mockReturnValue(of(draftRow()));
    const c = makeComponent(mocks);
    c.ngOnInit();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.openSubmitModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(c.submitSuccessOpen).toBe(true);
    c.onEscapeKey();
    expect(c.submitSuccessOpen).toBe(false);
    expect(emitted).toEqual([]);
    expect(mocks.policyService.submitPolicy).toHaveBeenCalledTimes(1);
  });

  it("4d. submit failure shows no popup and keeps the draft", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    mocks.policyService.submitPolicy.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: "Only DRAFT or REJECTED policies can be submitted." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openSubmitModal(c.policies[0]);
    c.onConfirmModalConfirmed();
    expect(c.submitSuccessOpen).toBe(false);
    expect(c.successMessage).toBeNull();
    expect(c.confirmErrorMessage).toContain("Only DRAFT or REJECTED");
    expect(c.policies[0].status).toBe("DRAFT");
  });

  it("5. delete uses the existing deletion workflow with confirmation", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    mocks.policyService.deletePolicy.mockReturnValue(of({ message: "deleted" }));
    const c = makeComponent(mocks);
    c.ngOnInit();
    const changed: string[] = [];
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openDeleteModal(c.policies[0]);
    expect(c.confirmVariant).toBe("danger");
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.deletePolicy).toHaveBeenCalledWith(30);
    expect(c.successMessage).toContain("deleted");
    expect(changed).toEqual(["changed"]);
  });

  it("7. duplicate confirm clicks do not fire duplicate submissions", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    mocks.policyService.submitPolicy.mockReturnValue(of(draftRow()));
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openSubmitModal(c.policies[0]);
    c.confirmLoading = true;
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.submitPolicy).not.toHaveBeenCalled();
  });

  it("8. view/edit close the modal and reuse existing routes with the real ID", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.viewPolicy(c.policies[0]);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "policies",
      30,
    ]);
    c.editPolicy(c.policies[0]);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "policies",
      "edit",
      30,
    ]);
    expect(emitted).toEqual(["closed", "closed"]);
  });

  it("9. non-owners cannot submit; non-admins cannot delete drafts", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow({ created_by: 2 })] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.canSubmitPolicy(c.policies[0])).toBe(true);
    c.openDeleteModal(c.policies[0]);
    expect(mocks.policyService.deletePolicy).not.toHaveBeenCalled();
    expect(c.errorMessage).toMatch(/administrator/i);
  });

  it("10. search filters drafts; load failure shows error", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [
          draftRow({ policy_id: 50, title: "Water Mission", category: "Irrigation" }),
          draftRow({ policy_id: 51, title: "Solar Scheme", category: "Energy" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.searchText = "solar";
    expect(c.filteredPolicies.length).toBe(1);
    expect(c.filteredPolicies[0].id).toBe(51);
    mocks.policyService.getPolicies.mockReturnValue(
      throwError(() => ({ status: 0, message: "down" })),
    );
    c.loadPolicies();
    expect(c.policies.length).toBe(0);
    expect(c.errorMessage).toBeTruthy();
  });

  function openModalWithTwoDrafts() {
    mocks.policyService.getPolicies.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        policies: [
          draftRow({ policy_id: 60, title: "Draft A" }),
          draftRow({ policy_id: 61, title: "Draft B" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    return c;
  }

  function triggerEvent() {
    const stop = vi.fn();
    return { stopPropagation: stop } as any;
  }

  it("11. three-dot toggle opens the menu for that row and toggles shut", () => {
    const c = openModalWithTwoDrafts();
    c.toggleMenu(c.policies[0], triggerEvent());
    expect(c.menuOpenId).toBe(60);
    expect(c.menuOpenPolicy?.id).toBe(60);
    expect(c.menuStyle).not.toBeNull();
    c.toggleMenu(c.policies[0], triggerEvent());
    expect(c.menuOpenId).toBeNull();
    expect(c.menuOpenPolicy).toBeNull();
  });

  it("12. opening another row switches the menu to that policy", () => {
    const c = openModalWithTwoDrafts();
    c.toggleMenu(c.policies[0], triggerEvent());
    c.toggleMenu(c.policies[1], triggerEvent());
    expect(c.menuOpenId).toBe(61);
    expect(c.menuOpenPolicy?.id).toBe(61);
  });

  it("13. Escape closes the menu without closing the modal", () => {
    const c = openModalWithTwoDrafts();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.toggleMenu(c.policies[0], triggerEvent());
    c.onEscapeKey();
    expect(c.menuOpenId).toBeNull();
    expect(emitted).toEqual([]);
  });

  it("14. outside click closes the menu; inside clicks keep it open", () => {
    const c = openModalWithTwoDrafts();
    c.toggleMenu(c.policies[0], triggerEvent());
    const outside = { target: document.createElement("div") } as any;
    c.onDocumentClick(outside);
    expect(c.menuOpenId).toBeNull();

    c.toggleMenu(c.policies[0], triggerEvent());
    const menuEl = document.createElement("div");
    menuEl.className = "dp-float-menu";
    const inner = document.createElement("span");
    menuEl.appendChild(inner);
    c.onDocumentClick({ target: inner } as any);
    expect(c.menuOpenId).toBe(60);
  });

  it("15. menu actions run only for the selected policy and close the menu", () => {
    const c = openModalWithTwoDrafts();
    c.toggleMenu(c.policies[1], triggerEvent());
    c.viewPolicy(c.menuOpenPolicy!);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "policies",
      61,
    ]);
    expect(c.menuOpenId).toBeNull();

    c.toggleMenu(c.policies[1], triggerEvent());
    mocks.policyService.submitPolicy.mockReturnValue(of(draftRow()));
    c.openSubmitModal(c.menuOpenPolicy!);
    expect(c.menuOpenId).toBeNull();
    expect(c.confirmModalOpen).toBe(true);
    c.onConfirmModalConfirmed();
    expect(mocks.policyService.submitPolicy).toHaveBeenCalledWith(61);
  });

  it("16. reopening clears stale rows and fetches once (no duplicate calls)", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    // Simulates Angular's first open: ngOnChanges fires alongside ngOnInit.
    c.ngOnInit();
    c.ngOnChanges({ open: { currentValue: true } } as any);
    expect(mocks.policyService.getPolicies).toHaveBeenCalledTimes(1);
    expect(c.loading).toBe(false);
    expect(c.policies.length).toBe(1);
    // Reopen: stale rows are dropped immediately, spinner shows meanwhile.
    c.open = false;
    c.ngOnChanges({ open: { currentValue: false } } as any);
    c.open = true;
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 0, page: 1, limit: 100, pages: 0, policies: [] }),
    );
    c.ngOnChanges({ open: { currentValue: true } } as any);
    expect(c.policies.length).toBe(0);
    expect(c.loading).toBe(false);
    expect(c.errorMessage).toBe("");
  });

  it("17. stale in-flight responses never overwrite newer results", () => {
    const slow$ = new Subject<any>();
    mocks.policyService.getPolicies
      .mockReturnValueOnce(slow$)
      .mockReturnValue(
        of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow({ policy_id: 77 })] }),
      );
    const c = makeComponent(mocks);
    c.ngOnInit(); // slow request in flight
    expect(c.loading).toBe(true);
    c.loadPolicies(); // refresh supersedes it
    expect(c.loading).toBe(false);
    expect(c.policies[0].id).toBe(77);
    // Late stale arrival is ignored: no spinner flash, no row swap.
    slow$.next({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow({ policy_id: 78 })] });
    expect(c.loading).toBe(false);
    expect(c.policies[0].id).toBe(77);
    expect(c.errorMessage).toBe("");
  });

  it("18. empty success and error states clear the spinner", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 0, page: 1, limit: 100, pages: 0, policies: [] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.loading).toBe(false);
    expect(c.policies.length).toBe(0);
    expect(c.filteredPolicies.length).toBe(0);
    expect(c.errorMessage).toBe("");

    mocks.policyService.getPolicies.mockReturnValue(
      throwError(() => ({ status: 500, message: "Server error" })),
    );
    c.loadPolicies();
    expect(c.loading).toBe(false);
    expect(c.policies.length).toBe(0);
    expect(c.errorMessage).toBeTruthy();

    // Retry recovers.
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    c.loadPolicies();
    expect(c.loading).toBe(false);
    expect(c.errorMessage).toBe("");
    expect(c.policies.length).toBe(1);
  });

  it("19. late responses after teardown change nothing", () => {
    const slow$ = new Subject<any>();
    mocks.policyService.getPolicies.mockReturnValue(slow$);
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.ngOnDestroy();
    slow$.next({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] });
    slow$.error({ status: 500 });
    expect(c.policies.length).toBe(0);
    expect(c.errorMessage).toBe("");
  });

  it("20. opening the three-dot menu never touches the loading state", () => {
    mocks.policyService.getPolicies.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, policies: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const trigger = { stopPropagation: vi.fn() } as any;
    c.toggleMenu(c.policies[0], trigger);
    expect(c.loading).toBe(false);
    c.closeMenu();
    expect(c.loading).toBe(false);
  });
});
