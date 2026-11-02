import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import { SchemeAnalyticsComponent } from "./scheme-analytics.component";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";

describe("SchemeAnalyticsComponent", () => {
  let component: SchemeAnalyticsComponent;
  let fixture: ComponentFixture<SchemeAnalyticsComponent>;
  let mockDataService: any;

  const mockTopSchemes = [
    {
      rank: 1,
      name: "PM-KISAN",
      ministry: "Ministry of Agriculture & Farmers Welfare",
      views: 0,
      applications: 0,
    },
    {
      rank: 2,
      name: "Ayushman Bharat",
      ministry: "Ministry of Health and Family Welfare",
      views: 0,
      applications: 0,
    },
    {
      rank: 3,
      name: "Samagra Shiksha",
      ministry: "Ministry of Education",
      views: 0,
      applications: 0,
    },
    {
      rank: 4,
      name: "Digital India",
      ministry: "Ministry of Electronics & IT",
      views: 0,
      applications: 0,
    },
    {
      rank: 5,
      name: "PM Awas Yojana",
      ministry: "Ministry of Housing and Urban Affairs",
      views: 0,
      applications: 0,
    },
  ];

  beforeEach(async () => {
    mockDataService = {
      isSampleData: false,
      getAdminSchemeAnalytics: () =>
        of({
          stats: [],
          by_category: [],
          trend: { labels: [], series: [] },
          by_state: [],
          top_schemes: mockTopSchemes,
          recent_updates: [],
        }),
      downloadReport: () => of(new Blob(["test"], { type: "application/pdf" })),
    };

    await TestBed.configureTestingModule({
      imports: [SchemeAnalyticsComponent],
      providers: [
        provideRouter([]),
        { provide: AdminAnalyticsDataService, useValue: mockDataService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SchemeAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create SchemeAnalyticsComponent", () => {
    expect(component).toBeTruthy();
  });

  it("should render page title and top viewed schemes table", () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector(".page-title")?.textContent).toContain(
      "Scheme Analytics",
    );
    expect(component.topViewedSchemes().length).toBe(5);
  });

  it("should apply and reset filters", () => {
    component.onApplyFilters({
      ministry: "Ministry of Agriculture & Farmers Welfare",
    });
    expect(component.activeFilters()).toEqual({
      ministry: "Ministry of Agriculture & Farmers Welfare",
    });

    component.onResetFilters();
    expect(component.activeFilters()).toEqual({});
  });

  it("should return correct type chip class", () => {
    expect(component.getTypeChipClass("Update")).toBe("type-blue");
    expect(component.getTypeChipClass("Notification")).toBe("type-purple");
    expect(component.getTypeChipClass("New Scheme")).toBe("type-green");
    expect(component.getTypeChipClass("Unknown")).toBe("type-gray");
  });
});
