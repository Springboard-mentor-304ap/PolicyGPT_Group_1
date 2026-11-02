import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { SavedItemsComponent } from "./saved-items.component";
import { SavedItemsService } from "../../core/services/saved-items.service";
import { Auth } from "../../core/services/auth";

describe("SavedItemsComponent (user-scoped counts)", () => {
  let component: SavedItemsComponent;
  let fixture: ComponentFixture<SavedItemsComponent>;
  let mockSavedItemsService: any;
  let mockAuth: any;

  const policies = [
    {
      saved_id: 1,
      policy_id: 50,
      title: "National Education Policy",
      category: "Education",
      ministry: "Ministry of Education",
      department: null,
      state: null,
      status: "APPROVED",
      saved_at: "2025-01-15T08:00:00Z",
    },
  ];
  const schemes = [
    {
      saved_id: 2,
      scheme_id: 60,
      name: "PM Scholarship Scheme",
      category: "Education",
      ministry: "Ministry of Education",
      department: null,
      state: null,
      status: "APPROVED",
      saved_at: "2025-01-15T08:00:00Z",
    },
    {
      saved_id: 3,
      scheme_id: 61,
      name: "Health Cover Scheme",
      category: "Health",
      ministry: "Ministry of Health",
      department: null,
      state: null,
      status: "APPROVED",
      saved_at: "2025-01-16T08:00:00Z",
    },
  ];

  beforeEach(async () => {
    mockSavedItemsService = {
      getSavedPolicies: vi.fn().mockReturnValue(of(policies)),
      getSavedSchemes: vi.fn().mockReturnValue(of(schemes)),
      unsavePolicy: vi.fn().mockReturnValue(of({ message: "removed" })),
      unsaveScheme: vi.fn().mockReturnValue(of({ message: "removed" })),
    };
    mockAuth = {
      getUserRole: vi.fn().mockReturnValue("CITIZEN"),
    };

    await TestBed.configureTestingModule({
      imports: [SavedItemsComponent],
      providers: [
        provideRouter([]),
        { provide: SavedItemsService, useValue: mockSavedItemsService },
        { provide: Auth, useValue: mockAuth },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SavedItemsComponent);
    component = fixture.componentInstance;
  });

  it("creates and shows total 3 = 1 policy + 2 schemes", () => {
    fixture.detectChanges();
    expect(component.totalCount).toBe(3);
    expect(component.policyCount).toBe(1);
    expect(component.schemeCount).toBe(2);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Total Saved");
  });

  it("shows zeros and empty state for a citizen with no saved items", () => {
    mockSavedItemsService.getSavedPolicies.mockReturnValue(of([]));
    mockSavedItemsService.getSavedSchemes.mockReturnValue(of([]));
    fixture.detectChanges();
    expect(component.totalCount).toBe(0);
    expect(component.policyCount).toBe(0);
    expect(component.schemeCount).toBe(0);
    expect(fixture.nativeElement.textContent).toContain("No saved items yet");
  });

  it("removing a saved policy updates counts and list", () => {
    fixture.detectChanges();
    component.removePolicy(policies[0] as any);
    expect(mockSavedItemsService.unsavePolicy).toHaveBeenCalledWith(50);
    expect(component.policyCount).toBe(0);
    expect(component.totalCount).toBe(2);
  });

  it("removing a saved scheme updates counts and list", () => {
    fixture.detectChanges();
    component.removeScheme(schemes[0] as any);
    expect(mockSavedItemsService.unsaveScheme).toHaveBeenCalledWith(60);
    expect(component.schemeCount).toBe(1);
    expect(component.totalCount).toBe(2);
  });

  it("shows an error state when both requests fail", () => {
    mockSavedItemsService.getSavedPolicies.mockReturnValue(
      throwError(() => new Error("down")),
    );
    mockSavedItemsService.getSavedSchemes.mockReturnValue(
      throwError(() => new Error("down")),
    );
    fixture.detectChanges();
    expect(component.errorMessage).toContain("Unable to load saved items");
    expect(component.totalCount).toBe(0);
  });

  it("refresh reloads both lists", () => {
    fixture.detectChanges();
    component.loadSavedItems();
    expect(mockSavedItemsService.getSavedPolicies).toHaveBeenCalledTimes(2);
    expect(mockSavedItemsService.getSavedSchemes).toHaveBeenCalledTimes(2);
  });
});
