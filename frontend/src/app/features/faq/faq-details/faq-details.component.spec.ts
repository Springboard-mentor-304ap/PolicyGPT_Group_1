import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FaqDetailsComponent } from './faq-details.component';
import { FaqService } from '../../../core/services/faq.service';

describe('FaqDetailsComponent', () => {
  let component: FaqDetailsComponent;
  let fixture: ComponentFixture<FaqDetailsComponent>;
  let faqService: { getFaq: ReturnType<typeof vi.fn> };

  const faq = {
    faq_id: 5,
    question: 'How do I apply for a scheme?',
    answer: 'Open the scheme page and click Apply.',
    category: 'Schemes',
    status: 'PUBLISHED',
    display_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  beforeEach(async () => {
    faqService = { getFaq: vi.fn().mockReturnValue(of(faq)) };

    await TestBed.configureTestingModule({
      imports: [FaqDetailsComponent],
      providers: [
        { provide: FaqService, useValue: faqService },
        { provide: Router, useValue: { navigate: vi.fn(), url: '/dashboard/citizen/faqs/5' } },
        { provide: Location, useValue: { back: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['id', '5']]) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FaqDetailsComponent);
    component = fixture.componentInstance;
  });

  it('1. should load and render the published FAQ', () => {
    fixture.detectChanges();
    expect(faqService.getFaq).toHaveBeenCalledWith(5);
    expect(fixture.nativeElement.textContent).toContain('How do I apply for a scheme?');
    expect(fixture.nativeElement.textContent).toContain('Open the scheme page');
  });

  it('2. should link back to the role FAQ list', () => {
    fixture.detectChanges();
    expect(component.faqsRoute).toEqual(['/dashboard', 'citizen', 'faqs']);
  });

  it('3. should show an unavailable message on error', () => {
    faqService.getFaq.mockReturnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('unavailable');
  });
});
