import { describe, it, expect } from "vitest";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { QuotedNamesComponent } from "./quoted-names.component";

describe("QuotedNamesComponent", () => {
  let fixture: ComponentFixture<QuotedNamesComponent>;

  async function setup(text: string): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [QuotedNamesComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(QuotedNamesComponent);
    fixture.componentInstance.text = text;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("should render a quoted record name bold without quotation marks", async () => {
    const el = await setup('Policy "River Plan" approved successfully.');
    expect(el.textContent).toBe("Policy River Plan approved successfully.");
    expect(el.textContent).not.toContain('"');
    const strong = el.querySelector("strong");
    expect(strong?.textContent).toBe("River Plan");
  });

  it("should bold every quoted name when several appear", async () => {
    const el = await setup('Move "Alpha" before "Beta".');
    expect(el.textContent).toBe("Move Alpha before Beta.");
    const names = Array.from(el.querySelectorAll("strong")).map((s) =>
      s.textContent?.trim(),
    );
    expect(names).toEqual(["Alpha", "Beta"]);
  });

  it("should render plain text unchanged with no bold element", async () => {
    const el = await setup("Policy approved successfully.");
    expect(el.textContent).toBe("Policy approved successfully.");
    expect(el.querySelector("strong")).toBeNull();
  });

  it("should leave apostrophes and lone quotes literal", async () => {
    const el = await setup("Official's request for \"draft\" kept.");
    expect(el.textContent).toContain("Official's");
    expect(el.querySelectorAll("strong").length).toBe(1);
  });
});
