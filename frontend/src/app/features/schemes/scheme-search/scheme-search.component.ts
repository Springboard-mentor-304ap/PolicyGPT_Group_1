import { Component, OnInit, inject, OnDestroy, signal, computed, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { SchemeService } from '../../../core/services/scheme.service';
import { ToastService } from '../../../core/services/toast.service';
import { getStatusLabel, getStatusBadgeClass } from '../../../core/utils/status.utils';
import { SchemeResponse, SchemeListResponse, SchemeFilters } from '../../../core/models/scheme.model';

@Component({
  selector: 'app-scheme-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './scheme-search.component.html',
  styleUrls: ['./scheme-search.component.scss'],
})
export class SchemeSearchComponent implements OnInit, OnDestroy {
  private readonly location = inject(Location);
  private readonly schemeService = inject(SchemeService);
  private readonly toastService = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  // Search & Filters
  searchQuery = '';
  selectedCategory = '';
  selectedMinistry = '';
  selectedDepartment = '';
  selectedState = '';

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
  categories = [
    'Agriculture',
    'Education',
    'Energy',
    'Financial Services',
    'Health',
    'Housing',
    'Skill Development',
    'Social Welfare',
    'Women & Child Welfare',
    'Employment',
    'Infrastructure',
    'Environment',
    'Digital Governance',
    'Rural Development',
    'Urban Development',
  ];

  ministries = [
    'Ministry of Agriculture & Farmers Welfare',
    'Ministry of Health & Family Welfare',
    'Ministry of Education',
    'Ministry of Finance',
    'Ministry of Housing and Urban Affairs',
    'Ministry of New & Renewable Energy',
    'Ministry of Micro, Small & Medium Enterprises',
    'Ministry of Rural Development',
    'Ministry of Skill Development & Entrepreneurship',
    'Ministry of Women and Child Development',
    'Ministry of Social Justice and Empowerment',
    'Ministry of Labour and Employment',
    'Ministry of Environment, Forest and Climate Change',
    'Ministry of Electronics and Information Technology',
  ];

  departments = [
    'Department of Agriculture & Farmers Welfare',
    'Department of School Education & Literacy',
    'Department of Higher Education',
    'Department of Health & Family Welfare',
    'Department of Rural Development',
    'Department of Financial Services',
    'Department of Social Justice & Empowerment',
    'Department of Economic Affairs',
  ];

  states = [
    'All India',
    'Central',
    'Andhra Pradesh',
    'Arunachal Pradesh',
    'Assam',
    'Bihar',
    'Chhattisgarh',
    'Delhi',
    'Goa',
    'Gujarat',
    'Haryana',
    'Himachal Pradesh',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Sikkim',
    'Tamil Nadu',
    'Telangana',
    'Tripura',
    'Uttar Pradesh',
    'Uttarakhand',
    'West Bengal',
  ];

  // Bookmarks
  private bookmarkedIds = signal<Set<number>>(new Set());

  // Computed
  getStatusLabel = getStatusLabel;
  getStatusBadgeClass = getStatusBadgeClass;

  ngOnInit(): void {
    this.setupDebouncedSearch();
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

    // SEARCH / VIEW SCHEMES: Only APPROVED schemes are displayed
    const filters: SchemeFilters = {
      keyword: this.searchQuery.trim() || undefined,
      category: this.selectedCategory || undefined,
      ministry: this.selectedMinistry || undefined,
      department: this.selectedDepartment || undefined,
      state: this.selectedState || undefined,
      status: 'APPROVED',
      page: this.currentPage(),
      limit: this.pageSize,
    };

    this.schemeService.getSchemes(filters).subscribe({
      next: (response: SchemeListResponse) => {
        this.schemes.set(Array.isArray(response?.schemes) ? response.schemes : []);
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

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.selectedMinistry = '';
    this.selectedDepartment = '';
    this.selectedState = '';
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

  // Bookmarking
  isBookmarked(schemeId: number): boolean {
    return this.bookmarkedIds().has(schemeId);
  }

  toggleBookmark(scheme: SchemeResponse): void {
    const current = new Set(this.bookmarkedIds());
    if (current.has(scheme.scheme_id)) {
      current.delete(scheme.scheme_id);
      this.toastService.info('Scheme removed from bookmarks');
    } else {
      current.add(scheme.scheme_id);
      this.toastService.success('Scheme bookmarked successfully');
    }
    this.bookmarkedIds.set(current);
    this.saveBookmarks();
    this.cdr.detectChanges();
  }

  private loadBookmarks(): void {
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