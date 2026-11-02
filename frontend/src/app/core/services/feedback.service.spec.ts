import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FeedbackService } from './feedback.service';
import { Feedback, FeedbackCreate, FeedbackUpdate } from '../models/feedback.model';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let httpTestingController: HttpTestingController;

  const mockFeedbacks: Feedback[] = [
    {
      feedback_id: 10,
      user_id: 5,
      feedback_type: 'GENERAL',
      subject: 'Great portal experience',
      message: 'The policy compare tool saved me hours.',
      status: 'OPEN',
      admin_response: null,
      created_at: '2026-03-01T12:00:00Z',
      updated_at: '2026-03-01T12:00:00Z',
      user_name: 'John Citizen',
      user_email: 'john@example.com',
      user_role: 'CITIZEN',
    },
    {
      feedback_id: 11,
      user_id: 8,
      feedback_type: 'BUG_ISSUE',
      subject: 'Issue with scheme download',
      message: 'PDF did not open on mobile.',
      status: 'RESOLVED',
      admin_response: 'Resolved in patch 1.4',
      created_at: '2026-03-02T14:00:00Z',
      updated_at: '2026-03-02T16:00:00Z',
      user_name: 'Rita Researcher',
      user_email: 'rita@research.org',
      user_role: 'RESEARCHER',
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FeedbackService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(FeedbackService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should submit feedback', () => {
    const payload: FeedbackCreate = {
      feedback_type: 'GRIEVANCE',
      subject: 'Scheme application delay',
      message: 'Pending for 3 weeks',
    };

    service.createFeedback(payload).subscribe((res) => {
      expect(res.feedback_id).toBe(12);
      expect(res.feedback_type).toBe('GRIEVANCE');
    });

    const req = httpTestingController.expectOne('http://localhost:8000/feedback');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ ...payload, feedback_id: 12, user_id: 1, status: 'OPEN', created_at: '', updated_at: '' });
  });

  it('should fetch all feedback', () => {
    service.getAllFeedback().subscribe((list) => {
      expect(list.length).toBe(2);
      expect(list[0].user_name).toBe('John Citizen');
    });

    const req = httpTestingController.expectOne('http://localhost:8000/feedback');
    expect(req.request.method).toBe('GET');
    req.flush(mockFeedbacks);
  });

  it('should fetch feedback for specific user', () => {
    service.getUserFeedback(5).subscribe((list) => {
      expect(list.length).toBe(1);
      expect(list[0].user_id).toBe(5);
    });

    const req = httpTestingController.expectOne('http://localhost:8000/feedback/me/5');
    expect(req.request.method).toBe('GET');
    req.flush([mockFeedbacks[0]]);
  });

  it('should update feedback with admin response and status', () => {
    const updatePayload: FeedbackUpdate = {
      status: 'RESOLVED',
      admin_response: 'Issue resolved',
    };

    service.updateFeedback(10, updatePayload).subscribe((res) => {
      expect(res.status).toBe('RESOLVED');
      expect(res.admin_response).toBe('Issue resolved');
    });

    const req = httpTestingController.expectOne('http://localhost:8000/feedback/10');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(updatePayload);
    req.flush({ ...mockFeedbacks[0], ...updatePayload });
  });

  it('should delete feedback', () => {
    service.deleteFeedback(10).subscribe((res) => {
      expect(res.feedback_id).toBe(10);
    });

    const req = httpTestingController.expectOne('http://localhost:8000/feedback/10');
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Feedback deleted successfully', feedback_id: 10 });
  });
});
