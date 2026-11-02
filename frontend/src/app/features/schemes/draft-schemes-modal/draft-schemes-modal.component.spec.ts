import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, Subject, throwError } from "rxjs";
import { DraftSchemesModalComponent } from "./draft-schemes-modal.component";

function makeMocks() {
  const schemeService = {
    clearCache: vi.fn(),
    getSchemes: vi.fn(),
    submitScheme: vi.fn(),
    deleteScheme: vi.fn(),
    requestDeleteScheme: vi.fn(),
  };
  const router = { navigate: vi.fn() };
  const auth = {
    getUserRole: vi.fn().mockReturnValue("ADMIN"),
    getStoredUser: vi.fn().mockReturnValue({ user_id: 1, role: "ADMIN" }),
  };
  const cdr = { detectChanges: vi.fn() };
  const toastService = { success: vi.fn(), error: vi.fn() };
  return { schemeService, router, auth, cdr, toastService };
}

function makeComponent(mocks: ReturnType<typeof makeMocks>) {
  const c = new DraftSchemesModalComponent(
    mocks.schemeService as any,
    mocks.router as any,
    mocks.auth as any,
    mocks.cdr as any,
    mocks.toastService as any,
  );
  c.open = true;
  return c;
}

const draftRow = (over: Record<string, any> = {}) => ({
  scheme_id: 30,
  name: "Draft water scheme",
  description: "Needs review",
  category: "Water",
  ministry: "MoJS",
  department: "Dept",
  state: "State",
  status: "DRAFT",
  created_by: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  ...over,
});

describe("DraftSchemesModalComponent", () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 0, page: 1, limit: 100, pages: 0, schemes: [] }),
    );
  });

  it("1. loads only DRAFT rows when opened", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        schemes: [
          draftRow(),
          draftRow({ scheme_id: 31, name: "Live", status: "APPROVED" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(mocks.schemeService.getSchemes).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      manage: true,
    });
    expect(c.schemes.length).toBe(1);
    expect(c.schemes[0].id).toBe(30);
    expect(c.loading).toBe(false);
  });

  it("1b. draft ownership follows the latest editor, not the creator", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({
        total: 3,
        page: 1,
        limit: 100,
        pages: 1,
        schemes: [
          draftRow({ scheme_id: 30, created_by: 2 }),
          // Created by this official but last saved by the admin.
          draftRow({ scheme_id: 31, name: "Taken", created_by: 2, updated_by: 1 }),
          // Created by another official but last saved by this one.
          draftRow({ scheme_id: 32, name: "Adopted", created_by: 9, updated_by: 2 }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.schemes.map((s) => s.id).sort()).toEqual([30, 32]);
  });

  it("1c. admin sees every draft regardless of editor", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        schemes: [
          draftRow({ scheme_id: 30, created_by: 2, updated_by: 1 }),
          draftRow({ scheme_id: 32, name: "Gov", created_by: 2 }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.schemes.map((s) => s.id).sort()).toEqual([30, 32]);
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
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.openSubmitModal(c.schemes[0]);
    c.requestClose();
    c.onEscapeKey();
    c.onBackdropClick({ target: { classList: { contains: () => true } } } as any);
    expect(emitted).toEqual([]);
    c.onConfirmModalCancelled();
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.schemeService.submitScheme).not.toHaveBeenCalled();
  });

  it("4. admin publish calls the API once then navigates to Manage", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    // Backend direct-approves admin submissions: returned status APPROVED.
    mocks.schemeService.submitScheme.mockReturnValue(
      of(draftRow({ status: "APPROVED" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const closed: string[] = [];
    const changed: string[] = [];
    c.closed.subscribe(() => closed.push("closed"));
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openSubmitModal(c.schemes[0]);
    expect(c.confirmTitle).toBe("Submit Scheme");
    c.onConfirmModalConfirmed();
    // Exactly one submission API call; backend is now APPROVED.
    expect(mocks.schemeService.submitScheme).toHaveBeenCalledTimes(1);
    expect(mocks.schemeService.submitScheme).toHaveBeenCalledWith(30);
    expect(c.confirmModalOpen).toBe(false);
    // No follow-up popup, no modal-list reload: parent refreshes instead.
    expect(mocks.schemeService.getSchemes).toHaveBeenCalledTimes(1);
    expect(mocks.toastService.success).toHaveBeenCalled();
    expect(changed).toEqual(["changed"]);
    expect(closed).toEqual(["closed"]);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "schemes",
      "manage",
    ]);
  });

  it("4a. admin submit returning PENDING still navigates without a popup", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    mocks.schemeService.submitScheme.mockReturnValue(
      of(draftRow({ status: "PENDING_APPROVAL" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const closed: string[] = [];
    c.closed.subscribe(() => closed.push("closed"));
    c.openSubmitModal(c.schemes[0]);
    c.onConfirmModalConfirmed();
    expect(mocks.schemeService.submitScheme).toHaveBeenCalledTimes(1);
    expect(closed).toEqual(["closed"]);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "schemes",
      "manage",
    ]);
  });

  it("4b. gov success navigates to Manage immediately without modal reload", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ created_by: 2 })] }),
    );
    mocks.schemeService.submitScheme.mockReturnValue(
      of(draftRow({ status: "PENDING_APPROVAL" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const closed: string[] = [];
    const changed: string[] = [];
    c.closed.subscribe(() => closed.push("closed"));
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openSubmitModal(c.schemes[0]);
    c.onConfirmModalConfirmed();
    expect(mocks.schemeService.submitScheme).toHaveBeenCalledTimes(1);
    expect(mocks.schemeService.submitScheme).toHaveBeenCalledWith(30);
    // No second popup, no modal-list reload: parent refreshes instead.
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.schemeService.getSchemes).toHaveBeenCalledTimes(1);
    expect(mocks.toastService.success).toHaveBeenCalled();
    expect(changed).toEqual(["changed"]);
    expect(closed).toEqual(["closed"]);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "government",
      "schemes",
      "manage",
    ]);
  });

  it("4e. cancel closes only the confirm popup and stays in the modal", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ created_by: 2 })] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const closed: string[] = [];
    c.closed.subscribe(() => closed.push("closed"));
    c.openSubmitModal(c.schemes[0]);
    expect(c.confirmModalOpen).toBe(true);
    c.onConfirmModalCancelled();
    expect(c.confirmModalOpen).toBe(false);
    expect(closed).toEqual([]);
    expect(mocks.router.navigate).not.toHaveBeenCalled();
    expect(mocks.schemeService.submitScheme).not.toHaveBeenCalled();
    expect(c.open).toBe(true);
    expect(c.schemes[0].status).toBe("DRAFT");
  });

  it("4f. gov submit failure stays in the modal with the backend error", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ created_by: 2 })] }),
    );
    mocks.schemeService.submitScheme.mockReturnValue(
      throwError(() => ({ status: 0, message: "timeout" })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const closed: string[] = [];
    c.closed.subscribe(() => closed.push("closed"));
    c.openSubmitModal(c.schemes[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmLoading).toBe(false);
    expect(c.confirmErrorMessage).toBeTruthy();
    expect(c.errorMessage).toBeTruthy();
    expect(closed).toEqual([]);
    expect(mocks.router.navigate).not.toHaveBeenCalled();
    expect(c.schemes[0].status).toBe("DRAFT");
  });

  it("4c. success closes the confirm dialog with no follow-up popup", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    mocks.schemeService.submitScheme.mockReturnValue(of(draftRow()));
    const c = makeComponent(mocks);
    c.ngOnInit();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.openSubmitModal(c.schemes[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmModalOpen).toBe(false);
    expect(emitted).toEqual(["closed"]);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "schemes",
      "manage",
    ]);
    expect(mocks.schemeService.submitScheme).toHaveBeenCalledTimes(1);
  });

  it("4d. submit failure shows no popup and keeps the draft", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    mocks.schemeService.submitScheme.mockReturnValue(
      throwError(() => ({ status: 400, error: { detail: "Only DRAFT or REJECTED schemes can be submitted." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openSubmitModal(c.schemes[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmModalOpen).toBe(true);
    expect(c.successMessage).toBeNull();
    expect(c.confirmErrorMessage).toContain("Only DRAFT or REJECTED");
    expect(c.schemes[0].status).toBe("DRAFT");
  });

  it("5. delete uses the existing deletion workflow with confirmation", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    mocks.schemeService.deleteScheme.mockReturnValue(of({ message: "deleted" }));
    const c = makeComponent(mocks);
    c.ngOnInit();
    const changed: string[] = [];
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openDeleteModal(c.schemes[0]);
    expect(c.confirmVariant).toBe("danger");
    c.onConfirmModalConfirmed();
    expect(mocks.schemeService.deleteScheme).toHaveBeenCalledWith(30);
    expect(c.successMessage).toContain("moved to Deleted Schemes");
    expect(changed).toEqual(["changed"]);
  });

  it("7. duplicate confirm clicks do not fire duplicate submissions", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    mocks.schemeService.submitScheme.mockReturnValue(of(draftRow()));
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openSubmitModal(c.schemes[0]);
    c.confirmLoading = true;
    c.onConfirmModalConfirmed();
    expect(mocks.schemeService.submitScheme).not.toHaveBeenCalled();
  });

  it("8. view/edit close the modal and reuse existing routes with the real ID", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.viewScheme(c.schemes[0]);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "schemes",
      30,
    ]);
    c.editScheme(c.schemes[0]);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "schemes",
      "edit",
      30,
    ]);
    expect(emitted).toEqual(["closed", "closed"]);
  });

  it("9. gov Delete on own draft opens the direct-delete confirm dialog", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ created_by: 2 })] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openDeleteModal(c.schemes[0]);
    expect(c.confirmModalOpen).toBe(true);
    expect(c.confirmTitle).toBe("Delete Draft Scheme");
    expect(c.confirmMessage).toContain("Draft water scheme");
    expect(c.reasonModalOpen).toBe(false);
    expect(mocks.schemeService.deleteScheme).not.toHaveBeenCalled();
    expect(mocks.schemeService.requestDeleteScheme).not.toHaveBeenCalled();
  });

  it("9b. cancelling the gov delete confirm changes nothing", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ created_by: 2 })] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openDeleteModal(c.schemes[0]);
    c.onConfirmModalCancelled();
    expect(c.confirmModalOpen).toBe(false);
    expect(mocks.schemeService.deleteScheme).not.toHaveBeenCalled();
    expect(mocks.schemeService.requestDeleteScheme).not.toHaveBeenCalled();
    expect(c.schemes[0].status).toBe("DRAFT");
  });

  it("9c. gov direct delete of own draft succeeds and refreshes", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ created_by: 2 })] }),
    );
    mocks.schemeService.deleteScheme.mockReturnValue(
      of({ message: "Scheme moved to Deleted Schemes." }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const changed: string[] = [];
    c.dataChanged.subscribe(() => changed.push("changed"));
    c.openDeleteModal(c.schemes[0]);
    c.onConfirmModalConfirmed();
    expect(mocks.schemeService.deleteScheme).toHaveBeenCalledTimes(1);
    expect(mocks.schemeService.deleteScheme).toHaveBeenCalledWith(30);
    expect(mocks.schemeService.requestDeleteScheme).not.toHaveBeenCalled();
    expect(c.confirmModalOpen).toBe(false);
    expect(c.successMessage).toContain("moved to Deleted Schemes");
    expect(mocks.schemeService.getSchemes).toHaveBeenCalledTimes(2);
    expect(changed).toEqual(["changed"]);
  });

  it("9d. gov direct-delete refusal surfaces the backend error, draft kept", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ created_by: 2 })] }),
    );
    mocks.schemeService.deleteScheme.mockReturnValue(
      throwError(() => ({ status: 403, error: { detail: "You are not authorized to delete this scheme." } })),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openDeleteModal(c.schemes[0]);
    c.onConfirmModalConfirmed();
    expect(c.confirmLoading).toBe(false);
    expect(String(c.confirmErrorMessage ?? "")).toContain("not authorized");
    expect(String(c.errorMessage ?? "")).toContain("not authorized");
    expect(c.schemes[0].status).toBe("DRAFT");
    expect(c.successMessage).toBeNull();
  });

  it("9e. another user's draft never reaches a gov draft list (privacy)", () => {
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ created_by: 99 })] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.schemes.length).toBe(0);
    expect(mocks.schemeService.deleteScheme).not.toHaveBeenCalled();
    expect(mocks.schemeService.requestDeleteScheme).not.toHaveBeenCalled();
  });

  it("10. search filters drafts; load failure shows error", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        schemes: [
          draftRow({ scheme_id: 50, name: "Water Mission", category: "Irrigation" }),
          draftRow({ scheme_id: 51, name: "Solar Scheme", category: "Energy" }),
        ],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.searchText = "solar";
    expect(c.filteredSchemes.length).toBe(1);
    expect(c.filteredSchemes[0].id).toBe(51);
    mocks.schemeService.getSchemes.mockReturnValue(
      throwError(() => ({ status: 0, message: "down" })),
    );
    c.loadSchemes();
    expect(c.schemes.length).toBe(0);
    expect(c.errorMessage).toBeTruthy();
  });

  function openModalWithTwoDrafts() {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({
        total: 2,
        page: 1,
        limit: 100,
        pages: 1,
        schemes: [
          draftRow({ scheme_id: 60, name: "Draft A" }),
          draftRow({ scheme_id: 61, name: "Draft B" }),
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
    c.toggleMenu(c.schemes[0], triggerEvent());
    expect(c.menuOpenId).toBe(60);
    expect(c.menuOpenScheme?.id).toBe(60);
    expect(c.menuStyle).not.toBeNull();
    c.toggleMenu(c.schemes[0], triggerEvent());
    expect(c.menuOpenId).toBeNull();
    expect(c.menuOpenScheme).toBeNull();
  });

  it("12. opening another row switches the menu to that scheme", () => {
    const c = openModalWithTwoDrafts();
    c.toggleMenu(c.schemes[0], triggerEvent());
    c.toggleMenu(c.schemes[1], triggerEvent());
    expect(c.menuOpenId).toBe(61);
    expect(c.menuOpenScheme?.id).toBe(61);
  });

  it("13. Escape closes the menu without closing the modal", () => {
    const c = openModalWithTwoDrafts();
    const emitted: string[] = [];
    c.closed.subscribe(() => emitted.push("closed"));
    c.toggleMenu(c.schemes[0], triggerEvent());
    c.onEscapeKey();
    expect(c.menuOpenId).toBeNull();
    expect(emitted).toEqual([]);
  });

  it("14. outside click closes the menu; inside clicks keep it open", () => {
    const c = openModalWithTwoDrafts();
    c.toggleMenu(c.schemes[0], triggerEvent());
    const outside = { target: document.createElement("div") } as any;
    c.onDocumentClick(outside);
    expect(c.menuOpenId).toBeNull();

    c.toggleMenu(c.schemes[0], triggerEvent());
    const menuEl = document.createElement("div");
    menuEl.className = "dp-float-menu";
    const inner = document.createElement("span");
    menuEl.appendChild(inner);
    c.onDocumentClick({ target: inner } as any);
    expect(c.menuOpenId).toBe(60);
  });

  it("15. menu actions run only for the selected scheme and close the menu", () => {
    const c = openModalWithTwoDrafts();
    c.toggleMenu(c.schemes[1], triggerEvent());
    c.viewScheme(c.menuOpenScheme!);
    expect(mocks.router.navigate).toHaveBeenCalledWith([
      "/dashboard",
      "admin",
      "schemes",
      61,
    ]);
    expect(c.menuOpenId).toBeNull();

    c.toggleMenu(c.schemes[1], triggerEvent());
    mocks.schemeService.submitScheme.mockReturnValue(of(draftRow()));
    c.openSubmitModal(c.menuOpenScheme!);
    expect(c.menuOpenId).toBeNull();
    expect(c.confirmModalOpen).toBe(true);
    c.onConfirmModalConfirmed();
    expect(mocks.schemeService.submitScheme).toHaveBeenCalledWith(61);
  });

  it("16. reopening clears stale rows and fetches once (no duplicate calls)", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    // Simulates Angular's first open: ngOnChanges fires alongside ngOnInit.
    c.ngOnInit();
    c.ngOnChanges({ open: { currentValue: true } } as any);
    expect(mocks.schemeService.getSchemes).toHaveBeenCalledTimes(1);
    expect(c.loading).toBe(false);
    expect(c.schemes.length).toBe(1);
    // Reopen: stale rows are dropped immediately, spinner shows meanwhile.
    c.open = false;
    c.ngOnChanges({ open: { currentValue: false } } as any);
    c.open = true;
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 0, page: 1, limit: 100, pages: 0, schemes: [] }),
    );
    c.ngOnChanges({ open: { currentValue: true } } as any);
    expect(c.schemes.length).toBe(0);
    expect(c.loading).toBe(false);
    expect(c.errorMessage).toBe("");
  });

  it("17. stale in-flight responses never overwrite newer results", () => {
    const slow$ = new Subject<any>();
    mocks.schemeService.getSchemes
      .mockReturnValueOnce(slow$)
      .mockReturnValue(
        of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ scheme_id: 77 })] }),
      );
    const c = makeComponent(mocks);
    c.ngOnInit(); // slow request in flight
    expect(c.loading).toBe(true);
    c.loadSchemes(); // refresh supersedes it
    expect(c.loading).toBe(false);
    expect(c.schemes[0].id).toBe(77);
    // Late stale arrival is ignored: no spinner flash, no row swap.
    slow$.next({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow({ scheme_id: 78 })] });
    expect(c.loading).toBe(false);
    expect(c.schemes[0].id).toBe(77);
    expect(c.errorMessage).toBe("");
  });

  it("18. empty success and error states clear the spinner", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 0, page: 1, limit: 100, pages: 0, schemes: [] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    expect(c.loading).toBe(false);
    expect(c.schemes.length).toBe(0);
    expect(c.filteredSchemes.length).toBe(0);
    expect(c.errorMessage).toBe("");

    mocks.schemeService.getSchemes.mockReturnValue(
      throwError(() => ({ status: 500, message: "Server error" })),
    );
    c.loadSchemes();
    expect(c.loading).toBe(false);
    expect(c.schemes.length).toBe(0);
    expect(c.errorMessage).toBeTruthy();

    // Retry recovers.
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    c.loadSchemes();
    expect(c.loading).toBe(false);
    expect(c.errorMessage).toBe("");
    expect(c.schemes.length).toBe(1);
  });

  it("19. late responses after teardown change nothing", () => {
    const slow$ = new Subject<any>();
    mocks.schemeService.getSchemes.mockReturnValue(slow$);
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.ngOnDestroy();
    slow$.next({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] });
    slow$.error({ status: 500 });
    expect(c.schemes.length).toBe(0);
    expect(c.errorMessage).toBe("");
  });

  it("20. opening the three-dot menu never touches the loading state", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    const trigger = { stopPropagation: vi.fn() } as any;
    c.toggleMenu(c.schemes[0], trigger);
    expect(c.loading).toBe(false);
    c.closeMenu();
    expect(c.loading).toBe(false);
  });

  it("21. admin submit dialog shows the bold quoteless title + approval copy", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({
        total: 1,
        page: 1,
        limit: 100,
        pages: 1,
        schemes: [draftRow({ name: "Pradhan Mantri Fasal Bima Yojana" })],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openSubmitModal(c.schemes[0]);
    expect(c.confirmTitle).toBe("Submit Scheme");
    expect(c.confirmMessageBefore).toBe("You are about to publish ");
    expect(c.confirmHighlight).toBe("Pradhan Mantri Fasal Bima Yojana");
    expect(c.confirmHighlight).not.toContain('"');
    expect(c.confirmMessageAfter).toBe(
      ". Upon confirmation, it will be published on the PolicyGPT platform.",
    );
    expect(c.confirmText).toBe("Publish Scheme");
    expect(
      c.confirmMessageBefore + c.confirmHighlight + c.confirmMessageAfter,
    ).toBe(
      "You are about to publish Pradhan Mantri Fasal Bima Yojana. " +
        "Upon confirmation, it will be published on the PolicyGPT platform.",
    );
  });

  it("22. gov submit dialog shows the review copy, incl. long titles", () => {
    const longTitle =
      "National Rural Waste Management and Plastic Pollution Reduction Scheme";
    mocks.auth.getUserRole.mockReturnValue("GOVERNMENT_OFFICIAL");
    mocks.auth.getStoredUser.mockReturnValue({ user_id: 2, role: "GOVERNMENT_OFFICIAL" });
    mocks.schemeService.getSchemes.mockReturnValue(
      of({
        total: 1,
        page: 1,
        limit: 100,
        pages: 1,
        schemes: [draftRow({ name: longTitle, created_by: 2 })],
      }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openSubmitModal(c.schemes[0]);
    expect(c.confirmTitle).toBe("Submit Scheme");
    expect(c.confirmMessageBefore).toBe("You are about to submit ");
    // Long titles pass through untruncated with no quotation marks.
    expect(c.confirmHighlight).toBe(longTitle);
    expect(c.confirmHighlight).not.toContain('"');
    expect(c.confirmMessageAfter).toBe(
      " to the Admin for review and approval. The scheme will be " +
        "published only after approval.",
    );
    expect(c.confirmText).toBe("Submit Scheme");
  });

  it("23. highlight parts are cleared outside the submit dialog", () => {
    mocks.schemeService.getSchemes.mockReturnValue(
      of({ total: 1, page: 1, limit: 100, pages: 1, schemes: [draftRow()] }),
    );
    const c = makeComponent(mocks);
    c.ngOnInit();
    c.openSubmitModal(c.schemes[0]);
    expect(c.confirmHighlight).toBeTruthy();
    c.onConfirmModalCancelled();
    expect(c.confirmHighlight).toBe("");
    expect(c.confirmMessageBefore).toBe("");
    expect(c.confirmMessageAfter).toBe("");
    c.openSubmitModal(c.schemes[0]);
    c.openDeleteModal(c.schemes[0]);
    expect(c.confirmHighlight).toBe("");
  });
});
