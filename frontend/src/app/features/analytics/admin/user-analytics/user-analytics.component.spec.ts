import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { UserAnalyticsComponent } from "./user-analytics.component";
import { AdminAnalyticsDataService } from "../services/admin-analytics-data.service";

describe("UserAnalyticsComponent", () => {
  let component: UserAnalyticsComponent;
  let fixture: ComponentFixture<UserAnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserAnalyticsComponent],
      providers: [
        provideRouter([]),
        AdminAnalyticsDataService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should load 6 KPI cards", () => {
    expect(component.kpis().length).toBe(6);
    expect(component.kpis()[0].label).toBe("Total Users");
    expect(component.kpis()[0].value).toBe("5,820");
  });

  it("should load user growth trend datasets", () => {
    expect(component.growthDatasets().length).toBe(3);
    expect(component.growthLabels().length).toBeGreaterThan(0);
  });

  it("should update growth period when changed", () => {
    component.setGrowthPeriod("Last 6 Months");
    expect(component.growthPeriod()).toBe("Last 6 Months");
    expect(component.growthLabels().length).toBe(6);
  });

  it("should load user distribution by role", () => {
    expect(component.roleLabels().length).toBe(5);
    expect(component.roleTotal()).toBe("5,820");
  });

  it("should load registration trend values", () => {
    expect(component.regLabels().length).toBe(6);
    expect(component.regValues().length).toBe(6);
  });

  it("should load users by state", () => {
    expect(component.stateLabels().length).toBe(10);
    expect(component.stateLabels()[0]).toBe("Uttar Pradesh");
  });

  it("should load 4 engagement metrics", () => {
    expect(component.engagementMetrics().length).toBe(4);
    expect(component.engagementMetrics()[0].label).toBe("Total Logins");
  });

  it("should load activity heatmap grid", () => {
    expect(component.heatmapDays().length).toBe(7);
    expect(component.heatmapTimes().length).toBe(8);
    expect(component.heatmapCells().length).toBe(56);
  });

  it("should load recent registered users and top active users", () => {
    expect(component.recentUsers().length).toBeGreaterThan(0);
    expect(component.topActiveUsers().length).toBeGreaterThan(0);
  });

  it("should handle open and close modal", () => {
    component.openModal("recent");
    expect(component.activeModal()).toBe("recent");
    component.closeModal();
    expect(component.activeModal()).toBeNull();
  });

  it("should filter recent users by search term", () => {
    component.modalSearchTerm.set("Rahul");
    expect(component.filteredRecentUsers().length).toBe(1);
    expect(component.filteredRecentUsers()[0].name).toBe("Rahul Sharma");
  });

  it("should return correct role badge class", () => {
    expect(component.getRoleBadgeClass("Citizen")).toBe("badge-citizen");
    expect(component.getRoleBadgeClass("Govt. Official")).toBe("badge-official");
    expect(component.getRoleBadgeClass("Researcher")).toBe("badge-researcher");
    expect(component.getRoleBadgeClass("Organization")).toBe("badge-organization");
  });
});
