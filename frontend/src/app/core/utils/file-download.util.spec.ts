import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  downloadBlob,
  XLSX_MIME_TYPE,
} from "./file-download.util";

describe("file-download.util", () => {
  const realCreateObjectURL = URL.createObjectURL;
  const realRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("triggers an anchor download with the bare filename (no project paths)", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as any;
    URL.revokeObjectURL = revokeObjectURL as any;

    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild");
    const remove = vi.spyOn(HTMLElement.prototype, "remove");
    HTMLAnchorElement.prototype.click = click;

    const blob = new Blob(["hello"], { type: "application/pdf" });
    downloadBlob(blob, "policygpt-policies-20261015-1255.pdf");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    const anchor = appendChild.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.tagName).toBe("A");
    expect(anchor.download).toBe("policygpt-policies-20261015-1255.pdf");
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("strips directory portions so the browser picks the folder", () => {
    URL.createObjectURL = (() => "blob:u") as any;
    URL.revokeObjectURL = (() => undefined) as any;
    const appendChild = vi.spyOn(document.body, "appendChild");
    HTMLAnchorElement.prototype.click = vi.fn();

    downloadBlob(new Blob(["x"]), "some/dir/export.xlsx");

    const anchor = appendChild.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe("export.xlsx");
  });

  it("exposes the xlsx MIME type for workbook blobs", () => {
    expect(XLSX_MIME_TYPE).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});
