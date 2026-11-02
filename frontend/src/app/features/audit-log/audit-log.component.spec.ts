import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditLogComponent } from './audit-log.component';
import { AuditLogService } from '../../core/services/audit-log.service';
import { Auth } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast.service';

describe('AuditLogComponent', () => {
  let component: AuditLogComponent;
  let fixture: ComponentFixture<AuditLogComponent>;
  let auditLogService: { getAuditLogs: ReturnType<typeof vi.fn> };

  const mockLogs = [
    {
      audit_id: 1,
      user_id: 3,
      user_name: 'Test Citizen',
      user_email: 'citizen@gmail.com',
      user_role: 'CITIZEN',
      action: 'AUTH_LOGIN_SUCCESS',
      entity_type: 'USER',
      entity_id: 3,
      description: 'User citizen@gmail.com logged in.',
      ip_address: '127.0.0.1',
      created_at: '2026-09-30T10:32:14.000Z',
    },
  ];

  beforeEach(async () => {
    auditLogService = {
      getAuditLogs: vi.fn().mockReturnValue(of(mockLogs)),
    };

    await TestBed.configureTestingModule({
      imports: [AuditLogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuditLogService, useValue: auditLogService },
        { provide: Auth, useValue: { getUserRole: () => 'ADMIN' } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogComponent);
    component = fixture.componentInstance;
  });

  it('1. should create the AuditLogComponent', () => {
    expect(component).toBeTruthy();
  });

  it('2. ngOnInit() should load audit logs for admin', () => {
    fixture.detectChanges();
    expect(auditLogService.getAuditLogs).toHaveBeenCalled();
    expect(component.logs().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('3. stats should count total logs', () => {
    fixture.detectChanges();
    expect(component.stats().total).toBe(1);
  });

  it('4. search should narrow the visible logs', () => {
    fixture.detectChanges();
    component.searchQuery.set('APPROVE');
    expect(component.filteredLogs().length).toBe(0);
    component.searchQuery.set('LOGIN');
    expect(component.filteredLogs().length).toBe(1);
  });

  it('5. formatAction should replace underscores for display only', () => {
    expect(component.formatAction('SUPPORT_REQUEST_RESPONDED')).toBe('SUPPORT REQUEST RESPONDED');
    expect(component.formatAction('AUTH_LOGIN_SUCCESS')).toBe('AUTH LOGIN SUCCESS');
  });

  it('6. pagination should page filtered logs ten at a time', () => {
    fixture.detectChanges();
    const many = Array.from({ length: 25 }, (_, i) => ({
      audit_id: 100 + i,
      user_id: 3,
      user_name: 'Test Citizen',
      user_email: 'citizen@gmail.com',
      user_role: 'CITIZEN',
      action: 'AUTH_LOGIN_SUCCESS',
      entity_type: 'USER',
      entity_id: 3,
      description: 'Login ok.',
      ip_address: '127.0.0.1',
      created_at: '2026-09-30T10:32:14.000Z',
    }));
    component.logs.set(many as never);
    expect(component.totalPages()).toBe(3);
    expect(component.pagedLogs().length).toBe(10);
    expect(component.pageRangeText()).toContain('1–10');
    component.goToPage(3);
    expect(component.pagedLogs().length).toBe(5);
    component.goToPage(99);
    expect(component.currentPage()).toBe(3);
  });

  it('7. filter changes should reset to the first page', () => {
    fixture.detectChanges();
    const many = Array.from({ length: 25 }, (_, i) => ({
      audit_id: 200 + i,
      user_id: 3,
      user_name: 'Test Citizen',
      user_email: 'citizen@gmail.com',
      user_role: 'CITIZEN',
      action: 'AUTH_LOGIN_SUCCESS',
      entity_type: 'USER',
      entity_id: 3,
      description: 'Login ok.',
      ip_address: '127.0.0.1',
      created_at: '2026-09-30T10:32:14.000Z',
    }));
    component.logs.set(many as never);
    component.goToPage(3);
    expect(component.currentPage()).toBe(3);
    component.onSearchChanged('LOGIN');
    expect(component.currentPage()).toBe(1);
    component.goToPage(3);
    component.onRoleChanged('CITIZEN');
    expect(component.currentPage()).toBe(1);
  });
});
