import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { SchemeService, Scheme, SchemeListResponse } from '../../../core/services/scheme.service';

@Component({
  selector: 'app-scheme-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './scheme-search.component.html',
  styleUrls: ['./scheme-search.component.scss']
})
export class SchemeSearchComponent implements OnInit, OnDestroy {
  private readonly location = inject(Location);
  private readonly schemeService = inject(SchemeService);

  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<string>();

  searchQuery = '';
  selectedCategory = '';
  selectedMinistry = '';
  selectedState = '';
  selectedStatus = '';

  schemes: Scheme[] = [];
  totalResults = 0;
  currentPage = 1;
  totalPages = 1;
  readonly pageSize = 10;

  loading = false;
  errorMessage = '';

  categories: string[] = [
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
    'Urban Development'
  ];

  ministries: string[] = [
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
    'Ministry of Electronics and Information Technology'
  ];

  states: string[] = [
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
    'West Bengal'
  ];

  statuses: string[] = [
    'APPROVED',
    'DRAFT',
    'PENDING_APPROVAL',
    'REJECTED',
    'ARCHIVED',
    'ARCHIVE_REQUESTED',
    'DELETE_REQUESTED'
  ];

  ngOnInit(): void {
    this.setupDebouncedSearch();
    this.loadSchemes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupDebouncedSearch(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.currentPage = 1;
      this.loadSchemes();
    });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  loadSchemes(): void {
    this.loading = true;
    this.errorMessage = '';

    this.schemeService.getSchemes({
      keyword: this.searchQuery.trim() || undefined,
      category: this.selectedCategory || undefined,
      ministry: this.selectedMinistry || undefined,
      state: this.selectedState || undefined,
      status: this.selectedStatus || undefined,
      page: this.currentPage,
      limit: this.pageSize
    }).subscribe({
      next: (response: SchemeListResponse) => {
        this.schemes = Array.isArray(response?.schemes) ? response.schemes : [];
        this.totalResults = Number(response?.total) || 0;
        this.currentPage = Number(response?.page) || 1;
        this.totalPages = Number(response?.pages) > 0 ? Number(response.pages) : 1;
        this.loading = false;
      },
      error: (error) => {
        console.error('Scheme API Error:', error);
        this.errorMessage = this.getErrorMessage(error);
        this.schemes = [];
        this.totalResults = 0;
        this.totalPages = 1;
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadSchemes();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.selectedMinistry = '';
    this.selectedState = '';
    this.selectedStatus = '';
    this.currentPage = 1;
    this.loadSchemes();
  }

  nextPage(): void {
    if (this.currentPage >= this.totalPages) return;
    this.currentPage++;
    this.loadSchemes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  previousPage(): void {
    if (this.currentPage <= 1) return;
    this.currentPage--;
    this.loadSchemes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.loadSchemes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    for (let page = start; page <= end; page++) {
      pages.push(page);
    }
    return pages;
  }

  toggleBookmark(scheme: Scheme): void {
    const bookmarks = this.getBookmarks();
    const index = bookmarks.indexOf(scheme.scheme_id);

    if (index === -1) {
      bookmarks.push(scheme.scheme_id);
    } else {
      bookmarks.splice(index, 1);
    }

    localStorage.setItem('scheme_bookmarks', JSON.stringify(bookmarks));
  }

  isBookmarked(schemeId: number): boolean {
    return this.getBookmarks().includes(schemeId);
  }

  private getBookmarks(): number[] {
    try {
      const stored = localStorage.getItem('scheme_bookmarks');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }

  getStatusLabel(status: string): string {
    if (!status) return '';
    return status
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return 'Not specified';
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  goBack(): void {
    this.location.back();
  }

  private getErrorMessage(error: any): string {
    if (error?.error?.detail) {
      return error.error.detail;
    }
    if (error?.status === 401) {
      return 'Your session has expired. Please login again.';
    }
    if (error?.status === 403) {
      return 'You do not have permission to view these schemes.';
    }
    if (error?.status === 404) {
      return 'Scheme API endpoint was not found.';
    }
    if (error?.status === 0) {
      return 'Unable to connect to the backend server.';
    }
    if (error?.message) {
      return error.message;
    }
    return 'Unable to load schemes. Please try again.';
  }
}