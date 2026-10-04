import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeedbackFormComponent } from './feedback-form.component';
import { FeedbackService } from '../../../core/services/feedback.service';
import { Auth, AuthUser } from '../../../core/services/auth';
import { Feedback } from '../../../core/models/feedback.model';

describe('FeedbackFormComponent', () => {
  let component: FeedbackFormComponent;
  let fixture: ComponentFixture<FeedbackFormComponent>;
  let feedbackService: FeedbackService;
  let authService: Auth;

  const mockUser: AuthUser = {
    user_id: 10,
    full_name: 'Test Citizen',
    email: 'citizen@example.com',
    role: 'CITIZEN',
    phone: '9999999999',
    date_of_birth: '1990-01-01',
    state: 'Maharashtra',
    district: 'Pune',
    occupation: 'Teacher',
    organization: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  const mockFeedbacks: Feedback[] = [
    {
      feedback_id: 1,
      user_id: 10,
      feedback_type: 'GENERAL',
      subject: 'Portal query',
      message: 'Need help with policy download',
      status: 'OPEN',
      admin_response: null,
      created_at: '2026-02-01T10:00:00Z',
      updated_at: '2026-02-01T10:00:00Z',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedbackFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    feedbackService = TestBed.inject(FeedbackService);
    authService = TestBed.inject(Auth);

    vi.spyOn(authService, 'getStoredUser').mockReturnValue(mockUser);
    vi.spyOn(authService, 'getUserRole').mockReturnValue('CITIZEN');
    vi.spyOn(feedbackService, 'getAllFeedback').mockReturnValue(of(mockFeedbacks));

    fixture = TestBed.createComponent(FeedbackFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize user data', () => {
    expect(component).toBeTruthy();
    expect(component.currentUser()?.user_id).toBe(10);
    expect(component.userRole()).toBe('CITIZEN');
    expect(component.userFeedbacks().length).toBe(1);
  });

  it('should switch between submit and history tabs', () => {
    expect(component.activeTab()).toBe('submit');
    component.setTab('history');
    expect(component.activeTab()).toBe('history');
  });

  it('should select feedback category', () => {
    component.selectFeedbackType('GRIEVANCE');
    expect(component.feedbackType).toBe('GRIEVANCE');
  });

  it('should submit feedback successfully', () => {
    const createdFeedback: Feedback = {
      feedback_id: 2,
      user_id: 10,
      feedback_type: 'SUGGESTION',
      subject: 'Better dark mode',
      message: 'Please add a high contrast mode',
      status: 'OPEN',
      admin_response: null,
      created_at: '2026-02-02T10:00:00Z',
      updated_at: '2026-02-02T10:00:00Z',
    };

    vi.spyOn(feedbackService, 'createFeedback').mockReturnValue(of(createdFeedback));

    component.feedbackType = 'SUGGESTION';
    component.subject = 'Better dark mode';
    component.message = 'Please add a high contrast mode';

    component.submitFeedback();

    expect(component.userFeedbacks().length).toBe(2);
    expect(component.activeTab()).toBe('history');
  });

  it('should deep-link to a feedback record from a notification', () => {
    component.historySearch.set('unrelated query');
    (component as unknown as { applyFeedbackLink: (id: number) => void }).applyFeedbackLink(1);
    expect(component.activeTab()).toBe('history');
    expect(component.highlightedFeedbackId()).toBe(1);
    expect(component.historySearch()).toBe('');
    expect(component.historyStatusFilter()).toBe('ALL');
  });
});
