import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import { ActivatedRoute } from "@angular/router";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RoleAnalyticsComponent } from "./role-analytics.component";
import { CITIZEN_OVERVIEW_FIXTURE } from "./citizen-overview.fixture";

describe("RoleAnalyticsComponent (citizen)", () => {
  let component: RoleAnalyticsComponent;
  let fixture: ComponentFixture<RoleAnalyticsComponent>;
  let httpMock: HttpTestingController;
  const baseUrl = "http://localhost:8000/analytics";

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoleAnalyticsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { analyticsRole: "citizen" } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoleAnalyticsComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushLivePayload(): void {
    const req = httpMock.expectOne(`${baseUrl}/citizen/overview?range=30d`);
    expect(req.request.method).toBe("GET");
    req.flush(CITIZEN_OVERVIEW_FIXTURE);
    fixture.detectChanges();
  }

  it("renders the layout immediately with a loading indicator", () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector(".role-analytics-page")).toBeTruthy();
    expect(el.querySelector("app-loading-indicator")).toBeTruthy();
    httpMock.expectOne(`${baseUrl}/citizen/overview?range=30d`).flush(CITIZEN_OVERVIEW_FIXTURE);
  });

  it("renders real backend KPIs, charts and saved-item tables", () => {
    fixture.detectChanges();
    flushLivePayload();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector(".error-state")).toBeNull();

    const cards = Array.from(el.querySelectorAll(".stat-card")).map((c) =>
      (c.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(cards.some((t) => t.includes("Saved Policies"))).toBe(true);
    expect(cards.some((t) => t.includes("Eligibility Checks"))).toBe(false);
    expect(cards.length).toBe(4);
    // Live values from the captured payload, read from the value elements
    // in KPI order: policies=1, schemes=2, searches=2, notifications=16.
    const values = Array.from(el.querySelectorAll(".stat-value")).map((v) =>
      (v.textContent ?? "").trim(),
    );
    expect(values).toEqual(["1", "2", "2", "16"]);

    // No meaningless dash placeholders under the cards; the only
    // secondary line is real data ("3 unread" on Notifications).
    const subs = Array.from(el.querySelectorAll(".stat-sub")).map((s) =>
      (s.textContent ?? "").trim(),
    );
    expect(subs).toEqual(["3 unread"]);

    // Trend + donut present, saved tables rendered separately.
    expect(el.querySelector("app-analytics-line-chart")).toBeTruthy();
    expect(el.querySelector("app-analytics-donut-chart")).toBeTruthy();
    const tables = el.querySelectorAll(".data-table");
    expect(tables.length).toBeGreaterThanOrEqual(2);
  });

  it("shows a meaningful error with a working retry after an API failure", () => {
    fixture.detectChanges();
    httpMock
      .expectOne(`${baseUrl}/citizen/overview?range=30d`)
      .flush({ detail: "boom" }, { status: 500, statusText: "Server Error" });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector(".error-state")).toBeTruthy();
    const retry = el.querySelector(".retry-button") as HTMLButtonElement;
    expect(retry).toBeTruthy();

    retry.click();
    httpMock.expectOne(`${baseUrl}/citizen/overview?range=30d`).flush(CITIZEN_OVERVIEW_FIXTURE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(".error-state")).toBeNull();
    expect(fixture.nativeElement.querySelector(".stat-card")).toBeTruthy();
  });
});
