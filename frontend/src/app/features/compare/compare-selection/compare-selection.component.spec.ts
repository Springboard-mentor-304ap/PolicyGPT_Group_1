import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';
import { CompareSelectionComponent, CompareItem } from './compare-selection.component';
import { PolicyService } from '../../../core/services/policy.services';
import { SchemeService } from '../../../core/services/scheme.service';
import { PolicyListResponse, PolicyResponse } from '../../../core/models/policy.model';
import { SchemeListResponse, SchemeResponse } from '../../../core/models/scheme.model';

describe('CompareSelectionComponent', () => {
  let component: CompareSelectionComponent;
  let fixture: ComponentFixture<CompareSelectionComponent>;
  let mockPolicyService: any;
  let mockSchemeService: any;
  let mockRouter: any;
  let mockLocation: any;

  const mockApprovedPolicies: PolicyResponse[] = [
    {
      policy_id: 10,
      title: 'National Agriculture Policy',
      description: 'Agriculture policy description',
      category: 'Agriculture',
      ministry: 'Ministry of Agriculture',
      department: 'Dept of Agri',
      state: 'Central',
      sector: 'Agriculture',
      status: 'APPROVED',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    },
    {
      policy_id: 11,
      title: 'National Health Mission Policy',
      description: 'Health policy description',
      category: 'Health',
      ministry: 'Ministry of Health',
      department: 'Dept of Health',
      state: 'Central',
      sector: 'Healthcare',
      status: 'APPROVED',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    },
    {
      policy_id: 12,
      title: 'Draft Policy Not To Show',
      description: 'Draft',
      category: 'Health',
      status: 'DRAFT',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    },
  ];

  const mockApprovedSchemes: SchemeResponse[] = [
    {
      scheme_id: 20,
      name: 'PM Kisan Samman Nidhi',
      title: 'PM Kisan Samman Nidhi',
      description: 'Financial benefit for farmers',
      category: 'Agriculture',
      ministry: 'Ministry of Agriculture',
      department: 'Dept of Agri',
      state: 'Central',
      status: 'APPROVED',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    },
    {
      scheme_id: 21,
      name: 'Ayushman Bharat Scheme',
      title: 'Ayushman Bharat Scheme',
      description: 'Health cover scheme',
      category: 'Health',
      ministry: 'Ministry of Health',
      department: 'Dept of Health',
      state: 'Central',
      status: 'APPROVED',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    },
    {
      scheme_id: 22,
      name: 'Draft Scheme',
      description: 'Draft',
      category: 'Health',
      status: 'DRAFT',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    },
  ];

  beforeEach(async () => {
    mockPolicyService = {
      getPolicies: vi.fn().mockReturnValue(
        of({
          total: 2,
          page: 1,
          limit: 100,
          pages: 1,
          policies: mockApprovedPolicies,
        } as PolicyListResponse)
      ),
    };

    mockSchemeService = {
      getSchemes: vi.fn().mockReturnValue(
        of({
          total: 2,
          page: 1,
          limit: 100,
          pages: 1,
          schemes: mockApprovedSchemes,
        } as SchemeListResponse)
      ),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockLocation = {
      back: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CompareSelectionComponent],
      providers: [
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
        { provide: Router, useValue: mockRouter },
        { provide: Location, useValue: mockLocation },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CompareSelectionComponent);
    component = fixture.componentInstance;
  });

  it('1. should create and load only APPROVED items on init without staying in loading state', () => {
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');
    // Should have 2 approved policies and 2 approved schemes = 4 items
    expect(component.allItems.length).toBe(4);

    const policyItems = component.allItems.filter((i) => i.type === 'Policy');
    const schemeItems = component.allItems.filter((i) => i.type === 'Scheme');
    expect(policyItems.length).toBe(2);
    expect(schemeItems.length).toBe(2);

    // Draft items must NOT be included
    expect(component.allItems.some((i) => i.title.includes('Draft'))).toBe(false);
  });

  it('2. should gracefully handle Policy API failure while Scheme API succeeds', () => {
    mockPolicyService.getPolicies.mockReturnValue(throwError(() => new Error('Policy API error')));

    component.loadAllItems();
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');
    expect(component.allItems.length).toBe(2);
    expect(component.allItems[0].type).toBe('Scheme');
  });

  it('3. should gracefully handle Scheme API failure while Policy API succeeds', () => {
    mockSchemeService.getSchemes.mockReturnValue(throwError(() => new Error('Scheme API error')));

    component.loadAllItems();
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');
    expect(component.allItems.length).toBe(2);
    expect(component.allItems[0].type).toBe('Policy');
  });

  it('4. should show error state when both Policy and Scheme APIs fail', () => {
    mockPolicyService.getPolicies.mockReturnValue(throwError(() => new Error('Network error 1')));
    mockSchemeService.getSchemes.mockReturnValue(throwError(() => new Error('Network error 2')));

    component.loadAllItems();
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.errorMessage).toContain('Failed to load items');
    expect(component.allItems.length).toBe(0);
  });

  it('5. should filter items by text search across title, ministry, category, and state', () => {
    fixture.detectChanges();

    component.searchItem1 = 'Agriculture';
    const filtered = component.filteredItem1;
    expect(filtered.length).toBe(2); // 1 policy and 1 scheme
    expect(filtered.some((i) => i.type === 'Policy')).toBe(true);
    expect(filtered.some((i) => i.type === 'Scheme')).toBe(true);
  });

  it('6. should filter items by category dropdown', () => {
    fixture.detectChanges();

    component.filterItem1.selectedCategory = 'Health';
    const filtered = component.filteredItem1;
    expect(filtered.length).toBe(2); // 1 health policy, 1 health scheme
    expect(filtered.every((i) => i.category === 'Health')).toBe(true);
  });

  it('7. should enable Compare Now only when at least 2 items are selected', () => {
    fixture.detectChanges();

    expect(component.canCompare()).toBe(false);

    component.selectItem1(component.allItems[0]);
    expect(component.canCompare()).toBe(false);

    component.selectItem2(component.allItems[1]);
    expect(component.canCompare()).toBe(true);

    // Optional 3rd item can also be selected
    component.selectItem3(component.allItems[2]);
    expect(component.canCompare()).toBe(true);
  });

  it('8. should navigate to results with selected items state on compareNow()', () => {
    fixture.detectChanges();

    component.selectItem1(component.allItems[0]); // Policy
    component.selectItem2(component.allItems[2]); // Scheme

    component.compareNow();

    expect(mockRouter.navigate).toHaveBeenCalledWith(['results'], {
      relativeTo: expect.anything(),
      state: {
        items: [component.allItems[0], component.allItems[2]],
      },
    });
  });

  it('9. should navigate back when goBack() is clicked', () => {
    component.goBack();
    expect(mockLocation.back).toHaveBeenCalled();
  });
});
