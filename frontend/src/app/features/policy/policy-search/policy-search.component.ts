import { Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface Policy {
  id: number;
  title: string;
  ministry: string;
  category: string;
  state: string;
  targetGroup: string;
  isBookmarked?: boolean;
}

@Component({
  selector: 'app-policy-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './policy-search.component.html',
  styleUrls: ['./policy-search.component.scss']
})
export class PolicySearchComponent {
  private readonly location = inject(Location);

  searchQuery = '';
  selectedCategory = 'All Categories';
  selectedMinistry = 'All Ministries';
  selectedState = 'All States';
  selectedTargetGroup = 'All';

  itemsToShow = 8;

  allPolicies: Policy[] = [
    { id: 1, title: 'National Education Policy 2020', ministry: 'Ministry of Education', category: 'Education', state: 'Central', targetGroup: 'Students' },
    { id: 2, title: 'National Health Policy 2017', ministry: 'Ministry of Health & Family Welfare', category: 'Health', state: 'Central', targetGroup: 'Citizens' },
    { id: 3, title: 'National Policy on Skill Development and Entrepreneurship 2015', ministry: 'Ministry of Skill Development & Entrepreneurship', category: 'Skill Development', state: 'Central', targetGroup: 'Youth & Entrepreneurs' },
    { id: 4, title: 'National Agriculture Policy', ministry: 'Ministry of Agriculture & Farmers Welfare', category: 'Agriculture', state: 'Central', targetGroup: 'Farmers' },
    { id: 5, title: 'National Education Policy 2020', ministry: 'Ministry of Education', category: 'Education', state: 'Central', targetGroup: 'Students' },
    { id: 6, title: 'National Health Policy 2017', ministry: 'Ministry of Health & Family Welfare', category: 'Health', state: 'Central', targetGroup: 'Citizens' },
    { id: 7, title: 'National Policy on Skill Development and Entrepreneurship 2015', ministry: 'Ministry of Skill Development & Entrepreneurship', category: 'Skill Development', state: 'Central', targetGroup: 'Youth & Entrepreneurs' },
    { id: 8, title: 'National Agriculture Policy', ministry: 'Ministry of Agriculture & Farmers Welfare', category: 'Agriculture', state: 'Central', targetGroup: 'Farmers' },
    { id: 9, title: 'National Digital Health Mission', ministry: 'Ministry of Health & Family Welfare', category: 'Health', state: 'Central', targetGroup: 'Citizens' },
    { id: 10, title: 'National Housing Policy', ministry: 'Ministry of Housing and Urban Affairs', category: 'Housing', state: 'Central', targetGroup: 'Citizens' }
  ];

  filteredPolicies: Policy[] = [...this.allPolicies];

  get visiblePolicies(): Policy[] {
    return this.filteredPolicies.slice(0, this.itemsToShow);
  }

  applyFilters(): void {
    const q = this.searchQuery.toLowerCase().trim();

    this.filteredPolicies = this.allPolicies.filter(p => {
      const matchesQuery = !q || p.title.toLowerCase().includes(q) || p.ministry.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      const matchesCat = this.selectedCategory === 'All Categories' || p.category === this.selectedCategory;
      const matchesMinistry = this.selectedMinistry === 'All Ministries' || p.ministry === this.selectedMinistry;
      const matchesState = this.selectedState === 'All States' || p.state === this.selectedState;
      const matchesTarget = this.selectedTargetGroup === 'All' || p.targetGroup === this.selectedTargetGroup;

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
    this.filteredPolicies = [...this.allPolicies];
    this.itemsToShow = 8;
  }

  toggleBookmark(policy: Policy): void {
    policy.isBookmarked = !policy.isBookmarked;
  }

  loadMore(): void {
    this.itemsToShow += 8;
  }

  goBack(): void {
    this.location.back();
  }
}
