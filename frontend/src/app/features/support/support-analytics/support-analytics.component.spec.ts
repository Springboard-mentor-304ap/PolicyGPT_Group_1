import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupportAnalyticsComponent } from './support-analytics.component';
import { SupportService } from '../../../core/services/support.service';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';

describe('SupportAnalyticsComponent', () => {
  let component: SupportAnalyticsComponent;
  let fixture: ComponentFixture<SupportAnalyticsComponent>;
  let supportService: {
    getSupportAnalytics: ReturnType<typeof vi.fn>;
    getAllSupportRequests: ReturnType<typeof vi.fn>;
  };

  const analytics = {
    total_tickets: 10,
    by_status: { OPEN: 3, IN_PROGRESS: 2, WAITING_FOR_USER: 1, RESOLVED: 3, CLOSED: 1 },
    by_category: { 'General Inquiry': 6, Technical: 4 },
    by_priority: { HIGH: 4, MEDIUM: 6 },
    by_role: { CITIZEN: 8, RESEARCHER: 2 },
    resolved_count: 4,
    avg_resolution_hours: 26.5,
    feedback_count: 7,
  };

  const tickets = [
    {
      query_id: 1,
      request_id: 'SUP-1',
      user_id: 1,
      category: 'General Inquiry',
      subject: 'Login help',
      description: 'Cannot log in',
      priority: 'HIGH',
      status: 'RESOLVED',
      response: 'Fixed',
      created_at: '2026-01-05T10:00:00.000Z',
      updated_at: '2026-01-06T10:00:00.000Z',
      resolved_at: '2026-01-06T10:00:00.000Z',
      assigned_to: 9,
    },
    {
      query_id: 2,
      request_id: 'SUP-2',
      user_id: 2,
      category: 'Technical',
      subject: 'Page error',
      description: 'Error on save',
      priority: 'URGENT',
      status: 'OPEN',
      response: null,
      created_at: '2026-02-05T10:00:00.000Z',
      updated_at: '2026-02-05T10:00:00.000Z',
      resolved_at: null,
      assigned_to: null,
    },
  ];

  beforeEach(async () => {
    supportService = {
      getSupportAnalytics: vi.fn().mockReturnValue(of(analytics)),
      getAllSupportRequests: vi.fn().mockReturnValue(of(tickets)),
    };

    await TestBed.configureTestingModule({
      imports: [SupportAnalyticsComponent],
      providers: [
        { provide: SupportService, useValue: supportService },
        { provide: Auth, useValue: { getUserRole: () => 'ADMIN' } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupportAnalyticsComponent);
    component = fixture.componentInstance;
  });

  it('1. should load aggregates for admins', () => {
    fixture.detectChanges();
    expect(supportService.getSupportAnalytics).toHaveBeenCalled();
    expect(component.data()?.total_tickets).toBe(10);
    expect(component.openCount()).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('Support Analytics');
  });

  it('2. should bucket slices and bars from aggregates', () => {
    fixture.detectChanges();
    expect(component.statusSlices().length).toBe(5);
    expect(component.prioritySlices().length).toBe(2);
    expect(component.categoryBars()[0]).toEqual({ label: 'General Inquiry', value: 6 });
    expect(component.roleBars()[0]).toEqual({ label: 'CITIZEN', value: 8 });
  });

  it('2b. should derive KPI and trend data from aggregates and tickets', () => {
    fixture.detectChanges();
    expect(component.inProgressCount()).toBe(3);
    expect(component.highPriorityCount()).toBe(4);
    expect(component.resolutionRate()).toBe('40%');
    expect(component.fastestResolution()).toBe('24h');
    expect(component.longestResolution()).toBe('24h');
    expect(component.recentActivity().length).toBe(2);
    expect(component.latestUpdates()[0].ticket).toBe('SUP-2');
    expect(component.priorityLegend()[0]).toEqual({
      label: 'High',
      count: 4,
      pct: '40%',
      color: '#f5a524',
    });
  });

  it('3. should redirect non-admins away without loading data', async () => {
    const { TestBed: TB } = await import('@angular/core/testing');
    TB.resetTestingModule();
    const navigate = vi.fn();
    await TB.configureTestingModule({
      imports: [SupportAnalyticsComponent],
      providers: [
        { provide: SupportService, useValue: supportService },
        { provide: Auth, useValue: { getUserRole: () => 'CITIZEN' } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();
    supportService.getSupportAnalytics.mockClear();
    const citizenFixture = TB.createComponent(SupportAnalyticsComponent);
    citizenFixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/citizen/support']);
    expect(supportService.getSupportAnalytics).not.toHaveBeenCalled();
  });

  it('4. should show an error state on failure', () => {
    supportService.getSupportAnalytics.mockReturnValue(
      throwError(() => ({ status: 500 })),
    );
    component.load();
    fixture.detectChanges();
    expect(component.error()).toContain('Unable to load');
  });
});
