import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { UsageStatisticsComponent } from "./usage-statistics.component";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";

describe("UsageStatisticsComponent", () => {
  let component: UsageStatisticsComponent;
  let fixture: ComponentFixture<UsageStatisticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsageStatisticsComponent],
      providers: [
        provideRouter([]),
        AdminAnalyticsDataService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsageStatisticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should load 6 KPI cards", () => {
    expect(component.kpis().length).toBe(6);
    expect(component.kpis()[0].label).toBe("Total Visits");
    expect(component.kpis()[0].value).toBe("50,240");
  });

  it("should load activity trend with 4 series", () => {
    expect(component.activityDatasets().length).toBe(4);
    expect(component.activityLabels().length).toBeGreaterThan(0);
  });

  it("should update activity trend period", () => {
    component.setActivityPeriod("Last 6 Months");
    expect(component.activityTrendPeriod()).toBe("Last 6 Months");
    expect(component.activityLabels().length).toBe(6);
  });

  it("should load daily usage values", () => {
    expect(component.dailyLabels().length).toBeGreaterThan(0);
    expect(component.dailyValues().length).toBeGreaterThan(0);
  });

  it("should update daily usage period", () => {
    component.setDailyPeriod("Last 7 Days");
    expect(component.dailyUsagePeriod()).toBe("Last 7 Days");
    expect(component.dailyLabels().length).toBe(7);
  });

  it("should load top searched policies and schemes", () => {
    expect(component.topPolicies().length).toBe(12);
    expect(component.topPolicies()[0].title).toBe("National Education Policy 2020");
    expect(component.topSchemes().length).toBe(12);
    expect(component.topSchemes()[0].title).toBe("PM Kisan Samman Nidhi");
  });

  it("should load most active users and recent search activities", () => {
    expect(component.mostActiveUsers().length).toBeGreaterThan(0);
    expect(component.recentSearches().length).toBeGreaterThan(0);
  });

  it("should open and close modal", () => {
    component.openModal("policies");
    expect(component.activeModal()).toBe("policies");
    component.closeModal();
    expect(component.activeModal()).toBeNull();
  });

  it("should filter policies in modal by search term", () => {
    component.modalSearchTerm.set("Education");
    expect(component.filteredPolicies().length).toBe(2);
  });

  it("should filter searches in modal by type", () => {
    component.modalTypeFilter.set("Scheme");
    expect(component.filteredSearches().every((s) => s.type === "Scheme")).toBe(true);
  });
});
