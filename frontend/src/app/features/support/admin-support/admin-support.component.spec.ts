import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminSupportComponent } from './admin-support.component';
import { SupportService } from '../../../core/services/support.service';
import { AdminUsersService } from '../../../core/services/admin-user.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';

describe('AdminSupportComponent', () => {
  let component: AdminSupportComponent;
  let fixture: ComponentFixture<AdminSupportComponent>;
  let supportService: {
    getAllSupportRequests: ReturnType<typeof vi.fn>;
    getSupportAnalytics: ReturnType<typeof vi.fn>;
    respondToSupportRequest?: ReturnType<typeof vi.fn>;
  };

  const mockRequests = [
    {
      query_id: 1,
      request_id: 'SUP-2026-00001',
      user_id: 3,
      user_name: 'Test Citizen',
      user_email: 'citizen@gmail.com',
      user_role: 'CITIZEN',
      category: 'Technical Problem',
      subject: 'Login OTP never arrives',
      description: 'I never receive the OTP SMS when trying to login.',
      priority: 'HIGH',
      status: 'OPEN',
      response: null,
      created_at: '2026-09-27T20:45:15.000Z',
      updated_at: '2026-09-27T20:45:15.000Z',
      resolved_at: null,
    },
  ];

  beforeEach(async () => {
    supportService = {
      getAllSupportRequests: vi.fn().mockReturnValue(of(mockRequests)),
      getSupportAnalytics: vi.fn().mockReturnValue(
        of({
          total_tickets: 1,
          by_status: { OPEN: 1 },
          by_category: { 'Technical Problem': 1 },
          by_priority: { HIGH: 1 },
          by_role: { CITIZEN: 1 },
          resolved_count: 0,
          avg_resolution_hours: null,
          feedback_count: 0,
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSupportComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SupportService, useValue: supportService },
        { provide: Auth, useValue: { getUserRole: () => 'ADMIN' } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: AdminUsersService, useValue: { getUsers: vi.fn().mockReturnValue(of([])) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminSupportComponent);
    component = fixture.componentInstance;
  });

  it('1. should create the AdminSupportComponent', () => {
    expect(component).toBeTruthy();
  });

  it('2. ngOnInit() should load all support requests for admin', () => {
    fixture.detectChanges();
    expect(supportService.getAllSupportRequests).toHaveBeenCalled();
    expect(component.requests().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('3. stats should count requests by status', () => {
    fixture.detectChanges();
    expect(component.stats()).toEqual({
      total: 1,
      open: 1,
      inProgress: 0,
      waiting: 0,
      resolved: 0,
      closed: 0,
    });
  });

  it('4. status filter should narrow the visible requests', () => {
    fixture.detectChanges();
    component.statusFilter.set('RESOLVED');
    expect(component.filteredRequests().length).toBe(0);
    component.statusFilter.set('OPEN');
    expect(component.filteredRequests().length).toBe(1);
  });

  it('5. saveResponse should send assignee and priority', () => {
    const respond = vi.fn().mockReturnValue(
      of({
        query_id: 1,
        request_id: 'SUP-2026-00001',
        user_id: 3,
        category: 'Technical Problem',
        subject: 'Login OTP never arrives',
        description: 'I never receive the OTP SMS when trying to login.',
        priority: 'URGENT',
        status: 'WAITING_FOR_USER',
        response: 'Checking.',
        created_at: '2026-09-27T20:45:15.000Z',
        updated_at: '2026-09-27T20:45:15.000Z',
        resolved_at: null,
      }),
    );
    supportService.respondToSupportRequest = respond;
    fixture.detectChanges();

    component.openRespondModal(component.requests()[0]);
    component.assigneeId.set(9);
    component.responsePriority.set('URGENT');
    component.responseStatus.set('WAITING_FOR_USER');
    component.responseMessage.set('Checking.');
    component.saveResponse();

    expect(respond).toHaveBeenCalledWith(1, {
      status: 'WAITING_FOR_USER',
      response: 'Checking.',
      assigned_to: 9,
      priority: 'URGENT',
    });
    expect(component.getStatusLabel('WAITING_FOR_USER')).toBe('Waiting for User');
  });

  it('6. sortedRequests should order by priority then recency', () => {
    fixture.detectChanges();
    component.sortOrder.set('priority');
    expect(component.sortedRequests().length).toBe(1);
    component.sortOrder.set('updated_asc');
    expect(component.sortedRequests().length).toBe(1);
  });
});
