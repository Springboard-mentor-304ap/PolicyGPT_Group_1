import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';
import { CompareResultsComponent, CompareEntity } from './compare-results.component';
import { PolicyService } from '../../../core/services/policy.services';
import { SchemeService } from '../../../core/services/scheme.service';
import { PolicyResponse } from '../../../core/models/policy.model';
import { SchemeResponse } from '../../../core/models/scheme.model';
import { CompareItem } from '../compare-selection/compare-selection.component';

describe('CompareResultsComponent', () => {
  let component: CompareResultsComponent;
  let fixture: ComponentFixture<CompareResultsComponent>;
  let mockPolicyService: any;
  let mockSchemeService: any;
  let mockRouter: any;
  let mockLocation: any;

  const mockPolicy1: PolicyResponse = {
    policy_id: 101,
    title: 'National Agriculture Policy',
    description: 'A comprehensive national policy for agricultural growth.',
    category: 'Agriculture',
    ministry: 'Ministry of Agriculture & Farmers Welfare',
    department: 'Department of Agriculture',
    state: 'Central',
    sector: 'Farming & Irrigation',
    status: 'APPROVED',
    benefits: ['Subsidy on fertilizer', 'Crop insurance coverage'],
    eligibility_rules: [
      { rule_type: 'AGE_CRITERIA', min_age: 18, max_age: 65 },
      { rule_type: 'ANNUAL_INCOME_LIMIT', value: 200000 },
    ],
    publication_date: '2025-01-15',
    effective_date: '2025-02-01',
    document_url: 'https://example.com/agri-policy.pdf',
    source_url: 'https://agricoop.nic.in',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  };

  const mockPolicy2: PolicyResponse = {
    policy_id: 102,
    title: 'National Digital Health Policy',
    description: 'Policy to standardize electronic health records.',
    category: 'Health',
    ministry: 'Ministry of Health & Family Welfare',
    department: 'Department of Health',
    state: 'Central',
    sector: 'Digital Healthcare',
    status: 'APPROVED',
    benefits: ['Free digital health ID', 'Telemedicine access'],
    eligibility_rules: [
      { rule_type: 'TARGET_BENEFICIARIES', value: 'All Indian Citizens' },
    ],
    publication_date: '2025-03-10',
    effective_date: '2025-04-01',
    document_url: 'https://example.com/health-policy.pdf',
    source_url: 'https://mohfw.gov.in',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  };

  const mockScheme1: SchemeResponse = {
    scheme_id: 201,
    name: 'PM-KISAN Scheme',
    title: 'PM-KISAN Scheme',
    description: 'Income support of Rs. 6000 per year for farmer families.',
    category: 'Agriculture',
    ministry: 'Ministry of Agriculture & Farmers Welfare',
    department: 'Department of Agriculture',
    state: 'Central',
    status: 'APPROVED',
    benefits: ['Financial assistance of ₹6,000 per year in three installments'],
    documents_required: 'Aadhaar Card, Land ownership documents, Bank Passbook',
    application_process: 'Register on PM-KISAN portal or via nearest CSC center.',
    application_url: 'https://pmkisan.gov.in',
    source_url: 'https://pmkisan.gov.in',
    eligibility_rules: [
      {
        min_age: 18,
        max_age: 75,
        occupation: 'Small & Marginal Farmer',
        max_income: 250000,
      },
    ],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  };

  const mockScheme2: SchemeResponse = {
    scheme_id: 202,
    name: 'Ayushman Bharat PM-JAY',
    title: 'Ayushman Bharat PM-JAY',
    description: 'Health insurance coverage up to 5 lakh rupees per family per year.',
    category: 'Health',
    ministry: 'Ministry of Health & Family Welfare',
    department: 'Department of Health',
    state: 'Central',
    status: 'APPROVED',
    benefits: ['Cashless treatment up to ₹5,00,000 per family per year'],
    documents_required: 'Aadhaar card or ration card',
    application_process: 'Visit nearest empanelled hospital or register via online portal.',
    application_url: 'https://pmjay.gov.in',
    source_url: 'https://pmjay.gov.in',
    eligibility_rules: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  };

  beforeEach(async () => {
    mockPolicyService = {
      getPolicy: vi.fn().mockImplementation((id: number) => {
        if (id === 101) return of(mockPolicy1);
        if (id === 102) return of(mockPolicy2);
        return of({ ...mockPolicy1, policy_id: id });
      }),
    };

    mockSchemeService = {
      getScheme: vi.fn().mockImplementation((id: number) => {
        if (id === 201) return of(mockScheme1);
        if (id === 202) return of(mockScheme2);
        return of({ ...mockScheme1, scheme_id: id });
      }),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockLocation = {
      back: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CompareResultsComponent],
      providers: [
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SchemeService, useValue: mockSchemeService },
        { provide: Router, useValue: mockRouter },
        { provide: Location, useValue: mockLocation },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    // Clear history state
    window.history.replaceState(null, '');
  });

  it('1. should show error and back button when navigating directly without items state', () => {
    window.history.replaceState({}, '');
    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.errorMessage).toBe('Please select at least two schemes or policies to compare.');
    expect(component.loading).toBe(false);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Please select at least two schemes or policies to compare.');
    expect(compiled.querySelector('.back-btn')).toBeTruthy();
  });

  it('2. should correctly load and compare Policy vs Policy (2 items)', () => {
    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 102, title: 'National Digital Health Policy', type: 'Policy', ministry: 'Health', category: 'Health', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(mockPolicyService.getPolicy).toHaveBeenCalledWith(101);
    expect(mockPolicyService.getPolicy).toHaveBeenCalledWith(102);
    expect(mockSchemeService.getScheme).not.toHaveBeenCalled();

    expect((component.data1 as PolicyResponse)?.policy_id).toBe(101);
    expect((component.data2 as PolicyResponse)?.policy_id).toBe(102);
    expect(component.data3).toBeNull();

    // Verify Sector is populated for both policies
    expect(component.getValue(component.data1, 'sector')).toBe('Farming & Irrigation');
    expect(component.getValue(component.data2, 'sector')).toBe('Digital Healthcare');

    // Verify Scheme-only fields show "-"
    expect(component.getValue(component.data1, 'documents_required')).toBe('-');
    expect(component.getValue(component.data1, 'application_process')).toBe('-');
    expect(component.getApplicationUrl(component.data1)).toBeNull();
  });

  it('3. should correctly load and compare Scheme vs Scheme (2 items)', () => {
    const items: CompareItem[] = [
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 202, title: 'Ayushman Bharat PM-JAY', type: 'Scheme', ministry: 'Health', category: 'Health', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(mockSchemeService.getScheme).toHaveBeenCalledWith(201);
    expect(mockSchemeService.getScheme).toHaveBeenCalledWith(202);
    expect(mockPolicyService.getPolicy).not.toHaveBeenCalled();

    expect((component.data1 as SchemeResponse)?.scheme_id).toBe(201);
    expect((component.data2 as SchemeResponse)?.scheme_id).toBe(202);

    // Verify Scheme-only fields
    expect(component.getValue(component.data1, 'documents_required')).toContain('Aadhaar Card');
    expect(component.getApplicationUrl(component.data1)).toBe('https://pmkisan.gov.in');

    // Verify Policy-only fields show "-"
    expect(component.getValue(component.data1, 'sector')).toBe('-');
    expect(component.getValue(component.data1, 'publication_date')).toBe('-');
    expect(component.getValue(component.data1, 'effective_date')).toBe('-');
    expect(component.getDocumentUrl(component.data1)).toBeNull();
  });

  it('4. should correctly compare Policy vs Scheme (cross-type)', () => {
    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(mockPolicyService.getPolicy).toHaveBeenCalledWith(101);
    expect(mockSchemeService.getScheme).toHaveBeenCalledWith(201);

    expect(component.isPolicy(component.data1)).toBe(true);
    expect(component.isScheme(component.data2)).toBe(true);

    // Policy has sector, Scheme has "-"
    expect(component.getValue(component.data1, 'sector')).toBe('Farming & Irrigation');
    expect(component.getValue(component.data2, 'sector')).toBe('-');

    // Policy has document_url, Scheme has "-"
    expect(component.getDocumentUrl(component.data1)).toBe('https://example.com/agri-policy.pdf');
    expect(component.getDocumentUrl(component.data2)).toBeNull();

    // Scheme has application_url, Policy has "-"
    expect(component.getApplicationUrl(component.data1)).toBeNull();
    expect(component.getApplicationUrl(component.data2)).toBe('https://pmkisan.gov.in');
  });

  it('5. should correctly compare Scheme vs Policy (cross-type)', () => {
    const items: CompareItem[] = [
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.isScheme(component.data1)).toBe(true);
    expect(component.isPolicy(component.data2)).toBe(true);

    expect(component.getValue(component.data1, 'type')).toBe('Scheme');
    expect(component.getValue(component.data2, 'type')).toBe('Policy');
  });

  it('6. should correctly support 3-item comparison (Policy + Scheme + Policy)', () => {
    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 102, title: 'National Digital Health Policy', type: 'Policy', ministry: 'Health', category: 'Health', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.data1).toBeTruthy();
    expect(component.data2).toBeTruthy();
    expect(component.data3).toBeTruthy();

    expect(component.isPolicy(component.data1)).toBe(true);
    expect(component.isScheme(component.data2)).toBe(true);
    expect(component.isPolicy(component.data3)).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    // Verify 3 item cards are rendered
    const itemCards = compiled.querySelectorAll('.selected-items .item-card');
    expect(itemCards.length).toBe(3);

    // Verify columns in thead: "Comparison" + 3 items (no View Details column).
    const thHeaders = compiled.querySelectorAll('thead th');
    expect(thHeaders.length).toBe(4);
    expect(compiled.querySelector('thead th.details-col')).toBeNull();
  });

  it('7. should format eligibility rules cleanly and never show [object Object]', () => {
    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const policyRules = component.getEligibilityRules(component.data1);
    expect(policyRules.length).toBe(2);
    expect(policyRules[0]).toContain('Age: 18 - 65 years');
    expect(policyRules[1]).toContain('Income Limit: ₹2,00,000');
    expect(policyRules.join('')).not.toContain('[object Object]');

    const schemeRules = component.getEligibilityRules(component.data2);
    expect(schemeRules.length).toBeGreaterThan(0);
    expect(schemeRules[0]).toContain('Age: 18 - 75 years');
    expect(schemeRules.join('')).not.toContain('[object Object]');
  });

  it('8. should handle API error gracefully when loading items', () => {
    mockPolicyService.getPolicy.mockReturnValue(throwError(() => ({ error: { detail: 'Policy not found' } })));

    const items: CompareItem[] = [
      { id: 999, title: 'Missing Policy', type: 'Policy', ministry: 'Test', category: 'Test', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.errorMessage).toContain('Policy not found');
    expect(component.data1).toBeNull();
  });

  it('9. should navigate back to selection on goToSelection()', () => {
    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    component.goToSelection();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['../'], expect.anything());
  });

  it('10. should navigate back on goBack()', () => {
    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    component.goBack();
    expect(mockLocation.back).toHaveBeenCalled();
  });

  it('11. should NOT display Status row anywhere in the comparison table', () => {
    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const tableHeaders = Array.from(compiled.querySelectorAll('tbody th')).map((th) => th.textContent?.trim());
    expect(tableHeaders).not.toContain('Status');

    const tableBodyText = compiled.querySelector('tbody')?.textContent || '';
    expect(tableBodyText).not.toContain('APPROVED');
    expect(tableBodyText).not.toContain('Approved');
  });

  it('12. should classify empty vs meaningful comparison values', () => {
    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;

    for (const empty of [null, undefined, '', '   ', '-', '—', ' - ', []]) {
      expect(component.hasMeaningfulValue(empty)).toBe(false);
    }
    expect(component.hasMeaningfulValue(0)).toBe(true);
    expect(component.hasMeaningfulValue(false)).toBe(true);
    expect(component.hasMeaningfulValue('Ministry of Education')).toBe(true);
    expect(component.hasMeaningfulValue('2025-01-15')).toBe(true);
    expect(component.hasMeaningfulValue(['Cashless treatment'])).toBe(true);

    expect(component.showRow(null, null)).toBe(false);
    expect(component.showRow('-', '—')).toBe(false);
    expect(component.showRow('Ministry of Education', null)).toBe(true);
    expect(component.showRow(null, null, 'Education')).toBe(true);
    expect(component.showRow(null, null, null)).toBe(false);
  });

  it('13. should hide rows where every column is empty but keep one-sided rows', () => {    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 102, title: 'National Digital Health Policy', type: 'Policy', ministry: 'Health', category: 'Health', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const tableHeaders = Array.from(compiled.querySelectorAll('tbody th')).map((th) => th.textContent?.trim());

    // Both policies: scheme-only rows empty on both sides → hidden.
    expect(tableHeaders).not.toContain('Documents Required');
    expect(tableHeaders).not.toContain('Application Process');
    expect(tableHeaders).not.toContain('Application URL');

    // One-sided or populated rows stay visible.
    expect(tableHeaders).toContain('Ministry');
    expect(tableHeaders).toContain('Sector');
    expect(tableHeaders).toContain('Document');
  });

  it('14. should show one VS badge for 2 items and two for 3 items', () => {
    const twoItems: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items: twoItems }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    let compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.vs-badge').length).toBe(1);

    const threeItems: CompareItem[] = [
      ...twoItems,
      { id: 102, title: 'National Digital Health Policy', type: 'Policy', ministry: 'Health', category: 'Health', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items: threeItems }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    compiled = fixture.nativeElement as HTMLElement;
    // Between 1-2 and 2-3, none after the final item.
    expect(compiled.querySelectorAll('.vs-badge').length).toBe(2);
  });

  it('15. should render policy/blue and scheme/green type treatments', () => {    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const policyPill = compiled.querySelector('.type-pill.policy-pill');
    const schemePill = compiled.querySelector('.type-pill.scheme-pill');
    expect(policyPill?.textContent).toContain('Policy');
    expect(policyPill?.textContent).toContain('policy');
    expect(schemePill?.textContent).toContain('Scheme');
    expect(schemePill?.textContent).toContain('account_balance');
  });

  it('16. should navigate to the existing policy details page from View Details', () => {
    mockRouter.url = '/dashboard/citizen/compare/results';
    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('.details-btn');
    expect(buttons.length).toBe(2);

    // Buttons live in the final table row, one per item column.
    const rows = compiled.querySelectorAll('tbody tr');
    const lastRow = rows[rows.length - 1];
    expect(lastRow.querySelector('th')?.textContent).toContain('View Details');
    expect(lastRow.querySelectorAll('.details-btn').length).toBe(2);

    (buttons[0] as HTMLButtonElement).click();
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/dashboard',
      'citizen',
      'policies',
      101,
    ]);

    (buttons[1] as HTMLButtonElement).click();
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/dashboard',
      'citizen',
      'schemes',
      201,
    ]);
  });

  it('17. should render one View Details action per item for 3 items', () => {
    mockRouter.url = '/dashboard/citizen/compare/results';
    const items: CompareItem[] = [
      { id: 101, title: 'National Agriculture Policy', type: 'Policy', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 201, title: 'PM-KISAN Scheme', type: 'Scheme', ministry: 'Agri', category: 'Agri', state: 'Central', targetGroup: '-' },
      { id: 102, title: 'National Digital Health Policy', type: 'Policy', ministry: 'Health', category: 'Health', state: 'Central', targetGroup: '-' },
    ];
    window.history.replaceState({ items }, '');

    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('.details-btn');
    expect(buttons.length).toBe(3);

    (buttons[2] as HTMLButtonElement).click();
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/dashboard',
      'citizen',
      'policies',
      102,
    ]);
  });

  it('18. should ignore View Details for invalid items', () => {
    fixture = TestBed.createComponent(CompareResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.viewDetails(null);
    component.viewDetails({ id: NaN, title: 'X', type: 'Policy', ministry: '', category: '', state: '', targetGroup: '' });
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });
});
