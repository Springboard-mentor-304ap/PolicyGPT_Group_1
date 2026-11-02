import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FaqListComponent } from './faq-list.component';
import { FAQ } from '../../../core/models/faq.model';

/**
 * NOTE: direct instantiation (no TestBed.createComponent) because
 * constructor-injected components cannot instantiate under this repo's
 * vitest transform (pre-existing NG0202 failure). All assertions target
 * component logic; template bindings are covered by tsc.
 */
describe('FaqListComponent', () => {
  let component: FaqListComponent;
  let faqService: any;
  let authService: any;

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

  beforeEach(() => {
    faqService = {
      getFaqs: vi.fn().mockReturnValue(of(mockFaqs)),
      createFaq: vi.fn(),
      updateFaq: vi.fn(),
      deleteFaq: vi.fn(),
    };
    authService = { getUserRole: vi.fn().mockReturnValue('CITIZEN') };
    const toastService: any = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };
    const router: any = { navigate: vi.fn() };
    const scrollLock: any = { lock: vi.fn(), unlock: vi.fn() };
    component = new FaqListComponent(
      faqService,
      authService,
      toastService,
      router,
      scrollLock,
    );
    component.ngOnInit();
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

  it('should start with all FAQs collapsed', () => {
    expect(component.isExpanded(1)).toBe(false);
    expect(component.isExpanded(2)).toBe(false);
  });

  it('should toggle FAQ accordion expansion', () => {
    component.toggleFaq(1);
    expect(component.isExpanded(1)).toBe(true);
    component.toggleFaq(1);
    expect(component.isExpanded(1)).toBe(false);
  });

  it('should identify non-admin user mode', () => {
    expect(component.isAdmin()).toBe(false);
  });

  it('should identify admin user mode when role is ADMIN', () => {
    authService.getUserRole.mockReturnValue('ADMIN');
    component.checkUserRole();
    expect(component.isAdmin()).toBe(true);
  });

  it('should default new FAQs to the ALL audience', () => {
    component.openAddModal();
    expect(component.formAudience).toEqual(['ALL']);
  });

  it('should let ALL override role-specific picks and vice versa', () => {
    component.openAddModal();
    component.toggleAudience('RESEARCHER');
    expect(component.formAudience).toEqual(['RESEARCHER']);
    component.toggleAudience('CITIZEN');
    expect(component.formAudience).toEqual(
      expect.arrayContaining(['RESEARCHER', 'CITIZEN']),
    );
    component.toggleAudience('ALL');
    expect(component.formAudience).toEqual(['ALL']);
  });

  it('should filter the admin list by audience', () => {
    component.faqs.set([
      ...mockFaqs.map((f) => ({ ...f, target_roles: ['ALL'] as string[] })),
      {
        faq_id: 3,
        question: 'How does Research Analytics work?',
        answer: 'Research Analytics provides...',
        category: 'Analytics',
        target_roles: ['RESEARCHER'],
        created_at: '2026-01-03T00:00:00Z',
        updated_at: '2026-01-03T00:00:00Z',
      },
    ]);
    component.selectAudience('RESEARCHER');
    expect(component.filteredFaqs().map((f) => f.faq_id)).toEqual([3]);
    component.selectAudience('All');
    expect(component.filteredFaqs().length).toBe(3);
  });

  it('should include target_roles in create and update payloads', () => {
    faqService.createFaq.mockReturnValue(
      of({ ...mockFaqs[0], target_roles: ['RESEARCHER'] }),
    );
    component.openAddModal();
    component.formQuestion = 'How does Research Analytics work?';
    component.formAnswer = 'Research Analytics provides...';
    component.toggleAudience('RESEARCHER');
    component.saveFaq();
    expect(faqService.createFaq).toHaveBeenCalledWith(
      expect.objectContaining({ target_roles: ['RESEARCHER'] }),
    );

    faqService.updateFaq.mockReturnValue(
      of({ ...mockFaqs[0], target_roles: ['ALL'] }),
    );
    component.openEditModal(
      { ...mockFaqs[0], target_roles: ['RESEARCHER'] },
      new MouseEvent('click'),
    );
    expect(component.formAudience).toEqual(['RESEARCHER']);
    component.toggleAudience('RESEARCHER');
    expect(component.formAudience).toEqual(['ALL']);
    component.saveFaq();
    expect(faqService.updateFaq).toHaveBeenCalledWith(
      mockFaqs[0].faq_id,
      expect.objectContaining({ target_roles: ['ALL'] }),
    );
  });
});
