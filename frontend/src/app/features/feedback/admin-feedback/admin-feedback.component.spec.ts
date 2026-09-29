import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminFeedbackComponent } from './admin-feedback.component';
import { FeedbackService } from '../../../core/services/feedback.service';
import { Auth } from '../../../core/services/auth';
import { Feedback } from '../../../core/models/feedback.model';

describe('AdminFeedbackComponent', () => {
  let component: AdminFeedbackComponent;
  let fixture: ComponentFixture<AdminFeedbackComponent>;
  let feedbackService: FeedbackService;
  let authService: Auth;

  const mockAdminFeedbacks: Feedback[] = [
    {
      feedback_id: 1,
      user_id: 10,
      feedback_type: 'GRIEVANCE',
      subject: 'Subsidy delay',
      message: 'Pending for 3 weeks',
      status: 'OPEN',
      admin_response: null,
      created_at: '2026-02-01T10:00:00Z',
      updated_at: '2026-02-01T10:00:00Z',
      user_name: 'John Citizen',
      user_email: 'john@example.com',
      user_role: 'CITIZEN',
    },
    {
      feedback_id: 2,
      user_id: 12,
      feedback_type: 'BUG_ISSUE',
      subject: 'Error in CSV Export',
      message: 'Columns truncated',
      status: 'RESOLVED',
      admin_response: 'Export script updated',
      created_at: '2026-02-02T10:00:00Z',
      updated_at: '2026-02-02T14:00:00Z',
      user_name: 'Dr. Rao',
      user_email: 'rao@research.ac.in',
      user_role: 'RESEARCHER',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminFeedbackComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    feedbackService = TestBed.inject(FeedbackService);
    authService = TestBed.inject(Auth);

    vi.spyOn(authService, 'getUserRole').mockReturnValue('ADMIN');
    vi.spyOn(feedbackService, 'getAllFeedback').mockReturnValue(of(mockAdminFeedbacks));

    fixture = TestBed.createComponent(AdminFeedbackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load all feedback items', () => {
    expect(component).toBeTruthy();
    expect(component.feedbacks().length).toBe(2);
    expect(component.loading()).toBe(false);
  });

  it('should compute metrics correctly', () => {
    const s = component.stats();
    expect(s.total).toBe(2);
    expect(s.open).toBe(1);
    expect(s.resolved).toBe(1);
    expect(s.inProgress).toBe(0);
  });

  it('should filter feedback items by status and role', () => {
    component.statusFilter.set('OPEN');
    expect(component.filteredFeedbacks().length).toBe(1);
    expect(component.filteredFeedbacks()[0].feedback_id).toBe(1);

    component.statusFilter.set('ALL');
    component.roleFilter.set('RESEARCHER');
    expect(component.filteredFeedbacks().length).toBe(1);
    expect(component.filteredFeedbacks()[0].user_role).toBe('RESEARCHER');
  });

  it('should open and handle response modal', () => {
    component.openRespondModal(mockAdminFeedbacks[0]);
    expect(component.showRespondModal()).toBe(true);
    expect(component.selectedFeedback()?.feedback_id).toBe(1);

    const updatedFeedback: Feedback = {
      ...mockAdminFeedbacks[0],
      status: 'IN_PROGRESS',
      admin_response: 'Investigating with the department',
    };

    vi.spyOn(feedbackService, 'updateFeedback').mockReturnValue(of(updatedFeedback));

    component.responseStatus.set('IN_PROGRESS');
    component.responseMessage.set('Investigating with the department');
    component.saveResponse();

    expect(component.showRespondModal()).toBe(false);
    expect(component.feedbacks().find((f) => f.feedback_id === 1)?.status).toBe('IN_PROGRESS');
  });
});
