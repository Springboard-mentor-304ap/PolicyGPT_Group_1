import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupportComponent } from './support.component';
import { SupportService } from '../../core/services/support.service';
import { Auth } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast.service';
import { FAQ, SupportRequest } from '../../core/models/support.model';

describe('SupportComponent', () => {
  let component: SupportComponent;
  let fixture: ComponentFixture<SupportComponent>;
  let supportServiceMock: any;
  let authServiceMock: any;
  let toastServiceMock: any;

  const mockFaqs: FAQ[] = [
    {
      faq_id: 1,
      question: 'How do I search for government schemes?',
      answer: 'Use the Schemes tab in the dashboard.',
      category: 'Schemes',
      status: 'PUBLISHED',
      display_order: 1,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
    {
      faq_id: 2,
      question: 'How do I verify eligibility?',
      answer: 'Use the Eligibility Checker tool.',
      category: 'Eligibility',
      status: 'PUBLISHED',
      display_order: 2,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  ];

  const mockCategories: string[] = ['Schemes', 'Eligibility', 'General'];

  const mockRequests: SupportRequest[] = [
    {
      query_id: 101,
      request_id: 'SUP-2026-00101',
      user_id: 1,
      name: 'John Citizen',
      email: 'citizen@policygpt.gov.in',
      category: 'Schemes',
      subject: 'Clarification on scheme eligibility',
      description: 'Could you please clarify income criteria?',
      priority: 'MEDIUM',
      status: 'OPEN',
      created_at: '2026-09-20T10:00:00Z',
      updated_at: '2026-09-20T10:00:00Z',
    },
  ];

  beforeEach(async () => {
    supportServiceMock = {
      getFaqs: vi.fn().mockReturnValue(of(mockFaqs)),
      getFaqCategories: vi.fn().mockReturnValue(of(mockCategories)),
      getMySupportRequests: vi.fn().mockReturnValue(of(mockRequests)),
      submitSupportRequest: vi.fn().mockReturnValue(
        of({
          query_id: 102,
          request_id: 'SUP-2026-00102',
          user_id: 1,
          name: 'John Citizen',
          email: 'citizen@policygpt.gov.in',
          category: 'General Inquiry',
          subject: 'Technical issue with login',
          description: 'Login button takes a few seconds to respond.',
          priority: 'MEDIUM',
          status: 'OPEN',
          created_at: '2026-09-28T02:00:00Z',
          updated_at: '2026-09-28T02:00:00Z',
        }),
      ),
    };

    authServiceMock = {
      getStoredUser: vi.fn().mockReturnValue({
        user_id: 1,
        email: 'citizen@policygpt.gov.in',
        first_name: 'John',
        last_name: 'Citizen',
        role: 'CITIZEN',
      }),
      getUserRole: vi.fn().mockReturnValue('CITIZEN'),
      isGuest: vi.fn().mockReturnValue(false),
      isLoggedIn: vi.fn().mockReturnValue(true),
      getToken: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    toastServiceMock = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SupportComponent],
      providers: [
        provideRouter([]),
        { provide: SupportService, useValue: supportServiceMock },
        { provide: Auth, useValue: authServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create SupportComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize and load categories and published FAQs from backend', () => {
    expect(supportServiceMock.getFaqCategories).toHaveBeenCalled();
    expect(supportServiceMock.getFaqs).toHaveBeenCalledWith('', 'All');
    expect(component.faqs.length).toBe(2);
    expect(component.categories).toContain('All');
    expect(component.categories).toContain('Schemes');
    expect(component.categories).toContain('Eligibility');
    expect(component.loadingFaqs).toBe(false);
  });

  it('should toggle FAQ accordion expansion', () => {
    // Initial load expands first FAQ
    expect(component.isExpanded(1)).toBe(true);

    component.toggleFaq(1);
    expect(component.isExpanded(1)).toBe(false);

    component.toggleFaq(2);
    expect(component.isExpanded(2)).toBe(true);

    component.collapseAll();
    expect(component.expandedFaqIds.size).toBe(0);

    component.expandAll();
    expect(component.isExpanded(1)).toBe(true);
    expect(component.isExpanded(2)).toBe(true);
  });

  it('should filter by category when a category chip is selected', () => {
    component.selectCategory('Schemes');
    expect(component.selectedCategory).toBe('Schemes');
    expect(supportServiceMock.getFaqs).toHaveBeenCalledWith('', 'Schemes');
  });

  it('should trigger debounced search when search query changes', () => {
    vi.useFakeTimers();
    component.onSearchChange('eligibility');
    vi.advanceTimersByTime(350);

    expect(supportServiceMock.getFaqs).toHaveBeenCalledWith('eligibility', 'All');
    vi.useRealTimers();
  });

  it('should reset filters on clearFilters()', () => {
    component.searchQuery = 'something';
    component.selectedCategory = 'Schemes';
    component.clearFilters();

    expect(component.searchQuery).toBe('');
    expect(component.selectedCategory).toBe('All');
    expect(supportServiceMock.getFaqs).toHaveBeenCalledWith('', 'All');
  });

  it('should load user support requests when authenticated', () => {
    expect(supportServiceMock.getMySupportRequests).toHaveBeenCalled();
    expect(component.myRequests.length).toBe(1);
    expect(component.myRequests[0].request_id).toBe('SUP-2026-00101');
  });

  it('should validate form and submit support request successfully', () => {
    component.openSubmitModal();
    expect(component.showSubmitModal).toBe(true);

    // Empty fields validation
    component.formSubject = '';
    component.formDescription = '';
    component.submitRequest();
    expect(component.submitError).toContain('subject');

    // Fill valid data
    component.formSubject = 'Technical issue with login';
    component.formDescription = 'Login button takes a few seconds to respond.';
    component.formCategory = 'General Inquiry';
    component.formPriority = 'MEDIUM';

    component.submitRequest();

    expect(supportServiceMock.submitSupportRequest).toHaveBeenCalledWith({
      category: 'General Inquiry',
      subject: 'Technical issue with login',
      description: 'Login button takes a few seconds to respond.',
      priority: 'MEDIUM',
    });

    expect(component.submittedSuccessRequest).toBeTruthy();
    expect(component.submittedSuccessRequest?.request_id).toBe('SUP-2026-00102');
    expect(toastServiceMock.success).toHaveBeenCalled();
    expect(component.myRequests[0].request_id).toBe('SUP-2026-00102');
  });
});
