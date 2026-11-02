import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach } from "vitest";

import { LoadingIndicatorComponent } from "./loading-indicator.component";

describe("LoadingIndicatorComponent", () => {
  let component: LoadingIndicatorComponent;
  let fixture: ComponentFixture<LoadingIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingIndicatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingIndicatorComponent);
    component = fixture.componentInstance;
  });

  it("should create with a default message and medium spinner", () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector(".loading-indicator")).toBeTruthy();
    expect(host.querySelector(".loading-indicator__spinner")).toBeTruthy();
    expect(
      host.querySelector(".loading-indicator__label")?.textContent,
    ).toContain("Loading...");
    expect(
      host.querySelector(".loading-indicator--sm"),
    ).toBeNull();
  });

  it("should expose the status role and announce a custom message", () => {
    component.message = "Loading policies...";
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(
      host.querySelector('[role="status"]'),
    ).toBeTruthy();
    expect(
      host.querySelector(".loading-indicator__label")?.textContent,
    ).toContain("Loading policies...");
  });

  it("should render the compact variant when size is sm", () => {
    component.size = "sm";
    component.message = "Loading stats...";
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(
      host.querySelector(".loading-indicator--sm"),
    ).toBeTruthy();
  });
});
