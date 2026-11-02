import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchemeSearchComponent } from './scheme-search.component';
import { SchemeService } from '../../../core/services/scheme.service';
import { ToastService } from '../../../core/services/toast.service';
import { SchemeListResponse, SchemeResponse } from '../../../core/models/scheme.model';

describe('SchemeSearchComponent', () => {
  let component: SchemeSearchComponent;
  let fixture: ComponentFixture<SchemeSearchComponent>;
  let schemeService: SchemeService;
  let toastService: ToastService;

  const mockApprovedScheme: SchemeResponse = {
    scheme_id: 101,
    name: 'National Solar Mission',
    description: 'Promoting solar energy adoption nationwide.',
    category: 'Energy',
    ministry: 'Ministry of New & Renewable Energy',
    department: 'Department of Renewable Energy',
    state: 'All India',
    status: 'APPROVED',
    benefits: ['Subsidy on solar panels'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  const mockSchemeList: SchemeListResponse = {
    schemes: [mockApprovedScheme],
    total: 1,
    page: 1,
    pages: 1,
    limit: 10,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemeSearchComponent],
      providers: [
        SchemeService,
        ToastService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SchemeSearchComponent);
    component = fixture.componentInstance;
    schemeService = TestBed.inject(SchemeService);
    toastService = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. should create the SchemeSearchComponent', () => {
    expect(component).toBeTruthy();
  });

  it('2. ngOnInit() should immediately call loadSchemes() with status=APPROVED', () => {
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockSchemeList));

    component.ngOnInit();

    expect(schemeService.getSchemes).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'APPROVED',
        page: 1,
        limit: 10,
      })
    );
    expect(component.schemes().length).toBe(1);
    expect(component.schemes()[0].status).toBe('APPROVED');
    expect(component.totalResults()).toBe(1);
  });

  it('3. search input should trigger debounced query with keyword', () => {
    vi.useFakeTimers();
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockSchemeList));

    component.ngOnInit();
    component.searchQuery = 'Solar';
    component.onSearchChange();

    vi.advanceTimersByTime(400);

    expect(schemeService.getSchemes).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: 'Solar',
        status: 'APPROVED',
      })
    );
  });

  it('4. clearFilters() should reset search criteria and reload APPROVED schemes', () => {
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockSchemeList));

    component.searchQuery = 'Solar';
    component.selectedCategory = 'Energy';
    component.clearFilters();

    expect(component.searchQuery).toBe('');
    expect(component.selectedCategory).toBe('');
    expect(schemeService.getSchemes).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'APPROVED',
      })
    );
  });

  it('5. toggleBookmark() should toggle scheme in bookmark list', () => {
    vi.spyOn(toastService, 'success').mockReturnValue(undefined as any);
    vi.spyOn(toastService, 'info').mockReturnValue(undefined as any);
    expect(component.isBookmarked(101)).toBe(false);

    component.toggleBookmark(mockApprovedScheme);
    expect(component.isBookmarked(101)).toBe(true);
    expect(toastService.success).toHaveBeenCalledWith('Scheme bookmarked successfully');

    component.toggleBookmark(mockApprovedScheme);
    expect(component.isBookmarked(101)).toBe(false);
    expect(toastService.info).toHaveBeenCalledWith('Scheme removed from bookmarks');
  });

  it('6. status filter maps every workflow display value', () => {
    const cases: Array<[string, string]> = [
      ['Approved', 'APPROVED'],
      ['Pending Approval', 'PENDING_APPROVAL'],
      ['Draft', 'DRAFT'],
      ['Rejected', 'REJECTED'],
      ['Archived', 'ARCHIVED'],
      ['Archive Requested', 'ARCHIVE_REQUESTED'],
      ['Delete Requested', 'DELETE_REQUESTED'],
    ];
    vi.spyOn(schemeService, 'getSchemes').mockReturnValue(of(mockSchemeList));
    for (const [display, value] of cases) {
      component.onStatusDisplayChange(display);
      expect(component.selectedStatus).toBe(value);
    }
    expect(component.statusDisplayOptions).toEqual([
      'Approved',
      'Pending Approval',
      'Draft',
      'Rejected',
      'Archived',
      'Archive Requested',
      'Delete Requested',
    ]);
  });

  it('7. status badge labels resolve for every workflow status', () => {
    const labels: Record<string, string> = {
      DRAFT: 'Draft',
      PENDING_APPROVAL: 'Pending Approval',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      ARCHIVED: 'Archived',
      ARCHIVE_REQUESTED: 'Archive Requested',
      DELETE_REQUESTED: 'Delete Requested',
    };
    for (const [status, label] of Object.entries(labels)) {
      expect(component.getStatusLabel(status)).toBe(label);
    }
  });
});
