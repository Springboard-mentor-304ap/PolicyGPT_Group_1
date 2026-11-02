import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SearchHistoryComponent } from './search-history.component';
import { SearchHistoryService } from '../../core/services/search-history.service';
import { Auth } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast.service';

describe('SearchHistoryComponent', () => {
  let component: SearchHistoryComponent;
  let fixture: ComponentFixture<SearchHistoryComponent>;
  let historyServiceMock: any;

  const mockRows: any[] = [
    {
      history_id: 1,
      user_id: 7,
      search_query: 'pm',
      search_type: 'POLICY',
      filters: null,
      searched_at: '2026-10-03T11:42:00',
    },
    {
      history_id: 2,
      user_id: 7,
      search_query: 'health',
      search_type: 'SCHEME',
      filters: { state: 'Tamil Nadu', category: 'Education' },
      searched_at: '2026-09-30T00:49:00',
    },
    {
      history_id: 3,
      user_id: 7,
      search_query: 'draft',
      search_type: 'SCHEME',
      filters: {},
      searched_at: '2026-10-01T12:48:00',
    },
  ];

  const mockStats = { total_searches: 4, policy_searches: 1, scheme_searches: 3 };

  function configure(stats$: any = of(mockStats)): void {
    historyServiceMock = {
      getUserSearchHistory: vi.fn().mockReturnValue(of(mockRows)),
      getSearchHistoryStatistics: vi.fn().mockReturnValue(stats$),
      deleteSearchHistoryItem: vi.fn().mockReturnValue(of({ message: 'ok' })),
      deleteUserSearchHistory: vi.fn().mockReturnValue(of({ message: 'ok', deleted_count: 3 })),
    };

    TestBed.configureTestingModule({
      imports: [SearchHistoryComponent],
      providers: [
        provideRouter([]),
        { provide: SearchHistoryService, useValue: historyServiceMock },
        {
          provide: Auth,
          useValue: {
            getStoredUser: vi.fn().mockReturnValue({ user_id: 7, role: 'CITIZEN' }),
            getUserRole: vi.fn().mockReturnValue('CITIZEN'),
          },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        },
      ],
    });
  }

  beforeEach(async () => {
    configure();
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(SearchHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. should load rows and backend statistics', () => {
    expect(component.loading).toBe(false);
    expect(component.error).toBeNull();
    expect(component.rows.length).toBe(3);
    expect(component.totalCount).toBe(4);
    expect(component.policyCount).toBe(1);
    expect(component.schemeCount).toBe(3);
  });

  it('2. should derive counts from rows when statistics fail', async () => {
    TestBed.resetTestingModule();
    configure(throwError(() => new Error('stats down')));
    await TestBed.compileComponents();
    const f2 = TestBed.createComponent(SearchHistoryComponent);
    const c2 = f2.componentInstance;
    f2.detectChanges();
    expect(c2.stats).toBeNull();
    expect(c2.totalCount).toBe(3);
    expect(c2.policyCount).toBe(1);
    expect(c2.schemeCount).toBe(2);
    TestBed.resetTestingModule();
  });

  it('3. should filter rows by type tab', () => {
    component.setFilter('SCHEME');
    expect(component.filteredRows.length).toBe(2);
    component.setFilter('POLICY');
    expect(component.filteredRows.length).toBe(1);
    component.setFilter('ALL');
    expect(component.filteredRows.length).toBe(3);
  });

  it('4. should return no filter chips when a record has no filters', () => {
    expect(component.filterChips(mockRows[0])).toEqual([]);
    expect(component.filterChips(mockRows[2])).toEqual([]);
  });

  it('5. should build readable chips for multiple filters', () => {
    expect(component.filterChips(mockRows[1])).toEqual([
      { key: 'state', label: 'State: Tamil Nadu' },
      { key: 'category', label: 'Category: Education' },
    ]);
  });

  it('6. should split date and time parts', () => {
    const parts = component.formatDateParts('2026-10-03T11:42:00');
    expect(parts.date).toContain('2026');
    expect(parts.time.length).toBeGreaterThan(0);
    expect(component.formatDateParts(null)).toEqual({ date: '—', time: '' });
  });

  it('7. should label scheme and policy types', () => {
    expect(component.isScheme(mockRows[1])).toBe(true);
    expect(component.isScheme(mockRows[0])).toBe(false);
    expect(component.typeLabel(mockRows[1])).toBe('Scheme');
    expect(component.typeLabel(mockRows[0])).toBe('Policy');
  });

  it('8. should remove a row on delete without touching the rest', () => {
    component.askDelete(mockRows[0]);
    expect(component.rows.length).toBe(2);
    expect(component.rows.every((r) => r.history_id !== 1)).toBe(true);
  });
});
