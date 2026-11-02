import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TicketDetailsComponent } from './ticket-details.component';
import { SupportService } from '../../../core/services/support.service';

describe('TicketDetailsComponent', () => {
  let component: TicketDetailsComponent;
  let fixture: ComponentFixture<TicketDetailsComponent>;
  let supportService: {
    getSupportRequest: ReturnType<typeof vi.fn>;
    getTicketMessages: ReturnType<typeof vi.fn>;
    postTicketMessage: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn>; url: string };

  const ticket = {
    query_id: 42,
    request_id: 'SUP-2026-00042',
    user_id: 7,
    category: 'Technical Problem',
    subject: 'Login OTP never arrives',
    description: 'I never receive the OTP SMS.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    response: null,
    created_at: '2026-10-06T10:00:00.000Z',
    updated_at: '2026-10-06T10:00:00.000Z',
    resolved_at: null,
  };

  beforeEach(async () => {
    supportService = {
      getSupportRequest: vi.fn().mockReturnValue(of(ticket)),
      getTicketMessages: vi.fn().mockReturnValue(of([])),
      postTicketMessage: vi.fn().mockReturnValue(of({})),
    };
    mockRouter = { navigate: vi.fn(), url: '/dashboard/citizen/support/tickets/42' };

    await TestBed.configureTestingModule({
      imports: [TicketDetailsComponent],
      providers: [
        { provide: SupportService, useValue: supportService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: new Map([['ticketId', '42']]) },
            paramMap: of(new Map([['ticketId', '42']])),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketDetailsComponent);
    component = fixture.componentInstance;
  });

  it('1. should load the owned ticket and its conversation', () => {
    fixture.detectChanges();
    expect(supportService.getSupportRequest).toHaveBeenCalledWith(42);
    expect(component.ticket?.subject).toBe('Login OTP never arrives');
    expect(fixture.nativeElement.textContent).toContain('Login OTP never arrives');
    expect(fixture.nativeElement.querySelector('app-ticket-conversation')).toBeTruthy();
  });

  it('2. should show a permission error on 403', () => {
    supportService.getSupportRequest.mockReturnValue(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('permission');
  });

  it('3. should map status codes to labels', () => {
    expect(component.statusLabel('WAITING_FOR_USER')).toBe('Waiting for User');
    expect(component.statusLabel('IN_PROGRESS')).toBe('In Progress');
    expect(component.statusLabel('RESOLVED')).toBe('Resolved');
    expect(component.statusLabel('OPEN')).toBe('Open');
  });

  it('4. should navigate back to role support page', () => {
    fixture.detectChanges();
    component.goBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/dashboard',
      'citizen',
      'support',
    ]);
  });
});
