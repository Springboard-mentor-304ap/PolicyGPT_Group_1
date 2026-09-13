import { Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface Scheme {
  id: number;
  title: string;
  ministry: string;
  category: string;
  state: string;
  targetGroup: string;
  isBookmarked?: boolean;
}

@Component({
  selector: 'app-scheme-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './scheme-search.component.html',
  styleUrls: ['./scheme-search.component.scss']
})
export class SchemeSearchComponent {
  private readonly location = inject(Location);

  searchQuery = '';
  selectedCategory = 'All Categories';
  selectedMinistry = 'All Ministries';
  selectedState = 'All States';
  selectedTargetGroup = 'All';

  itemsToShow = 8;

  allSchemes: Scheme[] = [
    { id: 1, title: 'PM Kisan Samman Nidhi', ministry: 'Ministry of Agriculture & Farmers Welfare', category: 'Agriculture', state: 'Central', targetGroup: 'Farmers' },
    { id: 2, title: 'PM Surya Ghar Muft Bijli Yojana', ministry: 'Ministry of New & Renewable Energy', category: 'Energy', state: 'Central', targetGroup: 'Citizens' },
    { id: 3, title: 'Post Matric Scholarship Scheme', ministry: 'Ministry of Health & Family Welfare', category: 'Education', state: 'Central', targetGroup: 'Students' },
    { id: 4, title: 'PM Vishwakarma Yojana', ministry: 'Ministry of Micro, Small & Medium Enterprises', category: 'Skill Development', state: 'Central', targetGroup: 'Youth & Entrepreneurs' },
    { id: 5, title: 'Pradhan Mantri Jan Arogya Yojana (PM-JAY)', ministry: 'Ministry of Health & Family Welfare', category: 'Health', state: 'Central', targetGroup: 'Citizens' },
    { id: 6, title: 'PM Surya Ghar Muft Bijli Yojana', ministry: 'Ministry of New & Renewable Energy', category: 'Energy', state: 'Central', targetGroup: 'Citizens' },
    { id: 7, title: 'Post Matric Scholarship Scheme', ministry: 'Ministry of Health & Family Welfare', category: 'Education', state: 'Central', targetGroup: 'Students' },
    { id: 8, title: 'PM Vishwakarma Yojana', ministry: 'Ministry of Micro, Small & Medium Enterprises', category: 'Skill Development', state: 'Central', targetGroup: 'Youth & Entrepreneurs' },
    { id: 9, title: 'Pradhan Mantri Jan Dhan Yojana', ministry: 'Ministry of Finance', category: 'Financial Services', state: 'Central', targetGroup: 'Citizens' },
    { id: 10, title: 'Pradhan Mantri Awas Yojana', ministry: 'Ministry of Housing and Urban Affairs', category: 'Housing', state: 'Central', targetGroup: 'Citizens' }
  ];

  filteredSchemes: Scheme[] = [...this.allSchemes];

  get visibleSchemes(): Scheme[] {
    return this.filteredSchemes.slice(0, this.itemsToShow);
  }

  applyFilters(): void {
    const q = this.searchQuery.toLowerCase().trim();

    this.filteredSchemes = this.allSchemes.filter(s => {
      const matchesQuery = !q || s.title.toLowerCase().includes(q) || s.ministry.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
      const matchesCat = this.selectedCategory === 'All Categories' || s.category === this.selectedCategory;
      const matchesMinistry = this.selectedMinistry === 'All Ministries' || s.ministry === this.selectedMinistry;
      const matchesState = this.selectedState === 'All States' || s.state === this.selectedState;
      const matchesTarget = this.selectedTargetGroup === 'All' || s.targetGroup === this.selectedTargetGroup;

      return matchesQuery && matchesCat && matchesMinistry && matchesState && matchesTarget;
    });

    this.itemsToShow = 8;
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'All Categories';
    this.selectedMinistry = 'All Ministries';
    this.selectedState = 'All States';
    this.selectedTargetGroup = 'All';
    this.filteredSchemes = [...this.allSchemes];
    this.itemsToShow = 8;
  }

  toggleBookmark(scheme: Scheme): void {
    scheme.isBookmarked = !scheme.isBookmarked;
  }

  loadMore(): void {
    this.itemsToShow += 8;
  }

  goBack(): void {
    this.location.back();
  }
}
