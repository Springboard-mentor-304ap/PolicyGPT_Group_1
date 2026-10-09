import { TestBed } from "@angular/core/testing";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink, provideRouter } from "@angular/router";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { of } from "rxjs";

import { ResearcherTrendsComponent } from "./researcher-trends.component";
import { AnalyticsService } from "../../../core/services/analytics.service";
import { BreadcrumbComponent } from "../../../shared/components/breadcrumb/breadcrumb.component";
import {
  AnalyticsDonutChartComponent,
  AnalyticsHBarChartComponent,
  AnalyticsLineChartComponent,
} from "../shared/analytics-charts.component";

describe("ResearcherTrendsComponent", () => {
  const trendsFixture = {
    generated_at: "2026-10-09T00:00:00+00:00",
    scope: "APPROVED",
    policies: {
      total_approved: 40,
      by_category: [{ category: "Health", count: 12 }],
      by_state: [],
      by_ministry: [],
      trend: [
        { year: 2026, month: 8, count: 5 },
        { year: 2026, month: 9, count: 7 },
      ],
    },
    schemes: {
      total_approved: 25,
      by_category: [{ category: "Education", count: 9 }],
      by_state: [],
      by_ministry: [],
      trend: [
        { year: 2026, month: 8, count: 3 },
        { year: 2026, month: 9, count: 4 },
      ],
    },
    limitations: [],
  };

  const overviewFixture: any = {
    kpis: {
      total_searches: { value: 6 },
      saved_policies: { value: 2 },
      saved_schemes: { value: 1 },
    },
    trend: [{ key: "2026-09-01", label: "01 Sep", searches: 2 }],
    top_searches: [{ keyword: "health", count: 3, pct: 50 }],
  };

  async function setup() {
    const analytics = {
      getResearcherTrends: vi.fn().mockReturnValue(of(structuredClone(trendsFixture))),
      getResearcherOverview: vi.fn().mockReturnValue(of(structuredClone(overviewFixture))),
    };
    TestBed.configureTestingModule({
      // NOTE: CountUpDirective is intentionally omitted here (with
      // NO_ERRORS_SCHEMA tolerating its binding). The directive's DI
      // factory cannot instantiate under this repo's vitest transform
      // (pre-existing NG0202 failure affecting all analytics specs);
      // the component logic under test does not depend on animation.
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
    TestBed.overrideComponent(ResearcherTrendsComponent, {
      set: {
        imports: [
          CommonModule,
          FormsModule,
          RouterLink,
          BreadcrumbComponent,
          AnalyticsLineChartComponent,
          AnalyticsDonutChartComponent,
          AnalyticsHBarChartComponent,
        ],
      },
    });
    const fixture = TestBed.createComponent(ResearcherTrendsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, analytics };
  }

  it("creates with distinct trends + overview data sources", async () => {
    const { fixture, analytics } = await setup();
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
    expect(analytics.getResearcherTrends).toHaveBeenCalled();
    expect(analytics.getResearcherOverview).toHaveBeenCalled();
    expect(component.totalApprovedPolicies).toBe(40);
    expect(component.totalApprovedSchemes).toBe(25);
    expect(component.ownSearches).toBe(6);
    expect(component.trendSeries.length).toBe(2);
    expect(component.policyCategoryBars).toEqual([{ label: "Health", value: 12 }]);
  });

  it("shows empty states when corpus is empty", async () => {
    const analytics = {
      getResearcherTrends: vi.fn().mockReturnValue(
        of({ ...structuredClone(trendsFixture), policies: { total_approved: 0, by_category: [], by_state: [], by_ministry: [], trend: [] }, schemes: { total_approved: 0, by_category: [], by_state: [], by_ministry: [], trend: [] } }),
      ),
      getResearcherOverview: vi.fn().mockReturnValue(of(structuredClone(overviewFixture))),
    };
    TestBed.configureTestingModule({
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
    TestBed.overrideComponent(ResearcherTrendsComponent, {
      set: {
        imports: [
          CommonModule,
          FormsModule,
          RouterLink,
          BreadcrumbComponent,
          AnalyticsLineChartComponent,
          AnalyticsDonutChartComponent,
          AnalyticsHBarChartComponent,
        ],
      },
    });
    const fixture = TestBed.createComponent(ResearcherTrendsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.hasTrendData).toBe(false);
  });
});
