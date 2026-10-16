import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ViewUsersComponent } from './view-users.component';
import { AdminUsersService } from '../../../../../core/services/admin-user.service';

describe('ViewUsersComponent status display', () => {
  let fixture: ComponentFixture<ViewUsersComponent>;
  let component: ViewUsersComponent;
  let adminUsersService: AdminUsersService;

  const apiUsers = [
    {
      user_id: 1,
      full_name: 'Active Citizen',
      email: 'active@example.com',
      role: 'CITIZEN',
      phone: '9999999999',
      is_active: true,
      created_at: '2026-01-01',
    },
    {
      user_id: 2,
      full_name: 'Inactive Citizen',
      email: 'inactive@example.com',
      role: 'CITIZEN',
      phone: '8888888888',
      is_active: false,
      created_at: '2026-01-02',
    },
    {
      user_id: 3,
      full_name: 'Active Official',
      email: 'official@example.com',
      role: 'GOVERNMENT_OFFICIAL',
      phone: '7777777777',
      is_active: true,
      created_at: '2026-01-03',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewUsersComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    adminUsersService = TestBed.inject(AdminUsersService);
    vi.spyOn(adminUsersService, 'getUsers').mockReturnValue(of(apiUsers as any));
    vi.spyOn(adminUsersService, 'getUserStats').mockReturnValue(
      of({ total: 3 } as any),
    );
    fixture = TestBed.createComponent(ViewUsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('maps persisted is_active to Active/Inactive without defaulting', () => {
    const byName = new Map(component.users.map((u) => [u.fullName, u.status]));
    expect(byName.get('Active Citizen')).toBe('Active');
    expect(byName.get('Inactive Citizen')).toBe('Inactive');
    expect(byName.get('Active Official')).toBe('Active');
  });

  it('filters All / Active / Inactive from persisted status', () => {
    component.selectedStatus = 'ALL';
    expect(component.filteredUsers.length).toBe(3);
    component.selectedStatus = 'Active';
    expect(component.filteredUsers.map((u) => u.fullName)).toEqual([
      'Active Citizen',
      'Active Official',
    ]);
    component.selectedStatus = 'Inactive';
    expect(component.filteredUsers.map((u) => u.fullName)).toEqual([
      'Inactive Citizen',
    ]);
  });

  it('keeps search, status filter and pagination consistent', () => {
    component.searchText = 'citizen';
    component.selectedStatus = 'Inactive';
    expect(component.filteredUsers.length).toBe(1);
    expect(component.activeUsers).toBe(2);
    expect(component.inactiveUsers).toBe(1);
    component.searchText = 'no-such-user-zzz';
    expect(component.filteredUsers.length).toBe(0);
  });

  it('renders the persisted status badges in the table', () => {
    component.selectedStatus = 'ALL';
    component.pageSize = 10;
    fixture.detectChanges();
    const pills = Array.from(
      fixture.nativeElement.querySelectorAll('.users-status'),
    ) as HTMLElement[];
    const texts = pills.map((p) => p.textContent?.trim());
    expect(texts).toContain('Active');
    expect(texts).toContain('Inactive');
  });
});
