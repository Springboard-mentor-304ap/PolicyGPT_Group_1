import { Component, OnInit, inject, OnDestroy, signal, computed, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { SchemeService } from '../../../core/services/scheme.service';
import { SavedItemsService } from '../../../core/services/saved-items.service';
import { SearchHistoryService } from '../../../core/services/search-history.service';
import { ToastService } from '../../../core/services/toast.service';
import { Auth } from '../../../core/services/auth';
import { SchemeResponse, SchemeListResponse, SchemeFilters } from '../../../core/models/scheme.model';
import { getStatusLabel, getStatusBadgeClass } from '../../../core/utils/status.utils';
import {
  SCHEME_CATEGORIES,
  MINISTRIES,
  MINISTRY_DEPARTMENTS_MAP,
  ALL_DEPARTMENTS,
  STATES,
} from '../../../core/constants/government-data.constants';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-scheme-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SearchableSelectComponent],
  templateUrl: './scheme-search.component.html',
  styleUrls: ['./scheme-search.component.scss'],
})
export class SchemeSearchComponent implements OnInit, OnDestroy {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly schemeService = inject(SchemeService);
  private readonly savedItemsService = inject(SavedItemsService);
  private readonly searchHistoryService = inject(SearchHistoryService);
  private readonly toastService = inject(ToastService);
  private readonly auth = inject(Auth);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  // Search & Filters (Scheme Name, Department, State, Sector, Publication Date, Status)
  searchQuery = '';
  selectedDepartment = '';
  selectedState = '';
  selectedSector = '';
  selectedPublicationDate = '';
  selectedStatus = '';
  selectedCategory = '';
  selectedMinistry = '';

  // Data
  schemes = signal<SchemeResponse[]>([]);
  totalResults = signal(0);
  currentPage = signal(1);
  totalPages = signal(1);
  readonly pageSize = 10;

  // UI State
  loading = signal(false);
  errorMessage = signal('');

  // Filter options
  categories = SCHEME_CATEGORIES;
  sectors = SCHEME_CATEGORIES;
  ministries = MINISTRIES;
  states = STATES;
  departments = ALL_DEPARTMENTS;

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
    { label: 'Draft', value: 'DRAFT' },
    { label: 'Rejected', value: 'REJECTED' },
    { label: 'Archived', value: 'ARCHIVED' },
  ];

  readonly statusDisplayOptions: string[] = [
    'Approved',
    'Pending Approval',
    'Draft',
    'Rejected',
    'Archived',
  ];

  selectedStatusDisplay = '';

  onStatusDisplayChange(displayVal: string): void {
    const map: Record<string, string> = {
      'Approved': 'APPROVED',
      'Pending Approval': 'PENDING_APPROVAL',
      'Draft': 'DRAFT',
      'Rejected': 'REJECTED',
      'Archived': 'ARCHIVED',
    };
    this.selectedStatus = map[displayVal] || '';
    this.applyFilters();
  }

  get activeFiltersCount(): number {
    let count = 0;
    if (this.selectedDepartment) count++;
    if (this.selectedState) count++;
    if (this.selectedSector) count++;
    if (this.selectedPublicationDate) count++;
    if (this.isAdminOrGov && this.selectedStatus) count++;
    return count;
  }

  get hasActiveFilters(): boolean {
    return this.activeFiltersCount > 0 || !!this.searchQuery.trim();
  }

  get hasActiveFilterChips(): boolean {
    return this.activeFiltersCount > 0;
  }

  clearPublicationDate(event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedPublicationDate = '';
    this.applyFilters();
  }

  onMinistryChange(): void {
    if (this.selectedMinistry && this.selectedDepartment) {
      const specific = MINISTRY_DEPARTMENTS_MAP[this.selectedMinistry];
      if (specific && specific.length > 0 && !specific.includes(this.selectedDepartment)) {
        this.selectedDepartment = '';
      }
    }
    this.applyFilters();
  }

  // Bookmarks (server is source of truth)
  private bookmarkedIds = signal<Set<number>>(new Set());
  private savedSchemesLoaded = false;
  private pendingBookmarkIds = new Set<number>();

  // Computed
  getStatusLabel = getStatusLabel;
  getStatusBadgeClass = getStatusBadgeClass;

  get userRole(): string {
    return String(this.auth?.getUserRole() || '')
      .trim()
      .toUpperCase();
  }

  get isAdminOrGov(): boolean {
    const role = this.userRole;
    return (
      role === 'ADMIN' ||
      role === 'ADMINISTRATOR' ||
      role === 'GOVERNMENT' ||
      role === 'GOVERNMENT_OFFICIAL'
    );
  }

  get rolePrefix(): string {
    switch (this.userRole) {
      case 'ADMIN':
      case 'ADMINISTRATOR':
        return 'admin';
      case 'GOVERNMENT':
      case 'GOVERNMENT_OFFICIAL':
        return 'government';
      case 'RESEARCHER':
        return 'researcher';
      case 'ORGANIZATION':
      case 'ORGANISATION':
        return 'organization';
      case 'GUEST':
        return 'guest';
      case 'CITIZEN':
      default:
        return 'citizen';
    }
  }

  getSchemeDetailsRoute(schemeId: number | string): any[] {
    const id = Number(schemeId);
    if (!Number.isFinite(id) || id <= 0) {
      return ['/'];
    }
    return ['/dashboard', this.rolePrefix, 'schemes', id];
  }

  trackBySchemeId(index: number, scheme: SchemeResponse): number {
    return Number(scheme.scheme_id);
  }

  ngOnInit(): void {
    this.setupDebouncedSearch();
    this.restoreSearchFromQueryParams();
    this.loadBookmarks();
    this.loadSchemes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupDebouncedSearch(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadSchemes();
      });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  loadSchemes(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.cdr.detectChanges();

    const status = this.isAdminOrGov
      ? (this.selectedStatus && this.selectedStatus.toUpperCase() !== 'ALL' ? this.selectedStatus : undefined)
      : 'APPROVED';

    const filters: SchemeFilters = {
      keyword: this.searchQuery.trim() || undefined,
      department: this.selectedDepartment || undefined,
      state: this.selectedState || undefined,
      sector: this.selectedSector || undefined,
      publication_date: this.selectedPublicationDate || undefined,
      status,
      page: this.currentPage(),
      limit: this.pageSize,
    };

    this.schemeService.getSchemes(filters).subscribe({
      next: (response: SchemeListResponse) => {
        const rawSchemes = Array.isArray(response?.schemes) ? response.schemes : [];
        let filtered = rawSchemes;

        if (!this.isAdminOrGov) {
          filtered = rawSchemes.filter(
            (s) => String(s?.status || '').trim().toUpperCase() === 'APPROVED'
          );
        } else if (this.selectedStatus && this.selectedStatus.toUpperCase() !== 'ALL') {
          filtered = rawSchemes.filter(
            (s) => String(s?.status || '').trim().toUpperCase() === this.selectedStatus.toUpperCase()
          );
        }

        this.schemes.set(filtered);
        this.totalResults.set(Number(response?.total) || 0);
        this.currentPage.set(Number(response?.page) || 1);
        this.totalPages.set(Number(response?.pages) > 0 ? Number(response.pages) : 1);
        this.loading.set(false);
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Scheme API Error:', error);
        this.errorMessage.set(this.getErrorMessage(error));
        this.schemes.set([]);
        this.totalResults.set(0);
        this.totalPages.set(1);
        this.loading.set(false);
        this.cdr.detectChanges();
      },
    });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadSchemes();
  }

  /**
   * Explicit user search (Search button / Enter key). Runs the search
   * and records it to server-side search history exactly once per
   * distinct query+filter combination.
   */
  submitSearch(): void {
    this.applyFilters();
    this.recordSearch();
  }

  private lastRecordedSearchKey: string | null = null;

  private recordSearch(): void {
    const filters: Record<string, string> = {};
    if (this.selectedCategory) filters['category'] = this.selectedCategory;
    if (this.selectedMinistry) filters['ministry'] = this.selectedMinistry;
    if (this.selectedDepartment) filters['department'] = this.selectedDepartment;
    if (this.selectedState) filters['state'] = this.selectedState;
    if (this.selectedSector) filters['sector'] = this.selectedSector;
    if (this.selectedPublicationDate)
      filters['publication_date'] = this.selectedPublicationDate;
    if (this.selectedStatus) filters['status'] = this.selectedStatus;

    const key = JSON.stringify([this.searchQuery.trim(), filters]);
    if (key === this.lastRecordedSearchKey) {
      return;
    }
    this.lastRecordedSearchKey = key;
    this.searchHistoryService
      .recordSearch({
        search_query: this.searchQuery.trim() || '(all schemes)',
        search_type: 'SCHEME',
        filters,
      })
      .subscribe({
        next: () => undefined,
        error: () => undefined,
      });
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedDepartment = '';
    this.selectedState = '';
    this.selectedSector = '';
    this.selectedPublicationDate = '';
    this.selectedStatus = '';
    this.selectedStatusDisplay = '';
    this.selectedCategory = '';
    this.selectedMinistry = '';
    this.currentPage.set(1);
    this.loadSchemes();
  }

  nextPage(): void {
    if (this.currentPage() >= this.totalPages()) return;
    this.currentPage.update((p) => p + 1);
    this.loadSchemes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  previousPage(): void {
    if (this.currentPage() <= 1) return;
    this.currentPage.update((p) => p - 1);
    this.loadSchemes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.currentPage.set(page);
    this.loadSchemes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goBack(): void {
    this.location.back();
  }

  get pageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;

    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Bookmarking (server is source of truth)
  isBookmarked(schemeId: number): boolean {
    return this.bookmarkedIds().has(schemeId);
  }

  isBookmarkPending(schemeId: number): boolean {
    return this.pendingBookmarkIds.has(schemeId);
  }

  toggleBookmark(scheme: SchemeResponse): void {
    const id = Number(scheme.scheme_id);

    if (!Number.isFinite(id) || id <= 0) {
      return;
    }

    if (!this.canUseSavedItems) {
      this.toggleLocalBookmark(id);
      return;
    }

    if (this.pendingBookmarkIds.has(id)) {
      return;
    }

    this.pendingBookmarkIds.add(id);

    if (this.bookmarkedIds().has(id)) {
      this.savedItemsService.unsaveScheme(id).subscribe({
        next: () => {
          const current = new Set(this.bookmarkedIds());
          current.delete(id);
          this.bookmarkedIds.set(current);
          this.saveBookmarks();
          this.pendingBookmarkIds.delete(id);
          this.toastService.info('Scheme removed from saved items');
          this.cdr.detectChanges();
        },
        error: () => {
          this.pendingBookmarkIds.delete(id);
          this.toastService.error('Could not remove scheme. Please retry.');
          this.cdr.detectChanges();
        },
      });
    } else {
      this.savedItemsService.saveScheme(id).subscribe({
        next: () => {
          const current = new Set(this.bookmarkedIds());
          current.add(id);
          this.bookmarkedIds.set(current);
          this.saveBookmarks();
          this.pendingBookmarkIds.delete(id);
          this.toastService.success('Scheme saved successfully');
          this.cdr.detectChanges();
        },
        error: () => {
          this.pendingBookmarkIds.delete(id);
          this.toastService.error('Could not save scheme. Please retry.');
          this.cdr.detectChanges();
        },
      });
    }
  }

  private get canUseSavedItems(): boolean {
    const role = this.userRole;
    return (
      role === 'CITIZEN' ||
      role === 'RESEARCHER' ||
      role === 'ORGANIZATION' ||
      role === 'ORGANISATION'
    );
  }

  /**
   * Populate search fields from URL query parameters (Search Again).
   * Only known filter keys are honored; unknown keys are ignored.
   */
  private restoreSearchFromQueryParams(): void {
    const params = this.route.snapshot.queryParams;
    if (!params || typeof params !== 'object') {
      return;
    }
    const text = (value: unknown): string =>
      typeof value === 'string' ? value : '';
    if (text(params['q'])) {
      this.searchQuery = text(params['q']);
    }
    if (text(params['category'])) {
      this.selectedCategory = text(params['category']);
    }
    if (text(params['ministry'])) {
      this.selectedMinistry = text(params['ministry']);
    }
    if (text(params['department'])) {
      this.selectedDepartment = text(params['department']);
    }
    if (text(params['state'])) {
      this.selectedState = text(params['state']);
    }
    if (text(params['sector'])) {
      this.selectedSector = text(params['sector']);
    }
    if (text(params['publication_date'])) {
      this.selectedPublicationDate = text(params['publication_date']);
    }
    if (text(params['status'])) {
      this.selectedStatus = text(params['status']);
    }
  }

  private toggleLocalBookmark(id: number): void {
    const current = new Set(this.bookmarkedIds());
    if (current.has(id)) {
      current.delete(id);
      this.toastService.info('Scheme removed from bookmarks');
    } else {
      current.add(id);
      this.toastService.success('Scheme bookmarked successfully');
    }
    this.bookmarkedIds.set(current);
    this.saveBookmarks();
    this.cdr.detectChanges();
  }

  private loadBookmarks(): void {
    if (!this.canUseSavedItems) {
      this.loadLocalBookmarks();
      return;
    }

    this.savedItemsService.getSavedSchemes().subscribe({
      next: (items) => {
        this.bookmarkedIds.set(
          new Set((items ?? []).map((item) => Number(item.scheme_id))),
        );
        this.savedSchemesLoaded = true;
        this.saveBookmarks();
        this.cdr.detectChanges();
      },
      error: () => {
        this.savedSchemesLoaded = false;
        this.loadLocalBookmarks();
        this.cdr.detectChanges();
      },
    });
  }

  private loadLocalBookmarks(): void {
    try {
      const saved = localStorage.getItem('bookmarked_schemes');
      if (saved) {
        this.bookmarkedIds.set(new Set(JSON.parse(saved)));
      }
    } catch {
      this.bookmarkedIds.set(new Set());
    }
  }

  private saveBookmarks(): void {
    try {
      localStorage.setItem(
        'bookmarked_schemes',
        JSON.stringify(Array.from(this.bookmarkedIds()))
      );
    } catch {
      // Ignore localStorage errors
    }
  }

  private getErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error?.error?.detail) {
      if (typeof error.error.detail === 'string') return error.error.detail;
      if (Array.isArray(error.error.detail)) {
        return error.error.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
      }
    }
    return error?.message || 'Failed to load schemes. Please try again.';
  }
}