import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavItem {
  icon: string;
  label: string;
  route?: string;
  children?: { label: string; route: string }[];
  expanded?: boolean;
}

export interface StatCard {
  icon: string;
  color: 'blue' | 'orange' | 'green' | 'purple';
  value: number | null;
  label: string;
  sub?: string;
}

export interface SchemeItem {
  name: string;
  ministry: string;
}

export interface PolicyItem {
  name: string;
  ministry: string;
  savedOn: string;
}

export interface HistoryItem {
  name: string;
  filters: string;
}

export interface ApplicationItem {
  name: string;
  appId: string;
}

@Component({
  selector: 'app-citizen',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './citizen.component.html',
  styleUrl: './citizen.component.scss',
})
export class CitizenComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  userName = 'User Name';
  userRole = 'User Role';

  loadingStats = true;
  loadingSchemes = true;
  loadingPolicies = true;
  loadingHistory = true;
  loadingApplications = true;

  navItems: NavItem[] = [
    { icon: 'home', label: 'Dashboard', route: '/dashboard/citizen' },
    { icon: 'manage_search', label: 'Search Policies', route: '/policies' },
    { icon: 'account_balance', label: 'Search Schemes', route: '/schemes' },
    { icon: 'fact_check', label: 'Eligibility Checker', route: '/eligibility' },
    { icon: 'compare_arrows', label: 'Compare', route: '/compare' },
    { icon: 'bookmark_border', label: 'Saved Items', route: '/saved' },
    { icon: 'notifications_none', label: 'Notifications', route: '/notifications' },
    { icon: 'history', label: 'Search History', route: '/history' },
    { icon: 'insert_chart_outlined', label: 'Reports / Status', route: '/reports' },
    { icon: 'support_agent', label: 'Support', route: '/feedback' },
  ];

  statCards: StatCard[] = [
    { icon: 'search', color: 'blue', value: null, label: 'Searches This Month' },
    { icon: 'bookmark', color: 'orange', value: null, label: 'Saved Items' },
    { icon: 'fact_check', color: 'green', value: null, label: 'Eligible Schemes' },
    { icon: 'description', color: 'purple', value: null, label: 'Applications' },
  ];

  eligibleSchemes: SchemeItem[] = [];
  savedPolicies: PolicyItem[] = [];
  searchHistory: HistoryItem[] = [];
  applications: ApplicationItem[] = [];

  ngOnInit(): void {
    setTimeout(() => {
      this.statCards = [
        { icon: 'search', color: 'blue', value: 12, label: 'Searches This Month', sub: '+20% from last month' },
        { icon: 'bookmark', color: 'orange', value: 8, label: 'Saved Items', sub: 'Policies & Schemes' },
        { icon: 'fact_check', color: 'green', value: 10, label: 'Eligible Schemes', sub: 'Based on your profile' },
        { icon: 'description', color: 'purple', value: 3, label: 'Applications', sub: 'In progress' },
      ];
      this.loadingStats = false;
      this.cdr.markForCheck();
    }, 700);

    setTimeout(() => {
      this.eligibleSchemes = [
        { name: 'Pradhan Mantri Jan Arogya Yojana (PM-JAY)', ministry: 'Ministry of Health & Family Welfare' },
        { name: 'PM Surya Ghar Muft Bijli Yojana', ministry: 'Ministry of New & Renewable Energy' },
        { name: 'Post Matric Scholarship Scheme', ministry: 'Ministry of Health & Family Welfare' },
        { name: 'PM Vishwakarma Yojana', ministry: 'Ministry of Micro, Small & Medium Enterprises' },
      ];
      this.loadingSchemes = false;
      this.cdr.markForCheck();
    }, 900);

    setTimeout(() => {
      this.savedPolicies = [
        { name: 'National Education Policy 2020', ministry: 'Ministry of Education', savedOn: '20 May 2026' },
        { name: 'Ayushman Bharat Policy', ministry: 'Ministry of Health & Family Welfare', savedOn: '18 May 2026' },
        { name: 'Electricity Act, 2003', ministry: 'Ministry of Power', savedOn: '15 May 2025' },
      ];
      this.loadingPolicies = false;
      this.cdr.markForCheck();
    }, 900);

    setTimeout(() => {
      this.searchHistory = [
        { name: 'Ayushman Bharat', filters: 'Scheme • Health' },
        { name: 'Scholarship for students', filters: 'Scheme • Education • Central' },
        { name: 'Solar energy scheme', filters: 'Scheme • Renewable Energy' },
        { name: 'Pension schemes for senior citizens', filters: 'Scheme • Social Welfare' },
      ];
      this.loadingHistory = false;
      this.cdr.markForCheck();
    }, 1100);

    setTimeout(() => {
      this.applications = [
        { name: 'PM Kisan Samman Nidhi', appId: 'APP1234567890' },
        { name: 'Post Matric Scholarship Scheme', appId: 'APP1234567889' },
        { name: 'PM Awas Yojana (Gramin)', appId: 'APP1234567888' },
      ];
      this.loadingApplications = false;
      this.cdr.markForCheck();
    }, 1100);
  }
}