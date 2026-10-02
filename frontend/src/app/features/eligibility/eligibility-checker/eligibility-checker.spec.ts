import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { By } from "@angular/platform-browser";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { EligibilityChecker } from "./eligibility-checker";
import { EligibilityService, EligibilityMatchResponse } from "../eligibility.service";

describe("EligibilityChecker", () => {
  let component: EligibilityChecker;
  let fixture: ComponentFixture<EligibilityChecker>;
  let mockRouter: any;
  let mockEligibilityService: any;

  const mockSchemeMatch: EligibilityMatchResponse = {
    entity_type: "scheme",
    total_checked: 10,
    eligible_entities: [
      {
        entity_id: 101,
        entity_name: "Post-Matric Scholarship for SC/ST",
        eligible: true,
        message: "You satisfy income, category, and educational qualifications.",
      },
    ],
    ineligible_entities: [],
  };

  const mockPolicyMatch: EligibilityMatchResponse = {
    entity_type: "policy",
    total_checked: 8,
    eligible_entities: [
      {
        entity_id: 201,
        entity_name: "National Higher Education Support Policy",
        eligible: true,
        message: "You meet the age criteria and undergraduate student qualifications.",
      },
    ],
    ineligible_entities: [],
  };

  beforeEach(async () => {
    mockRouter = {
      navigate: vi.fn(),
    };

    let savedStorage: any[] = [];

    mockEligibilityService = {
      findEligible: vi.fn().mockImplementation((_profile: any, type: string) => {
        if (type === "scheme") {
          return of(mockSchemeMatch);
        }
        return of(mockPolicyMatch);
      }),
      getSavedResults: vi.fn().mockImplementation(() => [...savedStorage]),
      saveResult: vi.fn().mockImplementation((item: any) => {
        const exists = savedStorage.some(
          (s) => s.id === item.id || (s.entity_type === item.entity_type && s.entity_id === item.entity_id)
        );
        if (exists) return false;
        savedStorage.unshift(item);
        return true;
      }),
      removeSavedResult: vi.fn().mockImplementation((id: string) => {
        savedStorage = savedStorage.filter((s) => s.id !== id);
        return true;
      }),
      isResultSaved: vi.fn().mockImplementation((type: string, id: number) => {
        return savedStorage.some((s) => s.entity_type === type && s.entity_id === id);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [EligibilityChecker],
      providers: [
        provideRouter([]),
        { provide: EligibilityService, useValue: mockEligibilityService },
      ],
    }).compileComponents();

    mockRouter = TestBed.inject(Router);
    vi.spyOn(mockRouter, "navigate").mockImplementation(() => Promise.resolve(true));

    fixture = TestBed.createComponent(EligibilityChecker);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("1. should create the component and have initial profile defaults", () => {
    expect(component).toBeTruthy();
    expect(component.profile.age).toBe(22);
    expect(component.profile.gender).toBe("Female");
    expect(component.activeTab).toBe("find");
  });

  it("2. should validate age and display error if invalid", () => {
    component.profile.age = 150;
    component.findEligible();

    expect(component.errorMessage).toBe("Please enter a valid age between 0 and 120.");
    expect(mockEligibilityService.findEligible).not.toHaveBeenCalled();
  });

  it("3. should call eligibility service for both schemes and policies on valid submit", () => {
    component.profile.age = 22;
    component.findEligible();

    expect(mockEligibilityService.findEligible).toHaveBeenCalledWith(component.profile, "scheme");
    expect(mockEligibilityService.findEligible).toHaveBeenCalledWith(component.profile, "policy");

    expect(component.schemeResults.length).toBe(1);
    expect(component.policyResults.length).toBe(1);
    expect(component.totalEligibleResults).toBe(2);
    expect(component.totalChecked).toBe(18);
    expect(component.loading).toBe(false);
  });

  it("4. should NOT display results-card initially and display it only after Check Eligibility is triggered", () => {
    // Initial state before clicking Check Eligibility
    expect(component.hasChecked).toBe(false);
    expect(fixture.debugElement.query(By.css(".profile-card"))).toBeTruthy();
    expect(fixture.debugElement.query(By.css(".results-card"))).toBeNull();

    // Trigger Check Eligibility
    component.findEligible();
    fixture.detectChanges();

    // After clicking Check Eligibility
    expect(component.hasChecked).toBe(true);
    expect(fixture.debugElement.query(By.css(".results-card"))).toBeTruthy();

    const schemeTitle = fixture.debugElement.query(By.css(".scheme-tag"));
    const policyTitle = fixture.debugElement.query(By.css(".policy-tag"));

    expect(schemeTitle).toBeTruthy();
    expect(policyTitle).toBeTruthy();

    const badgeElements = fixture.debugElement.queryAll(By.css(".status-eligible"));
    expect(badgeElements.length).toBe(2);
  });

  it("5. should handle empty results correctly without showing an error banner", () => {
    mockEligibilityService.findEligible.mockReturnValue(
      of({ entity_type: "scheme", total_checked: 5, eligible_entities: [], ineligible_entities: [] })
    );

    component.findEligible();
    fixture.detectChanges();

    expect(component.totalEligibleResults).toBe(0);
    expect(component.errorMessage).toBe("");

    const emptyBox = fixture.debugElement.query(By.css(".empty-state"));
    expect(emptyBox).toBeTruthy();
  });

  it("6. should handle API errors gracefully", () => {
    mockEligibilityService.findEligible.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: "Database connection failed" } }))
    );

    component.findEligible();
    fixture.detectChanges();

    expect(component.errorMessage).toBe("Database connection failed");
    expect(component.loading).toBe(false);
  });

  it("7. should switch tabs and navigate to specific checker when selected", () => {
    component.setTab("specific");
    expect(component.activeTab).toBe("specific");
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/citizen/eligibility/check"]);

    component.setTab("saved");
    expect(component.activeTab).toBe("saved");
  });

  it("8. should save an eligibility result and prevent duplicates", () => {
    component.findEligible();
    fixture.detectChanges();

    const entity = component.schemeResults[0];
    component.toggleSave("scheme", entity);

    expect(mockEligibilityService.saveResult).toHaveBeenCalled();
    expect(component.savedResults.length).toBe(1);
    expect(component.savedResults[0].entity_name).toBe("Post-Matric Scholarship for SC/ST");
    expect(component.isSaved("scheme", entity.entity_id)).toBe(true);

    // Attempt to save the same result twice directly
    const secondSave = mockEligibilityService.saveResult({
      id: "scheme_101",
      entity_id: 101,
      entity_type: "scheme",
      entity_name: "Post-Matric Scholarship for SC/ST",
      eligible: true,
      message: "Testing duplicate",
      saved_at: new Date().toISOString(),
    });
    expect(secondSave).toBe(false);
    expect(component.savedResults.length).toBe(1);
  });

  it("9. should render saved results list when savedTab is active and has items", () => {
    component.savedResults = [
      {
        id: "scheme_101",
        entity_id: 101,
        entity_name: "Post-Matric Scholarship for SC/ST",
        entity_type: "scheme",
        eligible: true,
        message: "You satisfy income, category, and educational qualifications.",
        saved_at: "2026-09-23T10:00:00.000Z",
      },
    ];
    component.activeTab = "saved";
    fixture.detectChanges();

    const savedHeading = fixture.debugElement.query(By.css("#saved-heading"));
    expect(savedHeading.nativeElement.textContent).toContain("Saved Results");

    const savedItem = fixture.debugElement.query(By.css(".saved-item-row"));
    expect(savedItem).toBeTruthy();
    expect(savedItem.nativeElement.textContent).toContain("Post-Matric Scholarship for SC/ST");
  });

  it("10. should show empty state when there are no saved results", () => {
    component.savedResults = [];
    component.activeTab = "saved";
    fixture.detectChanges();

    const emptyBox = fixture.debugElement.query(By.css(".saved-empty-state"));
    expect(emptyBox).toBeTruthy();
    expect(emptyBox.nativeElement.textContent).toContain("No Saved Results");
    expect(emptyBox.nativeElement.textContent).toContain("Your saved eligibility results will appear here.");
  });

  it("11. should open confirmation modal and remove saved result on confirmation", () => {
    const item = {
      id: "scheme_101",
      entity_id: 101,
      entity_name: "Post-Matric Scholarship for SC/ST",
      entity_type: "scheme" as const,
      eligible: true,
      message: "Test message",
      saved_at: "2026-09-23T10:00:00.000Z",
    };
    component.savedResults = [item];
    component.activeTab = "saved";
    fixture.detectChanges();

    // Open delete modal
    component.openDeleteModal(item);
    expect(component.deleteModalOpen).toBe(true);
    expect(component.itemToDelete).toBe(item);

    // Confirm delete
    component.confirmDelete();
    expect(mockEligibilityService.removeSavedResult).toHaveBeenCalledWith("scheme_101");
    expect(component.deleteModalOpen).toBe(false);
    expect(component.itemToDelete).toBeNull();
  });

  it("12. should navigate to details page when viewEntity is called", () => {
    component.viewEntity("scheme", 101);
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/citizen/schemes", 101]);

    component.viewEntity("policy", 201);
    expect(mockRouter.navigate).toHaveBeenCalledWith(["/dashboard/citizen/policies", 201]);
  });
});
