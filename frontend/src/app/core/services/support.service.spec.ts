import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SupportService } from './support.service';
import { SupportRequest, SupportRequestCreate } from '../models/support.model';
import { FAQ } from '../models/faq.model';

describe('SupportService', () => {
  let service: SupportService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:8000/support';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupportService],
    });
    service = TestBed.inject(SupportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('1. should retrieve published FAQs without params', () => {
    const mockFaqs: FAQ[] = [
      { faq_id: 1, question: 'Q1', answer: 'A1', category: 'General', status: 'PUBLISHED', display_order: 1 },
    ];

    service.getFaqs().subscribe((faqs) => {
      expect(faqs.length).toBe(1);
      expect(faqs[0].question).toBe('Q1');
    });

    const req = httpMock.expectOne(`${baseUrl}/faqs`);
    expect(req.request.method).toBe('GET');
    req.flush(mockFaqs);
  });

  it('2. should retrieve published FAQs with search and category params', () => {
    service.getFaqs('policy', 'Policies').subscribe();

    const req = httpMock.expectOne((r) =>
      r.url === `${baseUrl}/faqs` &&
      r.params.get('search') === 'policy' &&
      r.params.get('category') === 'Policies'
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('3. should retrieve FAQ categories', () => {
    const mockCategories = ['General', 'Policies', 'Schemes'];

    service.getFaqCategories().subscribe((cats) => {
      expect(cats).toEqual(mockCategories);
    });

    const req = httpMock.expectOne(`${baseUrl}/faqs/categories`);
    expect(req.request.method).toBe('GET');
    req.flush(mockCategories);
  });

  it('4. should submit a support request', () => {
    const payload: SupportRequestCreate = {
      category: 'Technical',
      subject: 'Login OTP delay',
      description: 'The OTP sms arrives after 5 minutes.',
      priority: 'HIGH',
    };

    const mockResponse: SupportRequest = {
      query_id: 42,
      request_id: 'SUP-2026-00042',
      user_id: 3,
      category: 'Technical',
      subject: 'Login OTP delay',
      description: 'The OTP sms arrives after 5 minutes.',
      priority: 'HIGH',
      status: 'OPEN',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    };

    service.submitSupportRequest(payload).subscribe((res) => {
      expect(res.request_id).toBe('SUP-2026-00042');
      expect(res.status).toBe('OPEN');
    });

    const req = httpMock.expectOne(`${baseUrl}/requests`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(mockResponse);
  });

  it('5. should retrieve current user support requests', () => {
    service.getMySupportRequests().subscribe((requests) => {
      expect(requests.length).toBe(1);
      expect(requests[0].request_id).toBe('SUP-2026-00042');
    });

    const req = httpMock.expectOne(`${baseUrl}/requests`);
    expect(req.request.method).toBe('GET');
    req.flush([{
      query_id: 42,
      request_id: 'SUP-2026-00042',
      user_id: 3,
      category: 'Technical',
      subject: 'Login OTP delay',
      description: 'The OTP sms arrives after 5 minutes.',
      priority: 'HIGH',
      status: 'OPEN',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    }]);
  });
});
