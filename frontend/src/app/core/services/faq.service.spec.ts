import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FaqService } from './faq.service';
import { FAQ, FAQCreate, FAQUpdate } from '../models/faq.model';

describe('FaqService', () => {
  let service: FaqService;
  let httpTestingController: HttpTestingController;

  const mockFaqs: FAQ[] = [
    {
      faq_id: 1,
      question: 'What is PolicyGPT?',
      answer: 'PolicyGPT is a national policy intelligence platform.',
      category: 'General',
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-01T10:00:00Z',
    },
    {
      faq_id: 2,
      question: 'How to check eligibility?',
      answer: 'Navigate to the eligibility checker module.',
      category: 'Eligibility',
      created_at: '2026-03-02T10:00:00Z',
      updated_at: '2026-03-02T10:00:00Z',
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FaqService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(FaqService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch all FAQs', () => {
    service.getFaqs().subscribe((faqs) => {
      expect(faqs.length).toBe(2);
      expect(faqs[0].question).toBe('What is PolicyGPT?');
    });

    const req = httpTestingController.expectOne('http://localhost:8000/faqs');
    expect(req.request.method).toBe('GET');
    req.flush(mockFaqs);
  });

  it('should fetch FAQ by ID', () => {
    service.getFaq(1).subscribe((faq) => {
      expect(faq.faq_id).toBe(1);
      expect(faq.question).toBe('What is PolicyGPT?');
    });

    const req = httpTestingController.expectOne('http://localhost:8000/faqs/1');
    expect(req.request.method).toBe('GET');
    req.flush(mockFaqs[0]);
  });

  it('should create FAQ', () => {
    const payload: FAQCreate = {
      question: 'New FAQ',
      answer: 'New Answer',
      category: 'General',
    };

    service.createFaq(payload).subscribe((created) => {
      expect(created.faq_id).toBe(3);
      expect(created.question).toBe('New FAQ');
    });

    const req = httpTestingController.expectOne('http://localhost:8000/faqs');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ ...payload, faq_id: 3 });
  });

  it('should update FAQ', () => {
    const updatePayload: FAQUpdate = {
      question: 'Updated FAQ Title',
    };

    service.updateFaq(1, updatePayload).subscribe((updated) => {
      expect(updated.question).toBe('Updated FAQ Title');
    });

    const req = httpTestingController.expectOne('http://localhost:8000/faqs/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(updatePayload);
    req.flush({ ...mockFaqs[0], ...updatePayload });
  });

  it('should delete FAQ', () => {
    service.deleteFaq(1).subscribe((res) => {
      expect(res.message).toBe('FAQ deleted successfully');
      expect(res.faq_id).toBe(1);
    });

    const req = httpTestingController.expectOne('http://localhost:8000/faqs/1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'FAQ deleted successfully', faq_id: 1 });
  });
});
