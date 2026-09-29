import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FaqListComponent } from './faq-list.component';
import { FaqService } from '../../../core/services/faq.service';
import { Auth } from '../../../core/services/auth';
import { FAQ } from '../../../core/models/faq.model';

describe('FaqListComponent', () => {
  let component: FaqListComponent;
  let fixture: ComponentFixture<FaqListComponent>;
  let faqService: FaqService;
  let authService: Auth;

  const mockFaqs: FAQ[] = [
    {
      faq_id: 1,
      question: 'How do I apply for farmer subsidies?',
      answer: 'Visit the schemes portal and use the eligibility checker.',
      category: 'Schemes',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      faq_id: 2,
      question: 'What documents are needed for registration?',
      answer: 'Identity proof and domicile certificate.',
      category: 'General',
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FaqListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    faqService = TestBed.inject(FaqService);
    authService = TestBed.inject(Auth);

    vi.spyOn(faqService, 'getFaqs').mockReturnValue(of(mockFaqs));
    vi.spyOn(authService, 'getUserRole').mockReturnValue('CITIZEN');

    fixture = TestBed.createComponent(FaqListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load FAQs', () => {
    expect(component).toBeTruthy();
    expect(component.faqs().length).toBe(2);
    expect(component.loading()).toBe(false);
  });

  it('should filter FAQs by search query', () => {
    component.searchQuery.set('farmer');
    expect(component.filteredFaqs().length).toBe(1);
    expect(component.filteredFaqs()[0].faq_id).toBe(1);
  });

  it('should filter FAQs by category', () => {
    component.selectCategory('General');
    expect(component.filteredFaqs().length).toBe(1);
    expect(component.filteredFaqs()[0].question).toContain('documents');
  });

  it('should toggle FAQ accordion expansion', () => {
    expect(component.isExpanded(1)).toBe(true); // First item expanded by default
    component.toggleFaq(1);
    expect(component.isExpanded(1)).toBe(false);
    component.toggleFaq(1);
    expect(component.isExpanded(1)).toBe(true);
  });

  it('should identify non-admin user mode', () => {
    expect(component.isAdmin()).toBe(false);
  });

  it('should identify admin user mode when role is ADMIN', () => {
    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    component.checkUserRole();
    expect(component.isAdmin()).toBe(true);
  });
});
